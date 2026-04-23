import * as vscode from 'vscode';
import type { AnalysisStoreState, ArtifactPair, Phase1Result, RootCauseAnalysis } from '../models/types';

export class AnalysisStore {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  private state: AnalysisStoreState = {
    rootCauses: [],
  };

  getState(): AnalysisStoreState {
    return this.state;
  }

  setArtifact(artifact: ArtifactPair): void {
    this.state = {
      artifact,
      rootCauses: [],
      selectedRootCauseKey: undefined,
    };
    this.emitter.fire();
  }

  setPhase1(phase1: Phase1Result): void {
    this.state = {
      artifact: phase1.artifact,
      phase1,
      rootCauses: [],
      selectedRootCauseKey: undefined,
    };
    this.emitter.fire();
  }

  setRootCauses(rootCauses: RootCauseAnalysis[]): void {
    const selectedRootCauseKey =
      rootCauses.find((item) => item.anomalyKey === this.state.selectedRootCauseKey)?.anomalyKey ??
      rootCauses[0]?.anomalyKey;
    this.state = {
      ...this.state,
      rootCauses,
      selectedRootCauseKey,
    };
    this.emitter.fire();
  }

  setSelectedRootCause(anomalyKey: string | undefined): void {
    this.state = {
      ...this.state,
      selectedRootCauseKey: anomalyKey,
    };
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
