/**
 * Vanity Extension — LLM-powered sidebar intelligence
 *
 * After each agent turn, calls GPT-4.1 (via GitHub Copilot) to analyze
 * what just happened and surfaces high-leverage insights in the sidebar.
 *
 * Load with: piper -e ./packages/coding-agent/examples/extensions/vanity.ts
 *
 * Sidebar shows:
 *   Status  — what the agent just accomplished
 *   Context — usage health with recommendation
 *   Focus   — topic/area being worked on
 *   Tip     — most valuable next action (when applicable)
 *
 * /vanity command navigates sidebar content via Clack prompts.
 */

import type { Model } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type VanityInsight = {
	status: string;
	context: string;
	focus: string;
	tip: string | null;
};

function formatTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function extractTextFromContent(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((c): c is { type: "text"; text: string } => c?.type === "text" && typeof c?.text === "string")
		.map((c) => c.text)
		.join("");
}

function extractToolNames(content: unknown): string[] {
	if (!Array.isArray(content)) return [];
	return content
		.filter((c): c is { type: string; name: string } => c?.type === "toolCall" && typeof c?.name === "string")
		.map((c) => c.name);
}

const SYSTEM_PROMPT = `You are a sidebar assistant for a terminal AI coding session.
Analyze the current turn and return terse, high-signal insights for a narrow sidebar panel.
Return ONLY valid JSON — no markdown, no explanation.

Format:
{
  "status": "Past-tense: what the agent just did. Specific and concrete.",
  "context": "Context health: e.g. '12% used, ample room' or '78% — consider /compact soon'",
  "focus": "Current topic/area being worked on. 2-4 words.",
  "tip": "Most valuable next action, or null if nothing notable."
}

Rules:
- status: max 8 words, past tense. E.g. "Fixed auth middleware race condition" not "Working on auth"
- context: always include %, add urgency if >70%
- focus: infer from tools used + conversation content. E.g. "PR review", "DB migration", "TypeScript types"
- tip: only include if genuinely actionable. E.g. "Run tests before committing" or "Context >80%, compact soon"`;

async function generateInsight(
	assistantText: string,
	toolNames: string[],
	contextPercent: number | null,
	contextWindow: number,
	modelId: string,
	signal: AbortSignal,
	apiKey: string,
	headers: Record<string, string>,
	intelligenceModel: Model<any>,
): Promise<VanityInsight | null> {
	const pctStr = contextPercent !== null ? `${contextPercent.toFixed(1)}%` : "unknown";
	const windowStr = formatTokens(contextWindow);

	const promptText = [
		`Model: ${modelId}`,
		`Context: ${pctStr} / ${windowStr}`,
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
			{ apiKey, headers, signal, maxTokens: 300 },
		);

		if (response.stopReason === "aborted" || response.stopReason === "error") return null;

		const raw = extractTextFromContent(response.content);
		const json = raw
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```\s*$/i, "")
			.trim();
		return JSON.parse(json) as VanityInsight;
	} catch {
		return null;
	}
}

export default function (pi: ExtensionAPI) {
	let abortController: AbortController | undefined;
	let lastInsight: VanityInsight | null = null;

	pi.on("turn_end", async (event, ctx) => {
		if (!ctx.hasUI) return;

		abortController?.abort();
		abortController = new AbortController();
		const signal = abortController.signal;

		const model =
			ctx.modelRegistry.getAvailable().find((m) => m.provider === "github-copilot" && m.id === "gpt-4.1") ??
			ctx.modelRegistry.getAvailable().find((m) => m.provider === "github-copilot" && m.id.startsWith("gpt-4"));
		if (!model) return;

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || signal.aborted) return;

		const { message } = event;
		const assistantText = extractTextFromContent(message.role === "assistant" ? message.content : []);
		const toolNames = extractToolNames(message.role === "assistant" ? message.content : []);

		const contextUsage = ctx.getContextUsage();

		const insight = await generateInsight(
			assistantText,
			toolNames,
			contextUsage?.percent ?? null,
			contextUsage?.contextWindow ?? 0,
			ctx.model?.id ?? "unknown",
			signal,
			auth.apiKey ?? "",
			auth.headers ?? {},
			model,
		);

		if (signal.aborted || !insight) return;
		lastInsight = insight;

		const sections: Array<{ label: string; value: string; color?: string }> = [
			{ label: "Status", value: insight.status },
			{ label: "Context", value: insight.context },
			{ label: "Focus", value: insight.focus, color: "accent" },
		];
		if (insight.tip) {
			sections.push({ label: "Tip", value: insight.tip, color: "warning" });
		}

		ctx.ui.setSidebarSections(sections);
	});

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setSidebarSections([{ label: "Status", value: "Session started" }]);
	});

	pi.registerCommand("vanity", {
		description: "Navigate sidebar insights and trigger actions",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;

			const sections: string[] = [];
			if (lastInsight) {
				sections.push(`Status: ${lastInsight.status}`);
				sections.push(`Context: ${lastInsight.context}`);
				sections.push(`Focus: ${lastInsight.focus}`);
				if (lastInsight.tip) sections.push(`Tip: ${lastInsight.tip}`);
				sections.push("─── Actions ───");
			}

			sections.push("Session Health");
			sections.push("Git Status");
			sections.push("Recent Commits");

			const choice = await ctx.ui.select(
				lastInsight ? "Vanity — sidebar insights" : "Vanity — no insights yet (send a message first)",
				sections,
			);

			if (!choice) return;

			if (choice === "Session Health") {
				const contextUsage = ctx.getContextUsage();
				const pct = contextUsage?.percent?.toFixed(1) ?? "?";
				const confirm = await ctx.ui.confirm(
					`Session Health · ${pct}% context used`,
					`Model: ${ctx.model?.id ?? "unknown"}\nContext: ${pct}%\n\nRun /compact to free up context?`,
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
				return;
			}

			// Insight lines — inject into editor for agent to act on
			if (choice.includes(":")) {
				ctx.ui.setEditorText(`Tell me more about: ${choice}`);
			}
		},
	});
}
