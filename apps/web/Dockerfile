FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /workspace
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/ui packages/ui
RUN bun --cwd apps/web build

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules node_modules
COPY --from=build /workspace/apps/web apps/web
COPY --from=build /workspace/packages packages
USER bun
EXPOSE 3000
CMD ["bun", "--cwd", "apps/web", "start"]
