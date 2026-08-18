#!/usr/bin/env bash
# Push the FMP key from the Keychain to Supabase function secrets — the ONE
# conduit between the fleet's authoritative secret store and the one copy
# production physically requires (an Edge Function cannot read a Mac's
# Keychain at runtime).
#
# Why this exists (2026-08-18): the fleet credential law (windwardline/ops —
# "Keychain is the secret store"; credentials.tsv is the governed inventory)
# rotated fmp-api-key on 2026-08-17 and the rotation propagated to every
# Keychain-reading consumer with no edit — but the GitHub Actions secret was
# a consumer the inventory did not list, so every deploy overwrote Supabase's
# value with the dead key ("Invalid API KEY", deploy runs 373/374). The
# GitHub copy is gone from deploy.yml entirely; from here on a rotation is:
# rotate in the Keychain, run this script once, done. The deploy-time E2E
# chart gate is what proves the value authenticates.
#
# Run from the studio machine. Reads fmp-api-key and supabase-access-token
# from the Keychain at launch and holds neither (fleet law: snapshotted
# helpers read their credentials at launch, never hold them). The value
# travels via a chmod-600 temp env-file, never argv, so it cannot surface in
# `ps` — the same discipline deploy.yml uses for the secrets it still owns.
set -euo pipefail

REPO="/Users/peacock/Projects/levelflow-cloud"
PROJECT_REF="usrtpoftuvhpmyhlhqlg"
cd "$REPO"

FMP_API_KEY="$(security find-generic-password -a peacock -s fmp-api-key -w 2>/dev/null || true)"
if [ -z "$FMP_API_KEY" ]; then
  echo "$(date -u +%FT%TZ) keychain unavailable (locked or missing fmp-api-key); aborting"
  exit 1
fi
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -a peacock -s supabase-access-token -w 2>/dev/null || true)}"
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "$(date -u +%FT%TZ) keychain unavailable (locked or missing supabase-access-token); aborting"
  exit 1
fi
export SUPABASE_ACCESS_TOKEN

ENV_FILE="$(mktemp)"
chmod 600 "$ENV_FILE"
trap 'rm -f "$ENV_FILE"' EXIT
printf 'FMP_API_KEY=%s\n' "$FMP_API_KEY" > "$ENV_FILE"

npx --yes supabase secrets set --project-ref "$PROJECT_REF" --env-file "$ENV_FILE"
echo "$(date -u +%FT%TZ) FMP_API_KEY synced from Keychain to Supabase function secrets ($PROJECT_REF)"
