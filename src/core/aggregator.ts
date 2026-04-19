// src/core/aggregator.ts
// NO vscode imports — pure TypeScript (D-02)
import { createHash } from 'crypto';   // Node.js built-in — no npm dep
import type { Anomaly, AggregatedAnomaly } from '../types';

/**
 * Aggregate anomalies by key: type + normalizedMessage + topStackFrame + step.
 * Key is SHA-256 hashed per CLAUDE.md spec.
 * Phase 1: stub — returns empty array.
 */
export function aggregateAnomalies(_anomalies: Anomaly[]): AggregatedAnomaly[] {
  // TODO: Phase 2 implementation
  return [];
}

/** SHA-256 hash helper — uses Node.js built-in crypto, never an npm hash lib */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
