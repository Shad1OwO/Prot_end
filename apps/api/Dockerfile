FROM oven/bun:1.4.5-alpine AS build
WORKDIR /workspace
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages packages
RUN bun install --frozen-lockfile
COPY apps/api apps/api
RUN bun --cwd apps/api build

FROM oven/bun:1.4.5-alpine
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY --from=build /workspace/node_modules node_modules
COPY --from=build /workspace/packages packages
USER bun
EXPOSE 4520
CMD ["bun", "apps/api/dist/index.js"]
