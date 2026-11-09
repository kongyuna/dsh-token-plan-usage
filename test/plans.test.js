import assert from "node:assert/strict";
import { test } from "node:test";

import {
	normalizeXiaomiCookie,
	parseDeepSeekAccountWallets,
	parseDeepSeekBalance,
	parseOpenCodeUsage,
	parseXiaomiBalance,
	parseXiaomiDate,
	parseXiaomiPlanDetail,
	parseXiaomiPlanUsage,
	probeDeepSeek,
	probeDeepSeekAccount,
	probeDeepSeekBalance,
	probeOpenCode,
	probePlan,
	probeXiaomi
} from "../lib/plans.js";

const OPENCODE_SAMPLE = {
	usage: {
		rolling: { status: "ok", percent: 1, resetsAt: "2026-11-03T21:06:55.000Z" },
		weekly: { status: "ok", percent: 0, resetsAt: "2026-11-09T00:00:00.000Z" },
		monthly: { status: "ok", percent: 0, resetsAt: "2026-12-03T13:15:46.000Z" }
	}
};

const DEEPSEEK_SAMPLE = {
	is_available: true,
	balance_infos: [
		{
			currency: "CNY",
			total_balance: "110.00",
			granted_balance: "10.00",
			topped_up_balance: "100.00"
		}
	]
};

const XIAOMI_BALANCE = {
	code: 0,
	data: { balance: "12.50", currency: "CNY", cashBalance: "10.00", giftBalance: "2.50" }
};
const XIAOMI_DETAIL = {
	code: 0,
	data: { planCode: "pro", currentPeriodEnd: "2026-12-03 13:15:46", expired: false }
};
const XIAOMI_USAGE = {
	code: 0,
	data: {
		monthUsage: {
			percent: 0.42,
			items: [{ name: "Pro", used: 4200000000, limit: 10000000000, percent: 0.42 }]
		}
	}
};

const COOKIE = "api-platform_serviceToken=token-1; userId=42";

function jsonResponse(body, status = 200) {
	return {
		status,
		json: async () => body
	};
}

function router(routes) {
	const calls = [];
	const impl = async (url, init) => {
		calls.push({ url, init });
		for (const [suffix, response] of Object.entries(routes)) {
			if (url.endsWith(suffix)) {
				return typeof response === "function" ? response(url, init) : jsonResponse(response.value ?? response, response.status ?? 200);
			}
		}
		throw new Error(`unexpected URL ${url}`);
	};
	impl.calls = calls;
	return impl;
}

// ── OpenCode parser ───────────────────────────────────────────────────────

test("parseOpenCodeUsage keeps all three windows of a real gateway answer", () => {
	const windows = parseOpenCodeUsage(OPENCODE_SAMPLE);
	assert.equal(windows.length, 3);
	assert.deepEqual(windows[0], { key: "rolling", kind: "percent", status: "ok", usedPercent: 1, resetsAt: "2026-11-03T21:06:55.000Z" });
	assert.deepEqual(windows[1], { key: "weekly", kind: "percent", status: "ok", usedPercent: 0, resetsAt: "2026-11-09T00:00:00.000Z" });
	assert.deepEqual(windows[2], { key: "monthly", kind: "percent", status: "ok", usedPercent: 0, resetsAt: "2026-12-03T13:15:46.000Z" });
});

test("parseOpenCodeUsage accepts a direct window map from a relay", () => {
	const windows = parseOpenCodeUsage({ rolling: { percent: 5 } });
	assert.deepEqual(windows, [{ key: "rolling", kind: "percent", usedPercent: 5 }]);
});

test("parseOpenCodeUsage drops a single bad field, not the whole window", () => {
	const windows = parseOpenCodeUsage({
		usage: {
			rolling: { status: "ok", percent: "12", resetsAt: "not a date" },
			weekly: { status: "ok", percent: 50, resetsAt: "2026-11-09T00:00:00.000Z" }
		}
	});
	assert.deepEqual(windows[0], { key: "rolling", kind: "percent", status: "ok" });
	assert.equal(windows[1].usedPercent, 50);
});

test("parseOpenCodeUsage clamps an out-of-range percent", () => {
	assert.equal(parseOpenCodeUsage({ usage: { rolling: { percent: 140 } } })[0].usedPercent, 100);
	assert.equal(parseOpenCodeUsage({ usage: { rolling: { percent: -7 } } })[0].usedPercent, 0);
});

test("parseOpenCodeUsage ignores unknown windows", () => {
	const windows = parseOpenCodeUsage({ usage: { rolling: { percent: 1 }, hourly: { percent: 90 } } });
	assert.deepEqual(windows.map((window) => window.key), ["rolling"]);
});

test("parseOpenCodeUsage rejects a body without usable windows", () => {
	assert.equal(parseOpenCodeUsage(null), undefined);
	assert.equal(parseOpenCodeUsage({}), undefined);
	assert.equal(parseOpenCodeUsage({ usage: [] }), undefined);
	assert.equal(parseOpenCodeUsage("nope"), undefined);
});

// ── DeepSeek parser ───────────────────────────────────────────────────────

test("parseDeepSeekBalance reads the CNY balance with its breakdown", () => {
	const parsed = parseDeepSeekBalance(DEEPSEEK_SAMPLE);
	assert.equal(parsed.available, true);
	assert.deepEqual(parsed.balances, [{ currency: "CNY", total: 110, granted: 10, toppedUp: 100 }]);
});

test("parseDeepSeekBalance orders CNY before USD", () => {
	const parsed = parseDeepSeekBalance({
		is_available: true,
		balance_infos: [
			{ currency: "USD", total_balance: "1" },
			{ currency: "CNY", total_balance: "2" }
		]
	});
	assert.deepEqual(parsed.balances.map((balance) => balance.currency), ["CNY", "USD"]);
});

test("parseDeepSeekBalance marks an unavailable account", () => {
	const parsed = parseDeepSeekBalance({ is_available: false, balance_infos: [] });
	assert.equal(parsed.available, false);
	assert.deepEqual(parsed.balances, []);
});

test("parseDeepSeekBalance rejects a body with no usable balance", () => {
	assert.equal(parseDeepSeekBalance({ is_available: true, balance_infos: [] }), undefined);
	assert.equal(parseDeepSeekBalance({ balance_infos: [{ currency: "CNY" }] }), undefined);
	assert.equal(parseDeepSeekBalance(null), undefined);
});

// ── Xiaomi cookie ─────────────────────────────────────────────────────────

test("normalizeXiaomiCookie keeps the known cookies and sorts them", () => {
	const result = normalizeXiaomiCookie("userId=42; api-platform_ph=x; evil=1; api-platform_serviceToken=token-1");
	assert.equal(result.ok, true);
	assert.equal(result.cookie, "api-platform_ph=x; api-platform_serviceToken=token-1; userId=42");
});

test("normalizeXiaomiCookie accepts a pasted Cookie header", () => {
	const result = normalizeXiaomiCookie("Cookie: api-platform_serviceToken=t; userId=7");
	assert.equal(result.ok, true);
	assert.equal(result.cookie, "api-platform_serviceToken=t; userId=7");
});

test("normalizeXiaomiCookie rejects a missing required cookie", () => {
	const result = normalizeXiaomiCookie("userId=42");
	assert.equal(result.ok, false);
	assert.equal(result.code, "cookie-shape");
	assert.match(result.error, /api-platform_serviceToken/);
});

test("normalizeXiaomiCookie rejects non-string and empty input", () => {
	assert.equal(normalizeXiaomiCookie(undefined).ok, false);
	assert.equal(normalizeXiaomiCookie("  ").ok, false);
});

// ── Xiaomi parsers ────────────────────────────────────────────────────────

test("parseXiaomiBalance reads balance, cash and gift", () => {
	assert.deepEqual(parseXiaomiBalance(XIAOMI_BALANCE), { balance: 12.5, currency: "CNY", cash: 10, gift: 2.5 });
});

test("parseXiaomiBalance maps a 401 code to auth", () => {
	const result = parseXiaomiBalance({ code: 401, message: "expired" });
	assert.equal(result.code, "auth");
	assert.match(result.error, /expired/);
});

test("parseXiaomiBalance maps an unknown code to shape", () => {
	const result = parseXiaomiBalance({ code: 500, message: "boom" });
	assert.equal(result.code, "shape");
});

test("parseXiaomiPlanDetail parses the UTC period end", () => {
	const detail = parseXiaomiPlanDetail(XIAOMI_DETAIL);
	assert.equal(detail.planCode, "pro");
	assert.equal(detail.expired, false);
	assert.equal(detail.periodEnd, "2026-12-03T13:15:46.000Z");
});

test("parseXiaomiDate rejects an invalid date", () => {
	assert.equal(parseXiaomiDate("not a date"), undefined);
	assert.equal(parseXiaomiDate(42), undefined);
});

test("parseXiaomiPlanUsage converts a 0..1 percent and keeps the counters", () => {
	const usage = parseXiaomiPlanUsage(XIAOMI_USAGE);
	assert.equal(usage.usedPercent, 42);
	assert.equal(usage.used, 4200000000);
	assert.equal(usage.limit, 10000000000);
	assert.equal(usage.name, "Pro");
});

test("parseXiaomiPlanUsage accepts an already-scaled percent", () => {
	const usage = parseXiaomiPlanUsage({ code: 0, data: { monthUsage: { percent: 42, items: [] } } });
	assert.equal(usage.usedPercent, 42);
});

test("parseXiaomiPlanUsage rejects a response without monthUsage", () => {
	assert.equal(parseXiaomiPlanUsage({ code: 0, data: {} }), undefined);
});

// ── probes ────────────────────────────────────────────────────────────────

test("probeOpenCode sends the bearer key and normalizes windows", async () => {
	const fetchImpl = router({ "/v1/usage": { value: OPENCODE_SAMPLE } });
	const result = await probeOpenCode({ apiKey: "sk-test", baseURL: "https://opencode.example/zen/go", deps: { fetchImpl, now: () => 123 } });
	assert.equal(result.ok, true);
	assert.equal(result.fetchedAt, 123);
	assert.equal(result.windows.length, 3);
	const call = fetchImpl.calls[0];
	assert.equal(call.url, "https://opencode.example/zen/go/v1/usage");
	assert.equal(call.init.headers.authorization, "Bearer sk-test");
});

test("probeOpenCode maps a 401 to auth", async () => {
	const fetchImpl = router({ "/v1/usage": { status: 401, value: {} } });
	const result = await probeOpenCode({ apiKey: "sk-test", baseURL: "https://opencode.example/zen/go", deps: { fetchImpl } });
	assert.equal(result.ok, false);
	assert.equal(result.code, "auth");
});

test("probeOpenCode rejects a body without windows", async () => {
	const fetchImpl = router({ "/v1/usage": { value: { ok: true } } });
	const result = await probeOpenCode({ apiKey: "sk-test", baseURL: "https://opencode.example/zen/go", deps: { fetchImpl } });
	assert.equal(result.ok, false);
	assert.equal(result.code, "shape");
});

test("probeDeepSeek builds one amount window per currency", async () => {
	const fetchImpl = router({ "/user/balance": { value: DEEPSEEK_SAMPLE } });
	const result = await probeDeepSeek({ apiKey: "sk-test", baseURL: "https://api.deepseek.example", deps: { fetchImpl, now: () => 7 } });
	assert.equal(result.ok, true);
	assert.equal(result.fetchedAt, 7);
	assert.deepEqual(result.windows, [{ key: "balance", kind: "amount", amount: 110, currency: "CNY", granted: 10, toppedUp: 100 }]);
	assert.equal(fetchImpl.calls[0].url, "https://api.deepseek.example/user/balance");
});

test("probeDeepSeek reports an unavailable account", async () => {
	const fetchImpl = router({ "/user/balance": { value: { is_available: false, balance_infos: [] } } });
	const result = await probeDeepSeek({ apiKey: "sk-test", baseURL: "https://api.deepseek.example", deps: { fetchImpl } });
	assert.equal(result.ok, false);
	assert.equal(result.code, "unavailable");
});

test("probeXiaomi combines balance, plan detail and plan usage", async () => {
	const fetchImpl = router({
		"/balance": { value: XIAOMI_BALANCE },
		"/tokenPlan/detail": { value: XIAOMI_DETAIL },
		"/tokenPlan/usage": { value: XIAOMI_USAGE }
	});
	const result = await probeXiaomi({ cookie: COOKIE, baseURL: "https://mimo.example/api/v1", deps: { fetchImpl, now: () => 9 } });
	assert.equal(result.ok, true);
	assert.equal(result.planName, "pro");
	assert.equal(result.fetchedAt, 9);
	const monthly = result.windows.find((window) => window.key === "monthly");
	assert.equal(monthly.usedPercent, 42);
	assert.equal(monthly.used, 4200000000);
	assert.equal(monthly.limit, 10000000000);
	assert.equal(monthly.resetsAt, "2026-12-03T13:15:46.000Z");
	assert.equal(monthly.status, "ok");
	const balance = result.windows.find((window) => window.key === "balance");
	assert.deepEqual(balance, { key: "balance", kind: "amount", amount: 12.5, currency: "CNY", granted: 2.5, toppedUp: 10 });
	const cookieHeader = fetchImpl.calls[0].init.headers.cookie;
	assert.equal(cookieHeader, COOKIE);
});

test("probeXiaomi treats a redirect as an expired login", async () => {
	const fetchImpl = router({ "/balance": { status: 302, value: {} } });
	const result = await probeXiaomi({ cookie: COOKIE, baseURL: "https://mimo.example/api/v1", deps: { fetchImpl } });
	assert.equal(result.ok, false);
	assert.equal(result.code, "auth");
});

test("probeXiaomi keeps the balance when plan detail fails", async () => {
	const fetchImpl = router({
		"/balance": { value: XIAOMI_BALANCE },
		"/tokenPlan/detail": { status: 500, value: { ok: false } },
		"/tokenPlan/usage": { value: XIAOMI_USAGE }
	});
	const result = await probeXiaomi({ cookie: COOKIE, baseURL: "https://mimo.example/api/v1", deps: { fetchImpl } });
	assert.equal(result.ok, true);
	assert.equal(result.partial, true);
	assert.equal(result.windows.some((window) => window.key === "balance"), true);
	assert.equal(result.windows.some((window) => window.key === "monthly"), true);
});

test("probeXiaomi rejects an invalid cookie before any request", async () => {
	let calls = 0;
	const result = await probeXiaomi({ cookie: "userId=42", deps: { fetchImpl: async () => { calls += 1; } } });
	assert.equal(result.ok, false);
	assert.equal(result.code, "cookie-shape");
	assert.equal(calls, 0);
});

test("probePlan dispatches by kind", async () => {
	const opencode = await probePlan({
		plan: { id: "o", kind: "opencode-go", label: "O", baseURL: "https://o.example/zen/go" },
		credential: "sk-test",
		deps: { fetchImpl: router({ "/v1/usage": { value: OPENCODE_SAMPLE } }) }
	});
	assert.equal(opencode.ok, true);
	const unknown = await probePlan({
		plan: { id: "x", kind: "made-up", label: "X", baseURL: "https://x.example" },
		credential: "x",
		deps: { fetchImpl: async () => jsonResponse({}) }
	});
	assert.equal(unknown.ok, false);
	assert.equal(unknown.code, "shape");
});

// ── DeepSeek account balance ─────────────────────────────────────────────

const ACCOUNT_WALLETS = {
	status: "ready",
	value: [
		{ currency: "CNY", balance: "100.00" },
		{ currency: "USD", balance: "1.5" }
	],
	bonusWallets: [{ currency: "CNY", balance: "10.00" }]
};

const ACCOUNT_CLIENT = { version: "0.2.2-rc.1", locale: "zh-CN", timezoneOffsetSeconds: 28800 };

function accountService(result) {
	const calls = [];
	return {
		calls,
		async getBalance(client) {
			calls.push(client);
			return typeof result === "function" ? result() : result;
		}
	};
}

test("parseDeepSeekAccountWallets sums topped-up and granted wallets per currency", () => {
	const windows = parseDeepSeekAccountWallets(ACCOUNT_WALLETS);
	assert.deepEqual(windows, [
		{ key: "balance", kind: "amount", amount: 110, currency: "CNY", toppedUp: 100, granted: 10 },
		{ key: "balance-usd", kind: "amount", amount: 1.5, currency: "USD", toppedUp: 1.5 }
	]);
});

test("parseDeepSeekAccountWallets keeps a bonus-only currency and drops bad rows", () => {
	const windows = parseDeepSeekAccountWallets({
		status: "ready",
		value: [{ currency: "CNY", balance: "not-a-number" }],
		bonusWallets: [
			{ currency: "USD", balance: "0E-16" },
			{ currency: "CNY", balance: "-1" }
		]
	});
	assert.deepEqual(windows, [{ key: "balance", kind: "amount", amount: 0, currency: "USD" }]);
});

test("parseDeepSeekAccountWallets rejects an empty wallet set", () => {
	assert.equal(parseDeepSeekAccountWallets({ status: "ready", value: [], bonusWallets: [] }), undefined);
	assert.equal(parseDeepSeekAccountWallets(null), undefined);
	assert.equal(parseDeepSeekAccountWallets("nope"), undefined);
});

test("probeDeepSeekAccount maps ready wallets and forwards the client metadata", async () => {
	const account = accountService(ACCOUNT_WALLETS);
	const result = await probeDeepSeekAccount({ account, client: ACCOUNT_CLIENT, deps: { now: () => 42 } });
	assert.equal(result.ok, true);
	assert.equal(result.fetchedAt, 42);
	assert.deepEqual(result.windows.map((window) => window.currency), ["CNY", "USD"]);
	assert.equal(account.calls[0], ACCOUNT_CLIENT);
});

test("probeDeepSeekAccount reports a signed-out account", async () => {
	const result = await probeDeepSeekAccount({ account: accountService(null), client: ACCOUNT_CLIENT });
	assert.equal(result.ok, false);
	assert.equal(result.code, "signed-out");
});

test("probeDeepSeekAccount reports a failed Platform read", async () => {
	const result = await probeDeepSeekAccount({ account: accountService({ status: "failed" }) });
	assert.equal(result.code, "account-error");
});

test("probeDeepSeekAccount redacts a thrown service error", async () => {
	const account = {
		async getBalance() {
			throw new Error("Bearer sk-secret rejected");
		}
	};
	const result = await probeDeepSeekAccount({ account });
	assert.equal(result.code, "account-error");
	assert.ok(!result.error.includes("sk-secret"));
});

test("probeDeepSeekAccount reports no-account without a service", async () => {
	assert.equal((await probeDeepSeekAccount({})).code, "no-account");
	assert.equal((await probeDeepSeekAccount({ account: {} })).code, "no-account");
});

test("probeDeepSeekAccount bounds a hanging account call", async () => {
	const account = { getBalance: () => new Promise(() => {}) };
	const result = await probeDeepSeekAccount({ account, deps: { timeoutMs: 20 } });
	assert.equal(result.code, "timeout");
});

test("probeDeepSeekBalance prefers the account and never calls the API key", async () => {
	let calls = 0;
	const result = await probeDeepSeekBalance({
		account: accountService(ACCOUNT_WALLETS),
		client: ACCOUNT_CLIENT,
		apiKey: "sk-deep",
		baseURL: "https://api.deepseek.example",
		deps: {
			fetchImpl: async () => {
				calls += 1;
				return jsonResponse(DEEPSEEK_SAMPLE);
			}
		}
	});
	assert.equal(result.ok, true);
	assert.equal(result.windows[0].amount, 110);
	assert.equal(calls, 0);
});

test("probeDeepSeekBalance falls back to the API key when signed out", async () => {
	const fetchImpl = router({ "/user/balance": { value: DEEPSEEK_SAMPLE } });
	const result = await probeDeepSeekBalance({
		account: accountService(null),
		apiKey: "sk-deep",
		baseURL: "https://api.deepseek.example",
		deps: { fetchImpl }
	});
	assert.equal(result.ok, true);
	assert.equal(result.windows[0].amount, 110);
	assert.equal(fetchImpl.calls.length, 1);
});

test("probeDeepSeekBalance reports signed-out when no source answers", async () => {
	const result = await probeDeepSeekBalance({ account: accountService(null), baseURL: "https://api.deepseek.example" });
	assert.equal(result.ok, false);
	assert.equal(result.code, "signed-out");
});

test("probeDeepSeekBalance prefers the account error when both sources fail", async () => {
	const fetchImpl = router({ "/user/balance": { status: 401, value: {} } });
	const result = await probeDeepSeekBalance({
		account: accountService({ status: "failed" }),
		apiKey: "sk-deep",
		baseURL: "https://api.deepseek.example",
		deps: { fetchImpl }
	});
	assert.equal(result.ok, false);
	assert.equal(result.code, "account-error");
});

test("probeDeepSeekBalance surfaces the API key error when no account service exists", async () => {
	const fetchImpl = router({ "/user/balance": { status: 401, value: {} } });
	const result = await probeDeepSeekBalance({ apiKey: "sk-deep", baseURL: "https://api.deepseek.example", deps: { fetchImpl } });
	assert.equal(result.code, "auth");
	const noKey = await probeDeepSeekBalance({ baseURL: "https://api.deepseek.example" });
	assert.equal(noKey.code, "no-key");
});

test("probePlan routes deepseek-balance through the account-first probe", async () => {
	const result = await probePlan({
		plan: { id: "deepseek", kind: "deepseek-balance", label: "DeepSeek", baseURL: "https://api.deepseek.example" },
		credential: undefined,
		account: accountService(ACCOUNT_WALLETS),
		client: ACCOUNT_CLIENT,
		deps: {
			fetchImpl: async () => {
				throw new Error("the API key must not be probed while the account answers");
			}
		}
	});
	assert.equal(result.ok, true);
	assert.equal(result.windows[0].amount, 110);
});
