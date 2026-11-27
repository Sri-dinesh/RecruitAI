/**
 * Small Python-compatibility helpers shared by the parsing services.
 *
 * These reproduce `str.title()`, `Path.stem`, `re.escape`, alias lookups and
 * `round()` closely enough that the ported heuristics behave like
 * `backend/app/services/*.py`.
 */

/** Python `str.title()`: capitalise after every non-letter, lowercase the rest. */
export function pythonTitle(input: string): string {
  let output = '';
  let previousWasLetter = false;
  for (const char of input) {
    const isLetter = /[A-Za-z]/.test(char);
    output += isLetter ? (previousWasLetter ? char.toLowerCase() : char.toUpperCase()) : char;
    previousWasLetter = isLetter;
  }
  return output;
}

/** `pathlib.Path(filename).stem` for a single path component. */
export function pathStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** Python `re.escape` subset used by the skill keyword scans. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip the control characters Python removes after extraction. */
export function cleanControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex -- mirrors Python's explicit control range
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

/** Keep first occurrence order, matching an ordered de-duplication. */
export function dedupe<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

export type AliasData = Record<string, unknown>;

/** First non-empty string value among `aliases`. */
export function extractFieldAlias(data: AliasData, aliases: readonly string[]): string | undefined {
  for (const key of aliases) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

/** List value among `aliases`: arrays or comma-separated strings, as in Python. */
export function extractListAlias(data: AliasData, aliases: readonly string[]): string[] {
  for (const key of aliases) {
    const value = data[key];
    if (Array.isArray(value)) {
      const items = value
        .filter((item) => Boolean(item))
        .map((item) => String(item).trim())
        .filter((item) => item !== '');
      if (items.length > 0) {
        return items;
      }
    } else if (typeof value === 'string' && value.trim()) {
      const items = value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
      if (items.length > 0) {
        return items;
      }
    }
  }
  return [];
}

/** First numeric value among `aliases` (numbers or the first number in a string). */
export function extractFloatAlias(data: AliasData, aliases: readonly string[]): number | undefined {
  for (const key of aliases) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const match = /\d+(?:\.\d+)?/.exec(value);
      if (match) {
        return Number(match[0]);
      }
    }
  }
  return undefined;
}

/** First integer value among `aliases` (numbers or the first digits in a string). */
export function extractIntAlias(data: AliasData, aliases: readonly string[]): number {
  for (const key of aliases) {
    const value = data[key];
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const match = /\d+/.exec(value);
      if (match) {
        return Number.parseInt(match[0], 10);
      }
    }
  }
  return 0;
}

/**
 * Python `round()`: ties go to the nearest even digit.
 *
 * Scores are rounded to one decimal place, where JS `Math.round` would
 * occasionally disagree on exact `.5` ties.
 */
export function pythonRound(value: number, digits = 0): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;
  if (Math.abs(fraction - 0.5) < 1e-9) {
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  return Math.round(scaled) / factor;
}

/** Python `f"{value:.0f}"`. */
export function formatFixed0(value: number): string {
  return pythonRound(value, 0).toFixed(0);
}
