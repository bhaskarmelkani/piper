import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { AgentSession } from "../../../core/agent-session.js";
import type { ExtensionSidebarSection } from "../../../core/extensions/types.js";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.js";
import { type ThemeColor, theme } from "../theme/theme.js";
import {
	formatContextSummary,
	formatPercent,
	formatTokens,
	getContextTone,
	getThinkingTone,
	renderProgressBar,
} from "./sidebar-semantics.js";

/**
 * Read-only right sidebar panel showing model, context, resources, and session state.
 */
function normalizeSectionText(value: unknown): string {
	if (typeof value !== "string") {
		return "";
	}
	return value.trim();
}

function truncateSectionValue(value: unknown): string {
	const text = normalizeSectionText(value);
	if (!text) return "";
	const items = text
		.split(", ")
		.map((s) => s.trim())
		.filter(Boolean);
	if (items.length <= 3) return text;
	return `${items.slice(0, 2).join(", ")}, … (${items.length})`;
}

function extractMessageText(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) {
				return typeof part.text === "string" ? part.text : "";
			}
			return "";
		})
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function deriveSessionTitle(session: AgentSession): string | undefined {
	const explicitName = session.sessionManager.getSessionName();
	if (explicitName) {
		return explicitName;
	}

	for (const entry of session.sessionManager.getEntries()) {
		if (entry.type !== "message" || entry.message.role !== "user") {
			continue;
		}

		const title = extractMessageText(entry.message.content);
		if (!title) {
			continue;
		}

		return title.length <= 48 ? title : `${title.slice(0, 45).trimEnd()}...`;
	}

	return undefined;
}

export class ShellSidebarComponent implements Component {
	private height = 0;
	private resourceSections: ExtensionSidebarSection[] = [];

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

	setResourceSections(resourceSections: ExtensionSidebarSection[]): void {
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

		const compactSection = (label: string, value: string): string[] => {
			return wrapLine(`${theme.fg("muted", `${label} `)}${value}`);
		};

		const topLines: string[] = [];
		const bottomLines: string[] = [];

		const sessionTitle = deriveSessionTitle(this.session);
		if (sessionTitle) {
			topLines.push(...wrapLine(theme.fg("accent", sessionTitle)));
			topLines.push(blank);
		}

		const model = this.session.model;
		if (model) {
			topLines.push(...wrapLine(`${theme.fg("muted", `${model.provider} `)}${theme.fg("accent", model.id)}`));
		} else {
			topLines.push(...wrapLine(theme.fg("muted", "no model")));
		}

		const thinkingLevel = this.session.thinkingLevel;
		if (model?.reasoning && thinkingLevel !== "off") {
			topLines.push(blank);
			topLines.push(...compactSection("Thinking", theme.fg(getThinkingTone(thinkingLevel), thinkingLevel)));
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
			topLines.push(...compactSection("Usage", `↑${formatTokens(totalInput)} ↓${formatTokens(totalOutput)}`));
		}

		const contextUsage = this.session.getContextUsage();
		if (contextUsage && contextUsage.percent !== null) {
			const tone = getContextTone(contextUsage.percent);
			const meterWidth = Math.max(8, Math.min(10, contentWidth - 8));
			topLines.push(blank);
			topLines.push(...wrapLine(theme.fg("muted", "Context")));
			topLines.push(
				...wrapLine(
					`${theme.fg(tone, renderProgressBar(contextUsage.percent, meterWidth))} ${theme.fg(
						tone,
						formatPercent(contextUsage.percent),
					)}`,
				),
			);
			topLines.push(...wrapLine(theme.fg("muted", formatContextSummary(contextUsage))));
		} else if (contextUsage) {
			topLines.push(blank);
			topLines.push(...compactSection("Context", theme.fg("muted", formatContextSummary(contextUsage))));
		}

		const cwd = this.session.sessionManager.getCwd();
		const home = process.env.HOME || process.env.USERPROFILE;
		const displayCwd = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
		bottomLines.push(...section("Path", theme.fg("muted", displayCwd)));

		const branch = this.footerData.getGitBranch();
		if (branch) {
			bottomLines.push(...compactSection("Branch", branch));
		}

		for (const resourceSection of this.resourceSections) {
			const label = normalizeSectionText(resourceSection.label);
			const display = truncateSectionValue(resourceSection.value);
			if (!label || !display) {
				continue;
			}
			const colored = resourceSection.color ? theme.fg(resourceSection.color as ThemeColor, display) : display;
			bottomLines.push(...section(label, colored));
		}

		const maxBottomHeight = Math.max(0, this.height - topLines.length);
		const visibleBottomLines = bottomLines.slice(Math.max(0, bottomLines.length - maxBottomHeight));
		const spacerHeight = Math.max(0, this.height - topLines.length - visibleBottomLines.length);

		const lines = [...topLines, ...Array.from({ length: spacerHeight }, () => blank), ...visibleBottomLines];
		return lines.slice(0, this.height);
	}
}
