# Phase 2: Parsing Pipeline - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 12 (6 modified, 6 new)
**Analogs found:** 10 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/types.ts` | model | transform | `src/types.ts` (current) | self — rewrite |
| `src/core/parser.ts` | service | transform | `src/core/parser.ts` (current stub) | self — implement |
| `src/core/featureParser.ts` | service | transform | `src/core/parser.ts` | role-match |
| `src/core/stepExtractor.ts` | service | transform | `src/core/parser.ts` | role-match |
| `src/core/detector.ts` | service | transform | `src/core/detector.ts` (current stub) | self — implement |
| `src/core/aggregator.ts` | service | transform | `src/core/aggregator.ts` (current stub) | self — implement |
| `src/core/engine.ts` | service | batch | `src/extension/commands.ts` | partial — orchestration shape |
| `src/extension/commands.ts` | controller | request-response | `src/extension/commands.ts` (current) | self — update |
| `test/suite/parser.test.ts` | test | transform | `test/suite/extension.test.ts` | role-match |
| `test/suite/featureParser.test.ts` | test | transform | `test/suite/extension.test.ts` | role-match |
| `test/suite/detector.test.ts` | test | transform | `test/suite/extension.test.ts` | role-match |
| `test/suite/aggregator.test.ts` | test | transform | `test/suite/extension.test.ts` | role-match |
| `test/suite/stepExtractor.test.ts` | test | transform | `test/suite/extension.test.ts` | role-match |
| `test/suite/pipeline.test.ts` | test | batch | `test/suite/extension.test.ts` | role-match |

---

## Pattern Assignments

### `src/types.ts` (model, transform) — REWRITE

**Analog:** `src/types.ts` (current — read before rewriting)

**Current shape to replace** (`src/types.ts` lines 1–69):
All existing interfaces are stubs from Phase 1. This file is a full rewrite. The existing file is the baseline to replace; the new shape is dictated by spec §5 and CONTEXT.md decisions D-01 through D-07.

**File header pattern** (line 1–3):
```typescript
// src/types.ts — Shared interfaces across all layers
// Full definitions per spec §5 in docs/test_analysis_agent_spec_v2.md
// CRITICAL (D-02): No imports from 'vscode' — consumed by both src/core/ and src/ui/
```

**New LogEvent shape** (D-02 — replace lines 5–15):
```typescript
export interface LogEvent {
  timestamp: string;          // 'YYYY-MM-DD HH:MM:SS,mmm'
  thread: number;             // was string; now number
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  sourceClass: string;        // was className
  sourceMethod: string;       // was methodName
  sourceLine: number;
  message: string;
  raw: string;                // full text of primary line + continuation lines joined with '\n'
  fileLineNumber: number;     // 1-based line number in the log file (not sourceLine)
  exceptionType?: string;
  stacktrace?: string;        // continuation lines only when level === 'ERROR'
}
```

**New GherkinStep shape** (D-03 — replace lines 17–22):
```typescript
export interface GherkinStep {
  name: string;               // was text; rename for clarity
  keyword: string;            // 'When ', 'And ', 'Then ' (includes trailing space)
  keywordType: 'Action' | 'Conjunction' | 'Outcome';
  location: string;           // 'col:line' format from log marker
  argument: string;           // docString/dataTable; empty string '' for this suite
}
```

**New StepContext shape** (D-04 — replace lines 24–28):
```typescript
export interface StepContext {
  step: GherkinStep;                              // no longer union with '_init_'
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
  startLine: number;                              // fileLineNumber of GherkinExecutor marker
  endLine: number;                               // inclusive; last line before next marker or EOF
  result?: string;
  failedByKeywordTranslator: boolean;
}
```

**New Anomaly shape** (D-05 — replace lines 30–33, flat DTO):
```typescript
export interface Anomaly {
  id: string;                 // UUID or sequential; unique per anomaly instance
  type: 'ERROR';
  message: string;
  stacktrace?: string;
  step: string;               // GherkinStep.name or '_init_' for pre-step anomalies
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
  file: string;               // log file path
  line: number;               // fileLineNumber in log
  sourceClass: string;
  sourceMethod: string;
  sourceLine: number;         // source code line from log entry
  exceptionType?: string;
  timestamp: string;
}
```

**New AggregatedAnomaly shape** (D-06 — replace lines 35–45):
```typescript
export interface AggregatedAnomaly {
  key: string;                // SHA-256 of aggregation key string
  type: 'ERROR';
  message: string;
  step: string;
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
  occurrences: number;        // count only — not array
  firstOccurrence: {
    file: string;
    line: number;
    timestamp: string;
  };
  sourceHint: {
    class: string;
    method: string;
    line: number;
  };
}
```

**New CodeCandidate shape** (D-07 — replace lines 47–52):
```typescript
export interface CodeCandidate {
  filePath: string;
  className: string;
  methodName: string;
  startLine: number;
  endLine: number;
  confidence: number;         // 0.0–1.0; methodBody removed (Phase 4 concern)
}
```

**AnalysisResult shape** (new — needed by engine.ts batch return):
```typescript
export interface AnalysisResult {
  testCase: string;           // folder name
  anomalies: AggregatedAnomaly[];
}

export interface BatchResult {
  results: AnalysisResult[];
  errors: { testCase: string; error: string }[];
}
```

---

### `src/core/parser.ts` (service, transform) — IMPLEMENT

**Analog:** `src/core/parser.ts` (current stub — lines 1–23)

**File header / import pattern** (lines 1–3 — preserve exactly):
```typescript
// src/core/parser.ts
// NO vscode imports — pure TypeScript (D-02)
import type { LogEvent } from '../types';
```

**Regex constants** (lines 6–8 — preserve exactly, remove void suppression lines 12–14):
```typescript
const LOG_LINE_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\d+)\] (\w+)\s+(.+)$/;
const STANDARD_SOURCE  = /^(\S+?)\\(\w+):(\d+) - (.*)$/;
const EXCEPTION_SOURCE = /^(\S+?)\|(\w+) in (\w+):(\d+) - (.*)$/;
```

**parseLog implementation skeleton** — replace stub body (line 20–23):
```typescript
export function parseLog(content: string): LogEvent[] {
  const lines = content.split('\n');
  const events: LogEvent[] = [];
  let current: Partial<LogEvent> & { raw: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip header/footer markers — all other non-timestamp lines are continuations
    if (line.startsWith('[Begin of') || line.startsWith('[End of')) { continue; }

    const m = LOG_LINE_PATTERN.exec(line);
    if (m) {
      if (current) { events.push(current as LogEvent); }
      const rest = m[4];
      // Try EXCEPTION_SOURCE first (spec §6.2 — ordering matters)
      const exc = EXCEPTION_SOURCE.exec(rest);
      const std = exc ? null : STANDARD_SOURCE.exec(rest);
      current = {
        timestamp: m[1],
        thread: parseInt(m[2], 10),
        level: m[3] as LogEvent['level'],
        sourceClass: exc ? exc[1] : (std ? std[1] : ''),
        exceptionType: exc ? exc[2] : undefined,
        sourceMethod: exc ? exc[3] : (std ? std[2] : ''),
        sourceLine: exc ? parseInt(exc[4], 10) : (std ? parseInt(std[3], 10) : 0),
        message: exc ? exc[5] : (std ? std[4] : rest),
        raw: line,
        fileLineNumber: i + 1,
        stacktrace: undefined,
      };
    } else if (current) {
      // Continuation line (including blank lines — do NOT skip them)
      current.raw += '\n' + line;
      if (current.level === 'ERROR') {
        current.stacktrace = (current.stacktrace ?? '') + (current.stacktrace ? '\n' : '') + line;
      }
    }
  }
  if (current) { events.push(current as LogEvent); }
  return events;
}
```

---

### `src/core/featureParser.ts` (service, transform) — NEW

**Analog:** `src/core/parser.ts` — same role (pure-TS transform service, no vscode imports)

**File header pattern** (copy from `src/core/parser.ts` lines 1–2, adapt):
```typescript
// src/core/featureParser.ts
// NO vscode imports — pure TypeScript (D-02)
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type { GherkinStep } from '../types';
```

**StepPhaseMap type** (local to this module):
```typescript
export type StepPhaseMap = Map<number, {
  step: GherkinStep;
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
}>;
```

**parseFeature function** (primary export):
```typescript
export function parseFeature(featureContent: string): StepPhaseMap {
  const uuidFn = IdGenerator.uuid();
  const builder = new AstBuilder(uuidFn);
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);
  const gherkinDocument = parser.parse(featureContent);

  const map: StepPhaseMap = new Map();
  for (const child of gherkinDocument.feature?.children ?? []) {
    if (!child.scenario) { continue; }
    const scenarioName = child.scenario.name;
    const phase: 'Precondition' | 'TestCase' | 'PostCondition' =
      scenarioName === 'Precondition' ? 'Precondition'
      : scenarioName === 'PostCondition' ? 'PostCondition'
      : 'TestCase';
    for (const s of child.scenario.steps) {
      // Derive keywordType from keyword if AST doesn't populate it (Pitfall 2)
      const kt = (s as any).keywordType ?? deriveKeywordType(s.keyword.trim());
      map.set(s.location.line, {
        step: {
          name: s.text,
          keyword: s.keyword,
          keywordType: kt,
          location: `${s.location.column}:${s.location.line}`,
          argument: '',
        },
        phase,
      });
    }
  }
  return map;
}

function deriveKeywordType(kw: string): GherkinStep['keywordType'] {
  if (kw === 'Then') { return 'Outcome'; }
  if (kw === 'And' || kw === 'But') { return 'Conjunction'; }
  return 'Action'; // Given, When
}
```

---

### `src/core/stepExtractor.ts` (service, transform) — NEW

**Analog:** `src/core/parser.ts` — same role (pure-TS, no vscode imports)

**File header pattern** (copy from `src/core/parser.ts` lines 1–2, adapt):
```typescript
// src/core/stepExtractor.ts
// NO vscode imports — pure TypeScript (D-02)
import type { LogEvent, StepContext } from '../types';
import type { StepPhaseMap } from './featureParser';
```

**Step marker regexes** (from RESEARCH.md Pattern 3):
```typescript
const STEP_START  = /GherkinExecutor\\ExecuteStep:187 - Next test step '(.+?)' \(location '(\d+):(\d+)', keyword '(.+?)', keyword type '(.+?)', argument '(.*?)'\)\./;
const STEP_RESULT = /GherkinExecutor\\ExecuteStep:221 - Result of test step '(.+?)'\./;
const KW_ACTION_FAILED = /KeywordTranslator\\ExecuteTestStep:51 - The test action '(.+?)' is failed\./;
const KW_CHECK_FAILED  = /KeywordTranslator\\ExecuteTestStep:34 - The test check '(.+?)' is failed\./;
```

**extractSteps function skeleton:**
```typescript
export function extractSteps(events: LogEvent[], stepPhaseMap: StepPhaseMap): StepContext[] {
  const contexts: StepContext[] = [];
  let current: StepContext | null = null;
  const totalLines = events.length > 0 ? events[events.length - 1].fileLineNumber : 0;

  for (const event of events) {
    const m = STEP_START.exec(event.message);
    if (m) {
      if (current) {
        current.endLine = event.fileLineNumber - 1;
        contexts.push(current);
      }
      const featureLine = parseInt(m[3], 10); // location 'col:line' — second number
      const entry = stepPhaseMap.get(featureLine);
      if (!entry) { continue; } // unknown step — skip
      const result = STEP_RESULT.exec(event.message); // may come later; track separately
      current = {
        step: entry.step,
        phase: entry.phase,
        startLine: event.fileLineNumber,
        endLine: totalLines,    // will be updated when next step start is found
        failedByKeywordTranslator: false,
      };
    } else if (current) {
      if (KW_ACTION_FAILED.test(event.message) || KW_CHECK_FAILED.test(event.message)) {
        current.failedByKeywordTranslator = true;
      }
    }
  }
  if (current) { contexts.push(current); }
  return contexts;
}
```

---

### `src/core/detector.ts` (service, transform) — IMPLEMENT

**Analog:** `src/core/detector.ts` (current stub — lines 1–16)

**File header / import pattern** (lines 1–3 — preserve exactly):
```typescript
// src/core/detector.ts
// NO vscode imports — pure TypeScript (D-02)
import type { LogEvent, StepContext, Anomaly } from '../types';
```

**detectAnomalies implementation** — replace stub body (lines 10–16):
```typescript
export function detectAnomalies(events: LogEvent[], stepContexts: StepContext[]): Anomaly[] {
  return events
    .filter(e => e.level === 'ERROR')
    .map(e => {
      const ctx = stepContexts.find(
        s => e.fileLineNumber >= s.startLine && e.fileLineNumber <= s.endLine
      );
      return {
        id: `${e.fileLineNumber}`,
        type: 'ERROR' as const,
        message: e.message,
        stacktrace: e.stacktrace,
        step: ctx ? ctx.step.name : '_init_',
        phase: ctx ? ctx.phase : 'Precondition',
        file: '',              // populated by engine.ts with actual file path
        line: e.fileLineNumber,
        sourceClass: e.sourceClass,
        sourceMethod: e.sourceMethod,
        sourceLine: e.sourceLine,
        exceptionType: e.exceptionType,
        timestamp: e.timestamp,
      };
    });
}
```

---

### `src/core/aggregator.ts` (service, transform) — IMPLEMENT

**Analog:** `src/core/aggregator.ts` (current stub — lines 1–19)

**File header / import pattern** (lines 1–4 — preserve exactly):
```typescript
// src/core/aggregator.ts
// NO vscode imports — pure TypeScript (D-02)
import { createHash } from 'crypto';   // Node.js built-in — no npm dep
import type { Anomaly, AggregatedAnomaly } from '../types';
```

**hashKey function** (lines 17–19 — preserve exactly — already implemented):
```typescript
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

**aggregateAnomalies implementation** — replace stub body (lines 11–14), D-08 key:
```typescript
export function aggregateAnomalies(anomalies: Anomaly[]): AggregatedAnomaly[] {
  const map = new Map<string, AggregatedAnomaly>();

  for (const a of anomalies) {
    // D-08: key = type + message + sourceClass + sourceMethod + step
    const rawKey = `${a.type}|${a.message}|${a.sourceClass}|${a.sourceMethod}|${a.step}`;
    const key = hashKey(rawKey);
    const existing = map.get(key);
    if (existing) {
      existing.occurrences += 1;
    } else {
      map.set(key, {
        key,
        type: a.type,
        message: a.message,
        step: a.step,
        phase: a.phase,
        occurrences: 1,
        firstOccurrence: { file: a.file, line: a.line, timestamp: a.timestamp },
        sourceHint: { class: a.sourceClass, method: a.sourceMethod, line: a.sourceLine },
      });
    }
  }
  return Array.from(map.values());
}

export function rankAnomalies(aggregated: AggregatedAnomaly[]): AggregatedAnomaly[] {
  // Sort ascending by firstOccurrence.timestamp — position 0 = primary root cause
  return [...aggregated].sort((a, b) =>
    a.firstOccurrence.timestamp.localeCompare(b.firstOccurrence.timestamp)
  );
}
```

---

### `src/core/engine.ts` (service, batch) — NEW

**Analog:** `src/extension/commands.ts` — orchestrator shape (async, vscode imports allowed here only)

**File header / import pattern** (copy async/vscode pattern from `src/extension/commands.ts` lines 1–3, adapt):
```typescript
// src/core/engine.ts
// Only file in src/core/ permitted to import vscode — URIs passed in; no UI imports
import * as vscode from 'vscode';
import type { BatchResult, AnalysisResult } from '../types';
import { parseLog } from './parser';
import { parseFeature } from './featureParser';
import { extractSteps } from './stepExtractor';
import { detectAnomalies } from './detector';
import { aggregateAnomalies, rankAnomalies } from './aggregator';
```

**File reading pattern** (from RESEARCH.md Pattern 5):
```typescript
const bytes = await vscode.workspace.fs.readFile(uri);
const content = Buffer.from(bytes).toString('utf-8');
```

**Folder exclusion pattern** for per-phase subfolders:
```typescript
const PHASE_SUBFOLDER = /_(Precondition|TestCase|PostCondition)$/;
```

**runBatch function skeleton** (orchestration pattern modeled after `commands.ts` async function):
```typescript
export async function runBatch(batchFolderUri: vscode.Uri): Promise<BatchResult> {
  const results: AnalysisResult[] = [];
  const errors: { testCase: string; error: string }[] = [];

  const entries = await vscode.workspace.fs.readDirectory(batchFolderUri);
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory) { continue; }
    if (PHASE_SUBFOLDER.test(name)) { continue; }

    const folderUri = vscode.Uri.joinPath(batchFolderUri, name);
    try {
      const result = await analyzeTestCase(folderUri, name);
      results.push(result);
    } catch (err) {
      errors.push({ testCase: name, error: String(err) });
    }
  }
  return { results, errors };
}

async function analyzeTestCase(folderUri: vscode.Uri, testCase: string): Promise<AnalysisResult> {
  // Discover log + feature files at folder root (not in subfolders)
  const entries = await vscode.workspace.fs.readDirectory(folderUri);
  const logEntry = entries.find(([n, t]) => t === vscode.FileType.File && /_.+\.log$/.test(n));
  const featureEntry = entries.find(([n, t]) => t === vscode.FileType.File && n.endsWith('.feature'));
  if (!logEntry || !featureEntry) {
    throw new Error(`Missing log or feature file in ${testCase}`);
  }

  const logBytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folderUri, logEntry[0]));
  const featureBytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folderUri, featureEntry[0]));
  const logContent = Buffer.from(logBytes).toString('utf-8');
  const featureContent = Buffer.from(featureBytes).toString('utf-8');

  const events = parseLog(logContent);
  const stepPhaseMap = parseFeature(featureContent);
  const stepContexts = extractSteps(events, stepPhaseMap);
  const anomalies = detectAnomalies(events, stepContexts);
  const aggregated = aggregateAnomalies(anomalies);
  const ranked = rankAnomalies(aggregated);

  return { testCase, anomalies: ranked };
}
```

---

### `src/extension/commands.ts` (controller, request-response) — UPDATE

**Analog:** `src/extension/commands.ts` (current — lines 1–21)

**File header / import pattern** (lines 1–2 — extend, do not replace):
```typescript
// src/extension/commands.ts
import * as vscode from 'vscode';
import { createOrShowWebviewPanel } from '../ui/webview';
import { runBatch } from '../core/engine';
```

**Updated runAnalysis pattern** (replace lines 9–11 with folder-picker + engine delegation):
```typescript
export async function runAnalysis(): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Select BatchRun Folder',
  });
  if (!uris || uris.length === 0) { return; }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'LogAutopsy: Analyzing...' },
    async () => {
      const batchResult = await runBatch(uris[0]);
      // Phase 3: pass batchResult to UI; for now surface summary
      const total = batchResult.results.reduce((n, r) => n + r.anomalies.length, 0);
      vscode.window.showInformationMessage(
        `LogAutopsy: ${batchResult.results.length} test case(s) analyzed, ${total} anomaly group(s) found.`
      );
    }
  );
}
```

**openWebview function** (lines 17–21 — preserve exactly):
```typescript
export function openWebview(context: vscode.ExtensionContext): void {
  createOrShowWebviewPanel(context);
}
```

---

### Test files (6 new files) — test, transform / batch

**Analog:** `test/suite/extension.test.ts` (lines 1–8)

**Test file header / suite pattern** (copy from `test/suite/extension.test.ts` lines 1–8):
```typescript
// test/suite/<module>.test.ts
import * as assert from 'assert';
// import the module under test:
import { parseLog } from '../../src/core/parser';   // adjust per file

suite('<ModuleName> tests', () => {
  test('placeholder — test infrastructure is wired', () => {
    assert.ok(true);
  });
});
```

**Unit test structure per module** — one `suite()` block per function, `test()` per edge case:
```typescript
suite('parseLog', () => {
  test('returns empty array for empty string', () => {
    assert.deepStrictEqual(parseLog(''), []);
  });

  test('parses a standard ERROR line', () => {
    const line = '2025-07-03 13:52:41,220 [14] ERROR AdapterXil.WebApiCalls|MethodException in WaitForTask:31 - Failed.';
    const events = parseLog(line);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].level, 'ERROR');
    assert.strictEqual(events[0].sourceClass, 'AdapterXil.WebApiCalls');
    assert.strictEqual(events[0].sourceMethod, 'WaitForTask');
    assert.strictEqual(events[0].exceptionType, 'MethodException');
  });

  test('continuation lines accumulate into raw including blank lines', () => {
    const content = '2025-07-03 13:52:41,220 [14] INFO Foo\\Bar:1 - msg\n  stack line\n\nnext content';
    const events = parseLog(content + '\n2025-07-03 13:52:41,221 [14] INFO Foo\\Bar:2 - msg2');
    assert.ok(events[0].raw.includes('\n  stack line\n\nnext content'));
  });
});
```

**Integration test pattern** (`test/suite/pipeline.test.ts`):
```typescript
import * as path from 'path';
import * as fs from 'fs';  // Node fs is OK in test files (not in src/core/)
// ...import pipeline functions...

suite('Pipeline integration', () => {
  test('full pipeline against example artifacts produces 7 AggregatedAnomalies', async () => {
    const examplesDir = path.resolve(__dirname, '../../../examples/BatchRun_250703_135229/WhenEnableBlockOfResponseDidForEcu_250703_135229');
    const logContent = fs.readFileSync(path.join(examplesDir, 'WhenEnableBlockOfResponseDidForEcu_250703_135229.log'), 'utf-8');
    const featureContent = fs.readFileSync(path.join(examplesDir, 'WhenEnableBlockOfResponseDidForEcu.feature'), 'utf-8');

    const events = parseLog(logContent);
    const stepPhaseMap = parseFeature(featureContent);
    const stepContexts = extractSteps(events, stepPhaseMap);
    const anomalies = detectAnomalies(events, stepContexts);
    const aggregated = aggregateAnomalies(anomalies);
    const ranked = rankAnomalies(aggregated);

    assert.strictEqual(ranked.length, 7);
    assert.strictEqual(ranked[0].step, 'StartCarBusTrace');     // PRIMARY
    assert.strictEqual(ranked[0].phase, 'Precondition');
    assert.strictEqual(ranked[0].occurrences, 3);
  });
});
```

---

## Shared Patterns

### No-vscode Boundary (D-02)
**Source:** All existing `src/core/` files (lines 1–2 of each)
**Apply to:** `parser.ts`, `featureParser.ts`, `stepExtractor.ts`, `detector.ts`, `aggregator.ts`
```typescript
// src/core/<module>.ts
// NO vscode imports — pure TypeScript (D-02)
```
`engine.ts` is the sole exception — it imports `vscode` for `workspace.fs` calls only, never `vscode.window`.

### Import-from-types Pattern
**Source:** `src/core/parser.ts` line 3, `src/core/aggregator.ts` line 4, `src/core/detector.ts` line 3
**Apply to:** All `src/core/` files
```typescript
import type { LogEvent } from '../types';        // always use 'import type' for interface-only imports
```

### Error Isolation (Batch)
**Source:** CONTEXT.md discretion item — collect-and-surface
**Apply to:** `engine.ts` `runBatch()`
```typescript
try {
  const result = await analyzeTestCase(folderUri, name);
  results.push(result);
} catch (err) {
  errors.push({ testCase: name, error: String(err) });
}
```
Never let one failed test case throw out of `runBatch`. Always return `{ results, errors }`.

### Node crypto SHA-256
**Source:** `src/core/aggregator.ts` lines 3, 17–19
**Apply to:** `aggregator.ts` only (single source of truth for hashing)
```typescript
import { createHash } from 'crypto';
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

### vscode.workspace.fs File Read
**Source:** RESEARCH.md Pattern 5; `src/extension/commands.ts` for async pattern
**Apply to:** `engine.ts` only
```typescript
const bytes = await vscode.workspace.fs.readFile(uri);
const content = Buffer.from(bytes).toString('utf-8');
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/core/featureParser.ts` | service | transform | Only partial analog in `parser.ts`; Gherkin AST API has no existing usage in codebase. Use RESEARCH.md Pattern 2 and 4 as primary reference. |
| `src/core/stepExtractor.ts` | service | transform | No existing marker-scanning pattern in codebase. Use RESEARCH.md Pattern 3 and the exact step-start format from Code Examples as primary reference. |

---

## Metadata

**Analog search scope:** `src/`, `test/`
**Files scanned:** 8 source files, 1 test file
**Pattern extraction date:** 2026-04-20
**Key constraint:** All `src/core/` files must have zero `vscode` imports (D-02). `engine.ts` is the sole exception. Test files may use Node.js `fs` (not subject to D-02).
