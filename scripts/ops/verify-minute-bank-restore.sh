#!/usr/bin/env bash
# Proof that the minute bank's off-box archive RESTORES (HANDOFF §6b-1 item J).
#
# WHAT THE DAILY CHECKS DO NOT PROVE. push-minute-bank-offbox.sh compares the
# remote object's md5 with the archive it just built, and
# check-minute-bank-parity.sh compares archive NAMES with snapshot names.
# Neither unpacks anything. A zstd stream that does not decode, a tar whose
# layout nobody has read, or a snapshot that caught a torn line passes both
# every day and is found on the day it is needed. Since 2026-09-21 local
# retention is one daily, so R2 is the only route to any earlier day.
#
# WHAT THIS DOES. It lists the archives under R2:$BUCKET/$PREFIX/, downloads
# the newest by name into a scratch directory, tests the zstd stream, extracts
# it and compares the restore with the live bank:
#
#   - the archive holds exactly one entry, the directory
#     levelflow-minute-bank-snapshot-<YYYYMMDD>, stamped as its key is, and
#     nothing in it but files and directories;
#   - every restored <symbol>.jsonl has <symbol>.state.json beside it, the
#     sidecar parses, and its "bars" equals the file's line count; a sidecar
#     with no data file must count zero;
#   - every restored data file ends in a newline, so no torn final line;
#   - every restored data file exists live, and its bytes are the HEAD of the
#     live file. The bank appends and never rewrites (bank-minute-bars.ts and
#     recover-minute-bank.ts both append), so a snapshot's bytes stay a prefix
#     of the live file for good, late fills included.
#
# Live symbols the archive lacks were added since the snapshot; they are
# named, not failed. A restored symbol missing live fails. A restore holding
# no data file, or no bars, fails: a proof over nothing is not a proof.
#
# NO BANK LOCK, deliberately. The lock (bank-lock.sh) exists because the
# backup copies a sidecar and a data file that must agree, and the bank writes
# them in two steps. This script reads no live sidecar. It reads live data
# files only as prefixes and line counts, and an append in flight only extends
# a file past the bytes compared. The live bar count can include bars in
# flight; it is reported, never asserted. Holding the lock would stop a bank
# run for the whole comparison and protect nothing this check depends on.
#
# macOS `cmp -n` IS NOT A PREFIX TEST. Measured 2026-09-22 on /usr/bin/cmp:
# with a="abc\n" and b="abc\ndef\n", `cmp -n 3 a b` exits 1 with "EOF on a".
# It reports unequal file lengths even inside the limit, which is exactly the
# case here, since the live file is longer. The prefix is compared by piping
# `head -c <size>` of the live file into cmp. An empty restored file is the
# head of anything and is not compared: macOS `head -c 0` exits 1.
#
# WHY IT IS NOT THE DAILY JOB. It downloads and unpacks a whole archive, like
# verify-postgres-restore.sh, and runs beside it on the weekly fleet-health
# cadence:
#
#   ~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- bash scripts/ops/verify-minute-bank-restore.sh
#
# Run from a checkout, it reads that checkout's .minute-bank. Run from any
# other tree, such as wl-repo-script's extract of origin/main, set
# LEVELFLOW_CHECKOUT to the checkout that holds the bank.
#
# stdout carries one line, and only on success. Progress and failures go to
# stderr, and every failure exits 1 with its reason.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUCKET="${LEVELFLOW_R2_BUCKET:-windwardline-backups}"
PREFIX="${LEVELFLOW_R2_PREFIX:-levelflow-cloud/minute-bank}"
ACCOUNT="${LEVELFLOW_R2_ACCOUNT:-c8da9a44c29c435205b2ec133ee05f20}"
ACCESS_KEY="${LEVELFLOW_R2_ACCESS_KEY:-fafbbe863abb74c59933f028095a04ce}"
# The literal the operator types, printed rather than expanded.
# shellcheck disable=SC2088
INVOCATION="~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- bash scripts/ops/verify-minute-bank-restore.sh"

log() { echo "$(date -u +%FT%TZ) mb-restore-check: $*" >&2; }
die() { log "FAIL $*"; exit 1; }

# THE LIVE BANK, never an absent one read as empty. A named checkout that does
# not exist is refused by name rather than falling back to this repository.
if [[ -n ${LEVELFLOW_CHECKOUT:-} ]]; then
  [[ -d $LEVELFLOW_CHECKOUT ]] || die "LEVELFLOW_CHECKOUT names no directory: $LEVELFLOW_CHECKOUT"
  CHECKOUT="$LEVELFLOW_CHECKOUT"
else
  CHECKOUT="$REPO"
fi
BANK="$CHECKOUT/.minute-bank"
[[ -d $BANK ]] || die "no live bank at $BANK; refusing to compare a restore with a bank that is not there (set LEVELFLOW_CHECKOUT to the checkout that holds it)"

[[ -n ${R2_TOKEN:-} ]] || die "R2_TOKEN is unset — invoke through:
  $INVOCATION"
command -v rclone >/dev/null || die "rclone is not installed (brew install rclone)"
command -v zstd >/dev/null || die "zstd is not installed (brew install zstd)"
command -v jq >/dev/null || die "jq is not installed (brew install jq)"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="https://$ACCOUNT.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY"
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d' ' -f1)"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
# Nothing below needs the token itself, so no child inherits it.
unset R2_TOKEN

# The scratch directory goes on every exit. A signal exits with its
# conventional status, and the EXIT trap cleans up on the way out; a cleanup
# that ran on the signal and returned would let the script carry on reading a
# directory it had just deleted.
#
# It is made under $TMPDIR by an explicit template. A bare `mktemp -d` on
# macOS ignores TMPDIR for the per-user directory confstr names, so the
# directory could not be found, or proven gone, from outside.
SCRATCH_ROOT="${TMPDIR:-/tmp}"
WORK="$(mktemp -d -- "${SCRATCH_ROOT%/}/mb-restore.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# --- the listing -------------------------------------------------------------
# rclone v1.75.1 against R2, measured 2026-09-22: a prefix holding nothing in
# an existing bucket lists empty with exit 0, and a missing bucket exits 3. So
# exit 3 names the bucket, any other non-zero exit is a listing that could not
# be read, and only an exit 0 with no archive in it means there is none.
log "listing R2:$BUCKET/$PREFIX/"
rc=0
rclone lsf -R --files-only "R2:$BUCKET/$PREFIX/" --include 'minute-bank-*.tar.zst' >"$WORK/listing" 2>"$WORK/lsf.err" || rc=$?
if [[ $rc -eq 3 ]]; then
  die "R2:$BUCKET was not found (rclone exit 3); there is no bucket to restore from"
elif [[ $rc -ne 0 ]]; then
  die "could not list R2:$BUCKET/$PREFIX/ (rclone exit $rc); an unreadable listing is not an empty one: $(grep -v 'Config file' "$WORK/lsf.err" | head -3 || true)"
fi

# THE LAYOUT IS THE PUSH'S CONTRACT: <YYYY>/<MM>/minute-bank-<YYYYMMDD>.tar.zst,
# the directories agreeing with the stamp. Under it, sorting the keys sorts the
# days. An archive outside it is a finding, named rather than skipped.
KEY_RE='^([0-9]{4})/([0-9]{2})/minute-bank-([0-9]{8})\.tar\.zst$'
VALID=""
STRAY=""
# `|| [[ -n $key ]]` keeps a final line that arrives without its newline;
# a bare `read` returns false on it and the loop would drop that key unseen.
while IFS= read -r key || [[ -n $key ]]; do
  [[ -n $key ]] || continue
  if [[ $key =~ $KEY_RE ]] && [[ ${BASH_REMATCH[1]}${BASH_REMATCH[2]} == "${BASH_REMATCH[3]:0:6}" ]]; then
    VALID="$VALID$key
"
  else
    STRAY="$STRAY
  $key"
  fi
done <"$WORK/listing"
[[ -z $STRAY ]] || die "R2:$BUCKET/$PREFIX/ holds archive(s) outside the layout <YYYY>/<MM>/minute-bank-<YYYYMMDD>.tar.zst:$STRAY"

NEWEST="$(printf '%s' "$VALID" | sort | tail -n 1)"
[[ -n $NEWEST ]] || die "no archive under R2:$BUCKET/$PREFIX/; there is nothing to restore, which is itself the finding"
STAMP="${NEWEST##*minute-bank-}"
STAMP="${STAMP%.tar.zst}"
log "newest of $(printf '%s' "$VALID" | grep -c .) archive(s): $NEWEST"

# --- the archive -------------------------------------------------------------
rc=0
rclone copyto "R2:$BUCKET/$PREFIX/$NEWEST" "$WORK/archive.tar.zst" 2>"$WORK/copyto.err" || rc=$?
[[ $rc -eq 0 ]] || die "could not download $NEWEST (rclone exit $rc): $(grep -v 'Config file' "$WORK/copyto.err" | head -3 || true)"
[[ -s $WORK/archive.tar.zst ]] || die "the download of $NEWEST produced no bytes"
log "downloaded $(wc -c <"$WORK/archive.tar.zst" | tr -d ' ') bytes"

zstd -q -t "$WORK/archive.tar.zst" 2>"$WORK/zstd.err" \
  || die "$NEWEST fails zstd's integrity test: $(head -3 "$WORK/zstd.err")"
mkdir "$WORK/restore"
zstd -q --decompress --stdout "$WORK/archive.tar.zst" | tar -xf - -C "$WORK/restore" 2>"$WORK/tar.err" \
  || die "$NEWEST did not extract: $(head -3 "$WORK/tar.err")"

EXPECTED="levelflow-minute-bank-snapshot-$STAMP"
TOP="$(ls -A "$WORK/restore")"
[[ $TOP == "$EXPECTED" && -d $WORK/restore/$EXPECTED ]] \
  || die "$NEWEST must hold exactly one directory, $EXPECTED; it holds: $(printf '%s' "${TOP:-nothing}" | tr '\n' ' ')"
# A link in a restore would point the comparison at whatever it names, and a
# link spelled *.jsonl would never be counted as data.
ODD="$(cd "$WORK/restore" && find . ! -type f ! -type d | tr '\n' ' ')"
[[ -z $ODD ]] || die "$NEWEST holds entries that are neither files nor directories: $ODD"
SNAP="$WORK/restore/$EXPECTED"

# --- the comparison ----------------------------------------------------------
(cd "$SNAP" && find . -type f -name '*.jsonl' -print0 | sort -z) >"$WORK/restored.list"
(cd "$SNAP" && find . -type f -name '*.state.json' -print0 | sort -z) >"$WORK/sidecars.list"
(cd "$BANK" && find . -type f -name '*.jsonl' -print0 | sort -z) >"$WORK/live.list"

FILES="$(tr -cd '\0' <"$WORK/restored.list" | wc -c | tr -d ' ')"
[[ $FILES -gt 0 ]] || die "$NEWEST restored no data file; refusing to certify a restore that examined nothing"

FAILURES=""
fail() { FAILURES="$FAILURES
  $*"; }

# The sidecar's "bars" as JSON, so a string "5" is not read as the count 5.
# Prints the count, or the reason it is not one and returns 1.
sidecar_bars() {
  local out
  out="$(jq '.bars' "$1" 2>/dev/null)" || { echo "does not parse as a JSON object"; return 1; }
  [[ $out =~ ^(0|[1-9][0-9]*)$ ]] || { echo "\"bars\" is '$out', not a count"; return 1; }
  echo "$out"
}

RESTORED_BARS=0
while IFS= read -r -d '' rel; do
  rel="${rel#./}"
  restored="$SNAP/$rel"
  side="${rel%.jsonl}.state.json"
  live="$BANK/$rel"
  lines="$(wc -l <"$restored" | tr -d ' ')" || die "could not read the restored $rel"
  size="$(wc -c <"$restored" | tr -d ' ')" || die "could not read the restored $rel"
  RESTORED_BARS=$(( RESTORED_BARS + lines ))

  if [[ $size -gt 0 && $(tail -c 1 "$restored" | wc -l | tr -d ' ') -ne 1 ]]; then
    fail "$rel — the restored file ends in a torn line (no final newline)"
  fi

  if [[ ! -f $SNAP/$side ]]; then
    fail "$rel — no sidecar $side beside it in the archive"
  elif ! bars="$(sidecar_bars "$SNAP/$side")"; then
    fail "$side — $bars"
  elif [[ $bars -ne $lines ]]; then
    fail "$rel — the sidecar counts $bars bar(s) and the file holds $lines line(s)"
  fi

  if [[ ! -f $live ]]; then
    fail "$rel — restored, and absent from the live bank at $BANK"
    continue
  fi
  live_size="$(wc -c <"$live" | tr -d ' ')" || die "could not read the live $rel"
  if [[ $live_size -lt $size ]]; then
    fail "$rel — the live file holds $live_size byte(s), fewer than the $size restored; the bank only appends"
  elif [[ $size -gt 0 ]] && ! head -c "$size" "$live" | cmp -s "$restored" -; then
    fail "$rel — the restored bytes are not the head of the live file; a banked bar was rewritten"
  fi
done <"$WORK/restored.list"

# A sidecar with no data file is a symbol whose first fetch failed. It must
# count nothing, or the archive lost the data it describes.
while IFS= read -r -d '' rel; do
  rel="${rel#./}"
  [[ -f $SNAP/${rel%.state.json}.jsonl ]] && continue
  if ! bars="$(sidecar_bars "$SNAP/$rel")"; then
    fail "$rel — $bars"
  elif [[ $bars -ne 0 ]]; then
    fail "$rel — counts $bars bar(s) and the archive holds no data file for it"
  fi
done <"$WORK/sidecars.list"

[[ -z $FAILURES ]] || die "$NEWEST does not restore the live bank:$FAILURES"
[[ $RESTORED_BARS -gt 0 ]] \
  || die "$NEWEST restored $FILES data file(s) holding no bars; refusing to certify a restore that examined nothing"

LIVE_BARS=0
ADDED=""
while IFS= read -r -d '' rel; do
  rel="${rel#./}"
  n="$(wc -l <"$BANK/$rel" | tr -d ' ')" || die "could not read the live $rel"
  LIVE_BARS=$(( LIVE_BARS + n ))
  [[ -f $SNAP/$rel ]] || ADDED="$ADDED ${rel%.jsonl}"
done <"$WORK/live.list"
[[ -z $ADDED ]] || log "live symbol(s) added since $STAMP, not in the archive:$ADDED"

echo "$(date -u +%FT%TZ) mb-restore-check: restore proven: R2:$BUCKET/$PREFIX/$NEWEST: $FILES data file(s), $RESTORED_BARS restored bar(s), $LIVE_BARS live bar(s)"
