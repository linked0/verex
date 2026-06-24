#!/usr/bin/env bash
# verex → GCP Cloud Run deploy. Two services (verex-api + verex-web) + Cloud SQL Postgres.
#
# ⚠️ Reviewed, not yet run end-to-end. Creates BILLABLE resources (Cloud SQL, Cloud Run).
#    Set a GCP budget cap first. Best run WITH jay, and test the *.run.app URL before the domain.
#
# Prereqs:
#   1) gcloud auth login   AND   gcloud auth application-default login   (the proxy uses ADC)
#   2) scripts/deploy.env filled (PROJECT_ID, REGION)
#   3) Docker not needed locally — Cloud Build builds the Dockerfiles in each package.
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
    --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-f1-micro --region="$REGION"
fi
gcloud sql databases create "$DB_NAME" --instance="$DB_INSTANCE" 2>/dev/null || true
CONN_NAME=$(gcloud sql instances describe "$DB_INSTANCE" --format='value(connectionName)')

# --- DB password + DATABASE_URL secret (AUTO-GENERATED; reused on re-runs, never printed) ---
echo "▶ Secret Manager (verex-database-url)"
if gcloud secrets describe verex-database-url >/dev/null 2>&1; then
  echo "  - reusing existing DATABASE_URL secret"
  DATABASE_URL=$(gcloud secrets versions access latest --secret=verex-database-url)
else
  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
  gcloud sql users create "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD" 2>/dev/null \
    || gcloud sql users set-password "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD"
  # Cloud Run reaches Cloud SQL via a unix socket: /cloudsql/<connectionName>
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONN_NAME}"
  printf '%s' "$DATABASE_URL" | gcloud secrets create verex-database-url --replication-policy=automatic --data-file=-
fi
gcloud secrets add-iam-policy-binding verex-database-url \
  --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null

# --- Migrate + seed via the Cloud SQL Auth Proxy (local TCP tunnel on :5433) ---
echo "▶ Migrate + seed (Cloud SQL Auth Proxy)"
PROXY=./cloud-sql-proxy
if [ ! -x "$PROXY" ]; then
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  M=$(uname -m); case "$M" in arm64|aarch64) ARCH=arm64;; *) ARCH=amd64;; esac
  echo "  - downloading cloud-sql-proxy ($OS/$ARCH)"
  curl -sL "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.13.0/cloud-sql-proxy.${OS}.${ARCH}" -o "$PROXY"
  chmod +x "$PROXY"
fi
"$PROXY" --port 5433 "$CONN_NAME" &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT
sleep 5
# Rewrite the socket URL to a local-TCP URL through the proxy (keeps user:pass).
LOCAL_URL=$(printf '%s' "$DATABASE_URL" | sed -E 's#@localhost/([^?]+)\?host=.*#@localhost:5433/\1#')
DATABASE_URL="$LOCAL_URL" pnpm --filter @verex/api exec prisma db push
DATABASE_URL="$LOCAL_URL" pnpm --filter @verex/api seed
kill "$PROXY_PID" 2>/dev/null || true
trap - EXIT

# --- Deploy API (uses packages/api/Dockerfile) ---
echo "▶ Deploy $SERVICE_API"
gcloud run deploy "$SERVICE_API" --source packages/api --region "$REGION" \
  --add-cloudsql-instances "$CONN_NAME" \
  --set-secrets "DATABASE_URL=verex-database-url:latest" \
  --allow-unauthenticated
API_URL=$(gcloud run services describe "$SERVICE_API" --region "$REGION" --format='value(status.url)')

# --- Deploy Web (uses packages/web/Dockerfile; API_URL is a RUNTIME env, no rebuild needed) ---
echo "▶ Deploy $SERVICE_WEB"
gcloud run deploy "$SERVICE_WEB" --source packages/web --region "$REGION" \
  --set-env-vars "API_URL=$API_URL" \
  --allow-unauthenticated
WEB_URL=$(gcloud run services describe "$SERVICE_WEB" --region "$REGION" --format='value(status.url)')

echo
echo "✅ API: $API_URL"
echo "✅ Web: $WEB_URL   ← TEST HERE FIRST (before mapping the domain)"
echo "👉 Go live — map the domain, then add the DNS record GCP prints at your registrar:"
echo "    gcloud beta run domain-mappings create --service $SERVICE_WEB --domain verex.jaylabs.xyz --region $REGION"
