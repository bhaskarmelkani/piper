import { Container } from "@mariozechner/pi-tui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BottomDockLayout } from "../../tui/src/components/bottom-dock-layout.js";
import { Viewport } from "../../tui/src/components/viewport.js";
import type { AgentSession } from "../src/core/agent-session.js";
import type { ReadonlyFooterDataProvider } from "../src/core/footer-data-provider.js";
import { renderDiff } from "../src/modes/interactive/components/diff.js";
import { ShellDockComponent } from "../src/modes/interactive/components/shell-dock.js";
import { ShellSidebarComponent } from "../src/modes/interactive/components/shell-sidebar.js";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function lineComponent(...lines: string[]) {
	return {
		render: () => lines,
		invalidate: () => {},
	};
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
			getSessionName: () => "feat/v.0.0.0",
			getCwd: () => "/Users/test/project",
		},
		getContextUsage: () => ({ contextWindow: 1_000_000, percent: 12.3 }),
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

	it("renders a full-height sidebar with contextual sections", () => {
		const sidebar = new ShellSidebarComponent(createSession(), createFooterData());
		sidebar.setHeight(26);
		sidebar.setResourceSections([
			{ label: "Context", value: "AGENTS.md" },
			{ label: "Skills", value: "review, write" },
		]);

		const rendered = sidebar.render(30).join("\n");
		expect(sidebar.render(30)).toHaveLength(26);
		expect(rendered).toContain("claude-sonnet-4.6");
		expect(rendered).toContain("main");
		expect(rendered).toContain("Skills");
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
			transcriptViewport: {
				setScrollOffset: vi.fn(),
				getHeight: () => 8,
				getMaxScrollOffset: () => 25,
			},
			ui: { requestRender: vi.fn() },
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

	it("pushes loaded resource summaries into the sidebar", () => {
		const setResourceSections = vi.fn();
		const fakeThis: any = {
			options: { verbose: false },
			settingsManager: { getQuietStartup: () => true },
			toolOutputExpanded: false,
			chatContainer: new Container(),
			sidebarComponent: {
				setResourceSections,
			},
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

		expect(setResourceSections).toHaveBeenCalledWith([
			{ label: "Context", value: "AGENTS.md" },
			{ label: "Skills", value: "review" },
			{ label: "Prompts", value: "/fix" },
			{ label: "Extensions", value: "foo.ts" },
		]);
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
