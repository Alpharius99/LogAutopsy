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
    };
    this.emitter.fire();
  }

  setPhase1(phase1: Phase1Result): void {
    this.state = {
      artifact: phase1.artifact,
      phase1,
      rootCauses: [],
    };
    this.emitter.fire();
  }

  setRootCauses(rootCauses: RootCauseAnalysis[]): void {
    this.state = {
      ...this.state,
      rootCauses,
    };
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
