import * as vscode from 'vscode';
import { aggregateAnomalies } from '../core/aggregator';
import { detectAnomalies } from '../core/anomalyEngine';
import { parseLog } from '../core/logParser';
import { buildStepContexts } from '../core/stepBuilder';
import { runRootCauseAnalysis as runAiRootCauseAnalysis } from '../ai/agentRunner';
import { createGitLabIssue } from '../gitlab/gitlabClient';
import { buildIssueCandidate } from '../gitlab/issueBuilder';
import { AnalysisStore } from '../utils/analysisStore';
import { pickArtifacts, readUriText } from '../utils/artifacts';
import type { Phase1Result, RootCauseAnalysis } from '../models/types';

async function ensureArtifact(store: AnalysisStore) {
  const state = store.getState();
  if (state.artifact) {
    return state.artifact;
  }

  const artifact = await pickArtifacts();
  if (!artifact) {
    return undefined;
  }

  store.setArtifact(artifact);
  return artifact;
}

async function buildPhase1Result(store: AnalysisStore): Promise<Phase1Result | undefined> {
  const artifact = await ensureArtifact(store);
  if (!artifact) {
    return undefined;
  }

  const logContent = await readUriText(artifact.logUri);
  const featureContent = await readUriText(artifact.featureUri);
  const events = parseLog(logContent);
  const steps = buildStepContexts(events, featureContent);
  const anomalies = detectAnomalies(events, steps, vscode.Uri.parse(artifact.logUri).fsPath);
  const aggregated = aggregateAnomalies(anomalies);

  return {
    artifact,
    events,
    steps,
    anomalies,
    aggregated,
  };
}

async function selectRootCause(rootCauses: RootCauseAnalysis[]): Promise<RootCauseAnalysis | undefined> {
  const picked = await vscode.window.showQuickPick(
    rootCauses.map((result) => ({
      label: result.finalOutput.root_cause,
      description: `${result.finalOutput.issue_fields.step} • ${result.finalOutput.confidence.toFixed(2)}`,
      result,
    })),
    {
      title: 'Select Root Cause Result',
    }
  );

  return picked?.result;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  store: AnalysisStore
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('testAnalysisAgent.loadTestArtifacts', async () => {
      try {
        const artifact = await pickArtifacts();
        if (!artifact) {
          return;
        }

        store.setArtifact(artifact);
        vscode.window.showInformationMessage(`Loaded artifacts for ${artifact.name}.`);
      } catch (error) {
        vscode.window.showErrorMessage((error as Error).message);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testAnalysisAgent.runPhase1Analysis', async () => {
      try {
        const phase1 = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Running deterministic analysis',
            cancellable: false,
          },
          async () => buildPhase1Result(store)
        );

        if (!phase1) {
          return;
        }

        store.setPhase1(phase1);
        vscode.window.showInformationMessage(
          `Phase 1 complete: ${phase1.aggregated.length} grouped anomalies across ${phase1.steps.length} steps.`
        );
      } catch (error) {
        vscode.window.showErrorMessage((error as Error).message);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testAnalysisAgent.runRootCauseAnalysis', async () => {
      try {
        const phase1 = store.getState().phase1 ?? (await buildPhase1Result(store));
        if (!phase1) {
          return;
        }

        store.setPhase1(phase1);
        const results = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Running AI root cause analysis',
            cancellable: true,
          },
          (progress, token) => runAiRootCauseAnalysis(phase1, progress, token)
        );

        store.setRootCauses(results);
        vscode.window.showInformationMessage(`Root cause analysis complete for ${results.length} anomalies.`);
      } catch (error) {
        vscode.window.showErrorMessage((error as Error).message);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testAnalysisAgent.createGitLabIssues', async () => {
      try {
        const state = store.getState();
        if (state.rootCauses.length === 0) {
          throw new Error('Run root cause analysis before creating a GitLab issue.');
        }

        const selected = await selectRootCause(state.rootCauses);
        if (!selected) {
          return;
        }

        const config = vscode.workspace.getConfiguration('testAnalysisAgent.gitlab');
        const baseUrl = config.get<string>('baseUrl') ?? '';
        const projectId = config.get<string>('projectId') ?? '';
        const token = config.get<string>('token') ?? '';
        if (!baseUrl || !projectId || !token) {
          throw new Error('Configure testAnalysisAgent.gitlab.baseUrl, projectId, and token first.');
        }

        const issue = buildIssueCandidate(selected);
        const created = await createGitLabIssue({
          baseUrl,
          projectId,
          token,
          title: issue.title,
          description: issue.description,
          labels: issue.labels,
        });

        vscode.window.showInformationMessage(
          `Created GitLab issue #${created.iid}: ${created.title}`,
          'Open'
        ).then((choice) => {
          if (choice === 'Open') {
            void vscode.env.openExternal(vscode.Uri.parse(created.web_url));
          }
        });
      } catch (error) {
        vscode.window.showErrorMessage((error as Error).message);
      }
    })
  );
}
