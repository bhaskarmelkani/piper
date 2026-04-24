# lean-plan-mode — lean built-in planning handoff

Convert built-in planning from "write a plan before coding" into "write a concise handoff and stop" so Piper stays fast, intentional, and low-slop.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

## Goal

Make plan mode a strict planning-only turn:
- read-only exploration
- one concise `.plans` handoff artifact
- no repo implementation while planning is active

## Why this exists in piper

- Piper wants a simple fast agent with stronger thinking, not a heavyweight workflow framework.
- This is product behavior in `packages/coding-agent`, not an upstream runtime concern.

## Upstream conflict surfaces

- `packages/coding-agent/src/core/planning.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/subagents/scheduler.ts`
- `packages/coding-agent/src/core/tools/subagent.ts`
- `packages/coding-agent/examples/extensions/subagent/agents/planner.md`
- `packages/coding-agent/src/modes/interactive/components/shell-sidebar.ts`
- `packages/coding-agent/src/modes/interactive/components/settings-selector.ts`
- `packages/coding-agent/README.md`

Preserve upstream by default outside these planning-specific files.

## Execution rule

- Keep the artifact shape lean: `Goal`, `Facts`, `Plan`, `Validation`, `Risks`
- Do not add new modes, workflow trees, or multi-file planning systems
- Planning turns stop after the handoff file is written

## Milestones

### M0 — scope
- [x] Confirm the built-in plan-only scope and keep it inside `packages/coding-agent`

### M1 — implementation
- [x] Replace the generic plan template with the lean 5-section handoff format
- [x] Update planning prompt text to require concise grounded plans
- [x] Block non-plan edits while planning is active
- [x] Limit planning-mode bash to read-only exploration
- [x] Stop the agent after a successful plan-file write

### M2 — validation
- [x] Run focused tests
- [x] Run `bun run check`
- [x] Record manual verification notes if needed

### M3 — PR hardening
- [x] Remove auto plan mode; planning only starts from the explicit plan toggle
- [x] Suppress automatic scout/planner scheduling when plan mode is enabled
- [x] Keep planner wording focused on handoff output instead of implementation edits
- [x] Show plan status in the sidebar as `Plan on/off`
- [x] Ask whether to execute the completed handoff in a fresh non-plan session

## Decisions to preserve

- Built-in plan mode is handoff-only, not plan-then-execute.
- The planning artifact is one Markdown file in `.plans/`.
- Planning quality is enforced by concise sections, grounded facts, and milestone validation lines.
- Plan mode must block repo mutation even when edit mode is on.
- Plan mode is explicit only; there is no auto plan mode.
- Completed plans can be executed immediately by starting a fresh session with plan mode off and sending the saved handoff as the first prompt.

## Validation record

- Ran `bunx vitest --run test/planning.test.ts test/system-prompt.test.ts test/suite/agent-session-mode-gating.test.ts` from `packages/coding-agent`
- Ran `bun run check` from the repo root
- Verified the new guardrails through tests covering exact plan-file writes, blocked repo writes, blocked mutating bash, and stop-after-plan termination
- Ran `bunx vitest --run test/subagent-scheduler.test.ts test/shell-sidebar-mode-state.test.ts test/planning.test.ts test/system-prompt.test.ts test/suite/agent-session-mode-gating.test.ts` from `packages/coding-agent`
- Ran `bunx vitest --run test/interactive-mode-plan-edit.test.ts test/subagent-scheduler.test.ts test/shell-sidebar-mode-state.test.ts test/planning.test.ts test/system-prompt.test.ts test/suite/agent-session-mode-gating.test.ts` from `packages/coding-agent`
- Covered the sidebar regression where `/plan off` updated the transcript but the sidebar still showed `Plan on`

## Follow-up

- If future work adds richer planning artifacts, keep the default path single-file and low-ceremony.
- If upstream changes planning hooks, preserve piper's stop-after-plan semantics unless explicitly replaced.
