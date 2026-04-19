---
phase: 01-scaffold
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - package.json
  - tsconfig.json
  - esbuild.js
  - .vscode-test.mjs
  - .vscodeignore
  - .vscode/launch.json
  - .vscode/tasks.json
  - media/icon.svg
  - src/types.ts
  - src/core/parser.ts
  - src/core/detector.ts
  - src/core/aggregator.ts
  - src/extension/activate.ts
  - src/extension/commands.ts
  - src/ui/sidebar.ts
  - src/ui/webview.ts
  - test/suite/extension.test.ts
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

The Phase 1 scaffold is well-structured overall. The D-02 layer boundary (no `vscode` imports in `src/core/` or `src/types.ts`) is correctly respected across all core files. The toolchain wiring (esbuild, `@vscode/test-cli`, TypeScript strict mode) matches the CLAUDE.md requirements. The SHA-256 helper correctly uses Node.js built-in `crypto`. The webview correctly sets `enableScripts: false` for Phase 1.

There is one critical finding: the CSP in `src/ui/webview.ts` permits `style-src 'unsafe-inline'`, which violates the Phase 1 requirement of `default-src 'none'` with no exceptions. Three warnings flag real gaps: a dead `openWebview` function in `commands.ts` that is never wired up, a `@vscode/test-electron` devDependency that CLAUDE.md explicitly bans, and the `.vscode-test.mjs` test config pointing to `out/` rather than the compiled output the bundler actually produces. Four info items cover minor quality concerns.

---

## Critical Issues

### CR-01: Webview CSP weakened — `style-src 'unsafe-inline'` violates Phase 1 constraint

**File:** `src/ui/webview.ts:16`
**Issue:** The Content-Security-Policy meta tag is `default-src 'none'; style-src 'unsafe-inline'`. Phase 1 requires `default-src 'none'` with no relaxations. `style-src 'unsafe-inline'` allows injection of arbitrary inline styles and is a known XSS escalation vector once scripts are enabled in later phases if the CSP is not tightened. Starting with a weaker CSP than specified creates a false baseline that may be forgotten.

The inline styles for VS Code theming variables (`--vscode-editor-foreground`, etc.) do not need `'unsafe-inline'` at the CSP level — they are legitimate CSS variable references that will be replaced at Phase 3 with a proper stylesheet URI. For Phase 1, the `<style>` block should either be removed entirely (the page has no content) or the CSP should remain `default-src 'none'` and the style block accepted as a known deviation only when scripts are enabled with a nonce.

**Fix:**
```typescript
// Option A — remove the inline style block entirely (simplest for Phase 1 placeholder)
function getWebviewHtml(_webview: vscode.Webview): string {
  const _nonce = getNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LogAutopsy</title>
</head>
<body>
  <p>Select an artifact to begin analysis.</p>
</body>
</html>`;
}
```

---

## Warnings

### WR-01: `@vscode/test-electron` in devDependencies — explicitly banned by CLAUDE.md

**File:** `package.json:59`
**Issue:** `"@vscode/test-electron": "^2.5.2"` is present in `devDependencies`. CLAUDE.md Technology Stack table lists `@vscode/test-electron` under "Do NOT use" for the test runner category. The project mandates `@vscode/test-cli` (which is correctly present at `^0.0.9`). Having the banned package present risks it being used accidentally and causes confusion about which test runner is authoritative.

**Fix:** Remove the entry from `devDependencies`:
```json
// Remove this line from package.json devDependencies:
"@vscode/test-electron": "^2.5.2",
```
Run `npm install` to update `package-lock.json`.

---

### WR-02: `openWebview` in `commands.ts` is defined but never registered

**File:** `src/extension/commands.ts:16-20`
**Issue:** `openWebview(_context)` is exported and implemented, but `src/extension/activate.ts` registers `logautopsy.openWebview` by calling `createOrShowWebviewPanel(context)` directly — it never calls `openWebview`. The `openWebview` function in `commands.ts` is therefore dead code. This is a logic inconsistency: the commands module has an orphaned handler, while the actual webview creation bypasses it. When Phase 3 wires in real logic, a developer may call `openWebview` expecting it to do what `createOrShowWebviewPanel` does, leading to a bug.

**Fix:** Either route the activation through `openWebview` or delete the dead function. Routing through `commands.ts` keeps all command handlers co-located:
```typescript
// src/extension/commands.ts
export async function openWebview(
  context: vscode.ExtensionContext
): Promise<void> {
  createOrShowWebviewPanel(context);
}

// src/extension/activate.ts
import { runAnalysis, openWebview } from './commands';
// ...
context.subscriptions.push(
  vscode.commands.registerCommand('logautopsy.openWebview', () =>
    openWebview(context)
  )
);
```

---

### WR-03: Test configuration points to wrong output directory — tests will not be discovered

**File:** `.vscode-test.mjs:5`
**Issue:** `files: 'out/test/**/*.test.js'` expects compiled test files at `out/`. The `tsconfig.json` `outDir` is also `out`, which is correct for `compile-tests` (`tsc --project tsconfig.json`). However, the `pretest` script runs `compile` (esbuild bundle to `dist/`) first, then `compile-tests` (tsc to `out/`). This is correct in sequence, but the `Extension Tests` launch configuration in `.vscode/launch.json:18` also points `outFiles` to `out/test/**/*.js` — that is consistent. The warning is that if a developer runs `npm test` without first running `compile-tests`, or if `compile-tests` is omitted from CI, the `out/` directory will not exist and `vscode-test` will silently find zero test files and exit with success. There is no guard or explicit verification that `out/test/` is populated before `vscode-test` runs.

This is a reliability issue rather than a configuration bug per se, but it means test failures can be silently swallowed. The `pretest` script currently runs both steps so it works in practice, but the test runner has no `spec` count assertion.

**Fix:** Add a `--require` guard or use `vscode-test`'s `failOnMissingFiles` option when it becomes available. At minimum, add a `check-test-output` script that validates `out/test/` exists:
```json
"pretest": "npm run compile && npm run compile-tests && node -e \"require('fs').accessSync('out/test/suite/extension.test.js')\""
```

---

## Info

### IN-01: `void` trick to suppress unused-variable warnings on regex constants is fragile

**File:** `src/core/parser.ts:12-14`
**Issue:** `void LOG_LINE_PATTERN; void STANDARD_SOURCE; void EXCEPTION_SOURCE;` suppresses TypeScript `noUnusedLocals` warnings. This works but is a non-idiomatic pattern. The regexes are annotated as "spec anchors" for Phase 2. The cleaner approach is to export them so they are considered used — which also makes them available to tests.

**Fix:**
```typescript
// Export the regexes so they are both usable and not suppressed with void
export const LOG_LINE_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\d+)\] (\w+)\s+(.+)$/;
export const STANDARD_SOURCE  = /^(\S+?)\\(\w+):(\d+) - (.*)$/;
export const EXCEPTION_SOURCE = /^(\S+?)\|(\w+) in (\w+):(\d+) - (.*)$/;
```

---

### IN-02: `getNonce()` in `webview.ts` uses `randomBytes` but result is assigned to a variable prefixed `_`

**File:** `src/ui/webview.ts:10`
**Issue:** `const _nonce = getNonce()` — the underscore prefix signals "intentionally unused." The comment says "Pre-wired; used in Phase 3 for script-src nonce." This is the same `void`-equivalent pattern as IN-01. If `noUnusedLocals` is strictly enforced in a future tsconfig update, the leading underscore is the conventional escape, so this is fine — but it means the nonce is being generated and discarded on every panel creation right now. In Phase 3 the nonce must be threaded into the CSP header and the script tag; the variable should be renamed to `nonce` (without prefix) at that point to ensure TypeScript flags it if not actually used in the template string.

**Fix:** No change required for Phase 1. Leave a comment that `_nonce` must be renamed and wired into both the CSP `script-src 'nonce-...'` and the `<script>` tag in Phase 3.

---

### IN-03: `tsconfig.json` does not set `rootDir` — could emit unexpected paths

**File:** `tsconfig.json:4-9`
**Issue:** `outDir` is set to `out` but `rootDir` is not specified. Without `rootDir`, TypeScript infers the common root from all included files (`src/` and `test/`). This means the emitted structure will be `out/src/...` and `out/test/...` rather than `out/...`. The `.vscode-test.mjs` correctly expects `out/test/**/*.test.js` which matches this inferred layout — so it works in practice. However the absence of explicit `rootDir` can cause surprising path changes if the `include` globs change. Consider setting `"rootDir": "."` explicitly.

**Fix:**
```json
{
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "out",
    ...
  }
}
```

---

### IN-04: Smoke test has no assertions on extension activation

**File:** `test/suite/extension.test.ts:5-7`
**Issue:** The only test is `assert.ok(true)` — it confirms the test runner runs but verifies nothing about the extension. For Phase 1 a minimal activation smoke test would provide more value: verify the `logautopsy.runAnalysis` command is registered. This is straightforward with `vscode.commands.getCommands()`.

**Fix:**
```typescript
import * as vscode from 'vscode';
import * as assert from 'assert';

suite('Extension smoke test', () => {
  test('logautopsy.runAnalysis command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('logautopsy.runAnalysis'),
      'logautopsy.runAnalysis must be registered on activation'
    );
  });
});
```

---

_Reviewed: 2026-04-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
