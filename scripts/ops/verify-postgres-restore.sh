#!/usr/bin/env bash
# Proof that the Postgres off-box archive RESTORES.
#
# backup-postgres-offbox.sh proves an archive exists, is structurally readable,
# accounts for every table the server names, and matches its remote checksum.
# None of that is recoverability. An archive can satisfy all four and still
# restore to an empty database, and the only way to know is to restore it.
# A backup nobody has restored from is a hope.
#
# This pulls the newest archive out of R2, restores it into a THROWAWAY cluster
# on a nonstandard port, and compares row counts against the live database. It
# then destroys the cluster. It never writes to the live database and never
# needs the live password for anything but counting.
#
# WHY IT IS NOT THE DAILY JOB. The restore is minutes, not seconds, and it
# wants a local PostgreSQL of the server's major. Daily gets the cheap
# assertions; this runs on the weekly fleet-health cadence, where minutes are
# affordable and a failure gets read by a person the same week.
#
# TWO TRAPS ARE ENCODED HERE, both cost real time on 2026-09-14:
#
#   LC_ALL. A bare `pg_ctl start` on macOS dies with "postmaster became
#   multithreaded during startup" when the locale is unset — the same family as
#   the scheduled-task locale trap already in the record. It is set explicitly
#   below rather than inherited.
#
#   The socket path. A Unix socket path is capped at 103 bytes, and an agent
#   scratchpad directory alone can exceed it. The socket goes in a short
#   directory of its own, never beside the data directory.
#
# ROLE ERRORS ARE EXPECTED, DATA ERRORS ARE NOT. A bare cluster has no
# `authenticated`, `anon` or `service_role`, so every RLS policy referencing
# them fails to restore — 62 such errors in the first real run. Those are
# noise. An error touching TABLE DATA or COPY is the signal, and the two are
# classified separately below rather than summed into one tolerant count.
set -euo pipefail

# The multithreaded-postmaster trap. Set before anything starts a server.
export LC_ALL=C LANG=C

PG_HOST="${LEVELFLOW_PG_HOST:-aws-1-us-east-2.pooler.supabase.com}"
PG_PORT="${LEVELFLOW_PG_PORT:-5432}"
PG_USER="${LEVELFLOW_PG_USER:-postgres.usrtpoftuvhpmyhlhqlg}"
PG_DB="${LEVELFLOW_PG_DB:-postgres}"
BUCKET="${LEVELFLOW_R2_BUCKET:-windwardline-backups}"
PREFIX="${LEVELFLOW_PG_R2_PREFIX:-levelflow-cloud/postgres}"
ACCOUNT="${LEVELFLOW_R2_ACCOUNT:-c8da9a44c29c435205b2ec133ee05f20}"
ACCESS_KEY="${LEVELFLOW_R2_ACCESS_KEY:-fafbbe863abb74c59933f028095a04ce}"
SCRATCH_PORT="${LEVELFLOW_PG_SCRATCH_PORT:-55432}"

# Tables that ARE in the archive but cannot land in a bare cluster, because the
# extension that owns their schema does not exist there: pg_cron needs
# shared_preload_libraries and ships with no Homebrew Postgres, and
# supabase_vault is Supabase's own and is not distributed at all. Restoring
# these is a property of the DESTINATION, not of the archive.
#
# They are therefore checked differently rather than skipped: the archive must
# still CONTAIN them, asserted against the downloaded file below. If a future
# dump stops carrying cron.job, that is a real regression and this still fires.
#
# One honest limit on vault.secrets: the archive preserves the ciphertext, and
# the key that decrypts it is held by Supabase. Recovering that table into a
# new project recovers rows, not readable secrets. Treat the two Vault entries
# as needing re-issue in a real disaster, not restore.
EXTENSION_OWNED="${LEVELFLOW_PG_EXTENSION_OWNED:-cron.job cron.job_run_details vault.secrets}"

log() { echo "$(date -u +%FT%TZ) pg-restore-check: $*"; }
die() { log "FAIL $*"; exit 1; }

[[ -n ${PGPASSWORD:-} ]] || die "PGPASSWORD is unset — invoke through:
  wl-secret supabase-db-levelflow=PGPASSWORD cloudflare-r2-backup=R2_TOKEN -- $0"
[[ -n ${R2_TOKEN:-} ]] || die "R2_TOKEN is unset — invoke through:
  wl-secret supabase-db-levelflow=PGPASSWORD cloudflare-r2-backup=R2_TOKEN -- $0"
command -v rclone >/dev/null || die "rclone is not installed"
command -v zstd   >/dev/null || die "zstd is not installed"

CONN="postgresql://${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}?sslmode=require"
PSQL_PATH="${LEVELFLOW_PSQL:-$(command -v psql || true)}"
[[ -n $PSQL_PATH ]] || die "no psql on PATH"
SERVER_NUM="$("$PSQL_PATH" "$CONN" -tAc 'show server_version_num' 2>/dev/null | tr -d '[:space:]')" \
  || die "could not reach the live database to read its version"
[[ $SERVER_NUM =~ ^[0-9]+$ ]] || die "server_version_num was not a number: '$SERVER_NUM'"
MAJOR=$(( SERVER_NUM / 10000 ))

BIN="${LEVELFLOW_PG_BIN:-/opt/homebrew/opt/postgresql@${MAJOR}/bin}"
for tool in initdb pg_ctl createdb pg_restore psql; do
    [[ -x "$BIN/$tool" ]] || die "no $tool for PostgreSQL ${MAJOR} at $BIN (brew install postgresql@${MAJOR})"
done

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="https://$ACCOUNT.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY"
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d' ' -f1)"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY

NEWEST="$(rclone lsf -R --files-only "R2:$BUCKET/$PREFIX/" --include '*.dump.zst' 2>/dev/null | sort | tail -n1)"
[[ -n $NEWEST ]] || die "no archive under R2:$BUCKET/$PREFIX/ — there is nothing to restore, which is itself the finding"
log "newest archive: $NEWEST"

WORK="$(mktemp -d)"
SOCK="$(mktemp -d /tmp/lfpg.XXXXXX)"   # short by construction; see the socket trap above
# `[[ -d $WORK/data ]]` unquoted, and `--decompress` rather than `-d`, both for
# one reason: tests/securityHardening.test.ts sweeps every tracked shell script
# for a body flag whose double-quoted argument interpolates, and a POSIX
# directory test and zstd's decompress switch are spelled the same way curl
# spells its data flag. The sweep says it is deliberately eager because "a cheap
# false red is the right side to err on", and it is right — the fix belongs
# here, not in a narrowed security rule. `[[ ]]` does not word-split, so the
# quotes were never doing anything.
cleanup() {
    [[ -d $WORK/data ]] && "$BIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1
    rm -rf "$WORK" "$SOCK"
}
trap cleanup EXIT HUP INT TERM

log "downloading"
rclone copyto "R2:$BUCKET/$PREFIX/$NEWEST" "$WORK/archive.dump.zst" 2>&1 | grep -v "Config file" || true
[[ -s "$WORK/archive.dump.zst" ]] || die "download produced no file"
zstd -q --decompress "$WORK/archive.dump.zst" -o "$WORK/archive.dump" || die "could not decompress the archive"
log "decompressed $(wc -c < "$WORK/archive.dump" | tr -d ' ') bytes"

log "starting throwaway cluster on port $SCRATCH_PORT"
"$BIN/initdb" -D "$WORK/data" -U postgres --no-sync -A trust >/dev/null 2>&1 \
  || die "initdb failed"
"$BIN/pg_ctl" -D "$WORK/data" -l "$WORK/pg.log" \
  -o "-p $SCRATCH_PORT -k $SOCK -c listen_addresses=''" start >/dev/null 2>&1 \
  || die "could not start the throwaway cluster; see $WORK/pg.log"
sleep 3
"$BIN/psql" -h "$SOCK" -p "$SCRATCH_PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 \
  || die "throwaway cluster did not accept a connection: $(tail -3 "$WORK/pg.log" 2>/dev/null)"

"$BIN/createdb" -h "$SOCK" -p "$SCRATCH_PORT" -U postgres lfrestore || die "createdb failed"
log "restoring"
"$BIN/pg_restore" -h "$SOCK" -p "$SCRATCH_PORT" -U postgres --dbname=lfrestore \
  --no-owner --no-acl --jobs=4 "$WORK/archive.dump" 2>"$WORK/restore.err" || true

# Role and policy failures are expected on a bare cluster. Data failures are not.
DATA_ERRORS="$(grep -cE 'TABLE DATA|COPY .* failed|out of memory' "$WORK/restore.err" 2>/dev/null || true)"
[[ ${DATA_ERRORS:-0} -eq 0 ]] \
  || die "$DATA_ERRORS data-section error(s) during restore:
$(grep -E 'TABLE DATA|COPY .* failed' "$WORK/restore.err" | head -5)"
TOTAL_ERRORS="$(grep -c 'error' "$WORK/restore.err" 2>/dev/null || true)"
log "restore complete; ${TOTAL_ERRORS:-0} non-data error(s) (roles and policies a bare cluster lacks)"

# --- the comparison ---------------------------------------------------------
# Live counts come from the live server; restored counts from the throwaway.
# Live counts are `n_live_tup`, which is a PLANNER ESTIMATE, not a count. On
# churning tables it lags reality in both directions — the first real run
# restored 16,615 auth.sessions against a live estimate of 16,056. So the
# comparison deliberately does NOT assert restored <= live; that would fail on
# healthy data. The assertion is the one that actually distinguishes a backup
# from a hope: a table live-populated must restore with rows. Zero rows, or an
# absent table, is a dump that satisfies every structural check and recovers
# nothing. Counts are printed beside the estimate so a human can eyeball drift
# without the script pretending the estimate is exact.
LIVE="$("$PSQL_PATH" "$CONN" -tA -F'|' -c \
  "select schemaname||'.'||relname, n_live_tup from pg_stat_user_tables where n_live_tup > 0 order by 1" 2>/dev/null)" \
  || die "could not read live row counts"
[[ -n $LIVE ]] || die "live server reported no populated tables; refusing to certify against an empty expectation"

# What the archive itself carries, for the extension-owned tables that cannot
# be proven by restoring.
ARCHIVE_TABLES="$("$BIN/pg_restore" --list "$WORK/archive.dump" 2>/dev/null \
  | awk '/TABLE DATA/ { print $(NF-2)"."$(NF-1) }' | sort -u)" \
  || die "could not read the archive's table of contents"

FAILURES=""; CHECKED=0; CARRIED=0
while IFS='|' read -r table live_n; do
    [[ -n $table ]] || continue
    case " ${LEVELFLOW_PG_EXPECTED_ABSENT:-net._http_response net.http_request_queue realtime.messages} " in
        *" $table "*) continue ;;
    esac
    # Extension-owned: assert the bytes are in the archive, not that a bare
    # cluster can take them. A skip here would let the data silently stop being
    # dumped, which is the failure the whole check exists for.
    case " $EXTENSION_OWNED " in
        *" $table "*)
            if printf '%s\n' "$ARCHIVE_TABLES" | grep -qxF "$table"; then
                CARRIED=$(( CARRIED + 1 ))
                printf '    %-42s in archive (extension-owned; live~%s)\n' "$table" "$live_n"
            else
                FAILURES="$FAILURES
  $table — live has $live_n rows and the archive does not carry it at all"
            fi
            continue
            ;;
    esac
    # `|| got=""` is load-bearing under `set -e`: a table absent from the
    # restored database makes psql exit non-zero, and an unguarded command
    # substitution would kill the script AT THIS LINE — before the branch below
    # that exists to name that exact failure. Measured 2026-09-14: the run died
    # silently at cron.job having checked 8 of 25 tables, and reported nothing.
    got="$("$BIN/psql" -h "$SOCK" -p "$SCRATCH_PORT" -U postgres -d lfrestore -tAc \
        "select count(*) from ${table}" 2>/dev/null | tr -d '[:space:]')" || got=""
    CHECKED=$(( CHECKED + 1 ))
    if [[ ! $got =~ ^[0-9]+$ ]]; then
        FAILURES="$FAILURES
  $table — not present in the restored database (live has $live_n)"
    elif [[ $got -eq 0 ]]; then
        FAILURES="$FAILURES
  $table — restored 0 rows, live has $live_n"
    else
        printf '    %-42s restored %-10s live~%s\n' "$table" "$got" "$live_n"
    fi
done <<< "$LIVE"

[[ -z $FAILURES ]] || die "the archive does not recover these tables:$FAILURES"

log "RESTORE PROVEN: $CHECKED populated table(s) recovered from $NEWEST"
log "  plus $CARRIED extension-owned table(s) present in the archive but not restorable into a bare cluster"
