import * as path from 'path';
import * as vscode from 'vscode';
import type { ArtifactPair } from '../models/types';

function isLogFile(filePath: string): boolean {
  return /\.log$/i.test(filePath);
}

export async function pickLogOnlyArtifact(): Promise<ArtifactPair | undefined> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      Logs: ['log'],
    },
    openLabel: 'Load Log Only',
  });

  const logFile = selection?.[0];
  if (!logFile) {
    return undefined;
  }

  if (!isLogFile(logFile.fsPath)) {
    throw new Error('Selected file is not a supported log file.');
  }

  return {
    name: path.basename(logFile.fsPath, path.extname(logFile.fsPath)),
    logUri: logFile.toString(),
  };
}

export async function readUriText(uri: string): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
  return Buffer.from(bytes).toString('utf8');
}
