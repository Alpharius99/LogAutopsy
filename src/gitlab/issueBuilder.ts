import * as path from 'path';
import type { IssueCandidate, RootCauseAnalysis } from '../models/types';

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

export function buildIssueCandidate(result: RootCauseAnalysis): IssueCandidate {
  const description = hasRequiredIssueSections(result.finalOutput.issue_description)
    ? result.finalOutput.issue_description
    : buildFallbackIssueDescription(result);

  return {
    title: result.finalOutput.root_cause,
    description,
    labels: ['test-failure', 'automated-analysis'],
    rootCause: result,
  };
}
