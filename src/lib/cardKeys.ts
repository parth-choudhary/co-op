// Card key utilities — pure functions for the format (no DB access here).
//
// A card key is "<PROJECT_PREFIX>-<NUMBER>", e.g. "COOP-123". The prefix is
// alphanumeric, uppercase, 2–6 chars. The number is a positive integer with no
// padding (we follow Linear/Jira convention).
//
// All DB-touching code lives in cardKeyAssign.ts so this file stays trivially
// testable / re-importable.

/** Min/max prefix length we'll accept for a project. */
export const PREFIX_MIN_LENGTH = 2;
export const PREFIX_MAX_LENGTH = 6;

/** Acceptable prefix characters: A-Z and 0-9 only. Underscore/dash reserved as the key separator. */
const PREFIX_CHARSET = /^[A-Z0-9]+$/;

/** Format a key from prefix + number. Caller is responsible for non-null inputs. */
export function formatCardKey(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

/** Parse a string into { prefix, number } if it matches the key shape; else null. */
export function parseCardKey(input: string): { prefix: string; number: number } | null {
  const m = input.match(/^([A-Z][A-Z0-9]{1,5})-(\d+)$/);
  if (!m) return null;
  const prefix = m[1];
  const number = parseInt(m[2], 10);
  if (!Number.isFinite(number) || number <= 0) return null;
  return { prefix, number };
}

/** Validate a candidate prefix. Returns null if OK, error message otherwise. */
export function validatePrefix(candidate: string): string | null {
  if (candidate.length < PREFIX_MIN_LENGTH) return `Prefix must be at least ${PREFIX_MIN_LENGTH} characters`;
  if (candidate.length > PREFIX_MAX_LENGTH) return `Prefix must be at most ${PREFIX_MAX_LENGTH} characters`;
  if (!PREFIX_CHARSET.test(candidate)) return 'Prefix may only contain A-Z and 0-9';
  if (!/^[A-Z]/.test(candidate)) return 'Prefix must start with a letter';
  return null;
}

/**
 * Derive a prefix from a project name. Uppercase + strip non-alphanumeric +
 * take the first PREFIX_MAX_LENGTH chars. If the result is too short or
 * starts with a digit, fall back to "P" + a few alphanumerics, finally to
 * "PROJ".
 */
export function derivePrefixFromName(name: string): string {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const candidate = cleaned.slice(0, PREFIX_MAX_LENGTH);
  if (candidate.length >= PREFIX_MIN_LENGTH && /^[A-Z]/.test(candidate)) return candidate;
  // Starts with digit or is too short; prepend "P".
  const fallback = ('P' + cleaned).slice(0, PREFIX_MAX_LENGTH);
  if (fallback.length >= PREFIX_MIN_LENGTH) return fallback;
  return 'PROJ';
}
