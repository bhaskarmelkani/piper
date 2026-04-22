import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { buildSubagentSchedulerPlan, shouldAutoPlanForSchedulePlan } from "../src/core/subagents/scheduler.js";
import { createHarness, getUserTexts } from "./suite/harness.js";

describe("subagent scheduler", () => {
	it("suggests parallel scouts for broad repo exploration", () => {
		const plan = buildSubagentSchedulerPlan({
			cwd: process.cwd(),
			prompt: "Trace the auth flow across the CLI, session setup, and provider request path in this repo.",
			activeToolNames: ["read", "search_code", "symbols_overview", "subagent"],
			mutationStarted: false,
		});

		expect(plan?.mode).toBe("parallel");
		expect(shouldAutoPlanForSchedulePlan(plan)).toBe(true);
		expect(plan?.tasks).toHaveLength(2);
		expect(plan?.tasks.every((task) => task.role === "scout")).toBe(true);
	});

	it("suggests scout then planner for implementation-planning requests", () => {
		const plan = buildSubagentSchedulerPlan({
			cwd: process.cwd(),
			prompt:
				"Before editing, plan the implementation for the subagent scheduler in packages/coding-agent/src/core/agent-session.ts.",
			activeToolNames: ["read", "search_code", "symbols_overview", "subagent"],
			mutationStarted: false,
		});

		expect(plan?.mode).toBe("chain");
		expect(shouldAutoPlanForSchedulePlan(plan)).toBe(true);
		expect(plan?.tasks.map((task) => task.role)).toEqual(["scout", "planner"]);
		expect(plan?.note).toContain("{previous}");
	});

	it("stays single-agent for small direct edit tasks", () => {
		const plan = buildSubagentSchedulerPlan({
			cwd: process.cwd(),
			prompt: "Rename this variable in this file.",
			activeToolNames: ["read", "search_code", "symbols_overview", "subagent"],
			mutationStarted: false,
		});

		expect(plan).toBeUndefined();
		expect(shouldAutoPlanForSchedulePlan(plan)).toBe(false);
	});

	it("never auto-spawns a worker", () => {
		const plan = buildSubagentSchedulerPlan({
			cwd: process.cwd(),
			prompt:
				"Review the recent changes in packages/coding-agent/src/core/tools/subagent.ts for bugs and regressions.",
			activeToolNames: ["read", "search_code", "symbols_overview", "subagent"],
			mutationStarted: false,
		});

		expect(plan?.tasks.map((task) => task.role)).not.toContain("worker");
	});

	it("suppresses automatic delegation after mutation begins", () => {
		const plan = buildSubagentSchedulerPlan({
			cwd: process.cwd(),
			prompt: "Trace the edit flow in packages/coding-agent/src/core/tools/edit.ts and summarize the mutation path.",
			activeToolNames: ["read", "search_code", "symbols_overview", "subagent"],
			mutationStarted: true,
		});

		expect(plan).toBeUndefined();
	});
});

describe("subagent scheduler prompt injection", () => {
	const harnesses: Array<Awaited<ReturnType<typeof createHarness>>> = [];

	afterEach(() => {
		for (const harness of harnesses) {
			harness.cleanup();
		}
		harnesses.length = 0;
	});

	it("injects a hidden scheduler message for repo code exploration", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		writeFileSync(join(harness.tempDir, "package.json"), JSON.stringify({ name: "scheduler-test" }));
		harness.session.setActiveToolsByName(["read", "search_code", "symbols_overview", "subagent"]);

		harness.setResponses([
			() => {
				return {
					role: "assistant",
					content: [{ type: "text", text: "done" }],
					api: harness.getModel().api,
					provider: harness.getModel().provider,
					model: harness.getModel().id,
					usage: {
						input: 100,
						output: 50,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 150,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "stop",
					timestamp: Date.now(),
				};
			},
		]);

		await harness.session.prompt(
			"Trace the auth flow across the session setup and provider request code in this repository.",
		);

		expect(
			harness.session.messages.some(
				(message) =>
					message.role === "custom" && message.customType === "subagent_scheduler" && message.display === false,
			),
		).toBe(true);
		expect(
			harness.session.messages.some(
				(message) =>
					message.role === "custom" &&
					message.customType === "planning_context" &&
					message.display === false &&
					(message.details as { mode?: string } | undefined)?.mode === "auto",
			),
		).toBe(true);
	});

	it("does not inject a scheduler message for a simple direct task", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		mkdirSync(join(harness.tempDir, "src"), { recursive: true });
		harness.session.setActiveToolsByName(["read", "search_code", "symbols_overview", "subagent"]);

		harness.setResponses([fauxAssistantMessage("done")]);
		await harness.session.prompt("Rename this variable in this file.");

		expect(getUserTexts(harness)).toEqual(["Rename this variable in this file."]);
		expect(
			harness.session.messages.some(
				(message) => message.role === "custom" && message.customType === "subagent_scheduler",
			),
		).toBe(false);
		expect(
			harness.session.messages.some(
				(message) => message.role === "custom" && message.customType === "planning_context",
			),
		).toBe(false);
	});
});
