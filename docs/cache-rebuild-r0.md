# Rebuilding `.calibration-cache` under one clock (R0)

Phase 0 of `docs/research/remediation-program-2026-08-11.md`, operational
half. The code half shipped 2026-08-18: every rolling store now records
the normalization that wrote it (`BAR_CLOCK` in the analyzer's `bars.ts`,
`CALENDAR_CLOCK` in `scripts/clockWitness.ts`), an unstamped or
mismatched store **refuses to load** (`cacheClockMismatch`), the manifest
carries the clock and per-series witnesses, and every corpus reader
refuses a corpus that cannot prove its clock. The condemned 3.9 GB store
on the studio machine therefore cannot be read, topped up, or quietly
deepened by anything at this commit or later — the only way forward is
this rebuild.

**This runbook runs on the studio machine** (where `.calibration-cache`
lives). Nothing here touches the minute bank — it is a separate
append-only store with its own launchd agent, probes its provider's clock
per symbol, and was never carried by the defect. Leave it running.

## 0. Preconditions — do not start early

- **FMP's trailing-30-day allowance must have recovered.** The sweep spend
  ages out around **2026-09-12**. A rebuild against an exhausted allowance
  burns requests into 429s and cannot succeed (HANDOFF §1: "Do not re-run
  the bank into a 429"). Probe with one cheap request:

  ```sh
  FMP_API_KEY="$(security find-generic-password -a peacock -s fmp-api-key -w)" \
    sh -c 'curl -s -o /dev/null -w "%{http_code}\n" "https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=EURUSD&from=2026-09-10&to=2026-09-12&apikey=$FMP_API_KEY"'
  ```

  `200` → proceed. `429` → stop; the window has not drained. Re-probe
  daily, not hourly — probes are cheap but not free.

- Be on a commit that includes the R0 change set (`git log --oneline |
  grep -i "one clock"` or check that `scripts/verify-cache-clock.ts`
  exists).

## 1. Archive the condemned store

Keep it until the rebuild verifies — it is evidence, not yet garbage:

```sh
cd ~/Projects/levelflow-cloud
mv .calibration-cache .calibration-cache-condemned-2026-08-11
```

(The `INVALID-READ-ME.txt` marker inside travels with it.)

## 2. Rebuild — the ordinary warm path, with a declared ceiling

The rebuild is not a special code path: it is a cold cache warmed by the
same `--warm-only` run the nightly top-up performs, fetching every roster
symbol's full 15-minute, 5-minute and daily history plus the economic
calendar and COT contracts, all through the current normalizer, all
stamped. The nightly top-up script already wraps it with the keychain
read and the stand-down discipline, so use it directly:

```sh
TOPUP_BYTE_BUDGET=30gb bash scripts/ops/daily-cache-topup.sh
```

(Equivalently, with the key already in the environment, the direct form
is `npx tsx scripts/replay-sweep.ts --symbols roster --days max
--warm-only --byte-budget 30gb` — the wrapper only adds the keychain read
and the named stand-downs.)

- **Budget arithmetic**: 15-minute full depth is ~3 GB across the roster
  (deepest symbols ~380k bars ≈ 45 MB each; futures-era symbols ~6 MB),
  the repaired 5-minute fetch ~3× the rows over its shallower spans
  (~6–9 GB), daily/calendar/COT well under 0.2 GB — call it **9–12 GB
  expected**. 30 GB is headroom for retries and estimate error against
  the 150 GB monthly allowance, not a target. Raising it further is a
  decision, per §21j.
- **Duration**: ~65k requests at the built-in 250 ms pacing ≈ 5–8 hours.
  Run it overnight. It is **resumable**: completed symbols persist
  (pinned for the day), a re-run tops up cheaply and continues; a symbol
  that failed mid-fetch rewinds to its start.
- The 5-minute chunk size is 6 days at this commit (`INTRADAY_CHUNK_DAYS`
  in `scripts/replay-sweep.ts`) — the 1b sawtooth fix. If any chunk trips
  the response-cap tripwire, the run stops by design; shrink the chunk
  size rather than resuming past it.
- Do not run sweeps or the full test suite on the machine while this
  runs.

## 3. Verify — the cache proves its clock, or it is not rebuilt

```sh
npx tsx scripts/verify-cache-clock.ts
```

Green requires, for every store: the expected clock stamp; no witness
condemning a series (daily stamps at New York midnight, spring-transition
days full, weekly opens moving with DST where the venue does); every
15min/5min pair registering at zero shift; and a 5min/15min density near
3 over the shared span (the sawtooth read ~0.6–1.0). Any red line: the
rebuild did not take — do not sweep, do not delete the archive, diagnose.

For the record, the same command pointed at the condemned store should
fail on every store — it predates the stamp:

```sh
npx tsx scripts/verify-cache-clock.ts --cache-dir .calibration-cache-condemned-2026-08-11
```

## 4. Re-arm the nightly top-up

The remediation program recorded the agent booted out on 2026-08-11; the
#355/#356 comments (2026-08-16) assumed it was still loaded and failing.
Whichever is true, the store guard has made both states safe — a loaded
agent stands down by name against an unstamped store. Check, then ensure
it is loaded:

```sh
launchctl print "gui/$(id -u)/com.windwardline.levelflow-cache-topup" >/dev/null 2>&1 \
  || launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.windwardline.levelflow-cache-topup.plist
```

Next 07:00 run should log `top-up complete`. A rebuilt cache that
silently stops updating is the same failure class inverted — confirm one
green nightly log before calling Phase 0 done.

## 5. Delete the archive

After step 3 is green and step 4 has produced one green nightly run:

```sh
rm -rf .calibration-cache-condemned-2026-08-11
```

## What this rebuild cannot lose

Nothing in `.calibration-cache` is unrecoverable: FMP serves 15-minute
history to each symbol's provider floor (forex 2010, crypto 2013+,
futures 2023+), 5-minute to its own shallower floor, daily deeper than
either, the calendar from 2013 and COT from 2009. The **unrecoverable**
population is the 1-minute bank's blackout gap (2026-08-13 →
allowance recovery), which lives in a different store and a different
program (§21). Do not conflate the two.

## Why wipe-and-refetch, not re-stamp in place

A re-stamp of the naive segments looks cheaper (zero bytes) but must:
find the per-store boundary where the two eras meet (~2026-08-03, store
by store), dissolve the duplicate bars the top-up overlap created there
(same market data at stamps 4–5 h apart), accept the fall-back-hour
collisions the naive era already lost, and get all of that right with no
independent series to check against — a clever repair whose failure mode
is exactly the defect class being remediated, on the data that decides
every downstream phase. The audit used re-stamping as a *diagnostic*
(three symbols, two-line diff); as a *store repair* it was rejected. The
5-minute series must be refetched regardless (the 1b sawtooth holed two
thirds of it), and it is most of the bytes — so the honest option costs
little more than the clever one and is verifiable by
`verify-cache-clock` from a clean slate.
