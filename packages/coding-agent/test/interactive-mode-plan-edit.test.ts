import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Container } from "@mariozechner/pi-tui";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";
import { getMarkdownTheme, initTheme } from "../src/modes/interactive/theme/theme.js";

function renderAll(container: Container, width = 220): string {
	return container.children
		.flatMap((child) => child.render(width))
		.join("\n")
		.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("InteractiveMode plan/edit controls", () => {
	const tempDirs: string[] = [];

	beforeAll(() => {
		initTheme("dark");
	});

	afterEach(() => {
		while (tempDirs.length > 0) {
			rmSync(tempDirs.pop()!, { recursive: true, force: true });
		}
	});

	test("setPlanMode persists the flag, rebuilds the prompt, and shows status", () => {
		const fakeThis: any = {
			settingsManager: { setPlanMode: vi.fn() },
			session: { rebuildSystemPrompt: vi.fn() },
			ui: { requestRender: vi.fn() },
			showStatus: vi.fn(),
		};

		(InteractiveMode as any).prototype.setPlanMode.call(fakeThis, true);

		expect(fakeThis.settingsManager.setPlanMode).toHaveBeenCalledWith(true);
		expect(fakeThis.session.rebuildSystemPrompt).toHaveBeenCalledTimes(1);
		expect(fakeThis.ui.requestRender).toHaveBeenCalledTimes(1);
		expect(fakeThis.showStatus).toHaveBeenCalledWith("Plan mode: on");
	});

	test("setEditMode persists the flag, rebuilds the prompt, and shows status", () => {
		const fakeThis: any = {
			settingsManager: { setEditMode: vi.fn() },
			session: { rebuildSystemPrompt: vi.fn() },
			ui: { requestRender: vi.fn() },
			showStatus: vi.fn(),
		};

		(InteractiveMode as any).prototype.setEditMode.call(fakeThis, false);

		expect(fakeThis.settingsManager.setEditMode).toHaveBeenCalledWith(false);
		expect(fakeThis.session.rebuildSystemPrompt).toHaveBeenCalledTimes(1);
		expect(fakeThis.ui.requestRender).toHaveBeenCalledTimes(1);
		expect(fakeThis.showStatus).toHaveBeenCalledWith("Edit mode: off");
	});

	test("/plan and /edit commands dispatch the parsed on/off state", () => {
		const fakeThis: any = {
			setPlanMode: vi.fn(),
			setEditMode: vi.fn(),
			showError: vi.fn(),
		};

		(InteractiveMode as any).prototype.handlePlanCommand.call(fakeThis, "on");
		(InteractiveMode as any).prototype.handleEditCommand.call(fakeThis, "off");

		expect(fakeThis.setPlanMode).toHaveBeenCalledWith(true);
		expect(fakeThis.setEditMode).toHaveBeenCalledWith(false);
		expect(fakeThis.showError).not.toHaveBeenCalled();
	});

	test("/plan and /edit toggle when called without args", () => {
		const fakeThis: any = {
			settingsManager: { getPlanMode: vi.fn().mockReturnValue(false), getEditMode: vi.fn().mockReturnValue(true) },
			setPlanMode: vi.fn(),
			setEditMode: vi.fn(),
			showError: vi.fn(),
		};

		(InteractiveMode as any).prototype.handlePlanCommand.call(fakeThis, undefined);
		(InteractiveMode as any).prototype.handleEditCommand.call(fakeThis, "");

		expect(fakeThis.setPlanMode).toHaveBeenCalledWith(true);
		expect(fakeThis.setEditMode).toHaveBeenCalledWith(false);
		expect(fakeThis.showError).not.toHaveBeenCalled();
	});

	test("/plan and /edit commands show usage for invalid values", () => {
		const fakeThis: any = {
			settingsManager: { getPlanMode: vi.fn(), getEditMode: vi.fn() },
			setPlanMode: vi.fn(),
			setEditMode: vi.fn(),
			showError: vi.fn(),
		};

		(InteractiveMode as any).prototype.handlePlanCommand.call(fakeThis, "maybe");
		(InteractiveMode as any).prototype.handleEditCommand.call(fakeThis, "yes");

		expect(fakeThis.showError).toHaveBeenCalledWith("Usage: /plan [on|off]");
		expect(fakeThis.showError).toHaveBeenCalledWith("Usage: /edit [on|off]");
		expect(fakeThis.setPlanMode).not.toHaveBeenCalled();
		expect(fakeThis.setEditMode).not.toHaveBeenCalled();
	});

	test("/hotkeys and /shortcut include plan and edit toggles", () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			session: { extensionRunner: { getShortcuts: vi.fn().mockReturnValue(new Map()) } },
			keybindings: { getEffectiveConfig: vi.fn().mockReturnValue({}) },
			ui: { requestRender: vi.fn() },
			getMarkdownThemeWithSettings: () => getMarkdownTheme(),
			getAppKeyDisplay: (action: string) => action,
			getEditorKeyDisplay: (action: string) => action,
		};

		(InteractiveMode as any).prototype.handleHotkeysCommand.call(fakeThis);

		const rendered = renderAll(fakeThis.chatContainer);
		expect(rendered).toContain("Toggle plan mode");
		expect(rendered).toContain("Toggle edit mode");
	});

	test("executes a completed plan in a fresh non-plan session when confirmed", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "piper-plan-exec-"));
		tempDirs.push(tempDir);
		const planPath = join(tempDir, "handoff.md");
		writeFileSync(planPath, "# Handoff\n\n## Plan\n- [ ] Do the work");

		const newSession = { prompt: vi.fn().mockResolvedValue(undefined) };
		const oldSession = {
			consumeCompletedPlanContext: vi.fn().mockReturnValue({ path: planPath }),
			sessionFile: join(tempDir, "planning-session.jsonl"),
		};
		const fakeThis: any = {
			session: oldSession,
			runtimeHost: {
				session: newSession,
				newSession: vi.fn().mockImplementation(async () => {
					fakeThis.session = newSession;
					return { cancelled: false };
				}),
			},
			showExtensionConfirm: vi.fn().mockResolvedValue(true),
			setPlanMode: vi.fn(),
			renderCurrentSessionState: vi.fn(),
			showStatus: vi.fn(),
			showError: vi.fn(),
			buildPlanExecutionPrompt: (InteractiveMode as any).prototype.buildPlanExecutionPrompt,
		};

		await (InteractiveMode as any).prototype.maybeOfferPlanExecution.call(fakeThis);

		expect(fakeThis.showExtensionConfirm).toHaveBeenCalledWith(
			"Execute plan",
			expect.stringContaining("Start a fresh session with plan mode off"),
		);
		expect(fakeThis.setPlanMode).toHaveBeenCalledWith(false);
		expect(fakeThis.runtimeHost.newSession).toHaveBeenCalledWith({ parentSession: oldSession.sessionFile });
		expect(newSession.prompt).toHaveBeenCalledWith(
			expect.stringContaining("# Handoff"),
			expect.objectContaining({ suppressSubagentScheduler: true }),
		);
		expect(fakeThis.showError).not.toHaveBeenCalled();
	});
});
