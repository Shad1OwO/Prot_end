import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const dayMs = 86_400_000;
/** setTimeout overflows past about 24.8 days, so longer waits are taken a day at a time and re-checked. */
const maxTimerMs = dayMs;

/** How long to wait before the next automatic import: none if the catalog was never imported or the interval has passed. */
export function catalogImportDelayMs(lastImportedAt: Date | null, now: Date, intervalDays: number): number {
  if (!lastImportedAt) return 0;
  return Math.max(0, lastImportedAt.getTime() + intervalDays * dayMs - now.getTime());
}

export interface CatalogImportScheduleOptions {
  intervalDays: number;
  /** When the import last wrote to the database, or null if it never has. */
  lastImportedAt: () => Promise<Date | null>;
  /** Runs one import and resolves with its exit code (0 means it finished and wrote its places). */
  runImport: () => Promise<number>;
  log: (event: Record<string, unknown>) => void;
  /** Wait after a failed run or an unreadable database. A full anonymous run makes ~300 Wikimedia requests, so not too often. */
  retryAfterFailureMs?: number;
  now?: () => Date;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

/**
 * Keeps the worldwide catalog filled: imports at once if it never ran, then again once the interval has passed.
 * The last run is read from the database, so restarts neither repeat a recent import nor forget a due one.
 */
export function scheduleCatalogImport(options: CatalogImportScheduleOptions): { stop(): void } {
  const now = options.now ?? (() => new Date());
  const setTimer = options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const retryAfterFailureMs = options.retryAfterFailureMs ?? 6 * 3_600_000;
  let timer: unknown = null;
  let stopped = false;

  const checkIn = (ms: number) => {
    if (stopped) return;
    timer = setTimer(() => { void check(); }, Math.min(ms, maxTimerMs));
  };

  async function check(): Promise<void> {
    timer = null;
    let delay: number;
    try {
      delay = catalogImportDelayMs(await options.lastImportedAt(), now(), options.intervalDays);
    } catch (error) {
      options.log({ level: "warn", message: "catalog_import_check_failed", error: error instanceof Error ? error.message : String(error) });
      checkIn(retryAfterFailureMs);
      return;
    }
    if (delay > 0) {
      checkIn(delay);
      return;
    }
    options.log({ level: "info", message: "catalog_import_started" });
    const startedAt = now().getTime();
    let exitCode: number;
    try {
      exitCode = await options.runImport();
    } catch (error) {
      options.log({ level: "error", message: "catalog_import_failed", error: error instanceof Error ? error.message : String(error) });
      checkIn(retryAfterFailureMs);
      return;
    }
    if (exitCode !== 0) {
      options.log({ level: "error", message: "catalog_import_failed", exitCode, retryInMinutes: Math.round(retryAfterFailureMs / 60_000) });
      checkIn(retryAfterFailureMs);
      return;
    }
    options.log({ level: "info", message: "catalog_import_finished", minutes: Math.round((now().getTime() - startedAt) / 60_000) });
    // Wait the whole interval rather than re-checking at once, so a run that wrote nothing can never loop.
    checkIn(options.intervalDays * dayMs);
  }

  checkIn(0);
  return {
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

/** Finds packages/db/src/catalog-import/run.ts above the working directory: /workspace in the image, apps/worker in development. */
export function findCatalogImportScript(start = process.cwd()): string | null {
  for (let directory = start; ; directory = dirname(directory)) {
    const candidate = join(directory, "packages", "db", "src", "catalog-import", "run.ts");
    if (existsSync(candidate)) return candidate;
    if (dirname(directory) === directory) return null;
  }
}

/** Runs the import script as its own process, so its exit and memory use never affect the worker; its log lines go to the worker's log. */
export function startCatalogImportProcess(script: string) {
  const repositoryRoot = dirname(dirname(dirname(dirname(dirname(script)))));
  return Bun.spawn([process.execPath, script], { cwd: repositoryRoot, env: process.env, stdout: "inherit", stderr: "inherit" });
}
