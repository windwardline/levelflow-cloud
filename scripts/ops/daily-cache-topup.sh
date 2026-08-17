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
# §21j Phase 1 (#347, 2026-08-16) made --byte-budget mandatory: the sweep will
# not start without a declared ceiling. This job was never updated to match and
# has failed every run since — launchd recorded the non-zero exit and told
# nobody, so the calibration cache quietly stopped being topped up.
#
# 2 GiB is a daily ceiling, not a sweep ceiling. This run is --warm-only and
# idempotent: a day already pinned fetches nothing, so steady state is one day
# of bars for the roster. The ceiling exists to halt a runaway — a cold cache
# under --days max is what spent a 150 GB allowance in days. Raising it is a
# decision, per §21j; override for a one-off backfill without editing this file:
#   TOPUP_BYTE_BUDGET=20gb launchctl kickstart -k gui/$(id -u)/com.windwardline.levelflow-cache-topup
npx tsx scripts/replay-sweep.ts --symbols roster --days max --warm-only \
  --byte-budget "${TOPUP_BYTE_BUDGET:-2gb}"
echo "$(date -u +%FT%TZ) top-up complete"
