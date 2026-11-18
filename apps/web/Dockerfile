# Build context is the repo root (see docker-compose.yaml) so the npm workspace lockfile is visible.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci -w chronolog-web --include-workspace-root=false
COPY apps/web apps/web
ARG VITE_API_URL
ARG VITE_WS_URL
WORKDIR /repo/apps/web
RUN npm run build

FROM nginx:alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
