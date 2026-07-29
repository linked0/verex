#!/usr/bin/env bash
# Take the STAGING environment down while unused (~$40-65/mo → ~$1-2/mo).
# Prod (verex-*-prod) is untouched. Reverse: ./scripts/staging-up.sh
#
# What it does:
#   1) verex-api → scale-to-zero (drops the always-on ChainJob-worker instance)
#   2) verex-db  → stopped (activation-policy NEVER; storage is kept)
#
# While down, staging errors on purpose — no half-alive state: a throttled API
# with a live DB would still trade but settle erratically and drain the MM
# books (the 2026-07-29 prod bug).
set -euo pipefail
cd "$(dirname "$0")"
source deploy.env # PROJECT_ID / REGION / SERVICE_API / DB_INSTANCE (staging)
: "${PROJECT_ID:?set PROJECT_ID in scripts/deploy.env}"
REGION=${REGION:-asia-northeast3}
SERVICE_API=${SERVICE_API:-verex-api}
DB_INSTANCE=${DB_INSTANCE:-verex-db}

echo "▶ $SERVICE_API → scale to zero"
gcloud run services update "$SERVICE_API" --project "$PROJECT_ID" --region "$REGION" \
  --min-instances 0 --cpu-throttling
echo "▶ $DB_INSTANCE → stop"
gcloud sql instances patch "$DB_INSTANCE" --project "$PROJECT_ID" --activation-policy NEVER
echo "✅ staging is down (storage/images/secrets kept). Bring it back: ./scripts/staging-up.sh"
