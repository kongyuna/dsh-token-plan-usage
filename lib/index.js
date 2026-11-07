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

import { Config, planDescriptors, normalizeBaseURL } from "./config.js";
import { UsageCache, readJsonBody, redactError } from "./usage.js";
import { XIAOMI_DEFAULT_BASE, normalizeXiaomiCookie, probePlan, probeXiaomi } from "./plans.js";

export const name = "dsh-token-plan-usage";

/** `webServer` is required; `credentials` and `settings` are reached through ctx.get. */
export const inject = ["webServer"];

export { Config };

const ROUTE_USAGE = "/dsh-token-plan-usage/usage";
const ROUTE_XIAOMI_COOKIE = "/dsh-token-plan-usage/xiaomi-cookie";
const CACHE_TTL_MS = 30_000;
const COOKIE_LIMIT = 8 * 1024;
const XIAOMI_COOKIE_REF = "XIAOMI_TOKEN_PLAN_COOKIE";
const XIAOMI_API_KEY_REF = "XIAOMI_TOKEN_PLAN_CN_API_KEY";
const CREDENTIAL_REF_RE = /^[A-Z_][A-Z0-9_]*$/;

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
 * Read one namespace from either DSH settings generation.
 *
 * @param {any} ctx
 * @param {string} ns
 * @returns {any}
 */
export function settingsValue(ctx, ns) {
	const settings = ctx?.get?.("settings");
	if (settings === undefined) return undefined;
	try {
		if (typeof settings.get === "function") return settings.get(ns);
		if (typeof settings.describe === "function") {
			return settings.describe().find((entry) => entry !== null && entry !== undefined && entry.ns === ns)?.value;
		}
	} catch {
		// settings are optional; an unavailable service just means no overrides
	}
	return undefined;
}

/**
 * When the user already runs `dsh-opencode-go-plus`, reuse its gateway URL and
 * credential reference instead of making them configure the same values twice.
 * Explicit plan config always wins.
 *
 * @param {(ns: string) => any} readSettings
 * @returns {{ baseURL?: string, credentialRef?: string }}
 */
function openCodeOverrides(readSettings) {
	const value = readSettings("dsh-opencode-go-plus");
	if (value === null || typeof value !== "object") return {};
	/** @type {{ baseURL?: string, credentialRef?: string }} */
	const overrides = {};
	if (typeof value.baseURL === "string" && value.baseURL.trim().length > 0) {
		const parsed = normalizeBaseURL(value.baseURL);
		if ("value" in parsed) overrides.baseURL = parsed.value;
	}
	if (typeof value.apiKeyEnv === "string" && CREDENTIAL_REF_RE.test(value.apiKeyEnv)) {
		overrides.credentialRef = value.apiKeyEnv;
	}
	return overrides;
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

/**
 * Resolve one plan's credential, probe it (through the cache), and build the
 * browser-safe view.
 *
 * @param {object} input
 * @param {import("./config.js").PlanDescriptor} input.plan
 * @param {UsageCache} input.cache
 * @param {(ref: string) => Promise<string|undefined>} input.resolve
 * @param {(ns: string) => any} input.readSettings
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} input.deps
 * @param {boolean} input.force
 * @returns {Promise<PlanView>}
 */
async function resolvePlanView({ plan, cache, resolve, readSettings, deps, force }) {
	let baseURL = plan.baseURL;
	let credentialRef = plan.credentialRef;
	if (plan.kind === "opencode-go" && plan.id === "opencode-go") {
		const overrides = openCodeOverrides(readSettings);
		if (!plan.explicitBaseURL && overrides.baseURL !== undefined) baseURL = overrides.baseURL;
		if (!plan.explicitCredentialRef && overrides.credentialRef !== undefined) credentialRef = overrides.credentialRef;
	}
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
 * @param {(ns: string) => any} [input.readSettings]
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} [input.deps]
 * @param {number} [input.refreshSeconds]
 * @returns {(req: any, res: any) => Promise<void>}
 */
export function createUsageHandler({
	plans,
	cache,
	resolveCredential: resolve,
	readSettings = () => undefined,
	deps = {},
	refreshSeconds = 180
}) {
	const now = deps.now ?? Date.now;
	return async function usageHandler(req, res) {
		try {
			const force = /[?&]refresh=1(?:&|$)/.test(String(req?.url ?? ""));
			const views = await Promise.all(
				plans.map((plan) => resolvePlanView({ plan, cache, resolve, readSettings, deps, force }))
			);
			sendJSON(res, 200, {
				ok: views.some((view) => view.status === "ok"),
				fetchedAt: now(),
				refreshSeconds,
				...(views.length === 0 ? { reason: "no-plans" } : {}),
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
	const readSettings = (ns) => settingsValue(ctx, ns);
	const resolve = (ref) => resolveCredential(ctx, ref);

	const usageHandler = createUsageHandler({
		plans,
		cache,
		resolveCredential: resolve,
		readSettings,
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
