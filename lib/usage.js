// @ts-check
/**
 * dsh-token-plan-usage — host-free networking and cache primitives.
 *
 * This module owns the wire shape every plan probe shares: one bounded GET,
 * JSON decoding, status classification, secret redaction, and the last-known
 * cache. It imports nothing from the Harness, so every branch runs under bare
 * `node --test` with an injected `fetch`.
 */

/** Ceiling for a percentage: the gateway reports 0..100, a relay may not. */
export const PERCENT_MAX = 100;

/**
 * Clamp one percentage into the displayable range.
 * @param {number} value
 * @returns {number}
 */
export function clampPercent(value) {
	return Math.max(0, Math.min(PERCENT_MAX, value));
}

/**
 * Strip anything that looks like the credential out of a diagnostic string.
 * The message is surfaced in the browser, so an upstream body that echoes the
 * key must not survive the trip.
 *
 * @param {unknown} error - an Error, a string, or anything printable.
 * @param {string} [secret] - the credential to scrub.
 * @returns {string}
 */
export function redactError(error, secret = "") {
	let text = error instanceof Error ? error.message : String(error ?? "");
	if (secret.length > 0) text = text.split(secret).join("[REDACTED]");
	text = text.replace(/Bearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]");
	text = text.replace(/Cookie:\s*[^\n]+/gi, "Cookie: [REDACTED]");
	text = text.trim();
	return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/**
 * The base at which an OpenAI-style gateway exposes `/v1/...`. A base that
 * already ends in a version segment is left alone; anything else gets `/v1`.
 *
 * @param {string} baseURL
 * @returns {string}
 */
export function wireBase(baseURL) {
	const base = String(baseURL ?? "").replace(/\/+$/, "");
	return /\/v\d+$/.test(base) ? base : `${base}/v1`;
}

/**
 * One bounded JSON GET.
 *
 * Never throws: transport failures, timeouts, non-2xx answers and non-JSON
 * bodies all come back as `{ ok: false, code, error }`. The caller keeps the
 * previous reading, so a probe's mood can never blank the panel.
 *
 * @param {object} input
 * @param {string} input.url
 * @param {Record<string, string>} [input.headers]
 * @param {number} [input.timeoutMs]
 * @param {typeof globalThis.fetch} [input.fetchImpl]
 * @param {AbortSignal} [input.signal]
 * @param {RequestRedirect} [input.redirect]
 * @param {boolean} [input.treat3xxAsAuth] - expired MiMo console sessions redirect to login.
 * @param {string} [input.secret] - credential to scrub from error text.
 * @returns {Promise<{ ok: true, status: number, body: unknown } | { ok: false, code: "auth"|"http"|"timeout"|"network"|"shape", error: string }>}
 */
export async function requestJSON({
	url,
	headers = {},
	timeoutMs = 15000,
	fetchImpl = globalThis.fetch,
	signal,
	redirect = "error",
	treat3xxAsAuth = false,
	secret = ""
}) {
	if (typeof fetchImpl !== "function") {
		return { ok: false, code: "network", error: `GET ${url} failed: fetch is unavailable` };
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("probe timeout"), Math.max(1, timeoutMs));
	const onCallerAbort = () => controller.abort("caller aborted");
	if (signal !== undefined) {
		if (signal.aborted === true) {
			clearTimeout(timer);
			return { ok: false, code: "timeout", error: `GET ${url} aborted before send` };
		}
		signal.addEventListener("abort", onCallerAbort, { once: true });
	}
	try {
		const response = await fetchImpl(url, {
			method: "GET",
			headers: { accept: "application/json", ...headers },
			signal: controller.signal,
			redirect,
			cache: "no-store"
		});
		const status = typeof response?.status === "number" ? response.status : 0;
		if (status >= 300 && status < 400) {
			if (treat3xxAsAuth) {
				return { ok: false, code: "auth", error: `GET ${url} → HTTP ${status} (login required)` };
			}
			return { ok: false, code: "http", error: `GET ${url} → HTTP ${status}` };
		}
		if (status === 401 || status === 403) {
			return { ok: false, code: "auth", error: `GET ${url} → HTTP ${status} (credential rejected)` };
		}
		if (status < 200 || status >= 300) {
			return { ok: false, code: "http", error: `GET ${url} → HTTP ${status}` };
		}
		let body;
		try {
			body = await response.json();
		} catch {
			return { ok: false, code: "shape", error: `GET ${url} answered non-JSON (HTTP ${status})` };
		}
		return { ok: true, status, body };
	} catch (error) {
		const aborted = controller.signal.aborted === true;
		return {
			ok: false,
			code: aborted ? "timeout" : "network",
			error: aborted
				? `GET ${url} timed out after ${timeoutMs}ms`
				: `GET ${url} failed: ${redactError(error, secret)}`
		};
	} finally {
		clearTimeout(timer);
		if (signal !== undefined) signal.removeEventListener("abort", onCallerAbort);
	}
}

/**
 * The last-known reading, with a freshness window and single-flight.
 *
 * Two timestamps matter and they are deliberately separate: `attemptAt` decides
 * whether a new probe is due (a failing endpoint must not be hammered), while
 * `fetchedAt` is when the numbers on screen were actually true. A failed probe
 * therefore keeps the previous windows and reports the error beside them.
 */
export class UsageCache {
	/**
	 * @param {object} [options]
	 * @param {number} [options.ttlMs]
	 * @param {() => number} [options.now]
	 */
	constructor({ ttlMs = 30000, now = () => Date.now() } = {}) {
		this.ttlMs = ttlMs;
		this.now = now;
		/** @type {Map<string, { windows: WindowView[], planName?: string, fetchedAt: number }>} */
		this.good = new Map();
		/** @type {Map<string, ProbeResult>} */
		this.last = new Map();
		/** @type {Map<string, number>} */
		this.attemptAt = new Map();
		/** @type {Map<string, Promise<ProbeResult>>} */
		this.inFlight = new Map();
	}

	/**
	 * The last successful reading, synchronously, without probing.
	 * @param {string} key
	 */
	peek(key) {
		return this.good.get(key);
	}

	/**
	 * Read one key: serve the cached answer while it is fresh, otherwise probe
	 * once (joining any probe already running for the same key).
	 *
	 * @param {string} key
	 * @param {() => Promise<ProbeResult>} loader
	 * @param {{ force?: boolean, ttlMs?: number }} [options]
	 * @returns {Promise<ProbeResult>}
	 */
	async read(key, loader, { force = false, ttlMs = this.ttlMs } = {}) {
		const now = this.now();
		const attemptedAt = this.attemptAt.get(key);
		const cached = this.last.get(key);
		if (force !== true && attemptedAt !== undefined && cached !== undefined && now - attemptedAt < ttlMs) {
			return { ...cached, cached: true };
		}
		const running = this.inFlight.get(key);
		if (running !== undefined) return running;

		const promise = (async () => {
			const probe = await loader();
			this.attemptAt.set(key, this.now());
			/** @type {ProbeResult} */
			const result = probe.ok === true
				? {
					ok: true,
					windows: probe.windows,
					...(probe.planName === undefined ? {} : { planName: probe.planName }),
					...(probe.partial === true ? { partial: true } : {}),
					fetchedAt: probe.fetchedAt,
					cached: false
				}
				: (() => {
					const lastGood = this.good.get(key);
					return {
						ok: false,
						code: probe.code,
						error: probe.error,
						cached: false,
						...(lastGood === undefined
							? {}
							: { last: { windows: lastGood.windows, ...(lastGood.planName === undefined ? {} : { planName: lastGood.planName }), fetchedAt: lastGood.fetchedAt } })
					};
				})();
			if (probe.ok === true) {
				this.good.set(key, {
					windows: probe.windows,
					...(probe.planName === undefined ? {} : { planName: probe.planName }),
					fetchedAt: probe.fetchedAt
				});
			}
			this.last.set(key, result);
			return result;
		})().finally(() => {
			this.inFlight.delete(key);
		});
		this.inFlight.set(key, promise);
		return promise;
	}
}

/**
 * Read a bounded JSON request body.
 * @param {AsyncIterable<Uint8Array|string>} req
 * @param {number} [limit]
 * @returns {Promise<unknown>}
 */
export async function readJsonBody(req, limit = 64 * 1024) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		size += buffer.length;
		if (size > limit) throw new Error("request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim().length === 0) return {};
	return JSON.parse(text);
}

/**
 * @typedef {{ key: string, kind: "percent"|"amount", label?: string, usedPercent?: number, status?: string, resetsAt?: string, amount?: number, currency?: string, granted?: number, toppedUp?: number, used?: number, limit?: number }} WindowView
 * @typedef {{ ok: true, windows: WindowView[], planName?: string, partial?: boolean, fetchedAt: number }
 *   | { ok: false, code: "auth"|"http"|"timeout"|"network"|"shape"|"unavailable"|"cookie-shape", error: string }} PlanProbe
 * @typedef {{ ok: true, windows: WindowView[], planName?: string, partial?: boolean, fetchedAt: number, cached: boolean }
 *   | { ok: false, code: string, error: string, cached: boolean,
 *       last?: { windows: WindowView[], planName?: string, fetchedAt: number } }} ProbeResult
 */
