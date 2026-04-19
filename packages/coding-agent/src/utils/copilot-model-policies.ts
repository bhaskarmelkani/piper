const COPILOT_HEADERS = {
	"User-Agent": "GitHubCopilotChat/0.35.0",
	"Editor-Version": "vscode/1.107.0",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Copilot-Integration-Id": "vscode-chat",
} as const;

export type CopilotModelPolicy = {
	multiplier?: number;
	disabled: boolean;
};

/**
 * Static multiplier table from https://docs.github.com/en/copilot/concepts/billing/copilot-requests#model-multipliers
 * Reflects paid-plan multipliers. Updated: 2026-04-19.
 * Used as fallback when the live Copilot API call fails or returns no multiplier.
 */
export const COPILOT_MULTIPLIERS: Record<string, number> = {
	// Claude
	"claude-haiku-4.5": 0.33,
	"claude-opus-4.5": 3,
	"claude-opus-4.6": 3,
	"claude-opus-4.7": 7.5,
	"claude-sonnet-4": 1,
	"claude-sonnet-4.5": 1,
	"claude-sonnet-4.6": 1,
	// Gemini
	"gemini-2.5-pro": 1,
	"gemini-3-flash-preview": 0.33,
	"gemini-3.1-pro-preview": 1,
	// GPT — included models (free on paid plans)
	"gpt-4.1": 0,
	"gpt-4o": 0,
	"gpt-5-mini": 0,
	// GPT — premium
	"gpt-5.2": 1,
	"gpt-5.2-codex": 1,
	"gpt-5.3-codex": 1,
	"gpt-5.4": 1,
	"gpt-5.4-mini": 0.33,
	// Grok
	"grok-code-fast-1": 0.25,
};

/**
 * Fetches model policies from the Copilot API to get premium multipliers and disabled status.
 * Returns a map of modelId -> policy. Returns empty map on any failure.
 */
export async function fetchCopilotModelPolicies(
	token: string,
	baseUrl: string,
): Promise<Map<string, CopilotModelPolicy>> {
	try {
		const response = await fetch(`${baseUrl}/models`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
				...COPILOT_HEADERS,
			},
			signal: AbortSignal.timeout(2500),
		});
		if (!response.ok) return new Map();

		const raw = (await response.json()) as unknown;
		if (!raw || typeof raw !== "object") return new Map();

		const data = (raw as Record<string, unknown>).data;
		if (!Array.isArray(data)) return new Map();

		const result = new Map<string, CopilotModelPolicy>();
		for (const entry of data) {
			if (!entry || typeof entry !== "object") continue;
			const m = entry as Record<string, unknown>;
			const id = typeof m.id === "string" ? m.id : undefined;
			if (!id) continue;

			const multiplier =
				typeof m.premium_requests_multiplier === "number" ? m.premium_requests_multiplier : undefined;

			// Only filter on explicit signals: is_disabled flag or policy explicitly set to "disabled"
			const policyState =
				m.policy && typeof m.policy === "object"
					? ((m.policy as Record<string, unknown>).state as string | undefined)
					: undefined;
			const disabled = m.is_disabled === true || policyState === "disabled";

			result.set(id, { multiplier, disabled });
		}
		return result;
	} catch {
		return new Map();
	}
}
