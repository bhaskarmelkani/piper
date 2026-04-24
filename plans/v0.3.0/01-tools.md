# v0.3.0 / Phase 1 — smart code navigation tools

Goal:
Add fast built-in code navigation tools that improve retrieval quality without adding tool sprawl:
- `search_code`
- `symbols_overview`

Non-goals:
- no MCP
- no hosted search
- no background indexing
- no persistent graph
- no `find_references_light` in this phase
- no subagent work in this file

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked`

---

## M0 — Plan scaffold
- [x] Create this file
- [x] Confirm scope matches `plans/v0.3.0/README.md`

## M1 — tool surface and defaults
- [x] Add `search_code` and `symbols_overview` to the built-in tool registry in `packages/coding-agent/src/core/tools/index.ts`
- [x] Expand the built-in `ToolName` union and `allTools` / tool definition maps
- [x] Add both tools to the default coding toolset so standard coding sessions expose:
  - `read`, `bash`, `edit`, `write`, `search_code`, `symbols_overview`
- [x] Update any SDK/default-tool comments and docstrings that still say the default is only `read,bash,edit,write`
- [x] Update CLI help text in `packages/coding-agent/src/cli/args.ts` to reflect the new default toolset

## M2 — `search_code` schema and routing
- [x] Create a new built-in tool module for `search_code`
- [x] Define a single typed schema with:
  - `query`
  - `method`
  - `path?`
  - `glob?`
  - `language?`
  - `limit?`
  - `context?`
  - `ignoreCase?`
- [x] Support these methods:
  - `keyword`
  - `regex`
  - `filename`
  - `ast`
- [x] Route `keyword` and `regex` through ripgrep-backed behavior
- [x] Route `filename` through fd-backed behavior
- [x] Route `ast` through ast-grep-backed behavior
- [x] Keep routing logic explicit and local; do not introduce a generic abstraction layer that hides the simple cases

## M3 — managed binary support for `ast-grep`
- [x] Extend `packages/coding-agent/src/utils/tools-manager.ts` to support `ast-grep`
- [x] Add PATH detection first, matching current `rg`/`fd` behavior
- [x] Add managed download/install support with platform-aware asset resolution
- [x] Preserve current offline behavior and quiet fallback semantics
- [x] Do not add startup indexing, daemons, or background watchers
- [x] Keep the binary management implementation parallel to `rg` and `fd`, not a rewrite of the tool manager

## M4 — `search_code` output contract
- [x] Always return compact, deterministic output
- [x] Include file paths and line numbers whenever the method can provide them
- [x] Group results by file
- [x] Default to small limits
- [x] Truncate aggressively with actionable refinement messages
- [x] Make AST mode fail clearly when language/pattern input is insufficient instead of returning noisy guesses
- [x] Ensure the result helps answer “what should I open next?”

## M5 — `symbols_overview` implementation
- [x] Create a new built-in tool module for `symbols_overview`
- [x] Define a typed schema with:
  - `path`
  - `scope: "file" | "folder"`
  - `maxItems?`
- [x] Implement file summaries first
- [x] Implement folder summaries second
- [x] For file scope, summarize top-level symbols with stable ordering and line anchors when available
- [x] For folder scope, summarize the most relevant files and each file’s primary symbols
- [x] Prefer TS/JS richness first, but keep graceful fallback for other languages
- [x] Do not attempt whole-project graph summaries in this phase

## M6 — prompt guidance and default behavior
- [x] Update system prompt construction in `packages/coding-agent/src/core/system-prompt.ts`
- [x] Add a clear search ladder:
  - use `search_code` for keyword / regex / filename / AST discovery
  - use `symbols_overview` before opening large files
  - use `read` only on top candidates
  - edit after evidence is gathered
- [x] Update tool snippets and prompt guidelines so the new tools are visible and preferred
- [x] Keep `grep`, `find`, and `ls` available, but stop presenting them as the preferred default path for coding sessions

## M7 — docs
- [x] Update `packages/coding-agent/README.md`
- [x] Document the new default coding tools
- [x] Document what `search_code` does and does not do
- [x] Document `symbols_overview`
- [x] Keep the docs honest about scope:
  - AST search is structural, not semantic natural-language retrieval
  - no background indexing
  - no graph engine

## M8 — tests
- [x] Add unit tests for `search_code`
- [x] Cover:
  - `keyword`
  - `regex`
  - `filename`
  - `ast`
  - truncation
  - missing `ast-grep`
  - offline behavior
- [x] Add unit tests for `symbols_overview`
- [x] Cover:
  - TS/JS file outline
  - folder summary
  - generic fallback
  - output ordering / stability
- [x] Add default-tool and system-prompt coverage so the new tools appear in standard coding sessions
- [x] If any new or modified test files are created, run those specific files from the package root

## M9 — validation
- [x] Run `bun run check` from repo root
- [x] Fix all errors, warnings, and infos
- [x] Manually sanity-check one TS-heavy area of the repo using:
  - `search_code` keyword
  - `search_code` regex
  - `search_code` filename
  - `search_code` ast
  - `symbols_overview` file
  - `symbols_overview` folder
- [x] Confirm the default prompt/tool surface stays compact and not noisy

Notes:
- Verified in this repo that the implementation matches the plan in `packages/coding-agent`.
- Repo validation now passes with `bun run check` from the repo root.
- Focused Phase 1 tests pass in `packages/coding-agent`:
  - `bun test test/tools.test.ts`
  - `bun test test/system-prompt.test.ts`

## Exit criteria
- [x] Tools are available in standard coding sessions by default
- [x] `search_code` is the preferred evidence-gathering entrypoint
- [x] `symbols_overview` reliably helps route reads
- [x] `bun run check` passes cleanly
- [x] Manual sanity-check passes
