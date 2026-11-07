import assert from "node:assert/strict";
import { test } from "node:test";

import {
	Config,
	DEFAULTS,
	KNOWN_PLANS,
	PLAN_KINDS,
	isLoopbackHost,
	normalizeBaseURL,
	normalizeConsoleURL,
	planDescriptors,
	validate
} from "../lib/config.js";

test("validate(null) returns the documented defaults", () => {
	const result = validate(null);
	assert.ok("value" in result);
	assert.equal(result.value.refreshSeconds, DEFAULTS.refreshSeconds);
	assert.equal(result.value.timeoutMs, DEFAULTS.timeoutMs);
	assert.equal(result.value.includeDefaults, true);
	assert.deepEqual(result.value.plans, []);
});

test("validate accepts a complete config", () => {
	const result = validate({
		refreshSeconds: 60,
		timeoutMs: 5000,
		includeDefaults: false,
		plans: [
			{
				id: "my-opencode",
				kind: "opencode-go",
				label: "My GO",
				credentialRef: "MY_GO_KEY",
				baseURL: "http://127.0.0.1:8788",
				consoleUrl: "https://opencode.ai/console/"
			}
		]
	});
	assert.ok("value" in result);
	assert.equal(result.value.refreshSeconds, 60);
	assert.equal(result.value.timeoutMs, 5000);
	assert.equal(result.value.includeDefaults, false);
	assert.equal(result.value.plans.length, 1);
	assert.equal(result.value.plans[0].baseURL, "http://127.0.0.1:8788");
	assert.equal(result.value.plans[0].explicitBaseURL, true);
	assert.equal(result.value.plans[0].explicitCredentialRef, true);
});

test("validate fills omitted fields from the known descriptor for the kind", () => {
	const result = validate({ plans: [{ id: "xiaomi-mimo", kind: "xiaomi-console" }] });
	assert.ok("value" in result);
	const plan = result.value.plans[0];
	assert.equal(plan.label, "Xiaomi MiMo");
	assert.equal(plan.credentialRef, "XIAOMI_TOKEN_PLAN_COOKIE");
	assert.equal(plan.baseURL, "https://platform.xiaomimimo.com/api/v1");
	assert.equal(plan.explicitBaseURL, false);
	assert.equal(plan.explicitCredentialRef, false);
});

test("validate rejects an unknown plan kind", () => {
	const result = validate({ plans: [{ id: "x", kind: "nope", credentialRef: "X_KEY" }] });
	assert.ok("issues" in result);
	assert.match(result.issues[0].path.join("."), /plans\.0\.kind/);
});

test("validate rejects a non-https non-loopback upstream", () => {
	const result = validate({
		plans: [{ id: "x", kind: "deepseek-balance", credentialRef: "X_KEY", baseURL: "http://api.example.com" }]
	});
	assert.ok("issues" in result);
	assert.match(result.issues[0].message, /https/);
});

test("validate rejects credentials embedded in a URL", () => {
	const result = validate({
		plans: [{ id: "x", kind: "deepseek-balance", credentialRef: "X_KEY", baseURL: "https://user:pass@api.example.com" }]
	});
	assert.ok("issues" in result);
	assert.match(result.issues[0].message, /credentials/);
});

test("validate rejects duplicate plan ids", () => {
	const result = validate({
		plans: [
			{ id: "a", kind: "deepseek-balance", credentialRef: "A_KEY" },
			{ id: "a", kind: "deepseek-balance", credentialRef: "B_KEY" }
		]
	});
	assert.ok("issues" in result);
	assert.match(result.issues[0].message, /duplicate/);
});

test("validate rejects a bad credential ref", () => {
	const result = validate({ plans: [{ id: "x", kind: "deepseek-balance", credentialRef: "lower-case" }] });
	assert.ok("issues" in result);
	assert.match(result.issues[0].path.join("."), /credentialRef/);
});

test("validate rejects an out-of-range refresh interval", () => {
	assert.ok("issues" in validate({ refreshSeconds: 5 }));
	assert.ok("issues" in validate({ refreshSeconds: 7200 }));
	assert.ok("issues" in validate({ timeoutMs: 10 }));
});

test("Config throws a path-qualified TypeError", () => {
	assert.throws(() => Config({ refreshSeconds: 5 }), /\$\.refreshSeconds/);
});

test("Config exposes the Standard Schema hook and an inert scanner shape", () => {
	assert.equal(Config["~standard"].version, 1);
	assert.equal(Config["~standard"].vendor, "dsh-token-plan-usage");
	assert.equal(typeof Config.toJSON, "function");
	assert.equal(Config.type, "custom");
	assert.equal(Config.toJSON().refs[1].meta.default, DEFAULTS.refreshSeconds);
});

test("planDescriptors keeps explicit order then appends known plans", () => {
	const config = Config({ plans: [{ id: "xiaomi-mimo", kind: "xiaomi-console" }] });
	const plans = planDescriptors(config);
	assert.deepEqual(plans.map((plan) => plan.id), ["xiaomi-mimo", "opencode-go", "deepseek"]);
	assert.equal(plans[0].explicit, true);
	assert.equal(plans[1].explicit, false);
});

test("planDescriptors respects includeDefaults and enabled", () => {
	const noDefaults = Config({ includeDefaults: false, plans: [{ id: "deepseek", kind: "deepseek-balance" }] });
	assert.deepEqual(planDescriptors(noDefaults).map((plan) => plan.id), ["deepseek"]);
	const disabled = Config({ plans: [{ id: "deepseek", kind: "deepseek-balance", enabled: false }] });
	assert.deepEqual(planDescriptors(disabled).map((plan) => plan.id), ["opencode-go", "xiaomi-mimo"]);
});

test("KNOWN_PLANS covers every supported kind", () => {
	assert.deepEqual(KNOWN_PLANS.map((plan) => plan.kind).sort(), [...PLAN_KINDS].sort());
});

test("normalizeBaseURL keeps https and loopback http only", () => {
	assert.deepEqual(normalizeBaseURL("https://api.example.com/v1/"), { value: "https://api.example.com/v1" });
	assert.deepEqual(normalizeBaseURL("http://127.0.0.1:8788"), { value: "http://127.0.0.1:8788" });
	assert.deepEqual(normalizeBaseURL("http://localhost:8080/"), { value: "http://localhost:8080" });
	assert.ok("issue" in normalizeBaseURL("http://api.example.com"));
	assert.ok("issue" in normalizeBaseURL("ftp://api.example.com"));
	assert.ok("issue" in normalizeBaseURL("not a url"));
	assert.ok("issue" in normalizeBaseURL("https://api.example.com?x=1"));
});

test("normalizeConsoleURL accepts a normal console link", () => {
	assert.deepEqual(normalizeConsoleURL("https://opencode.ai/console/"), { value: "https://opencode.ai/console/" });
	assert.ok("issue" in normalizeConsoleURL("http://opencode.ai/console/"));
});

test("isLoopbackHost recognizes the three loopback spellings", () => {
	for (const host of ["127.0.0.1", "localhost", "::1", "[::1]"]) assert.equal(isLoopbackHost(host), true, host);
	assert.equal(isLoopbackHost("example.com"), false);
});
