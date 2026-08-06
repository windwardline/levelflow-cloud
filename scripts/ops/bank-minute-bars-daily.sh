#!/usr/bin/env bash
# Daily 1-minute bar bank (owner directive, 2026-08-06).
# Runs from launchd (com.windwardline.levelflow-minute-bank): appends FMP's
# rolling ~3-day 1-minute window to the durable store in .minute-bank/.
# Idempotent — bars already banked are dropped by key.
#
# Why launchd rather than the app's scheduler: the provider window is three
# days wide, so a gap longer than that is permanently unrecoverable. A job that
# only fires while an app happens to be open is not a guarantee. This one runs
# whether or not anything is open, and catches up on wake.
#
# Logs carry no secrets. See docs/minute-bank.md.
set -euo pipefail

REPO="/Users/peacock/Projects/levelflow-cloud"
cd "$REPO"

FMP_API_KEY="$(security find-generic-password -a peacock -s fmp-api-key -w 2>/dev/null || true)"
if [ -z "$FMP_API_KEY" ]; then
  # A locked keychain is a deferral, not a failure — the window is three days
  # wide and the next run will catch up. Said out loud so a run of these in the
  # log reads as the problem it is.
  echo "$(date -u +%FT%TZ) keychain unavailable (locked or missing key); skipping"
  exit 0
fi
export FMP_API_KEY

echo "$(date -u +%FT%TZ) minute-bank run starting"
npx tsx scripts/bank-minute-bars.ts --dir "$REPO/.minute-bank"
echo "$(date -u +%FT%TZ) minute-bank run complete ($(du -sh "$REPO/.minute-bank" | cut -f1))"
