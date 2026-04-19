---
phase: 1
slug: scaffold
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@vscode/test-cli` + Mocha |
| **Config file** | `.vscode-test.mjs` — Wave 0 installs |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | N/A (infra) | — | N/A | compile | `npm run compile` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | N/A (infra) | — | N/A | compile | `npm run compile` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 2 | N/A (infra) | — | N/A | e2e | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.vscode-test.mjs` — test runner config with ESM defineConfig
- [ ] `src/test/` — test stubs for compile/activate smoke tests
- [ ] `package.json` scripts: `compile`, `watch`, `test`

*Wave 0 sets up the entire test infrastructure from scratch (empty repo).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension activates in Extension Development Host | Infra | Requires GUI; no headless activation test supported in Phase 1 | Press F5, open command palette, verify "Run Analysis" appears |
| Empty webview opens without CSP violations | Infra | Requires browser devtools inspection | Open webview, open Dev Tools console, confirm no CSP errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
