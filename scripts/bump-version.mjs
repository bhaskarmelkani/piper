#!/usr/bin/env bun
/**
 * Bumps version across all workspace package.json files (lockstep).
 * Replaces: npm version <type|version> -ws --no-git-tag-version
 *
 * Usage:
 *   bun scripts/bump-version.mjs patch
 *   bun scripts/bump-version.mjs minor
 *   bun scripts/bump-version.mjs major
 *   bun scripts/bump-version.mjs 1.2.3
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const target = process.argv[2];
const BUMP_TYPES = new Set(["patch", "minor", "major"]);
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

if (!target || (!BUMP_TYPES.has(target) && !SEMVER_RE.test(target))) {
	console.error("Usage: bun scripts/bump-version.mjs <patch|minor|major|x.y.z>");
	process.exit(1);
}

function bumpSemver(version, type) {
	const [major, minor, patch] = version.split(".").map(Number);
	if (type === "major") return `${major + 1}.0.0`;
	if (type === "minor") return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

const rootPkgPath = "package.json";
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
const currentVersion = rootPkg.version;
const newVersion = BUMP_TYPES.has(target) ? bumpSemver(currentVersion, target) : target;

if (!BUMP_TYPES.has(target)) {
	const [curMajor, curMinor, curPatch] = currentVersion.split(".").map(Number);
	const [newMajor, newMinor, newPatch] = newVersion.split(".").map(Number);
	const isGreater =
		newMajor > curMajor ||
		(newMajor === curMajor && newMinor > curMinor) ||
		(newMajor === curMajor && newMinor === curMinor && newPatch > curPatch);
	if (!isGreater) {
		console.error(`Error: ${newVersion} must be greater than current version ${currentVersion}`);
		process.exit(1);
	}
}

console.log(`Bumping ${currentVersion} → ${newVersion}`);

rootPkg.version = newVersion;
writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, "\t") + "\n");
console.log("  Updated package.json");

const packagesDir = "packages";
for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const pkgPath = join(packagesDir, entry.name, "package.json");
	if (!existsSync(pkgPath)) continue;
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	pkg.version = newVersion;
	writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");
	console.log(`  Updated ${pkg.name}`);
}

console.log(`\nAll packages at ${newVersion}`);
