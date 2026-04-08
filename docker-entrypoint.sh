#!/bin/sh
set -e

MODE="$1"
shift 2>/dev/null || true

case "$MODE" in
  dashboard)
    echo "Starting Next.js dashboard on port ${PORT:-3000}..."
    exec node packages/dashboard/server.js
    ;;
  pipeline)
    echo "Starting full pipeline (scrape + analyze + report)..."
    exec tsx scripts/run-pipeline.ts "$@"
    ;;
  pipeline:scrape)
    echo "Starting scrape-only pipeline..."
    exec tsx scripts/run-pipeline.ts --scrape-only "$@"
    ;;
  pipeline:analyze)
    echo "Starting analyze-only pipeline..."
    exec tsx scripts/run-pipeline.ts --analyze-only "$@"
    ;;
  pipeline:quick)
    echo "Starting pipeline without LLM..."
    exec tsx scripts/run-pipeline.ts --skip-llm "$@"
    ;;
  sync)
    echo "Syncing database to Neon..."
    exec tsx scripts/sync-to-neon.ts
    ;;
  migrate)
    echo "Running database migrations..."
    cd packages/shared && exec npx drizzle-kit migrate
    ;;
  "")
    echo "Starting Next.js dashboard on port ${PORT:-3000}..."
    exec node packages/dashboard/server.js
    ;;
  *)
    exec "$MODE" "$@"
    ;;
esac
