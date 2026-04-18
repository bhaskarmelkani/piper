import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { AgentSession } from "../../../core/agent-session.js";
import { theme } from "../theme/theme.js";

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

/**
 * Read-only right sidebar panel showing model, context, and session state.
 */
export class ShellSidebarComponent implements Component {
	constructor(private session: AgentSession) {}

	setSession(session: AgentSession): void {
		this.session = session;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 2) return [];

		const contentWidth = Math.max(1, width - 2); // 1 for border char + 1 for space
		const border = theme.fg("muted", "│");
		const blank = border + " ".repeat(width - 1);

		const line = (text: string): string => {
			const truncated = truncateToWidth(text, contentWidth, "…", false);
			const padded = truncated + " ".repeat(Math.max(0, contentWidth - visibleWidth(truncated)));
			return `${border} ${padded}`;
		};

		const lines: string[] = [];

		lines.push(blank);

		// Model and provider
		const model = this.session.model;
		if (model) {
			lines.push(line(theme.fg("dim", model.provider)));
			lines.push(line(theme.fg("accent", model.id)));
		} else {
			lines.push(line(theme.fg("muted", "no model")));
		}

		// Thinking level
		const thinkingLevel = this.session.thinkingLevel;
		if (model?.reasoning && thinkingLevel !== "off") {
			lines.push(blank);
			lines.push(line(theme.fg("dim", `thinking: ${thinkingLevel}`)));
		}

		// Token usage from all session entries
		let totalInput = 0;
		let totalOutput = 0;
		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
			}
		}

		if (totalInput > 0 || totalOutput > 0) {
			lines.push(blank);
			lines.push(line(theme.fg("dim", "context")));
			lines.push(line(theme.fg("muted", `↑${formatTokens(totalInput)} ↓${formatTokens(totalOutput)}`)));
		}

		// Context window percentage
		const contextUsage = this.session.getContextUsage();
		if (contextUsage && contextUsage.percent !== null) {
			const pct = contextUsage.percent.toFixed(1);
			const window = formatTokens(contextUsage.contextWindow);
			const color = contextUsage.percent > 90 ? "error" : contextUsage.percent > 70 ? "warning" : "muted";
			lines.push(line(theme.fg(color, `${pct}% / ${window}`)));
		}

		// Session name
		const sessionName = this.session.sessionManager.getSessionName();
		if (sessionName) {
			lines.push(blank);
			lines.push(line(theme.fg("dim", sessionName)));
		}

		lines.push(blank);

		return lines;
	}
}
