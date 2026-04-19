import { afterEach, describe, expect, it } from "vitest";
import { getShellArgs, resetShellConfigCache } from "../src/utils/shell.js";

describe("shell config helpers", () => {
	afterEach(() => {
		resetShellConfigCache();
	});

	it("keeps tool shell execution non-interactive", () => {
		expect(getShellArgs("/bin/bash", "tool")).toEqual(["-c"]);
		expect(getShellArgs("/bin/zsh", "tool")).toEqual(["-c"]);
	});

	it("uses interactive command mode for user shells that load shell setup", () => {
		expect(getShellArgs("/bin/zsh", "user")).toEqual(["-i", "-c"]);
		expect(getShellArgs("/bin/bash", "user")).toEqual(["-i", "-c"]);
		expect(getShellArgs("/opt/homebrew/bin/fish", "user")).toEqual(["-i", "-c"]);
	});

	it("falls back to plain command mode for unknown shells", () => {
		expect(getShellArgs("/usr/bin/sh", "user")).toEqual(["-c"]);
		expect(getShellArgs("/custom/shells/xonsh", "user")).toEqual(["-c"]);
	});
});
