#!/usr/bin/env bun
/**
 * Publish piper-ai to npm.
 *
 * The workspace package name must stay @mariozechner/pi-coding-agent for internal
 * resolution (extensions and jiti depend on it). This script temporarily renames
 * it to piper-ai for the publish, then restores it.
 *
 * Usage: bun scripts/publish-piper.mjs [--dry-run]
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const PKG_PATH = resolve(import.meta.dirname, "../packages/coding-agent/package.json");

const original = readFileSync(PKG_PATH, "utf8");
const pkg = JSON.parse(original);

if (pkg.name === "piper-ai") {
	console.error("package.json already has name=piper-ai — previous publish may have crashed. Restore it first.");
	process.exit(1);
}

const modified = { ...pkg, name: "piper-ai" };
delete modified._name;

try {
	console.log(`Publishing piper-ai@${pkg.version}${DRY_RUN ? " (dry run)" : ""}...`);
	writeFileSync(PKG_PATH, JSON.stringify(modified, null, "\t") + "\n");

	const cmd = [
		"bun publish --access public",
		DRY_RUN ? "--dry-run" : "",
	].filter(Boolean).join(" ");

	execSync(cmd, { cwd: resolve(import.meta.dirname, "../packages/coding-agent"), stdio: "inherit" });

	console.log("\nPublished successfully.");
} finally {
	writeFileSync(PKG_PATH, original);
	console.log("Restored package.json.");
}
