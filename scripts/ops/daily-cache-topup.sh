#!/usr/bin/env bash
# Daily calibration-cache top-up (r17 hardening, owner directive).
# Runs from launchd (com.windwardline.levelflow-cache-topup): tops up the
# rolling bar/calendar/COT stores for the full universe and pins today.
# Idempotent — a day already pinned fetches nothing. Logs carry no secrets.
set -euo pipefail

REPO="/Users/peacock/Projects/levelflow-cloud"
cd "$REPO"

FMP_API_KEY="$(security find-generic-password -a peacock -s fmp-api-key -w 2>/dev/null || true)"
if [ -z "$FMP_API_KEY" ]; then
  echo "$(date -u +%FT%TZ) keychain unavailable (locked or missing key); skipping"
  exit 0
fi
export FMP_API_KEY

# OP-9: the roster IS the list — the driver derives it from the engine's
# defaultScanSymbols, so onboarded markets join the top-up the day they
# join the scan and dormant rows leave with their dormancy. The 57-name
# snapshot that used to sit here had silently lost 40+ markets.
echo "$(date -u +%FT%TZ) top-up starting"
npx tsx scripts/replay-sweep.ts --symbols roster --days max --warm-only
echo "$(date -u +%FT%TZ) top-up complete"
