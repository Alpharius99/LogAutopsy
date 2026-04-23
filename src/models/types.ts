export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export type AnalysisPhase = 'Precondition' | 'TestCase' | 'PostCondition';

export type AnomalyType = 'ERROR' | 'EXCEPTION_MESSAGE';

export type KeywordType = 'Action' | 'Conjunction' | 'Outcome';

export interface ArtifactPair {
  name: string;
  logUri: string;
  featureUri?: string;
}

export interface LogEvent {
  timestamp: string;
  thread: number;
  level: LogLevel;
  sourceClass: string;
  sourceMethod: string;
  sourceLine: number;
  message: string;
  raw: string;
  continuationLines: string[];
  fileLineNumber: number;
  exceptionType?: string;
  stacktrace?: string;
}

export interface GherkinStep {
  name: string;
  keyword: string;
  keywordType: KeywordType;
  location: string;
  argument: string;
  scenario: string;
  phase: AnalysisPhase;
}

export interface StepContext {
  step: GherkinStep | '_init_';
  phase: AnalysisPhase;
  startLine: number;
  endLine: number;
  result?: string;
  failedByKeywordTranslator: boolean;
}

export interface Anomaly {
  id: string;
  type: AnomalyType;
  message: string;
  stacktrace?: string;
  step: string;
  phase: AnalysisPhase;
  file: string;
  line: number;
  sourceClass: string;
  sourceMethod: string;
  sourceLine: number;
  exceptionType?: string;
  timestamp: string;
  logEvent: LogEvent;
  stepContext: StepContext;
}

export interface AggregatedAnomaly {
  key: string;
  type: AnomalyType;
  message: string;
  normalizedMessage: string;
  topStackFrame: string;
  step: string;
  phase: AnalysisPhase;
  occurrences: number;
  firstOccurrence: {
    file: string;
    line: number;
    timestamp: string;
  };
  stacktrace?: string;
  sourceHint: {
    class: string;
    method: string;
    line: number;
  };
  anomalies: Anomaly[];
}

export interface Phase1Result {
  artifact: ArtifactPair;
  events: LogEvent[];
  steps: StepContext[];
  anomalies: Anomaly[];
  aggregated: AggregatedAnomaly[];
}

export interface CodeCandidate {
  filePath: string;
  className: string;
  methodName: string;
  startLine: number;
  endLine: number;
  methodBody: string;
  confidence: number;
}

export interface IssueFields {
  step: string;
  class: string;
  method: string;
  file: string;
  line: number;
}

export interface FinalAiOutput {
  root_cause: string;
  hypothesis: {
    cause: string;
    mechanism: string;
    trigger: string;
  };
  fix_suggestion: string;
  confidence: number;
  issue_description: string;
  issue_fields: IssueFields;
}

export interface RootCauseAnalysis {
  anomalyKey: string;
  aggregatedAnomaly: AggregatedAnomaly;
  resolvedTarget?: CodeCandidate;
  candidateTargets?: CodeCandidate[];
  workflow: {
    extract_context: Record<string, unknown>;
    identify_failure_point: Record<string, unknown>;
    analyze_code: Record<string, unknown>;
    correlate_logs: Record<string, unknown>;
    validate_hypothesis: Record<string, unknown>;
  };
  finalOutput: FinalAiOutput;
  continuePrompt?: string;
}

export interface IssueCandidate {
  title: string;
  description: string;
  labels: string[];
  rootCause: RootCauseAnalysis;
}

export interface GitLabIssueRequest {
  baseUrl: string;
  projectId: string;
  token: string;
  title: string;
  description: string;
  labels: string[];
}

export interface GitLabIssueResponse {
  id: number;
  iid: number;
  web_url: string;
  title: string;
}

export interface AnalysisStoreState {
  artifact?: ArtifactPair;
  phase1?: Phase1Result;
  rootCauses: RootCauseAnalysis[];
  selectedRootCauseKey?: string;
}
