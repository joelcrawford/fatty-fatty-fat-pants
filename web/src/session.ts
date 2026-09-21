// The web app's one session. The Session class itself is shared with the
// mobile app; only the storage and the cross-tab lock are web-specific.

import { Session, Lock } from "@nutrition/shared";

export { Session, ApiError } from "@nutrition/shared";
export type { User, KeyValueStorage } from "@nutrition/shared";

/** Serialise refreshes across browser tabs. Falls back to no lock where the Web Locks API is missing. */
const webLock: Lock = (fn) =>
  typeof navigator !== "undefined" && navigator.locks
    ? (navigator.locks.request("nutrition-auth-refresh", fn) as ReturnType<typeof fn>)
    : fn();

// Trade-off, stated plainly: the refresh token lives in localStorage so a page
// reload keeps you logged in. localStorage is readable by any script running
// on this origin, so an XSS bug could steal it. The app renders no HTML from
// user input and loads no third-party scripts, the access token never leaves
// memory, and the server ends every session if a stolen token is replayed.
// Acceptable for this client, which is due to be replaced by the mobile app.
export const session = new Session({
  baseUrl: import.meta.env.VITE_API_URL || "",
  storage: typeof localStorage !== "undefined" ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  lock: webLock,
});
