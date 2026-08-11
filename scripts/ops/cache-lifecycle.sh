#!/usr/bin/env bash
# Disk lifecycle for the measurement caches (round-8 OP-5).
#
# Three named populations, three rules:
#   1. LEGACY date-keyed cache files (.calibration-cache/*-2026-*.json era):
#      superseded by the rolling stores in r17 — deletable on sight. The
#      migration read them once; nothing reads them again (~2.8GB found).
#   2. Finished sweep emits (sweeps/**/*.jsonl older than KEEP_DAYS):
#      the corpus of record is the manifest + the verdicts doc; a raw
#      emit older than the window is re-creatable from the warm cache at
#      fleet speed and does not earn its gigabytes.
#   3. The minute bank is NEVER touched here: it is the E8-verification
#      corpus with its own launchd automation and its own append-only
#      discipline.
#
# DRY RUN by default — prints what would go and its size. --apply deletes.
# Logs carry no secrets.
set -euo pipefail

REPO="/Users/peacock/Projects/levelflow-cloud"
CACHE_DIR="$REPO/.calibration-cache"
SWEEPS_DIR="$REPO/sweeps"
KEEP_DAYS="${KEEP_DAYS:-14}"
MODE="dry-run"
[ "${1:-}" = "--apply" ] && MODE="apply"

echo "$(date -u +%FT%TZ) cache lifecycle ($MODE, keep ${KEEP_DAYS}d of emits)"

# 1. Legacy date-keyed cache files: the rolling store has no date in its
#    filename; anything matching -20[0-9][0-9]-[0-9][0-9]-[0-9][0-9].json
#    is the old scheme.
legacy_count=0
legacy_bytes=0
while IFS= read -r -d '' file; do
  legacy_count=$((legacy_count + 1))
  legacy_bytes=$((legacy_bytes + $(stat -f %z "$file")))
  [ "$MODE" = "apply" ] && rm "$file"
done < <(find "$CACHE_DIR" -maxdepth 1 -name '*-20[0-9][0-9]-[0-9][0-9]-[0-9][0-9].json' -print0 2>/dev/null)
echo "legacy date-keyed cache files: $legacy_count ($((legacy_bytes / 1024 / 1024))MB)"

# 2. Sweep emits older than the window. Manifests, symbol lists, fold
#    specs and logs stay — they are small and they are the record.
emit_count=0
emit_bytes=0
while IFS= read -r -d '' file; do
  emit_count=$((emit_count + 1))
  emit_bytes=$((emit_bytes + $(stat -f %z "$file")))
  [ "$MODE" = "apply" ] && rm "$file"
done < <(find "$SWEEPS_DIR" -name '*.jsonl' -mtime +"$KEEP_DAYS" -print0 2>/dev/null)
echo "sweep emits older than ${KEEP_DAYS}d: $emit_count ($((emit_bytes / 1024 / 1024))MB)"

if [ "$MODE" = "dry-run" ]; then
  echo "dry run — re-run with --apply to delete"
fi
echo "$(date -u +%FT%TZ) cache lifecycle complete"
