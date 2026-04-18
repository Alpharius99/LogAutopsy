# LogAutopsy — Research Summary

**Generated:** 2026-04-18
**Status:** Ready for roadmap creation

---

## Executive Summary

LogAutopsy is a VS Code extension that turns raw test-failure log artifacts into a ranked root cause diagnosis and a ready-to-submit GitLab issue — eliminating the hours an analyst currently spends correlating errors manually. There are no competitors in this space: all existing VS Code log tools do visual highlighting only, with zero semantic understanding of log4net format, Gherkin step correlation, or error cascade analysis.

The recommended approach is a strict two-phase pipeline: Phase 1 (deterministic parsing and anomaly ranking) is fully AI-independent and must ship with guaranteed correctness before Phase 2 (AI hypothesis via Continue) is layered on top. Phase 1 alone delivers enough value to establish analyst trust; Phase 2 is additive. Continue's programmatic API is the single highest-risk unknown in the project — the integration must be built last, behind an `AiBackend` interface with a `NullAiBackend` fallback, so it never blocks Phase 1 or GitLab functionality.

The key technical risks are: extension host blocking during log parsing, Continue API being unavailable or differently shaped than expected, and webview CSP misconfiguration silently breaking the results UI. All three have well-understood mitigations that must be in place from the start of the relevant stage, not retrofitted later.

---

## Recommended Stack

| Category             | Choice                                             | Notes                                         |
|----------------------|----------------------------------------------------|-----------------------------------------------|
| Language             | TypeScript ~5.4                                    | —                                             |
| VS Code engine floor | `^1.90.0`                                          | Ensures `fetch` and `SecretStorage` available |
| Bundler              | `esbuild ^0.21`                                    | Default in `yo code`; not webpack             |
| Test runner          | `@vscode/test-cli` + Mocha                         | `@vscode/test-electron` is deprecated         |
| Gherkin parser       | `@cucumber/gherkin ^28` + `@cucumber/messages ^24` | Typed AST; do not use regex                   |
| Hashing              | `crypto` (Node built-in)                           | No npm hash libraries                         |
| HTTP (GitLab)        | `fetch` (Node built-in)                            | No axios / node-fetch                         |
| Continue integration | `vscode.extensions.getExtension()` exports         | Not direct HTTP — verify API at runtime       |
| File I/O             | `vscode.workspace.fs`                              | Not Node.js `fs` — required for remote/WSL    |
| Packaging            | `@vscode/vsce ^3`                                  | Not old `vsce` package                        |

---

## Build Order (7 Stages)

| Stage | What                                                                                                                                   | Rationale                                                                                     |
|-------|----------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| 1     | Scaffold: `package.json`, `activate()` stub, empty `TreeDataProvider`, `OutputChannel`, esbuild pipeline, CSP-correct webview skeleton | Validates dev loop; CSP and `activationEvents` must be correct from the start                 |
| 2     | Phase 1 pipeline: `LogParser → FeatureParser → StepExtractor → AnomalyDetector → Aggregator`                                           | Pure TypeScript, unit-testable without VS Code host; validate all regexes against `examples/` |
| 3     | TreeView UI: wire "Run Analysis" command, anomaly hierarchy with "Primary" / "Secondary" labels                                        | Requires Phase 1 data; first analyst-visible result                                           |
| 4     | `ResultsWebviewPanel`: HTML scaffold, `ready` handshake, anomaly detail render                                                         | Requires TreeView wiring; implement single-panel reuse and debounce here                      |
| 5     | Symbol resolution + code navigation: `SymbolResolver`, `CodeExtractor`, `NullAiBackend`                                                | Delivers click-to-source value with no AI dependency                                          |
| 6     | Continue integration: inspect `ext.exports` at runtime, implement `ContinueExtensionAdapter`                                           | Highest risk — built last, behind `AiBackend` interface                                       |
| 7     | GitLab integration: `GitLabClient`, confirmation dialog, PAT via `SecretStorage`                                                       | Depends on full RCA output; `Private-Token` header, not `Authorization: Bearer`               |

---

## Table Stakes (correctness requirements)

Missing any of these means analysts will not trust the tool:

- **Complete ERROR coverage** — zero missed errors; distinct "parse failed" vs "no errors found" states
- **Step association** — every anomaly must show which Gherkin step it occurred in; line numbers alone are not acceptable
- **Phase classification** — Precondition / TestCase / PostCondition; a Precondition error is a setup failure, not a product bug
- **Aggregation with occurrence count** — same error repeated in a loop must be grouped, not listed individually
- **Ranked output with "Primary" label** — earliest anomaly labeled as primary root cause; flat unranked lists defeat the tool's purpose
- **Graceful degradation** — Phase 1 and GitLab must work when Continue is offline; tool must not go dark
- **Per-issue confirmation** — never auto-submit; never batch-create; one analyst confirmation per issue
- **Confidence score co-located with hypothesis** — AI output without a visible confidence indicator creates false certainty

---

## Top Pitfalls

| Risk                                                                                                               | Prevention (one line)                                                                                                         |
|--------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| **Extension host blocking** (C2) — synchronous parse of 10k-line files freezes all of VS Code                      | `vscode.workspace.fs.readFile` async + process in 500-line chunks with `setImmediate` yields, from Stage 2                    |
| **Continue `exports` undefined before activate** (C1) — Phase 2 silently fails even when Continue is running       | Always `await ext.activate()` before accessing `ext.exports`; duck-type the API; `NullAiBackend` fallback                     |
| **Webview CSP violations** (C4) — results UI renders blank with no visible error, especially after VSIX install    | Fresh nonce per render, `webview.cspSource` for styles, `webview.asWebviewUri()` for all assets, correct `localResourceRoots` |
| **PAT in plaintext settings** (C5) — token lands in `settings.json`, synced to cloud, readable by other extensions | `context.secrets` (OS keychain) exclusively; expose `LogAutopsy: Set GitLab Token` command                                    |
| **GitLab wrong auth header** (C6) — `Authorization: Bearer` returns 401 silently confused with bad PAT             | Use `Private-Token: <pat>` header; handle 429 explicitly; document `http.systemCertificates` for private GitLab               |

---

## Key Unknowns (require empirical verification)

1. **Continue API surface** — The most important unknown. What does `vscode.extensions.getExtension('Continue.continue')?.exports` actually expose in the team's installation? Does it accept structured JSON? Does it expose a command on the command bus? **Action:** inspect `ext.exports` in the Extension Development Host against the live Continue installation before Stage 6 begins.

2. **Continue extension ID** — Is it `Continue.continue` or `continue-dev.continue`? Make it configurable via `logautopsy.continue.extensionId` setting.

3. **Message normalization threshold** — Dynamic values (timestamps, IDs, memory addresses) in error messages will create false-unique aggregation keys. How aggressively to normalize is unclear without running Phase 1 against real batch data. **Action:** run against `examples/` early; treat as the top correctness risk for Stage 2.

4. **C# language server indexing latency** — `executeWorkspaceSymbolProvider` returns empty on first call while OmniSharp / Roslyn is indexing. **Action:** retry with 2s backoff (3 attempts) per the PITFALLS pattern; measure actual latency in the team's workspace.

---

## Example Artifacts

Real production test artifacts are available in `examples/BatchRun_250703_135229/WhenEnableBlockOfResponseDidForEcu_250703_135229/`. These are not synthetic sample data — they are actual failed test runs from the target environment.

**Use them throughout development:**
- Stage 2: validate all log-parsing regexes and step-boundary detection against the real format
- Stage 2: identify message normalization edge cases before committing to an aggregation strategy
- Stages 3–4: use as fixture data for TreeView and Webview rendering tests
- Stage 5: validate symbol resolution against class and method names that appear in the real log

Do not defer artifact validation to a later stage. Regex assumptions that look correct against synthetic data often break on the real format.

---

## Confidence Assessment

| Area                  | Level  | Notes                                                                         |
|-----------------------|--------|-------------------------------------------------------------------------------|
| Stack                 | HIGH   | Official Microsoft tooling throughout; VS Code APIs stable since 1.74+        |
| Features / scope      | HIGH   | Spec + example artifacts give concrete domain grounding                       |
| Architecture          | HIGH   | Extension host patterns, webview boundary, TreeView — all well-documented     |
| Pitfalls              | HIGH   | VS Code extension API surface is stable; all pitfalls are known failure modes |
| Continue integration  | MEDIUM | Public API not formally versioned; must be verified at runtime                |
| Message normalization | MEDIUM | Needs empirical data from `examples/` to tune correctly                       |

Overall confidence: **HIGH for the deterministic pipeline; MEDIUM for Continue integration**.

---

## Research Flags for Roadmap

- **Stages 1–5** — No additional research needed; patterns are well-documented; validate against `examples/` directly.
- **Stage 6 (Continue)** — Needs an empirical discovery spike before implementation: inspect `ext.exports` in Extension Development Host, document what commands are available, confirm request/response shape.
- **Stage 7** — No additional research needed; GitLab REST v4 is well-documented; `SecretStorage` pattern is established.

---

## Source Files

- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `.planning/PROJECT.md`
- `docs/test_analysis_agent_spec_v2.md` (referenced but not read — contains full data contracts and parsing regexes)
