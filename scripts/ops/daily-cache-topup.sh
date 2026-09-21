#!/usr/bin/env bash
# Daily calibration-cache top-up (r17 hardening, owner directive).
# Runs from launchd (com.windwardline.levelflow-cache-topup): tops up the
# rolling bar, calendar and treasury stores for the full universe and pins
# today; COT contract files are fetched only when absent and never topped up.
# Idempotent — a day already pinned fetches nothing. Logs carry no secrets.
set -euo pipefail

# Derived from this script's own location, never hardcoded: launchd runs it
# through `wl-repo-script`, which extracts origin/main into a temporary tree.
REPO="${LEVELFLOW_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$REPO"

# CODE AND DATA ARE TWO DIFFERENT PLACES. $REPO is the extracted tree: code
# only, no cache, no FMP state, no node_modules. LEVELFLOW_CHECKOUT names the
# checkout whose ignored state is real, and `.fmp-state/` (the byte ledger, the
# breaker log, the run gate's markers) and the legacy ledger and marker resolve
# through it (scripts/checkoutState.ts). Run by hand from that checkout, the two
# are one directory and nothing below changes.
CHECKOUT="${LEVELFLOW_CHECKOUT:-$REPO}"
CACHE="${LEVELFLOW_CACHE_DIR:-$CHECKOUT/.calibration-cache}"

# NEVER WARM A CACHE IMPLICITLY. The sweep's default cache is the RELATIVE path
# `.calibration-cache`, and it creates what it does not find. From the extracted
# tree that is an empty directory, and `--warm-only --days max` against an empty
# cache warms the whole roster from nothing — the run that spent a 150 GB
# allowance in days. The top-up class's 256 MiB day would halt it there, every
# night, into a directory deleted on exit, and the log would say "top-up
# complete". A new cache is a deliberate act (docs/cache-rebuild-r0.md), never
# a default.
if [[ ! -d $CACHE ]]; then
  echo "$(date -u +%FT%TZ) top-up FAILED: no calibration cache at $CACHE; refusing to warm a new cache implicitly (set LEVELFLOW_CHECKOUT or LEVELFLOW_CACHE_DIR)"
  exit 1
fi

# The toolchain is the checkout's: linked, not installed, so no run reaches the
# npm registry, and `rm -rf` of the tree removes the link without following it.
if [[ ! -e $REPO/node_modules ]]; then
  ln -s "$CHECKOUT/node_modules" "$REPO/node_modules"
fi
TSX="$REPO/node_modules/.bin/tsx"
[[ -x $TSX ]] || { echo "$(date -u +%FT%TZ) top-up FAILED: tsx is not installed at $TSX; run npm ci in $CHECKOUT"; exit 1; }

# The run gate (scripts/fmpRunGate.ts). RunAtLoad fires this job at every
# login; a login after a clean run that finished at or after the most recent
# scheduled slot buys what the next slot will buy again. It fails toward
# running: only exit 75 WITH its skip line skips, and any other outcome — an
# error, a missing plist, a torn marker — runs the job. The marker is the
# CHECKOUT's (LEVELFLOW_CHECKOUT): read from the extracted tree it would never
# exist, and every login would run the top-up again. It names the cache it
# describes, so a clean hand run against another cache (LEVELFLOW_CACHE_DIR)
# never skips this one's next login run.
set +e
gate_out=$("$TSX" "$REPO/scripts/fmpRunGate.ts" --job cache-topup --dir "$CACHE" 2>&1)
gate=$?
set -e
printf '%s\n' "$gate_out"
if [ "$gate" -eq 75 ] && grep -q '^runGate: skip' <<<"$gate_out"; then
  echo "$(date -u +%FT%TZ) top-up skipped by the run gate"
  exit 0
fi

# NEVER SPEND INTO A TEMPORARY DIRECTORY. The production cache lives in the
# checkout; nothing legitimate warms one under a temp root. The tests keep the
# keychain out of reach (tests/support/noKeychain.ts), but on 2026-09-20 red
# runs and mutations of the minute bank's tests fetched six full FMP rosters,
# so the script refuses on its own as well — after the link, so a test can
# assert the link for free, and before the keychain, so nothing past it spends.
CACHE_REAL="$(cd "$CACHE" && pwd -P)"
for tmp_root in "${TMPDIR:-/tmp}" /tmp /var/folders; do
  tmp_real="$(cd "$tmp_root" 2>/dev/null && pwd -P)" || continue
  case "$CACHE_REAL/" in
    "${tmp_real%/}/"*)
      echo "$(date -u +%FT%TZ) top-up FAILED: the cache at $CACHE is under the temporary root $tmp_real; refusing to spend FMP bandwidth on a directory that will not survive"
      exit 1
      ;;
  esac
done

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
# §21j Phase 1 (#347) made --byte-budget mandatory, and the governor
# (scripts/fmpGovernor.ts) charges this run to the top-up class, whose share
# of the UTC day is 256 MiB counting every process. The largest top-up spend
# in any logged run is 0.07 GiB, after an eleven-day gap (09-14T11:00Z).
#
# Stand down for ONE named, proven condition — the bandwidth wall, which
# drains by time — and for the store-stamp refusal whose one clearing action
# is the documented rebuild. Everything else goes red. Uncertainty resolves
# toward failing, never toward standing down: a false stand-down hides a real
# regression, which is the expensive direction.
set +e
out=$("$TSX" "$REPO/scripts/replay-sweep.ts" --cache-dir "$CACHE" \
  --symbols roster --days max --warm-only --spend-class topup --byte-budget 256mb 2>&1)
rc=$?
set -e
printf '%s\n' "$out"

# Must-stay-red refusals outrank every stand-down (#364 round 23) AND the
# driver's own exit 0. The driver defers treasury integrity refusals and
# provider refusals no wait clears (fmpDeferredRefusal) past the bar survey, so
# a terminal bandwidth wall can share this output with one of these tokens. A
# ledger or breaker write that failed (fmpBookkeepingFailed) can happen on a
# path that warns and continues — a COT refusal no wall explains, a tolerated
# treasury warning — and the driver exits 1 for it only at the end of the run;
# this guard does not rely on that, so a clean exit carrying any of these
# tokens is still red and records no clean-run marker. Checked before every
# other branch for those reasons; exits 1, never 0.
if grep -qE 'cacheStoreUnreadable|cacheClockWitnessRefused|treasuryCoverageRefused|treasuryChunkHole|treasuryChunkTruncated|fmpDeferredRefusal|fmpBookkeepingFailed' <<<"$out"; then
  # Name WHICH condition fired (#364 round 24, smaller): each token has its
  # own remedy, and with the driver's deferral the token line can sit
  # thousands of log lines above the failure that ended the run.
  tokens=$(grep -oE 'cacheStoreUnreadable|cacheClockWitnessRefused|treasuryCoverageRefused|treasuryChunkHole|treasuryChunkTruncated|fmpDeferredRefusal|fmpBookkeepingFailed' <<<"$out" | sort -u | xargs)
  echo "$(date -u +%FT%TZ) top-up FAILED: must-stay-red refusal ($tokens) — that token's own log line above names the remedy; a co-occurring bandwidth wall does not stand this down"
  exit 1
fi

if [ "$rc" -eq 0 ]; then
  echo "$(date -u +%FT%TZ) top-up complete"
  # The marker follows a clean exit with no must-stay-red token: a marker that
  # could not be written costs one extra boot run, never a failed top-up.
  set +e
  "$TSX" "$REPO/scripts/fmpRunGate.ts" --job cache-topup --dir "$CACHE" --record-clean
  rec=$?
  set -e
  if [ "$rec" -ne 0 ]; then
    echo "$(date -u +%FT%TZ) run marker not written (exit $rec)"
  fi
  exit 0
fi

# THE TERMINAL TOKEN. The driver prints exactly one line for the error that
# ended the run: `fmpStandDown: kind=<kind> source=<source>` for a governor,
# breaker or provider refusal, or `cacheStandDown: kind=clockMismatch` for a
# store stamped under another clock. Nothing else in the output is read — a
# tolerated treasury 429 or a deferred clock warning earlier in the log can
# never stand down a run that died of something unrelated. Herestrings, not
# printf|grep: under pipefail an early-exiting grep can SIGPIPE the writer.
terminal=$(grep -E '^(fmpStandDown|cacheStandDown): ' <<<"$out" || true)
count=$(grep -c . <<<"$terminal" || true)
if [ "$count" -eq 1 ]; then
  case "$terminal" in
    "fmpStandDown: kind=bandwidth "*)
      echo "$(date -u +%FT%TZ) STOOD DOWN: FMP bandwidth allowance exhausted; it drains by time. Cache not topped up; not a regression. See §21j."
      exit 0
      ;;
    "cacheStandDown: kind=clockMismatch"*)
      # Per-store remedies (#364 round 24, finding 2): the cacheClockMismatch
      # line above names WHICH store, and the two clocks clear differently.
      echo "$(date -u +%FT%TZ) STOOD DOWN: a rolling store's clock does not match this build — the cacheClockMismatch line above names WHICH store. A bar store (BAR_CLOCK: pre-R0 store, or a BAR_CLOCK bump without its rebuild) means rebuild per docs/cache-rebuild-r0.md. A treasury or calendar store (CALENDAR_CLOCK) clears by deleting that one rolling store and re-running; the driver defers the treasury case, so the bar top-up above may already be complete."
      exit 0
      ;;
    *)
      echo "$(date -u +%FT%TZ) top-up FAILED: $terminal — only a bandwidth wall stands down green"
      exit 1
      ;;
  esac
fi

echo "$(date -u +%FT%TZ) top-up FAILED (exit $rc)"
exit "$rc"
