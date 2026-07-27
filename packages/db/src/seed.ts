import { sql } from "drizzle-orm";
import { createDatabase } from "./index";
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

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const { client, db } = createDatabase(databaseUrl);
const stableUuid = (namespace: string, value: string) => {
  const hash = Bun.CryptoHasher.hash("sha256", `${namespace}:${value}`, "hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

await db.transaction(async (tx) => {
  const countryCodes = [...new Set(seedDestinations.map((item) => item.countryCode))];
  for (const code of countryCodes) {
    const id = stableUuid("country", code);
    const names: Record<string, [string, string]> = { TH: ["Thailand", "ประเทศไทย"], GR: ["Greece", "กรีซ"], JP: ["Japan", "ญี่ปุ่น"], CA: ["Canada", "แคนาดา"] };
    const [en, th] = names[code] ?? [code, code];
    await tx.insert(countries).values({ id, code, scope: code === "TH" ? "thailand" : "worldwide" }).onConflictDoNothing();
    await tx.insert(countryTranslations).values([{ countryId: id, locale: "en", name: en }, { countryId: id, locale: "th", name: th }]).onConflictDoNothing();
  }

  const provinceNames: Record<string, [string, string]> = {
    "CHIANG-MAI": ["Chiang Mai", "เชียงใหม่"], KRABI: ["Krabi", "กระบี่"], AYUTTHAYA: ["Phra Nakhon Si Ayutthaya", "พระนครศรีอยุธยา"], BANGKOK: ["Bangkok", "กรุงเทพมหานคร"], "SURAT-THANI": ["Surat Thani", "สุราษฎร์ธานี"],
  };
  for (const [code, names] of Object.entries(provinceNames)) {
    const id = stableUuid("province", code);
    await tx.insert(provinces).values({ id, countryId: stableUuid("country", "TH"), code }).onConflictDoNothing();
    await tx.insert(provinceTranslations).values([{ provinceId: id, locale: "en", name: names[0] }, { provinceId: id, locale: "th", name: names[1] }]).onConflictDoNothing();
  }

  const cityNames: Record<string, [string, string]> = {
    "CHOM-THONG": ["Chom Thong", "จอมทอง"], "AO-NANG": ["Ao Nang", "อ่าวนาง"], AYUTTHAYA: ["Ayutthaya", "อยุธยา"], BANGKOK: ["Bangkok", "กรุงเทพฯ"], PHANOM: ["Phanom", "พนม"], SANTORINI: ["Santorini", "ซานโตรินี"], KYOTO: ["Kyoto", "เกียวโต"], BANFF: ["Banff", "แบมฟ์"],
  };
  for (const item of seedDestinations) {
    if (!item.cityCode) continue;
    const cityId = stableUuid("city", `${item.countryCode}:${item.cityCode}`);
    const [en, th] = cityNames[item.cityCode] ?? [item.cityCode, item.cityCode];
    await tx.insert(cities).values({ id: cityId, countryId: stableUuid("country", item.countryCode), provinceId: item.provinceCode ? stableUuid("province", item.provinceCode) : null, code: item.cityCode }).onConflictDoNothing();
    await tx.insert(cityTranslations).values([{ cityId, locale: "en", name: en }, { cityId, locale: "th", name: th }]).onConflictDoNothing();
  }

  for (const category of seedCategories) {
    await tx.insert(categories).values({ id: category.id, slug: category.slug, icon: category.icon }).onConflictDoNothing();
    await tx.insert(categoryTranslations).values([{ categoryId: category.id, locale: "en", name: category.en }, { categoryId: category.id, locale: "th", name: category.th }]).onConflictDoNothing();
  }

  const travelerSlugs = [...new Set(seedDestinations.flatMap((item) => item.travelerTypes))];
  for (const slug of travelerSlugs) await tx.insert(travelerTypes).values({ id: stableUuid("traveler", slug), slug }).onConflictDoNothing();

  for (const item of seedDestinations) {
    await tx.insert(destinations).values({ id: item.id, slug: item.slug, scope: item.scope, countryId: stableUuid("country", item.countryCode), provinceId: item.provinceCode ? stableUuid("province", item.provinceCode) : null, cityId: item.cityCode ? stableUuid("city", `${item.countryCode}:${item.cityCode}`) : null, coordinates: sql`ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326)::geography`, address: item.address, metadata: { curated: "true" } }).onConflictDoNothing();
    await tx.insert(destinationTranslations).values([{ destinationId: item.id, locale: "en", ...item.en }, { destinationId: item.id, locale: "th", ...item.th }]).onConflictDoNothing();
    const mediaId = stableUuid("media", item.slug);
    await tx.insert(mediaAssets).values({ id: mediaId, objectKey: `seed/${item.slug}.jpg`, sourceUrl: item.imageUrl, contentType: "image/jpeg", byteSize: 1, sha256: Bun.CryptoHasher.hash("sha256", item.imageUrl, "hex"), width: item.imageWidth, height: item.imageHeight, scannedAt: new Date() }).onConflictDoNothing();
    await tx.insert(destinationImages).values({ id: stableUuid("image", item.slug), destinationId: item.id, mediaAssetId: mediaId, altEn: item.en.name, altTh: item.th.name, position: 0, isPrimary: true }).onConflictDoNothing();
    await tx.insert(destinationMetrics).values({ destinationId: item.id, rating: item.rating.toFixed(1), likesCount: item.likesCount, ratingCount: Math.max(10, Math.floor(item.likesCount / 4)), trendingScore: item.trending ? "1" : "0" }).onConflictDoUpdate({ target: destinationMetrics.destinationId, set: { rating: item.rating.toFixed(1), likesCount: item.likesCount, trendingScore: item.trending ? "1" : "0" } });
    for (const slug of item.categorySlugs) {
      const category = seedCategories.find((candidate) => candidate.slug === slug);
      if (category) await tx.insert(destinationCategories).values({ destinationId: item.id, categoryId: category.id }).onConflictDoNothing();
    }
    for (const slug of item.travelerTypes) await tx.insert(destinationTravelerTypes).values({ destinationId: item.id, travelerTypeId: stableUuid("traveler", slug) }).onConflictDoNothing();
    for (const month of item.bestMonths) await tx.insert(destinationSeasonality).values({ destinationId: item.id, month, score: "1" }).onConflictDoNothing();
    for (const mode of item.transportModes) await tx.insert(transportAvailability).values({ destinationId: item.id, mode, labelEn: mode === "airplane" ? "Flights available nearby" : `${mode[0]?.toUpperCase()}${mode.slice(1)} available`, labelTh: mode === "airplane" ? "มีเที่ยวบินไปยังสนามบินใกล้เคียง" : `เดินทางด้วย${mode}` }).onConflictDoNothing();
  }
});

await client.end();
console.info(`Seeded ${seedDestinations.length} destinations`);
