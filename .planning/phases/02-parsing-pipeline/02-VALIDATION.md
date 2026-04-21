---
phase: 2
slug: parsing-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Mocha 10.x via `@vscode/test-cli` |
| **Config file** | `.vscode-test.mjs` (Wave 0 installs) |
| **Quick run command** | `npm run compile-tests` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run compile-tests` (fast TypeScript type check — no Extension Development Host needed)
- **After every plan wave:** Run `npm test` (full suite including Extension Development Host)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | LOAD-01 | — | N/A | unit | `npm run compile-tests && npm test` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | LOAD-02 | — | N/A | unit | `npm run compile-tests && npm test` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | PARSE-01 | T-02-02-01, T-02-02-02 | N/A | unit+tdd | `npm run compile-tests && npm test` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | PARSE-02 | T-02-02-03 | N/A | unit+tdd | `npm run compile-tests && npm test` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 3 | PARSE-03 | T-02-03-01, T-02-03-02 | N/A | unit+tdd | `npm run compile-tests && npm test` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 4 | DETECT-01 | — | N/A | unit+tdd | `npm run compile-tests && npm test` | ❌ W0 | ⬜ pending |
| 2-04-02 | 04 | 4 | DETECT-02 | — | N/A | unit+tdd | `npm run compile-tests && npm test` | ❌ W0 | ⬜ pending |
| 2-05-01 | 05 | 5 | DETECT-03 | — | N/A | unit+tdd | `npm run compile-tests && npm test` | ❌ W0 | ⬜ pending |
| 2-05-02 | 05 | 5 | LOAD-02 | — | N/A | integration | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/suite/parser.test.ts` — covers PARSE-01 (log parsing unit tests)
- [ ] `test/suite/featureParser.test.ts` — covers PARSE-02 (Gherkin parsing unit tests)
- [ ] `test/suite/stepExtractor.test.ts` — covers PARSE-03 (step boundary unit tests)
- [ ] `test/suite/detector.test.ts` — covers DETECT-01 (anomaly detection unit tests)
- [ ] `test/suite/aggregator.test.ts` — covers DETECT-02, DETECT-03 (aggregation + ranking unit tests)
- [ ] `test/suite/pipeline.test.ts` — integration test covering LOAD-02 and full pipeline against `examples/`
- [ ] Install: `npm install --save-dev @cucumber/gherkin@28.0.0 @cucumber/messages@24.1.0`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VS Code artifact folder picker dialog | LOAD-01 | Requires UI interaction | Open extension, click "Load BatchRun folder", verify dialog appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
