import { createWriteStream, promises as fs, type WriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import * as nodePty from "node-pty";
import stripAnsi from "strip-ansi";
import type { BashResult } from "../../core/bash-executor.js";
import { DEFAULT_MAX_BYTES, truncateTail } from "../../core/tools/truncate.js";
import { getShellConfig, getShellEnv, sanitizeBinaryOutput } from "../../utils/shell.js";

const OUTPUT_BUFFER_BYTES = DEFAULT_MAX_BYTES * 2;
const START_MARKER_PREFIX = "__PIPER_USER_SHELL_START__";
const END_MARKER_PREFIX = "__PIPER_USER_SHELL_END__";
const CANCEL_EXIT_CODE = 130;

type ShellFamily = "posix" | "fish";

type ActiveCommand = {
	id: string;
	started: boolean;
	abortRequested: boolean;
	scriptPath: string;
	parseBuffer: string;
	outputChunks: string[];
	outputBytes: number;
	totalBytes: number;
	tempFilePath?: string;
	tempFileStream?: WriteStream;
	onChunk?: (chunk: string) => void;
	resolve: (result: BashResult) => void;
	reject: (error: Error) => void;
};

function getShellFamily(shellPath: string): ShellFamily {
	const shellName = basename(shellPath).toLowerCase();
	if (shellName === "fish") {
		return "fish";
	}
	return "posix";
}

function getStartMarker(id: string): string {
	return `${START_MARKER_PREFIX}${id}__`;
}

function getEndMarkerPrefix(id: string): string {
	return `${END_MARKER_PREFIX}${id}__`;
}

function stripTrailingLineBreak(text: string): string {
	return text.replace(/\r?\n$/, "");
}

function findLineEnd(text: string, fromIndex: number): number {
	const lineFeedIndex = text.indexOf("\n", fromIndex);
	if (lineFeedIndex === -1) {
		return -1;
	}
	return lineFeedIndex + 1;
}

function quoteShellPath(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function createUserShellScript(command: string, id: string, family: ShellFamily): string {
	const startMarker = getStartMarker(id);
	const endMarker = getEndMarkerPrefix(id);

	if (family === "fish") {
		return [
			`printf '%s\\n' '${startMarker}'`,
			command,
			"set -l __piper_exit $status",
			"set -l __piper_cwd (pwd)",
			`printf '%s\\t%s\\t%s\\n' '${endMarker}' "$__piper_exit" "$__piper_cwd"`,
			"",
		].join("\n");
	}

	return [
		"__piper_finish() {",
		'\t__piper_exit="$1"',
		"\t__piper_cwd=$(pwd)",
		`\tprintf '%s\\t%s\\t%s\\n' '${endMarker}' "$__piper_exit" "$__piper_cwd"`,
		"\ttrap - INT",
		"}",
		"__piper_interrupted=''",
		`trap '__piper_interrupted=${CANCEL_EXIT_CODE}' INT`,
		`printf '%s\\n' '${startMarker}'`,
		command,
		"__piper_exit=$?",
		'if [ -n "$__piper_interrupted" ]; then',
		'\t__piper_exit="$__piper_interrupted"',
		"fi",
		'__piper_finish "$__piper_exit"',
		"",
	].join("\n");
}

export function parseUserShellEndLine(
	line: string,
	id: string,
): { exitCode: number | undefined; cwd: string } | undefined {
	const prefix = getEndMarkerPrefix(id);
	if (!line.startsWith(prefix)) {
		return undefined;
	}

	const [marker, exitCodeText = "", cwd = ""] = line.split("\t", 3);
	if (marker !== prefix) {
		return undefined;
	}

	const parsedExitCode = Number.parseInt(exitCodeText, 10);
	return {
		exitCode: Number.isFinite(parsedExitCode) ? parsedExitCode : undefined,
		cwd,
	};
}

export class UserShellSession {
	private cwd: string;
	private tempDir: string | undefined;
	private shell: nodePty.IPty | undefined;
	private shellExitDisposable: nodePty.IDisposable | undefined;
	private shellDataDisposable: nodePty.IDisposable | undefined;
	private activeCommand: ActiveCommand | undefined;
	private executionQueue: Promise<unknown> = Promise.resolve();
	private disposed = false;
	private readonly shellPath: string;
	private readonly shellFamily: ShellFamily;
	private readonly onCwdChange?: (cwd: string) => void;

	constructor(options: { cwd: string; onCwdChange?: (cwd: string) => void }) {
		const { shell } = getShellConfig("user");
		this.cwd = resolve(options.cwd);
		this.shellPath = shell;
		this.shellFamily = getShellFamily(shell);
		this.onCwdChange = options.onCwdChange;
	}

	get isCommandRunning(): boolean {
		return this.activeCommand !== undefined;
	}

	async execute(command: string, onChunk?: (chunk: string) => void): Promise<BashResult> {
		const run = this.executionQueue.then(() => this.executeQueued(command, onChunk));
		this.executionQueue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	abortActiveCommand(): void {
		if (!this.activeCommand || !this.shell) {
			return;
		}

		this.activeCommand.abortRequested = true;
		this.shell.write("\u0003");
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		this.shellDataDisposable?.dispose();
		this.shellDataDisposable = undefined;
		this.shellExitDisposable?.dispose();
		this.shellExitDisposable = undefined;
		this.shell?.kill();
		this.shell = undefined;
		this.activeCommand = undefined;
		if (this.tempDir) {
			await fs.rm(this.tempDir, { recursive: true, force: true });
			this.tempDir = undefined;
		}
	}

	private async executeQueued(command: string, onChunk?: (chunk: string) => void): Promise<BashResult> {
		if (this.disposed) {
			throw new Error("User shell session has been disposed");
		}

		await this.ensureShell();
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		const scriptPath = await this.writeScriptFile(id, command);

		return await new Promise<BashResult>((resolve, reject) => {
			if (!this.shell) {
				reject(new Error("Shell exited before command could be sent"));
				return;
			}

			this.activeCommand = {
				id,
				started: false,
				abortRequested: false,
				scriptPath,
				parseBuffer: "",
				outputChunks: [],
				outputBytes: 0,
				totalBytes: 0,
				onChunk,
				resolve,
				reject,
			};

			try {
				this.shell.write(`${this.getSourceCommand(scriptPath)}\r`);
			} catch (err) {
				this.activeCommand = undefined;
				reject(new Error(`Failed to send command to shell: ${err instanceof Error ? err.message : String(err)}`));
			}
		});
	}

	private async ensureShell(): Promise<void> {
		if (this.shell) {
			return;
		}

		this.tempDir ??= await fs.mkdtemp(join(tmpdir(), "piper-user-shell-"));
		this.shell = nodePty.spawn(this.shellPath, ["-i"], {
			name: process.env.TERM || "xterm-256color",
			cols: process.stdout.columns || 80,
			rows: process.stdout.rows || 24,
			cwd: this.cwd,
			env: getShellEnv(),
		});

		this.shellDataDisposable = this.shell.onData((data) => {
			this.handleShellData(data);
		});
		this.shellExitDisposable = this.shell.onExit(({ exitCode }) => {
			const activeCommand = this.activeCommand;
			this.shellDataDisposable?.dispose();
			this.shellDataDisposable = undefined;
			this.shellExitDisposable?.dispose();
			this.shellExitDisposable = undefined;
			this.shell = undefined;
			if (!activeCommand) {
				return;
			}
			void this.completeActiveCommand(exitCode, activeCommand.abortRequested);
		});
	}

	private async writeScriptFile(id: string, command: string): Promise<string> {
		this.tempDir ??= await fs.mkdtemp(join(tmpdir(), "piper-user-shell-"));
		const extension = this.shellFamily === "fish" ? "fish" : "sh";
		const scriptPath = join(this.tempDir, `command-${id}.${extension}`);
		await fs.writeFile(scriptPath, createUserShellScript(command, id, this.shellFamily), "utf8");
		return scriptPath;
	}

	private getSourceCommand(scriptPath: string): string {
		const quotedPath = quoteShellPath(scriptPath);
		if (this.shellFamily === "fish") {
			return `source ${quotedPath}`;
		}
		return `. ${quotedPath}`;
	}

	private handleShellData(data: string): void {
		const activeCommand = this.activeCommand;
		if (!activeCommand) {
			return;
		}

		activeCommand.parseBuffer += data;
		if (!activeCommand.started) {
			const startMarker = getStartMarker(activeCommand.id);
			const markerIndex = activeCommand.parseBuffer.indexOf(startMarker);
			if (markerIndex === -1) {
				activeCommand.parseBuffer = activeCommand.parseBuffer.slice(-startMarker.length);
				return;
			}

			const lineEnd = findLineEnd(activeCommand.parseBuffer, markerIndex + startMarker.length);
			if (lineEnd === -1) {
				return;
			}

			activeCommand.started = true;
			activeCommand.parseBuffer = activeCommand.parseBuffer.slice(lineEnd);
		}

		this.flushActiveCommandOutput();
	}

	private flushActiveCommandOutput(): void {
		const activeCommand = this.activeCommand;
		if (!activeCommand || !activeCommand.started) {
			return;
		}

		const endMarkerPrefix = getEndMarkerPrefix(activeCommand.id);
		while (true) {
			const markerIndex = activeCommand.parseBuffer.indexOf(endMarkerPrefix);
			if (markerIndex === -1) {
				const tailSize = endMarkerPrefix.length + 4096;
				const emitLength = Math.max(0, activeCommand.parseBuffer.length - tailSize);
				if (emitLength > 0) {
					this.appendCommandOutput(activeCommand, activeCommand.parseBuffer.slice(0, emitLength));
					activeCommand.parseBuffer = activeCommand.parseBuffer.slice(emitLength);
				}
				return;
			}

			if (markerIndex > 0) {
				this.appendCommandOutput(activeCommand, activeCommand.parseBuffer.slice(0, markerIndex));
			}

			const lineEnd = findLineEnd(activeCommand.parseBuffer, markerIndex + endMarkerPrefix.length);
			if (lineEnd === -1) {
				activeCommand.parseBuffer = activeCommand.parseBuffer.slice(markerIndex);
				return;
			}

			const endLine = stripTrailingLineBreak(activeCommand.parseBuffer.slice(markerIndex, lineEnd));
			const parsedLine = parseUserShellEndLine(endLine, activeCommand.id);
			activeCommand.parseBuffer = activeCommand.parseBuffer.slice(lineEnd);
			if (!parsedLine) {
				this.appendCommandOutput(activeCommand, `${endLine}\n`);
				continue;
			}

			void this.completeActiveCommand(parsedLine.exitCode, activeCommand.abortRequested, parsedLine.cwd);
			return;
		}
	}

	private appendCommandOutput(activeCommand: ActiveCommand, chunk: string): void {
		if (!chunk) {
			return;
		}

		const sanitizedChunk = sanitizeBinaryOutput(stripAnsi(chunk)).replace(/\r/g, "");
		if (!sanitizedChunk) {
			return;
		}

		activeCommand.totalBytes += sanitizedChunk.length;
		if (activeCommand.totalBytes > DEFAULT_MAX_BYTES) {
			this.ensureTempFile(activeCommand);
		}

		if (activeCommand.tempFileStream) {
			activeCommand.tempFileStream.write(sanitizedChunk);
		}

		activeCommand.outputChunks.push(sanitizedChunk);
		activeCommand.outputBytes += sanitizedChunk.length;
		while (activeCommand.outputBytes > OUTPUT_BUFFER_BYTES && activeCommand.outputChunks.length > 1) {
			const removed = activeCommand.outputChunks.shift() ?? "";
			activeCommand.outputBytes -= removed.length;
		}

		activeCommand.onChunk?.(sanitizedChunk);
	}

	private ensureTempFile(activeCommand: ActiveCommand): void {
		if (activeCommand.tempFilePath) {
			return;
		}

		activeCommand.tempFilePath = join(this.tempDir ?? tmpdir(), `piper-user-shell-output-${activeCommand.id}.log`);
		activeCommand.tempFileStream = createWriteStream(activeCommand.tempFilePath);
		for (const chunk of activeCommand.outputChunks) {
			activeCommand.tempFileStream.write(chunk);
		}
	}

	private closeTempFileStream(activeCommand: ActiveCommand): void {
		const tempFileStream = activeCommand.tempFileStream;
		tempFileStream?.end();
		activeCommand.tempFileStream = undefined;
	}

	private async completeActiveCommand(
		exitCode: number | undefined,
		cancelled: boolean,
		cwd: string = this.cwd,
	): Promise<void> {
		const activeCommand = this.activeCommand;
		if (!activeCommand) {
			return;
		}

		this.activeCommand = undefined;
		this.closeTempFileStream(activeCommand);

		const fullOutput = activeCommand.outputChunks.join("");
		const truncationResult = truncateTail(fullOutput);
		if (truncationResult.truncated) {
			this.ensureTempFile(activeCommand);
			this.closeTempFileStream(activeCommand);
		}

		try {
			await fs.unlink(activeCommand.scriptPath);
		} catch {
			// Best-effort cleanup only.
		}

		const resolvedCwd = resolve(cwd || this.cwd);
		if (resolvedCwd !== this.cwd) {
			this.cwd = resolvedCwd;
			this.onCwdChange?.(resolvedCwd);
		}

		activeCommand.resolve({
			output: truncationResult.truncated ? truncationResult.content : fullOutput,
			exitCode,
			cancelled,
			truncated: truncationResult.truncated,
			fullOutputPath: activeCommand.tempFilePath,
		});
	}
}
