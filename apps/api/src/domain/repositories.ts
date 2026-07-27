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

export interface StoredOAuthAccount {
  userId: string;
  provider: "google" | "facebook";
  providerSubject: string;
}

export interface OAuthIdentity {
  provider: "google" | "facebook";
  subject: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface StoredRefreshToken {
  id: string;
  sessionId: string;
  familyId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CatalogRepository {
  list(query: DestinationQuery, userId?: string): Promise<DestinationListResponse>;
  getBySlug(slug: string, locale: Locale, userId?: string): Promise<DestinationDetail | null>;
  getByIds(ids: string[], locale: Locale, userId?: string): Promise<DestinationCard[]>;
  categories(locale: Locale): Promise<Category[]>;
  home(locale: Locale, scope: "thailand" | "worldwide", userId?: string): Promise<HomeSections>;
  shortlist(request: RecommendationRequest, limit: number): Promise<DestinationCard[]>;
  importCatalog(input: CatalogImport): Promise<{ imported: number }>;
}

export interface IdentityRepository {
  findUserById(id: string): Promise<User | null>;
  findUserByOAuth(provider: "google" | "facebook", subject: string): Promise<User | null>;
  upsertOAuthIdentity(identity: OAuthIdentity, locale: Locale): Promise<User>;
  updateProfile(userId: string, patch: { displayName?: string; locale?: Locale }): Promise<User>;
  getPreferences(userId: string): Promise<UserPreferences>;
  updatePreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences>;
}

export interface SessionRepository {
  createSession(userId: string, familyId: string, expiresAt: Date, userAgent?: string, ipHash?: string): Promise<SessionRecord>;
  findSession(id: string): Promise<SessionRecord | null>;
  revokeSession(id: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  createRefreshToken(input: Omit<StoredRefreshToken, "usedAt" | "revokedAt"> & { parentTokenId?: string }): Promise<void>;
  findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null>;
  markRefreshTokenUsed(id: string): Promise<void>;
}

export interface SocialRepository {
  setFavorite(userId: string, destinationId: string, enabled: boolean): Promise<void>;
  setLike(userId: string, destinationId: string, enabled: boolean): Promise<void>;
  listFavorites(userId: string, locale: Locale): Promise<DestinationCard[]>;
}

export interface TripRepository {
  listTrips(userId: string, locale: Locale): Promise<Trip[]>;
  getTrip(userId: string, tripId: string, locale: Locale): Promise<Trip | null>;
  createTrip(userId: string, input: TripCreate, locale: Locale): Promise<Trip>;
  updateTrip(userId: string, tripId: string, input: TripUpdate, locale: Locale): Promise<Trip | null>;
  deleteTrip(userId: string, tripId: string): Promise<boolean>;
  addDestination(userId: string, tripId: string, destinationId: string, notes: string | null, locale: Locale): Promise<Trip | null>;
  removeDestination(userId: string, tripId: string, destinationId: string, locale: Locale): Promise<Trip | null>;
  reorderDestinations(userId: string, tripId: string, destinationIds: string[], locale: Locale): Promise<Trip | null>;
}

export interface RecommendationRepository {
  createJob(userId: string, request: RecommendationRequest): Promise<RecommendationJob>;
  getJob(userId: string, jobId: string): Promise<RecommendationJob | null>;
  getJobRequest(jobId: string): Promise<{ userId: string; request: RecommendationRequest } | null>;
  updateJob(jobId: string, update: Pick<RecommendationJob, "status" | "progress" | "statusMessage" | "error">): Promise<void>;
  saveResult(jobId: string, response: AiProviderResponse, provider: string, deterministicFallback: boolean): Promise<void>;
  getResult(userId: string, jobId: string, locale: Locale): Promise<RecommendationResult | null>;
  storeHistory(userId: string, jobId: string, redactedPrompt: string, expiresAt: Date): Promise<void>;
}

export interface AuditRepository {
  record(input: { actorUserId?: string; action: string; entityType: string; entityId: string; requestId?: string; metadata?: Record<string, unknown> }): Promise<void>;
}

export interface AppRepository extends CatalogRepository, IdentityRepository, SessionRepository, SocialRepository, TripRepository, RecommendationRepository, AuditRepository {}

export interface RecommendationQueue {
  enqueue(jobId: string): Promise<void>;
  close(): Promise<void>;
}
