import * as path from 'path';
import * as vscode from 'vscode';
import { analyzeWithContinue, defaultContinueSystemPrompt } from './continueClient';
import type {
  AggregatedAnomaly,
  CodeCandidate,
  FinalAiOutput,
  IssueFields,
  Phase1Result,
  RootCauseAnalysis,
} from '../models/types';
import { formatDiagnosticError, getDiagnosticsChannel, summarizeDiagnosticError } from '../utils/diagnostics';
import { ensureBoolean, ensureNumber, ensureObject, ensureString, parseStrictJson } from '../utils/json';

type WorkflowPayload = Record<string, unknown>;
type JsonValidator<T> = (value: unknown) => T;

const MAX_METHOD_LINES = 300;
const MAX_CODE_CANDIDATES = 3;
const RAW_RESPONSE_PREVIEW_LENGTH = 500;
const DIAGNOSTIC_SUMMARY_PREFIX = 'Diagnostic: ';

function simpleClassName(name: string): string {
  return name.split('.').at(-1) ?? name;
}

function symbolKindRank(kind: vscode.SymbolKind): number {
  if (kind === vscode.SymbolKind.Method || kind === vscode.SymbolKind.Constructor) {
    return 3;
  }

  if (kind === vscode.SymbolKind.Class) {
    return 2;
  }

  return 1;
}

async function resolveCodeCandidates(anomaly: AggregatedAnomaly): Promise<CodeCandidate[]> {
  const classQuery = simpleClassName(anomaly.sourceHint.class);
  const methodQuery = anomaly.sourceHint.method;
  const symbols =
    (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      `${classQuery} ${methodQuery}`
    )) ?? [];
  const fallbackSymbols =
    symbols.length > 0
      ? symbols
      : ((await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider',
          classQuery
        )) ?? []);

  const ranked = fallbackSymbols
    .filter((symbol) => symbol.location.uri.fsPath.endsWith('.cs'))
    .map((symbol) => {
      const symbolName = symbol.name;
      const container = symbol.containerName ?? '';
      const fileName = path.basename(symbol.location.uri.fsPath, path.extname(symbol.location.uri.fsPath));
      const classExact =
        symbolName === classQuery ||
        container === classQuery ||
        container.endsWith(`.${classQuery}`) ||
        fileName === classQuery;
      const methodExact =
        symbolName === methodQuery || symbolName.endsWith(`.${methodQuery}`);
      const lineDistance = Math.abs(symbol.location.range.start.line + 1 - anomaly.sourceHint.line);

      let confidence = 0.0;
      if (classExact && methodExact) {
        confidence = 1.0;
      } else if (classExact) {
        confidence = 0.7;
      } else if (methodExact) {
        confidence = 0.3;
      }

      return {
        symbol,
        confidence,
        weight: symbolKindRank(symbol.kind),
        lineDistance,
      };
    })
    .filter((item) => item.confidence > 0)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.weight - left.weight ||
        left.lineDistance - right.lineDistance
    );

  const candidates: CodeCandidate[] = [];
  for (const item of ranked) {
    const method = await extractMethodCandidate(item.symbol.location.uri, anomaly.sourceHint.method, classQuery);
    if (method) {
      const candidate = {
        ...method,
        confidence: item.confidence,
      };
      if (!candidates.some((existing) => existing.filePath === candidate.filePath && existing.startLine === candidate.startLine)) {
        candidates.push(candidate);
      }
    }

    if (candidates.length >= MAX_CODE_CANDIDATES) {
      break;
    }
  }

  return candidates;
}

function flattenDocumentSymbols(
  symbols: readonly vscode.DocumentSymbol[],
  bucket: vscode.DocumentSymbol[] = []
): vscode.DocumentSymbol[] {
  for (const symbol of symbols) {
    bucket.push(symbol);
    flattenDocumentSymbols(symbol.children, bucket);
  }

  return bucket;
}

async function extractMethodCandidate(
  uri: vscode.Uri,
  methodName: string,
  className: string
): Promise<Omit<CodeCandidate, 'confidence'> | undefined> {
  const document = await vscode.workspace.openTextDocument(uri);
  const documentSymbols =
    (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    )) ?? [];
  const flat = flattenDocumentSymbols(documentSymbols);

  const methodSymbol = flat.find(
    (symbol) =>
      (symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Constructor) &&
      symbol.name === methodName
  );

  if (!methodSymbol) {
    return undefined;
  }

  const startLine = methodSymbol.range.start.line;
  const endLine = Math.min(methodSymbol.range.end.line, startLine + MAX_METHOD_LINES - 1);
  const methodBody = document.getText(
    new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)
  );

  return {
    filePath: uri.fsPath,
    className,
    methodName,
    startLine: startLine + 1,
    endLine: endLine + 1,
    methodBody,
  };
}

function promptEnvelope(step: string, payload: unknown, responseSchema: unknown): string {
  return JSON.stringify(
    {
      step,
      payload,
      response_schema: responseSchema,
      output_requirements: 'Return strict JSON only.',
    },
    null,
    2
  );
}

function previewText(value: string, maxLength = RAW_RESPONSE_PREVIEW_LENGTH): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

async function runJsonStep<T>(
  step: string,
  payload: unknown,
  responseSchema: unknown,
  validate: JsonValidator<T>,
  temperature: number,
  token: vscode.CancellationToken
): Promise<T> {
  const diagnostics = getDiagnosticsChannel();
  diagnostics.info(`Running AI workflow step "${step}".`);

  const raw = await analyzeWithContinue(promptEnvelope(step, payload, responseSchema), {
    systemPrompt: defaultContinueSystemPrompt(),
    temperature,
    token,
  });
  diagnostics.info(`Step "${step}" raw response preview: ${previewText(raw)}`);

  try {
    return validate(parseStrictJson(raw));
  } catch (error) {
    diagnostics.error(
      `Step "${step}" returned invalid JSON or schema.\nRaw response:\n${raw}\n\n${formatDiagnosticError(error)}`
    );
    throw new Error(`${step} failed: ${summarizeDiagnosticError(error)}`);
  }
}

function ensureStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be a string array.`);
  }

  return value as string[];
}

function ensureNumberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
    throw new Error(`${label} must be a number array.`);
  }

  return value as number[];
}

function validateExtractContext(value: unknown): WorkflowPayload {
  const root = ensureObject(value, 'extract_context');
  return {
    relevant_log_excerpt: ensureString(root.relevant_log_excerpt, 'extract_context.relevant_log_excerpt'),
    suspected_component: ensureString(root.suspected_component, 'extract_context.suspected_component'),
    key_evidence: ensureStringArray(root.key_evidence, 'extract_context.key_evidence'),
  };
}

function validateFailurePoint(value: unknown): WorkflowPayload {
  const root = ensureObject(value, 'identify_failure_point');
  return {
    failure_point: ensureString(root.failure_point, 'identify_failure_point.failure_point'),
    reasoning: ensureString(root.reasoning, 'identify_failure_point.reasoning'),
    suspected_method: ensureString(root.suspected_method, 'identify_failure_point.suspected_method'),
  };
}

function validateAnalyzeCode(value: unknown): WorkflowPayload {
  const root = ensureObject(value, 'analyze_code');
  return {
    code_observations: ensureStringArray(root.code_observations, 'analyze_code.code_observations'),
    likely_failure_mechanism: ensureString(
      root.likely_failure_mechanism,
      'analyze_code.likely_failure_mechanism'
    ),
    risky_lines: ensureNumberArray(root.risky_lines, 'analyze_code.risky_lines'),
  };
}

function validateCorrelateLogs(value: unknown): WorkflowPayload {
  const root = ensureObject(value, 'correlate_logs');
  return {
    correlation_summary: ensureString(root.correlation_summary, 'correlate_logs.correlation_summary'),
    primary_vs_secondary: ensureString(root.primary_vs_secondary, 'correlate_logs.primary_vs_secondary'),
    supporting_evidence: ensureStringArray(root.supporting_evidence, 'correlate_logs.supporting_evidence'),
  };
}

function validateHypothesisValidation(value: unknown): WorkflowPayload {
  const root = ensureObject(value, 'validate_hypothesis');
  const revisedRaw = root.revised_hypothesis;
  const revised =
    revisedRaw === undefined
      ? undefined
      : {
          cause: ensureString(ensureObject(revisedRaw, 'revised_hypothesis').cause, 'revised_hypothesis.cause'),
          mechanism: ensureString(
            ensureObject(revisedRaw, 'revised_hypothesis').mechanism,
            'revised_hypothesis.mechanism'
          ),
          trigger: ensureString(ensureObject(revisedRaw, 'revised_hypothesis').trigger, 'revised_hypothesis.trigger'),
        };

  return {
    valid: ensureBoolean(root.valid, 'validate_hypothesis.valid'),
    confidence_adjustment: ensureNumber(
      root.confidence_adjustment,
      'validate_hypothesis.confidence_adjustment'
    ),
    gaps: ensureStringArray(root.gaps, 'validate_hypothesis.gaps'),
    ...(revised ? { revised_hypothesis: revised } : {}),
  };
}

function validateIssueFields(value: unknown): IssueFields {
  const fields = ensureObject(value, 'issue_fields');
  return {
    step: ensureString(fields.step, 'issue_fields.step'),
    class: ensureString(fields.class, 'issue_fields.class'),
    method: ensureString(fields.method, 'issue_fields.method'),
    file: ensureString(fields.file, 'issue_fields.file'),
    line: ensureNumber(fields.line, 'issue_fields.line'),
  };
}

function validateFinalOutput(value: unknown): FinalAiOutput {
  const root = ensureObject(value, 'final_output');
  const hypothesis = ensureObject(root.hypothesis, 'hypothesis');
  const confidence = ensureNumber(root.confidence, 'confidence');

  return {
    root_cause: ensureString(root.root_cause, 'root_cause'),
    hypothesis: {
      cause: ensureString(hypothesis.cause, 'hypothesis.cause'),
      mechanism: ensureString(hypothesis.mechanism, 'hypothesis.mechanism'),
      trigger: ensureString(hypothesis.trigger, 'hypothesis.trigger'),
    },
    fix_suggestion: ensureString(root.fix_suggestion, 'fix_suggestion'),
    confidence: Math.max(0, Math.min(1, confidence)),
    issue_description: ensureString(root.issue_description, 'issue_description'),
    issue_fields: validateIssueFields(root.issue_fields),
  };
}

function summarizeAnomaly(anomaly: AggregatedAnomaly): Record<string, unknown> {
  return {
    key: anomaly.key,
    type: anomaly.type,
    message: anomaly.message,
    step: anomaly.step,
    phase: anomaly.phase,
    occurrences: anomaly.occurrences,
    topStackFrame: anomaly.topStackFrame,
    sourceHint: anomaly.sourceHint,
    firstOccurrence: anomaly.firstOccurrence,
    stacktrace: anomaly.stacktrace?.split(/\r?\n/).slice(0, 20).join('\n') ?? '',
  };
}

function formatCodeCandidate(candidate: CodeCandidate): string {
  return [
    `File: ${candidate.filePath}`,
    `Class: ${candidate.className}`,
    `Method: ${candidate.methodName}`,
    `Lines: ${candidate.startLine}-${candidate.endLine}`,
    `Confidence: ${candidate.confidence.toFixed(2)}`,
    'Code:',
    '```csharp',
    candidate.methodBody,
    '```',
  ].join('\n');
}

function buildContinuePrompt(
  anomaly: AggregatedAnomaly,
  phase1: Phase1Result,
  candidates: CodeCandidate[]
): string {
  const relatedAnomalies = phase1.aggregated
    .filter((item) => item.key !== anomaly.key)
    .slice(0, 5)
    .map(
      (item, index) =>
        [
          `${index + 1}. ${item.message}`,
          `   Step: ${item.step}`,
          `   Source hint: ${item.sourceHint.class}.${item.sourceHint.method}:${item.sourceHint.line}`,
          `   Top stack frame: ${item.topStackFrame}`,
        ].join('\n')
    )
    .join('\n');

  const candidateSection =
    candidates.length > 0
      ? candidates.map((candidate, index) => `### Candidate ${index + 1}\n${formatCodeCandidate(candidate)}`).join('\n\n')
      : [
          'No matching C# method was resolved automatically.',
          'Use the source hint and stack trace to locate the implementation in the workspace:',
          `${anomaly.sourceHint.class}.${anomaly.sourceHint.method}:${anomaly.sourceHint.line}`,
        ].join('\n');

  const stackTrace = anomaly.stacktrace?.trim() || 'No stack trace captured.';

  return [
    'You are investigating a failed automated test run.',
    'Use the workspace codebase, especially the candidate C# files below, to determine the primary root cause.',
    'Distinguish the first real failure from downstream side effects.',
    'Read the referenced classes and any directly related callees before deciding.',
    '',
    'Return your answer in Markdown with these sections exactly:',
    '1. Summary',
    '2. Primary Root Cause',
    '3. Evidence',
    '4. Fix Suggestion',
    '5. Open Questions',
    '',
    '## Artifact',
    `Name: ${phase1.artifact.name}`,
    `Log: ${vscode.Uri.parse(phase1.artifact.logUri).fsPath}`,
    phase1.artifact.featureUri ? `Feature: ${vscode.Uri.parse(phase1.artifact.featureUri).fsPath}` : 'Feature: none',
    '',
    '## Primary Anomaly',
    `Key: ${anomaly.key}`,
    `Type: ${anomaly.type}`,
    `Step: ${anomaly.step}`,
    `Phase: ${anomaly.phase}`,
    `Occurrences: ${anomaly.occurrences}`,
    `Timestamp: ${anomaly.firstOccurrence.timestamp}`,
    `Message: ${anomaly.message}`,
    `Top stack frame: ${anomaly.topStackFrame}`,
    `Source hint: ${anomaly.sourceHint.class}.${anomaly.sourceHint.method}:${anomaly.sourceHint.line}`,
    '',
    '## Stack Trace',
    '```text',
    stackTrace,
    '```',
    '',
    '## Related Anomalies',
    relatedAnomalies || 'None',
    '',
    '## Candidate Code Locations',
    candidateSection,
    '',
    '## Task',
    'Inspect the codebase and explain which code path most likely caused the failure, why it failed, what evidence supports that, and what change is most likely required.',
  ].join('\n');
}

function manualRootCauseResult(
  anomaly: AggregatedAnomaly,
  phase1: Phase1Result,
  candidates: CodeCandidate[]
): RootCauseAnalysis {
  const resolvedTarget = candidates[0];
  const continuePrompt = buildContinuePrompt(anomaly, phase1, candidates);

  return {
    anomalyKey: anomaly.key,
    aggregatedAnomaly: anomaly,
    resolvedTarget,
    candidateTargets: candidates,
    workflow: {
      extract_context: {},
      identify_failure_point: {},
      analyze_code: {},
      correlate_logs: {},
      validate_hypothesis: {},
    },
    finalOutput: {
      root_cause: `Continue prompt prepared for ${anomaly.sourceHint.class}.${anomaly.sourceHint.method}`,
      hypothesis: {
        cause: anomaly.message,
        mechanism: anomaly.topStackFrame,
        trigger: `Failure occurred during step ${anomaly.step}`,
      },
      fix_suggestion: 'Paste the prepared prompt into Continue chat and let it inspect the referenced code.',
      confidence: resolvedTarget?.confidence ?? 0,
      issue_description: continuePrompt,
      issue_fields: {
        step: anomaly.step,
        class: anomaly.sourceHint.class,
        method: anomaly.sourceHint.method,
        file: resolvedTarget?.filePath ?? '',
        line: resolvedTarget?.startLine ?? anomaly.sourceHint.line,
      },
    },
    continuePrompt,
  };
}

function fallbackRootCause(
  anomaly: AggregatedAnomaly,
  diagnosticSummary?: string,
  candidate?: CodeCandidate
): FinalAiOutput {
  const fileName = candidate ? path.basename(candidate.filePath) : '';
  const diagnosticSuffix = diagnosticSummary ? ` (${diagnosticSummary})` : '';
  return {
    root_cause: `Unable to obtain AI diagnosis for ${anomaly.sourceHint.class}.${anomaly.sourceHint.method}${diagnosticSuffix}`,
    hypothesis: {
      cause: anomaly.message,
      mechanism: anomaly.topStackFrame,
      trigger: `Failure occurred during step ${anomaly.step}`,
    },
    fix_suggestion: 'Review the resolved method and stack trace, then reproduce with focused logging.',
    confidence: 0,
    issue_description: [
      '## Summary',
      `Automated analysis could not complete AI diagnosis for anomaly \`${anomaly.key}\`.`,
      '',
      '## Failing Step',
      anomaly.step,
      '',
      '## Root Cause',
      anomaly.message,
      '',
      '## Hypothesis',
      anomaly.topStackFrame,
      '',
      '## Suggested Fix',
      'Inspect the failing method and reproduce with targeted instrumentation.',
      '',
      '## Evidence',
      `Source hint: ${anomaly.sourceHint.class}.${anomaly.sourceHint.method}:${anomaly.sourceHint.line}`,
      fileName ? `Resolved file: ${fileName}` : 'No source file resolved.',
      diagnosticSummary ? `${DIAGNOSTIC_SUMMARY_PREFIX}${diagnosticSummary}` : 'Diagnostic: unavailable',
      'See the "Test Analysis Agent Diagnostics" output channel for full AI workflow details.',
    ].join('\n'),
    issue_fields: {
      step: anomaly.step,
      class: anomaly.sourceHint.class,
      method: anomaly.sourceHint.method,
      file: candidate?.filePath ?? '',
      line: candidate?.startLine ?? anomaly.sourceHint.line,
    },
  };
}

async function analyzeAnomaly(
  anomaly: AggregatedAnomaly,
  phase1: Phase1Result,
  token: vscode.CancellationToken
): Promise<RootCauseAnalysis> {
  const diagnostics = getDiagnosticsChannel();
  const candidates = await resolveCodeCandidates(anomaly);
  const candidate = candidates[0];
  diagnostics.info(
    [
      `Starting root cause analysis for anomaly "${anomaly.key}".`,
      `Step=${anomaly.step}`,
      `SourceHint=${anomaly.sourceHint.class}.${anomaly.sourceHint.method}:${anomaly.sourceHint.line}`,
      candidate
        ? `ResolvedTarget=${candidate.filePath}:${candidate.startLine}-${candidate.endLine} (confidence ${candidate.confidence.toFixed(2)})`
        : 'ResolvedTarget=none',
    ].join(' | ')
  );
  const contextPayload = {
    anomaly: summarizeAnomaly(anomaly),
    code_context: candidate
      ? {
          class: candidate.className,
          method: candidate.methodName,
          file: candidate.filePath,
          line_range: [candidate.startLine, candidate.endLine],
          code: candidate.methodBody,
        }
      : null,
    related_anomalies: phase1.aggregated
      .filter((item) => item.key !== anomaly.key)
      .slice(0, 5)
      .map(summarizeAnomaly),
  };

  try {
    const extractContext = await runJsonStep(
      'extract_context',
      contextPayload,
      {
        relevant_log_excerpt: 'string',
        suspected_component: 'string',
        key_evidence: ['string'],
      },
      validateExtractContext,
      0.0,
      token
    );
    const identifyFailurePoint = await runJsonStep(
      'identify_failure_point',
      {
        anomaly: summarizeAnomaly(anomaly),
        extract_context: extractContext,
      },
      {
        failure_point: 'string',
        reasoning: 'string',
        suspected_method: 'string',
      },
      validateFailurePoint,
      0.0,
      token
    );
    const analyzeCode = await runJsonStep(
      'analyze_code',
      {
        anomaly: summarizeAnomaly(anomaly),
        extract_context: extractContext,
        identify_failure_point: identifyFailurePoint,
        code_context: contextPayload.code_context,
      },
      {
        code_observations: ['string'],
        likely_failure_mechanism: 'string',
        risky_lines: ['number'],
      },
      validateAnalyzeCode,
      0.1,
      token
    );
    const correlateLogs = await runJsonStep(
      'correlate_logs',
      {
        anomaly: summarizeAnomaly(anomaly),
        analyze_code: analyzeCode,
        related_anomalies: contextPayload.related_anomalies,
      },
      {
        correlation_summary: 'string',
        primary_vs_secondary: 'string',
        supporting_evidence: ['string'],
      },
      validateCorrelateLogs,
      0.1,
      token
    );

    let validateHypothesis = await runJsonStep(
      'validate_hypothesis',
      {
        anomaly: summarizeAnomaly(anomaly),
        analyze_code: analyzeCode,
        correlate_logs: correlateLogs,
      },
      {
        valid: 'boolean',
        confidence_adjustment: 'number',
        gaps: ['string'],
        revised_hypothesis: {
          cause: 'string',
          mechanism: 'string',
          trigger: 'string',
        },
      },
      validateHypothesisValidation,
      0.0,
      token
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const valid = ensureBoolean(
        validateHypothesis.valid ?? true,
        'validate_hypothesis.valid'
      );
      if (valid) {
        break;
      }

      validateHypothesis = await runJsonStep(
        'validate_hypothesis',
        {
          anomaly: summarizeAnomaly(anomaly),
          analyze_code: analyzeCode,
          correlate_logs: correlateLogs,
          previous_validation: validateHypothesis,
          retry_reason: 'Previous validation returned valid=false. Produce a corrected validation object.',
        },
        {
          valid: 'boolean',
          confidence_adjustment: 'number',
          gaps: ['string'],
          revised_hypothesis: {
            cause: 'string',
            mechanism: 'string',
            trigger: 'string',
          },
        },
        validateHypothesisValidation,
        0.0,
        token
      );
    }

    const finalOutputPayload = await runJsonStep(
      'final_output',
      {
        anomaly: summarizeAnomaly(anomaly),
        extract_context: extractContext,
        identify_failure_point: identifyFailurePoint,
        analyze_code: analyzeCode,
        correlate_logs: correlateLogs,
        validate_hypothesis: validateHypothesis,
        code_context: contextPayload.code_context,
      },
      {
        root_cause: 'string',
        hypothesis: {
          cause: 'string',
          mechanism: 'string',
          trigger: 'string',
        },
        fix_suggestion: 'string',
        confidence: 'number',
        issue_description: 'string',
        issue_fields: {
          step: 'string',
          class: 'string',
          method: 'string',
          file: 'string',
          line: 'number',
        },
      },
      validateFinalOutput,
      0.2,
      token
    );

    return {
      anomalyKey: anomaly.key,
      aggregatedAnomaly: anomaly,
      resolvedTarget: candidate,
      candidateTargets: candidates,
      workflow: {
        extract_context: extractContext,
        identify_failure_point: identifyFailurePoint,
        analyze_code: analyzeCode,
        correlate_logs: correlateLogs,
        validate_hypothesis: validateHypothesis,
      },
      finalOutput: finalOutputPayload,
    };
  } catch (error) {
    const diagnosticSummary = summarizeDiagnosticError(error);
    diagnostics.error(
      `Root cause analysis failed for anomaly "${anomaly.key}".\n${formatDiagnosticError(error)}`
    );
    return {
      anomalyKey: anomaly.key,
      aggregatedAnomaly: anomaly,
      resolvedTarget: candidate,
      candidateTargets: candidates,
      workflow: {
        extract_context: {},
        identify_failure_point: {},
        analyze_code: {},
        correlate_logs: {},
        validate_hypothesis: {},
      },
      finalOutput: fallbackRootCause(anomaly, diagnosticSummary, candidate),
    };
  }
}

export async function runRootCauseAnalysis(
  phase1: Phase1Result,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken
): Promise<RootCauseAnalysis[]> {
  const results: RootCauseAnalysis[] = [];
  const total = Math.max(phase1.aggregated.length, 1);

  for (let index = 0; index < phase1.aggregated.length; index += 1) {
    if (token.isCancellationRequested) {
      break;
    }

    const anomaly = phase1.aggregated[index];
    progress.report({
      message: `Preparing Continue prompt ${index + 1}/${phase1.aggregated.length}: ${anomaly.step}`,
      increment: 100 / total,
    });
    const candidates = await resolveCodeCandidates(anomaly);
    getDiagnosticsChannel().info(
      `Prepared Continue prompt for anomaly "${anomaly.key}" with ${candidates.length} code candidate(s).`
    );
    results.push(manualRootCauseResult(anomaly, phase1, candidates));
  }

  return results;
}
