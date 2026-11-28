import { describe, expect, test } from "bun:test";
import { catalogImportDelayMs, scheduleCatalogImport } from "./catalog-import";

const day = 86_400_000;
const now = new Date("2026-11-28T12:00:00Z");

describe("catalogImportDelayMs", () => {
  test("runs at once when nothing was ever imported", () => {
    expect(catalogImportDelayMs(null, now, 30)).toBe(0);
  });
  test("waits out the rest of the interval after the last import", () => {
    expect(catalogImportDelayMs(new Date(now.getTime() - 10 * day), now, 30)).toBe(20 * day);
  });
  test("runs at once when the last import is older than the interval", () => {
    expect(catalogImportDelayMs(new Date(now.getTime() - 45 * day), now, 30)).toBe(0);
  });
});

/** Timers that only fire when the test says so, so the schedule can be stepped through without waiting. */
function manualTimers() {
  const pending: Array<{ run: () => void; ms: number }> = [];
  return {
    pending,
    setTimer: (run: () => void, ms: number) => { const timer = { run, ms }; pending.push(timer); return timer; },
    clearTimer: (timer: unknown) => { const index = pending.indexOf(timer as never); if (index >= 0) pending.splice(index, 1); },
    async fireNext() { const timer = pending.shift(); timer?.run(); await new Promise((resolve) => setTimeout(resolve, 0)); },
  };
}

describe("scheduleCatalogImport", () => {
  test("imports at start when the catalog was never filled, then waits a full interval", async () => {
    const timers = manualTimers();
    let lastImportedAt: Date | null = null;
    const runs: number[] = [];
    scheduleCatalogImport({ intervalDays: 30, now: () => now, lastImportedAt: async () => lastImportedAt, runImport: async () => { runs.push(1); lastImportedAt = now; return 0; }, log: () => {}, ...timers });
    await timers.fireNext();
    expect(runs).toHaveLength(1);
    // Timers are capped at a day so a 30-day wait never overflows setTimeout.
    expect(timers.pending.map((timer) => timer.ms)).toEqual([day]);
  });

  test("does not import while the last run is recent", async () => {
    const timers = manualTimers();
    const runs: number[] = [];
    scheduleCatalogImport({ intervalDays: 30, now: () => now, lastImportedAt: async () => new Date(now.getTime() - 29.5 * day), runImport: async () => { runs.push(1); return 0; }, log: () => {}, ...timers });
    await timers.fireNext();
    expect(runs).toHaveLength(0);
    expect(timers.pending.map((timer) => timer.ms)).toEqual([0.5 * day]);
  });

  test("retries a failed run later instead of straight away", async () => {
    const timers = manualTimers();
    const events: Array<Record<string, unknown>> = [];
    scheduleCatalogImport({ intervalDays: 30, now: () => now, lastImportedAt: async () => null, runImport: async () => 1, log: (event) => events.push(event), retryAfterFailureMs: 6 * 3_600_000, ...timers });
    await timers.fireNext();
    expect(events.some((event) => event.message === "catalog_import_failed")).toBe(true);
    expect(timers.pending.map((timer) => timer.ms)).toEqual([6 * 3_600_000]);
  });

  test("keeps the schedule alive when the database cannot be read", async () => {
    const timers = manualTimers();
    scheduleCatalogImport({ intervalDays: 30, now: () => now, lastImportedAt: async () => { throw new Error("connection refused"); }, runImport: async () => 0, log: () => {}, retryAfterFailureMs: 3_600_000, ...timers });
    await timers.fireNext();
    expect(timers.pending.map((timer) => timer.ms)).toEqual([3_600_000]);
  });

  test("stop cancels the next check", async () => {
    const timers = manualTimers();
    const schedule = scheduleCatalogImport({ intervalDays: 30, now: () => now, lastImportedAt: async () => now, runImport: async () => 0, log: () => {}, ...timers });
    await timers.fireNext();
    schedule.stop();
    expect(timers.pending).toHaveLength(0);
  });
});
