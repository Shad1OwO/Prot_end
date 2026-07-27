import { cors } from "@elysiajs/cors";
import { getApiEnvironment, type ApiEnvironment } from "@tourism/config";
import {
  localeSchema,
  mediaUploadRequestSchema,
  oauthProviderSchema,
  preferencesUpdateSchema,
  profilePatchSchema,
  uuidSchema,
} from "@tourism/contracts";
import { Elysia, type AnyElysia } from "elysia";
import type { AppRepository, RecommendationQueue } from "./domain/repositories";
import type { ObjectStorageProvider } from "./domain/providers";
import { CatalogController } from "./controllers/catalog-controller";
import { ProfileController } from "./controllers/profile-controller";
import { RecommendationController } from "./controllers/recommendation-controller";
import { TripController } from "./controllers/trip-controller";
import { HttpError, problemFromError } from "./http/errors";
import { parseCookies, parseInput } from "./http/validation";
import { InMemoryRepository } from "./infrastructure/memory-repository";
import { S3ObjectStorageProvider } from "./infrastructure/object-storage";
import { FacebookOAuthProvider, GoogleOAuthProvider } from "./infrastructure/oauth-providers";
import { PostgresRepository } from "./infrastructure/postgres-repository";
import { InlineRecommendationQueue, RedisRecommendationQueue } from "./infrastructure/recommendation-queue";
import { MetricsRegistry } from "./observability/metrics";
import { FixedWindowRateLimiter } from "./security/rate-limit";
import { securityHeaders, verifyWriteRequest } from "./security/request-security";
import { CatalogService } from "./services/catalog-service";
import { issueDevelopmentSession } from "./services/development-auth";
import { OAuthService } from "./services/oauth-service";
import { ProfileService } from "./services/profile-service";
import { DeterministicRecommendationProcessor } from "./services/recommendation-processor";
import { RecommendationService } from "./services/recommendation-service";
import { SessionService } from "./services/session-service";
import { SocialService } from "./services/social-service";
import { TokenService } from "./services/token-service";
import { TripService } from "./services/trip-service";

interface RequestTelemetry {
  requestId: string;
  startedAt: number;
}

export interface CreateApplicationOptions {
  env?: ApiEnvironment;
  repository?: AppRepository;
  queue?: RecommendationQueue;
  objectStorage?: ObjectStorageProvider;
}

export interface TourismApplication {
  app: AnyElysia;
  repository: AppRepository;
  close(): Promise<void>;
}

function statusCode(value: number | string | undefined): number {
  return typeof value === "number" ? value : 200;
}

function setCookies(headers: Record<string, string | string[] | number | undefined>, values: string[]): void {
  headers["set-cookie"] = values;
}

function requestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createApplication(options: CreateApplicationOptions = {}): TourismApplication {
  const env = options.env ?? getApiEnvironment();
  const repository = options.repository ?? (env.DATABASE_URL ? new PostgresRepository(env.DATABASE_URL, env.API_ORIGIN) : new InMemoryRepository());
  const metrics = new MetricsRegistry();
  const processor = new DeterministicRecommendationProcessor(repository);
  const queue = options.queue ?? (env.REDIS_URL ? new RedisRecommendationQueue(env.REDIS_URL) : new InlineRecommendationQueue((jobId) => processor.process(jobId)));
  const objectStorage = options.objectStorage ?? new S3ObjectStorageProvider(env);
  const tokens = new TokenService(env.JWT_SECRET, env.API_ORIGIN, "tourism-web");
  const sessions = new SessionService(repository, tokens, env);
  const oauthProviders = {
    google: new GoogleOAuthProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    facebook: new FacebookOAuthProvider(env.FACEBOOK_CLIENT_ID, env.FACEBOOK_CLIENT_SECRET),
  };
  const oauth = new OAuthService(repository, sessions, tokens, oauthProviders, env);
  const catalog = new CatalogController(new CatalogService(repository));
  const profile = new ProfileController(new ProfileService(repository));
  const social = new SocialService(repository);
  const trips = new TripController(new TripService(repository));
  const recommendations = new RecommendationController(new RecommendationService(repository, queue, env.API_ORIGIN));
  const limiter = new FixedWindowRateLimiter(env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_SECONDS);
  const telemetry = new WeakMap<Request, RequestTelemetry>();

  const app = new Elysia({ name: "tourism-api" })
    .use(cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["content-type", "authorization", "x-csrf-token", "x-internal-api-key", "x-request-id"],
      exposeHeaders: ["x-request-id", "ratelimit-remaining", "ratelimit-reset"],
      maxAge: 600,
    }))
    .onRequest(({ request, set }) => {
      const requestId = request.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID();
      telemetry.set(request, { requestId, startedAt: performance.now() });
      set.headers["x-request-id"] = requestId;
      for (const [name, value] of Object.entries(securityHeaders)) set.headers[name] = value;
      const limit = limiter.consume(requestIp(request));
      set.headers["ratelimit-remaining"] = String(limit.remaining);
      set.headers["ratelimit-reset"] = String(limit.resetSeconds);
      if (!limit.allowed) {
        set.headers["retry-after"] = String(limit.resetSeconds);
        throw new HttpError(429, "Too Many Requests", "The request limit was exceeded. Retry after the indicated delay.");
      }
      const internalKey = request.headers.get("x-internal-api-key");
      const validInternalRequest = Boolean(internalKey && tokens.equal(internalKey, env.INTERNAL_API_KEY));
      if (!validInternalRequest) verifyWriteRequest(request, env.WEB_ORIGIN);
    })
    .onAfterResponse(({ request, set }) => {
      const current = telemetry.get(request);
      if (!current) return;
      const durationMs = performance.now() - current.startedAt;
      const url = new URL(request.url);
      const status = statusCode(set.status);
      metrics.observe(request.method, url.pathname, status, durationMs);
      console.info(JSON.stringify({ level: "info", message: "request_complete", requestId: current.requestId, method: request.method, path: url.pathname, status, durationMs: Number(durationMs.toFixed(2)) }));
      telemetry.delete(request);
    })
    .onError(({ request, error, code, set }) => {
      const current = telemetry.get(request);
      const requestId = current?.requestId ?? crypto.randomUUID();
      const url = new URL(request.url);
      const normalizedError = error instanceof HttpError
        ? error
        : code === "NOT_FOUND"
          ? new HttpError(404, "Not Found", "The requested resource does not exist.")
          : code === "PARSE"
            ? new HttpError(400, "Invalid Request Body", "The request body could not be parsed.")
            : error;
      const problem = problemFromError(normalizedError, requestId, url.pathname);
      set.status = problem.status;
      set.headers["content-type"] = "application/problem+json";
      if (problem.status >= 500) console.error(JSON.stringify({ level: "error", message: "request_failed", requestId, method: request.method, path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return problem;
    })
    .get("/health/live", () => ({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) }))
    .get("/health/ready", async ({ set }) => {
      if (repository instanceof PostgresRepository) await repository.healthCheck();
      set.headers["cache-control"] = "no-store";
      return { status: "ready", database: env.DATABASE_URL ? "remote" : "memory", queue: env.REDIS_URL ? "redis" : "inline" };
    })
    .get("/metrics", ({ set }) => {
      set.headers["content-type"] = "text/plain; version=0.0.4; charset=utf-8";
      return metrics.render();
    })
    .get("/api/v1/catalog/home", async ({ query, request }) => {
      const auth = await sessions.authenticate(request, false);
      return catalog.home(query, auth?.user.id);
    })
    .get("/api/v1/destinations", async ({ query, request }) => {
      const auth = await sessions.authenticate(request, false);
      return catalog.list(query, auth?.user.id);
    })
    .get("/api/v1/destinations/:slug", async ({ params, query, request }) => {
      const auth = await sessions.authenticate(request, false);
      return catalog.detail(params.slug, query, auth?.user.id);
    })
    .get("/api/v1/categories", ({ query }) => catalog.categories(query))
    .post("/api/v1/internal/catalog/imports", async ({ body, request, set }) => {
      const key = request.headers.get("x-internal-api-key");
      if (!key || !tokens.equal(key, env.INTERNAL_API_KEY)) throw new HttpError(403, "Forbidden", "A valid internal API key is required.");
      const result = await catalog.import(body);
      set.status = 201;
      return result;
    })
    .post("/api/v1/internal/media/upload-requests", async ({ body, request, set }) => {
      const key = request.headers.get("x-internal-api-key");
      if (!key || !tokens.equal(key, env.INTERNAL_API_KEY)) throw new HttpError(403, "Forbidden", "A valid internal API key is required.");
      const result = await objectStorage.createUploadTicket(parseInput(mediaUploadRequestSchema, body));
      set.status = 201;
      return result;
    })
    .get("/api/v1/auth/oauth/:provider/start", async ({ params, query, set }) => {
      const provider = parseInput(oauthProviderSchema, params.provider);
      const locale = parseInput(localeSchema, query.locale ?? "en");
      const result = await oauth.start(provider, locale, typeof query.returnTo === "string" ? query.returnTo : `/${locale}`);
      set.status = 302;
      set.headers.location = result.redirectUrl;
      set.headers["set-cookie"] = result.stateCookie;
      return null;
    })
    .get("/api/v1/auth/oauth/:provider/callback", async ({ params, query, request, set }) => {
      const provider = parseInput(oauthProviderSchema, params.provider);
      if (typeof query.code !== "string" || typeof query.state !== "string") throw new HttpError(400, "Invalid OAuth Callback", "The authorization code and state are required.");
      const result = await oauth.callback(provider, request, query.code, query.state);
      setCookies(set.headers, [...result.session.cookies, result.clearStateCookie]);
      set.status = 302;
      set.headers.location = `${env.WEB_ORIGIN}${result.returnTo}`;
      return null;
    })
    .post("/api/v1/auth/development-session", async ({ set }) => {
      const issued = await issueDevelopmentSession(repository, sessions, env.NODE_ENV);
      setCookies(set.headers, issued.cookies);
      return issued.response;
    })
    .post("/api/v1/auth/refresh", async ({ request, set }) => {
      const refreshToken = parseCookies(request.headers.get("cookie")).refresh_token;
      if (!refreshToken) throw new HttpError(401, "Unauthorized", "The refresh token cookie is missing.");
      const issued = await sessions.rotate(refreshToken);
      setCookies(set.headers, issued.cookies);
      return issued.response;
    })
    .post("/api/v1/auth/logout", async ({ request, set }) => {
      setCookies(set.headers, await sessions.logout(request));
      set.status = 204;
      return null;
    })
    .get("/api/v1/auth/me", async ({ request }) => {
      const auth = await sessions.authenticate(request);
      const csrfToken = parseCookies(request.headers.get("cookie")).csrf_token;
      return { user: auth?.user, preferences: await repository.getPreferences(auth?.user.id as string), csrfToken: csrfToken ?? "" };
    })
    .patch("/api/v1/profile", async ({ request, body }) => {
      const auth = await sessions.authenticate(request);
      return profile.updateProfile(auth?.user.id as string, parseInput(profilePatchSchema, body));
    })
    .put("/api/v1/preferences", async ({ request, body }) => {
      const auth = await sessions.authenticate(request);
      return profile.updatePreferences(auth?.user.id as string, parseInput(preferencesUpdateSchema, body));
    })
    .get("/api/v1/favorites", async ({ request, query }) => {
      const auth = await sessions.authenticate(request);
      const locale = parseInput(localeSchema, query.locale ?? "en");
      return { items: await social.listFavorites(auth?.user.id as string, locale) };
    })
    .put("/api/v1/destinations/:id/favorite", async ({ request, params, set }) => {
      const auth = await sessions.authenticate(request);
      await social.favorite(auth?.user.id as string, parseInput(uuidSchema, params.id), true);
      set.status = 204;
      return null;
    })
    .delete("/api/v1/destinations/:id/favorite", async ({ request, params, set }) => {
      const auth = await sessions.authenticate(request);
      await social.favorite(auth?.user.id as string, parseInput(uuidSchema, params.id), false);
      set.status = 204;
      return null;
    })
    .put("/api/v1/destinations/:id/like", async ({ request, params, set }) => {
      const auth = await sessions.authenticate(request);
      await social.like(auth?.user.id as string, parseInput(uuidSchema, params.id), true);
      set.status = 204;
      return null;
    })
    .delete("/api/v1/destinations/:id/like", async ({ request, params, set }) => {
      const auth = await sessions.authenticate(request);
      await social.like(auth?.user.id as string, parseInput(uuidSchema, params.id), false);
      set.status = 204;
      return null;
    })
    .get("/api/v1/trips", async ({ request, query }) => {
      const auth = await sessions.authenticate(request);
      return { items: await trips.list(auth?.user.id as string, query) };
    })
    .post("/api/v1/trips", async ({ request, body, query, set }) => {
      const auth = await sessions.authenticate(request);
      const trip = await trips.create(auth?.user.id as string, body, query);
      set.status = 201;
      return trip;
    })
    .get("/api/v1/trips/:id", async ({ request, params, query }) => {
      const auth = await sessions.authenticate(request);
      return trips.get(auth?.user.id as string, params.id, query);
    })
    .patch("/api/v1/trips/:id", async ({ request, params, body, query }) => {
      const auth = await sessions.authenticate(request);
      return trips.update(auth?.user.id as string, params.id, body, query);
    })
    .delete("/api/v1/trips/:id", async ({ request, params, set }) => {
      const auth = await sessions.authenticate(request);
      await trips.remove(auth?.user.id as string, params.id);
      set.status = 204;
      return null;
    })
    .post("/api/v1/trips/:id/destinations", async ({ request, params, body, query }) => {
      const auth = await sessions.authenticate(request);
      return trips.addDestination(auth?.user.id as string, params.id, body, query);
    })
    .delete("/api/v1/trips/:id/destinations/:destinationId", async ({ request, params, query }) => {
      const auth = await sessions.authenticate(request);
      return trips.removeDestination(auth?.user.id as string, params.id, params.destinationId, query);
    })
    .put("/api/v1/trips/:id/destinations/order", async ({ request, params, body, query }) => {
      const auth = await sessions.authenticate(request);
      return trips.reorder(auth?.user.id as string, params.id, body, query);
    })
    .post("/api/v1/recommendations", async ({ request, body, set }) => {
      const auth = await sessions.authenticate(request);
      const created = await recommendations.create(auth?.user.id as string, body);
      set.status = 202;
      return created;
    })
    .get("/api/v1/recommendations/:id", async ({ request, params, query }) => {
      const auth = await sessions.authenticate(request);
      return recommendations.status(auth?.user.id as string, params.id, query);
    })
    .get("/api/v1/recommendations/:id/events", async ({ request, params, query, set }) => {
      const auth = await sessions.authenticate(request);
      const userId = auth?.user.id as string;
      const jobId = parseInput(uuidSchema, params.id);
      const locale = parseInput(localeSchema, query.locale ?? "en");
      await recommendations.status(userId, jobId, { locale });
      set.headers["content-type"] = "text/event-stream; charset=utf-8";
      set.headers["cache-control"] = "no-cache, no-transform";
      set.headers.connection = "keep-alive";
      const encoder = new TextEncoder();
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          for (let attempt = 0; attempt < 120 && !request.signal.aborted; attempt += 1) {
            const status = await recommendations.status(userId, jobId, { locale });
            controller.enqueue(encoder.encode(sseEvent("progress", status)));
            if (status.job.status === "completed" || status.job.status === "failed") {
              controller.enqueue(encoder.encode(sseEvent(status.job.status, status)));
              controller.close();
              return;
            }
            await Bun.sleep(500);
          }
          controller.enqueue(encoder.encode(sseEvent("timeout", { jobId })));
          controller.close();
        },
      });
    });

  return {
    app,
    repository,
    async close() {
      await queue.close();
      if (repository instanceof PostgresRepository) await repository.close();
    },
  };
}
