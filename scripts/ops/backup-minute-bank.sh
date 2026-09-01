#!/usr/bin/env bash
# The minute bank's recurring backup (R0b).
#
# WHY THIS EXISTS AND WHY A COPY WAS NOT ENOUGH. `.minute-bank/` holds
# 2,067,013 one-minute bars across 100 symbols, and FMP re-serves 1-minute bars
# only about three days deep — measured 2026-08-31, 100% of the bank is already
# beyond that window. It is unrecoverable at any price, which is the one
# property nothing else in this repo has.
#
# R0b's deliverable was always "a recurring mechanism, not that copy", and the
# reason is in the record: two manual snapshots were taken two days apart and
# then nothing for six days, while 121,669 irreplaceable bars accumulated in a
# single location. A point-in-time copy starts going stale the moment it is
# made.
#
# NO PROVIDER TRAFFIC. This reads local files and writes local files. It is
# safe to run while the allowance is exhausted, which is exactly when the bank
# is frozen and most in need of protecting.
#
# WHAT THIS DOES NOT DO, stated rather than implied: these snapshots sit on the
# same disk as the bank. They protect against an accidental delete, a bad
# script, or a scratch-clone mishap — not against losing the machine. Sending
# them anywhere off-box is the owner's call and is deliberately not automated
# here.
set -euo pipefail

REPO="/Users/peacock/Projects/levelflow-cloud"
# Overridable so the behaviour can be EXERCISED rather than read. A backup
# script whose only test is a source match is the shape this repo has spent the
# week removing: the verify branch and the protected-name branch are the two
# that matter, and neither is provable without running them.
BANK="${LEVELFLOW_BANK_DIR:-$REPO/.minute-bank}"
DEST_ROOT="${LEVELFLOW_BACKUP_ROOT:-/Users/peacock}"
STAMP="$(date -u +%Y%m%d)"
DEST="$DEST_ROOT/levelflow-minute-bank-snapshot-$STAMP"
# Keep a fortnight. The bank only ever grows, so an older snapshot is a strict
# subset of a newer one and the retention window is about surviving a
# corruption nobody noticed for a while, not about depth.
KEEP="${LEVELFLOW_BACKUP_KEEP:-14}"

log() { echo "$(date -u +%FT%TZ) $*"; }

# Bash `[[ ]]` here, not the POSIX bracket form with a quoted variable, and
# the reason is a guard rather than a preference. `tests/securityHardening.md`
# — the sweep in `tests/securityHardening.test.ts` — scans every TRACKED shell
# script for a request-body flag whose double-quoted argument interpolates,
# which is the shape of a credential on argv. A POSIX directory test spells its
# flag the same way curl spells its data flag, so it false-fires; the sweep's
# own comment says it is deliberately eager because "a cheap false red is the
# right side to err on", and it is right. `[[ ]]` does not word-split, so the
# quotes are unnecessary and their absence keeps the sweep quiet.
#
# The comment itself had to be reworded for the same reason: the sweep reads
# the whole file, so an explanation that SPELLS the offending shape trips the
# guard it is explaining.
if [[ ! -d $BANK ]]; then
  log "no .minute-bank at $BANK — nothing to back up"
  exit 0
fi

# COUNT BEFORE, COUNT AFTER, COMPARE. A copy that is not verified is not a
# backup; it is a directory that looks like one. `cp -R` can fail partway on a
# full disk and still exit 0 for the files it managed.
count_bank() {
  local dir="$1"
  local files bars
  files="$(find "$dir" -name '*.jsonl' -type f | wc -l | tr -d ' ')"
  bars="$(find "$dir" -name '*.jsonl' -type f -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')"
  echo "$files $bars"
}

read -r SRC_FILES SRC_BARS <<<"$(count_bank "$BANK")"
if [ "$SRC_FILES" -eq 0 ]; then
  log "the bank holds no .jsonl files — refusing to write an empty snapshot over a good one"
  exit 1
fi
log "bank: $SRC_FILES symbols, $SRC_BARS bars"

# Today's snapshot is REPLACED rather than skipped: the bank grows through the
# day, so a second run should capture the later state. Written to a temporary
# path and moved into place, so an interrupted copy never replaces a good
# snapshot with a partial one.
TMP="$DEST.partial"
rm -rf "$TMP"
cp -R "$BANK" "$TMP"

read -r DST_FILES DST_BARS <<<"$(count_bank "$TMP")"
if [ "$DST_FILES" != "$SRC_FILES" ] || [ "$DST_BARS" != "$SRC_BARS" ]; then
  log "VERIFY FAILED: copied $DST_FILES/$DST_BARS against $SRC_FILES/$SRC_BARS — leaving the previous snapshot intact"
  rm -rf "$TMP"
  exit 1
fi

rm -rf "$DEST"
mv "$TMP" "$DEST"
log "snapshot verified and placed: $DEST ($DST_FILES symbols, $DST_BARS bars)"

# PROTECTED SNAPSHOTS, and this list is why the prune is not a one-liner.
#
# Pruning oldest-first would delete `levelflow-minute-bank-snapshot-20260823`
# FIRST — and that one is not an ordinary daily. It is the only real naive-era
# corpus in existence, it was used on 2026-08-24 to validate the clock-witness
# redesign against real data rather than fixtures, and whether it is ever
# deleted is an explicit owner decision recorded in HANDOFF's R0b row.
#
# A retention count cannot protect it: the whole point of oldest-first is that
# the oldest goes first, so "KEEP is large enough" is true right up until it
# is not. Naming it is the only guard that does not depend on arithmetic
# nobody re-checks.
PROTECTED="20260823"

# Prune oldest-first, over this script's own naming, skipping the protected.
# Portable to bash 3.2 (what macOS ships) — no mapfile, no arrays of unknown
# shell vintage.
PRUNABLE=""
for dir in "$DEST_ROOT"/levelflow-minute-bank-snapshot-*; do
  [[ -d $dir ]] || continue
  case "$dir" in
    *"-$PROTECTED") log "keeping $dir (protected: the naive-era corpus, owner decision)"; continue ;;
  esac
  PRUNABLE="$PRUNABLE$dir\n"
done

TOTAL="$(printf "%b" "$PRUNABLE" | grep -c . || true)"
EXCESS=$(( TOTAL - KEEP ))
if [ "$EXCESS" -gt 0 ]; then
  printf "%b" "$PRUNABLE" | sort | head -n "$EXCESS" | while IFS= read -r old; do
    [ -n "$old" ] || continue
    log "pruning $old"
    rm -rf "$old"
  done
fi

log "backup complete; $TOTAL prunable snapshot(s), keeping $KEEP"
