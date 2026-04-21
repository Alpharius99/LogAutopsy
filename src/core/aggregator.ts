import { createHash } from 'crypto';
import type { AggregatedAnomaly, Anomaly } from '../models/types';

function topStackFrame(anomaly: Anomaly): string {
  return anomaly.stacktrace?.split(/\r?\n/).find((line) => line.trim())?.trim()
    ?? `${anomaly.sourceClass}.${anomaly.sourceMethod}`;
}

export function aggregateAnomalies(anomalies: Anomaly[]): AggregatedAnomaly[] {
  const groups = new Map<string, Anomaly[]>();

  for (const anomaly of anomalies) {
    const normalizedMessage = anomaly.message;
    const frame = topStackFrame(anomaly);
    const rawKey = `${anomaly.type}|${normalizedMessage}|${frame}|${anomaly.step}`;
    const key = hashKey(rawKey);
    const group = groups.get(key) ?? [];
    group.push(anomaly);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const first = [...group].sort((left, right) => left.timestamp.localeCompare(right.timestamp))[0];
      return {
        key,
        type: first.type,
        message: first.message,
        normalizedMessage: first.message,
        topStackFrame: topStackFrame(first),
        step: first.step,
        phase: first.phase,
        occurrences: group.length,
        firstOccurrence: {
          file: first.file,
          line: first.line,
          timestamp: first.timestamp,
        },
        stacktrace: first.stacktrace,
        sourceHint: {
          class: first.sourceClass,
          method: first.sourceMethod,
          line: first.sourceLine,
        },
        anomalies: group,
      } satisfies AggregatedAnomaly;
    })
    .sort((left, right) =>
      left.firstOccurrence.timestamp.localeCompare(right.firstOccurrence.timestamp)
    );
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
