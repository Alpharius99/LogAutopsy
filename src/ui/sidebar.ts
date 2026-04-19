// src/ui/sidebar.ts
import * as vscode from 'vscode';

/**
 * Sidebar TreeDataProvider stub.
 * Phase 1: empty tree — registers the slot, no content until Phase 3.
 */
export class LogAutopsySidebarProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData =
    new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<vscode.TreeItem[]> {
    return Promise.resolve([]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
