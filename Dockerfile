# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Stage 1: builder — install deps, generate Prisma client, build
# the Next.js standalone bundle.
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first (layer caching).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Generate the Prisma client before build so the tracing step picks it up.
COPY prisma ./prisma
ENV DATABASE_URL="file:/app/db/custom.db"
RUN bunx prisma generate

# Build the app (output: standalone).
COPY . .
ENV NEXT_PUBLIC_APP_URL=""
RUN bun run build

# Assemble the standalone server dir (mirrors the package.json build script).
RUN cp -r .next/static .next/standalone/.next/ && \
    cp -r public .next/standalone/

# Bundle the SQLite database (seeded) + schema into the standalone output so
# the runtime image already contains the data and schema.
RUN mkdir -p .next/standalone/db && \
    cp db/custom.db .next/standalone/db/custom.db && \
    cp -r prisma .next/standalone/prisma

# ─────────────────────────────────────────────────────────────
# Stage 2: runner — slim image with the standalone server + env.
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL="file:/app/db/custom.db"

# Build-time (ARG) → runtime (ENV) env passthrough. Override at build:
#   docker build --build-arg AUTH_SECRET=... .
# or at run:
#   docker run -e AUTH_SECRET=... .
ARG AUTH_SECRET="digitide-taskflow-secret-key-2024-zai"
ENV AUTH_SECRET=$AUTH_SECRET

# Non-root user.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/standalone/.next/static ./.next/static

# Copy the DB + schema explicitly (standalone tracing does not carry them).
COPY --from=builder /app/.next/standalone/db/custom.db ./db/custom.db
COPY --from=builder /app/.next/standalone/prisma ./prisma

# SQLite needs write access to its db file at runtime.
RUN chown -R nextjs:nodejs /app/db

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/api').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["bun", "server.js"]