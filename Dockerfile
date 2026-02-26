# ---- Stage 1: Install dependencies ----
FROM node:22-slim AS deps

WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scraper/package.json packages/scraper/
COPY packages/analyzer/package.json packages/analyzer/
COPY packages/dashboard/package.json packages/dashboard/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# ---- Stage 2: Build TypeScript and Next.js ----
FROM node:22-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
RUN mkdir -p packages/shared packages/scraper packages/analyzer packages/dashboard
COPY --from=deps /app/packages/ /tmp/deps-packages/
RUN for pkg in shared scraper analyzer dashboard; do \
      if [ -d "/tmp/deps-packages/$pkg/node_modules" ]; then \
        cp -r "/tmp/deps-packages/$pkg/node_modules" "packages/$pkg/node_modules"; \
      fi; \
    done && rm -rf /tmp/deps-packages

# Copy all source code
COPY . .

# Build TypeScript packages (shared, scraper, analyzer)
RUN npx tsc --build tsconfig.build.json

# Build Next.js dashboard (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd packages/dashboard && npx next build

# ---- Stage 3: Production runtime ----
FROM node:22-slim AS runtime

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install production deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scraper/package.json packages/scraper/
COPY packages/analyzer/package.json packages/analyzer/
COPY packages/dashboard/package.json packages/dashboard/

RUN npm ci --omit=dev

# tsx is needed at runtime for pipeline scripts (compiles TS on the fly)
RUN npm install -g tsx

# Copy TypeScript source files (tsx needs them for pipeline scripts)
COPY packages/shared/src packages/shared/src
COPY packages/scraper/src packages/scraper/src
COPY packages/analyzer/src packages/analyzer/src
COPY packages/shared/drizzle packages/shared/drizzle
COPY packages/shared/drizzle.config.ts packages/shared/drizzle.config.ts

# Copy Next.js standalone build (mirrors monorepo structure due to outputFileTracingRoot)
COPY --from=builder /app/packages/dashboard/.next/standalone ./
COPY --from=builder /app/packages/dashboard/.next/static packages/dashboard/.next/static
COPY --from=builder /app/packages/dashboard/public packages/dashboard/public

# Copy pipeline scripts, principles, and config files
COPY scripts scripts
COPY principles principles
COPY tsconfig.base.json tsconfig.build.json ./

# Create directories for logs and reports
RUN mkdir -p logs reports

# Next.js standalone must listen on 0.0.0.0, not localhost
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# Health check for dashboard mode
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/healthz || exit 1

# Entrypoint script to support both dashboard and pipeline modes
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["dashboard"]
