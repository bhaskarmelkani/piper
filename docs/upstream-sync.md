# Upstream Sync

This repo carries piper-specific UX and runtime decisions on top of upstream pi. Keep upstream syncs reviewable by separating product behavior from runtime mechanics.

## Conflict Surfaces

- `packages/coding-agent/src/modes/interactive/`
  The shell layout, sidebar behavior, prompt ergonomics, scrolling, and branding live here.
- `packages/tui/src/`
  Only carry generic rendering primitives and stability fixes here. Do not move piper product behavior into `packages/tui`.
- `packages/coding-agent/src/bun/`, `pi-test.sh`, root/package workflow files
  Runtime and packaging changes belong here. Avoid leaking Bun-specific branching deep into product logic.
- `plans/v0.0.1/README.md`
  Use this as the execution ledger for piper-specific choices so future upstream merges have a clear decision trail.

## Runtime Rule

Source stays runtime-agnostic whenever practical.

- Prefer standard Node-compatible APIs that Bun also supports.
- Keep Bun entrypoint and packaging logic at the edges: CLI bootstrap, build scripts, lockfile handling, CI, and binary packaging.
- Do not fork core interactive behavior just because Bun is the runtime.
- If upstream changes land in shared product code, reconcile them in source first and only add runtime conditionals when there is a proven compatibility gap.

## Resolution Recipe

1. Rebase or merge upstream first without local cleanup commits mixed in.
2. Resolve shared source conflicts by preserving upstream logic unless piper has an explicit product decision recorded in the plan.
3. Re-apply Bun-specific edges only in runtime files:
   `package.json`, workflow files, `pi-test.sh`, `scripts/build-binaries.sh`, `packages/coding-agent/src/bun/cli.ts`.
4. Re-run the launcher from two directories:
   repo root and an unrelated external project directory.
5. Re-run focused regressions for any touched surface before the full repo check.
6. Update `plans/v0.0.1/README.md` with any new decisions or exceptions that future reviewers should verify.

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
