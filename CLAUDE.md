# Pico Agent Context

## What This Repo Is Doing

- This fork is turning pi into `pico`.
- `pico` is a polished pi-derived terminal app, not a new runtime architecture.
- BetterCode is deprecated as a product/app name for now.
- BetterCode is only a source of UX learnings and design taste.

## Product Principles

- transcript first
- composer docked to bottom
- calm, minimal shell
- visible model and thinking state
- strong streaming, scroll, and resize behavior
- right sidebar for read-only context
- preserve pi's editor power and extension model

## Implementation Boundaries

- Work mainly in `packages/coding-agent`
- Only change `packages/tui` for generic reusable primitives
- Preserve pi sessions, extensions, themes, keybindings, print mode, and RPC mode where practical
- Avoid speculative runtime rewrites and OpenCode-style complexity

## Clack Rule

- Prefer `clack` for transient guided flows:
  - selectors
  - confirms
  - settings
  - login/provider prompts
  - structured question flows
- Do not use `clack` for:
  - transcript rendering
  - streaming output
  - the main docked editor
  - arbitrary extension custom UI

## Active Plan

- Source of truth: `plans/v000/README.md`
- Keep it updated while implementing
- Use milestone TODO tracking:
  - `[ ]` not started
  - `[~]` in progress
  - `[x]` done
  - `[!]` blocked
- Execute one milestone at a time and validate before moving on

## Practical Reminder

- We are polishing pi into `pico`
- We are not porting the bettercode repo
- We are not preserving the BetterCode brand
- We are applying BetterCode interaction learnings to pi's terminal UI
