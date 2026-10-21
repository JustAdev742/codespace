# syntax=docker/dockerfile:1
# Ludora: one image with the API, the realtime server and the built web app.
# Build:  docker build -t ludora apps/ludora
# Run:    see compose.yaml and docs/DEPLOYMENT.md

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/content/package.json packages/content/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    APP_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    WEB_DIST=../web/dist \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/content/package.json packages/content/
COPY server/package.json server/
COPY web/package.json web/
# Only the server's runtime dependencies; workspace packages are bundled into dist.
RUN npm ci --omit=dev -w @ludora/server --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/drizzle server/drizzle
COPY --from=build /app/web/dist web/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
WORKDIR /app/server
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations and the content seed run on start (the seed only adds missing rows).
CMD ["node", "--enable-source-maps", "dist/index.js"]
