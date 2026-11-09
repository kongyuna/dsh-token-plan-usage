// @ts-check
/**
 * dsh-token-plan-usage — host half.
 *
 * This plugin only READS usage. It registers no LLM adapter, never touches
 * `llm-pi-ai`, and never sends a chat request. The browser asks one route for
 * every plan's snapshot; the route resolves credentials host-side, probes each
 * upstream with a bounded timeout, and returns percentages/amounts/reset
 * instants only.
 *
 * Routes:
 *   GET  /dsh-token-plan-usage/usage           every configured plan
 *   POST /dsh-token-plan-usage/xiaomi-cookie   store a validated MiMo cookie
 */

import { Config, planDescriptors } from "./config.js";
import { UsageCache, readJsonBody, redactError } from "./usage.js";
import { XIAOMI_DEFAULT_BASE, normalizeXiaomiCookie, probePlan, probeXiaomi } from "./plans.js";

export const name = "dsh-token-plan-usage";

/** `webServer` is required; `credentials` is reached through ctx.get. */
export const inject = ["webServer"];

export { Config };

const ROUTE_USAGE = "/dsh-token-plan-usage/usage";
const ROUTE_XIAOMI_COOKIE = "/dsh-token-plan-usage/xiaomi-cookie";
const CACHE_TTL_MS = 30_000;
const COOKIE_LIMIT = 8 * 1024;
const XIAOMI_COOKIE_REF = "XIAOMI_TOKEN_PLAN_COOKIE";
const XIAOMI_API_KEY_REF = "XIAOMI_TOKEN_PLAN_CN_API_KEY";

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} value
 */
function sendJSON(res, status, value) {
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(JSON.stringify(value));
}

/**
 * Resolve a credential reference through the Harness credentials seam, with a
 * process-environment fallback for headless/simple profiles.
 *
 * @param {any} ctx
 * @param {string} ref
 * @returns {Promise<string|undefined>}
 */
export async function resolveCredential(ctx, ref) {
	const credentials = ctx?.get?.("credentials");
	if (credentials !== undefined && typeof credentials.resolve === "function") {
		try {
			const hit = await credentials.resolve(ref);
			const value = hit?.value;
			if (typeof value === "string" && value.length > 0) return value;
		} catch {
			// fall through to the environment
		}
	}
	const env = typeof process !== "undefined" ? process.env?.[ref] : undefined;
	return typeof env === "string" && env.length > 0 ? env : undefined;
}

/**
 * @param {{ id: string, kind: string, label: string, consoleUrl?: string }} plan
 * @param {string} status
 * @param {"xiaomi-cookie"} [setup]
 * @returns {PlanView}
 */
function noCredentialView(plan, status, setup) {
	return {
		id: plan.id,
		kind: plan.kind,
		label: plan.label,
		source: plan.explicit === true ? "config" : "default",
		status,
		windows: [],
		...(plan.consoleUrl === undefined ? {} : { consoleUrl: plan.consoleUrl }),
		...(setup === undefined ? {} : { setup })
	};
}

/**
 * @param {object} plan
 * @param {import("./usage.js").ProbeResult} result
 * @returns {PlanView}
 */
export function buildPlanView(plan, result) {
	const base = {
		id: /** @type {string} */ (plan.id),
		kind: /** @type {string} */ (plan.kind),
		label: /** @type {string} */ (plan.label),
		source: plan.explicit === true ? "config" : "default",
		...(plan.consoleUrl === undefined ? {} : { consoleUrl: plan.consoleUrl })
	};
	if (result.ok === true) {
		return {
			...base,
			status: "ok",
			windows: result.windows,
			fetchedAt: result.fetchedAt,
			...(result.planName === undefined ? {} : { planName: result.planName }),
			...(result.partial === true ? { partial: true } : {})
		};
	}
	const setup = plan.kind === "xiaomi-console" && (result.code === "auth" || result.code === "cookie-shape")
		? "xiaomi-cookie"
		: undefined;
	return {
		...base,
		status: result.code,
		windows: [],
		error: result.error,
		...(setup === undefined ? {} : { setup }),
		...(result.last === undefined ? {} : { last: result.last })
	};
}

/** Provider routes that make each plan's usage meaningful. */
const PLAN_PROVIDER_PATTERNS = Object.freeze({
	"opencode-go": /opencode[-_]?go/i,
	"xiaomi-console": /xiaomi|mimo/i,
	"deepseek-balance": /deepseek/i
});

/**
 * Read the model-provider routes currently registered in DSH. This is the
 * generic `llm` service, not another plugin's settings: a plan is only shown
 * when its provider is actually available in the model selector.
 *
 * @param {any} ctx
 * @returns {string[]|undefined} registered route keys, or undefined when the
 *   llm service is unavailable (callers then keep the previous behavior).
 */
export function activeProviders(ctx) {
	const llm = ctx?.get?.("llm");
	if (llm === undefined || typeof llm.listProviders !== "function") return undefined;
	try {
		const routes = llm.listProviders();
		if (!Array.isArray(routes)) return undefined;
		// `listProviders()` returns LlmProviderInfo objects today, but accept a
		// plain route-key array too so the filter survives a shape change.
		return routes
			.map((route) => {
				if (typeof route === "string") return route;
				if (route === null || typeof route !== "object") return undefined;
				for (const key of ["id", "provider", "providerId", "route", "key", "name"]) {
					const value = /** @type {Record<string, unknown>} */ (route)[key];
					if (typeof value === "string" && value.length > 0) return value;
				}
				return undefined;
			})
			.filter((route) => route !== undefined);
	} catch {
		return undefined;
	}
}

/**
 * A plan is in scope only when its provider route is registered. If the route
 * list is unknown (no llm service), keep the plan rather than silently hiding a
 * profile that does not expose the service.
 *
 * @param {{ kind: string }} plan
 * @param {string[]|undefined} providers
 * @returns {boolean}
 */
export function planInScope(plan, providers) {
	if (providers === undefined) return true;
	const pattern = PLAN_PROVIDER_PATTERNS[plan.kind];
	if (pattern === undefined) return true;
	return providers.some((provider) => pattern.test(provider));
}

/**
 * Resolve one plan's credential, probe it (through the cache), and build the
 * browser-safe view.
 *
 * @param {object} input
 * @param {import("./config.js").PlanDescriptor} input.plan
 * @param {UsageCache} input.cache
 * @param {(ref: string) => Promise<string|undefined>} input.resolve
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} input.deps
 * @param {boolean} input.force
 * @returns {Promise<PlanView>}
 */
async function resolvePlanView({ plan, cache, resolve, deps, force }) {
	const baseURL = plan.baseURL;
	const credentialRef = plan.credentialRef;
	const credential = await resolve(credentialRef);
	if (credential === undefined) {
		if (plan.kind === "xiaomi-console") {
			const apiKey = await resolve(XIAOMI_API_KEY_REF);
			if (apiKey !== undefined) return noCredentialView(plan, "no-cookie", "xiaomi-cookie");
		}
		return noCredentialView(plan, "no-key");
	}
	const key = `${plan.id}|${baseURL}|${credentialRef}`;
	const result = await cache.read(
		key,
		() => probePlan({ plan: { ...plan, baseURL }, credential, deps }),
		{ force }
	);
	return buildPlanView(plan, result);
}

/**
 * Build the GET handler. Exported so tests can drive it with fake services.
 *
 * @param {object} input
 * @param {import("./config.js").PlanDescriptor[]} input.plans
 * @param {UsageCache} input.cache
 * @param {(ref: string) => Promise<string|undefined>} input.resolveCredential
 * @param {() => string[]|undefined} [input.listProviders]
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} [input.deps]
 * @param {number} [input.refreshSeconds]
 * @returns {(req: any, res: any) => Promise<void>}
 */
export function createUsageHandler({
	plans,
	cache,
	resolveCredential: resolve,
	listProviders = () => undefined,
	deps = {},
	refreshSeconds = 180
}) {
	const now = deps.now ?? Date.now;
	return async function usageHandler(req, res) {
		try {
			const force = /[?&]refresh=1(?:&|$)/.test(String(req?.url ?? ""));
			const providers = listProviders();
			const inScope = plans.filter((plan) => planInScope(plan, providers));
			const views = await Promise.all(
				inScope.map((plan) => resolvePlanView({ plan, cache, resolve, deps, force }))
			);
			sendJSON(res, 200, {
				ok: views.some((view) => view.status === "ok"),
				fetchedAt: now(),
				refreshSeconds,
				...(providers === undefined ? {} : { providers }),
				...(views.length === 0 ? { reason: providers !== undefined && providers.length === 0 ? "no-active-plans" : "no-plans" } : {}),
				plans: views
			});
		} catch (error) {
			sendJSON(res, 200, {
				ok: false,
				code: "internal",
				error: redactError(error),
				fetchedAt: now(),
				plans: []
			});
		}
	};
}

/**
 * Build the POST handler that stores a validated MiMo console cookie.
 *
 * A pasted cookie is only stored after a live probe accepts it, so a typo can
 * never turn into a stored broken credential. The route answers application
 * errors with HTTP 200 and `{ ok: false, code }`, matching the usage route.
 *
 * @param {object} input
 * @param {() => string|undefined} input.getOrigin
 * @param {(ref: string, value: string) => Promise<void>} input.storeCookie
 * @param {import("./config.js").PlanDescriptor[]} input.plans
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} [input.deps]
 * @returns {(req: any, res: any) => Promise<void>}
 */
export function createCookieHandler({ getOrigin, storeCookie, plans, deps = {} }) {
	const xiaomi = plans.find((plan) => plan.kind === "xiaomi-console");
	const baseURL = xiaomi?.baseURL ?? XIAOMI_DEFAULT_BASE;
	return async function cookieHandler(req, res) {
		try {
			if (req?.method !== undefined && req.method !== "POST") {
				sendJSON(res, 405, { ok: false, code: "method", error: "POST required" });
				return;
			}
			const origin = typeof getOrigin === "function" ? getOrigin() : undefined;
			const requestOrigin = req?.headers?.origin;
			if (typeof origin === "string" && origin.length > 0 && requestOrigin !== origin) {
				sendJSON(res, 403, { ok: false, code: "origin", error: "same-origin request required" });
				return;
			}
			const contentType = String(req?.headers?.["content-type"] ?? "");
			if (!contentType.toLowerCase().includes("application/json")) {
				sendJSON(res, 415, { ok: false, code: "content-type", error: "application/json required" });
				return;
			}
			let body;
			try {
				body = await readJsonBody(req, COOKIE_LIMIT);
			} catch {
				sendJSON(res, 400, { ok: false, code: "body", error: "expected a small JSON body" });
				return;
			}
			const raw = body !== null && typeof body === "object" && !Array.isArray(body)
				? /** @type {Record<string, unknown>} */ (body).cookie
				: undefined;
			const normalized = normalizeXiaomiCookie(raw);
			if (normalized.ok === false) {
				sendJSON(res, 400, normalized);
				return;
			}
			const probe = await probeXiaomi({ cookie: normalized.cookie, baseURL, deps });
			if (probe.ok === false) {
				sendJSON(res, 200, probe);
				return;
			}
			try {
				await storeCookie(XIAOMI_COOKIE_REF, normalized.cookie);
			} catch (error) {
				sendJSON(res, 200, {
					ok: false,
					code: "store-failed",
					error: redactError(error, normalized.cookie)
				});
				return;
			}
			sendJSON(res, 200, { ok: true });
		} catch (error) {
			sendJSON(res, 200, { ok: false, code: "internal", error: redactError(error) });
		}
	};
}

/**
 * @param {any} ctx
 * @param {unknown} config
 */
export function apply(ctx, config) {
	const resolved = Config(config ?? {});
	const plans = planDescriptors(resolved);
	const cache = new UsageCache({ ttlMs: CACHE_TTL_MS });
	const deps = {
		fetchImpl: globalThis.fetch,
		now: Date.now,
		timeoutMs: resolved.timeoutMs
	};
	const resolve = (ref) => resolveCredential(ctx, ref);

	const usageHandler = createUsageHandler({
		plans,
		cache,
		resolveCredential: resolve,
		listProviders: () => activeProviders(ctx),
		deps,
		refreshSeconds: resolved.refreshSeconds
	});
	ctx.effect(
		() => ctx.webServer.register({ kind: "exact", path: ROUTE_USAGE, handler: usageHandler }),
		"dsh-token-plan-usage: usage route"
	);

	const cookieHandler = createCookieHandler({
		getOrigin: () => {
			try {
				return ctx.webServer.getOrigin();
			} catch {
				return undefined;
			}
		},
		storeCookie: async (ref, value) => {
			const credentials = ctx.get("credentials");
			if (credentials === undefined || typeof credentials.set !== "function") {
				throw new Error("credentials service unavailable");
			}
			await credentials.set(ref, value);
		},
		plans,
		deps
	});
	ctx.effect(
		() => ctx.webServer.register({ kind: "exact", path: ROUTE_XIAOMI_COOKIE, handler: cookieHandler }),
		"dsh-token-plan-usage: xiaomi cookie route"
	);
}

/**
 * @typedef {{
 *   id: string,
 *   kind: string,
 *   label: string,
 *   source: "config"|"default",
 *   status: string,
 *   windows: import("./usage.js").WindowView[],
 *   consoleUrl?: string,
 *   fetchedAt?: number,
 *   planName?: string,
 *   partial?: boolean,
 *   error?: string,
 *   setup?: "xiaomi-cookie",
 *   last?: { windows: import("./usage.js").WindowView[], planName?: string, fetchedAt: number }
 * }} PlanView
 */
