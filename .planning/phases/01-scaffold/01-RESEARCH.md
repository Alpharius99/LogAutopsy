# Phase 1: Scaffold - Research

**Researched:** 2026-04-19
**Domain:** VS Code extension bootstrapping — toolchain, package.json manifest, esbuild pipeline, webview CSP, test runner
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Source layout: `src/extension/` (activate.ts, commands.ts), `src/core/` (parser.ts, detector.ts, aggregator.ts), `src/ui/` (sidebar.ts, webview.ts), `src/types.ts`
- **D-02:** `src/core/` must remain free of VS Code API imports
- **D-03:** Webview HTML delivered as a TypeScript template string with CSP nonce injected inline — no separate HTML file, no webview JS bundle in Phase 1
- **D-04:** Webview delivery approach is locked for all phases
- **D-05:** Activation event: `onCommand` via VS Code 1.74+ inference — `activationEvents` array may be omitted from package.json
- **D-06:** VS Code 1.74+ activation inference acceptable
- **D-07:** Sidebar `viewsContainers` and `views` contribution points registered in Phase 1 — slot exists even with no content until Phase 3
- **D-08:** Single esbuild entry point: `src/extension/activate.ts` → `dist/extension.js`
- **D-09:** Second esbuild entry point (webview JS) deferred to Phase 3
- **D-10:** Source maps on in dev/watch; stripped in production vsce package

### Claude's Discretion
- Test file organization (co-located vs `src/test/` vs `test/`) — choose what fits `@vscode/test-cli` + Mocha conventions
- Exact command IDs and view container IDs — use `logautopsy.*` namespace consistently
- `tsconfig.json` strictness settings — enable `strict: true`; tune as needed

### Deferred Ideas (OUT OF SCOPE)
- Agent Forge as AI backend — architecture decision for Phase 5 discuss, not Phase 1
</user_constraints>

---

## Summary

Phase 1 establishes a complete, runnable VS Code extension skeleton with no analysis features. The deliverable is a working dev loop: `npm run watch` compiles on save, the extension activates in Extension Development Host via command palette, the empty webview opens without CSP violations, and `npm test` exits cleanly.

The entire toolchain is prescribed by CLAUDE.md (TypeScript ~5.4, esbuild ^0.21, @vscode/test-cli + Mocha, @types/vscode ^1.90.0, @vscode/vsce ^3). No library selection is needed — research focuses on correct wiring of these known tools. The primary complexity is: (1) the esbuild build script pattern for VS Code extensions, (2) the CSP-correct webview HTML template with no external scripts, and (3) the @vscode/test-cli configuration file format.

Key insight: helloworld samples from the VS Code extension samples repo now use tsc for compilation, not esbuild. The official bundling docs do document esbuild, but the recommended pattern uses a `esbuild.js` Node script (not a CLI-only invocation) with `--watch` as a process flag, combined with `tsc --noEmit` for type checking in parallel. This separation — esbuild bundles, tsc type-checks — is the current idiomatic approach.

**Primary recommendation:** Wire esbuild as a Node script (`esbuild.js`) with `context.watch()` for dev and a `--production` flag guard for release. Keep tsc for type checking only (`--noEmit`). Use `@vscode/test-cli` with a `.vscode-test.mjs` config file.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Extension activation + command registration | Extension Host (activate.ts) | — | VS Code entry point; all glue lives here |
| Business logic (parsing, detection, aggregation) | Extension Host — core/ | — | Pure TS, no VS Code API; testable standalone |
| Sidebar tree view | Extension Host — ui/sidebar.ts | VS Code TreeView API | VS Code provides the rendering; extension provides data |
| Webview HTML | Extension Host — ui/webview.ts | — | HTML is a TS template string; no browser-side tier in Phase 1 |
| esbuild bundling | Build tooling | — | Build-time only; produces dist/extension.js |
| Type checking | Build tooling (tsc --noEmit) | — | Separate from bundling; runs in parallel in watch |
| Test execution | @vscode/test-cli (Extension Host subprocess) | — | Runs tests inside Extension Development Host |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | 6.0.3 (current); pin ~5.4 per CLAUDE.md | Language | Locked decision |
| @types/vscode | 1.116.0 (current); use ^1.90.0 | VS Code API types | Sets the engine floor |
| esbuild | 0.28.0 (current); use ^0.21 | Bundler | Locked; webpack explicitly forbidden |
| @vscode/test-cli | 0.0.12 (current latest) | Test runner CLI | Locked; @vscode/test-electron and Jest forbidden |
| mocha | 11.7.5 (current) | Test framework | Paired with @vscode/test-cli |
| @vscode/vsce | 3.9.1 (current) | Packaging | Locked; old `vsce` package forbidden |

> Version notes: All versions verified against npm registry on 2026-04-19. [VERIFIED: npm registry]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/mocha | 10.0.10 (current) | Mocha type definitions | Required for test authoring; use ^10 to stay compatible with Mocha v10 test API while mocha itself is v11 |
| @types/node | 25.6.0 (current) | Node.js built-in types | Required for `crypto`, `path`, etc. in extension host |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| esbuild.js Node script | `esbuild` CLI only | Node script gives access to `context.watch()` API; CLI watch has less control and no programmatic plugin hooks |
| tsc --noEmit for type check | ts-check or biome | tsc is canonical; no extra tooling needed |
| `.vscode-test.mjs` (ESM) | `.vscode-test.js` (CJS) | ESM avoids require() complications; consistent with current @vscode/test-cli docs |

**Installation:**
```bash
npm install --save-dev typescript @types/vscode @types/node esbuild @vscode/test-cli mocha @types/mocha @vscode/vsce
```

> Note: `@vscode/test-electron` is NOT installed — `@vscode/test-cli` bundles its own VS Code download mechanism. [VERIFIED: npm view @vscode/test-cli description]

---

## Architecture Patterns

### System Architecture Diagram

```
Developer save
      |
      v
[esbuild watch context] ──────────────────► dist/extension.js
      |                                      (CJS, platform=node, external:vscode)
      |   (parallel)
[tsc --noEmit --watch] ──────────────────► type errors only (no emit)
      |
      v
F5 → Extension Development Host
      |
      ├── activationEvent (onCommand:logautopsy.runAnalysis inferred from contributes)
      |        |
      |        v
      |   activate.ts ──► registerCommand('logautopsy.runAnalysis')
      |                ──► registerCommand('logautopsy.openWebview')
      |                ──► window.registerTreeDataProvider('logautopsy.sidebar', ...)
      |
      └── Command Palette: "Run Analysis"
               |
               v
          ui/webview.ts ──► createWebviewPanel(...)
                        ──► panel.webview.html = getWebviewHtml(nonce)
                              [CSP: default-src 'none'; style-src 'unsafe-inline']
                              [empty <body> placeholder]
```

### Recommended Project Structure

```
LogAutopsy/
├── src/
│   ├── extension/
│   │   ├── activate.ts        # VS Code entry point: activate() + deactivate()
│   │   └── commands.ts        # Command handler stubs
│   ├── core/                  # Pure TS — NO vscode imports
│   │   ├── parser.ts          # (stub) LogEvent parsing
│   │   ├── detector.ts        # (stub) Anomaly detection
│   │   └── aggregator.ts      # (stub) Aggregation
│   ├── ui/
│   │   ├── sidebar.ts         # TreeDataProvider stub
│   │   └── webview.ts         # Webview panel + HTML builder
│   └── types.ts               # Shared interfaces (LogEvent, Anomaly, etc.)
├── test/
│   └── suite/
│       └── extension.test.ts  # Placeholder test: assert extension activates
├── dist/                      # esbuild output (gitignored)
├── .vscode-test.mjs           # @vscode/test-cli config
├── esbuild.js                 # Build script
├── tsconfig.json
├── package.json
└── .vscodeignore
```

> Test directory: `test/` at root (not `src/test/`) — this is the natural layout for `@vscode/test-cli` since test compilation goes to `out/test/` or equivalent, keeping test output separate from extension output in `dist/`. [ASSUMED — fits @vscode/test-cli convention but Claude's Discretion applies]

### Pattern 1: esbuild Build Script

The idiomatic approach for VS Code extensions is a `esbuild.js` Node script rather than CLI-only invocation. This enables watch mode via the Context API and production/dev flag branching.

```javascript
// Source: https://code.visualstudio.com/api/working-with-extensions/bundling-extension
// esbuild.js
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension/activate.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [{
      name: 'esbuild-problem-matcher',
      setup(build) {
        build.onStart(() => {
          console.log('[watch] build started');
        });
        build.onEnd((result) => {
          result.errors.forEach(({ text, location }) => {
            console.error(`✘ [ERROR] ${text}`);
            if (location) {
              console.error(`    ${location.file}:${location.line}:${location.column}:`);
            }
          });
          console.log('[watch] build finished');
        });
      },
    }],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```

**Critical:** `external: ['vscode']` is mandatory — the `vscode` module is provided by the VS Code runtime and must never be bundled. [VERIFIED: VS Code bundling docs + Context7 esbuild docs]

**Critical:** `format: 'cjs'` is required for desktop VS Code extensions — the extension host uses CommonJS. [VERIFIED: VS Code bundling docs]

**Critical:** `platform: 'node'` — esbuild 0.22+ defaults to treating all packages as external when platform=node. Since `vscode` is already explicit external, and no other npm packages are used in Phase 1, this is safe. [VERIFIED: Context7 esbuild CHANGELOG-2024.md]

### Pattern 2: package.json Scripts

```json
"scripts": {
  "vscode:prepublish": "npm run package",
  "compile": "npm run check-types && node esbuild.js",
  "watch": "npm-run-all -p watch:esbuild watch:tsc",
  "watch:esbuild": "node esbuild.js --watch",
  "watch:tsc": "tsc --noEmit --watch --project tsconfig.json",
  "package": "npm run check-types && node esbuild.js --production",
  "check-types": "tsc --noEmit",
  "test": "vscode-test"
}
```

> `npm-run-all` needed for parallel watch scripts — add as devDependency. [ASSUMED — standard pattern; verify npm-run-all is acceptable or inline with `&`]

Alternative: use `&` in shell for parallel (works on macOS/Linux, not Windows):
```json
"watch": "node esbuild.js --watch & tsc --noEmit --watch --project tsconfig.json"
```
[ASSUMED — cross-platform safety unknown without knowing developer OS]

### Pattern 3: tsconfig.json

Based on the current VS Code extension samples (helloworld-sample), the canonical tsconfig is:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2024",
    "lib": ["ES2024"],
    "outDir": "out",
    "sourceMap": true,
    "strict": true,
    "rootDir": "src"
  },
  "exclude": [
    "node_modules",
    ".vscode-test"
  ]
}
```

> Note: `outDir: "out"` is for tsc type-check output (and tests). The actual extension bundle goes to `dist/` via esbuild. Both directories are needed: `out/` for compiled test files, `dist/` for the extension bundle. [VERIFIED: helloworld-sample tsconfig.json via WebFetch]

> Note: `target: ES2024` is what the current samples use (upgraded from ES2020). Since the engine floor is VS Code ^1.90.0 which bundles Node.js 18.x+, ES2024 is safe. [VERIFIED: WebFetch of helloworld-sample tsconfig]

### Pattern 4: .vscode-test.mjs Configuration

```javascript
// Source: https://github.com/microsoft/vscode-test-cli
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  extensionDevelopmentPath: '.',
  mocha: {
    timeout: 20000,
  },
});
```

> The `files` glob targets compiled test output from tsc (in `out/`), not source `.ts` files. Tests must be compiled before `vscode-test` runs. Add a pre-test compile step if needed. [VERIFIED: @vscode/test-cli README via WebFetch]

> Note: `extensionDevelopmentPath: '.'` tells @vscode/test-cli to load the extension under test. For Phase 1 with zero actual tests, the suite can be empty — `vscode-test` will exit 0. [ASSUMED — based on @vscode/test-cli behavior]

### Pattern 5: package.json Manifest (Key Fields)

```json
{
  "name": "logautopsy",
  "displayName": "LogAutopsy",
  "description": "Automated test failure root cause analysis for VS Code",
  "version": "0.1.0",
  "publisher": "logautopsy",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "logautopsy.runAnalysis",
        "title": "Run Analysis",
        "category": "LogAutopsy"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "logautopsy-container",
          "title": "LogAutopsy",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "logautopsy-container": [
        {
          "id": "logautopsy.sidebar",
          "name": "Analysis Results"
        }
      ]
    }
  }
}
```

> `activationEvents: []` — empty array is correct for VS Code 1.74+. Activation is inferred from `contributes.commands` and `contributes.views`. [VERIFIED: VS Code 1.74 release notes via WebFetch]

> `main: "./dist/extension.js"` — points to esbuild output. [VERIFIED: VS Code extension manifest docs]

> The `viewsContainers.activitybar` `icon` field requires an SVG file. A placeholder SVG must exist at `media/icon.svg` at Phase 1 time or VS Code will log a warning (not a hard error). [ASSUMED — based on standard VS Code behavior; SVG is typically 16x16 or 24x24 and can be a minimal placeholder]

### Pattern 6: CSP-Correct Webview HTML (No External Scripts)

For Phase 1 the webview is an empty placeholder with no JavaScript. The CSP must be explicit.

```typescript
// Source: VS Code extension samples / Context7 /microsoft/vscode-extension-samples
// src/ui/webview.ts

import * as vscode from 'vscode';
import * as crypto from 'crypto';

function getNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

function getWebviewHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  // Phase 1: no scripts, no external styles
  // CSP allows only inline styles (for VS Code theme variables)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LogAutopsy</title>
  <style>
    body {
      color: var(--vscode-editor-foreground);
      background-color: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      padding: 16px;
    }
  </style>
</head>
<body>
  <p>Select an artifact to begin analysis.</p>
</body>
</html>`;
}

export function createOrShowWebviewPanel(
  context: vscode.ExtensionContext
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'logautopsy.detail',
    'LogAutopsy Detail',
    vscode.ViewColumn.One,
    {
      enableScripts: false,   // No scripts in Phase 1
      retainContextWhenHidden: true,
    }
  );
  panel.webview.html = getWebviewHtml(panel.webview);
  return panel;
}
```

> **CSP note:** `style-src 'unsafe-inline'` permits inline `<style>` blocks, which is acceptable for VS Code theme variable usage. When Phase 3 adds webview JS, this CSP will need to add `script-src 'nonce-${nonce}'` and `enableScripts: true`. The nonce is pre-built into the template — just not used yet in Phase 1. [VERIFIED: VS Code webview docs via WebFetch + Context7 samples]

> **Alternative CSP:** Use `style-src ${webview.cspSource}` to permit only extension-local stylesheets loaded via `webview.asWebviewUri()`. For Phase 1 with pure inline styles, `'unsafe-inline'` is simpler and produces no CSP violation. [CITED: code.visualstudio.com/api/extension-guides/webview#content-security-policy]

### Pattern 7: activate.ts Entry Point

```typescript
// src/extension/activate.ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  // Register command visible in command palette
  context.subscriptions.push(
    vscode.commands.registerCommand('logautopsy.runAnalysis', () => {
      vscode.window.showInformationMessage('LogAutopsy: Analysis not yet implemented.');
    })
  );

  // Register sidebar TreeDataProvider (empty stub)
  const treeDataProvider: vscode.TreeDataProvider<never> = {
    getTreeItem: () => { throw new Error('No items'); },
    getChildren: () => Promise.resolve([]),
  };
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('logautopsy.sidebar', treeDataProvider)
  );
}

export function deactivate(): void {
  // Nothing to clean up in Phase 1
}
```

### Anti-Patterns to Avoid

- **Importing `vscode` in `src/core/`:** Violates D-02; breaks unit testability. The core modules must compile and test without an extension host.
- **Using `"main": "./out/extension.js"` (tsc output) instead of `./dist/extension.js`:** The extension host will load unoptimized tsc output instead of the esbuild bundle — defeats the purpose of esbuild.
- **Using `enableScripts: true` without a CSP `script-src` directive:** Causes CSP violations. If scripts are not needed (Phase 1), set `enableScripts: false`.
- **Omitting `external: ['vscode']` from esbuild:** esbuild will attempt to bundle the vscode module and fail — it is a virtual module provided by the host at runtime.
- **Using `format: 'esm'` in esbuild:** Desktop VS Code extensions require CJS. ESM is for web extensions only.
- **Compiling test files into `dist/`:** Keep test output in `out/test/` (tsc) separate from the extension bundle in `dist/`. The `.vscode-test.mjs` `files` glob must match `out/test/**/*.test.js`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webview nonce generation | Custom random string | `crypto.randomBytes(16).toString('base64')` | Node.js built-in; correct entropy; no npm dep needed |
| Watch mode file watching | Custom fs.watch loop | `esbuild.context().watch()` | esbuild handles debounce, dependency graph, incremental builds |
| Type checking in watch | Parse TS manually | `tsc --noEmit --watch` | Accurate; uses full TS language service |
| Extension packaging | Custom zip | `@vscode/vsce package` | Handles .vscodeignore, marketplace metadata, signing |
| Test runner bootstrap | Custom mocha runner | `@vscode/test-cli` / `.vscode-test.mjs` | Handles VS Code download, Extension Development Host launch |

**Key insight:** The extension host, bundling, and testing infrastructure are all well-specified by Microsoft tooling. Phase 1 is about wiring these tools correctly, not building anything custom.

---

## Common Pitfalls

### Pitfall 1: tsc `outDir` collision with esbuild `outfile`

**What goes wrong:** `tsconfig.json` has `"outDir": "dist"` and esbuild writes to `dist/extension.js`. tsc overwrites or conflicts with the esbuild output.

**Why it happens:** Developers copy tsconfig from non-esbuild projects.

**How to avoid:** Set tsc `outDir` to `out` (for test compilation). Set esbuild `outfile` to `dist/extension.js`. Never let tsc emit to `dist/`. Use `tsc --noEmit` for type checking in watch — no emit at all.

**Warning signs:** `dist/extension.js` exists but does not have the esbuild footer comment; or rebuilds are slow (tsc is doing full emit).

### Pitfall 2: CSP violation from `enableScripts: true` without matching CSP

**What goes wrong:** Setting `enableScripts: true` (or using the default) without a `script-src` directive causes VS Code to log CSP violations in the developer console. The Phase 1 success criterion requires zero CSP violations.

**Why it happens:** Developers forget to set `enableScripts: false` when there are no scripts, or set it to true "just in case."

**How to avoid:** In Phase 1, set `enableScripts: false` explicitly. The CSP `default-src 'none'` is then sufficient.

**Warning signs:** Developer console shows "Content Security Policy of your site blocks the use of 'eval' in JavaScript..."

### Pitfall 3: Activation event not firing because `activationEvents` array is wrong

**What goes wrong:** Extension never activates; command not found in command palette.

**Why it happens:** Developers add `activationEvents: ["onCommand:logautopsy.runAnalysis"]` and expect it to work, but have a typo in the command ID — or conversely, they omit the array entirely without knowing VS Code 1.74+ inference is in play.

**How to avoid:** Use `"activationEvents": []` (empty array) on a `"engines.vscode": "^1.90.0"` engine floor — inference handles it from `contributes.commands`. Do not duplicate command IDs manually.

**Warning signs:** Command palette shows "No commands matching 'LogAutopsy'" or extension never activates on F5.

### Pitfall 4: Missing `media/icon.svg` causes activitybar slot warning

**What goes wrong:** VS Code logs a warning that the viewsContainer icon is missing. The sidebar slot still registers but looks broken in the activity bar.

**Why it happens:** `viewsContainers.activitybar` requires an `icon` field pointing to a valid SVG.

**How to avoid:** Create a minimal placeholder SVG at `media/icon.svg` in Phase 1. It can be a simple 16x16 square — just enough for VS Code to load without warning.

**Warning signs:** Activity bar icon is blank or shows a broken image icon.

### Pitfall 5: @vscode/test-cli finds no test files and exits with error

**What goes wrong:** `npm test` exits non-zero because the `files` glob in `.vscode-test.mjs` matches nothing.

**Why it happens:** Tests are not compiled (tsc has not run), or the glob pattern points to the wrong directory.

**How to avoid:** Pre-compile tests before running `vscode-test`. Add a `pretest` script: `"pretest": "tsc --noEmit || true"` or compile tests as part of the `test` script. For Phase 1 with an empty suite, ensure at least one placeholder `.test.ts` file exists that compiles to a `.test.js` the glob matches.

**Warning signs:** `vscode-test` output: "No test files found matching pattern..."

### Pitfall 6: `vscode` imported in `src/core/` breaks unit tests

**What goes wrong:** `src/core/parser.ts` or `src/core/detector.ts` imports `vscode`; unit tests fail with "Cannot find module 'vscode'" outside the extension host.

**Why it happens:** It feels convenient to use `vscode.Uri` or `vscode.workspace` in core logic.

**How to avoid:** Keep `src/core/` pure TypeScript. Pass `vscode.Uri` as `string` at the boundary; convert in `src/extension/` or `src/ui/` code before calling core.

**Warning signs:** `tsc` succeeds but Mocha unit tests fail with module resolution error on 'vscode'.

---

## Code Examples

### Minimal placeholder test (ensures `npm test` exits 0)

```typescript
// test/suite/extension.test.ts
// Source: @vscode/test-cli + Mocha pattern [ASSUMED — standard Mocha BDD]
import * as assert from 'assert';

suite('Extension smoke test', () => {
  test('placeholder — test infrastructure is wired', () => {
    assert.ok(true);
  });
});
```

### Minimal SVG icon placeholder

```xml
<!-- media/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" fill="#007ACC"/>
</svg>
```

### .vscodeignore (keep the package small)

```
.vscode-test/**
src/**
test/**
out/**
.vscode-test.mjs
esbuild.js
tsconfig.json
*.map
node_modules/**
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| webpack for VS Code extension bundling | esbuild (much faster) | ~2022 | Official Microsoft docs now show esbuild as primary example |
| `@vscode/test-electron` directly | `@vscode/test-cli` wrapping `@vscode/test-electron` | 2023 | `@vscode/test-cli` is the new official runner; `@vscode/test-electron` is the engine underneath |
| `activationEvents` manually listed | Inferred from `contributes.*` | VS Code 1.74 (Nov 2022) | Empty `"activationEvents": []` is now correct |
| `target: ES2020` in tsconfig | `target: ES2024` | 2024/2025 (current samples) | VS Code now ships Node.js 20+ which supports ES2024 |
| `tsc` only for bundling | `tsc --noEmit` (type check) + `esbuild` (bundle) | ~2022–2023 | Clean separation: esbuild bundles fast; tsc validates types |

**Deprecated/outdated:**
- `vscode` npm package (old): replaced by `@types/vscode` (types only) + `@vscode/test-cli` (test runner). Never install `vscode` package.
- `@vscode/test-electron` as direct dependency: still works, but `@vscode/test-cli` is the recommended abstraction layer.
- webpack: explicitly forbidden by CLAUDE.md.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `test/` at repo root is the correct location for test files with @vscode/test-cli | Architecture Patterns | Low — location is Claude's discretion; if wrong, update `.vscode-test.mjs` glob |
| A2 | `npm-run-all` is acceptable as a devDependency for parallel watch scripts | Pattern 2 (package.json scripts) | Low — can replace with shell `&` operator; cross-platform concern |
| A3 | An empty `activationEvents: []` array (not omitted entirely) is the correct form for VS Code 1.74+ inference | Pattern 5 (package.json) | Low — omitting vs empty array both work per VS Code docs; empty is explicit |
| A4 | A single placeholder test file is sufficient for `npm test` to exit 0 | Common Pitfalls #5 | Low — if @vscode/test-cli exits non-zero on zero test files, one placeholder test is the fix |
| A5 | `style-src 'unsafe-inline'` does not trigger a CSP violation in VS Code's webview | Pattern 6 (CSP) | Medium — if VS Code flags `unsafe-inline` in webview CSP, the fix is to use `webview.cspSource` with an external CSS file |

---

## Open Questions

1. **Does `npm-run-all` need to be added as a devDependency, or is a shell `&` sufficient?**
   - What we know: `npm-run-all` gives `npm run watch` a clean cross-platform parallel invocation
   - What's unclear: Whether CI/CD or Windows developer machines require cross-platform script running
   - Recommendation: Use `npm-run-all` initially; easy to remove if cross-platform is not needed

2. **What is the minimum TypeScript version that satisfies `~5.4` while being compatible with `target: ES2024`?**
   - What we know: Current TS is 6.0.3; CLAUDE.md pins `~5.4`; ES2024 target is stable in TS 5.4+
   - What's unclear: Whether `~5.4` means exactly 5.4.x or >=5.4.0 <6.0.0
   - Recommendation: Use `typescript@~5.4` (npm semver: 5.4.x only); if ES2024 issues arise, can target ES2022 which is safe on Node 18+

3. **Is a `publisher` field required in `package.json` for local development/F5 launch?**
   - What we know: `publisher` is required for marketplace publishing via vsce
   - What's unclear: Whether its absence causes Extension Development Host to refuse loading
   - Recommendation: Include a placeholder `"publisher": "logautopsy-dev"` to avoid any validation warnings

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | esbuild, test-cli, npm scripts | Yes | v25.9.0 | — |
| npm | Package installation | Yes | 11.12.1 | — |
| VS Code (CLI) | Extension Development Host for F5 | Not in PATH | — | Launch via VS Code GUI (F5) — CLI not needed |
| @vscode/test-cli download | VS Code binary for test runs | Downloads on demand | — | Requires internet on first run |

**Note:** VS Code CLI not in PATH is normal for macOS GUI installs. F5 launch in VS Code works via the launch configuration in `.vscode/launch.json`. `npm test` downloads VS Code automatically on first run via `@vscode/test-cli`. [VERIFIED: Node/npm versions from `node --version`, `npm --version`]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | @vscode/test-cli 0.0.12 + Mocha 11.7.5 |
| Config file | `.vscode-test.mjs` — Wave 0 creates this |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same — no separate full suite in Phase 1) |

### Phase Requirements → Test Map

Phase 1 has no formal requirement IDs (infrastructure phase). The success criteria map to smoke tests:

| Success Criterion | Behavior | Test Type | Automated Command | File Exists? |
|-------------------|----------|-----------|-------------------|-------------|
| SC-1: `npm run watch` compiles without errors | esbuild builds `dist/extension.js` cleanly | build verification | `npm run compile` (exits 0) | Wave 0 |
| SC-2: Extension activates with no console errors | Extension host starts, command visible | smoke (Extension Host) | `npm test` (placeholder test asserts `true`) | Wave 0 |
| SC-3: Empty webview has no CSP violations | Webview opens cleanly | manual visual check | — | Manual |
| SC-4: `npm test` exits cleanly | Test runner completes 0 failures | `npm test` | `npm test` | Wave 0 |

> SC-3 (CSP validation) is manual — no automated way to assert browser console CSP violations programmatically in Phase 1. Must be verified by opening the webview in Extension Development Host and checking the developer console.

### Sampling Rate

- **Per task commit:** `npm run compile` (fast build verification)
- **Per wave merge:** `npm test` (full suite — which is just the smoke test in Phase 1)
- **Phase gate:** `npm test` exits 0 + manual CSP check before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/suite/extension.test.ts` — placeholder test (SC-2, SC-4)
- [ ] `.vscode-test.mjs` — test runner config
- [ ] `tsconfig.json` — needed before any tsc compilation
- [ ] `package.json` — needed before any npm commands
- [ ] `esbuild.js` — build script
- [ ] `media/icon.svg` — placeholder icon
- [ ] `.vscode/launch.json` — F5 Extension Development Host launch config
- [ ] `.vscodeignore` — packaging exclusions

---

## Security Domain

Phase 1 creates infrastructure only. No user data is handled, no network calls are made, no secrets are managed. ASVS categories are noted for downstream planning only.

### Applicable ASVS Categories

| ASVS Category | Applies to Phase 1 | Standard Control |
|---------------|-------------------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | No (no input in Phase 1) | Will apply in Phase 2 (log file parsing) |
| V6 Cryptography | Minimal — nonce generation only | Node.js `crypto.randomBytes()` — never hand-roll |

### Webview CSP as Security Control

The CSP in the webview HTML template is the only security-relevant artifact in Phase 1. The policy `default-src 'none'` ensures the empty webview cannot load any external resource. This is the correct baseline; later phases add permissions as needed.

---

## Sources

### Primary (HIGH confidence)
- `npm view` commands — all package versions verified against npm registry on 2026-04-19
- Context7 `/evanw/esbuild` — esbuild watch API, platform=node behavior, external packages, CHANGELOG-2024 behavior
- Context7 `/microsoft/vscode-extension-samples` — WebviewPanel CSP pattern, TreeView contribution points, command registration
- WebFetch of `github.com/microsoft/vscode-extension-samples/helloworld-sample/package.json` — confirmed `activationEvents: []`, `main: ./out/extension.js` (note: sample uses tsc, we use esbuild to `dist/`)
- WebFetch of `github.com/microsoft/vscode-extension-samples/helloworld-sample/tsconfig.json` — confirmed `module: commonjs`, `target: ES2024`, `strict: true`
- WebFetch of `code.visualstudio.com/api/working-with-extensions/bundling-extension` — confirmed esbuild script pattern, `format: cjs`, `external: ['vscode']`, package.json scripts

### Secondary (MEDIUM confidence)
- WebFetch of `code.visualstudio.com/updates/v1_74` — confirmed activation event inference from contributes.commands/views
- WebFetch of `code.visualstudio.com/api/extension-guides/webview` — confirmed CSP patterns; `webview.cspSource` vs `unsafe-inline`
- WebFetch of `github.com/microsoft/vscode-test-cli` — confirmed `.vscode-test.mjs` config format and `defineConfig` API

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry
- Architecture: HIGH — esbuild + tsc + @vscode/test-cli pattern verified via official docs and samples
- Pitfalls: HIGH — all based on verified VS Code extension behavior from official sources
- CSP pattern: MEDIUM — `unsafe-inline` for Phase 1 inline styles is safe but not officially endorsed; confirmed no known violation from VS Code webview docs

**Research date:** 2026-04-19
**Valid until:** 2026-07-19 (90 days — VS Code toolchain is stable; @vscode/test-cli may rev but config format is stable)
