#!/usr/bin/env bash
# LevelFlow's Postgres OFF-BOX backup.
#
# WHY THIS EXISTS, AND WHY THE MINUTE-BANK MIRROR DID NOT COVER IT. The bank's
# off-box copy protects `.minute-bank/`. It does not protect this database, and
# the numbers say why that mattered: `public.analyzer_events` holds 328,841
# rows — the accumulated record of what this system DID, which no provider can
# re-serve at any price — while `public.market_bars`, the part the bank mirror
# would overlap, holds 1,708. The irreplaceable half had exactly one custodian.
#
# Supabase takes seven daily physical backups. They live INSIDE the Supabase
# account, so they answer an accidental DROP and nothing else: an account
# compromise, a billing lapse, or a deleted project takes the database and its
# backups together. PITR is a $100/month add-on and is deliberately off, which
# leaves this the only off-provider copy of 13 user accounts and ten months of
# analyzer history.
#
# THE SERVER PICKS THE TOOL, NOT A PIN. pg_dump refuses a server newer than
# itself, so a hardcoded path is a backup that stops working silently on the
# vendor's upgrade schedule. This reads `server_version_num` from the live
# database and then LOOKS FOR a pg_dump of that major. When Supabase moves to
# 18 this fails by name — "install postgresql@18" — on the first run after the
# upgrade, rather than producing nothing and exiting 0.
#
# COVERAGE IS DERIVED, NOT CURATED. After dumping, it asks the SERVER which
# tables exist and requires every one of them to appear as TABLE DATA in the
# archive. A dump that lost a table to a permission change or a schema filter
# is the failure that looks healthiest — right size, right exit code, missing
# rows. Three tables are named exclusions with a stated reason; anything else
# absent is a failure.
#
# IT VERIFIES THE REMOTE, not the upload's exit code, on the same reasoning as
# push-minute-bank-offbox.sh: an upload that returns 0 and an object that does
# not match are different things, and only the second one is a backup.
#
# WHAT THIS SCRIPT DOES NOT PROVE. That the archive RESTORES. Structure is not
# recoverability, and a backup nobody has restored from is a hope. That proof
# is verify-postgres-restore.sh, which restores into a throwaway cluster and
# counts rows; it runs on the weekly cadence because it costs minutes, not
# seconds. This script's job is that a correct archive exists off-box daily.
#
# IT FAILS LOUDLY. ops/agent-exit-status.sh reads the launchd exit code, so a
# silent skip would render as a healthy backup — the exact failure the whole
# off-box item exists to prevent.
set -euo pipefail

PG_HOST="${LEVELFLOW_PG_HOST:-aws-1-us-east-2.pooler.supabase.com}"
# Session mode. The pooler's advertised port is 6543, which is TRANSACTION mode
# and cannot serve pg_dump: it needs one stable session across the whole dump.
# 5432 on the same host is session mode. Using the advertised port here fails in
# the middle of a dump, not at connect, which is the worst place to learn it.
PG_PORT="${LEVELFLOW_PG_PORT:-5432}"
PG_USER="${LEVELFLOW_PG_USER:-postgres.usrtpoftuvhpmyhlhqlg}"
PG_DB="${LEVELFLOW_PG_DB:-postgres}"

BUCKET="${LEVELFLOW_R2_BUCKET:-windwardline-backups}"
PREFIX="${LEVELFLOW_PG_R2_PREFIX:-levelflow-cloud/postgres}"
ACCOUNT="${LEVELFLOW_R2_ACCOUNT:-c8da9a44c29c435205b2ec133ee05f20}"
ACCESS_KEY="${LEVELFLOW_R2_ACCESS_KEY:-fafbbe863abb74c59933f028095a04ce}"
KEEP_REMOTE="${LEVELFLOW_PG_R2_KEEP:-60}"

# Extension- and Realtime-owned transient queues. pg_dump excludes tables that
# belong to an extension, and Realtime's `messages` is a rotating partition
# parent. None is data anyone would restore, and all three were confirmed
# absent from a real dump on 2026-09-14 before being named here. The list is
# deliberately exact: a wildcard would hide the next table that goes missing.
EXPECTED_ABSENT="${LEVELFLOW_PG_EXPECTED_ABSENT:-net._http_response net.http_request_queue realtime.messages}"

STAMP="$(date -u +%Y%m%d)"

log() { echo "$(date -u +%FT%TZ) pg-offbox: $*"; }
die() { log "FAIL $*"; exit 1; }

# NEVER the permanent bucket. This script prunes, and windwardline-archives is
# write-once (docs/offbox-archives.md). The bucket is overridable for tests, so
# the refusal is by name, not by trust in whoever set the variable.
#
# On the FIRST PATH SEGMENT, because rclone reads everything after `R2:` as a
# bucket plus a path: an exact-match refusal is walked past by one suffix, and
# `windwardline-archives/levelflow-cloud` then addresses the permanent bucket.
# Leading slashes go first, in place, because rclone strips them too:
# `/windwardline-archives` would otherwise pass the check below with an empty
# first segment and still address the permanent bucket.
BUCKET="${BUCKET#"${BUCKET%%[!/]*}"}"
[[ ${BUCKET%%/*} != windwardline-archives ]] || die "refusing to run against windwardline-archives: this script prunes, and that bucket is write-once"

# --- self-delivery of secrets ------------------------------------------------
# The launchd plist invokes this script directly, exactly like its minute-bank
# sibling, and the secrets arrive here rather than in the plist. Two recorded
# traps shape this:
#
#   wl-secret is located by ABSOLUTE PATH. It is not on PATH on the schedule —
#   measured 2026-09-02T05:36:29Z, "wl-secret is not on PATH", exit 1, a backup
#   that did not run and said so only in a log nobody was reading.
#
#   The re-exec guard is an ARGUMENT, not an environment variable. wl-secret
#   execs through `env -i`, so an env sentinel is scrubbed before the child sees
#   it and could never stop a loop. argv survives.
if [[ -z ${PGPASSWORD:-} || -z ${R2_TOKEN:-} ]]; then
    if [[ ${1:-} == --secrets-delivered ]]; then
        die "wl-secret ran but PGPASSWORD or R2_TOKEN is still unset; refusing to re-exec again"
    fi
    WL_SECRET="${LEVELFLOW_WL_SECRET:-$HOME/.local/bin/wl-secret}"
    [[ -x $WL_SECRET ]] || die "wl-secret is not executable at $WL_SECRET; the credentials cannot be read (set LEVELFLOW_WL_SECRET to relocate it)"
    exec "$WL_SECRET" supabase-db-levelflow=PGPASSWORD cloudflare-r2-backup=R2_TOKEN -- "$0" --secrets-delivered "$@"
fi
[[ ${1:-} != --secrets-delivered ]] || shift

[[ -n ${PGPASSWORD:-} ]] || die "PGPASSWORD is unset — invoke through:
  wl-secret supabase-db-levelflow=PGPASSWORD cloudflare-r2-backup=R2_TOKEN -- $0"
[[ -n ${R2_TOKEN:-} ]] || die "R2_TOKEN is unset — invoke through:
  wl-secret supabase-db-levelflow=PGPASSWORD cloudflare-r2-backup=R2_TOKEN -- $0"
command -v rclone >/dev/null || die "rclone is not installed (brew install rclone)"
command -v zstd   >/dev/null || die "zstd is not installed (brew install zstd)"

CONN="postgresql://${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}?sslmode=require"

# --- the server names its own major, and that major names the tool ----------
PSQL="${LEVELFLOW_PSQL:-$(command -v psql || true)}"
[[ -n $PSQL ]] || die "no psql on PATH to read the server version"
SERVER_NUM="$("$PSQL" "$CONN" -tAc 'show server_version_num' 2>/dev/null | tr -d '[:space:]')" \
  || die "could not reach the database at ${PG_HOST}:${PG_PORT}"
[[ $SERVER_NUM =~ ^[0-9]+$ ]] \
  || die "server_version_num was not a number: '${SERVER_NUM}' — refusing to guess which pg_dump to use"
SERVER_MAJOR=$(( SERVER_NUM / 10000 ))
log "server reports PostgreSQL major ${SERVER_MAJOR}"

find_tool() { # find_tool <name> -> prints an absolute path of the right major
    local name="$1" candidate
    for candidate in \
        "/opt/homebrew/opt/postgresql@${SERVER_MAJOR}/bin/${name}" \
        "/usr/local/opt/postgresql@${SERVER_MAJOR}/bin/${name}"; do
        [[ -x $candidate ]] && { printf '%s' "$candidate"; return 0; }
    done
    candidate="$(command -v "$name" || true)"
    if [[ -n $candidate ]]; then
        local have
        have="$("$candidate" --version 2>/dev/null | sed -E 's/.* ([0-9]+)\..*/\1/')"
        [[ $have == "$SERVER_MAJOR" ]] && { printf '%s' "$candidate"; return 0; }
    fi
    return 1
}

PG_DUMP="${LEVELFLOW_PG_DUMP:-$(find_tool pg_dump || true)}"
[[ -n $PG_DUMP ]] || die "no pg_dump for PostgreSQL ${SERVER_MAJOR}.
  pg_dump refuses a server newer than itself, so this cannot fall back safely.
  Fix: brew install postgresql@${SERVER_MAJOR}"
PG_RESTORE="${LEVELFLOW_PG_RESTORE:-$(find_tool pg_restore || true)}"
[[ -n $PG_RESTORE ]] || die "no pg_restore for PostgreSQL ${SERVER_MAJOR} (brew install postgresql@${SERVER_MAJOR})"
log "using $PG_DUMP"

# --- what the server says must be in the archive ----------------------------
EXPECTED="$("$PSQL" "$CONN" -tAc \
  "select schemaname||'.'||relname from pg_stat_user_tables order by 1" 2>/dev/null \
  | tr -d '\r' | grep . | sort)" \
  || die "could not enumerate tables from the server"
EXPECTED_N="$(printf '%s\n' "$EXPECTED" | grep -c . || true)"
# An empty table list is not "nothing to back up" — it is a read that failed in
# a way that still exited 0, and it would make every coverage check below pass
# vacuously.
[[ ${EXPECTED_N:-0} -gt 0 ]] \
  || die "the server listed zero tables; refusing to certify a dump against an empty expectation"
log "server lists ${EXPECTED_N} table(s) to account for"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
DUMP="$WORK/postgres-$STAMP.dump"

# -Z0 leaves the archive uncompressed so zstd -19 can work on raw bytes; custom
# format's own zlib pass would otherwise compress twice and worse. Measured
# 2026-09-14: 144,907,604 -> 14,075,201, a 10.3x ratio.
log "dumping ${PG_HOST}:${PG_PORT}/${PG_DB}"
"$PG_DUMP" "$CONN" --format=custom --compress=0 --no-owner --no-acl --file="$DUMP" \
  || die "pg_dump failed"
[[ -s $DUMP ]] || die "pg_dump produced an empty file"

# --- coverage: every table the server named must carry its data -------------
DUMPED="$("$PG_RESTORE" --list "$DUMP" 2>/dev/null \
  | awk '/TABLE DATA/ { print $(NF-2)"."$(NF-1) }' | sort -u)" \
  || die "pg_restore could not read the archive it just wrote"

MISSING=""
while IFS= read -r table; do
    [[ -n $table ]] || continue
    printf '%s\n' "$DUMPED" | grep -qxF "$table" && continue
    case " $EXPECTED_ABSENT " in *" $table "*) continue ;; esac
    MISSING="$MISSING $table"
done <<< "$EXPECTED"

[[ -z $MISSING ]] || die "the archive is missing table data the server reports as present:$MISSING
  This is the failure that looks healthiest — correct size, exit 0, absent rows.
  Do not widen LEVELFLOW_PG_EXPECTED_ABSENT to make it pass without establishing
  why the table is gone."
log "coverage verified: ${EXPECTED_N} server table(s), $(printf '%s\n' "$DUMPED" | grep -c .) with data in the archive"

# --- compress, upload, verify the REMOTE ------------------------------------
ARCHIVE="$WORK/postgres-$STAMP.dump.zst"
zstd -q -19 -T0 "$DUMP" -o "$ARCHIVE" || die "zstd failed"
BYTES="$(wc -c < "$ARCHIVE" | tr -d ' ')"
LOCAL_MD5="$(md5 -q "$ARCHIVE")"
log "archive $BYTES bytes, md5 $LOCAL_MD5"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="https://$ACCOUNT.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY"
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d' ' -f1)"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY

# Same layout contract as the minute bank, deliberately:
#   windwardline-backups/<repo>/<dataset>/<YYYY>/<MM>/<dataset>-<YYYYMMDD>.<ext>
KEY="$PREFIX/${STAMP:0:4}/${STAMP:4:2}/postgres-$STAMP.dump.zst"
log "uploading to R2:$BUCKET/$KEY"
rclone copyto "$ARCHIVE" "R2:$BUCKET/$KEY" --s3-no-check-bucket 2>&1 | grep -v "Config file" || true

REMOTE_MD5="$(rclone hashsum md5 "R2:$BUCKET/$KEY" 2>/dev/null | awk 'NR==1{print $1}')"
[[ -n $REMOTE_MD5 ]] || die "no object at R2:$BUCKET/$KEY after upload — the push did not land"
[[ $REMOTE_MD5 == "$LOCAL_MD5" ]] || die "remote md5 $REMOTE_MD5 != local $LOCAL_MD5 at $KEY"
log "verified remote copy: $KEY ($BYTES bytes, md5 matches)"

# --- retention --------------------------------------------------------------
# --files-only for the reason the sibling script records: `lsf -R` emits the
# year and month DIRECTORY entries too, and they sort before the archives
# beneath them, so without it the prune hands a directory to deletefile.
REMOTE_LIST="$(rclone lsf -R --files-only "R2:$BUCKET/$PREFIX/" --include '*.dump.zst' 2>/dev/null | sort || true)"
TOTAL="$(printf '%s' "$REMOTE_LIST" | grep -c . || true)"
EXCESS=$(( TOTAL - KEEP_REMOTE ))
if [ "$EXCESS" -gt 0 ]; then
    printf '%s\n' "$REMOTE_LIST" | head -n "$EXCESS" | while IFS= read -r old; do
        [ -n "$old" ] || continue
        log "pruning remote $old"
        rclone deletefile "R2:$BUCKET/$PREFIX/$old" 2>&1 | grep -v "Config file" || true
    done
fi

log "off-box complete; $TOTAL remote archive(s), keeping $KEEP_REMOTE"
