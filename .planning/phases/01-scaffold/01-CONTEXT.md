# Phase 1: Scaffold - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a working VS Code extension dev loop: the extension activates in Extension Development Host, `npm run watch` compiles and rebuilds on save, the empty webview opens without CSP violations, and `npm test` exits cleanly. No analysis features — infrastructure only.

</domain>

<decisions>
## Implementation Decisions

### Source Directory Layout
- **D-01:** Layer-organized structure — three top-level folders under `src/`:
  - `src/extension/` — VS Code glue: `activate.ts`, `commands.ts`
  - `src/core/` — pure TypeScript business logic: `parser.ts`, `detector.ts`, `aggregator.ts`
  - `src/ui/` — VS Code API surface: `sidebar.ts`, `webview.ts`
  - `src/types.ts` — shared interfaces at root of `src/`
- **D-02:** `src/core/` must remain free of VS Code API imports — keeps Phase 2 parsing logic unit-testable without an extension host

### Webview HTML Delivery
- **D-03:** TS-generated HTML string throughout all phases — the extension host builds HTML as a TypeScript template string with CSP nonce injected inline. No separate HTML file or webview JS bundle.
- **D-04:** This approach is locked in for all phases — no plan to switch to a bundled HTML file even as Phase 3 webview content grows.

### Extension Activation
- **D-05:** Activation event: `onCommand` — extension activates only when the analyst runs a command. Zero startup overhead otherwise.
- **D-06:** VS Code 1.74+ activation inference is acceptable — `activationEvents` can be omitted from `package.json` and inferred from `contributes.commands`.
- **D-07:** Sidebar `viewsContainer` and `views` contribution points are registered in `package.json` in Phase 1 — the sidebar slot exists from the start even though it has no content until Phase 3. VS Code registers views eagerly; activation remains on-demand.

### esbuild Configuration
- **D-08:** Single esbuild entry point in Phase 1: `src/extension/activate.ts` → `dist/extension.js`. No webview bundle — webview is inline HTML.
- **D-09:** Second esbuild entry point (webview JS) deferred to Phase 3, added only if Phase 3 webview complexity requires it.
- **D-10:** Source maps enabled in dev/watch mode (`--sourcemap`). Production build (vsce package) strips source maps.

### Claude's Discretion
- Test file organization (co-located vs `src/test/` vs `test/`) — Claude chooses what fits `@vscode/test-cli` + Mocha conventions
- Exact command IDs and view container IDs — use `logautopsy.*` namespace consistently
- `tsconfig.json` strictness settings — enable `strict: true`; tune as needed for VS Code extension patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Extension Specification
- `docs/test_analysis_agent_spec_v2.md` — Full data contracts, parsing regexes, phase rules, and Continue API payload. Primary implementation reference.

### Tech Stack Decisions
- `CLAUDE.md` — Locked technology choices: TypeScript ~5.4, esbuild ^0.21, `@vscode/test-cli` + Mocha, `@types/vscode ^1.90.0`, `@vscode/vsce ^3`. Do NOT use webpack or Jest.

### Example Artifacts
- `examples/` — Real BatchRun folder structure with combined logs and feature files. Used for validation in Phase 2+; not needed in Phase 1 but downstream agents should know where they live.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — empty repository. All code will be created from scratch in this phase.

### Established Patterns
- None yet — this phase establishes the patterns that downstream phases follow.

### Integration Points
- `src/extension/activate.ts` is the VS Code extension entry point; all commands and providers registered here.
- `src/core/` modules will be imported by `src/extension/` and tested independently — the clean boundary is enforced by keeping VS Code APIs out of `src/core/`.

</code_context>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — standard VS Code extension scaffold

</specifics>

<deferred>
## Deferred Ideas

### Phase 5 Consideration
- **Agent Forge as AI backend** — User asked what could be shifted to the Agent Forge extension instead of Continue. The `docs/agent-forge.yaml` defines a `RootCauseAnalyzerAgent` workflow. Whether Agent Forge replaces or augments Continue is an architecture decision for Phase 5 context discussion, not Phase 1. Note: `agent-forge.yaml` already defines the multi-step workflow (extract_context → identify_failure_point → analyze_code → correlate_logs → validate_hypothesis → final_output) — this artifact should be reviewed during Phase 5 discuss.

</deferred>

---

*Phase: 01-scaffold*
*Context gathered: 2026-04-19*
