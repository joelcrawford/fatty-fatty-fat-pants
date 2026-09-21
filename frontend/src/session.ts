// Session: who is logged in, and how requests prove it.
//
// Framework-free on purpose. It is destined for the shared package (#6), where
// the mobile app will reuse it with expo-secure-store as the `storage` and no
// `lock` (a phone app is a single process).
//
// The contract with the API (docs/API_SPEC.md → Authentication):
//   * every request carries a 15-minute access token
//   * on a 401, trade the refresh token for a new pair ONCE and retry
//   * each refresh returns a NEW refresh token and retires the old one

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Runs `fn` while holding a lock shared by everything that might refresh. */
export type Lock = <T>(fn: () => Promise<T>) => Promise<T>;

export interface SessionOptions {
  baseUrl: string;
  storage: KeyValueStorage;
  fetch?: typeof fetch;
  lock?: Lock;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: { path: string; message: string }[]) {
    super(message);
    this.name = "ApiError";
  }
}

const REFRESH_KEY = "refresh_token";

type Listener = (user: User | null) => void;

/**
 * "rejected" = the server said no: the session is over, forget the token.
 * "unreachable" = we could not ask: keep the token, it is probably still good.
 * Confusing the two would log people out every time they open the app offline.
 */
type RefreshResult = "ok" | "rejected" | "unreachable";

export class Session {
  private accessToken: string | null = null; // memory only, never persisted
  private currentUser: User | null = null;
  private refreshing: Promise<RefreshResult> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly fetchImpl: typeof fetch;
  private readonly lock: Lock;

  constructor(private readonly opts: SessionOptions) {
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args));
    this.lock = opts.lock ?? ((fn) => fn());
  }

  get user(): User | null {
    return this.currentUser;
  }

  /** Called with the user on login and with null on logout or session loss. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Requests ───────────────────────────────────────────────────────────────

  /** An authenticated API call. Returns the `data` of the response envelope. */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res = await this.send(path, init, this.accessToken);

    if (res.status === 401) {
      const refreshed = await this.refresh();
      if (refreshed === "unreachable") {
        throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
      }
      if (refreshed === "ok") {
        res = await this.send(path, init, this.accessToken); // one retry, never a loop
      }
    }

    if (res.status === 401) {
      await this.clear();
      throw new ApiError("Your session has ended. Please log in again.", 401);
    }

    return this.unwrap<T>(res);
  }

  // ── Account actions ────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<User> {
    return this.startSession(await this.publicPost("/api/auth/login", { email, password }));
  }

  async register(input: { email: string; password: string; name: string; invite_code: string }): Promise<User> {
    return this.startSession(await this.publicPost("/api/auth/register", input));
  }

  /** Resume after a page load. Resolves to the user, or null if not logged in. */
  async restore(): Promise<User | null> {
    if (!(await this.opts.storage.getItem(REFRESH_KEY))) return null;
    const refreshed = await this.refresh();
    if (refreshed === "rejected") await this.clear();
    if (refreshed !== "ok") return null;
    try {
      this.setUser(await this.request<User>("/api/auth/me"));
    } catch {
      return null; // request() has already cleared the session if it was a 401
    }
    return this.currentUser;
  }

  /** Always ends the local session, even if the server cannot be reached. */
  async logout(): Promise<void> {
    const refreshToken = await this.opts.storage.getItem(REFRESH_KEY);
    await this.clear();
    if (refreshToken) {
      await this.publicPost("/api/auth/logout", { refresh_token: refreshToken }).catch(() => undefined);
    }
  }

  async logoutEverywhere(): Promise<void> {
    await this.request("/api/auth/logout-all", { method: "POST" }).catch(() => undefined);
    await this.clear();
  }

  async deleteAccount(password: string): Promise<void> {
    await this.request("/api/auth/me", { method: "DELETE", body: JSON.stringify({ password }) });
    await this.clear();
  }

  async forgotPassword(email: string): Promise<string> {
    const data = await this.publicPost<{ message: string }>("/api/auth/forgot-password", { email });
    return data.message;
  }

  async resetPassword(token: string, password: string): Promise<string> {
    const data = await this.publicPost<{ message: string }>("/api/auth/reset-password", { token, password });
    return data.message;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private send(path: string, init: RequestInit, token: string | null): Promise<Response> {
    return this.fetchImpl(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  private async unwrap<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      throw new ApiError(body?.error ?? `Request failed (HTTP ${res.status})`, res.status, body?.details);
    }
    return body.data as T;
  }

  /** For endpoints that need no token. A 401 here means "wrong password", not "refresh and retry". */
  private async publicPost<T>(path: string, payload: unknown): Promise<T> {
    return this.unwrap<T>(await this.send(path, { method: "POST", body: JSON.stringify(payload) }, null));
  }

  private async startSession(data: { user: User; access_token: string; refresh_token: string }): Promise<User> {
    this.accessToken = data.access_token;
    await this.opts.storage.setItem(REFRESH_KEY, data.refresh_token);
    this.setUser(data.user);
    return data.user;
  }

  /**
   * Get a new token pair.
   *
   * Two layers stop a refresh token from being sent twice, which matters
   * because the server treats a re-used rotated token as theft and ends every
   * session the user has:
   *
   *  1. within this tab, all callers that hit a 401 together share ONE refresh
   *  2. across tabs, the lock serialises refreshes, and the token is read from
   *     storage only once the lock is held, so a tab that waited picks up the
   *     token the other tab just saved instead of the one it retired
   */
  private refresh(): Promise<RefreshResult> {
    if (this.refreshing) return this.refreshing;

    const attempt = this.lock(async (): Promise<RefreshResult> => {
      const refreshToken = await this.opts.storage.getItem(REFRESH_KEY);
      if (!refreshToken) return "rejected";
      let res: Response;
      try {
        res = await this.send("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) }, null);
      } catch {
        return "unreachable";
      }
      if (res.status >= 500 || res.status === 429) return "unreachable"; // server trouble or rate limit: not a verdict on the token
      if (!res.ok) return "rejected";
      const { data } = await res.json();
      this.accessToken = data.access_token;
      await this.opts.storage.setItem(REFRESH_KEY, data.refresh_token);
      return "ok";
    }).finally(() => {
      this.refreshing = null;
    });

    this.refreshing = attempt;
    return attempt;
  }

  private async clear(): Promise<void> {
    this.accessToken = null;
    await this.opts.storage.removeItem(REFRESH_KEY);
    this.setUser(null);
  }

  private setUser(user: User | null): void {
    const changed = (this.currentUser?.id ?? null) !== (user?.id ?? null);
    this.currentUser = user;
    if (changed) this.listeners.forEach((l) => l(user));
  }
}

// ── The web app's session ────────────────────────────────────────────────────

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
