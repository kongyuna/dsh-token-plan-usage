// dsh-token-plan-usage — browser half.
//
// Hand-authored client bundle in the DSH module-loader factory format:
// `window.__ModuleLoader__.load({ id, factory })`. Only shell-externalized
// modules may be imported (react / react/jsx-runtime are in the static table);
// this plugin needs no react-dom because it renders through official slots:
//
//   sidebar.footer.action — one persistent two-half ring beside Settings
//   shell.overlay         — the usage card, frame-wide and outside the sidebar
//
// The visual language (ring geometry, three-column rows, inline theme-token
// styling, reset-time formatting) is adapted from the usage panel in
// kongyuna/kongyuna-opencode-go-plus (MIT). See THIRD_PARTY_NOTICES.md.
window.__ModuleLoader__.load({
	id: "dsh-token-plan-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const jsx = jsxRuntime.jsx;
		const jsxs = jsxRuntime.jsxs;
		const Fragment = jsxRuntime.Fragment;

		const NS = "dsh-token-plan-usage";
		const CARD_ID = "dsh-token-plan-usage-card";
		const USAGE_URL = "/dsh-token-plan-usage/usage";
		const COOKIE_URL = "/dsh-token-plan-usage/xiaomi-cookie";

		// ── dictionaries ──────────────────────────────────────────────────
		const zh = {
			title: "Token 用量",
			trigger: "Token 用量",
			triggerAria: "Token 用量：{summary}",
			loading: "正在读取用量…",
			unavailable: "暂不可用",
			noPlans: "没有可显示的 token plan",
			noPlansHint: "先在 DSH 凭据里配置 OPENCODE_GO_API_KEY / DEEPSEEK_API_KEY，或在插件配置里添加 plans。",
			noKey: "未配置凭据",
			noCookie: "需要控制台 Cookie",
			auth: "凭据无效",
			http: "上游暂不可用",
			network: "网络错误",
			timeout: "请求超时",
			shape: "响应格式不识别",
			unavailableAccount: "账号不可用",
			expired: "套餐已过期",
			cookieShape: "Cookie 格式不识别",
			partial: "部分数据不可用",
			stale: "上次读数",
			updatedAt: "更新于 {time}",
			refresh: "刷新",
			openConsole: "在控制台打开",
			setupCookie: "设置 Cookie",
			cookieHint: "粘贴 platform.xiaomimimo.com 的 Cookie 头（至少包含 api-platform_serviceToken 和 userId）。只保存在宿主凭据里。",
			cookiePlaceholder: "api-platform_serviceToken=…; userId=…",
			save: "保存",
			saving: "保存中…",
			cancel: "取消",
			cookieSaved: "Cookie 已保存",
			cookieFailed: "保存失败：{msg}",
			saveFailed: "保存失败",
			balance: "余额",
			credits: "Credits",
			rolling: "5 小时",
			weekly: "每周",
			monthly: "每月",
			shortRolling: "5h",
			shortWeekly: "周",
			grantedShort: "赠金 {amount}",
			toppedUpShort: "充值 {amount}",
			rateLimited: "已达限额",
			resetting: "即将重置",
			used: "已用 {percent}",
			percentAria: "已用 {percent}",
			rowAria: "{window}：已用 {percent}，{reset} 重置",
			rowAriaLimited: "{window}：已达限额",
			tip: "{plan} · {window} 已用 {percent}",
			tipPlain: "{window} 已用 {percent}"
		};
		const en = {
			title: "Token usage",
			trigger: "Token usage",
			triggerAria: "Token usage: {summary}",
			loading: "Reading usage…",
			unavailable: "Unavailable",
			noPlans: "No token plans to show",
			noPlansHint: "Store OPENCODE_GO_API_KEY / DEEPSEEK_API_KEY, or add plans in the plugin config.",
			noKey: "No credential configured",
			noCookie: "Console cookie required",
			auth: "Credential rejected",
			http: "Upstream unavailable",
			network: "Network error",
			timeout: "Request timed out",
			shape: "Unrecognized response",
			unavailableAccount: "Account unavailable",
			expired: "Plan expired",
			cookieShape: "Unrecognized cookie",
			partial: "Some data unavailable",
			stale: "last reading",
			updatedAt: "Updated {time}",
			refresh: "Refresh",
			openConsole: "Open in console",
			setupCookie: "Set cookie",
			cookieHint: "Paste the Cookie header from platform.xiaomimimo.com (api-platform_serviceToken and userId required). It is stored host-side only.",
			cookiePlaceholder: "api-platform_serviceToken=…; userId=…",
			save: "Save",
			saving: "Saving…",
			cancel: "Cancel",
			cookieSaved: "Cookie saved",
			cookieFailed: "Save failed: {msg}",
			saveFailed: "Save failed",
			balance: "Balance",
			credits: "Credits",
			rolling: "5 hours",
			weekly: "Weekly",
			monthly: "Monthly",
			shortRolling: "5h",
			shortWeekly: "wk",
			grantedShort: "Granted {amount}",
			toppedUpShort: "Topped up {amount}",
			rateLimited: "Limit reached",
			resetting: "Resetting",
			used: "{percent} used",
			percentAria: "{percent} used",
			rowAria: "{window}: {percent} used, resets {reset}",
			rowAriaLimited: "{window}: limit reached",
			tip: "{plan} · {window} {percent} used",
			tipPlain: "{window} {percent} used"
		};

		// ── formatting ───────────────────────────────────────────────────
		function clampPercent(value) {
			return Math.max(0, Math.min(100, value));
		}

		function formatPercent(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			return `${Math.round(clampPercent(value))}%`;
		}

		function localeOrUndefined(localeTag) {
			return typeof localeTag === "string" && localeTag.length > 0 ? localeTag : undefined;
		}

		/**
		 * The reset instant in the reader's own language: a clock time inside a
		 * day, a calendar date beyond it. `Intl` owns the format.
		 */
		function formatResetValue(resetsAt, now, localeTag, t) {
			const at = typeof resetsAt === "string" ? Date.parse(resetsAt) : NaN;
			if (!Number.isFinite(at)) return "—";
			const reference = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
			const delta = at - reference;
			if (delta <= 0) return t("resetting");
			const date = new Date(at);
			const options = delta < 24 * 3600 * 1000
				? { hour: "2-digit", minute: "2-digit" }
				: { month: "short", day: "numeric" };
			try {
				return new Intl.DateTimeFormat(localeOrUndefined(localeTag), options).format(date);
			} catch {
				return date.toLocaleString();
			}
		}

		function formatUpdatedAt(fetchedAt, localeTag) {
			if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return null;
			try {
				return new Intl.DateTimeFormat(localeOrUndefined(localeTag), { hour: "2-digit", minute: "2-digit" }).format(new Date(fetchedAt));
			} catch {
				return new Date(fetchedAt).toLocaleTimeString();
			}
		}

		function formatAmount(amount, currency, localeTag) {
			if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
			const code = typeof currency === "string" && currency.length > 0 ? currency.toUpperCase() : undefined;
			if (code !== undefined) {
				try {
					return new Intl.NumberFormat(localeOrUndefined(localeTag), { style: "currency", currency: code }).format(amount);
				} catch {
					// fall through to a plain number plus the currency code
				}
			}
			return `${formatNumber(amount, localeTag)}${code === undefined ? "" : ` ${code}`}`;
		}

		function formatNumber(value, localeTag) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			const compact = Math.abs(value) >= 10000;
			try {
				return new Intl.NumberFormat(localeOrUndefined(localeTag), compact
					? { notation: "compact", maximumFractionDigits: 1 }
					: { maximumFractionDigits: 0 }).format(value);
			} catch {
				return String(Math.round(value));
			}
		}

		function formatCreditRatio(used, limit, localeTag) {
			if (typeof used !== "number" || typeof limit !== "number") return undefined;
			return `${formatNumber(used, localeTag)} / ${formatNumber(limit, localeTag)}`;
		}

		function windowsOf(plan) {
			return plan !== null && typeof plan === "object" && Array.isArray(plan.windows)
				? plan.windows.filter((window) => window !== null && typeof window === "object" && !Array.isArray(window))
				: [];
		}

		/**
		 * The two arc readings across every plan: the most-used short window on
		 * top, the most-used long window on the bottom. Entries carry their plan
		 * so the hover tip can say which plan drives the reading.
		 */
		function summarize(plans) {
			const entries = [];
			for (const plan of Array.isArray(plans) ? plans : []) {
				for (const window of windowsOf(plan)) {
					if (typeof window.usedPercent === "number" && Number.isFinite(window.usedPercent)) {
						entries.push({ plan, window, percent: clampPercent(window.usedPercent) });
					}
				}
			}
			const shortKeys = new Set(["rolling", "5h", "session", "hourly"]);
			const longKeys = new Set(["weekly", "monthly"]);
			const pick = (keys) => {
				let best = null;
				for (const entry of entries) {
					if (!keys.has(entry.window.key)) continue;
					if (best === null || entry.percent > best.percent) best = entry;
				}
				return best;
			};
			const top = pick(shortKeys);
			const bottom = pick(longKeys);
			const exhausted = entries.some((entry) => entry.window.status === "rate-limited" || entry.window.status === "expired" || entry.percent >= 100);
			return {
				top: top === null ? 0 : top.percent,
				bottom: bottom === null ? 0 : bottom.percent,
				topEntry: top,
				bottomEntry: bottom,
				exhausted,
				hasPercent: entries.length > 0
			};
		}

		function summaryText(summary, t) {
			const parts = [];
			if (summary.topEntry !== null) parts.push(`${t("shortRolling")} ${formatPercent(summary.topEntry.percent)}`);
			if (summary.bottomEntry !== null) parts.push(`${t("shortWeekly")} ${formatPercent(summary.bottomEntry.percent)}`);
			return parts.length > 0 ? parts.join(" · ") : t("title");
		}

		function windowLabel(key, fallback, t) {
			switch (key) {
				case "rolling": return t("rolling");
				case "weekly": return t("weekly");
				case "monthly": return t("monthly");
				case "balance": return t("balance");
				default:
					if (typeof key === "string" && key.startsWith("balance-")) return t("balance");
					return typeof fallback === "string" && fallback.length > 0 ? fallback : String(key ?? t("title"));
			}
		}

		function statusKey(status) {
			switch (status) {
				case "no-key": return "noKey";
				case "no-cookie": return "noCookie";
				case "auth": return "auth";
				case "http": return "http";
				case "network": return "network";
				case "timeout": return "timeout";
				case "shape": return "shape";
				case "unavailable": return "unavailableAccount";
				case "expired": return "expired";
				case "cookie-shape": return "cookieShape";
				default: return "unavailable";
			}
		}

		function statusText(plan, t) {
			if (plan.status === "ok") return null;
			return t(statusKey(plan.status));
		}

		function setupErrorText(code, t) {
			switch (code) {
				case "auth": return t("auth");
				case "cookie-shape": return t("cookieShape");
				case "network": return t("network");
				case "timeout": return t("timeout");
				case "http": return t("http");
				case "store-failed": return t("saveFailed");
				default: return t("unavailable");
			}
		}

		/** Where the card goes: above the trigger, always inside the viewport. */
		function cardAnchor(ring, viewport, cardWidth = 300) {
			const width = typeof cardWidth === "number" && cardWidth > 0 ? cardWidth : 300;
			const center = (ring.left + ring.right) / 2;
			const left = Math.round(Math.max(8, Math.min(viewport.width - width - 8, center - width / 2)));
			const bottom = Math.round(Math.max(8, viewport.height - ring.top + 6));
			return { left, bottom };
		}

		function visiblePlans(plans) {
			if (!Array.isArray(plans)) return [];
			return plans.filter((plan) => plan !== null && typeof plan === "object" && (plan.status !== "no-key" || plan.source === "config"));
		}

		// ── styles ───────────────────────────────────────────────────────
		// Inline styles, not a stylesheet: the fork proved a missed <style>
		// injection can silently flatten this card in the shipped shell. Style
		// objects cannot be lost that way; colours are theme tokens so light and
		// dark both hold. Hover/focus are state-driven for the same reason.
		const COLOR = {
			primary: "var(--dsw-alias-label-primary, CanvasText)",
			secondary: "var(--dsw-alias-label-secondary, #8b8b8b)",
			error: "var(--dsw-alias-state-error-primary, #c95d5d)",
			border: "var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.28))",
			hover: "var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12))",
			brand: "var(--dsw-alias-brand-primary, #4d7cfe)",
			surface: "var(--dsw-menu-surface-fill, var(--dsw-alias-bg-overlay, #222))",
			backdrop: "var(--dsw-menu-backdrop-filter, blur(20px))",
			shadow: "var(--dsw-shadow-lv3, 0 10px 30px rgba(0, 0, 0, 0.32))"
		};

		const STYLE = {
			button: {
				position: "relative",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: 36,
				height: 36,
				padding: 0,
				border: 0,
				borderRadius: 8,
				background: "none",
				color: COLOR.secondary,
				cursor: "pointer"
			},
			buttonHover: { background: COLOR.hover, color: COLOR.primary },
			buttonFocus: { outline: `2px solid ${COLOR.brand}`, outlineOffset: -1 },
			buttonMuted: { opacity: 0.6 },
			card: {
				position: "fixed",
				zIndex: 2147483000,
				width: 300,
				maxWidth: "calc(100vw - 16px)",
				maxHeight: "calc(100vh - 24px)",
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
				borderRadius: "var(--dsw-radius-lg, 12px)",
				border: `.5px solid ${COLOR.border}`,
				boxShadow: COLOR.shadow,
				fontSize: 13,
				lineHeight: "20px",
				color: COLOR.primary,
				overflow: "hidden"
			},
			cardMaterial: {
				position: "absolute",
				inset: 0,
				zIndex: -1,
				borderRadius: "inherit",
				background: COLOR.surface,
				backdropFilter: COLOR.backdrop,
				pointerEvents: "none"
			},
			cardHead: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "8px 10px 6px",
				flex: "none"
			},
			cardTitle: {
				flex: "1 1 auto",
				minWidth: 0,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				fontSize: 12,
				lineHeight: "18px",
				color: COLOR.secondary
			},
			iconButton: {
				flex: "none",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: 24,
				height: 24,
				padding: 0,
				border: 0,
				borderRadius: 6,
				background: "none",
				color: COLOR.secondary,
				cursor: "pointer",
				fontSize: 14,
				lineHeight: "24px"
			},
			iconButtonHover: { background: COLOR.hover, color: COLOR.primary },
			body: {
				padding: "0 10px 4px",
				overflowY: "auto",
				overflowX: "hidden",
				flex: "1 1 auto"
			},
			section: {
				padding: "6px 0 4px"
			},
			sectionRule: {
				borderTop: `.5px solid ${COLOR.border}`,
				marginTop: 2
			},
			planHead: {
				display: "flex",
				alignItems: "baseline",
				gap: 6,
				minWidth: 0
			},
			planName: {
				minWidth: 0,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				fontSize: 13,
				fontWeight: 600,
				color: COLOR.primary
			},
			planMeta: {
				minWidth: 0,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				fontSize: 11,
				color: COLOR.secondary
			},
			console: {
				flex: "none",
				marginLeft: "auto",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: 22,
				height: 22,
				borderRadius: 5,
				color: COLOR.secondary,
				textDecoration: "none",
				fontSize: 13
			},
			statusLine: {
				padding: "2px 0",
				fontSize: 11,
				lineHeight: "16px",
				color: COLOR.secondary
			},
			statusError: { color: COLOR.error },
			grid: {
				display: "grid",
				gridTemplateColumns: "minmax(0, 1fr) auto auto",
				columnGap: 8,
				rowGap: 0,
				alignItems: "baseline"
			},
			cell: { padding: "3px 0" },
			label: {
				minWidth: 0,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				fontSize: 12,
				color: COLOR.primary
			},
			value: {
				fontSize: 12,
				fontWeight: 600,
				color: COLOR.primary,
				fontVariantNumeric: "tabular-nums",
				textAlign: "right",
				whiteSpace: "nowrap"
			},
			detail: {
				fontSize: 11,
				color: COLOR.secondary,
				fontVariantNumeric: "tabular-nums",
				textAlign: "right",
				whiteSpace: "nowrap"
			},
			detailLimited: { fontSize: 11, color: COLOR.secondary, whiteSpace: "nowrap" },
			foot: {
				flex: "none",
				padding: "6px 10px 8px",
				borderTop: `.5px solid ${COLOR.border}`,
				fontSize: 11,
				lineHeight: "16px",
				color: COLOR.secondary
			},
			footError: { color: COLOR.error },
			empty: {
				padding: "10px 2px 12px",
				display: "flex",
				flexDirection: "column",
				gap: 4
			},
			emptyTitle: { fontSize: 12, color: COLOR.primary },
			emptyHint: { fontSize: 11, lineHeight: "16px", color: COLOR.secondary },
			setupRow: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "4px 0"
			},
			setupHint: { flex: "1 1 auto", minWidth: 0, fontSize: 11, lineHeight: "16px", color: COLOR.secondary },
			setupButton: {
				flex: "none",
				height: 24,
				padding: "0 8px",
				border: `.5px solid ${COLOR.border}`,
				borderRadius: 6,
				background: "none",
				color: COLOR.primary,
				font: "inherit",
				fontSize: 11,
				cursor: "pointer"
			},
			setupForm: {
				display: "flex",
				flexDirection: "column",
				gap: 6,
				padding: "4px 0"
			},
			input: {
				width: "100%",
				boxSizing: "border-box",
				height: 28,
				padding: "0 8px",
				border: `.5px solid ${COLOR.border}`,
				borderRadius: 6,
				background: "var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.08))",
				color: COLOR.primary,
				font: "inherit",
				fontSize: 11
			},
			actions: { display: "flex", gap: 6, justifyContent: "flex-end" },
			action: {
				height: 26,
				padding: "0 10px",
				border: `.5px solid ${COLOR.border}`,
				borderRadius: 6,
				background: "none",
				color: COLOR.primary,
				font: "inherit",
				fontSize: 11,
				cursor: "pointer"
			},
			actionDisabled: { opacity: 0.5, cursor: "default" },
			tip: {
				position: "fixed",
				zIndex: 2147483001,
				maxWidth: 240,
				padding: "5px 8px",
				borderRadius: 7,
				fontSize: 11.5,
				lineHeight: 1.4,
				whiteSpace: "pre-line",
				pointerEvents: "none",
				color: COLOR.primary,
				background: COLOR.surface,
				backdropFilter: COLOR.backdrop,
				border: `.5px solid ${COLOR.border}`,
				boxShadow: "0 6px 20px rgba(0, 0, 0, 0.28)"
			}
		};

		// ── shared state ─────────────────────────────────────────────────
		function createStore() {
			let state = {
				status: "idle",
				plans: [],
				fetchedAt: null,
				refreshSeconds: 180,
				error: null,
				cached: false,
				loading: false,
				open: false,
				anchor: null,
				tip: null
			};
			const listeners = new Set();
			let inFlight = null;
			const emit = () => {
				for (const listener of listeners) listener();
			};
			const set = (patch) => {
				state = { ...state, ...patch };
				emit();
			};
			const fetchUsage = async (force) => {
				if (typeof fetch !== "function") throw new Error("fetch unavailable");
				const response = await fetch(`${USAGE_URL}${force ? "?refresh=1" : ""}`, {
					cache: "no-store",
					headers: { accept: "application/json" }
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const json = await response.json();
				if (json === null || typeof json !== "object" || !Array.isArray(json.plans)) {
					throw new Error("invalid usage response");
				}
				return json;
			};
			const read = ({ force = false } = {}) => {
				if (inFlight !== null) return inFlight;
				set({ loading: true });
				const promise = fetchUsage(force)
					.then((json) => {
						set({
							status: "ok",
							plans: json.plans,
							fetchedAt: typeof json.fetchedAt === "number" ? json.fetchedAt : Date.now(),
							refreshSeconds: typeof json.refreshSeconds === "number" ? json.refreshSeconds : state.refreshSeconds,
							error: null,
							cached: json.cached === true,
							loading: false
						});
						return json;
					})
					.catch((error) => {
						set({
							status: "error",
							error: String(error?.message ?? error),
							loading: false
						});
						return null;
					})
					.finally(() => {
						if (inFlight === promise) inFlight = null;
					});
				inFlight = promise;
				return promise;
			};
			const saveXiaomiCookie = async (cookie) => {
				if (typeof fetch !== "function") return { ok: false, code: "network" };
				try {
					const response = await fetch(COOKIE_URL, {
						method: "POST",
						headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({ cookie })
					});
					const json = await response.json().catch(() => null);
					if (json === null || typeof json !== "object") return { ok: false, code: "http" };
					if (json.ok === true) return { ok: true };
					return { ok: false, code: typeof json.code === "string" ? json.code : "error" };
				} catch {
					return { ok: false, code: "network" };
				}
			};
			return {
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				getSnapshot: () => state,
				read,
				saveXiaomiCookie,
				toggle(anchor) {
					if (state.open) {
						set({ open: false, anchor: null, tip: null });
						return;
					}
					set({ open: true, anchor, tip: null });
					void read({ force: true });
				},
				close() {
					if (state.open) set({ open: false, anchor: null, tip: null });
				},
				setTip(tip) {
					set({ tip });
				}
			};
		}

		// ── ring ─────────────────────────────────────────────────────────
		const RING = { size: 28, stroke: 3, hit: 11 };
		// 14° of air at each seam, round caps: two capsule arcs, not a broken circle.
		const RING_UP = "M3.7 11.6 A10.5 10.5 0 0 1 24.3 11.6";
		const RING_DOWN = "M24.3 16.4 A10.5 10.5 0 0 1 3.7 16.4";

		function PlanMark({ size = 12 }) {
			return jsx("svg", {
				viewBox: "0 0 16 16",
				width: size,
				height: size,
				"aria-hidden": "true",
				style: { display: "block" },
				children: jsxs(Fragment, {
					children: [
						jsx("circle", { cx: 8, cy: 8, r: 4.6, fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeOpacity: 0.7 }),
						jsx("circle", { cx: 8, cy: 8, r: 1.7, fill: "currentColor" })
					]
				})
			});
		}

		/**
		 * Two-half ring. Arc length is USED, not headroom: the card prints "used"
		 * percentages, so the ring and the numbers share one meaning.
		 */
		function UsageRing({ summary, muted, hovered, onHover, reduced }) {
			const half = (value, path, which) => {
				const clamped = typeof value === "number" && Number.isFinite(value) ? clampPercent(value) : 0;
				const active = hovered === which;
				return jsxs("g", {
					children: [
						jsx("path", {
							d: path,
							fill: "none",
							stroke: "currentColor",
							strokeOpacity: muted ? 0.24 : 0.16,
							strokeDasharray: muted ? "2 4" : undefined,
							strokeWidth: RING.stroke,
							strokeLinecap: "round"
						}),
						muted ? null : jsx("path", {
							d: path,
							fill: "none",
							pathLength: 100,
							strokeDasharray: `${clamped} 100`,
							stroke: "currentColor",
							strokeOpacity: 0.95,
							strokeWidth: active ? RING.stroke + 0.8 : RING.stroke,
							strokeLinecap: "round",
							style: { transition: reduced ? "none" : "stroke-width .12s ease" }
						}),
						muted ? null : jsx("path", {
							d: path,
							fill: "none",
							stroke: "transparent",
							strokeWidth: RING.hit,
							onMouseEnter: (event) => onHover(which, event.currentTarget.getBoundingClientRect()),
							onMouseLeave: () => onHover(null, undefined)
						})
					]
				}, which);
			};
			return jsxs("svg", {
				viewBox: `0 0 ${RING.size} ${RING.size}`,
				width: RING.size,
				height: RING.size,
				"aria-hidden": "true",
				"data-tpu": "ring",
				style: { overflow: "visible", display: "block" },
				children: [
					half(summary.top, RING_UP, "top"),
					half(summary.bottom, RING_DOWN, "bottom"),
					jsx("g", {
						transform: `translate(${(RING.size - 12) / 2} ${(RING.size - 12) / 2})`,
						children: jsx(PlanMark, { size: 12 })
					})
				]
			});
		}

		// ── footer action ────────────────────────────────────────────────
		function UsageFooterAction(props) {
			const { store, t } = props;
			const state = react.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
			const summary = summarize(state.plans);
			const [hover, setHover] = react.useState(false);
			const [focus, setFocus] = react.useState(false);
			const ref = react.useRef(null);
			const muted = !summary.hasPercent || summary.exhausted;
			const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
			const onHover = (which, rect) => {
				if (which === null || rect === undefined) {
					store.setTip(null);
					return;
				}
				const entry = which === "top" ? summary.topEntry : summary.bottomEntry;
				if (entry === null) return;
				const text = entry.plan === undefined
					? t("tipPlain", { window: windowLabel(entry.window.key, entry.window.label, t), percent: formatPercent(entry.percent) })
					: t("tip", { plan: entry.plan.label ?? entry.plan.id, window: windowLabel(entry.window.key, entry.window.label, t), percent: formatPercent(entry.percent) });
				store.setTip({
					arc: which,
					text,
					left: Math.max(8, Math.round(rect.left - 12)),
					bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 8))
				});
			};
			const activate = () => {
				const node = ref.current;
				if (node === null) return;
				const rect = node.getBoundingClientRect();
				store.toggle({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
			};
			const label = t("triggerAria", { summary: summaryText(summary, t) });
			const buttonStyle = {
				...STYLE.button,
				...(hover || state.open ? STYLE.buttonHover : {}),
				...(focus ? STYLE.buttonFocus : {}),
				...(muted ? STYLE.buttonMuted : {})
			};
			return jsx("button", {
				ref,
				type: "button",
				"data-tpu": "trigger",
				style: buttonStyle,
				"aria-label": label,
				"aria-expanded": state.open ? "true" : "false",
				"aria-controls": CARD_ID,
				title: label,
				onClick: (event) => {
					event.preventDefault();
					event.stopPropagation();
					activate();
				},
				onMouseEnter: () => setHover(true),
				onMouseLeave: () => setHover(false),
				onFocus: () => setFocus(true),
				onBlur: () => setFocus(false),
				children: jsx(UsageRing, {
					summary,
					muted,
					hovered: state.tip === null || state.tip === undefined ? null : state.tip.arc,
					onHover,
					reduced
				})
			});
		}

		// ── card ─────────────────────────────────────────────────────────
		function windowRow(plan, window, t, localeTag, now) {
			const label = windowLabel(window.key, window.label, t);
			if (window.kind === "amount") {
				const amount = formatAmount(window.amount, window.currency, localeTag);
				let detail = typeof window.currency === "string" ? window.currency : "";
				const granted = typeof window.granted === "number" ? t("grantedShort", { amount: formatAmount(window.granted, window.currency, localeTag) }) : null;
				const toppedUp = typeof window.toppedUp === "number" ? t("toppedUpShort", { amount: formatAmount(window.toppedUp, window.currency, localeTag) }) : null;
				if (granted !== null || toppedUp !== null) detail = [granted, toppedUp].filter(Boolean).join(" · ");
				return jsxs(Fragment, {
					children: [
						jsx("span", { role: "cell", style: { ...STYLE.cell, ...STYLE.label }, dir: "auto", title: label, children: label }),
						jsx("span", { role: "cell", style: { ...STYLE.cell, ...STYLE.value }, children: amount }),
						jsx("span", { role: "cell", style: { ...STYLE.cell, ...STYLE.detail }, title: detail, children: detail })
					]
				}, window.key);
			}
			const percent = typeof window.usedPercent === "number" ? formatPercent(window.usedPercent) : "—";
			const limited = window.status === "rate-limited" || window.status === "expired";
			const reset = limited ? t("rateLimited") : formatResetValue(window.resetsAt, now, localeTag, t);
			const resetTitle = typeof window.resetsAt === "string" ? new Date(window.resetsAt).toLocaleString(localeOrUndefined(localeTag)) : undefined;
			const ratio = formatCreditRatio(window.used, window.limit, localeTag);
			const nodes = [
				jsx("span", { role: "cell", style: { ...STYLE.cell, ...STYLE.label }, dir: "auto", title: label, children: label }, "label"),
				jsx("span", {
					role: "cell",
					"aria-label": limited ? t("rowAriaLimited", { window: label }) : t("percentAria", { percent }),
					style: { ...STYLE.cell, ...STYLE.value },
					children: percent
				}, "percent"),
				jsx("span", {
					role: "cell",
					style: { ...STYLE.cell, ...(limited ? STYLE.detailLimited : STYLE.detail) },
					title: resetTitle,
					children: reset
				}, "reset")
			];
			if (ratio !== undefined) {
				nodes.push(jsx("span", { role: "cell", style: { ...STYLE.cell, ...STYLE.label }, children: t("credits") }, "credits-label"));
				nodes.push(jsx("span", { role: "cell", style: { ...STYLE.cell, ...STYLE.detail }, children: ratio }, "credits-value"));
				nodes.push(jsx("span", { role: "cell", style: { ...STYLE.cell } }, "credits-empty"));
			}
			return jsx(Fragment, { children: nodes }, window.key);
		}

		function XiaomiSetup({ store, t }) {
			const [open, setOpen] = react.useState(false);
			const [value, setValue] = react.useState("");
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			const submit = async () => {
				if (busy || value.trim().length === 0) return;
				setBusy(true);
				setError(null);
				const result = await store.saveXiaomiCookie(value.trim());
				if (result.ok === true) {
					setBusy(false);
					setOpen(false);
					setValue("");
					void store.read({ force: true });
					return;
				}
				setBusy(false);
				setError(result.code);
			};
			if (!open) {
				return jsxs("div", {
					style: STYLE.setupRow,
					children: [
						jsx("span", { style: STYLE.setupHint, children: t("noCookie") }),
						jsx("button", {
							type: "button",
							style: STYLE.setupButton,
							onClick: () => setOpen(true),
							children: t("setupCookie")
						})
					]
				});
			}
			return jsxs("div", {
				style: STYLE.setupForm,
				children: [
					jsx("div", { style: STYLE.setupHint, children: t("cookieHint") }),
					jsx("input", {
						type: "password",
						value,
						placeholder: t("cookiePlaceholder"),
						autoComplete: "off",
						spellCheck: false,
						style: STYLE.input,
						onChange: (event) => setValue(event.target.value)
					}),
					error === null ? null : jsx("div", { style: { ...STYLE.statusLine, ...STYLE.statusError }, children: t("cookieFailed", { msg: setupErrorText(error, t) }) }),
					jsxs("div", {
						style: STYLE.actions,
						children: [
							jsx("button", {
								type: "button",
								style: { ...STYLE.action, ...(busy || value.trim().length === 0 ? STYLE.actionDisabled : {}) },
								disabled: busy || value.trim().length === 0,
								onClick: submit,
								children: busy ? t("saving") : t("save")
							}),
							jsx("button", {
								type: "button",
								style: STYLE.action,
								disabled: busy,
								onClick: () => {
									setOpen(false);
									setError(null);
									setValue("");
								},
								children: t("cancel")
							})
						]
					})
				]
			});
		}

		function PlanSection({ plan, t, localeTag, store, first }) {
			const status = statusText(plan, t);
			const direct = windowsOf(plan);
			const last = plan.last !== null && typeof plan.last === "object" && Array.isArray(plan.last.windows) ? plan.last.windows : [];
			const rows = direct.length > 0 ? direct : last;
			const stale = direct.length === 0 && last.length > 0;
			return jsxs("section", {
				style: { ...STYLE.section, ...(first ? {} : STYLE.sectionRule) },
				children: [
					jsxs("div", {
						style: STYLE.planHead,
						children: [
							jsx("span", { style: STYLE.planName, children: plan.label ?? plan.id }),
							typeof plan.planName === "string" && plan.planName.length > 0
								? jsx("span", { style: STYLE.planMeta, children: plan.planName })
								: null,
							typeof plan.consoleUrl === "string" && plan.consoleUrl.length > 0
								? jsx("a", {
									href: plan.consoleUrl,
									target: "_blank",
									rel: "noreferrer noopener",
									title: t("openConsole"),
									"aria-label": t("openConsole"),
									style: STYLE.console,
									children: "↗"
								})
								: null
						]
					}),
					status === null ? null : jsx("div", {
						style: { ...STYLE.statusLine, ...(plan.status === "auth" || plan.status === "cookie-shape" ? STYLE.statusError : {}) },
						children: stale ? `${status} · ${t("stale")}` : status
					}),
					plan.setup === "xiaomi-cookie" ? jsx(XiaomiSetup, { store, t }) : null,
					rows.length > 0
						? jsx("div", {
							role: "table",
							"aria-label": plan.label ?? plan.id,
							style: STYLE.grid,
							children: rows.map((window) => windowRow(plan, window, t, localeTag, Date.now()))
						})
						: null,
					plan.partial === true ? jsx("div", { style: STYLE.statusLine, children: t("partial") }) : null
				]
			});
		}

		function UsageCardLayer(props) {
			const { store, t, getLocale } = props;
			const state = react.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
			const localeTag = typeof getLocale === "function" ? getLocale() : undefined;
			react.useEffect(() => {
				if (!state.open) return undefined;
				const onKey = (event) => {
					if (event.key === "Escape") store.close();
				};
				const onDown = (event) => {
					const target = event.target instanceof Element ? event.target : null;
					if (target === null) return;
					if (target.closest('[data-tpu="card"]') !== null) return;
					if (target.closest('[data-tpu="trigger"]') !== null) return;
					store.close();
				};
				document.addEventListener("keydown", onKey, true);
				document.addEventListener("mousedown", onDown, true);
				return () => {
					document.removeEventListener("keydown", onKey, true);
					document.removeEventListener("mousedown", onDown, true);
				};
			}, [state.open, store]);
			const tip = state.tip;
			const tipNode = tip === null || tip === undefined ? null : jsx("div", {
				role: "tooltip",
				"data-tpu": "tip",
				style: { ...STYLE.tip, left: tip.left, bottom: tip.bottom },
				children: tip.text
			});
			if (!state.open) return tipNode;
			const plans = visiblePlans(state.plans);
			const anchor = state.anchor;
			const cardStyle = anchor === null
				? { ...STYLE.card, left: 12, bottom: 80 }
				: { ...STYLE.card, left: anchor.left, bottom: anchor.bottom };
			const updatedAt = formatUpdatedAt(state.fetchedAt, localeTag);
			const pieces = [];
			if (state.loading) pieces.push(t("loading"));
			if (updatedAt !== null) pieces.push(t("updatedAt", { time: updatedAt }));
			if (state.error !== null && plans.length > 0) pieces.push(t("unavailable"));
			const footText = pieces.length > 0 ? pieces.join(" · ") : null;
			return jsxs(Fragment, {
				children: [
					tipNode,
					jsxs("div", {
						id: CARD_ID,
						role: "group",
						"aria-label": t("title"),
						"data-tpu": "card",
						style: cardStyle,
						children: [
							jsx("div", { style: STYLE.cardMaterial, "aria-hidden": "true" }),
							jsxs("div", {
								style: STYLE.cardHead,
								children: [
									jsx("span", { style: STYLE.cardTitle, children: t("title") }),
									jsx("button", {
										type: "button",
										style: STYLE.iconButton,
										title: t("refresh"),
										"aria-label": t("refresh"),
										disabled: state.loading,
										onClick: () => void store.read({ force: true }),
										children: state.loading ? "…" : "↻"
									})
								]
							}),
							jsx("div", {
								style: STYLE.body,
								children: plans.length === 0
									? jsxs("div", {
										style: STYLE.empty,
										children: [
											jsx("div", { style: STYLE.emptyTitle, children: t("noPlans") }),
											jsx("div", { style: STYLE.emptyHint, children: t("noPlansHint") })
										]
									})
									: plans.map((plan, index) => jsx(PlanSection, {
										plan,
										t,
										localeTag,
										store,
										first: index === 0
									}, plan.id))
							}),
							footText === null ? null : jsx("div", {
								style: { ...STYLE.foot, ...(state.error !== null && plans.length === 0 ? STYLE.footError : {}) },
								"aria-live": "polite",
								children: footText
							})
						]
					})
				]
			});
		}

		// ── plugin entry ──────────────────────────────────────────────────
		const inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-token-plan-usage: dictionaries");
			const t = ctx.locale.bind(NS);
			const store = createStore();
			const getLocale = () => {
				try {
					const snapshot = ctx.locale.getLocale();
					return typeof snapshot?.active === "string" ? snapshot.active : undefined;
				} catch {
					return undefined;
				}
			};
			const injected = () => ({ store, t, getLocale });

			ctx.effect(() => ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: NS,
				order: 10,
				label: t("trigger"),
				locale: NS,
				inject: injected
			}, UsageFooterAction)), "dsh-token-plan-usage: sidebar trigger");

			ctx.effect(() => ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: `${NS}-card`,
				order: 30,
				locale: NS,
				inject: injected
			}, UsageCardLayer)), "dsh-token-plan-usage: usage card");

			ctx.effect(() => {
				let timer = null;
				let lastSeconds = null;
				const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
				const arm = () => {
					const seconds = Math.max(30, Number(store.getSnapshot().refreshSeconds) || 180);
					if (seconds === lastSeconds && timer !== null) return;
					lastSeconds = seconds;
					if (timer !== null) clearInterval(timer);
					timer = setInterval(() => {
						if (visible()) void store.read();
					}, seconds * 1000);
				};
				const unsubscribe = store.subscribe(arm);
				arm();
				const onVisible = () => {
					if (visible()) void store.read();
				};
				if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
				void store.read();
				return () => {
					unsubscribe();
					if (timer !== null) clearInterval(timer);
					if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
				};
			}, "dsh-token-plan-usage: polling");
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.dictionaries = { zh, en };
		// Pure formatting and summarization, exposed so tests can assert the
		// rendered contract without a DOM.
		exports.usageFormat = {
			clampPercent,
			formatPercent,
			formatResetValue,
			formatUpdatedAt,
			formatAmount,
			formatNumber,
			formatCreditRatio,
			summarize,
			summaryText,
			windowLabel,
			statusText,
			cardAnchor,
			visiblePlans
		};
		exports.usageFooterAction = UsageFooterAction;
		exports.usageCardLayer = UsageCardLayer;
		exports.planSection = PlanSection;
		exports.createStore = createStore;
		return module.exports;
	}
});
