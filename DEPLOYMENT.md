# Sawasdee Travel deployment runbook

## Prerequisites

- Hardened Linux host with Docker Engine, Compose v2, DNS, TLS ports 80/443, and off-host backup storage.
- An existing Caddy container attached to an external Docker network named `caddy`.
- PostgreSQL 17 with PostGIS 3.5 may run from `compose.yaml` or remotely. Set `DATABASE_URL` accordingly.
- Redis 8 and S3-compatible object storage may run from Compose or remote services.
- Google OAuth callback URL: `https://<APP_HOST>/api/v1/auth/oauth/google/callback`.
- Google Maps and at least one AI provider key. Missing AI providers are skipped; deterministic fallback remains available.

## Secrets and configuration

1. Copy `.env.example` to `.env`; set production origins, remote service URLs, OAuth, Maps, AI, storage, Redis password, and `APP_HOST`.
2. Generate `JWT_SECRET` and `INTERNAL_API_KEY` with at least 32 random bytes.
3. Create `secrets/postgres_password.txt`, `secrets/minio_access_key.txt`, `secrets/minio_secret_key.txt`, and `secrets/grafana_password.txt` with mode `0600`.
4. Do not commit `.env` or `secrets/`.
5. The API refuses to start in production with the placeholder `JWT_SECRET` / `INTERNAL_API_KEY` from `.env.example` or without `DATABASE_URL`. An unset `NODE_ENV` counts as production; `compose.yaml` pins it to `production` regardless of `.env`.
6. `compose.yaml` sets `CLIENT_IP_HEADER=x-forwarded-for` because Caddy overwrites that header with the address it saw. Rate limits key on it. Behind a different proxy, set it to the header that proxy controls; without a proxy leave it unset. Never name a header clients can send unfiltered.
7. Optional: set `METRICS_TOKEN` to require `Authorization: Bearer <token>` on `/metrics`, and give Prometheus the same token. `/metrics` already answers 404 to any request that carries proxy headers.

Apply migration `0003` before releasing this version: it adds `users.email_verified_at`. Signing in with Google to an address that was registered by password but never verified now removes that password and signs out its sessions (the Google identity proves ownership; the password registration did not). The owner can set a new password from the profile page.

## Caddy reverse proxy

The application does not publish host ports. Its `web` and `api` services join the external `caddy` Docker network using stable aliases. Ensure that network exists:

```sh
docker network inspect caddy >/dev/null 2>&1 || docker network create caddy
```

Add this site to the Caddyfile used by the existing Caddy container, replacing the hostname with the value of `APP_HOST`:

```caddyfile
travel.example.com {
    encode zstd gzip

    handle /api/* {
        reverse_proxy tourism-api:4520
    }

    handle /health/* {
        reverse_proxy tourism-api:4520
    }

    handle {
        reverse_proxy tourism-web:3000
    }
}
```

Keep `/metrics` private; Prometheus accesses it directly over the internal `app` network. Validate and reload the central proxy after editing its Caddyfile:

```sh
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Release

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
docker compose build --pull
```

Apply the database before switching traffic:

```sh
DATABASE_URL="$DATABASE_URL" bun run db:migrate
DATABASE_URL="$DATABASE_URL" bun run db:seed  # first deployment only; idempotent
```

Start and verify:

```sh
docker compose up -d
docker compose ps
curl -fsS https://$APP_HOST/health/live
curl -fsS https://$APP_HOST/health/ready
curl -fsS https://$APP_HOST/api/v1/destinations?locale=en\&scope=thailand\&limit=1
```

## OAuth and provider checks

- Complete one Google sign-in and one email registration/login in the protected environment.
- Submit one recommendation with an origin. Confirm queued/filtering/routing/ranking/completed events.
- Confirm result IDs exist in `destinations`; unknown provider IDs must fail validation.
- Verify deterministic fallback by temporarily disabling provider keys in a non-production environment.

## Backups and restore tests

Run encrypted off-host backup daily:

```sh
DATABASE_URL="$DATABASE_URL" BACKUP_PASSPHRASE="$BACKUP_PASSPHRASE" ops/backup-postgres.sh
```

Run `ops/restore-check.sh` weekly against an isolated database. Never point `RESTORE_DATABASE_URL` at production. Replicate object storage with bucket versioning and retention enabled.

## Monitoring

- API metrics: `/metrics`; live/readiness: `/health/live`, `/health/ready`.
- Prometheus loads `ops/alerts.yml`; route alerts to Alertmanager in the deployment environment.
- Review structured logs by `requestId`; never log precise GPS, tokens, OAuth codes, or raw AI prompts.
- Alert on API availability, 5xx rate, recommendation backlog, PostgreSQL/Redis/storage health, disk, and backup age.

## Rollback

1. Keep the previous versioned images available.
2. Stop traffic to workers before rolling back schema-sensitive releases.
3. Restore the previous image tags and run `docker compose up -d`.
4. Drizzle migrations are forward-only. For incompatible schema changes, restore the pre-deploy backup to an isolated database, verify it, then switch `DATABASE_URL` during a maintenance window.
5. Re-run live/readiness, catalog, OAuth, trip ownership, and recommendation fallback checks.

## Retention and security operations

- Rotate OAuth, AI, Maps, JWT, internal API, database, Redis, and storage secrets on a schedule or immediately after exposure.
- Purge expired sessions, refresh tokens, AI history, audit logs, and incoming media according to policy.
- Keep ClamAV signatures current. Uploaded objects remain private and `scan=pending` until sanitized derivatives are produced.
- Run dependency/container scans and restore checks before protected-environment promotion.
