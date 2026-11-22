# AI Tourist Destination Recommendation Platform

## Product summary

Build a bilingual Thai and English, mobile-first tourism platform. Guests browse a curated catalog in Thailand or Worldwide mode. Authenticated users use AI recommendation search, save places, like destinations, and manage manual trips.

V1 uses Google and Facebook OAuth, a curated catalog, Google Maps routing, and a server-managed OpenAI, Gemini, and Claude provider chain. AI itinerary generation, booking, reviews, hotels, weather, public sharing, PWA, notifications, and a full admin dashboard remain future modules.

## High-level architecture

~~~mermaid
flowchart LR
  Browser[Browser / Mobile Web] --> Proxy[Cloudflare Tunnel / cloudflared]
  Proxy --> Web[Next.js 16 web app]
  Proxy --> API[Elysia API on Bun]
  Web --> API
  API --> DB[(PostgreSQL + PostGIS)]
  API --> Cache[(Redis)]
  API --> Storage[(MinIO / S3 / Cloudflare R2)]
  API --> Worker[Background worker]
  Worker --> Maps[Google Maps]
  Worker --> AI[OpenAI / Gemini / Claude]
~~~

Use a Bun workspace monorepo:

- apps/web: Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod, and SEO-ready localized pages.
- apps/api: Elysia REST API with route, controller, use-case/service, repository, and provider layers.
- apps/worker: queued AI, media, imports, and scoring work.
- packages/contracts, packages/db, packages/config, and packages/ui: shared contracts, Drizzle schema/migrations, configuration, and UI primitives.

## Frontend and user experience

### Pages

- Public: Home, Explore, Categories, Destination Detail, Login/Register, and 404.
- Authenticated: AI Search, Profile, Trip Planner, Saved Destinations, Saved Trips, and Settings.

### UX requirements

- Home contains featured, trending, popular, seasonal, and personalized destination sections.
- Explore supports Thailand/Worldwide scope, category, traveler type, date, geography, map/GPS, and distance filters.
- Destination cards show localized name, image, geography, description, categories, rating, likes, and origin-based travel time. Without an origin, show Set origin instead of an invented estimate.
- Guest attempts to use AI Search, saving, likes, or trip actions open the OAuth sign-in prompt.
- AI Search shows prompt input, structured filters, queued progress, and catalog-bound ranked results with concise reasons.
- Build mobile-first accessible layouts, skeletons, empty/error states, dark mode, keyboard support, and localized SEO metadata, sitemaps, canonical URLs, hreflang, and destination JSON-LD.

### Wireframe direction

- Desktop home: sticky navigation, hero search/scope toggle, filter chips, destination rails, and category discovery.
- Explore: filter drawer on mobile; map/list split on desktop; cursor-paginated cards.
- Destination detail: immersive image header, metadata, map/location, transport cards, tags, save/like actions, and trip picker.
- Trip Planner: trip header, dates/notes form, draggable destination sequence, confirmation states, and deletion controls.

## Backend architecture

Routes delegate to controllers; controllers call application services; services depend on repository and external-provider interfaces; repositories are the only layer that directly uses Drizzle.

Core services:

- AuthService, OAuthProviderService, SessionService, TokenService
- DestinationService, CategoryService, SearchService, TransportService
- RecommendationService, RecommendationJobService, AiProviderRouter
- TripService, FavoriteService, LikeService, ProfileService
- MediaService, ImportService, AuditService

Provider ports:

- AiRecommendationProvider
- MapsRoutingProvider
- ObjectStorageProvider
- OAuthIdentityProvider

The AI router exposes a canonical, Zod-validated response that contains only retrieved catalog destination IDs, ranked explanations, and optional clarification. It uses a server-configured provider priority, timeouts, retries, circuit breakers, health checks, and rule-based fallback.

## Database design

Use PostgreSQL with PostGIS and Drizzle migrations.

### Identity and security

- users
- oauth_accounts
- sessions
- refresh_tokens
- user_preferences

### Curated catalog

- countries, provinces, cities, and localization tables
- destinations, destination_translations, destination_images, and media_assets
- categories, category_translations, and destination_categories
- traveler types and destination traveler-type mappings
- destination seasonality, featured slots, transport availability, and metrics

### User-owned data

- favorites
- likes
- trips
- trip_destinations

### AI and operations

- recommendation_jobs
- recommendation_results
- ai_search_history, only for explicit user opt-in
- import_jobs
- audit_logs
- reviews, reserved for a future moderated review feature

### Constraints and indexes

- UUID keys, foreign keys, and unique OAuth provider subjects.
- Unique favorite and like per user and destination.
- Trip date and unique position checks.
- GIST geometry index for destination coordinates.
- Localized full-text search indexes and cursor-pagination indexes.
- Archived destinations retain references; user-owned data is removed or anonymized according to retention policy.

## REST API

All endpoints are versioned under /api/v1, use shared Zod validation, and return problem+json error documents.

| Area | Endpoints |
|---|---|
| Authentication | GET OAuth start/callback, POST refresh/logout, GET current user |
| Catalog | GET destinations, destination by slug, categories |
| AI | POST recommendation job, GET job status, GET Server-Sent Events |
| Trips | Authenticated CRUD, add/remove/reorder destinations |
| Social | Idempotent favorite and like PUT/DELETE resources |
| Profile | PATCH profile and PUT preferences |
| Internal content | Protected destination imports and media-upload requests |

Use 200 for reads/updates, 201 for creates, 202 for queued AI work, 204 for deletes, 400/401/403/404/409/422 for client errors, 429 for limits, and 5xx only for unexpected failures.

## Authentication and security

- OAuth authorization code flow with PKCE, state, and nonce.
- Short-lived JWT access and rotating refresh tokens in Secure, HttpOnly same-origin cookies only.
- Refresh-token hashes, token-family reuse detection, and complete family revocation after replay or logout.
- CSRF tokens plus strict Origin/Referer checks for writes.
- Rate limits, CSP/security headers, request IDs, structured logs, strict validation, output encoding, and same-origin CORS.
- Docker secrets for credentials and restricted Maps API keys.
- Image type/size validation, malware scan, EXIF stripping, derivative generation, private object keys, and signed URLs.
- Precise GPS coordinates are request-only and never persisted.

## AI recommendation flow

~~~mermaid
sequenceDiagram
  participant U as Authenticated user
  participant W as Next.js
  participant A as Elysia API
  participant Q as Redis queue
  participant R as Worker
  participant D as PostgreSQL/PostGIS
  participant M as Google Maps
  participant P as AI provider router

  U->>W: Submit prompt and filters
  W->>A: Create recommendation job
  A->>D: Validate and filter curated candidates
  A->>Q: Enqueue job
  A-->>W: 202 job ID and events URL
  Q->>R: Run job
  R->>D: PostGIS shortlist
  R->>M: Route top candidates
  R->>P: Rank catalog candidate IDs
  P-->>R: Structured response
  R->>D: Validate and store result
  R-->>W: Live completion event
  W-->>U: Ranked destination cards
~~~

1. An authenticated user submits a prompt, locale, scope, filters, dates, and optional origin.
2. The API validates the request and returns a 202 recommendation job.
3. The worker uses catalog filters and PostGIS to shortlist destinations.
4. Google route calls calculate final road-distance eligibility for top candidates. Car and eligible rail/transit estimates are shown; airplane is a curated availability label only.
5. The selected AI provider ranks only supplied catalog candidates in a strict Zod-defined output.
6. The worker rejects unknown/invalid IDs, stores the result, and emits completion status.
7. Provider failure falls through a configured fallback chain, then returns a transparent deterministic result.

Store replayable history only when a user opts in; retain only redacted operational telemetry for troubleshooting.

## Deployment and operations

Launch with Docker Compose on one hardened node:

- Traefik, Next.js, Elysia API, worker, PostgreSQL/PostGIS, Redis, and MinIO/S3-compatible storage.
- OpenTelemetry Collector, Prometheus, Grafana, Loki, and Alertmanager.
- Private internal networks for data services; only Traefik exposes TLS ports.
- Encrypted off-host database/WAL and object backups, scheduled restore tests, health checks, and container resource limits.
- GitHub Actions runs format/type/test/security checks, builds and scans images, publishes versioned artifacts, runs migrations, and deploys protected environments.

## Delivery roadmap

1. Foundation: workspace, Docker configuration, shared contracts, migrations, observability, and CI.
2. Catalog and public UX: localization, importer, media, public search, SEO, and responsive UI.
3. Accounts and user data: OAuth, sessions, preferences, likes, favorites, and trips.
4. AI and routing: queue, provider fallback, Maps integration, recommendation UI, and history opt-in.
5. Production hardening: security, accessibility, performance, backup restoration, alerts, and deployment runbook.

## Testing strategy

- Unit tests for business rules, contracts, providers, authorization, ranking, and tokens.
- Integration tests with PostgreSQL/PostGIS, Redis, MinIO, and provider mocks.
- API contract, ownership, validation, and error-status tests.
- Playwright journeys for browsing, login, protected actions, saved content, trip ordering, and AI fallback.
- Accessibility, localization, load, CSRF/token replay/upload, prompt-injection, SQL injection, XSS, dependency, container, migration, backup-restore, and alert tests.

## Future scalability

Add AI itineraries, moderated reviews, hotels, restaurants, weather, budgets, public sharing, notifications, analytics, PWA/offline support, multilingual expansion, and a full admin dashboard without changing current ownership or destination relationships. Horizontally scale stateless services and move the single-node data tier to replicated or managed services when availability requirements increase.

## More prompt Ignore after this if the impletement plan is present
from this impletement plan can you give me Activity Diagram and Sequence Diagram and Class Diagram and Entity Relationship Diagram 

one by one please