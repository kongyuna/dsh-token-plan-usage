import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Config, planDescriptors } from "../lib/config.js";
import { buildPlanView, createConfigHandler, createCookieHandler, createUsageHandler, planInScope, previewDisplayState, resolveAccountClient, resolveCredential } from "../lib/index.js";
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
const ACCOUNT_BALANCE = {
	status: "ready",
	value: [
		{ currency: "CNY", balance: "100.00" },
		{ currency: "USD", balance: "2.00" }
	],
	bonusWallets: [{ currency: "CNY", balance: "10.00" }]
};
const ACCOUNT_CLIENT = { version: "0.2.2-rc.1", locale: "zh-CN", timezoneOffsetSeconds: 28800 };

function fakeAccount(result) {
	const calls = [];
	return {
		calls,
		async getBalance(client) {
			calls.push(client);
			return typeof result === "function" ? result() : result;
		}
	};
}
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
	assert.deepEqual(res.body.plans[0].windows.map((window) => window.key), ["rolling", "weekly", "monthly"]);
	assert.deepEqual(res.body.display, {
		plans: ["opencode-go"],
		ring: [
			{ planId: "opencode-go", metric: "rolling" },
			{ planId: "opencode-go", metric: "weekly" }
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

test("usage route prefers the signed-in DeepSeek account and skips the API key", async () => {
	const account = fakeAccount(ACCOUNT_BALANCE);
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async () => undefined,
		listProviders: () => ["opencode-go", "deepseek-official", "deepseek-account"],
		getAccount: () => account,
		accountClient: ACCOUNT_CLIENT,
		readDisplay: () => ({ planId: "deepseek", windows: ["balance"] }),
		deps: {
			fetchImpl: async () => {
				throw new Error("the API key must not be probed while the account answers");
			},
			now: () => 11
		}
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.plans.length, 1);
	const view = res.body.plans[0];
	assert.equal(view.id, "deepseek");
	assert.equal(view.status, "ok");
	assert.deepEqual(view.windows, [
		{ key: "balance", kind: "amount", amount: 110, currency: "CNY", toppedUp: 100, granted: 10 },
		{ key: "balance-usd", kind: "amount", amount: 2, currency: "USD", toppedUp: 2 }
	]);
	assert.equal(account.calls[0], ACCOUNT_CLIENT);
	assert.ok(!JSON.stringify(res.body).includes("sk-"));
});

test("usage route falls back to the API key when the account is signed out", async () => {
	const fetchImpl = router({ "/user/balance": { value: DEEPSEEK_BALANCE } });
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "DEEPSEEK_API_KEY" ? "sk-deep" : undefined),
		listProviders: () => ["deepseek-official", "deepseek-account"],
		getAccount: () => fakeAccount(null),
		accountClient: ACCOUNT_CLIENT,
		readDisplay: () => ({ planId: "deepseek", windows: ["balance"] }),
		deps: { fetchImpl, now: () => 12 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.plans[0].status, "ok");
	assert.equal(res.body.plans[0].windows[0].amount, 110);
});

test("usage route reports a signed-out DeepSeek account when no source works", async () => {
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async () => undefined,
		listProviders: () => ["deepseek-official", "deepseek-account"],
		getAccount: () => fakeAccount(null),
		accountClient: ACCOUNT_CLIENT,
		readDisplay: () => ({ planId: "deepseek", windows: ["balance"] }),
		deps: { fetchImpl: async () => jsonResponse({}), now: () => 13 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.plans[0].status, "signed-out");
});

test("usage route reports the account error when both DeepSeek sources fail", async () => {
	const fetchImpl = router({ "/user/balance": { status: 401, value: {} } });
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "DEEPSEEK_API_KEY" ? "sk-deep" : undefined),
		listProviders: () => ["deepseek-official", "deepseek-account"],
		getAccount: () => fakeAccount({ status: "failed" }),
		accountClient: ACCOUNT_CLIENT,
		readDisplay: () => ({ planId: "deepseek", windows: ["balance"] }),
		deps: { fetchImpl, now: () => 14 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.plans[0].status, "account-error");
});

test("usage route keeps the API key path when the account service is absent", async () => {
	const fetchImpl = router({ "/user/balance": { value: DEEPSEEK_BALANCE } });
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "DEEPSEEK_API_KEY" ? "sk-deep" : undefined),
		listProviders: () => ["deepseek-official"],
		readDisplay: () => ({ planId: "deepseek", windows: ["balance"] }),
		deps: { fetchImpl, now: () => 15 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.body.plans[0].status, "ok");
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
	assert.deepEqual(res.body.display.plans, ["opencode-go", "deepseek"]);
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
		plans: ["deepseek"],
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
			plans: ["opencode-go"],
			ring: [
				{ planId: "opencode-go", metric: "rolling" },
				{ planId: "opencode-go", metric: "weekly" }
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

test("config route requires a same-origin JSON write", async () => {
	const saved = [];
	const handler = createConfigHandler({
		plans: plansFor(),
		listProviders: () => ["opencode-go"],
		readDisplay: () => ({}),
		writeDisplay: (state) => {
			saved.push(state);
		},
		getOrigin: () => "http://127.0.0.1:61830"
	});
	const body = JSON.stringify({ plans: ["opencode-go"], ring: [{ planId: "opencode-go", metric: "rolling" }] });
	const wrongOrigin = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { origin: "http://evil.example", "content-type": "application/json" },
		body
	}), wrongOrigin);
	assert.equal(wrongOrigin.statusCode, 403);
	assert.equal(wrongOrigin.body.code, "origin");
	const missingOrigin = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { "content-type": "application/json" },
		body
	}), missingOrigin);
	assert.equal(missingOrigin.statusCode, 403);
	const noType = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { origin: "http://127.0.0.1:61830" },
		body
	}), noType);
	assert.equal(noType.statusCode, 415);
	assert.equal(noType.body.code, "content-type");
	assert.deepEqual(saved, []);
	const accepted = fakeRes();
	await handler(fakeRequest({
		method: "POST",
		headers: { origin: "http://127.0.0.1:61830", "content-type": "application/json" },
		body
	}), accepted);
	assert.equal(accepted.statusCode, 200);
	assert.equal(accepted.body.ok, true);
	assert.equal(saved.length, 1);
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
			ring: [{ planId: "deepseek", metric: "balance", capacity: 200 }]
		})
	}), res);
	assert.deepEqual(saved, {
		plans: ["opencode-go", "deepseek"],
		ring: [{ planId: "deepseek", metric: "balance", capacity: 200 }]
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

test("usage route reports a host failure as HTTP 500 instead of an empty success", async () => {
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async () => "sk-open",
		listProviders: () => ["opencode-go"],
		readDisplay: () => {
			throw new Error("display store failed");
		},
		deps: { fetchImpl: async () => jsonResponse({}), now: () => 1 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.statusCode, 500);
	assert.equal(res.body.ok, false);
	assert.equal(res.body.code, "internal");
	assert.equal("plans" in res.body, false);
});

test("usage route keeps a healthy plan when another plan's probe throws", async () => {
	const fetchImpl = router({ "/user/balance": { value: DEEPSEEK_BALANCE } });
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => {
			if (ref === "OPENCODE_GO_API_KEY") throw new Error("credential store unavailable");
			return ref === "DEEPSEEK_API_KEY" ? "sk-deep" : undefined;
		},
		listProviders: () => ["opencode-go", "deepseek-official"],
		readDisplay: () => ({ plans: ["opencode-go", "deepseek"], ring: [{ planId: "deepseek", metric: "balance" }] }),
		deps: { fetchImpl, now: () => 1 }
	});
	const res = fakeRes();
	await handler(fakeRequest(), res);
	assert.equal(res.statusCode, 200);
	const byId = Object.fromEntries(res.body.plans.map((plan) => [plan.id, plan]));
	assert.equal(byId["opencode-go"].status, "internal");
	assert.equal(byId.deepseek.status, "ok");
});

test("usage route probes an unsaved preview selection", async () => {
	const account = fakeAccount(ACCOUNT_BALANCE);
	const handler = createUsageHandler({
		plans: plansFor(),
		cache: new UsageCache({ ttlMs: 0 }),
		resolveCredential: async (ref) => (ref === "OPENCODE_GO_API_KEY" ? "sk-open" : undefined),
		listProviders: () => ["opencode-go", "deepseek-account"],
		getAccount: () => account,
		accountClient: ACCOUNT_CLIENT,
		readDisplay: () => ({ plans: ["opencode-go"], ring: [{ planId: "opencode-go", metric: "rolling" }] }),
		deps: { fetchImpl: router({ "/zen/go/v1/usage": { value: OPENCODE_USAGE } }), now: () => 1 }
	});
	const res = fakeRes();
	await handler(fakeRequest({ url: "/dsh-token-plan-usage/usage?preview=1&plans=opencode-go%2Cdeepseek&ring=deepseek%3A%3Abalance" }), res);
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body.plans.map((plan) => plan.id), ["opencode-go", "deepseek"]);
	assert.equal(res.body.plans[1].status, "ok");
});

test("previewDisplayState sanitizes the unsaved selection without injecting defaults", () => {
	const plans = plansFor();
	assert.deepEqual(previewDisplayState(plans, ["deepseek", "bogus"], ["deepseek::balance::200", "deepseek::bogus", "opencode-go::rolling"]), {
		plans: ["deepseek"],
		ring: [
			{ planId: "deepseek", metric: "balance", capacity: 200 },
			{ planId: "opencode-go", metric: "rolling" }
		]
	});
	assert.equal(previewDisplayState(plans, [], []), undefined);
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

test("resolveAccountClient reads the host version from the profile install anchor", () => {
	const dir = mkdtempSync(join(tmpdir(), "dsh-tpu-account-"));
	try {
		const anchor = join(dir, "package.json");
		writeFileSync(anchor, JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.2.2-rc.1" }));
		const client = resolveAccountClient({
			get(name) {
				return name === "profileContext" ? { installAnchor: anchor } : undefined;
			}
		});
		assert.equal(client.version, "0.2.2-rc.1");
		assert.equal(typeof client.locale, "string");
		assert.ok(client.locale.length > 0);
		assert.equal(client.timezoneOffsetSeconds, -new Date().getTimezoneOffset() * 60);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	assert.equal(resolveAccountClient({}).version, "0.0.0");
});
