import type {
  AiProviderResponse,
  CatalogImport,
  Category,
  DestinationCard,
  DestinationDetail,
  DestinationListResponse,
  DestinationQuery,
  HomeSections,
  Locale,
  RecommendationJob,
  RecommendationRequest,
  RecommendationResult,
  Trip,
  TripCreate,
  TripUpdate,
  User,
  UserPreferences,
} from "@tourism/contracts";
import {
  aiSearchHistory,
  auditLogs,
  categories,
  categoryTranslations,
  cities,
  countries,
  countryTranslations,
  createDatabase,
  destinationCategories,
  destinationImages,
  destinationMetrics,
  destinationSeasonality,
  destinationTranslations,
  destinationTravelerTypes,
  destinations,
  favorites,
  featuredSlots,
  likes,
  mediaAssets,
  oauthAccounts,
  provinces,
  recommendationJobs,
  recommendationResults,
  refreshTokens,
  sessions,
  transportAvailability,
  travelerTypes,
  tripDestinations,
  trips,
  userPreferences,
  users,
  type DatabaseConnection,
} from "@tourism/db";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type {
  AppRepository,
  OAuthIdentity,
  SessionRecord,
  StoredRefreshToken,
} from "../domain/repositories";

interface BaseDestinationRow {
  id: string;
  slug: string;
  scope: "thailand" | "worldwide";
  name: string;
  shortDescription: string;
  description: string;
  country: string;
  province: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  address: string;
  openingHours: string | null;
  websiteUrl: string | null;
  metadata: Record<string, string>;
  rating: string | null;
  likesCount: number | null;
  trendingScore: string | null;
  featured: boolean;
  seasonal: boolean;
}

interface HydrationContext {
  categoryRows: Array<{ destinationId: string; id: string; slug: string; name: string; icon: string }>;
  categoryCounts: Record<string, number>;
  imageRows: Array<{ id: string; destinationId: string; sourceUrl: string | null; objectKey: string; alt: string; width: number | null; height: number | null; blurDataUrl: string | null; isPrimary: boolean }>;
  travelerRows: Array<{ destinationId: string; slug: string }>;
  favoriteIds: Set<string>;
  likedIds: Set<string>;
}

const defaultPreferences: UserPreferences = {
  locale: "en",
  defaultScope: "thailand",
  travelerTypes: [],
  preferredCategories: [],
  aiHistoryOptIn: false,
  darkMode: "system",
};

function encodeCursor(offset: number): string {
  return btoa(String(offset));
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const value = Number(atob(cursor));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function approximateTravelMinutes(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  const kilometers = 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round((kilometers / 65) * 60));
}

export class PostgresRepository implements AppRepository {
  readonly #connection: DatabaseConnection;

  constructor(databaseUrl: string, readonly mediaBaseUrl: string) {
    this.#connection = createDatabase(databaseUrl);
  }

  async close(): Promise<void> {
    await this.#connection.client.end();
  }

  async healthCheck(): Promise<void> {
    await this.#connection.db.execute(sql`select 1`);
  }

  async list(query: DestinationQuery, userId?: string): Promise<DestinationListResponse> {
    const db = this.#connection.db;
    const conditions: SQL[] = [
      eq(destinations.scope, query.scope),
      isNull(destinations.archivedAt),
      eq(destinationTranslations.locale, query.locale),
    ];
    if (query.query) conditions.push(or(ilike(destinationTranslations.name, `%${query.query}%`), ilike(destinationTranslations.description, `%${query.query}%`)) as SQL);
    if (query.category) conditions.push(inArray(destinations.id, db.select({ id: destinationCategories.destinationId }).from(destinationCategories).innerJoin(categories, eq(categories.id, destinationCategories.categoryId)).where(eq(categories.slug, query.category))));
    if (query.travelerType) conditions.push(inArray(destinations.id, db.select({ id: destinationTravelerTypes.destinationId }).from(destinationTravelerTypes).innerJoin(travelerTypes, eq(travelerTypes.id, destinationTravelerTypes.travelerTypeId)).where(eq(travelerTypes.slug, query.travelerType))));
    if (query.country) conditions.push(eq(countries.code, query.country.toUpperCase()));
    if (query.province) conditions.push(eq(provinces.code, query.province.toUpperCase()));
    if (query.city) conditions.push(eq(cities.code, query.city.toUpperCase()));
    if (query.startDate) {
      const month = new Date(`${query.startDate}T00:00:00Z`).getUTCMonth() + 1;
      conditions.push(inArray(destinations.id, db.select({ id: destinationSeasonality.destinationId }).from(destinationSeasonality).where(eq(destinationSeasonality.month, month))));
    }
    const hasOrigin = query.originLat !== undefined && query.originLng !== undefined;
    if (hasOrigin && query.maxDistanceKm) {
      conditions.push(sql`ST_DWithin(${destinations.coordinates}, ST_SetSRID(ST_MakePoint(${query.originLng}, ${query.originLat}), 4326)::geography, ${query.maxDistanceKm * 1_000})`);
    }

    const distance = hasOrigin
      ? sql<number>`ST_Distance(${destinations.coordinates}, ST_SetSRID(ST_MakePoint(${query.originLng}, ${query.originLat}), 4326)::geography)`
      : sql<number>`0`;
    const order = query.sort === "rating"
      ? [desc(destinationMetrics.rating), desc(destinations.id)]
      : query.sort === "popular"
        ? [desc(destinationMetrics.likesCount), desc(destinations.id)]
        : query.sort === "distance" && hasOrigin
          ? [asc(distance), asc(destinations.id)]
          : [desc(sql`exists(select 1 from ${featuredSlots} where ${featuredSlots.destinationId} = ${destinations.id} and now() between ${featuredSlots.startsAt} and ${featuredSlots.endsAt})`), desc(destinationMetrics.likesCount), desc(destinations.id)];
    const offset = decodeCursor(query.cursor);
    const idRows = await db
      .select({ id: destinations.id })
      .from(destinations)
      .innerJoin(destinationTranslations, eq(destinationTranslations.destinationId, destinations.id))
      .innerJoin(countries, eq(countries.id, destinations.countryId))
      .leftJoin(provinces, eq(provinces.id, destinations.provinceId))
      .leftJoin(cities, eq(cities.id, destinations.cityId))
      .leftJoin(destinationMetrics, eq(destinationMetrics.destinationId, destinations.id))
      .where(and(...conditions))
      .orderBy(...order)
      .limit(query.limit + 1)
      .offset(offset);
    const hasMore = idRows.length > query.limit;
    const ids = idRows.slice(0, query.limit).map((row) => row.id);
    let items = await this.getByIds(ids, query.locale, userId);
    const orderById = new Map(ids.map((id, index) => [id, index]));
    items.sort((left, right) => (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0));
    if (hasOrigin) {
      const origin = { latitude: query.originLat as number, longitude: query.originLng as number };
      items = items.map((item) => ({ ...item, travelTimeMinutes: approximateTravelMinutes(origin, item.coordinates) }));
    }
    return { items, page: { hasMore, nextCursor: hasMore ? encodeCursor(offset + query.limit) : null } };
  }

  async getBySlug(slug: string, locale: Locale, userId?: string): Promise<DestinationDetail | null> {
    const row = await this.#connection.db.select({ id: destinations.id }).from(destinations).where(and(eq(destinations.slug, slug), isNull(destinations.archivedAt))).limit(1);
    const id = row[0]?.id;
    if (!id) return null;
    const card = (await this.getByIds([id], locale, userId))[0];
    if (!card) return null;
    const [detailRows, transportRows, seasonRows] = await Promise.all([
      this.#connection.db.select({ description: destinationTranslations.description, address: destinations.address, openingHours: destinations.openingHours, websiteUrl: destinations.websiteUrl, metadata: destinations.metadata }).from(destinations).innerJoin(destinationTranslations, and(eq(destinationTranslations.destinationId, destinations.id), eq(destinationTranslations.locale, locale))).where(eq(destinations.id, id)).limit(1),
      this.#connection.db.select({ mode: transportAvailability.mode, available: transportAvailability.available, labelEn: transportAvailability.labelEn, labelTh: transportAvailability.labelTh }).from(transportAvailability).where(eq(transportAvailability.destinationId, id)),
      this.#connection.db.select({ month: destinationSeasonality.month }).from(destinationSeasonality).where(eq(destinationSeasonality.destinationId, id)).orderBy(asc(destinationSeasonality.month)),
    ]);
    const detail = detailRows[0];
    if (!detail) return null;
    const images = await this.#loadImages([id], locale);
    return {
      ...card,
      description: detail.description,
      address: detail.address,
      images: images.map((image) => ({ id: image.id, url: image.sourceUrl ?? `${this.mediaBaseUrl}/api/v1/media/${encodeURIComponent(image.objectKey)}`, alt: image.alt, width: image.width ?? 1, height: image.height ?? 1, ...(image.blurDataUrl ? { blurDataUrl: image.blurDataUrl } : {}), isPrimary: image.isPrimary })),
      transports: transportRows.map((row) => ({ mode: row.mode, available: row.available, durationMinutes: null, distanceKm: null, label: locale === "th" ? row.labelTh : row.labelEn })),
      bestMonths: seasonRows.map((season) => season.month),
      openingHours: detail.openingHours,
      websiteUrl: detail.websiteUrl,
      metadata: detail.metadata,
    };
  }

  async getByIds(ids: string[], locale: Locale, userId?: string): Promise<DestinationCard[]> {
    if (ids.length === 0) return [];
    const db = this.#connection.db;
    const rows = await db
      .select({
        id: destinations.id,
        slug: destinations.slug,
        scope: destinations.scope,
        name: destinationTranslations.name,
        shortDescription: destinationTranslations.shortDescription,
        description: destinationTranslations.description,
        country: countryTranslations.name,
        province: provinces.code,
        city: cities.code,
        latitude: sql<number>`ST_Y(${destinations.coordinates}::geometry)`,
        longitude: sql<number>`ST_X(${destinations.coordinates}::geometry)`,
        address: destinations.address,
        openingHours: destinations.openingHours,
        websiteUrl: destinations.websiteUrl,
        metadata: destinations.metadata,
        rating: destinationMetrics.rating,
        likesCount: destinationMetrics.likesCount,
        trendingScore: destinationMetrics.trendingScore,
        featured: sql<boolean>`exists(select 1 from ${featuredSlots} where ${featuredSlots.destinationId} = ${destinations.id} and now() between ${featuredSlots.startsAt} and ${featuredSlots.endsAt})`,
        seasonal: sql<boolean>`exists(select 1 from ${destinationSeasonality} where ${destinationSeasonality.destinationId} = ${destinations.id})`,
      })
      .from(destinations)
      .innerJoin(destinationTranslations, and(eq(destinationTranslations.destinationId, destinations.id), eq(destinationTranslations.locale, locale)))
      .innerJoin(countries, eq(countries.id, destinations.countryId))
      .innerJoin(countryTranslations, and(eq(countryTranslations.countryId, countries.id), eq(countryTranslations.locale, locale)))
      .leftJoin(provinces, eq(provinces.id, destinations.provinceId))
      .leftJoin(cities, eq(cities.id, destinations.cityId))
      .leftJoin(destinationMetrics, eq(destinationMetrics.destinationId, destinations.id))
      .where(and(inArray(destinations.id, ids), isNull(destinations.archivedAt)));
    const context = await this.#loadHydration(ids, locale, userId);
    const cards = rows.map((row) => this.#toCard(row as BaseDestinationRow, context));
    const byId = new Map(cards.map((card) => [card.id, card]));
    return ids.flatMap((id) => {
      const card = byId.get(id);
      return card ? [card] : [];
    });
  }

  async categories(locale: Locale): Promise<Category[]> {
    const rows = await this.#connection.db
      .select({ id: categories.id, slug: categories.slug, name: categoryTranslations.name, icon: categories.icon, destinationCount: count(destinationCategories.destinationId) })
      .from(categories)
      .innerJoin(categoryTranslations, and(eq(categoryTranslations.categoryId, categories.id), eq(categoryTranslations.locale, locale)))
      .leftJoin(destinationCategories, eq(destinationCategories.categoryId, categories.id))
      .groupBy(categories.id, categories.slug, categoryTranslations.name, categories.icon)
      .orderBy(desc(count(destinationCategories.destinationId)), asc(categoryTranslations.name));
    return rows.map((row) => ({ ...row, destinationCount: Number(row.destinationCount) }));
  }

  async home(locale: Locale, scope: "thailand" | "worldwide", userId?: string): Promise<HomeSections> {
    const page = await this.list({ locale, scope, sort: "popular", limit: 50 }, userId);
    const preferences = userId ? await this.getPreferences(userId) : null;
    return {
      featured: page.items.filter((item) => item.featured).slice(0, 8),
      trending: page.items.filter((item) => item.trending).slice(0, 8),
      popular: [...page.items].sort((left, right) => right.likesCount - left.likesCount).slice(0, 8),
      seasonal: page.items.filter((item) => item.seasonal).slice(0, 8),
      personalized: preferences ? page.items.filter((item) => item.categories.some((category) => preferences.preferredCategories.includes(category.slug))).slice(0, 8) : [],
    };
  }

  async shortlist(request: RecommendationRequest, limit: number): Promise<DestinationCard[]> {
    const base: DestinationQuery = {
      locale: request.locale,
      scope: request.scope,
      category: request.filters.categorySlugs[0],
      travelerType: request.filters.travelerTypes[0],
      startDate: request.filters.startDate,
      country: request.filters.country,
      province: request.filters.province,
      originLat: request.filters.origin?.latitude,
      originLng: request.filters.origin?.longitude,
      maxDistanceKm: request.filters.maxDistanceKm,
      sort: request.filters.origin ? "distance" : "featured",
      limit,
    };
    const filtered = await this.list(base);
    return filtered.items.length > 0 ? filtered.items : (await this.list({ locale: request.locale, scope: request.scope, sort: "featured", limit })).items;
  }

  async importCatalog(input: CatalogImport): Promise<{ imported: number }> {
    const db = this.#connection.db;
    await db.transaction(async (tx) => {
      for (const item of input.destinations) {
        const countryCode = item.scope === "thailand" ? "TH" : "ZZ";
        let country = (await tx.select({ id: countries.id }).from(countries).where(eq(countries.code, countryCode)).limit(1))[0];
        if (!country) {
          const inserted = await tx.insert(countries).values({ code: countryCode, scope: item.scope }).returning({ id: countries.id });
          country = inserted[0];
          if (!country) throw new Error("Failed to create catalog country");
          await tx.insert(countryTranslations).values([
            { countryId: country.id, locale: "en", name: countryCode === "TH" ? "Thailand" : "Worldwide" },
            { countryId: country.id, locale: "th", name: countryCode === "TH" ? "ประเทศไทย" : "ทั่วโลก" },
          ]);
        }
        const inserted = await tx.insert(destinations).values({ slug: item.slug, scope: item.scope, countryId: country.id, coordinates: sql`ST_SetSRID(ST_MakePoint(${item.coordinates.longitude}, ${item.coordinates.latitude}), 4326)::geography`, address: item.translations.en.name, metadata: { imported: "true" } }).onConflictDoUpdate({ target: destinations.slug, set: { scope: item.scope, countryId: country.id, coordinates: sql`ST_SetSRID(ST_MakePoint(${item.coordinates.longitude}, ${item.coordinates.latitude}), 4326)::geography`, archivedAt: null } }).returning({ id: destinations.id });
        const destinationId = inserted[0]?.id;
        if (!destinationId) throw new Error("Failed to import destination");
        for (const locale of ["en", "th"] as const) {
          const translation = item.translations[locale];
          await tx.insert(destinationTranslations).values({ destinationId, locale, ...translation }).onConflictDoUpdate({ target: [destinationTranslations.destinationId, destinationTranslations.locale], set: translation });
        }
        await tx.delete(destinationCategories).where(eq(destinationCategories.destinationId, destinationId));
        for (const slug of item.categorySlugs) {
          const category = (await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1))[0];
          if (category) await tx.insert(destinationCategories).values({ destinationId, categoryId: category.id }).onConflictDoNothing();
        }
        await tx.delete(destinationImages).where(eq(destinationImages.destinationId, destinationId));
        for (const [position, sourceUrl] of item.imageUrls.entries()) {
          const sha256 = Bun.CryptoHasher.hash("sha256", sourceUrl, "hex");
          const assetRows = await tx.insert(mediaAssets).values({ objectKey: `import/${destinationId}/${position}`, sourceUrl, contentType: "image/jpeg", byteSize: 1, sha256 }).onConflictDoUpdate({ target: mediaAssets.sha256, set: { sourceUrl } }).returning({ id: mediaAssets.id });
          const mediaAssetId = assetRows[0]?.id ?? (await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.sha256, sha256)).limit(1))[0]?.id;
          if (mediaAssetId) await tx.insert(destinationImages).values({ destinationId, mediaAssetId, altEn: item.translations.en.name, altTh: item.translations.th.name, position, isPrimary: position === 0 });
        }
      }
    });
    return { imported: input.destinations.length };
  }

  async findUserById(id: string): Promise<User | null> {
    const row = (await this.#connection.db.select().from(users).where(and(eq(users.id, id), isNull(users.archivedAt))).limit(1))[0];
    return row ? this.#toUser(row) : null;
  }

  async findUserByOAuth(provider: "google" | "facebook", subject: string): Promise<User | null> {
    const row = (await this.#connection.db.select({ user: users }).from(oauthAccounts).innerJoin(users, eq(users.id, oauthAccounts.userId)).where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerSubject, subject), isNull(users.archivedAt))).limit(1))[0];
    return row ? this.#toUser(row.user) : null;
  }

  async upsertOAuthIdentity(identity: OAuthIdentity, locale: Locale): Promise<User> {
    const existing = await this.findUserByOAuth(identity.provider, identity.subject);
    if (existing) return existing;
    return this.#connection.db.transaction(async (tx) => {
      let userRow = (await tx.select().from(users).where(eq(users.email, identity.email.toLowerCase())).limit(1))[0];
      if (!userRow) {
        userRow = (await tx.insert(users).values({ email: identity.email.toLowerCase(), displayName: identity.displayName, avatarUrl: identity.avatarUrl, locale }).returning())[0];
      }
      if (!userRow) throw new Error("Failed to create OAuth user");
      await tx.insert(oauthAccounts).values({ userId: userRow.id, provider: identity.provider, providerSubject: identity.subject, email: identity.email }).onConflictDoNothing();
      await tx.insert(userPreferences).values({ userId: userRow.id, locale }).onConflictDoNothing();
      return this.#toUser(userRow);
    });
  }

  async updateProfile(userId: string, patch: { displayName?: string; locale?: Locale }): Promise<User> {
    const rows = await this.#connection.db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    const row = rows[0];
    if (!row) throw new Error("User not found");
    return this.#toUser(row);
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    const row = (await this.#connection.db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1))[0];
    return row ? { locale: row.locale, defaultScope: row.defaultScope, travelerTypes: row.travelerTypes, preferredCategories: row.preferredCategories, aiHistoryOptIn: row.aiHistoryOptIn, darkMode: row.darkMode } : { ...defaultPreferences };
  }

  async updatePreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    await this.#connection.db.insert(userPreferences).values({ userId, ...preferences }).onConflictDoUpdate({ target: userPreferences.userId, set: { ...preferences, updatedAt: new Date() } });
    return preferences;
  }

  async createSession(userId: string, familyId: string, expiresAt: Date, userAgent?: string, ipHash?: string): Promise<SessionRecord> {
    const row = (await this.#connection.db.insert(sessions).values({ userId, tokenFamilyId: familyId, expiresAt, ...(userAgent ? { userAgent } : {}), ...(ipHash ? { ipHash } : {}) }).returning())[0];
    if (!row) throw new Error("Failed to create session");
    return { id: row.id, userId: row.userId, familyId: row.tokenFamilyId, expiresAt: row.expiresAt, revokedAt: row.revokedAt };
  }

  async findSession(id: string): Promise<SessionRecord | null> {
    const row = (await this.#connection.db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0];
    return row ? { id: row.id, userId: row.userId, familyId: row.tokenFamilyId, expiresAt: row.expiresAt, revokedAt: row.revokedAt } : null;
  }

  async revokeSession(id: string): Promise<void> {
    await this.#connection.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id));
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.#connection.db.transaction(async (tx) => {
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenFamilyId, familyId));
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.familyId, familyId));
    });
  }

  async createRefreshToken(input: Omit<StoredRefreshToken, "usedAt" | "revokedAt"> & { parentTokenId?: string }): Promise<void> {
    await this.#connection.db.insert(refreshTokens).values({ id: input.id, sessionId: input.sessionId, familyId: input.familyId, tokenHash: input.tokenHash, expiresAt: input.expiresAt, ...(input.parentTokenId ? { parentTokenId: input.parentTokenId } : {}) });
  }

  async findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null> {
    const row = (await this.#connection.db.select({ token: refreshTokens, userId: sessions.userId }).from(refreshTokens).innerJoin(sessions, eq(sessions.id, refreshTokens.sessionId)).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1))[0];
    return row ? { id: row.token.id, sessionId: row.token.sessionId, familyId: row.token.familyId, userId: row.userId, tokenHash: row.token.tokenHash, expiresAt: row.token.expiresAt, usedAt: row.token.usedAt, revokedAt: row.token.revokedAt } : null;
  }

  async markRefreshTokenUsed(id: string): Promise<void> {
    await this.#connection.db.update(refreshTokens).set({ usedAt: new Date() }).where(eq(refreshTokens.id, id));
  }

  async setFavorite(userId: string, destinationId: string, enabled: boolean): Promise<void> {
    if (enabled) await this.#connection.db.insert(favorites).values({ userId, destinationId }).onConflictDoNothing();
    else await this.#connection.db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.destinationId, destinationId)));
  }

  async setLike(userId: string, destinationId: string, enabled: boolean): Promise<void> {
    await this.#connection.db.transaction(async (tx) => {
      if (enabled) {
        const inserted = await tx.insert(likes).values({ userId, destinationId }).onConflictDoNothing().returning({ destinationId: likes.destinationId });
        if (inserted.length > 0) await tx.update(destinationMetrics).set({ likesCount: sql`${destinationMetrics.likesCount} + 1` }).where(eq(destinationMetrics.destinationId, destinationId));
      } else {
        const removed = await tx.delete(likes).where(and(eq(likes.userId, userId), eq(likes.destinationId, destinationId))).returning({ destinationId: likes.destinationId });
        if (removed.length > 0) await tx.update(destinationMetrics).set({ likesCount: sql`greatest(0, ${destinationMetrics.likesCount} - 1)` }).where(eq(destinationMetrics.destinationId, destinationId));
      }
    });
  }

  async listFavorites(userId: string, locale: Locale): Promise<DestinationCard[]> {
    const rows = await this.#connection.db.select({ id: favorites.destinationId }).from(favorites).where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt));
    return this.getByIds(rows.map((row) => row.id), locale, userId);
  }

  async listTrips(userId: string, locale: Locale): Promise<Trip[]> {
    const rows = await this.#connection.db.select().from(trips).where(eq(trips.userId, userId)).orderBy(desc(trips.updatedAt));
    return Promise.all(rows.map((row) => this.#hydrateTrip(row, locale)));
  }

  async getTrip(userId: string, tripId: string, locale: Locale): Promise<Trip | null> {
    const row = (await this.#connection.db.select().from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).limit(1))[0];
    return row ? this.#hydrateTrip(row, locale) : null;
  }

  async createTrip(userId: string, input: TripCreate, locale: Locale): Promise<Trip> {
    const row = (await this.#connection.db.insert(trips).values({ userId, name: input.name, startDate: input.startDate ?? null, endDate: input.endDate ?? null, notes: input.notes ?? null }).returning())[0];
    if (!row) throw new Error("Failed to create trip");
    return this.#hydrateTrip(row, locale);
  }

  async updateTrip(userId: string, tripId: string, input: TripUpdate, locale: Locale): Promise<Trip | null> {
    const row = (await this.#connection.db.update(trips).set({ ...input, updatedAt: new Date() }).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).returning())[0];
    return row ? this.#hydrateTrip(row, locale) : null;
  }

  async deleteTrip(userId: string, tripId: string): Promise<boolean> {
    const rows = await this.#connection.db.delete(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).returning({ id: trips.id });
    return rows.length > 0;
  }

  async addDestination(userId: string, tripId: string, destinationId: string, notes: string | null, locale: Locale): Promise<Trip | null> {
    const owned = await this.getTrip(userId, tripId, locale);
    if (!owned) return null;
    const positionRows = await this.#connection.db.select({ max: sql<number>`coalesce(max(${tripDestinations.position}), -1)` }).from(tripDestinations).where(eq(tripDestinations.tripId, tripId));
    await this.#connection.db.insert(tripDestinations).values({ tripId, destinationId, notes, position: Number(positionRows[0]?.max ?? -1) + 1 }).onConflictDoUpdate({ target: [tripDestinations.tripId, tripDestinations.destinationId], set: { notes } });
    await this.#connection.db.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
    return this.getTrip(userId, tripId, locale);
  }

  async removeDestination(userId: string, tripId: string, destinationId: string, locale: Locale): Promise<Trip | null> {
    if (!(await this.getTrip(userId, tripId, locale))) return null;
    await this.#connection.db.transaction(async (tx) => {
      await tx.delete(tripDestinations).where(and(eq(tripDestinations.tripId, tripId), eq(tripDestinations.destinationId, destinationId)));
      const rows = await tx.select({ id: tripDestinations.id }).from(tripDestinations).where(eq(tripDestinations.tripId, tripId)).orderBy(asc(tripDestinations.position));
      for (const [position, row] of rows.entries()) await tx.update(tripDestinations).set({ position }).where(eq(tripDestinations.id, row.id));
      await tx.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
    });
    return this.getTrip(userId, tripId, locale);
  }

  async reorderDestinations(userId: string, tripId: string, destinationIds: string[], locale: Locale): Promise<Trip | null> {
    if (!(await this.getTrip(userId, tripId, locale))) return null;
    const currentRows = await this.#connection.db.select({ id: tripDestinations.destinationId }).from(tripDestinations).where(eq(tripDestinations.tripId, tripId));
    const current = currentRows.map((row) => row.id).sort();
    const requested = [...destinationIds].sort();
    if (current.length !== requested.length || current.some((id, index) => id !== requested[index])) throw new Error("Destination order must include every trip destination exactly once");
    await this.#connection.db.transaction(async (tx) => {
      await tx.update(tripDestinations).set({ position: sql`-${tripDestinations.position} - 1` }).where(eq(tripDestinations.tripId, tripId));
      for (const [position, destinationId] of destinationIds.entries()) await tx.update(tripDestinations).set({ position }).where(and(eq(tripDestinations.tripId, tripId), eq(tripDestinations.destinationId, destinationId)));
      await tx.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
    });
    return this.getTrip(userId, tripId, locale);
  }

  async createJob(userId: string, request: RecommendationRequest): Promise<RecommendationJob> {
    const row = (await this.#connection.db.insert(recommendationJobs).values({ userId, request }).returning())[0];
    if (!row) throw new Error("Failed to create recommendation job");
    return this.#toJob(row);
  }

  async getJob(userId: string, jobId: string): Promise<RecommendationJob | null> {
    const row = (await this.#connection.db.select().from(recommendationJobs).where(and(eq(recommendationJobs.id, jobId), eq(recommendationJobs.userId, userId))).limit(1))[0];
    return row ? this.#toJob(row) : null;
  }

  async getJobRequest(jobId: string): Promise<{ userId: string; request: RecommendationRequest } | null> {
    const row = (await this.#connection.db.select({ userId: recommendationJobs.userId, request: recommendationJobs.request }).from(recommendationJobs).where(eq(recommendationJobs.id, jobId)).limit(1))[0];
    return row ?? null;
  }

  async updateJob(jobId: string, update: Pick<RecommendationJob, "status" | "progress" | "statusMessage" | "error">): Promise<void> {
    await this.#connection.db.update(recommendationJobs).set({ ...update, updatedAt: new Date(), ...(update.status === "completed" || update.status === "failed" ? { completedAt: new Date() } : {}) }).where(eq(recommendationJobs.id, jobId));
  }

  async saveResult(jobId: string, response: AiProviderResponse, provider: string, deterministicFallback: boolean): Promise<void> {
    await this.#connection.db.insert(recommendationResults).values({ jobId, response, provider, deterministicFallback });
  }

  async getResult(userId: string, jobId: string, locale: Locale): Promise<RecommendationResult | null> {
    const row = (await this.#connection.db.select({ job: recommendationJobs, result: recommendationResults }).from(recommendationJobs).innerJoin(recommendationResults, eq(recommendationResults.jobId, recommendationJobs.id)).where(and(eq(recommendationJobs.id, jobId), eq(recommendationJobs.userId, userId))).limit(1))[0];
    if (!row) return null;
    const cards = await this.getByIds(row.result.response.recommendations.map((item) => item.destinationId), locale, userId);
    const byId = new Map(cards.map((card) => [card.id, card]));
    return {
      job: this.#toJob(row.job),
      items: row.result.response.recommendations.flatMap((item) => {
        const destination = byId.get(item.destinationId);
        return destination ? [{ destination, reason: item.reason, score: item.score }] : [];
      }),
      clarification: row.result.response.clarification,
      provider: row.result.provider,
      deterministicFallback: row.result.deterministicFallback,
    };
  }

  async storeHistory(userId: string, jobId: string, redactedPrompt: string, expiresAt: Date): Promise<void> {
    await this.#connection.db.insert(aiSearchHistory).values({ userId, jobId, redactedPrompt, expiresAt });
  }

  async record(input: { actorUserId?: string; action: string; entityType: string; entityId: string; requestId?: string; metadata?: Record<string, unknown> }): Promise<void> {
    await this.#connection.db.insert(auditLogs).values({ action: input.action, entityType: input.entityType, entityId: input.entityId, ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}), ...(input.requestId ? { requestId: input.requestId } : {}), metadata: input.metadata ?? {} });
  }

  async #loadHydration(ids: string[], locale: Locale, userId?: string): Promise<HydrationContext> {
    const [categoryRows, countRows, imageRows, travelerRows, favoriteRows, likedRows] = await Promise.all([
      this.#connection.db.select({ destinationId: destinationCategories.destinationId, id: categories.id, slug: categories.slug, name: categoryTranslations.name, icon: categories.icon }).from(destinationCategories).innerJoin(categories, eq(categories.id, destinationCategories.categoryId)).innerJoin(categoryTranslations, and(eq(categoryTranslations.categoryId, categories.id), eq(categoryTranslations.locale, locale))).where(inArray(destinationCategories.destinationId, ids)),
      this.#connection.db.select({ slug: categories.slug, count: count(destinationCategories.destinationId) }).from(categories).leftJoin(destinationCategories, eq(destinationCategories.categoryId, categories.id)).groupBy(categories.slug),
      this.#loadImages(ids, locale),
      this.#connection.db.select({ destinationId: destinationTravelerTypes.destinationId, slug: travelerTypes.slug }).from(destinationTravelerTypes).innerJoin(travelerTypes, eq(travelerTypes.id, destinationTravelerTypes.travelerTypeId)).where(inArray(destinationTravelerTypes.destinationId, ids)),
      userId ? this.#connection.db.select({ id: favorites.destinationId }).from(favorites).where(and(eq(favorites.userId, userId), inArray(favorites.destinationId, ids))) : Promise.resolve([]),
      userId ? this.#connection.db.select({ id: likes.destinationId }).from(likes).where(and(eq(likes.userId, userId), inArray(likes.destinationId, ids))) : Promise.resolve([]),
    ]);
    return {
      categoryRows,
      categoryCounts: Object.fromEntries(countRows.map((row) => [row.slug, Number(row.count)])),
      imageRows,
      travelerRows,
      favoriteIds: new Set(favoriteRows.map((row) => row.id)),
      likedIds: new Set(likedRows.map((row) => row.id)),
    };
  }

  async #loadImages(ids: string[], locale: Locale): Promise<HydrationContext["imageRows"]> {
    return this.#connection.db.select({ id: destinationImages.id, destinationId: destinationImages.destinationId, sourceUrl: mediaAssets.sourceUrl, objectKey: mediaAssets.objectKey, alt: locale === "th" ? destinationImages.altTh : destinationImages.altEn, width: mediaAssets.width, height: mediaAssets.height, blurDataUrl: mediaAssets.blurDataUrl, isPrimary: destinationImages.isPrimary }).from(destinationImages).innerJoin(mediaAssets, eq(mediaAssets.id, destinationImages.mediaAssetId)).where(inArray(destinationImages.destinationId, ids)).orderBy(asc(destinationImages.position));
  }

  async #hydrateTrip(row: typeof trips.$inferSelect, locale: Locale): Promise<Trip> {
    const destinationRows = await this.#connection.db.select().from(tripDestinations).where(eq(tripDestinations.tripId, row.id)).orderBy(asc(tripDestinations.position));
    const cards = await this.getByIds(destinationRows.map((destination) => destination.destinationId), locale, row.userId);
    const byId = new Map(cards.map((card) => [card.id, card]));
    return {
      id: row.id,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      notes: row.notes,
      destinations: destinationRows.flatMap((destination) => {
        const card = byId.get(destination.destinationId);
        return card ? [{ id: destination.id, destination: card, position: destination.position, notes: destination.notes }] : [];
      }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  #toCard(row: BaseDestinationRow, context: HydrationContext): DestinationCard {
    const image = context.imageRows.find((candidate) => candidate.destinationId === row.id && candidate.isPrimary) ?? context.imageRows.find((candidate) => candidate.destinationId === row.id);
    if (!image) throw new Error(`Destination ${row.id} has no image`);
    return {
      id: row.id,
      slug: row.slug,
      scope: row.scope,
      name: row.name,
      shortDescription: row.shortDescription,
      country: row.country,
      province: row.province,
      city: row.city,
      coordinates: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
      primaryImage: { id: image.id, url: image.sourceUrl ?? `${this.mediaBaseUrl}/api/v1/media/${encodeURIComponent(image.objectKey)}`, alt: image.alt, width: image.width ?? 1, height: image.height ?? 1, ...(image.blurDataUrl ? { blurDataUrl: image.blurDataUrl } : {}), isPrimary: image.isPrimary },
      categories: context.categoryRows.filter((category) => category.destinationId === row.id).map((category) => ({ id: category.id, slug: category.slug, name: category.name, icon: category.icon, destinationCount: context.categoryCounts[category.slug] ?? 0 })),
      travelerTypes: context.travelerRows.filter((traveler) => traveler.destinationId === row.id).map((traveler) => traveler.slug),
      rating: Number(row.rating ?? 0),
      likesCount: row.likesCount ?? 0,
      featured: row.featured,
      trending: Number(row.trendingScore ?? 0) > 0,
      popular: (row.likesCount ?? 0) >= 1_000,
      seasonal: row.seasonal,
      travelTimeMinutes: null,
      isFavorite: context.favoriteIds.has(row.id),
      isLiked: context.likedIds.has(row.id),
    };
  }

  #toUser(row: typeof users.$inferSelect): User {
    return { id: row.id, email: row.email, displayName: row.displayName, avatarUrl: row.avatarUrl, locale: row.locale, createdAt: row.createdAt.toISOString() };
  }

  #toJob(row: typeof recommendationJobs.$inferSelect): RecommendationJob {
    return { id: row.id, status: row.status, progress: row.progress, statusMessage: row.statusMessage, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), error: row.error };
  }
}
