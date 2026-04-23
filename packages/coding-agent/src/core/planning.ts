import { join } from "node:path";

export type TurnPlanningMode = "off" | "manual" | "auto";

export interface TurnPlanContext {
	mode: Exclude<TurnPlanningMode, "off">;
	path: string;
	template: string;
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function formatPlanTimestamp(now: Date): string {
	return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function buildPlanSlug(prompt: string): string {
	const parts = prompt.toLowerCase().match(/[a-z0-9]+/g) ?? [];
	const slug = parts.slice(0, 8).join("-").slice(0, 48);
	return slug || "task";
}

function buildPlanTitle(prompt: string): string {
	const compact = prompt.replace(/\s+/g, " ").trim();
	if (!compact) {
		return "Planning Handoff";
	}
	return compact.length <= 72 ? compact : `${compact.slice(0, 69).trimEnd()}...`;
}

export function buildPlanTemplate(prompt: string): string {
	return `# ${buildPlanTitle(prompt)}

## Goal
- Request: ${prompt.trim()}
- Outcome: <what should be true when execution is finished>

## Facts
- <repo finding, command output, or cited research that matters>

## Plan
- [ ] Milestone 1: <short title>
  Change: <specific edit or investigation>
  Validation: <exact check for this milestone>
- [ ] Milestone 2: <short title>
  Change: <specific edit or investigation>
  Validation: <exact check for this milestone>

## Validation
- <repo-wide check, targeted test, or manual smoke step>

## Risks
- <real blocker, ambiguity, or dependency risk>
`;
}

export function createTurnPlanContext(
	cwd: string,
	prompt: string,
	mode: Exclude<TurnPlanningMode, "off">,
	now: Date = new Date(),
): TurnPlanContext {
	const filename = `${formatPlanTimestamp(now)}-${buildPlanSlug(prompt)}.md`;
	return {
		mode,
		path: join(cwd, ".plans", filename).replace(/\\/g, "/"),
		template: buildPlanTemplate(prompt),
	};
}

export function buildPlanningContextMessage(plan: TurnPlanContext): string {
	return [
		`Planning is active for this turn (${plan.mode}).`,
		`Do read-only exploration first, then write or update this exact plan file: ${plan.path}`,
		"Do not ask the user for permission to create or update the plan file.",
		"Do not edit any non-.plans files or run mutating bash commands while planning is active.",
		"Keep the final plan concise, grounded in facts, and free of placeholder text.",
		"Use [!] blocked milestones instead of guessing when requirements are unclear.",
		"After the plan file is complete, stop. Execution should continue later with plan mode off.",
		"",
		"Use this plan template:",
		plan.template,
	].join("\n");
}
