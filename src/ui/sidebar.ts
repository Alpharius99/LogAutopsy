// src/ui/sidebar.ts
import * as vscode from 'vscode';
import type { RootCauseAnalysis, StepContext } from '../models/types';
import type { AnalysisStore } from '../utils/analysisStore';

class SidebarItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    readonly children: SidebarItem[] = [],
    description?: string
  ) {
    super(label, collapsibleState);
    this.description = description;
  }
}

function buildStepItem(step: StepContext, rootCauses: RootCauseAnalysis[]): SidebarItem {
  const stepName = step.step === '_init_' ? '_init_' : step.step.name;
  const relatedResults = rootCauses.filter((item) => item.aggregatedAnomaly.step === stepName);
  const children = relatedResults.map(
    (result) =>
      new SidebarItem(
        result.finalOutput.root_cause,
        vscode.TreeItemCollapsibleState.None,
        [],
        `confidence ${result.finalOutput.confidence.toFixed(2)}`
      )
  );

  return new SidebarItem(
    stepName,
    children.length > 0
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None,
    children,
    step.phase
  );
}

export class LogAutopsySidebarProvider implements vscode.TreeDataProvider<SidebarItem> {
  private readonly emitter = new vscode.EventEmitter<SidebarItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly store: AnalysisStore) {
    this.store.onDidChange(() => this.refresh());
  }

  getTreeItem(element: SidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarItem): Thenable<SidebarItem[]> {
    if (element) {
      return Promise.resolve(element.children);
    }

    const state = this.store.getState();
    if (!state.artifact) {
      return Promise.resolve([
        new SidebarItem(
          'No artifacts loaded',
          vscode.TreeItemCollapsibleState.None,
          [],
          'Run Load Test Artifacts'
        ),
      ]);
    }

    const roots: SidebarItem[] = [
      new SidebarItem(
        state.artifact.name,
        vscode.TreeItemCollapsibleState.None,
        [],
        'Loaded artifact'
      ),
    ];

    if (state.phase1) {
      roots.push(
        new SidebarItem(
          `Steps (${state.phase1.steps.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          state.phase1.steps.map((step) => buildStepItem(step, state.rootCauses))
        )
      );
      roots.push(
        new SidebarItem(
          `Anomalies (${state.phase1.aggregated.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          state.phase1.aggregated.map(
            (anomaly) =>
              new SidebarItem(
                anomaly.message,
                vscode.TreeItemCollapsibleState.None,
                [],
                `${anomaly.step} • ${anomaly.occurrences}x`
              )
          )
        )
      );
    }

    if (state.rootCauses.length > 0) {
      roots.push(
        new SidebarItem(
          `Root Causes (${state.rootCauses.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          state.rootCauses.map(
            (result) =>
              new SidebarItem(
                result.finalOutput.root_cause,
                vscode.TreeItemCollapsibleState.None,
                [],
                `${result.finalOutput.issue_fields.step} • ${result.finalOutput.confidence.toFixed(2)}`
              )
          )
        )
      );
    }

    return Promise.resolve(roots);
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }
}
