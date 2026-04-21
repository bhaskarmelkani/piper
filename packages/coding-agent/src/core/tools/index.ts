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
	bashTool,
	bashToolDefinition,
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
	editTool,
	editToolDefinition,
} from "./edit.js";
export { withFileMutationQueue } from "./file-mutation-queue.js";
export {
	createFindTool,
	createFindToolDefinition,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
	findTool,
	findToolDefinition,
} from "./find.js";
export {
	createGrepTool,
	createGrepToolDefinition,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
	grepTool,
	grepToolDefinition,
} from "./grep.js";
export {
	createLsTool,
	createLsToolDefinition,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
	lsTool,
	lsToolDefinition,
} from "./ls.js";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
	readTool,
	readToolDefinition,
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
	writeTool,
	writeToolDefinition,
} from "./write.js";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "../extensions/types.js";
import { askTool, askToolDefinition, createAskTool, createAskToolDefinition } from "./ask.js";
import {
	type BashToolOptions,
	bashTool,
	bashToolDefinition,
	createBashTool,
	createBashToolDefinition,
} from "./bash.js";
import { confirmTool, confirmToolDefinition, createConfirmTool, createConfirmToolDefinition } from "./confirm.js";
import { createEditTool, createEditToolDefinition, editTool, editToolDefinition } from "./edit.js";
import { createFindTool, createFindToolDefinition, findTool, findToolDefinition } from "./find.js";
import { createGrepTool, createGrepToolDefinition, grepTool, grepToolDefinition } from "./grep.js";
import { createLsTool, createLsToolDefinition, lsTool, lsToolDefinition } from "./ls.js";
import {
	createReadTool,
	createReadToolDefinition,
	type ReadToolOptions,
	readTool,
	readToolDefinition,
} from "./read.js";
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
import { createWriteTool, createWriteToolDefinition, writeTool, writeToolDefinition } from "./write.js";

export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;

export const codingTools: Tool[] = [
	readTool,
	bashTool,
	editTool,
	writeTool,
	searchCodeTool,
	symbolsOverviewTool,
	subagentTool,
	confirmTool,
	askTool,
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

export interface ToolsOptions {
	read?: ReadToolOptions;
	bash?: BashToolOptions;
	subagent?: { fastModelId?: string };
}

export function createCodingToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.read),
		createBashToolDefinition(cwd, options?.bash),
		createEditToolDefinition(cwd),
		createWriteToolDefinition(cwd),
		createSearchCodeToolDefinition(cwd),
		createSymbolsOverviewToolDefinition(cwd),
		createSubagentToolDefinition(cwd, options?.subagent),
		createConfirmToolDefinition(),
		createAskToolDefinition(),
	];
}

export function createReadOnlyToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return [
		createReadToolDefinition(cwd, options?.read),
		createGrepToolDefinition(cwd),
		createFindToolDefinition(cwd),
		createLsToolDefinition(cwd),
	];
}

export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		read: createReadToolDefinition(cwd, options?.read),
		bash: createBashToolDefinition(cwd, options?.bash),
		edit: createEditToolDefinition(cwd),
		write: createWriteToolDefinition(cwd),
		search_code: createSearchCodeToolDefinition(cwd),
		symbols_overview: createSymbolsOverviewToolDefinition(cwd),
		subagent: createSubagentToolDefinition(cwd, options?.subagent),
		confirm: createConfirmToolDefinition(),
		ask: createAskToolDefinition(),
		grep: createGrepToolDefinition(cwd),
		find: createFindToolDefinition(cwd),
		ls: createLsToolDefinition(cwd),
	};
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [
		createReadTool(cwd, options?.read),
		createBashTool(cwd, options?.bash),
		createEditTool(cwd),
		createWriteTool(cwd),
		createSearchCodeTool(cwd),
		createSymbolsOverviewTool(cwd),
		createSubagentTool(cwd),
		createConfirmTool(),
		createAskTool(),
	];
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return [createReadTool(cwd, options?.read), createGrepTool(cwd), createFindTool(cwd), createLsTool(cwd)];
}

export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		read: createReadTool(cwd, options?.read),
		bash: createBashTool(cwd, options?.bash),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		search_code: createSearchCodeTool(cwd),
		symbols_overview: createSymbolsOverviewTool(cwd),
		subagent: createSubagentTool(cwd),
		confirm: createConfirmTool(),
		ask: createAskTool(),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
	};
}
