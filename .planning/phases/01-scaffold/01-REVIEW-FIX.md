---
phase: 01-scaffold
fixed_at: 2026-04-20T00:00:00Z
review_path: .planning/phases/01-scaffold/01-REVIEW.md
fix_scope: critical_warning
findings_in_scope: 4
fixed: 4
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-04-20T00:00:00Z
**Source review:** `.planning/phases/01-scaffold/01-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Webview CSP weakened — `style-src 'unsafe-inline'` violates Phase 1 constraint

**Files modified:** `src/ui/webview.ts`
**Commit:** ef803b8
**Applied fix:** Removed the `<style>` block and changed the CSP meta tag from `default-src 'none'; style-src 'unsafe-inline'` to `default-src 'none'` with no exceptions, matching the Phase 1 requirement. The `_nonce` variable is retained with an updated comment noting it must be renamed and threaded into the CSP and `<script>` tag in Phase 3.

### WR-01: `@vscode/test-electron` in devDependencies — explicitly banned by CLAUDE.md

**Files modified:** `package.json`, `package-lock.json`
**Commit:** 6d29891
**Applied fix:** Removed `"@vscode/test-electron": "^2.5.2"` from `devDependencies` in `package.json`, then ran `npm install` which removed 27 packages and updated `package-lock.json`.

### WR-02: `openWebview` in `commands.ts` is defined but never registered

**Files modified:** `src/extension/commands.ts`, `src/extension/activate.ts`
**Commit:** dfc175a
**Applied fix:** In `commands.ts`, added import of `createOrShowWebviewPanel` from `../ui/webview` and updated `openWebview` to delegate to it (removing the placeholder `showInformationMessage` body). In `activate.ts`, replaced the direct import of `createOrShowWebviewPanel` with `openWebview` from `./commands`, and updated the `logautopsy.openWebview` command registration to call `openWebview(context)`. All command handlers are now co-located in `commands.ts`.

### WR-03: Test configuration points to wrong output directory — tests will not be discovered

**Files modified:** `package.json`
**Commit:** aacd3ff
**Applied fix:** Updated the `pretest` script from `npm run compile && npm run compile-tests` to `npm run compile && npm run compile-tests && node -e "require('fs').accessSync('out/test/suite/extension.test.js')"`. This guard fails loudly with `ENOENT` if `compile-tests` did not produce the expected output, preventing `vscode-test` from silently succeeding with zero discovered tests.

## Skipped (Info — out of scope)

- IN-01, IN-02, IN-03, IN-04 — excluded from `critical_warning` scope

---
_Fixed: 2026-04-20_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
