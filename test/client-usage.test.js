import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The client half is a hand-authored module-loader bundle. Loading it with
// stub React modules is the only way to exercise its pure formatting and the
// rendered tree without a browser.
const BUNDLE = new URL("../lib/client.js", import.meta.url);

function loadBundle({ executeEffects = false } = {}) {
	const source = readFileSync(BUNDLE, "utf8");
	const entries = [];
	const FRAGMENT = Symbol("Fragment");
	const fakeWindow = {
		__ModuleLoader__: { load: (entry) => entries.push(entry) },
		addEventListener: () => {},
		removeEventListener: () => {},
		innerWidth: 1440,
		innerHeight: 900
	};
	const record = (type, props, key) => ({ type, props: props ?? {}, key });
	const fakeRequire = (id) => {
		switch (id) {
			case "react":
				return {
					Fragment: FRAGMENT,
					useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
					useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
					useEffect: executeEffects ? (fn) => { fn(); } : () => {},
					useRef: (initial) => ({ current: initial ?? null }),
					useCallback: (fn) => fn,
					createElement: () => null
				};
			case "react/jsx-runtime":
				return { Fragment: FRAGMENT, jsx: record, jsxs: record };
			default:
				throw new Error(`unexpected require("${id}") from the client bundle`);
		}
	};
	// eslint-disable-next-line no-new-func
	new Function("window", "require", source)(fakeWindow, fakeRequire);
	assert.equal(entries.length, 1, "the bundle registers exactly one module");
	assert.equal(entries[0].id, "dsh-token-plan-usage");
	return entities(entries[0].factory(fakeRequire), FRAGMENT);
}

function entities(mod, FRAGMENT) {
	return { mod, FRAGMENT };
}

const { mod, FRAGMENT } = loadBundle();

function translator(dict) {
	return (key, params) => {
		const template = dict[key] ?? key;
		if (params === undefined) return template;
		return template.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])));
	};
}
const tr = translator(mod.dictionaries.zh);
const trEn = translator(mod.dictionaries.en);

function walk(node, visit) {
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	if (node === null || typeof node !== "object") return;
	if (typeof node.type === "function") {
		walk(node.type(node.props), visit);
		return;
	}
	if (node.type === FRAGMENT) {
		walk(node.props.children, visit);
		return;
	}
	visit(node);
	walk(node.props?.children, visit);
}

function textsOf(tree) {
	const texts = [];
	walk(tree, (node) => {
		const children = node.props?.children;
		if (typeof children === "string" || typeof children === "number") texts.push(String(children));
	});
	return texts;
}

function nodesWhere(tree, predicate) {
	const found = [];
	walk(tree, (node) => {
		if (predicate(node)) found.push(node);
	});
	return found;
}

function fakeStore(state) {
	const current = { open: false, tip: null, anchor: null, plans: [], status: "idle", fetchedAt: null, error: null, loading: false, ...state };
	return {
		subscribe: () => () => {},
		getSnapshot: () => current,
		read: async () => null,
		toggle: () => {},
		close: () => {},
		setTip: () => {},
		saveXiaomiCookie: async () => ({ ok: true })
	};
}

const OPENCODE = {
	id: "opencode-go",
	kind: "opencode-go",
	label: "OpenCode Go",
	source: "default",
	status: "ok",
	consoleUrl: "https://opencode.ai/console/",
	windows: [
		{ key: "rolling", kind: "percent", status: "ok", usedPercent: 20, resetsAt: "2026-11-07T21:00:00.000Z" },
		{ key: "weekly", kind: "percent", status: "ok", usedPercent: 88, resetsAt: "2026-11-09T00:00:00.000Z" },
		{ key: "monthly", kind: "percent", status: "ok", usedPercent: 46, resetsAt: "2026-12-03T13:15:46.000Z" }
	]
};
const XIAOMI = {
	id: "xiaomi-mimo",
	kind: "xiaomi-console",
	label: "Xiaomi MiMo",
	source: "default",
	status: "no-cookie",
	setup: "xiaomi-cookie",
	consoleUrl: "https://platform.xiaomimimo.com/#/console/plan-manage",
	windows: []
};
const DEEPSEEK = {
	id: "deepseek",
	kind: "deepseek-balance",
	label: "DeepSeek",
	source: "default",
	status: "ok",
	consoleUrl: "https://platform.deepseek.com/usage",
	windows: [{ key: "balance", kind: "amount", amount: 110, currency: "CNY", granted: 10, toppedUp: 100 }]
};

// ── dictionaries / exports ────────────────────────────────────────────────

test("client exports the slot and locale requirements plus both dictionaries", () => {
	assert.deepEqual(mod.inject, ["slots", "locale"]);
	assert.equal(typeof mod.apply, "function");
	for (const key of ["title", "noPlans", "noCookie", "setupCookie", "balance", "credits"]) {
		assert.equal(typeof mod.dictionaries.zh[key], "string");
		assert.equal(typeof mod.dictionaries.en[key], "string");
	}
});

// ── formatting ────────────────────────────────────────────────────────────

test("formatPercent rounds, clamps and withholds a missing value", () => {
	const { formatPercent } = mod.usageFormat;
	assert.equal(formatPercent(38.4), "38%");
	assert.equal(formatPercent(0), "0%");
	assert.equal(formatPercent(100), "100%");
	assert.equal(formatPercent(140), "100%");
	assert.equal(formatPercent(undefined), "—");
});

test("formatResetValue gives a clock time inside a day and a date beyond it", () => {
	const { formatResetValue } = mod.usageFormat;
	const now = Date.parse("2026-11-07T06:00:00.000Z");
	const clock = formatResetValue("2026-11-07T21:00:00.000Z", now, "en-GB", trEn);
	assert.match(clock, /^\d{2}:\d{2}$/);
	const expectedDate = new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(new Date("2026-11-09T00:00:00.000Z"));
	assert.equal(formatResetValue("2026-11-09T00:00:00.000Z", now, "en-GB", trEn), expectedDate);
	assert.equal(formatResetValue("2026-11-07T05:00:00.000Z", now, "en-GB", trEn), "Resetting");
	assert.equal(formatResetValue("not a date", now, "en-GB", trEn), "—");
});

test("formatUpdatedAt is a clock time", () => {
	const { formatUpdatedAt } = mod.usageFormat;
	const expected = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date("2026-11-07T13:30:00.000Z"));
	assert.equal(formatUpdatedAt(Date.parse("2026-11-07T13:30:00.000Z"), "en-GB"), expected);
	assert.equal(formatUpdatedAt(undefined, "en-GB"), null);
});

test("formatAmount uses the requested currency and falls back safely", () => {
	const { formatAmount } = mod.usageFormat;
	assert.match(formatAmount(110, "CNY", "zh-CN"), /110/);
	assert.match(formatAmount(110, "CNY", "en-US"), /110/);
	assert.equal(formatAmount(undefined, "CNY", "en-US"), "—");
});

test("formatCreditRatio compacts big counters and refuses partial input", () => {
	const { formatCreditRatio } = mod.usageFormat;
	assert.match(formatCreditRatio(4200000000, 10000000000, "en-US"), /\//);
	assert.equal(formatCreditRatio(undefined, 10, "en-US"), undefined);
});

// ── summarization ─────────────────────────────────────────────────────────

test("summarize puts the most-used short window on top and long window below", () => {
	const summary = mod.usageFormat.summarize([OPENCODE, DEEPSEEK]);
	assert.equal(summary.top, 20);
	assert.equal(summary.bottom, 88);
	assert.equal(summary.topEntry.window.key, "rolling");
	assert.equal(summary.bottomEntry.window.key, "weekly");
	assert.equal(summary.hasPercent, true);
	assert.equal(summary.exhausted, false);
});

test("summarize treats a reached limit as exhausted", () => {
	const summary = mod.usageFormat.summarize([{ ...OPENCODE, windows: [{ key: "weekly", kind: "percent", status: "rate-limited", usedPercent: 100 }] }]);
	assert.equal(summary.exhausted, true);
	assert.equal(summary.bottom, 100);
});

test("summarize falls back when only a monthly window exists", () => {
	const summary = mod.usageFormat.summarize([{ ...XIAOMI, status: "ok", windows: [{ key: "monthly", kind: "percent", usedPercent: 42 }] }]);
	assert.equal(summary.top, 0);
	assert.equal(summary.bottom, 42);
	assert.equal(summary.hasPercent, true);
});

test("summarize marks a balance-only set as having no percent", () => {
	const summary = mod.usageFormat.summarize([DEEPSEEK]);
	assert.equal(summary.hasPercent, false);
	assert.equal(summary.top, 0);
	assert.equal(summary.bottom, 0);
});

test("summaryText names the two arcs", () => {
	assert.match(mod.usageFormat.summaryText(mod.usageFormat.summarize([OPENCODE]), tr), /5h 20%/);
	assert.match(mod.usageFormat.summaryText(mod.usageFormat.summarize([OPENCODE]), tr), /周 88%/);
});

// ── anchors / visibility ──────────────────────────────────────────────────

test("cardAnchor clamps a 300px card inside a 390px viewport", () => {
	const anchor = mod.usageFormat.cardAnchor({ left: 10, right: 46, top: 700 }, { width: 390, height: 800 });
	assert.equal(anchor.left, 8);
	assert.equal(anchor.bottom, 106);
});

test("cardAnchor keeps the card inside a desktop viewport", () => {
	const anchor = mod.usageFormat.cardAnchor({ left: 120, right: 156, top: 900 }, { width: 1440, height: 1000 });
	assert.ok(anchor.left >= 8);
	assert.ok(anchor.left <= 1440 - 300 - 8);
	assert.equal(anchor.bottom, 106);
});

test("visiblePlans hides auto-discovered no-key plans but keeps configured ones", () => {
	const plans = mod.usageFormat.visiblePlans([
		{ id: "a", status: "ok" },
		{ id: "b", status: "no-key", source: "default" },
		{ id: "c", status: "no-key", source: "config" },
		{ id: "d", status: "no-cookie", setup: "xiaomi-cookie" }
	]);
	assert.deepEqual(plans.map((plan) => plan.id), ["a", "c", "d"]);
});

test("statusText localizes every known failure", () => {
	const { statusText } = mod.usageFormat;
	assert.equal(statusText({ status: "auth" }, tr), "凭据无效");
	assert.equal(statusText({ status: "no-cookie" }, tr), "需要控制台 Cookie");
	assert.equal(statusText({ status: "ok" }, tr), null);
	assert.equal(statusText({ status: "shape" }, trEn), "Unrecognized response");
});

// ── rendered footer ───────────────────────────────────────────────────────

test("footer action renders a labeled ring with the right expanded state", () => {
	const store = fakeStore({ plans: [OPENCODE], status: "ok" });
	const tree = mod.usageFooterAction({ store, t: tr });
	const buttons = nodesWhere(tree, (node) => node.type === "button");
	assert.equal(buttons.length, 1);
	assert.match(buttons[0].props["aria-label"], /Token 用量/);
	assert.match(buttons[0].props["aria-label"], /5h 20%/);
	assert.equal(buttons[0].props["aria-expanded"], "false");
	assert.equal(nodesWhere(tree, (node) => node.props?.["data-tpu"] === "ring").length, 1);
});

test("footer action reports an open card", () => {
	const store = fakeStore({ plans: [OPENCODE], open: true, anchor: { left: 8, bottom: 100 } });
	const tree = mod.usageFooterAction({ store, t: tr });
	const button = nodesWhere(tree, (node) => node.type === "button")[0];
	assert.equal(button.props["aria-expanded"], "true");
});

test("footer placement effect runs without throwing and falls back when the account row is absent", () => {
	const saved = {
		window: globalThis.window,
		document: globalThis.document,
		MutationObserver: globalThis.MutationObserver
	};
	globalThis.window = {
		innerWidth: 1440,
		innerHeight: 900,
		addEventListener: () => {},
		removeEventListener: () => {}
	};
	globalThis.document = {
		body: {},
		querySelectorAll: () => []
	};
	globalThis.MutationObserver = undefined;
	try {
		const { mod: effectMod } = loadBundle({ executeEffects: true });
		const store = fakeStore({ plans: [OPENCODE], status: "ok" });
		// The effect calls the account-row measurement during mount. A missing
		// helper or a DOM shape the effect does not guard would throw here; the
		// fallback must keep the trigger renderable instead.
		const tree = effectMod.usageFooterAction({ store, t: tr });
		assert.equal(nodesWhere(tree, (node) => node.type === "button").length, 1);
	} finally {
		if (saved.window === undefined) delete globalThis.window;
		else globalThis.window = saved.window;
		if (saved.document === undefined) delete globalThis.document;
		else globalThis.document = saved.document;
		if (saved.MutationObserver === undefined) delete globalThis.MutationObserver;
		else globalThis.MutationObserver = saved.MutationObserver;
	}
});

// ── rendered card ─────────────────────────────────────────────────────────

test("card renders every plan, its windows and the Xiaomi setup affordance", () => {
	const store = fakeStore({
		plans: [OPENCODE, XIAOMI, DEEPSEEK],
		open: true,
		anchor: { left: 20, bottom: 120 },
		status: "ok",
		fetchedAt: Date.parse("2026-11-07T13:30:00.000Z")
	});
	const tree = mod.usageCardLayer({ store, t: tr, getLocale: () => "zh-CN" });
	const texts = textsOf(tree);
	for (const expected of ["OpenCode Go", "Xiaomi MiMo", "DeepSeek", "20%", "88%", "46%", "需要控制台 Cookie", "设置 Cookie", "余额"]) {
		assert.ok(texts.includes(expected), `missing ${expected}; got ${texts.join(" | ")}`);
	}
	const cards = nodesWhere(tree, (node) => node.props?.["data-tpu"] === "card");
	assert.equal(cards.length, 1);
	assert.equal(cards[0].props.id, "dsh-token-plan-usage-card");
	assert.equal(cards[0].props.role, "group");
});

test("card shows the empty state when every plan is hidden", () => {
	const store = fakeStore({ plans: [{ id: "a", status: "no-key", source: "default" }], open: true, anchor: { left: 8, bottom: 100 } });
	const tree = mod.usageCardLayer({ store, t: tr, getLocale: () => "zh-CN" });
	assert.ok(textsOf(tree).includes("没有可显示的 token plan"));
});

test("card never renders a raw secret from the error channel", () => {
	const store = fakeStore({
		plans: [{ ...OPENCODE, status: "auth", windows: [], error: "Bearer sk-super-secret" }],
		open: true,
		anchor: { left: 8, bottom: 100 },
		status: "error",
		error: "network down"
	});
	const tree = mod.usageCardLayer({ store, t: tr, getLocale: () => "zh-CN" });
	const serialized = JSON.stringify(textsOf(tree));
	assert.ok(!serialized.includes("sk-super-secret"));
	assert.ok(textsOf(tree).includes("凭据无效"));
});

test("card shows last-good rows while a plan is failing", () => {
	const plan = {
		...OPENCODE,
		status: "auth",
		windows: [],
		last: { windows: [{ key: "weekly", kind: "percent", usedPercent: 12, resetsAt: "2026-11-09T00:00:00.000Z" }], fetchedAt: 5 }
	};
	const store = fakeStore({ plans: [plan], open: true, anchor: { left: 8, bottom: 100 } });
	const tree = mod.usageCardLayer({ store, t: tr, getLocale: () => "zh-CN" });
	const texts = textsOf(tree);
	assert.ok(texts.includes("12%"));
	assert.ok(texts.includes("凭据无效 · 上次读数"));
});

test("card is absent when closed but still renders a hover tip", () => {
	const store = fakeStore({ plans: [OPENCODE], open: false, tip: { arc: "top", text: "OpenCode Go · 5 小时 已用 20%", left: 10, bottom: 40 } });
	const tree = mod.usageCardLayer({ store, t: tr, getLocale: () => "zh-CN" });
	assert.equal(nodesWhere(tree, (node) => node.props?.["data-tpu"] === "card").length, 0);
	const tips = nodesWhere(tree, (node) => node.props?.["data-tpu"] === "tip");
	assert.equal(tips.length, 1);
	assert.equal(tips[0].props.children, "OpenCode Go · 5 小时 已用 20%");
});
