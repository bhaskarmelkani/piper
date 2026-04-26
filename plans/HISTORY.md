# Plan History

This file is the top-level index for major fork-specific work.

Use it during upstream syncs to answer:
- what changed in piper
- why we changed it
- which plan contains the detailed decisions and validation

Keep entries short. The detailed record belongs in the linked plan.

## Entries

### 2026-04-24 — model selection stability

- Scope: restored Piper's Copilot model picker guardrails after the upstream visibility-adapter refactor so disabled, omitted, or unknown generated Copilot models stay hidden
- Why it matters for upstream sync: model-registry and generated-model changes can accidentally turn the picker back into a raw upstream model dump
- Source:
  - `plans/model-selection-stability/README.md`
  - `docs/upstream-sync.md`

### 2026-04-23 — lean built-in plan-only mode

- Scope: converted built-in planning in `packages/coding-agent` into an explicit toggle-only handoff flow with a lean `.plans` contract and fresh-session execution prompt
- Why it matters for upstream sync: prompt wording, session gating, sidebar state, and the exact `.plans` execution handoff are now fork-specific behavior that should not be overwritten by upstream planning changes
- Source:
  - `plans/lean-plan-mode/README.md`
  - `docs/upstream-sync.md`

### 2026-04-22 — plan history workflow

- Scope: formalized `plans/` as a persistent merge-history system instead of only release-scoped execution notes
- Why it matters for upstream sync: future conflicts should be resolved against documented piper decisions, not memory
- Source:
  - `plans/README.md`
  - `plans/TEMPLATE.md`
  - `docs/upstream-sync.md`
  - `AGENTS.md`

### 2026-04-18 — `v0.3.0` smart tools + subagents

- Scope: added built-in code navigation tools and built-in subagent sidecars in `packages/coding-agent`
- Why it matters for upstream sync: tool surface, prompt policy, scheduler behavior, and transcript rendering may conflict with upstream coding-agent changes
- Source:
  - `plans/v0.3.0/README.md`
  - `plans/v0.3.0/01-tools.md`
  - `plans/v0.3.0/02-subagents.md`

### 2026-04-18 — `v0.0.1` piper shell refresh + Bun runtime

- Scope: shell layout and sidebar refresh, `/vanity` work, scroll hardening, Bun-only runtime, merge guidance
- Why it matters for upstream sync: this is a primary record for piper-specific UX, runtime boundaries, and conflict-resolution rules
- Source:
  - `plans/v0.0.1/README.md`
  - `docs/upstream-sync.md`

### 2026-04-18 — `v000` pico shell foundation

- Scope: early fork direction for the transcript-first shell, docked composer, sidebar foundation, and staged branding
- Why it matters for upstream sync: documents the original product boundary between piper-specific shell work and upstream pi core
- Source:
  - `plans/v000/README.md`
