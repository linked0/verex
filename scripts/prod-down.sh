#!/usr/bin/env bash
# Park PRODUCTION between demos (~$60/mo → ~$2/mo). Reverse: ./scripts/prod-up.sh
#
# Jayverse is a demo estate — nothing here serves real users, so production only
# needs to be up while someone is being shown it. See
# alice/docs/features/cloud-ops.md decisions 0 and 2.
#
# What it does:
#   1) verex-api-prod → scale-to-zero + CPU throttling restored
#   2) verex-db-prod  → stopped (activation-policy NEVER; storage is kept)
#
# Deliberately ALL-OR-NOTHING, for the same reason staging-down.sh is: a
# throttled API with a live DB still accepts trades, but the in-process re-quote
# worker is frozen between requests, so the MM books drain against stale quotes.
# That is the 2026-07-29 prod incident exactly, and it fails silently — the site
# looks healthy until the books are empty. Never run step 1 without step 2.
#
# Nothing is deleted: data, images, secrets, domain mappings and config all stay.
set -euo pipefail
cd "$(dirname "$0")"
source deploy.env.prod # PROJECT_ID / REGION / SERVICE_API / DB_INSTANCE (prod)
: "${PROJECT_ID:?set PROJECT_ID in scripts/deploy.env.prod}"
REGION=${REGION:-asia-northeast3}
SERVICE_API=${SERVICE_API:-verex-api-prod}
SERVICE_WEB=${SERVICE_WEB:-verex-web-prod}
DB_INSTANCE=${DB_INSTANCE:-verex-db-prod}

cat <<WARN

  This takes PRODUCTION down: https://verex.jaylabs.xyz will error until
  ./scripts/prod-up.sh is run (~2 min). Staging is untouched.

    api  $SERVICE_API   → min-instances 0, CPU throttling on
    web  $SERVICE_WEB   → min-instances 0
    db   $DB_INSTANCE   → stopped

WARN
read -r -p "Park production? [y/N] " reply
[ "$reply" = "y" ] || [ "$reply" = "Y" ] || { echo "aborted — nothing changed"; exit 1; }

echo "▶ $SERVICE_API → scale to zero, CPU throttled"
gcloud run services update "$SERVICE_API" --project "$PROJECT_ID" --region "$REGION" \
  --min-instances 0 --cpu-throttling

echo "▶ $SERVICE_WEB → scale to zero"
gcloud run services update "$SERVICE_WEB" --project "$PROJECT_ID" --region "$REGION" \
  --min-instances 0 --cpu-throttling

# The database goes down in the same run, never as a separate decision.
echo "▶ $DB_INSTANCE → stop"
gcloud sql instances patch "$DB_INSTANCE" --project "$PROJECT_ID" --activation-policy NEVER --quiet

echo "✅ production is parked (data, images, secrets, domains kept). Bring it back: ./scripts/prod-up.sh"
