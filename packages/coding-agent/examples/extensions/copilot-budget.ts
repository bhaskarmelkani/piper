/**
 * Copilot Budget Extension
 *
 * Shows GitHub Copilot premium request usage in the piper sidebar.
 *
 * Load with: piper -e ./packages/coding-agent/examples/extensions/copilot-budget.ts
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext, ExtensionSidebarSection } from "@mariozechner/pi-coding-agent";

const execFileAsync = promisify(execFile);

const SIDEBAR_KEY = "copilot-budget";
const SIDEBAR_ORDER = 20;
const CACHE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const COPILOT_USER_ENDPOINT = "https://api.github.com/copilot_internal/user";
const EDITOR_VERSION = "vscode/1.96.2";
const EDITOR_PLUGIN_VERSION = "copilot-chat/0.26.7";
const USER_AGENT = "GitHubCopilotChat/0.26.7";
const GITHUB_API_VERSION = "2026-01-01";

export type CopilotUsageData = {
	used: number;
	entitlement: number;
	percent: number;
	unlimited: boolean;
	overageCount: number;
	overagePermitted: boolean;
	resetDate: string | null;
	tier: "paid" | "free";
};

type CacheEntry = {
	data: CopilotUsageData | null;
	timestamp: number;
};

let cache: CacheEntry | null = null;

async function readGhAuthToken(): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("gh", ["auth", "token"], { timeout: 5_000 });
		const token = stdout.trim();
		return token.length > 0 ? token : null;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readNumber(record: Record<string, unknown>, key: string): number {
	const value = record[key];
	return typeof value === "number" ? value : Number(value ?? 0);
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
	return Boolean(record[key]);
}

function readString(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	return typeof value === "string" ? value : null;
}

export function resetCopilotBudgetCache(): void {
	cache = null;
}

export async function discoverGitHubToken(
	env = process.env,
	readToken: () => Promise<string | null> = readGhAuthToken,
): Promise<string | null> {
	if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
	if (env.GH_TOKEN) return env.GH_TOKEN;
	return readToken();
}

export function parseCopilotUsageResponse(body: unknown): CopilotUsageData | null {
	if (!isRecord(body)) return null;

	const quotaSnapshots = body.quota_snapshots;
	if (isRecord(quotaSnapshots)) {
		const premiumInteractions = quotaSnapshots.premium_interactions;
		if (isRecord(premiumInteractions)) {
			const entitlement = readNumber(premiumInteractions, "entitlement");
			const remaining = readNumber(premiumInteractions, "remaining");
			const unlimited = readBoolean(premiumInteractions, "unlimited");
			const used = unlimited
				? readNumber(premiumInteractions, "used") || Math.max(0, entitlement - remaining)
				: Math.max(0, entitlement - remaining);
			return {
				used: Math.round(used),
				entitlement,
				percent: unlimited || entitlement === 0 ? 0 : Math.round((used / entitlement) * 100),
				unlimited,
				overageCount: readNumber(premiumInteractions, "overage_count"),
				overagePermitted: readBoolean(premiumInteractions, "overage_permitted"),
				resetDate: readString(body, "quota_reset_date_utc"),
				tier: "paid",
			};
		}
	}

	const limitedUserQuotas = isRecord(body.limited_user_quotas) ? body.limited_user_quotas : undefined;
	const monthlyQuotas = isRecord(body.monthly_quotas) ? body.monthly_quotas : undefined;
	const limitedPremium = limitedUserQuotas?.premium_interactions;
	const monthlyPremium = monthlyQuotas?.premium_interactions;
	const premiumInteractions = isRecord(limitedPremium)
		? limitedPremium
		: isRecord(monthlyPremium)
			? monthlyPremium
			: undefined;
	if (!premiumInteractions) return null;

	const entitlement = readNumber(premiumInteractions, "entitlement");
	const remaining = readNumber(premiumInteractions, "remaining");
	const unlimited = readBoolean(premiumInteractions, "unlimited");
	const used = Math.max(0, entitlement - remaining);

	return {
		used: Math.round(used),
		entitlement,
		percent: unlimited || entitlement === 0 ? 0 : Math.round((used / entitlement) * 100),
		unlimited,
		overageCount: 0,
		overagePermitted: false,
		resetDate: readString(body, "limited_user_reset_date") ?? readString(body, "quota_reset_date_utc"),
		tier: "free",
	};
}

export async function fetchCopilotUsage(
	env = process.env,
	fetchImpl: typeof fetch = fetch,
	now = Date.now(),
): Promise<CopilotUsageData | null> {
	if (cache && now - cache.timestamp < CACHE_TTL_MS) {
		return cache.data;
	}

	const token = await discoverGitHubToken(env);
	if (!token) {
		cache = { data: null, timestamp: now };
		return null;
	}

	try {
		const response = await fetchImpl(COPILOT_USER_ENDPOINT, {
			headers: {
				Authorization: `token ${token}`,
				Accept: "application/json",
				"Editor-Version": EDITOR_VERSION,
				"Editor-Plugin-Version": EDITOR_PLUGIN_VERSION,
				"User-Agent": USER_AGENT,
				"X-Github-Api-Version": GITHUB_API_VERSION,
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});

		if (!response.ok) {
			cache = { data: null, timestamp: now };
			return null;
		}

		const body = (await response.json()) as unknown;
		const parsed = parseCopilotUsageResponse(body);
		cache = { data: parsed, timestamp: now };
		return parsed;
	} catch {
		cache = { data: null, timestamp: now };
		return null;
	}
}

function formatResetDate(dateStr: string): string {
	try {
		return new Date(dateStr).toLocaleDateString("en-US", { day: "numeric", month: "short" });
	} catch {
		return dateStr;
	}
}

function getBudgetColor(percent: number): "success" | "warning" | "error" {
	if (percent >= 85) return "error";
	if (percent >= 60) return "warning";
	return "success";
}

export function buildCopilotSidebarSections(data: CopilotUsageData | null): ExtensionSidebarSection[] {
	if (!data) {
		return [{ label: "Copilot Budget", value: "sync unavailable", color: "warning" }];
	}

	const sections: ExtensionSidebarSection[] = [
		{
			label: "Copilot Budget",
			value: `${data.percent}%`,
			color: getBudgetColor(data.percent),
		},
		{
			label: "Premium",
			value: data.unlimited ? `${data.used} used (unlimited)` : `${data.used} / ${data.entitlement} requests`,
		},
	];

	if (data.overageCount > 0) {
		sections.push({
			label: "Overage",
			value: `+${data.overageCount}${data.overagePermitted ? "" : " blocked"}`,
			color: data.overagePermitted ? "warning" : "error",
		});
	}

	if (data.resetDate) {
		sections.push({ label: "Reset", value: formatResetDate(data.resetDate) });
	}

	return sections;
}

async function refreshSidebar(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) return;

	if (ctx.model?.provider !== "github-copilot") {
		ctx.ui.setSidebarSections(SIDEBAR_KEY, undefined);
		return;
	}

	const usage = await fetchCopilotUsage();
	ctx.ui.setSidebarSections(SIDEBAR_KEY, buildCopilotSidebarSections(usage), { order: SIDEBAR_ORDER });
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		await refreshSidebar(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		await refreshSidebar(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		await refreshSidebar(ctx);
	});
}
