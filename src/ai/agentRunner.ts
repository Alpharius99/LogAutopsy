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
import { ensureBoolean, ensureNumber, ensureObject, ensureString, parseStrictJson } from '../utils/json';

type WorkflowPayload = Record<string, unknown>;
type JsonValidator<T> = (value: unknown) => T;

const MAX_METHOD_LINES = 300;

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

async function resolveCodeCandidate(anomaly: AggregatedAnomaly): Promise<CodeCandidate | undefined> {
  const classQuery = simpleClassName(anomaly.sourceHint.class);
  const symbols =
    (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      classQuery
    )) ?? [];

  const ranked = symbols
    .filter((symbol) => symbol.location.uri.fsPath.endsWith('.cs'))
    .map((symbol) => {
      const symbolName = symbol.name;
      const container = symbol.containerName ?? '';
      const classExact =
        symbolName === classQuery ||
        container === classQuery ||
        container.endsWith(`.${classQuery}`);
      const methodExact =
        symbolName === anomaly.sourceHint.method || symbolName.endsWith(`.${anomaly.sourceHint.method}`);

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
      };
    })
    .filter((item) => item.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence || right.weight - left.weight);

  for (const item of ranked) {
    const method = await extractMethodCandidate(item.symbol.location.uri, anomaly.sourceHint.method, classQuery);
    if (method) {
      return {
        ...method,
        confidence: item.confidence,
      };
    }
  }

  return undefined;
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

async function runJsonStep<T>(
  step: string,
  payload: unknown,
  responseSchema: unknown,
  validate: JsonValidator<T>,
  temperature: number,
  token: vscode.CancellationToken
): Promise<T> {
  const raw = await analyzeWithContinue(promptEnvelope(step, payload, responseSchema), {
    systemPrompt: defaultContinueSystemPrompt(),
    temperature,
    token,
  });

  return validate(parseStrictJson(raw));
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

function fallbackRootCause(anomaly: AggregatedAnomaly, candidate?: CodeCandidate): FinalAiOutput {
  const fileName = candidate ? path.basename(candidate.filePath) : '';
  return {
    root_cause: `Unable to obtain AI diagnosis for ${anomaly.sourceHint.class}.${anomaly.sourceHint.method}`,
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
  const candidate = await resolveCodeCandidate(anomaly);
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
      workflow: {
        extract_context: extractContext,
        identify_failure_point: identifyFailurePoint,
        analyze_code: analyzeCode,
        correlate_logs: correlateLogs,
        validate_hypothesis: validateHypothesis,
      },
      finalOutput: finalOutputPayload,
    };
  } catch {
    return {
      anomalyKey: anomaly.key,
      aggregatedAnomaly: anomaly,
      resolvedTarget: candidate,
      workflow: {
        extract_context: {},
        identify_failure_point: {},
        analyze_code: {},
        correlate_logs: {},
        validate_hypothesis: {},
      },
      finalOutput: fallbackRootCause(anomaly, candidate),
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
      message: `Analyzing ${index + 1}/${phase1.aggregated.length}: ${anomaly.step}`,
      increment: 100 / total,
    });
    results.push(await analyzeAnomaly(anomaly, phase1, token));
  }

  return results;
}
