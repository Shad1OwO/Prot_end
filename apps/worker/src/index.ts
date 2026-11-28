import { getWorkerEnvironment } from "@tourism/config";
import { recommendationFailedMessage } from "@tourism/contracts";
import { PostgresRepository } from "@tourism/api/postgres-repository";
import { createDatabase } from "@tourism/db";
import { lastImportedAt } from "@tourism/db/catalog-import/writer";
import { Worker } from "bullmq";
import { findCatalogImportScript, scheduleCatalogImport, startCatalogImportProcess } from "./catalog-import";
import { AiProviderRouter } from "./providers/ai";
import { filterByDrivingDistance, GoogleMapsRoutingProvider } from "./providers/maps";

const env = getWorkerEnvironment();
if (!env.DATABASE_URL || !env.REDIS_URL) throw new Error("DATABASE_URL and REDIS_URL are required for the worker");
const repository = new PostgresRepository(env.DATABASE_URL, env.API_ORIGIN);
const ai = new AiProviderRouter(env);
const maps = new GoogleMapsRoutingProvider(env.GOOGLE_MAPS_API_KEY);
const redis = new URL(env.REDIS_URL);

const worker = new Worker("recommendations", async (queueJob) => {
  const jobId = String(queueJob.data.jobId);
  const stored = await repository.getJobRequest(jobId);
  if (!stored) return;
  try {
    await repository.updateJob(jobId, { status: "filtering", progress: 20, statusMessage: "Filtering curated destinations", error: null });
    let candidates = await repository.shortlist(stored.request, 20);
    await repository.updateJob(jobId, { status: "routing", progress: 50, statusMessage: "Checking route eligibility", error: null });
    const routed = await filterByDrivingDistance(maps, stored.request.filters.origin, candidates, stored.request.filters.maxDistanceKm);
    if (routed.error) console.warn(JSON.stringify({ level: "warn", message: "route_check_skipped", jobId, error: routed.error }));
    candidates = routed.candidates;
    await repository.updateJob(jobId, { status: "ranking", progress: 75, statusMessage: "Ranking catalog matches", error: null });
    const ranked = await ai.rank(stored.request, candidates.slice(0, 12));
    await repository.saveResult(jobId, ranked.response, ranked.provider, ranked.fallback);
    const preferences = await repository.getPreferences(stored.userId);
    if (preferences.aiHistoryOptIn) await repository.storeHistory(stored.userId, jobId, stored.request.prompt.replace(/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}\d)/gi, "[redacted]"), new Date(Date.now() + env.HISTORY_RETENTION_DAYS * 86_400_000));
    await repository.updateJob(jobId, { status: "completed", progress: 100, statusMessage: "Recommendations ready", error: null });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "recommendation_failed", jobId, error: error instanceof Error ? error.message : String(error) }));
    await repository.updateJob(jobId, { status: "failed", progress: 100, statusMessage: "Recommendation failed", error: recommendationFailedMessage });
    throw error;
  }
}, { connection: { host: redis.hostname, port: Number(redis.port || 6379), username: redis.username || undefined, password: redis.password || undefined, tls: redis.protocol === "rediss:" ? {} : undefined }, concurrency: 4 });

console.info(JSON.stringify({ level: "info", message: "worker_started", concurrency: 4 }));

// Fills the worldwide catalog from Wikidata without anyone running the import by hand.
const catalogDatabase = createDatabase(env.DATABASE_URL);
let catalogImportProcess: ReturnType<typeof startCatalogImportProcess> | null = null;
const catalogImportScript = findCatalogImportScript();
const logEvent = (event: Record<string, unknown>) => (event.level === "error" ? console.error : event.level === "warn" ? console.warn : console.info)(JSON.stringify(event));
const catalogSchedule = env.CATALOG_IMPORT_INTERVAL_DAYS > 0 && catalogImportScript
  ? scheduleCatalogImport({
    intervalDays: env.CATALOG_IMPORT_INTERVAL_DAYS,
    lastImportedAt: () => lastImportedAt(catalogDatabase.db),
    runImport: async () => {
      catalogImportProcess = startCatalogImportProcess(catalogImportScript);
      try {
        return await catalogImportProcess.exited;
      } finally {
        catalogImportProcess = null;
      }
    },
    log: logEvent,
  })
  : null;
if (!catalogSchedule) logEvent({ level: catalogImportScript ? "info" : "warn", message: "catalog_import_schedule_off", reason: catalogImportScript ? "CATALOG_IMPORT_INTERVAL_DAYS is 0" : "packages/db/src/catalog-import/run.ts was not found" });

async function shutdown() { catalogSchedule?.stop(); catalogImportProcess?.kill(); await worker.close(); await repository.close(); await catalogDatabase.client.end(); process.exit(0); }
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
