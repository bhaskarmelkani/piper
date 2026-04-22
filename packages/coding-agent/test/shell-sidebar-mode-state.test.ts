import { beforeAll, describe, expect, test } from "vitest";
import type { AgentSession } from "../src/core/agent-session.js";
import type { ReadonlyFooterDataProvider } from "../src/core/footer-data-provider.js";
import { ShellSidebarComponent } from "../src/modes/interactive/components/shell-sidebar.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function createSession(options?: { plan?: "off" | "auto" | "manual"; edit?: boolean }): AgentSession {
	return {
		model: {
			id: "claude-sonnet-4.6",
			provider: "github-copilot",
			contextWindow: 1_000_000,
			reasoning: true,
		},
		thinkingLevel: "medium",
		planningModeStatus: options?.plan ?? "off",
		editModeEnabled: options?.edit ?? true,
		sessionManager: {
			getEntries: () => [
				{
					type: "message",
					message: {
						role: "user",
						content: [{ type: "text", text: "Investigate mode state rendering" }],
					},
				},
			],
			getSessionName: () => undefined,
			getCwd: () => "/Users/test/project",
		},
		getContextUsage: () => ({ tokens: 123_000, contextWindow: 1_000_000, percent: 12.3 }),
	} as unknown as AgentSession;
}

function createFooterData(): ReadonlyFooterDataProvider {
	return {
		getGitBranch: () => "main",
		getExtensionStatuses: () => new Map<string, string>(),
		getAvailableProviderCount: () => 2,
		onBranchChange: () => () => {},
	};
}

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("ShellSidebarComponent mode state", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("renders default off/on mode state", () => {
		const sidebar = new ShellSidebarComponent(createSession(), createFooterData());
		sidebar.setHeight(24);

		const rendered = stripAnsi(sidebar.render(30).join("\n"));
		expect(rendered).toContain("Plan");
		expect(rendered).toContain("off");
		expect(rendered).toContain("Edit");
		expect(rendered).toContain("on");
	});

	test("renders manual and auto planning state labels", () => {
		const manualSidebar = new ShellSidebarComponent(
			createSession({ plan: "manual", edit: false }),
			createFooterData(),
		);
		manualSidebar.setHeight(24);
		const manualRendered = stripAnsi(manualSidebar.render(30).join("\n"));
		expect(manualRendered).toContain("manual");
		expect(manualRendered).toContain("off");

		const autoSidebar = new ShellSidebarComponent(createSession({ plan: "auto", edit: true }), createFooterData());
		autoSidebar.setHeight(24);
		const autoRendered = stripAnsi(autoSidebar.render(30).join("\n"));
		expect(autoRendered).toContain("auto");
		expect(autoRendered).toContain("on");
	});
});
