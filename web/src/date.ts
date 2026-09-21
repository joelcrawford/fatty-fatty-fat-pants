// Pure date helpers live in the shared package (the mobile app uses them too).
// The React hook that keeps "today" current is web-specific: it listens to
// document visibility, where the mobile app will listen to AppState.

import { useEffect, useState } from "react";
import { localDateString } from "@nutrition/shared";

export { localDateString, daysAgo } from "@nutrition/shared";

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
