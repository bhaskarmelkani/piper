# V000: pico — BetterCode Shell on Pi

## Execution Summary

**Current milestone**: V002 complete
**Overall progress**: Phase A [x], Phase B [x], Phase C [x], Phase D [x], Phase E [x], Phase F [x]
**Open risks**: Bun runtime migration remains deferred until after V0 stabilization
**Last validation**: 2026-04-18 — `npm run check`, `test/interactive-shell-layout.test.ts`, `test/interactive-mode-status.test.ts`, `test/footer-width.test.ts`

---

## Product Direction

### What this is

`pico` is a polished fork of pi. It applies BetterCode UX learnings to pi's terminal shell without rewriting pi's runtime engine.

`pico` is NOT:
- a migration of the BetterCode repo
- a recreation of OpenCode
- a new runtime architecture

`pico` carries forward:
- pi's sessions, extensions, themes, keybindings, print mode, RPC mode
- BetterCode's transcript-first layout
- BetterCode's composer docked to the bottom
- BetterCode's visible model and thinking state
- BetterCode's calmer visual hierarchy
- BetterCode's prompt/question/approval ergonomics
- BetterCode's contextual right sidebar
- BetterCode's streaming, scroll, and resize stability

BetterCode as a product/app name is deprecated for now. It lives on only as a source of UX taste.

### Branding

- User-facing command: `pico`
- `APP_NAME`: `pico` (set via `piConfig.name` in `packages/coding-agent/package.json`)
- Config dir: `.pi` (preserved for backward compat — NOT renamed in V000)
- Env var: `PI_CODING_AGENT_DIR` (preserved for backward compat — NOT renamed in V000)
- Package name: `@mariozechner/pi-coding-agent` (unchanged in V000)
- Shell header: shows "pico vX.Y.Z"
- Terminal title: `π - session - cwd` (Unicode π symbol, unchanged)
- Bin entry: `pico` resolves to `dist/cli.js`

### Clack architecture

Clack lives in `packages/tui`. This keeps coding-agent clean — it imports everything from one place.

`packages/tui/src/prompts/` provides:
- Re-exports of `@clack/prompts` (text, confirm, select, spinner, etc.)
- `withClackFlow(tui, flow)` for pre-session or out-of-shell terminal takeovers when needed

Coding-agent no longer uses `withClackFlow` for in-session pico flows after V001.
Pre-session flows can still use Clack directly (no TUI running yet).

Clack is for:
- pre-session flows
- out-of-shell terminal prompts

Clack is NOT for:
- the main transcript
- streaming assistant output
- the docked editor/composer
- in-session selectors, confirms, settings, or login/provider flows
- shell header/footer/sidebar
- extension overlays

---

## Implementation Boundary

Primary work: `packages/coding-agent/src/modes/interactive/`

`packages/tui` only changes for generic reusable primitives:
- `HorizontalSplit` component (Phase A)
- Clack prompts wrapper (Phase A architecture)

Pi compatibility preserved:
- sessions, providers, models, auth
- extensions, skills, prompt templates, themes
- `ctx.ui.custom()`, `ctx.ui.setWidget()`, `ctx.ui.setFooter()`, `ctx.ui.setEditorComponent()`
- overlay rendering
- interactive, print, and RPC modes
- keybindings, settings, session management

---

## Phase A — Shell Foundation

**Objective**: Create a stable shell composition boundary with explicit layout regions. No regressions.

**Status**: [x] complete

### TODO

- [x] Update `plans/v000/README.md` to execution-ready format with pico product direction
- [x] Implement `HorizontalSplit` component in `packages/tui/src/components/horizontal-split.ts`
- [x] Export `HorizontalSplit` from `packages/tui/src/index.ts`
- [x] Add `@clack/prompts` to `packages/tui` dependencies
- [x] Create `packages/tui/src/prompts/index.ts` (Clack wrapper + `withClackFlow`)
- [x] Export Clack wrapper from `packages/tui/src/index.ts`
- [x] Add `app.sidebar.toggle` keybinding to `packages/coding-agent/src/core/keybindings.ts`
- [x] Create `ShellSidebarComponent` in `packages/coding-agent/src/modes/interactive/components/shell-sidebar.ts`
- [x] Refactor `InteractiveMode` shell layout:
  - [x] Add `mainContainer: Container` to hold all main content children
  - [x] Add `shellLayout: HorizontalSplit` wrapping mainContainer + sidebar
  - [x] Add `sidebarComponent: ShellSidebarComponent`
  - [x] Add `sidebarVisible: boolean` state
  - [x] In `init()`: use `mainContainer` instead of `this.ui` for content children
  - [x] In `setExtensionFooter()`: use `mainContainer` instead of `this.ui`
  - [x] Add `toggleSidebar()` method
  - [x] Wire `app.sidebar.toggle` in `setupKeyHandlers()`
  - [x] Add sidebar toggle hint to startup instructions
- [x] Update `packages/coding-agent/package.json`:
  - [x] Add `"pico": "dist/cli.js"` to bin entries
  - [x] Change `piConfig.name` from `"pi"` to `"pico"`
- [x] Update `packages/coding-agent/src/config.ts`:
  - [x] Hardcode `ENV_AGENT_DIR` as `"PI_CODING_AGENT_DIR"` for backward compat
- [x] Run `npm run check` and fix all errors/warnings

### Files likely touched

- `plans/v000/README.md`
- `packages/tui/src/components/horizontal-split.ts` (new)
- `packages/tui/src/prompts/index.ts` (new)
- `packages/tui/src/index.ts`
- `packages/tui/package.json`
- `packages/coding-agent/src/core/keybindings.ts`
- `packages/coding-agent/src/modes/interactive/components/shell-sidebar.ts` (new)
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/package.json`
- `packages/coding-agent/src/config.ts`

### Sidebar behavior (Phase A)

- Width: 30 columns
- Auto-visible: terminals >= 100 columns wide
- Auto-hidden: terminals < 100 columns wide
- User-toggleable: via `app.sidebar.toggle` keybinding
- Content: model/provider, thinking level, context usage, session name
- Read-only: no interactive elements

### Validation steps

1. Run `npm run check` — no errors or warnings
2. Manual: start pico, verify header shows "pico vX.Y.Z"
3. Manual: verify sidebar visible on wide terminal (>= 100 cols), hidden on narrow
4. Manual: toggle sidebar via keybinding — verify force redraw
5. Manual: submit a prompt, verify transcript scrolls normally
6. Manual: streaming response — verify editor stays at bottom, sidebar updates
7. Manual: `/model` and `/settings` — verify overlays still work
8. Manual: verify `pico` command works (same as `pi`)

### Risks and regressions to watch

- Footer replacement (`setExtensionFooter`) uses `mainContainer` instead of `ui` — must be correct
- `HorizontalSplit.render()` must preserve CURSOR_MARKER in left panel lines
- Sidebar width reduces transcript width — verify wrapping is clean
- Force redraw on sidebar toggle — avoid flicker artifacts
- Session selector and overlays must still render on top of the shell layout

### Milestone notes

- [2026-04-18] Phase A complete — all items done, biome + tsgo clean
- Architecture decision: Clack added to `packages/tui` as dependency, not to `packages/coding-agent` directly
- Architecture decision: `withClackFlow(tui, flow)` added to packages/tui for within-session Clack integration
- Architecture decision: ENV_AGENT_DIR kept as "PI_CODING_AGENT_DIR" for backward compat even though APP_NAME becomes "pico"
- Architecture decision: Both "pi" and "pico" bin entries added; staged rebrand not a reckless full rename
- Note: web-ui tsc errors are pre-existing (need pre-built local packages) — not introduced by Phase A

---

## Phase B — BetterCode Polish

**Objective**: Apply BetterCode visual language and migrate transient interactions to Clack.

**Status**: [x] complete

### TODO

- [x] Simplify transcript visual hierarchy (3 weights: user > assistant > tools/meta)
- [x] Collapse tool details by default unless error or expanded
- [x] Surface model/thinking/context state in sidebar (done in Phase A)
- [x] Tune transcript width, spacing, and sidebar proportions
- [x] Migrate login/provider selection to Clack (`withClackFlow`)
- [x] Document model/theme/settings selector decisions (see milestone notes)

### What was done

**Tool visual hierarchy**: `ToolExecutionComponent.formatToolExecution()` now respects `expanded`
— when collapsed (the default), extension/unknown tools show only the tool name. Built-in tools
with custom renderers already use `expanded` from `ToolRenderContext`. `toolOutputExpanded`
defaults to `false`, so tools are compact until the user toggles with ctrl+o.

**OAuth login/logout → Clack**: `showOAuthSelector` now uses `withClackFlow` + `clack.select`
instead of the TUI overlay `OAuthSelectorComponent`. The flow stops the TUI, shows a clean
Clack select prompt, then restarts TUI and continues. The `OAuthSelectorComponent` file is
kept but no longer imported by interactive-mode.ts.

**Sidebar proportions**: 30 cols sidebar, visible on terminals ≥100 cols. On a 120-col terminal
the transcript gets 90 cols — clean and readable without cramping.

### Milestone notes

- [2026-04-18] Phase B complete
- Model selector stays as TUI: it has multi-select, fuzzy filtering, session-scope state, and
  Alt+Up/Down reordering — Clack `multiselect` doesn't support these. The TUI selector is the
  right tool for this flow. Explicitly documented per plan acceptance criteria.
- Theme selector stays as TUI: integrated into SettingsSelectorComponent with live preview on
  navigation — Clack doesn't support live preview callbacks during selection.
- Settings selector stays as TUI: 28+ settings with live effect on each toggle — Clack's
  multiselect and confirm flows can't replicate the immediate-feedback UX.
- Login/logout (OAuth) is the ideal Clack candidate: simple single-select, no live feedback
  needed, 3-5 options maximum. Successfully migrated.

---

## Phase C — Compatibility Hardening

**Objective**: Confirm new shell doesn't break existing pi workflows.

**Status**: [x] complete

### TODO

- [x] Verify extension overlays render correctly in new shell layout
- [x] Verify `ctx.ui.setEditorComponent()` still swaps editor inside the dock
- [x] Verify widgets still render in sensible positions relative to the dock
- [x] Verify queued messages, abort, and restore flows still work
- [x] Verify Clack-backed flows coexist cleanly with pi-native overlays
- [x] Additive shell-state APIs: no concrete gap found, none added

### Verification findings

All extension APIs operate on inner containers inside `mainContainer`, which is unchanged from
Phase A. Code review confirms:

- **Overlays**: `ctx.ui.custom()` pushes to `TUI`'s overlay stack (independent of mainContainer)
- **setEditorComponent**: uses `editorContainer.clear()` + `addChild` — editorContainer is inside
  mainContainer, unchanged
- **Widgets**: `widgetContainerAbove/Below` are inside mainContainer at the correct stack positions
  (above and below editorContainer)
- **setExtensionFooter**: already updated in Phase A to use `mainContainer.removeChild/addChild`
- **setExtensionHeader**: uses `headerContainer` directly, unchanged
- **Clack + overlays**: `withClackFlow` calls `tui.stop()`/`tui.start()` — no interaction with
  overlay stack; overlays are cleared on stop and not re-pushed on start, so the TUI starts clean
- **Queued messages / abort / restore**: operate on `pendingMessagesContainer` inside mainContainer,
  unaffected by sidebar layout

No code changes needed. All compatibility properties hold from Phase A implementation.

---

## Phase D — Bun Evaluation

**Objective**: Measure whether Bun gives meaningful improvement for pico.

**Status**: [x] complete

### TODO

- [x] Validate existing Bun entry path (`packages/coding-agent/src/bun/cli.ts`)
- [x] Fix process.title in Bun entry to reflect pico branding
- [x] Document recommended Bun run command for local experimentation
- [x] Identify Bun-specific issues around extension loading
- [x] Capture V001 recommendation

### Bun entry point

File: `packages/coding-agent/src/bun/cli.ts`

Minimal entry: sets `process.title = "pico"`, suppresses warnings, imports Bedrock provider
registration, then delegates to `../cli.js` (the same CLI module as the Node path).

To run pico with Bun (no build step):
```sh
bun run packages/coding-agent/src/bun/cli.ts
```

To build a self-contained binary:
```sh
npm run build:binary -w packages/coding-agent
# Output: packages/coding-agent/dist/pico
```

### Extension loading

Bun uses the same jiti-based dynamic extension loader that Node uses. Extensions load via
`@mariozechner/jiti` which handles ESM/CJS interop. No Bun-specific issues observed in the
entry path — the only Bun-specific file is `cli.ts` itself; all runtime code is shared.

### V001 recommendation

Keep Bun binary as the release artifact (already used in `build:binary`), but defer any
default-runtime or install-flow migration until after V0 is stable. Continue using the
existing npm/Node local dev flow for validation and iterative UI work.

### Milestone notes

- [2026-04-18] Phase D complete
- No monorepo-wide Bun migration attempted (as per implementation boundary)

---

## Phase E — V001 Fixed Shell Layout

**Objective**: Make pico fit the terminal as a stable three-region shell: transcript pane, persistent sidebar, bottom dock.

**Status**: [x] complete

### TODO

- [x] Add reusable height-aware `Viewport` primitive to `packages/tui`
- [x] Add reusable `BottomDockLayout` primitive to `packages/tui`
- [x] Refactor interactive mode root layout to fixed top/bottom shell regions
- [x] Make the transcript the only scrolling pane with dedicated app keybindings
- [x] Keep the composer dock mounted to the terminal bottom with auto-grow and capped height
- [x] Move in-session selectors, confirms, login/provider flows, and custom non-overlay UI into the dock interaction slot
- [x] Keep the right sidebar persistent on wide terminals, auto-hidden on narrow terminals, and toggleable
- [x] Move compact resource summaries into the sidebar
- [x] Reduce footer duplication so sidebar owns rich model/context metadata
- [x] Keep rich interactive diffs self-contained with the built-in renderer
- [x] Add focused tests for viewport, dock, sidebar, selector routing, resource summaries, and built-in diff rendering
- [x] Run validation (`npm run check` plus targeted coding-agent tests)

### What changed

- New shell shape:
  - top-left transcript viewport
  - top-right persistent sidebar
  - full-width bottom dock for composer, prompts, selectors, and session actions
- Transcript now scrolls independently from the dock/sidebar and stays stable during streaming.
- The compact action hint row now lives next to the composer instead of in the startup header.
- Startup resource summaries (`Context`, `Skills`, `Prompts`, `Extensions`, `Themes`) now feed the sidebar instead of the transcript.
- In-session login/provider selection no longer pauses the TUI with Clack.
- Rich interactive edit diffs use the built-in renderer again; no external diff binary is required.

### Milestone notes

- [2026-04-18] Phase E complete
- `packages/tui` gained `Viewport` and `BottomDockLayout` instead of changing the base `Component.render(width)` contract
- Existing extension APIs (`setEditorComponent`, `setFooter`, overlays, widgets) were preserved by remapping them into dock/transient slots
- Transcript scroll defaults were added as configurable app keybindings, not hardcoded key checks
- Bun migration is deferred; local testing continues through the existing npm/Node launcher flow

---

## Phase F — V002 Input, Sidebar Semantics, and Sidebar Plugins

**Objective**: Recover transcript mouse/trackpad behavior, make sidebar state more semantic, and prove the sidebar can host multiple extension-owned sections without collisions.

**Status**: [x] complete

### TODO

- [x] F1: Make transcript wheel/trackpad scrolling use an explicit alternate-screen mouse policy
- [x] F1: Keep terminal-native text selection available through the terminal override path while mouse reporting is active
- [x] F1: Add regression coverage for shell-row continuity and transcript scroll routing
- [x] F2: Add semantic sidebar rendering for thinking and context state
- [x] F2: Standardize context warning thresholds between sidebar and footer
- [x] F2/F3: Replace single-owner sidebar overrides with keyed sidebar contribution composition
- [x] F2/F3: Migrate the vanity example to keyed sidebar sections
- [x] F3: Add Copilot budget sidebar example extension using the keyed sidebar API
- [x] Update extension examples index and execution tracker notes
- [x] Run validation (`npm run check` plus targeted coding-agent tests)

### What changed

- Terminal startup now enables explicit SGR mouse reporting for the alternate screen and disables implicit alternate-scroll fallback, so wheel/trackpad scrolling is routed into the transcript instead of the docked composer.
- The sidebar now renders semantic state:
  - thinking level uses level-specific theme colors
  - context uses a compact progress bar plus textual usage summary
  - footer context color uses the same threshold mapping as the sidebar
- Sidebar sections are now composed by keyed contributors with deterministic ordering instead of a single extension replacing the whole sidebar payload.
- Built-in resource summaries, vanity insights, and Copilot budget can coexist in the sidebar without stomping one another.
- Added `copilot-budget.ts` as a piper example extension for GitHub Copilot premium request usage.

### Milestone notes

- [2026-04-18] Phase F complete
- Native selection is still terminal-owned; the app does not implement a separate copy mode for this milestone
- The legacy unkeyed `ctx.ui.setSidebarSections(sections)` path is still accepted as a compatibility adapter and is internally mapped onto a legacy keyed contributor

---

## Acceptance Criteria (V000 Complete)

- [x] Fork boots into pico shell by default (`piConfig.name = "pico"`, `pico` bin)
- [x] Composer permanently docked at bottom (unchanged from pi; editorContainer last in mainContainer)
- [x] Sidebar exists, is read-only, responsive to terminal width (ShellSidebarComponent, ≥100 cols)
- [x] Transcript remains the primary reading surface (chatContainer gets full width - 30 sidebar cols)
- [x] Tool output visually secondary, collapsed by default (`toolOutputExpanded = false`; compact fallback)
- [x] Model, thinking, and context state visible in shell chrome (ShellSidebarComponent)
- [x] Model selector stays as TUI — explicitly documented in Phase B milestone notes
- [x] Extension overlays, widgets, and editor replacement still work (verified Phase C)
- [x] Existing pi session and extension behavior compatible (no breaking changes)
- [x] Bun runtime evaluation documented (Phase D)
