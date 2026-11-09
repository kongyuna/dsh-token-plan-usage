// dsh-token-plan-usage — browser half.
//
// Hand-authored client bundle in the DSH module-loader factory format:
// `window.__ModuleLoader__.load({ id, factory })`. Only shell-externalized
// modules may be imported (react / react/jsx-runtime are in the static table);
// this plugin needs no react-dom because it renders through one official slot:
//
//   shell.overlay — the account-row ring AND the usage card, frame-wide and
//                   outside the sidebar. The ring is measured against the
//                   account row and positioned over its right edge; rendering
//                   it in the overlay keeps fixed positioning out of any
//                   transformed sidebar ancestor and avoids DOM injection.
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
		const CONFIG_URL = "/dsh-token-plan-usage/config";
		const COOKIE_URL = "/dsh-token-plan-usage/xiaomi-cookie";

		// ── dictionaries ──────────────────────────────────────────────────
		const zh = {
			title: "Token 用量",
			trigger: "Token 用量",
			triggerAria: "Token 用量：{summary}",
			loading: "正在读取用量…",
			unavailable: "暂不可用",
			noPlans: "没有可显示的 token plan",
			noPlansHint: "只显示 DSH 模型里已有的套餐。先在 设置 → 模型 里启用对应服务，并配好凭据。",
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
			signedOut: "未登录 DeepSeek 账号",
			accountError: "账号余额读取失败",
			apiKeyHint: "在 设置 → 模型 → DeepSeek 检查 API Key 后刷新。",
			accountSignInHint: "在 设置 → 账号 登录 DeepSeek 后刷新。",
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
			remainingValue: "剩余 {percent}",
			percentAria: "剩余 {percent}",
			rowAria: "{window}：剩余 {percent}，{reset} 重置",
			rowAriaLimited: "{window}：已达限额",
			tip: "{plan} · {window} 剩余 {percent}",
			tipPlain: "{window} 剩余 {percent}",
			tipPlain: "{window} 剩余 {percent}",
			"config.title": "显示内容",
			"config.desc": "卡片显示勾选的套餐；圆环单独设置。",
			"config.plan": "套餐",
			"config.plans": "显示套餐（多选）",
			"config.icon": "侧栏圆环显示",
			"config.iconHint": "圆环只能显示一个套餐；卡片会显示下面勾选的所有套餐。",
			"config.metrics": "显示指标（按顺序）",
			"config.metricsFor": "指标（按顺序）",
			"config.selectPlan": "显示套餐",
			"config.ring": "圆环显示（单独设置）",
			"config.ringTop": "上半",
			"config.ringBottom": "下半",
			"config.ringNone": "不显示",
			"config.ringHint": "下半选「不显示」= 单指标；余额可填满额显示比例。",
			"config.preview": "示例效果",
			"config.previewLoading": "正在读取示例数据…",
			"config.previewUnavailable": "暂无示例数据",
			"config.capacity": "满额",
			"config.capacityPlaceholder": "如 100",
			"config.capacityHint": "填了满额，圆环按 余额/满额 显示比例；留空只显示金额。",
			"config.removePlan": "移除套餐",
			"config.atLeastOnePlan": "至少选择一个套餐",
			"config.available": "可添加指标",
			"config.add": "添加",
			"config.remove": "移除",
			"config.up": "上移",
			"config.down": "下移",
			"config.save": "保存",
			"config.saving": "保存中…",
			"config.saved": "已保存",
			"config.failed": "保存失败：{msg}",
			"config.loading": "读取配置…",
			"config.empty": "当前 DSH 模型里没有可显示的套餐。先在 设置 → 模型 里启用一个服务。",
			"config.needOne": "至少选择一个指标",
			"config.retry": "重试",
			"config.onePlan": "圆环只显示一个套餐",
			"config.ringOrder": "环：上弧=第 1 个，下弧=第 2 个"
		};
		const en = {
			title: "Token usage",
			trigger: "Token usage",
			triggerAria: "Token usage: {summary}",
			loading: "Reading usage…",
			unavailable: "Unavailable",
			noPlans: "No token plans to show",
			noPlansHint: "Only plans whose service is registered in DSH models are shown. Enable it under Settings → Models and store its credential.",
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
			signedOut: "Not signed in to DeepSeek",
			accountError: "Account balance unavailable",
			apiKeyHint: "Check the DeepSeek API key under Settings → Models, then refresh.",
			accountSignInHint: "Sign in to DeepSeek under Settings → Account, then refresh.",
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
			remainingValue: "{percent} left",
			percentAria: "{percent} left",
			rowAria: "{window}: {percent} left, resets {reset}",
			rowAriaLimited: "{window}: limit reached",
			tip: "{plan} · {window} {percent} left",
			tipPlain: "{window} {percent} left",
			tipPlain: "{window} {percent} left",
			"config.title": "Display",
			"config.desc": "Card plans and the ring are configured separately.",
			"config.plan": "Plan",
			"config.plans": "Plans to show (multi-select)",
			"config.icon": "Sidebar ring shows",
			"config.iconHint": "The ring shows one plan; the card shows every checked plan.",
			"config.metrics": "Metrics (in order)",
			"config.metricsFor": "Metrics (in order)",
			"config.selectPlan": "Plans",
			"config.ring": "Ring (configured separately)",
			"config.ringTop": "Top",
			"config.ringBottom": "Bottom",
			"config.ringNone": "Not shown",
			"config.ringHint": "Lower half Not shown = single metric; a balance can use a full amount for a ratio.",
			"config.preview": "Preview",
			"config.previewLoading": "Loading preview…",
			"config.previewUnavailable": "No preview data",
			"config.capacity": "Full amount",
			"config.capacityPlaceholder": "e.g. 100",
			"config.capacityHint": "With a full amount, the ring shows balance / full; leave blank for amount only.",
			"config.removePlan": "Remove plan",
			"config.atLeastOnePlan": "Choose at least one plan",
			"config.available": "Add more metrics",
			"config.add": "Add",
			"config.remove": "Remove",
			"config.up": "Move up",
			"config.down": "Move down",
			"config.save": "Save",
			"config.saving": "Saving…",
			"config.saved": "Saved",
			"config.failed": "Save failed: {msg}",
			"config.loading": "Reading configuration…",
			"config.empty": "No plan is available in DSH models. Enable a service under Settings → Models first.",
			"config.needOne": "Choose at least one metric",
			"config.retry": "Retry",
			"config.onePlan": "The ring shows one plan",
			"config.ringOrder": "Ring: top arc = metric 1, bottom arc = metric 2"
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
		 * Resolve the independent ring selection against the probed plan views.
		 * A slot is `{ planId, metric }`; slots may reference a plan that is not
		 * shown in the card, so ring and card configuration stay independent.
		 */
		function ringEntries(plans, ring) {
			const byId = new Map((Array.isArray(plans) ? plans : []).filter((plan) => plan !== null && typeof plan === "object").map((plan) => [plan.id, plan]));
			const slots = Array.isArray(ring) ? ring : [];
			return slots.map((slot) => {
				if (slot === null || typeof slot !== "object") return undefined;
				const plan = byId.get(slot.planId);
				if (plan === undefined) return undefined;
				const window = windowsOf(plan).find((item) => item.key === slot.metric);
				return window === undefined ? undefined : { plan, window, slot };
			}).filter((entry) => entry !== undefined);
		}

		/**
		 * The two ring halves follow the independent ring selection: slot 0 is the
		 * top arc, slot 1 the bottom arc. A percent slot draws remaining headroom;
		 * an amount slot (balance) has no arc and is shown by the center glyph.
		 */
		function summarize(plans, ring) {
			const allPlans = Array.isArray(plans) ? plans : [];
			const slots = Array.isArray(ring)
				? ring
				: (allPlans[0] === undefined
					? []
					: windowsOf(allPlans[0]).slice(0, 2).map((window) => ({ planId: allPlans[0].id, metric: window.key })));
			const entries = ringEntries(allPlans, slots).map(({ plan, window, slot }) => {
				if (typeof window.usedPercent === "number" && Number.isFinite(window.usedPercent)) {
					const used = clampPercent(window.usedPercent);
					return { plan, window, kind: "percent", used, remaining: clampPercent(100 - used) };
				}
				if (window.kind !== "amount") return undefined;
				const capacity = typeof slot.capacity === "number" && Number.isFinite(slot.capacity) && slot.capacity > 0 ? slot.capacity : undefined;
				const amount = typeof window.amount === "number" && Number.isFinite(window.amount) ? window.amount : undefined;
				/** @type {{ plan: any, window: any, kind: "amount", capacity?: number, remaining?: number }} */
				const entry = { plan, window, kind: "amount" };
				if (capacity !== undefined) entry.capacity = capacity;
				if (capacity !== undefined && amount !== undefined) entry.remaining = clampPercent((amount / capacity) * 100);
				return entry;
			}).filter((entry) => entry !== undefined);
			const top = entries[0] ?? null;
			const bottom = entries[1] ?? null;
			const exhausted = entries.some((entry) => entry.kind === "percent" && (entry.window.status === "rate-limited" || entry.window.status === "expired" || entry.used >= 100));
			const hasArc = (entry) => entry !== null && (entry.kind === "percent" || (entry.kind === "amount" && typeof entry.remaining === "number"));
			return {
				top: hasArc(top) ? top.remaining : 0,
				bottom: hasArc(bottom) ? bottom.remaining : 0,
				topEntry: top,
				bottomEntry: bottom,
				exhausted,
				hasPercent: entries.some((entry) => entry.kind === "percent"),
				hasArc: hasArc(top) || hasArc(bottom),
				hasAmount: entries.some((entry) => entry.kind === "amount")
			};
		}

		function shortWindowLabel(key, t) {
			if (key === "rolling") return t("shortRolling");
			if (key === "weekly") return t("shortWeekly");
			return windowLabel(key, undefined, t);
		}

		function summaryText(summary, t) {
			const parts = [];
			for (const entry of [summary.topEntry, summary.bottomEntry]) {
				if (entry === null || entry === undefined) continue;
				const planName = entry.plan.label ?? entry.plan.id;
				const label = shortWindowLabel(entry.window.key, t);
				if (entry.kind === "amount") {
					const amount = formatAmount(entry.window.amount, entry.window.currency);
					if (typeof entry.capacity === "number" && typeof entry.remaining === "number") {
						parts.push(`${planName} ${label} ${amount} / ${formatAmount(entry.capacity, entry.window.currency)} (${formatPercent(entry.remaining)})`);
					} else {
						parts.push(`${planName} ${label} ${amount}`);
					}
				} else {
					parts.push(`${planName} ${label} ${formatPercent(entry.remaining)}`);
				}
			}
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
				case "signed-out": return "signedOut";
				case "account-error": return "accountError";
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

		/**
		 * Card plans are the user's multi-selection from the display config; the
		 * ring may probe extra plans, so filter those out here and apply the saved
		 * per-plan metric order.
		 */
		function cardPlans(plans, display) {
			const all = Array.isArray(plans) ? plans : [];
			if (display === null || typeof display !== "object" || !Array.isArray(display.plans)) return visiblePlans(all);
			return display.plans
				.map((entry) => {
					const id = typeof entry === "string" ? entry : entry.id;
					const plan = all.find((candidate) => candidate !== null && typeof candidate === "object" && candidate.id === id);
					return plan === undefined ? undefined : plan;
				})
				.filter((plan) => plan !== undefined);
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
			surface: "var(--dsw-specific-menu, var(--dsw-alias-bg-overlay, #222))",
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
				cursor: "pointer",
				pointerEvents: "auto"
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
				overflow: "hidden",
				pointerEvents: "auto"
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


		const CONFIG_STYLE = {
			layout: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
				gap: 12,
				alignItems: "start"
			},
			previewCard: {
				display: "flex",
				flexDirection: "column",
				gap: 10,
				padding: 12,
				border: `.5px solid ${COLOR.border}`,
				borderRadius: "var(--dsw-radius-lg, 12px)",
				background: "var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.04))",
				color: COLOR.primary,
				fontSize: 12,
				lineHeight: "18px"
			},
			previewRing: {
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "6px 0 10px"
			},
			previewPlans: {
				display: "flex",
				flexDirection: "column",
				gap: 8
			},
			previewPlan: {
				padding: "2px 8px 4px",
				border: `.5px solid ${COLOR.border}`,
				borderRadius: 8
			},
			capacityRow: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				flexWrap: "wrap"
			},
			card: {
				display: "flex",
				flexDirection: "column",
				gap: 10,
				padding: 12,
				border: `.5px solid ${COLOR.border}`,
				borderRadius: "var(--dsw-radius-lg, 12px)",
				background: "var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.04))",
				color: COLOR.primary,
				fontSize: 12,
				lineHeight: "18px"
			},
			title: { fontSize: 13, fontWeight: 600 },
			desc: { fontSize: 11, lineHeight: "16px", color: COLOR.secondary },
			row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
			label: { fontSize: 11, color: COLOR.secondary },
			select: {
				height: 30,
				minWidth: 170,
				padding: "0 8px",
				border: `.5px solid ${COLOR.border}`,
				borderRadius: 6,
				background: "var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.08))",
				color: COLOR.primary,
				font: "inherit",
				fontSize: 12
			},
			list: { display: "flex", flexDirection: "column", gap: 4 },
			planCard: {
				display: "flex",
				flexDirection: "column",
				gap: 6,
				padding: 8,
				border: `.5px solid ${COLOR.border}`,
				borderRadius: 8
			},
			planHead: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				fontSize: 12,
				fontWeight: 600,
				cursor: "pointer"
			},
			metric: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				padding: "4px 6px",
				border: `.5px solid ${COLOR.border}`,
				borderRadius: 6
			},
			metricName: {
				flex: "1 1 auto",
				minWidth: 0,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				fontSize: 12
			},
			smallButton: {
				width: 24,
				height: 24,
				padding: 0,
				border: 0,
				borderRadius: 6,
				background: "none",
				color: COLOR.secondary,
				cursor: "pointer",
				font: "inherit",
				fontSize: 13
			},
			addRow: { display: "flex", flexWrap: "wrap", gap: 6 },
			addButton: {
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
			footer: { display: "flex", alignItems: "center", gap: 8 },
			primaryButton: {
				height: 28,
				minWidth: 64,
				padding: "0 12px",
				border: `.5px solid ${COLOR.border}`,
				borderRadius: 6,
				background: "var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.16))",
				color: COLOR.primary,
				font: "inherit",
				fontSize: 12,
				fontWeight: 500,
				cursor: "pointer"
			},
			primaryDisabled: { opacity: 0.5, cursor: "default" },
			feedbackOk: { fontSize: 11, color: "var(--dsw-alias-state-success-primary, #3fa463)" },
			feedbackError: { fontSize: 11, color: COLOR.error },
			empty: { fontSize: 11, lineHeight: "16px", color: COLOR.secondary }
		};

		// ── shared state ─────────────────────────────────────────────────
		function createStore() {
			let state = {
				status: "idle",
				plans: [],
				fetchedAt: null,
				refreshSeconds: 180,
				display: null,
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
							display: json.display !== null && typeof json.display === "object" ? json.display : null,
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
		// Both arcs start at their LEFT seam and grow to the right, so a reading
		// always starts where a progress bar starts.
		const RING_UP = "M3.9 11.5 A10.5 10.5 0 0 1 24.1 11.5";
		const RING_DOWN = "M3.9 16.5 A10.5 10.5 0 0 0 24.1 16.5";

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
		 * Two-half ring. Arc length is REMAINING headroom: the card prints
		 * remaining percentages, so the ring and the numbers share one meaning.
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
			const amountEntry = summary.topEntry?.kind === "amount"
				? summary.topEntry
				: summary.bottomEntry?.kind === "amount"
					? summary.bottomEntry
					: null;
			const amountSymbol = amountEntry === null
				? null
				: amountEntry.window.currency === "USD"
					? "$"
					: amountEntry.window.currency === "CNY"
						? "¥"
						: (typeof amountEntry.window.currency === "string" && amountEntry.window.currency.length > 0 ? amountEntry.window.currency[0] : "¤");
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
					amountSymbol === null
						? jsx("g", {
							transform: `translate(${(RING.size - 12) / 2} ${(RING.size - 12) / 2})`,
							children: jsx(PlanMark, { size: 12 })
						})
						: jsx("text", {
							x: RING.size / 2,
							y: RING.size / 2 + 2,
							textAnchor: "middle",
							fontSize: 9,
							fontWeight: 600,
							fill: "currentColor",
							children: amountSymbol
						})
				]
			});
		}

		// ── footer action ────────────────────────────────────────────────
		// The official `sidebar.footer.action` row sits BELOW the account row, so
		// a control rendered there appears next to Remote/Settings instead of the
		// account name. We render the ring through that row (no second React root,
		// no menu injection) but measure the account row and position the button
		// over its right edge with `position: fixed`. If a transformed/filtered
		// ancestor turns fixed into ancestor-relative positioning, the verification
		// effect falls back to the in-flow footer seat rather than misplacing it.
		function findAccountTrigger() {
			if (typeof document === "undefined" || typeof window === "undefined") return null;
			for (const element of document.querySelectorAll('button[aria-haspopup="menu"][data-collapsed]')) {
				const rect = element.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) continue;
				if (rect.left < window.innerWidth * 0.45 && rect.top > window.innerHeight * 0.55) return element;
			}
			return null;
		}

		function findAccountRow(trigger) {
			let node = trigger.parentElement;
			while (node !== null && node !== document.body) {
				const rect = node.getBoundingClientRect();
				if (rect.width >= 140 && rect.height >= 20 && rect.height <= 96) return node;
				node = node.parentElement;
			}
			return trigger.parentElement;
		}

		function measureAccountPlacement() {
			if (typeof document === "undefined" || typeof window === "undefined") return null;
			const trigger = findAccountTrigger();
			const row = trigger === null ? null : findAccountRow(trigger);
			if (row === null) {
				// The account selectors are the only structural assumption in this
				// plugin. If a shell change removes them, keep the ring reachable in
				// the sidebar's bottom-left corner instead of losing it entirely.
				return { left: 12, bottom: 56, fallback: true };
			}
			const rect = row.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return { left: 12, bottom: 56, fallback: true };
			if (rect.width < 72) return { hidden: true };
			return {
				right: Math.max(8, Math.round(window.innerWidth - rect.right + 12)),
				top: Math.round(rect.top + rect.height / 2 - 18)
			};
		}

		function UsageFooterAction(props) {
			const { store, t } = props;
			const state = react.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
			const summary = summarize(state.plans, state.display !== null && typeof state.display === "object" ? state.display.ring : undefined);
			const [hover, setHover] = react.useState(false);
			const [focus, setFocus] = react.useState(false);
			const [placement, setPlacement] = react.useState(null);
			const [fixedOkay, setFixedOkay] = react.useState(true);
			const ref = react.useRef(null);
			const muted = !summary.hasArc || summary.exhausted;
			const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

			react.useEffect(() => {
				if (typeof document === "undefined" || typeof window === "undefined") return undefined;
				let scheduled = false;
				const run = () => {
					scheduled = false;
					setPlacement(measureAccountPlacement());
				};
				const schedule = () => {
					if (scheduled) return;
					scheduled = true;
					if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
					else setTimeout(run, 16);
				};
				run();
				const observer = typeof MutationObserver === "function" && document.body !== null
					? new MutationObserver(schedule)
					: null;
				if (observer !== null) {
					observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded", "class"] });
				}
				window.addEventListener("resize", schedule);
				return () => {
					if (observer !== null) observer.disconnect();
					window.removeEventListener("resize", schedule);
				};
			}, []);

			react.useEffect(() => {
				if (placement === null || placement.hidden === true || placement.fallback === true || typeof window === "undefined") return;
				const node = ref.current;
				if (node === null) return;
				const rect = node.getBoundingClientRect();
				const expectedRight = window.innerWidth - placement.right;
				if (Math.abs(rect.right - expectedRight) > 8 || Math.abs(rect.top - placement.top) > 8) {
					setFixedOkay(false);
				}
			}, [placement]);

			const onHover = (which, rect) => {
				if (which === null || rect === undefined) {
					store.setTip(null);
					return;
				}
				const entry = which === "top" ? summary.topEntry : summary.bottomEntry;
				if (entry === null) return;
				const windowName = windowLabel(entry.window.key, entry.window.label, t);
				const text = entry.kind === "amount"
					? `${entry.plan.label ?? entry.plan.id} · ${windowName} ${formatAmount(entry.window.amount, entry.window.currency)}${typeof entry.capacity === "number" && typeof entry.remaining === "number" ? ` / ${formatAmount(entry.capacity, entry.window.currency)} (${formatPercent(entry.remaining)})` : ""}`
					: entry.plan === undefined
						? t("tipPlain", { window: windowName, percent: formatPercent(entry.remaining) })
						: t("tip", { plan: entry.plan.label ?? entry.plan.id, window: windowName, percent: formatPercent(entry.remaining) });
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
				// The card is positioned with a *bottom offset*, not the trigger's
				// viewport bottom: `bottom: rect.bottom` puts a 300px card above the
				// top edge. cardAnchor() clamps left and computes the offset.
				store.toggle(cardAnchor(rect, { width: window.innerWidth, height: window.innerHeight }));
			};
			const label = summary.hasPercent || summary.hasAmount ? t("triggerAria", { summary: summaryText(summary, t) }) : t("trigger");
			const anchored = placement !== null && placement.hidden !== true && placement.fallback !== true;
			const corner = placement !== null && placement.fallback === true;
			const fixed = fixedOkay && anchored;
			const absoluteFallback = fixedOkay === false && anchored && typeof window !== "undefined";
			const buttonStyle = {
				...STYLE.button,
				...(fixed ? { position: "fixed", right: placement.right, top: placement.top, zIndex: 5 } : {}),
				...(absoluteFallback ? { position: "absolute", left: Math.round(window.innerWidth - placement.right - 36), top: placement.top, zIndex: 5 } : {}),
				...(corner ? { position: "fixed", left: placement.left, bottom: placement.bottom, zIndex: 5 } : {}),
				...(hover || state.open ? STYLE.buttonHover : {}),
				...(focus ? STYLE.buttonFocus : {}),
				...(muted ? STYLE.buttonMuted : {}),
				...(placement === null ? { visibility: "hidden" } : {}),
				...(placement !== null && placement.hidden === true ? { display: "none" } : {})
			};
			return jsx("button", {
				ref,
				type: "button",
				"data-tpu": "trigger",
				"data-placement": fixed ? "account-row" : absoluteFallback ? "account-row-absolute" : corner ? "fallback-corner" : placement !== null && placement.hidden === true ? "hidden" : "footer",
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
			const limited = window.status === "rate-limited";
			const expired = window.status === "expired";
			const remaining = limited || expired
				? 0
				: typeof window.usedPercent === "number"
					? clampPercent(100 - clampPercent(window.usedPercent))
					: undefined;
			const percent = remaining === undefined ? "—" : t("remainingValue", { percent: formatPercent(remaining) });
			const reset = limited ? t("rateLimited") : expired ? t("expired") : formatResetValue(window.resetsAt, now, localeTag, t);
			const resetTitle = typeof window.resetsAt === "string" ? new Date(window.resetsAt).toLocaleString(localeOrUndefined(localeTag)) : undefined;
			const ratio = formatCreditRatio(window.used, window.limit, localeTag);
			const nodes = [
				jsx("span", { role: "cell", style: { ...STYLE.cell, ...STYLE.label }, dir: "auto", title: label, children: label }, "label"),
				jsx("span", {
					role: "cell",
					"aria-label": limited ? t("rowAriaLimited", { window: label }) : t("percentAria", { percent: formatPercent(remaining) }),
					style: { ...STYLE.cell, ...STYLE.value },
					children: percent
				}, "percent"),
				jsx("span", {
					role: "cell",
					style: { ...STYLE.cell, ...(limited || expired ? STYLE.detailLimited : STYLE.detail) },
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

		function DisplayConfigCard(props) {
			const { t, store } = props;
			// `initialData` / `initialPreview` are internal test seams; production
			// always loads from the host routes.
			const initialData = props !== null && typeof props === "object" && props.initialData !== undefined
				? props.initialData
				: null;
			const initialPreview = props !== null && typeof props === "object" && props.initialPreview !== undefined
				? props.initialPreview
				: null;
			const [data, setData] = react.useState(initialData ?? {
				status: "loading",
				error: null,
				plans: [],
				selectedPlans: [],
				ring: []
			});
			const [preview, setPreview] = react.useState(initialPreview ?? { status: "loading", plans: [] });
			const [saving, setSaving] = react.useState(false);
			const [feedback, setFeedback] = react.useState(null);

			const load = () => {
				setData((current) => ({ ...current, status: "loading", error: null }));
				if (typeof fetch !== "function") {
					setData({ status: "error", error: "fetch unavailable", plans: [], selectedPlans: [], ring: [] });
					return;
				}
				fetch(CONFIG_URL, { cache: "no-store", headers: { accept: "application/json" } })
					.then((response) => response.json())
					.then((json) => {
						if (json === null || typeof json !== "object" || json.ok !== true) {
							setData({ status: "error", error: "unavailable", plans: [], selectedPlans: [], ring: [] });
							return;
						}
						const plans = Array.isArray(json.plans) ? json.plans : [];
						const selected = json.selected !== null && typeof json.selected === "object" ? json.selected : {};
						const rawPlans = Array.isArray(selected.plans) ? selected.plans : [];
						const selectedPlans = rawPlans
							.map((entry) => typeof entry === "string" ? entry : entry?.id)
							.filter((id) => typeof id === "string" && plans.some((plan) => plan.id === id));
						const uniquePlans = selectedPlans.filter((id, index) => selectedPlans.indexOf(id) === index);
						const rawRing = Array.isArray(selected.ring) ? selected.ring : [];
						const ring = [];
						for (const slot of rawRing) {
							if (slot === null || typeof slot !== "object") continue;
							const plan = plans.find((candidate) => candidate.id === slot.planId);
							if (plan === undefined || !Array.isArray(plan.metrics) || !plan.metrics.includes(slot.metric)) continue;
							/** @type {{ planId: string, metric: string, capacity?: number }} */
							const item = { planId: plan.id, metric: slot.metric };
							if (typeof slot.capacity === "number" && Number.isFinite(slot.capacity) && slot.capacity > 0) item.capacity = slot.capacity;
							if (ring.some((existing) => existing.planId === item.planId && existing.metric === item.metric)) continue;
							ring.push(item);
							if (ring.length === 2) break;
						}
						if (uniquePlans.length === 0 && plans.length > 0) uniquePlans.push(plans[0].id);
						if (ring.length === 0 && plans.length > 0) {
							const first = plans.find((plan) => plan.id === uniquePlans[0]) ?? plans[0];
							for (const metric of (Array.isArray(first.metrics) ? first.metrics : []).slice(0, 2)) {
								ring.push({ planId: first.id, metric });
							}
						}
						setData({ status: "ready", error: null, plans, selectedPlans: uniquePlans, ring });
					})
					.catch((error) => {
						setData({ status: "error", error: String(error?.message ?? error), plans: [], selectedPlans: [], ring: [] });
					});
				fetch(`${USAGE_URL}?refresh=1`, { cache: "no-store", headers: { accept: "application/json" } })
					.then((response) => response.json())
					.then((json) => {
						const plans = json !== null && typeof json === "object" && Array.isArray(json.plans) ? json.plans : [];
						setPreview({ status: plans.length > 0 ? "ready" : "empty", plans });
					})
					.catch(() => setPreview({ status: "error", plans: [] }));
			};

			react.useEffect(() => {
				if (initialData === null) load();
			}, []);

			const togglePlan = (id, checked) => {
				setData((current) => {
					const selectedPlans = checked
						? (current.selectedPlans.includes(id) ? current.selectedPlans : [...current.selectedPlans, id])
						: current.selectedPlans.filter((item) => item !== id);
					return { ...current, selectedPlans };
				});
				setFeedback(null);
			};
			const metricOptions = data.plans.flatMap((plan) => (Array.isArray(plan.metrics) ? plan.metrics : []).map((metric) => ({
				planId: plan.id,
				metric,
				label: `${plan.label ?? plan.id} · ${windowLabel(metric, undefined, t)}`
			})));
			const encodeRing = (slot) => slot === null || slot === undefined ? "" : `${slot.planId}::${slot.metric}`;
			const slotIsAmount = (slot) => slot !== null && slot !== undefined && slot.metric === "balance";
			const setRingSlot = (index, value) => {
				setData((current) => {
					const ring = Array.isArray(current.ring) ? current.ring.map((slot) => ({ ...slot })) : [];
					if (value === "") {
						ring.splice(index, 1);
					} else {
						const separator = value.indexOf("::");
						if (separator <= 0) return current;
						const slot = { planId: value.slice(0, separator), metric: value.slice(separator + 2) };
						if (!metricOptions.some((option) => option.planId === slot.planId && option.metric === slot.metric)) return current;
						const previous = ring[index];
						if (previous !== undefined && previous.planId === slot.planId && previous.metric === slot.metric && typeof previous.capacity === "number") {
							slot.capacity = previous.capacity;
						}
						ring[index] = slot;
					}
					const unique = [];
					for (const slot of ring) {
						if (slot === null || typeof slot !== "object") continue;
						if (unique.some((item) => item.planId === slot.planId && item.metric === slot.metric)) continue;
						unique.push(slot);
					}
					return { ...current, ring: unique.slice(0, 2) };
				});
				setFeedback(null);
			};
			const setCapacity = (index, value) => {
				setData((current) => {
					const ring = current.ring.map((slot) => ({ ...slot }));
					const slot = ring[index];
					if (slot === undefined) return current;
					const parsed = Number(String(value).trim());
					if (String(value).trim().length > 0 && Number.isFinite(parsed) && parsed > 0) slot.capacity = parsed;
					else delete slot.capacity;
					return { ...current, ring };
				});
				setFeedback(null);
			};

			const previewPlans = cardPlans(preview.plans, { plans: data.selectedPlans, ring: data.ring });
			const previewSummary = summarize(preview.plans, data.ring);

			const save = async () => {
				if (saving || data.selectedPlans.length === 0 || data.ring.length === 0) return;
				setSaving(true);
				setFeedback(null);
				try {
					const response = await fetch(CONFIG_URL, {
						method: "POST",
						headers: { "content-type": "application/json", accept: "application/json" },
						body: JSON.stringify({
							plans: data.selectedPlans,
							ring: data.ring
						})
					});
					const json = await response.json().catch(() => null);
					if (json !== null && typeof json === "object" && json.ok === true) {
						setFeedback({ kind: "ok" });
						void store?.read?.({ force: true });
					} else {
						setFeedback({ kind: "error", message: t("config.failed", { msg: String(json?.code ?? "http") }) });
					}
				} catch (error) {
					setFeedback({ kind: "error", message: t("config.failed", { msg: String(error?.message ?? error) }) });
				} finally {
					setSaving(false);
				}
			};

			let settingsBody;
			if (data.status === "loading") {
				settingsBody = jsx("div", { style: CONFIG_STYLE.empty, children: t("config.loading") });
			} else if (data.status === "error") {
				settingsBody = jsxs("div", {
					style: CONFIG_STYLE.empty,
					children: [
						jsx("div", { children: t("config.empty") }),
						jsx("button", { type: "button", style: CONFIG_STYLE.addButton, onClick: load, children: t("config.retry") })
					]
				});
			} else if (data.plans.length === 0) {
				settingsBody = jsx("div", { style: CONFIG_STYLE.empty, children: t("config.empty") });
			} else {
				settingsBody = jsxs(Fragment, {
					children: [
						jsx("div", { style: CONFIG_STYLE.label, children: t("config.plans") }),
						jsx("div", {
							style: CONFIG_STYLE.list,
							children: data.plans.map((plan) => jsxs("label", {
								style: CONFIG_STYLE.planHead,
								children: [
									jsx("input", {
										type: "checkbox",
										checked: data.selectedPlans.includes(plan.id),
										onChange: (event) => togglePlan(plan.id, event.target.checked)
									}),
									jsx("span", { children: plan.label ?? plan.id })
								]
							}, plan.id))
						}),
						jsx("div", { style: CONFIG_STYLE.label, children: t("config.ring") }),
						jsxs("div", {
							style: CONFIG_STYLE.row,
							children: [
								jsx("span", { style: CONFIG_STYLE.label, children: t("config.ringTop") }),
								jsx("select", {
									style: CONFIG_STYLE.select,
									value: encodeRing(data.ring[0]),
									onChange: (event) => setRingSlot(0, event.target.value),
									children: metricOptions.map((option) => jsx("option", {
										value: `${option.planId}::${option.metric}`,
										children: option.label
									}, `${option.planId}::${option.metric}`))
								}),
								slotIsAmount(data.ring[0]) ? jsxs(Fragment, {
									children: [
										jsx("span", { style: CONFIG_STYLE.label, children: t("config.capacity") }),
										jsx("input", {
											type: "number",
											min: 1,
											step: 1,
											value: data.ring[0].capacity ?? "",
											placeholder: t("config.capacityPlaceholder"),
											style: { ...CONFIG_STYLE.select, minWidth: 90, width: 110 },
											onChange: (event) => setCapacity(0, event.target.value)
										})
									]
								}) : null
							]
						}),
						jsxs("div", {
							style: CONFIG_STYLE.row,
							children: [
								jsx("span", { style: CONFIG_STYLE.label, children: t("config.ringBottom") }),
								jsxs("select", {
									style: CONFIG_STYLE.select,
									value: encodeRing(data.ring[1]),
									onChange: (event) => setRingSlot(1, event.target.value),
									children: [
										jsx("option", { value: "", children: t("config.ringNone") }),
										...metricOptions.map((option) => jsx("option", {
											value: `${option.planId}::${option.metric}`,
											children: option.label
										}, `${option.planId}::${option.metric}`))
									]
								}),
								slotIsAmount(data.ring[1]) ? jsxs(Fragment, {
									children: [
										jsx("span", { style: CONFIG_STYLE.label, children: t("config.capacity") }),
										jsx("input", {
											type: "number",
											min: 1,
											step: 1,
											value: data.ring[1].capacity ?? "",
											placeholder: t("config.capacityPlaceholder"),
											style: { ...CONFIG_STYLE.select, minWidth: 90, width: 110 },
											onChange: (event) => setCapacity(1, event.target.value)
										})
									]
								}) : null
							]
						}),
						jsx("div", { style: CONFIG_STYLE.desc, children: t("config.ringHint") }),
						slotIsAmount(data.ring[0]) || slotIsAmount(data.ring[1])
							? jsx("div", { style: CONFIG_STYLE.desc, children: t("config.capacityHint") })
							: null,
						jsxs("div", {
							style: CONFIG_STYLE.footer,
							children: [
								jsx("button", {
									type: "button",
									style: { ...CONFIG_STYLE.primaryButton, ...(saving || data.selectedPlans.length === 0 || data.ring.length === 0 ? CONFIG_STYLE.primaryDisabled : {}) },
									disabled: saving || data.selectedPlans.length === 0 || data.ring.length === 0,
									onClick: save,
									children: saving ? t("config.saving") : t("config.save")
								}),
								feedback === null
									? null
									: jsx("span", {
										style: feedback.kind === "ok" ? CONFIG_STYLE.feedbackOk : CONFIG_STYLE.feedbackError,
										children: feedback.kind === "ok" ? t("config.saved") : feedback.message
									})
							]
						})
					]
				});
			}

			let previewBody;
			if (preview.status === "loading") {
				previewBody = jsx("div", { style: CONFIG_STYLE.empty, children: t("config.previewLoading") });
			} else if (preview.status === "error" || preview.status === "empty") {
				previewBody = jsx("div", { style: CONFIG_STYLE.empty, children: t("config.previewUnavailable") });
			} else {
				previewBody = jsxs(Fragment, {
					children: [
						jsx("div", {
							style: CONFIG_STYLE.previewRing,
							children: jsx(UsageRing, {
								summary: previewSummary,
								muted: !previewSummary.hasArc || previewSummary.exhausted,
								hovered: null,
								onHover: () => {},
								reduced: true
							})
						}),
						previewPlans.length === 0
							? jsx("div", { style: CONFIG_STYLE.empty, children: t("config.previewUnavailable") })
							: jsx("div", {
								style: CONFIG_STYLE.previewPlans,
								children: previewPlans.map((plan) => jsx("div", {
									style: CONFIG_STYLE.previewPlan,
									children: jsx(PlanSection, { plan, t, localeTag: undefined, store, first: true })
								}, plan.id))
							})
					]
				});
			}

			return jsxs("div", {
				style: CONFIG_STYLE.layout,
				children: [
					jsxs("div", {
						style: CONFIG_STYLE.card,
						children: [
							jsx("div", { style: CONFIG_STYLE.title, children: t("config.title") }),
							settingsBody
						]
					}),
					jsxs("div", {
						style: CONFIG_STYLE.previewCard,
						children: [
							jsx("div", { style: CONFIG_STYLE.title, children: t("config.preview") }),
							previewBody
						]
					})
				]
			});
		}

		/** Actionable hint under a failing DeepSeek card; other kinds keep their setup rows. */
		function planHint(plan, t) {
			if (plan.kind !== "deepseek-balance") return null;
			if (plan.status === "signed-out") return t("accountSignInHint");
			if (plan.status === "auth" || plan.status === "no-key") return t("apiKeyHint");
			return null;
		}

		function PlanSection({ plan, t, localeTag, store, first }) {
			const status = statusText(plan, t);
			const hint = planHint(plan, t);
			// The setup row already says "console cookie required"; do not print
			// the same sentence twice in the status line above it.
			const showStatus = status !== null && !(plan.setup === "xiaomi-cookie" && plan.status === "no-cookie");
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
					showStatus ? jsx("div", {
						style: { ...STYLE.statusLine, ...(plan.status === "auth" || plan.status === "cookie-shape" ? STYLE.statusError : {}) },
						children: stale ? `${status} · ${t("stale")}` : status
					}) : null,
					hint === null ? null : jsx("div", { style: STYLE.statusLine, children: hint }),
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
			const triggerNode = jsx(UsageFooterAction, { store, t });
			if (!state.open) return jsxs(Fragment, { children: [triggerNode, tipNode] });
			const plans = cardPlans(state.plans, state.display);
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
					triggerNode,
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

			ctx.effect(() => ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: `${NS}-card`,
				order: 30,
				locale: NS,
				inject: injected
			}, UsageCardLayer)), "dsh-token-plan-usage: usage card");

			ctx.effect(() => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: NS,
				locale: NS,
				inject: () => ({ t, store })
			}, DisplayConfigCard)), "dsh-token-plan-usage: display config card");

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
			visiblePlans,
			cardPlans,
			ringEntries
		};
		exports.usageFooterAction = UsageFooterAction;
		exports.usageCardLayer = UsageCardLayer;
		exports.planSection = PlanSection;
		exports.displayConfigCard = DisplayConfigCard;
		exports.createStore = createStore;
		return module.exports;
	}
});
