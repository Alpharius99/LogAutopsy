import type { AnalysisPhase, GherkinStep, KeywordType, LogEvent, StepContext } from '../models/types';

const STEP_START_PATTERN =
  /^Next test step '([^']+)' \(location '([^']+)', keyword '([^']+)\s*', keyword type '([^']+)', argument '([^']*)'\)\.?$/;
const STEP_RESOLVED_PATTERN = /^Got test step: '([^']+)'\.?$/;
const STEP_RESULT_PATTERN = /^Result of test step '([^']+)'\.?$/;
const PHASE_RESULT_PATTERN = /^Test step result after re-evaluation is '([^']+)'\.?$/;
const KEYWORD_FAILURE_PATTERN =
  /^The test (?:action|check) '([^']+)' is failed\.$/;

function mapPhase(scenario: string): AnalysisPhase {
  if (scenario === 'Precondition') {
    return 'Precondition';
  }

  if (scenario === 'PostCondition') {
    return 'PostCondition';
  }

  return 'TestCase';
}

function mapKeywordType(keyword: string): KeywordType {
  if (keyword === 'Then') {
    return 'Outcome';
  }

  if (keyword === 'And' || keyword === 'But') {
    return 'Conjunction';
  }

  return 'Action';
}

export function parseFeatureFile(content: string): GherkinStep[] {
  const steps: GherkinStep[] = [];
  const lines = content.split(/\r?\n/);
  let currentScenario = 'TestCase';

  lines.forEach((line, index) => {
    const scenarioMatch = line.match(/^\s*Scenario:\s*(.+?)\s*$/);
    if (scenarioMatch) {
      currentScenario = scenarioMatch[1].trim();
      return;
    }

    const stepMatch = line.match(/^(\s*)(Given|When|Then|And|But)\s+(.+?)\s*$/);
    if (!stepMatch) {
      return;
    }

    const [, indent, keyword, text] = stepMatch;
    steps.push({
      name: text.trim(),
      keyword,
      keywordType: mapKeywordType(keyword),
      location: `${index + 1}:${indent.length + 1}`,
      argument: '',
      scenario: currentScenario,
      phase: mapPhase(currentScenario),
    });
  });

  return steps;
}

function createStepQueue(steps: GherkinStep[]): Map<string, GherkinStep[]> {
  const queue = new Map<string, GherkinStep[]>();

  for (const step of steps) {
    const items = queue.get(step.name) ?? [];
    items.push(step);
    queue.set(step.name, items);
  }

  return queue;
}

function resolveStep(stepName: string, stepQueue: Map<string, GherkinStep[]>): GherkinStep {
  const queue = stepQueue.get(stepName);
  if (queue && queue.length > 0) {
    return queue.shift()!;
  }

  return {
    name: stepName,
    keyword: 'When',
    keywordType: 'Action',
    location: '0:0',
    argument: '',
    scenario: 'TestCase',
    phase: 'TestCase',
  };
}

function isStepStart(event: LogEvent): RegExpMatchArray | null {
  if (event.sourceMethod !== 'ExecuteStep') {
    return null;
  }

  return event.message.match(STEP_START_PATTERN);
}

export function buildStepContexts(events: LogEvent[], featureContent: string): StepContext[] {
  const featureSteps = parseFeatureFile(featureContent);
  const stepQueue = createStepQueue(featureSteps);
  const stepContexts: StepContext[] = [];
  let current: StepContext | undefined;

  for (const event of events) {
    const stepStartMatch = isStepStart(event);
    if (stepStartMatch) {
      if (current) {
        current.endLine = event.fileLineNumber - 1;
      }

      const [, loggedName, location, keyword, keywordType, argument] = stepStartMatch;
      const resolvedStep = resolveStep(loggedName, stepQueue);
      current = {
        step: {
          ...resolvedStep,
          name: loggedName,
          location,
          keyword,
          keywordType: (keywordType as KeywordType) || resolvedStep.keywordType,
          argument,
        },
        phase: resolvedStep.phase,
        startLine: event.fileLineNumber,
        endLine: Number.MAX_SAFE_INTEGER,
        failedByKeywordTranslator: false,
      };
      stepContexts.push(current);
      continue;
    }

    if (!current || current.step === '_init_') {
      continue;
    }

    const stepResolvedMatch = event.message.match(STEP_RESOLVED_PATTERN);
    if (stepResolvedMatch && current.step.name !== stepResolvedMatch[1]) {
      current.step = {
        ...current.step,
        name: stepResolvedMatch[1],
      };
    }

    const stepResultMatch = event.message.match(STEP_RESULT_PATTERN) ?? event.message.match(PHASE_RESULT_PATTERN);
    if (stepResultMatch) {
      current.result = stepResultMatch[1];
    }

    const failureMatch = event.message.match(KEYWORD_FAILURE_PATTERN);
    if (failureMatch && failureMatch[1] === current.step.name) {
      current.failedByKeywordTranslator = true;
    }
  }

  if (current) {
    current.endLine = events.at(-1)?.fileLineNumber ?? current.startLine;
  }

  return stepContexts;
}
