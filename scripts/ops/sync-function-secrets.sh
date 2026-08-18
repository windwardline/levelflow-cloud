#!/usr/bin/env bash
# Push levelflow's gate credentials from the Keychain to where production
# reads them — the ONE conduit between the fleet's authoritative secret
# store and the copies production physically requires (an Edge Function
# cannot read a Mac's Keychain at runtime, and neither can pg_cron).
#
# What it converges, idempotently:
#   - FMP_API_KEY            → Supabase function secret (all four functions)
#   - NEWS_SYNC_TOKEN        → Supabase function secret (the gate half)
#   - vault.news_sync_token  → Supabase Vault           (the caller half:
#     pg_cron reads it at call time to authenticate against the gate)
# then proves the token end-to-end with one authenticated news-calendar
# call. Run it after ANY rotation of these Keychain items; whatever the
# current live state (never-propagated, half-propagated, stale), one run
# lands everything rotated, agreeing, and governed.
#
# Why this exists (2026-08-18): the fleet credential law (windwardline/ops —
# "Keychain is the secret store"; credentials.tsv is the governed inventory)
# rotated fmp-api-key and levelflow-newssync-token on 2026-08-17. Rotation
# propagates to Keychain-reading consumers with no edit — but the GitHub
# Actions secrets were consumers the inventory did not list, so every deploy
# overwrote Supabase's FMP value with the dead key ("Invalid API KEY",
# deploy runs 373/374), and the news token's gate/caller copies were left
# behind entirely. CI no longer holds either credential; from here on a
# rotation is: rotate in the Keychain, run this script once, done.
#
# Reads fmp-api-key, levelflow-newssync-token, supabase-access-token and
# supabase-db-levelflow from the Keychain at launch and holds none of them
# (fleet law: helpers read their credentials at launch, never hold them).
# Values travel via chmod-600 temp files, never argv, so they cannot
# surface in `ps`. Nothing here ever prints a secret value.
set -euo pipefail

# Defaults are the studio machine and the production project; both take
# env overrides so docs/deployment.md's generic procedure stays honest
# (fleet round 3: a hardcoded line between two placeholder-convention
# commands would push the key to PRODUCTION regardless of what the
# operator had just linked).
REPO="${REPO:-/Users/peacock/Projects/levelflow-cloud}"
PROJECT_REF="${PROJECT_REF:-usrtpoftuvhpmyhlhqlg}"
cd "$REPO"

keychain_read() {
  security find-generic-password -a peacock -s "$1" -w 2>/dev/null || true
}

# All-or-nothing: every credential is read up front, so a locked Keychain
# aborts before anything is half-converged.
FMP_API_KEY="$(keychain_read fmp-api-key)"
NEWS_SYNC_TOKEN="$(keychain_read levelflow-newssync-token)"
DB_PASSWORD="$(keychain_read supabase-db-levelflow)"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(keychain_read supabase-access-token)}"
for pair in "fmp-api-key:$FMP_API_KEY" \
  "levelflow-newssync-token:$NEWS_SYNC_TOKEN" \
  "supabase-db-levelflow:$DB_PASSWORD" \
  "supabase-access-token:$SUPABASE_ACCESS_TOKEN"; do
  if [ -z "${pair#*:}" ]; then
    echo "$(date -u +%FT%TZ) keychain unavailable (locked or missing ${pair%%:*}); aborting"
    exit 1
  fi
done
export SUPABASE_ACCESS_TOKEN

# Explicit template: portable across BSD/macOS and GNU mktemp — a bare
# mktemp is a usage error on older BSDs, which under `set -e` would abort
# this script mid-outage (fleet review note on #360).
ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/levelflow-fn-secrets.XXXXXXXX")"
SQL_FILE="$(mktemp "${TMPDIR:-/tmp}/levelflow-vault-sync.XXXXXXXX")"
chmod 600 "$ENV_FILE" "$SQL_FILE"
trap 'rm -f "$ENV_FILE" "$SQL_FILE"' EXIT

# 1. The function-secret half: both gate credentials in one push.
{
  printf 'FMP_API_KEY=%s\n' "$FMP_API_KEY"
  printf 'NEWS_SYNC_TOKEN=%s\n' "$NEWS_SYNC_TOKEN"
} > "$ENV_FILE"
npx --yes supabase secrets set --project-ref "$PROJECT_REF" --env-file "$ENV_FILE"
echo "$(date -u +%FT%TZ) FMP_API_KEY + NEWS_SYNC_TOKEN synced to Supabase function secrets ($PROJECT_REF)"

# 2. The Vault half: the cron caller reads vault.news_sync_token at call
# time (migrations 20260603020000 / 20260729030000), so the caller and the
# gate must move together or every hourly sync 401s. Dollar-quoted so no
# token character can escape the literal; via a 600-mode file, never argv.
cat > "$SQL_FILE" <<SQL
do \$\$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'news_sync_token';
  if sid is null then
    perform vault.create_secret(\$lfns\$${NEWS_SYNC_TOKEN}\$lfns\$, 'news_sync_token');
  else
    perform vault.update_secret(sid, \$lfns\$${NEWS_SYNC_TOKEN}\$lfns\$);
  end if;
end \$\$;
SQL

run_psql() {
  PGPASSWORD="$DB_PASSWORD" psql -X -q -v ON_ERROR_STOP=1 \
    -h "$1" -p 5432 -U "$2" -d postgres -f "$SQL_FILE"
}
if run_psql "db.${PROJECT_REF}.supabase.co" "postgres" 2>/dev/null; then
  echo "$(date -u +%FT%TZ) vault.news_sync_token synced (direct connection)"
else
  # Direct host unreachable (IPv6-only networks) — derive the session
  # pooler host from the project's region via the Management API.
  REGION="$(curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/${PROJECT_REF}" |
    sed -E 's/.*"region"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  if [ -z "$REGION" ]; then
    echo "$(date -u +%FT%TZ) could not resolve project region for pooler fallback; aborting"
    exit 1
  fi
  run_psql "aws-0-${REGION}.pooler.supabase.com" "postgres.${PROJECT_REF}"
  echo "$(date -u +%FT%TZ) vault.news_sync_token synced (pooler, ${REGION})"
fi

# 3. Prove it end-to-end: one authenticated news-calendar call must clear
# the gate the token guards (a real ingestion run — harmless, idempotent
# upserts, and the only proof that the gate and the caller agree again).
STATUS="$(curl -s -o /dev/null -w "%{http_code}" --max-time 180 -X POST \
  "https://${PROJECT_REF}.supabase.co/functions/v1/news-calendar" \
  -H "Authorization: Bearer ${NEWS_SYNC_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"source":"sync-function-secrets-verify"}')"
if [ "$STATUS" != "200" ]; then
  echo "$(date -u +%FT%TZ) VERIFY FAILED: news-calendar returned HTTP ${STATUS} to the freshly synced token — investigate before trusting the sync"
  exit 1
fi
echo "$(date -u +%FT%TZ) verified: news-calendar accepted the synced token (HTTP 200)"
