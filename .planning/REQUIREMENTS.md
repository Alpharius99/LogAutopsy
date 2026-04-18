# Requirements — LogAutopsy

## v1 Requirements

### LOAD — Artifact Loading

- [ ] **LOAD-01**: User can select a BatchRun folder from disk to load test artifacts for analysis
- [ ] **LOAD-02**: Tool discovers all test case subfolders in the batch and analyzes each independently (combined log + feature file per test case)

### PARSE — Log and Feature File Parsing

- [ ] **PARSE-01**: Tool parses combined log files in log4net format (up to 10,000 lines), producing structured `LogEvent` records including timestamp, thread, level, source class/method, exception type, message, and stack trace continuation lines
- [ ] **PARSE-02**: Tool parses Gherkin `.feature` files to build a step-to-phase mapping (Precondition / TestCase / PostCondition) based on scenario names
- [ ] **PARSE-03**: Tool extracts step boundaries from `GherkinExecutor` markers in the log and correlates each step with its Gherkin definition and phase

### DETECT — Anomaly Detection and Ranking

- [ ] **DETECT-01**: Tool detects all ERROR-level log events and associates each with the step context in which it occurred (step name, phase, line range)
- [ ] **DETECT-02**: Tool aggregates identical errors within the same step into a single grouped entry
- [ ] **DETECT-03**: Tool ranks anomaly groups by first occurrence timestamp — earliest labeled "Primary root cause", later ones labeled "Secondary effect"

### RESULTS — Sidebar Results View

- [ ] **RESULTS-01**: VS Code sidebar TreeView displays ranked anomaly list with "Primary" / "Secondary effect" labels visible at a glance
- [ ] **RESULTS-02**: Each anomaly entry in the tree shows the Gherkin step name and phase (Precondition / TestCase / PostCondition)
- [ ] **RESULTS-03**: Each anomaly entry shows the error message and stack trace (or first stack frame if multi-line)

### DETAIL — Anomaly Detail View

- [ ] **DETAIL-01**: Selecting an anomaly opens a detail webview showing the full error message and complete stack trace
- [ ] **DETAIL-02**: Detail view shows AI-generated root cause hypothesis structured as cause / mechanism / trigger (from Continue via Phase 2)
- [ ] **DETAIL-03**: Detail view shows AI-generated fix suggestion as a C# code snippet with a "verify before applying" advisory note

### AI — Phase 2 Root Cause Analysis

- [ ] **AI-01**: Tool resolves the primary anomaly's source class and method to a C# file in the open VS Code workspace using the workspace symbol provider
- [ ] **AI-02**: Tool extracts the resolved method body and sends structured context (error, step, phase, code) to Continue for root cause analysis
- [ ] **AI-03**: If Continue is unavailable or symbol resolution fails, tool still shows the detail view with error context and a clear "AI analysis unavailable" indicator — never a blank or broken state

### GITLAB — Issue Content Assembly

- [ ] **GITLAB-01**: Tool assembles a complete GitLab issue title and Markdown description from the analysis result (anomaly details, hypothesis, fix suggestion, evidence block)
- [ ] **GITLAB-02**: Assembled issue content is presented in the detail view for analyst review and manual copy — no automatic submission in v1

---

## v2 Requirements (Deferred)

- ZIP archive loading — useful for artifacts delivered as archives; folder selection covers current workflow
- GitLab issue creation via REST API — core assembly is v1; API creation adds PAT management and confirmation flow
- Click-to-navigate: open resolved C# source file at the right line in VS Code editor
- Occurrence count display in sidebar — deferred; step+phase context is sufficient for v1 judgment
- Aggregation key normalization — deferred until real-world data reveals which dynamic values cause false splits
- Secondary effects list in GitLab issue template — depends on GitLab API integration (v2)

---

## Out of Scope

- **Auto-applying fix suggestions** — extension is read-only; all suggestions are advisory
- **Per-phase subfolder log parsing** — only the combined log at the test case root is analyzed; subfolder logs are redundant subsets
- **WARN-level anomaly detection** — this log format uses WARN for verbose adapter output; WARN events would flood the list with noise
- **Caching between sessions** — stateless per run; log files are the source of truth
- **Batch issue creation** — each issue requires explicit analyst review; batch submit creates unreviewed noise
- **GitLab issue deduplication** — analyst checks for existing issues manually; deduplication logic adds complexity with limited gain for a 2–10 person team
- **ZIP archive loading (v1)** — folder selection covers the primary workflow

---

## Traceability

<!-- Filled by roadmap after phase mapping -->

| REQ-ID | Phase |
|--------|-------|
| LOAD-01, LOAD-02 | — |
| PARSE-01, PARSE-02, PARSE-03 | — |
| DETECT-01, DETECT-02, DETECT-03 | — |
| RESULTS-01, RESULTS-02, RESULTS-03 | — |
| DETAIL-01, DETAIL-02, DETAIL-03 | — |
| AI-01, AI-02, AI-03 | — |
| GITLAB-01, GITLAB-02 | — |
