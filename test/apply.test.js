import assert from "node:assert/strict";
import { test } from "node:test";

import { apply, name, inject, Config } from "../lib/index.js";

function fakeContext() {
	const routes = [];
	const cleanups = [];
	const ctx = {
		effect(fn) {
			const cleanup = fn();
			if (typeof cleanup === "function") cleanups.push(cleanup);
			return () => {};
		},
		webServer: {
			register(route) {
				routes.push(route);
				return () => {};
			},
			getOrigin() {
				return "http://127.0.0.1:61830";
			}
		},
		get() {
			return undefined;
		}
	};
	return { ctx, routes, cleanups };
}

test("host plugin exports its name and required service", () => {
	assert.equal(name, "dsh-token-plan-usage");
	assert.deepEqual(inject, ["webServer"]);
	assert.equal(typeof Config, "function");
});

test("apply registers the usage, display-config and cookie routes", () => {
	const { ctx, routes } = fakeContext();
	apply(ctx, {});
	assert.equal(routes.length, 3);
	const byPath = Object.fromEntries(routes.map((route) => [route.path, route]));
	assert.equal(byPath["/dsh-token-plan-usage/usage"].kind, "exact");
	assert.equal(byPath["/dsh-token-plan-usage/config"].kind, "exact");
	assert.equal(byPath["/dsh-token-plan-usage/xiaomi-cookie"].kind, "exact");
	for (const path of ["/dsh-token-plan-usage/usage", "/dsh-token-plan-usage/config", "/dsh-token-plan-usage/xiaomi-cookie"]) {
		assert.equal(typeof byPath[path].handler, "function", path);
	}
});

test("apply rejects an invalid config before registering anything", () => {
	const { ctx, routes } = fakeContext();
	assert.throws(() => apply(ctx, { plans: [{ id: "bad", kind: "nope", credentialRef: "X_KEY" }] }), /kind/);
	assert.equal(routes.length, 0);
});
