/**
 * Vanity Extension — sidebar intelligence with deterministic context breakdown.
 *
 * Load with: piper -e ./packages/coding-agent/examples/extensions/vanity.ts
 *
 * Sidebar shows:
 *   Session Health — current context usage + dominant context makeup
 *   Focus          — what the agent is working on
 *   Breakdown      — top context contributors from the session log
 *   Next           — suggested next action
 *
 * /vanity keeps working through the built-in command. This extension preserves
 * the sidebar contributor key `vanity` at order 40 so the built-in flow can
 * read and act on the current analysis.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type BreakdownKey = "system" | "assistant" | "thinking" | "tool" | "user";

type BreakdownPart = {
	key: BreakdownKey;
	label: string;
	units: number;
	percent: number;
};

export type VanityBreakdown = {
	totalUnits: number;
	parts: BreakdownPart[];
	dominant: BreakdownPart[];
};

type VanityInsight = {
	status: string;
	sidebar: string;
	focus: string;
	contextNarrative: string;
	nextAction: string | null;
};

type VanityAnalysis = {
	turnIndex: number;
	breakdown: VanityBreakdown;
	insight: VanityInsight;
	isStale: boolean;
	staleTurns: number;
};

type SidebarSection = { label: string; value: string; color?: string };

const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
	system: "System",
	assistant: "Assistant",
	thinking: "Thinking",
	tool: "Tool",
	user: "User",
};

const BREAKDOWN_ORDER: BreakdownKey[] = ["system", "assistant", "thinking", "tool", "user"];

const SYSTEM_PROMPT = `You are a sidebar assistant for a terminal AI coding session.
Return ONLY valid JSON with this exact shape:
{
  "status": "Past-tense summary of the latest turn, max 8 words.",
  "sidebar": "Short context health note for a sidebar row, max 10 words.",
  "focus": "Current work focus in 2-4 words.",
  "contextNarrative": "One short sentence that explains the supplied context breakdown and mentions any recommendation.",
  "nextAction": "Best next action, or null if nothing actionable."
}

Rules:
- Use the provided percentages exactly. Do not invent new percentages.
- Keep status specific and concrete.
- Keep focus short and technical.
- Mention compaction only when context pressure is actually high.
- nextAction must be a single actionable sentence fragment or null.`;

function formatTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function stringifyUnknown(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function estimateUnits(text: string): number {
	const normalized = text.trim();
	if (!normalized) {
		return 0;
	}
	return Math.max(1, Math.ceil(normalized.length / 4));
}

function addUnits(totals: Record<BreakdownKey, number>, key: BreakdownKey, value: number): void {
	if (value > 0) {
		totals[key] += value;
	}
}

function extractTextFromContent(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((c): c is { type: "text"; text: string } => c?.type === "text" && typeof c?.text === "string")
		.map((c) => c.text)
		.join("");
}

function extractThinkingText(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(c): c is { type: "thinking"; thinking: string } => c?.type === "thinking" && typeof c?.thinking === "string",
		)
		.map((c) => c.thinking)
		.join("");
}

function extractToolNames(content: unknown): string[] {
	if (!Array.isArray(content)) return [];
	return content
		.filter((c): c is { type: "toolCall"; name: string } => c?.type === "toolCall" && typeof c?.name === "string")
		.map((c) => c.name);
}

function extractToolPayload(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((c): c is { type: "toolCall"; name?: unknown; arguments?: unknown } => c?.type === "toolCall")
		.map((c) => `${typeof c.name === "string" ? c.name : "tool"} ${stringifyUnknown(c.arguments ?? "")}`)
		.join("\n");
}

function tallyMessage(message: AgentMessage, totals: Record<BreakdownKey, number>): void {
	if (message.role === "user") {
		addUnits(totals, "user", estimateUnits(extractTextFromContent(message.content)));
		return;
	}

	if (message.role === "assistant") {
		addUnits(totals, "assistant", estimateUnits(extractTextFromContent(message.content)));
		addUnits(totals, "thinking", estimateUnits(extractThinkingText(message.content)));
		addUnits(totals, "tool", estimateUnits(extractToolPayload(message.content)));
		return;
	}

	if (message.role === "toolResult") {
		addUnits(totals, "tool", estimateUnits(extractTextFromContent(message.content)));
	}
}

export function calculateVanityBreakdown(
	entries: Array<{ type: string; message?: AgentMessage }>,
	systemPrompt: string,
): VanityBreakdown {
	const totals: Record<BreakdownKey, number> = {
		system: estimateUnits(systemPrompt),
		assistant: 0,
		thinking: 0,
		tool: 0,
		user: 0,
	};

	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message) {
			continue;
		}
		tallyMessage(entry.message, totals);
	}

	const totalUnits = Object.values(totals).reduce((sum, value) => sum + value, 0);
	const safeTotal = Math.max(1, totalUnits);
	const baseParts = BREAKDOWN_ORDER.map((key) => {
		const rawPercent = (totals[key] / safeTotal) * 100;
		return {
			key,
			label: BREAKDOWN_LABELS[key],
			units: totals[key],
			rawPercent,
			percent: Math.floor(rawPercent),
			remainder: rawPercent - Math.floor(rawPercent),
		};
	}).filter((part) => part.units > 0);

	let remainingPercent = Math.max(0, 100 - baseParts.reduce((sum, part) => sum + part.percent, 0));
	for (const part of [...baseParts].sort((a, b) => b.remainder - a.remainder)) {
		if (remainingPercent === 0) {
			break;
		}
		part.percent += 1;
		remainingPercent--;
	}

	const parts = baseParts.map(({ key, label, units, percent }) => ({
		key,
		label,
		units,
		percent,
	}));

	return {
		totalUnits,
		parts,
		dominant: [...parts].sort((a, b) => b.units - a.units).slice(0, 2),
	};
}

export function formatBreakdownSummary(breakdown: VanityBreakdown): string {
	return breakdown.parts.map((part) => `${part.label} ${part.percent}%`).join(" · ");
}

function formatDominantSummary(breakdown: VanityBreakdown): string {
	if (breakdown.dominant.length === 0) {
		return "light session";
	}
	return breakdown.dominant.map((part) => `${part.label.toLowerCase()} ${part.percent}%`).join(" · ");
}

function deriveFocus(toolNames: string[], assistantText: string): string {
	if (toolNames.length > 0) {
		return `${toolNames[0]} workflow`;
	}

	const firstLine = assistantText
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) {
		return "Session context";
	}

	return firstLine
		.replace(/[.?!].*$/, "")
		.split(/\s+/)
		.slice(0, 4)
		.join(" ");
}

function deriveStatus(toolNames: string[], assistantText: string): string {
	if (toolNames.length > 0) {
		return `Used ${toolNames[0]}`;
	}

	const firstLine = assistantText
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) {
		return "Analyzed the session";
	}

	return firstLine
		.replace(/[.?!].*$/, "")
		.split(/\s+/)
		.slice(0, 8)
		.join(" ");
}

function buildDeterministicNextAction(contextPercent: number | null, breakdown: VanityBreakdown): string | null {
	if (contextPercent !== null && contextPercent >= 80) {
		return "Compact soon before the next long turn.";
	}

	const tool = breakdown.parts.find((part) => part.key === "tool");
	if (tool && tool.percent >= 35) {
		return "Summarize the tool findings before running more commands.";
	}

	const thinking = breakdown.parts.find((part) => part.key === "thinking");
	if (thinking && thinking.percent >= 25) {
		return "Turn the reasoning into a concrete implementation step.";
	}

	return null;
}

function buildFallbackInsight(
	assistantText: string,
	toolNames: string[],
	contextPercent: number | null,
	breakdown: VanityBreakdown,
): VanityInsight {
	const nextAction = buildDeterministicNextAction(contextPercent, breakdown);
	const pctText = contextPercent !== null ? `${contextPercent.toFixed(1)}% used` : "usage unknown";
	const dominantSummary = formatDominantSummary(breakdown);

	return {
		status: deriveStatus(toolNames, assistantText),
		sidebar: `${pctText} · ${dominantSummary}`,
		focus: deriveFocus(toolNames, assistantText),
		contextNarrative: `${pctText}. ${formatBreakdownSummary(breakdown)}.${nextAction ? ` ${nextAction}` : ""}`.trim(),
		nextAction,
	};
}

function parseInsightJson(raw: string): VanityInsight | null {
	const json = raw
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```\s*$/i, "")
		.trim();

	if (!json) {
		return null;
	}

	try {
		const parsed = JSON.parse(json) as Partial<Record<keyof VanityInsight, unknown>>;
		if (
			typeof parsed.status !== "string" ||
			typeof parsed.sidebar !== "string" ||
			typeof parsed.focus !== "string" ||
			typeof parsed.contextNarrative !== "string"
		) {
			return null;
		}
		return {
			status: parsed.status.trim(),
			sidebar: parsed.sidebar.trim(),
			focus: parsed.focus.trim(),
			contextNarrative: parsed.contextNarrative.trim(),
			nextAction:
				typeof parsed.nextAction === "string" && parsed.nextAction.trim().length > 0
					? parsed.nextAction.trim()
					: null,
		};
	} catch {
		return null;
	}
}

async function generateInsight(
	assistantText: string,
	toolNames: string[],
	contextPercent: number | null,
	contextWindow: number,
	modelId: string,
	breakdown: VanityBreakdown,
	signal: AbortSignal,
	apiKey: string,
	headers: Record<string, string>,
	intelligenceModel: Model<any>,
): Promise<VanityInsight | null> {
	const pctStr = contextPercent !== null ? `${contextPercent.toFixed(1)}%` : "unknown";
	const windowStr = formatTokens(contextWindow);
	const fallback = buildFallbackInsight(assistantText, toolNames, contextPercent, breakdown);

	const promptText = [
		`Model: ${modelId}`,
		`Context usage: ${pctStr} / ${windowStr}`,
		`Deterministic breakdown: ${formatBreakdownSummary(breakdown)}`,
		`Deterministic recommendation: ${fallback.nextAction ?? "none"}`,
		`Tools used this turn: ${toolNames.length > 0 ? toolNames.join(", ") : "none"}`,
		``,
		`Assistant message (last turn):`,
		assistantText.slice(0, 1200) || "(no text output)",
	].join("\n");

	try {
		const response = await completeSimple(
			intelligenceModel,
			{
				systemPrompt: SYSTEM_PROMPT,
				messages: [
					{
						role: "user" as const,
						content: [{ type: "text" as const, text: promptText }],
						timestamp: Date.now(),
					},
				],
			},
			{ apiKey, headers, signal, maxTokens: 350 },
		);

		if (response.stopReason === "aborted" || response.stopReason === "error") {
			return null;
		}

		return parseInsightJson(extractTextFromContent(response.content));
	} catch {
		return null;
	}
}

export function buildVanitySidebarSections(analysis: VanityAnalysis, contextPercent: number | null): SidebarSection[] {
	const healthPrefix = contextPercent !== null ? `${contextPercent.toFixed(1)}% used` : "usage unknown";
	const health = `${healthPrefix} · ${analysis.insight.sidebar}${analysis.isStale ? " (stale)" : ""}`;
	return [
		{
			label: "Session Health",
			value: health,
			color: contextPercent !== null && contextPercent >= 80 ? "warning" : "success",
		},
	];
}

function buildInjectedPrompt(kind: "deep-dive" | "context" | "next-action", analysis: VanityAnalysis): string {
	const breakdownSummary = formatBreakdownSummary(analysis.breakdown);
	const shared = [
		`Status: ${analysis.insight.status}`,
		`Focus: ${analysis.insight.focus}`,
		`Context: ${analysis.insight.contextNarrative}`,
		`Breakdown: ${breakdownSummary}`,
		analysis.insight.nextAction ? `Suggested next action: ${analysis.insight.nextAction}` : undefined,
	]
		.filter((value): value is string => Boolean(value))
		.join("\n");

	if (kind === "deep-dive") {
		return `Deep-dive the current sidebar state and explain the practical implications.\n${shared}`;
	}
	if (kind === "context") {
		return `Describe the current session context and what is consuming it.\n${shared}`;
	}
	return `Help me execute the best next action for this session.\n${shared}`;
}

export default function (pi: ExtensionAPI) {
	let abortController: AbortController | undefined;
	let lastAnalysis: VanityAnalysis | null = null;

	pi.on("turn_end", async (event, ctx) => {
		if (!ctx.hasUI) return;

		abortController?.abort();
		abortController = new AbortController();
		const signal = abortController.signal;

		const breakdown = calculateVanityBreakdown(ctx.sessionManager.getEntries(), ctx.getSystemPrompt());
		const contextUsage = ctx.getContextUsage();

		const { message } = event;
		const assistantText = extractTextFromContent(message.role === "assistant" ? message.content : []);
		const toolNames = [
			...extractToolNames(message.role === "assistant" ? message.content : []),
			...event.toolResults.map((result) => result.toolName),
		];

		const fallback = buildFallbackInsight(assistantText, toolNames, contextUsage?.percent ?? null, breakdown);
		let analysis: VanityAnalysis = {
			turnIndex: event.turnIndex,
			breakdown,
			insight: fallback,
			isStale: false,
			staleTurns: 0,
		};

		const model =
			ctx.modelRegistry
				.getAvailable()
				.find((entry) => entry.provider === "github-copilot" && entry.id === "gpt-4.1") ??
			ctx.modelRegistry
				.getAvailable()
				.find((entry) => entry.provider === "github-copilot" && entry.id.startsWith("gpt-4"));

		if (model) {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (auth.ok && !signal.aborted) {
				const enrichedInsight = await generateInsight(
					assistantText,
					toolNames,
					contextUsage?.percent ?? null,
					contextUsage?.contextWindow ?? 0,
					ctx.model?.id ?? "unknown",
					breakdown,
					signal,
					auth.apiKey ?? "",
					auth.headers ?? {},
					model,
				);

				if (signal.aborted) {
					return;
				}

				if (enrichedInsight) {
					analysis = {
						turnIndex: event.turnIndex,
						breakdown,
						insight: enrichedInsight,
						isStale: false,
						staleTurns: 0,
					};
				} else if (lastAnalysis) {
					const staleTurns = Math.max(0, event.turnIndex - lastAnalysis.turnIndex);
					analysis = {
						turnIndex: event.turnIndex,
						breakdown,
						insight: lastAnalysis.insight,
						isStale: staleTurns > 2,
						staleTurns,
					};
				}
			}
		}

		lastAnalysis = analysis;
		ctx.ui.setSidebarSections("vanity", buildVanitySidebarSections(analysis, contextUsage?.percent ?? null), {
			order: 40,
		});
	});

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		lastAnalysis = null;
		ctx.ui.setSidebarSections("vanity", [{ label: "Session Health", value: "Send a prompt to start analysis" }], {
			order: 40,
		});
	});

	pi.registerCommand("vanity", {
		description: "Navigate sidebar insights and trigger actions",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI || !lastAnalysis) return;

			const options = [
				"Deep-dive sidebar",
				"Describe context",
				"Suggest next action",
				"Session Health",
				"Git Status",
				"Recent Commits",
			];

			const choice = await ctx.ui.select("Vanity — sidebar insights", options);
			if (!choice) return;

			if (choice === "Deep-dive sidebar") {
				ctx.ui.setEditorText(buildInjectedPrompt("deep-dive", lastAnalysis));
				return;
			}
			if (choice === "Describe context") {
				ctx.ui.setEditorText(buildInjectedPrompt("context", lastAnalysis));
				return;
			}
			if (choice === "Suggest next action") {
				ctx.ui.setEditorText(buildInjectedPrompt("next-action", lastAnalysis));
				return;
			}
			if (choice === "Session Health") {
				const contextUsage = ctx.getContextUsage();
				const pct = contextUsage?.percent?.toFixed(1) ?? "?";
				const confirm = await ctx.ui.confirm(
					`Session Health · ${pct}% context used`,
					`${lastAnalysis.insight.contextNarrative}\n\nRun /compact to free up context?`,
				);
				if (confirm) ctx.compact();
				return;
			}
			if (choice === "Git Status") {
				ctx.ui.setEditorText("!git status");
				return;
			}
			if (choice === "Recent Commits") {
				ctx.ui.setEditorText("!git log --oneline -10");
			}
		},
	});
}
