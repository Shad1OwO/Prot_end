import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../index";
import {
  categories,
  categoryTranslations,
  countries,
  countryTranslations,
  destinationCategories,
  destinationImages,
  destinationMetrics,
  destinationTranslations,
  destinations,
  mediaAssets,
} from "../schema";
import { seedCategories, seedDestinations } from "../seed-data";
import type { CachedThai, CuratedPoint } from "./pipeline";
import type { ImportPlace, ThaiSource } from "./types";

type Database = DatabaseConnection["db"];
export const importSource = "wikidata";
const writeBatchSize = 200;
const thaiSources: ThaiSource[] = ["wikipedia", "machine", "english"];

/** Thai text stored by earlier runs, keyed by Wikidata id, with the English fingerprint it was made from. */
export async function loadCachedThai(db: Database): Promise<Map<string, CachedThai>> {
  const rows = await db
    .select({ qid: destinations.externalId, metadata: destinations.metadata, name: destinationTranslations.name, shortDescription: destinationTranslations.shortDescription, description: destinationTranslations.description })
    .from(destinations)
    .innerJoin(destinationTranslations, and(eq(destinationTranslations.destinationId, destinations.id), eq(destinationTranslations.locale, "th")))
    .where(and(eq(destinations.source, importSource), isNotNull(destinations.externalId)));
  const cache = new Map<string, CachedThai>();
  for (const row of rows) {
    const thSource = row.metadata.thSource as ThaiSource;
    if (!row.qid || !row.metadata.enHash || !thaiSources.includes(thSource)) continue;
    cache.set(row.qid, { enHash: row.metadata.enHash, thSource, th: { name: row.name, shortDescription: row.shortDescription, description: row.description } });
  }
  return cache;
}

/** Where the hand-written destinations are, so the import can skip Wikidata duplicates of them. */
export async function loadCuratedPoints(db: Database): Promise<CuratedPoint[]> {
  const rows = await db
    .select({ slug: destinations.slug, latitude: sql<number>`ST_Y(${destinations.coordinates}::geometry)`, longitude: sql<number>`ST_X(${destinations.coordinates}::geometry)` })
    .from(destinations)
    .where(and(isNull(destinations.source), isNull(destinations.archivedAt)));
  const seedIds = new Map(seedDestinations.map((seed) => [seed.slug, seed.wikidataIds]));
  return rows.map((row) => ({ latitude: Number(row.latitude), longitude: Number(row.longitude), wikidataIds: seedIds.get(row.slug) ?? [] }));
}

async function ensureCategories(db: Database): Promise<Map<string, string>> {
  for (const category of seedCategories) {
    await db.insert(categories).values({ id: category.id, slug: category.slug, icon: category.icon }).onConflictDoNothing();
    await db.insert(categoryTranslations).values([{ categoryId: category.id, locale: "en", name: category.en }, { categoryId: category.id, locale: "th", name: category.th }]).onConflictDoNothing();
  }
  const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories).where(inArray(categories.slug, seedCategories.map((category) => category.slug)));
  return new Map(rows.map((row) => [row.slug, row.id]));
}

async function ensureCountries(db: Database, places: ImportPlace[]): Promise<Map<string, string>> {
  const byCode = new Map(places.map((place) => [place.raw.countryCode, place.raw]));
  for (const code of byCode.keys()) {
    await db.insert(countries).values({ code, scope: code === "TH" ? "thailand" : "worldwide" }).onConflictDoNothing();
  }
  const rows = byCode.size > 0 ? await db.select({ id: countries.id, code: countries.code }).from(countries).where(inArray(countries.code, [...byCode.keys()])) : [];
  const ids = new Map(rows.map((row) => [row.code, row.id]));
  for (const [code, place] of byCode) {
    const countryId = ids.get(code);
    if (!countryId) throw new Error(`Country ${code} could not be created`);
    // Existing names (from the seed or an earlier run) are kept; only missing ones are added.
    await db.insert(countryTranslations).values([{ countryId, locale: "en", name: place.countryNameEn }, { countryId, locale: "th", name: place.countryNameTh ?? place.countryNameEn }]).onConflictDoNothing();
  }
  return ids;
}

function metadataFor(place: ImportPlace): Record<string, string> {
  return {
    source: importSource,
    wikidataId: place.raw.qid,
    enHash: place.enHash,
    thSource: place.thSource,
    ...(place.wikipediaUrlEn ? { wikipediaUrlEn: place.wikipediaUrlEn } : {}),
    ...(place.wikipediaUrlTh ? { wikipediaUrlTh: place.wikipediaUrlTh } : {}),
  };
}

/** Upserts places by (source, Wikidata id). Curated rows have no source, so they can never match. */
export async function writePlaces(db: Database, places: ImportPlace[], log: (line: string) => void = () => {}): Promise<{ inserted: number; updated: number }> {
  const categoryIds = await ensureCategories(db);
  const countryIds = await ensureCountries(db, places);
  let inserted = 0;
  let updated = 0;
  for (let start = 0; start < places.length; start += writeBatchSize) {
    const batch = places.slice(start, start + writeBatchSize);
    await db.transaction(async (tx) => {
      for (const place of batch) {
        const countryId = countryIds.get(place.raw.countryCode) as string;
        const coordinates = sql`ST_SetSRID(ST_MakePoint(${place.raw.longitude}, ${place.raw.latitude}), 4326)::geography`;
        const values = { scope: place.raw.countryCode === "TH" ? "thailand" as const : "worldwide" as const, countryId, coordinates, address: place.raw.countryNameEn, metadata: metadataFor(place), notability: place.raw.sitelinks };
        const rows = await tx
          .insert(destinations)
          .values({ ...values, slug: place.slug, source: importSource, externalId: place.raw.qid })
          // The slug is set once and never changed, so links to a destination keep working after its name changes.
          .onConflictDoUpdate({ target: [destinations.source, destinations.externalId], set: { ...values, archivedAt: null, updatedAt: new Date() } })
          .returning({ id: destinations.id, inserted: sql<boolean>`(xmax = 0)` });
        const destinationId = rows[0]?.id;
        if (!destinationId) throw new Error(`Failed to write ${place.raw.qid}`);
        if (rows[0]?.inserted) inserted += 1;
        else updated += 1;

        for (const [locale, text] of [["en", place.en], ["th", place.th]] as const) {
          await tx.insert(destinationTranslations).values({ destinationId, locale, ...text }).onConflictDoUpdate({ target: [destinationTranslations.destinationId, destinationTranslations.locale], set: text });
        }

        await tx.delete(destinationCategories).where(eq(destinationCategories.destinationId, destinationId));
        const links = place.categorySlugs.flatMap((slug) => {
          const categoryId = categoryIds.get(slug);
          return categoryId ? [{ destinationId, categoryId }] : [];
        });
        if (links.length > 0) await tx.insert(destinationCategories).values(links).onConflictDoNothing();

        const sha256 = Bun.CryptoHasher.hash("sha256", place.photo.url, "hex");
        const credit = { sourceUrl: place.photo.url, width: place.photo.width, height: place.photo.height, author: place.photo.author, license: place.photo.license, licenseUrl: place.photo.licenseUrl, attributionUrl: place.photo.pageUrl };
        const assets = await tx
          .insert(mediaAssets)
          .values({ objectKey: `import/${sha256}`, contentType: "image/jpeg", byteSize: 1, sha256, ...credit })
          .onConflictDoUpdate({ target: mediaAssets.sha256, set: credit })
          .returning({ id: mediaAssets.id });
        const mediaAssetId = assets[0]?.id;
        if (!mediaAssetId) throw new Error(`Failed to store the photo for ${place.raw.qid}`);
        await tx.delete(destinationImages).where(eq(destinationImages.destinationId, destinationId));
        await tx.insert(destinationImages).values({ destinationId, mediaAssetId, altEn: place.en.name, altTh: place.th.name, position: 0, isPrimary: true });

        // Likes and ratings belong to users; only create the row the listing joins against.
        await tx.insert(destinationMetrics).values({ destinationId }).onConflictDoNothing();
      }
    });
    log(`database: wrote ${Math.min(start + writeBatchSize, places.length)}/${places.length}`);
  }
  return { inserted, updated };
}

/** Archives imported places that this (complete, unlimited) run no longer returned. */
export async function archiveMissing(db: Database, keepQids: string[]): Promise<number> {
  if (keepQids.length === 0) throw new Error("Refusing to archive every imported destination: the run returned no places");
  const rows = await db
    .update(destinations)
    .set({ archivedAt: new Date() })
    .where(and(eq(destinations.source, importSource), isNull(destinations.archivedAt), notInArray(destinations.externalId, keepQids)))
    .returning({ id: destinations.id });
  return rows.length;
}
