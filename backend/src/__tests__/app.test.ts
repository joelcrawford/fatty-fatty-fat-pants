import { makeTestContext, TestContext } from "./helpers";

let t: TestContext;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => { t.db.close(); });

describe("app", () => {
  it("GET /health reports ok with a timestamp", async () => {
    const res = await t.api.get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it("unknown routes return the standard error envelope with 404", async () => {
    const res = await t.api.get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: "Route not found" });
  });

  it("malformed JSON does not crash the server and returns an error envelope", async () => {
    const res = await t.api.post("/api/food").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  describe("CORS", () => {
    it("allows the Vite dev origin", async () => {
      const res = await t.api.get("/health").set("Origin", "http://localhost:5173");
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

    it("does not grant access to an unknown origin", async () => {
      const res = await t.api.get("/health").set("Origin", "https://evil.example");
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("allows requests with no Origin header (native apps, curl)", async () => {
      const res = await t.api.get("/health");
      expect(res.status).toBe(200);
    });
  });
});
