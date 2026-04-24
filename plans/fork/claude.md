# Plan: Piper → pi-mono npm consumer

## Context

Piper is currently a divergent fork of badlogic/pi-mono. It hosts 7 packages in the monorepo,
but only `coding-agent` (published as `piper-ai`) is piper's actual product. The other 6 packages
are pi-mono originals synced via git merge. This makes it hard to see "how much is piper's code"
because piper's additions are buried in a sea of upstream code.

Goal: repo should only contain code that is genuinely piper's. Everything else comes from npm.
When you open the repo, you see piper. Not pi.

---

## Current State Analysis

| Package | npm name | Piper changes | Plan |
|---|---|---|---|
| coding-agent | piper-ai | Yes — all piper features | Keep, is the product |
| tui | @mariozechner/pi-tui | Yes — BottomDockLayout, HorizontalSplit, Viewport, kitty keys (9 files, ~629 lines) | Keep in repo; publish to npm |
| ai | @mariozechner/pi-ai | Minor early-stage changes; upstream is 22+ commits ahead at 0.67.68 | **Audit first** → drop in favor of npm if feasible |
| agent | @mariozechner/pi-agent-core | None (100% upstream) | Remove, use npm |
| mom | @mariozechner/pi-mom | None | Remove entirely |
| pods | @mariozechner/pi | None | Remove entirely |
| web-ui | @mariozechner/pi-web-ui | None | Remove entirely |

---

## End State

```
piper-mono/
├── packages/
│   ├── tui/              ← piper's TUI fork (BottomDockLayout, Viewport, etc.) → published to npm
│   └── coding-agent/     ← piper product → published as piper-ai
└── scripts/
    └── update-pi.mjs     ← auto-bump @mariozechner/* deps, run check, open GH issue on failure
```

**npm dependencies of coding-agent after migration:**
- `packages/tui` (local workspace — piper's changes)
- `@mariozechner/pi-agent-core` from npm (no piper changes)
- `@mariozechner/pi-ai` from npm (if ai audit shows clean migration), OR keep `packages/ai` in repo if piper's changes are needed

This reduces the repo from 7 packages to 2 (or 3 if ai stays). The two remaining packages
are 100% piper's contribution.

---

## Migration Steps

### Step 1 — Audit piper's ai changes
Before removing packages/ai, understand what piper actually changed:
- `git diff upstream/main HEAD -- packages/ai/src/ | grep "^+" | grep -v "^+++"` to see piper additions only
- Key question: are these changes still needed, or has upstream incorporated them at 0.67.68?
- Check if `coding-agent` uses any imports or APIs that don't exist in published `@mariozechner/pi-ai@0.67.68`

**Decision point:** If piper's ai changes are minimal/already in upstream → remove packages/ai, use npm.
If piper's ai changes are unique → keep packages/ai in repo alongside tui.

### Step 2 — Remove 100%-upstream packages
Safe to do immediately, no audit needed:
- Delete `packages/agent/` from repo
- Delete `packages/mom/` from repo
- Delete `packages/pods/` from repo
- Delete `packages/web-ui/` from repo
- Update root `package.json` workspaces array
- Update root build/check/test scripts that reference these packages

### Step 3 — Switch packages/agent to npm
In `packages/coding-agent/package.json`:
- Replace workspace `@mariozechner/pi-agent-core: ^0.1.0` with `@mariozechner/pi-agent-core@latest` from npm
- Run `bun install`, then `bun run check` in packages/coding-agent
- Fix any API incompatibilities (version gap 0.4.0 → 0.67.68)

### Step 4 — Switch packages/ai to npm (conditional on Step 1 audit)
If audit shows clean migration:
- Delete `packages/ai/` from repo
- In `packages/coding-agent/package.json`: replace workspace dep with `@mariozechner/pi-ai@latest`
- Run `bun install`, then `bun run check`
- Fix API incompatibilities from version gap
- If audit shows piper needs its own ai: keep `packages/ai/` in repo, publish as part of piper

### Step 5 — Keep packages/tui in repo
No deletion needed. Just ensure it's still in the workspace and published.
- `packages/tui/package.json` currently points to `github.com/badlogic/pi-mono.git` as repository
- Update repository field to `github.com/bhaskarmelkani/piper.git` to reflect it's piper's fork
- Tui is already part of `bun run publish` — no publish changes needed

### Step 6 — Build and verify
- `bun run check` — must be clean (no errors, warnings, infos)
- Test piper TUI manually via tmux: `tmux new-session -d -s piper-test -x 220 -y 50 && tmux send-keys -t piper-test "piper-local" Enter && sleep 3 && tmux capture-pane -t piper-test -p`
- Verify `piper --version` works
- Verify interactive mode, sidebar, dock, and scroll

### Step 7 — Auto-update script (`scripts/update-pi.mjs`)
Script that runs on demand (or in CI nightly) to pull new versions of pi-mono deps:

```
1. npm view @mariozechner/pi-agent-core version   → check latest
2. npm view @mariozechner/pi-ai version           → check latest (if using npm)
3. Compare against current versions in package.json
4. If newer: update package.json, run bun install
5. Run: bun run check in packages/coding-agent
6. If check passes: print success, optionally commit
7. If check fails: gh issue create with title "[auto] pi-mono update breaks piper"
   body includes: new version, error output, which packages changed
```

### Step 8 — Cleanup
- Update `docs/upstream-sync.md` → replace with instructions to use `scripts/update-pi.mjs`
- Update `.claude/skills/fetch-upstream/` → repurpose or remove (no longer needed for ai/agent)
- Remove upstream git remote (optional — can keep for reference)
- Update root `package.json` name from `piper-mono` to `piper` (optional)
- Update CI to remove build/test steps for deleted packages

---

## What Piper Might Lose / Tradeoffs

| Item | Risk | Mitigation |
|---|---|---|
| Immediate pi-ai/agent bugfixes | Must wait for upstream npm publish | Update script runs nightly; critical bugs can be fast-tracked |
| TUI upstream improvements | Still need manual sync of packages/tui | tui stays in repo; fetch-upstream skill handles it just for tui |
| Ability to test against unreleased pi changes | Gone | Low risk; pi-mono releases frequently |
| API migration work (0.4.0 → 0.67.68) | One-time effort; scope unknown until Step 1 audit | Audit first before committing to timeline |

---

## Verification

After migration, the repo should pass these checks:
- `bun run check` clean from repo root
- `piper --version` prints correct version
- `piper-local` starts interactive TUI with dock layout intact
- Sidebar, scroll, resize work in tmux at 220x50
- Extension loading still works (extensions import @mariozechner/* at runtime)
- `bun run release:patch` still works (publishes piper-ai and updated tui)

---

## Files to Modify

**Delete:**
- `packages/agent/` (entire directory)
- `packages/mom/` (entire directory)
- `packages/pods/` (entire directory)
- `packages/web-ui/` (entire directory)
- `packages/ai/` (if audit approves)

**Modify:**
- `package.json` (root) — workspaces, scripts
- `packages/coding-agent/package.json` — dep versions
- `packages/tui/package.json` — repository URL
- `docs/upstream-sync.md` — update to reflect new sync model
- `.claude/skills/fetch-upstream/` — repurpose for tui-only sync
- `scripts/` — add `update-pi.mjs`

**Audit (read-only):**
- `packages/ai/src/` — what did piper actually change vs upstream?

