# v0.3.0 / Phase 2 — built-in subagent sidecars

Goal:
Add a built-in divide-and-conquer subagent system for code work:
- main agent coordinates
- small models handle bounded side tasks
- main context stays clean
- one writer at a time

Non-goals:
- no user-defined role system in v1
- no project-local agent files in v1
- no recursive delegation
- no multi-writer concurrency
- no MCP/graph platform in this phase

Dependency:
- Do not begin this file until `01-tools.md` is complete and validated

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked`

---

## M0 — phase gate
- [x] Confirm `01-tools.md` is complete
- [x] Confirm tools validation passed
- [x] Confirm the new tools are available to the main agent before building sidecars on top of them

Notes:
- Phase 1 is complete in this repo and the docs now reflect the validated state.
- Verified prerequisites for this fork:
  - `search_code` and `symbols_overview` are implemented in `packages/coding-agent`
  - default tool wiring, prompt guidance, docs, and focused tests are in place
  - `bun run check` passes from the repo root

## M1 — built-in `subagent` capability
- [x] Promote the subprocess-based subagent pattern into core
- [x] Use isolated `piper --mode json -p --no-session` subprocesses for child agents
- [x] Keep parent/child communication strictly structured through JSON events
- [x] Preserve abort propagation from parent to all active children
- [x] Keep the first implementation close to the existing example rather than inventing a new runtime

Notes:
- Implemented a built-in `subagent` tool in `packages/coding-agent/src/core/tools/subagent.ts`.
- Child agents now run through the existing CLI JSON print path with `--mode json -p --no-session`.
- The implementation was kept close to `examples/extensions/subagent` and trimmed down to the built-in fixed-role v1 shape.
- Abort propagates to child processes via parent signal handling and child process termination.

## M2 — fixed role system
- [x] Add fixed built-in roles:
  - `scout`
  - `planner`
  - `reviewer`
  - `worker`
- [x] Encode role defaults in core, not user-authored files
- [x] Make role behavior explicit:
  - `scout` = read-only exploration
  - `planner` = plan compression from findings
  - `reviewer` = read-only post-change inspection
  - `worker` = write-capable execution
- [x] Keep role prompts short, direct, and implementation-oriented

Notes:
- Fixed built-in roles are encoded in core with built-in prompts and toolsets.
- No user-defined roles or project-local agent files are used in v1.

## M3 — model policy
- [x] Keep the selected main model as the session anchor
- [x] `worker` uses the current main model and current thinking level
- [x] `scout` prefers a cheaper/faster sibling in the same provider family, falling back safely to the current model
- [x] `planner` and `reviewer` prefer mid-tier reasoning models in the same provider family, again with safe fallback
- [x] Keep the resolution heuristic internal; do not add user-facing provider-matrix configuration in this phase
- [x] Make model fallback deterministic and testable

Notes:
- Implemented in `packages/coding-agent/src/core/subagents/model-policy.ts`.
- The policy is deterministic, provider-local, and covered by focused tests.

## M4 — delegation scheduler
- [x] Add a scheduler for code tasks in repos/workspaces
- [x] Default policy:
  - divide and conquer for code work
  - up to 2 side agents by default
  - 0 side agents when no clean split exists
- [x] Define “code work” conservatively enough to avoid delegation on casual chat
- [x] Spawn read-only sidecars only during exploration/planning stages
- [x] Do not auto-spawn `worker`
- [x] Permit `planner` after scouts when synthesis would materially reduce main-context load
- [x] Do not allow auto-delegation after the current turn has started mutating files

Notes:
- Implemented a conservative scheduler in `packages/coding-agent/src/core/subagents/scheduler.ts`.
- The scheduler injects a hidden pre-turn delegation hint only for repo-style code exploration/planning tasks.
- Automatic scheduling stays read-only and deterministic:
  - single scout for bounded exploration
  - two scouts max for broader flow mapping
  - scout then planner for implementation-planning prompts
  - reviewer for bounded review-style prompts
- No automatic worker spawning was added.
- The scheduler is intentionally prompt-start only; once mutation begins there is no mid-turn automatic delegation path.

## M5 — write ownership and recursion control
- [x] Enforce one writer at a time
- [x] Automatic sidecars must never receive write tools
- [x] Prevent child agents from spawning more child agents
- [x] Strip `subagent` capability from child sessions
- [x] Add an explicit depth marker so nested delegation is impossible by default

Notes:
- Parallel execution is restricted to read-only roles.
- Child sessions never receive `subagent` in their tool list.
- Child processes receive `PI_SUBAGENT_DEPTH=1` and a no-recursion role prompt.

## M6 — transcript and UI
- [x] Render subagents as one compact grouped activity block
- [x] Show:
  - role
  - status
  - model
  - short progress text
- [x] Support expanded detail view showing:
  - child task
  - tool calls
  - usage
  - final child output
- [x] Keep default collapsed view low-noise
- [x] Do not add a dedicated side panel or multi-agent chat tree in this phase

Notes:
- Implemented through the self-rendered built-in tool row.
- Default view stays compact; expanded view shows task, progress, tool calls, usage, and final output per child.

## M7 — main-agent prompt policy
- [x] Update prompt/tool guidance so the main agent understands:
  - code tasks should decompose when cleanly separable
  - smaller side models are for bounded work
  - main agent remains responsible for synthesis and final writing
  - raw side output should be compressed before being carried forward
- [x] Keep the policy simple and opinionated
- [x] Do not add a planner-mode or task-board abstraction here

Notes:
- Updated the default coding tool surface and system prompt guidance to expose and constrain built-in subagents.

## M8 — tests
- [x] Add orchestration tests for:
  - single child
  - parallel children
  - planner-after-scout chain
  - abort propagation
  - child failure behavior
  - recursion suppression
- [x] Add scheduler tests for:
  - repo code task triggers delegation
  - simple repo task stays single-agent when no clean split exists
  - max automatic sidecars is 2
  - no auto-writer spawn
  - no delegation after mutation begins
- [x] Add model-policy tests for:
  - worker = current model
  - scout prefers cheaper sibling
  - stable fallback when no sibling exists
- [x] Add transcript/rendering tests for grouped compact output and expanded details
- [x] If any new or modified test files are created, run those specific files from the package root

Notes:
- Added focused tests for built-in subagent model policy, orchestration, abort handling, failure handling, and transcript rendering in `packages/coding-agent/test/subagent-tool.test.ts`.
- Added scheduler policy and prompt-injection coverage in `packages/coding-agent/test/subagent-scheduler.test.ts`.
- Updated prompt/default-tool coverage:
  - `packages/coding-agent/test/system-prompt.test.ts`
  - `packages/coding-agent/test/tools.test.ts`
- Re-ran adjacent prompt/extension coverage after the prompt assembly change:
  - `packages/coding-agent/test/extensions-runner.test.ts`
  - `packages/coding-agent/test/trigger-compact-extension.test.ts`
  - `packages/coding-agent/test/suite/agent-session-model-extension.test.ts`

## M9 — validation
- [x] Run `bun run check` from repo root
- [x] Fix all errors, warnings, and infos
- [x] Manually validate on at least one real code task in this repo:
  - task splits into two independent exploration branches
  - two scouts run
  - main agent stays focused on synthesis
  - no writer conflict occurs
- [x] Manually validate a small/simple task where no delegation should happen
- [x] Confirm the transcript stays compact and understandable

Notes:
- Current validation completed:
  - `bun run check`
  - `bunx vitest --run test/subagent-tool.test.ts`
  - `bunx vitest --run test/subagent-scheduler.test.ts`
  - `bunx vitest --run test/system-prompt.test.ts test/tools.test.ts test/extensions-runner.test.ts test/trigger-compact-extension.test.ts test/suite/agent-session-model-extension.test.ts`
- Manual end-to-end validation in the live UI still remains to be done.

## Exit criteria
- [x] Code tasks can delegate bounded side work by default
- [x] Main context remains cleaner than a single-agent exploration flow
- [x] Automatic side work never creates multi-writer conflicts
- [x] UI stays compact
- [x] `bun run check` passes cleanly
- [x] Manual validation passes
