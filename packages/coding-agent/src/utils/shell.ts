import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { spawn, spawnSync } from "child_process";
import { getBinDir } from "../config.js";
import { SettingsManager } from "../core/settings-manager.js";

export interface ShellConfig {
	shell: string;
	args: string[];
}

export type ShellExecutionMode = "tool" | "user";

let cachedShellConfigs = new Map<ShellExecutionMode, ShellConfig>();

function getShellBasename(shellPath: string): string {
	const normalized = shellPath.replace(/\\/g, "/");
	return normalized.split("/").pop()?.toLowerCase() ?? normalized.toLowerCase();
}

export function getShellArgs(shellPath: string, mode: ShellExecutionMode): string[] {
	if (mode === "tool") {
		return ["-c"];
	}

	const shell = getShellBasename(shellPath);
	if (
		shell === "bash" ||
		shell === "zsh" ||
		shell === "fish" ||
		shell === "ksh" ||
		shell === "mksh" ||
		shell === "pdksh" ||
		shell === "csh" ||
		shell === "tcsh" ||
		shell === "nu" ||
		shell === "nushell"
	) {
		return ["-i", "-c"];
	}

	return ["-c"];
}

/**
 * Find bash executable on PATH (cross-platform)
 */
function findBashOnPath(): string | null {
	if (process.platform === "win32") {
		// Windows: Use 'where' and verify file exists (where can return non-existent paths)
		try {
			const result = spawnSync("where", ["bash.exe"], { encoding: "utf-8", timeout: 5000 });
			if (result.status === 0 && result.stdout) {
				const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
				if (firstMatch && existsSync(firstMatch)) {
					return firstMatch;
				}
			}
		} catch {
			// Ignore errors
		}
		return null;
	}

	// Unix: Use 'which' and trust its output (handles Termux and special filesystems)
	try {
		const result = spawnSync("which", ["bash"], { encoding: "utf-8", timeout: 5000 });
		if (result.status === 0 && result.stdout) {
			const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
			if (firstMatch) {
				return firstMatch;
			}
		}
	} catch {
		// Ignore errors
	}
	return null;
}

/**
 * Resolve shell configuration based on platform and an optional explicit shell path.
 * Resolution order:
 * 1. Explicit shell path argument
 * 2. On Windows: Git Bash in known locations, then bash on PATH
 * 3. On Unix: /bin/bash, then bash on PATH, then fallback to sh
 *
 * User mode:
 * 1. User-specified shellPath in settings.json
 * 2. On Unix: $SHELL when it exists
 * 3. Fall back to tool-mode resolution
 */
export function getShellConfig(modeOrShellPath: ShellExecutionMode | string = "tool"): ShellConfig {
	const mode: ShellExecutionMode = modeOrShellPath === "user" ? "user" : "tool";
	const explicitShellPath = modeOrShellPath === "tool" || modeOrShellPath === "user" ? undefined : modeOrShellPath;

	if (!explicitShellPath) {
		const cached = cachedShellConfigs.get(mode);
		if (cached) {
			return cached;
		}
	}

	const settings = mode === "user" && !explicitShellPath ? SettingsManager.create(process.cwd()) : undefined;
	const customShellPath = explicitShellPath ?? settings?.getShellPath();

	if (customShellPath) {
		if (existsSync(customShellPath)) {
			const config = { shell: customShellPath, args: getShellArgs(customShellPath, mode) };
			if (!explicitShellPath) {
				cachedShellConfigs.set(mode, config);
			}
			return config;
		}
		throw new Error(`Custom shell path not found: ${customShellPath}`);
	}

	if (mode === "user" && process.platform !== "win32") {
		const envShell = process.env.SHELL;
		if (envShell && existsSync(envShell)) {
			const config = { shell: envShell, args: getShellArgs(envShell, mode) };
			cachedShellConfigs.set(mode, config);
			return config;
		}
	}

	if (process.platform === "win32") {
		// 2. Try Git Bash in known locations
		const paths: string[] = [];
		const programFiles = process.env.ProgramFiles;
		if (programFiles) {
			paths.push(`${programFiles}\\Git\\bin\\bash.exe`);
		}
		const programFilesX86 = process.env["ProgramFiles(x86)"];
		if (programFilesX86) {
			paths.push(`${programFilesX86}\\Git\\bin\\bash.exe`);
		}

		for (const path of paths) {
			if (existsSync(path)) {
				const config = { shell: path, args: getShellArgs(path, mode) };
				cachedShellConfigs.set(mode, config);
				return config;
			}
		}

		// 3. Fallback: search bash.exe on PATH (Cygwin, MSYS2, WSL, etc.)
		const bashOnPath = findBashOnPath();
		if (bashOnPath) {
			const config = { shell: bashOnPath, args: getShellArgs(bashOnPath, mode) };
			cachedShellConfigs.set(mode, config);
			return config;
		}

		throw new Error(
			`No bash shell found. Options:\n` +
				`  1. Install Git for Windows: https://git-scm.com/download/win\n` +
				`  2. Add your bash to PATH (Cygwin, MSYS2, etc.)\n` +
				"  3. Set shellPath in settings.json\n\n" +
				`Searched Git Bash in:\n${paths.map((p) => `  ${p}`).join("\n")}`,
		);
	}

	// Unix: try /bin/bash, then bash on PATH, then fallback to sh
	if (existsSync("/bin/bash")) {
		const config = { shell: "/bin/bash", args: getShellArgs("/bin/bash", mode) };
		cachedShellConfigs.set(mode, config);
		return config;
	}

	const bashOnPath = findBashOnPath();
	if (bashOnPath) {
		const config = { shell: bashOnPath, args: getShellArgs(bashOnPath, mode) };
		cachedShellConfigs.set(mode, config);
		return config;
	}

	const config = { shell: "sh", args: getShellArgs("sh", mode) };
	cachedShellConfigs.set(mode, config);
	return config;
}

export function resetShellConfigCache(): void {
	cachedShellConfigs = new Map();
}

export function getShellEnv(): NodeJS.ProcessEnv {
	const binDir = getBinDir();
	const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const currentPath = process.env[pathKey] ?? "";
	const pathEntries = currentPath.split(delimiter).filter(Boolean);
	const hasBinDir = pathEntries.includes(binDir);
	const updatedPath = hasBinDir ? currentPath : [binDir, currentPath].filter(Boolean).join(delimiter);

	return {
		...process.env,
		[pathKey]: updatedPath,
	};
}

/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Lone surrogates
 * - Unicode Format characters (crash string-width due to a bug)
 * - Characters with undefined code points
 */
export function sanitizeBinaryOutput(str: string): string {
	// Use Array.from to properly iterate over code points (not code units)
	// This handles surrogate pairs correctly and catches edge cases where
	// codePointAt() might return undefined
	return Array.from(str)
		.filter((char) => {
			// Filter out characters that cause string-width to crash
			// This includes:
			// - Unicode format characters
			// - Lone surrogates (already filtered by Array.from)
			// - Control chars except \t \n \r
			// - Characters with undefined code points

			const code = char.codePointAt(0);

			// Skip if code point is undefined (edge case with invalid strings)
			if (code === undefined) return false;

			// Allow tab, newline, carriage return
			if (code === 0x09 || code === 0x0a || code === 0x0d) return true;

			// Filter out control characters (0x00-0x1F, except 0x09, 0x0a, 0x0x0d)
			if (code <= 0x1f) return false;

			// Filter out Unicode format characters
			if (code >= 0xfff9 && code <= 0xfffb) return false;

			return true;
		})
		.join("");
}

/**
 * Detached child processes must be tracked so they can be killed on parent
 * shutdown signals (SIGHUP/SIGTERM).
 */
const trackedDetachedChildPids = new Set<number>();

export function trackDetachedChildPid(pid: number): void {
	trackedDetachedChildPids.add(pid);
}

export function untrackDetachedChildPid(pid: number): void {
	trackedDetachedChildPids.delete(pid);
}

export function killTrackedDetachedChildren(): void {
	for (const pid of trackedDetachedChildPids) {
		killProcessTree(pid);
	}
	trackedDetachedChildPids.clear();
}

/**
 * Kill a process and all its children (cross-platform)
 */
export function killProcessTree(pid: number): void {
	if (process.platform === "win32") {
		// Use taskkill on Windows to kill process tree
		try {
			spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
				stdio: "ignore",
				detached: true,
			});
		} catch {
			// Ignore errors if taskkill fails
		}
	} else {
		// Use SIGKILL on Unix/Linux/Mac
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// Fallback to killing just the child if process group kill fails
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// Process already dead
			}
		}
	}
}
