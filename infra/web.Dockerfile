# 웹앱을 서버에서 직접 빌드해 Caddy 와 함께 담는다 (내 컴퓨터에서 파일을 올릴 필요 없음)
FROM node:22-slim AS build
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /web/dist /srv/web
