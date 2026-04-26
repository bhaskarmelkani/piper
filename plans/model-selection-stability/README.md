# model-selection-stability — fork model picker guardrails

Keep Piper's model picker stable across upstream model-registry and generated-model syncs.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

## Goal

Prevent upstream model-list churn from surfacing disabled, deprecated, or unavailable models in Piper's `/model` selector.

## Why this exists in piper

- Piper treats model selection as a polished product surface, not a raw generated model dump.
- Copilot model availability is partly live-policy driven and partly static fallback driven; when the live policy refresh fails, Piper should still hide unknown Copilot models instead of showing every generated model.
- This is fork-specific product behavior in `packages/coding-agent`; pi engine/model generation can stay upstream-compatible.

## Upstream conflict surfaces

- `packages/coding-agent/src/utils/copilot-model-policies.ts`
- `packages/coding-agent/src/core/model-registry.ts`
- `packages/coding-agent/src/modes/interactive/components/model-selector.ts`
- `packages/ai/src/models.generated.ts`

## Milestones

### M0 — regression isolate
- [x] Trace `/model` selector through `ModelRegistry.getAvailableWithVisibilityRefresh()`
- [x] Compare current registry adapter against the pre-refactor picker filtering behavior

### M1 — implementation
- [x] Restore Copilot static known-model fallback inside the visibility adapter
- [x] Keep live Copilot responses authoritative for explicit disabled and omitted models
- [x] Hide live-policy entries that have no live or static multiplier

### M2 — validation
- [x] Add focused Copilot policy fallback tests
- [x] Add registry-level regression coverage for hidden generated Copilot models
- [x] Run focused test files
- [x] Run adjacent shell/sidebar/model-selector regression tests
- [x] Run full `bun run check`

## Decisions to preserve

- A successful Copilot `/models` response is authoritative: omitted or disabled Copilot models stay hidden.
- A failed Copilot `/models` response is not permission to show every generated Copilot model.
- Static `COPILOT_MULTIPLIERS` is the offline allowlist for Copilot picker visibility.
- Unknown Copilot models with no live multiplier and no static multiplier stay hidden until intentionally added.

## Validation record

- `bunx vitest --run test/copilot-model-policies.test.ts test/model-registry.test.ts` from `packages/coding-agent`: passed.
- `bunx vitest --run test/copilot-model-policies.test.ts test/model-registry.test.ts test/interactive-shell-layout.test.ts test/interactive-mode-plan-edit.test.ts test/subagent-scheduler.test.ts test/suite/agent-session-mode-gating.test.ts test/suite/regressions/3217-scoped-model-order.test.ts` from `packages/coding-agent`: passed.
- `bun run check` from the repo root: passed.

## Follow-up

- When `packages/ai/src/models.generated.ts` receives new Copilot models from upstream, review whether each should be added to `COPILOT_MULTIPLIERS`.
