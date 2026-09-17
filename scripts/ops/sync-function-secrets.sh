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
# then proves, with one token-gated GET to news-calendar that fetches nothing,
# that the gate half equals the Keychain token and that the running function
# holds the Keychain's FMP_API_KEY (compared by a SHA-256 prefix; neither
# fingerprint is printed). It does NOT prove the Vault half — only the psql
# write under ON_ERROR_STOP does — and it does NOT prove FMP accepts the key:
# only a fetch that runs can. Run it after ANY rotation of these Keychain items;
# whatever the current live state (never-propagated, half-propagated,
# stale), one run lands everything rotated, agreeing, and governed.
#
# ORDER IS LOAD-BEARING (#361 review, finding 1): every fallible
# dependency — credentials, psql, a working database endpoint — is proven
# BEFORE the first write, because a run that rotates the gate half and
# then dies on the Vault half would CAUSE the split-token 401s this
# script exists to prevent. After the preflight, the remaining failure
# window is a transient between two writes seconds apart: a failed Vault
# write exits non-zero under ON_ERROR_STOP, and the verify at the end
# catches a gate half that did not take.
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
# Values travel via chmod-600 temp files, never argv — argv is
# world-readable via `ps -ax`, so this is what keeps other users (and
# any process watcher) from reading them; the invoking user can always
# inspect their own processes. Nothing here ever prints a secret value.
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
  else
    # #363 round 3, finding 2: the abort must never assert a probe that
    # never ran. On this path the pooler was SKIPPED, not failed — and
    # the likeliest cause is a second stale credential this script
    # already holds (the direct-IPv4 deprecation makes the pooler the
    # expected path, so this branch is not exotic).
    printf -- '--- pooler not probed: region lookup failed (supabase-access-token stale? management API unreachable?) ---\n' \
      >> "$PROBE_ERR_FILE"
  fi
fi
if [ -z "$DB_HOST" ]; then
  log "no reachable database endpoint (the direct host failed; the attempts below say whether the pooler was probed or skipped); aborting — nothing written"
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

# ---- Prove it: the token clears the gate, and the key is the one we hold ----
# One token-gated GET. news-calendar answers it before any spend decision
# (supabase/functions/news-calendar/gate.ts): `"gate":"accepted"`, the parking
# state, and a SHA-256 prefix of the FMP_API_KEY the running function reads.
# It used to be a POST, which ran a full calendar, earnings and news sync to
# answer "is the token right" — that proved the key worked, and spent a sync
# every rotation.
#
# A warm function instance can hold the pre-rotation env for a short while
# (#361 review, finding 5), so a 401 — or a 200 naming a different key — retries
# before it is believed. Status classes are attributed honestly (#361 review,
# findings 3/4): only 401/403 means the halves disagree; 404 means the function
# is not deployed yet; 405 means the deployed function predates this verify; any
# other non-200 means auth CLEARED (or was never reached) and the function itself
# is unhealthy — the token sync stands either way.
verify_status() {
  # -sS, not -s (#363 round 6): on a transport failure curl's own error
  # line names WHICH failure — timeout vs DNS vs reset — and nothing on
  # that line is a credential (the bearer is in a header file, not the
  # URL). Suppressing it re-collapsed exactly the distinction the "000"
  # arm exists to report. The body comes back on stdout with the status on
  # its own last line; nothing is sent.
  curl -sS -w '\n%{http_code}' --max-time 60 -X GET \
    "https://${PROJECT_REF}.supabase.co/functions/v1/news-calendar" \
    -H @"$VERIFY_AUTH_FILE"
}
# The Keychain key's fingerprint, the same width gate.ts sends. printf is a
# builtin, so the key never reaches an argv; the fingerprint is never printed.
LOCAL_FP="$(printf '%s' "$FMP_API_KEY" | shasum -a 256 | cut -c1-16)"
# match | mismatch | no-key | no-marker, read from $BODY.
fingerprint_state() {
  if ! grep -qF '"gate":"accepted"' <<<"$BODY"; then
    echo no-marker
  elif grep -qF '"fmpKeyFingerprint":null' <<<"$BODY"; then
    echo no-key
  elif [ "$(sed -nE 's/.*"fmpKeyFingerprint":"([0-9a-f]+)".*/\1/p' <<<"$BODY")" = "$LOCAL_FP" ]; then
    echo match
  else
    echo mismatch
  fi
}
# `|| true` on every capture (#361 round 2, finding 2): a curl TRANSPORT
# failure (the 60s deadline, DNS, a reset) exits non-zero, and under
# `set -e` the bare assignment would abort the script with no VERIFY
# line at all — seconds after two writes the operator cannot see — the
# exact ambiguity finding 4's status attribution exists to prevent.
# curl still emits "000" via -w on those failures, and the case below
# names that arm.
verify() {
  RESPONSE="$(verify_status || true)"
  STATUS="${RESPONSE##*$'\n'}"
  BODY="${RESPONSE%$'\n'*}"
}
verify
attempt=1
while { [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ] ||
  { [ "$STATUS" = "200" ] && [ "$(fingerprint_state)" = "mismatch" ]; }; } &&
  [ "$attempt" -lt 3 ]; do
  log "gate refused or answered with another key (HTTP ${STATUS}) — waiting 10s for warm instances to recycle (attempt ${attempt}/3)"
  sleep 10
  attempt=$((attempt + 1))
  verify
done
case "$STATUS" in
  200)
    case "$(fingerprint_state)" in
      match)
        log "verified: news-calendar accepted the synced token and runs with the Keychain FMP_API_KEY (fingerprint match); nothing was fetched"
        ;;
      no-key)
        log "VERIFY FAILED: news-calendar accepted the token but has no FMP_API_KEY — investigate the function secrets before trusting the sync"
        exit 1
        ;;
      mismatch)
        log "VERIFY FAILED: the running news-calendar holds a different FMP_API_KEY than the Keychain (fingerprint mismatch after ${attempt} attempts) — investigate before trusting the sync"
        exit 1
        ;;
      *)
        log "VERIFY INCONCLUSIVE: news-calendar returned HTTP 200 without the verify marker — the token halves are synced; check which version is deployed"
        exit 1
        ;;
    esac
    ;;
  401 | 403)
    log "VERIFY FAILED: the gate still refuses the synced token (HTTP ${STATUS}) — gate and caller may disagree; investigate before trusting the sync"
    exit 1
    ;;
  404)
    log "VERIFY BLOCKED: news-calendar is not deployed (HTTP 404) — run 'npx supabase functions deploy …' then re-run this script; the secret halves ARE synced"
    exit 1
    ;;
  405)
    log "VERIFY BLOCKED: the deployed news-calendar predates the zero-spend verify (it answers GET with 405); nothing was fetched; deploy main, then re-run; the secret halves ARE synced"
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
