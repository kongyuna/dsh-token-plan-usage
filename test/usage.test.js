import assert from "node:assert/strict";
import { test } from "node:test";

import { UsageCache, clampPercent, readJsonBody, redactError, requestJSON, wireBase } from "../lib/usage.js";

// ── helpers ───────────────────────────────────────────────────────────────

function fakeResponse(status, body) {
	return {
		status,
		json: async () => {
			if (typeof body === "string") return JSON.parse(body);
			return body;
		}
	};
}

const noop = () => {};

// ── clampPercent ──────────────────────────────────────────────────────────

test("clampPercent keeps the displayable range", () => {
	assert.equal(clampPercent(0), 0);
	assert.equal(clampPercent(42.6), 42.6);
	assert.equal(clampPercent(100), 100);
	assert.equal(clampPercent(140), 100);
	assert.equal(clampPercent(-7), 0);
});

// ── redactError ───────────────────────────────────────────────────────────

test("redactError scrubs the credential and bearer text", () => {
	const text = redactError(new Error("bad key sk-secret and Bearer sk-secret"), "sk-secret");
	assert.ok(!text.includes("sk-secret"));
	assert.ok(text.includes("[REDACTED]"));
});

test("redactError caps the diagnostic at 200 characters", () => {
	const text = redactError("x".repeat(500));
	assert.ok(text.length <= 201);
});

test("redactError scrubs a Cookie header", () => {
	const text = redactError(new Error("Cookie: api-platform_serviceToken=secret; userId=42"));
	assert.ok(!text.includes("api-platform_serviceToken=secret"));
	assert.ok(text.includes("Cookie: [REDACTED]"));
});

// ── wireBase ──────────────────────────────────────────────────────────────

test("wireBase adds /v1 once and keeps an existing version", () => {
	assert.equal(wireBase("https://opencode.ai/zen/go"), "https://opencode.ai/zen/go/v1");
	assert.equal(wireBase("https://opencode.ai/zen/go/"), "https://opencode.ai/zen/go/v1");
	assert.equal(wireBase("https://opencode.ai/zen/go/v1"), "https://opencode.ai/zen/go/v1");
	assert.equal(wireBase("http://127.0.0.1:8788"), "http://127.0.0.1:8788/v1");
});

// ── requestJSON ───────────────────────────────────────────────────────────

test("requestJSON returns the parsed body on 200", async () => {
	let seen = null;
	const result = await requestJSON({
		url: "https://example.test/v1/usage",
		headers: { authorization: "Bearer key" },
		fetchImpl: async (url, init) => {
			seen = { url, init };
			return fakeResponse(200, { usage: { rolling: { percent: 1 } } });
		}
	});
	assert.equal(result.ok, true);
	assert.deepEqual(result.body, { usage: { rolling: { percent: 1 } } });
	assert.equal(seen.url, "https://example.test/v1/usage");
	assert.equal(seen.init.headers.authorization, "Bearer key");
});

test("requestJSON classifies 401/403 as auth", async () => {
	for (const status of [401, 403]) {
		const result = await requestJSON({
			url: "https://example.test/v1/usage",
			fetchImpl: async () => fakeResponse(status, {})
		});
		assert.equal(result.ok, false);
		assert.equal(result.code, "auth");
	}
});

test("requestJSON classifies other non-2xx as http", async () => {
	const result = await requestJSON({
		url: "https://example.test/v1/usage",
		fetchImpl: async () => fakeResponse(429, {})
	});
	assert.equal(result.ok, false);
	assert.equal(result.code, "http");
});

test("requestJSON treats a redirect as auth when the console asks for login", async () => {
	const result = await requestJSON({
		url: "https://example.test/v1/usage",
		treat3xxAsAuth: true,
		redirect: "manual",
		fetchImpl: async () => fakeResponse(302, {})
	});
	assert.equal(result.ok, false);
	assert.equal(result.code, "auth");
});

test("requestJSON classifies a non-JSON body as shape", async () => {
	const result = await requestJSON({
		url: "https://example.test/v1/usage",
		fetchImpl: async () => ({
			status: 200,
			json: async () => {
				throw new Error("not json");
			}
		})
	});
	assert.equal(result.ok, false);
	assert.equal(result.code, "shape");
});

test("requestJSON turns a timeout into code timeout", async () => {
	const result = await requestJSON({
		url: "https://example.test/slow",
		timeoutMs: 20,
		fetchImpl: (url, init) => new Promise((_resolve, reject) => {
			init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
		})
	});
	assert.equal(result.ok, false);
	assert.equal(result.code, "timeout");
});

test("requestJSON redacts the secret from a transport error", async () => {
	const result = await requestJSON({
		url: "https://example.test/x",
		secret: "sk-secret",
		fetchImpl: async () => {
			throw new Error("connect failed with sk-secret");
		}
	});
	assert.equal(result.ok, false);
	assert.equal(result.code, "network");
	assert.ok(!result.error.includes("sk-secret"));
});

// ── UsageCache ────────────────────────────────────────────────────────────

function probe(windows, fetchedAt) {
	return { ok: true, windows, fetchedAt };
}

test("UsageCache serves a fresh reading without calling the loader again", async () => {
	let calls = 0;
	let now = 1000;
	const cache = new UsageCache({ ttlMs: 30000, now: () => now });
	const load = async () => {
		calls += 1;
		return probe([{ key: "rolling", kind: "percent", usedPercent: 1 }], now);
	};
	const first = await cache.read("k", load);
	const second = await cache.read("k", load);
	assert.equal(first.ok, true);
	assert.equal(second.ok, true);
	assert.equal(second.cached, true);
	assert.equal(calls, 1);
	now += 31_000;
	await cache.read("k", load);
	assert.equal(calls, 2);
});

test("UsageCache joins concurrent reads for one key", async () => {
	let calls = 0;
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	const cache = new UsageCache({ ttlMs: 0 });
	const load = async () => {
		calls += 1;
		await gate;
		return probe([{ key: "rolling", kind: "percent", usedPercent: 2 }], 10);
	};
	const first = cache.read("k", load);
	const second = cache.read("k", load);
	release();
	const [a, b] = await Promise.all([first, second]);
	assert.equal(a.ok, true);
	assert.equal(b.ok, true);
	assert.equal(calls, 1);
});

test("UsageCache keeps last-good windows when a later probe fails", async () => {
	let calls = 0;
	const cache = new UsageCache({ ttlMs: 0, now: () => 100 });
	const good = () => probe([{ key: "weekly", kind: "percent", usedPercent: 12 }], 100);
	const bad = async () => ({ ok: false, code: "auth", error: "denied" });
	await cache.read("k", async () => {
		calls += 1;
		return good();
	});
	const result = await cache.read("k", bad);
	assert.equal(result.ok, false);
	assert.equal(result.code, "auth");
	assert.deepEqual(result.last.windows, [{ key: "weekly", kind: "percent", usedPercent: 12 }]);
	assert.equal(result.last.fetchedAt, 100);
	assert.equal(calls, 1);
});

test("UsageCache force skips the freshness window", async () => {
	let calls = 0;
	const cache = new UsageCache({ ttlMs: 60000, now: () => 0 });
	const load = async () => {
		calls += 1;
		return probe([{ key: "rolling", kind: "percent", usedPercent: calls }], 0);
	};
	await cache.read("k", load);
	await cache.read("k", load, { force: true });
	assert.equal(calls, 2);
});

test("UsageCache keeps a planName beside the cached windows", async () => {
	const cache = new UsageCache({ ttlMs: 60000, now: () => 0 });
	await cache.read("k", async () => ({ ok: true, windows: [], planName: "pro", fetchedAt: 0 }));
	assert.equal(cache.peek("k").planName, "pro");
});

// ── readJsonBody ──────────────────────────────────────────────────────────

async function* body(text) {
	yield Buffer.from(text);
}

test("readJsonBody parses a JSON object", async () => {
	assert.deepEqual(await readJsonBody(body('{"cookie":"a=b"}')), { cookie: "a=b" });
});

test("readJsonBody returns an empty object for an empty body", async () => {
	assert.deepEqual(await readJsonBody(body("")), {});
});

test("readJsonBody refuses a body above the limit", async () => {
	await assert.rejects(() => readJsonBody(body("x".repeat(32)), 8), /too large/);
});

void noop;
