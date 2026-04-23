#!/usr/bin/env bun
/**
 * Publish piper-ai to npm.
 *
 * The workspace package name must stay @mariozechner/pi-coding-agent for internal
 * resolution (extensions and jiti depend on it). This script stages a temporary
 * package, renames it to piper-ai, and bundles the pi engine packages into the
 * tarball so public installs do not depend on unpublished @mariozechner/* versions.
 *
 * Usage: bun scripts/publish-piper.mjs [--dry-run]
 */
import { execSync } from "child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const REPO_ROOT = resolve(import.meta.dirname, "..");
const CODING_AGENT_DIR = resolve(REPO_ROOT, "packages/coding-agent");
const INTERNAL_PACKAGES = [
	{ name: "@mariozechner/pi-ai", dir: resolve(REPO_ROOT, "packages/ai") },
	{ name: "@mariozechner/pi-agent-core", dir: resolve(REPO_ROOT, "packages/agent") },
	{ name: "@mariozechner/pi-tui", dir: resolve(REPO_ROOT, "packages/tui") },
];
const CODING_AGENT_STAGE_PATHS = ["dist", "docs", "examples", "CHANGELOG.md", "README.md"];
const INTERNAL_STAGE_PATHS = ["dist", "README.md"];

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
	writeFileSync(path, JSON.stringify(value, null, "\t") + "\n");
}

function copyIfExists(sourcePath, targetPath) {
	if (!existsSync(sourcePath)) {
		return;
	}
	cpSync(sourcePath, targetPath, { recursive: true });
}

function packageDirFromName(name) {
	const segments = name.split("/");
	return join(...segments);
}

function stagePackageArtifacts(sourceDir, targetDir, paths) {
	mkdirSync(targetDir, { recursive: true });
	for (const relativePath of paths) {
		copyIfExists(join(sourceDir, relativePath), join(targetDir, basename(relativePath)));
	}
}

function rewriteBundledDependencies(dependencies, version) {
	if (!dependencies) {
		return dependencies;
	}
	return Object.fromEntries(
		Object.entries(dependencies).map(([name, value]) =>
			INTERNAL_PACKAGES.some((pkg) => pkg.name === name) ? [name, version] : [name, value],
		),
	);
}

const pkg = readJson(join(CODING_AGENT_DIR, "package.json"));
const stageDir = mkdtempSync(join(tmpdir(), "piper-publish-"));
try {
	stagePackageArtifacts(CODING_AGENT_DIR, stageDir, CODING_AGENT_STAGE_PATHS);
	const stagedScripts = { ...pkg.scripts };
	delete stagedScripts.prepublishOnly;

	const stagedPkg = {
		...pkg,
		name: "piper-ai",
		dependencies: rewriteBundledDependencies(pkg.dependencies, pkg.version),
		bundledDependencies: INTERNAL_PACKAGES.map((dependency) => dependency.name),
		scripts: stagedScripts,
	};
	delete stagedPkg._name;
	writeJson(join(stageDir, "package.json"), stagedPkg);

	const stageNodeModulesDir = join(stageDir, "node_modules");
	for (const dependency of INTERNAL_PACKAGES) {
		const dependencyPkg = readJson(join(dependency.dir, "package.json"));
		const stagedDependencyPkg = {
			...dependencyPkg,
			dependencies: rewriteBundledDependencies(dependencyPkg.dependencies, pkg.version),
		};
		const dependencyStageDir = join(stageNodeModulesDir, packageDirFromName(dependency.name));
		stagePackageArtifacts(dependency.dir, dependencyStageDir, INTERNAL_STAGE_PATHS);
		writeJson(join(dependencyStageDir, "package.json"), stagedDependencyPkg);
	}

	console.log(`Publishing piper-ai@${pkg.version}${DRY_RUN ? " (dry run)" : ""}...`);
	const cmd = DRY_RUN ? "npm pack --dry-run" : "npm publish --access public";

	execSync(cmd, { cwd: stageDir, stdio: "inherit" });

	console.log("\nPublished successfully.");
} finally {
	rmSync(stageDir, { recursive: true, force: true });
}
