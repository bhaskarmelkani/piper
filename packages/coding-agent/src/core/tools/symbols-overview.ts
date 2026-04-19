import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { resolveToCwd } from "./path-utils.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, formatSize, type TruncationResult, truncateHead } from "./truncate.js";

const symbolsOverviewSchema = Type.Object({
	path: Type.String({ minLength: 1, description: "File or folder to summarize" }),
	scope: Type.Union([Type.Literal("file"), Type.Literal("folder")]),
	maxItems: Type.Optional(Type.Number({ description: "Maximum items or files to include (default: 12)" })),
});

export type SymbolsOverviewToolInput = Static<typeof symbolsOverviewSchema>;
type Scope = SymbolsOverviewToolInput["scope"];

const DEFAULT_ITEMS = 12;
const SKIP = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo"]);

type Stat = { isDirectory: () => boolean; isFile: () => boolean };
type SymbolRow = { kind: string; name: string; line: number };
type FileRow = { file: string; score: number; symbols: SymbolRow[] };

export interface SymbolsOverviewToolDetails {
	truncation?: TruncationResult;
	itemLimitReached?: number;
}

export interface SymbolsOverviewOperations {
	stat?: (file: string) => Promise<Stat> | Stat;
	readFile?: (file: string) => Promise<string> | string;
	readdir?: (dir: string) => Promise<string[]> | string[];
}

export interface SymbolsOverviewToolOptions {
	operations?: SymbolsOverviewOperations;
}

const opsBase = {
	stat: (file: string) => statSync(file),
	readFile: (file: string) => readFileSync(file, "utf-8"),
	readdir: (dir: string) => readdirSync(dir),
};

function keyFor(file: string): string {
	return file.replace(/\\/g, "/");
}

function rel(root: string, file: string): string {
	const out = path.relative(root, file);
	return out.length > 0 ? keyFor(out) : path.basename(file);
}

function score(file: string, symbols: SymbolRow[]): number {
	const ext = path.extname(file).toLowerCase();
	const rich = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].includes(ext) ? 1000 : 0;
	return rich + symbols.length;
}

function add(list: SymbolRow[], row: SymbolRow, seen: Set<string>) {
	const key = `${row.kind}:${row.name}:${row.line}`;
	if (seen.has(key)) {
		return;
	}
	seen.add(key);
	list.push(row);
}

function tsSymbols(text: string): SymbolRow[] {
	const list: SymbolRow[] = [];
	const seen = new Set<string>();
	const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i].trim();
		const line = i + 1;
		let hit = row.match(/^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)\b/);
		if (hit) add(list, { kind: "class", name: hit[1], line }, seen);
		hit = row.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\b/);
		if (hit) add(list, { kind: "interface", name: hit[1], line }, seen);
		hit = row.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\b/);
		if (hit) add(list, { kind: "type", name: hit[1], line }, seen);
		hit = row.match(/^(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)\b/);
		if (hit) add(list, { kind: "enum", name: hit[1], line }, seen);
		hit = row.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/);
		if (hit) add(list, { kind: "function", name: hit[1], line }, seen);
		hit = row.match(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/);
		if (hit) add(list, { kind: "function", name: hit[1], line }, seen);
		hit = row.match(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/);
		if (hit) add(list, { kind: "function", name: hit[1], line }, seen);
		hit = row.match(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/);
		if (hit) add(list, { kind: "const", name: hit[1], line }, seen);
		hit = row.match(/^(?:export\s+)?(?:async\s+)?function\*\s+([A-Za-z_$][\w$]*)\b/);
		if (hit) add(list, { kind: "function", name: hit[1], line }, seen);
	}
	return list.sort((a, b) => a.line - b.line);
}

function genericSymbols(text: string): SymbolRow[] {
	const list: SymbolRow[] = [];
	const seen = new Set<string>();
	const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i].trim();
		const line = i + 1;
		let hit = row.match(/^(?:class|struct|trait|module|mod)\s+([A-Za-z_][\w:]*)\b/);
		if (hit) add(list, { kind: "type", name: hit[1], line }, seen);
		hit = row.match(/^(?:def|fn|function)\s+([A-Za-z_][\w:]*)\b/);
		if (hit) add(list, { kind: "function", name: hit[1], line }, seen);
		hit = row.match(/^(?:interface|type|enum)\s+([A-Za-z_][\w:]*)\b/);
		if (hit) add(list, { kind: "type", name: hit[1], line }, seen);
	}
	return list.sort((a, b) => a.line - b.line);
}

function symbols(file: string, text: string): SymbolRow[] {
	const ext = path.extname(file).toLowerCase();
	if ([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].includes(ext)) {
		return tsSymbols(text);
	}
	return genericSymbols(text);
}

async function walk(root: string, ops: Required<SymbolsOverviewOperations>, out: string[] = []): Promise<string[]> {
	const rows = await ops.readdir(root);
	for (const name of rows.sort((a, b) => a.localeCompare(b))) {
		if (SKIP.has(name)) {
			continue;
		}
		const file = path.join(root, name);
		let stat: Stat;
		try {
			stat = await ops.stat(file);
		} catch {
			continue;
		}
		if (stat.isDirectory()) {
			await walk(file, ops, out);
			continue;
		}
		out.push(file);
	}
	return out;
}

function formatCall(
	args: { path?: string; scope?: Scope; maxItems?: number } | undefined,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
	const raw = str(args?.path);
	const file = raw !== null ? shortenPath(raw || ".") : null;
	const scope = str(args?.scope);
	const invalid = invalidArgText(theme);
	let text =
		theme.fg("toolTitle", theme.bold("symbols_overview")) +
		" " +
		(file === null ? invalid : theme.fg("accent", file)) +
		theme.fg("toolOutput", ` (${scope === null ? invalid : scope})`);
	if (args?.maxItems !== undefined) {
		text += theme.fg("toolOutput", ` limit ${args.maxItems}`);
	}
	return text;
}

function formatResult(
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: SymbolsOverviewToolDetails;
	},
	options: ToolRenderResultOptions,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
	showImages: boolean,
): string {
	const output = getTextOutput(result, showImages).trim();
	let text = "";
	if (output) {
		const rows = output.split("\n");
		const max = options.expanded ? rows.length : 20;
		const shown = rows.slice(0, max);
		const left = rows.length - max;
		text += `\n${shown.map((row) => theme.fg("toolOutput", row)).join("\n")}`;
		if (left > 0) {
			text += `${theme.fg("muted", `\n... (${left} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
		}
	}
	const limit = result.details?.itemLimitReached;
	const truncation = result.details?.truncation;
	if (limit || truncation?.truncated) {
		const parts: string[] = [];
		if (limit) parts.push(`${limit} items limit`);
		if (truncation?.truncated) parts.push(`${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit`);
		text += `\n${theme.fg("warning", `[Truncated: ${parts.join(", ")}]`)}`;
	}
	return text;
}

export function createSymbolsOverviewToolDefinition(
	cwd: string,
	options?: SymbolsOverviewToolOptions,
): ToolDefinition<typeof symbolsOverviewSchema, SymbolsOverviewToolDetails | undefined> {
	const ops = {
		...opsBase,
		...options?.operations,
	};
	return {
		name: "symbols_overview",
		label: "symbols_overview",
		description:
			"Summarize top-level symbols for a file or folder. Best for routing reads before opening large files.",
		promptSnippet: "Summarize top-level symbols in a file or folder",
		promptGuidelines: ["Use symbols_overview before read when a file or folder looks large or unfamiliar."],
		parameters: symbolsOverviewSchema,
		async execute(_toolCallId, args: SymbolsOverviewToolInput) {
			const root = resolveToCwd(args.path, cwd);
			let stat: Stat;
			try {
				stat = await ops.stat(root);
			} catch {
				throw new Error(`Path not found: ${root}`);
			}
			const max = Math.max(1, args.maxItems ?? DEFAULT_ITEMS);

			if (args.scope === "file") {
				if (!stat.isFile()) {
					throw new Error(`Not a file: ${root}`);
				}
				const text = await ops.readFile(root);
				const list = symbols(root, text).slice(0, max);
				const rows = [path.basename(root)];
				for (const item of list) {
					rows.push(`  ${item.line}: ${item.kind} ${item.name}`);
				}
				if (list.length === 0) {
					rows.push("  (no top-level symbols found)");
				}
				const out = rows.join("\n");
				return {
					content: [{ type: "text", text: out }],
					details: undefined,
				};
			}

			if (!stat.isDirectory()) {
				throw new Error(`Not a directory: ${root}`);
			}

			const files = await walk(root, ops);
			const list: FileRow[] = [];
			for (const file of files) {
				let text = "";
				try {
					text = await ops.readFile(file);
				} catch {
					continue;
				}
				const rows = symbols(file, text);
				if (rows.length === 0) {
					continue;
				}
				list.push({ file, score: score(file, rows), symbols: rows });
			}
			list.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return keyFor(a.file).localeCompare(keyFor(b.file));
			});
			const picks = list.slice(0, max);
			if (picks.length === 0) {
				return {
					content: [{ type: "text", text: "No symbols found" }],
					details: undefined,
				};
			}

			const rows: string[] = [];
			for (const item of picks) {
				if (rows.length > 0) rows.push("");
				rows.push(rel(root, item.file));
				for (const symbol of item.symbols.slice(0, 3)) {
					rows.push(`  ${symbol.line}: ${symbol.kind} ${symbol.name}`);
				}
			}
			let out = rows.join("\n");
			const notes: string[] = [];
			const details: SymbolsOverviewToolDetails = {};
			const truncation = truncateHead(out, { maxLines: Number.MAX_SAFE_INTEGER });
			out = truncation.content;
			if (list.length > picks.length) {
				notes.push(`${max} items limit reached. Narrow path or raise maxItems`);
				details.itemLimitReached = max;
			}
			if (truncation.truncated) {
				notes.push(`${formatSize(DEFAULT_MAX_BYTES)} output limit reached`);
				details.truncation = truncation;
			}
			if (notes.length > 0) {
				out += `\n\n[${notes.join(". ")}]`;
			}
			return {
				content: [{ type: "text", text: out }],
				details: Object.keys(details).length > 0 ? details : undefined,
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatCall(args, theme));
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatResult(result as any, options, theme, context.showImages));
			return text;
		},
	};
}

export function createSymbolsOverviewTool(
	cwd: string,
	options?: SymbolsOverviewToolOptions,
): AgentTool<typeof symbolsOverviewSchema> {
	return wrapToolDefinition(createSymbolsOverviewToolDefinition(cwd, options));
}

export const symbolsOverviewToolDefinition = createSymbolsOverviewToolDefinition(process.cwd());
export const symbolsOverviewTool = createSymbolsOverviewTool(process.cwd());
