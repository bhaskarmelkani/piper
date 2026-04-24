import { beforeAll, describe, expect, test } from "vitest";
import type { AgentSession } from "../src/core/agent-session.js";
import type { ReadonlyFooterDataProvider } from "../src/core/footer-data-provider.js";
import { ShellSidebarComponent } from "../src/modes/interactive/components/shell-sidebar.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function createSession(options?: { plan?: "off" | "on"; edit?: boolean }): AgentSession {
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

function getSectionValue(rendered: string, label: string): string | undefined {
	const lines = rendered
		.split("\n")
		.map((line) => line.replace(/^│\s?/, "").trim())
		.filter((line) => line && !line.startsWith("─"));
	const labelIndex = lines.indexOf(label);
	return labelIndex >= 0 ? lines[labelIndex + 1] : undefined;
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

	test("renders plan as on when planning is active", () => {
		const planSidebar = new ShellSidebarComponent(createSession({ plan: "on", edit: false }), createFooterData());
		planSidebar.setHeight(24);
		const rendered = stripAnsi(planSidebar.render(30).join("\n"));
		expect(getSectionValue(rendered, "Plan")).toBe("on");
		expect(getSectionValue(rendered, "Edit")).toBe("off");
	});
});
