import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

const askSchema = Type.Object({
	question: Type.String({ description: "The question or prompt to show the user" }),
	options: Type.Optional(
		Type.Array(Type.String(), {
			description: "Optional list of choices to present. If omitted, shows a free-text input dialog.",
		}),
	),
});

export type AskToolInput = Static<typeof askSchema>;

export const askToolDefinition: ToolDefinition<typeof askSchema, undefined> = {
	name: "ask",
	label: "ask",
	description:
		"Show a selection prompt or free-text input dialog to the user. Use options[] to present choices; omit options for free-text input. Returns the selected option, typed text, or 'dismissed' if cancelled.",
	promptSnippet: "Ask the user a question or present choices via a TUI prompt",
	parameters: askSchema,

	async execute(_toolCallId, { question, options }, signal, _onUpdate, ctx) {
		if (!ctx?.hasUI) {
			return { content: [{ type: "text", text: options?.[0] ?? "dismissed" }], details: undefined };
		}
		if (signal?.aborted) {
			throw new Error("Operation aborted");
		}
		if (options && options.length > 0) {
			const selected = await ctx.ui.select(question, options, { signal });
			return { content: [{ type: "text", text: selected ?? "dismissed" }], details: undefined };
		}
		const typed = await ctx.ui.input(question, undefined, { signal });
		return { content: [{ type: "text", text: typed ?? "dismissed" }], details: undefined };
	},

	renderCall(args, theme) {
		const q = typeof args?.question === "string" ? args.question : "...";
		const opts = Array.isArray(args?.options) ? (args.options as string[]) : [];
		let text = `${theme.fg("toolTitle", theme.bold("ask"))} ${theme.fg("accent", q)}`;
		if (opts.length > 0) {
			text += `\n${opts.map((o) => `  ${theme.fg("muted", "•")} ${theme.fg("toolOutput", o)}`).join("\n")}`;
		}
		return new Text(text, 0, 0);
	},

	renderResult(result: { content: { type: string; text?: string }[] }, _options: ToolRenderResultOptions, theme) {
		const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
		const color = text === "dismissed" ? "dim" : "success";
		return new Text(text ? `\n${theme.fg(color, text)}` : "", 0, 0);
	},
};

export const askTool: AgentTool<typeof askSchema> = wrapToolDefinition(askToolDefinition);

export function createAskToolDefinition(): ToolDefinition<typeof askSchema, undefined> {
	return askToolDefinition;
}

export function createAskTool(): AgentTool<typeof askSchema> {
	return askTool;
}
