import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ScheduledSubagentTask {
	role: "scout" | "planner" | "reviewer";
	task: string;
}

export interface SubagentSchedulePlan {
	mode: "single" | "parallel" | "chain";
	tasks: ScheduledSubagentTask[];
	reason: string;
	note: string;
}

export interface SubagentSchedulerInput {
	cwd: string;
	prompt: string;
	activeToolNames: readonly string[];
	mutationStarted: boolean;
}

const REQUIRED_TOOLS = ["subagent", "search_code", "symbols_overview"] as const;
const CODE_PATH_RE =
	/(?:^|[\s`'"])(?:\.{0,2}\/)?[\w./-]+\.(?:ts|tsx|js|jsx|json|md|css|scss|yml|yaml|toml|rs|go|py|java|kt|swift|sh)(?:$|[\s`'"])/i;
const CODE_OBJECT_RE =
	/\b(code|codebase|repo|repository|workspace|package|module|file|files|function|class|symbol|tool|test|tests|bug|regression|flow|call path|prompt|session|provider|component|render|cli|typescript|javascript)\b/i;
const EXPLORATION_RE =
	/\b(find|locate|search|trace|map|understand|explore|investigate|inspect|analyze|follow|review|audit|debug)\b/i;
const PLANNING_RE = /\b(plan|approach|design|decompose|break down|implementation plan|before editing)\b/i;
const REVIEW_RE = /\b(review|audit|inspect|check|look for regressions|look for bugs)\b/i;
const BROAD_RE = /\b(across|end-to-end|from .* to .*|compare|both|multiple|several|flow|pipeline)\b/i;
const DIRECT_MUTATION_RE = /\b(rename|edit|change|update|replace|write|implement|remove|delete)\b/i;
const SMALL_DIRECT_TASK_RE = /\b(this file|this function|single file|small|simple|tiny)\b/i;

function hasRequiredTools(activeToolNames: readonly string[]): boolean {
	return REQUIRED_TOOLS.every((toolName) => activeToolNames.includes(toolName));
}

const _workspaceCache = new Map<string, boolean>();
function looksLikeWorkspace(cwd: string): boolean {
	const cached = _workspaceCache.get(cwd);
	if (cached !== undefined) return cached;
	const result = [".git", "package.json", "bun.lock", "tsconfig.json", "src", "packages"].some((entry) =>
		existsSync(join(cwd, entry)),
	);
	_workspaceCache.set(cwd, result);
	return result;
}

function normalizePrompt(prompt: string): string {
	return prompt.replace(/\s+/g, " ").trim();
}

function looksLikeCodeTask(prompt: string): boolean {
	return (
		CODE_PATH_RE.test(prompt) ||
		(CODE_OBJECT_RE.test(prompt) && EXPLORATION_RE.test(prompt)) ||
		PLANNING_RE.test(prompt)
	);
}

function looksLikeSimpleDirectTask(prompt: string): boolean {
	return (
		DIRECT_MUTATION_RE.test(prompt) &&
		!EXPLORATION_RE.test(prompt) &&
		(SMALL_DIRECT_TASK_RE.test(prompt) || prompt.length < 120)
	);
}

function buildSingleScoutPlan(prompt: string): SubagentSchedulePlan {
	const task = `Do read-only code exploration for this task and return the smallest useful set of files, symbols, and findings:\n${prompt}`;
	return {
		mode: "single",
		tasks: [{ role: "scout", task }],
		reason: "single_scout",
		note: [
			"Optional: if you want to keep the main context cleaner, start with a scout subagent before direct file reads:",
			JSON.stringify({ role: "scout", task }, null, 2),
			"If the task stays small, continuing locally is fine. Keep worker roles for later execution only.",
		].join("\n\n"),
	};
}

function buildParallelScoutPlan(prompt: string): SubagentSchedulePlan {
	const tasks: ScheduledSubagentTask[] = [
		{
			role: "scout",
			task: `Map the entry points, upstream callers, and likely files for this task:\n${prompt}`,
		},
		{
			role: "scout",
			task: `Map the downstream flow, dependencies, and tests for this task:\n${prompt}`,
		},
	];
	return {
		mode: "parallel",
		tasks,
		reason: "parallel_scouts",
		note: [
			"This task is broad enough that parallel scout sidecars may keep the main context cleaner:",
			JSON.stringify({ tasks }, null, 2),
			"If the combined findings are still large, run one planner afterward. Keep worker roles for later execution only.",
		].join("\n\n"),
	};
}

function buildScoutPlannerPlan(prompt: string): SubagentSchedulePlan {
	const tasks: ScheduledSubagentTask[] = [
		{
			role: "scout",
			task: `Do read-only exploration for this task and collect only the facts needed for implementation planning:\n${prompt}`,
		},
		{
			role: "planner",
			task: "Turn the scout findings into a compact implementation plan with files, risks, and next edits.\n\nScout findings:\n{previous}",
		},
	];
	return {
		mode: "chain",
		tasks,
		reason: "scout_then_planner",
		note: [
			"This task benefits from a scout then planner pass before implementation:",
			JSON.stringify({ chain: tasks }, null, 2),
			"Use the planner output to keep the next edits focused. Keep worker roles for later execution only.",
		].join("\n\n"),
	};
}

function buildReviewerPlan(prompt: string): SubagentSchedulePlan {
	const task = `Do a read-only review for likely bugs, regressions, and missing tests related to this task:\n${prompt}`;
	return {
		mode: "single",
		tasks: [{ role: "reviewer", task }],
		reason: "single_reviewer",
		note: [
			"Optional: start with a reviewer sidecar if you want a tighter read-only inspection before diving in:",
			JSON.stringify({ role: "reviewer", task }, null, 2),
			"Keep worker roles for later execution only.",
		].join("\n\n"),
	};
}

export function shouldAutoPlanForSchedulePlan(plan: SubagentSchedulePlan | undefined): boolean {
	return plan?.mode === "parallel" || plan?.mode === "chain";
}

export function buildSubagentSchedulerPlan(input: SubagentSchedulerInput): SubagentSchedulePlan | undefined {
	if (input.mutationStarted) return undefined;
	if (!hasRequiredTools(input.activeToolNames)) return undefined;
	if (!looksLikeWorkspace(input.cwd)) return undefined;

	const prompt = normalizePrompt(input.prompt);
	if (!prompt || !looksLikeCodeTask(prompt)) return undefined;
	if (looksLikeSimpleDirectTask(prompt)) return undefined;

	if (REVIEW_RE.test(prompt) && !PLANNING_RE.test(prompt)) {
		return buildReviewerPlan(prompt);
	}
	if (PLANNING_RE.test(prompt)) {
		return buildScoutPlannerPlan(prompt);
	}
	if (BROAD_RE.test(prompt) || prompt.length > 220) {
		return buildParallelScoutPlan(prompt);
	}
	return buildSingleScoutPlan(prompt);
}
