# syntax=docker/dockerfile:1

# ── Builder ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
# Build tools untuk kompilasi native better-sqlite3.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Install semua dependency (butuh devDeps untuk build).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build Next.js (Turbopack). Butuh ~1GB RAM — tambahkan swap di VPS kecil.
COPY . .
RUN mkdir -p /data
RUN pnpm build

# ── Runner ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Dependency production saja (lebih ramping). better-sqlite3 dipasang via prebuild.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Artefak build + aset + folder migrasi + skrip migrate.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs

EXPOSE 3000

# Migrasi (idempotent) lalu start. DATABASE_URL & volume disetel via Coolify.
CMD ["sh", "-c", "node scripts/migrate.mjs && pnpm start"]
