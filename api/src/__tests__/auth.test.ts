import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../app";
import { makeTestContext, TestContext, createUser, food, DAY, PASSWORD } from "./helpers";

let t: TestContext;
beforeEach(async () => { t = await makeTestContext(); });
afterEach(() => { t.db.close(); });

const count = (sql: string, ...args: unknown[]) => (t.db.prepare(sql).get(...args) as { n: number }).n;
const registration = (overrides: Record<string, unknown> = {}) => ({
  email: "new@example.com", password: "a long enough password", name: "New Person", invite_code: t.invite(), ...overrides,
});
const tokenFromLastEmail = () => decodeURIComponent(t.outbox[t.outbox.length - 1].text.match(/token=(\S+)/)![1]);

describe("every data route is locked", () => {
  it.each([
    ["get", `/api/food/${DAY}`], ["post", "/api/food"], ["post", "/api/food/batch"], ["delete", "/api/food/1"],
    ["get", `/api/exercise/${DAY}`], ["post", "/api/exercise"], ["delete", "/api/exercise/1"],
    ["get", `/api/summary/day/${DAY}`], ["get", "/api/summary/range?start=2026-04-01&end=2026-04-30"],
    ["get", "/api/summary/weight"], ["post", "/api/summary/weight"],
    ["get", "/api/auth/me"], ["delete", "/api/auth/me"], ["post", "/api/auth/logout-all"],
    ["get", "/api/anything-added-later"],
  ] as const)("%s %s without a token is 401", async (method, url) => {
    const res = await t.anonymous[method](url);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: "Authentication required" });
  });

  it("/health stays public", async () => {
    expect((await t.anonymous.get("/health")).status).toBe(200);
  });

  it("checks the token before validating the body, so strangers learn nothing about the API", async () => {
    const res = await t.anonymous.post("/api/food").send({ garbage: true });
    expect(res.status).toBe(401);
  });
});

describe("access tokens", () => {
  const call = (token: string) => t.anonymous.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
  const sign = (claims: object, secret = t.config.jwtSecret, opts: jwt.SignOptions = {}) =>
    jwt.sign({ ver: 0, ...claims }, secret, { subject: String(t.userId), expiresIn: 60, ...opts });

  it("a good token works", async () => {
    expect((await call(sign({}))).status).toBe(200);
  });

  it.each([
    ["signed with another key", () => sign({}, "some-other-secret-some-other-secret")],
    ["expired", () => sign({}, undefined, { expiresIn: -10 })],
    ["unsigned (alg none)", () => jwt.sign({ ver: 0 }, "", { algorithm: "none", subject: String(t.userId) })],
    ["for a user that does not exist", () => jwt.sign({ ver: 0 }, t.config.jwtSecret, { subject: "99999", expiresIn: 60 })],
    ["with a stale token_version", () => sign({ ver: -1 })],
    ["with no version claim", () => jwt.sign({}, t.config.jwtSecret, { subject: String(t.userId), expiresIn: 60 })],
    ["with a non-numeric subject", () => jwt.sign({ ver: 0 }, t.config.jwtSecret, { subject: "1 OR 1=1", expiresIn: 60 })],
    ["that is not a JWT", () => "hello"],
  ])("a token %s is refused", async (_label, make) => {
    expect((await call(make())).status).toBe(401);
  });

  it("tampering with the payload breaks the signature", async () => {
    const [h, , s] = sign({}).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "2", ver: 0, exp: 9999999999 })).toString("base64url");
    expect((await call(`${h}.${forged}.${s}`)).status).toBe(401);
  });

  it.each(["", "Basic abc", "bearer lowercase-scheme", "Bearer"])("Authorization: '%s' is refused", async (header) => {
    const res = await t.anonymous.get("/api/auth/me").set("Authorization", header);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/register", () => {
  it("creates an account, logs it in, and spends the invite", async () => {
    const body = registration({ email: "  New@Example.COM " });
    const res = await t.anonymous.post("/api/auth/register").send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: "new@example.com", name: "New Person" });
    expect(res.body.data).toMatchObject({ token_type: "Bearer", expires_in: 900 });
    expect(res.body.data.user).not.toHaveProperty("password_hash");

    const me = await t.anonymous.get("/api/auth/me").set("Authorization", `Bearer ${res.body.data.access_token}`);
    expect(me.body.data.email).toBe("new@example.com");

    const invite = t.db.prepare("SELECT used_by, used_at FROM invite_codes WHERE code = ?").get(body.invite_code) as any;
    expect(invite.used_by).toBe(res.body.data.user.id);
    expect(invite.used_at).not.toBeNull();
  });

  it("never stores the password itself", async () => {
    await t.anonymous.post("/api/auth/register").send(registration());
    const { password_hash } = t.db.prepare("SELECT password_hash FROM users WHERE email = 'new@example.com'").get() as any;
    expect(password_hash).toMatch(/^scrypt\$/);
    expect(password_hash).not.toContain("a long enough password");
  });

  it("a new account starts empty and cannot see anyone else's data", async () => {
    await t.api.post("/api/food").send(food());
    const res = await t.anonymous.post("/api/auth/register").send(registration());
    const mine = await t.anonymous.get(`/api/food/${DAY}`).set("Authorization", `Bearer ${res.body.data.access_token}`);
    expect(mine.body.data).toEqual([]);
  });

  it.each([
    ["made up", () => "AAAA-BBBB-CCCC"],
    ["expired", () => { const c = t.invite(); t.db.prepare("UPDATE invite_codes SET expires_at = 1 WHERE code = ?").run(c); return c; }],
  ])("refuses an invite code that is %s", async (_l, code) => {
    const res = await t.anonymous.post("/api/auth/register").send(registration({ invite_code: code() }));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("That invite code is not valid");
    expect(count("SELECT COUNT(*) AS n FROM users WHERE email = 'new@example.com'")).toBe(0);
  });

  it("an invite works exactly once", async () => {
    const invite_code = t.invite();
    const first = await t.anonymous.post("/api/auth/register").send(registration({ invite_code }));
    const second = await t.anonymous.post("/api/auth/register").send(registration({ invite_code, email: "second@example.com" }));
    expect([first.status, second.status]).toEqual([201, 403]);
  });

  it("an invite cannot be shared by two people registering at the same moment", async () => {
    const invite_code = t.invite();
    const results = await Promise.all(
      ["a", "b", "c", "d"].map((n) => t.anonymous.post("/api/auth/register").send(registration({ invite_code, email: `${n}@example.com` })))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(count("SELECT COUNT(*) AS n FROM users WHERE email LIKE '_@example.com'")).toBe(1);
  });

  it("refuses an email that already has an account, without spending the invite", async () => {
    const invite_code = t.invite();
    const res = await t.anonymous.post("/api/auth/register").send(registration({ invite_code, email: t.email.toUpperCase() }));
    expect(res.status).toBe(409);
    expect(count("SELECT COUNT(*) AS n FROM invite_codes WHERE code = ? AND used_at IS NULL", invite_code)).toBe(1);
  });

  it.each([
    ["email", "not-an-email", "must be a valid email address"],
    ["password", "short", "must be at least 10 characters"],
    ["password", "x".repeat(201), "cannot be longer than 200 characters"],
    ["invite_code", undefined, "is required"],
  ])("validates %s = %j", async (field, value, message) => {
    const res = await t.anonymous.post("/api/auth/register").send(registration({ [field]: value }));
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ path: field, message }]);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the right password, whatever the case of the email", async () => {
    const res = await t.anonymous.post("/api/auth/login").send({ email: t.email.toUpperCase(), password: t.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(t.userId);
    expect(res.body.data.access_token).toEqual(expect.any(String));
    expect(res.body.data.refresh_token).toEqual(expect.any(String));
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await t.anonymous.post("/api/auth/login").send({ email: t.email, password: "not the password" });
    const unknown = await t.anonymous.post("/api/auth/login").send({ email: "nobody@example.com", password: t.password });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("an account migrated from the single-user app cannot be logged in to with any password", async () => {
    t.db.prepare("INSERT INTO users (email, password_hash) VALUES ('legacy-user-1@invalid', '!')").run();
    for (const password of ["!", "", " "]) {
      const res = await t.anonymous.post("/api/auth/login").send({ email: "legacy-user-1@invalid", password });
      expect(res.status).not.toBe(200);
    }
  });
});

describe("refresh tokens", () => {
  const login = async () => (await t.anonymous.post("/api/auth/login").send({ email: t.email, password: t.password })).body.data;

  it("are stored only as a hash", async () => {
    const { refresh_token } = await login();
    const stored = t.db.prepare("SELECT token_hash FROM refresh_tokens").all() as { token_hash: string }[];
    expect(stored.map((r) => r.token_hash)).not.toContain(refresh_token);
  });

  it("buy a new pair, and the old refresh token stops working (rotation)", async () => {
    const first = await login();
    const renewed = await t.anonymous.post("/api/auth/refresh").send({ refresh_token: first.refresh_token });
    expect(renewed.status).toBe(200);
    expect(renewed.body.data.refresh_token).not.toBe(first.refresh_token);

    const me = await t.anonymous.get("/api/auth/me").set("Authorization", `Bearer ${renewed.body.data.access_token}`);
    expect(me.status).toBe(200);
  });

  it("replaying a used token is treated as theft: every session for that user ends", async () => {
    const phone = await login();
    const laptop = await login();
    const renewed = (await t.anonymous.post("/api/auth/refresh").send({ refresh_token: phone.refresh_token })).body.data;

    const replay = await t.anonymous.post("/api/auth/refresh").send({ refresh_token: phone.refresh_token });
    expect(replay.status).toBe(401);

    for (const token of [renewed.refresh_token, laptop.refresh_token]) {
      expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: token })).status).toBe(401);
    }
    // The thief's access token dies too, not just their ability to renew it.
    expect((await t.anonymous.get("/api/auth/me").set("Authorization", `Bearer ${renewed.access_token}`)).status).toBe(401);
  });

  it("a stale client retrying a logged-out token is NOT theft: other devices stay logged in", async () => {
    const phone = await login();
    const laptop = await login();
    await t.anonymous.post("/api/auth/logout").send({ refresh_token: phone.refresh_token });

    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: phone.refresh_token })).status).toBe(401);

    expect((await t.anonymous.get("/api/auth/me").set("Authorization", `Bearer ${laptop.access_token}`)).status).toBe(200);
    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: laptop.refresh_token })).status).toBe(200);
  });

  it("theft detection for one user does not log out anyone else", async () => {
    const other = await createUser(t.db, t.config, "bystander@example.com");
    const theirs = (await t.anonymous.post("/api/auth/login").send({ email: other.email, password: PASSWORD })).body.data;

    const mine = await login();
    await t.anonymous.post("/api/auth/refresh").send({ refresh_token: mine.refresh_token });
    await t.anonymous.post("/api/auth/refresh").send({ refresh_token: mine.refresh_token }); // replay

    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: theirs.refresh_token })).status).toBe(200);
  });

  it("expire", async () => {
    const { refresh_token } = await login();
    t.db.prepare("UPDATE refresh_tokens SET expires_at = 1").run();
    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token })).status).toBe(401);
  });

  it("an unknown token is refused", async () => {
    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: "made-up" })).status).toBe(401);
  });
});

describe("logging out", () => {
  const login = async () => (await t.anonymous.post("/api/auth/login").send({ email: t.email, password: t.password })).body.data;

  it("logout ends that device's session only, and is safe to repeat", async () => {
    const phone = await login();
    const laptop = await login();

    for (let i = 0; i < 2; i++) {
      const res = await t.anonymous.post("/api/auth/logout").send({ refresh_token: phone.refresh_token });
      expect(res.status).toBe(200);
    }

    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: phone.refresh_token })).status).toBe(401);
    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: laptop.refresh_token })).status).toBe(200);
  });

  it("logout-all ends every session immediately, access tokens included", async () => {
    const phone = await login();
    const laptop = await login();
    const asLaptop = () => t.anonymous.get("/api/auth/me").set("Authorization", `Bearer ${laptop.access_token}`);
    expect((await asLaptop()).status).toBe(200);

    const res = await t.anonymous.post("/api/auth/logout-all").set("Authorization", `Bearer ${phone.access_token}`);
    expect(res.body.data.sessions_ended).toBe(2);

    expect((await asLaptop()).status).toBe(401);
    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: laptop.refresh_token })).status).toBe(401);

    // ...and logging back in works.
    expect((await t.anonymous.get("/api/auth/me").set("Authorization", `Bearer ${(await login()).access_token}`)).status).toBe(200);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the account without any secret fields, plus whether onboarding is done", async () => {
    const res = await t.api.get("/api/auth/me");
    expect(res.body.data).toEqual({ id: t.userId, email: t.email, name: "Test User", created_at: expect.any(String), onboarded: false });
  });
});

describe("DELETE /api/auth/me", () => {
  it("needs the password again", async () => {
    const res = await t.api.delete("/api/auth/me").send({ password: "wrong password" });
    expect(res.status).toBe(403);
    expect(count("SELECT COUNT(*) AS n FROM users WHERE id = ?", t.userId)).toBe(1);
  });

  it("deletes the account and everything in it, and nothing of anyone else's", async () => {
    const other = await createUser(t.db, t.config, "keeper@example.com");
    await t.as(other.id).post("/api/food").send(food());
    await t.api.post("/api/food").send(food());
    await t.api.post("/api/summary/weight").send({ date: DAY, weight_lbs: 133 });
    await t.anonymous.post("/api/auth/login").send({ email: t.email, password: t.password });

    const res = await t.api.delete("/api/auth/me").send({ password: t.password });
    expect(res.status).toBe(200);

    for (const table of ["food_logs", "weight_logs", "refresh_tokens"]) {
      expect([table, count(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, t.userId)]).toEqual([table, 0]);
    }
    expect(count("SELECT COUNT(*) AS n FROM food_logs WHERE user_id = ?", other.id)).toBe(1);
  });

  it("the deleted account's access token stops working at once, and it cannot log in", async () => {
    await t.api.delete("/api/auth/me").send({ password: t.password });
    expect((await t.api.get(`/api/food/${DAY}`)).status).toBe(401);
    expect((await t.anonymous.post("/api/auth/login").send({ email: t.email, password: t.password })).status).toBe(401);
  });
});

describe("password reset", () => {
  it("emails a single-use link, and the new password works while the old one does not", async () => {
    const asked = await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    expect(asked.status).toBe(200);
    expect(t.outbox).toHaveLength(1);
    expect(t.outbox[0]).toMatchObject({ to: t.email, subject: "Reset your password" });
    expect(t.outbox[0].text).toContain("app://reset?token=");

    const reset = await t.anonymous.post("/api/auth/reset-password").send({ token: tokenFromLastEmail(), password: "a brand new password" });
    expect(reset.status).toBe(200);

    expect((await t.anonymous.post("/api/auth/login").send({ email: t.email, password: t.password })).status).toBe(401);
    expect((await t.anonymous.post("/api/auth/login").send({ email: t.email, password: "a brand new password" })).status).toBe(200);
  });

  it("answers identically for an unknown email, and sends nothing", async () => {
    const known = await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    const unknown = await t.anonymous.post("/api/auth/forgot-password").send({ email: "nobody@example.com" });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(t.outbox).toHaveLength(1);
  });

  it("answers identically when the mail provider is down", async () => {
    const app = createApp(t.db, { config: t.config, mailer: { send: async () => { throw new Error("provider down"); } } });
    const res = await request(app).post("/api/auth/forgot-password").send({ email: t.email });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/If that email has an account/);
  });

  it("stores only a hash of the reset token", async () => {
    await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    const { token_hash } = t.db.prepare("SELECT token_hash FROM password_reset_tokens").get() as any;
    expect(token_hash).not.toBe(tokenFromLastEmail());
  });

  it("a link works once", async () => {
    await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    const token = tokenFromLastEmail();
    await t.anonymous.post("/api/auth/reset-password").send({ token, password: "a brand new password" });

    const again = await t.anonymous.post("/api/auth/reset-password").send({ token, password: "yet another password" });
    expect(again.status).toBe(400);
    expect((await t.anonymous.post("/api/auth/login").send({ email: t.email, password: "yet another password" })).status).toBe(401);
  });

  it("asking again cancels the earlier link", async () => {
    await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    const first = tokenFromLastEmail();
    await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });

    expect((await t.anonymous.post("/api/auth/reset-password").send({ token: first, password: "a brand new password" })).status).toBe(400);
    expect((await t.anonymous.post("/api/auth/reset-password").send({ token: tokenFromLastEmail(), password: "a brand new password" })).status).toBe(200);
  });

  it("links expire", async () => {
    await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    t.db.prepare("UPDATE password_reset_tokens SET expires_at = 1").run();
    const res = await t.anonymous.post("/api/auth/reset-password").send({ token: tokenFromLastEmail(), password: "a brand new password" });
    expect(res.status).toBe(400);
  });

  it("a made-up token is refused, and the new password is still validated", async () => {
    expect((await t.anonymous.post("/api/auth/reset-password").send({ token: "nope", password: "a brand new password" })).status).toBe(400);
    await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    const weak = await t.anonymous.post("/api/auth/reset-password").send({ token: tokenFromLastEmail(), password: "short" });
    expect(weak.body.details).toEqual([{ path: "password", message: "must be at least 10 characters" }]);
  });

  it("logs out every device immediately: whoever had the old password is out", async () => {
    const session = (await t.anonymous.post("/api/auth/login").send({ email: t.email, password: t.password })).body.data;
    await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    await t.anonymous.post("/api/auth/reset-password").send({ token: tokenFromLastEmail(), password: "a brand new password" });

    expect((await t.anonymous.get("/api/auth/me").set("Authorization", `Bearer ${session.access_token}`)).status).toBe(401);
    expect((await t.anonymous.post("/api/auth/refresh").send({ refresh_token: session.refresh_token })).status).toBe(401);
  });

  it("one user's reset does not disturb another user's session", async () => {
    const other = await createUser(t.db, t.config, "bystander@example.com");
    await t.anonymous.post("/api/auth/forgot-password").send({ email: t.email });
    await t.anonymous.post("/api/auth/reset-password").send({ token: tokenFromLastEmail(), password: "a brand new password" });
    expect((await t.as(other.id).get("/api/auth/me")).status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("cuts off repeated login attempts from one address, with a clear message", async () => {
    const limited = await makeTestContext({ authRateLimit: { windowMinutes: 15, max: 3 } });
    const attempt = () => limited.anonymous.post("/api/auth/login").send({ email: limited.email, password: "guess guess guess" });

    expect([(await attempt()).status, (await attempt()).status, (await attempt()).status]).toEqual([401, 401, 401]);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, error: "Too many attempts. Please wait a few minutes and try again." });

    // Someone already logged in is not affected.
    expect((await limited.api.get("/api/auth/me")).status).toBe(200);
    limited.db.close();
  });
});
