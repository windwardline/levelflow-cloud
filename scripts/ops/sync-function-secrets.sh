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
# then proves the token clears the gate with one authenticated
# news-calendar call. Run it after ANY rotation of these Keychain items;
# whatever the current live state (never-propagated, half-propagated,
# stale), one run lands everything rotated, agreeing, and governed.
#
# ORDER IS LOAD-BEARING (#361 review, finding 1): every fallible
# dependency — credentials, psql, a working database endpoint — is proven
# BEFORE the first write, because a run that rotates the gate half and
# then dies on the Vault half would CAUSE the split-token 401s this
# script exists to prevent. After the preflight, the remaining failure
# window is a transient between two writes seconds apart, and the verify
# step at the end would catch exactly that.
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
# (fleet round 3 on #360: a hardcoded line between two
# placeholder-convention commands would push to PRODUCTION regardless of
# what the operator had just linked).
REPO="${REPO:-/Users/peacock/Projects/levelflow-cloud}"
PROJECT_REF="${PROJECT_REF:-usrtpoftuvhpmyhlhqlg}"
cd "$REPO"

log() { echo "$(date -u +%FT%TZ) $*"; }

keychain_read() {
  security find-generic-password -a peacock -s "$1" -w 2>/dev/null || true
}

# ---- Preflight 1: every credential, before anything else -------------------
FMP_API_KEY="$(keychain_read fmp-api-key)"
NEWS_SYNC_TOKEN="$(keychain_read levelflow-newssync-token)"
DB_PASSWORD="$(keychain_read supabase-db-levelflow)"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(keychain_read supabase-access-token)}"
for pair in "fmp-api-key:$FMP_API_KEY" \
  "levelflow-newssync-token:$NEWS_SYNC_TOKEN" \
  "supabase-db-levelflow:$DB_PASSWORD" \
  "supabase-access-token:$SUPABASE_ACCESS_TOKEN"; do
  if [ -z "${pair#*:}" ]; then
    log "keychain unavailable (locked or missing ${pair%%:*}); aborting — nothing written"
    exit 1
  fi
done
export SUPABASE_ACCESS_TOKEN

# ---- Preflight 2: tooling and a WORKING database endpoint ------------------
if ! command -v psql >/dev/null 2>&1; then
  log "psql not installed; aborting — nothing written (brew install libpq, or postgresql)"
  exit 1
fi

run_psql() { # host user file
  PGPASSWORD="$DB_PASSWORD" PGCONNECT_TIMEOUT=10 psql -X -q -v ON_ERROR_STOP=1 \
    -h "$1" -p 5432 -U "$2" -d postgres -f "$3"
}

# Explicit template: portable across BSD/macOS and GNU mktemp — a bare
# mktemp is a usage error on older BSDs, which under `set -e` would abort
# this script mid-remediation (fleet review note on #360).
ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/levelflow-fn-secrets.XXXXXXXX")"
SQL_FILE="$(mktemp "${TMPDIR:-/tmp}/levelflow-vault-sync.XXXXXXXX")"
PROBE_FILE="$(mktemp "${TMPDIR:-/tmp}/levelflow-db-probe.XXXXXXXX")"
PROBE_ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/levelflow-db-probe-err.XXXXXXXX")"
MGMT_AUTH_FILE="$(mktemp "${TMPDIR:-/tmp}/levelflow-mgmt-auth.XXXXXXXX")"
VERIFY_AUTH_FILE="$(mktemp "${TMPDIR:-/tmp}/levelflow-verify-auth.XXXXXXXX")"
chmod 600 "$ENV_FILE" "$SQL_FILE" "$PROBE_FILE" "$PROBE_ERR_FILE" \
  "$MGMT_AUTH_FILE" "$VERIFY_AUTH_FILE"
trap 'rm -f "$ENV_FILE" "$SQL_FILE" "$PROBE_FILE" "$PROBE_ERR_FILE" "$MGMT_AUTH_FILE" "$VERIFY_AUTH_FILE"' EXIT
echo "select 1;" > "$PROBE_FILE"
: > "$PROBE_ERR_FILE"
# The bearers travel by 600-mode header files read with `curl -H @file`
# (#361 round 2, finding 1): the preamble's never-argv claim now holds
# for every network call this script makes — bash printf is a builtin,
# so no value ever appears on any process's argv.
printf 'Authorization: Bearer %s\n' "$SUPABASE_ACCESS_TOKEN" > "$MGMT_AUTH_FILE"
printf 'Authorization: Bearer %s\n' "$NEWS_SYNC_TOKEN" > "$VERIFY_AUTH_FILE"

# Candidate endpoints: the direct host, then the session poolers. The
# pooler prefix is provisioning-generation-dependent (aws-0 vs aws-1 —
# #361 review, finding 6), so both are tried; the region comes from the
# Management API, captured pipefail-safe so a curl failure reaches the
# guard instead of aborting silently (#361 review, finding 2).
DB_HOST=""
DB_USER=""
# Every attempt APPENDS its stderr under a host/user marker (#363 round
# 1, finding 3): truncating per attempt left only the LAST failure on
# screen — and the last probe is aws-1, which often fails with NXDOMAIN
# because the generation prefix may not exist, burying an earlier
# "password authentication failed" under a DNS error.
printf -- '--- db.%s.supabase.co as postgres ---\n' "$PROJECT_REF" >> "$PROBE_ERR_FILE"
if run_psql "db.${PROJECT_REF}.supabase.co" "postgres" "$PROBE_FILE" \
  >/dev/null 2>>"$PROBE_ERR_FILE"; then
  DB_HOST="db.${PROJECT_REF}.supabase.co"
  DB_USER="postgres"
else
  PROJECT_JSON="$(curl -fsS --max-time 30 \
    -H @"$MGMT_AUTH_FILE" \
    "https://api.supabase.com/v1/projects/${PROJECT_REF}" || true)"
  REGION="$(printf '%s' "$PROJECT_JSON" |
    sed -E 's/.*"region"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
  if [ -n "$REGION" ] && [ "$REGION" != "$PROJECT_JSON" ]; then
    for prefix in aws-0 aws-1; do
      printf -- '--- %s-%s.pooler.supabase.com as postgres.%s ---\n' \
        "$prefix" "$REGION" "$PROJECT_REF" >> "$PROBE_ERR_FILE"
      if run_psql "${prefix}-${REGION}.pooler.supabase.com" \
        "postgres.${PROJECT_REF}" "$PROBE_FILE" \
        >/dev/null 2>>"$PROBE_ERR_FILE"; then
        DB_HOST="${prefix}-${REGION}.pooler.supabase.com"
        DB_USER="postgres.${PROJECT_REF}"
        break
      fi
    done
  fi
fi
if [ -z "$DB_HOST" ]; then
  log "no reachable database endpoint (direct and pooler both failed); aborting — nothing written"
  # #361 round 2, finding 3: EVERY failed attempt's psql stderr,
  # verbatim under its host/user marker — "password authentication
  # failed" means the supabase-db-levelflow Keychain item is stale
  # (this script's own subject), not the network. psql stderr names
  # host and user, never the password.
  log "failed attempts' psql stderr:"
  sed 's/^/  /' "$PROBE_ERR_FILE" || true
  exit 1
fi
log "preflight ok (database via ${DB_HOST})"

# ---- Write 1: the function-secret half (both gate credentials) -------------
{
  printf 'FMP_API_KEY=%s\n' "$FMP_API_KEY"
  printf 'NEWS_SYNC_TOKEN=%s\n' "$NEWS_SYNC_TOKEN"
} > "$ENV_FILE"
npx --yes supabase secrets set --project-ref "$PROJECT_REF" --env-file "$ENV_FILE"
log "FMP_API_KEY + NEWS_SYNC_TOKEN synced to Supabase function secrets ($PROJECT_REF)"

# ---- Write 2: the Vault half (the caller pg_cron reads) --------------------
# Dollar-quoted so no token character can escape the literal; via a
# 600-mode file, never argv. Upserts: create on a fresh project, update on
# a rotation.
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
run_psql "$DB_HOST" "$DB_USER" "$SQL_FILE"
log "vault.news_sync_token synced (${DB_HOST})"

# ---- Prove it: the token must clear the gate -------------------------------
# One authenticated news-calendar call. A warm function instance can hold
# the pre-rotation env for a short while (#361 review, finding 5), so a
# 401 retries before it is believed. Status classes are attributed
# honestly (#361 review, findings 3/4): only 401/403 means the halves
# disagree; 404 means the function is not deployed yet; any other
# non-200 means auth CLEARED (or was never reached) and the function
# itself is unhealthy — the token sync stands either way, and a 200 here
# proves the gate, not the depth of the ingestion behind it.
verify_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 180 -X POST \
    "https://${PROJECT_REF}.supabase.co/functions/v1/news-calendar" \
    -H @"$VERIFY_AUTH_FILE" \
    -H "Content-Type: application/json" \
    -d '{"source":"sync-function-secrets-verify"}'
}
# `|| true` on every capture (#361 round 2, finding 2): a curl TRANSPORT
# failure (the 180s deadline, DNS, a reset) exits non-zero, and under
# `set -e` the bare assignment would abort the script with no VERIFY
# line at all — seconds after two writes the operator cannot see — the
# exact ambiguity finding 4's status attribution exists to prevent.
# curl still emits "000" via -w on those failures, and the case below
# names that arm.
STATUS="$(verify_status || true)"
attempt=1
while { [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; } && [ "$attempt" -lt 3 ]; do
  log "gate refused (HTTP ${STATUS}) — waiting 10s for warm instances to recycle (attempt ${attempt}/3)"
  sleep 10
  attempt=$((attempt + 1))
  STATUS="$(verify_status || true)"
done
case "$STATUS" in
  200)
    log "verified: news-calendar accepted the synced token (HTTP 200)"
    ;;
  401 | 403)
    log "VERIFY FAILED: the gate still refuses the synced token (HTTP ${STATUS}) — gate and caller may disagree; investigate before trusting the sync"
    exit 1
    ;;
  404)
    log "VERIFY BLOCKED: news-calendar is not deployed (HTTP 404) — run 'npx supabase functions deploy …' then re-run this script; the secret halves ARE synced"
    exit 1
    ;;
  "000" | "")
    log "VERIFY INCONCLUSIVE: the verification call could not complete (transport failure — timeout, DNS, or reset); the token halves ARE synced — re-run this script once connectivity returns"
    exit 1
    ;;
  *)
    log "VERIFY INCONCLUSIVE: news-calendar returned HTTP ${STATUS} — the token halves are synced and auth was not refused, but the function is unhealthy; check its logs"
    exit 1
    ;;
esac
