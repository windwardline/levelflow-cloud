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
# Stand down for provider quota, and for nothing else. FMP has been returning
# 429 since the 2026-08-13 blackout (§21j), so this job fails every night on a
# condition that is neither a regression nor actionable — and a launchd agent
# that is always red is one nobody reads, which is how the --byte-budget
# breakage sat here unnoticed in the first place.
#
# Same discipline as the advisor-chart E2E stand-down (#348): the skip is
# allowed only for one named, proven condition, and anything it cannot prove
# goes red. Uncertainty resolves toward failing, never toward standing down —
# a false stand-down hides a real regression, which is the expensive direction.
set +e
out=$(npx tsx scripts/replay-sweep.ts --symbols roster --days max --warm-only \
  --byte-budget "${TOPUP_BYTE_BUDGET:-2gb}" 2>&1)
rc=$?
set -e
printf '%s\n' "$out"

if [ "$rc" -eq 0 ]; then
  echo "$(date -u +%FT%TZ) top-up complete"
  exit 0
fi

# Must-stay-red integrity refusals outrank every stand-down (#364 round
# 23): the driver defers treasury integrity refusals past the bar
# survey, so a terminal roster 429 can share this output with one of
# these tokens — and under the documented 429 blackout that pairing is
# the NORMAL state. Grepped after the 429 branch, a deterministic
# refusal would be downgraded to a quota stand-down (exit 0) forever —
# the false green the tokens exist to prevent. Checked first for that
# reason; exits 1, never 0. cacheClockMismatch is deliberately NOT
# here: it keeps its own named stand-down below (the rebuild is its
# one clearing action), and a treasury-origin mismatch defers in the
# driver, so the bars still warm before that stand-down prints.
if grep -qE 'cacheStoreUnreadable|cacheClockWitnessRefused|treasuryCoverageRefused|treasuryChunkHole' <<<"$out"; then
  echo "$(date -u +%FT%TZ) top-up FAILED: integrity refusal in output (see above) — a co-occurring 429 does not stand this down"
  exit 1
fi

# Herestrings, not printf|grep: under `set -o pipefail`, grep -q exiting
# on an early match can SIGPIPE the printf and flip a legitimate
# stand-down to red (#358 review).
if grep -qE '\(429\)|providerQuotaExhausted|Too Many Requests' <<<"$out"; then
  echo "$(date -u +%FT%TZ) STOOD DOWN: FMP provider quota exhausted (429). Cache not topped up; not a regression. See §21j."
  exit 0
fi

# R0 one clock: the store guard refuses a cache stamped under a different
# (or no) normalization rather than deepening it — the pre-2026-08-11
# mixed-clock store, or a future BAR_CLOCK bump whose rebuild has not run
# yet. Like the 429 branch, this is one named, proven condition whose one
# clearing action is the deliberate rebuild in docs/cache-rebuild-r0.md.
# The four must-stay-red integrity tokens (cacheClockWitnessRefused, a
# condemned witness on a STAMPED store; cacheStoreUnreadable, a corrupt
# store; and the R1b treasury chunk refusals treasuryCoverageRefused /
# treasuryChunkHole) are matched ABOVE this branch and above the 429
# stand-down — fresh, actionable regressions exit 1 there and can never
# be stood down (#364 rounds 21-23). A treasury-origin cacheClockMismatch
# defers in the driver, so this stand-down prints with the bars already
# warmed.
if grep -q 'cacheClockMismatch' <<<"$out"; then
  echo "$(date -u +%FT%TZ) STOOD DOWN: store clock does not match this build (pre-R0 store, or a BAR_CLOCK bump without its rebuild). NOT topped up and NOT usable — rebuild per docs/cache-rebuild-r0.md."
  exit 0
fi

echo "$(date -u +%FT%TZ) top-up FAILED (exit $rc) — no quota signal in the output, so this is a real failure"
exit "$rc"
