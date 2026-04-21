import { createHash } from 'crypto';
import type { Anomaly, LogEvent, StepContext } from '../models/types';

function findStepContext(event: LogEvent, stepContexts: StepContext[]): StepContext {
  const context = stepContexts.find(
    (candidate) =>
      candidate.startLine <= event.fileLineNumber && event.fileLineNumber <= candidate.endLine
  );

  return (
    context ?? {
      step: '_init_',
      phase: 'Precondition',
      startLine: 1,
      endLine: event.fileLineNumber,
      failedByKeywordTranslator: false,
    }
  );
}

function createId(event: LogEvent, type: string): string {
  return createHash('sha256')
    .update(`${type}:${event.timestamp}:${event.fileLineNumber}:${event.message}`)
    .digest('hex');
}

export function detectAnomalies(events: LogEvent[], stepContexts: StepContext[], logFile: string): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const event of events) {
    const anomalyType =
      event.level === 'ERROR' ? 'ERROR' : /Exception/.test(event.message) ? 'EXCEPTION_MESSAGE' : undefined;

    if (!anomalyType) {
      continue;
    }

    const stepContext = findStepContext(event, stepContexts);
    anomalies.push({
      id: createId(event, anomalyType),
      type: anomalyType,
      message: event.message,
      stacktrace: event.stacktrace,
      step: stepContext.step === '_init_' ? '_init_' : stepContext.step.name,
      phase: stepContext.phase,
      file: logFile,
      line: event.fileLineNumber,
      sourceClass: event.sourceClass,
      sourceMethod: event.sourceMethod,
      sourceLine: event.sourceLine,
      exceptionType: event.exceptionType,
      timestamp: event.timestamp,
      logEvent: event,
      stepContext,
    });
  }

  return anomalies;
}
