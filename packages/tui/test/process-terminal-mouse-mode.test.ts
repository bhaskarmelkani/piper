import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ProcessTerminal } from "../src/terminal.js";

type StdoutLike = NodeJS.WriteStream & {
	write: (chunk: string | Uint8Array) => boolean;
	on: (event: string, listener: (...args: unknown[]) => void) => NodeJS.WriteStream;
	removeListener: (event: string, listener: (...args: unknown[]) => void) => NodeJS.WriteStream;
	columns: number;
	rows: number;
};

type StdinLike = NodeJS.ReadStream & {
	isRaw?: boolean;
	setRawMode?: (raw: boolean) => void;
	setEncoding: (encoding: BufferEncoding) => void;
	resume: () => void;
	pause: () => void;
	on: (event: string, listener: (...args: unknown[]) => void) => NodeJS.ReadStream;
	removeListener: (event: string, listener: (...args: unknown[]) => void) => NodeJS.ReadStream;
};

describe("ProcessTerminal mouse mode", () => {
	const originalStdout = process.stdout;
	const originalStdin = process.stdin;
	const originalKill = process.kill;
	const originalSetTimeout = global.setTimeout;

	let writes: string[];
	let stdoutListeners: Array<{ event: string; listener: (...args: unknown[]) => void }>;
	let stdinListeners: Array<{ event: string; listener: (...args: unknown[]) => void }>;
	let rawModes: boolean[];
	let terminal: ProcessTerminal;

	beforeEach(() => {
		writes = [];
		stdoutListeners = [];
		stdinListeners = [];
		rawModes = [];

		const fakeStdout: StdoutLike = Object.assign(Object.create(originalStdout), {
			columns: 120,
			rows: 40,
			write: (chunk: string | Uint8Array) => {
				writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
				return true;
			},
			on: (event: string, listener: (...args: unknown[]) => void) => {
				stdoutListeners.push({ event, listener });
				return fakeStdout;
			},
			removeListener: (event: string, listener: (...args: unknown[]) => void) => {
				stdoutListeners = stdoutListeners.filter((entry) => entry.event !== event || entry.listener !== listener);
				return fakeStdout;
			},
		});

		const fakeStdin: StdinLike = Object.assign(Object.create(originalStdin), {
			isRaw: false,
			setRawMode: (raw: boolean) => {
				rawModes.push(raw);
			},
			setEncoding: (_encoding: BufferEncoding) => {},
			resume: () => {},
			pause: () => {},
			on: (event: string, listener: (...args: unknown[]) => void) => {
				stdinListeners.push({ event, listener });
				return fakeStdin;
			},
			removeListener: (event: string, listener: (...args: unknown[]) => void) => {
				stdinListeners = stdinListeners.filter((entry) => entry.event !== event || entry.listener !== listener);
				return fakeStdin;
			},
		});

		Object.defineProperty(process, "stdout", { value: fakeStdout, configurable: true });
		Object.defineProperty(process, "stdin", { value: fakeStdin, configurable: true });
		Object.defineProperty(process, "kill", {
			value: ((_pid: number, _signal?: NodeJS.Signals | number) => true) as typeof process.kill,
			configurable: true,
		});
		Object.defineProperty(global, "setTimeout", {
			value: ((_: (...args: unknown[]) => void, __?: number) => 0) as unknown as typeof setTimeout,
			configurable: true,
		});

		terminal = new ProcessTerminal();
	});

	afterEach(() => {
		Object.defineProperty(process, "stdout", { value: originalStdout, configurable: true });
		Object.defineProperty(process, "stdin", { value: originalStdin, configurable: true });
		Object.defineProperty(process, "kill", { value: originalKill, configurable: true });
		Object.defineProperty(global, "setTimeout", { value: originalSetTimeout, configurable: true });
	});

	it("enables alternate screen, bracketed paste, and ordered mouse tracking on start", () => {
		terminal.start(
			() => {},
			() => {},
		);

		assert.ok(writes.includes("\x1b[?1049h\x1b[2J\x1b[H"));
		assert.ok(writes.includes("\x1b[?2004h"));
		assert.ok(writes.includes("\x1b[?1002l\x1b[?1003l\x1b[?1000l\x1b[?1006l\x1b[?1007h"));
		assert.ok(writes.includes("\x1b[?u"));
		assert.deepStrictEqual(rawModes, [true]);
		assert.ok(stdoutListeners.some((entry) => entry.event === "resize"));
		assert.ok(stdinListeners.some((entry) => entry.event === "data"));
	});

	it("disables mouse tracking and restores terminal state on stop", () => {
		terminal.start(
			() => {},
			() => {},
		);
		writes = [];

		terminal.stop();

		assert.ok(writes.includes("\x1b[?2004l"));
		assert.ok(writes.includes("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1007l"));
		assert.ok(writes.includes("\x1b[?1049l"));
		assert.deepStrictEqual(rawModes, [true, false]);
	});
});
