# Architecture Research — LogAutopsy VS Code Extension

**Confidence:** HIGH for VS Code APIs | LOW for Continue integration

---

## Key Findings

- **Extension host vs webview is the dominant architectural constraint.** All data processing, VS Code API calls, filesystem access, symbol resolution, Continue calls, and GitLab HTTP calls must run in the extension host. The webview is display-only and communicates exclusively via `postMessage`.
- **Continue integration is the highest-risk component.** Its programmatic API surface for third-party callers is not formally documented. Recommended mitigation: `AiBackend` interface with a `NullAiBackend` fallback so all other functionality ships independently.
- **`vscode.executeWorkspaceSymbolProvider` is the correct symbol resolution path**, but requires the C# language server (OmniSharp / C# Dev Kit) to be active and the workspace indexed. Absence of a language server must be a graceful no-op.
- **Webview→host message passing requires an explicit "ready" handshake** — `postMessage` calls sent before the webview script loads are silently dropped.
- **Build order matters:** Phase 1 parsing pipeline should be built and unit-tested before any VS Code UI is wired up — those are pure TypeScript functions with no VS Code dependency. Continue integration should be last.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  VS Code Extension Host Process (Node.js)                                   │
│                                                                             │
│  ┌──────────────┐   activate()   ┌──────────────────────────────────────┐  │
│  │  extension   │───────────────▶│         ExtensionController          │  │
│  │  entry point │                │  (command reg, state holder,         │  │
│  │  (extension  │                │   lifecycle coordinator)             │  │
│  │   .ts)       │                └──────┬───────────────────────┬──────┘  │
│  └──────────────┘                       │                       │          │
│                                         │                       │          │
│            ┌────────────────────────────┘                       │          │
│            ▼                                                     │          │
│  ┌─────────────────────┐                        ┌───────────────▼──────┐  │
│  │  SidebarProvider    │                        │  ResultsWebview      │  │
│  │  (TreeDataProvider) │   postMessage          │  Panel               │  │
│  │                     │◀──────────────────────▶│  (WebviewPanel)      │  │
│  │  - Load Artifacts   │                        │                      │  │
│  │  - Run Analysis     │                        │  - Anomaly detail    │  │
│  │  - Results tree     │                        │  - RCA display       │  │
│  │  - Create Issue     │                        │  - Nav links         │  │
│  └────────┬────────────┘                        │  - Create Issue btn  │  │
│           │ calls                               └──────────────────────┘  │
│           ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     AnalysisEngine (Phase 1)                        │  │
│  │                                                                     │  │
│  │  LogParser → FeatureParser → StepExtractor → AnomalyDetector       │  │
│  │                                                → Aggregator         │  │
│  │                                    returns AggregatedAnomaly[]      │  │
│  └──────────────────────────────────────────┬──────────────────────────┘  │
│                                             ▼                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                       Phase2Orchestrator                             │  │
│  │                                                                      │  │
│  │  SymbolResolver ──▶ CodeExtractor ──▶ ContinueClient (AiBackend)    │  │
│  │  (executeWorkspace   (openTextDoc     (getExtension or command bus;  │  │
│  │   SymbolProvider)     + getText)       NullAiBackend fallback)       │  │
│  │                                    returns RootCauseAnalysis         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  GitLabClient (fetch + PAT from SecretStorage)                             │
│  OutputChannel (vscode.window.createOutputChannel)                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│  Webview (sandboxed iframe)      │     │  Continue Extension               │
│                                  │     │                                   │
│  - HTML + vanilla JS             │     │  Called ONLY from extension host  │
│  - NO vscode.* API               │     │  via getExtension().exports OR    │
│  - NO Node.js APIs               │     │  command bus — never from         │
│  - acquireVsCodeApi().postMessage│     │  the webview                      │
│    is the ONLY outbound channel  │     │                                   │
└──────────────────────────────────┘     └──────────────────────────────────┘
```

---

## Extension Host vs Webview Boundary

**Extension Host (Node.js) — ALL of LogAutopsy's logic:**
- Full `vscode.*` API access (TreeDataProvider, commands, workspace, window, extensions)
- Node.js APIs: `crypto`, `Buffer`
- `vscode.workspace.fs` for file I/O (required for remote/WSL)
- `vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query)`
- `vscode.workspace.openTextDocument()` for code extraction
- `vscode.extensions.getExtension(id).exports` for Continue API
- `fetch()` for GitLab REST calls
- Log parsing, anomaly detection, aggregation — all pure TypeScript here

**Webview (sandboxed iframe) — display only:**
- Renders HTML/CSS/JS with no Node.js access
- `acquireVsCodeApi().postMessage(msg)` is the only outbound channel
- `window.addEventListener('message', handler)` for inbound from host
- Can reference VS Code theme CSS variables (`--vscode-*`) for consistent theming
- Cannot import `vscode`, call other extensions, or use `fs`

**Rule:** If it touches data, services, or VS Code state → extension host. If it's pixels → webview. The webview receives a fully-computed `AnalysisResult` payload and renders it. It sends back only user intents.

---

## Message Passing Contract

```typescript
// Host → Webview
type HostMessage =
  | { type: 'showAnalysis'; payload: AnalysisResult }
  | { type: 'analysisStarted' }
  | { type: 'analysisError'; message: string };

// Webview → Host
type WebviewMessage =
  | { type: 'ready' }                                        // sent when webview script loads
  | { type: 'createIssue'; anomalyKey: string }
  | { type: 'navigateToSource'; filePath: string; line: number };
```

**Critical: implement the "ready" handshake.** `postMessage` calls sent before the webview script initializes are silently dropped.

```typescript
// Host side
panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
  if (msg.type === 'ready') {
    panel.webview.postMessage({ type: 'showAnalysis', payload: currentResult });
  }
  if (msg.type === 'navigateToSource') {
    const uri = vscode.Uri.file(msg.filePath);
    vscode.window.showTextDocument(uri, {
      selection: new vscode.Range(msg.line, 0, msg.line, 0)
    });
  }
  if (msg.type === 'createIssue') {
    handleCreateIssue(msg.anomalyKey);
  }
});
```

Use `retainContextWhenHidden: true` on WebviewPanel to avoid re-rendering cost.

---

## Continue Integration

Three mechanisms exist, in order of preference:

**1. Extension Exports API (try first):**
```typescript
const ext = vscode.extensions.getExtension('Continue.continue');
if (!ext) { return nullFallback(); }
if (!ext.isActive) { await ext.activate(); }
const api = ext.exports as ContinuePublicApi;
const result = await api.sendRequest(payload);
```

**2. VS Code Command Bus (fallback):**
```typescript
const result = await vscode.commands.executeCommand('continue.someCommand', payload);
```

**Recommended design:** Define an `AiBackend` interface. Implement `ContinueExtensionAdapter` and `NullAiBackend`. The null backend is the fallback when Continue is unavailable.

```typescript
interface AiBackend {
  isAvailable(): Promise<boolean>;
  analyzeRootCause(payload: ContinueRequestPayload): Promise<ContinueResponse>;
}
```

**Continue integration is the highest-risk component. Build it last.** Requires empirical validation against a live Continue installation.

---

## Symbol Resolution

```typescript
const simpleClassName = sourceClass.split('.').pop() ?? sourceClass; // strip namespace
const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
  'vscode.executeWorkspaceSymbolProvider',
  simpleClassName
) ?? [];
```

**Confidence assignment:**
- `kind === SymbolKind.Class` match + `kind === SymbolKind.Method` match in same file → 1.0
- Partial class match + exact method → 0.7
- Method name only → 0.3

**Method body extraction:** `vscode.workspace.openTextDocument(uri)` then `document.getText(methodSymbol.location.range)`.

---

## In-Memory State

No persistent storage needed. `ExtensionController` holds:

```typescript
class ExtensionController {
  private currentResult: AnalysisResult | undefined;
  private detailPanel: vscode.WebviewPanel | undefined;
  private sidebarProvider: SidebarProvider;
  private outputChannel: vscode.OutputChannel;
}
```

On new analysis: update `currentResult`, call `sidebarProvider.refresh()`, post to `detailPanel` if alive.

---

## Progress and Error Handling

```typescript
await vscode.window.withProgress(
  { location: vscode.ProgressLocation.Notification,
    title: 'LogAutopsy: Analyzing...', cancellable: true },
  async (progress, token) => {
    progress.report({ increment: 0,  message: 'Parsing logs...' });
    progress.report({ increment: 40, message: 'Detecting anomalies...' });
    progress.report({ increment: 70, message: 'Resolving symbols...' });
    progress.report({ increment: 85, message: 'Requesting AI analysis...' });
  }
);
```

**Error tiers:**
- User errors (wrong folder, no log files): `showErrorMessage` with actionable message
- Recoverable failures (Continue unavailable, empty symbol results): warning + partial result — never block the user
- Internal errors: catch at command handler, log to OutputChannel, show `showErrorMessage` with "View Output" action

Never use `console.log` in a VS Code extension — it is invisible to users.

---

## Full Data Flow

```
User selects folder
  └── SidebarProvider.loadArtifacts()
        └── discovers BatchRun structure, stores paths
        └── refresh() → TreeView shows "Ready"

User clicks "Run Analysis"
  └── ExtensionController.runAnalysis()
        └── vscode.window.withProgress(...)
              └── [for each test case in batch]
                    ├── LogParser.parse(combinedLogPath)          → LogEvent[]
                    ├── FeatureParser.parse(featureFilePath)      → phase mapping
                    ├── StepExtractor.extract(events, mapping)    → StepContext[]
                    ├── AnomalyDetector.detect(events, steps)     → Anomaly[]
                    ├── Aggregator.aggregate(anomalies)           → AggregatedAnomaly[]
                    └── Phase2Orchestrator.enrich(anomalies)
                          ├── SymbolResolver.resolve(primaryHint) → CodeCandidate[]
                          ├── CodeExtractor.extract(topCandidate) → code string
                          └── ContinueClient.analyze(payload)     → RootCauseAnalysis
              └── AnalysisResult assembled
        └── currentResult = result; sidebarProvider.refresh()

User clicks anomaly in tree
  └── ExtensionController.showDetail(anomalyKey)
        └── ResultsWebviewPanel.create() or reveal()
              └── webview sends 'ready'
              └── host posts { type: 'showAnalysis', payload: rca }
              └── webview renders

User clicks "Create Issue" in webview
  └── webview posts { type: 'createIssue', anomalyKey }
        └── host shows confirmation dialog
              └── on confirm: GitLabClient.createIssue(issueCandidate)
```

---

## Suggested Build Order

| Stage | What                                                                                       | Why This Order                                 |
|-------|--------------------------------------------------------------------------------------------|------------------------------------------------|
| 1     | Scaffold: `package.json`, `activate()` stub, empty TreeDataProvider, OutputChannel         | Validates dev loop                             |
| 2     | Phase 1 pipeline: LogParser → FeatureParser → StepExtractor → AnomalyDetector → Aggregator | Pure TypeScript, unit-testable without VS Code |
| 3     | TreeView UI: wire "Run Analysis" command + anomaly hierarchy display                       | Needs Phase 1 data                             |
| 4     | WebviewPanel: HTML scaffold, message-passing handshake, anomaly detail render              | Needs TreeView wiring                          |
| 5     | Symbol resolution + code navigation: `SymbolResolver`, `CodeExtractor`, `NullAiBackend`    | Delivers value without AI                      |
| 6     | Continue integration: inspect `ext.exports`, implement `ContinueExtensionAdapter`          | Highest risk — last                            |
| 7     | GitLab integration: `GitLabClient`, confirmation dialog, PAT via `SecretStorage`           | Depends on full RCA output                     |

---

## Component Boundaries Summary

| Component             | Lives In                      | Primary VS Code API                   | Depends On                   |
|-----------------------|-------------------------------|---------------------------------------|------------------------------|
| `ExtensionController` | Host                          | `commands`, `window`, `workspace`     | All components               |
| `SidebarProvider`     | Host                          | `TreeDataProvider`, `TreeItem`        | `AnalysisEngine`             |
| `ResultsWebviewPanel` | Host shell + webview renderer | `WebviewPanel`, `postMessage`         | `ExtensionController`        |
| `LogParser`           | Host                          | `workspace.fs`                        | Nothing                      |
| `FeatureParser`       | Host                          | `workspace.fs` + `@cucumber/gherkin`  | Nothing                      |
| `StepExtractor`       | Host                          | Pure TypeScript                       | `LogParser`, `FeatureParser` |
| `AnomalyDetector`     | Host                          | Pure TypeScript                       | `StepExtractor`              |
| `Aggregator`          | Host                          | Node `crypto` (SHA-256)               | `AnomalyDetector`            |
| `SymbolResolver`      | Host                          | `commands.executeCommand`             | Nothing                      |
| `CodeExtractor`       | Host                          | `workspace.openTextDocument`          | `SymbolResolver`             |
| `ContinueClient`      | Host                          | `extensions.getExtension`, `commands` | `CodeExtractor`              |
| `GitLabClient`        | Host                          | `SecretStorage`, `fetch`              | `IssueCandidate`             |
| `OutputChannel`       | Host                          | `window.createOutputChannel`          | Nothing                      |

---

## Open Questions

- What does `vscode.extensions.getExtension('Continue.continue')?.exports` actually return? Blocking question for Stage 6 — inspect at runtime in Extension Development Host.
- Does Continue expose a command accepting structured JSON and returning structured analysis output?
- Does the team need WSL/remote workspace support? If yes, `vscode.workspace.fs` is mandatory everywhere.
