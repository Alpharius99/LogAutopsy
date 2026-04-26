import * as path from 'path';
import type { IssueCandidate, Phase1Result, RootCauseAnalysis, StepContext } from '../models/types';

const REQUIRED_SECTIONS = [
  '## Summary',
  '## Failing Step',
  '## Root Cause',
  '## Hypothesis',
  '## Suggested Fix',
  '## Evidence',
];

export function hasRequiredIssueSections(description: string): boolean {
  return REQUIRED_SECTIONS.every((section) => description.includes(section));
}

function featureFileName(phase1?: Phase1Result): string | undefined {
  const featureUri = phase1?.artifact.featureUri;
  return featureUri ? path.basename(featureUri) : undefined;
}

function relatedStep(
  result: RootCauseAnalysis,
  phase1?: Phase1Result
): (StepContext & { step: Exclude<StepContext['step'], '_init_'> }) | undefined {
  return phase1?.steps.filter(hasGherkinStep).find((step) => step.step.name === result.aggregatedAnomaly.step);
}

function hasGherkinStep(step: StepContext): step is StepContext & { step: Exclude<StepContext['step'], '_init_'> } {
  return step.step !== '_init_';
}

function deriveReproductionSteps(result: RootCauseAnalysis, phase1?: Phase1Result): string[] {
  if (!phase1) {
    return [];
  }

  const targetStep = relatedStep(result, phase1);
  const orderedSteps = phase1.steps.filter(hasGherkinStep);
  if (!targetStep || orderedSteps.length === 0) {
    return [];
  }

  const scopedSteps = orderedSteps.filter((step) => {
    if (step.phase !== targetStep.phase) {
      return false;
    }

    if (step.step.scenario !== targetStep.step.scenario) {
      return false;
    }

    return step.startLine <= targetStep.startLine;
  });

  const reproductionSteps = scopedSteps.map((step) => {
    const resultSuffix = step.result ? ` -> expected log result: ${step.result}` : '';
    return `${step.step.keyword} ${step.step.name}${resultSuffix}`;
  });

  return Array.from(new Set(reproductionSteps));
}

function truncateCode(code: string, maxLines: number): string {
  return code
    .split(/\r?\n/)
    .slice(0, maxLines)
    .join('\n')
    .trim();
}

function formatAcceptanceCriteria(result: RootCauseAnalysis, phase1?: Phase1Result): string[] {
  const featureName = featureFileName(phase1);
  const criteria = [
    `Executing the failing step \`${result.aggregatedAnomaly.step}\` no longer produces \`${result.aggregatedAnomaly.message}\`.`,
    `No new log entries contain \`${result.aggregatedAnomaly.sourceHint.class}.${result.aggregatedAnomaly.sourceHint.method}\` as the top failing frame for this scenario.`,
  ];

  if (featureName) {
    criteria.unshift(`The scenario in feature file \`${featureName}\` covering \`${result.aggregatedAnomaly.step}\` passes.`);
  }

  return criteria;
}

export function buildGeneratedIssueDescription(
  result: RootCauseAnalysis,
  phase1?: Phase1Result
): string {
  const output = result.finalOutput;
  const target = result.resolvedTarget;
  const featureName = featureFileName(phase1) ?? 'Unknown';
  const reproductionSteps = deriveReproductionSteps(result, phase1);
  const acceptanceCriteria = formatAcceptanceCriteria(result, phase1);
  const stackTrace = result.aggregatedAnomaly.stacktrace?.trim() || 'No stack trace captured.';
  const codeSnippet =
    target?.methodBody && target.methodBody.trim().length > 0
      ? truncateCode(target.methodBody, 40)
      : undefined;

  return [
    '## Summary',
    output.root_cause,
    '',
    '## Failing Step',
    `- **Step:** ${output.issue_fields.step}`,
    `- **Phase:** ${result.aggregatedAnomaly.phase}`,
    `- **Feature File:** ${featureName}`,
    `- **First Occurrence:** ${result.aggregatedAnomaly.firstOccurrence.timestamp}`,
    '',
    '## Root Cause',
    output.hypothesis.cause,
    '',
    '## Hypothesis',
    `- **Cause:** ${output.hypothesis.cause}`,
    `- **Mechanism:** ${output.hypothesis.mechanism}`,
    `- **Trigger:** ${output.hypothesis.trigger}`,
    '',
    '## Reproduction Steps',
    reproductionSteps.length > 0
      ? reproductionSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')
      : '1. Reproduction steps could not be derived reliably from the available log.',
    '',
    '## Suggested Fix',
    output.fix_suggestion,
    '',
    '## Evidence',
    `- **Error:** ${result.aggregatedAnomaly.message}`,
    `- **Source:** ${result.aggregatedAnomaly.sourceHint.class}.${result.aggregatedAnomaly.sourceHint.method}:${result.aggregatedAnomaly.sourceHint.line}`,
    `- **Resolved File:** ${target ? `${path.basename(target.filePath)}:${target.startLine}` : 'Unresolved'}`,
    `- **Occurrences:** ${result.aggregatedAnomaly.occurrences}`,
    '',
    '```text',
    stackTrace,
    '```',
    '',
    '## Relevant Code',
    codeSnippet
      ? ['```csharp', codeSnippet, '```'].join('\n')
      : 'No source snippet could be resolved automatically.',
    '',
    '## Acceptance Criteria',
    acceptanceCriteria.map((criterion) => `- ${criterion}`).join('\n'),
  ].join('\n');
}

export function buildFallbackIssueDescription(result: RootCauseAnalysis): string {
  const output = result.finalOutput;
  const target = result.resolvedTarget;
  return [
    '## Summary',
    output.root_cause,
    '',
    '## Failing Step',
    output.issue_fields.step,
    '',
    '## Root Cause',
    output.hypothesis.cause,
    '',
    '## Hypothesis',
    [
      `Cause: ${output.hypothesis.cause}`,
      `Mechanism: ${output.hypothesis.mechanism}`,
      `Trigger: ${output.hypothesis.trigger}`,
    ].join('\n'),
    '',
    '## Suggested Fix',
    output.fix_suggestion,
    '',
    '## Evidence',
    [
      `Anomaly: ${result.aggregatedAnomaly.message}`,
      `Top stack frame: ${result.aggregatedAnomaly.topStackFrame}`,
      `Resolved target: ${target ? `${path.basename(target.filePath)}:${target.startLine}` : 'unresolved'}`,
    ].join('\n'),
  ].join('\n');
}

export function buildIssueCandidate(result: RootCauseAnalysis, phase1?: Phase1Result): IssueCandidate {
  const generatedDescription = buildGeneratedIssueDescription(result, phase1);
  const description = hasRequiredIssueSections(generatedDescription)
    ? generatedDescription
    : buildFallbackIssueDescription(result);

  return {
    title: result.finalOutput.root_cause,
    description,
    labels: ['test-failure', 'automated-analysis'],
    rootCause: result,
  };
}
