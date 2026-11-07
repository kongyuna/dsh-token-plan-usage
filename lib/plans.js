// @ts-check
/**
 * dsh-token-plan-usage — provider parsers and probes.
 *
 * Pure parsing is separated from networking so fixtures can exercise every
 * branch under `node --test`. The contract is deliberately forgiving: one bad
 * field drops that field, not the whole plan, and a plan that answers with a
 * useful subset still renders. Only a body that carries no usable window at all
 * becomes a `shape` error.
 */

import { clampPercent, requestJSON, wireBase } from "./usage.js";

/** The three OpenCode Go windows, in display order. */
export const OPENCODE_WINDOWS = Object.freeze(["rolling", "weekly", "monthly"]);

/** Required MiMo console cookies: without both, every request answers login. */
export const XIAOMI_REQUIRED_COOKIES = Object.freeze(["api-platform_serviceToken", "userId"]);

/** Cookies the MiMo console may also carry; everything else is dropped. */
export const XIAOMI_KNOWN_COOKIES = Object.freeze([
	"api-platform_serviceToken",
	"userId",
	"api-platform_ph",
	"api-platform_slh"
]);

/** Default MiMo console API base. */
export const XIAOMI_DEFAULT_BASE = "https://platform.xiaomimimo.com/api/v1";

const USER_AGENT = "dsh-token-plan-usage/0.1.0";

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>|undefined}
 */
function asObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? /** @type {Record<string, unknown>} */ (value)
		: undefined;
}

/**
 * @param {unknown} value
 * @returns {number|undefined}
 */
function toNumber(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripTrailingSlash(value) {
	return String(value ?? "").replace(/\/+$/, "");
}

/**
 * Parse one OpenCode Go `/usage` payload.
 *
 * The gateway normally wraps the windows in `{ usage: { ... } }`; some relays
 * answer the window map directly. Both are accepted. Unknown window names are
 * ignored (the gateway may add one later; the panel does not invent a label).
 *
 * @param {unknown} payload
 * @returns {WindowView[]|undefined}
 */
export function parseOpenCodeUsage(payload) {
	const object = asObject(payload);
	if (object === undefined) return undefined;
	const envelope = asObject(object.usage) ?? object;
	/** @type {WindowView[]} */
	const windows = [];
	for (const key of OPENCODE_WINDOWS) {
		const row = asObject(envelope[key]);
		if (row === undefined) continue;
		/** @type {WindowView} */
		const window = { key, kind: "percent" };
		if (typeof row.status === "string" && row.status.length > 0) window.status = row.status;
		if (typeof row.percent === "number" && Number.isFinite(row.percent)) window.usedPercent = clampPercent(row.percent);
		if (typeof row.resetsAt === "string" && Number.isFinite(Date.parse(row.resetsAt))) window.resetsAt = row.resetsAt;
		windows.push(window);
	}
	return windows.length > 0 ? windows : undefined;
}

/**
 * @typedef {{ currency: string, total: number, granted?: number, toppedUp?: number }} DeepSeekBalance
 */

/**
 * Parse one DeepSeek `/user/balance` payload.
 *
 * @param {unknown} payload
 * @returns {{ available: boolean, balances: DeepSeekBalance[] }|undefined}
 */
export function parseDeepSeekBalance(payload) {
	const object = asObject(payload);
	if (object === undefined) return undefined;
	const available = object.is_available !== false;
	const infos = Array.isArray(object.balance_infos) ? object.balance_infos : [];
	/** @type {DeepSeekBalance[]} */
	const balances = [];
	for (const info of infos) {
		const row = asObject(info);
		if (row === undefined) continue;
		const currency = typeof row.currency === "string" ? row.currency.trim().toUpperCase() : "";
		const total = toNumber(row.total_balance);
		if (currency.length === 0 || total === undefined) continue;
		/** @type {DeepSeekBalance} */
		const balance = { currency, total };
		const granted = toNumber(row.granted_balance);
		const toppedUp = toNumber(row.topped_up_balance);
		if (granted !== undefined) balance.granted = granted;
		if (toppedUp !== undefined) balance.toppedUp = toppedUp;
		balances.push(balance);
	}
	const order = new Map([["CNY", 0], ["USD", 1]]);
	balances.sort((a, b) => (order.get(a.currency) ?? 9) - (order.get(b.currency) ?? 9) || a.currency.localeCompare(b.currency));
	if (available && balances.length === 0) return undefined;
	return { available, balances };
}

/**
 * Normalize a pasted `Cookie:` header for the MiMo console.
 *
 * Only the four known cookies survive. The two required ones must be present;
 * values are trimmed and never logged or returned to the browser.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, cookie: string } | { ok: false, code: "cookie-shape", error: string }}
 */
export function normalizeXiaomiCookie(raw) {
	if (typeof raw !== "string") {
		return { ok: false, code: "cookie-shape", error: "expected a Cookie header string" };
	}
	let text = raw.trim();
	if (text.length === 0) {
		return { ok: false, code: "cookie-shape", error: "cookie is empty" };
	}
	if (/^cookie\s*:/i.test(text)) text = text.replace(/^cookie\s*:/i, "");
	/** @type {Map<string, string>} */
	const pairs = new Map();
	for (const part of text.split(";")) {
		const separator = part.indexOf("=");
		if (separator <= 0) continue;
		const name = part.slice(0, separator).trim();
		const value = part.slice(separator + 1).trim();
		if (!XIAOMI_KNOWN_COOKIES.includes(name) || value.length === 0) continue;
		pairs.set(name, value);
	}
	for (const required of XIAOMI_REQUIRED_COOKIES) {
		if (!pairs.has(required)) {
			return {
				ok: false,
				code: "cookie-shape",
				error: `missing required cookie ${required}`
			};
		}
	}
	const cookie = [...pairs.keys()]
		.sort()
		.map((name) => `${name}=${pairs.get(name)}`)
		.join("; ");
	return { ok: true, cookie };
}

/**
 * MiMo console API envelope check. Returns a probe error for a non-zero `code`
 * and the payload `data` otherwise.
 *
 * @param {unknown} payload
 * @returns {{ ok: true, data: Record<string, unknown> } | { ok: false, code: "auth"|"shape", error: string }}
 */
function xiaomiEnvelope(payload) {
	const object = asObject(payload);
	if (object === undefined) return { ok: false, code: "shape", error: "response is not an object" };
	const rawCode = object.code;
	const code = toNumber(rawCode);
	if (code !== undefined && code !== 0) {
		const message = typeof object.message === "string" && object.message.length > 0 ? object.message : `code ${code}`;
		if (code === 401 || code === 403) {
			return { ok: false, code: "auth", error: `MiMo console rejected the cookie (${message})` };
		}
		return { ok: false, code: "shape", error: `MiMo console answered ${message}` };
	}
	const data = asObject(object.data);
	if (data === undefined) return { ok: false, code: "shape", error: "MiMo console response has no data" };
	return { ok: true, data };
}

/**
 * Parse one MiMo `/balance` payload.
 *
 * @param {unknown} payload
 * @returns {{ balance: number, currency: string, cash?: number, gift?: number } | { code: "auth"|"shape", error: string }}
 */
export function parseXiaomiBalance(payload) {
	const envelope = xiaomiEnvelope(payload);
	if (envelope.ok === false) return envelope;
	const balance = toNumber(envelope.data.balance);
	const currency = typeof envelope.data.currency === "string" ? envelope.data.currency.trim().toUpperCase() : "";
	if (balance === undefined || currency.length === 0) {
		return { code: "shape", error: "MiMo balance payload is missing balance/currency" };
	}
	/** @type {{ balance: number, currency: string, cash?: number, gift?: number }} */
	const result = { balance, currency };
	const cash = toNumber(envelope.data.cashBalance);
	const gift = toNumber(envelope.data.giftBalance);
	if (cash !== undefined) result.cash = cash;
	if (gift !== undefined) result.gift = gift;
	return result;
}

/**
 * Parse the MiMo console date format (`yyyy-MM-dd HH:mm:ss`, UTC in practice).
 * @param {unknown} value
 * @returns {string|undefined}
 */
export function parseXiaomiDate(value) {
	if (typeof value !== "string" || value.trim().length === 0) return undefined;
	const text = value.trim();
	const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
	const ms = Date.parse(normalized);
	return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/**
 * Parse one MiMo `/tokenPlan/detail` payload.
 *
 * @param {unknown} payload
 * @returns {{ planCode?: string, periodEnd?: string, expired: boolean }|undefined}
 */
export function parseXiaomiPlanDetail(payload) {
	const envelope = xiaomiEnvelope(payload);
	if (envelope.ok === false) return undefined;
	const planCode = typeof envelope.data.planCode === "string" && envelope.data.planCode.length > 0
		? envelope.data.planCode
		: undefined;
	const periodEnd = parseXiaomiDate(envelope.data.currentPeriodEnd);
	return {
		...(planCode === undefined ? {} : { planCode }),
		...(periodEnd === undefined ? {} : { periodEnd }),
		expired: envelope.data.expired === true
	};
}

/**
 * Parse one MiMo `/tokenPlan/usage` payload.
 *
 * `percent` is 0..1 in the console API; a relay that already multiplied it by
 * 100 is accepted too. The first `items[]` entry carries the credit counters.
 *
 * @param {unknown} payload
 * @returns {{ usedPercent?: number, used?: number, limit?: number, name?: string }|undefined}
 */
export function parseXiaomiPlanUsage(payload) {
	const envelope = xiaomiEnvelope(payload);
	if (envelope.ok === false) return undefined;
	const monthUsage = asObject(envelope.data.monthUsage);
	if (monthUsage === undefined) return undefined;
	const items = Array.isArray(monthUsage.items) ? monthUsage.items : [];
	const first = items.map(asObject).find((item) => item !== undefined);
	const rawPercent = typeof monthUsage.percent === "number"
		? monthUsage.percent
		: first !== undefined && typeof first.percent === "number"
			? first.percent
			: undefined;
	/** @type {{ usedPercent?: number, used?: number, limit?: number, name?: string }} */
	const result = {};
	if (rawPercent !== undefined && Number.isFinite(rawPercent)) {
		const percent = rawPercent >= 0 && rawPercent <= 1 ? rawPercent * 100 : rawPercent;
		result.usedPercent = clampPercent(percent);
	}
	if (first !== undefined) {
		const used = toNumber(first.used);
		const limit = toNumber(first.limit);
		if (used !== undefined) result.used = used;
		if (limit !== undefined) result.limit = limit;
		if (typeof first.name === "string" && first.name.length > 0) result.name = first.name;
	}
	return result;
}

/**
 * @param {object} input
 * @param {string} input.apiKey
 * @param {string} input.baseURL
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} [input.deps]
 * @returns {Promise<PlanProbe>}
 */
export async function probeOpenCode({ apiKey, baseURL, deps = {} }) {
	const url = `${wireBase(baseURL)}/usage`;
	const result = await requestJSON({
		url,
		headers: { authorization: `Bearer ${apiKey}`, "user-agent": USER_AGENT },
		timeoutMs: deps.timeoutMs ?? 15000,
		fetchImpl: deps.fetchImpl ?? globalThis.fetch,
		secret: apiKey
	});
	if (result.ok === false) return result;
	const windows = parseOpenCodeUsage(result.body);
	if (windows === undefined) {
		return { ok: false, code: "shape", error: `GET ${url} answered without usage windows` };
	}
	return { ok: true, windows, fetchedAt: (deps.now ?? Date.now)() };
}

/**
 * @param {object} input
 * @param {string} input.apiKey
 * @param {string} input.baseURL
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} [input.deps]
 * @returns {Promise<PlanProbe>}
 */
export async function probeDeepSeek({ apiKey, baseURL, deps = {} }) {
	const url = `${stripTrailingSlash(baseURL)}/user/balance`;
	const result = await requestJSON({
		url,
		headers: { authorization: `Bearer ${apiKey}`, "user-agent": USER_AGENT },
		timeoutMs: deps.timeoutMs ?? 15000,
		fetchImpl: deps.fetchImpl ?? globalThis.fetch,
		secret: apiKey
	});
	if (result.ok === false) return result;
	const parsed = parseDeepSeekBalance(result.body);
	if (parsed === undefined) {
		return { ok: false, code: "shape", error: `GET ${url} answered without balance info` };
	}
	if (!parsed.available) {
		return { ok: false, code: "unavailable", error: `GET ${url} reports the account as unavailable` };
	}
	const windows = parsed.balances.map((balance, index) => {
		/** @type {WindowView} */
		const window = {
			key: index === 0 ? "balance" : `balance-${balance.currency.toLowerCase()}`,
			kind: "amount",
			amount: balance.total,
			currency: balance.currency
		};
		if (balance.granted !== undefined) window.granted = balance.granted;
		if (balance.toppedUp !== undefined) window.toppedUp = balance.toppedUp;
		return window;
	});
	return { ok: true, windows, fetchedAt: (deps.now ?? Date.now)() };
}

/**
 * Probe the MiMo console with a normalized cookie.
 *
 * Balance is required; plan detail and plan usage are best-effort (an account
 * may have a balance without an active token plan). A 3xx from the console is
 * mapped to `auth`: expired sessions redirect to the login flow.
 *
 * @param {object} input
 * @param {string} input.cookie
 * @param {string} [input.baseURL]
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} [input.deps]
 * @returns {Promise<PlanProbe>}
 */
export async function probeXiaomi({ cookie, baseURL = XIAOMI_DEFAULT_BASE, deps = {} }) {
	const normalized = normalizeXiaomiCookie(cookie);
	if (normalized.ok === false) return normalized;
	const base = stripTrailingSlash(baseURL) || XIAOMI_DEFAULT_BASE;
	const common = {
		headers: {
			cookie: normalized.cookie,
			accept: "application/json, text/plain, */*",
			"accept-language": "en-US,en;q=0.9",
			"x-timeZone": "UTC+01:00",
			origin: "https://platform.xiaomimimo.com",
			referer: "https://platform.xiaomimimo.com/#/console/balance",
			"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
		},
		timeoutMs: deps.timeoutMs ?? 15000,
		fetchImpl: deps.fetchImpl ?? globalThis.fetch,
		redirect: /** @type {RequestRedirect} */ ("manual"),
		treat3xxAsAuth: true,
		secret: normalized.cookie
	};
	const [balanceResult, detailResult, usageResult] = await Promise.all([
		requestJSON({ ...common, url: `${base}/balance` }),
		requestJSON({ ...common, url: `${base}/tokenPlan/detail` }),
		requestJSON({ ...common, url: `${base}/tokenPlan/usage` })
	]);
	if (balanceResult.ok === false) return balanceResult;
	const balance = parseXiaomiBalance(balanceResult.body);
	if (balance !== undefined && "code" in balance) return { ok: false, code: balance.code, error: balance.error };

	const detail = detailResult.ok === true ? parseXiaomiPlanDetail(detailResult.body) : undefined;
	const usage = usageResult.ok === true ? parseXiaomiPlanUsage(usageResult.body) : undefined;

	/** @type {WindowView[]} */
	const windows = [];
	if (detail !== undefined) {
		/** @type {WindowView} */
		const monthly = {
			key: "monthly",
			kind: "percent",
			status: detail.expired ? "expired" : "ok"
		};
		if (usage?.usedPercent !== undefined) monthly.usedPercent = usage.usedPercent;
		if (usage?.used !== undefined) monthly.used = usage.used;
		if (usage?.limit !== undefined) monthly.limit = usage.limit;
		if (usage?.name !== undefined) monthly.label = usage.name;
		if (detail.periodEnd !== undefined) monthly.resetsAt = detail.periodEnd;
		windows.push(monthly);
	} else if (usage !== undefined) {
		/** @type {WindowView} */
		const monthly = { key: "monthly", kind: "percent" };
		if (usage.usedPercent !== undefined) monthly.usedPercent = usage.usedPercent;
		if (usage.used !== undefined) monthly.used = usage.used;
		if (usage.limit !== undefined) monthly.limit = usage.limit;
		if (usage.name !== undefined) monthly.label = usage.name;
		windows.push(monthly);
	}
	/** @type {WindowView} */
	const balanceWindow = { key: "balance", kind: "amount", amount: balance.balance, currency: balance.currency };
	if (balance.gift !== undefined) balanceWindow.granted = balance.gift;
	if (balance.cash !== undefined) balanceWindow.toppedUp = balance.cash;
	windows.push(balanceWindow);

	const partial = detailResult.ok === false || usageResult.ok === false;
	return {
		ok: true,
		windows,
		...(detail?.planCode === undefined ? {} : { planName: detail.planCode }),
		...(partial ? { partial: true } : {}),
		fetchedAt: (deps.now ?? Date.now)()
	};
}

/**
 * Probe one plan by kind.
 *
 * @param {object} input
 * @param {{ id: string, kind: string, label: string, baseURL: string }} input.plan
 * @param {string} input.credential - API key or normalized cookie.
 * @param {{ fetchImpl?: typeof globalThis.fetch, now?: () => number, timeoutMs?: number }} [input.deps]
 * @returns {Promise<PlanProbe>}
 */
export async function probePlan({ plan, credential, deps = {} }) {
	switch (plan.kind) {
		case "opencode-go":
			return probeOpenCode({ apiKey: credential, baseURL: plan.baseURL, deps });
		case "deepseek-balance":
			return probeDeepSeek({ apiKey: credential, baseURL: plan.baseURL, deps });
		case "xiaomi-console":
			return probeXiaomi({ cookie: credential, baseURL: plan.baseURL, deps });
		default:
			return { ok: false, code: "shape", error: `unknown plan kind "${plan.kind}"` };
	}
}

/**
 * @typedef {{ key: string, kind: "percent"|"amount", label?: string, usedPercent?: number, status?: string, resetsAt?: string, amount?: number, currency?: string, granted?: number, toppedUp?: number, used?: number, limit?: number }} WindowView
 * @typedef {{ ok: true, windows: WindowView[], planName?: string, partial?: boolean, fetchedAt: number }
 *   | { ok: false, code: "auth"|"http"|"timeout"|"network"|"shape"|"unavailable"|"cookie-shape", error: string }} PlanProbe
 */
