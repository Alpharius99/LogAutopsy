// src/core/parser.ts
// NO vscode imports — pure TypeScript (D-02)
import type { LogEvent } from '../types';

// Regexes from CLAUDE.md spec — do not modify
const LOG_LINE_PATTERN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\d+)\] (\w+)\s+(.+)$/;
const STANDARD_SOURCE  = /^(\S+?)\\(\w+):(\d+) - (.*)$/;
const EXCEPTION_SOURCE = /^(\S+?)\|(\w+) in (\w+):(\d+) - (.*)$/;

// Suppress unused variable warnings for regex constants — they are defined here
// as spec anchors and will be used in Phase 2 implementation
void LOG_LINE_PATTERN;
void STANDARD_SOURCE;
void EXCEPTION_SOURCE;

/**
 * Parse a combined log4net log file into LogEvent objects.
 * Phase 1: stub — returns empty array.
 */
export function parseLog(_content: string): LogEvent[] {
  // TODO: Phase 2 implementation
  return [];
}
