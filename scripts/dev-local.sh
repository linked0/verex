#!/usr/bin/env bash
# verex — local dev setup.
# Starts a local Postgres (Docker), pushes the Prisma schema, seeds 10 on-chain
# markets (the seed deploys the CTF backbone via forge — anvil must already be
# running), and writes the local .env files. Then run the two dev servers
# (printed below).
#
# Usage:  anvil &  # or in a separate terminal
#         ./scripts/dev-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || {
  echo "❌ Docker not found. Install Docker Desktop, or point DATABASE_URL at any local Postgres."
  exit 1
}

PG_CONTAINER=verex-pg
PG_PASSWORD=dev
DB_NAME=verex
export DATABASE_URL="postgresql://postgres:${PG_PASSWORD}@localhost:5432/${DB_NAME}"
# DeployCTF.s.sol requires VEREX_OPERATOR_KEY explicitly (no in-contract
# fallback, by design — see docs/analysis/2026-05-08-v1-security-audit.md §2.5).
# Default to anvil's well-known account[0] key here instead — this script is
# local-anvil-only, so it's safe here in a way it wasn't safe living inside the
# Solidity script itself. A real key already in the environment still wins.
export VEREX_OPERATOR_KEY="${VEREX_OPERATOR_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

echo "▶ Postgres ($PG_CONTAINER)"
if [ -z "$(docker ps -aq -f "name=^${PG_CONTAINER}$")" ]; then
  docker run -d --name "$PG_CONTAINER" \
    -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
    -p 5432:5432 postgres:16 >/dev/null
else
  docker start "$PG_CONTAINER" >/dev/null
fi

echo "▶ Waiting for Postgres..."
for _ in $(seq 1 30); do
  docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

echo "▶ Prisma schema + seed"
pnpm --filter @verex/api exec prisma db push
pnpm --filter @verex/api seed

# Write local env files if missing (both are git-ignored).
[ -f packages/api/.env ] || echo "DATABASE_URL=$DATABASE_URL" > packages/api/.env
[ -f packages/web/.env.local ] || echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > packages/web/.env.local

cat <<EOF

✅ Local DB ready (10 markets seeded).

Now run the two dev servers in SEPARATE terminals:

  pnpm --filter @verex/api dev      # API → http://localhost:4000
  pnpm --filter @verex/web dev      # Web → http://localhost:3000

Then open  http://localhost:3000

Stop the DB later:   docker stop $PG_CONTAINER
Reset the DB:        docker rm -f $PG_CONTAINER && ./scripts/dev-local.sh
EOF
