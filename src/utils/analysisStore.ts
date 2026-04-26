import * as vscode from 'vscode';
import type {
  AnalysisStoreState,
  ArtifactPair,
  GeneratedIssueDraft,
  Phase1Result,
  RootCauseAnalysis,
} from '../models/types';

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
      generatedIssueDraft: undefined,
    };
    this.emitter.fire();
  }

  setPhase1(phase1: Phase1Result): void {
    this.state = {
      artifact: phase1.artifact,
      phase1,
      rootCauses: [],
      selectedRootCauseKey: undefined,
      generatedIssueDraft: undefined,
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
      generatedIssueDraft:
        this.state.generatedIssueDraft &&
        rootCauses.some((item) => item.anomalyKey === this.state.generatedIssueDraft?.anomalyKey)
          ? this.state.generatedIssueDraft
          : undefined,
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

  setGeneratedIssueDraft(generatedIssueDraft: GeneratedIssueDraft | undefined): void {
    this.state = {
      ...this.state,
      generatedIssueDraft,
    };
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
