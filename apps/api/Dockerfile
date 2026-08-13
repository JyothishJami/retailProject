# Multi-stage build: the runtime image carries only production dependencies and
# compiled JavaScript, and runs as a non-root user.
FROM node:20.18.1-alpine AS base
ARG PNPM_VERSION=9.15.4
# Installed with npm rather than corepack: the corepack bundled with this Node
# release cannot verify current npm registry signing keys.
RUN npm i -g pnpm@${PNPM_VERSION}
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @quickpick/shared build && pnpm --filter @quickpick/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
