// src/extension/commands.ts
import * as vscode from 'vscode';
import { createOrShowWebviewPanel } from '../ui/webview';

/**
 * Handler for logautopsy.runAnalysis command.
 * Phase 1: placeholder only.
 */
export async function runAnalysis(): Promise<void> {
  vscode.window.showInformationMessage('LogAutopsy: Analysis not yet implemented.');
}

/**
 * Handler for logautopsy.openWebview command.
 * Routes to createOrShowWebviewPanel so all command handlers are co-located here.
 */
export function openWebview(
  context: vscode.ExtensionContext
): void {
  createOrShowWebviewPanel(context);
}
