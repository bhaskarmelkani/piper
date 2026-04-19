import { describe, expect, it } from "vitest";
import { createUserShellScript, parseUserShellEndLine } from "../src/modes/interactive/user-shell-session.js";

describe("createUserShellScript", () => {
	it("wraps posix commands with start/end markers and interrupt handling", () => {
		const script = createUserShellScript("cd ../repo\npwd", "cmd-1", "posix");

		expect(script).toContain("__PIPER_USER_SHELL_START__cmd-1__");
		expect(script).toContain("__PIPER_USER_SHELL_END__cmd-1__");
		expect(script).toContain("trap '__piper_interrupted=130' INT");
		expect(script).toContain("cd ../repo");
	});

	it("wraps fish commands with fish status tracking", () => {
		const script = createUserShellScript("cd ../repo\npwd", "cmd-2", "fish");

		expect(script).toContain("__PIPER_USER_SHELL_START__cmd-2__");
		expect(script).toContain("__PIPER_USER_SHELL_END__cmd-2__");
		expect(script).toContain("set -l __piper_exit $status");
		expect(script).toContain("set -l __piper_cwd (pwd)");
	});
});

describe("parseUserShellEndLine", () => {
	it("parses exit code and cwd from the command footer", () => {
		const parsed = parseUserShellEndLine("__PIPER_USER_SHELL_END__cmd-3__\t7\t/tmp/my repo", "cmd-3");

		expect(parsed).toEqual({
			exitCode: 7,
			cwd: "/tmp/my repo",
		});
	});

	it("returns undefined for lines from a different command", () => {
		expect(parseUserShellEndLine("__PIPER_USER_SHELL_END__other__\t0\t/tmp", "cmd-4")).toBeUndefined();
	});
});
