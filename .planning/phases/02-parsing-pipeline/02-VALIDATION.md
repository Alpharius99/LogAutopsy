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
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | LOAD-01 | — | N/A | unit | `npm run test:unit -- --grep "artifact discovery"` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | LOAD-02 | — | N/A | unit | `npm run test:unit -- --grep "artifact discovery"` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | PARSE-01 | — | N/A | unit | `npm run test:unit -- --grep "log parser"` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | PARSE-02 | — | N/A | unit | `npm run test:unit -- --grep "log parser"` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 1 | PARSE-03 | — | N/A | unit | `npm run test:unit -- --grep "log parser"` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | DETECT-01 | — | N/A | unit | `npm run test:unit -- --grep "anomaly detection"` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 2 | DETECT-02 | — | N/A | unit | `npm run test:unit -- --grep "anomaly detection"` | ❌ W0 | ⬜ pending |
| 2-03-03 | 03 | 2 | DETECT-03 | — | N/A | integration | `npm test -- --grep "integration"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test/unit/artifactDiscovery.test.ts` — stubs for LOAD-01, LOAD-02
- [ ] `src/test/unit/logParser.test.ts` — stubs for PARSE-01, PARSE-02, PARSE-03
- [ ] `src/test/unit/anomalyDetection.test.ts` — stubs for DETECT-01, DETECT-02
- [ ] `src/test/integration/parsingPipeline.test.ts` — end-to-end stub for DETECT-03
- [ ] `src/test/fixtures/` — copy of example log and feature file for tests

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
