import { transportLabel } from "@tourism/contracts";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { importSource } from "./catalog-import/writer";
import { curatedRadiusKm } from "./catalog-import/pipeline";
import type { DatabaseConnection } from "./index";
import { seedCategories, seedDestinations } from "./seed-data";
import {
  categories,
  categoryTranslations,
  cities,
  cityTranslations,
  countries,
  countryTranslations,
  destinationCategories,
  destinationImages,
  destinationMetrics,
  destinationSeasonality,
  destinationTranslations,
  destinationTravelerTypes,
  destinations,
  mediaAssets,
  provinces,
  provinceTranslations,
  transportAvailability,
  travelerTypes,
} from "./schema";

type Database = DatabaseConnection["db"];

export interface SeedCatalogResult {
  /** Hand-written places this run added; places already in the database are left as they are. */
  added: string[];
  /** Imported Wikidata places hidden because a hand-written place now stands for them. */
  archivedDuplicates: number;
  /** Hand-written places whose slug another place already uses. */
  skipped: string[];
}

const stableUuid = (namespace: string, value: string) => {
  const hash = Bun.CryptoHasher.hash("sha256", `${namespace}:${value}`, "hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

const countryNames: Record<string, [string, string]> = {
  TH: ["Thailand", "ประเทศไทย"], GR: ["Greece", "กรีซ"], JP: ["Japan", "ญี่ปุ่น"], CA: ["Canada", "แคนาดา"], PE: ["Peru", "เปรู"], IT: ["Italy", "อิตาลี"],
  KH: ["Cambodia", "กัมพูชา"], VN: ["Vietnam", "เวียดนาม"], JO: ["Jordan", "จอร์แดน"], ES: ["Spain", "สเปน"], TR: ["Türkiye", "ตุรกี"], US: ["United States", "สหรัฐอเมริกา"],
  HR: ["Croatia", "โครเอเชีย"], MA: ["Morocco", "โมร็อกโก"],
};

const provinceNames: Record<string, [string, string]> = {
  "CHIANG-MAI": ["Chiang Mai", "เชียงใหม่"], KRABI: ["Krabi", "กระบี่"], AYUTTHAYA: ["Phra Nakhon Si Ayutthaya", "พระนครศรีอยุธยา"], BANGKOK: ["Bangkok", "กรุงเทพมหานคร"], "SURAT-THANI": ["Surat Thani", "สุราษฎร์ธานี"],
  SUKHOTHAI: ["Sukhothai", "สุโขทัย"], KANCHANABURI: ["Kanchanaburi", "กาญจนบุรี"], "CHIANG-RAI": ["Chiang Rai", "เชียงราย"], "NAKHON-RATCHASIMA": ["Nakhon Ratchasima", "นครราชสีมา"], "PHANG-NGA": ["Phang Nga", "พังงา"],
};

const cityNames: Record<string, [string, string]> = {
  "CHOM-THONG": ["Chom Thong", "จอมทอง"], "AO-NANG": ["Ao Nang", "อ่าวนาง"], AYUTTHAYA: ["Ayutthaya", "อยุธยา"], BANGKOK: ["Bangkok", "กรุงเทพฯ"], PHANOM: ["Phanom", "พนม"], SANTORINI: ["Santorini", "ซานโตรินี"], KYOTO: ["Kyoto", "เกียวโต"], BANFF: ["Banff", "แบมฟ์"],
  "KO-PHI-PHI": ["Ko Phi Phi", "เกาะพีพี"], SUKHOTHAI: ["Sukhothai", "สุโขทัย"], "SI-SAWAT": ["Si Sawat", "ศรีสวัสดิ์"], "CHIANG-RAI": ["Chiang Rai", "เชียงราย"], "PAK-CHONG": ["Pak Chong", "ปากช่อง"], "PHANG-NGA": ["Phang Nga", "พังงา"],
  "CHIANG-MAI": ["Chiang Mai", "เชียงใหม่"], "KHURA-BURI": ["Khura Buri", "คุระบุรี"], CUSCO: ["Cusco", "กุสโก"], ROME: ["Rome", "โรม"], "SIEM-REAP": ["Siem Reap", "เสียมราฐ"], "HA-LONG": ["Ha Long", "ฮาลอง"],
  "WADI-MUSA": ["Wadi Musa", "วาดีมูซา"], BARCELONA: ["Barcelona", "บาร์เซโลนา"], GOREME: ["Göreme", "เกอเรเม"], "GRAND-CANYON-VILLAGE": ["Grand Canyon Village", "แกรนด์แคนยอนวิลเลจ"], PLITVICE: ["Plitvice Lakes", "พลิตวิเซ"], MARRAKESH: ["Marrakesh", "มาร์ราเกช"],
};

/**
 * Adds the hand-written destinations in seed-data.ts that the database does not have yet. Safe to run on
 * every start: it never overwrites a place, its likes or its rating, and it reuses a photo the catalog
 * import already stored. When it adds a place, it hides the imported Wikidata copy of it, the same way the
 * next import run would.
 */
export async function seedCatalog(db: Database): Promise<SeedCatalogResult> {
  const result: SeedCatalogResult = { added: [], archivedDuplicates: 0, skipped: [] };
  await db.transaction(async (tx) => {
    // The catalog import may have created a country before this seed knew about it, under a random id,
    // so every id below is read back by its code instead of assumed.
    const countryCodes = [...new Set(["TH", ...seedDestinations.map((item) => item.countryCode)])];
    for (const code of countryCodes) await tx.insert(countries).values({ id: stableUuid("country", code), code, scope: code === "TH" ? "thailand" : "worldwide" }).onConflictDoNothing();
    const countryIds = new Map((await tx.select({ id: countries.id, code: countries.code }).from(countries).where(inArray(countries.code, countryCodes))).map((row) => [row.code, row.id]));
    const countryId = (code: string) => {
      const id = countryIds.get(code);
      if (!id) throw new Error(`Country ${code} could not be created`);
      return id;
    };
    for (const code of countryCodes) {
      const [en, th] = countryNames[code] ?? [code, code];
      await tx.insert(countryTranslations).values([{ countryId: countryId(code), locale: "en", name: en }, { countryId: countryId(code), locale: "th", name: th }]).onConflictDoNothing();
    }

    const thailandId = countryId("TH");
    for (const code of Object.keys(provinceNames)) await tx.insert(provinces).values({ id: stableUuid("province", code), countryId: thailandId, code }).onConflictDoNothing();
    const provinceIds = new Map((await tx.select({ id: provinces.id, code: provinces.code }).from(provinces).where(and(eq(provinces.countryId, thailandId), inArray(provinces.code, Object.keys(provinceNames))))).map((row) => [row.code, row.id]));
    const provinceId = (code: string | null) => {
      if (!code) return null;
      const id = provinceIds.get(code);
      if (!id) throw new Error(`Province ${code} is missing from provinceNames in seed-catalog.ts`);
      return id;
    };
    for (const [code, names] of Object.entries(provinceNames)) {
      await tx.insert(provinceTranslations).values([{ provinceId: provinceId(code) as string, locale: "en", name: names[0] }, { provinceId: provinceId(code) as string, locale: "th", name: names[1] }]).onConflictDoNothing();
    }

    const cityIds = new Map<string, string>();
    for (const item of seedDestinations) {
      if (!item.cityCode || cityIds.has(`${item.countryCode}:${item.cityCode}`)) continue;
      await tx.insert(cities).values({ id: stableUuid("city", `${item.countryCode}:${item.cityCode}`), countryId: countryId(item.countryCode), provinceId: provinceId(item.provinceCode), code: item.cityCode }).onConflictDoNothing();
      const [row] = await tx.select({ id: cities.id }).from(cities).where(and(eq(cities.countryId, countryId(item.countryCode)), eq(cities.code, item.cityCode)));
      if (!row) throw new Error(`City ${item.cityCode} could not be created`);
      cityIds.set(`${item.countryCode}:${item.cityCode}`, row.id);
      const [en, th] = cityNames[item.cityCode] ?? [item.cityCode, item.cityCode];
      await tx.insert(cityTranslations).values([{ cityId: row.id, locale: "en", name: en }, { cityId: row.id, locale: "th", name: th }]).onConflictDoNothing();
    }

    for (const category of seedCategories) {
      await tx.insert(categories).values({ id: category.id, slug: category.slug, icon: category.icon }).onConflictDoNothing();
      await tx.insert(categoryTranslations).values([{ categoryId: category.id, locale: "en", name: category.en }, { categoryId: category.id, locale: "th", name: category.th }]).onConflictDoNothing();
    }

    const travelerSlugs = [...new Set(seedDestinations.flatMap((item) => item.travelerTypes))];
    for (const slug of travelerSlugs) await tx.insert(travelerTypes).values({ id: stableUuid("traveler", slug), slug }).onConflictDoNothing();

    for (const item of seedDestinations) {
      const [slugOwner] = await tx.select({ id: destinations.id }).from(destinations).where(eq(destinations.slug, item.slug)).limit(1);
      if (slugOwner && slugOwner.id !== item.id) {
        result.skipped.push(item.slug);
        continue;
      }
      const point = sql`ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326)::geography`;
      const inserted = await tx.insert(destinations).values({ id: item.id, slug: item.slug, scope: item.scope, countryId: countryId(item.countryCode), provinceId: provinceId(item.provinceCode), cityId: item.cityCode ? cityIds.get(`${item.countryCode}:${item.cityCode}`) ?? null : null, coordinates: point, address: item.address, metadata: { curated: "true" } }).onConflictDoNothing().returning({ id: destinations.id });
      if (inserted.length === 0) continue;
      result.added.push(item.slug);

      await tx.insert(destinationTranslations).values([{ destinationId: item.id, locale: "en", ...item.en }, { destinationId: item.id, locale: "th", ...item.th }]).onConflictDoNothing();

      // sha256 is unique, and the catalog import may already hold this Commons photo under its own id.
      const sha256 = Bun.CryptoHasher.hash("sha256", item.imageUrl, "hex");
      const objectKey = `seed/${item.slug}.jpg`;
      await tx.insert(mediaAssets).values({ id: stableUuid("media", item.slug), objectKey, sourceUrl: item.imageUrl, contentType: /\.png$/i.test(item.imageUrl) ? "image/png" : "image/jpeg", byteSize: 1, sha256, width: item.imageWidth, height: item.imageHeight, scannedAt: new Date(), ...(item.imageCredit ? { author: item.imageCredit.author, license: item.imageCredit.license, licenseUrl: item.imageCredit.licenseUrl, attributionUrl: item.imageCredit.pageUrl } : {}) }).onConflictDoNothing();
      const [media] = (await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.sha256, sha256)).limit(1)).concat(await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.objectKey, objectKey)).limit(1));
      if (!media) throw new Error(`Photo for ${item.slug} could not be stored`);
      await tx.insert(destinationImages).values({ id: stableUuid("image", item.slug), destinationId: item.id, mediaAssetId: media.id, altEn: item.en.name, altTh: item.th.name, position: 0, isPrimary: true }).onConflictDoNothing();

      await tx.insert(destinationMetrics).values({ destinationId: item.id, rating: item.rating.toFixed(1), likesCount: item.likesCount, ratingCount: Math.max(10, Math.floor(item.likesCount / 4)), trendingScore: item.trending ? "1" : "0" }).onConflictDoNothing();
      for (const slug of item.categorySlugs) {
        const category = seedCategories.find((candidate) => candidate.slug === slug);
        if (category) await tx.insert(destinationCategories).values({ destinationId: item.id, categoryId: category.id }).onConflictDoNothing();
      }
      for (const slug of item.travelerTypes) await tx.insert(destinationTravelerTypes).values({ destinationId: item.id, travelerTypeId: stableUuid("traveler", slug) }).onConflictDoNothing();
      for (const month of item.bestMonths) await tx.insert(destinationSeasonality).values({ destinationId: item.id, month, score: "1" }).onConflictDoNothing();
      for (const mode of item.transportModes) await tx.insert(transportAvailability).values({ destinationId: item.id, mode, labelEn: transportLabel(mode, "en"), labelTh: transportLabel(mode, "th") }).onConflictDoNothing();

      // The import skips a curated place's own Wikidata items and anything within curatedRadiusKm of it,
      // and archives what it skips on its next full run. Do that now, so Explore does not list it twice.
      const near = sql`ST_DWithin(${destinations.coordinates}, ${point}, ${curatedRadiusKm * 1_000})`;
      const samePlace: SQL = item.wikidataIds.length > 0 ? (or(inArray(destinations.externalId, item.wikidataIds), near) as SQL) : near;
      const archived = await tx.update(destinations).set({ archivedAt: new Date() }).where(and(eq(destinations.source, importSource), isNull(destinations.archivedAt), samePlace)).returning({ id: destinations.id });
      result.archivedDuplicates += archived.length;
    }
  });
  return result;
}
