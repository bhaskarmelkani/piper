import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ContextUsage } from "../../../core/extensions/types.js";
import type { ThemeColor } from "../theme/theme.js";

export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

export function getContextTone(percent: number | null): ThemeColor {
	if (percent === null) return "muted";
	if (percent >= 90) return "error";
	if (percent >= 70) return "warning";
	return "success";
}

export function getThinkingTone(level: ThinkingLevel | undefined): ThemeColor {
	switch (level) {
		case "minimal":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
			return "thinkingMedium";
		case "high":
			return "thinkingHigh";
		case "xhigh":
			return "thinkingXhigh";
		default:
			return "thinkingOff";
	}
}

export function renderProgressBar(percent: number, width: number): string {
	const clampedPercent = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clampedPercent / 100) * width);
	const empty = Math.max(0, width - filled);
	return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}

export function formatPercent(percent: number): string {
	const clampedPercent = Math.max(0, Math.min(100, percent));
	return clampedPercent >= 10 ? `${Math.round(clampedPercent)}%` : `${clampedPercent.toFixed(1)}%`;
}

export function formatContextSummary(contextUsage: ContextUsage | undefined): string {
	if (!contextUsage) {
		return "unknown";
	}

	const contextWindow = formatTokens(contextUsage.contextWindow);
	const tokens =
		typeof contextUsage.tokens === "number" && Number.isFinite(contextUsage.tokens) ? contextUsage.tokens : null;
	if (contextUsage.percent === null || tokens === null) {
		return `? / ${contextWindow}`;
	}

	return `${formatTokens(tokens)} / ${contextWindow}`;
}
