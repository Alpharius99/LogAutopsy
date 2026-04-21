import type { LogEvent, LogLevel } from '../models/types';

export const LOG_LINE_PATTERN =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\d+)\] (\w+)\s+(.+)$/;
export const STANDARD_SOURCE = /^(\S+?)\\(\w+):(\d+) - (.*)$/;
export const EXCEPTION_SOURCE = /^(\S+?)\|(\w+) in (\w+):(\d+) - (.*)$/;

function isHeaderFooterMarker(line: string): boolean {
  return /^\[(Begin|End) of /.test(line);
}

function toLevel(value: string): LogLevel {
  if (value === 'ERROR' || value === 'WARN' || value === 'INFO' || value === 'DEBUG') {
    return value;
  }

  return 'INFO';
}

function createEvent(
  timestamp: string,
  thread: string,
  level: string,
  payload: string,
  fileLineNumber: number
): LogEvent | undefined {
  const exceptionMatch = payload.match(EXCEPTION_SOURCE);
  if (exceptionMatch) {
    const [, sourceClass, exceptionType, sourceMethod, sourceLine, message] = exceptionMatch;
    return {
      timestamp,
      thread: Number(thread),
      level: toLevel(level),
      sourceClass,
      sourceMethod,
      sourceLine: Number(sourceLine),
      message,
      raw: `${timestamp} [${thread}] ${level} ${payload}`,
      continuationLines: [],
      fileLineNumber,
      exceptionType,
    };
  }

  const standardMatch = payload.match(STANDARD_SOURCE);
  if (standardMatch) {
    const [, sourceClass, sourceMethod, sourceLine, message] = standardMatch;
    return {
      timestamp,
      thread: Number(thread),
      level: toLevel(level),
      sourceClass,
      sourceMethod,
      sourceLine: Number(sourceLine),
      message,
      raw: `${timestamp} [${thread}] ${level} ${payload}`,
      continuationLines: [],
      fileLineNumber,
    };
  }

  return {
    timestamp,
    thread: Number(thread),
    level: toLevel(level),
    sourceClass: 'Unknown',
    sourceMethod: 'Unknown',
    sourceLine: 0,
    message: payload,
    raw: `${timestamp} [${thread}] ${level} ${payload}`,
    continuationLines: [],
    fileLineNumber,
  };
}

export function parseLog(content: string): LogEvent[] {
  const lines = content.split(/\r?\n/);
  const events: LogEvent[] = [];
  let current: LogEvent | undefined;

  lines.forEach((line, index) => {
    if (!line.trim() || isHeaderFooterMarker(line)) {
      return;
    }

    const match = line.match(LOG_LINE_PATTERN);
    if (match) {
      const [, timestamp, thread, level, payload] = match;
      const nextEvent = createEvent(timestamp, thread, level, payload, index + 1);
      if (!nextEvent) {
        return;
      }

      events.push(nextEvent);
      current = nextEvent;
      return;
    }

    if (!current) {
      return;
    }

    current.continuationLines.push(line);
    current.raw += `\n${line}`;
    if (current.level === 'ERROR' || /Exception/.test(line) || /Exception/.test(current.message)) {
      current.stacktrace = current.stacktrace ? `${current.stacktrace}\n${line}` : line;
    }
  });

  return events;
}
