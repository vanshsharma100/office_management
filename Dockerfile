# ─── Build the frontend ─────────────────────────────────────────────────────
FROM node:22-alpine AS web-build
WORKDIR /app

COPY package*.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --ignore-scripts || npm install --ignore-scripts

COPY web ./web
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w web

# ─── Runtime: API serves the API and the built frontend ─────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl curl

COPY package*.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
# Must land before install: the root postinstall runs this, and npm resolves it
# relative to /app. Without it the install fails on a missing module.
COPY scripts ./scripts
# Same reason, one step further on: that postinstall ends in `prisma generate
# --schema server/prisma/schema.prisma`, so the schema has to be here too. The
# rest of server/ can wait — keeping it out until after install is what lets a
# code change reuse the cached dependency layer.
COPY server/prisma ./server/prisma
RUN npm install --omit=dev --workspace server --include-workspace-root

COPY server ./server
COPY --from=web-build /app/web/dist ./web/dist

RUN npx prisma generate --schema server/prisma/schema.prisma

RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://localhost:4000/api/health || exit 1

# db push keeps a fresh volume in sync; seed only runs when the DB is empty.
CMD sh -c "npx prisma db push --schema server/prisma/schema.prisma --skip-generate --accept-data-loss && node server/prisma/seed.js && node server/src/index.js"
