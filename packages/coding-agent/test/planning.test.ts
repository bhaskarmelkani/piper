import { describe, expect, test } from "vitest";
import { buildPlanningContextMessage, buildPlanTemplate, type TurnPlanContext } from "../src/core/planning.js";

describe("planning helpers", () => {
	test("buildPlanTemplate uses the lean handoff sections", () => {
		const template = buildPlanTemplate("Improve plan mode");

		expect(template).toContain("## Goal");
		expect(template).toContain("## Facts");
		expect(template).toContain("## Plan");
		expect(template).toContain("## Validation");
		expect(template).toContain("## Risks");
		expect(template).toContain("- [ ] Milestone 1:");
		expect(template).toContain("Change:");
		expect(template).toContain("Validation:");
		expect(template).not.toContain("## Summary");
		expect(template).not.toContain("## Success Criteria");
	});

	test("buildPlanningContextMessage describes plan-only behavior", () => {
		const context: TurnPlanContext = {
			mode: "on",
			path: "/tmp/project/.plans/example.md",
			template: "# Planning Handoff",
		};

		const message = buildPlanningContextMessage(context);

		expect(message).toContain("Do read-only exploration first");
		expect(message).toContain("Do not edit any non-.plans files");
		expect(message).toContain("After the plan file is complete, stop.");
		expect(message).toContain("Piper will ask whether to execute it");
		expect(message).toContain(context.path);
	});
});
