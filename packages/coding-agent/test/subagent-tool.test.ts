import { PassThrough } from "node:stream";
import type { Model } from "@mariozechner/pi-ai";
import type { Text } from "@mariozechner/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.js";
import { resolveSubagentModel } from "../src/core/subagents/model-policy.js";
import { createSubagentToolDefinition } from "../src/core/tools/subagent.js";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
	spawn: (...args: unknown[]) => spawnMock(...args),
}));

function createModel(
	provider: string,
	id: string,
	options?: { name?: string; reasoning?: boolean; cost?: number },
): Model<any> {
	return {
		provider,
		id,
		name: options?.name ?? id,
		api: "openai-responses",
		baseUrl: "https://example.com",
		reasoning: options?.reasoning ?? true,
		input: ["text"],
		cost: {
			input: options?.cost ?? 1,
			output: options?.cost ?? 1,
			cacheRead: 0,
			cacheWrite: 0,
		},
		contextWindow: 128000,
		maxTokens: 8192,
	};
}

function createSpawnHandle(lines: string[]) {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const handlers = new Map<string, ((...args: any[]) => void)[]>();

	const child = {
		stdout,
		stderr,
		killed: false,
		on(event: string, handler: (...args: any[]) => void) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return child;
		},
		kill: vi.fn(() => {
			child.killed = true;
		}),
	};

	queueMicrotask(() => {
		for (const line of lines) {
			stdout.write(`${line}\n`);
		}
		stdout.end();
		for (const handler of handlers.get("close") ?? []) {
			handler(0, null);
		}
	});

	return child;
}

function createAbortableSpawnHandle(lines: string[]) {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const handlers = new Map<string, ((...args: any[]) => void)[]>();

	const child = {
		stdout,
		stderr,
		killed: false,
		on(event: string, handler: (...args: any[]) => void) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return child;
		},
		kill: vi.fn(() => {
			child.killed = true;
			for (const handler of handlers.get("close") ?? []) {
				handler(null, "SIGTERM");
			}
		}),
	};

	queueMicrotask(() => {
		for (const line of lines) {
			if (child.killed) return;
			stdout.write(`${line}\n`);
		}
		if (child.killed) return;
		stdout.end();
	});

	return child;
}

describe("subagent model policy", () => {
	it("keeps worker pinned to the current model and thinking level", () => {
		const current = createModel("anthropic", "claude-sonnet", { cost: 10 });
		const resolved = resolveSubagentModel("worker", current, "high", [current]);
		expect(resolved.model).toBe(current);
		expect(resolved.thinkingLevel).toBe("high");
	});

	it("prefers a cheaper sibling for scout", () => {
		const current = createModel("anthropic", "claude-sonnet", { cost: 10 });
		const cheap = createModel("anthropic", "claude-haiku", { cost: 1, reasoning: false });
		const resolved = resolveSubagentModel("scout", current, "high", [current, cheap]);
		expect(resolved.model.id).toBe("claude-haiku");
	});

	it("falls back to the current model when no sibling exists", () => {
		const current = createModel("openai", "gpt-5", { cost: 10 });
		const otherProvider = createModel("anthropic", "claude-sonnet", { cost: 3 });
		const resolved = resolveSubagentModel("planner", current, "medium", [current, otherProvider]);
		expect(resolved.model.id).toBe("gpt-5");
	});
});

describe("subagent tool", () => {
	const currentModel = createModel("openai", "gpt-5", { cost: 10 });
	const scoutModel = createModel("openai", "gpt-5-mini", { cost: 1, reasoning: false });
	let context: ExtensionContext;

	beforeEach(() => {
		spawnMock.mockReset();
		context = {
			cwd: process.cwd(),
			model: currentModel,
			modelRegistry: {
				getAvailable: () => [currentModel, scoutModel],
			},
			getThinkingLevel: () => "high",
		} as unknown as ExtensionContext;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("invokes child sessions in json no-session mode and strips subagent from worker tools", async () => {
		spawnMock.mockImplementation(() =>
			createSpawnHandle([
				JSON.stringify({
					type: "tool_execution_start",
					toolName: "search_code",
					args: { method: "keyword", query: "foo" },
				}),
				JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "done" }],
						stopReason: "end_turn",
					},
				}),
			]),
		);

		const tool = createSubagentToolDefinition(process.cwd());
		const result = await tool.execute(
			"subagent-1",
			{ role: "worker", task: "inspect auth flow" },
			undefined,
			undefined,
			context,
		);

		expect(result.content[0]).toMatchObject({ type: "text", text: "done" });
		const [, childArgs] = spawnMock.mock.calls[0] as [string, string[]];
		expect(childArgs).toContain("--mode");
		expect(childArgs).toContain("json");
		expect(childArgs).toContain("--no-session");
		expect(childArgs).toContain("--thinking");
		expect(childArgs).toContain("high");
		const toolsArg = childArgs[childArgs.indexOf("--tools") + 1];
		expect(toolsArg).toContain("write");
		expect(toolsArg).not.toContain("subagent");
	});

	it("rejects parallel worker runs to keep one writer at a time", async () => {
		const tool = createSubagentToolDefinition(process.cwd());
		await expect(
			tool.execute(
				"subagent-2",
				{
					tasks: [
						{ role: "worker", task: "change file A" },
						{ role: "scout", task: "inspect file B" },
					],
				},
				undefined,
				undefined,
				context,
			),
		).rejects.toThrow(/Parallel subagents are read-only only/);
	});

	it("runs at most two scouts in parallel and summarizes both results", async () => {
		spawnMock
			.mockImplementationOnce(() =>
				createSpawnHandle([
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "mapped entry points" }],
							stopReason: "end_turn",
						},
					}),
				]),
			)
			.mockImplementationOnce(() =>
				createSpawnHandle([
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "mapped downstream flow" }],
							stopReason: "end_turn",
						},
					}),
				]),
			);

		const tool = createSubagentToolDefinition(process.cwd());
		const result = await tool.execute(
			"subagent-3",
			{
				tasks: [
					{ role: "scout", task: "map entry points" },
					{ role: "scout", task: "map downstream flow" },
				],
			},
			undefined,
			undefined,
			context,
		);

		const text = result.content[0];
		expect(spawnMock).toHaveBeenCalledTimes(2);
		expect(text).toMatchObject({ type: "text" });
		expect((text as { text: string }).text).toContain("[scout] completed:\nmapped entry points");
		expect((text as { text: string }).text).toContain("[scout] completed:\nmapped downstream flow");
	});

	it("supports planner-after-scout chains with previous output injection", async () => {
		spawnMock
			.mockImplementationOnce(() =>
				createSpawnHandle([
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "file A, file B, risk C" }],
							stopReason: "end_turn",
						},
					}),
				]),
			)
			.mockImplementationOnce(() =>
				createSpawnHandle([
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "step 1, step 2" }],
							stopReason: "end_turn",
						},
					}),
				]),
			);

		const tool = createSubagentToolDefinition(process.cwd());
		const result = await tool.execute(
			"subagent-4",
			{
				chain: [
					{ role: "scout", task: "find the files" },
					{ role: "planner", task: "compress these findings:\n{previous}" },
				],
			},
			undefined,
			undefined,
			context,
		);

		const [, firstArgs] = spawnMock.mock.calls[0] as [string, string[]];
		const [, secondArgs] = spawnMock.mock.calls[1] as [string, string[]];
		expect(firstArgs[firstArgs.length - 1]).toBe("find the files");
		expect(secondArgs[secondArgs.length - 1]).toContain("file A, file B, risk C");
		expect(result.content[0]).toMatchObject({ type: "text", text: "step 1, step 2" });
	});

	it("propagates aborts to the child process", async () => {
		spawnMock.mockImplementation(() =>
			createAbortableSpawnHandle([
				JSON.stringify({
					type: "tool_execution_start",
					toolName: "search_code",
					args: { method: "keyword", query: "auth" },
				}),
			]),
		);

		const tool = createSubagentToolDefinition(process.cwd());
		const controller = new AbortController();
		const resultPromise = tool.execute(
			"subagent-5",
			{ role: "scout", task: "trace auth" },
			controller.signal,
			undefined,
			context,
		);
		controller.abort();
		const result = await resultPromise;

		expect((result as { isError?: boolean }).isError).toBe(true);
		const [child] = spawnMock.mock.results[0]?.value ? [spawnMock.mock.results[0].value] : [];
		expect(child.kill).toHaveBeenCalled();
	});

	it("marks child failures as errors", async () => {
		spawnMock.mockImplementation(() =>
			createSpawnHandle([
				JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "failed" }],
						stopReason: "error",
						errorMessage: "child failed",
					},
				}),
			]),
		);

		const tool = createSubagentToolDefinition(process.cwd());
		const result = await tool.execute(
			"subagent-6",
			{ role: "scout", task: "trace auth" },
			undefined,
			undefined,
			context,
		);

		expect((result as { isError?: boolean }).isError).toBe(true);
		expect(result.content[0]).toMatchObject({ type: "text", text: "failed" });
	});

	it("renders compact and expanded transcript output", () => {
		const tool = createSubagentToolDefinition(process.cwd());
		const theme = {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const result = {
			content: [{ type: "text" as const, text: "done" }],
			details: {
				mode: "parallel" as const,
				runs: [
					{
						role: "scout" as const,
						task: "map auth flow",
						status: "completed" as const,
						model: "openai/gpt-5-mini",
						thinkingLevel: "minimal" as const,
						output: "mapped auth flow",
						progress: [{ kind: "tool" as const, text: 'search_code keyword "auth"' }],
						usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0 },
					},
				],
			},
			isError: false,
		};

		const renderContext = {} as any;
		const compact = tool.renderResult?.(
			result,
			{ expanded: false, isPartial: false },
			theme as any,
			renderContext,
		) as Text;
		const expanded = tool.renderResult?.(
			result,
			{ expanded: true, isPartial: false },
			theme as any,
			renderContext,
		) as Text;

		expect(compact.render(120).join("\n")).toContain("mapped auth flow");
		expect(expanded.render(120).join("\n")).toContain("task: map auth flow");
		expect(expanded.render(120).join("\n")).toContain("search_code keyword");
	});
});
