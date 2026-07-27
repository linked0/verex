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

# Env file is selectable so one script serves both environments (Task 5 isolation):
#   test (default):  ./scripts/deploy.sh                          → scripts/deploy.env
#   production:      DEPLOY_ENV=scripts/deploy.env.prod ./scripts/deploy.sh
ENV_FILE=${DEPLOY_ENV:-scripts/deploy.env}
[ -f "$ENV_FILE" ] || { echo "❌ $ENV_FILE missing — copy scripts/deploy.env.example"; exit 1; }
source "$ENV_FILE" # PROJECT_ID / REGION / SERVICE_WEB / SERVICE_API
: "${PROJECT_ID:?set PROJECT_ID in scripts/deploy.env}"
REGION=${REGION:-asia-northeast3}
SERVICE_WEB=${SERVICE_WEB:-verex-web}
SERVICE_API=${SERVICE_API:-verex-api}
DB_INSTANCE=${DB_INSTANCE:-verex-db}
DB_NAME=${DB_NAME:-verex}
DB_USER=${DB_USER:-verex}
DOMAIN=${DOMAIN:-}                       # e.g. staging.verex.jaylabs.xyz (setup-dns.sh hint)
SKIP_SEED=${SKIP_SEED:-}                 # set to skip seed.ts entirely (schema migration
                                          # still runs) — for a backbone that's already
                                          # been prepared/seeded elsewhere (re-running
                                          # seed.ts's on-chain calls against an
                                          # already-prepared backbone reverts, it isn't
                                          # idempotent); populate the DB by other means
                                          # first (e.g. a dump/restore from another seeded
                                          # DB) before deploying with this set
VEREX_CHAIN_ID=${VEREX_CHAIN_ID:-}       # unset = today's DB-only/trading-disabled deploy;
                                          # 11155111 = Ethereum Sepolia, 84532 = Base
                                          # Sepolia — requires the 3 secrets below
DEPLOY_TARGET=${DEPLOY_TARGET:-}         # test|prod — which committed backbone entry in
                                          # packages/contracts/deployments.json seed.ts
                                          # uses; required whenever VEREX_CHAIN_ID is set
SECRET_NAME="verex-database-url-${DB_NAME}" # per-DB secret so staging/prod don't collide
AR_REPO=${AR_REPO:-verex}
API_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/api:${DB_NAME}"

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
echo "▶ Secret Manager ($SECRET_NAME)"
if gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
  echo "  - reusing existing DATABASE_URL secret"
  DATABASE_URL=$(gcloud secrets versions access latest --secret="$SECRET_NAME")
else
  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
  gcloud sql users create "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD" 2>/dev/null \
    || gcloud sql users set-password "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD"
  # Cloud Run reaches Cloud SQL via a unix socket: /cloudsql/<connectionName>
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${CONN_NAME}"
  printf '%s' "$DATABASE_URL" | gcloud secrets create "$SECRET_NAME" --replication-policy=automatic --data-file=-
fi
gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null

# --- Chain secrets (only when VEREX_CHAIN_ID is set — leaves DB-only deploys untouched) ---
# These three must already exist in Secret Manager before running this script — see
# docs/runbooks/deploy.md for exact creation commands (RPC URL and operator
# key are yours to provide; the demo mnemonic must be a FRESH one you generate, never
# anvil's public default). This script only reads them, it never creates or prints them.
SEED_CHAIN_ENV=()
API_CHAIN_SECRETS=""
if [ -n "$VEREX_CHAIN_ID" ]; then
  case "$DEPLOY_TARGET" in
    test|prod) ;;
    *) echo "❌ DEPLOY_TARGET must be 'test' or 'prod' in $ENV_FILE (picks the deployments.json backbone)"; exit 1;;
  esac
  echo "▶ Chain secrets (chain id $VEREX_CHAIN_ID)"
  RPC_SECRET="verex-rpc-url-${DB_NAME}"
  OPERATOR_SECRET="verex-operator-key-${DB_NAME}"
  MNEMONIC_SECRET="verex-demo-mnemonic-${DB_NAME}"
  for s in "$RPC_SECRET" "$OPERATOR_SECRET" "$MNEMONIC_SECRET"; do
    gcloud secrets describe "$s" >/dev/null 2>&1 \
      || { echo "❌ $s missing — see docs/runbooks/deploy.md, then re-run"; exit 1; }
    gcloud secrets add-iam-policy-binding "$s" \
      --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null
  done
  SEED_CHAIN_ENV=(
    "VEREX_DEPLOY_TARGET=$DEPLOY_TARGET"
    "VEREX_RPC_URL=$(gcloud secrets versions access latest --secret="$RPC_SECRET")"
    "VEREX_CHAIN_ID=$VEREX_CHAIN_ID"
    "VEREX_OPERATOR_KEY=$(gcloud secrets versions access latest --secret="$OPERATOR_SECRET")"
    "VEREX_DEMO_MNEMONIC=$(gcloud secrets versions access latest --secret="$MNEMONIC_SECRET")"
  )
  API_CHAIN_SECRETS=",VEREX_RPC_URL=${RPC_SECRET}:latest,VEREX_OPERATOR_KEY=${OPERATOR_SECRET}:latest,VEREX_DEMO_MNEMONIC=${MNEMONIC_SECRET}:latest"
fi

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
DATABASE_URL="$LOCAL_URL" pnpm --filter @verex/api exec prisma migrate deploy
if [ -n "$SKIP_SEED" ]; then
  echo "  - SKIP_SEED set — leaving DB rows as-is (expects them already populated, e.g. via a prior dump/restore)"
elif [ -n "$VEREX_CHAIN_ID" ]; then
  # Operator must already hold gas on this chain before this runs — it
  # self-mints/approves as its first on-chain actions. Real deploy: ~32
  # sequential operator-signed transactions, budget several minutes.
  echo "  - seeding against chain id $VEREX_CHAIN_ID (real deploy, can take a few minutes)"
  DATABASE_URL="$LOCAL_URL" env "${SEED_CHAIN_ENV[@]+"${SEED_CHAIN_ENV[@]}"}" pnpm --filter @verex/api exec tsx prisma/seed.ts
else
  # No VEREX_CHAIN_ID set — markets browse fine; trades return "trading is
  # disabled in this environment".
  DATABASE_URL="$LOCAL_URL" SEED_DB_ONLY=1 pnpm --filter @verex/api exec tsx prisma/seed.ts
fi
kill "$PROXY_PID" 2>/dev/null || true
trap - EXIT

# --- Deploy API ---
# The API now depends on the workspace package @verex/sdk, so the image is
# built from the REPO ROOT context (packages/api/Dockerfile.cloud via
# cloudbuild-api.yaml) — `--source packages/api` can't resolve workspace:*.
echo "▶ Build API image (repo-root workspace build)"
gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$AR_REPO" --location="$REGION" --repository-format=docker
pnpm --filter @verex/sdk sync-abis   # generated abis must exist in the build context
gcloud builds submit --config cloudbuild-api.yaml --substitutions "_IMAGE=$API_IMAGE" .

echo "▶ Deploy $SERVICE_API"
API_ENV_ARGS=()
[ -n "$VEREX_CHAIN_ID" ] && API_ENV_ARGS=(--set-env-vars "VEREX_CHAIN_ID=$VEREX_CHAIN_ID")
gcloud run deploy "$SERVICE_API" --image "$API_IMAGE" --region "$REGION" \
  --add-cloudsql-instances "$CONN_NAME" \
  --set-secrets "DATABASE_URL=${SECRET_NAME}:latest${API_CHAIN_SECRETS}" \
  "${API_ENV_ARGS[@]+"${API_ENV_ARGS[@]}"}" \
  --allow-unauthenticated
API_URL=$(gcloud run services describe "$SERVICE_API" --region "$REGION" --format='value(status.url)')

# --- Deploy Web (uses packages/web/Dockerfile; API_URL is a RUNTIME env, no rebuild needed) ---
echo "▶ Deploy $SERVICE_WEB"
gcloud run deploy "$SERVICE_WEB" --source packages/web --region "$REGION" \
  --set-env-vars "API_URL=$API_URL" \
  --allow-unauthenticated
WEB_URL=$(gcloud run services describe "$SERVICE_WEB" --region "$REGION" --format='value(status.url)')

echo
echo "✅ API: $API_URL   (health: curl $API_URL/health)"
echo "✅ Web: $WEB_URL   ← TEST HERE FIRST (before mapping the domain)"
echo "ℹ️  Environment stack (isolated per env — data may LOOK identical, both seed the"
echo "    same markets): Cloud SQL $DB_INSTANCE / DB $DB_NAME / secrets verex-*-${DB_NAME}"
if [ -n "$VEREX_CHAIN_ID" ]; then
  echo "✅ Trading is live against chain id $VEREX_CHAIN_ID."
else
  echo "⚠️  Trading is disabled in the cloud — set VEREX_CHAIN_ID in scripts/deploy.env to go live."
fi
if [ -n "$DOMAIN" ]; then
  echo "👉 Go live — domain mapping + Cloud DNS record in one step:"
  echo "    ./scripts/setup-dns.sh $PROJECT_ID $REGION $SERVICE_WEB $DOMAIN"
fi
