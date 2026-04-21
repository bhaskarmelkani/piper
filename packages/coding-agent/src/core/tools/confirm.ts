import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

const confirmSchema = Type.Object({
	message: Type.String({ description: "The question or confirmation message to show the user" }),
});

export type ConfirmToolInput = Static<typeof confirmSchema>;

export const confirmToolDefinition: ToolDefinition<typeof confirmSchema, undefined> = {
	name: "confirm",
	label: "confirm",
	description: "Show a Y/N confirmation prompt to the user in the TUI and return their answer.",
	promptSnippet: "Ask the user a yes/no question via a TUI prompt",
	parameters: confirmSchema,

	async execute(_toolCallId, { message: _message }, signal, _onUpdate, ctx) {
		if (!ctx?.hasUI) {
			// Non-interactive mode: assume yes so automated flows proceed
			return { content: [{ type: "text", text: "confirmed" }], details: undefined };
		}
		if (signal?.aborted) {
			throw new Error("Operation aborted");
		}
		const confirmed = await ctx.ui.confirm("Proceed?", "", { signal });
		return { content: [{ type: "text", text: confirmed ? "confirmed" : "cancelled" }], details: undefined };
	},

	renderCall(args, theme) {
		const msg = typeof args?.message === "string" ? args.message : "...";
		return new Text(`${theme.fg("toolTitle", theme.bold("confirm"))} ${theme.fg("accent", msg)}`, 0, 0);
	},

	renderResult(result: { content: { type: string; text?: string }[] }, _options: ToolRenderResultOptions, theme) {
		const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
		const color = text === "confirmed" ? "success" : "error";
		return new Text(text ? `\n${theme.fg(color, text)}` : "", 0, 0);
	},
};

export const confirmTool: AgentTool<typeof confirmSchema> = wrapToolDefinition(confirmToolDefinition);

export function createConfirmToolDefinition(): ToolDefinition<typeof confirmSchema, undefined> {
	return confirmToolDefinition;
}

export function createConfirmTool(): AgentTool<typeof confirmSchema> {
	return confirmTool;
}
