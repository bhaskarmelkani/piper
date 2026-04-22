import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Api, ImageContent, Model, TextContent } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, stat as fsStat } from "fs/promises";
import { type Static, Type } from "typebox";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { getLanguageFromPath, highlightCode } from "../../modes/interactive/theme/theme.js";
import { formatDimensionNote, resizeImage } from "../../utils/image-resize.js";
import { detectSupportedImageMimeTypeFromFile } from "../../utils/mime.js";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { resolveReadPath } from "./path-utils.js";
import { getTextOutput, invalidArgText, replaceTabs, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult, truncateHead } from "./truncate.js";

const readSchema = Type.Object({
	path: Type.Optional(Type.String({ description: "Path to a single file to read (relative or absolute)" })),
	paths: Type.Optional(
		Type.Array(Type.String(), {
			description: "Multiple file paths to read in one call. Prefer this over multiple read calls.",
		}),
	),
	offset: Type.Optional(
		Type.Number({
			description: "Line number to start reading from (1-indexed). Only applies when reading a single file.",
		}),
	),
	limit: Type.Optional(
		Type.Number({ description: "Maximum number of lines to read. Only applies when reading a single file." }),
	),
});

export type ReadToolInput = Static<typeof readSchema>;

export interface ReadToolDetails {
	truncation?: TruncationResult;
}

export interface ReadOperations {
	readFile: (absolutePath: string) => Promise<Buffer>;
	access: (absolutePath: string) => Promise<void>;
	detectImageMimeType?: (absolutePath: string) => Promise<string | null | undefined>;
}

const defaultReadOperations: ReadOperations = {
	readFile: (path) => fsReadFile(path),
	access: (path) => fsAccess(path, constants.R_OK),
	detectImageMimeType: detectSupportedImageMimeTypeFromFile,
};

export interface ReadToolOptions {
	autoResizeImages?: boolean;
	operations?: ReadOperations;
}

function formatReadCall(
	args: { path?: string; file_path?: string; offset?: number; limit?: number } | undefined,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
	const rawPath = str(args?.file_path ?? args?.path);
	const path = rawPath !== null ? shortenPath(rawPath) : null;
	const offset = args?.offset;
	const limit = args?.limit;
	const invalidArg = invalidArgText(theme);
	let pathDisplay = path === null ? invalidArg : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
	if (offset !== undefined || limit !== undefined) {
		const startLine = offset ?? 1;
		const endLine = limit !== undefined ? startLine + limit - 1 : "";
		pathDisplay += theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
	}
	return `${theme.fg("toolTitle", theme.bold("read"))} ${pathDisplay}`;
}

function trimTrailingEmptyLines(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && lines[end - 1] === "") {
		end--;
	}
	return lines.slice(0, end);
}

function getNonVisionImageNote(model: Model<Api> | undefined): string | undefined {
	if (!model || model.input.includes("image")) {
		return undefined;
	}
	return "[Current model does not support images. The image will be omitted from this request.]";
}

function formatReadResult(
	args: { path?: string; file_path?: string; offset?: number; limit?: number } | undefined,
	result: { content: (TextContent | ImageContent)[]; details?: ReadToolDetails },
	options: ToolRenderResultOptions,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
	showImages: boolean,
): string {
	const rawPath = str(args?.file_path ?? args?.path);
	const output = getTextOutput(result as any, showImages);
	const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
	const renderedLines = lang ? highlightCode(replaceTabs(output), lang) : output.split("\n");
	const lines = trimTrailingEmptyLines(renderedLines);
	const maxLines = options.expanded ? lines.length : 10;
	const displayLines = lines.slice(0, maxLines);
	const remaining = lines.length - maxLines;
	let text = `\n${displayLines.map((line) => (lang ? replaceTabs(line) : theme.fg("toolOutput", replaceTabs(line)))).join("\n")}`;
	if (remaining > 0) {
		text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
	}

	const truncation = result.details?.truncation;
	if (truncation?.truncated) {
		if (truncation.firstLineExceedsLimit) {
			text += `\n${theme.fg("warning", `[First line exceeds ${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit]`)}`;
		} else if (truncation.truncatedBy === "lines") {
			text += `\n${theme.fg("warning", `[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${truncation.maxLines ?? DEFAULT_MAX_LINES} line limit)]`)}`;
		} else {
			text += `\n${theme.fg("warning", `[Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit)]`)}`;
		}
	}
	return text;
}

export function createReadToolDefinition(
	cwd: string,
	options?: ReadToolOptions,
): ToolDefinition<typeof readSchema, ReadToolDetails | undefined> {
	const autoResizeImages = options?.autoResizeImages ?? true;
	const ops = options?.operations ?? defaultReadOperations;
	return {
		name: "read",
		label: "read",
		description: `Read the contents of one or more files. Use paths[] to read multiple files in a single call. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
		promptSnippet: "Read file contents (use paths[] for multiple files in one call)",
		parameters: readSchema,
		async execute(
			_toolCallId,
			{ path, paths, offset, limit }: { path?: string; paths?: string[]; offset?: number; limit?: number },
			signal?: AbortSignal,
			_onUpdate?,
			ctx?,
		) {
			const filePaths = paths && paths.length > 0 ? paths : path ? [path] : [];
			if (filePaths.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No file path provided. Specify path or paths." }],
					details: undefined,
				};
			}

			async function readSingleFile(
				filePath: string,
			): Promise<{ content: (TextContent | ImageContent)[]; details: ReadToolDetails | undefined }> {
				const absolutePath = resolveReadPath(filePath, cwd);
				return new Promise<{ content: (TextContent | ImageContent)[]; details: ReadToolDetails | undefined }>(
					(resolve, reject) => {
						if (signal?.aborted) {
							reject(new Error("Operation aborted"));
							return;
						}

						let aborted = false;
						const onAbort = () => {
							aborted = true;
							reject(new Error("Operation aborted"));
						};
						signal?.addEventListener("abort", onAbort, { once: true });

						(async () => {
							try {
								await ops.access(absolutePath);
								if (aborted) return;

								let content: (TextContent | ImageContent)[];
								let details: ReadToolDetails | undefined;
								const mimeType = ops.detectImageMimeType
									? await ops.detectImageMimeType(absolutePath)
									: undefined;
								const nonVisionImageNote = getNonVisionImageNote(ctx?.model);

								if (mimeType) {
									const buffer = await ops.readFile(absolutePath);
									const base64 = buffer.toString("base64");
									if (autoResizeImages) {
										const resized = await resizeImage({ type: "image", data: base64, mimeType });
										if (!resized) {
											let textNote =
												`Read image file [${mimeType}]\n` +
												"[Image omitted: could not be resized below the inline image size limit.]";
											if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
											content = [{ type: "text", text: textNote }];
										} else {
											const dimensionNote = formatDimensionNote(resized);
											let textNote = `Read image file [${resized.mimeType}]`;
											if (dimensionNote) textNote += `\n${dimensionNote}`;
											if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
											content = [
												{ type: "text", text: textNote },
												{ type: "image", data: resized.data, mimeType: resized.mimeType },
											];
										}
									} else {
										let textNote = `Read image file [${mimeType}]`;
										if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
										content = [
											{ type: "text", text: textNote },
											{ type: "image", data: base64, mimeType },
										];
									}
								} else {
									const statResult = await fsStat(absolutePath).catch(() => null);
									if (statResult?.isDirectory()) {
										resolve({
											content: [
												{
													type: "text",
													text: `${absolutePath} is a directory, not a file. Use Glob to find files or Bash (ls) to list contents.`,
												},
											],
											details: undefined,
										});
										return;
									}

									const buffer = await ops.readFile(absolutePath);
									const textContent = buffer.toString("utf-8");
									const allLines = textContent.split("\n");
									const totalFileLines = allLines.length;
									const startLine = offset ? Math.max(0, offset - 1) : 0;
									const startLineDisplay = startLine + 1;

									if (startLine >= allLines.length) {
										throw new Error(
											`Offset ${offset} is beyond end of file (${allLines.length} lines total)`,
										);
									}

									let selectedContent: string;
									let userLimitedLines: number | undefined;
									if (limit !== undefined) {
										const endLine = Math.min(startLine + limit, allLines.length);
										selectedContent = allLines.slice(startLine, endLine).join("\n");
										userLimitedLines = endLine - startLine;
									} else {
										selectedContent = allLines.slice(startLine).join("\n");
									}

									const truncation = truncateHead(selectedContent);
									let outputText: string;
									if (truncation.firstLineExceedsLimit) {
										const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine], "utf-8"));
										outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${filePath} | head -c ${DEFAULT_MAX_BYTES}]`;
										details = { truncation };
									} else if (truncation.truncated) {
										const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
										const nextOffset = endLineDisplay + 1;
										outputText = truncation.content;
										if (truncation.truncatedBy === "lines") {
											outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
										} else {
											outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
										}
										details = { truncation };
									} else if (
										userLimitedLines !== undefined &&
										startLine + userLimitedLines < allLines.length
									) {
										const remaining = allLines.length - (startLine + userLimitedLines);
										const nextOffset = startLine + userLimitedLines + 1;
										outputText = `${truncation.content}\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
									} else {
										outputText = truncation.content;
									}

									content = [{ type: "text", text: outputText }];
								}

								if (aborted) return;
								signal?.removeEventListener("abort", onAbort);
								resolve({ content, details });
							} catch (error: any) {
								signal?.removeEventListener("abort", onAbort);
								if (!aborted) reject(error);
							}
						})();
					},
				);
			}

			if (filePaths.length === 1) {
				return readSingleFile(filePaths[0]!);
			}

			const parts: (TextContent | ImageContent)[] = [];
			for (const filePath of filePaths) {
				if (signal?.aborted) {
					throw new Error("Operation aborted");
				}
				parts.push({ type: "text", text: `\n--- ${filePath} ---\n` });
				const result = await readSingleFile(filePath);
				parts.push(...result.content);
			}
			return { content: parts, details: undefined };
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatReadCall(args, theme));
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatReadResult(context.args, result as any, options, theme, context.showImages));
			return text;
		},
	};
}

export function createReadTool(cwd: string, options?: ReadToolOptions): AgentTool<typeof readSchema> {
	return wrapToolDefinition(createReadToolDefinition(cwd, options));
}
