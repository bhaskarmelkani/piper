# Plans

This directory is both:
- the execution tracker for active major work
- the long-term history of fork-specific decisions we may need during upstream syncs

## Rules

- Every major piper-specific change gets a plan record in `plans/`
- Keep the active plan updated while work is in progress
- When the change is done, leave the plan in place as history; do not delete it
- Add or update an entry in `plans/HISTORY.md` for every major change
- If the change affects upstream merge behavior, also update `docs/upstream-sync.md`

## What counts as a major change

Create or update a plan when the work changes one or more of these:
- terminal UX or interaction model
- branding or product defaults in `packages/coding-agent`
- runtime, packaging, or CI behavior
- upstream conflict surfaces
- architectural boundaries between piper code and upstream pi code

Small fixes can stay out of `plans/` unless they create merge risk or change an existing plan's decision.

## Layout

- `plans/HISTORY.md`
  Chronological index of major fork changes and where their details live.
- `plans/TEMPLATE.md`
  Copy this when starting a new major change or release-scoped effort.
- `plans/<name>/README.md`
  The main execution ledger for that change.
- `plans/<name>/NN-*.md`
  Optional phase files for large efforts.

## Required contents for a major plan

Each major plan should capture:
- goal and scope
- why the change exists in piper
- upstream conflict surfaces
- milestone checklist using `[ ] [~] [x] [!]`
- key decisions that future conflict resolution must preserve
- validation that proved the change stable
- follow-up notes or known risks

## Upstream merge workflow

When syncing from upstream:
1. Open `plans/HISTORY.md`
2. Find the relevant plan(s) for the conflicted area
3. Preserve upstream by default unless a piper-specific decision is explicitly recorded
4. If a new merge rule or exception is discovered, record it in the plan and in `docs/upstream-sync.md`
