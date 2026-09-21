import { loadConfig } from "../config";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { ConsoleMailer, ResendMailer, createMailer } from "../auth/mailer";
import { newInviteCode, createInvite } from "../auth/invites";
import { openDatabase } from "../db";

const cheap = { N: 2 ** 4, r: 8, p: 1 };

describe("password hashing", () => {
  it("verifies the right password and refuses the wrong one", async () => {
    const hash = await hashPassword("correct horse battery", cheap);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterz", hash)).toBe(false);
  });

  it("salts: the same password never hashes the same way twice", async () => {
    expect(await hashPassword("same password", cheap)).not.toBe(await hashPassword("same password", cheap));
  });

  it("records its cost in the hash, so old hashes verify after the cost is raised", async () => {
    const old = await hashPassword("a password", cheap);
    expect(old.startsWith("scrypt$16$8$1$")).toBe(true);
    const stronger = await hashPassword("a password", { N: 2 ** 6, r: 8, p: 1 });
    expect(await verifyPassword("a password", old)).toBe(true);
    expect(await verifyPassword("a password", stronger)).toBe(true);
  });

  it("treats visually identical Unicode as the same password", async () => {
    const hash = await hashPassword("café password", cheap);      // é as one code point
    expect(await verifyPassword("café password", hash)).toBe(true); // e + combining accent
  });

  it.each(["!", "", "plaintext", "scrypt$16$8$1$onlyfive", "bcrypt$16$8$1$c2FsdA==$aGFzaA==", "scrypt$0$8$1$c2FsdA==$aGFzaA==", "scrypt$x$8$1$c2FsdA==$aGFzaA=="])(
    "never verifies against a stored value it did not produce: %j",
    async (stored) => {
      expect(await verifyPassword("anything", stored)).toBe(false);
      expect(await verifyPassword(stored, stored)).toBe(false);
    }
  );

  it("the production cost actually runs within Node's memory limit", async () => {
    const { scrypt } = loadConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(32) });
    const hash = await hashPassword("a password", scrypt);
    expect(await verifyPassword("a password", hash)).toBe(true);
  });
});

describe("config", () => {
  it("refuses to start in production without a real JWT secret", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: "production", JWT_SECRET: "too-short" })).toThrow(/JWT_SECRET/);
    expect(loadConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(32) }).jwtSecret).toBe("x".repeat(32));
  });

  it("in development, invents a secret rather than using a guessable default", () => {
    const a = loadConfig({}).jwtSecret;
    const b = loadConfig({}).jwtSecret;
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it("builds the reset link from FRONTEND_URL unless PASSWORD_RESET_URL overrides it", () => {
    expect(loadConfig({ FRONTEND_URL: "https://app.example.com" }).passwordResetUrlTemplate)
      .toBe("https://app.example.com/reset-password?token={token}");
    expect(loadConfig({ PASSWORD_RESET_URL: "myapp://reset?token={token}" }).passwordResetUrlTemplate)
      .toBe("myapp://reset?token={token}");
  });

  it("adds FRONTEND_URL to the CORS allow-list and reads TRUST_PROXY", () => {
    const c = loadConfig({ FRONTEND_URL: "https://app.example.com", TRUST_PROXY: "1" });
    expect(c.corsOrigins).toContain("https://app.example.com");
    expect(c.trustProxy).toBe(1);
    expect(loadConfig({}).trustProxy).toBe(0);
  });
});

describe("mailer", () => {
  const mail = { to: "a@example.com", subject: "Hi", text: "Body" };

  it("uses Resend when a key is configured and the console otherwise", () => {
    expect(createMailer({ resendApiKey: "re_123", from: "x" })).toBeInstanceOf(ResendMailer);
    expect(createMailer({ resendApiKey: null, from: "x" })).toBeInstanceOf(ConsoleMailer);
  });

  it("ResendMailer posts the message with the API key", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    await new ResendMailer("re_123", "App <no-reply@example.com>", fetchMock as unknown as typeof fetch).send(mail);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_123");
    expect(JSON.parse(init.body)).toEqual({ from: "App <no-reply@example.com>", to: ["a@example.com"], subject: "Hi", text: "Body" });
  });

  it("ResendMailer throws when Resend refuses, so the failure is logged rather than lost", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "domain not verified" });
    await expect(new ResendMailer("k", "f", fetchMock as unknown as typeof fetch).send(mail)).rejects.toThrow(/422.*domain not verified/);
  });

  it("ConsoleMailer prints the message so a developer can copy the reset link", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    await new ConsoleMailer().send(mail);
    expect(log.mock.calls[0][0]).toContain("a@example.com");
    expect(log.mock.calls[0][0]).toContain("Body");
    log.mockRestore();
  });
});

describe("invite codes", () => {
  it("look like XXXX-XXXX-XXXX with no easily confused characters", () => {
    for (let i = 0; i < 200; i++) expect(newInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });

  it("do not repeat", () => {
    expect(new Set(Array.from({ length: 1000 }, newInviteCode)).size).toBe(1000);
  });

  it("are stored with their note and optional expiry", () => {
    const db = openDatabase(":memory:");
    const forever = createInvite(db, { note: "for Sam" });
    const brief = createInvite(db, { expiresInDays: 14 });

    expect(db.prepare("SELECT note, expires_at, used_at FROM invite_codes WHERE code = ?").get(forever)).toEqual({ note: "for Sam", expires_at: null, used_at: null });
    const { expires_at } = db.prepare("SELECT expires_at FROM invite_codes WHERE code = ?").get(brief) as any;
    expect(expires_at - Math.floor(Date.now() / 1000)).toBeGreaterThan(13.9 * 86_400);
    db.close();
  });
});
