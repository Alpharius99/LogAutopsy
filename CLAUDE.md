# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LogAutopsy** is a VS Code extension that analyzes automated test artifacts (log4net log files + Gherkin `.feature` files) to identify root causes of test failures. The full implementation spec is in `docs/test_analysis_agent_spec_v2.md`.

The extension is **not yet implemented** — this repo currently holds the spec and example artifacts.

## Architecture

Two-phase pipeline, stateless per run (no caching between sessions):

```
Phase 1 (Deterministic, no AI):
  Combined log + .feature file → Parse → Extract Steps → Detect Anomalies → Aggregate → AggregatedAnomaly[]

Phase 2 (AI-assisted via Continue extension):
  AggregatedAnomaly[] → Select Primary → Symbol Resolution → Code Snippet → Continue AI → RootCauseAnalysis
```

### VS Code Extension Components

| Component | Technology | Role |
|---|---|---|
| **Sidebar** | VS Code TreeView | Load artifacts, trigger analysis, review results, create GitLab issues |
| **Local Engine** | TypeScript (extension host) | Log parsing, anomaly detection, step extraction, aggregation |
| **Continue** | Continue extension API | Root cause hypothesis generation (Phase 2 only) |
| **GitLab Integration** | REST API + PAT | Manual issue creation (one per user confirmation) |

## Artifact Structure

```
BatchRun_YYMMDD_HHMMSS/
  <TestName>_YYMMDD_HHMMSS/
    <TestName>.feature                    ← Gherkin feature (PARSED)
    <TestName>_YYMMDD_HHMMSS.log         ← Combined log (PRIMARY INPUT)
    250703_135240_Precondition/           ← Per-phase subfolder (IGNORED)
    <TestName>_YYMMDD_HHMMSS.html        ← HTML report (IGNORED)
    appsettings.json                      ← Config (IGNORED)
```

- The combined log at the test case root is the only log parsed.
- Per-phase subfolder logs are explicitly excluded.
- Example artifacts are in `examples/`.

## Log Format (log4net)

**Standard line:**
```
YYYY-MM-DD HH:MM:SS,mmm [THREAD] LEVEL  ClassName\MethodName:SourceLine - Message
```

**Exception line:**
```
YYYY-MM-DD HH:MM:SS,mmm [THREAD] LEVEL ClassName.SubClass|ExceptionType in MethodName:SourceLine - Message
```

Lines not starting with a timestamp are continuation lines (stack traces, multi-line dumps) appended to the preceding `LogEvent`.

Header/footer markers (`[Begin of ...` / `[End of ...`) are skipped.

### Log Parsing Regexes

```typescript
const LOG_LINE_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\d+)\] (\w+)\s+(.+)$/;
const STANDARD_SOURCE  = /^(\S+?)\\(\w+):(\d+) - (.*)$/;
const EXCEPTION_SOURCE = /^(\S+?)\|(\w+) in (\w+):(\d+) - (.*)$/;  // try this first
```

## Phase 1 — Key Rules

- **Anomaly:** any `LogEvent` with `level == 'ERROR'` (WARN is not an anomaly).
- **Step boundaries:** delimited by `GherkinExecutor\ExecuteStep:187` "Next test step" markers in the log.
- **Phase assignment** (Precondition / TestCase / PostCondition): derived from scenario names in the `.feature` file. Steps in a scenario named `"Precondition"` or `"PostCondition"` get those phases; all others → `'TestCase'`. When a step name appears in multiple scenarios, resolve by order of appearance in the log.
- **Aggregation key:** `type + normalizedMessage + topStackFrame + step` (SHA-256 hashed). `normalizedMessage` is currently the raw message (no stripping yet — revisit if dynamic content causes grouping issues).
- Anomalies outside any step range → `step = '_init_'`, `phase = 'Precondition'`.

## Phase 2 — Key Rules

- Always select the **earliest** `AggregatedAnomaly` as the primary; later ones are `secondaryEffects`.
- Symbol resolution uses `vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)` — class name match first, then method name match. Confidence: exact+exact=1.0, partial+exact=0.7, method-only=0.3.
- Logs have **no namespace** — match on simple class name only.
- Only the resolved **method body** is sent to Continue (never the full file).
- If Continue is unavailable, still return a `RootCauseAnalysis` with `confidence=0.0` and whatever symbol resolution found — gives focused scope without AI.

## Core TypeScript Interfaces

Defined in spec §5: `LogEvent`, `GherkinStep`, `StepContext`, `Anomaly`, `AggregatedAnomaly`, `CodeCandidate`, `RootCauseAnalysis`, `IssueCandidate`.

## GitLab Integration

- Auth: Personal Access Token in VS Code settings.
- Endpoint: `POST /api/v4/projects/:id/issues`
- Labels: `["test-failure", "automated-analysis"]`
- One issue per explicit user confirmation — no batch or automatic creation.

## Safety Constraints

- Only the resolved method body goes to the AI — never the full file or project.
- Extension is **read-only** — never modifies source code, logs, or artifacts.
- All AI suggestions are advisory; confidence scores always shown.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**LogAutopsy**

A VS Code extension for Test Analysts that automates the painful mechanical work of analyzing failed automated test runs. It ingests test artifacts (log4net combined logs + Gherkin feature files), identifies which ERROR is the root cause vs a downstream side effect, uses AI (via the Continue extension) to generate a root cause hypothesis and fix suggestion, and assembles a fully populated GitLab issue description — ready to submit with minimal analyst effort.

**Core Value:** Given a failed test run, produce a ranked root cause diagnosis with a fix suggestion and a ready-to-submit GitLab issue description, so the analyst spends minutes instead of hours on the investigation and write-up.

### Constraints

- **Tech stack**: TypeScript VS Code extension (runs in extension host) — no server process
- **AI backend**: Continue extension API — must not replace or bypass Continue
- **Code access**: Read-only workspace access for symbol resolution; extension never writes to source
- **Scale**: Combined logs up to 10,000 lines; batch may contain multiple test cases, each analyzed independently
- **Stateless**: No database or cross-session cache — every analysis run is independent
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
| Category | Choice | Version | Do NOT use |
|----------|--------|---------|------------|
| Language | TypeScript | ~5.4 | — |
| VS Code engine floor | `@types/vscode` | `^1.90.0` | — |
| Bundler | `esbuild` | `^0.21` | webpack |
| Test runner | `@vscode/test-cli` + Mocha | `^0.0.9` / `^10` | `@vscode/test-electron`, Jest |
| Gherkin parser | `@cucumber/gherkin` + `@cucumber/messages` | `^28` / `^24` | regex, `gherkin-parse` |
| SHA-256 | `crypto` (Node.js built-in) | — | `js-sha256`, any npm hash lib |
| HTTP (GitLab) | `fetch` (Node.js built-in) | — | `axios`, `node-fetch` |
| Continue integration | `vscode.extensions.getExtension()` + exports | — | Direct HTTP to Continue server |
| Packaging | `@vscode/vsce` | `^3` | old `vsce` package |
## Key Decisions
### Bundler: esbuild, not webpack
### Testing: `@vscode/test-cli` + Mocha
### Gherkin: `@cucumber/gherkin` v28 + `@cucumber/messages` v24
### SHA-256: Node.js built-in `crypto`
### GitLab REST: built-in `fetch`
## VS Code API Surface Required
| API | Purpose |
|-----|---------|
| `vscode.window.createTreeView` + `TreeDataProvider<T>` | Sidebar anomaly list |
| `vscode.window.createWebviewPanel` with `retainContextWhenHidden: true` | Results detail view |
| `vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)` | C# symbol lookup — returns `SymbolInformation[]` |
| `vscode.workspace.openTextDocument` + `TextDocument.getText(range)` | Method body extraction for Continue payload |
| `vscode.workspace.fs` (NOT Node.js `fs`) | File discovery and log reading — required for remote/WSL workspaces |
| `vscode.window.showOpenDialog` | Artifact folder picker |
| `vscode.window.withProgress` | Progress notification during analysis |
| `vscode.workspace.getConfiguration` | Extension settings (GitLab URL, PAT, Continue extension ID) |
## Continue Integration Pattern
## package.json Key Fields
## Open Questions
- What VS Code commands or exported API does the team's specific Continue installation expose? Run `ext.exports` inspection at runtime before building the integration adapter.
- What is the exact Continue extension ID — `Continue.continue` or `continue-dev.continue`? Make it configurable.
- Does the team need WSL/remote workspace support? If yes, `vscode.workspace.fs` is mandatory.
## Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| VS Code API (TreeView, Webview, workspace.fs, symbol provider) | HIGH | Stable, documented APIs unchanged since VS Code 1.74+ |
| Toolchain (esbuild, `@vscode/test-cli`, `@vscode/vsce`) | HIGH | Official Microsoft tooling |
| Gherkin parsing (`@cucumber/gherkin`) | HIGH | Official Cucumber project; v28 is current stable |
| Node.js built-ins (crypto, fetch) | HIGH | Stable Node.js 18+/20 LTS APIs |
| Continue integration | MEDIUM | Public API not formally versioned; verify at runtime |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
