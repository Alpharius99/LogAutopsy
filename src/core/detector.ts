// src/core/detector.ts
// NO vscode imports — pure TypeScript (D-02)
import type { LogEvent, StepContext, Anomaly } from '../types';

/**
 * Detect anomalies from parsed log events.
 * Anomaly = any LogEvent with level === 'ERROR'. WARN is not an anomaly.
 * Phase 1: stub — returns empty array.
 */
export function detectAnomalies(
  _events: LogEvent[],
  _stepContexts: StepContext[]
): Anomaly[] {
  // TODO: Phase 2 implementation
  return [];
}
