import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { AgentSession } from "../../../core/agent-session.js";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.js";
import { type ThemeColor, theme } from "../theme/theme.js";

type SidebarSection = {
	label: string;
	value: string;
	color?: ThemeColor;
};

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

/**
 * Read-only right sidebar panel showing model, context, resources, and session state.
 */
function truncateSectionValue(value: string): string {
	const items = value
		.split(", ")
		.map((s) => s.trim())
		.filter(Boolean);
	if (items.length <= 3) return value;
	return `${items.slice(0, 2).join(", ")}, … (${items.length})`;
}

export class ShellSidebarComponent implements Component {
	private height = 0;
	private resourceSections: SidebarSection[] = [];

	constructor(
		private session: AgentSession,
		private footerData: ReadonlyFooterDataProvider,
	) {}

	setSession(session: AgentSession): void {
		this.session = session;
	}

	setHeight(height: number): void {
		this.height = Math.max(0, height);
	}

	setResourceSections(resourceSections: SidebarSection[]): void {
		this.resourceSections = resourceSections;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 2 || this.height <= 0) {
			return [];
		}

		const contentWidth = Math.max(1, width - 2);
		const border = theme.fg("muted", "│");
		const blank = `${border} ${" ".repeat(contentWidth)}`;
		const wrapLine = (text: string): string[] => {
			const wrapped = wrapTextWithAnsi(text, contentWidth);
			if (wrapped.length === 0) {
				return [blank];
			}
			return wrapped.map((line) => {
				const truncated = truncateToWidth(line, contentWidth, "…", false);
				const padded = truncated + " ".repeat(Math.max(0, contentWidth - visibleWidth(truncated)));
				return `${border} ${padded}`;
			});
		};

		const section = (label: string, value: string): string[] => {
			return [blank, ...wrapLine(theme.fg("muted", label)), ...wrapLine(value)];
		};

		const topLines: string[] = [];
		const bottomLines: string[] = [];

		const model = this.session.model;
		if (model) {
			topLines.push(...wrapLine(theme.fg("muted", model.provider)));
			topLines.push(...wrapLine(theme.fg("accent", model.id)));
		} else {
			topLines.push(...wrapLine(theme.fg("muted", "no model")));
		}

		const thinkingLevel = this.session.thinkingLevel;
		if (model?.reasoning && thinkingLevel !== "off") {
			topLines.push(...section("Thinking", thinkingLevel));
		}

		let totalInput = 0;
		let totalOutput = 0;
		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
			}
		}

		if (totalInput > 0 || totalOutput > 0) {
			topLines.push(...section("Usage", `↑${formatTokens(totalInput)} ↓${formatTokens(totalOutput)}`));
		}

		const contextUsage = this.session.getContextUsage();
		if (contextUsage && contextUsage.percent !== null) {
			const pct = contextUsage.percent.toFixed(1);
			const window = formatTokens(contextUsage.contextWindow);
			const color = contextUsage.percent > 90 ? "error" : contextUsage.percent > 70 ? "warning" : "text";
			topLines.push(...section("Context", theme.fg(color, `${pct}% / ${window}`)));
		}

		const cwd = this.session.sessionManager.getCwd();
		const home = process.env.HOME || process.env.USERPROFILE;
		const displayCwd = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
		bottomLines.push(...section("Path", theme.fg("muted", displayCwd)));

		const branch = this.footerData.getGitBranch();
		if (branch) {
			bottomLines.push(...section("Branch", branch));
		}

		const sessionName = this.session.sessionManager.getSessionName();
		if (sessionName) {
			bottomLines.push(...section("Session", sessionName));
		}

		for (const resourceSection of this.resourceSections) {
			const display = truncateSectionValue(resourceSection.value);
			const colored = resourceSection.color ? theme.fg(resourceSection.color as ThemeColor, display) : display;
			bottomLines.push(...section(resourceSection.label, colored));
		}

		const maxBottomHeight = Math.max(0, this.height - topLines.length);
		const visibleBottomLines = bottomLines.slice(Math.max(0, bottomLines.length - maxBottomHeight));
		const spacerHeight = Math.max(0, this.height - topLines.length - visibleBottomLines.length);

		const lines = [...topLines, ...Array.from({ length: spacerHeight }, () => blank), ...visibleBottomLines];
		return lines.slice(0, this.height);
	}
}
