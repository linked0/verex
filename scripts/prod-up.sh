#!/usr/bin/env bash
# Bring PRODUCTION back before a demo — reverse of prod-down.sh. Takes ~2 min.
#   1) verex-db-prod  → start (activation-policy ALWAYS; ~1-2 min)
#   2) verex-api-prod → always-on again (min-instances 1 + no CPU throttling —
#      required for the in-process ChainJob/re-quote worker, see
#      docs/history/2026-07-29-verex-history.md)
#
# Order matters: the database comes up FIRST. An API that is live against a
# stopped database is the same half-alive state prod-down.sh exists to avoid.
set -euo pipefail
cd "$(dirname "$0")"
source deploy.env.prod
: "${PROJECT_ID:?set PROJECT_ID in scripts/deploy.env.prod}"
REGION=${REGION:-asia-northeast3}
SERVICE_API=${SERVICE_API:-verex-api-prod}
SERVICE_WEB=${SERVICE_WEB:-verex-web-prod}
DB_INSTANCE=${DB_INSTANCE:-verex-db-prod}

echo "▶ $DB_INSTANCE → start (~1-2 min)"
gcloud sql instances patch "$DB_INSTANCE" --project "$PROJECT_ID" --activation-policy ALWAYS --quiet

# Wait for the database before letting the API take traffic.
echo "▶ waiting for $DB_INSTANCE to accept connections"
for _ in $(seq 1 60); do
  state=$(gcloud sql instances describe "$DB_INSTANCE" --project "$PROJECT_ID" --format='value(state)')
  [ "$state" = "RUNNABLE" ] && break
  sleep 5
done
[ "${state:-}" = "RUNNABLE" ] || { echo "✗ $DB_INSTANCE is still $state — not starting the API" >&2; exit 1; }

echo "▶ $SERVICE_API → always-on worker"
gcloud run services update "$SERVICE_API" --project "$PROJECT_ID" --region "$REGION" \
  --min-instances 1 --no-cpu-throttling

echo "▶ $SERVICE_WEB → warm"
gcloud run services update "$SERVICE_WEB" --project "$PROJECT_ID" --region "$REGION" \
  --min-instances 1

API_URL=$(gcloud run services describe "$SERVICE_API" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')
echo "✅ production is up — verify: curl $API_URL/health  ·  https://verex.jaylabs.xyz"
