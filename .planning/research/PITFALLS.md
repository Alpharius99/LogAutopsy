# Pitfalls Research — LogAutopsy VS Code Extension

**Confidence:** HIGH across all areas (VS Code extension API surface is stable and well-documented)

---

## Critical Pitfalls

### C1: Calling Continue Before It Has Activated

`vscode.extensions.getExtension('continue.continue')` returns a non-null `Extension<T>` object even when Continue has not activated. `.exports` is `undefined` until `.activate()` resolves. Code that dereferences exports without first awaiting `activate()` crashes silently. If Continue is not installed, `getExtension` returns `undefined` — any property access causes a crash.

**Warning signs:** Phase 2 always reports "AI analysis unavailable" even when Continue is running. Problem disappears if user manually interacts with Continue first.

**Prevention:**
```typescript
async function getContinueApi(): Promise<ContinueApi | null> {
  const ext = vscode.extensions.getExtension('continue.continue');
  if (!ext) { return null; }
  if (!ext.isActive) {
    try { await ext.activate(); } catch { return null; }
  }
  const api = ext.exports;
  if (!api || typeof api.sendMessage !== 'function') { return null; } // duck-type check
  return api;
}
```

**Phase:** Stage 6 (Continue integration). Implement the fallback path first.

---

### C2: Extension Host Blocking During Log Parsing

The extension host is single-threaded Node.js. A synchronous parse loop on a 10k-line file blocks ALL of VS Code — commands time out, progress indicators freeze, cancel button stops responding. On network shares (common in automotive test environments) this can reach 1–3 seconds.

**Warning signs:** VS Code visibly freezes during analysis in the Extension Development Host. Clicking "Cancel" does nothing mid-parse.

**Prevention:** Use `vscode.workspace.fs.readFile` (async), then process in 500-line chunks with `setImmediate` yields:

```typescript
async function parseLogFile(uri: vscode.Uri, token: vscode.CancellationToken): Promise<LogEvent[]> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const lines = new TextDecoder().decode(bytes).split('\n');
  const events: LogEvent[] = [];
  for (let i = 0; i < lines.length; i += 500) {
    if (token.isCancellationRequested) break;
    for (const line of lines.slice(i, i + 500)) { /* parse */ }
    await new Promise(r => setImmediate(r)); // yield to event loop
  }
  return events;
}
```

**Phase:** Stage 2 (log parsing). Design the pipeline async from the start — retrofitting is painful.

---

### C3: `executeWorkspaceSymbolProvider` Returns Stale or Empty Results for C#

Four distinct failure modes:

**a) Language server not yet indexed.** First call after workspace open returns empty array — OmniSharp/Roslyn is still indexing. No VS Code API to wait for indexing completion. Most common "not found" false negative.

**b) Dotted class names don't match.** `AdapterXil.WebApiCalls` as the query returns zero results. Query must be the simple name (`WebApiCalls`), then re-rank candidates whose containing type matches the namespace prefix.

**c) Stale line numbers after file edits.** If a developer edits source while the webview is open, cached symbol positions drift. Always re-open via `vscode.workspace.openTextDocument(uri)` at resolution time.

**d) Large result sets from common class names.** `Connector`, `Logger`, `Handler` could return 20+ candidates. Cap results.

**Warning signs:** Symbol resolution returns empty on first analysis but succeeds 10 seconds later. Navigation lands in the wrong method.

**Prevention:**
```typescript
const simpleClassName = sourceClass.split('.').pop() ?? sourceClass; // strip namespace

async function resolveSymbol(className: string, token: vscode.CancellationToken) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const results: vscode.SymbolInformation[] = await vscode.commands.executeCommand(
      'vscode.executeWorkspaceSymbolProvider', className
    ) ?? [];
    if (results.length > 0) return results.slice(0, 10); // cap candidates
    if (token.isCancellationRequested) return [];
    await new Promise(r => setTimeout(r, 2000)); // retry backoff
  }
  return [];
}
```

**Phase:** Stage 5 (symbol resolution). Retry logic and namespace-stripping must be in place before wiring to Continue.

---

### C4: WebviewPanel CSP Violations Silently Break the UI

Most common mistakes:
- `<script>` tags missing `nonce="..."` — blocked silently with no visible error
- `'unsafe-inline'` for styles — works locally, blocked in remote contexts (WSL, SSH)
- Loading resources from `localhost` or `http://` — blocked; must use `webview.asWebviewUri()`
- `localResourceRoots` not including `out/` or `media/` — all assets 404 silently
- Stale nonce reused across renders

**Warning signs:** Webview renders skeleton HTML but results never appear. "Create Issue" button is dead. Works in dev (F5) but breaks after installing the VSIX.

**Prevention:**
```typescript
function getNonce() {
  return [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
}

function buildWebviewHtml(webview: vscode.Webview, extUri: vscode.Uri): string {
  const nonce = getNonce(); // fresh per render
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'out', 'webview.js'));
  const styleUri  = webview.asWebviewUri(vscode.Uri.joinPath(extUri, 'media', 'webview.css'));
  const csp = [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}'`,
    `style-src ${webview.cspSource} 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
  ].join('; ');
  return `<!DOCTYPE html><html><head>
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <link rel="stylesheet" nonce="${nonce}" href="${styleUri}">
  </head><body>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body></html>`;
}

// Include localResourceRoots when creating the panel
const panel = vscode.window.createWebviewPanel('logautopsy.results', 'Results', vscode.ViewColumn.Two, {
  enableScripts: true,
  localResourceRoots: [
    vscode.Uri.joinPath(context.extensionUri, 'out'),
    vscode.Uri.joinPath(context.extensionUri, 'media'),
  ],
  retainContextWhenHidden: true,
});
```

Debug CSP violations: right-click webview → "Open Webview Developer Tools" → Console.

**Phase:** Stage 1 (UI scaffold). Get CSP right at the skeleton stage.

---

### C5: GitLab PAT Stored in Plaintext Settings

Storing the PAT in `vscode.workspace.getConfiguration(...).get('gitlabToken')` puts it in `settings.json` — synced to the cloud by Settings Sync, readable by other extensions, and often accidentally committed.

**Warning signs:** `package.json` `contributes.configuration` has a field named `token`, `pat`, or `secret`. Settings UI shows the token in plaintext.

**Prevention:** Use `context.secrets` (VS Code `SecretStorage`, backed by OS keychain) exclusively. Expose a command `LogAutopsy: Set GitLab Token` that prompts with `showInputBox({ password: true })` and writes to `secrets`.

```typescript
await context.secrets.store('logautopsy.gitlabPat', userInputPat);  // store
const pat = await context.secrets.get('logautopsy.gitlabPat');       // retrieve
```

**Phase:** Stage 7 (GitLab integration). Do not do a "quick" settings-based PAT — `SecretStorage` is the same amount of code.

---

### C6: GitLab REST API — Wrong Auth Header, `fetch` Unavailable, TLS Failures

**a) `fetch` not available on VS Code < 1.73.** Pin `engines.vscode >= 1.73.0` in `package.json`.

**b) Wrong auth header.** GitLab REST API v4 uses `Private-Token: <pat>`, NOT `Authorization: Bearer <pat>`. Wrong header returns 401 — easily confused with a wrong PAT.

**c) Private GitLab TLS.** Many automotive/embedded teams run internal GitLab with self-signed or enterprise CA certificates. Node rejects these with `CERT_HAS_EXPIRED`. Do NOT set `NODE_TLS_REJECT_UNAUTHORIZED=0` — document the VS Code `http.systemCertificates` setting instead.

**Prevention:** Use `'Private-Token': pat` header. Handle 429 (rate limit) explicitly with user-visible error. Document that users with private GitLab need `http.systemCertificates: true` in VS Code settings.

**Phase:** Stage 7. Set `engines.vscode` minimum at project init — affects all polyfill decisions.

---

### C7: Missing `activationEvents` — Extension Never Loads for End Users

VS Code auto-infers activation for commands in `contributes.commands` (since 1.74), but `onView:logautopsy.sidebar` for the TreeView sidebar is NOT auto-inferred and MUST be declared explicitly. Without it, clicking the sidebar icon does nothing — no error, just silence.

Also: `"activationEvents": ["*"]` used during development must be removed before packaging.

**Warning signs:** Extension works perfectly under F5 but commands do nothing after installing the VSIX. Sidebar icon shows but clicking opens nothing.

**Prevention:**
```json
"activationEvents": ["onView:logautopsy.sidebar"]
```

**Phase:** Stage 1 scaffold. Fix before any feature work.

---

### C8: `vsce package` Silently Omits Compiled Output or Webview Assets

If `out/` or `media/` is in `.vscodeignore`, the compiled JS or webview assets won't be in the VSIX. The extension installs but nothing works.

**Warning signs:** Extension works in dev but fails after install from VSIX. `package.json` `main` points to `out/extension.js` but the file is absent in the extracted VSIX.

**Prevention:** Run `vsce ls` before every packaging step. Use esbuild to bundle into a single file — eliminates `node_modules` ambiguity. Do not add `out/**` or `media/**` to `.vscodeignore`.

**Phase:** Stage 1 scaffold. Establish build + package pipeline before features.

---

## Moderate Pitfalls

### M1: Integration Tests Flaky Due to Activation Timing

Tests that invoke commands immediately after VS Code starts observe stale state: C# language server not indexed, TreeView not rendered, `activeTextEditor` undefined. Pass locally, fail on CI.

**Prevention:** Implement a `readyPromise` sentinel in `activate()`. Open a fixture document before invoking commands. Use Mocha `retries: 2` for timing-sensitive tests.

**Phase:** Stage 2. Establish fixture workspace + await-activate pattern from the start.

---

### M2: `postMessage` to Webview Dropped Before Script Ready

Calling `panel.webview.postMessage(data)` immediately after setting `panel.webview.html` drops the message — the HTML is still parsing, `acquireVsCodeApi()` hasn't run yet. Results never appear.

**Prevention:** Have the webview script send `{ type: 'ready' }` first. Buffer messages in the extension until `ready` is received, then flush.

**Phase:** Stage 4 (WebviewPanel scaffold).

---

### M3: Regex Backtracking on Pathological Continuation Lines

`STANDARD_SOURCE` with `(\S+?)\\` can backtrack excessively on long lines containing backslashes but no ` - ` separator (e.g., Windows paths in stack traces).

**Prevention:** Test regexes against worst-case inputs from `examples/` before shipping Phase 1.

---

### M4: TreeView Selection Opens Multiple Webview Panels

`onDidChangeSelection` fires on keyboard navigation. Opening a new panel per selection creates zombie panels with stale message listeners.

**Prevention:** Store one `WebviewPanel` at extension scope. Reuse it via `.reveal()`; recreate only when disposed. Debounce selection handler at 100 ms.

**Phase:** Stage 4 (Results UI).

---

## Phase-Specific Summary

| Phase | Pitfall | Mitigation |
|-------|---------|------------|
| Stage 1 scaffold | Missing `onView` in `activationEvents` | Declare explicitly; test installed VSIX |
| Stage 1 scaffold | `out/` omitted from VSIX | Run `vsce ls`; use esbuild bundle |
| Stage 1 scaffold | `fetch` / `SecretStorage` unavailable on old VS Code | Pin `engines.vscode >= 1.73.0` |
| Stage 1 UI | CSP violations blank the webview | Nonce per render; `webview.cspSource`; `localResourceRoots` |
| Stage 2 parsing | Extension host blocking | Async read + chunked processing with `setImmediate` yields |
| Stage 2 parsing | Regex backtracking | Profile against worst-case samples in `examples/` |
| Stage 4 UI | `postMessage` dropped before script ready | Implement `ready` handshake |
| Stage 4 UI | Multiple panels on rapid selection | Debounce + reuse single panel instance |
| Stage 5 symbols | Empty results when C# server still indexing | Retry with 2s backoff, 3 attempts |
| Stage 5 symbols | Dotted class names return zero results | Strip namespace; query simple class name only |
| Stage 5 symbols | Stale line numbers after file edit | Re-open via `openTextDocument` at resolution time |
| Stage 6 Continue | `exports` undefined before `activate()` | Await `activate()`; duck-type exports |
| Stage 6 Continue | Continue not installed — null dereference | Guard `getExtension` result; show install prompt |
| Stage 7 GitLab | PAT in plaintext `settings.json` | `context.secrets` exclusively |
| Stage 7 GitLab | Wrong auth header | Use `Private-Token` header |
| Stage 7 GitLab | TLS failure on private GitLab | Document `http.systemCertificates`; never disable TLS globally |
| Stage 7 GitLab | Rate limit 429 swallowed | Explicit 429 handling with user-visible message |
| All stages | Flaky integration tests | `readyPromise` sentinel; fixture workspace; Mocha `retries: 2` |
