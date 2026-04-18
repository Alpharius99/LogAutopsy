# Test Automation Diagnostic Agent — Implementation Specification v2

## 1. Overview

A VS Code extension that analyzes automated test artifacts (log files + Gherkin feature files) to identify root causes of test failures. The system operates in two phases:

- **Phase 1 — Deterministic Analysis:** Parse logs, detect anomalies, extract step context, aggregate findings.
- **Phase 2 — Root Cause Analysis (AI-assisted):** Resolve anomalies to source code in the open workspace, generate hypotheses and fix suggestions via an AI backend (Continue).

The system is **stateless per run** — no caching or persistence between analysis sessions.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│ VS Code Extension (Control Plane)                        │
│                                                          │
│  ┌─────────┐   ┌──────────────┐   ┌───────────────────┐ │
│  │ Sidebar  │──▶│ Local Engine  │──▶│ Results Webview   │ │
│  │ (UI)     │   │ (TypeScript)  │   │                   │ │
│  └─────────┘   └──────┬───────┘   └───────────────────┘ │
│                       │                                   │
│            ┌──────────┴──────────┐                        │
│            ▼                     ▼                        │
│   ┌────────────────┐   ┌─────────────────┐               │
│   │ Continue (AI)  │   │ GitLab REST API │               │
│   │ via Extension  │   │ (PAT auth)      │               │
│   │ API            │   │                 │               │
│   └────────────────┘   └─────────────────┘               │
└──────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component              | Technology                          | Responsibility                                                  |
|------------------------|-------------------------------------|-----------------------------------------------------------------|
| **Sidebar**            | VS Code TreeView                    | Load artifacts, trigger analysis, review results, create issues |
| **Local Engine**       | TypeScript (runs in extension host) | Log parsing, anomaly detection, step extraction, aggregation    |
| **Continue**           | Continue extension API              | Root cause hypothesis generation (Phase 2)                      |
| **GitLab Integration** | REST API + Personal Access Token    | Manual issue creation from analysis results                     |

---

## 3. Artifact Structure

### Input Format

A ZIP archive or folder with the following structure:

```
BatchRun_YYMMDD_HHMMSS/
  <TestName>_YYMMDD_HHMMSS/
    YYMMDD_HHMMSS_Precondition/
      YYMMDD_HHMMSS_Precondition.log          ← per-phase log (NOT parsed)
    YYMMDD_HHMMSS_TestCase/
      YYMMDD_HHMMSS_TestCase.log              ← per-phase log (NOT parsed)
    YYMMDD_HHMMSS_PostCondition/
      YYMMDD_HHMMSS_PostCondition.log         ← per-phase log (NOT parsed)
    <TestName>.feature                         ← Gherkin feature file (IN SCOPE)
    <TestName>_YYMMDD_HHMMSS.log              ← combined log (PRIMARY INPUT)
    <TestName>_YYMMDD_HHMMSS.html             ← HTML report (OUT OF SCOPE)
    appsettings.json                           ← configuration (OUT OF SCOPE)
```

### Discovery Rules

1. A batch run folder may contain **multiple test case folders**.
2. Each test case folder contains exactly **one combined log file** (filename matches `*_YYMMDD_HHMMSS.log` at root of test folder).
3. Each test case folder contains exactly **one `.feature` file**.
4. Per-phase subfolder logs and all other files are **ignored** by the engine.

### Scale Constraints

- One combined log file per test run, up to **10,000 lines**.
- Batch may contain multiple test runs (each analyzed independently).

---

## 4. Log Format Specification

### Pattern (log4net)

Every log line starts with a fixed-format prefix. Lines that do **not** match the prefix pattern are **continuation lines** belonging to the preceding log entry (e.g., stack traces, multi-line settings dumps).

#### Standard Line

```
YYYY-MM-DD HH:MM:SS,mmm [THREAD] LEVEL  ClassName\MethodName:SourceLine - Message
```

Example:
```
2025-07-03 13:52:29,433 [14] INFO  ConnectorFacade\.ctor:18 - Creating the connectors...
```

#### Exception Line

```
YYYY-MM-DD HH:MM:SS,mmm [THREAD] LEVEL ClassName.SubClass|ExceptionType in MethodName:SourceLine - Message
```

Example:
```
2025-07-03 13:52:41,220 [14] ERROR AdapterXil.WebApiCalls|MethodException in WaitForTask:31 - Failed with the message 'width=device-width, initial-scale=1'.
```

#### Continuation Line (Stack Trace / Multi-line Output)

Any line that does **not** start with a timestamp (`YYYY-MM-DD`) is appended to the previous `LogEvent` as part of its `raw` content and, if applicable, its `stacktrace` field.

```
DevelopMode: True
Vendor name: Vector
Product name: CANoe64
```

### Regex for Line Parsing

```typescript
// Matches the start of a new log entry
const LOG_LINE_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\d+)\] (\w+)\s+(.+)$/;

// Parses the source reference from group 4 (after level)
// Standard:  ClassName\MethodName:Line - Message
const STANDARD_SOURCE = /^(\S+?)\\(\w+):(\d+) - (.*)$/;

// Exception: ClassName.SubClass|ExceptionType in MethodName:Line - Message
const EXCEPTION_SOURCE = /^(\S+?)\|(\w+) in (\w+):(\d+) - (.*)$/;
```

### Parsed Fields

| Field           | Standard Line                        | Exception Line                  |
|-----------------|--------------------------------------|---------------------------------|
| `timestamp`     | `YYYY-MM-DD HH:MM:SS,mmm`            | same                            |
| `thread`        | `[14]` → `14`                        | same                            |
| `level`         | `DEBUG`, `INFO`, `WARN`, `ERROR`     | same                            |
| `sourceClass`   | `ConnectorFacade`                    | `AdapterXil.WebApiCalls`        |
| `sourceMethod`  | `.ctor`                              | `WaitForTask`                   |
| `sourceLine`    | `18`                                 | `31`                            |
| `exceptionType` | _(not present)_                      | `MethodException`               |
| `message`       | `Creating the connectors...`         | `Failed with the message '...'` |
| `raw`           | Full line(s) including continuations | same                            |

---

## 5. Data Contracts (TypeScript)

### LogEvent

```typescript
export interface LogEvent {
  /** Raw timestamp string from log */
  timestamp: string;
  /** Thread ID */
  thread: number;
  /** Log level */
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  /** Fully qualified class name (e.g. "AdapterXil.WebApiCalls") */
  sourceClass: string;
  /** Method name (e.g. "WaitForTask") */
  sourceMethod: string;
  /** Source line number */
  sourceLine: number;
  /** Exception type if present (e.g. "MethodException"), otherwise undefined */
  exceptionType?: string;
  /** Parsed message text (after " - ") */
  message: string;
  /** Full raw text including continuation lines */
  raw: string;
  /** Line number in the log file (1-based) */
  fileLineNumber: number;
}
```

### GherkinStep

```typescript
export interface GherkinStep {
  /** Step name as it appears in the log (e.g. "StartCarBusTrace") */
  name: string;
  /** Gherkin keyword (When, And, Then) */
  keyword: string;
  /** Keyword type (Action, Conjunction, Outcome) */
  keywordType: 'Action' | 'Conjunction' | 'Outcome';
  /** Location reference from the feature file (e.g. "9:4") */
  location: string;
  /** Step argument if present, otherwise empty string */
  argument: string;
}
```

### StepContext

```typescript
export interface StepContext {
  /** Parsed Gherkin step information */
  step: GherkinStep;
  /** Phase derived from feature file scenario mapping */
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
  /** Log file line number where this step starts (line of "Next test step") */
  startLine: number;
  /** Log file line number where this step ends (line before next step, or EOF) */
  endLine: number;
  /** Step execution result (e.g. "Pass", "TestRunError") — from result line */
  result?: string;
  /** Whether KeywordTranslator reported this step as failed */
  failedByKeywordTranslator: boolean;
}
```

### Anomaly

```typescript
export interface Anomaly {
  /** Generated UUID */
  id: string;
  /** Always 'ERROR' (only ERROR level is detected) */
  type: 'ERROR';
  /** Parsed message from the log event */
  message: string;
  /** Stack trace if continuation lines follow the error (undefined otherwise) */
  stacktrace?: string;
  /** Name of the step this anomaly occurred in */
  step: string;
  /** Phase the step belongs to */
  phase: StepContext['phase'];
  /** Log file path (combined log) */
  file: string;
  /** Line number in the log file */
  line: number;
  /** Source class from the log event */
  sourceClass: string;
  /** Source method from the log event */
  sourceMethod: string;
  /** Source line from the log event */
  sourceLine: number;
  /** Exception type if present (e.g. "MethodException") */
  exceptionType?: string;
  /** Timestamp from the log event */
  timestamp: string;
}
```

### AggregatedAnomaly

```typescript
export interface AggregatedAnomaly {
  /** Deterministic key: hash of (type + normalizedMessage + topStackFrame + step) */
  key: string;
  /** Always 'ERROR' */
  type: 'ERROR';
  /** Representative message (from first occurrence) */
  message: string;
  /** Step name where anomalies occurred */
  step: string;
  /** Phase the step belongs to */
  phase: StepContext['phase'];
  /** Number of individual anomalies in this group */
  occurrences: number;
  /** First occurrence details */
  firstOccurrence: {
    file: string;
    line: number;
    timestamp: string;
  };
  /** Stack trace from first occurrence (if any) */
  stacktrace?: string;
  /** Source hint for Phase 2 resolution */
  sourceHint: {
    class: string;
    method: string;
    line: number;
  };
}
```

### CodeCandidate

```typescript
export interface CodeCandidate {
  /** Absolute file path in the workspace */
  filePath: string;
  /** C# class name */
  className: string;
  /** C# method name */
  methodName: string;
  /** Start line of the method in source */
  startLine: number;
  /** End line of the method in source */
  endLine: number;
  /** Confidence score (0.0 – 1.0) */
  confidence: number;
}
```

### RootCauseAnalysis

```typescript
export interface RootCauseAnalysis {
  /** References AggregatedAnomaly.key */
  anomalyKey: string;
  /** Best matching code target (if resolved) */
  resolvedTarget?: {
    className: string;
    methodName: string;
    filePath: string;
    confidence: number;
  };
  /** Natural language root cause summary */
  rootCause: string;
  /** Structured hypothesis */
  hypothesis: {
    cause: string;
    mechanism: string;
    trigger: string;
  };
  /** Suggested code fix (C# snippet) */
  fixSuggestion: string;
  /** Overall confidence (0.0 – 1.0) */
  confidence: number;
  /** Other anomalies likely caused by the same root issue */
  secondaryEffects: string[];
}
```

### IssueCandidate

```typescript
export interface IssueCandidate {
  /** GitLab issue title */
  title: string;
  /** GitLab issue description (Markdown) */
  description: string;
  /** Associated root cause analysis */
  rootCause: RootCauseAnalysis;
  /** All aggregated anomalies contributing to this issue */
  anomalies: AggregatedAnomaly[];
  /** Confidence score */
  confidence: number;
}
```

---

## 6. Phase 1 — Deterministic Analysis

Phase 1 is a pure TypeScript pipeline with no AI calls. It takes the combined log file and the feature file as input and produces a list of `AggregatedAnomaly` records.

### 6.1 Pipeline Overview

```
Combined Log File ──▶ [Parse] ──▶ LogEvent[]
                                      │
Feature File ──▶ [Map Scenarios] ─────┤
                                      ▼
                                [Extract Steps] ──▶ StepContext[]
                                      │
                                      ▼
                                [Detect Anomalies] ──▶ Anomaly[]
                                      │
                                      ▼
                                [Aggregate] ──▶ AggregatedAnomaly[]
```

### 6.2 Log Parsing

**Input:** Combined log file (the `*_YYMMDD_HHMMSS.log` at the test case root).

**Rules:**

1. Read the file line by line.
2. Skip header/footer markers: lines matching `[Begin of ...` or `[End of ...`.
3. For each line, attempt to match `LOG_LINE_PATTERN`.
   - **Match:** Create a new `LogEvent`. Try `EXCEPTION_SOURCE` first; if no match, try `STANDARD_SOURCE`.
   - **No match:** Append the line to the previous `LogEvent.raw`. If the previous event has `level == 'ERROR'`, also append to its `stacktrace` field (creating the field if it doesn't exist).
4. Record `fileLineNumber` (1-based) for each new `LogEvent`.

**Output:** `LogEvent[]`

### 6.3 Phase Determination

Phases are determined by correlating step names from the log with scenario definitions in the `.feature` file.

**Rules:**

1. Parse the `.feature` file to extract scenario names and their steps.
2. Map each `Scenario:` block to a phase by its name:
   - Scenario name is `"Precondition"` → `phase = 'Precondition'`
   - Scenario name is `"PostCondition"` → `phase = 'PostCondition'`
   - All other scenario names → `phase = 'TestCase'`
3. Build a lookup: `stepName → phase` based on the scenario each step belongs to.
4. When a step appears in multiple scenarios (e.g., `TurnOnClamp15` in both Precondition and PostCondition), resolve by **order of appearance in the log** — the first occurrence maps to the first matching scenario, the second to the next, etc.

### 6.4 Step Extraction

**Marker Lines (all from `GherkinExecutor`):**

| Marker            | Pattern                                                                                                                     | Purpose                         |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------|---------------------------------|
| **Step Start**    | `ExecuteStep:187 - Next test step '{name}' (location '{loc}', keyword '{kw} ', keyword type '{kwType}', argument '{arg}').` | Opens a new StepContext         |
| **Step Resolved** | `ExecuteStep:217 - Got test step: '{name}'.`                                                                                | Confirms step binding           |
| **Step Result**   | `ExecuteStep:221 - Result of test step '{result}'.`                                                                         | Records step outcome            |
| **Phase Result**  | `ExecuteScenario:172 - Test step result after re-evaluation is '{result}'.`                                                 | Records cumulative phase result |

**Step Failure Metadata (from `KeywordTranslator`):**

| Marker            | Pattern                                                                      | Purpose                                  |
|-------------------|------------------------------------------------------------------------------|------------------------------------------|
| **Action failed** | `KeywordTranslator\ExecuteTestStep:51 - The test action '{name}' is failed.` | Marks `failedByKeywordTranslator = true` |
| **Check failed**  | `KeywordTranslator\ExecuteTestStep:34 - The test check '{name}' is failed.`  | Marks `failedByKeywordTranslator = true` |

**Rules:**

1. Scan `LogEvent[]` for **Step Start** markers.
2. Parse `name`, `location`, `keyword`, `keywordType`, and `argument` from the marker message.
3. A `StepContext` begins at the **Step Start** line and ends at the line **before** the next Step Start (or at the last line of the file).
4. Assign `phase` using the lookup from §6.3.
5. Set `result` from the **Step Result** marker within this step's line range.
6. Set `failedByKeywordTranslator` if a matching **KeywordTranslator** failure marker exists within this step's line range.

**Output:** `StepContext[]`

### 6.5 Anomaly Detection

**Detection Rule:** A `LogEvent` is an anomaly if `level == 'ERROR'`.

_(WARN-level lines are not anomalies. The `message contains "Exception"` rule from v1 is subsumed by the ERROR level check, since all exception lines in this log format use ERROR level.)_

**Rules:**

1. Iterate over `LogEvent[]`.
2. For each event where `level == 'ERROR'`:
   - Find the `StepContext` whose `[startLine, endLine]` range contains this event's `fileLineNumber`.
   - Create an `Anomaly` record with all fields populated from the `LogEvent` and `StepContext`.
3. If an ERROR event falls outside any step range (e.g., during initialization), assign `step = '_init_'` and `phase = 'Precondition'`.

**Output:** `Anomaly[]`

### 6.6 Aggregation

**Aggregation Key:** `type + normalizedMessage + topStackFrame + step`

Where:
- `normalizedMessage` = `message` as-is (no normalization in v2 — to be revisited if dynamic content causes grouping issues).
- `topStackFrame` = first line of `stacktrace` if present, otherwise `sourceClass + "." + sourceMethod`.

**Rules:**

1. Group `Anomaly[]` by the aggregation key.
2. For each group, produce one `AggregatedAnomaly`:
   - `key` = SHA-256 hash of the aggregation key string.
   - `occurrences` = count of anomalies in the group.
   - `firstOccurrence` = the anomaly with the earliest `timestamp`.
   - `stacktrace` = from the first occurrence.
   - `sourceHint` = from the first occurrence's `sourceClass`, `sourceMethod`, `sourceLine`.

**Output:** `AggregatedAnomaly[]`

---

## 7. Phase 2 — Root Cause Analysis

Phase 2 takes the output of Phase 1 and enriches it with code-level context from the open workspace and AI-generated hypotheses.

### 7.1 Pipeline Overview

```
AggregatedAnomaly[] ──▶ [Select Primary] ──▶ AggregatedAnomaly (earliest)
                                                     │
                                                     ▼
                                            [Symbol Resolution]
                                            (VS Code workspace search)
                                                     │
                                                     ▼
                                            CodeCandidate[]
                                                     │
                                                     ▼
                                            [Extract Code Snippet]
                                                     │
                                                     ▼
                                            [AI Analysis via Continue]
                                                     │
                                                     ▼
                                            RootCauseAnalysis
```

### 7.2 Primary Anomaly Selection

1. Sort `AggregatedAnomaly[]` by `firstOccurrence.timestamp` (ascending).
2. Select the **earliest** anomaly as the primary.
3. All later anomalies with different keys are candidates for `secondaryEffects` (likely downstream consequences).

### 7.3 Symbol Resolution

**Goal:** Find the C# source file and method in the open VS Code workspace that corresponds to `sourceHint.class` + `sourceHint.method`.

**Strategy:**

1. Use the VS Code workspace symbol search API (`vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)`).
2. Search for `sourceHint.class` (class-level match).
3. Within matching files, search for `sourceHint.method` (method-level match).
4. **Ranking** (confidence assignment):
   - Exact class name match + exact method name match → `confidence = 1.0`
   - Partial class match (e.g., class name without namespace matches) + exact method → `confidence = 0.7`
   - Only method name matches → `confidence = 0.3`
5. If multiple candidates exist, return all sorted by confidence descending.
6. **No namespace available** in logs (known limitation) — matching is done on the **simple class name** only.

**Output:** `CodeCandidate[]`

### 7.4 Code Snippet Extraction

For the top-ranked `CodeCandidate`:

1. Read the source file.
2. Extract the method body from `startLine` to `endLine`.
3. This becomes the `code_context.code` field sent to Continue.

The snippet should be the **method body only** — not the entire file.

### 7.5 Continue Integration

#### Request Payload

```json
{
  "task": "root_cause_analysis",
  "exception_type": "<exceptionType or 'ERROR'>",
  "error_message": "<message>",
  "stacktrace": "<stacktrace or null>",
  "step": "<step name>",
  "phase": "<Precondition|TestCase|PostCondition>",
  "code_context": {
    "class": "<className>",
    "method": "<methodName>",
    "code": "<method body snippet>"
  }
}
```

#### Expected Response

```json
{
  "root_cause": "<natural language summary>",
  "hypothesis": {
    "cause": "<what failed>",
    "mechanism": "<how it failed>",
    "trigger": "<why it failed at this point>"
  },
  "fix_suggestion": "<C# code snippet>",
  "confidence": 0.0
}
```

#### Integration Mechanism

The exact mechanism for calling Continue is **abstracted** — the spec defines the request/response contract. The implementation may use Continue's extension API, a local HTTP endpoint, or VS Code command invocation. The choice is an implementation detail.

#### Fallback Behavior

If Continue is unavailable or returns an error, Phase 2 still produces a `RootCauseAnalysis` with:
- `rootCause` = `"AI analysis unavailable — manual review required"`
- `hypothesis` = populated with deterministic information only (source class, method, error message)
- `fixSuggestion` = `""`
- `confidence` = `0.0`
- `resolvedTarget` = best `CodeCandidate` (if symbol resolution succeeded)

This gives the user a **focused scope** (the right file and method) even without AI analysis.

---

## 8. GitLab Integration

### Authentication

Personal Access Token (PAT), configured in VS Code extension settings.

### Endpoint

```
POST /api/v4/projects/:id/issues
```

### Payload

```json
{
  "title": "<IssueCandidate.title>",
  "description": "<IssueCandidate.description>",
  "labels": ["test-failure", "automated-analysis"]
}
```

### Issue Description Template (Markdown)

```markdown
## Summary
<rootCause.rootCause>

## Failing Step
**Step:** <anomaly.step>
**Phase:** <anomaly.phase>
**Feature:** <feature file name>

## Root Cause
<rootCause.rootCause>

## Hypothesis
- **Cause:** <rootCause.hypothesis.cause>
- **Mechanism:** <rootCause.hypothesis.mechanism>
- **Trigger:** <rootCause.hypothesis.trigger>

## Suggested Fix
```csharp
<rootCause.fixSuggestion>
\```

## Evidence
- **Error:** <anomaly.message>
- **Source:** <anomaly.sourceHint.class>.<anomaly.sourceHint.method>:<anomaly.sourceHint.line>
- **First Occurrence:** <anomaly.firstOccurrence.timestamp>
- **Occurrences:** <anomaly.occurrences>
- **Stack Trace:**
\```
<anomaly.stacktrace>
\```

## Context
- **Confidence:** <rootCause.confidence>
- **Analysis Date:** <ISO timestamp>
- **Secondary Effects:** <rootCause.secondaryEffects or "None">
```

### User Flow

1. User reviews `IssueCandidate` in the results view.
2. User explicitly selects **"Create Issue"** for a specific candidate.
3. Extension shows a confirmation dialog with the title and description preview.
4. User confirms → POST to GitLab.
5. One issue per user action. No batch creation.

---

## 9. UI Design

### Sidebar (TreeView)

```
TEST ANALYSIS
├── 📂 Load Artifacts          → File picker (ZIP or folder)
├── ▶️  Run Analysis            → Triggers Phase 1 + Phase 2
├── 📊 Results                  → Expand to see aggregated anomalies
│   ├── ❌ [3x] MethodException in WaitForTask (Precondition / StartCarBusTrace)
│   │   ├── Source: AdapterXil.WebApiCalls.WaitForTask:31
│   │   ├── First: 13:52:41,220
│   │   └── ➡️  View Root Cause Analysis
│   └── ❌ [2x] ...
└── 🔗 Create Issue             → Per-anomaly action
```

### Results Detail (Webview Panel)

When the user selects an aggregated anomaly, a detail webview opens showing:
- Anomaly summary (type, message, occurrences, timestamps)
- Step context (step name, phase, keyword)
- Root cause analysis (hypothesis, fix suggestion, confidence)
- Code navigation link (click to open the resolved source file at the right line)
- "Create GitLab Issue" button

### Design Decision: Deferred

The exact visual design (colors, layout, component library) is deferred to implementation. The above defines the **information architecture** only.

---

## 10. Safety Constraints

| Constraint                      | Implementation                                                                                         |
|---------------------------------|--------------------------------------------------------------------------------------------------------|
| **No full repo exposure to AI** | Only the resolved method body is sent to Continue — never the full file or project.                    |
| **Manual issue creation**       | Each issue requires explicit user confirmation. No batch or automatic creation.                        |
| **Confidence visibility**       | Confidence scores are always shown to the user. All suggestions are advisory.                          |
| **Deterministic fallback**      | If AI is unavailable, Phase 2 still produces the focused scope (file + method) from symbol resolution. |
| **Read-only analysis**          | The extension never modifies source code, logs, or artifacts.                                          |

---

## 11. Known Limitations

| Limitation                          | Impact                                                                           | Mitigation                                                        |
|-------------------------------------|----------------------------------------------------------------------------------|-------------------------------------------------------------------|
| **No namespace in logs**            | Symbol resolution may return multiple candidates for common class names.         | Rank by confidence; user makes final decision.                    |
| **Suggestions are advisory**        | AI-generated hypotheses and fixes may be incorrect.                              | Always show confidence; require human review.                     |
| **Single-method context**           | AI only sees the resolved method body, not the full call chain.                  | Noted in the issue template as a limitation.                      |
| **No deduplication against GitLab** | Repeated runs may create duplicate issues.                                       | User is responsible for checking existing issues before creating. |
| **Aggregation key stability**       | Dynamic content in error messages (IDs, timestamps) may prevent proper grouping. | Deferred — to be revisited with real-world data diversity.        |

---

## 12. Open Items

| # | Topic                                                                   | Status | Notes                                                                    |
|---|-------------------------------------------------------------------------|--------|--------------------------------------------------------------------------|
| 1 | Confidence threshold for discarding low-quality `CodeCandidate` results | TBD    | Currently all candidates are returned.                                   |
| 2 | Message normalization for aggregation keys                              | TBD    | Currently using raw message. May need regex stripping of dynamic values. |
| 3 | Results view visual design                                              | TBD    | Information architecture defined; visual design deferred.                |
| 4 | GitLab issue deduplication                                              | TBD    | Currently no deduplication.                                              |

---

## 13. Glossary

| Term                   | Definition                                                                                     |
|------------------------|------------------------------------------------------------------------------------------------|
| **Artifact**           | The ZIP archive or folder containing test run output (logs, feature files).                    |
| **Combined Log**       | The single log file at the test case root containing all phases concatenated.                  |
| **Phase**              | A Gherkin scenario mapped to Precondition, TestCase, or PostCondition.                         |
| **Step**               | A single Gherkin step (When/And/Then) within a phase.                                          |
| **Anomaly**            | A single ERROR-level log event within a step context.                                          |
| **Aggregated Anomaly** | A group of identical anomalies (same error in the same step) collapsed into one record.        |
| **Primary Anomaly**    | The earliest aggregated anomaly — likely the root cause rather than a downstream effect.       |
| **Symbol Resolution**  | Mapping a class + method name from a log to the corresponding C# source file in the workspace. |
| **Continue**           | The AI coding assistant (VS Code extension) used as the AI backend for Phase 2.                |
