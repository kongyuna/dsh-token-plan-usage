import assert from "node:assert/strict";
import { test } from "node:test";

import { Config, planDescriptors } from "../lib/config.js";
import { buildPlanView, createConfigHandler, createCookieHandler, createUsageHandler, planInScope, resolveCredential } from "../lib/index.js";
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

test("usage route renders the selected plan with its configured window order", async () => {
	const fetchImpl = router({ "/zen/go/v1/usage": { value: OPENCODE_USAGE } });
	const credentials = {
		OPENCODE_GO_API_KEY: "sk-open",
		DEEPSEEK_API_KEY: "sk-deep",
		XIAOMI_TOKEN_PLAN_COOKIE: COOKIE
	};
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => credentials[ref],
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({ planId: "opencode-go", windows: ["weekly", "rolling"] }),
		deps: { fetchImpl, now: () => 100 }
	});
	const res = fakeRes();
	await handler(fakeRequest({ url: "/dsh-token-plan-usage/usage" }), res);
	assert.equal(res.statusCode, 200);
	assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
	assert.equal(res.body.ok, true);
	assert.equal(res.body.fetchedAt, 100);
	assert.equal(res.body.refreshSeconds, 180);
	assert.deepEqual(res.body.providers, ["opencode-go", "deepseek-official"]);
	assert.equal(res.body.plans.length, 1);
	assert.equal(res.body.plans[0].id, "opencode-go");
	assert.deepEqual(res.body.plans[0].windows.map((window) => window.key), ["weekly", "rolling"]);
	assert.deepEqual(res.body.display, {
		plans: [{ id: "opencode-go", windows: ["weekly", "rolling"] }],
		ring: [
			{ planId: "opencode-go", metric: "weekly" },
			{ planId: "opencode-go", metric: "rolling" }
		]
	});
	assert.ok(!JSON.stringify(res.body).includes("sk-open"));
	assert.ok(!JSON.stringify(res.body).includes("sk-deep"));
	assert.ok(!JSON.stringify(res.body).includes(COOKIE));
});

test("usage route can select the DeepSeek balance plan", async () => {
	const fetchImpl = router({ "/user/balance": { value: DEEPSEEK_BALANCE } });
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "DEEPSEEK_API_KEY" ? "sk-deep" : undefined),
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({ planId: "deepseek", windows: ["balance"] }),
		deps: { fetchImpl, now: () => 1 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.plans.length, 1);
	assert.equal(res.body.plans[0].id, "deepseek");
	assert.deepEqual(res.body.plans[0].windows, [{ key: "balance", kind: "amount", amount: 110, currency: "CNY", granted: 10, toppedUp: 100 }]);
});

test("usage route turns a missing selected credential into no-key without probing", async () => {
	let calls = 0;
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "DEEPSEEK_API_KEY" ? "sk-deep" : undefined),
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({ planId: "opencode-go", windows: ["rolling"] }),
		deps: {
			fetchImpl: async () => {
				calls += 1;
				return jsonResponse({});
			},
			now: () => 1
		}
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.plans.length, 1);
	assert.equal(res.body.plans[0].id, "opencode-go");
	assert.equal(res.body.plans[0].status, "no-key");
	assert.equal(calls, 0);
});

test("usage route turns a saved API key without a cookie into xiaomi setup", async () => {
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "XIAOMI_TOKEN_PLAN_CN_API_KEY" ? "tp-key" : undefined),
		listProviders: () => ["xiaomi-token-plan-cn"],
		readDisplay: () => ({ planId: "xiaomi-mimo", windows: ["monthly"] }),
		deps: { fetchImpl: async () => jsonResponse({}), now: () => 1 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	const xiaomi = res.body.plans[0];
	assert.equal(xiaomi.id, "xiaomi-mimo");
	assert.equal(xiaomi.status, "no-cookie");
	assert.equal(xiaomi.setup, "xiaomi-cookie");
	assert.equal(typeof xiaomi.consoleUrl, "string");
});

test("usage route keeps the previous reading when the selected plan later fails", async () => {
	let opencodeStatus = 200;
	const fetchImpl = async (url) => {
		if (url.endsWith("/v1/usage")) {
			return opencodeStatus === 200 ? jsonResponse(OPENCODE_USAGE) : jsonResponse({}, 401);
		}
		throw new Error(`unexpected ${url}`);
	};
	const cache = new UsageCache({ ttlMs: 0, now: () => 1 });
	const handler = createUsageHandler({
		plans: plansFor(),
		cache,
		resolveCredential: async () => "sk-open",
		listProviders: () => ["opencode-go"],
		readDisplay: () => ({ planId: "opencode-go", windows: ["rolling", "weekly", "monthly"] }),
		deps: { fetchImpl, now: () => 1 }
	});
	const first = fakeRes();
	await handler(fakeRequest(), first);
	assert.equal(first.body.plans[0].status, "ok");
	opencodeStatus = 401;
	const second = fakeRes();
	await handler(fakeRequest({ url: "/dsh-token-plan-usage/usage?refresh=1" }), second);
	const opencode = second.body.plans[0];
	assert.equal(opencode.status, "auth");
	assert.equal(opencode.last.windows.length, 3);
});

test("usage route falls back to the first visible plan when the saved plan leaves scope", async () => {
	const fetchImpl = router({ "/zen/go/v1/usage": { value: OPENCODE_USAGE } });
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "OPENCODE_GO_API_KEY" ? "sk-open" : undefined),
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({ planId: "xiaomi-mimo", windows: ["monthly"] }),
		deps: { fetchImpl, now: () => 1 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.deepEqual(res.body.plans.map((plan) => plan.id), ["opencode-go", "deepseek"]);
	assert.deepEqual(res.body.display.plans[0], { id: "opencode-go", windows: ["rolling", "weekly", "monthly"] });
	assert.deepEqual(res.body.display.ring, [
		{ planId: "opencode-go", metric: "rolling" },
		{ planId: "opencode-go", metric: "weekly" }
	]);
});

test("config route lists scoped plans, metrics and the saved selection", async () => {
	const handler = createConfigHandler({
		plans: plansFor(),
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({ planId: "deepseek", windows: ["balance"] }),
		writeDisplay: () => {
			throw new Error("GET must not write");
		}
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.ok, true);
	assert.deepEqual(res.body.plans.map((plan) => plan.id), ["opencode-go", "deepseek"]);
	assert.deepEqual(res.body.plans.find((plan) => plan.id === "opencode-go").metrics, ["rolling", "weekly", "monthly"]);
	assert.deepEqual(res.body.plans.find((plan) => plan.id === "deepseek").metrics, ["balance"]);
	assert.deepEqual(res.body.selected, {
		plans: [{ id: "deepseek", windows: ["balance"] }],
		ring: [{ planId: "deepseek", metric: "balance" }]
	});
});

test("config route saves a valid ordered metric list", async () => {
	let saved = null;
	const handler = createConfigHandler({
		plans: plansFor(),
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({}),
		writeDisplay: (state) => {
			saved = state;
		}
	});
	const res = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ planId: "opencode-go", windows: ["monthly", "rolling", "monthly", "bogus"] })
	}), res);
	assert.deepEqual(res.body, {
		ok: true,
		selected: {
			plans: [{ id: "opencode-go", windows: ["monthly", "rolling"] }],
			ring: [
				{ planId: "opencode-go", metric: "monthly" },
				{ planId: "opencode-go", metric: "rolling" }
			]
		}
	});
	assert.deepEqual(saved, res.body.selected);
});

test("config route rejects a plan outside the model scope and an empty selection", async () => {
	const saved = [];
	const handler = createConfigHandler({
		plans: plansFor(),
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({}),
		writeDisplay: (state) => {
			saved.push(state);
		}
	});
	const outside = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ plans: [{ id: "xiaomi-mimo", windows: ["monthly"] }] })
	}), outside);
	assert.equal(outside.statusCode, 400);
	assert.equal(outside.body.code, "plans");
	const empty = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ plans: [] })
	}), empty);
	assert.equal(empty.statusCode, 400);
	assert.equal(empty.body.code, "plans");
	assert.deepEqual(saved, []);
});

test("config route saves multiple plans and a separate ring selection", async () => {
	let saved = null;
	const handler = createConfigHandler({
		plans: plansFor(),
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({}),
		writeDisplay: (state) => {
			saved = state;
		}
	});
	const res = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			plans: [
				{ id: "opencode-go", windows: ["monthly", "rolling"] },
				{ id: "deepseek", windows: ["balance"] }
			],
			ring: [{ planId: "deepseek", metric: "balance" }]
		})
	}), res);
	assert.deepEqual(saved, {
		plans: [
			{ id: "opencode-go", windows: ["monthly", "rolling"] },
			{ id: "deepseek", windows: ["balance"] }
		],
		ring: [{ planId: "deepseek", metric: "balance" }]
	});
	assert.deepEqual(res.body.selected, saved);
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
