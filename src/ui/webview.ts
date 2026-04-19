// src/ui/webview.ts
import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

function getNonce(): string {
  return randomBytes(16).toString('base64');
}

function getWebviewHtml(_webview: vscode.Webview): string {
  const _nonce = getNonce();  // Pre-wired; used in Phase 3 for script-src nonce (rename to `nonce` and thread into CSP + <script> tag)
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
