// Calendar dates in the user's own timezone.
//
// A log entry belongs to the day the user experienced, so dates are built
// from LOCAL calendar fields. Never derive a date from toISOString(): that is
// UTC, and for anyone west of Greenwich it rolls over to "tomorrow" in the
// late afternoon or evening (5pm in Vancouver during daylight time).

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for the given instant, in the local timezone. */
export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The local date `days` calendar days before `from`.
 *
 * Works in calendar days rather than multiples of 24 hours, so it is correct
 * across daylight-saving changes and month and year boundaries.
 */
export function daysAgo(days: number, from: Date = new Date()): string {
  return localDateString(new Date(from.getFullYear(), from.getMonth(), from.getDate() - days));
}
