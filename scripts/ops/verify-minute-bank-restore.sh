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
# WHAT THIS DOES. It lists the archives under R2:$BUCKET/$PREFIX/, takes the
# newest by name, refuses it if its stamp is more than three days before today
# (UTC), downloads it into a scratch directory, tests the zstd stream, extracts
# it and compares the restore with the live bank:
#
#   - the archive holds exactly one entry, the directory
#     levelflow-minute-bank-snapshot-<YYYYMMDD>, stamped as its key is, and
#     nothing in that but files, since the bank is flat;
#   - every restored <symbol>.jsonl has <symbol>.state.json beside it, the
#     sidecar parses, and its "bars" equals the file's line count; a sidecar
#     with no data file must count zero;
#   - every restored data file ends in a newline, so no torn final line;
#   - every restored data file exists live, and its bytes are the HEAD of the
#     live file. The bank appends and never rewrites (bank-minute-bars.ts and
#     recover-minute-bank.ts both append), so a snapshot's bytes stay a prefix
#     of the live file for good, late fills included;
#   - every live data file the archive lacks began after the snapshot: the
#     bar on its first line is dated at most four days before the stamp.
#
# A live symbol that passes that test was added since the snapshot and is
# named, not failed. One older, or one whose first line carries no date, fails
# by name: an archive holding one symbol of a hundred is not a restore. A
# restored symbol missing live fails. A restore holding no data file, or no
# bars, fails: a proof over nothing is not a proof.
#
# NO BANK LOCK, deliberately. The lock (bank-lock.sh) exists because the
# backup copies a sidecar and a data file that must agree, and the bank writes
# them in two steps. This script reads no live sidecar. It reads live data
# files only as prefixes, line counts and first lines, and an append in flight
# only extends a file past the bytes compared. The live bar count can include
# bars in flight; it is reported, never asserted. Only a symbol's very first
# write, caught mid-line, could fail a first line, and that fails loud rather
# than passing. Holding the lock would stop a bank run for the whole
# comparison and protect nothing this check depends on.
#
# macOS `cmp -n` IS NOT A PREFIX TEST. Measured 2026-09-22 on /usr/bin/cmp:
# with a="abc\n" and b="abc\ndef\n", `cmp -n 3 a b` exits 1 with "EOF on a".
# It reports unequal file lengths even inside the limit, which is exactly the
# case here, since the live file is longer. The prefix is compared by piping
# `head -c <size>` of the live file into cmp. An empty restored file is the
# head of anything and is not compared: macOS `head -c 0` exits 1.
#
# WHY IT IS NOT THE DAILY JOB. It downloads and unpacks a whole archive, like
# verify-postgres-restore.sh, and is to be run weekly beside it on the
# fleet-health cadence. Nothing schedules it yet: its CADENCE.md row in
# windwardline/windwardline is still to be added. From a checkout:
#
#   ~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- bash scripts/ops/verify-minute-bank-restore.sh
#
# Run from a checkout, it reads that checkout's .minute-bank. Run from any
# other tree, such as wl-repo-script's extract of origin/main, name the
# checkout inside wl-secret's command. wl-secret execs its child under
# `env -i`, so a LEVELFLOW_CHECKOUT set in the calling shell never arrives:
#
#   ~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- env LEVELFLOW_CHECKOUT=<checkout> bash <tree>/scripts/ops/verify-minute-bank-restore.sh
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

# The daily push has stopped when its newest archive is older than this.
MAX_AGE_DAYS=3
# How far before its snapshot's stamp a symbol the archive lacks may start and
# still be new. A symbol's first undated fetch reaches about three days back,
# so one first banked after the snapshot begins up to ~3 days before it; the
# fourth day allows for the provider's New York dates against a UTC stamp.
NEW_SYMBOL_REACH_DAYS=4
# A bar's date as the bank writes it: the provider's own string.
BAR_DATE_RE='^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])( [0-9]{2}:[0-9]{2}:[0-9]{2})?$'

# Days since 1970-01-01 of a calendar date given as year, month, day. Pure
# arithmetic (the civil-from-days inverse), because BSD and GNU date disagree
# on how to parse one.
day_number() {
  local y=$((10#$1)) m=$((10#$2)) d=$((10#$3))
  if (( m <= 2 )); then y=$(( y - 1 )); fi
  local era=$(( y / 400 ))
  local yoe=$(( y - era * 400 ))
  local doy=$(( (153 * ((m + 9) % 12) + 2) / 5 + d - 1 ))
  echo $(( era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468 ))
}

# THE LIVE BANK, never an absent one read as empty. A named checkout that does
# not exist is refused by name rather than falling back to this repository.
if [[ -n ${LEVELFLOW_CHECKOUT:-} ]]; then
  [[ -d $LEVELFLOW_CHECKOUT ]] || die "LEVELFLOW_CHECKOUT names no directory: $LEVELFLOW_CHECKOUT"
  CHECKOUT="$LEVELFLOW_CHECKOUT"
else
  CHECKOUT="$REPO"
fi
BANK="$CHECKOUT/.minute-bank"
[[ -d $BANK ]] || die "no live bank at $BANK; refusing to compare a restore with a bank that is not there (name the checkout that holds it inside wl-secret's command, as \`-- env LEVELFLOW_CHECKOUT=<checkout> bash ...\`; wl-secret drops the calling shell's environment)"

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
# An archive can carry a directory at mode 000, and rm -rf cannot remove a
# directory it cannot read, even an empty one (measured on macOS rm, 2026-09-22).
cleanup() { chmod -R u+rwX "$WORK" 2>/dev/null || true; rm -rf "$WORK"; }
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

# A recent archive, by the stamp the push wrote (the UTC day of its snapshot).
# Proving an old one proves only that the push worked once. A stamp later than
# today is refused too: it would sort newest and hide a push that has stopped.
STAMP_DAY="$(day_number "${STAMP:0:4}" "${STAMP:4:2}" "${STAMP:6:2}")"
TODAY="$(date -u +%Y%m%d)"
AGE=$(( $(day_number "${TODAY:0:4}" "${TODAY:4:2}" "${TODAY:6:2}") - STAMP_DAY ))
[[ $AGE -ge 0 ]] \
  || die "the newest archive, $NEWEST, is stamped $STAMP, later than today ($TODAY UTC); a mis-stamped archive sorts newest and hides a push that has stopped"
[[ $AGE -le $MAX_AGE_DAYS ]] \
  || die "the newest archive, $NEWEST, is stamped $STAMP, $AGE day(s) before today ($TODAY UTC); the daily push has not advanced in more than $MAX_AGE_DAYS days"

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
SNAP="$WORK/restore/$EXPECTED"
# A link in a restore would point the comparison at whatever it names, and a
# link spelled *.jsonl would never be counted as data. Two levels reach every
# entry in the snapshot without opening a directory inside it, so one the
# archive carried at mode 000 is named below rather than failing this walk.
ODD="$({ cd "$WORK/restore" && find . -maxdepth 2 ! -type f ! -type d | tr '\n' ' '; } 2>"$WORK/find.err")" \
  || die "could not walk the restore of $NEWEST: $(head -3 "$WORK/find.err")"
[[ -z $ODD ]] || die "$NEWEST holds entries that are neither files nor directories: $ODD"
# The bank is flat, so a directory inside the snapshot is refused by name.
# -prune names it without opening it.
SUBDIRS="$({ cd "$SNAP" && find . -mindepth 1 -type d -prune | sed 's|^\./||' | tr '\n' ' '; } 2>"$WORK/find.err")" \
  || die "could not read $EXPECTED in the restore of $NEWEST: $(head -3 "$WORK/find.err")"
[[ -z $SUBDIRS ]] || die "$NEWEST holds subdirectories under $EXPECTED, and the bank is flat: $SUBDIRS"

# --- the comparison ----------------------------------------------------------
(cd "$SNAP" && find . -type f -name '*.jsonl' -print0 | sort -z) >"$WORK/restored.list" 2>"$WORK/find.err" \
  || die "could not list the data files restored from $NEWEST: $(head -3 "$WORK/find.err")"
(cd "$SNAP" && find . -type f -name '*.state.json' -print0 | sort -z) >"$WORK/sidecars.list" 2>"$WORK/find.err" \
  || die "could not list the sidecars restored from $NEWEST: $(head -3 "$WORK/find.err")"
(cd "$BANK" && find . -type f -name '*.jsonl' -print0 | sort -z) >"$WORK/live.list" 2>"$WORK/find.err" \
  || die "could not list the live bank at $BANK: $(head -3 "$WORK/find.err")"

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

# A live symbol the archive lacks passes only if it began after the snapshot;
# otherwise an archive holding one symbol of a hundred would certify as a bank
# that grew by ninety-nine. Its first line dates it: the bank appends and never
# rewrites, and a run appends its bars oldest first, so the first line is the
# oldest bar of the symbol's first fetch. Late fills land after it, never
# before (docs/minute-bank.md, "Shape").
#
# Prints that bar's calendar day as YYYYMMDD, or the reason there is none.
first_bar_day() {
  local line when
  line="$(head -n 1 "$1" 2>/dev/null)" || { echo "its first line cannot be read"; return 1; }
  # jq prints a first value before it fails on what follows it, so a first
  # line carrying anything after its record yields no date at all.
  when="$(printf '%s\n' "$line" | jq -r '.date' 2>/dev/null)" || when=""
  [[ $when =~ $BAR_DATE_RE ]] || { echo "its first line carries no parseable date ('${line:0:80}')"; return 1; }
  echo "${BASH_REMATCH[1]}${BASH_REMATCH[2]}${BASH_REMATCH[3]}"
}

LIVE_BARS=0
ADDED=""
while IFS= read -r -d '' rel; do
  rel="${rel#./}"
  if [[ ! -f $SNAP/$rel ]]; then
    if ! first="$(first_bar_day "$BANK/$rel")"; then
      fail "$rel — absent from the archive, and $first, so it cannot be dated against $STAMP"
      continue
    fi
    gap=$(( STAMP_DAY - $(day_number "${first:0:4}" "${first:4:2}" "${first:6:2}") ))
    if [[ $gap -gt $NEW_SYMBOL_REACH_DAYS ]]; then
      fail "${rel%.jsonl} predates $STAMP and the archive does not hold it; its first live bar is ${first:0:4}-${first:4:2}-${first:6:2}, $gap day(s) before the snapshot"
      continue
    fi
    ADDED="$ADDED ${rel%.jsonl}"
  fi
  n="$(wc -l <"$BANK/$rel" | tr -d ' ')" || die "could not read the live $rel"
  LIVE_BARS=$(( LIVE_BARS + n ))
done <"$WORK/live.list"

[[ -z $FAILURES ]] || die "$NEWEST does not restore the live bank:$FAILURES"
[[ $RESTORED_BARS -gt 0 ]] \
  || die "$NEWEST restored $FILES data file(s) holding no bars; refusing to certify a restore that examined nothing"
[[ -z $ADDED ]] || log "live symbol(s) added since $STAMP, not in the archive:$ADDED"

echo "$(date -u +%FT%TZ) mb-restore-check: restore proven: R2:$BUCKET/$PREFIX/$NEWEST: $FILES data file(s), $RESTORED_BARS restored bar(s), $LIVE_BARS live bar(s)"
