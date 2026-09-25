# syntax=docker/dockerfile:1
# Build context: repository root.  docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci -w @hms/api --include-workspace-root=false

FROM deps AS build
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma && npm run build -w @hms/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=deps /repo/node_modules node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY apps/api/package.json apps/api/
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:4000/api/v1/health/live || exit 1
CMD ["node", "apps/api/dist/src/main.js"]
