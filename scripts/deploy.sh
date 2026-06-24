#!/usr/bin/env bash
# verex → GCP Cloud Run deploy. Two services (verex-api + verex-web) backed by Cloud SQL Postgres.
# Modeled on rabbit/scripts/deploy.sh.
#
# ⚠️ DRAFT — review before running, and run it WITH jay (not unattended):
#    - it creates BILLABLE resources (Cloud SQL, Cloud Run),
#    - the migrate/seed steps need live DB connectivity (Cloud SQL Auth Proxy),
#    - the domain mapping + DNS record at the registrar are manual.
#
# Prereqs:
#   1) gcloud auth login   (this is what authenticates the deploy — NOT AUTH_GOOGLE_*)
#   2) scripts/deploy.env filled (PROJECT_ID, REGION, SERVICE_WEB, SERVICE_API)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f scripts/deploy.env ] || { echo "❌ scripts/deploy.env missing — copy scripts/deploy.env.example"; exit 1; }
source scripts/deploy.env # PROJECT_ID / REGION / SERVICE_WEB / SERVICE_API
: "${PROJECT_ID:?set PROJECT_ID in scripts/deploy.env}"
REGION=${REGION:-asia-northeast3}
SERVICE_WEB=${SERVICE_WEB:-verex-web}
SERVICE_API=${SERVICE_API:-verex-api}
DB_INSTANCE=${DB_INSTANCE:-verex-db}
DB_NAME=${DB_NAME:-verex}
DB_USER=${DB_USER:-verex}

echo "▶ Project / APIs ($PROJECT_ID)"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com sqladmin.googleapis.com

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# --- Cloud SQL (Postgres), smallest tier ---
echo "▶ Cloud SQL ($DB_INSTANCE)"
if ! gcloud sql instances describe "$DB_INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$DB_INSTANCE" \
    --database-version=POSTGRES_16 --tier=db-f1-micro --region="$REGION"
fi
gcloud sql databases create "$DB_NAME" --instance="$DB_INSTANCE" 2>/dev/null || true
CONN_NAME=$(gcloud sql instances describe "$DB_INSTANCE" --format='value(connectionName)')

# ⚠️ DB user + password (REVIEW): set a password once and create the user.
#   DB_PASSWORD must be provided in your shell (export DB_PASSWORD=...) or generated here.
: "${DB_PASSWORD:?export DB_PASSWORD before running (or add a generator here)}"
gcloud sql users create "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD" 2>/dev/null \
  || gcloud sql users set-password "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD"

# Cloud Run reaches Cloud SQL over a unix socket: /cloudsql/<CONN_NAME>
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONN_NAME}"

# --- Secret Manager: DATABASE_URL ---
echo "▶ Secret Manager"
if gcloud secrets describe verex-database-url >/dev/null 2>&1; then
  printf '%s' "$DATABASE_URL" | gcloud secrets versions add verex-database-url --data-file=- >/dev/null
else
  printf '%s' "$DATABASE_URL" | gcloud secrets create verex-database-url --replication-policy=automatic --data-file=- >/dev/null
fi
gcloud secrets add-iam-policy-binding verex-database-url \
  --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null

# --- Migrate + seed (REVIEW — needs DB connectivity, e.g. Cloud SQL Auth Proxy) ---
# With the proxy running and DATABASE_URL pointing at it:
#   pnpm --filter @verex/api migrate   # prisma migrate deploy
#   pnpm --filter @verex/api seed       # 10 sample markets
echo "⏸  Run migrations + seed against Cloud SQL (see comments) before/after first deploy."

# --- Deploy API ---
echo "▶ Deploy $SERVICE_API"
gcloud run deploy "$SERVICE_API" --source packages/api --region "$REGION" \
  --add-cloudsql-instances "$CONN_NAME" \
  --set-secrets "DATABASE_URL=verex-database-url:latest" \
  --allow-unauthenticated
API_URL=$(gcloud run services describe "$SERVICE_API" --region "$REGION" --format='value(status.url)')

# --- Deploy Web (points at the API) ---
echo "▶ Deploy $SERVICE_WEB"
gcloud run deploy "$SERVICE_WEB" --source packages/web --region "$REGION" \
  --set-env-vars "NEXT_PUBLIC_API_URL=$API_URL" \
  --allow-unauthenticated
WEB_URL=$(gcloud run services describe "$SERVICE_WEB" --region "$REGION" --format='value(status.url)')

echo
echo "✅ API: $API_URL"
echo "✅ Web: $WEB_URL"
echo "👉 Map the domain (then add the DNS record GCP prints at your registrar):"
echo "    gcloud beta run domain-mappings create --service $SERVICE_WEB --domain verex.jaylabs.xyz --region $REGION"
