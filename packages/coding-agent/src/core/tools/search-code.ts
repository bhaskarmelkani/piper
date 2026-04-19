import { createInterface } from "node:readline";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { spawn } from "child_process";
import { readFileSync, statSync } from "fs";
import { minimatch } from "minimatch";
import path from "path";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { ensureTool } from "../../utils/tools-manager.js";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { resolveToCwd } from "./path-utils.js";
import { getTextOutput, invalidArgText, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import {
	DEFAULT_MAX_BYTES,
	formatSize,
	GREP_MAX_LINE_LENGTH,
	type TruncationResult,
	truncateHead,
	truncateLine,
} from "./truncate.js";

const searchCodeSchema = Type.Object({
	query: Type.String({ minLength: 1, description: "Search query or AST pattern" }),
	method: Type.Union([Type.Literal("keyword"), Type.Literal("regex"), Type.Literal("filename"), Type.Literal("ast")]),
	path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
	glob: Type.Optional(Type.String({ description: "Optional file glob filter, e.g. '*.ts' or '**/*.test.ts'" })),
	language: Type.Optional(Type.String({ description: "Language hint or filter, e.g. 'typescript' or 'python'" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of results to return (default: 20)" })),
	context: Type.Optional(Type.Number({ description: "Number of context lines around content matches (default: 0)" })),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search when supported (default: false)" })),
});

export type SearchCodeToolInput = Static<typeof searchCodeSchema>;
type SearchMethod = SearchCodeToolInput["method"];

const DEFAULT_LIMIT = 20;
const DEFAULT_FOLDER_ITEMS = 200;

const LANGS: Record<string, { ast?: string; globs: string[] }> = {
	ts: { ast: "TypeScript", globs: ["**/*.ts", "**/*.mts", "**/*.cts"] },
	typescript: { ast: "TypeScript", globs: ["**/*.ts", "**/*.mts", "**/*.cts"] },
	tsx: { ast: "Tsx", globs: ["**/*.tsx"] },
	js: { ast: "JavaScript", globs: ["**/*.js", "**/*.mjs", "**/*.cjs"] },
	javascript: { ast: "JavaScript", globs: ["**/*.js", "**/*.mjs", "**/*.cjs"] },
	jsx: { ast: "Jsx", globs: ["**/*.jsx"] },
	json: { ast: "Json", globs: ["**/*.json"] },
	python: { ast: "Python", globs: ["**/*.py"] },
	py: { ast: "Python", globs: ["**/*.py"] },
	rust: { ast: "Rust", globs: ["**/*.rs"] },
	rs: { ast: "Rust", globs: ["**/*.rs"] },
	go: { ast: "Go", globs: ["**/*.go"] },
	java: { ast: "Java", globs: ["**/*.java"] },
	c: { ast: "C", globs: ["**/*.c", "**/*.h"] },
	cpp: { ast: "Cpp", globs: ["**/*.cc", "**/*.cpp", "**/*.cxx", "**/*.hpp", "**/*.hh", "**/*.hxx"] },
	csharp: { ast: "CSharp", globs: ["**/*.cs"] },
	cs: { ast: "CSharp", globs: ["**/*.cs"] },
	css: { ast: "Css", globs: ["**/*.css"] },
	html: { ast: "Html", globs: ["**/*.html", "**/*.htm"] },
	yaml: { ast: "Yaml", globs: ["**/*.yaml", "**/*.yml"] },
	yml: { ast: "Yaml", globs: ["**/*.yaml", "**/*.yml"] },
	sh: { ast: "Bash", globs: ["**/*.sh", "**/*.bash"] },
	bash: { ast: "Bash", globs: ["**/*.sh", "**/*.bash"] },
};

type Stat = { isDirectory: () => boolean; isFile: () => boolean };
type Match = { file: string; line?: number; text?: string };

export interface SearchCodeToolDetails {
	truncation?: TruncationResult;
	resultLimitReached?: number;
}

export interface SearchCodeOperations {
	ensure?: typeof ensureTool;
	stat?: (file: string) => Promise<Stat> | Stat;
	readFile?: (file: string) => Promise<string> | string;
	runRg?: (bin: string, args: string[], limit: number, signal?: AbortSignal) => Promise<Match[]>;
	runFd?: (bin: string, args: string[], signal?: AbortSignal) => Promise<string[]>;
	runAst?: (bin: string, args: string[], limit: number, signal?: AbortSignal) => Promise<Match[]>;
}

export interface SearchCodeToolOptions {
	operations?: SearchCodeOperations;
}

const baseOps = {
	ensure: ensureTool,
	stat: (file: string) => statSync(file),
	readFile: (file: string) => readFileSync(file, "utf-8"),
};

function keyFor(file: string): string {
	return file.replace(/\\/g, "/");
}

function quote(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rel(root: string, file: string, dir: boolean): string {
	if (!dir) {
		return path.basename(file);
	}
	const out = path.relative(root, file);
	return out.length > 0 ? keyFor(out) : path.basename(file);
}

function globs(glob?: string, language?: string): string[] {
	const list = glob ? [glob] : [];
	if (!language) {
		return list;
	}
	const cfg = LANGS[language.toLowerCase()];
	if (!cfg) {
		return list;
	}
	return [...list, ...cfg.globs];
}

function matches(file: string, list: string[]): boolean {
	if (list.length === 0) {
		return true;
	}
	return list.some((glob) => minimatch(file, glob, { dot: true }));
}

function infer(file: string): string | undefined {
	const ext = path.extname(file).toLowerCase();
	if (ext === ".ts" || ext === ".mts" || ext === ".cts") return "TypeScript";
	if (ext === ".tsx") return "Tsx";
	if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "JavaScript";
	if (ext === ".jsx") return "Jsx";
	if (ext === ".json") return "Json";
	if (ext === ".py") return "Python";
	if (ext === ".rs") return "Rust";
	if (ext === ".go") return "Go";
	if (ext === ".java") return "Java";
	if (ext === ".c" || ext === ".h") return "C";
	if (ext === ".cc" || ext === ".cpp" || ext === ".cxx" || ext === ".hpp" || ext === ".hh" || ext === ".hxx")
		return "Cpp";
	if (ext === ".cs") return "CSharp";
	if (ext === ".css") return "Css";
	if (ext === ".html" || ext === ".htm") return "Html";
	if (ext === ".yaml" || ext === ".yml") return "Yaml";
	if (ext === ".sh" || ext === ".bash") return "Bash";
	return undefined;
}

async function blocks(
	list: Match[],
	root: string,
	dir: boolean,
	ctx: number,
	read: (file: string) => Promise<string> | string,
): Promise<string[]> {
	const out: string[] = [];
	const cache = new Map<string, string[]>();
	const load = async (file: string) => {
		const found = cache.get(file);
		if (found) {
			return found;
		}
		const text = await read(file);
		const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
		cache.set(file, lines);
		return lines;
	};
	const sorted = [...list].sort((a, b) => {
		const fileCmp = keyFor(a.file).localeCompare(keyFor(b.file));
		if (fileCmp !== 0) return fileCmp;
		return (a.line ?? 0) - (b.line ?? 0);
	});
	let last = "";
	for (const item of sorted) {
		const file = rel(root, item.file, dir);
		if (file !== last) {
			if (out.length > 0) out.push("");
			out.push(file);
			last = file;
		}
		if (item.line === undefined) {
			out.push(`  ${file}`);
			continue;
		}
		if (ctx <= 0) {
			const text = truncateLine(item.text ?? "", GREP_MAX_LINE_LENGTH).text;
			out.push(`  ${item.line}: ${text}`);
			continue;
		}
		const rows = await load(item.file);
		const start = Math.max(1, item.line - ctx);
		const end = Math.min(rows.length, item.line + ctx);
		for (let i = start; i <= end; i++) {
			const text = truncateLine(rows[i - 1] ?? "", GREP_MAX_LINE_LENGTH).text;
			const mark = i === item.line ? ":" : "-";
			out.push(`  ${i}${mark} ${text}`);
		}
	}
	return out;
}

function formatCall(
	args: { query?: string; method?: SearchMethod; path?: string; limit?: number } | undefined,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
	const query = str(args?.query);
	const method = str(args?.method);
	const raw = str(args?.path);
	const file = raw !== null ? shortenPath(raw || ".") : null;
	const limit = args?.limit;
	const invalid = invalidArgText(theme);
	let text =
		theme.fg("toolTitle", theme.bold("search_code")) +
		" " +
		(method === null ? invalid : theme.fg("accent", method || "")) +
		" " +
		(query === null ? invalid : theme.fg("accent", JSON.stringify(query || ""))) +
		theme.fg("toolOutput", ` in ${file === null ? invalid : file}`);
	if (limit !== undefined) {
		text += theme.fg("toolOutput", ` (limit ${limit})`);
	}
	return text;
}

function formatResult(
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: SearchCodeToolDetails;
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

	const limit = result.details?.resultLimitReached;
	const truncation = result.details?.truncation;
	if (limit || truncation?.truncated) {
		const parts: string[] = [];
		if (limit) parts.push(`${limit} results limit`);
		if (truncation?.truncated) parts.push(`${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit`);
		text += `\n${theme.fg("warning", `[Truncated: ${parts.join(", ")}]`)}`;
	}
	return text;
}

function runRg(bin: string, args: string[], limit: number, signal?: AbortSignal): Promise<Match[]> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}
		const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
		const rl = createInterface({ input: child.stdout });
		const out: Match[] = [];
		let err = "";
		let done = false;
		let killed = false;
		const stop = () => {
			if (!child.killed) {
				killed = true;
				child.kill();
			}
		};
		const close = () => {
			rl.close();
			signal?.removeEventListener("abort", abort);
		};
		const settle = (fn: () => void) => {
			if (done) return;
			done = true;
			close();
			fn();
		};
		const abort = () => {
			stop();
			settle(() => reject(new Error("Operation aborted")));
		};
		signal?.addEventListener("abort", abort, { once: true });
		child.stderr?.on("data", (chunk) => {
			err += chunk.toString();
		});
		rl.on("line", (line) => {
			if (!line) return;
			let data: unknown;
			try {
				data = JSON.parse(line);
			} catch {
				return;
			}
			if (typeof data !== "object" || data === null || !("type" in data)) {
				return;
			}
			if ((data as { type: string }).type !== "match") {
				return;
			}
			const item = data as {
				data?: {
					path?: { text?: string };
					line_number?: number;
					lines?: { text?: string };
				};
			};
			const file = item.data?.path?.text;
			const lineNo = item.data?.line_number;
			if (!file || !lineNo) {
				return;
			}
			out.push({
				file,
				line: lineNo,
				text: item.data?.lines?.text?.replace(/\r?\n$/, "") ?? "",
			});
			if (out.length >= limit) {
				stop();
			}
		});
		child.on("error", (e) => settle(() => reject(e)));
		child.on("close", (code) => {
			if (done) return;
			close();
			if (signal?.aborted) {
				reject(new Error("Operation aborted"));
				return;
			}
			if (code !== 0 && code !== 1 && !killed) {
				reject(new Error(err.trim() || `rg exited with code ${code}`));
				return;
			}
			resolve(out);
		});
	});
}

function runFd(bin: string, args: string[], signal?: AbortSignal): Promise<string[]> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}
		const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
		const rl = createInterface({ input: child.stdout });
		const out: string[] = [];
		let err = "";
		const abort = () => {
			if (!child.killed) {
				child.kill();
			}
			reject(new Error("Operation aborted"));
		};
		signal?.addEventListener("abort", abort, { once: true });
		rl.on("line", (line) => {
			if (line.trim().length > 0) {
				out.push(line.trim());
			}
		});
		child.stderr?.on("data", (chunk) => {
			err += chunk.toString();
		});
		child.on("error", (e) => {
			signal?.removeEventListener("abort", abort);
			reject(e);
		});
		child.on("close", (code) => {
			signal?.removeEventListener("abort", abort);
			rl.close();
			if (signal?.aborted) {
				reject(new Error("Operation aborted"));
				return;
			}
			if (code !== 0) {
				reject(new Error(err.trim() || `fd exited with code ${code}`));
				return;
			}
			resolve(out);
		});
	});
}

function runAst(bin: string, args: string[], limit: number, signal?: AbortSignal): Promise<Match[]> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Operation aborted"));
			return;
		}
		const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
		const rl = createInterface({ input: child.stdout });
		const out: Match[] = [];
		let err = "";
		let done = false;
		let killed = false;
		const stop = () => {
			if (!child.killed) {
				killed = true;
				child.kill();
			}
		};
		const close = () => {
			rl.close();
			signal?.removeEventListener("abort", abort);
		};
		const settle = (fn: () => void) => {
			if (done) return;
			done = true;
			close();
			fn();
		};
		const abort = () => {
			stop();
			settle(() => reject(new Error("Operation aborted")));
		};
		signal?.addEventListener("abort", abort, { once: true });
		child.stderr?.on("data", (chunk) => {
			err += chunk.toString();
		});
		rl.on("line", (line) => {
			if (!line) return;
			let data: unknown;
			try {
				data = JSON.parse(line);
			} catch {
				return;
			}
			if (typeof data !== "object" || data === null) {
				return;
			}
			const item = data as {
				file?: string;
				text?: string;
				range?: { start?: { line?: number } };
			};
			if (!item.file || item.range?.start?.line === undefined) {
				return;
			}
			out.push({
				file: item.file,
				line: item.range.start.line + 1,
				text: item.text?.replace(/\r?\n/g, " ") ?? "",
			});
			if (out.length >= limit) {
				stop();
			}
		});
		child.on("error", (e) => settle(() => reject(e)));
		child.on("close", (code) => {
			if (done) return;
			close();
			if (signal?.aborted) {
				reject(new Error("Operation aborted"));
				return;
			}
			if (code !== 0 && !killed) {
				reject(new Error(err.trim() || `ast-grep exited with code ${code}`));
				return;
			}
			resolve(out);
		});
	});
}

export function createSearchCodeToolDefinition(
	cwd: string,
	options?: SearchCodeToolOptions,
): ToolDefinition<typeof searchCodeSchema, SearchCodeToolDetails | undefined> {
	const ops = {
		...baseOps,
		...options?.operations,
	};

	return {
		name: "search_code",
		label: "search_code",
		description:
			"Search code by keyword, regex, filename, or AST pattern. Returns compact grouped results with file paths and line numbers when available.",
		promptSnippet: "Search code by keyword, regex, filename, or AST pattern",
		promptGuidelines: [
			"Use search_code for code discovery before bash, grep, or find.",
			"Use search_code method=filename to locate files and method=ast for structural patterns.",
		],
		parameters: searchCodeSchema,
		async execute(_toolCallId, args: SearchCodeToolInput, signal?: AbortSignal) {
			const root = resolveToCwd(args.path || ".", cwd);
			let stat: Stat;
			try {
				stat = await ops.stat(root);
			} catch {
				throw new Error(`Path not found: ${root}`);
			}
			const dir = stat.isDirectory();
			const limit = Math.max(1, args.limit ?? DEFAULT_LIMIT);
			const ctx = Math.max(0, args.context ?? 0);
			const list = globs(args.glob, args.language);
			let rows: string[] = [];
			let hitLimit = false;

			if (args.method === "keyword" || args.method === "regex") {
				const bin = await ops.ensure("rg", true);
				if (!bin) {
					throw new Error("ripgrep (rg) is not available and could not be downloaded");
				}
				const cmd: string[] = ["--json", "--line-number", "--color=never", "--hidden"];
				if (args.ignoreCase) cmd.push("--ignore-case");
				if (args.method === "keyword") cmd.push("--fixed-strings");
				for (const glob of list) {
					cmd.push("--glob", glob);
				}
				cmd.push(args.query, root);
				const hits = await (ops.runRg ?? runRg)(bin, cmd, limit, signal);
				hitLimit = hits.length >= limit;
				rows = await blocks(hits, root, dir, ctx, ops.readFile);
			}

			if (args.method === "filename") {
				const raw = args.query.includes("/") ? args.query : path.basename(args.query);
				const find = quote(raw);
				if (stat.isFile()) {
					const file = rel(path.dirname(root), root, true);
					const ok =
						new RegExp(find, args.ignoreCase ? "i" : "").test(file) &&
						matches(file, list.length > 0 ? list : globs(undefined, args.language));
					rows = ok ? [file] : [];
				} else {
					const bin = await ops.ensure("fd", true);
					if (!bin) {
						throw new Error("fd is not available and could not be downloaded");
					}
					const cmd: string[] = [
						"--color=never",
						"--hidden",
						"--no-require-git",
						"--max-results",
						String(Math.max(limit, DEFAULT_FOLDER_ITEMS)),
					];
					if (args.ignoreCase) cmd.push("--ignore-case");
					if (args.query.includes("/")) cmd.push("--full-path");
					for (const glob of list.length > 0 ? list : globs(undefined, args.language)) {
						cmd.push("--glob", glob);
					}
					cmd.push(`.*${find}.*`, root);
					const hits = await (ops.runFd ?? runFd)(bin, cmd, signal);
					rows = hits
						.map((file) => (path.isAbsolute(file) ? rel(root, file, true) : keyFor(file)))
						.filter((file) => matches(file, list))
						.sort((a, b) => a.localeCompare(b))
						.slice(0, limit);
					hitLimit = hits.length > rows.length || hits.length >= limit;
				}
			}

			if (args.method === "ast") {
				const bin = await ops.ensure("ast-grep", true);
				if (!bin) {
					throw new Error("ast-grep is not available and could not be downloaded");
				}
				const lang = args.language ? (LANGS[args.language.toLowerCase()]?.ast ?? args.language) : undefined;
				const inferred = stat.isFile() ? infer(root) : undefined;
				const use = lang ?? inferred;
				if (!use) {
					throw new Error(
						"AST search needs a language for folders or files with unknown extensions. Provide language='typescript' (or similar).",
					);
				}
				const cmd = ["run", "--pattern", args.query, "--lang", use, "--json=stream", root];
				const hits = await (ops.runAst ?? runAst)(bin, cmd, limit, signal);
				const filtered = hits.filter((item) => matches(rel(root, item.file, dir), list));
				hitLimit = filtered.length >= limit || hits.length > filtered.length;
				rows = await blocks(filtered.slice(0, limit), root, dir, ctx, ops.readFile);
			}

			if (rows.length === 0) {
				return {
					content: [{ type: "text", text: "No matches found" }],
					details: undefined,
				};
			}

			let out = rows.join("\n");
			const notes: string[] = [];
			const details: SearchCodeToolDetails = {};
			const truncation = truncateHead(out, { maxLines: Number.MAX_SAFE_INTEGER });
			out = truncation.content;
			if (hitLimit) {
				notes.push(`${limit} results limit reached. Refine query, narrow path, or raise limit`);
				details.resultLimitReached = limit;
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

export function createSearchCodeTool(cwd: string, options?: SearchCodeToolOptions): AgentTool<typeof searchCodeSchema> {
	return wrapToolDefinition(createSearchCodeToolDefinition(cwd, options));
}

export const searchCodeToolDefinition = createSearchCodeToolDefinition(process.cwd());
export const searchCodeTool = createSearchCodeTool(process.cwd());
