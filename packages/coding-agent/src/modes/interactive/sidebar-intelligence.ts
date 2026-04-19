import type { Model } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";

export type SidebarContext = {
	model: string;
	provider: string;
	contextPercent: number | null;
	contextWindow: number;
	inputTokens: number;
	outputTokens: number;
	skills: string[];
	gitBranch: string | null;
	cwd: string;
};

export type SidebarIntelligence = {
	sessionHealth: { summary: string; insight: string | null };
	skills: { summary: string };
	git: { summary: string };
	generatedAt: number;
};

const SYSTEM_PROMPT = `You are a sidebar assistant for a terminal AI coding tool.
Analyze session state and return a JSON object with terse, actionable insights.
Max 1 short line per field. Surface only what is notable or actionable.
Return ONLY valid JSON with no markdown fences and no explanation.

Required JSON format:
{
  "sessionHealth": { "summary": "short status line", "insight": "actionable tip or null" },
  "skills": { "summary": "short description of active skills" },
  "git": { "summary": "branch state description" }
}

Set "insight" to null if nothing notable. Good examples:
- sessionHealth insight: "context at 78%, consider /compact"
- skills summary: "9 skills loaded, covering PRs, migrations, and code review"
- git summary: "on feat/my-feature"`;

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

export async function generateSidebarIntelligence(
	ctx: SidebarContext,
	model: Model<any>,
	apiKey: string,
	headers: Record<string, string>,
	signal?: AbortSignal,
): Promise<SidebarIntelligence | null> {
	const promptText = `Session state:
- Model: ${ctx.provider}/${ctx.model}
- Context: ${ctx.contextPercent !== null ? `${ctx.contextPercent.toFixed(1)}%` : "unknown"} / ${formatTokens(ctx.contextWindow)}
- Tokens used: ↑${formatTokens(ctx.inputTokens)} ↓${formatTokens(ctx.outputTokens)}
- Skills (${ctx.skills.length}): ${ctx.skills.length > 0 ? ctx.skills.join(", ") : "none"}
- Git branch: ${ctx.gitBranch ?? "none"}
- CWD: ${ctx.cwd}

Return JSON insights.`;

	try {
		const response = await completeSimple(
			model,
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

		if (response.stopReason === "aborted" || response.stopReason === "error") {
			return null;
		}

		const text = response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("");

		const jsonText = text
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```\s*$/i, "")
			.trim();
		const parsed = JSON.parse(jsonText) as Omit<SidebarIntelligence, "generatedAt">;
		return { ...parsed, generatedAt: Date.now() };
	} catch {
		return null;
	}
}
