FROM oven/bun:1.4.5-alpine AS dependencies
WORKDIR /workspace
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS build
# next build inlines NEXT_PUBLIC_* into the bundle; setting them when the container starts has no effect.
# Without them the site would call http://localhost:4000, so refuse to build instead.
ARG NEXT_PUBLIC_API_ORIGIN
ARG NEXT_PUBLIC_WEB_ORIGIN
RUN test -n "$NEXT_PUBLIC_API_ORIGIN" && test -n "$NEXT_PUBLIC_WEB_ORIGIN" \
  || { echo "Build with --build-arg NEXT_PUBLIC_API_ORIGIN=... and NEXT_PUBLIC_WEB_ORIGIN=... (compose.yaml sets both from APP_HOST)" >&2; exit 1; }
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN \
    NEXT_PUBLIC_WEB_ORIGIN=$NEXT_PUBLIC_WEB_ORIGIN
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/ui packages/ui
RUN bun --cwd apps/web build

FROM oven/bun:1.4.5-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules node_modules
# Next.js writes to .next while it runs (resized images in .next/cache/images, fetch results kept for
# `revalidate`), so the app user must own it; root-owned files there make those writes fail with EACCES.
COPY --from=build --chown=bun:bun /workspace/apps/web apps/web
COPY --from=build /workspace/packages packages
USER bun
EXPOSE 3000
CMD ["bun", "--cwd", "apps/web", "start"]
