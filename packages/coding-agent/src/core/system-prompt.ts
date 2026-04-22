/**
 * System prompt construction and project context loading
 */

import { APP_NAME, getDocsPath, getExamplesPath, getReadmePath } from "../config.js";
import { formatSkillsForPrompt, type Skill } from "./skills.js";

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** When true, plan-first execution is enabled for every turn. Default: false. */
	planMode?: boolean;
	/** When false, repo edits require confirmation before edit/write. Default: true. */
	editMode?: boolean;
	/** When true, inject a strong directive to stop direct file reads and use a subagent instead. */
	explorationNudge?: boolean;
	/** Tools to include in prompt. Default: [read, bash, edit, write, search_code, symbols_overview, subagent] */
	selectedTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets appended to the default system prompt guidelines. */
	promptGuidelines?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. */
	cwd: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
	/** Skill names to hide from prompt (still invokable via /skill:name). */
	disabledSkills?: string[];
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const {
		customPrompt,
		planMode,
		editMode,
		explorationNudge,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
		disabledSkills,
	} = options;
	const resolvedCwd = cwd;
	const promptCwd = resolvedCwd.replace(/\\/g, "/");

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const date = `${year}-${month}-${day}`;

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];

	if (customPrompt) {
		let prompt = customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		// Append project context files
		if (contextFiles.length > 0) {
			prompt += "\n\n# Project Context\n\n";
			prompt += "Project-specific instructions and guidelines:\n\n";
			for (const { path: filePath, content } of contextFiles) {
				prompt += `## ${filePath}\n\n${content}\n\n`;
			}
		}

		// Append skills section (only if read tool is available)
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills, disabledSkills);
		}

		// Add date and working directory last
		prompt += `\nCurrent date: ${date}`;
		prompt += `\nCurrent working directory: ${promptCwd}`;

		return prompt;
	}

	// Get absolute paths to documentation and examples
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	// Build tools list based on selected tools.
	// A tool appears in Available tools only when the caller provides a one-line snippet.
	const tools = selectedTools || [
		"read",
		"bash",
		"edit",
		"write",
		"search_code",
		"symbols_overview",
		"subagent",
		"confirm",
		"ask",
	];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasSearchCode = tools.includes("search_code");
	const hasSymbolsOverview = tools.includes("symbols_overview");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasRead = tools.includes("read");
	const hasSubagent = tools.includes("subagent");
	const hasConfirm = tools.includes("confirm");
	const hasAsk = tools.includes("ask");

	// File exploration guidelines
	if (hasSearchCode) {
		addGuideline("Use search_code for keyword, regex, filename, or AST discovery before bash");
	}
	if (hasSymbolsOverview) {
		addGuideline(
			"For files over ~300 lines, use symbols_overview before paging through with read — one call replaces 3–5 read calls",
		);
	}
	if (hasRead && (hasSearchCode || hasSymbolsOverview)) {
		addGuideline(
			"Use read with paths[] to read multiple files in one call; use it only on the most relevant files after search_code and symbols_overview",
		);
	}
	if (hasSubagent) {
		addGuideline("Use subagent when code work splits cleanly into bounded side tasks");
		addGuideline("Use at most 3 read-only sidecars in parallel, then synthesize in the main context");
		addGuideline(
			"Use scout for exploration, planner for plan compression, reviewer for inspection, and worker only for tightly scoped execution",
		);
		addGuideline("Do not delegate after mutation begins, and never recurse through child sidecars");
		addGuideline(
			"Use a scout subagent for 'where is X used?' or 'find all call sites of Y' questions instead of issuing repeated search_code calls from the main context",
		);
	}
	if (hasConfirm) {
		addGuideline(
			"Use the confirm tool whenever you need user confirmation or want to ask a yes/no question — never ask in plain text",
		);
	}
	if (hasAsk) {
		addGuideline(
			"Use the ask tool to present multiple options or collect free-text input from the user — never ask in plain text",
		);
	}
	const hasWrite = tools.includes("write") || tools.includes("edit");
	if (editMode === false && hasWrite) {
		addGuideline(
			"Before editing any non-.plans files: use the confirm tool to list the files you plan to modify and ask the user to proceed — do not call edit or write until confirmed",
		);
	}
	if (planMode && hasWrite) {
		addGuideline(
			"When plan mode is on: create or update the provided .plans file before editing repo files, do not ask permission to write that plan file, and continue execution after the plan is written",
		);
		addGuideline(
			"The plan must include: title, summary, success criteria, constraints or notes, affected areas, and milestone checklist items using [ ]/[~]/[x]/[!] markers. Each milestone must state both the change and its validation",
		);
	}
	if (hasBash && !hasSearchCode && !hasGrep && !hasFind && !hasLs) {
		addGuideline("Use bash for file operations like ls, rg, find");
	} else if (hasBash && (hasSearchCode || hasSymbolsOverview || hasGrep || hasFind || hasLs)) {
		addGuideline(
			"Prefer search_code and symbols_overview for code navigation. Use grep/find/ls only when you need their specific behavior",
		);
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	if (explorationNudge && hasSubagent) {
		addGuideline(
			"STOP: You have made 5+ file reads without using a subagent. Do not read any more files directly. Immediately use a scout subagent to continue exploration and keep this context clean.",
		);
	}

	// Always include these
	addGuideline("Be concise in your responses");
	addGuideline("Show file paths clearly when working with files");
	addGuideline(
		"Open multi-file change replies with a one-line verdict (done / failed), then ≤3 decision bullets, then details. Skip the recap when there is nothing new to say",
	);

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt = `You are an expert coding assistant operating inside ${APP_NAME}, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

${APP_NAME} documentation (read only when the user asks about ${APP_NAME} itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), ${APP_NAME} packages (docs/packages.md)
- When working on ${APP_NAME} topics, read the docs and examples, and follow .md cross-references before implementing
- Always read ${APP_NAME} .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

	if (appendSection) {
		prompt += appendSection;
	}

	// Append project context files
	if (contextFiles.length > 0) {
		prompt += "\n\n# Project Context\n\n";
		prompt += "Project-specific instructions and guidelines:\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `## ${filePath}\n\n${content}\n\n`;
		}
	}

	// Append skills section (only if read tool is available)
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills, disabledSkills);
	}

	// Add date and working directory last
	prompt += `\nCurrent date: ${date}`;
	prompt += `\nCurrent working directory: ${promptCwd}`;

	return prompt;
}
