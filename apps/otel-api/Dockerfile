FROM node:24-alpine AS base
WORKDIR /repo
ENV CI=true

FROM base AS build
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter newrelic-apm-pattern-sample-otel-api build

FROM node:24-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
ENV FAKE_EXTERNAL_PORT=4001

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/otel-api ./apps/otel-api
COPY --from=build /repo/packages/sample-core ./packages/sample-core

EXPOSE 3000 4001
CMD ["node", "-r", "newrelic", "apps/otel-api/dist/apps/otel-api/src/index.js"]
