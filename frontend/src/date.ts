// Calendar dates in the user's own timezone.
//
// A log entry belongs to the day the user experienced, so dates are built
// from LOCAL calendar fields. Never derive a date from toISOString(): that is
// UTC, and for anyone west of Greenwich it rolls over to "tomorrow" in the
// late afternoon or evening (5pm in Vancouver during daylight time).
//
// Destined for the shared package (#6) so the mobile app uses the same code.

import { useEffect, useState } from "react";

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

/**
 * Today's local date, kept current.
 *
 * A PWA on a phone is rarely closed; it is backgrounded and resumed. Without
 * this, an app opened yesterday keeps logging to yesterday. Re-checks when the
 * app becomes visible or focused, and once a minute while it stays open.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => localDateString());

  useEffect(() => {
    // setState with an unchanged string is a no-op, so this is cheap.
    const check = () => setToday(localDateString());
    const onVisible = () => { if (document.visibilityState === "visible") check(); };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);

  return today;
}
