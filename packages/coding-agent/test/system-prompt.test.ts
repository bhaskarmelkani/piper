import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "../src/core/system-prompt.js";

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("Show file paths clearly");
		});
	});

	describe("default tools", () => {
		test("includes all default tools when snippets are provided", () => {
			const prompt = buildSystemPrompt({
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					edit: "Make surgical edits",
					write: "Create or overwrite files",
					search_code: "Search code by keyword, regex, filename, or AST pattern",
					symbols_overview: "Summarize top-level symbols in a file or folder",
					subagent: "Delegate bounded work to built-in sidecars",
				},
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
			expect(prompt).toContain("- search_code:");
			expect(prompt).toContain("- symbols_overview:");
			expect(prompt).toContain("- subagent:");
		});
	});

	describe("custom tool snippets", () => {
		test("includes custom tools in available tools section when promptSnippet is provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				toolSnippets: {
					dynamic_tool: "Run dynamic test behavior",
				},
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("- dynamic_tool: Run dynamic test behavior");
		});

		test("omits custom tools from available tools section when promptSnippet is not provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).not.toContain("dynamic_tool");
		});
	});

	describe("prompt guidelines", () => {
		test("appends promptGuidelines to default guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for project summaries."],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("- Use dynamic_tool for project summaries.");
		});

		test("deduplicates and trims promptGuidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for summaries.", "  Use dynamic_tool for summaries.  ", "   "],
				contextFiles: [],
				skills: [],
			});

			expect(prompt.match(/- Use dynamic_tool for summaries\./g)).toHaveLength(1);
		});

		test("prefers search_code, symbols_overview, and subagent for code navigation", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "bash", "search_code", "symbols_overview", "subagent"],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("Use search_code for keyword, regex, filename, or AST discovery before bash");
			expect(prompt).toContain("For files over ~300 lines, use symbols_overview before paging through with read");
			expect(prompt).toContain(
				"Use read with paths[] to read multiple files in one call; use it only on the most relevant files after search_code and symbols_overview",
			);
			expect(prompt).toContain("Use subagent when code work splits cleanly into bounded side tasks");
		});

		test("shows plan instructions only when plan mode is enabled", () => {
			const withPlanMode = buildSystemPrompt({
				selectedTools: ["edit", "write"],
				planMode: true,
				contextFiles: [],
				skills: [],
			});
			const withoutPlanMode = buildSystemPrompt({
				selectedTools: ["edit", "write"],
				planMode: false,
				contextFiles: [],
				skills: [],
			});

			expect(withPlanMode).toContain("When plan mode is on");
			expect(withPlanMode).toContain("milestone checklist items using [ ]/[~]/[x]/[!]");
			expect(withoutPlanMode).not.toContain("When plan mode is on");
		});

		test("shows edit confirmation instructions only when edit mode is disabled", () => {
			const withEditGate = buildSystemPrompt({
				selectedTools: ["edit", "write", "confirm"],
				editMode: false,
				contextFiles: [],
				skills: [],
			});
			const withoutEditGate = buildSystemPrompt({
				selectedTools: ["edit", "write", "confirm"],
				editMode: true,
				contextFiles: [],
				skills: [],
			});

			expect(withEditGate).toContain("Before editing any non-.plans files");
			expect(withoutEditGate).not.toContain("Before editing any non-.plans files");
		});

		test("drops the old worker-per-milestone team mode wording", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["edit", "write"],
				planMode: true,
				editMode: false,
				contextFiles: [],
				skills: [],
			});

			expect(prompt).not.toContain("Execute each milestone using a worker subagent");
			expect(prompt).not.toContain("worker-per-milestone");
		});
	});
});
