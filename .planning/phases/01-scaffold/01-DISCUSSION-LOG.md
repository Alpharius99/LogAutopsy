# Phase 1: Scaffold - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 01-scaffold
**Areas discussed:** Source Layout, Webview HTML, Activation Event, esbuild Bundles

---

## Source Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Layer-organized | src/extension/, src/core/, src/ui/, src/types.ts | ✓ |
| Flat src/ | All files directly in src/ | |

**User's choice:** Layer-organized — `src/extension/` (activate.ts, commands.ts), `src/core/` (parser.ts, detector.ts, aggregator.ts), `src/ui/` (sidebar.ts, webview.ts), `src/types.ts`

---

## Webview HTML

| Option | Description | Selected |
|--------|-------------|----------|
| TS-generated HTML string | Extension host builds HTML as TypeScript template string with nonce | ✓ |
| Bundled HTML file | Static media/webview.html loaded from disk with separate JS bundle | |

**User's choice:** TS-generated HTML string throughout all phases — locked in, no plan to revisit at Phase 3.

---

## Activation Event

| Option | Description | Selected |
|--------|-------------|----------|
| onCommand | Activate on analyst command only | ✓ |
| workspaceContains: | Activate when BatchRun folder detected in workspace | |
| onStartupFinished | Always-on after VS Code starts | |

**Follow-up — Sidebar registration:**

| Option | Description | Selected |
|--------|-------------|----------|
| Register sidebar in package.json now | viewsContainer + views declared in Phase 1 | ✓ |
| Add sidebar in Phase 3 | Keep Phase 1 minimal | |

**User's choice:** `onCommand` activation. Sidebar `viewsContainer` + `views` registered in `package.json` in Phase 1.

---

## esbuild Bundles

| Option | Description | Selected |
|--------|-------------|----------|
| Single bundle — extension host only | One esbuild entry: activate.ts → dist/extension.js | ✓ |
| Two bundles from day one | Extension host + webview bundle | |

**Follow-up — Source maps:**

| Option | Description | Selected |
|--------|-------------|----------|
| Inline source maps in dev | --sourcemap in watch mode, stripped in prod | ✓ |
| No source maps | Simpler config | |

**User's choice:** Single bundle for Phase 1. Source maps in dev, stripped in production. Second entry point deferred to Phase 3 if needed.

---

## Claude's Discretion

- Test file organization
- Command IDs and view container IDs (namespace: `logautopsy.*`)
- tsconfig strictness

## Deferred Ideas

- **Agent Forge as AI backend alternative to Continue** — user raised question about what could be shifted to Agent Forge. `docs/agent-forge.yaml` defines a `RootCauseAnalyzerAgent` multi-step workflow. Architecture decision deferred to Phase 5 context discussion.
