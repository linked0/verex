#!/usr/bin/env bash
# Bring the STAGING environment back — reverse of staging-down.sh.
#   1) verex-db  → start (activation-policy ALWAYS; takes ~1-2 min)
#   2) verex-api → always-on again (min-instances 1 + no CPU throttling — required
#      for the in-process ChainJob worker; see docs/history/2026-07-29)
set -euo pipefail
cd "$(dirname "$0")"
source deploy.env # PROJECT_ID / REGION / SERVICE_API / DB_INSTANCE (staging)
: "${PROJECT_ID:?set PROJECT_ID in scripts/deploy.env}"
REGION=${REGION:-asia-northeast3}
SERVICE_API=${SERVICE_API:-verex-api}
DB_INSTANCE=${DB_INSTANCE:-verex-db}

echo "▶ $DB_INSTANCE → start (~1-2 min)"
gcloud sql instances patch "$DB_INSTANCE" --project "$PROJECT_ID" --activation-policy ALWAYS
echo "▶ $SERVICE_API → always-on worker"
gcloud run services update "$SERVICE_API" --project "$PROJECT_ID" --region "$REGION" \
  --min-instances 1 --no-cpu-throttling
API_URL=$(gcloud run services describe "$SERVICE_API" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')
echo "✅ staging is up — verify: curl $API_URL/health"
