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

SYMBOLS="AUDCAD,AUDCHF,AUDJPY,AUDNZD,AUDUSD,CADCHF,CADJPY,CHFJPY,EURAUD,EURCAD,EURCHF,EURGBP,EURJPY,EURNZD,EURUSD,GBPAUD,GBPCAD,GBPCHF,GBPJPY,GBPNZD,GBPUSD,NZDCAD,NZDCHF,NZDJPY,NZDUSD,USDCAD,USDCHF,USDJPY,BZUSD,CLUSD,ESUSD,GCUSD,HGUSD,MGCUSD,NGUSD,NQUSD,RTYUSD,SIUSD,YMUSD,ZBUSD,ZNUSD,XAUUSD,XAGUSD,WTI,BRENT,ADAUSD,BCHUSD,BNBUSD,BTCUSD,ETHUSD,LTCUSD,SOLUSD,XRPUSD,SP,NSDQ,DOW,NIKKEI,DAX"

echo "$(date -u +%FT%TZ) top-up starting"
npx tsx scripts/replay-sweep.ts --symbols "$SYMBOLS" --days max --warm-only
echo "$(date -u +%FT%TZ) top-up complete"
