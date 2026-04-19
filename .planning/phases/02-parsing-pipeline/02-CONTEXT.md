# Phase 2: Parsing Pipeline - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Full deterministic pipeline — given a real BatchRun folder, the tool discovers test case subfolders, parses combined logs, extracts step boundaries, detects ERROR anomalies, aggregates by signature, and ranks by first occurrence. No AI involvement. Must be validated against the real example artifacts in `examples/`.

In scope: LOAD-01, LOAD-02, PARSE-01, PARSE-02, PARSE-03, DETECT-01, DETECT-02, DETECT-03.
Not in scope: any UI (Phase 3), symbol resolution (Phase 4), Continue/AI (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Type Contract — Align to Spec §5 Exactly
- **D-01:** Rewrite `src/types.ts` to match spec §5 field names and shapes before any parsing implementation touches these types. This is the first task of Phase 2.
- **D-02:** `LogEvent` fields: `sourceClass` (was `className`), `sourceMethod` (was `methodName`), `raw: string` (was `continuationLines: string[]`), `fileLineNumber: number` (new), `thread: number` (was `string`).
- **D-03:** `GherkinStep` fields: `name`, `keyword`, `keywordType: 'Action'|'Conjunction'|'Outcome'`, `location: string`, `argument: string`. Remove `text`, `scenario`, `phase` — phase lives on `StepContext`, not on the step.
- **D-04:** `StepContext` fields: `step: GherkinStep`, `phase: 'Precondition'|'TestCase'|'PostCondition'`, `startLine: number`, `endLine: number`, `result?: string`, `failedByKeywordTranslator: boolean`. Remove the `'_init_'` union from `step` — use a sentinel phase value instead if needed.
- **D-05:** `Anomaly` becomes a flat DTO: `id`, `type: 'ERROR'`, `message`, `stacktrace?`, `step`, `phase`, `file`, `line`, `sourceClass`, `sourceMethod`, `sourceLine`, `exceptionType?`, `timestamp`. Remove the nested `logEvent/stepContext` structure.
- **D-06:** `AggregatedAnomaly`: use `key` (not `id`), `occurrences: number` (count only, not array), `firstOccurrence: { file, line, timestamp }`, `sourceHint: { class, method, line }`. Remove `normalizedMessage`, `topStackFrame`, and the full occurrences array.
- **D-07:** `CodeCandidate`: use `filePath`, `className`, `methodName`, `startLine`, `endLine`, `confidence`. Remove `methodBody` (Phase 4 concern — symbol resolution extracts the method body at that time).

### Pipeline Implementation Decisions (Claude's Discretion)
- **D-08:** Aggregation key composition: `type + message + sourceClass + sourceMethod + step`, SHA-256 hashed. `normalizedMessage` is the raw message (no stripping in v1, per CLAUDE.md note). `topStackFrame` is removed from the key per spec §5 `AggregatedAnomaly` shape (key = hash of `type + message + step + sourceClass`).
- **D-09:** Anomalies outside any step range → assign step name `'_init_'` and phase `'Precondition'` per CLAUDE.md spec.
- **D-10:** Step phase assignment: scenario named `'Precondition'` → `'Precondition'`, `'PostCondition'` → `'PostCondition'`, all others → `'TestCase'`. When step name appears in multiple scenarios, resolve by order of appearance in the log.

### Claude's Discretion
- **Test coverage**: Unit tests per parsing function (regex edge cases) + one integration test that pipes the real `examples/` artifact through the full pipeline and asserts the anomaly list. Both are required — unit tests catch regex regressions, integration test catches phase assignment and aggregation bugs.
- **Batch error handling**: Collect-and-surface per test case. If one test case fails to parse (corrupt log, missing feature file), record the error and continue with the remaining test cases. Never fail the entire batch silently. Return `{ results: AnalysisResult[], errors: { testCase: string, error: string }[] }` from the batch runner.
- **Pipeline orchestration**: New `src/core/engine.ts` — a thin orchestrator that takes a BatchRun folder URI, discovers test case subfolders, and for each: reads log + feature file (via `vscode.workspace.fs`), calls `parseLog → extractSteps → detectAnomalies → aggregateAnomalies → rankAnomalies`. `commands.ts` delegates to engine; engine has no VS Code UI imports (D-02 boundary maintained).
- **File discovery**: Use `vscode.workspace.fs.readDirectory` recursively. A test case subfolder is identified by containing both a `*.log` file (matching `*_YYMMDD_HHMMSS.log` at folder root) and a `*.feature` file. Per-phase subfolders (containing `_Precondition`, `_TestCase`, `_PostCondition` in their name) are excluded.
- **Ranking**: `AggregatedAnomaly` list sorted by `firstOccurrence.timestamp` ascending. First item = primary root cause; rest = secondary effects. No separate rank field — position in array is the rank.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Implementation Specification
- `docs/test_analysis_agent_spec_v2.md` — Full data contracts (§5), parsing regexes (§4), step boundary rules, aggregation key definition, phase assignment logic. **Primary reference — spec §5 types win over current src/types.ts.**
- `docs/test_analysis_agent_spec_v2.md §4` — Log format spec and regex patterns (LOG_LINE_PATTERN, STANDARD_SOURCE, EXCEPTION_SOURCE). Do not deviate.
- `docs/test_analysis_agent_spec_v2.md §5` — TypeScript interface definitions. These are the ground truth for this phase's type rewrite.

### Tech Stack Decisions
- `CLAUDE.md` — Locked technology choices: `@cucumber/gherkin` v28 + `@cucumber/messages` v24 for Gherkin parsing; `vscode.workspace.fs` (not Node.js `fs`) for all file I/O; Node.js built-in `crypto` for SHA-256.

### Example Artifacts
- `examples/BatchRun_250703_135229/WhenEnableBlockOfResponseDidForEcu_250703_135229/WhenEnableBlockOfResponseDidForEcu_250703_135229.log` — Real combined log. Integration tests must parse this file and assert correct anomaly output.
- `examples/BatchRun_250703_135229/WhenEnableBlockOfResponseDidForEcu_250703_135229/WhenEnableBlockOfResponseDidForEcu.feature` — Real feature file. Use to verify step extraction and phase assignment.

### Prior Phase Decisions
- `.planning/phases/01-scaffold/01-CONTEXT.md` — D-02 (no vscode imports in src/core/), D-03 (HTML delivery), esbuild config. Phase 2 must not break these constraints.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/parser.ts` — Has the three spec regex constants (LOG_LINE_PATTERN, STANDARD_SOURCE, EXCEPTION_SOURCE) already defined. Phase 2 implements `parseLog()` here — do not move the file.
- `src/core/detector.ts` — Stub `detectAnomalies(events, stepContexts)` signature. Phase 2 implements here.
- `src/core/aggregator.ts` — Has `hashKey(key: string): string` already implemented (SHA-256 via crypto). Phase 2 implements `aggregateAnomalies()` here.
- `src/types.ts` — Will be rewritten to spec §5 shape as the first task of this phase. All downstream code that depends on old field names must be updated simultaneously (currently only stubs, so impact is minimal).

### Established Patterns
- D-02 boundary: `src/core/` files import from `'../types'` and Node.js built-ins only — zero `vscode` imports.
- New `src/core/engine.ts` will be the only file that imports `vscode.workspace.fs`; it lives in `src/core/` as a thin orchestrator but gets VS Code APIs injected via parameters (URIs passed in from `commands.ts`) to preserve testability.

### Integration Points
- `src/extension/commands.ts` `runAnalysis()` → calls engine → returns `AnalysisResult[]` (or `{results, errors}` for batch)
- `src/extension/activate.ts` `registerCommand('logautopsy.runAnalysis', ...)` already wired — no change needed
- Gherkin parser: `@cucumber/gherkin` + `@cucumber/messages` must be added to `devDependencies` and bundled via esbuild (they are runtime deps for the extension host)

</code_context>

<specifics>
## Specific Ideas

- The example log shows continuation lines as multi-line dumps (adapter settings blocks spanning 5+ lines) — `raw` field must concatenate all continuation lines with newlines, not just the first.
- Feature file from examples uses `Scenario: Precondition`, `Scenario: TestCase`, `Scenario: PostCondition` naming exactly — the scenario-name-to-phase mapping is confirmed to be exact string match (case-sensitive).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-parsing-pipeline*
*Context gathered: 2026-04-20*
