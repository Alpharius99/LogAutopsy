// src/extension/activate.ts
import * as vscode from 'vscode';
import { registerCommands } from '../commands';
import { TestAnalysisControlPanelProvider } from '../ui/controlPanelView';
import { LogAutopsySidebarProvider } from '../ui/sidebar';
import { AnalysisStore } from '../utils/analysisStore';
import { getDiagnosticsChannel } from '../utils/diagnostics';

export function activate(context: vscode.ExtensionContext): void {
  const store = new AnalysisStore();
  const diagnosticsChannel = getDiagnosticsChannel();
  registerCommands(context, store);
  const controlPanelProvider = new TestAnalysisControlPanelProvider(context.extensionUri, store);
  const sidebarProvider = new LogAutopsySidebarProvider(store);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('testAnalysisAgent.controls', controlPanelProvider)
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('testAnalysisAgent.sidebar', sidebarProvider)
  );
  context.subscriptions.push(diagnosticsChannel);
  context.subscriptions.push(store);
}

export function deactivate(): void {
  // Extension state is ephemeral per session.
}
