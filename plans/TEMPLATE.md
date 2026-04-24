# <plan-name> — <short title>

One-line description of the change and why it exists.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

## Goal

Describe the user-facing or architectural outcome.

## Why this exists in piper

- State the fork-specific reason for the change
- Note whether this is product behavior, runtime behavior, or merge-policy behavior

## Upstream conflict surfaces

- List directories and files that may need special handling during upstream sync
- Note which areas should preserve upstream by default and which have explicit piper decisions

## Execution rule

- Define any sequencing or validation gates

## Milestones

### M0 — scaffold
- [ ] Create plan files
- [ ] Confirm scope and boundaries

### M1 — implementation
- [ ] Add concrete milestone items here

### M2 — validation
- [ ] Run required checks
- [ ] Run focused tests for touched surfaces
- [ ] Record manual verification

## Decisions to preserve

- Record short, explicit decisions future conflict resolution should preserve
- Prefer direct statements over long narrative

## Validation record

- Commands run
- Manual checks completed
- Remaining gaps, if any

## Follow-up

- Known risks
- Deferred work
- Merge notes for future upstream pulls
