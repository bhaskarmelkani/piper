import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, getAssistantTexts, getMessageText, type Harness } from "./harness.js";

function getLastToolResultText(harness: Harness): string {
	const toolResults = harness.session.messages.filter((message) => message.role === "toolResult");
	const toolResult = toolResults[toolResults.length - 1];
	return toolResult ? getMessageText(toolResult) : "";
}

function getPlanningPath(harness: Harness): string {
	const planningMessage = harness.session.messages.find(
		(message) => message.role === "custom" && message.customType === "planning_context",
	) as { details?: { path?: string } } | undefined;
	const details = planningMessage?.details;
	if (!details?.path) {
		throw new Error("planning_context path not found");
	}
	return details.path;
}

describe("AgentSession plan/edit modes", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("blocks repo writes when edit mode is off and no confirm was given", async () => {
		const harness = await createHarness({ settings: { editMode: false } });
		harnesses.push(harness);
		const targetPath = join(harness.tempDir, "blocked.txt");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("write", { path: targetPath, content: "blocked" })], {
				stopReason: "toolUse",
			}),
			() => fauxAssistantMessage(getLastToolResultText(harness)),
		]);

		await harness.session.prompt("Write the file");

		expect(getAssistantTexts(harness)).toContain(
			"Edit mode is off. Use the confirm tool to ask for permission before editing files outside .plans.",
		);
		expect(existsSync(targetPath)).toBe(false);
	});

	it("allows confirm then write in one turn and resets approval on the next turn", async () => {
		const harness = await createHarness({ settings: { editMode: false } });
		harnesses.push(harness);
		const approvedPath = join(harness.tempDir, "approved.txt");
		const blockedPath = join(harness.tempDir, "blocked-again.txt");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("confirm", { message: "Proceed?" })], { stopReason: "toolUse" }),
			() =>
				fauxAssistantMessage([fauxToolCall("write", { path: approvedPath, content: "approved" })], {
					stopReason: "toolUse",
				}),
			fauxAssistantMessage("done"),
		]);

		await harness.session.prompt("Write the approved file");

		expect(existsSync(approvedPath)).toBe(true);
		expect(readFileSync(approvedPath, "utf-8")).toBe("approved");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("write", { path: blockedPath, content: "blocked again" })], {
				stopReason: "toolUse",
			}),
			() => fauxAssistantMessage(getLastToolResultText(harness)),
		]);

		await harness.session.prompt("Write another file");

		expect(existsSync(blockedPath)).toBe(false);
		expect(getAssistantTexts(harness)).toContain(
			"Edit mode is off. Use the confirm tool to ask for permission before editing files outside .plans.",
		);
	});

	it("allows writes to the current plan file while planning is active even when edit mode is off", async () => {
		const harness = await createHarness({ settings: { planMode: true, editMode: false } });
		harnesses.push(harness);

		harness.setResponses([
			() =>
				fauxAssistantMessage([fauxToolCall("write", { path: getPlanningPath(harness), content: "# Plan" })], {
					stopReason: "toolUse",
				}),
		]);

		await harness.session.prompt("Make a broad multi-file change");
		const planPath = getPlanningPath(harness);

		expect(
			harness.session.messages.some(
				(message) =>
					message.role === "custom" &&
					message.customType === "planning_context" &&
					message.display === false &&
					(message.details as { mode?: string } | undefined)?.mode === "on",
			),
		).toBe(true);
		expect(existsSync(planPath)).toBe(true);
		expect(readFileSync(planPath, "utf-8")).toBe("# Plan");
		expect(getLastToolResultText(harness)).toContain("Planning complete. Handoff written to");
	});

	it("blocks repo writes while planning is active even when edit mode is on", async () => {
		const harness = await createHarness({ settings: { planMode: true, editMode: true } });
		harnesses.push(harness);
		const targetPath = join(harness.tempDir, "blocked.txt");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("write", { path: targetPath, content: "blocked" })], {
				stopReason: "toolUse",
			}),
			() => fauxAssistantMessage(getLastToolResultText(harness)),
		]);

		await harness.session.prompt("Plan the work, then write the file");

		expect(existsSync(targetPath)).toBe(false);
		expect(getAssistantTexts(harness)).toContain(
			`Plan mode is on. Only update the current handoff file: ${getPlanningPath(harness)}`,
		);
	});

	it("blocks mutating bash commands while planning is active", async () => {
		const harness = await createHarness({ settings: { planMode: true, editMode: true } });
		harnesses.push(harness);
		const targetPath = join(harness.tempDir, "blocked-from-bash.txt");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("bash", { command: `touch ${targetPath}` })], {
				stopReason: "toolUse",
			}),
			() => fauxAssistantMessage(getLastToolResultText(harness)),
		]);

		await harness.session.prompt("Plan the work, then touch a file");

		expect(existsSync(targetPath)).toBe(false);
		expect(getAssistantTexts(harness)).toContain(
			"Plan mode is on. Bash is limited to read-only exploration commands until you disable plan mode.",
		);
	});

	it("terminates after writing the handoff plan instead of continuing into implementation", async () => {
		const harness = await createHarness({ settings: { planMode: true, editMode: true } });
		harnesses.push(harness);

		harness.setResponses([
			() =>
				fauxAssistantMessage([fauxToolCall("write", { path: getPlanningPath(harness), content: "# Plan" })], {
					stopReason: "toolUse",
				}),
			fauxAssistantMessage("this response should remain unused"),
		]);

		await harness.session.prompt("Create a plan and then keep going");

		expect(harness.getPendingResponseCount()).toBe(1);
		expect(getLastToolResultText(harness)).toContain("Planning complete. Handoff written to");
		expect(harness.session.consumeCompletedPlanContext()?.path).toBe(getPlanningPath(harness));
	});

	it("reports sidebar planning status from the toggle after a plan turn completes", async () => {
		const harness = await createHarness({ settings: { planMode: true, editMode: true } });
		harnesses.push(harness);

		harness.setResponses([
			() =>
				fauxAssistantMessage([fauxToolCall("write", { path: getPlanningPath(harness), content: "# Plan" })], {
					stopReason: "toolUse",
				}),
		]);

		await harness.session.prompt("Create a plan");

		expect(harness.session.planningModeStatus).toBe("on");
		harness.settingsManager.setPlanMode(false);
		expect(harness.session.planningModeStatus).toBe("off");
	});
});
