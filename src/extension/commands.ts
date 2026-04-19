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
