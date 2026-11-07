// @ts-check
/**
 * dsh-token-plan-usage — configuration and plan descriptors.
 *
 * The plugin is deliberately config-light: with no `plans` array it derives a
 * descriptor for every known plan from the credential refs the user already
 * stores, and the host route decides per request whether that plan has a
 * credential. That keeps the configuration file safe to sync (no secrets) and
 * lets a newly stored credential appear on the next refresh without a restart.
 *
 * The validator is hand-rolled and dependency-free on purpose: a checkout-
 * installed DSH plugin may have no resolvable node_modules, so the schema must
 * not import schemastery. `Config` exposes the Standard Schema hook DSH's
 * Loader expects, plus the inert `meta`/`type`/`toJSON` shape its settings
 * scanner reads.
 */

/** Kinds this build can probe. */
export const PLAN_KINDS = Object.freeze(["opencode-go", "deepseek-balance", "xiaomi-console"]);

/** Defaults applied when a field is omitted. */
export const DEFAULTS = Object.freeze({
	refreshSeconds: 180,
	timeoutMs: 15000,
	includeDefaults: true,
	plans: Object.freeze([])
});

/**
 * Known plans, in display order. These are only defaults: an explicit `plans`
 * entry with the same id replaces the descriptor, and the host route still
 * resolves the credential per request.
 */
export const KNOWN_PLANS = Object.freeze([
	Object.freeze({
		id: "opencode-go",
		kind: "opencode-go",
		label: "OpenCode Go",
		credentialRef: "OPENCODE_GO_API_KEY",
		baseURL: "https://opencode.ai/zen/go",
		consoleUrl: "https://opencode.ai/console/"
	}),
	Object.freeze({
		id: "xiaomi-mimo",
		kind: "xiaomi-console",
		label: "Xiaomi MiMo",
		credentialRef: "XIAOMI_TOKEN_PLAN_COOKIE",
		apiKeyRef: "XIAOMI_TOKEN_PLAN_CN_API_KEY",
		baseURL: "https://platform.xiaomimimo.com/api/v1",
		consoleUrl: "https://platform.xiaomimimo.com/#/console/plan-manage"
	}),
	Object.freeze({
		id: "deepseek",
		kind: "deepseek-balance",
		label: "DeepSeek",
		credentialRef: "DEEPSEEK_API_KEY",
		baseURL: "https://api.deepseek.com",
		consoleUrl: "https://platform.deepseek.com/usage"
	})
]);

const KNOWN_BY_KIND = new Map(KNOWN_PLANS.map((plan) => [plan.kind, plan]));

/** Plan ids are lowercase and hyphenated so they can key a map and a URL. */
const PLAN_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** A credential reference doubles as an environment variable name. */
const CREDENTIAL_REF_RE = /^[A-Z_][A-Z0-9_]*$/;

/** Loopback hosts are the only place plain HTTP is allowed for an upstream. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLoopbackHost(hostname) {
	return LOOPBACK_HOSTS.has(hostname);
}

/**
 * Validate and normalize a plan's upstream base URL.
 *
 * HTTPS is required for everything except loopback, where a local relay
 * (`http://127.0.0.1:8788`) is a legitimate and common setup. Credentials must
 * never be embedded in the URL.
 *
 * @param {unknown} value
 * @returns {{ value: string } | { issue: string }}
 */
export function normalizeBaseURL(value) {
	if (typeof value !== "string" || value.trim().length === 0) {
		return { issue: "expected a non-empty URL string" };
	}
	let url;
	try {
		url = new URL(value.trim());
	} catch {
		return { issue: "expected an absolute URL" };
	}
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
		return { issue: "must use https:// (plain http:// is only allowed for loopback)" };
	}
	if (url.username !== "" || url.password !== "") {
		return { issue: "must not embed credentials" };
	}
	if (url.search !== "" || url.hash !== "") {
		return { issue: "must not carry a query or fragment" };
	}
	const path = url.pathname.replace(/\/+$/, "");
	return { value: `${url.origin}${path}` };
}

/**
 * @param {unknown} value
 * @returns {{ value: string } | { issue: string }}
 */
export function normalizeConsoleURL(value) {
	if (typeof value !== "string" || value.trim().length === 0) {
		return { issue: "expected a non-empty URL string" };
	}
	let url;
	try {
		url = new URL(value.trim());
	} catch {
		return { issue: "expected an absolute URL" };
	}
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
		return { issue: "must use https:// (plain http:// is only allowed for loopback)" };
	}
	if (url.username !== "" || url.password !== "") return { issue: "must not embed credentials" };
	return { value: url.toString() };
}

/**
 * @param {string} kind
 * @returns {boolean}
 */
export function isPlanKind(kind) {
	return PLAN_KINDS.includes(kind);
}

/**
 * Normalize one `plans[]` entry. Missing optional fields fall back to the known
 * descriptor for the same kind, so `{ id, kind }` is enough for the built-ins.
 *
 * @param {unknown} entry
 * @param {number} index
 * @param {Set<string>} seen
 * @returns {{ plan: PlanDescriptor } | { issues: Issue[] }}
 */
function normalizePlan(entry, index, seen) {
	if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
		return { issues: [{ path: ["plans", String(index)], message: "expected an object" }] };
	}
	const source = /** @type {Record<string, unknown>} */ (entry);
	const issues = [];

	const id = source.id;
	if (typeof id !== "string" || !PLAN_ID_RE.test(id)) {
		issues.push({ path: ["plans", String(index), "id"], message: "must be a lowercase hyphenated id" });
	} else if (seen.has(id)) {
		issues.push({ path: ["plans", String(index), "id"], message: `duplicate id "${id}"` });
	} else {
		seen.add(id);
	}

	const kind = source.kind;
	if (typeof kind !== "string" || !isPlanKind(kind)) {
		issues.push({ path: ["plans", String(index), "kind"], message: `must be one of ${PLAN_KINDS.join(", ")}` });
	}
	const known = typeof kind === "string" ? KNOWN_BY_KIND.get(kind) : undefined;

	let label = known?.label ?? id;
	if (source.label !== undefined) {
		if (typeof source.label !== "string" || source.label.trim().length === 0) {
			issues.push({ path: ["plans", String(index), "label"], message: "expected a non-empty string" });
		} else {
			label = source.label.trim();
		}
	}

	const credentialRef = source.credentialRef ?? known?.credentialRef;
	if (typeof credentialRef !== "string" || !CREDENTIAL_REF_RE.test(credentialRef)) {
		issues.push({ path: ["plans", String(index), "credentialRef"], message: "must be an uppercase POSIX variable name" });
	}

	const baseURLInput = source.baseURL ?? known?.baseURL;
	const base = normalizeBaseURL(baseURLInput);
	if ("issue" in base) {
		issues.push({ path: ["plans", String(index), "baseURL"], message: base.issue });
	}

	const consoleInput = source.consoleUrl ?? known?.consoleUrl;
	let consoleUrl = known?.consoleUrl;
	if (consoleInput !== undefined) {
		const parsed = normalizeConsoleURL(consoleInput);
		if ("issue" in parsed) {
			issues.push({ path: ["plans", String(index), "consoleUrl"], message: parsed.issue });
		} else {
			consoleUrl = parsed.value;
		}
	}

	let enabled = true;
	if (source.enabled !== undefined) {
		if (typeof source.enabled !== "boolean") {
			issues.push({ path: ["plans", String(index), "enabled"], message: "expected a boolean" });
		} else {
			enabled = source.enabled;
		}
	}

	if (issues.length > 0) return { issues };
	return {
		plan: {
			id: /** @type {string} */ (id),
			kind: /** @type {string} */ (kind),
			label: label ?? /** @type {string} */ (id),
			credentialRef: /** @type {string} */ (credentialRef),
			baseURL: "value" in base ? base.value : known?.baseURL ?? "",
			consoleUrl,
			enabled,
			explicit: true,
			explicitBaseURL: source.baseURL !== undefined,
			explicitCredentialRef: source.credentialRef !== undefined
		}
	};
}

/**
 * Validate the plugin's Loader config.
 *
 * @param {unknown} input
 * @returns {{ value: ResolvedConfig } | { issues: Issue[] }}
 */
export function validate(input) {
	/** @type {Issue[]} */
	const issues = [];
	if (input === null || input === undefined) {
		return { value: { ...DEFAULTS, plans: [] } };
	}
	if (typeof input !== "object" || Array.isArray(input)) {
		return { issues: [{ path: [], message: "expected an object" }] };
	}
	const source = /** @type {Record<string, unknown>} */ (input);

	let refreshSeconds = DEFAULTS.refreshSeconds;
	if (source.refreshSeconds !== undefined) {
		const value = source.refreshSeconds;
		if (typeof value !== "number" || !Number.isInteger(value) || value < 30 || value > 3600) {
			issues.push({ path: ["refreshSeconds"], message: "expected an integer between 30 and 3600" });
		} else {
			refreshSeconds = value;
		}
	}

	let timeoutMs = DEFAULTS.timeoutMs;
	if (source.timeoutMs !== undefined) {
		const value = source.timeoutMs;
		if (typeof value !== "number" || !Number.isInteger(value) || value < 1000 || value > 30000) {
			issues.push({ path: ["timeoutMs"], message: "expected an integer between 1000 and 30000" });
		} else {
			timeoutMs = value;
		}
	}

	let includeDefaults = DEFAULTS.includeDefaults;
	if (source.includeDefaults !== undefined) {
		if (typeof source.includeDefaults !== "boolean") {
			issues.push({ path: ["includeDefaults"], message: "expected a boolean" });
		} else {
			includeDefaults = source.includeDefaults;
		}
	}

	/** @type {PlanDescriptor[]} */
	const plans = [];
	if (source.plans !== undefined) {
		if (!Array.isArray(source.plans)) {
			issues.push({ path: ["plans"], message: "expected an array" });
		} else {
			const seen = new Set();
			source.plans.forEach((entry, index) => {
				const result = normalizePlan(entry, index, seen);
				if ("issues" in result) {
					issues.push(...result.issues);
				} else {
					plans.push(result.plan);
				}
			});
		}
	}

	if (issues.length > 0) return { issues };
	return { value: { refreshSeconds, timeoutMs, includeDefaults, plans } };
}

/**
 * @param {unknown} input
 * @returns {ResolvedConfig}
 */
export function Config(input) {
	const result = validate(input);
	if ("issues" in result) {
		const first = result.issues[0];
		const path = first.path.length > 0 ? `$.${first.path.join(".")} ` : "";
		throw new TypeError(`${path}${first.message}`);
	}
	return result.value;
}

Object.defineProperty(Config, "~standard", {
	value: { version: 1, vendor: "dsh-token-plan-usage", validate },
	enumerable: false
});

// The settings scanner reads these on any Config; a dependency-free validator
// is not a Schemastery instance, so declare the inert shape it needs.
Config.meta = Object.freeze({});
Config.type = "custom";
Config.toJSON = () => ({
	uid: 1,
	refs: {
		1: { type: "number", meta: { default: DEFAULTS.refreshSeconds } },
		2: { type: "number", meta: { default: DEFAULTS.timeoutMs } },
		3: { type: "boolean", meta: { default: DEFAULTS.includeDefaults } },
		4: { type: "array" },
		5: {
			type: "object",
			meta: { default: {} },
			dict: { refreshSeconds: 1, timeoutMs: 2, includeDefaults: 3, plans: 4 }
		}
	}
});

/**
 * Build the effective plan descriptors: explicit plans in config order, then
 * any known plan not explicitly configured (when `includeDefaults`).
 *
 * Disabled plans are dropped here; the host never probes them.
 *
 * @param {ResolvedConfig} config
 * @returns {PlanDescriptor[]}
 */
export function planDescriptors(config) {
	const explicitIds = new Set(config.plans.map((plan) => plan.id));
	/** @type {PlanDescriptor[]} */
	const plans = config.plans.filter((plan) => plan.enabled);
	if (config.includeDefaults) {
		for (const known of KNOWN_PLANS) {
			if (explicitIds.has(known.id)) continue;
			plans.push({
				id: known.id,
				kind: known.kind,
				label: known.label,
				credentialRef: known.credentialRef,
				baseURL: known.baseURL,
				consoleUrl: known.consoleUrl,
				enabled: true,
				explicit: false,
				explicitBaseURL: false,
				explicitCredentialRef: false
			});
		}
	}
	return plans;
}

/**
 * @typedef {{ path: string[], message: string }} Issue
 * @typedef {{
 *   id: string,
 *   kind: string,
 *   label: string,
 *   credentialRef: string,
 *   baseURL: string,
 *   consoleUrl?: string,
 *   enabled: boolean,
 *   explicit: boolean,
 *   explicitBaseURL: boolean,
 *   explicitCredentialRef: boolean
 * }} PlanDescriptor
 * @typedef {{
 *   refreshSeconds: number,
 *   timeoutMs: number,
 *   includeDefaults: boolean,
 *   plans: PlanDescriptor[]
 * }} ResolvedConfig
 */
