// src/types.ts — Shared interfaces across all layers
// Full definitions per spec §5 in docs/test_analysis_agent_spec_v2.md
// CRITICAL (D-02): No imports from 'vscode' — consumed by both src/core/ and src/ui/

export interface LogEvent {
  timestamp: string;
  thread: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  className: string;
  methodName: string;
  sourceLine: number;
  message: string;
  continuationLines: string[];
  exceptionType?: string;
}

export interface GherkinStep {
  keyword: string;
  text: string;
  scenario: string;
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
}

export interface StepContext {
  step: GherkinStep | '_init_';
  startLine: number;
  endLine: number;
}

export interface Anomaly {
  logEvent: LogEvent;
  stepContext: StepContext;
}

export interface AggregatedAnomaly {
  id: string;           // SHA-256 of aggregation key
  type: string;
  normalizedMessage: string;
  topStackFrame: string;
  step: string;
  phase: 'Precondition' | 'TestCase' | 'PostCondition';
  count: number;
  firstOccurrence: LogEvent;
  occurrences: Anomaly[];
}

export interface CodeCandidate {
  className: string;
  methodName: string;
  filePath: string;
  methodBody: string;
  confidence: number;   // 0.0–1.0
}

export interface RootCauseAnalysis {
  primaryAnomaly: AggregatedAnomaly;
  secondaryEffects: AggregatedAnomaly[];
  codeCandidate?: CodeCandidate;
  hypothesis: string;
  fixSuggestion: string;
  confidence: number;   // 0.0–1.0
}

export interface IssueCandidate {
  title: string;
  description: string;
  labels: string[];
  rootCauseAnalysis: RootCauseAnalysis;
}
