import * as path from 'path';
import * as vscode from 'vscode';
import type { ArtifactPair } from '../models/types';

async function readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return [];
  }
}

async function walk(uri: vscode.Uri, results: vscode.Uri[]): Promise<void> {
  const entries = await readDirectory(uri);
  for (const [name, fileType] of entries) {
    const child = vscode.Uri.joinPath(uri, name);
    if (fileType === vscode.FileType.Directory) {
      await walk(child, results);
      continue;
    }

    results.push(child);
  }
}

function isCombinedLog(filePath: string): boolean {
  return /_\d{6}_\d{6}\.log$/i.test(filePath) && !/[\\/](Precondition|TestCase|PostCondition)[\\/]/i.test(filePath);
}

export async function discoverArtifactPairs(root: vscode.Uri): Promise<ArtifactPair[]> {
  const files: vscode.Uri[] = [];
  await walk(root, files);

  const byDirectory = new Map<string, { logUri?: vscode.Uri; featureUri?: vscode.Uri }>();

  for (const file of files) {
    const fsPath = file.fsPath;
    const dir = path.dirname(fsPath);
    const bucket = byDirectory.get(dir) ?? {};
    if (fsPath.endsWith('.feature')) {
      bucket.featureUri = file;
    } else if (isCombinedLog(fsPath)) {
      bucket.logUri = file;
    }
    byDirectory.set(dir, bucket);
  }

  return [...byDirectory.entries()]
    .filter(([, bucket]) => bucket.logUri && bucket.featureUri)
    .map(([dir, bucket]) => ({
      name: path.basename(dir),
      logUri: bucket.logUri!.toString(),
      featureUri: bucket.featureUri!.toString(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function pickArtifacts(): Promise<ArtifactPair | undefined> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Load Test Artifacts',
  });

  const root = selection?.[0];
  if (!root) {
    return undefined;
  }

  const pairs = await discoverArtifactPairs(root);
  if (pairs.length === 0) {
    throw new Error('No combined log + feature pairs were found in the selected folder.');
  }

  if (pairs.length === 1) {
    return pairs[0];
  }

  const picked = await vscode.window.showQuickPick(
    pairs.map((pair) => ({
      label: pair.name,
      description: vscode.Uri.parse(pair.logUri).fsPath,
      pair,
    })),
    {
      title: 'Select Test Artifact Pair',
    }
  );

  return picked?.pair;
}

export async function readUriText(uri: string): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(uri));
  return Buffer.from(bytes).toString('utf8');
}
