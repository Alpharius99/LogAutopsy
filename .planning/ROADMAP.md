# Roadmap: LogAutopsy

## Overview

LogAutopsy ships in six phases aligned to the technical dependency chain. Phase 1 establishes a working VS Code extension dev loop with no features. Phase 2 builds the full deterministic parsing and anomaly-ranking pipeline -- the correctness foundation analysts will trust. Phases 3 and 4 deliver the analyst-facing UI (TreeView, detail webview, graceful degradation without AI). Phase 5 introduces Continue integration behind an interface, treated as a spike-first unknown. Phase 6 assembles the GitLab issue content that closes the analyst workflow. Phases 1-4 (plus Phase 6) have no AI dependency and ship regardless of Continue availability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Scaffold** - Extension skeleton with working dev loop, esbuild pipeline, and CSP-correct webview (completed 2026-04-19)
- [ ] **Phase 2: Parsing Pipeline** - Full deterministic log parsing, anomaly detection, and ranking -- validated against real example artifacts
- [ ] **Phase 3: Results UI** - TreeView sidebar and detail webview showing ranked anomalies with step and phase context
- [ ] **Phase 4: Symbol Resolution** - Deterministic C# source location with graceful fallback when unavailable
- [ ] **Phase 5: Continue Integration** - AI root cause hypothesis and fix suggestion via Continue extension spike + implementation
- [ ] **Phase 6: GitLab Content** - Assembled issue title and Markdown description ready for analyst copy

## Phase Details

### Phase 1: Scaffold
**Goal**: Analyst (or developer) can load the extension in Extension Development Host with a working dev loop, esbuild bundle, and a CSP-correct empty webview
**Depends on**: Nothing (first phase)
**Requirements**: None (infrastructure phase -- unblocks all subsequent work)
**Success Criteria** (what must be TRUE):
  1. `npm run watch` compiles and rebuilds on save without errors
  2. Extension activates in Extension Development Host with no console errors and a registered "Run Analysis" command visible in the command palette
  3. Opening the empty webview produces no CSP violations in the developer console
  4. `npm test` runs and exits cleanly (even with zero test cases)
**Plans**: 2 plans
Plans:
- [x] 01-01-PLAN.md -- Build infrastructure: package.json, tsconfig, esbuild, test config, npm install
- [x] 01-02-PLAN.md -- Source stubs: types, core, extension, UI, test, compile and verify

### Phase 2: Parsing Pipeline
**Goal**: Given a real BatchRun folder, the tool produces a ranked anomaly list -- validated for correctness against the production example artifacts in `examples/`
**Depends on**: Phase 1
**Requirements**: LOAD-01, LOAD-02, PARSE-01, PARSE-02, PARSE-03, DETECT-01, DETECT-02, DETECT-03
**Success Criteria** (what must be TRUE):
  1. User can select a BatchRun folder; the tool discovers all test case subfolders and processes each independently
  2. Every ERROR-level event in the example log is captured with correct timestamp, class, method, exception type, message, and stack trace continuation lines -- zero missed errors
  3. Every Gherkin step boundary is extracted from GherkinExecutor markers and correlated to the correct step name and phase (Precondition / TestCase / PostCondition)
  4. Identical errors within the same step are grouped into a single aggregated entry
  5. The ranked output labels the earliest anomaly "Primary root cause" and subsequent anomalies "Secondary effect"
**Plans**: 5 plans
Plans:
- [ ] 02-01-PLAN.md -- Install Cucumber deps, rewrite types.ts to spec §5 shape, create 6 test stubs
- [ ] 02-02-PLAN.md -- Implement parser.ts (parseLog) and featureParser.ts (parseFeature) with unit tests
- [ ] 02-03-PLAN.md -- Create stepExtractor.ts (extractSteps) with unit tests
- [ ] 02-04-PLAN.md -- Implement detector.ts (detectAnomalies) and aggregator.ts (aggregateAnomalies + rankAnomalies) with unit tests
- [ ] 02-05-PLAN.md -- Create engine.ts (runBatch), update commands.ts, integration test and human verification

### Phase 3: Results UI
**Goal**: Analyst can see ranked anomalies in the VS Code sidebar and open a detail webview for any anomaly -- using Phase 2 data, no AI required
**Depends on**: Phase 2
**Requirements**: RESULTS-01, RESULTS-02, RESULTS-03, DETAIL-01
**Success Criteria** (what must be TRUE):
  1. VS Code sidebar TreeView shows the ranked anomaly list with "Primary" / "Secondary effect" labels visible without expanding any node
  2. Each anomaly entry in the tree shows the Gherkin step name, phase label, and error message or first stack frame
  3. Selecting an anomaly in the TreeView opens a detail webview showing the full error message and complete stack trace
  4. Webview renders without CSP violations; single-panel reuse works (selecting a second anomaly replaces, not adds, a panel)
**Plans**: TBD
**UI hint**: yes

### Phase 4: Symbol Resolution
**Goal**: For the primary anomaly, the detail view shows the resolved C# source file and method location -- and shows a clear "source unavailable" indicator when resolution fails, never a broken state
**Depends on**: Phase 3
**Requirements**: AI-01, AI-03
**Success Criteria** (what must be TRUE):
  1. The detail view resolves the primary anomaly's class and method to a C# source file in the open workspace using the workspace symbol provider (with retry on indexing delay)
  2. When symbol resolution succeeds, the resolved file path and method context are shown in the detail view
  3. When symbol resolution fails or the workspace symbol provider returns nothing, the detail view shows a clear "source unavailable" indicator -- the view is never blank or broken
  4. Phase 2 analysis and TreeView function correctly when symbol resolution is unavailable (graceful degradation confirmed)
**Plans**: TBD

### Phase 5: Continue Integration
**Goal**: For the primary anomaly, the detail view shows an AI-generated root cause hypothesis and fix suggestion from Continue -- with graceful fallback when Continue is offline or its API differs from expectations
**Depends on**: Phase 4
**Requirements**: AI-02, DETAIL-02, DETAIL-03
**Success Criteria** (what must be TRUE):
  1. A discovery spike documents the actual `vscode.extensions.getExtension('Continue.continue')?.exports` surface against the team's installation -- command names, request shape, and response shape are confirmed empirically before implementation
  2. The detail view shows an AI-generated hypothesis structured as cause / mechanism / trigger, with a visible confidence score
  3. The detail view shows an AI-generated fix suggestion as a C# code snippet with a "verify before applying" advisory note
  4. When Continue is offline or its exports are unavailable, the detail view shows a clear "AI analysis unavailable" indicator -- Phases 1-4 functionality is unaffected
**Plans**: TBD

### Phase 6: GitLab Content
**Goal**: Analyst can read a fully assembled GitLab issue title and Markdown description in the detail view -- ready to copy and submit manually, with no automatic submission
**Depends on**: Phase 3
**Requirements**: GITLAB-01, GITLAB-02
**Success Criteria** (what must be TRUE):
  1. The detail view presents a complete GitLab issue title derived from the primary anomaly
  2. The detail view presents a complete Markdown description including anomaly details, step context, phase classification, root cause hypothesis (or placeholder when AI is unavailable), fix suggestion, and evidence block
  3. The assembled content is available for manual copy -- no automatic submission occurs, no GitLab API call is made
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6
Note: Phase 6 depends on Phase 3 (not Phase 5) -- GitLab content assembly does not require AI output.

| Phase                   | Plans Complete | Status      | Completed |
|-------------------------|----------------|-------------|-----------|
| 1. Scaffold             | 2/2 | Complete   | 2026-04-19 |
| 2. Parsing Pipeline     | 0/5            | Not started | -         |
| 3. Results UI           | 0/?            | Not started | -         |
| 4. Symbol Resolution    | 0/?            | Not started | -         |
| 5. Continue Integration | 0/?            | Not started | -         |
| 6. GitLab Content       | 0/?            | Not started | -         |
