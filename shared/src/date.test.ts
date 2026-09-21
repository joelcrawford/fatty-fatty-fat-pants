import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daysAgo, localDateString } from "./date";

// Node re-reads the TZ environment variable whenever it is assigned, so each
// case can pick its zone. stubEnv keeps Node's `process` type out of a
// browser codebase and restores the original value afterwards.
const inZone = (tz: string) => { vi.stubEnv("TZ", tz); };
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("localDateString", () => {
  it("sanity: the test can actually switch timezones", () => {
    const instant = new Date("2026-09-21T00:15:00Z");
    inZone("America/Vancouver");
    expect(instant.getHours()).toBe(17);
    inZone("Pacific/Auckland");
    expect(instant.getHours()).toBe(12);
  });

  it("regression #12: 5:15pm in Vancouver is still today, though UTC says tomorrow", () => {
    inZone("America/Vancouver");
    const instant = new Date("2026-09-21T00:15:00Z"); // 17:15 PDT on the 20th
    expect(instant.toISOString().split("T")[0]).toBe("2026-09-21"); // the old, wrong answer
    expect(localDateString(instant)).toBe("2026-09-20");
  });

  it("11:30pm local is today and 12:30am local is the next day", () => {
    inZone("America/Vancouver");
    expect(localDateString(new Date(2026, 8, 20, 23, 30))).toBe("2026-09-20");
    expect(localDateString(new Date(2026, 8, 21, 0, 30))).toBe("2026-09-21");
  });

  it("is also right east of Greenwich, where UTC lags behind local time", () => {
    inZone("Pacific/Auckland");
    const instant = new Date("2026-09-20T13:00:00Z"); // 01:00 on the 21st in Auckland
    expect(instant.toISOString().split("T")[0]).toBe("2026-09-20");
    expect(localDateString(instant)).toBe("2026-09-21");
  });

  it("zero-pads single-digit months and days", () => {
    inZone("America/Vancouver");
    expect(localDateString(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});

describe("daysAgo", () => {
  beforeEach(() => inZone("America/Vancouver"));

  it("counts back 30 calendar days", () => {
    expect(daysAgo(30, new Date(2026, 8, 20, 17, 15))).toBe("2026-08-21");
  });

  it("crosses month and year boundaries", () => {
    expect(daysAgo(1, new Date(2026, 2, 1, 9))).toBe("2026-02-28");
    expect(daysAgo(30, new Date(2026, 0, 15, 9))).toBe("2025-12-16");
  });

  it("is not thrown off by the hour lost or gained at a daylight-saving change", () => {
    // DST starts 2026-03-08 and ends 2026-11-01 in Vancouver.
    expect(daysAgo(1, new Date(2026, 2, 9, 0, 30))).toBe("2026-03-08");
    expect(daysAgo(1, new Date(2026, 10, 2, 0, 30))).toBe("2026-11-01");
    expect(daysAgo(0, new Date(2026, 10, 1, 23, 30))).toBe("2026-11-01");
  });
});
