# Phase 2: Parsing Pipeline - Research

**Researched:** 2026-04-20
**Domain:** log4net log parsing, Gherkin feature file parsing, anomaly detection and aggregation, VS Code workspace file I/O
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Type Contract — Align to Spec §5 Exactly**
- D-01: Rewrite `src/types.ts` to match spec §5 field names and shapes before any parsing implementation touches these types. First task of Phase 2.
- D-02: `LogEvent` fields: `sourceClass`, `sourceMethod`, `raw: string`, `fileLineNumber: number`, `thread: number`.
- D-03: `GherkinStep` fields: `name`, `keyword`, `keywordType`, `location`, `argument`. Remove `text`, `scenario`, `phase`.
- D-04: `StepContext` fields: `step: GherkinStep`, `phase`, `startLine`, `endLine`, `result?`, `failedByKeywordTranslator`.
- D-05: `Anomaly` is a flat DTO (no nested logEvent/stepContext structure).
- D-06: `AggregatedAnomaly`: use `key`, `occurrences: number` (count only), `firstOccurrence`, `sourceHint`. Remove `normalizedMessage`, `topStackFrame`, full occurrences array.
- D-07: `CodeCandidate`: use `filePath`, `className`, `methodName`, `startLine`, `endLine`, `confidence`. Remove `methodBody`.

**Pipeline Implementation Decisions**
- D-08: Aggregation key = `type + message + sourceClass + sourceMethod + step`, SHA-256 hashed.
- D-09: Anomalies outside any step range → `step = '_init_'`, `phase = 'Precondition'`.
- D-10: Step phase assignment by scenario name: `'Precondition'` → `'Precondition'`, `'PostCondition'` → `'PostCondition'`, all others → `'TestCase'`. When step appears in multiple scenarios, resolve by order of appearance in the log.

### Claude's Discretion
- Test coverage: unit tests per parsing function (regex edge cases) + one integration test piping real `examples/` artifact through full pipeline. Both required.
- Batch error handling: collect-and-surface per test case; return `{ results: AnalysisResult[], errors: { testCase: string, error: string }[] }`.
- Pipeline orchestration: new `src/core/engine.ts` as thin orchestrator. No VS Code UI imports in engine. URIs passed in from `commands.ts`.
- File discovery: `vscode.workspace.fs.readDirectory` recursively. Test case subfolder = has `*.log` at folder root AND `*.feature`. Exclude per-phase subfolders.
- Ranking: `AggregatedAnomaly[]` sorted by `firstOccurrence.timestamp` ascending. Position in array = rank. No separate rank field.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOAD-01 | User can select a BatchRun folder from disk | vscode.window.showOpenDialog + engine.ts folder discovery |
| LOAD-02 | Tool discovers all test case subfolders and analyzes each independently | vscode.workspace.fs.readDirectory + test-case-folder heuristic |
| PARSE-01 | Parse combined log4net files into structured LogEvent records | Three regex constants already in parser.ts; continuation line accumulation into `raw` field |
| PARSE-02 | Parse Gherkin `.feature` files to build step-to-phase mapping | @cucumber/gherkin v28 AstBuilder+Parser API |
| PARSE-03 | Extract step boundaries from GherkinExecutor markers and correlate to Gherkin step | GherkinExecutor\ExecuteStep:187 marker regex; location field provides exact feature-file line for disambiguation |
| DETECT-01 | Detect all ERROR-level events and associate with step context | level === 'ERROR' check; fileLineNumber range lookup against StepContext array |
| DETECT-02 | Aggregate identical errors within same step into single entry | SHA-256 key of type+message+sourceClass+sourceMethod+step via existing hashKey() |
| DETECT-03 | Rank groups by first occurrence — earliest = primary, rest = secondary | Sort AggregatedAnomaly[] by firstOccurrence.timestamp ascending |
</phase_requirements>

---

## Summary

Phase 2 builds the full deterministic parsing pipeline: folder discovery, log parsing, step extraction, anomaly detection, aggregation, and ranking — all without AI. The phase must be validated against real artifacts in `examples/`.

The existing codebase already has the three spec regex constants in `parser.ts`, a working `hashKey()` in `aggregator.ts`, and stub function signatures in `detector.ts`. The phase adds `src/core/engine.ts` (the thin orchestrator), implements all stubs, and rewrites `src/types.ts` to the spec §5 shape. The only new runtime dependency is `@cucumber/gherkin@28.0.0` + `@cucumber/messages@24.1.0`, which must be installed and bundled.

A critical discovery from examining the example log: the `location` field in step-start markers (format `col:line`) contains the feature-file line number as its second component. This allows exact step lookup by `(name, featureLine)` pair, making the order-of-appearance disambiguation for repeated step names (e.g., `TurnOnClamp15` appears in both Precondition and PostCondition) reliable without any stateful counter.

The example log contains 21 ERROR events across 7 distinct steps, all identical in message+class+method, producing 7 `AggregatedAnomaly` records. The earliest (line 488, `StartCarBusTrace` in Precondition at `13:52:41,220`) is the primary root cause.

**Primary recommendation:** Implement in wave order: (1) rewrite types.ts, (2) implement parser.ts, (3) implement step extractor (new file), (4) implement detector.ts, (5) implement aggregator.ts, (6) implement engine.ts with file I/O, (7) wire commands.ts. Write unit tests alongside each module; write the integration test against examples/ as the final task.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Folder selection UI | Extension Host (VS Code API) | — | vscode.window.showOpenDialog lives in extension commands |
| BatchRun discovery | Extension Host (engine.ts) | commands.ts | vscode.workspace.fs.readDirectory requires URI passing from extension layer |
| Log file I/O | Extension Host (engine.ts) | — | vscode.workspace.fs.readFile is the only allowed file API (CLAUDE.md constraint) |
| Log parsing (regex) | src/core (parser.ts) | — | Pure TS, zero vscode imports, D-02 boundary enforced |
| Gherkin feature parsing | src/core (new featureParser.ts or parser.ts) | — | @cucumber/gherkin is pure TS; no vscode needed |
| Step boundary extraction | src/core (new stepExtractor.ts) | — | Pure TS pipeline stage |
| Anomaly detection | src/core (detector.ts) | — | Pure TS; already stubbed |
| Aggregation + hashing | src/core (aggregator.ts) | — | SHA-256 via Node crypto; already stubbed with hashKey() |
| Ranking | src/core (aggregator.ts or engine.ts) | — | Sort by timestamp; pure TS |
| Batch error collection | engine.ts | — | Orchestrator owns result/error shape |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cucumber/gherkin` | `28.0.0` | Parse `.feature` files into AST | Official Cucumber project; CLAUDE.md locked choice |
| `@cucumber/messages` | `24.1.0` | Message types for gherkin AST | Peer dep of gherkin v28; has dual CJS/ESM exports |
| `crypto` (Node built-in) | — | SHA-256 for aggregation keys | CLAUDE.md locked choice; already used in aggregator.ts |
| `vscode.workspace.fs` | VS Code API | File discovery and reading | CLAUDE.md locked choice; required for remote/WSL |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@cucumber/gherkin` v28 | v39 (latest) | v28 locked by CLAUDE.md; v39 may have breaking API changes |
| `vscode.workspace.fs` | Node.js `fs` | Node.js fs fails in remote/WSL workspaces — CLAUDE.md prohibits it |
| Node `crypto` | `js-sha256` | No benefit; CLAUDE.md prohibits npm hash libs |

**Installation:**
```bash
npm install --save-dev @cucumber/gherkin@28.0.0 @cucumber/messages@24.1.0
```

Note: Both packages go in `devDependencies` but are bundled into `dist/extension.js` by esbuild. The esbuild config uses `platform: 'node'` with only `vscode` in `external` — no changes needed to esbuild.js.

**Version verification:** [VERIFIED: npm registry]
- `@cucumber/gherkin@28.0.0` exists; type field is empty (CommonJS); `main: dist/src/index.js` — no ESM-only concern, esbuild CJS bundling works without special configuration.
- `@cucumber/messages@24.1.0` exists; type field is `"module"` but has exports map with `"require": "./dist/cjs/src/index.js"` — esbuild resolves CJS entry correctly.

---

## Architecture Patterns

### System Architecture Diagram

```
commands.ts (runAnalysis)
  │
  ├── vscode.window.showOpenDialog → BatchRun folder URI
  │
  └── engine.ts (runBatch)
        │
        ├── vscode.workspace.fs.readDirectory → test case folder URIs
        │     └── filter: has *.log at root + has *.feature; exclude *_Precondition|TestCase|PostCondition subfolders
        │
        └── for each test case folder:
              │
              ├── vscode.workspace.fs.readFile (log) → Uint8Array → string
              ├── vscode.workspace.fs.readFile (feature) → Uint8Array → string
              │
              ├── parseLog(logContent) → LogEvent[]           [parser.ts]
              ├── parseFeature(featureContent) → StepPhaseMap [featureParser.ts]
              ├── extractSteps(events, stepPhaseMap) → StepContext[]  [stepExtractor.ts]
              ├── detectAnomalies(events, stepContexts) → Anomaly[]   [detector.ts]
              ├── aggregateAnomalies(anomalies) → AggregatedAnomaly[] [aggregator.ts]
              └── rankAnomalies(aggregated) → AggregatedAnomaly[] sorted
```

### Recommended Project Structure
```
src/
├── types.ts                  # Rewritten to spec §5 (first task)
├── core/
│   ├── parser.ts             # parseLog() — log4net line parser
│   ├── featureParser.ts      # parseFeature() — @cucumber/gherkin wrapper (NEW)
│   ├── stepExtractor.ts      # extractSteps() — GherkinExecutor marker scanner (NEW)
│   ├── detector.ts           # detectAnomalies() — ERROR filter + step lookup
│   ├── aggregator.ts         # aggregateAnomalies() + hashKey() + rankAnomalies()
│   └── engine.ts             # runBatch() orchestrator, vscode.workspace.fs calls (NEW)
├── extension/
│   ├── activate.ts           # No changes needed
│   └── commands.ts           # runAnalysis() updated to call engine.runBatch()
└── ui/
    └── ...                   # Phase 3 — untouched
test/
└── suite/
    ├── parser.test.ts        # Unit: parseLog regex edge cases (NEW)
    ├── featureParser.test.ts # Unit: parseFeature scenario/step extraction (NEW)
    ├── stepExtractor.test.ts # Unit: extractSteps marker parsing (NEW)
    ├── detector.test.ts      # Unit: detectAnomalies step range lookup (NEW)
    ├── aggregator.test.ts    # Unit: aggregateAnomalies key hashing + ranking (NEW)
    └── pipeline.test.ts      # Integration: full examples/ artifact pipeline (NEW)
```

### Pattern 1: Log Line Parsing

```typescript
// Source: docs/test_analysis_agent_spec_v2.md §4 + src/core/parser.ts
const LOG_LINE_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\d+)\] (\w+)\s+(.+)$/;
const STANDARD_SOURCE  = /^(\S+?)\\(\w+):(\d+) - (.*)$/;
const EXCEPTION_SOURCE = /^(\S+?)\|(\w+) in (\w+):(\d+) - (.*)$/;

// Parsing loop pattern:
let current: Partial<LogEvent> | null = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('[Begin of') || line.startsWith('[End of')) { continue; }
  const m = LOG_LINE_PATTERN.exec(line);
  if (m) {
    if (current) { events.push(current as LogEvent); }
    // Try EXCEPTION_SOURCE first, then STANDARD_SOURCE
    current = buildLogEvent(m, i + 1 /* fileLineNumber */);
  } else if (current) {
    // Continuation line
    current.raw += '\n' + line;
    if (current.level === 'ERROR') {
      current.stacktrace = (current.stacktrace ?? '') + (current.stacktrace ? '\n' : '') + line;
    }
  }
}
if (current) { events.push(current as LogEvent); }
```

### Pattern 2: Gherkin Feature Parsing

```typescript
// Source: Context7 /cucumber/gherkin — verified API
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';

const uuidFn = IdGenerator.uuid();
const builder = new AstBuilder(uuidFn);
const matcher = new GherkinClassicTokenMatcher();
const parser = new Parser(builder, matcher);

const gherkinDocument = parser.parse(featureContent);
// gherkinDocument.feature.children[] has { scenario: { name, steps[] } }
// step.location.line = feature file line number (1-based)
// step.keyword = 'When ', 'And ', 'Then ' (includes trailing space)
// step.text = step name text
```

### Pattern 3: Step Boundary Extraction

```typescript
// Source: docs/test_analysis_agent_spec_v2.md §6.4
// Step start marker example from real log (line 484):
// "Next test step 'StartCarBusTrace' (location '9:4', keyword 'When ', keyword type 'Action', argument '')."
const STEP_START = /GherkinExecutor\\ExecuteStep:187 - Next test step '(.+?)' \(location '(\d+):(\d+)', keyword '(.+?)', keyword type '(.+?)', argument '(.*)'\)\./;
const STEP_RESULT = /GherkinExecutor\\ExecuteStep:221 - Result of test step '(.+?)'\./;
const KW_ACTION_FAILED = /KeywordTranslator\\ExecuteTestStep:51 - The test action '(.+?)' is failed\./;
const KW_CHECK_FAILED  = /KeywordTranslator\\ExecuteTestStep:34 - The test check '(.+?)' is failed\./;

// location format: 'col:line' where line = feature file line number
// Use featureLine to look up exact GherkinStep from the parsed AST (handles duplicate step names)
```

### Pattern 4: Step-to-Phase Lookup

```typescript
// Build map from feature AST: featureFileLine → { step: GherkinStep, phase }
// CRITICAL: Gherkin step.location.line matches the second number in log location 'col:line'
// This handles TurnOnClamp15 at line 7 (Precondition) vs line 14 (PostCondition) without ambiguity
type StepPhaseMap = Map<number, { step: GherkinStep; phase: 'Precondition' | 'TestCase' | 'PostCondition' }>;

function buildStepPhaseMap(gherkinDocument: GherkinDocument): StepPhaseMap {
  const map: StepPhaseMap = new Map();
  for (const child of gherkinDocument.feature?.children ?? []) {
    if (!child.scenario) { continue; }
    const scenarioName = child.scenario.name;
    const phase = scenarioName === 'Precondition' ? 'Precondition'
                : scenarioName === 'PostCondition' ? 'PostCondition'
                : 'TestCase';
    for (const s of child.scenario.steps) {
      map.set(s.location.line, {
        step: {
          name: s.text,
          keyword: s.keyword,
          keywordType: s.keywordType as GherkinStep['keywordType'],
          location: `${s.location.column}:${s.location.line}`,
          argument: ''  // docString/dataTable — empty string for this test suite
        },
        phase
      });
    }
  }
  return map;
}
```

### Pattern 5: vscode.workspace.fs File Reading

```typescript
// Source: VS Code API docs — vscode.workspace.fs is mandatory per CLAUDE.md
// engine.ts only — not in src/core/ modules
import * as vscode from 'vscode';

const bytes = await vscode.workspace.fs.readFile(uri);
const content = Buffer.from(bytes).toString('utf-8');  // or new TextDecoder().decode(bytes)
```

### Anti-Patterns to Avoid

- **Importing vscode in src/core/ files:** Violates D-02. All VS Code API calls (readFile, readDirectory) live exclusively in `engine.ts`, with URIs and decoded strings passed into pure functions.
- **Using Node.js `fs` module for file I/O:** Breaks remote/WSL workspace support per CLAUDE.md.
- **Matching EXCEPTION_SOURCE before STANDARD_SOURCE for every line:** Spec §6.2 says try EXCEPTION_SOURCE first — the ordering matters because exception lines would also partially match STANDARD_SOURCE.
- **Building step lookup by step name only:** `TurnOnClamp15` appears in both Precondition and PostCondition. Lookup must use `featureFileLine` (from location's second component) to disambiguate, not step name alone.
- **Appending raw continuation lines but not stacktrace:** Spec §6.2 rule 3 says continuation lines after an ERROR event must go into both `raw` AND `stacktrace`. Only ERROR events accumulate stacktrace; other levels accumulate raw only.
- **Treating WARN as anomaly:** Only `level === 'ERROR'` is an anomaly. WARN lines (including `KeywordTranslator\ExecuteTestStep:51`) are NOT anomalies.
- **Including per-phase subfolder logs in discovery:** Only the combined log at the test case root is parsed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gherkin feature file parsing | Custom regex or string splitting | `@cucumber/gherkin` v28 | Gherkin has edge cases: multi-line docstrings, data tables, tags, scenario outlines, unicode keywords |
| SHA-256 hashing | Manual hash implementation | `crypto.createHash('sha256')` | Already implemented in `aggregator.hashKey()`; built-in, no dep |
| File path glob matching | Custom directory walk | `vscode.workspace.fs.readDirectory` | Works in remote/WSL; required by CLAUDE.md |

**Key insight:** The Gherkin parser avoids fragile regex on `.feature` files that would break on any non-trivial Gherkin feature (docstrings, examples tables, background steps). The AST gives exact line numbers for free, solving the step disambiguation problem without heuristics.

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is a greenfield implementation phase, not a rename/refactor/migration phase.

---

## Common Pitfalls

### Pitfall 1: Continuation Line Accumulation — Blank Line Between Entry and Next Entry
**What goes wrong:** The example log has a blank line between a log entry with continuation lines and the next timestamp line (e.g., after the `ConnectorBaseClass\.ctor:15` multi-line settings block, line 28 is blank). A blank line does NOT match `LOG_LINE_PATTERN` — it must be treated as a continuation line, not discarded.
**Why it happens:** Parsers that skip blank lines will break the raw field accumulation.
**How to avoid:** Only skip lines matching `[Begin of` and `[End of` markers. All other non-timestamp lines (including blank lines) are continuation lines.
**Warning signs:** `raw` field shorter than expected; missing blank separators in settings dumps.

### Pitfall 2: GherkinStep `keywordType` Field Availability
**What goes wrong:** `step.keywordType` from `@cucumber/gherkin` AST is only populated in newer versions. In v28, the `keywordType` on the AST step may be `undefined` for some token matchers.
**Why it happens:** Keyword type classification depends on the matcher and dialect.
**How to avoid:** Verify `keywordType` is present on AST step nodes by installing the package and checking. If absent, derive from keyword: `'When'`/`'Given'` → `'Action'`, `'And'`/`'But'` → `'Conjunction'`, `'Then'` → `'Outcome'`.
**Warning signs:** `keywordType` field on `GherkinStep` interface is `undefined` at runtime.

### Pitfall 3: Step Marker Regex — Trailing Period and Argument Quoting
**What goes wrong:** The step start message ends with a period: `argument '').` — the period is outside the final quote. A regex that captures to end-of-string or uses greedy matching may fail.
**Why it happens:** The marker pattern from spec §6.4 is verbose; argument can contain any character including parentheses and single quotes.
**How to avoid:** Pattern: `argument '(.*?)'\)\.` — non-greedy capture for argument, match literal `).` at end.
**Warning signs:** Step name or argument captured with trailing garbage; `undefined` matches for later steps.

### Pitfall 4: Aggregation Key Discrepancy — CONTEXT.md vs Spec §6.6
**What goes wrong:** D-08 in CONTEXT.md defines the aggregation key as `type + message + sourceClass + sourceMethod + step`. Spec §6.6 defines it as `type + normalizedMessage + topStackFrame + step`. These differ — spec uses `topStackFrame`, CONTEXT.md (locked decision) removes it.
**Why it happens:** The CONTEXT.md decisions supersede the spec for this phase (D-08 is a locked decision).
**How to avoid:** Use D-08 key: `type + message + sourceClass + sourceMethod + step`. Do not use `topStackFrame`.
**Warning signs:** Aggregation key computation inconsistent with D-06 `AggregatedAnomaly` shape.

### Pitfall 5: `@cucumber/messages` ESM-only Type Issue
**What goes wrong:** `@cucumber/messages@24` has `"type": "module"` in package.json. TypeScript with `"module": "commonjs"` in tsconfig may have trouble importing its types.
**Why it happens:** The package uses dual exports (CJS + ESM) but the TypeScript type resolution must pick up the CJS path.
**How to avoid:** The exports map `"require": "./dist/cjs/src/index.js"` is present — esbuild resolves CJS at bundle time. For TypeScript type checking, import types from `@cucumber/messages` normally; tsc with `moduleResolution: node` follows the CJS path. Verify `npm install` succeeded and types are present in `node_modules/@cucumber/messages/dist/cjs/src/index.d.ts`.
**Warning signs:** tsc errors `Module '@cucumber/messages' has no exported member 'IdGenerator'`.

### Pitfall 6: Step End Line Boundary — Inclusive vs Exclusive
**What goes wrong:** A step's `endLine` must be the line before the next Step Start marker (or EOF). If the next step's start line is used as the `endLine` for the previous step, anomaly detection may fail to associate errors that fall on that exact line.
**Why it happens:** Off-by-one in range boundary logic.
**How to avoid:** For step N: `endLine = stepN+1.startLine - 1`. For the last step: `endLine = totalLines`. Use inclusive range: `startLine <= fileLineNumber <= endLine`.
**Warning signs:** Errors on the line immediately before a step marker are not associated with any step.

---

## Code Examples

Verified patterns from official sources and example artifact inspection:

### Step Start Marker — Exact Format from Real Log
```
2025-07-03 13:52:40,680 [14] DEBUG GherkinExecutor\ExecuteStep:187 - Next test step 'StartCarBusTrace' (location '9:4', keyword 'When ', keyword type 'Action', argument '').
```
- location format: `'col:line'` — second number is the 1-based feature file line.
- keyword includes trailing space: `'When '`, `'And '`, `'Then '`.
- argument is empty string `''` in this test suite.
- [VERIFIED: examples/ real log file, line 484]

### Exception Log Line — Exact Format
```
2025-07-03 13:52:41,220 [14] ERROR AdapterXil.WebApiCalls|MethodException in WaitForTask:31 - Failed with the message 'width=device-width, initial-scale=1'.
```
- Parsed by EXCEPTION_SOURCE regex: `sourceClass=AdapterXil.WebApiCalls`, `exceptionType=MethodException`, `sourceMethod=WaitForTask`, `sourceLine=31`.
- [VERIFIED: examples/ real log file, line 488]

### Gherkin AST Access Pattern
```typescript
// Source: Context7 /cucumber/gherkin verified API
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';

const uuidFn = IdGenerator.uuid();
const gherkinDocument = new Parser(
  new AstBuilder(uuidFn),
  new GherkinClassicTokenMatcher()
).parse(featureContent);

for (const child of gherkinDocument.feature?.children ?? []) {
  if (!child.scenario) { continue; }
  const scenarioName = child.scenario.name;           // e.g. 'Precondition'
  for (const step of child.scenario.steps) {
    const line = step.location.line;                  // 1-based feature file line
    const name = step.text;                           // 'StartCarBusTrace'
    const keyword = step.keyword;                     // 'When '
  }
}
```

### Aggregation Key Construction
```typescript
// Source: D-08 locked decision from 02-CONTEXT.md
function makeAggregationKey(anomaly: Anomaly): string {
  return `${anomaly.type}|${anomaly.message}|${anomaly.sourceClass}|${anomaly.sourceMethod}|${anomaly.step}`;
}
// Then: hashKey(makeAggregationKey(anomaly)) — hashKey already in aggregator.ts
```

### Expected Integration Test Output (from example artifacts)
```
Input: examples/BatchRun_250703_135229/WhenEnableBlockOfResponseDidForEcu_250703_135229/
  log: WhenEnableBlockOfResponseDidForEcu_250703_135229.log (630 lines, 21 ERRORs)
  feature: WhenEnableBlockOfResponseDidForEcu.feature

Expected AggregatedAnomaly[] (7 entries, sorted by firstOccurrence.timestamp):
1. step='StartCarBusTrace',      phase='Precondition', occurrences=3  ← PRIMARY
2. step='UnlockCentralLockingSystem', phase='Precondition', occurrences=3
3. step='CarEntry',              phase='Precondition', occurrences=3
4. step='enable block of response IVD-C for Clima ECU', phase='TestCase', occurrences=3
5. step='CarLeave',              phase='PostCondition', occurrences=3
6. step='LockCentralLockingSystem', phase='PostCondition', occurrences=3
7. step='StopCarBusTrace',       phase='PostCondition', occurrences=3

All share: sourceClass='AdapterXil.WebApiCalls', sourceMethod='WaitForTask', 
           message="Failed with the message 'width=device-width, initial-scale=1'"
```
[VERIFIED: counting from real log file grep output]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@vscode/test-electron` | `@vscode/test-cli` | Phase 1 decision | Already in package.json as devDep |
| `className`/`methodName` fields in LogEvent | `sourceClass`/`sourceMethod` | Phase 2 D-02 decision | types.ts rewrite task 1 |
| Nested `Anomaly` with `logEvent`/`stepContext` | Flat DTO Anomaly | Phase 2 D-05 decision | Simpler serialization for Phase 3 UI |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `step.keywordType` is available on AST step nodes in `@cucumber/gherkin@28.0.0` | Pitfall 2, Pattern 2 | GherkinStep.keywordType will be undefined at runtime; need fallback derivation from keyword string |
| A2 | `step.argument` is always empty string `''` for this test suite's feature files | Pattern 4, Code Examples | Argument field may contain docstring/table for some steps; need safe extraction |

---

## Open Questions

1. **`keywordType` on gherkin AST step nodes in v28**
   - What we know: The spec §5 `GherkinStep` requires `keywordType: 'Action'|'Conjunction'|'Outcome'`. Context7 docs show the field exists. The real feature file uses When/And/Then keywords.
   - What's unclear: Whether `@cucumber/gherkin@28.0.0` AST nodes populate `step.keywordType` or whether it requires the Pickle API.
   - Recommendation: Install the package in a scratch test and `console.log(step.keywordType)` before committing to the AST path. If not available, derive from keyword string (mapping in implementation task).

2. **`vscode.workspace.fs` in non-workspace context (no folder open)**
   - What we know: `vscode.workspace.fs` works when a workspace folder is open. `showOpenDialog` can open any folder.
   - What's unclear: Whether `vscode.workspace.fs.readFile` works with arbitrary URIs outside the workspace root, or requires the URI to be within an opened workspace folder.
   - Recommendation: Use `vscode.Uri.file(path)` from the dialog result — this creates a `file://` URI that `vscode.workspace.fs` handles regardless of workspace membership. Verify by testing in Extension Development Host.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v25.9.0 | — |
| TypeScript | Compile | Yes (devDep) | ~5.4 | — |
| `@cucumber/gherkin@28.0.0` | PARSE-02 | Not installed | — | Must install |
| `@cucumber/messages@24.1.0` | PARSE-02 | Not installed | — | Must install |
| `@vscode/test-cli` | Test runner | Yes (devDep) | ^0.0.9 | — |
| Mocha | Test framework | Yes (devDep) | ^10 | — |

**Missing dependencies with no fallback:**
- `@cucumber/gherkin@28.0.0` + `@cucumber/messages@24.1.0` — must be installed before any feature parsing task can compile. Wave 0 task.

**Missing dependencies with fallback:**
- None beyond the above.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Mocha 10 via `@vscode/test-cli` |
| Config file | `.vscode-test.mjs` (already present) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOAD-01 | Folder picker shows; URI returned | manual | — | — |
| LOAD-02 | readDirectory finds test case folders, excludes phase subfolders | unit | `npm test` → engine discovery tests | No — Wave 0 |
| PARSE-01 | parseLog produces correct LogEvent[] with all fields for example log | unit+integration | `npm test` → parser.test.ts | No — Wave 0 |
| PARSE-02 | parseFeature maps each step to correct phase | unit | `npm test` → featureParser.test.ts | No — Wave 0 |
| PARSE-03 | extractSteps maps GherkinExecutor markers to StepContext[] | unit | `npm test` → stepExtractor.test.ts | No — Wave 0 |
| DETECT-01 | detectAnomalies finds 21 ERRORs; associates each with correct step | unit+integration | `npm test` → detector.test.ts | No — Wave 0 |
| DETECT-02 | aggregateAnomalies produces 7 groups from 21 errors | unit+integration | `npm test` → aggregator.test.ts | No — Wave 0 |
| DETECT-03 | rankAnomalies puts StartCarBusTrace first | unit+integration | `npm test` → aggregator.test.ts | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run check-types` (fast; no Extension Development Host required for unit tests)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/suite/parser.test.ts` — covers PARSE-01
- [ ] `test/suite/featureParser.test.ts` — covers PARSE-02
- [ ] `test/suite/stepExtractor.test.ts` — covers PARSE-03
- [ ] `test/suite/detector.test.ts` — covers DETECT-01
- [ ] `test/suite/aggregator.test.ts` — covers DETECT-02, DETECT-03
- [ ] `test/suite/pipeline.test.ts` — integration test covering LOAD-02, full pipeline against examples/
- [ ] Install: `npm install --save-dev @cucumber/gherkin@28.0.0 @cucumber/messages@24.1.0`

---

## Security Domain

This phase has no authentication, network calls, user input processing, cryptographic operations (SHA-256 is deterministic, not security-sensitive), or external API calls. ASVS categories are not applicable for a pure local file parsing pipeline running in the extension host.

---

## Sources

### Primary (HIGH confidence)
- `docs/test_analysis_agent_spec_v2.md` — §4 regex patterns, §5 data contracts, §6 pipeline rules. Ground truth for this phase.
- `examples/` real artifacts — parsed to derive expected integration test output (21 ERRORs, 7 aggregated groups, location format `col:line`).
- `src/core/parser.ts`, `aggregator.ts`, `detector.ts` — verified existing stubs and regex constants.
- Context7 `/cucumber/gherkin` — AST builder + parser API (`AstBuilder`, `GherkinClassicTokenMatcher`, `Parser`, `IdGenerator`).
- npm registry — verified `@cucumber/gherkin@28.0.0` and `@cucumber/messages@24.1.0` exist; verified CJS/ESM exports map.

### Secondary (MEDIUM confidence)
- `.planning/phases/02-parsing-pipeline/02-CONTEXT.md` — locked decisions D-01 through D-10; Claude's discretion items.
- `CLAUDE.md` — technology stack constraints and VS Code API requirements.

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified on npm registry; versions confirmed; module formats checked
- Architecture: HIGH — derived from spec + CONTEXT.md locked decisions + real artifact inspection
- Pitfalls: HIGH for items derived from real log; MEDIUM for @cucumber/messages ESM issue (confirmed by exports map inspection)
- Integration test expectations: HIGH — counted directly from grep of real example log

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (stable domain; @cucumber/gherkin v28 is pinned)
