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
import { transportLabel } from "@tourism/contracts";
import { seedCategories, seedDestinations, type SeedDestination } from "@tourism/db/seed-data";
import type {
  AppRepository,
  OAuthIdentity,
  SessionRecord,
  StoredRefreshToken,
} from "../domain/repositories";

interface MemoryUserState {
  user: User;
  preferences: UserPreferences;
  /** True once an identity provider has vouched for the address. Password sign-up alone never sets it. */
  emailVerified: boolean;
}

interface MemoryTripState {
  id: string;
  userId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  destinationIds: string[];
  destinationNotes: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

interface StoredRecommendation {
  job: RecommendationJob;
  userId: string;
  request: RecommendationRequest;
  response?: AiProviderResponse;
  provider?: string;
  deterministicFallback?: boolean;
}

const categoryBySlug = Object.fromEntries(seedCategories.map((category) => [category.slug, category]));
const defaultPreferences: UserPreferences = {
  locale: "en",
  defaultScope: "thailand",
  travelerTypes: [],
  preferredCategories: [],
  aiHistoryOptIn: false,
  darkMode: "system",
};

function distanceKm(originLatitude: number, originLongitude: number, destination: SeedDestination): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.latitude - originLatitude);
  const longitudeDelta = radians(destination.longitude - originLongitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(originLatitude)) * Math.cos(radians(destination.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function encodeCursor(index: number): string {
  return btoa(String(index));
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const parsed = Number(atob(cursor));
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export class InMemoryRepository implements AppRepository {
  readonly #users = new Map<string, MemoryUserState>();
  readonly #emailCredentials = new Map<string, { userId: string; passwordHash: string }>();
  readonly #oauthUsers = new Map<string, string>();
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #refreshTokens = new Map<string, StoredRefreshToken>();
  readonly #favorites = new Map<string, Set<string>>();
  readonly #likes = new Map<string, Set<string>>();
  readonly #trips = new Map<string, MemoryTripState>();
  readonly #recommendations = new Map<string, StoredRecommendation>();
  readonly #history: Array<{ userId: string; jobId: string; redactedPrompt: string; expiresAt: Date }> = [];
  readonly #imports: CatalogImport[] = [];

  constructor() {
    const id = "00000000-0000-4000-8000-000000000001";
    this.#users.set(id, {
      user: { id, email: "traveler@example.com", displayName: "Demo Traveler", avatarUrl: null, locale: "en", createdAt: new Date().toISOString() },
      preferences: { ...defaultPreferences },
      emailVerified: true,
    });
  }

  async list(query: DestinationQuery, userId?: string): Promise<DestinationListResponse> {
    const normalizedQuery = query.query?.toLocaleLowerCase(query.locale);
    let items = seedDestinations.filter((item) => item.scope === query.scope);
    if (normalizedQuery) items = items.filter((item) => {
      const translation = item[query.locale];
      return `${translation.name} ${translation.shortDescription} ${translation.description}`.toLocaleLowerCase(query.locale).includes(normalizedQuery);
    });
    if (query.category) items = items.filter((item) => item.categorySlugs.includes(query.category as never));
    if (query.travelerType) items = items.filter((item) => item.travelerTypes.includes(query.travelerType as never));
    if (query.country) items = items.filter((item) => item.countryCode.toLocaleLowerCase() === query.country?.toLocaleLowerCase());
    if (query.province) items = items.filter((item) => item.provinceCode?.toLocaleLowerCase() === query.province?.toLocaleLowerCase());
    if (query.city) items = items.filter((item) => item.cityCode?.toLocaleLowerCase() === query.city?.toLocaleLowerCase());
    const hasOrigin = query.originLat !== undefined && query.originLng !== undefined;
    if (hasOrigin && query.maxDistanceKm) items = items.filter((item) => distanceKm(query.originLat as number, query.originLng as number, item) <= (query.maxDistanceKm as number));
    items = [...items].sort((left, right) => {
      if (query.sort === "rating") return right.rating - left.rating;
      if (query.sort === "popular") return right.likesCount - left.likesCount;
      if (query.sort === "distance" && hasOrigin) return distanceKm(query.originLat as number, query.originLng as number, left) - distanceKm(query.originLat as number, query.originLng as number, right);
      return Number(right.featured) - Number(left.featured) || right.likesCount - left.likesCount;
    });
    const offset = decodeCursor(query.cursor);
    const pageItems = items.slice(offset, offset + query.limit);
    const nextOffset = offset + pageItems.length;
    return {
      items: pageItems.map((item) => this.#toCard(item, query.locale, userId, hasOrigin ? { latitude: query.originLat as number, longitude: query.originLng as number } : undefined)),
      page: { hasMore: nextOffset < items.length, nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null },
    };
  }

  async getBySlug(slug: string, locale: Locale, userId?: string): Promise<DestinationDetail | null> {
    const item = seedDestinations.find((candidate) => candidate.slug === slug);
    if (!item) return null;
    const card = this.#toCard(item, locale, userId);
    return {
      ...card,
      description: item[locale].description,
      address: item.address,
      images: [card.primaryImage],
      transports: item.transportModes.map((mode) => ({ mode, available: true, durationMinutes: null, distanceKm: null, label: transportLabel(mode, locale) })),
      bestMonths: item.bestMonths,
      openingHours: null,
      websiteUrl: null,
      metadata: { curated: "true" },
    };
  }

  async getByIds(ids: string[], locale: Locale, userId?: string): Promise<DestinationCard[]> {
    const byId = new Map(seedDestinations.map((item) => [item.id, item]));
    return ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [this.#toCard(item, locale, userId)] : [];
    });
  }

  async categories(locale: Locale): Promise<Category[]> {
    return seedCategories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category[locale],
      icon: category.icon,
      destinationCount: seedDestinations.filter((destination) => destination.categorySlugs.includes(category.slug)).length,
    }));
  }

  async home(locale: Locale, scope: "thailand" | "worldwide", userId?: string): Promise<HomeSections> {
    const scoped = seedDestinations.filter((item) => item.scope === scope);
    const cards = (predicate: (item: SeedDestination) => boolean) => scoped.filter(predicate).slice(0, 8).map((item) => this.#toCard(item, locale, userId));
    const preferences = userId ? this.#users.get(userId)?.preferences : undefined;
    const personalized = preferences?.preferredCategories.length
      ? cards((item) => item.categorySlugs.some((slug) => preferences.preferredCategories.includes(slug)))
      : [];
    return {
      featured: cards((item) => item.featured),
      trending: cards((item) => item.trending),
      popular: cards((item) => item.popular),
      seasonal: cards((item) => item.seasonal),
      personalized,
    };
  }

  async shortlist(request: RecommendationRequest, limit: number): Promise<DestinationCard[]> {
    const query: DestinationQuery = {
      locale: request.locale,
      scope: request.scope,
      query: request.prompt,
      category: request.filters.categorySlugs[0],
      travelerType: request.filters.travelerTypes[0],
      originLat: request.filters.origin?.latitude,
      originLng: request.filters.origin?.longitude,
      maxDistanceKm: request.filters.maxDistanceKm,
      sort: "featured",
      limit,
    };
    const first = await this.list(query);
    if (first.items.length > 0) return first.items;
    const broad = await this.list({ ...query, query: undefined, category: undefined, travelerType: undefined });
    return broad.items;
  }

  async importCatalog(input: CatalogImport): Promise<{ imported: number }> {
    this.#imports.push(input);
    return { imported: input.destinations.length };
  }

  async findUserById(id: string): Promise<User | null> {
    return this.#users.get(id)?.user ?? null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    return [...this.#users.values()].find(({ user }) => user.email === normalized)?.user ?? null;
  }

  async findEmailCredential(email: string): Promise<{ user: User; passwordHash: string } | null> {
    const credential = this.#emailCredentials.get(email.trim().toLowerCase());
    if (!credential) return null;
    const user = await this.findUserById(credential.userId);
    return user ? { user, passwordHash: credential.passwordHash } : null;
  }

  async createEmailCredential(input: { email: string; displayName: string; passwordHash: string; locale: Locale }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (this.#emailCredentials.has(email)) throw new Error("EMAIL_CREDENTIAL_EXISTS");
    if (await this.findUserByEmail(email)) throw new Error("EMAIL_CREDENTIAL_EXISTS");
    const id = crypto.randomUUID();
    const user: User = { id, email, displayName: input.displayName, avatarUrl: null, locale: input.locale, createdAt: new Date().toISOString() };
    this.#users.set(id, { user, preferences: { ...defaultPreferences, locale: input.locale }, emailVerified: false });
    this.#emailCredentials.set(email, { userId: user.id, passwordHash: input.passwordHash });
    return user;
  }

  async findUserByOAuth(provider: "google", subject: string): Promise<User | null> {
    const id = this.#oauthUsers.get(`${provider}:${subject}`);
    return id ? this.findUserById(id) : null;
  }

  async upsertOAuthIdentity(identity: OAuthIdentity, locale: Locale): Promise<User> {
    const existing = await this.findUserByOAuth(identity.provider, identity.subject);
    if (existing) return existing;
    const email = identity.email.trim().toLowerCase();
    const state = [...this.#users.values()].find((candidate) => candidate.user.email === email);
    if (state) {
      if (!state.emailVerified) {
        this.#emailCredentials.delete(email);
        await this.revokeUserSessions(state.user.id);
        state.emailVerified = true;
      }
      this.#oauthUsers.set(`${identity.provider}:${identity.subject}`, state.user.id);
      return state.user;
    }
    const id = crypto.randomUUID();
    const user: User = { id, email, displayName: identity.displayName, avatarUrl: identity.avatarUrl, locale, createdAt: new Date().toISOString() };
    this.#users.set(id, { user, preferences: { ...defaultPreferences, locale }, emailVerified: true });
    this.#oauthUsers.set(`${identity.provider}:${identity.subject}`, id);
    return user;
  }

  async setPassword(userId: string, passwordHash: string): Promise<void> {
    const state = this.#users.get(userId);
    if (!state) throw new Error("User not found");
    this.#emailCredentials.set(state.user.email, { userId, passwordHash });
  }

  async updateProfile(userId: string, patch: { displayName?: string; locale?: Locale }): Promise<User> {
    const state = this.#users.get(userId);
    if (!state) throw new Error("User not found");
    state.user = { ...state.user, ...patch };
    return state.user;
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    return this.#users.get(userId)?.preferences ?? { ...defaultPreferences };
  }

  async updatePreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    const state = this.#users.get(userId);
    if (!state) throw new Error("User not found");
    state.preferences = { ...preferences };
    return state.preferences;
  }

  async createSession(userId: string, familyId: string, expiresAt: Date): Promise<SessionRecord> {
    const record: SessionRecord = { id: crypto.randomUUID(), userId, familyId, expiresAt, revokedAt: null };
    this.#sessions.set(record.id, record);
    return record;
  }

  async findSession(id: string): Promise<SessionRecord | null> {
    return this.#sessions.get(id) ?? null;
  }

  async revokeSession(id: string): Promise<void> {
    const session = this.#sessions.get(id);
    if (session) session.revokedAt = new Date();
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const session of this.#sessions.values()) if (session.familyId === familyId) session.revokedAt = new Date();
    for (const token of this.#refreshTokens.values()) if (token.familyId === familyId) token.revokedAt = new Date();
  }

  async createRefreshToken(input: Omit<StoredRefreshToken, "usedAt" | "revokedAt">): Promise<void> {
    this.#refreshTokens.set(input.tokenHash, { ...input, usedAt: null, revokedAt: null });
  }

  async findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.#refreshTokens.get(tokenHash) ?? null;
  }

  async markRefreshTokenUsed(id: string): Promise<boolean> {
    for (const token of this.#refreshTokens.values()) {
      if (token.id !== id) continue;
      if (token.usedAt) return false;
      token.usedAt = new Date();
      return true;
    }
    return false;
  }

  async revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    const revoked = new Set<string>();
    for (const session of this.#sessions.values()) {
      if (session.userId !== userId || session.id === exceptSessionId || session.revokedAt) continue;
      session.revokedAt = new Date();
      revoked.add(session.id);
    }
    for (const token of this.#refreshTokens.values()) if (revoked.has(token.sessionId)) token.revokedAt = new Date();
  }

  async setFavorite(userId: string, destinationId: string, enabled: boolean): Promise<void> {
    const values = this.#favorites.get(userId) ?? new Set<string>();
    if (enabled) values.add(destinationId); else values.delete(destinationId);
    this.#favorites.set(userId, values);
  }

  async setLike(userId: string, destinationId: string, enabled: boolean): Promise<void> {
    const values = this.#likes.get(userId) ?? new Set<string>();
    if (enabled) values.add(destinationId); else values.delete(destinationId);
    this.#likes.set(userId, values);
  }

  async listFavorites(userId: string, locale: Locale): Promise<DestinationCard[]> {
    return this.getByIds([...this.#favorites.get(userId) ?? []], locale, userId);
  }

  async listTrips(userId: string, locale: Locale): Promise<Trip[]> {
    return Promise.all([...this.#trips.values()].filter((trip) => trip.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((trip) => this.#toTrip(trip, locale)));
  }

  async countTrips(userId: string): Promise<number> {
    return [...this.#trips.values()].filter((trip) => trip.userId === userId).length;
  }

  async getTrip(userId: string, tripId: string, locale: Locale): Promise<Trip | null> {
    const trip = this.#trips.get(tripId);
    return trip?.userId === userId ? this.#toTrip(trip, locale) : null;
  }

  async createTrip(userId: string, input: TripCreate, locale: Locale): Promise<Trip> {
    const now = new Date().toISOString();
    const trip: MemoryTripState = { id: crypto.randomUUID(), userId, name: input.name, startDate: input.startDate ?? null, endDate: input.endDate ?? null, notes: input.notes ?? null, destinationIds: [], destinationNotes: {}, createdAt: now, updatedAt: now };
    this.#trips.set(trip.id, trip);
    return this.#toTrip(trip, locale);
  }

  async updateTrip(userId: string, tripId: string, input: TripUpdate, locale: Locale): Promise<Trip | null> {
    const trip = this.#trips.get(tripId);
    if (!trip || trip.userId !== userId) return null;
    if (input.name !== undefined) trip.name = input.name;
    if (input.startDate !== undefined) trip.startDate = input.startDate;
    if (input.endDate !== undefined) trip.endDate = input.endDate;
    if (input.notes !== undefined) trip.notes = input.notes;
    trip.updatedAt = new Date().toISOString();
    return this.#toTrip(trip, locale);
  }

  async deleteTrip(userId: string, tripId: string): Promise<boolean> {
    const trip = this.#trips.get(tripId);
    return trip?.userId === userId ? this.#trips.delete(tripId) : false;
  }

  async addDestination(userId: string, tripId: string, destinationId: string, notes: string | null | undefined, locale: Locale): Promise<Trip | null> {
    const trip = this.#trips.get(tripId);
    if (!trip || trip.userId !== userId || !seedDestinations.some((item) => item.id === destinationId)) return null;
    if (!trip.destinationIds.includes(destinationId)) trip.destinationIds.push(destinationId);
    if (notes !== undefined) trip.destinationNotes[destinationId] = notes;
    trip.updatedAt = new Date().toISOString();
    return this.#toTrip(trip, locale);
  }

  async removeDestination(userId: string, tripId: string, destinationId: string, locale: Locale): Promise<Trip | null> {
    const trip = this.#trips.get(tripId);
    if (!trip || trip.userId !== userId) return null;
    trip.destinationIds = trip.destinationIds.filter((id) => id !== destinationId);
    delete trip.destinationNotes[destinationId];
    trip.updatedAt = new Date().toISOString();
    return this.#toTrip(trip, locale);
  }

  async reorderDestinations(userId: string, tripId: string, destinationIds: string[], locale: Locale): Promise<Trip | null> {
    const trip = this.#trips.get(tripId);
    if (!trip || trip.userId !== userId) return null;
    const current = [...trip.destinationIds].sort();
    const requested = [...destinationIds].sort();
    if (current.length !== requested.length || current.some((id, index) => id !== requested[index])) throw new Error("Destination order must include every trip destination exactly once");
    trip.destinationIds = [...destinationIds];
    trip.updatedAt = new Date().toISOString();
    return this.#toTrip(trip, locale);
  }

  async createJob(userId: string, request: RecommendationRequest): Promise<RecommendationJob> {
    const now = new Date().toISOString();
    const job: RecommendationJob = { id: crypto.randomUUID(), status: "queued", progress: 0, statusMessage: "Queued", createdAt: now, updatedAt: now, error: null };
    this.#recommendations.set(job.id, { job, userId, request });
    return job;
  }

  async getJob(userId: string, jobId: string): Promise<RecommendationJob | null> {
    const stored = this.#recommendations.get(jobId);
    return stored?.userId === userId ? stored.job : null;
  }
  async getJobRequest(jobId: string): Promise<{ userId: string; request: RecommendationRequest } | null> {
    const stored = this.#recommendations.get(jobId);
    return stored ? { userId: stored.userId, request: stored.request } : null;
  }


  async updateJob(jobId: string, update: Pick<RecommendationJob, "status" | "progress" | "statusMessage" | "error">): Promise<void> {
    const stored = this.#recommendations.get(jobId);
    if (stored) stored.job = { ...stored.job, ...update, updatedAt: new Date().toISOString() };
  }

  async saveResult(jobId: string, response: AiProviderResponse, provider: string, deterministicFallback: boolean): Promise<void> {
    const stored = this.#recommendations.get(jobId);
    if (stored) Object.assign(stored, { response, provider, deterministicFallback });
  }

  async getResult(userId: string, jobId: string, locale: Locale): Promise<RecommendationResult | null> {
    const stored = this.#recommendations.get(jobId);
    if (!stored || stored.userId !== userId || !stored.response || !stored.provider) return null;
    const cards = await this.getByIds(stored.response.recommendations.map((item) => item.destinationId), locale, userId);
    const cardById = new Map(cards.map((card) => [card.id, card]));
    return {
      job: stored.job,
      items: stored.response.recommendations.flatMap((item) => {
        const destination = cardById.get(item.destinationId);
        return destination ? [{ destination, reason: item.reason, score: item.score }] : [];
      }),
      clarification: stored.response.clarification,
      provider: stored.provider,
      deterministicFallback: stored.deterministicFallback ?? false,
    };
  }

  async storeHistory(userId: string, jobId: string, redactedPrompt: string, expiresAt: Date): Promise<void> {
    this.#history.push({ userId, jobId, redactedPrompt, expiresAt });
  }

  async record(): Promise<void> {}

  async #toTrip(trip: MemoryTripState, locale: Locale): Promise<Trip> {
    const destinations = await this.getByIds(trip.destinationIds, locale, trip.userId);
    return {
      id: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      notes: trip.notes,
      destinations: destinations.map((destination, position) => ({ id: destination.id, destination, position, notes: trip.destinationNotes[destination.id] ?? null })),
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    };
  }

  #toCard(item: SeedDestination, locale: Locale, userId?: string, origin?: { latitude: number; longitude: number }): DestinationCard {
    const translation = item[locale];
    const userFavorites = userId ? this.#favorites.get(userId) : undefined;
    const userLikes = userId ? this.#likes.get(userId) : undefined;
    const directDistance = origin ? distanceKm(origin.latitude, origin.longitude, item) : null;
    return {
      id: item.id,
      slug: item.slug,
      scope: item.scope,
      name: translation.name,
      shortDescription: translation.shortDescription,
      country: item.countryCode,
      province: item.provinceCode,
      city: item.cityCode,
      coordinates: { latitude: item.latitude, longitude: item.longitude },
      primaryImage: { id: `${item.id.slice(0, -1)}9`, url: item.imageUrl, alt: translation.name, width: item.imageWidth, height: item.imageHeight, isPrimary: true },
      categories: item.categorySlugs.flatMap((slug) => {
        const category = categoryBySlug[slug];
        return category ? [{ id: category.id, slug: category.slug, name: category[locale], icon: category.icon, destinationCount: seedDestinations.filter((destination) => destination.categorySlugs.includes(slug)).length }] : [];
      }),
      travelerTypes: item.travelerTypes,
      rating: item.rating,
      likesCount: item.likesCount + (userLikes?.has(item.id) ? 1 : 0),
      featured: item.featured,
      trending: item.trending,
      popular: item.popular,
      seasonal: item.seasonal,
      travelTimeMinutes: directDistance === null ? null : Math.max(1, Math.round((directDistance / 65) * 60)),
      isFavorite: userFavorites?.has(item.id) ?? false,
      isLiked: userLikes?.has(item.id) ?? false,
    };
  }
}
