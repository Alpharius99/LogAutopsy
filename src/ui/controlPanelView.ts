import * as vscode from 'vscode';
import type { AnalysisStore } from '../utils/analysisStore';

type ControlCommand =
  | 'testAnalysisAgent.loadLogOnly'
  | 'testAnalysisAgent.runPhase1Analysis'
  | 'testAnalysisAgent.runRootCauseAnalysis'
  | 'testAnalysisAgent.createGitLabIssues'
  | 'testAnalysisAgent.copyContinuePrompt';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class TestAnalysisControlPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: AnalysisStore
  ) {
    this.store.onDidChange(() => this.render());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage((message: { command?: string; anomalyKey?: string }) => {
      if (!message.command) {
        return;
      }

      if (message.command === 'testAnalysisAgent.selectRootCausePrompt') {
        void vscode.commands.executeCommand(message.command, message.anomalyKey);
        return;
      }

      void vscode.commands.executeCommand(message.command);
    });

    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }

    const webview = this.view.webview;
    const state = this.store.getState();
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const artifactName = state.artifact
      ? `${state.artifact.name} (log only)`
      : 'No artifacts loaded';
    const inputMode = state.artifact ? 'Log only' : 'No input selected';
    const phase1Summary = state.phase1
      ? `${state.phase1.aggregated.length} grouped anomalies across ${state.phase1.steps.length} steps`
      : 'Phase 1 has not been run yet';
    const rootCauseSummary =
      state.rootCauses.length > 0
        ? `${state.rootCauses.length} Continue packets available`
        : 'Root cause analysis has not been run yet';
    const selectedRootCause =
      state.rootCauses.find((item) => item.anomalyKey === state.selectedRootCauseKey) ?? state.rootCauses[0];
    const promptPreview = selectedRootCause?.continuePrompt ?? '';
    const promptListHtml =
      state.rootCauses.length > 0
        ? state.rootCauses
            .map((result) => {
              const selected = result.anomalyKey === selectedRootCause?.anomalyKey;
              return `<button class="prompt-chip${selected ? ' selected' : ''}" data-command="testAnalysisAgent.selectRootCausePrompt" data-anomaly-key="${escapeHtml(result.anomalyKey)}">${escapeHtml(result.finalOutput.issue_fields.step)} · ${escapeHtml(result.finalOutput.issue_fields.class)}.${escapeHtml(result.finalOutput.issue_fields.method)}</button>`;
            })
            .join('')
        : '<p>No Continue packet prepared yet.</p>';

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
  >
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
      --panel: var(--vscode-sideBar-background);
      --border: var(--vscode-panel-border);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --button: var(--vscode-button-background);
      --buttonHover: var(--vscode-button-hoverBackground);
      --buttonFg: var(--vscode-button-foreground);
      --badge: var(--vscode-badge-background);
      --badgeFg: var(--vscode-badge-foreground);
    }

    body {
      margin: 0;
      padding: 12px;
      background: linear-gradient(180deg, var(--panel) 0%, color-mix(in srgb, var(--panel) 86%, black) 100%);
      color: var(--fg);
      font-family: var(--vscode-font-family);
    }

    .stack {
      display: grid;
      gap: 12px;
    }

    .card {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      background: color-mix(in srgb, var(--panel) 92%, white 8%);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    }

    .eyebrow {
      margin: 0 0 6px 0;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    h2 {
      margin: 0 0 8px 0;
      font-size: 20px;
      line-height: 1.2;
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }

    .status-grid {
      display: grid;
      gap: 8px;
    }

    .status-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: flex-start;
      border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
      padding-top: 8px;
    }

    .status-row:first-child {
      border-top: none;
      padding-top: 0;
    }

    .status-label {
      font-size: 12px;
      color: var(--muted);
    }

    .status-value {
      text-align: right;
      font-size: 12px;
      max-width: 55%;
    }

    .button-list {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }

    button {
      width: 100%;
      border: none;
      border-radius: 8px;
      padding: 12px 14px;
      background: var(--button);
      color: var(--buttonFg);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, opacity 120ms ease;
    }

    button:hover {
      background: var(--buttonHover);
      transform: translateY(-1px);
    }

    button:disabled {
      opacity: 0.55;
      cursor: default;
      transform: none;
    }

    .secondary {
      background: color-mix(in srgb, var(--button) 35%, transparent);
      color: var(--fg);
      border: 1px solid color-mix(in srgb, var(--button) 45%, var(--border));
    }

    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      background: var(--badge);
      color: var(--badgeFg);
      font-size: 11px;
      padding: 3px 8px;
      margin-top: 10px;
    }

    .prompt-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }

    .prompt-chip {
      width: auto;
      text-align: left;
      padding: 8px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--button) 28%, transparent);
      border: 1px solid color-mix(in srgb, var(--button) 45%, var(--border));
      color: var(--fg);
      font-size: 12px;
      font-weight: 500;
    }

    .prompt-chip.selected {
      background: color-mix(in srgb, var(--button) 78%, transparent);
      color: var(--buttonFg);
    }

    .prompt-actions {
      display: grid;
      gap: 10px;
      margin-bottom: 12px;
    }

    pre {
      margin: 0;
      padding: 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--panel) 84%, black 16%);
      border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
      color: var(--fg);
      overflow: auto;
      max-height: 320px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.45;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="stack">
    <section class="card">
      <div class="eyebrow">Test Analysis Agent</div>
      <h2>Control Panel</h2>
      <p>Load a log file, then run the analysis workflow.</p>
      <div class="pill">${escapeHtml(state.artifact ? inputMode : 'Waiting for input')}</div>
      <div class="button-list">
        ${this.buttonHtml('Load Log Only', 'testAnalysisAgent.loadLogOnly')}
        ${this.buttonHtml(
          'Run Phase 1 Analysis',
          'testAnalysisAgent.runPhase1Analysis',
          !state.artifact
        )}
        ${this.buttonHtml(
          'Run Root Cause Analysis',
          'testAnalysisAgent.runRootCauseAnalysis',
          !state.artifact
        )}
        ${this.buttonHtml(
          'Create GitLab Issues',
          'testAnalysisAgent.createGitLabIssues',
          state.rootCauses.length === 0,
          'secondary'
        )}
      </div>
    </section>

    <section class="card">
      <div class="eyebrow">Current State</div>
      <div class="status-grid">
        <div class="status-row">
          <div class="status-label">Input Mode</div>
          <div class="status-value">${escapeHtml(inputMode)}</div>
        </div>
        <div class="status-row">
          <div class="status-label">Artifact</div>
          <div class="status-value">${escapeHtml(artifactName)}</div>
        </div>
        <div class="status-row">
          <div class="status-label">Phase 1</div>
          <div class="status-value">${escapeHtml(phase1Summary)}</div>
        </div>
        <div class="status-row">
          <div class="status-label">Root Cause</div>
          <div class="status-value">${escapeHtml(rootCauseSummary)}</div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="eyebrow">Continue Packet</div>
      <p>Prepared investigation input stays here after analysis. Select a packet, then copy it into Continue chat.</p>
      <div class="prompt-list">${promptListHtml}</div>
      <div class="prompt-actions">
        ${this.buttonHtml(
          'Copy Selected Continue Prompt',
          'testAnalysisAgent.copyContinuePrompt',
          !selectedRootCause
        )}
      </div>
      <pre>${escapeHtml(promptPreview || 'No Continue prompt selected yet.')}</pre>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-command]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) {
          return;
        }
        vscode.postMessage({ command: button.dataset.command, anomalyKey: button.dataset.anomalyKey });
      });
    });
  </script>
</body>
</html>`;
  }

  private buttonHtml(
    label: string,
    command: ControlCommand,
    disabled = false,
    variant = ''
  ): string {
    const classAttr = variant ? ` class="${variant}"` : '';
    const disabledAttr = disabled ? ' disabled' : '';
    return `<button${classAttr} data-command="${command}"${disabledAttr}>${escapeHtml(label)}</button>`;
  }
}
