# Phase 1: Scaffold - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 12 new files
**Analogs found:** 0 / 12 (greenfield project — no existing source code)

---

## Greenfield Notice

This is a brand-new repository with no `src/` directory and no TypeScript source files.
Every file in Phase 1 is created from scratch. There are no in-codebase analogs.

All patterns below are sourced from:
- **RESEARCH.md** — Verified patterns from official VS Code extension samples and docs (HIGH confidence)
- **CLAUDE.md** — Locked technology decisions and API surface constraints
- **Official VS Code extension samples** — `microsoft/vscode-extension-samples` (helloworld-sample, webview-sample)

The planner MUST use the excerpts in this file as the "copy from" reference in place of in-codebase analogs.

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `package.json` | config | — | RESEARCH.md Pattern 5 | reference-only |
| `tsconfig.json` | config | — | RESEARCH.md Pattern 3 | reference-only |
| `esbuild.js` | config / build-script | — | RESEARCH.md Pattern 1 | reference-only |
| `.vscode-test.mjs` | config / test-runner | — | RESEARCH.md Pattern 4 | reference-only |
| `.vscodeignore` | config | — | RESEARCH.md Code Examples | reference-only |
| `media/icon.svg` | asset | — | RESEARCH.md Code Examples | reference-only |
| `.vscode/launch.json` | config | — | VS Code extension sample convention | reference-only |
| `src/types.ts` | model | — | CLAUDE.md interfaces section | reference-only |
| `src/extension/activate.ts` | entry-point / controller | request-response | RESEARCH.md Pattern 7 | reference-only |
| `src/extension/commands.ts` | controller | request-response | RESEARCH.md Pattern 7 (command stub) | reference-only |
| `src/core/parser.ts` | service | transform | CLAUDE.md log format section | reference-only |
| `src/core/detector.ts` | service | transform | CLAUDE.md Phase 1 rules | reference-only |
| `src/core/aggregator.ts` | service | transform | CLAUDE.md Phase 1 rules | reference-only |
| `src/ui/sidebar.ts` | component | event-driven | RESEARCH.md Pattern 7 (TreeDataProvider stub) | reference-only |
| `src/ui/webview.ts` | component | request-response | RESEARCH.md Pattern 6 | reference-only |
| `test/suite/extension.test.ts` | test | — | RESEARCH.md Code Examples | reference-only |

---

## Pattern Assignments

### `package.json` (config)

**Source:** RESEARCH.md Pattern 2 (scripts) + Pattern 5 (manifest)

**Full manifest pattern:**
```json
{
  "name": "logautopsy",
  "displayName": "LogAutopsy",
  "description": "Automated test failure root cause analysis for VS Code",
  "version": "0.1.0",
  "publisher": "logautopsy-dev",
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
  },
  "scripts": {
    "vscode:prepublish": "npm run package",
    "compile": "npm run check-types && node esbuild.js",
    "watch": "npm-run-all -p watch:esbuild watch:tsc",
    "watch:esbuild": "node esbuild.js --watch",
    "watch:tsc": "tsc --noEmit --watch --project tsconfig.json",
    "package": "npm run check-types && node esbuild.js --production",
    "check-types": "tsc --noEmit",
    "pretest": "npm run compile",
    "test": "vscode-test"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.10",
    "@types/node": "^25.6.0",
    "@types/vscode": "^1.90.0",
    "@vscode/test-cli": "^0.0.9",
    "@vscode/vsce": "^3",
    "esbuild": "^0.21",
    "mocha": "^10",
    "npm-run-all": "^4.1.5",
    "typescript": "~5.4"
  }
}
```

**Critical constraints:**
- `"activationEvents": []` — empty array, NOT omitted. VS Code 1.74+ infers from `contributes`. Do NOT manually list command IDs here.
- `"main": "./dist/extension.js"` — esbuild output, never `./out/extension.js` (tsc output).
- `"engines.vscode": "^1.90.0"` — sets Node 18+ and ES2024 target floor.
- `npm-run-all` is required for the parallel `watch` script on all platforms.

---

### `tsconfig.json` (config)

**Source:** RESEARCH.md Pattern 3 (verified against helloworld-sample)

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
  "include": [
    "src/**/*.ts",
    "test/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    ".vscode-test"
  ]
}
```

**Critical constraints:**
- `"outDir": "out"` — NOT `dist`. tsc output goes to `out/` (test compilation). esbuild writes to `dist/`. Never let tsc emit to `dist/`.
- `"strict": true` — locked by D-02 enforcement and CLAUDE.md conventions section.
- `"module": "commonjs"` — required for desktop VS Code extension host (not ESM).
- `"rootDir": "src"` — keeps `src/` as the TS source root. `test/` is included via the `include` array so test files compile to `out/test/`.

---

### `esbuild.js` (build-script)

**Source:** RESEARCH.md Pattern 1 (verified against VS Code bundling docs + esbuild Context7 docs)

```javascript
// esbuild.js — Node.js build script (CommonJS)
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

**Critical constraints:**
- `external: ['vscode']` — mandatory. vscode is a host-provided virtual module; bundling it fails at runtime.
- `format: 'cjs'` — mandatory for desktop VS Code extension host. ESM format is for web extensions only.
- `platform: 'node'` — correct for extension host environment.
- `entryPoints: ['src/extension/activate.ts']` — single entry per D-08. Second entry (webview JS) deferred to Phase 3.
- `sourcemap: !production` — source maps on in dev/watch, stripped in `--production` build.

---

### `.vscode-test.mjs` (test-runner config)

**Source:** RESEARCH.md Pattern 4 (verified against @vscode/test-cli README)

```javascript
// .vscode-test.mjs — ESM module (not CJS)
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  extensionDevelopmentPath: '.',
  mocha: {
    timeout: 20000,
  },
});
```

**Critical constraints:**
- `files: 'out/test/**/*.test.js'` — targets tsc-compiled test output in `out/`, not `dist/` and not raw `.ts` files.
- `.mjs` extension — ESM format avoids require() complications. Do not use `.js` (CJS).
- `extensionDevelopmentPath: '.'` — loads the extension under test from repo root.
- Tests must be compiled (tsc) before `vscode-test` runs. The `pretest` script in `package.json` handles this.

---

### `.vscode/launch.json` (config)

**Source:** VS Code extension sample convention (helloworld-sample `.vscode/launch.json`)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/dist/**/*.js"
      ],
      "preLaunchTask": "${defaultBuildTask}"
    },
    {
      "name": "Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/test/**/*.js"
      ],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

**Note:** `outFiles` for the "Run Extension" config points to `dist/` (esbuild output). The "Extension Tests" config points to `out/test/` (tsc output for tests).

---

### `.vscodeignore` (config)

**Source:** RESEARCH.md Code Examples section

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
.vscode/**
.planning/**
docs/**
examples/**
```

---

### `media/icon.svg` (asset)

**Source:** RESEARCH.md Code Examples section

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" fill="#007ACC"/>
</svg>
```

**Note:** This is a required placeholder. Its absence causes a VS Code activity bar warning. The icon can be replaced with a proper design in a later phase.

---

### `src/types.ts` (model)

**Source:** CLAUDE.md "Core TypeScript Interfaces" section + spec §5

Phase 1 stubs out the interfaces that downstream phases will flesh out. The planner should create empty/stub interfaces to establish the type contract:

```typescript
// src/types.ts — Shared interfaces across all layers
// Full definitions per spec §5 in docs/test_analysis_agent_spec_v2.md

export interface LogEvent {
  timestamp: string;
  thread: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  className: string;
  methodName: string;
  sourceLine: number;
  message: string;
  continuationLines: string[];
  exceptionType?: string;
}

export interface GherkinStep {
  keyword: string;
  text: string;
  scenario: string;
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
}

export interface StepContext {
  step: GherkinStep | '_init_';
  startLine: number;
  endLine: number;
}

export interface Anomaly {
  logEvent: LogEvent;
  stepContext: StepContext;
}

export interface AggregatedAnomaly {
  id: string;           // SHA-256 of aggregation key
  type: string;
  normalizedMessage: string;
  topStackFrame: string;
  step: string;
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
  count: number;
  firstOccurrence: LogEvent;
  occurrences: Anomaly[];
}

export interface CodeCandidate {
  className: string;
  methodName: string;
  filePath: string;
  methodBody: string;
  confidence: number;   // 0.0–1.0
}

export interface RootCauseAnalysis {
  primaryAnomaly: AggregatedAnomaly;
  secondaryEffects: AggregatedAnomaly[];
  codeCandidate?: CodeCandidate;
  hypothesis: string;
  fixSuggestion: string;
  confidence: number;   // 0.0–1.0
}

export interface IssueCandidate {
  title: string;
  description: string;
  labels: string[];
  rootCauseAnalysis: RootCauseAnalysis;
}
```

**Constraint (D-02):** `src/types.ts` must NOT import from `vscode`. It is consumed by both `src/core/` (no VS Code API) and `src/ui/` (VS Code API allowed).

---

### `src/extension/activate.ts` (entry-point / controller)

**Source:** RESEARCH.md Pattern 7

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

**Constraints:**
- All command IDs use the `logautopsy.*` namespace (D-05 convention).
- Push every disposable to `context.subscriptions` — VS Code disposes them on deactivation.
- `export function activate` + `export function deactivate` — these are the mandatory VS Code extension entry points.

---

### `src/extension/commands.ts` (controller, request-response)

**Source:** RESEARCH.md Pattern 7 (command handler stubs)

Phase 1 is a stub file. The pattern is a module that exports command handler functions:

```typescript
// src/extension/commands.ts
import * as vscode from 'vscode';

/**
 * Handler for logautopsy.runAnalysis command.
 * Phase 1: placeholder only.
 */
export async function runAnalysis(): Promise<void> {
  vscode.window.showInformationMessage('LogAutopsy: Analysis not yet implemented.');
}

/**
 * Handler for logautopsy.openWebview command.
 * Phase 1: placeholder only.
 */
export async function openWebview(
  _context: vscode.ExtensionContext
): Promise<void> {
  vscode.window.showInformationMessage('LogAutopsy: Webview not yet implemented.');
}
```

**Note:** `activate.ts` imports and wires these handlers. Separating command logic from activation wiring keeps `activate.ts` clean as feature count grows.

---

### `src/core/parser.ts` (service, transform)

**Source:** CLAUDE.md "Log Format" section + "Phase 1 Key Rules"

Phase 1 is a stub. The file establishes the module shape and the regex constants that Phase 2 will implement:

```typescript
// src/core/parser.ts
// NO vscode imports — pure TypeScript (D-02)
import type { LogEvent } from '../types';

// Regexes from CLAUDE.md spec — do not modify
const LOG_LINE_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\d+)\] (\w+)\s+(.+)$/;
const STANDARD_SOURCE  = /^(\S+?)\\(\w+):(\d+) - (.*)$/;
const EXCEPTION_SOURCE = /^(\S+?)\|(\w+) in (\w+):(\d+) - (.*)$/;

/**
 * Parse a combined log4net log file into LogEvent objects.
 * Phase 1: stub — returns empty array.
 */
export function parseLog(_content: string): LogEvent[] {
  // TODO: Phase 2 implementation
  return [];
}
```

**Constraint (D-02):** No `import * as vscode` or any `vscode.*` usage. This file must compile and test without an extension host.

---

### `src/core/detector.ts` (service, transform)

**Source:** CLAUDE.md "Phase 1 Key Rules" (anomaly detection rules)

```typescript
// src/core/detector.ts
// NO vscode imports — pure TypeScript (D-02)
import type { LogEvent, StepContext, Anomaly } from '../types';

/**
 * Detect anomalies from parsed log events.
 * Anomaly = any LogEvent with level === 'ERROR'. WARN is not an anomaly.
 * Phase 1: stub — returns empty array.
 */
export function detectAnomalies(
  _events: LogEvent[],
  _stepContexts: StepContext[]
): Anomaly[] {
  // TODO: Phase 2 implementation
  return [];
}
```

---

### `src/core/aggregator.ts` (service, transform)

**Source:** CLAUDE.md "Phase 1 Key Rules" (aggregation key + SHA-256)

```typescript
// src/core/aggregator.ts
// NO vscode imports — pure TypeScript (D-02)
import { createHash } from 'crypto';   // Node.js built-in — no npm dep
import type { Anomaly, AggregatedAnomaly } from '../types';

/**
 * Aggregate anomalies by key: type + normalizedMessage + topStackFrame + step.
 * Key is SHA-256 hashed per CLAUDE.md spec.
 * Phase 1: stub — returns empty array.
 */
export function aggregateAnomalies(_anomalies: Anomaly[]): AggregatedAnomaly[] {
  // TODO: Phase 2 implementation
  return [];
}

/** SHA-256 hash helper — uses Node.js built-in crypto, never an npm hash lib */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

**Constraint:** Use `import { createHash } from 'crypto'` — Node.js built-in. Never use `js-sha256` or any npm hash library (CLAUDE.md locked decision).

---

### `src/ui/sidebar.ts` (component, event-driven)

**Source:** RESEARCH.md Pattern 7 (TreeDataProvider stub) + CLAUDE.md VS Code API surface table

```typescript
// src/ui/sidebar.ts
import * as vscode from 'vscode';

/**
 * Sidebar TreeDataProvider stub.
 * Phase 1: empty tree — registers the slot, no content until Phase 3.
 */
export class LogAutopsySidebarProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData =
    new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<vscode.TreeItem[]> {
    return Promise.resolve([]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
```

**Note:** The `EventEmitter` + `onDidChangeTreeData` wiring is the standard VS Code pattern for refreshable tree views. Even though Phase 1 is a stub, establishing the full `TreeDataProvider` class shape here avoids a rewrite in Phase 3.

---

### `src/ui/webview.ts` (component, request-response)

**Source:** RESEARCH.md Pattern 6 (CSP-correct webview HTML template)

```typescript
// src/ui/webview.ts
import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

function getNonce(): string {
  return randomBytes(16).toString('base64');
}

function getWebviewHtml(_webview: vscode.Webview): string {
  const _nonce = getNonce();  // Pre-wired; used in Phase 3 for script-src nonce
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
      enableScripts: false,          // No scripts in Phase 1 — prevents CSP violation
      retainContextWhenHidden: true, // D-03/D-04: retain for all phases
    }
  );
  panel.webview.html = getWebviewHtml(panel.webview);
  context.subscriptions.push(panel);
  return panel;
}
```

**Critical constraints:**
- `enableScripts: false` — mandatory for Phase 1. Setting `true` without a `script-src` CSP directive causes console violations (Pitfall 2).
- `retainContextWhenHidden: true` — locked by D-03/D-04 for all phases.
- `getNonce()` is pre-wired but unused in Phase 1. Phase 3 adds it to `script-src 'nonce-${nonce}'`.
- Use `import { randomBytes } from 'crypto'` — Node.js built-in.

---

### `test/suite/extension.test.ts` (test)

**Source:** RESEARCH.md Code Examples section

```typescript
// test/suite/extension.test.ts
import * as assert from 'assert';

suite('Extension smoke test', () => {
  test('placeholder — test infrastructure is wired', () => {
    assert.ok(true);
  });
});
```

**Note:** This placeholder ensures `npm test` exits 0 (Pitfall 5). The Mocha `suite()` / `test()` API (not `describe()` / `it()`) is the VS Code extension test convention. No `import * as vscode` needed here — the smoke test just validates the infrastructure wires correctly.

---

## Shared Patterns

### No-VS-Code-in-Core Boundary (D-02)

**Apply to:** All files under `src/core/`

The boundary is enforced by import discipline. The pattern is:

```typescript
// CORRECT — src/core/ file
import type { LogEvent } from '../types';   // types.ts has no vscode dependency
import { createHash } from 'crypto';        // Node.js built-in

// WRONG — never in src/core/
// import * as vscode from 'vscode';
```

Pass `vscode.Uri` values as plain `string` at the `src/extension/` → `src/core/` boundary. Convert in `activate.ts` or `commands.ts` before calling core functions.

### Subscription Disposal Pattern

**Apply to:** `src/extension/activate.ts`, `src/ui/sidebar.ts`, `src/ui/webview.ts`

```typescript
// Always push disposables to context.subscriptions
context.subscriptions.push(
  vscode.commands.registerCommand('logautopsy.*', handler)
);
// Or for panels/providers:
context.subscriptions.push(panel);
```

VS Code automatically disposes all subscriptions when the extension deactivates. Not pushing to subscriptions causes resource leaks.

### Command ID Namespace

**Apply to:** All files with `vscode.commands.*` calls and `package.json`

All command IDs use the `logautopsy.*` prefix:
- `logautopsy.runAnalysis`
- `logautopsy.openWebview`

View and container IDs also use the namespace:
- View container: `logautopsy-container`
- Tree view: `logautopsy.sidebar`
- Webview panel type: `logautopsy.detail`

### Node.js Built-ins Only

**Apply to:** `src/core/aggregator.ts`, `src/ui/webview.ts`

```typescript
import { createHash } from 'crypto';        // SHA-256 — not js-sha256
import { randomBytes } from 'crypto';       // Nonce — not custom random
// fetch is global in Node.js 18+ — no import needed for Phase 4 GitLab calls
```

CLAUDE.md explicitly forbids npm alternatives for crypto and HTTP.

---

## No Analog Found

All 12 files have no in-codebase analog. This is expected — Phase 1 establishes the codebase from scratch.

| File | Role | Data Flow | Reference Instead |
|------|------|-----------|-------------------|
| `package.json` | config | — | RESEARCH.md Pattern 5 |
| `tsconfig.json` | config | — | RESEARCH.md Pattern 3 |
| `esbuild.js` | build-script | — | RESEARCH.md Pattern 1 |
| `.vscode-test.mjs` | test-runner config | — | RESEARCH.md Pattern 4 |
| `.vscodeignore` | packaging config | — | RESEARCH.md Code Examples |
| `media/icon.svg` | asset | — | RESEARCH.md Code Examples |
| `.vscode/launch.json` | debug config | — | VS Code helloworld-sample convention |
| `src/types.ts` | model | — | CLAUDE.md spec §5 interfaces |
| `src/extension/activate.ts` | entry-point | request-response | RESEARCH.md Pattern 7 |
| `src/extension/commands.ts` | controller | request-response | RESEARCH.md Pattern 7 (derived) |
| `src/core/parser.ts` | service | transform | CLAUDE.md log format + spec §3 |
| `src/core/detector.ts` | service | transform | CLAUDE.md Phase 1 rules |
| `src/core/aggregator.ts` | service | transform | CLAUDE.md Phase 1 rules |
| `src/ui/sidebar.ts` | component | event-driven | RESEARCH.md Pattern 7 + VS Code TreeDataProvider API |
| `src/ui/webview.ts` | component | request-response | RESEARCH.md Pattern 6 |
| `test/suite/extension.test.ts` | test | — | RESEARCH.md Code Examples |

---

## Metadata

**Analog search scope:** Entire repository (`/Users/pavelspakowski/sw_dev/LogAutopsy/`)
**Files scanned:** 0 TypeScript source files (no `src/` directory exists)
**Pattern extraction date:** 2026-04-19
**Pattern sources:** RESEARCH.md (verified HIGH confidence), CLAUDE.md (locked decisions), VS Code official extension samples
