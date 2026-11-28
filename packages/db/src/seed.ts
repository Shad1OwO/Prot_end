import { transportLabel } from "@tourism/contracts";
import { and, eq, inArray, sql } from "drizzle-orm";
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
  // The catalog import may have created a country before this seed knew about it, under a random id,
  // so every id below is read back by its code instead of assumed.
  const countryNames: Record<string, [string, string]> = {
    TH: ["Thailand", "ประเทศไทย"], GR: ["Greece", "กรีซ"], JP: ["Japan", "ญี่ปุ่น"], CA: ["Canada", "แคนาดา"], PE: ["Peru", "เปรู"], IT: ["Italy", "อิตาลี"],
    KH: ["Cambodia", "กัมพูชา"], VN: ["Vietnam", "เวียดนาม"], JO: ["Jordan", "จอร์แดน"], ES: ["Spain", "สเปน"], TR: ["Türkiye", "ตุรกี"], US: ["United States", "สหรัฐอเมริกา"],
    HR: ["Croatia", "โครเอเชีย"], MA: ["Morocco", "โมร็อกโก"],
  };
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

  const provinceNames: Record<string, [string, string]> = {
    "CHIANG-MAI": ["Chiang Mai", "เชียงใหม่"], KRABI: ["Krabi", "กระบี่"], AYUTTHAYA: ["Phra Nakhon Si Ayutthaya", "พระนครศรีอยุธยา"], BANGKOK: ["Bangkok", "กรุงเทพมหานคร"], "SURAT-THANI": ["Surat Thani", "สุราษฎร์ธานี"],
    SUKHOTHAI: ["Sukhothai", "สุโขทัย"], KANCHANABURI: ["Kanchanaburi", "กาญจนบุรี"], "CHIANG-RAI": ["Chiang Rai", "เชียงราย"], "NAKHON-RATCHASIMA": ["Nakhon Ratchasima", "นครราชสีมา"], "PHANG-NGA": ["Phang Nga", "พังงา"],
  };
  const thailandId = countryId("TH");
  for (const [code, names] of Object.entries(provinceNames)) await tx.insert(provinces).values({ id: stableUuid("province", code), countryId: thailandId, code }).onConflictDoNothing();
  const provinceIds = new Map((await tx.select({ id: provinces.id, code: provinces.code }).from(provinces).where(and(eq(provinces.countryId, thailandId), inArray(provinces.code, Object.keys(provinceNames))))).map((row) => [row.code, row.id]));
  const provinceId = (code: string | null) => {
    if (!code) return null;
    const id = provinceIds.get(code);
    if (!id) throw new Error(`Province ${code} is missing from provinceNames in seed.ts`);
    return id;
  };
  for (const [code, names] of Object.entries(provinceNames)) {
    await tx.insert(provinceTranslations).values([{ provinceId: provinceId(code) as string, locale: "en", name: names[0] }, { provinceId: provinceId(code) as string, locale: "th", name: names[1] }]).onConflictDoNothing();
  }

  const cityNames: Record<string, [string, string]> = {
    "CHOM-THONG": ["Chom Thong", "จอมทอง"], "AO-NANG": ["Ao Nang", "อ่าวนาง"], AYUTTHAYA: ["Ayutthaya", "อยุธยา"], BANGKOK: ["Bangkok", "กรุงเทพฯ"], PHANOM: ["Phanom", "พนม"], SANTORINI: ["Santorini", "ซานโตรินี"], KYOTO: ["Kyoto", "เกียวโต"], BANFF: ["Banff", "แบมฟ์"],
    "KO-PHI-PHI": ["Ko Phi Phi", "เกาะพีพี"], SUKHOTHAI: ["Sukhothai", "สุโขทัย"], "SI-SAWAT": ["Si Sawat", "ศรีสวัสดิ์"], "CHIANG-RAI": ["Chiang Rai", "เชียงราย"], "PAK-CHONG": ["Pak Chong", "ปากช่อง"], "PHANG-NGA": ["Phang Nga", "พังงา"],
    "CHIANG-MAI": ["Chiang Mai", "เชียงใหม่"], "KHURA-BURI": ["Khura Buri", "คุระบุรี"], CUSCO: ["Cusco", "กุสโก"], ROME: ["Rome", "โรม"], "SIEM-REAP": ["Siem Reap", "เสียมราฐ"], "HA-LONG": ["Ha Long", "ฮาลอง"],
    "WADI-MUSA": ["Wadi Musa", "วาดีมูซา"], BARCELONA: ["Barcelona", "บาร์เซโลนา"], GOREME: ["Göreme", "เกอเรเม"], "GRAND-CANYON-VILLAGE": ["Grand Canyon Village", "แกรนด์แคนยอนวิลเลจ"], PLITVICE: ["Plitvice Lakes", "พลิตวิเซ"], MARRAKESH: ["Marrakesh", "มาร์ราเกช"],
  };
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
    await tx.insert(destinations).values({ id: item.id, slug: item.slug, scope: item.scope, countryId: countryId(item.countryCode), provinceId: provinceId(item.provinceCode), cityId: item.cityCode ? cityIds.get(`${item.countryCode}:${item.cityCode}`) ?? null : null, coordinates: sql`ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326)::geography`, address: item.address, metadata: { curated: "true" } }).onConflictDoNothing();
    await tx.insert(destinationTranslations).values([{ destinationId: item.id, locale: "en", ...item.en }, { destinationId: item.id, locale: "th", ...item.th }]).onConflictDoNothing();
    const mediaId = stableUuid("media", item.slug);
    await tx.insert(mediaAssets).values({ id: mediaId, objectKey: `seed/${item.slug}.jpg`, sourceUrl: item.imageUrl, contentType: /\.png$/i.test(item.imageUrl) ? "image/png" : "image/jpeg", byteSize: 1, sha256: Bun.CryptoHasher.hash("sha256", item.imageUrl, "hex"), width: item.imageWidth, height: item.imageHeight, scannedAt: new Date(), ...(item.imageCredit ? { author: item.imageCredit.author, license: item.imageCredit.license, licenseUrl: item.imageCredit.licenseUrl, attributionUrl: item.imageCredit.pageUrl } : {}) }).onConflictDoNothing();
    await tx.insert(destinationImages).values({ id: stableUuid("image", item.slug), destinationId: item.id, mediaAssetId: mediaId, altEn: item.en.name, altTh: item.th.name, position: 0, isPrimary: true }).onConflictDoNothing();
    await tx.insert(destinationMetrics).values({ destinationId: item.id, rating: item.rating.toFixed(1), likesCount: item.likesCount, ratingCount: Math.max(10, Math.floor(item.likesCount / 4)), trendingScore: item.trending ? "1" : "0" }).onConflictDoUpdate({ target: destinationMetrics.destinationId, set: { rating: item.rating.toFixed(1), likesCount: item.likesCount, trendingScore: item.trending ? "1" : "0" } });
    for (const slug of item.categorySlugs) {
      const category = seedCategories.find((candidate) => candidate.slug === slug);
      if (category) await tx.insert(destinationCategories).values({ destinationId: item.id, categoryId: category.id }).onConflictDoNothing();
    }
    for (const slug of item.travelerTypes) await tx.insert(destinationTravelerTypes).values({ destinationId: item.id, travelerTypeId: stableUuid("traveler", slug) }).onConflictDoNothing();
    for (const month of item.bestMonths) await tx.insert(destinationSeasonality).values({ destinationId: item.id, month, score: "1" }).onConflictDoNothing();
    for (const mode of item.transportModes) await tx.insert(transportAvailability).values({ destinationId: item.id, mode, labelEn: transportLabel(mode, "en"), labelTh: transportLabel(mode, "th") }).onConflictDoNothing();
  }
});

await client.end();
console.info(`Seeded ${seedDestinations.length} destinations`);
