---
description: Sync piper fork with upstream pi-mono without overwriting piper's work
---
Sync this piper fork with upstream pi-mono.

**Boundary rule — never forget this:**
- `packages/coding-agent` is the piper layer. Review every upstream change here carefully before accepting.
- Everything else (`packages/ai`, `packages/tui`, `packages/agent`, `packages/mom`, `packages/web-ui`, `packages/pods`) is pi core. Merge cleanly, piper has no changes there.

## Step 1 — Ensure upstream remote

```bash
git remote -v
```

If `upstream` is not present, add it:

```bash
git remote add upstream https://github.com/badlogic/pi-mono.git
```

## Step 2 — Fetch

```bash
git fetch upstream main
```

## Step 3 — Show what's new

```bash
git log HEAD..upstream/main --oneline
git diff --name-status HEAD..upstream/main
```

Summarize: how many commits, which packages are touched. If `packages/coding-agent` is touched, flag it explicitly. If nothing is new, stop — the fork is already up to date.

## Step 4 — Categorize and confirm

Split changed files into:
- **Pi core** (safe): `packages/ai`, `packages/agent`, `packages/mom`, `packages/pods`, `packages/web-ui`, root tsconfig/biome files
- **Piper layer** (review): `packages/coding-agent`, `packages/tui`, `scripts/build-binaries.sh`, `.github/workflows/build-binaries.yml`, root `package.json`, `AGENTS.md`, `CLAUDE.md`

Show the user this breakdown and confirm before merging.

## Step 5 — Merge

```bash
git merge upstream/main --no-ff -m "chore: sync upstream pi-mono $(git log upstream/main -1 --format='%h %s')"
```

**If conflicts arise**, follow `docs/upstream-sync.md` resolution recipe:
- Pi core conflicts → upstream wins (`git checkout --theirs -- <file>`)
- Piper layer conflicts → check `plans/v0.0.1/README.md`; keep piper's side if there's an explicit recorded decision, otherwise preserve upstream logic alongside piper's additions
- Build/CI/lockfile → always keep piper's `piper-*` artifact naming, `bun.lock`, and `piper-mono` root name

## Step 6 — Verify

```bash
bun install
bun install --frozen-lockfile
piper-local --version
npm run check
```

Walk through the checklist in `docs/upstream-sync.md`. Report pass/fail for each item.

## Step 7 — Report

Summarize what was merged, any conflicts resolved, and checklist results. Do not push — the user decides when.
