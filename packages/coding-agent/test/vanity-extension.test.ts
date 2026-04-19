import { describe, expect, it } from "vitest";
import {
	buildVanitySidebarSections,
	calculateVanityBreakdown,
	type VanityBreakdown,
} from "../examples/extensions/vanity.js";

function createBreakdown(): VanityBreakdown {
	return {
		totalUnits: 100,
		parts: [
			{ key: "system", label: "System", units: 20, percent: 20 },
			{ key: "assistant", label: "Assistant", units: 35, percent: 35 },
			{ key: "thinking", label: "Thinking", units: 10, percent: 10 },
			{ key: "tool", label: "Tool", units: 25, percent: 25 },
			{ key: "user", label: "User", units: 10, percent: 10 },
		],
		dominant: [
			{ key: "assistant", label: "Assistant", units: 35, percent: 35 },
			{ key: "tool", label: "Tool", units: 25, percent: 25 },
		],
	};
}

describe("vanity extension helpers", () => {
	it("calculates deterministic breakdown percentages from the session log", () => {
		const breakdown = calculateVanityBreakdown(
			[
				{
					type: "message",
					message: {
						role: "user",
						content: [{ type: "text", text: "Review the scroll bug and fix the sidebar." }],
						timestamp: 1,
					},
				},
				{
					type: "message",
					message: {
						role: "assistant",
						api: "anthropic-messages",
						provider: "anthropic",
						model: "claude-sonnet-4-5",
						content: [
							{ type: "thinking", thinking: "Need to inspect the viewport and render path carefully." },
							{ type: "text", text: "I audited the viewport and narrowed the flicker to resize invalidation." },
							{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "packages/tui/src/tui.ts" } },
						],
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "toolUse",
						timestamp: 2,
					},
				},
				{
					type: "message",
					message: {
						role: "toolResult",
						toolCallId: "tool-1",
						toolName: "read",
						content: [{ type: "text", text: "Successfully read tui.ts" }],
						isError: false,
						timestamp: 3,
					},
				},
			],
			"You are piper. Keep answers concise and technical.",
		);

		const labels = breakdown.parts.map((part) => part.label);
		expect(labels).toEqual(["System", "Assistant", "Thinking", "Tool", "User"]);
		expect(breakdown.totalUnits).toBeGreaterThan(0);
		expect(breakdown.parts.reduce((sum, part) => sum + part.percent, 0)).toBe(100);
		expect(breakdown.dominant[0]?.label).toBe("Assistant");
	});

	it("builds compact sidebar sections and marks stale analyses", () => {
		const sections = buildVanitySidebarSections(
			{
				turnIndex: 7,
				breakdown: createBreakdown(),
				insight: {
					status: "Audited render stability",
					sidebar: "low pressure",
					focus: "scroll hardening",
					contextNarrative: "12.3% used. Assistant 35% · Tool 25% · System 20% · Thinking 10% · User 10%.",
					nextAction: "Run the scroll regression tests.",
				},
				isStale: true,
				staleTurns: 3,
			},
			12.3,
		);

		expect(sections).toEqual([
			{
				label: "Session Health",
				value: "12.3% used · low pressure",
				color: "success",
			},
			{ label: "Focus", value: "scroll hardening", color: "accent" },
			{ label: "Breakdown", value: "assistant 35% · tool 25%" },
			{ label: "Next", value: "Run the scroll regression tests.", color: "warning" },
			{ label: "Analysis", value: "stale by 3 turns", color: "warning" },
		]);
	});
});
