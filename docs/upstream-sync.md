# Upstream Sync

## Quick Start

Run `/fetch-upstream` in your Claude Code session. It will fetch from upstream, show what changed, categorize pi core vs piper layer, and merge cleanly.

The upstream remote is `https://github.com/badlogic/pi-mono.git` (alias: `upstream`).

This repo carries piper-specific UX and runtime decisions on top of upstream pi. Keep upstream syncs reviewable by separating product behavior from runtime mechanics.

Before resolving conflicts, open `plans/HISTORY.md` to find the relevant plan trail for the area you are touching.

## Conflict Surfaces

- `packages/coding-agent/src/modes/interactive/`
  The shell layout, sidebar behavior, prompt ergonomics, scrolling, and branding live here.
- `packages/coding-agent/src/core/planning.ts`, `packages/coding-agent/src/core/agent-session.ts`, `packages/coding-agent/src/core/system-prompt.ts`
  Plan-mode behavior, `.plans` handoff structure, and plan-only mutation gating live here. Preserve piper's handoff-first semantics unless a plan record explicitly changes them.
- `packages/coding-agent/src/core/subagents/scheduler.ts`, `packages/coding-agent/src/core/tools/subagent.ts`
  Subagent scheduling should not run automatically while plan mode is on. Planning sidecars should produce handoff-oriented findings, not separate plan files.
- `packages/tui/src/`
  Only carry generic rendering primitives and stability fixes here. Do not move piper product behavior into `packages/tui`.
- `packages/coding-agent/src/bun/`, `pi-test.sh`, root/package workflow files
  Runtime and packaging changes belong here. Avoid leaking Bun-specific branching deep into product logic.
- `plans/`
  Use `plans/HISTORY.md` as the index, then open the relevant version/topic plan for the detailed piper decision trail.

## Runtime Rule

Source stays runtime-agnostic whenever practical.

- Prefer standard Node-compatible APIs that Bun also supports.
- Keep Bun entrypoint and packaging logic at the edges: CLI bootstrap, build scripts, lockfile handling, CI, and binary packaging.
- Do not fork core interactive behavior just because Bun is the runtime.
- If upstream changes land in shared product code, reconcile them in source first and only add runtime conditionals when there is a proven compatibility gap.

## Resolution Recipe

1. Rebase or merge upstream first without local cleanup commits mixed in.
2. Resolve shared source conflicts by preserving upstream logic unless piper has an explicit product decision recorded in `plans/HISTORY.md` and the linked detailed plan.
3. Re-apply Bun-specific edges only in runtime files:
   `package.json`, workflow files, `pi-test.sh`, `scripts/build-binaries.sh`, `packages/coding-agent/src/bun/cli.ts`.
4. Re-run the launcher from two directories:
   repo root and an unrelated external project directory.
5. Re-run focused regressions for any touched surface before the full repo check.
6. Update the relevant plan under `plans/` with any new decisions or exceptions that future reviewers should verify.
7. Update `plans/HISTORY.md` if the merge introduces a new major fork-specific change or changes how an existing one should be understood.

## Lockfile Rule

- Treat `bun.lock` as the authoritative workspace lockfile.
- Do not reintroduce `package-lock.json`.
- If a workspace dependency only works because npm hoisting masked a missing package boundary, add the missing direct dependency instead of relying on install shape.

## Review Checklist

- `piper --version` works from the repo root and from another working directory.
- Interactive prompts still render in the bottom dock rather than taking over the terminal.
- Sidebar extensions still map into canonical section ordering and semantic colors.
- Scroll, resize, and render diff changes stay in the minimal shared layer needed for correctness.
- No new Node-only assumptions were added to active piper runtime paths without an explicit reason.
