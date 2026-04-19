import { Container, CURSOR_MARKER, type TUI } from "@mariozechner/pi-tui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BottomDockLayout } from "../../tui/src/components/bottom-dock-layout.js";
import { HorizontalSplit } from "../../tui/src/components/horizontal-split.js";
import { Viewport } from "../../tui/src/components/viewport.js";
import { visibleWidth } from "../../tui/src/utils.js";
import {
	buildCopilotSidebarSections,
	discoverGitHubToken,
	parseCopilotUsageResponse,
} from "../examples/extensions/copilot-budget.js";
import type { AgentSession } from "../src/core/agent-session.js";
import type { ReadonlyFooterDataProvider } from "../src/core/footer-data-provider.js";
import { KeybindingsManager } from "../src/core/keybindings.js";
import { CustomEditor } from "../src/modes/interactive/components/custom-editor.js";
import { renderDiff } from "../src/modes/interactive/components/diff.js";
import { ShellDockComponent } from "../src/modes/interactive/components/shell-dock.js";
import { ShellSidebarComponent } from "../src/modes/interactive/components/shell-sidebar.js";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";
import { getEditorTheme, initTheme } from "../src/modes/interactive/theme/theme.js";

function lineComponent(...lines: string[]) {
	return {
		render: () => lines,
		invalidate: () => {},
	};
}

function stripAnsi(value: string | undefined): string {
	return (value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
}

function createSession(): AgentSession {
	const session = {
		model: {
			id: "claude-sonnet-4.6",
			provider: "github-copilot",
			contextWindow: 1_000_000,
			reasoning: true,
		},
		thinkingLevel: "medium",
		state: {
			model: {
				id: "claude-sonnet-4.6",
				provider: "github-copilot",
				contextWindow: 1_000_000,
				reasoning: true,
			},
			thinkingLevel: "medium",
		},
		sessionManager: {
			getEntries: () => [
				{
					type: "message",
					message: {
						role: "user",
						content: [{ type: "text", text: "Investigate Copilot sidebar usage" }],
					},
				},
				{
					type: "message",
					message: {
						role: "assistant",
						usage: {
							input: 1234,
							output: 567,
							cacheRead: 0,
							cacheWrite: 0,
							cost: { total: 0.25 },
						},
					},
				},
			],
			getSessionName: () => undefined,
			getCwd: () => "/Users/test/project",
		},
		getContextUsage: () => ({ tokens: 123_000, contextWindow: 1_000_000, percent: 12.3 }),
		modelRegistry: {
			isUsingOAuth: () => false,
		},
	};

	return session as unknown as AgentSession;
}

function createFooterData(): ReadonlyFooterDataProvider {
	return {
		getGitBranch: () => "main",
		getExtensionStatuses: () => new Map<string, string>(),
		getAvailableProviderCount: () => 2,
		onBranchChange: () => () => {},
	};
}

describe("interactive shell layout primitives", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	it("clips transcript content inside a bottom-anchored viewport", () => {
		const viewport = new Viewport(lineComponent("1", "2", "3", "4", "5", "6"), {
			height: 3,
			anchor: "bottom",
		});

		expect(viewport.render(80)).toEqual(["4", "5", "6"]);

		viewport.setScrollOffset(2);
		expect(viewport.render(80)).toEqual(["2", "3", "4"]);
		expect(viewport.getMaxScrollOffset()).toBe(3);
	});

	it("keeps the dock fixed at the bottom of the frame", () => {
		let lastTopHeight = -1;
		const layout = new BottomDockLayout(
			{
				render: () => Array.from({ length: lastTopHeight }, (_, index) => `top-${index + 1}`),
				invalidate: () => {},
			},
			lineComponent("dock-1", "dock-2", "dock-3"),
			() => 7,
			(measurement) => {
				lastTopHeight = measurement.topHeight;
			},
		);

		expect(layout.render(80)).toEqual(["top-1", "top-2", "top-3", "top-4", "dock-1", "dock-2", "dock-3"]);
	});

	it("caps dock growth while keeping hints, composer, and footer visible", () => {
		const dock = new ShellDockComponent(
			lineComponent("hints"),
			lineComponent("transient-1", "transient-2", "transient-3", "transient-4"),
			lineComponent("editor-1", "editor-2"),
			lineComponent(),
			lineComponent("footer"),
			() => 6,
		);

		expect(dock.render(80)).toEqual(["hints", "transient-1", "transient-2", "editor-1", "editor-2", "footer"]);
	});

	it("renders a padded placeholder for an empty composer", () => {
		const tui = {
			terminal: { rows: 24, columns: 80 },
			requestRender: vi.fn(),
		} as unknown as TUI;
		const editor = new CustomEditor(tui, getEditorTheme(), KeybindingsManager.create(), {
			paddingX: 1,
			placeholder: "Ask piper, add @files, or use /commands",
		});

		editor.focused = true;

		const rendered = editor.render(40);
		const composerLine = rendered[1] ?? "";
		expect(rendered).toHaveLength(3);
		expect(composerLine).toContain(CURSOR_MARKER);
		expect(composerLine).toContain("Ask piper");
		expect(composerLine).toContain("@files");
		expect(composerLine.startsWith(" ")).toBe(true);
		expect(visibleWidth(composerLine)).toBe(40);
		expect(rendered[2]).toBe(" ".repeat(40));
	});

	it("keeps slash-command autocomplete but drops the lower composer rule", () => {
		const tui = {
			terminal: { rows: 24, columns: 80 },
			requestRender: vi.fn(),
		} as unknown as TUI;
		const editor = new CustomEditor(tui, getEditorTheme(), KeybindingsManager.create(), {
			paddingX: 1,
			placeholder: "Ask piper, add @files, or use /commands",
		});

		editor.setText("/");
		editor.focused = true;
		Object.assign(editor as unknown as object, {
			autocompleteState: "regular",
			autocompleteList: {
				render: () => ["> settings", "  model"],
			},
		});

		const rendered = editor.render(40);
		expect(rendered).toHaveLength(5);
		expect(rendered[1]).toContain("/");
		expect(rendered[2]).toBe(" ".repeat(40));
		expect(rendered[3]).toContain("> settings");
		expect(rendered[4]).toContain("model");
	});

	it("renders a full-height sidebar with contextual sections", () => {
		const sidebar = new ShellSidebarComponent(createSession(), createFooterData());
		sidebar.setHeight(30);
		sidebar.setResourceSections([
			{ label: "Copilot Budget", value: "25%", order: 20, color: "success" } as any,
			{ label: "Context File", value: "AGENTS.md", order: 30 } as any,
			{ label: "Skills", value: "review, write", order: 40 } as any,
		]);

		const rendered = sidebar.render(30).join("\n");
		expect(sidebar.render(30)).toHaveLength(30);
		expect(rendered).toContain("claude-sonnet-4.6");
		expect(rendered).toContain("Investigate Copilot sidebar");
		expect(rendered).toContain("x1");
		expect(rendered).toContain("Usage");
		expect(rendered).toContain("25%");
		expect(rendered).toContain("main");
		expect(rendered).toContain("Skills");
	});

	it("renders a continuous shell row across transcript and sidebar widths", () => {
		const split = new HorizontalSplit(lineComponent("transcript"), lineComponent("sidebar"), 8);
		const [line] = split.render(24);
		expect(visibleWidth(line)).toBe(24);
		expect(line).toContain("transcript");
		expect(line).toContain("sidebar");
	});

	it("renders semantic thinking and context states in the sidebar", () => {
		const sidebar = new ShellSidebarComponent(createSession(), createFooterData());
		sidebar.setHeight(18);
		const rendered = sidebar.render(30).join("\n");
		expect(rendered).toContain("Thinking");
		expect(rendered).toContain("medium");
		expect(rendered).toContain("Context");
		expect(rendered).toContain("━");
		expect(rendered).toContain("12%");
		expect(rendered).toContain("123k / 1.0M");
	});

	it("adds breathing room between context usage and context resource rows", () => {
		const sidebar = new ShellSidebarComponent(createSession(), createFooterData());
		sidebar.setHeight(24);
		sidebar.setResourceSections([{ label: "Context File", value: "AGENTS.md", order: 30 } as any]);

		const lines = sidebar.render(30);
		const contextSummaryIndex = lines.findIndex((line) => line.includes("123k / 1.0M"));
		expect(contextSummaryIndex).toBeGreaterThanOrEqual(0);
		expect(stripAnsi(lines[contextSummaryIndex + 1]).trim()).toBe("│");
		expect(lines[contextSummaryIndex + 2]).toContain("Context File");
	});

	it("uses dividers and short workspace labels in the sidebar", () => {
		const sidebar = new ShellSidebarComponent(createSession(), createFooterData());
		sidebar.setHeight(24);
		const rendered = sidebar.render(30).join("\n");
		expect(rendered).toContain("─");
		expect(rendered).toContain("Workspace");
		expect(rendered).toContain("project");
		expect(rendered).not.toContain("/Users/test/project");
	});

	it("renders workspace as a footer section with bottom padding", () => {
		const sidebar = new ShellSidebarComponent(createSession(), createFooterData());
		sidebar.setHeight(30);
		const lines = sidebar.render(30);
		const workspaceIndex = lines.findIndex((line) => stripAnsi(line).includes("Workspace"));
		expect(workspaceIndex).toBeGreaterThanOrEqual(0);
		expect(stripAnsi(lines[workspaceIndex - 2])).toContain("─");
		expect(stripAnsi(lines[workspaceIndex - 1]).trim()).toBe("│");
		expect(stripAnsi(lines.at(-1))).toBe(" ".repeat(30));
	});

	it("skips malformed sidebar sections instead of crashing", () => {
		const sidebar = new ShellSidebarComponent(createSession(), createFooterData());
		sidebar.setHeight(18);
		sidebar.setResourceSections([
			{ label: "Skills", value: "review, write" },
			{ label: "Broken", value: undefined as unknown as string },
			{ label: undefined as unknown as string, value: "oops" },
		]);

		const rendered = sidebar.render(30).join("\n");
		expect(rendered).toContain("Skills");
		expect(rendered).not.toContain("Broken");
	});
});

describe("interactive shell routing", () => {
	it("mounts selector flows into the dock interaction slot", () => {
		let capturedDone: (() => void) | undefined;
		const fakeThis: any = {
			editor: { name: "editor" },
			interactionContainer: new Container(),
			ui: {
				setFocus: vi.fn(),
				requestRender: vi.fn(),
			},
			showDockInteraction(component: unknown, focus: unknown) {
				this.interactionContainer.clear();
				this.interactionContainer.addChild(component as any);
				this.ui.setFocus(focus);
				this.ui.requestRender();
			},
			restoreComposerFocus() {
				this.interactionContainer.clear();
				this.ui.setFocus(this.editor);
				this.ui.requestRender();
			},
		};

		(InteractiveMode as any).prototype.showSelector.call(fakeThis, (done: () => void) => {
			capturedDone = done;
			const component = lineComponent("selector");
			return { component, focus: component };
		});

		expect(fakeThis.interactionContainer.children).toHaveLength(1);
		expect(fakeThis.ui.setFocus).toHaveBeenCalledTimes(1);

		capturedDone?.();
		expect(fakeThis.interactionContainer.children).toHaveLength(0);
		expect(fakeThis.ui.setFocus).toHaveBeenLastCalledWith(fakeThis.editor);
	});

	it("updates transcript scroll state through the helper methods", () => {
		const fakeThis: any = {
			transcriptScrollOffset: 0,
			scrollTarget: 0,
			scrollSmoothed: 0,
			scrollAnimTimer: undefined,
			transcriptViewport: {
				setScrollOffset: vi.fn(),
				getHeight: () => 8,
				getMaxScrollOffset: () => 25,
			},
			ui: { requestRender: vi.fn() },
			cancelScrollAnim: (InteractiveMode as any).prototype.cancelScrollAnim,
			setTranscriptScrollOffset: (InteractiveMode as any).prototype.setTranscriptScrollOffset,
			scrollTranscriptBy: (InteractiveMode as any).prototype.scrollTranscriptBy,
		};

		(InteractiveMode as any).prototype.scrollTranscriptBy.call(fakeThis, 3);
		expect(fakeThis.transcriptScrollOffset).toBe(3);

		(InteractiveMode as any).prototype.scrollTranscriptPage.call(fakeThis, "up");
		expect(fakeThis.transcriptScrollOffset).toBe(9);

		(InteractiveMode as any).prototype.scrollTranscriptToBoundary.call(fakeThis, "bottom");
		expect(fakeThis.transcriptScrollOffset).toBe(0);

		(InteractiveMode as any).prototype.scrollTranscriptToBoundary.call(fakeThis, "top");
		expect(fakeThis.transcriptScrollOffset).toBe(25);
	});

	it("drops wheel scroll events that push past a transcript boundary", () => {
		const fakeThis: any = {
			scrollTarget: 0,
			scrollSmoothed: 0,
			transcriptScrollOffset: 0,
			scrollAnimTimer: undefined,
			transcriptViewport: {
				getMaxScrollOffset: () => 12,
			},
			tickScrollAnim: vi.fn(),
		};

		(InteractiveMode as any).prototype.addWheelScroll.call(fakeThis, "down");
		expect(fakeThis.scrollTarget).toBe(0);
		expect(fakeThis.tickScrollAnim).not.toHaveBeenCalled();

		fakeThis.scrollTarget = 12;
		fakeThis.transcriptScrollOffset = 12;
		(InteractiveMode as any).prototype.addWheelScroll.call(fakeThis, "up");
		expect(fakeThis.scrollTarget).toBe(12);
		expect(fakeThis.tickScrollAnim).not.toHaveBeenCalled();
	});

	it("routes transcript keyboard and wheel input; non-wheel clicks pass through", () => {
		const editor = { handleInput: vi.fn() };
		const fakeThis: any = {
			keybindings: {
				matches: vi.fn((data: string, key: string) => data === "KEY_PAGE_UP" && key === "app.transcript.pageUp"),
			},
			editor,
			addWheelScroll: vi.fn(),
			scrollTranscriptPage: vi.fn(),
			scrollTranscriptToBoundary: vi.fn(),
			getWheelDirection: (InteractiveMode as any).prototype.getWheelDirection,
			wheelButtonToDirection: (InteractiveMode as any).prototype.wheelButtonToDirection,
		};

		// Keyboard page-up → consumed
		const keyResult = (InteractiveMode as any).prototype.handleTranscriptInput.call(fakeThis, "KEY_PAGE_UP");
		expect(keyResult).toEqual({ consume: true });
		expect(fakeThis.scrollTranscriptPage).toHaveBeenCalledWith("up");

		// SGR wheel up (button 64) → addWheelScroll("up")
		const wheelUp = (InteractiveMode as any).prototype.handleTranscriptInput.call(fakeThis, "\x1b[<64;10;5M");
		expect(wheelUp).toEqual({ consume: true });
		expect(fakeThis.addWheelScroll).toHaveBeenCalledWith("up");

		// SGR wheel down (button 65) → addWheelScroll("down")
		const wheelDown = (InteractiveMode as any).prototype.handleTranscriptInput.call(fakeThis, "\x1b[<65;10;5M");
		expect(wheelDown).toEqual({ consume: true });
		expect(fakeThis.addWheelScroll).toHaveBeenCalledWith("down");

		// Wheel with Shift modifier (button 68 = 64|4) → still a scroll event
		const modWheel = (InteractiveMode as any).prototype.handleTranscriptInput.call(fakeThis, "\x1b[<68;10;5M");
		expect(modWheel).toEqual({ consume: true });

		// Legacy X10 wheel scroll down → consumed
		const legacy = (InteractiveMode as any).prototype.handleTranscriptInput.call(
			fakeThis,
			`\x1b[M${String.fromCharCode(32 + 65)}!!`,
		);
		expect(legacy).toEqual({ consume: true });

		// Regular left-click (button 0) → NOT consumed, passes to editor
		const click = (InteractiveMode as any).prototype.handleTranscriptInput.call(fakeThis, "\x1b[<0;10;5M");
		expect(click).toBeUndefined();

		// Ordinary character → not consumed
		expect((InteractiveMode as any).prototype.handleTranscriptInput.call(fakeThis, "a")).toBeUndefined();
	});

	it("merges keyed sidebar contributions in deterministic order", () => {
		const setResourceSections = vi.fn();
		const fakeThis: any = {
			sidebarContributions: new Map(),
			sidebarContributionSequence: 0,
			sidebarComponent: { setResourceSections },
			ui: { requestRender: vi.fn() },
			getFlattenedSidebarSections: (InteractiveMode as any).prototype.getFlattenedSidebarSections,
			applySidebarContributions: (InteractiveMode as any).prototype.applySidebarContributions,
			setSidebarSectionsForKey: (InteractiveMode as any).prototype.setSidebarSectionsForKey,
		};

		(InteractiveMode as any).prototype.setSidebarSectionsForKey.call(
			fakeThis,
			"builtin",
			[{ label: "Skills", value: "review" }],
			{ order: 100 },
		);
		(InteractiveMode as any).prototype.setSidebarSectionsForKey.call(
			fakeThis,
			"budget",
			[{ label: "Copilot", value: "████ 25%" }],
			{ order: 30 },
		);
		(InteractiveMode as any).prototype.setSidebarSectionsForKey.call(
			fakeThis,
			"vanity",
			[{ label: "Status", value: "Session started" }],
			{ order: 40 },
		);

		expect(setResourceSections).toHaveBeenLastCalledWith([
			{ label: "Copilot", value: "████ 25%", order: 30 },
			{ label: "Status", value: "Session started", order: 40 },
			{ label: "Skills", value: "review", order: 100 },
		]);
	});

	it("pushes loaded resource summaries into the sidebar", () => {
		const setSidebarSectionsForKey = vi.fn();
		const fakeThis: any = {
			options: { verbose: false },
			settingsManager: { getQuietStartup: () => true },
			toolOutputExpanded: false,
			chatContainer: new Container(),
			sidebarComponent: {
				setResourceSections: vi.fn(),
			},
			setSidebarSectionsForKey,
			session: {
				promptTemplates: [{ name: "fix", filePath: "/tmp/prompts/fix.md" }],
				extensionRunner: undefined,
				resourceLoader: {
					getAgentsFiles: () => ({ agentsFiles: [{ path: "/tmp/project/AGENTS.md" }] }),
					getSkills: () => ({ skills: [{ filePath: "/tmp/skills/review.md", name: "review" }], diagnostics: [] }),
					getPrompts: () => ({ prompts: [], diagnostics: [] }),
					getExtensions: () => ({
						extensions: [{ path: "/tmp/extensions/foo.ts", sourceInfo: undefined }],
						errors: [],
						runtime: {},
					}),
					getThemes: () => ({ themes: [], diagnostics: [] }),
				},
			},
			formatDisplayPath: (p: string) => p,
			formatContextPath: (p: string) => p.split("/").pop(),
			getStartupExpansionState: () => false,
			buildScopeGroups: () => [],
			formatScopeGroups: () => "resource-list",
			getShortPath: (p: string) => p,
			getCompactPathLabel: (p: string) => p.split("/").pop(),
			getCompactExtensionLabels: (extensions: Array<{ path: string }>) =>
				extensions.map((entry) => entry.path.split("/").pop()),
			formatDiagnostics: () => "diagnostics",
			getBuiltInCommandConflictDiagnostics: () => [],
			findSourceInfoForPath: () => undefined,
		};

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, { force: false });

		expect(setSidebarSectionsForKey).toHaveBeenCalledWith(
			"__builtin_context__",
			[{ label: "Context File", value: "AGENTS.md" }],
			{ order: 30 },
		);
		expect(setSidebarSectionsForKey).toHaveBeenCalledWith(
			"__builtin_capabilities__",
			[
				{ label: "Skills", value: "review" },
				{ label: "Prompts", value: "/fix" },
				{ label: "Extensions", value: "foo.ts" },
			],
			{ order: 40 },
		);
	});

	it("offers agentic vanity actions when vanity sidebar sections exist", async () => {
		const selections = ["Deep-dive sidebar"];
		const fakeThis: any = {
			session: {
				resourceLoader: { getSkills: () => ({ skills: [] }) },
				getContextUsage: () => ({ percent: 18.2 }),
				model: { provider: "github-copilot", id: "gpt-4.1" },
			},
			footerDataProvider: {
				getGitBranch: () => "main",
			},
			sidebarContributions: new Map([
				[
					"vanity",
					{
						sections: [
							{ label: "Session Health", value: "18.2% used · low pressure" },
							{ label: "Next", value: "Run the scroll regression tests." },
						],
					},
				],
			]),
			showExtensionSelector: vi.fn(async (_title: string, options: string[]) => {
				const next = selections.shift();
				expect(options).toContain("Deep-dive sidebar");
				return next;
			}),
		};

		const result = await (InteractiveMode as any).prototype.handleVanityCommand.call(fakeThis);
		expect(result).toContain("Deep-dive the current sidebar state");
		expect(result).toContain("Session Health: 18.2% used · low pressure");
		expect(result).toContain("Next: Run the scroll regression tests.");
	});
});

describe("copilot budget sidebar helpers", () => {
	it("parses paid Copilot quota responses", () => {
		const parsed = parseCopilotUsageResponse({
			quota_snapshots: {
				premium_interactions: {
					entitlement: 1000,
					remaining: 750,
					unlimited: false,
					overage_count: 3,
					overage_permitted: true,
				},
			},
			quota_reset_date_utc: "2026-05-01T00:00:00.000Z",
		});

		expect(parsed).toEqual({
			used: 250,
			entitlement: 1000,
			percent: 25,
			unlimited: false,
			overageCount: 3,
			overagePermitted: true,
			resetDate: "2026-05-01T00:00:00.000Z",
			tier: "paid",
		});
	});

	it("builds degraded sidebar output when usage sync is unavailable", () => {
		expect(buildCopilotSidebarSections(null)).toEqual([
			{ label: "Copilot Budget", value: "sync unavailable", color: "warning" },
		]);
	});

	it("builds compact budget sections for the sidebar", () => {
		expect(
			buildCopilotSidebarSections({
				used: 372,
				entitlement: 1000,
				percent: 37,
				unlimited: false,
				overageCount: 0,
				overagePermitted: false,
				resetDate: "2026-05-01T00:00:00.000Z",
				tier: "paid",
			}),
		).toEqual([
			{ label: "Copilot Budget", value: "37%", color: "success" },
			{ label: "Reset", value: "May 1" },
		]);
	});

	it("prefers env tokens before gh auth token fallback", async () => {
		await expect(
			discoverGitHubToken(
				{ ...process.env, GITHUB_TOKEN: "env-token", GH_TOKEN: "gh-token" },
				async () => "cli-token",
			),
		).resolves.toBe("env-token");

		await expect(
			discoverGitHubToken({ ...process.env, GITHUB_TOKEN: "", GH_TOKEN: "gh-token" }, async () => "cli-token"),
		).resolves.toBe("gh-token");

		await expect(
			discoverGitHubToken({ ...process.env, GITHUB_TOKEN: "", GH_TOKEN: "" }, async () => "cli-token"),
		).resolves.toBe("cli-token");
	});
});

describe("diff rendering", () => {
	it("renders built-in highlighted diffs without external tools", () => {
		const rendered = renderDiff("@@ -1 +1 @@\n-old value\n+new value");
		expect(rendered).toContain("old");
		expect(rendered).toContain("new");
		expect(rendered).not.toContain("delta");
	});
});
