# Stack Research — LogAutopsy VS Code Extension

**Confidence:** HIGH (VS Code API, Node.js built-ins, packaging) / MEDIUM (Continue integration)

---

## Recommended Stack

| Category             | Choice                                       | Version          | Do NOT use                     |
|----------------------|----------------------------------------------|------------------|--------------------------------|
| Language             | TypeScript                                   | ~5.4             | —                              |
| VS Code engine floor | `@types/vscode`                              | `^1.90.0`        | —                              |
| Bundler              | `esbuild`                                    | `^0.21`          | webpack                        |
| Test runner          | `@vscode/test-cli` + Mocha                   | `^0.0.9` / `^10` | `@vscode/test-electron`, Jest  |
| Gherkin parser       | `@cucumber/gherkin` + `@cucumber/messages`   | `^28` / `^24`    | regex, `gherkin-parse`         |
| SHA-256              | `crypto` (Node.js built-in)                  | —                | `js-sha256`, any npm hash lib  |
| HTTP (GitLab)        | `fetch` (Node.js built-in)                   | —                | `axios`, `node-fetch`          |
| Continue integration | `vscode.extensions.getExtension()` + exports | —                | Direct HTTP to Continue server |
| Packaging            | `@vscode/vsce`                               | `^3`             | old `vsce` package             |

---

## Key Decisions

### Bundler: esbuild, not webpack
`yo code` now scaffolds esbuild by default. 10–50x faster, minimal config for Node.js CJS extension target. Required settings: `platform: 'node'`, `format: 'cjs'`, `external: ['vscode']`.

### Testing: `@vscode/test-cli` + Mocha
`@vscode/test-electron` is deprecated. Use `@vscode/test-cli` (configured via `.vscode-test.mjs`). The deterministic pipeline (log parser, aggregator) should be tested with plain Mocha unit tests — no VS Code host needed for those layers.

### Gherkin: `@cucumber/gherkin` v28 + `@cucumber/messages` v24
Feature files are real Gherkin. A proper parser gives a typed AST (`GherkinDocument → Feature → Scenario → Step`) with keyword, keyword type, and location (`line:col`) — exactly matching the `GherkinStep` data contract. Regex will require repeated patching.

### SHA-256: Node.js built-in `crypto`
`import { createHash } from 'crypto'` — no library needed.

### GitLab REST: built-in `fetch`
Node.js 20 LTS (bundled in VS Code 1.90+) exposes `fetch` globally. No `axios`, `node-fetch`, or `got` needed.

---

## VS Code API Surface Required

All from the `vscode` built-in module — nothing to install:

| API                                                                              | Purpose                                                             |
|----------------------------------------------------------------------------------|---------------------------------------------------------------------|
| `vscode.window.createTreeView` + `TreeDataProvider<T>`                           | Sidebar anomaly list                                                |
| `vscode.window.createWebviewPanel` with `retainContextWhenHidden: true`          | Results detail view                                                 |
| `vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)` | C# symbol lookup — returns `SymbolInformation[]`                    |
| `vscode.workspace.openTextDocument` + `TextDocument.getText(range)`              | Method body extraction for Continue payload                         |
| `vscode.workspace.fs` (NOT Node.js `fs`)                                         | File discovery and log reading — required for remote/WSL workspaces |
| `vscode.window.showOpenDialog`                                                   | Artifact folder picker                                              |
| `vscode.window.withProgress`                                                     | Progress notification during analysis                               |
| `vscode.workspace.getConfiguration`                                              | Extension settings (GitLab URL, PAT, Continue extension ID)         |

**Critical:** Use `vscode.workspace.fs` instead of Node.js `fs` for all file I/O. The `fs` module breaks in remote workspace scenarios (SSH, WSL, Dev Containers).

---

## Continue Integration Pattern

```typescript
async function callContinue(payload: ContinueRequest): Promise<ContinueResponse | null> {
  const ext = vscode.extensions.getExtension(
    config.get<string>('logautopsy.continue.extensionId', 'Continue.continue')
  );
  if (!ext) return null; // graceful fallback
  if (!ext.isActive) await ext.activate();
  if (ext.exports?.analyzeRootCause) return ext.exports.analyzeRootCause(payload);
  return vscode.commands.executeCommand('continue.rootCauseAnalysis', payload);
}
```

The Continue extension's public API is not formally versioned — treat as MEDIUM confidence. Verify `ext.exports` at runtime in the team environment before committing to a specific API shape.

---

## package.json Key Fields

```json
{
  "engines": { "vscode": "^1.90.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onCommand:logautopsy.runAnalysis"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "logautopsy", "title": "LogAutopsy", "icon": "..." }]
    },
    "views": {
      "logautopsy": [{ "id": "logautopsy.resultsTree", "name": "Test Analysis" }]
    },
    "configuration": {
      "properties": {
        "logautopsy.continue.extensionId": { "type": "string", "default": "Continue.continue" },
        "logautopsy.gitlab.baseUrl": { "type": "string" },
        "logautopsy.gitlab.projectId": { "type": "string" },
        "logautopsy.gitlab.pat": { "type": "string" }
      }
    }
  }
}
```

Use `activationEvents: ["onCommand:..."]` — never `"*"`. Eager activation penalises VS Code startup for all users.

---

## Open Questions

- What VS Code commands or exported API does the team's specific Continue installation expose? Run `ext.exports` inspection at runtime before building the integration adapter.
- What is the exact Continue extension ID — `Continue.continue` or `continue-dev.continue`? Make it configurable.
- Does the team need WSL/remote workspace support? If yes, `vscode.workspace.fs` is mandatory.

---

## Confidence Assessment

| Area                                                           | Level  | Reason                                                |
|----------------------------------------------------------------|--------|-------------------------------------------------------|
| VS Code API (TreeView, Webview, workspace.fs, symbol provider) | HIGH   | Stable, documented APIs unchanged since VS Code 1.74+ |
| Toolchain (esbuild, `@vscode/test-cli`, `@vscode/vsce`)        | HIGH   | Official Microsoft tooling                            |
| Gherkin parsing (`@cucumber/gherkin`)                          | HIGH   | Official Cucumber project; v28 is current stable      |
| Node.js built-ins (crypto, fetch)                              | HIGH   | Stable Node.js 18+/20 LTS APIs                        |
| Continue integration                                           | MEDIUM | Public API not formally versioned; verify at runtime  |
