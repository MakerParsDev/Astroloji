const LONG_OFFSET_PATTERN = /^GMT([+-])(\d{2}):(\d{2})$/;

/**
 * Resolves the UTC offset (in minutes, east-positive) in effect for `tzid`
 * at the given UTC instant, using the runtime's own ICU time zone database
 * via `Intl.DateTimeFormat` — no bundled tzdata, no new dependency. Cloudflare
 * Workers ships full ICU by default (unlike some constrained JS runtimes),
 * so this works the same in production as it does under Vitest/Node.
 *
 * DST-aware: the same `tzid` returns a different offset for a summer vs
 * winter instant where daylight saving applies.
 */
export function resolveUtcOffsetMinutes(instant: Date, tzid: string): number {
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Invalid date for timezone offset resolution.');
  }

  let formatted: string | undefined;
  try {
    formatted = new Intl.DateTimeFormat('en-US', { timeZone: tzid, timeZoneName: 'longOffset' })
      .formatToParts(instant)
      .find((part) => part.type === 'timeZoneName')?.value;
  } catch {
    throw new Error(`Unknown IANA time zone identifier: ${tzid}`);
  }

  const match = formatted ? LONG_OFFSET_PATTERN.exec(formatted) : null;
  if (!match) {
    throw new Error(`Could not resolve a UTC offset for time zone "${tzid}" at ${instant.toISOString()}.`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3], 10);
  return sign * (hours * 60 + minutes);
}

export interface LocalWallClockInput {
  /** ISO 8601 date-time with NO offset/Z suffix — the literal digits the user entered, e.g. "1990-06-15T14:30:00". */
  isoLocalDateTime: string;
  tzid: string;
}

const NAIVE_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;

/**
 * Converts a birth date/time as the user actually typed it (wall-clock digits
 * in their birth location's time zone, no offset attached) into the correct
 * UTC instant — the input the chart engine needs.
 *
 * Standard two-pass technique: interpret the literal digits as if they were
 * UTC to get a numeric anchor, look up the real offset at that anchor,
 * subtract it, then re-resolve the offset at the *result* and repeat once.
 * The second pass only matters within the rare window around a DST
 * transition, where the offset at the naive guess can differ from the offset
 * actually in effect at the true instant.
 */
export function convertLocalWallClockToUtc(input: LocalWallClockInput): Date {
  if (!NAIVE_LOCAL_PATTERN.test(input.isoLocalDateTime)) {
    throw new Error('isoLocalDateTime must be an ISO 8601 date-time without a UTC offset, e.g. "1990-06-15T14:30:00".');
  }

  const naiveUtcGuess = new Date(`${input.isoLocalDateTime}Z`);
  if (Number.isNaN(naiveUtcGuess.getTime())) {
    throw new Error('isoLocalDateTime is not a valid date-time.');
  }

  const guessOffsetMinutes = resolveUtcOffsetMinutes(naiveUtcGuess, input.tzid);
  const firstPass = new Date(naiveUtcGuess.getTime() - guessOffsetMinutes * 60_000);

  const refinedOffsetMinutes = resolveUtcOffsetMinutes(firstPass, input.tzid);
  return new Date(naiveUtcGuess.getTime() - refinedOffsetMinutes * 60_000);
}
