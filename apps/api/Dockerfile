# Build context is the repo root (see docker-compose.yaml) so the engine package is visible.
FROM node:26-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
RUN npm ci -w chronolog-backend -w @chronolog/engine --include-workspace-root=false
COPY packages/engine packages/engine
COPY apps/api apps/api
RUN npm run build -w @chronolog/engine && npm run build -w chronolog-backend

FROM node:26-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev -w apps/api -w @chronolog/engine --include-workspace-root=false
COPY --from=build /repo/packages/engine/dist packages/engine/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/db apps/api/db
WORKDIR /repo/apps/api
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:5000/health || exit 1
CMD ["node", "dist/server.js"]
