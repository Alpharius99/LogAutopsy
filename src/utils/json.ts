export function parseStrictJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error('Model response is not strict JSON.');
  }

  return JSON.parse(trimmed);
}

export function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function ensureString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

export function ensureNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }

  return value;
}

export function ensureBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}
