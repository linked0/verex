#!/usr/bin/env bash
# PRODUCTION deploy — thin wrapper over deploy.sh pointed at scripts/deploy.env.prod.
# Exists so the prod invocation is short and unmistakable (and as the home for any
# future prod-only guardrails). All logic lives in deploy.sh — never copy it here.
# Runbook: docs/runbooks/prod-deploy.md. After the first successful seed, re-deploys
# need SKIP_SEED=1 (the seed is one-time per backbone; re-seeding reverts).
DEPLOY_ENV=scripts/deploy.env.prod exec "$(dirname "$0")/deploy.sh" "$@"
