import { beforeEach, describe, expect, it, vi } from "vitest";
import { Session, ApiError, KeyValueStorage } from "./session";
import type { User } from "./types";

// A tiny fake of the API's auth behaviour: it knows which access and refresh
// tokens are currently good, and rotates the refresh token like the real one.
const USER: User = { id: 7, email: "sam@example.com", name: "Sam", created_at: "2026-09-20 18:00:00" };

function fakeServer() {
  const state = {
    validAccess: new Set<string>(),
    validRefresh: new Set<string>(),
    rotated: new Set<string>(),
    theftDetected: false,
    offline: false,
    issued: 0,
    calls: [] as { path: string; auth: string | null; body: any }[],
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const issue = () => {
    const n = ++state.issued;
    state.validAccess.add(`access-${n}`);
    state.validRefresh.add(`refresh-${n}`);
    return { access_token: `access-${n}`, refresh_token: `refresh-${n}`, token_type: "Bearer", expires_in: 900 };
  };

  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (state.offline) throw new TypeError("Failed to fetch");
    const path = url.replace("https://api.test", "");
    const auth = (init.headers as Record<string, string>).Authorization ?? null;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    state.calls.push({ path, auth, body });
    await new Promise((r) => setTimeout(r, 1)); // let concurrent callers overlap

    if (path === "/api/auth/login") {
      return body.password === "right" ? json(200, { success: true, data: { user: USER, ...issue() } }) : json(401, { success: false, error: "Email or password is incorrect" });
    }
    if (path === "/api/auth/refresh") {
      if (state.rotated.has(body.refresh_token)) { state.theftDetected = true; state.validRefresh.clear(); state.validAccess.clear(); }
      if (!state.validRefresh.delete(body.refresh_token)) return json(401, { success: false, error: "Session expired. Please log in again." });
      state.rotated.add(body.refresh_token);
      return json(200, { success: true, data: issue() });
    }
    if (path === "/api/auth/logout") { state.validRefresh.delete(body.refresh_token); return json(200, { success: true, data: { logged_out: true } }); }

    const token = auth?.replace("Bearer ", "") ?? "";
    if (!state.validAccess.has(token)) return json(401, { success: false, error: "Authentication required" });
    if (path === "/api/auth/me") return json(200, { success: true, data: USER });
    if (path === "/api/food/bad") return json(400, { success: false, error: "date: is not a real calendar date", details: [{ path: "date", message: "is not a real calendar date" }] });
    return json(200, { success: true, data: { path, servedWith: token } });
  });

  return { state, fetchImpl: fetchImpl as unknown as typeof fetch, expireAccessTokens: () => state.validAccess.clear() };
}

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}

let server: ReturnType<typeof fakeServer>;
let storage: ReturnType<typeof memoryStorage>;
let session: Session;
const newSession = (s = storage) => new Session({ baseUrl: "https://api.test", storage: s, fetch: server.fetchImpl });

beforeEach(() => {
  server = fakeServer();
  storage = memoryStorage();
  session = newSession();
});

describe("logging in", () => {
  it("keeps the access token in memory and only the refresh token in storage", async () => {
    const seen: (User | null)[] = [];
    session.subscribe((u) => seen.push(u));

    expect(await session.login("sam@example.com", "right")).toEqual(USER);

    expect(session.user).toEqual(USER);
    expect(seen).toEqual([USER]);
    expect(storage.data).toEqual({ refresh_token: "refresh-1" });
    expect(JSON.stringify(storage.data)).not.toContain("access-");
  });

  it("a wrong password surfaces the API's message and does not attempt a refresh", async () => {
    await expect(session.login("sam@example.com", "wrong")).rejects.toThrow("Email or password is incorrect");
    expect(server.state.calls.map((c) => c.path)).toEqual(["/api/auth/login"]);
    expect(session.user).toBeNull();
  });
});

describe("authenticated requests", () => {
  beforeEach(() => session.login("sam@example.com", "right"));

  it("send the access token and return the envelope's data", async () => {
    expect(await session.request("/api/food/2026-09-20")).toEqual({ path: "/api/food/2026-09-20", servedWith: "access-1" });
  });

  it("surface validation errors with their field details", async () => {
    const err = await session.request("/api/food/bad").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: "date: is not a real calendar date", details: [{ path: "date", message: "is not a real calendar date" }] });
    expect(session.user).toEqual(USER); // a 400 is not a session problem
  });

  it("when the access token has expired: refresh once, retry, and save the ROTATED refresh token", async () => {
    server.expireAccessTokens();

    expect(await session.request("/api/food/2026-09-20")).toMatchObject({ servedWith: "access-2" });

    expect(server.state.calls.map((c) => c.path)).toEqual(["/api/auth/login", "/api/food/2026-09-20", "/api/auth/refresh", "/api/food/2026-09-20"]);
    expect(storage.data.refresh_token).toBe("refresh-2");
  });

  it("five requests hitting a 401 together share ONE refresh, so the server never sees a token twice", async () => {
    server.expireAccessTokens();

    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => session.request(`/api/food/2026-09-0${n}`)));

    expect(results).toHaveLength(5);
    expect(server.state.calls.filter((c) => c.path === "/api/auth/refresh")).toHaveLength(1);
    expect(server.state.theftDetected).toBe(false);
  });

  it("a second expiry later triggers a second refresh (the single-flight promise is not stuck)", async () => {
    server.expireAccessTokens();
    await session.request("/api/a");
    server.expireAccessTokens();
    expect(await session.request("/api/b")).toMatchObject({ servedWith: "access-3" });
    expect(storage.data.refresh_token).toBe("refresh-3");
  });

  it("when the refresh is refused, the session ends: storage cleared, listeners told, caller gets a clear error", async () => {
    const seen: (User | null)[] = [];
    session.subscribe((u) => seen.push(u));
    server.expireAccessTokens();
    server.state.validRefresh.clear();

    await expect(session.request("/api/food/2026-09-20")).rejects.toThrow("Your session has ended. Please log in again.");

    expect(session.user).toBeNull();
    expect(seen).toEqual([null]);
    expect(storage.data).toEqual({});
  });

  it("never loops: if the retry is ALSO a 401, give up after one refresh", async () => {
    server.expireAccessTokens();
    const original = server.fetchImpl;
    const alwaysRejectData = vi.fn(async (url: string, init?: RequestInit) => {
      const res = await original(url, init);
      if (String(url).includes("/api/auth/")) return res;
      return new Response(JSON.stringify({ success: false, error: "Authentication required" }), { status: 401 });
    });
    const s = new Session({ baseUrl: "https://api.test", storage, fetch: alwaysRejectData as unknown as typeof fetch });

    await expect(s.request("/api/food/2026-09-20")).rejects.toThrow("Your session has ended");
    expect(alwaysRejectData.mock.calls.map((c) => String(c[0]).replace("https://api.test", ""))).toEqual([
      "/api/food/2026-09-20", "/api/auth/refresh", "/api/food/2026-09-20",
    ]);
  });
});

describe("being offline is not the same as being logged out", () => {
  it("a request that needs a refresh while offline fails, but the session survives", async () => {
    await session.login("sam@example.com", "right");
    server.expireAccessTokens();
    const original = server.fetchImpl;
    const refreshUnreachable = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/auth/refresh")) throw new TypeError("Failed to fetch");
      return original(url, init);
    }) as unknown as typeof fetch;
    const s = new Session({ baseUrl: "https://api.test", storage, fetch: refreshUnreachable });

    await expect(s.request("/api/food/2026-09-20")).rejects.toThrow("Could not reach the server");
    expect(storage.data.refresh_token).toBe("refresh-1");
  });

  it("opening the app offline keeps the stored session for next time", async () => {
    await session.login("sam@example.com", "right");
    server.state.offline = true;

    expect(await newSession().restore()).toBeNull();
    expect(storage.data.refresh_token).toBe("refresh-1");

    server.state.offline = false;
    expect(await newSession().restore()).toEqual(USER);
  });

  it.each([500, 503, 429])("a %i from the refresh endpoint is not a verdict on the token", async (status) => {
    storage.data.refresh_token = "refresh-x";
    const s = new Session({ baseUrl: "https://api.test", storage, fetch: (async () => new Response("{}", { status })) as unknown as typeof fetch });
    expect(await s.restore()).toBeNull();
    expect(storage.data.refresh_token).toBe("refresh-x");
  });
});

describe("restoring a session on page load", () => {
  it("with nothing stored: not logged in, and no network call at all", async () => {
    expect(await session.restore()).toBeNull();
    expect(server.state.calls).toEqual([]);
  });

  it("with a good refresh token: logged in again without a password", async () => {
    await session.login("sam@example.com", "right");
    const reloaded = newSession();
    const seen: (User | null)[] = [];
    reloaded.subscribe((u) => seen.push(u));

    expect(await reloaded.restore()).toEqual(USER);
    expect(seen).toEqual([USER]);
    expect(storage.data.refresh_token).toBe("refresh-2");
  });

  it("with a refused refresh token: storage is cleaned up", async () => {
    storage.data.refresh_token = "stale";
    expect(await session.restore()).toBeNull();
    expect(storage.data).toEqual({});
  });
});

describe("two browser tabs", () => {
  // Both tabs share storage (as localStorage is shared) and both wake up with
  // an expired access token. A lock makes them take turns.
  const sharedLock = () => {
    let tail: Promise<unknown> = Promise.resolve();
    return <T,>(fn: () => Promise<T>): Promise<T> => {
      const run = tail.then(fn, fn);
      tail = run.catch(() => undefined);
      return run;
    };
  };

  it("WITHOUT a lock, both send the same refresh token and the server ends every session (why the lock exists)", async () => {
    await session.login("sam@example.com", "right");
    const [a, b] = [newSession(), newSession()];
    await Promise.all([a.restore(), b.restore()]);
    expect(server.state.theftDetected).toBe(true);
  });

  it("WITH the lock, the second tab waits, then uses the token the first tab just saved", async () => {
    await session.login("sam@example.com", "right");
    const lock = sharedLock();
    const make = () => new Session({ baseUrl: "https://api.test", storage, fetch: server.fetchImpl, lock });
    const [a, b] = [make(), make()];

    expect(await Promise.all([a.restore(), b.restore()])).toEqual([USER, USER]);

    expect(server.state.theftDetected).toBe(false);
    expect(server.state.calls.filter((c) => c.path === "/api/auth/refresh").map((c) => c.body.refresh_token)).toEqual(["refresh-1", "refresh-2"]);
  });
});

describe("logging out", () => {
  beforeEach(() => session.login("sam@example.com", "right"));

  it("revokes the refresh token on the server and forgets everything locally", async () => {
    const seen: (User | null)[] = [];
    session.subscribe((u) => seen.push(u));

    await session.logout();

    expect(server.state.validRefresh.has("refresh-1")).toBe(false);
    expect(storage.data).toEqual({});
    expect(session.user).toBeNull();
    expect(seen).toEqual([null]);
  });

  it("still logs out locally when the server cannot be reached", async () => {
    server.state.offline = true;
    await expect(session.logout()).resolves.toBeUndefined();
    expect(storage.data).toEqual({});
    expect(session.user).toBeNull();
  });

  it("a request after logout carries no token", async () => {
    await session.logout();
    await session.request("/api/food/2026-09-20").catch(() => undefined);
    expect(server.state.calls[server.state.calls.length - 1].auth).toBeNull();
  });
});
