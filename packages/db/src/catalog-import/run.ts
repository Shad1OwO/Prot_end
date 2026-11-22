/**
 * Fills the catalog with notable places from Wikidata, Wikipedia and Wikimedia Commons.
 * Safe to run again: it updates what changed, adds new places and archives places that left the source.
 *
 *   bun run catalog:import [--min-sitelinks=10] [--limit=N] [--dry-run] [--no-translate]
 */
import { createDatabase } from "../index";
import { parseArgs } from "./args";
import { createPoliteFetch, wikimediaDelayMs } from "./http";
import { buildImportPlaces, type CachedThai } from "./pipeline";
import { createGeminiTranslator, nullTranslator } from "./translate";
import { archiveMissing, loadCachedThai, loadCuratedPoints, writePlaces } from "./writer";

const defaultUserAgent = "SawasdeeTravelCatalogImport/1.0 (catalog import script)";
const log = (line: string) => console.error(`[catalog-import] ${line}`);

const args = parseArgs(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && !args.dryRun) throw new Error("DATABASE_URL is required (or pass --dry-run)");
const configuredAgent = process.env.CATALOG_IMPORT_USER_AGENT?.trim();
const userAgent = configuredAgent || defaultUserAgent;
const wikimediaDelay = wikimediaDelayMs(configuredAgent);
const geminiKey = process.env.GEMINI_API_KEY?.trim();
const connection = databaseUrl ? createDatabase(databaseUrl) : null;

let exitCode = 0;
try {
  const cachedThai = connection ? await loadCachedThai(connection.db) : new Map<string, CachedThai>();
  const curatedPoints = connection ? await loadCuratedPoints(connection.db) : [];
  const translate = args.translate && !args.dryRun && Boolean(geminiKey);
  if (args.translate && !args.dryRun && !geminiKey) log("GEMINI_API_KEY is not set: places without Thai text get English (a later run with the key translates them)");
  // Gemini's free tier allows 10 requests a minute, so its calls are spaced 6.5 s apart. Few retries: the pipeline
  // stops translating after two failed batches, and whatever is left is translated on the next run.
  const translator = translate && geminiKey ? createGeminiTranslator(geminiKey, createPoliteFetch({ userAgent, delayMs: 6_500, maxRetries: 2 })) : nullTranslator;

  if (wikimediaDelay > 1_000) log("CATALOG_IMPORT_USER_AGENT has no contact details, so Wikimedia allows only 10 requests a minute: a full run takes about 50 minutes");
  const result = await buildImportPlaces({ fetchJson: createPoliteFetch({ userAgent, delayMs: wikimediaDelay, maxRetries: 5 }), translator, minSitelinks: args.minSitelinks, ...(args.limit !== undefined ? { limit: args.limit } : {}), cachedThai, curatedPoints, log });
  const thaiSources = Object.fromEntries(["wikipedia", "machine", "english"].map((source) => [source, result.places.filter((place) => place.thSource === source).length]));
  const summary: Record<string, unknown> = { complete: result.complete, fetched: result.fetched, toImport: result.places.length, dropped: result.dropped, thaiSources, dryRun: args.dryRun };

  if (!result.complete) {
    summary.error = result.error;
    exitCode = 1;
  } else if (!args.dryRun && connection) {
    Object.assign(summary, await writePlaces(connection.db, result.places, log));
    // A limited run only sees part of the source, so it must not archive the rest.
    summary.archived = args.limit === undefined ? await archiveMissing(connection.db, result.places.map((place) => place.raw.qid)) : 0;
  }
  console.info(JSON.stringify(summary));
} catch (error) {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error));
  exitCode = 1;
} finally {
  await connection?.client.end();
}
process.exit(exitCode);
