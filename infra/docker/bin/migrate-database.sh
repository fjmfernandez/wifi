#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${WIFI_API_PASSWORD:?WIFI_API_PASSWORD is required}"
: "${WIFI_JOBS_PASSWORD:?WIFI_JOBS_PASSWORD is required}"
: "${WIFI_RADIUS_PASSWORD:?WIFI_RADIUS_PASSWORD is required}"

psql "$DATABASE_URL" \
  --no-password \
  --set=ON_ERROR_STOP=1 \
  --file=/workspace/packages/database/scripts/bootstrap-roles.sql

exec pnpm --filter @wifi-entelsat/database migrate:deploy
