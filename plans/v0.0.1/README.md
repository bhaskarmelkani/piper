# piper v0.0.1 — active plan

UI refresh, sidebar restructure, agentic `/vanity`, scroll hardening, Bun-only runtime, cleanup.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked.

Execute one milestone at a time and validate before moving on (per CLAUDE.md).

---

## M0 — Bootstrap
- [x] Create `plans/v0.0.1/` and this README
- [ ] Commit: `chore(plan): v0.0.1 scaffold`

## M1 — Theme evolution
- [x] Audit current palette in `dark.json` / `light.json`; list offenders
- [x] Add semantic layer (`sem.accent|success|warning|error|info|textPrimary|textSecondary|muted|dim|bgSubtle|bgAccent`)
- [x] Dark theme: keep teal accent, cool neutrals, demote yellow to warning-only, replace gold `mdHeading`, desaturate syntax golds
- [x] Light theme: mirror changes, verify WCAG AA contrast
- [x] Point all non-semantic tokens at `sem.*`
- [x] Migrate raw-hex/ANSI call-sites to `Theme.fg()/bg()`
- [x] Smoke test dark ↔ light across: prompt, tool block (pending/success/error), md heading, code block, selection, thinking banner, warning toast
- [ ] Commit: `feat(theme): evolve palette with semantic color map`

## M2 — Sidebar restructure
- [x] Canonical `order` bands: header=10, requests=20, context=30, capabilities=40, workspace=50
- [x] Header group: Title (accent/bold), Model, Thinking level
- [x] Requests group: Premium `N / M`, Reset, Usage `↑in ↓out` as sub-row
- [x] Context group: meter + %, context file, Focus
- [x] Capabilities group: Skills, Prompts, Extensions
- [x] Workspace group: cwd, git branch, Status
- [x] Blank-line dividers between groups; reuse existing helpers (no new layout primitive)
- [x] Semantic coloring: labels muted, values textPrimary, title accent; meter thresholds success<60 / warning 60-85 / error>85
- [x] Map extension-declared color strings through semantic palette; reject raw hex
- [x] Verify vanity / copilot-budget / prompt-url-widget fall into predictable bands
- [ ] Commit: `feat(sidebar): group sections, semantic coloring, canonical ordering`

## M3 — /vanity agentic
- [x] Deterministic context breakdown from session log: % system / tool / user / assistant / thinking
- [x] Extend `turn_end` LLM prompt to narrate breakdown + recommendations
- [x] Cache last analysis, stale flag > 2 turns
- [x] Menu: Deep-dive sidebar, Describe context, Suggest next action (keep existing Session Health, Git Status, Recent Commits)
- [x] Preserve sidebar key `"vanity"` and `order: 40`
- [x] Hand-verify numbers after a tool-heavy turn
- [ ] Commit: `feat(vanity): agentic context breakdown and deep-dive actions`

## M4 — Scroll flicker fix
- [x] `addWheelScroll`: short-circuit at boundary in event's direction
- [x] `tickScrollAnim`: gate `requestRender()` on `|smoothed - target| > epsilon`
- [x] `Viewport.render`: invalidate `lastContentHeight`/`lastViewportHeight` on any width/height change
- [x] `doRender`: no-op re-entry with identical offset + unchanged diff range
- [x] Repro steps pass: boundary wheel, reverse, resize mid-scroll
- [ ] Commit: `fix(scroll): drop wheel events at boundary, gate redraw on movement, reset viewport cache on resize`

## M5 — Bun-only runtime
### M5a scripts + lockfile
- [x] Root + per-package `package.json`: `bun run`, `bun --watch`, `bun test`, `engines.bun`, drop `engines.node`, set `packageManager`
- [x] Delete `package-lock.json`; generate `bun.lock`
- [x] Drop `tsx` if unused

### M5b tests
- [x] Migrate `node --test` in tui to Bun-runner coverage
- [x] Keep vitest tests running via `bun test` compat (port helpers if needed)
- [x] `bash-close-hang-windows.test.ts` green under Bun

### M5c runtime validation
- [x] `utils/photon.ts` WASM loader under `bun run` and compiled binary
- [x] `utils/child-process.ts` Windows hang workaround under Bun
- [x] `ProcessTerminal` / readline with Bun stdio
- [x] `koffi` externalized in `bun build --compile`
- [x] `@mariozechner/jiti` extension hot-load + `/reload`
- [x] `fs.watch` theme reload + git HEAD watch on macOS + Linux
- [x] Hot-reload E2E: theme edit, extension edit + /reload, git branch switch

### M5d CI
- [x] `.github/workflows/ci.yml`: Bun only
- [x] `.github/workflows/build-binaries.yml`: Bun only, preserve cross-platform matrix
- [x] Replace `profile-coding-agent-node.mjs` with Bun equivalent or delete

### M5e docs
- [x] `docs/upstream-sync.md`: conflict surfaces, resolution recipe, source-stays-runtime-agnostic rule
- [ ] Commit: `feat(runtime): migrate piper to bun-only`

## M6 — Cleanup
- [x] Raw-hex sweep outside theme JSON
- [x] Dedupe sidebar helpers introduced in M2
- [x] Revisit render throttle post-M4
- [x] Confirm `packages/ai` `canvas` usage in piper's active path; drop if unused
- [x] Scrub TODO/FIXME/commented-out blocks in changed files
- [ ] Commit: `chore: post-refresh cleanup`

---

## Critical files
See the archived session plan for the full file index and verification checklist.

---

## Claude Review Report

### Scope completed in this pass

- Finished the plan scaffold bookkeeping for M0 (minus commit step).
- Landed the M1 theme refactor in code: both built-in themes now resolve through semantic `sem.*` vars instead of raw per-token colors.
- Landed the main M2 sidebar restructure in code: grouped rendering, canonical order bands, semantic label/value coloring, bottom-pinned workspace block, and guarded extension color mapping.
- Replaced active piper symbol/icon surfaces in the interactive shell to use `∏` for the header glyph and terminal title. Also removed lingering `pi logo` alt text in the two readmes.
- Refined the M2 meter treatment to match the slimmer visual direction: compact one-line bars for Copilot/context, horizontal dividers between groups, and short workspace naming instead of full cwd paths.
- Polished the bottom composer with a dim empty-state placeholder and a padded default left margin so the dock no longer renders flush against the border.
- Replaced one-shot local `!` execution with a persistent PTY-backed user shell session so terminal state now survives across commands, `cd` updates the active workspace state, and `/reload` can refresh the newly-selected project instead of the original startup directory.
- Audited prompt/selector usage for Clack and rolled back in-session extension `select` / `confirm` / single-line `input` to docked TUI components. Clack takeover renders from the top of the terminal, which breaks the native bottom-composer interaction model for live sessions.
- Removed the now-unused Clack integration from `packages/tui` entirely, including the dependency, re-export shim, and stale built prompt surface that local workspace resolution was still picking up.
- Normalized the user-facing `piper` launcher to execute this repo through Bun from any working directory so runtime behavior does not depend on where the command is invoked.
- Completed the M3 `/vanity` pass: deterministic context accounting, cached/stale analysis, sidebar sections, and agentic `/vanity` actions wired through the built-in command.
- Completed the M4 scroll hardening pass: boundary wheel suppression, epsilon-gated redraws, viewport cache invalidation on size changes, and duplicate diff suppression in the TUI renderer.
- Completed the M5 Bun runtime pass: direct dependency fixes exposed by Bun, Bun-first scripts/workflows, clean `bun.lock`, `package-lock.json` removal, Bun launcher parity across directories, and Bun-aligned focused test execution.
- Closed the M6 cleanup pass: lockfile hygiene, profile script rename, root/browser-smoke dependency cleanup, web-ui package boundary fixes, and updated upstream-sync documentation for future merges.

### Decisions taken

- In-session prompts must preserve the native transcript + bottom-composer model. If a prompt system takes over the terminal and renders at the top, it is not acceptable for core piper interaction.
- Clack was removed rather than partially retained. Keeping an unused prompt abstraction would add maintenance cost, stale exports, and review noise without improving UX.
- The `piper` command must behave the same from every working directory. Runtime entrypoint differences are treated as product bugs, not user setup quirks.
- User-entered `!` commands should behave like an integrated terminal session, not like isolated tool subprocesses. Shell state must persist across commands, and workspace-aware piper state should follow terminal `cd` changes.
- Workspace-specific differences should come from discovered context and resources only: cwd, git state, AGENTS/CLAUDE files, skills, prompts, extensions, and project settings.
- Sidebar rendering should stay compact and low-noise: short workspace labels, horizontal separators, predictable order bands, and slim meters instead of tall blocks.
- Bun 1.3 uses the text `bun.lock` format in this repo, not `bun.lockb`. The plan item was updated to match the actual lockfile format.
- `tsx` was audited and retained. It is still used by targeted tooling/tests, so removing it would have been churn rather than cleanup.
- Bun exposed several hidden hoist assumptions. The fix policy is to add missing direct dependencies (`@sinclair/typebox`, `@smithy/node-http-handler`, `@anthropic-ai/sandbox-runtime`, `esbuild`, web-ui direct imports) instead of relying on install shape.
- Root package duplication of the published `@mariozechner/pi-coding-agent` package was removed because it conflicted with the local workspace package and made `bun.lock` non-freezable.

### Review focus for Claude Code

- Verify there is no remaining Clack usage or prompt takeover path in active TUI flows.
- Verify extension `select` / `confirm` / `input` interactions render in the dock area and restore composer focus correctly on submit, cancel, timeout, and abort.
- Verify the global `piper` launcher now resolves to the Bun entrypoint consistently from multiple directories.
- Verify no stale TUI prompt exports remain in source or built workspace surfaces that local resolution can still hit.
- Verify sidebar grouping, compact meters, shortened workspace display, and `∏` branding changes match the intended product direction.
- Verify the `/vanity` extension math and stale-analysis behavior remain deterministic and review the built-in `/vanity` command prompts that are generated from sidebar state.
- Verify the scroll fixes stay minimal: no regressions in bottom anchoring, no redraw storms, and no stale viewport caches after resize.
- Verify Bun workspace/package boundary fixes are intentional and minimal, especially the added direct dependencies and the removal of the root `@mariozechner/pi-coding-agent` dependency.
- Verify `docs/upstream-sync.md` accurately captures how future upstream merges should treat Bun/runtime changes versus shared product code.

### Files changed

- `packages/coding-agent/src/modes/interactive/theme/dark.json`
- `packages/coding-agent/src/modes/interactive/theme/light.json`
- `packages/coding-agent/src/modes/interactive/components/shell-sidebar.ts`
- `packages/coding-agent/src/modes/interactive/components/sidebar-semantics.ts`
- `packages/coding-agent/src/modes/interactive/components/custom-message.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/config.ts`
- `packages/coding-agent/src/bun/cli.ts`
- `packages/coding-agent/examples/extensions/copilot-budget.ts`
- `packages/coding-agent/examples/extensions/vanity.ts`
- `packages/coding-agent/test/interactive-shell-layout.test.ts`
- `packages/coding-agent/test/vanity-extension.test.ts`
- `packages/tui/src/components/viewport.ts`
- `packages/tui/src/tui.ts`
- `packages/tui/test/viewport-cache.test.ts`
- `packages/tui/src/index.ts`
- `packages/tui/src/prompts/index.ts` (removed)
- `packages/tui/package.json`
- `packages/agent/package.json`
- `packages/ai/package.json`
- `packages/web-ui/package.json`
- `packages/web-ui/tsconfig.json`
- `docs/upstream-sync.md`
- `package-lock.json`
- `bun.lock`
- `scripts/release.mjs`
- `scripts/profile-coding-agent-bun.mjs`
- `scripts/profile-coding-agent-node.mjs` (removed)
- `README.md`
- `packages/coding-agent/README.md`

### Verification

- Ran `bunx vitest --run test/interactive-shell-layout.test.ts test/vanity-extension.test.ts test/bash-close-hang-windows.test.ts test/suite/regressions/2791-fswatch-error-crash.test.ts test/suite/regressions/2753-reload-stale-resource-settings.test.ts` from `packages/coding-agent`
- Ran `bun test test/viewport-cache.test.ts` from `packages/tui`
- Ran `npm run check` from the repo root after the final Bun/dependency fixes
- Ran `bun install --frozen-lockfile` from the repo root after regenerating `bun.lock`
- Verified Bun CLI startup with `--version` from both the repo root and an unrelated external project directory
- Ran tmux source-startup smoke checks in both the repo root and an unrelated external project directory, confirming the docked composer, sidebar rendering, and stable Bun launcher behavior across directories

### Quality bar for follow-up review

- Keep implementations direct and reviewable. No placeholder abstractions, no speculative indirection, no parallel UI systems for the same job.
- Prefer fewer codepaths with stronger invariants over feature-complete but fragile plumbing.
- Preserve runtime consistency first, then polish. A feature that behaves differently by launch directory is incomplete.
- Every UX change should be justified by lower noise, better stability, or faster interaction, not novelty.
- Before considering this plan done, manual validation should confirm the result feels slop-free: compact, predictable, responsive, and easy to reason about in code.

### Remaining non-code items

- Commit steps were intentionally left undone because repo instructions say never commit unless the user asks.
- Cross-platform compiled-binary behavior should still be part of manual release validation, even though the Bun build/config paths were updated and reviewed in code here.
