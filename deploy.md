# What you need to deploy Sawasdee Travel

This is the checklist of everything that has to exist before `docker compose up` can work, plus the
repo issues that will break a production deploy as the files stand today. The step-by-step release,
backup and rollback procedure is in [DEPLOYMENT.md](DEPLOYMENT.md).

> The commands here were written from the repo's configuration and have not been run against a real
> server: there is no Docker on the machine this was prepared on. Treat the first deploy as a rehearsal.

## 1. Infrastructure

| Need | Detail |
| --- | --- |
| Linux server | Docker Engine with Compose v2. Plan for 4 GB RAM or more; ClamAV is the largest consumer (estimate, not measured). |
| Domain name | Your hostname (`APP_HOST`) in a zone on Cloudflare. The tunnel creates its DNS record. |
| Open ports | None inbound: close 80 and 443. The server needs outbound access to Cloudflare on port 7844 (TCP and UDP). |
| Cloudflare Tunnel | A tunnel created in the Cloudflare dashboard (Zero Trust > Networks > Tunnels). `compose.yaml` runs `cloudflared` with its token; routes are set in section 6. |
| PostgreSQL 17 + PostGIS 3.5 | From `compose.yaml`, or a remote database. The first migration runs `CREATE EXTENSION postgis`, so the database user must be allowed to do that. |
| Redis 8 | From `compose.yaml`, or remote. Used for the recommendation job queue. |
| S3-compatible storage | MinIO from `compose.yaml`, or a remote service (R2, S3). Create the bucket yourself; nothing in the repo creates it. |
| Off-host backup storage | For the encrypted database dumps written by `ops/backup-postgres.sh`. |

## 2. External accounts and keys

| Need | Required? | Detail |
| --- | --- | --- |
| Google OAuth client | For Google sign-in | Authorised redirect URI: `https://<APP_HOST>/api/v1/auth/oauth/google/callback`. Without it, Google sign-in answers 503; email sign-in still works. |
| AI provider key | Optional | One of `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Without one, recommendations use the built-in ranking. |
| Google Maps key | Optional | `GOOGLE_MAPS_API_KEY`, used for driving-distance filtering (Routes API). |

## 3. Files to create on the server

These are git-ignored and never built into the images. Create them in the project directory.

**`.env`** — read by Compose itself (for `${APP_HOST}` and `${REDIS_PASSWORD}`) and passed to the `api`
and `worker` containers. Your current `secrets/production.env` has the right content but the wrong
name and no `APP_HOST`; copy it to `.env` and add that line.

**`secrets/`** — one value per file, no trailing spaces, mode `0600`:

| File | Used by | Note |
| --- | --- | --- |
| `secrets/postgres_password.txt` | `postgres` | Must not be empty, or the container will not initialise. Must match the password in `DATABASE_URL`. |
| `secrets/grafana_password.txt` | `grafana` | Grafana admin password. |
| `secrets/minio_access_key.txt` | `minio` | Must match `S3_ACCESS_KEY` if you use the bundled MinIO. |
| `secrets/minio_secret_key.txt` | `minio` | Must match `S3_SECRET_KEY` if you use the bundled MinIO. |

Compose refuses to start if any of the four files is missing, even when you use remote storage.
In this checkout `postgres_password.txt` and `grafana_password.txt` are empty and the two MinIO files do not exist.

## 4. Environment variables

### Must be set

| Variable | Value |
| --- | --- |
| `APP_HOST` | Your hostname, without `https://`. Compose derives `WEB_ORIGIN` and `API_ORIGIN` for the API from it. |
| `CLOUDFLARE_TUNNEL_TOKEN` | The tunnel's token. Compose refuses to start without it. |
| `JWT_SECRET` | At least 32 random characters, e.g. `openssl rand -base64 48`. |
| `INTERNAL_API_KEY` | A second random value. It authorises catalog imports and upload tickets. |
| `DATABASE_URL` | Bundled Postgres: `postgres://travelncz:<postgres_password>@postgres:5432/travelapp`. |
| `REDIS_PASSWORD` | Random value; Compose starts Redis with it. |
| `REDIS_URL` | Bundled Redis: `redis://:<REDIS_PASSWORD>@redis:6379`. |
| `WEB_ORIGIN`, `API_ORIGIN` | `https://<APP_HOST>` for both. The worker reads these from `.env`. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` | Bundled MinIO: endpoint `http://minio:9000`, path style `true`. |

The API refuses to start in production if `JWT_SECRET` or `INTERNAL_API_KEY` still holds a placeholder
(anything starting with `replace-` or `development-`) or if `DATABASE_URL` is missing. An unset
`NODE_ENV` counts as production, and `compose.yaml` pins it to `production` whatever `.env` says.

### Set when you use the feature

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | AI ranking. The catalog import also uses `GEMINI_API_KEY` to translate place text into Thai. |
| `AI_PROVIDER_PRIORITY` | Order to try providers in, e.g. `gemini`. Default `openai,gemini,anthropic`. |
| `GOOGLE_MAPS_API_KEY` | Route distance checks. |

### Optional tuning

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLIENT_IP_HEADER` | `cf-connecting-ip` (set in `compose.yaml`) | Header your proxy writes the client address into. Cloudflare overwrites `CF-Connecting-IP`, and the tunnel is the only way in, so clients cannot forge it. If you ever publish a port or add another proxy in front of the API, switch to the header that proxy controls (`x-forwarded-for` for Caddy or nginx). |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS` | 120 per 60 s | General request limit per signed-in user or per address. |
| `AUTH_RATE_LIMIT_MAX` | 10 | Sign-in, registration and password attempts per address per window. |
| `METRICS_TOKEN` | unset | When set, `/metrics` requires `Authorization: Bearer <token>`; give Prometheus the same token. |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | 12000, 2 | AI provider call limits. |
| `HISTORY_RETENTION_DAYS` | 90 | How long opted-in AI search history is kept. |
| `MEDIA_CLAMAV_HOST`, `MEDIA_CLAMAV_PORT` | `clamav`, 3310 | Virus scanner address. |
| `CATALOG_IMPORT_USER_AGENT` | `SawasdeeTravelCatalogImport/1.0 (catalog import script)` | What the catalog import calls itself when it asks Wikimedia for data. Include your site URL or a contact address, e.g. `SawasdeeTravelCatalogImport/1.0 (https://travel.example.com; ops@example.com)`: Wikimedia then allows 200 requests a minute instead of 10, and the import runs about eight times faster. |

## 5. Before the first deploy

1. **Fill in the secret files** listed in section 3.
2. **Create the storage bucket** named in `S3_BUCKET`.
3. **Build the website after setting `APP_HOST`.** Next.js bakes `NEXT_PUBLIC_API_ORIGIN` and
   `NEXT_PUBLIC_WEB_ORIGIN` into the website when the image is built; `compose.yaml` passes both as build
   arguments from `APP_HOST`. If you change `APP_HOST`, run `docker compose build web` again: restarting
   the container is not enough. A website still calling `http://localhost:4000` was built without them.

The API listens on port 4520 (`PORT` in `compose.yaml`). The tunnel route and Prometheus must use that
port; if you change it, change `ops/prometheus.yml` and the tunnel's route with it.

A smaller item that does not block a deploy: Grafana and Prometheus are on an internal network, so reaching their UIs needs an SSH tunnel (or a tunnel route
protected by Cloudflare Access, after attaching them to the `edge` network).

## 6. Deploy

```sh
# build and start the data services
docker compose build --pull
docker compose up -d postgres redis minio

# apply migrations (0000-0005), then seed the catalog on the first deploy only
docker compose run --rm api bun packages/db/src/migrate.ts
docker compose run --rm api bun packages/db/src/seed.ts

# start everything
docker compose up -d
```

The worker then fills the catalog with worldwide places on its own (next section).

With a remote database you can instead run `bun run db:migrate` and `bun run db:seed` from any machine
that has Bun, the repo, and `DATABASE_URL` set. The bundled Postgres is not reachable from the host,
which is why the commands above run inside the `api` image.

On the tunnel in the Cloudflare dashboard, add two public hostname routes for `APP_HOST`, in this order
(the first match wins):

| Order | Path | Service |
| --- | --- | --- |
| 1 | `^/(api\|health)/` | `http://tourism-api:4520` |
| 2 | (empty) | `http://tourism-web:3000` |

Delete any older A or AAAA record for the hostname, and turn on SSL/TLS > Edge Certificates > Always
Use HTTPS for the zone. TLS and compression happen at Cloudflare's edge.

Do not add a route for `/metrics`. Prometheus reads it over the internal network, and the API answers
404 to any `/metrics` request that arrives through a proxy.

### Updating an existing deploy

Nothing applies migrations automatically, so every update runs them before the new code starts:

```sh
git pull
docker compose build --pull

# apply any new migrations; already-applied ones are skipped. Do not run the seed again.
docker compose run --rm api bun packages/db/src/migrate.ts

# restart with the new images
docker compose up -d
```

Migrations here only add columns, tables and indexes, so the old code keeps working while they run. If
the update is started without them, the new API fails on queries that use the new columns: destination
pages answer 500 and the API log shows `column ... does not exist`. Running the migrate command fixes it
without a restart.

### Fill the worldwide catalog

The seed holds only a handful of hand-written destinations. The catalog import adds about 3,800 notable places
from all over the world (Thailand included), taken from Wikidata, Wikipedia and Wikimedia Commons:
tourist attractions, World Heritage Sites and national parks with articles in at least 10 Wikipedia
languages. It needs no API key.

**It runs by itself.** When the worker starts and the database holds no imported places, it starts the
import straight away, then again every `CATALOG_IMPORT_INTERVAL_DAYS` days (default 30). It reads the date
of the last import from the database, so restarting the worker neither repeats a recent import nor skips a
due one. A run that fails is tried again 6 hours later. Follow it in the worker's log:

```sh
docker compose logs -f worker | grep -E 'catalog[-_]import'
```

`catalog_import_started` and `catalog_import_finished` (or `catalog_import_failed` with the exit code) frame
each run, and the import's own `[catalog-import]` progress lines appear in between. Set
`CATALOG_IMPORT_INTERVAL_DAYS=0` in `.env` to turn the schedule off and run it only by hand.

You can still run it yourself, inside the `api` image, which has internet access. Wait until the worker
is not in the middle of a run, so two imports do not write at once:

```sh
# a trial first: fetches 50 places and prints what it would do, without writing anything
docker compose run --rm api bun packages/db/src/catalog-import/run.ts --dry-run --limit=50

# the real import
docker compose run --rm api bun packages/db/src/catalog-import/run.ts
```

It prints progress, then one JSON line with what it did: places fetched and imported, how many were
skipped and why, how many were inserted, updated and archived, and where the Thai text came from.
How long it takes depends on `CATALOG_IMPORT_USER_AGENT` (below): about 50 minutes without it (measured: 48), about
5 minutes with it. The first run with `GEMINI_API_KEY` also translates about 160 batches of 20 places,
one request every 6.5 seconds to stay inside Gemini's free tier: expect roughly another 20 to 40 minutes
(an estimate; it has not been timed against the live API). Later runs only translate new or changed places.

- **Wikimedia's rate limit.** Wikimedia allows anonymous scripts 10 requests a minute unless they say who
  runs them, and 200 a minute when the User-Agent includes a way to reach you. Set it in `.env` to speed
  the import up, for example
  `CATALOG_IMPORT_USER_AGENT=SawasdeeTravelCatalogImport/1.0 (https://travel.example.com; ops@example.com)`
  with your own site and address. The import paces itself to whichever limit applies.

- **Thai text.** Thai names and descriptions come from Thai Wikipedia where it has them (about a fifth of
  the places). With `GEMINI_API_KEY` set in `.env`, the rest are translated by Gemini; without it, or for a
  batch Gemini fails on, the Thai fields hold the English text. If two batches in a row fail (an outage,
  or the free tier's daily quota running out), it stops asking Gemini for the rest of that run. Each place records which happened in its
  `metadata.thSource` (`wikipedia`, `machine` or `english`), and later runs retry the `english` ones, so
  running it again once a key is set fills them in. Text that has not changed is never translated twice.
- **Running it again is safe.** It updates places that changed, adds new ones, and archives places it
  imported before that no longer qualify. It never touches the hand-written destinations, and skips
  the Wikidata items they stand for (`wikidataIds` in `packages/db/src/seed-data.ts`) and anything within
  300 m of one, so they do not appear twice. If any request to Wikimedia fails
  after retries, it stops without writing anything and exits with status 1; the worker tries again 6 hours later.
- **Options.** `--min-sitelinks=N` changes the notability cut-off (higher means fewer, better-known
  places; 20 gives about 2,100). `--limit=N` imports only the N best-known places and never archives.
  `--no-translate` skips Gemini. `--dry-run` writes nothing and does not call Gemini.
- **Credits.** Photos are loaded from Wikimedia Commons, which requires crediting the photographer. The
  destination page shows each photo's author and licence, and links the Wikipedia article its text came
  from (Wikipedia text is CC BY-SA). Keep both if you change those pages.

## 7. Check it worked

```sh
docker compose ps                                   # every service "running" or "healthy"
docker compose logs cloudflared | grep -i registered   # the tunnel has connections to Cloudflare
curl -fsS https://$APP_HOST/health/ready            # {"status":"ready","database":"remote","queue":"redis"}
curl -fsS "https://$APP_HOST/api/v1/destinations?locale=en&scope=thailand&limit=1"
curl -fsS "https://$APP_HOST/api/v1/destinations?locale=en&scope=worldwide&country=FR&limit=3"   # imported places
curl -s -o /dev/null -w '%{http_code}\n' https://$APP_HOST/metrics   # expect 404
```

Then in a browser:

- The home page shows destinations, and the browser's network tab shows API calls going to your
  hostname, not to `localhost`.
- Register with email, sign out, and sign in again.
- Sign in with Google.
- Run one AI search and confirm it completes. A "Provider fallback used" notice means the worker
  could not use the AI provider: check the key in `.env` and that the worker is still attached to the
  `egress` network, which is its only route to the internet.

## 8. What this deploy does not give you

- **No email.** There is no mail provider, so there is no email verification and no forgotten-password
  reset. Users can change a password only while signed in.
- **No alert delivery.** Prometheus evaluates `ops/alerts.yml`, but no Alertmanager is configured.
- **No scheduled jobs.** Backups (`ops/backup-postgres.sh`), restore checks, and purging expired
  sessions and history have to be scheduled by you, for example with cron.
- **Rate limits are per process.** They live in the API's memory, so running several API replicas
  multiplies every limit.
