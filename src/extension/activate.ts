// src/extension/activate.ts
import * as vscode from 'vscode';
import { runAnalysis } from './commands';
import { LogAutopsySidebarProvider } from '../ui/sidebar';
import { createOrShowWebviewPanel } from '../ui/webview';

export function activate(context: vscode.ExtensionContext): void {
  // Register logautopsy.runAnalysis command
  context.subscriptions.push(
    vscode.commands.registerCommand('logautopsy.runAnalysis', () => runAnalysis())
  );

  // Register logautopsy.openWebview command
  context.subscriptions.push(
    vscode.commands.registerCommand('logautopsy.openWebview', () =>
      createOrShowWebviewPanel(context)
    )
  );

  // Register sidebar TreeDataProvider
  const sidebarProvider = new LogAutopsySidebarProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('logautopsy.sidebar', sidebarProvider)
  );
}

export function deactivate(): void {
  // Nothing to clean up in Phase 1
}
