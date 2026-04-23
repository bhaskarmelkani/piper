export {
	type AskToolInput,
	askTool,
	askToolDefinition,
	createAskTool,
	createAskToolDefinition,
} from "./ask.js";
export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.js";
export {
	type ConfirmToolInput,
	confirmTool,
	confirmToolDefinition,
	createConfirmTool,
	createConfirmToolDefinition,
} from "./confirm.js";
export {
	createEditTool,
	createEditToolDefinition,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
} from "./edit.js";
export { withFileMutationQueue } from "./file-mutation-queue.js";
export {
	createFindTool,
	createFindToolDefinition,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
} from "./find.js";
export {
	createGrepTool,
	createGrepToolDefinition,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
} from "./grep.js";
export {
	createLsTool,
	createLsToolDefinition,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
} from "./ls.js";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
} from "./read.js";
export {
	createSearchCodeTool,
	createSearchCodeToolDefinition,
	type SearchCodeOperations,
	type SearchCodeToolDetails,
	type SearchCodeToolInput,
	type SearchCodeToolOptions,
	searchCodeTool,
	searchCodeToolDefinition,
} from "./search-code.js";
export {
	createSubagentTool,
	createSubagentToolDefinition,
	type SubagentRun,
	type SubagentToolDetails,
	type SubagentToolInput,
	subagentTool,
	subagentToolDefinition,
} from "./subagent.js";
export {
	createSymbolsOverviewTool,
	createSymbolsOverviewToolDefinition,
	type SymbolsOverviewOperations,
	type SymbolsOverviewToolDetails,
	type SymbolsOverviewToolInput,
	type SymbolsOverviewToolOptions,
	symbolsOverviewTool,
	symbolsOverviewToolDefinition,
} from "./symbols-overview.js";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.js";
export {
	createWriteTool,
	createWriteToolDefinition,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
} from "./write.js";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "../extensions/types.js";
import { askTool, askToolDefinition, createAskTool, createAskToolDefinition } from "./ask.js";
import { type BashToolOptions, createBashTool, createBashToolDefinition } from "./bash.js";
import { confirmTool, confirmToolDefinition, createConfirmTool, createConfirmToolDefinition } from "./confirm.js";
import { createEditTool, createEditToolDefinition, type EditToolOptions } from "./edit.js";
import { createFindTool, createFindToolDefinition, type FindToolOptions } from "./find.js";
import { createGrepTool, createGrepToolDefinition, type GrepToolOptions } from "./grep.js";
import { createLsTool, createLsToolDefinition, type LsToolOptions } from "./ls.js";
import { createReadTool, createReadToolDefinition, type ReadToolOptions } from "./read.js";
import {
	createSearchCodeTool,
	createSearchCodeToolDefinition,
	searchCodeTool,
	searchCodeToolDefinition,
} from "./search-code.js";
import { createSubagentTool, createSubagentToolDefinition, subagentTool, subagentToolDefinition } from "./subagent.js";
import {
	createSymbolsOverviewTool,
	createSymbolsOverviewToolDefinition,
	symbolsOverviewTool,
	symbolsOverviewToolDefinition,
} from "./symbols-overview.js";
import { createWriteTool, createWriteToolDefinition, type WriteToolOptions } from "./write.js";
export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;

export const readToolDefinition = createReadToolDefinition(process.cwd());
export const readTool = createReadTool(process.cwd());
export const bashToolDefinition = createBashToolDefinition(process.cwd());
export const bashTool = createBashTool(process.cwd());
export const editToolDefinition = createEditToolDefinition(process.cwd());
export const editTool = createEditTool(process.cwd());
export const writeToolDefinition = createWriteToolDefinition(process.cwd());
export const writeTool = createWriteTool(process.cwd());
export const grepToolDefinition = createGrepToolDefinition(process.cwd());
export const grepTool = createGrepTool(process.cwd());
export const findToolDefinition = createFindToolDefinition(process.cwd());
export const findTool = createFindTool(process.cwd());
export const lsToolDefinition = createLsToolDefinition(process.cwd());
export const lsTool = createLsTool(process.cwd());

export const codingTools: Tool[] = [
	readTool,
	bashTool,
	editTool,
	writeTool,
	searchCodeTool,
	symbolsOverviewTool,
	subagentTool,
];
export const readOnlyTools: Tool[] = [readTool, grepTool, findTool, lsTool];

export const allTools = {
	read: readTool,
	bash: bashTool,
	edit: editTool,
	write: writeTool,
	search_code: searchCodeTool,
	symbols_overview: symbolsOverviewTool,
	subagent: subagentTool,
	confirm: confirmTool,
	ask: askTool,
	grep: grepTool,
	find: findTool,
	ls: lsTool,
};

export const allToolDefinitions = {
	read: readToolDefinition,
	bash: bashToolDefinition,
	edit: editToolDefinition,
	write: writeToolDefinition,
	search_code: searchCodeToolDefinition,
	symbols_overview: symbolsOverviewToolDefinition,
	subagent: subagentToolDefinition,
	confirm: confirmToolDefinition,
	ask: askToolDefinition,
	grep: grepToolDefinition,
	find: findToolDefinition,
	ls: lsToolDefinition,
};

export type ToolName = keyof typeof allTools;
export const allToolNames: Set<ToolName> = new Set(Object.keys(allTools) as ToolName[]);

export interface ToolsOptions {
	read?: ReadToolOptions;
	bash?: BashToolOptions;
	subagent?: { fastModelId?: string };
	write?: WriteToolOptions;
	edit?: EditToolOptions;
	grep?: GrepToolOptions;
	find?: FindToolOptions;
	ls?: LsToolOptions;
}

export function createToolDefinition(toolName: ToolName, cwd: string, options?: ToolsOptions): ToolDef {
	switch (toolName) {
		case "read":
			return createReadToolDefinition(cwd, options?.read);
		case "bash":
			return createBashToolDefinition(cwd, options?.bash);
		case "edit":
			return createEditToolDefinition(cwd, options?.edit);
		case "write":
			return createWriteToolDefinition(cwd, options?.write);
		case "search_code":
			return createSearchCodeToolDefinition(cwd);
		case "symbols_overview":
			return createSymbolsOverviewToolDefinition(cwd);
		case "subagent":
			return createSubagentToolDefinition(cwd, options?.subagent);
		case "confirm":
			return createConfirmToolDefinition();
		case "ask":
			return createAskToolDefinition();
		case "grep":
			return createGrepToolDefinition(cwd, options?.grep);
		case "find":
			return createFindToolDefinition(cwd, options?.find);
		case "ls":
			return createLsToolDefinition(cwd, options?.ls);
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

export function createTool(toolName: ToolName, cwd: string, options?: ToolsOptions): Tool {
	switch (toolName) {
		case "read":
			return createReadTool(cwd, options?.read);
		case "bash":
			return createBashTool(cwd, options?.bash);
		case "edit":
			return createEditTool(cwd, options?.edit);
		case "write":
			return createWriteTool(cwd, options?.write);
		case "search_code":
			return createSearchCodeTool(cwd);
		case "symbols_overview":
			return createSymbolsOverviewTool(cwd);
		case "subagent":
			return createSubagentTool(cwd);
		case "confirm":
			return createConfirmTool();
		case "ask":
			return createAskTool();
		case "grep":
			return createGrepTool(cwd, options?.grep);
		case "find":
			return createFindTool(cwd, options?.find);
		case "ls":
			return createLsTool(cwd, options?.ls);
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

export function createCodingToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.read),
		createBashToolDefinition(cwd, options?.bash),
		createEditToolDefinition(cwd, options?.edit),
		createWriteToolDefinition(cwd, options?.write),
		createSearchCodeToolDefinition(cwd),
		createSymbolsOverviewToolDefinition(cwd),
		createSubagentToolDefinition(cwd, options?.subagent),
	];
}

export function createReadOnlyToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.read),
		createGrepToolDefinition(cwd, options?.grep),
		createFindToolDefinition(cwd, options?.find),
		createLsToolDefinition(cwd, options?.ls),
	];
}

export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		read: createReadToolDefinition(cwd, options?.read),
		bash: createBashToolDefinition(cwd, options?.bash),
		edit: createEditToolDefinition(cwd, options?.edit),
		write: createWriteToolDefinition(cwd, options?.write),
		search_code: createSearchCodeToolDefinition(cwd),
		symbols_overview: createSymbolsOverviewToolDefinition(cwd),
		subagent: createSubagentToolDefinition(cwd, options?.subagent),
		confirm: createConfirmToolDefinition(),
		ask: createAskToolDefinition(),
		grep: createGrepToolDefinition(cwd, options?.grep),
		find: createFindToolDefinition(cwd, options?.find),
		ls: createLsToolDefinition(cwd, options?.ls),
	};
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createBashTool(cwd, options?.bash),
		createEditTool(cwd, options?.edit),
		createWriteTool(cwd, options?.write),
		createSearchCodeTool(cwd),
		createSymbolsOverviewTool(cwd),
		createSubagentTool(cwd),
	];
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createGrepTool(cwd, options?.grep),
		createFindTool(cwd, options?.find),
		createLsTool(cwd, options?.ls),
	];
}

export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		read: createReadTool(cwd, options?.read),
		bash: createBashTool(cwd, options?.bash),
		edit: createEditTool(cwd, options?.edit),
		write: createWriteTool(cwd, options?.write),
		search_code: createSearchCodeTool(cwd),
		symbols_overview: createSymbolsOverviewTool(cwd),
		subagent: createSubagentTool(cwd),
		confirm: createConfirmTool(),
		ask: createAskTool(),
		grep: createGrepTool(cwd, options?.grep),
		find: createFindTool(cwd, options?.find),
		ls: createLsTool(cwd, options?.ls),
	};
}
