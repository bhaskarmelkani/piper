import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, test } from "vitest";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

function createAssistantMessage(
	content: AssistantMessage["content"],
	overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "gpt-4o-mini",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
		...overrides,
	};
}

function getContentBlockComponents(component: AssistantMessageComponent): Array<{ component: unknown }> {
	return (component as unknown as { contentBlockComponents: Array<{ component: unknown }> }).contentBlockComponents;
}

describe("AssistantMessageComponent", () => {
	test("adds OSC 133 zone markers to assistant messages without tool calls", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(createAssistantMessage([{ type: "text", text: "hello" }]));
		const lines = component.render(40);

		expect(lines).not.toHaveLength(0);
		expect(lines[0]).toContain(OSC133_ZONE_START);
		expect(lines[lines.length - 1].startsWith(OSC133_ZONE_END + OSC133_ZONE_FINAL)).toBe(true);
	});

	test("does not add OSC 133 zone markers when assistant message contains tool calls", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([
				{ type: "text", text: "calling tool" },
				{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "file.txt" } },
			]),
		);
		const rendered = component.render(60).join("\n");

		expect(rendered.includes(OSC133_ZONE_START)).toBe(false);
		expect(rendered.includes(OSC133_ZONE_END)).toBe(false);
		expect(rendered.includes(OSC133_ZONE_FINAL)).toBe(false);
	});

	test("updates streamed text in place when block structure is unchanged", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(createAssistantMessage([{ type: "text", text: "hello" }]));
		const [initialBlock] = getContentBlockComponents(component);

		component.updateContent(createAssistantMessage([{ type: "text", text: "hello world" }]));

		expect(getContentBlockComponents(component)[0]?.component).toBe(initialBlock?.component);
		expect(component.render(80).join("\n")).toContain("hello world");
	});

	test("updates visible thinking in place when block structure is unchanged", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([{ type: "thinking", thinking: "thinking one" }]),
		);
		const [initialBlock] = getContentBlockComponents(component);

		component.updateContent(createAssistantMessage([{ type: "thinking", thinking: "thinking two" }]));

		expect(getContentBlockComponents(component)[0]?.component).toBe(initialBlock?.component);
		expect(component.render(80).join("\n")).toContain("thinking two");
	});

	test("falls back to rebuild for aborted messages", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(createAssistantMessage([{ type: "text", text: "partial" }]));
		const [initialBlock] = getContentBlockComponents(component);

		component.updateContent(
			createAssistantMessage([{ type: "text", text: "partial update" }], {
				stopReason: "aborted",
				errorMessage: "Request was aborted",
			}),
		);

		expect(getContentBlockComponents(component)[0]?.component).not.toBe(initialBlock?.component);
		expect(component.render(80).join("\n")).toContain("Operation aborted");
	});
});
