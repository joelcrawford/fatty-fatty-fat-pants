import { makeTestContext, TestContext, exercise, DAY } from "./helpers";

let t: TestContext;
beforeEach(async () => { t = await makeTestContext(); });
afterEach(() => { t.db.close(); });

describe("exercise log", () => {
  it("returns an empty array for a day with nothing logged", async () => {
    const res = await t.api.get(`/api/exercise/${DAY}`);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it("creates an entry and lists it back for that date only", async () => {
    const created = await t.api.post("/api/exercise").send(exercise());
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ ...exercise(), user_id: t.userId });

    await t.api.post("/api/exercise").send(exercise({ date: "2026-04-25", name: "Yoga" }));

    const listed = await t.api.get(`/api/exercise/${DAY}`);
    expect(listed.body.data.map((e: any) => e.name)).toEqual(["Lagree (Megaformer)"]);
  });

  it("defaults duration to an empty string and cal to 0", async () => {
    const res = await t.api.post("/api/exercise").send({ date: DAY, name: "Stretching" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ duration: "", cal: 0 });
  });

  it.each(["date", "name"])("rejects a body missing %s with 400", async (field) => {
    const body: Record<string, unknown> = exercise();
    delete body[field];
    const res = await t.api.post("/api/exercise").send(body);
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: any) => d.path)).toEqual([field]);
  });

  it("deletes an entry, and 404s on an unknown id", async () => {
    const { body } = await t.api.post("/api/exercise").send(exercise());

    const ok = await t.api.delete(`/api/exercise/${body.data.id}`);
    expect(ok.body).toEqual({ success: true, data: { deleted_id: body.data.id } });

    const gone = await t.api.delete(`/api/exercise/${body.data.id}`);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ success: false, error: "Entry not found" });
  });
});
