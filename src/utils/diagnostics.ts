import * as vscode from 'vscode';

const CHANNEL_NAME = 'Test Analysis Agent Diagnostics';

let logChannel: vscode.LogOutputChannel | undefined;
let lastDiagnosticMessage = '';

export function getDiagnosticsChannel(): vscode.LogOutputChannel {
  if (!logChannel) {
    logChannel = vscode.window.createOutputChannel(CHANNEL_NAME, { log: true });
  }

  return logChannel;
}

export function formatDiagnosticError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ? `${error.message}\n${error.stack}` : error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function summarizeDiagnosticError(error: unknown, maxLength = 160): string {
  const compact = formatDiagnosticError(error).replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1)}…`;
}

export function setLastDiagnosticMessage(message: string): void {
  lastDiagnosticMessage = message;
}

export function getLastDiagnosticMessage(): string {
  return lastDiagnosticMessage;
}

export function revealDiagnosticsChannel(preserveFocus = false): void {
  getDiagnosticsChannel().show(preserveFocus);
}
