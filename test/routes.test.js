import assert from "node:assert/strict";
import { test } from "node:test";

import { Config, planDescriptors } from "../lib/config.js";
import { buildPlanView, createCookieHandler, createUsageHandler, resolveCredential } from "../lib/index.js";
import { UsageCache } from "../lib/usage.js";

// ── fixtures ──────────────────────────────────────────────────────────────

const OPENCODE_USAGE = {
	usage: {
		rolling: { status: "ok", percent: 20, resetsAt: "2026-11-07T21:00:00.000Z" },
		weekly: { status: "ok", percent: 88, resetsAt: "2026-11-09T00:00:00.000Z" },
		monthly: { status: "ok", percent: 46, resetsAt: "2026-12-03T13:15:46.000Z" }
	}
};
const DEEPSEEK_BALANCE = {
	is_available: true,
	balance_infos: [{ currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" }]
};
const XIAOMI_BALANCE = { code: 0, data: { balance: "12.50", currency: "CNY", cashBalance: "10.00", giftBalance: "2.50" } };
const XIAOMI_DETAIL = { code: 0, data: { planCode: "pro", currentPeriodEnd: "2026-12-03 13:15:46", expired: false } };
const XIAOMI_USAGE = { code: 0, data: { monthUsage: { percent: 0.42, items: [{ name: "Pro", used: 42, limit: 100, percent: 0.42 }] } } };
const COOKIE = "api-platform_serviceToken=token-1; userId=42";

function jsonResponse(body, status = 200) {
	return { status, json: async () => body };
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

function fakeRes() {
	const res = {
		statusCode: 200,
		headers: {},
		raw: null,
		body: null,
		setHeader(name, value) {
			res.headers[name] = value;
		},
		end(value) {
			res.raw = value;
			res.body = value === undefined ? undefined : JSON.parse(value);
		}
	};
	return res;
}

function fakeRequest({ method = "GET", url = "/", headers = {}, body } = {}) {
	const req = { method, url, headers };
	if (body !== undefined) {
		req[Symbol.asyncIterator] = async function* () {
			yield Buffer.from(body);
		};
	}
	return req;
}

const PLAN_CONFIG = {
	includeDefaults: false,
	plans: [
		{ id: "opencode-go", kind: "opencode-go", credentialRef: "OPENCODE_GO_API_KEY", baseURL: "https://opencode.example/zen/go" },
		{ id: "deepseek", kind: "deepseek-balance", credentialRef: "DEEPSEEK_API_KEY", baseURL: "https://api.deepseek.example" },
		{ id: "xiaomi-mimo", kind: "xiaomi-console", credentialRef: "XIAOMI_TOKEN_PLAN_COOKIE", baseURL: "https://mimo.example/api/v1" }
	]
};

function plansFor(config = PLAN_CONFIG) {
	return planDescriptors(Config(config));
}

// ── usage route ───────────────────────────────────────────────────────────

test("usage route renders every plan and keeps per-plan failures isolated", async () => {
	const fetchImpl = router({
		"/zen/go/v1/usage": { value: OPENCODE_USAGE },
		"/user/balance": { value: DEEPSEEK_BALANCE },
		"/balance": { value: XIAOMI_BALANCE },
		"/tokenPlan/detail": { value: XIAOMI_DETAIL },
		"/tokenPlan/usage": { value: XIAOMI_USAGE }
	});
	const credentials = {
		OPENCODE_GO_API_KEY: "sk-open",
		DEEPSEEK_API_KEY: "sk-deep",
		XIAOMI_TOKEN_PLAN_COOKIE: COOKIE
	};
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => credentials[ref],
		deps: { fetchImpl, now: () => 100 }
	});
	const res = fakeRes();
	await handler(fakeRequest({ url: "/dsh-token-plan-usage/usage" }), res);
	assert.equal(res.statusCode, 200);
	assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
	assert.equal(res.body.ok, true);
	assert.equal(res.body.fetchedAt, 100);
	assert.equal(res.body.refreshSeconds, 180);
	const byId = Object.fromEntries(res.body.plans.map((plan) => [plan.id, plan]));
	assert.equal(byId["opencode-go"].status, "ok");
	assert.equal(byId["opencode-go"].windows.length, 3);
	assert.equal(byId["deepseek"].status, "ok");
	assert.deepEqual(byId["deepseek"].windows[0], { key: "balance", kind: "amount", amount: 110, currency: "CNY", granted: 10, toppedUp: 100 });
	assert.equal(byId["xiaomi-mimo"].status, "ok");
	assert.equal(byId["xiaomi-mimo"].planName, "pro");
	assert.equal(byId["xiaomi-mimo"].windows.some((window) => window.key === "monthly"), true);
	assert.ok(!JSON.stringify(res.body).includes("sk-open"));
	assert.ok(!JSON.stringify(res.body).includes("sk-deep"));
	assert.ok(!JSON.stringify(res.body).includes(COOKIE));
});

test("usage route turns a missing OpenCode key into no-key without probing", async () => {
	const fetchImpl = router({
		"/user/balance": { value: DEEPSEEK_BALANCE }
	});
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "DEEPSEEK_API_KEY" ? "sk-deep" : undefined),
		deps: { fetchImpl, now: () => 1 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	const byId = Object.fromEntries(res.body.plans.map((plan) => [plan.id, plan]));
	assert.equal(byId["opencode-go"].status, "no-key");
	assert.equal(byId["xiaomi-mimo"].status, "no-key");
	assert.equal(byId["deepseek"].status, "ok");
	assert.equal(fetchImpl.calls.some((call) => call.url.includes("opencode.example")), false);
});

test("usage route turns a saved API key without a cookie into xiaomi setup", async () => {
	const fetchImpl = router({ "/user/balance": { value: DEEPSEEK_BALANCE } });
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => {
			if (ref === "DEEPSEEK_API_KEY") return "sk-deep";
			if (ref === "XIAOMI_TOKEN_PLAN_CN_API_KEY") return "tp-key";
			return undefined;
		},
		deps: { fetchImpl, now: () => 1 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	const xiaomi = res.body.plans.find((plan) => plan.id === "xiaomi-mimo");
	assert.equal(xiaomi.status, "no-cookie");
	assert.equal(xiaomi.setup, "xiaomi-cookie");
	assert.equal(typeof xiaomi.consoleUrl, "string");
});

test("usage route keeps the previous reading when a plan later fails", async () => {
	let opencodeStatus = 200;
	const fetchImpl = async (url) => {
		if (url.endsWith("/v1/usage")) {
			return opencodeStatus === 200 ? jsonResponse(OPENCODE_USAGE) : jsonResponse({}, 401);
		}
		if (url.endsWith("/user/balance")) return jsonResponse(DEEPSEEK_BALANCE);
		throw new Error(`unexpected ${url}`);
	};
	const cache = new UsageCache({ ttlMs: 0, now: () => 1 });
	const handler = createUsageHandler({
		plans: plansFor(PLAN_CONFIG),
		cache,
		resolveCredential: async (ref) => (ref === "DEEPSEEK_API_KEY" ? "sk-deep" : "sk-open"),
		deps: { fetchImpl, now: () => 1 }
	});
	const first = fakeRes();
	await handler(fakeRequest(), first);
	assert.equal(first.body.plans.find((plan) => plan.id === "opencode-go").status, "ok");
	opencodeStatus = 401;
	const second = fakeRes();
	await handler(fakeRequest({ url: "/dsh-token-plan-usage/usage?refresh=1" }), second);
	const opencode = second.body.plans.find((plan) => plan.id === "opencode-go");
	assert.equal(opencode.status, "auth");
	assert.equal(opencode.last.windows.length, 3);
});

test("usage route reports no plans explicitly", async () => {
	const handler = createUsageHandler({
		plans: [],
		cache: new UsageCache(),
		resolveCredential: async () => undefined
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.reason, "no-plans");
	assert.deepEqual(res.body.plans, []);
});

// ── plan view ─────────────────────────────────────────────────────────────

test("buildPlanView carries last-good windows on a failure", () => {
	const view = buildPlanView(
		{ id: "x", kind: "opencode-go", label: "X", explicit: false },
		{ ok: false, code: "auth", error: "denied", last: { windows: [{ key: "weekly", kind: "percent", usedPercent: 9 }], fetchedAt: 5 } }
	);
	assert.equal(view.status, "auth");
	assert.deepEqual(view.last, { windows: [{ key: "weekly", kind: "percent", usedPercent: 9 }], fetchedAt: 5 });
	assert.equal(view.source, "default");
});

test("buildPlanView offers cookie setup after an auth failure on xiaomi", () => {
	const view = buildPlanView(
		{ id: "xiaomi-mimo", kind: "xiaomi-console", label: "Xiaomi MiMo", explicit: true },
		{ ok: false, code: "auth", error: "expired" }
	);
	assert.equal(view.status, "auth");
	assert.equal(view.setup, "xiaomi-cookie");
	assert.equal(view.source, "config");
});

// ── cookie route ──────────────────────────────────────────────────────────

test("cookie route stores a normalized cookie only after a successful probe", async () => {
	const stored = [];
	const fetchImpl = router({
		"/balance": { value: XIAOMI_BALANCE },
		"/tokenPlan/detail": { value: XIAOMI_DETAIL },
		"/tokenPlan/usage": { value: XIAOMI_USAGE }
	});
	const handler = createCookieHandler({
		getOrigin: () => "http://127.0.0.1:61830",
		storeCookie: async (ref, value) => {
			stored.push([ref, value]);
		},
		plans: plansFor(),
		deps: { fetchImpl }
	});
	const res = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		url: "/dsh-token-plan-usage/xiaomi-cookie",
		headers: { origin: "http://127.0.0.1:61830", "content-type": "application/json" },
		body: JSON.stringify({ cookie: `Cookie: ${COOKIE}` })
	}), res);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, { ok: true });
	assert.deepEqual(stored, [["XIAOMI_TOKEN_PLAN_COOKIE", COOKIE]]);
});

test("cookie route refuses a different origin", async () => {
	const stored = [];
	const handler = createCookieHandler({
		getOrigin: () => "http://127.0.0.1:61830",
		storeCookie: async (ref, value) => {
			stored.push([ref, value]);
		},
		plans: plansFor(),
		deps: { fetchImpl: async () => jsonResponse({}) }
	});
	const res = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { origin: "http://evil.example", "content-type": "application/json" },
		body: JSON.stringify({ cookie: COOKIE })
	}), res);
	assert.equal(res.statusCode, 403);
	assert.deepEqual(stored, []);
});

test("cookie route rejects a non-JSON body", async () => {
	const handler = createCookieHandler({
		getOrigin: () => "http://127.0.0.1:61830",
		storeCookie: async () => {},
		plans: plansFor(),
		deps: { fetchImpl: async () => jsonResponse({}) }
	});
	const res = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { origin: "http://127.0.0.1:61830", "content-type": "text/plain" },
		body: JSON.stringify({ cookie: COOKIE })
	}), res);
	assert.equal(res.statusCode, 415);
});

test("cookie route rejects an incomplete cookie without storing it", async () => {
	const stored = [];
	const handler = createCookieHandler({
		getOrigin: () => "http://127.0.0.1:61830",
		storeCookie: async (ref, value) => {
			stored.push([ref, value]);
		},
		plans: plansFor(),
		deps: { fetchImpl: async () => jsonResponse({}) }
	});
	const res = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { origin: "http://127.0.0.1:61830", "content-type": "application/json" },
		body: JSON.stringify({ cookie: "userId=42" })
	}), res);
	assert.equal(res.statusCode, 400);
	assert.equal(res.body.code, "cookie-shape");
	assert.deepEqual(stored, []);
});

test("cookie route reports a rejected cookie without storing it", async () => {
	const stored = [];
	const handler = createCookieHandler({
		getOrigin: () => "http://127.0.0.1:61830",
		storeCookie: async (ref, value) => {
			stored.push([ref, value]);
		},
		plans: plansFor(),
		deps: { fetchImpl: async () => jsonResponse({}, 200) }
	});
	const res = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { origin: "http://127.0.0.1:61830", "content-type": "application/json" },
		body: JSON.stringify({ cookie: COOKIE })
	}), res);
	// The fake answered every endpoint with an empty object, so the balance
	// parser turns this into a shape error before a store can happen.
	assert.equal(res.body.ok, false);
	assert.equal(res.body.code, "shape");
	assert.deepEqual(stored, []);
});

test("cookie route reports a storage failure without leaking the cookie", async () => {
	const handler = createCookieHandler({
		getOrigin: () => "http://127.0.0.1:61830",
		storeCookie: async () => {
			throw new Error("disk full");
		},
		plans: plansFor(),
		deps: {
			fetchImpl: router({
				"/balance": { value: XIAOMI_BALANCE },
				"/tokenPlan/detail": { value: XIAOMI_DETAIL },
				"/tokenPlan/usage": { value: XIAOMI_USAGE }
			})
		}
	});
	const res = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { origin: "http://127.0.0.1:61830", "content-type": "application/json" },
		body: JSON.stringify({ cookie: COOKIE })
	}), res);
	assert.equal(res.body.ok, false);
	assert.equal(res.body.code, "store-failed");
	assert.ok(!JSON.stringify(res.body).includes(COOKIE));
});

// ── small service helpers ─────────────────────────────────────────────────

test("resolveCredential prefers the credentials service and falls back to env", async () => {
	const ctx = {
		get(name) {
			return name === "credentials"
				? { resolve: async (ref) => (ref === "A_KEY" ? { value: "from-store" } : undefined) }
				: undefined;
		}
	};
	assert.equal(await resolveCredential(ctx, "A_KEY"), "from-store");
	assert.equal(await resolveCredential(ctx, "MISSING_KEY"), undefined);
});
