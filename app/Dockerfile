FROM node:24-alpine AS base
WORKDIR /repo
ENV CI=true

FROM base AS deps
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY app/package.json app/pnpm-lock.yaml app/.npmrc ./app/
RUN cd /repo/app && pnpm install --frozen-lockfile

FROM base AS build
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY --from=deps /repo/app/node_modules ./app/node_modules
COPY app/package.json app/pnpm-lock.yaml app/.npmrc app/tsconfig.json ./app/
COPY app/src ./app/src
COPY packages/sample-core ./packages/sample-core
RUN cd /repo/app && pnpm build

FROM node:24-alpine AS runtime
WORKDIR /repo/app
ENV NODE_ENV=production
ENV PORT=3000
ENV FAKE_EXTERNAL_PORT=4001

COPY --from=build /repo/app/package.json ./
COPY --from=build /repo/app/node_modules ./node_modules
COPY --from=build /repo/app/dist ./dist

EXPOSE 3000 4001
CMD ["node", "dist/app/src/index.js"]
