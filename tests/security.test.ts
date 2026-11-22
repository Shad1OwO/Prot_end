import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import type { Trip } from "../packages/contracts/src";
import { apiEnvironmentSchema } from "../packages/config/src";
import { createApplication, type CreateApplicationOptions } from "../apps/api/src/app";
import { HttpError } from "../apps/api/src/http/errors";
import { InMemoryRepository } from "../apps/api/src/infrastructure/memory-repository";
import { googleIdentityFromClaims } from "../apps/api/src/infrastructure/oauth-providers";
import { FixedWindowRateLimiter } from "../apps/api/src/security/rate-limit";
import { EmailAuthService } from "../apps/api/src/services/email-auth-service";
import { SessionService } from "../apps/api/src/services/session-service";
import { TokenService } from "../apps/api/src/services/token-service";
import { TripService } from "../apps/api/src/services/trip-service";
import type { AppRepository } from "../apps/api/src/domain/repositories";

const origin = "http://localhost:3000";
const base = "http://localhost:4000";
const strongSecret = "k3J9xQ2mVb7Lp0Zt5Rw8Yn1Hc4Fd6Gs2Aq9Ue3Ti";
const destinationId = "20000000-0000-4000-8000-000000000001";

beforeAll(() => {
  spyOn(console, "info").mockImplementation(() => {});
  spyOn(console, "error").mockImplementation(() => {});
});

type App = ReturnType<typeof createApplication>;
function make(overrides: Record<string, string> = {}, options: Omit<CreateApplicationOptions, "env"> = {}): App {
  return createApplication({ env: apiEnvironmentSchema.parse({ NODE_ENV: "test", RATE_LIMIT_MAX: "10000", AUTH_RATE_LIMIT_MAX: "10000", ...overrides }), ...options });
}
const call = (app: App, path: string, init: RequestInit = {}) => app.app.handle(new Request(`${base}${path}`, init));
const json = (body: unknown) => JSON.stringify(body);

interface Account { headers: Record<string, string>; cookie: string }
function accountFrom(response: Response): Account {
  const cookie = response.headers.getSetCookie().map((line) => line.split(";", 1)[0]).join("; ");
  const csrf = decodeURIComponent(cookie.split("; ").find((item) => item.startsWith("csrf_token="))?.slice("csrf_token=".length) ?? "");
  return { cookie, headers: { origin, cookie, "x-csrf-token": csrf, "content-type": "application/json" } };
}
async function register(app: App, email: string, password = "correct horse battery"): Promise<Account> {
  const response = await call(app, "/api/v1/auth/register", { method: "POST", headers: { origin, "content-type": "application/json" }, body: json({ email, password, displayName: "Traveler", locale: "en" }) });
  expect(response.status).toBe(201);
  return accountFrom(response);
}
const login = (app: App, email: string, password: string, extraHeaders: Record<string, string> = {}) => call(app, "/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json", ...extraHeaders }, body: json({ email, password }) });

describe("environment configuration", () => {
  const production = { NODE_ENV: "production", JWT_SECRET: strongSecret, INTERNAL_API_KEY: strongSecret, DATABASE_URL: "postgres://app:pw@db:5432/app" };

  test("treats an unset NODE_ENV as production and refuses to start without secrets", () => {
    expect(() => apiEnvironmentSchema.parse({})).toThrow();
  });
  test("refuses the built-in development secrets in production", () => {
    expect(() => apiEnvironmentSchema.parse({ NODE_ENV: "production", DATABASE_URL: production.DATABASE_URL })).toThrow();
  });
  test("refuses the placeholder secrets from .env.example in production", () => {
    expect(() => apiEnvironmentSchema.parse({ ...production, JWT_SECRET: "replace-with-at-least-32-random-characters" })).toThrow();
    expect(() => apiEnvironmentSchema.parse({ ...production, INTERNAL_API_KEY: "replace-with-a-random-internal-key" })).toThrow();
  });
  test("refuses to fall back to the in-memory store in production", () => {
    expect(() => apiEnvironmentSchema.parse({ ...production, DATABASE_URL: undefined })).toThrow();
  });
  test("accepts a fully configured production environment", () => {
    expect(apiEnvironmentSchema.parse(production).NODE_ENV).toBe("production");
  });
  test("still boots with defaults for explicit local development", () => {
    expect(apiEnvironmentSchema.parse({ NODE_ENV: "development" }).NODE_ENV).toBe("development");
  });
  test("marks session cookies Secure whenever the site is served over HTTPS", async () => {
    const app = make({ WEB_ORIGIN: "https://travel.example", API_ORIGIN: "https://travel.example" });
    const response = await call(app, "/api/v1/auth/development-session", { method: "POST", headers: { origin: "https://travel.example" } });
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    for (const cookie of cookies) expect(cookie).toContain("; Secure");
  });
});

describe("rate limiting", () => {
  test("does not let a client pick its own bucket with forwarding headers", async () => {
    const app = make({ RATE_LIMIT_MAX: "5" });
    const statuses: number[] = [];
    for (let index = 0; index < 8; index += 1) statuses.push((await call(app, "/health/live", { headers: { "cf-connecting-ip": `1.1.1.${index}`, "x-forwarded-for": `2.2.2.${index}` } })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
  });
  test("keys on the proxy-appended X-Forwarded-For entry when one is configured", async () => {
    const app = make({ RATE_LIMIT_MAX: "5", CLIENT_IP_HEADER: "x-forwarded-for" });
    const statuses: number[] = [];
    for (let index = 0; index < 7; index += 1) statuses.push((await call(app, "/health/live", { headers: { "x-forwarded-for": `6.6.6.${index}, 9.9.9.9` } })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
    expect((await call(app, "/health/live", { headers: { "x-forwarded-for": "8.8.8.8" } })).status).toBe(200);
  });
  test("keys on CF-Connecting-IP and ignores X-Forwarded-For behind Cloudflare Tunnel", async () => {
    const app = make({ RATE_LIMIT_MAX: "5", CLIENT_IP_HEADER: "cf-connecting-ip" });
    const statuses: number[] = [];
    for (let index = 0; index < 7; index += 1) statuses.push((await call(app, "/health/live", { headers: { "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": `6.6.6.${index}` } })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
    expect((await call(app, "/health/live", { headers: { "cf-connecting-ip": "8.8.8.8" } })).status).toBe(200);
  });
  test("evicts the oldest keys instead of growing without bound", () => {
    const limiter = new FixedWindowRateLimiter(1, 60, 100);
    expect(limiter.consume("first", 1_000).allowed).toBe(true);
    expect(limiter.consume("first", 1_001).allowed).toBe(false);
    for (let index = 0; index < 100; index += 1) limiter.consume(`flood-${index}`, 1_002);
    // "first" was the oldest key, so it was dropped and starts a fresh window.
    expect(limiter.consume("first", 1_003).allowed).toBe(true);
  });
  test("throttles sign-in attempts per client well below the general limit", async () => {
    const app = make({ AUTH_RATE_LIMIT_MAX: "3" });
    const statuses: number[] = [];
    for (let index = 0; index < 5; index += 1) statuses.push((await login(app, `nobody${index}@example.com`, "wrong password")).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    expect((await call(app, "/health/live")).status).toBe(200);
  });
  test("locks sign-in for an account after ten failures, without affecting other accounts", async () => {
    const app = make({ CLIENT_IP_HEADER: "x-forwarded-for" });
    await register(app, "target@example.com", "the real password");
    await register(app, "bystander@example.com", "another password");
    for (let index = 0; index < 10; index += 1) expect((await login(app, "target@example.com", "guess number " + index, { "x-forwarded-for": `7.7.7.${index}` })).status).toBe(401);
    expect((await login(app, "target@example.com", "the real password", { "x-forwarded-for": "7.7.7.200" })).status).toBe(429);
    expect((await login(app, "bystander@example.com", "another password", { "x-forwarded-for": "7.7.7.201" })).status).toBe(200);
    // 14 argon2 hashes: about 4 s on an idle machine, so the default 5 s limit fails it under load.
  }, 30_000);
  test("gives each signed-in user their own budget so people behind one address do not block each other", async () => {
    const app = make({ RATE_LIMIT_MAX: "5" });
    const first = await register(app, "first@example.com");
    const second = await register(app, "second@example.com");
    const statuses: number[] = [];
    for (let index = 0; index < 6; index += 1) statuses.push((await call(app, "/api/v1/auth/me", { headers: { cookie: first.cookie } })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await call(app, "/api/v1/auth/me", { headers: { cookie: second.cookie } })).status).toBe(200);
  });
});

describe("malformed input", () => {
  test("serves public pages to a browser carrying an undecodable cookie", async () => {
    const app = make();
    expect((await call(app, "/api/v1/destinations", { headers: { cookie: "promo=50%off" } })).status).toBe(200);
  });
  test("treats an undecodable cookie as signed out rather than crashing", async () => {
    const app = make();
    expect((await call(app, "/api/v1/auth/me", { headers: { cookie: "promo=50%off" } })).status).toBe(401);
  });
  test("rejects a write with an unparseable Referer as forbidden", async () => {
    const app = make();
    const response = await call(app, "/api/v1/auth/login", { method: "POST", headers: { referer: "not a url", "content-type": "application/json" }, body: json({ email: "a@example.com", password: "password-123" }) });
    expect(response.status).toBe(403);
  });
  test("rejects an invalid pagination cursor as a validation error", async () => {
    const app = make();
    expect((await call(app, "/api/v1/destinations?cursor=%21%21%21")).status).toBe(422);
  });
});

describe("trips", () => {
  test("a partial update leaves the fields it does not mention untouched", async () => {
    const app = make();
    const account = await register(app, "planner@example.com");
    const created = await (await call(app, "/api/v1/trips", { method: "POST", headers: account.headers, body: json({ name: "Japan", startDate: "2027-01-01", endDate: "2027-01-10", notes: "book the ryokan" }) })).json() as Trip;
    const patched = await (await call(app, `/api/v1/trips/${created.id}`, { method: "PATCH", headers: account.headers, body: json({ name: "Japan 2027" }) })).json() as Trip;
    expect({ name: patched.name, startDate: patched.startDate, endDate: patched.endDate, notes: patched.notes }).toEqual({ name: "Japan 2027", startDate: "2027-01-01", endDate: "2027-01-10", notes: "book the ryokan" });
  });
  test("a partial update can still clear a field explicitly", async () => {
    const app = make();
    const account = await register(app, "clearer@example.com");
    const created = await (await call(app, "/api/v1/trips", { method: "POST", headers: account.headers, body: json({ name: "Japan", notes: "old notes" }) })).json() as Trip;
    const patched = await (await call(app, `/api/v1/trips/${created.id}`, { method: "PATCH", headers: account.headers, body: json({ notes: null }) })).json() as Trip;
    expect(patched.notes).toBeNull();
    expect(patched.name).toBe("Japan");
  });
  test("rejects an update that would put the end date before the stored start date", async () => {
    const app = make();
    const account = await register(app, "dates@example.com");
    const created = await (await call(app, "/api/v1/trips", { method: "POST", headers: account.headers, body: json({ name: "Japan", startDate: "2027-01-05", endDate: "2027-01-10" }) })).json() as Trip;
    const response = await call(app, `/api/v1/trips/${created.id}`, { method: "PATCH", headers: account.headers, body: json({ endDate: "2027-01-01" }) });
    expect(response.status).toBe(422);
  });
  test("adding a destination that is already in the trip keeps its notes", async () => {
    const app = make();
    const account = await register(app, "notes@example.com");
    const created = await (await call(app, "/api/v1/trips", { method: "POST", headers: account.headers, body: json({ name: "Thailand" }) })).json() as Trip;
    await call(app, `/api/v1/trips/${created.id}/destinations`, { method: "POST", headers: account.headers, body: json({ destinationId, notes: "sunrise visit" }) });
    const again = await (await call(app, `/api/v1/trips/${created.id}/destinations`, { method: "POST", headers: account.headers, body: json({ destinationId }) })).json() as Trip;
    expect(again.destinations.map((item) => item.notes)).toEqual(["sunrise visit"]);
  });
  test("stops one account creating more than fifty trips", async () => {
    const app = make();
    const account = await register(app, "bulk@example.com");
    for (let index = 0; index < 50; index += 1) expect((await call(app, "/api/v1/trips", { method: "POST", headers: account.headers, body: json({ name: `Trip ${index}` }) })).status).toBe(201);
    expect((await call(app, "/api/v1/trips", { method: "POST", headers: account.headers, body: json({ name: "One too many" }) })).status).toBe(409);
    const listed = await (await call(app, "/api/v1/trips", { headers: account.headers })).json() as { items: Trip[] };
    expect(listed.items).toHaveLength(50);
  });
  test("stops a trip growing past one hundred destinations", async () => {
    const card = { id: destinationId } as Trip["destinations"][number]["destination"];
    const full: Trip = { id: "30000000-0000-4000-8000-000000000001", name: "Full", startDate: null, endDate: null, notes: null, createdAt: "2027-01-01T00:00:00.000Z", updatedAt: "2027-01-01T00:00:00.000Z", destinations: Array.from({ length: 100 }, (_, position) => ({ id: `40000000-0000-4000-8000-${String(position).padStart(12, "0")}`, destination: { ...card, id: `50000000-0000-4000-8000-${String(position).padStart(12, "0")}` }, position, notes: null })) };
    let added = false;
    const repository = { getTrip: async () => full, addDestination: async () => { added = true; return full; } } as unknown as AppRepository;
    const attempt = new TripService(repository).addDestination("user", full.id, destinationId, undefined, "en");
    await expect(attempt).rejects.toMatchObject({ status: 409 });
    expect(added).toBe(false);
  });
});

describe("refresh tokens", () => {
  test("only one of two simultaneous refreshes rotates the token, and the session survives", async () => {
    const app = make();
    const account = await register(app, "tabs@example.com");
    const headers = { origin, cookie: account.cookie, "x-csrf-token": account.headers["x-csrf-token"] as string };
    const responses = await Promise.all([call(app, "/api/v1/auth/refresh", { method: "POST", headers }), call(app, "/api/v1/auth/refresh", { method: "POST", headers })]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = accountFrom(responses.find((response) => response.status === 200) as Response);
    expect((await call(app, "/api/v1/auth/me", { headers: { cookie: winner.cookie } })).status).toBe(200);
  });
  test("reusing a rotated token after the grace period revokes the whole session family", async () => {
    const repository = new InMemoryRepository();
    const env = apiEnvironmentSchema.parse({ NODE_ENV: "test" });
    const tokens = new TokenService(env.JWT_SECRET, env.API_ORIGIN, "tourism-web");
    const sessions = new SessionService(repository, tokens, env, { refreshReuseGraceMs: 0 });
    const user = await repository.createEmailCredential({ email: "replay@example.com", displayName: "Replay", passwordHash: "unused", locale: "en" });
    const issued = await sessions.issue(user);
    const refreshToken = decodeURIComponent(issued.cookies.find((line) => line.startsWith("refresh_token="))?.split(";", 1)[0]?.slice("refresh_token=".length) ?? "");
    const rotated = await sessions.rotate(refreshToken);
    const replay = sessions.rotate(refreshToken);
    await expect(replay).rejects.toMatchObject({ status: 401 });
    const rotatedToken = decodeURIComponent(rotated.cookies.find((line) => line.startsWith("refresh_token="))?.split(";", 1)[0]?.slice("refresh_token=".length) ?? "");
    await expect(sessions.rotate(rotatedToken)).rejects.toBeInstanceOf(HttpError);
  });
});

describe("metrics", () => {
  const seriesFor = (text: string, fragment: string) => text.split("\n").filter((line) => line.startsWith("http_requests_total") && line.includes(fragment));

  test("collapses unknown paths into one series instead of one per URL", async () => {
    const app = make();
    for (let index = 0; index < 40; index += 1) await call(app, `/api/v1/nope-${index}`);
    await Bun.sleep(20);
    const text = await (await call(app, "/metrics")).text();
    expect(seriesFor(text, "nope")).toEqual([]);
    expect(seriesFor(text, 'route="unmatched"')).toEqual(['http_requests_total{method="GET",route="unmatched",status="404"} 40']);
  });
  test("labels matched requests with the route template, not the concrete URL", async () => {
    const app = make();
    await call(app, "/api/v1/destinations/doi-inthanon?locale=en");
    await call(app, "/api/v1/destinations/railay-beach?locale=en");
    await Bun.sleep(20);
    const text = await (await call(app, "/metrics")).text();
    expect(seriesFor(text, "/api/v1/destinations/")).toEqual(['http_requests_total{method="GET",route="/api/v1/destinations/:slug",status="200"} 2']);
  });
  test("is not served to requests that arrived through the public proxy", async () => {
    const app = make();
    expect((await call(app, "/metrics", { headers: { "x-forwarded-for": "203.0.113.9" } })).status).toBe(404);
  });
  test("requires the scrape token when one is configured", async () => {
    const app = make({ METRICS_TOKEN: "scrape-token-0123456789" });
    expect((await call(app, "/metrics")).status).toBe(401);
    expect((await call(app, "/metrics", { headers: { authorization: "Bearer scrape-token-0123456789" } })).status).toBe(200);
  });
});

describe("Google sign-in", () => {
  const claims = { sub: "google-subject-1", email: "Victim@Example.com", name: "Victim", nonce: "expected-nonce", email_verified: true };

  test("accepts a verified Google identity", () => {
    expect(googleIdentityFromClaims(claims, "expected-nonce")).toEqual({ provider: "google", subject: "google-subject-1", email: "Victim@Example.com", displayName: "Victim", avatarUrl: null });
  });
  test("refuses a Google identity whose email is not verified", () => {
    expect(() => googleIdentityFromClaims({ ...claims, email_verified: false }, "expected-nonce")).toThrow(HttpError);
    const { email_verified: _omitted, ...withoutFlag } = claims;
    expect(() => googleIdentityFromClaims(withoutFlag, "expected-nonce")).toThrow(HttpError);
  });
  test("taking over an unverified password account removes the squatter's password and sessions", async () => {
    const repository = new InMemoryRepository();
    const squatted = await repository.createEmailCredential({ email: "victim@example.com", displayName: "Squatter", passwordHash: "attacker-hash", locale: "en" });
    const attackerSession = await repository.createSession(squatted.id, crypto.randomUUID(), new Date(Date.now() + 60_000));
    const owner = await repository.upsertOAuthIdentity({ provider: "google", subject: "google-subject-1", email: "victim@example.com", displayName: "Victim", avatarUrl: null }, "en");
    expect(owner.id).toBe(squatted.id);
    expect(await repository.findEmailCredential("victim@example.com")).toBeNull();
    expect((await repository.findSession(attackerSession.id))?.revokedAt).toBeInstanceOf(Date);
    expect((await repository.findUserByOAuth("google", "google-subject-1"))?.id).toBe(squatted.id);
  });
  test("keeps a password the verified owner set after linking", async () => {
    const repository = new InMemoryRepository();
    const identity = { provider: "google" as const, subject: "google-subject-1", email: "owner@example.com", displayName: "Owner", avatarUrl: null };
    const owner = await repository.upsertOAuthIdentity(identity, "en");
    await repository.setPassword(owner.id, "owner-hash");
    await repository.upsertOAuthIdentity({ ...identity, subject: "google-subject-2" }, "en");
    expect((await repository.findEmailCredential("owner@example.com"))?.passwordHash).toBe("owner-hash");
  });
});

describe("password change", () => {
  test("rejects a wrong current password and leaves the old one working", async () => {
    const app = make();
    const account = await register(app, "change@example.com", "original password");
    const response = await call(app, "/api/v1/auth/password", { method: "POST", headers: account.headers, body: json({ currentPassword: "not the password", newPassword: "brand new password" }) });
    expect(response.status).toBe(403);
    expect((await login(app, "change@example.com", "original password")).status).toBe(200);
  });
  test("replaces the password and signs out every other session", async () => {
    const app = make();
    const elsewhere = await register(app, "rotate@example.com", "original password");
    const here = accountFrom(await login(app, "rotate@example.com", "original password"));
    const response = await call(app, "/api/v1/auth/password", { method: "POST", headers: here.headers, body: json({ currentPassword: "original password", newPassword: "brand new password" }) });
    expect(response.status).toBe(204);
    expect((await login(app, "rotate@example.com", "original password")).status).toBe(401);
    expect((await login(app, "rotate@example.com", "brand new password")).status).toBe(200);
    expect((await call(app, "/api/v1/auth/me", { headers: { cookie: elsewhere.cookie } })).status).toBe(401);
    expect((await call(app, "/api/v1/auth/me", { headers: { cookie: here.cookie } })).status).toBe(200);
  });
  test("lets a Google-only account set its first password without a current one", async () => {
    const repository = new InMemoryRepository();
    const env = apiEnvironmentSchema.parse({ NODE_ENV: "test" });
    const sessions = new SessionService(repository, new TokenService(env.JWT_SECRET, env.API_ORIGIN, "tourism-web"), env);
    const user = await repository.upsertOAuthIdentity({ provider: "google", subject: "google-subject-9", email: "google@example.com", displayName: "Google", avatarUrl: null }, "en");
    await new EmailAuthService(repository, sessions).changePassword(user, "no-session", { newPassword: "first password ever" });
    const stored = await repository.findEmailCredential("google@example.com");
    expect(await Bun.password.verify("first password ever", stored?.passwordHash ?? "")).toBe(true);
  });
});

describe("recommendations", () => {
  test("does not show internal error text to the user when a job fails", async () => {
    class FailingRepository extends InMemoryRepository {
      override async shortlist(): Promise<never> { throw new Error("connect ECONNREFUSED 10.0.0.5:5432 (user=travelncz)"); }
    }
    const app = make({}, { repository: new FailingRepository() });
    const account = await register(app, "ai@example.com");
    const created = await (await call(app, "/api/v1/recommendations", { method: "POST", headers: account.headers, body: json({ prompt: "Quiet nature trip with mountain views", locale: "en", scope: "thailand" }) })).json() as { job: { id: string } };
    let job: { status: string; error: string | null } = { status: "queued", error: null };
    for (let turn = 0; turn < 20 && job.status !== "failed"; turn += 1) {
      await Bun.sleep(5);
      job = (await (await call(app, `/api/v1/recommendations/${created.job.id}`, { headers: { cookie: account.cookie } })).json() as { job: typeof job }).job;
    }
    expect(job.status).toBe("failed");
    expect(job.error).toBeString();
    expect(job.error).not.toContain("10.0.0.5");
    expect(job.error).not.toContain("travelncz");
  });
  test("limits each account to two live progress streams", async () => {
    const neverProcesses = { enqueue: async () => {}, close: async () => {} };
    const app = make({}, { queue: neverProcesses });
    const account = await register(app, "stream@example.com");
    const created = await (await call(app, "/api/v1/recommendations", { method: "POST", headers: account.headers, body: json({ prompt: "Quiet nature trip with mountain views", locale: "en", scope: "thailand" }) })).json() as { job: { id: string } };
    const open = () => call(app, `/api/v1/recommendations/${created.job.id}/events`, { headers: { cookie: account.cookie } });
    const streams = [await open(), await open()];
    const third = await open();
    expect(streams.map((response) => response.status)).toEqual([200, 200]);
    expect(third.status).toBe(429);
    await Promise.all(streams.map((response) => response.body?.cancel()));
    await Bun.sleep(20);
    const afterClosing = await open();
    expect(afterClosing.status).toBe(200);
    await afterClosing.body?.cancel();
  });
});

describe("error logging", () => {
  test("logs the database's reason for a failed query, not the query's values", async () => {
    const driverError = Object.assign(new Error('relation "categories" does not exist'), { code: "42P01" });
    const wrapped = new Error("Failed query: select ... where email = $1\nparams: person@example.com", { cause: driverError });
    const repository = new InMemoryRepository();
    repository.categories = async () => { throw wrapped; };
    const logged: string[] = [];
    spyOn(console, "error").mockImplementation((line: unknown) => { logged.push(String(line)); });
    const response = await call(make({}, { repository }), "/api/v1/categories?locale=en");
    expect(response.status).toBe(500);
    const entry = JSON.parse(logged.find((line) => line.includes("request_failed")) ?? "{}");
    expect(entry.error).toBe('relation "categories" does not exist (42P01)');
    expect(logged.join("\n")).not.toContain("person@example.com");
  });
});
