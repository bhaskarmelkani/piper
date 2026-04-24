import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { AgentSession } from "../../../core/agent-session.js";
import type { ExtensionSidebarSection } from "../../../core/extensions/types.js";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.js";
import { COPILOT_MULTIPLIERS } from "../../../utils/copilot-model-policies.js";
import { type ThemeColor, theme } from "../theme/theme.js";
import {
	formatContextSummary,
	formatPercent,
	formatTokens,
	getContextTone,
	getThinkingTone,
	parsePercentText,
	renderCompactMeter,
} from "./sidebar-semantics.js";

type SidebarDisplaySection = ExtensionSidebarSection & { order?: number };

const REQUESTS_ORDER = 20;
const CONTEXT_ORDER = 30;
const CAPABILITIES_ORDER = 40;
const WORKSPACE_ORDER = 50;

const SIDEBAR_COLOR_MAP: Record<string, ThemeColor> = {
	accent: "accent",
	success: "success",
	warning: "warning",
	error: "error",
	info: "borderAccent",
	textPrimary: "text",
	textSecondary: "muted",
	muted: "muted",
	dim: "dim",
};

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

function getSectionOrder(section: ExtensionSidebarSection): number {
	const order = (section as SidebarDisplaySection).order;
	return typeof order === "number" ? order : 100;
}

function resolveSidebarColor(color: string | undefined): ThemeColor | undefined {
	if (!color) {
		return undefined;
	}

	const normalized = color.trim();
	if (!normalized || normalized.startsWith("#") || normalized.includes("\x1b[")) {
		return undefined;
	}

	return SIDEBAR_COLOR_MAP[normalized];
}

function formatWorkspaceName(cwd: string): string {
	const normalized = cwd.replace(/[\\/]+$/, "");
	if (!normalized) {
		return cwd;
	}

	const parts = normalized.split(/[\\/]/).filter(Boolean);
	return parts.at(-1) ?? cwd;
}

function getModelProviderBadge(model: AgentSession["model"]): string {
	if (!model) {
		return theme.fg("muted", "unresolved");
	}

	if (model.provider !== "github-copilot") {
		return theme.fg("dim", `(${model.provider})`);
	}

	const multiplier = COPILOT_MULTIPLIERS[model.id];
	const multiplierBadge = multiplier !== undefined ? ` · x${multiplier}` : "";
	return theme.fg("dim", `(${model.provider}${multiplierBadge})`);
}

export class ShellSidebarComponent implements Component {
	private height = 0;
	private resourceSections: SidebarDisplaySection[] = [];

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
		this.resourceSections = resourceSections as SidebarDisplaySection[];
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 2 || this.height <= 0) {
			return [];
		}

		const contentWidth = Math.max(1, width - 2);
		const border = theme.fg("muted", "│");
		const blank = `${border} ${" ".repeat(contentWidth)}`;
		const borderlessBlank = " ".repeat(width);
		const divider = `${border} ${theme.fg("borderMuted", "─".repeat(contentWidth))}`;
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
		const labeledSection = (label: string, value: string): string[] => [
			...wrapLine(theme.fg("muted", label)),
			...wrapLine(value),
		];
		const compactSection = (label: string, value: string): string[] =>
			wrapLine(`${theme.fg("muted", `${label} `)}${value}`);
		const joinGroups = (groups: string[][]): string[] => {
			const lines: string[] = [];
			for (const group of groups) {
				if (group.length === 0) {
					continue;
				}
				if (lines.length > 0) {
					lines.push(divider);
				}
				lines.push(...group);
			}
			return lines;
		};
		const renderExtensionSections = (sections: SidebarDisplaySection[]): string[] => {
			const rendered: string[][] = [];
			for (const section of sections) {
				const label = normalizeSectionText(section.label);
				const value = truncateSectionValue(section.value);
				if (!label || !value) {
					continue;
				}
				const tone = resolveSidebarColor(section.color);
				const percent = parsePercentText(value);
				if (percent !== null) {
					const meterTone = tone ?? getContextTone(percent);
					const meterWidth = Math.max(8, Math.min(18, contentWidth - 8));
					rendered.push([
						...wrapLine(theme.fg("muted", label)),
						...wrapLine(
							`${theme.fg(meterTone, renderCompactMeter(percent, meterWidth))} ${theme.fg(
								meterTone,
								formatPercent(percent),
							)}`,
						),
					]);
				} else {
					const coloredValue = tone ? theme.fg(tone, value) : theme.fg("text", value);
					rendered.push(labeledSection(label, coloredValue));
				}
			}
			const result: string[] = [];
			for (let i = 0; i < rendered.length; i++) {
				if (i > 0) result.push(blank);
				result.push(...rendered[i]);
			}
			return result;
		};

		const orderedSections = [...this.resourceSections].sort(
			(a, b) =>
				getSectionOrder(a) - getSectionOrder(b) ||
				normalizeSectionText(a.label).localeCompare(normalizeSectionText(b.label)),
		);
		const requestSections = orderedSections.filter((section) => getSectionOrder(section) === REQUESTS_ORDER);
		const contextSections = orderedSections.filter((section) => getSectionOrder(section) === CONTEXT_ORDER);
		const capabilitySections = orderedSections.filter((section) => getSectionOrder(section) === CAPABILITIES_ORDER);
		const workspaceSections = orderedSections.filter((section) => getSectionOrder(section) === WORKSPACE_ORDER);
		const overflowSections = orderedSections.filter((section) => getSectionOrder(section) > WORKSPACE_ORDER);

		const topGroups: string[][] = [];
		const bottomGroups: string[][] = [];

		const sessionTitle = deriveSessionTitle(this.session);
		const headerGroup: string[] = [];
		if (sessionTitle) {
			headerGroup.push(...wrapLine(theme.bold(theme.fg("accent", sessionTitle))));
			headerGroup.push(blank);
		}

		const model = this.session.model;
		if (model) {
			headerGroup.push(...labeledSection("Model", `${theme.fg("text", model.id)} ${getModelProviderBadge(model)}`));
		} else {
			headerGroup.push(...labeledSection("Model", theme.fg("muted", "unresolved")));
		}

		const thinkingLevel = this.session.thinkingLevel;
		const thinkingTone = model?.reasoning ? getThinkingTone(thinkingLevel) : "muted";
		const thinkingValue = model?.reasoning ? thinkingLevel : "unsupported";
		headerGroup.push(blank);
		headerGroup.push(...labeledSection("Thinking", theme.fg(thinkingTone, thinkingValue)));
		const planMode = this.session.planningModeStatus;
		const planEnabled = planMode !== "off";
		const planTone = planEnabled ? "accent" : "muted";
		const planValue = planEnabled ? "on" : "off";
		headerGroup.push(blank);
		headerGroup.push(...labeledSection("Plan", theme.fg(planTone, planValue)));
		const editMode = this.session.editModeEnabled ? "on" : "off";
		headerGroup.push(blank);
		headerGroup.push(...labeledSection("Edit", theme.fg(editMode === "on" ? "success" : "warning", editMode)));
		topGroups.push(headerGroup);

		let totalInput = 0;
		let totalOutput = 0;
		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
			}
		}

		const requestGroup: string[] = [];
		requestGroup.push(...renderExtensionSections(requestSections));
		if (totalInput > 0 || totalOutput > 0) {
			requestGroup.push(
				...compactSection(
					"Usage",
					`${theme.fg("text", `↑${formatTokens(totalInput)} ↓${formatTokens(totalOutput)}`)}`,
				),
			);
		}
		if (requestGroup.length > 0) {
			topGroups.push(requestGroup);
		}

		const contextGroup: string[] = [];
		const contextUsage = this.session.getContextUsage();
		if (contextUsage && contextUsage.percent !== null) {
			const tone = getContextTone(contextUsage.percent);
			const meterWidth = Math.max(8, Math.min(18, contentWidth - 8));
			contextGroup.push(...wrapLine(theme.fg("muted", "Context")));
			contextGroup.push(
				...wrapLine(
					`${theme.fg(tone, renderCompactMeter(contextUsage.percent, meterWidth))} ${theme.fg(
						tone,
						formatPercent(contextUsage.percent),
					)}`,
				),
			);
			contextGroup.push(...wrapLine(theme.fg("muted", formatContextSummary(contextUsage))));
		} else if (contextUsage) {
			contextGroup.push(...compactSection("Context", theme.fg("muted", formatContextSummary(contextUsage))));
		}
		const renderedContextSections = renderExtensionSections(contextSections);
		if (contextGroup.length > 0 && renderedContextSections.length > 0) {
			contextGroup.push(blank);
		}
		contextGroup.push(...renderedContextSections);
		if (contextGroup.length > 0) {
			topGroups.push(contextGroup);
		}

		const capabilityGroup = renderExtensionSections(capabilitySections);
		if (capabilityGroup.length > 0) {
			topGroups.push(capabilityGroup);
		}

		const cwd = this.session.sessionManager.getCwd();
		const displayCwd = formatWorkspaceName(cwd);
		const workspaceGroup: string[] = [];
		workspaceGroup.push(...labeledSection("Workspace", theme.fg("text", displayCwd)));

		const branch = this.footerData.getGitBranch();
		if (branch) {
			workspaceGroup.push(blank);
			workspaceGroup.push(...labeledSection("Git", theme.fg("text", branch)));
		}

		const statuses = Array.from(this.footerData.getExtensionStatuses().values())
			.map((status) => status.trim())
			.filter(Boolean);
		const statusValue = statuses.length > 0 ? truncateSectionValue(statuses.join(", ")) : "ready";
		workspaceGroup.push(blank);
		workspaceGroup.push(
			...labeledSection("Status", theme.fg(statuses.length > 0 ? "warning" : "success", statusValue)),
		);
		const workspaceExtSections = renderExtensionSections([...workspaceSections, ...overflowSections]);
		if (workspaceExtSections.length > 0) {
			workspaceGroup.push(blank);
			workspaceGroup.push(...workspaceExtSections);
		}
		bottomGroups.push(workspaceGroup);

		const topLines = joinGroups(topGroups);
		const bottomLines = joinGroups(bottomGroups);
		const maxBottomHeight = Math.max(0, this.height - topLines.length);
		const visibleBottomLines = bottomLines.slice(Math.max(0, bottomLines.length - maxBottomHeight));
		let spacerHeight = Math.max(0, this.height - topLines.length - visibleBottomLines.length);
		const footerSectionPrefix: string[] = [];
		const footerPadding: string[] = [];

		if (bottomLines.length > 0 && spacerHeight > 0) {
			footerPadding.push(borderlessBlank);
			spacerHeight -= 1;
		}
		if (topLines.length > 0 && bottomLines.length > 0 && spacerHeight > 0) {
			footerSectionPrefix.push(divider);
			spacerHeight -= 1;
			if (spacerHeight > 0) {
				footerSectionPrefix.push(blank);
				spacerHeight -= 1;
			}
		} else if (bottomLines.length > 0 && spacerHeight > 0) {
			footerSectionPrefix.push(blank);
			spacerHeight -= 1;
		}

		const lines = [
			...topLines,
			...Array.from({ length: spacerHeight }, () => blank),
			...footerSectionPrefix,
			...visibleBottomLines,
			...footerPadding,
		];
		return lines.slice(0, this.height);
	}
}
