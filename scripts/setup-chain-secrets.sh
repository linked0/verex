#!/usr/bin/env bash
# Create/update the three chain secrets for one environment in Secret Manager —
# replaces the three manual `printf '%s' … | gcloud secrets create …` commands
# (runbook: deploy.md §4).
#
# - PROJECT_ID and DB_NAME (the secret-name suffix) come from the environment's
#   deploy env file — the same files deploy.sh uses, so the names can't drift.
# - VEREX_RPC_URL / VEREX_OPERATOR_KEY come from your shell (source
#   packages/contracts/.env.prod first for prod — runbook §1).
# - The demo mnemonic is prompted with HIDDEN input, so it never appears in
#   shell history, scrollback, or `ps` — safer than the manual commands.
#
# Idempotent: existing secrets get a new version (deploy.sh reads :latest),
# missing ones are created. Ends with a round-trip verification that prints
# nothing sensitive.
#
# Usage: ./scripts/setup-chain-secrets.sh staging|prod
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=${1:-}
case "$TARGET" in
  staging) ENV_FILE=scripts/deploy.env ;;
  prod) ENV_FILE=scripts/deploy.env.prod ;;
  test) echo "❌ target 'test' was renamed to 'staging' (2026-07-28) — run: $0 staging"; exit 1 ;;
  *) echo "Usage: $0 staging|prod"; exit 1 ;;
esac
[ -f "$ENV_FILE" ] || { echo "❌ $ENV_FILE missing"; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE" # PROJECT_ID / DB_NAME (also VEREX_CHAIN_ID etc., unused here)
: "${PROJECT_ID:?PROJECT_ID missing in $ENV_FILE}"
: "${DB_NAME:?DB_NAME missing in $ENV_FILE}"
: "${VEREX_RPC_URL:?VEREX_RPC_URL not in your shell — source packages/contracts/.env(.prod) first}"
: "${VEREX_OPERATOR_KEY:?VEREX_OPERATOR_KEY not in your shell — source packages/contracts/.env(.prod) first}"

echo "▶ Target '$TARGET' → project $PROJECT_ID, secrets verex-*-${DB_NAME}"
if command -v cast >/dev/null 2>&1; then
  echo "  operator address: $(cast wallet address "$VEREX_OPERATOR_KEY")   ← confirm this is the $TARGET operator"
fi

MNEMONIC_SECRET="verex-demo-mnemonic-${DB_NAME}"
read -rs -p "Paste the demo mnemonic (input hidden; press Enter alone to keep the existing secret version): " MNEMONIC
echo
if [ -z "$MNEMONIC" ]; then
  gcloud secrets describe "$MNEMONIC_SECRET" --project "$PROJECT_ID" >/dev/null 2>&1 \
    || { echo "❌ empty input, but $MNEMONIC_SECRET doesn't exist yet — paste the mnemonic printed by gen-demo-mnemonic.ts"; exit 1; }
  echo "  (empty input — keeping the existing $MNEMONIC_SECRET version)"
else
  WORDS=$(printf '%s' "$MNEMONIC" | wc -w | tr -d ' ')
  if [ "$WORDS" -ne 12 ] && [ "$WORDS" -ne 24 ]; then
    echo "❌ got $WORDS words — expected a 12- or 24-word mnemonic"; exit 1
  fi
fi

put() { # <name> <value> — create, or add a version if it already exists
  local name=$1 value=$2
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --project "$PROJECT_ID" --data-file=- >/dev/null
    echo "  ✓ $name — new version added"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project "$PROJECT_ID" \
      --replication-policy=automatic --data-file=- >/dev/null
    echo "  ✓ $name — created"
  fi
}
put "verex-rpc-url-${DB_NAME}" "$VEREX_RPC_URL"
put "verex-operator-key-${DB_NAME}" "$VEREX_OPERATOR_KEY"
if [ -n "$MNEMONIC" ]; then put "$MNEMONIC_SECRET" "$MNEMONIC"; fi

echo "▶ Round-trip verification (nothing sensitive is printed)"
check() { # <name> <expected> <label>
  local got
  got=$(gcloud secrets versions access latest --secret="$1" --project "$PROJECT_ID")
  if [ "$got" = "$2" ]; then echo "  ✓ $3 matches"; else echo "  ✗ $3 MISMATCH — stored value differs from your shell's"; exit 1; fi
}
check "verex-rpc-url-${DB_NAME}" "$VEREX_RPC_URL" "rpc url"
check "verex-operator-key-${DB_NAME}" "$VEREX_OPERATOR_KEY" "operator key"
if [ -n "$MNEMONIC" ]; then
  check "$MNEMONIC_SECRET" "$MNEMONIC" "demo mnemonic"
else
  gcloud secrets versions access latest --secret="$MNEMONIC_SECRET" --project "$PROJECT_ID" >/dev/null \
    && echo "  ✓ demo mnemonic (existing version) is accessible" \
    || { echo "  ✗ demo mnemonic exists but is not readable"; exit 1; }
fi
echo "✓ all three '$TARGET' secrets are set and verified"
