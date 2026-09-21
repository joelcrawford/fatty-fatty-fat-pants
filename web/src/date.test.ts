// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useToday } from "./date";

const inZone = (tz: string) => { vi.stubEnv("TZ", tz); };
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("useToday", () => {
  beforeEach(() => {
    inZone("America/Vancouver");
    vi.useFakeTimers();
  });

  it("rolls over at local midnight while the app stays open", () => {
    vi.setSystemTime(new Date(2026, 8, 20, 23, 58));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-09-20");

    act(() => { vi.advanceTimersByTime(3 * 60_000); }); // now 00:01
    expect(result.current).toBe("2026-09-21");
  });

  it("does not roll over at 5pm, when UTC does", () => {
    vi.setSystemTime(new Date(2026, 8, 20, 16, 58));
    const { result } = renderHook(() => useToday());
    act(() => { vi.advanceTimersByTime(10 * 60_000); });
    expect(result.current).toBe("2026-09-20");
  });

  it("catches up immediately when a backgrounded app is brought back the next morning", () => {
    vi.setSystemTime(new Date(2026, 8, 20, 21, 0));
    const { result } = renderHook(() => useToday());

    // Phone sleeps: timers do not fire. Clock jumps to the next morning.
    vi.setSystemTime(new Date(2026, 8, 21, 7, 30));
    expect(result.current).toBe("2026-09-20");

    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current).toBe("2026-09-21");
  });

  it("also catches up on window focus", () => {
    vi.setSystemTime(new Date(2026, 8, 20, 21, 0));
    const { result } = renderHook(() => useToday());
    vi.setSystemTime(new Date(2026, 8, 21, 7, 30));
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(result.current).toBe("2026-09-21");
  });

  it("removes its listeners and timer on unmount", () => {
    vi.setSystemTime(new Date(2026, 8, 20, 21, 0));
    const { unmount } = renderHook(() => useToday());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
