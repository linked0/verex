#!/usr/bin/env bash
# One-time setup for keyless GitHub Actions -> GCP deploys (plan gate G2).
#
# Workload Identity Federation lets a GitHub Actions run exchange the short-lived
# OIDC token GitHub already gives it for a GCP access token. No service-account
# JSON key is ever created, downloaded, or stored in repo secrets — which is the
# whole point: a leaked key is permanent, a leaked OIDC token expires in minutes.
#
# The security hinge is ATTRIBUTE_CONDITION below. Without it, *any* GitHub
# repository on the planet could present a valid GitHub OIDC token and
# impersonate this service account. It is not optional.
#
# Idempotent — safe to re-run; every step skips work that already exists.
#
# Usage:
#   ./scripts/setup-wif.sh            # apply
#   DRY_RUN=1 ./scripts/setup-wif.sh  # print the commands without running them
set -euo pipefail

cd "$(dirname "$0")/.."

# Reuse the deploy config so the project/region can't drift from deploy.sh.
if [[ -f scripts/deploy.env ]]; then
  # shellcheck disable=SC1091
  source scripts/deploy.env
fi

PROJECT_ID="${PROJECT_ID:?PROJECT_ID missing — set it in scripts/deploy.env}"
GITHUB_REPO="${GITHUB_REPO:-linked0/verex}"   # owner/repo allowed to deploy
POOL_ID="${POOL_ID:-github}"
PROVIDER_ID="${PROVIDER_ID:-github-oidc}"
SA_NAME="${SA_NAME:-github-deployer}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Roles the CD workflow actually needs to build an image and roll out Cloud Run.
# Deliberately narrow: no project owner/editor anywhere.
ROLES=(
  roles/run.admin                     # deploy + update Cloud Run services
  roles/iam.serviceAccountUser        # act as the runtime service account
  roles/artifactregistry.writer       # push container images
  roles/cloudbuild.builds.editor      # submit builds
  roles/storage.admin                 # Cloud Build staging bucket
  roles/cloudsql.client               # run migrations through the proxy
  roles/secretmanager.secretAccessor  # read deploy-time secrets
)

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '  [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# IAM is eventually consistent: a service account can be created successfully and
# still be invisible to the policy API for several seconds, which fails the role
# bindings below with "Service account ... does not exist". Retry rather than
# sleeping a fixed guess.
retry() {
  local attempts="$1"; shift
  local i
  for ((i = 1; i <= attempts; i++)); do
    if "$@"; then return 0; fi
    if ((i < attempts)); then
      echo "    retry $i/$attempts (IAM still propagating)…" >&2
      sleep 5
    fi
  done
  return 1
}

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
say "Project $PROJECT_ID (number $PROJECT_NUMBER), repo $GITHUB_REPO"

say "1/6 · Enabling required APIs"
run gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project "$PROJECT_ID"

say "2/6 · Workload identity pool '$POOL_ID'"
if gcloud iam workload-identity-pools describe "$POOL_ID" \
     --location=global --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "  already exists — skipping"
else
  run gcloud iam workload-identity-pools create "$POOL_ID" \
    --location=global --project "$PROJECT_ID" \
    --display-name="GitHub Actions"
fi

say "3/6 · OIDC provider '$PROVIDER_ID' (restricted to $GITHUB_REPO)"
# Only tokens whose `repository` claim matches are allowed to exchange at all.
ATTRIBUTE_CONDITION="assertion.repository == '${GITHUB_REPO}'"
if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
     --workload-identity-pool="$POOL_ID" --location=global \
     --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "  already exists — updating the attribute condition in place"
  run gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --workload-identity-pool="$POOL_ID" --location=global --project "$PROJECT_ID" \
    --attribute-condition="$ATTRIBUTE_CONDITION"
else
  run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --workload-identity-pool="$POOL_ID" --location=global --project "$PROJECT_ID" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="$ATTRIBUTE_CONDITION"
fi

say "4/6 · Service account $SA_EMAIL"
if gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "  already exists — skipping"
else
  run gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID" \
    --display-name="GitHub Actions deployer"
  if [[ "${DRY_RUN:-0}" != "1" ]]; then
    echo "  waiting for IAM to see it…"
    retry 12 gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1 \
      || { echo "service account never became visible" >&2; exit 1; }
  fi
fi

say "5/6 · Granting deploy roles"
for role in "${ROLES[@]}"; do
  echo "  + $role"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '  [dry-run] add-iam-policy-binding %s\n' "$role"
  else
    retry 6 gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${SA_EMAIL}" --role="$role" \
      --condition=None --quiet >/dev/null
  fi
done

say "6/6 · Letting $GITHUB_REPO impersonate the service account"
POOL_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  printf '  [dry-run] add-iam-policy-binding workloadIdentityUser\n'
else
  retry 6 gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
    --project "$PROJECT_ID" \
    --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/${POOL_RESOURCE}/attribute.repository/${GITHUB_REPO}" \
    --quiet >/dev/null
fi

cat <<EOF

Done. Add these two values to the GitHub repo (Settings > Secrets and variables >
Actions > Variables — they are identifiers, not secrets):

  WIF_PROVIDER = ${POOL_RESOURCE}/providers/${PROVIDER_ID}
  WIF_SERVICE_ACCOUNT = ${SA_EMAIL}

Verify from a workflow with google-github-actions/auth@v2, or locally with:

  gcloud iam workload-identity-pools providers describe ${PROVIDER_ID} \\
    --workload-identity-pool=${POOL_ID} --location=global --project ${PROJECT_ID}

EOF
