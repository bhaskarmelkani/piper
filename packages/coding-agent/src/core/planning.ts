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
		return "Execution Plan";
	}
	return compact.length <= 72 ? compact : `${compact.slice(0, 69).trimEnd()}...`;
}

export function buildPlanTemplate(prompt: string): string {
	return `# ${buildPlanTitle(prompt)}

## Summary
- Intent: ${prompt.trim()}
- Outcome: <what should be true when this work is done>

## Success Criteria
- [ ] <observable outcome 1>
- [ ] <observable outcome 2>

## Constraints / Notes
- <repo rules, assumptions, known risks, or things to avoid>

## Affected Areas
- <files, packages, commands, or flows likely to change>

## Milestones
- [ ] Milestone 1: <short title>
  Change: <what will change in this milestone>
  Validation: <how this milestone will be checked>
- [ ] Milestone 2: <short title>
  Change: <what will change in this milestone>
  Validation: <how this milestone will be checked>
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

export function buildPlanningContextMessage(plan: TurnPlanContext, editMode: boolean): string {
	return [
		`Planning is active for this turn (${plan.mode}).`,
		`Before editing any non-.plans files, write or update this exact plan file: ${plan.path}`,
		"Do not ask the user for permission to create or update the plan file.",
		"Fill the template with specific details from the current task instead of leaving placeholders behind.",
		`After the plan exists, continue execution in the same turn. Repo edits currently require confirmation: ${editMode ? "no" : "yes"}.`,
		"",
		"Use this plan template:",
		plan.template,
	].join("\n");
}
