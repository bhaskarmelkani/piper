import { spawn } from "node:child_process";
import path from "node:path";
import type { AgentToolResult, ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { APP_NAME } from "../../config.js";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { type BuiltInSubagentRole, resolveSubagentModel } from "../subagents/model-policy.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";

const subagentRoleSchema = Type.Union([
	Type.Literal("scout"),
	Type.Literal("planner"),
	Type.Literal("reviewer"),
	Type.Literal("worker"),
]);

const subagentTaskSchema = Type.Object({
	role: subagentRoleSchema,
	task: Type.String({ minLength: 1, description: "Bounded task for this child agent" }),
});

const subagentSchema = Type.Object({
	role: Type.Optional(subagentRoleSchema),
	task: Type.Optional(Type.String({ minLength: 1, description: "Bounded task for a single child agent" })),
	tasks: Type.Optional(
		Type.Array(subagentTaskSchema, { description: "Parallel child tasks. Max 2, read-only roles only." }),
	),
	chain: Type.Optional(
		Type.Array(subagentTaskSchema, {
			description: "Sequential child tasks. Use {previous} in later task text to inject the previous child output.",
		}),
	),
});

export type SubagentToolInput = Static<typeof subagentSchema>;

export interface SubagentProgressItem {
	kind: "text" | "tool";
	text: string;
}

export interface SubagentRun {
	role: BuiltInSubagentRole;
	task: string;
	status: "running" | "completed" | "failed" | "aborted";
	model: string;
	thinkingLevel: ThinkingLevel;
	output: string;
	progress: SubagentProgressItem[];
	usage?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
	};
	stopReason?: string;
	errorMessage?: string;
}

export interface SubagentToolDetails {
	mode: "single" | "parallel" | "chain";
	runs: SubagentRun[];
}

interface RoleConfig {
	role: BuiltInSubagentRole;
	description: string;
	prompt: string;
	tools: string[];
	writeCapable: boolean;
}

const ROLE_CONFIGS: Record<BuiltInSubagentRole, RoleConfig> = {
	scout: {
		role: "scout",
		description: "Read-only code exploration",
		prompt:
			"You are scout. Do fast read-only code exploration. Use search_code and symbols_overview first. Return concise findings with files worth opening next.",
		tools: ["read", "search_code", "symbols_overview", "grep", "find", "ls"],
		writeCapable: false,
	},
	planner: {
		role: "planner",
		description: "Plan compression from findings",
		prompt:
			"You are planner. Turn findings into a short implementation plan with key risks and decision points. Do not edit files.",
		tools: ["read", "search_code", "symbols_overview", "grep", "find", "ls"],
		writeCapable: false,
	},
	reviewer: {
		role: "reviewer",
		description: "Read-only inspection of proposed or completed changes",
		prompt:
			"You are reviewer. Inspect code critically for bugs, regressions, and missing tests. Stay concise and specific. Do not edit files.",
		tools: ["read", "search_code", "symbols_overview", "grep", "find", "ls", "bash"],
		writeCapable: false,
	},
	worker: {
		role: "worker",
		description: "Tightly scoped write-capable execution",
		prompt:
			"You are worker. Execute one bounded code task carefully. Keep changes small, deterministic, and directly relevant to the assignment.",
		tools: ["read", "bash", "edit", "write", "search_code", "symbols_overview"],
		writeCapable: true,
	},
};

const MAX_PARALLEL_SUBAGENTS = 3;
const MAX_VISIBLE_PROGRESS = 4;

type PrintJsonEvent =
	| {
			type: "message_end";
			message: {
				role?: string;
				content?: unknown;
				stopReason?: string;
				errorMessage?: string;
				usage?: {
					input?: number;
					output?: number;
					cacheRead?: number;
					cacheWrite?: number;
					cost?: { total?: number };
				};
			};
	  }
	| { type: "tool_execution_start"; toolName?: string; args?: unknown }
	| { type: string };

function stringContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (typeof part !== "object" || part === null || !("type" in part)) return "";
			const typedPart = part as { type?: string; text?: string };
			return typedPart.type === "text" ? (typedPart.text ?? "") : "";
		})
		.join("");
}

function trimPreview(text: string, max: number = 120): string {
	const flat = text.replace(/\s+/g, " ").trim();
	if (flat.length <= max) return flat;
	return `${flat.slice(0, max - 3)}...`;
}

function formatToolItem(toolName: string, args: unknown): string {
	if (typeof args !== "object" || args === null) {
		return toolName;
	}
	const record = args as Record<string, unknown>;
	if (toolName === "read") {
		return `read ${String(record.path ?? "...")}`;
	}
	if (toolName === "search_code") {
		return `search_code ${String(record.method ?? "")} ${JSON.stringify(String(record.query ?? ""))}`;
	}
	if (toolName === "symbols_overview") {
		return `symbols_overview ${String(record.scope ?? "")} ${String(record.path ?? "")}`;
	}
	if (toolName === "bash") {
		return `$ ${trimPreview(String(record.command ?? ""))}`;
	}
	if (toolName === "edit" || toolName === "write") {
		return `${toolName} ${String(record.path ?? "")}`;
	}
	return toolName;
}

function getInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && !currentScript.startsWith("/$bunfs/root/")) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const genericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!genericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: APP_NAME, args };
}

function roleListForMode(input: SubagentToolInput): Array<{ role: BuiltInSubagentRole; task: string }> {
	if (input.chain && input.chain.length > 0) {
		return input.chain;
	}
	if (input.tasks && input.tasks.length > 0) {
		return input.tasks;
	}
	if (input.role && input.task) {
		return [{ role: input.role, task: input.task }];
	}
	return [];
}

function modeForInput(input: SubagentToolInput): "single" | "parallel" | "chain" {
	if (input.chain && input.chain.length > 0) return "chain";
	if (input.tasks && input.tasks.length > 0) return "parallel";
	return "single";
}

function validateInput(input: SubagentToolInput): void {
	const selectedModes =
		Number(Boolean(input.role && input.task)) +
		Number(Boolean(input.tasks?.length)) +
		Number(Boolean(input.chain?.length));
	if (selectedModes !== 1) {
		throw new Error("Provide exactly one mode: single (role + task), parallel (tasks), or chain (chain).");
	}
	if (input.tasks && input.tasks.length > MAX_PARALLEL_SUBAGENTS) {
		throw new Error(`Parallel subagents are limited to ${MAX_PARALLEL_SUBAGENTS}.`);
	}
	if (input.tasks?.some((task) => ROLE_CONFIGS[task.role].writeCapable)) {
		throw new Error("Parallel subagents are read-only only. Use scout/planner/reviewer roles in parallel.");
	}
}

function buildChildPrompt(role: RoleConfig, task: string): string {
	return [
		role.prompt,
		"Never delegate further. You are a child sidecar and must not spawn or suggest more child agents.",
		"Keep output compact. The parent agent will synthesize and decide what to do next.",
		`Role: ${role.role} - ${role.description}.`,
		`Task: ${task}`,
	].join("\n\n");
}

async function runSingleSubagent(params: {
	role: BuiltInSubagentRole;
	task: string;
	model: Model<Api>;
	thinkingLevel: ThinkingLevel;
	cwd: string;
	signal: AbortSignal | undefined;
	onUpdate?: (run: SubagentRun) => void;
}): Promise<SubagentRun> {
	const role = ROLE_CONFIGS[params.role];
	const run: SubagentRun = {
		role: params.role,
		task: params.task,
		status: "running",
		model: `${params.model.provider}/${params.model.id}`,
		thinkingLevel: params.thinkingLevel,
		output: "",
		progress: [],
	};

	const args = [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--model",
		`${params.model.provider}/${params.model.id}`,
		"--thinking",
		params.thinkingLevel,
		"--tools",
		role.tools.join(","),
		"--append-system-prompt",
		buildChildPrompt(role, params.task),
		params.task,
	];

	const invocation = getInvocation(args);
	await new Promise<void>((resolve, reject) => {
		let buffer = "";
		let stderr = "";
		let settled = false;
		let cleanup: (() => void) | undefined;
		const child = spawn(invocation.command, invocation.args, {
			cwd: params.cwd,
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			env: {
				...process.env,
				PI_SUBAGENT_DEPTH: String((parseInt(process.env.PI_SUBAGENT_DEPTH ?? "0", 10) || 0) + 1),
			},
		});

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			cleanup?.();
			if (error) reject(error);
			else resolve();
		};

		const pushProgress = (item: SubagentProgressItem): void => {
			run.progress = [...run.progress, item].slice(-MAX_VISIBLE_PROGRESS);
			params.onUpdate?.({ ...run, progress: [...run.progress] });
		};

		const processLine = (line: string): void => {
			if (!line.trim()) return;
			let event: PrintJsonEvent;
			try {
				event = JSON.parse(line) as PrintJsonEvent;
			} catch {
				return;
			}

			if (event.type === "tool_execution_start") {
				const toolEvent = event as Extract<PrintJsonEvent, { type: "tool_execution_start" }>;
				pushProgress({
					kind: "tool",
					text: formatToolItem(toolEvent.toolName ?? "tool", toolEvent.args),
				});
				return;
			}

			if (event.type === "message_end") {
				const messageEvent = event as Extract<PrintJsonEvent, { type: "message_end" }>;
				if (messageEvent.message.role !== "assistant") {
					return;
				}
				const output = stringContent(messageEvent.message.content);
				if (output.trim()) {
					run.output = output.trim();
					pushProgress({
						kind: "text",
						text: trimPreview(output),
					});
				}
				if (typeof messageEvent.message.stopReason === "string") {
					run.stopReason = messageEvent.message.stopReason;
				}
				if (messageEvent.message.usage) {
					run.usage = {
						input: messageEvent.message.usage.input ?? 0,
						output: messageEvent.message.usage.output ?? 0,
						cacheRead: messageEvent.message.usage.cacheRead ?? 0,
						cacheWrite: messageEvent.message.usage.cacheWrite ?? 0,
						cost: messageEvent.message.usage.cost?.total ?? 0,
					};
				}
				if (typeof messageEvent.message.errorMessage === "string" && messageEvent.message.errorMessage.length > 0) {
					run.errorMessage = messageEvent.message.errorMessage;
				}
			}
		};

		child.stdout.on("data", (chunk) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", (error) => {
			run.status = "failed";
			run.errorMessage = error.message;
			finish(error);
		});

		child.on("close", (code, signalName) => {
			if (buffer.trim()) processLine(buffer);
			if (signalName || params.signal?.aborted) {
				run.status = "aborted";
				run.errorMessage = "Subagent aborted";
				finish();
				return;
			}
			if ((code ?? 0) !== 0 || run.stopReason === "error" || run.stopReason === "aborted") {
				run.status = run.stopReason === "aborted" ? "aborted" : "failed";
				run.errorMessage = run.errorMessage ?? (stderr.trim() || `Subagent exited with code ${code ?? 1}`);
				finish();
				return;
			}
			run.status = "completed";
			finish();
		});

		if (params.signal) {
			const abort = () => {
				child.kill("SIGTERM");
				setTimeout(() => {
					if (!child.killed) {
						child.kill("SIGKILL");
					}
				}, 1000);
			};
			cleanup = () => params.signal?.removeEventListener("abort", abort);
			if (params.signal.aborted) {
				abort();
			} else {
				params.signal.addEventListener("abort", abort, { once: true });
			}
		}
	});

	return run;
}

function makePartial(details: SubagentToolDetails): AgentToolResult<SubagentToolDetails> {
	const latest = details.runs[details.runs.length - 1];
	return {
		content: [{ type: "text", text: latest?.output || `${latest?.role ?? "subagent"} running...` }],
		details,
	};
}

function formatUsage(run: SubagentRun): string | undefined {
	if (!run.usage) return undefined;
	const parts: string[] = [];
	if (run.usage.input > 0) parts.push(`↑${run.usage.input}`);
	if (run.usage.output > 0) parts.push(`↓${run.usage.output}`);
	if (run.usage.cacheRead > 0) parts.push(`R${run.usage.cacheRead}`);
	if (run.usage.cacheWrite > 0) parts.push(`W${run.usage.cacheWrite}`);
	if (run.usage.cost > 0) parts.push(`$${run.usage.cost.toFixed(4)}`);
	return parts.length > 0 ? parts.join(" ") : undefined;
}

async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
		while (true) {
			const current = next++;
			if (current >= items.length) {
				return;
			}
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

export function createSubagentToolDefinition(
	cwd: string,
	options?: { fastModelId?: string },
): ToolDefinition<typeof subagentSchema, SubagentToolDetails | undefined> {
	const fastModelId = options?.fastModelId;
	return {
		name: "subagent",
		label: "subagent",
		description:
			"Delegate bounded work to built-in sidecar roles. Use scout for read-only exploration, planner for plan compression, reviewer for read-only inspection, and worker for tightly scoped execution.",
		promptSnippet: "Delegate bounded work to built-in scout/planner/reviewer/worker sidecars",
		promptGuidelines: [
			"Use subagent for bounded side work during code exploration or review when the task splits cleanly.",
			"Keep subagent work narrow. Use at most 2 read-only sidecars in parallel.",
			"Use worker only for tightly scoped execution, never recursive delegation.",
		],
		parameters: subagentSchema,
		renderShell: "self",
		executionMode: "sequential",
		async execute(_toolCallId, input, signal, onUpdate, ctx) {
			validateInput(input);
			if (!ctx) {
				throw new Error("subagent requires a live session context");
			}
			if (!ctx.model) {
				throw new Error("subagent requires an active model");
			}
			const availableModels = await ctx.modelRegistry.getAvailableWithVisibilityRefresh();
			const currentThinkingLevel = ctx.getThinkingLevel();
			const mode = modeForInput(input);

			if (mode === "single") {
				const role = input.role as BuiltInSubagentRole;
				const resolved = resolveSubagentModel(role, ctx.model, currentThinkingLevel, availableModels, fastModelId);
				const run = await runSingleSubagent({
					role,
					task: input.task!,
					model: resolved.model,
					thinkingLevel: role === "worker" ? currentThinkingLevel : resolved.thinkingLevel,
					cwd,
					signal,
					onUpdate: (partialRun) => {
						onUpdate?.(makePartial({ mode, runs: [partialRun] }));
					},
				});
				const details: SubagentToolDetails = { mode, runs: [run] };
				return {
					content: [{ type: "text", text: run.output || run.errorMessage || "(no output)" }],
					details,
					isError: run.status !== "completed",
				};
			}

			if (mode === "parallel") {
				const runs: SubagentRun[] = roleListForMode(input).map((item) => ({
					role: item.role,
					task: item.task,
					status: "running",
					model: "",
					thinkingLevel: "off",
					output: "",
					progress: [],
				}));
				const tasks = input.tasks!;
				const results = await mapWithConcurrency(tasks, MAX_PARALLEL_SUBAGENTS, async (task, index) => {
					const resolved = resolveSubagentModel(
						task.role,
						ctx.model!,
						currentThinkingLevel,
						availableModels,
						fastModelId,
					);
					const run = await runSingleSubagent({
						role: task.role,
						task: task.task,
						model: resolved.model,
						thinkingLevel: resolved.thinkingLevel,
						cwd,
						signal,
						onUpdate: (partialRun) => {
							runs[index] = partialRun;
							onUpdate?.(makePartial({ mode, runs: [...runs] }));
						},
					});
					runs[index] = run;
					onUpdate?.(makePartial({ mode, runs: [...runs] }));
					return run;
				});
				const details: SubagentToolDetails = { mode, runs: results };
				const failed = results.some((run) => run.status !== "completed");
				const summary = results
					.map((run) => `[${run.role}] ${run.status}:\n${run.output || run.errorMessage || "(no output)"}`)
					.join("\n\n---\n\n");
				return {
					content: [{ type: "text", text: summary }],
					details,
					isError: failed,
				};
			}

			const chainRuns: SubagentRun[] = [];
			let previous = "";
			for (const step of input.chain!) {
				const resolved = resolveSubagentModel(
					step.role,
					ctx.model,
					currentThinkingLevel,
					availableModels,
					fastModelId,
				);
				const run = await runSingleSubagent({
					role: step.role,
					task: step.task.replace(/\{previous\}/g, previous),
					model: resolved.model,
					thinkingLevel: step.role === "worker" ? currentThinkingLevel : resolved.thinkingLevel,
					cwd,
					signal,
					onUpdate: (partialRun) => {
						onUpdate?.(makePartial({ mode, runs: [...chainRuns, partialRun] }));
					},
				});
				chainRuns.push(run);
				if (run.status !== "completed") {
					return {
						content: [{ type: "text", text: run.errorMessage || run.output || "Subagent chain failed" }],
						details: { mode, runs: chainRuns },
						isError: true,
					};
				}
				previous = run.output;
			}

			return {
				content: [{ type: "text", text: chainRuns[chainRuns.length - 1]?.output || "(no output)" }],
				details: { mode, runs: chainRuns },
			};
		},
		renderCall(args, theme) {
			const mode = modeForInput(args);
			const items = roleListForMode(args);
			const head =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("accent", mode) +
				theme.fg("muted", ` (${items.length} ${items.length === 1 ? "run" : "runs"})`);
			const preview = items
				.slice(0, 2)
				.map((item) => `  ${item.role} ${trimPreview(item.task, 60)}`)
				.join("\n");
			const extra = items.length > 2 ? `\n  ... +${items.length - 2} more` : "";
			return new Text(
				`${head}${preview ? `\n${theme.fg("toolOutput", preview)}` : ""}${theme.fg("muted", extra)}`,
				0,
				0,
			);
		},
		renderResult(result, options: ToolRenderResultOptions, theme) {
			const details = result.details;
			if (!details || details.runs.length === 0) {
				const text = result.content.find((item) => item.type === "text");
				return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
			}

			const lines: string[] = [];
			for (const run of details.runs) {
				const statusColor =
					run.status === "completed"
						? "success"
						: run.status === "running"
							? "accent"
							: run.status === "aborted"
								? "warning"
								: "error";
				lines.push(
					`${theme.fg(statusColor as any, run.status === "completed" ? "✓" : run.status === "running" ? "…" : run.status === "aborted" ? "!" : "✗")} ` +
						`${theme.fg("toolTitle", run.role)} ` +
						theme.fg("muted", `${run.model} (${run.thinkingLevel})`),
				);
				const usage = formatUsage(run);
				if (usage) {
					lines.push(theme.fg("dim", `  ${usage}`));
				}
				if (options.expanded) {
					lines.push(theme.fg("dim", `  task: ${run.task}`));
					for (const item of run.progress) {
						lines.push(theme.fg(item.kind === "tool" ? "muted" : "toolOutput", `  ${item.text}`));
					}
					if (run.output) {
						lines.push(theme.fg("toolOutput", `  output: ${trimPreview(run.output, 240)}`));
					}
					if (run.errorMessage) {
						lines.push(theme.fg("error", `  error: ${run.errorMessage}`));
					}
				} else {
					const summary =
						run.output || run.progress[run.progress.length - 1]?.text || run.errorMessage || "(no output)";
					lines.push(
						theme.fg(run.status === "completed" ? "toolOutput" : "dim", `  ${trimPreview(summary, 100)}`),
					);
				}
			}

			return new Text(lines.join("\n"), 0, 0);
		},
	};
}

export function createSubagentTool(cwd: string) {
	return wrapToolDefinition(createSubagentToolDefinition(cwd));
}

export const subagentToolDefinition = createSubagentToolDefinition(process.cwd());
export const subagentTool = createSubagentTool(process.cwd());
