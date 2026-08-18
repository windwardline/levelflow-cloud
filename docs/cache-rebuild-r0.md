# Rebuilding `.calibration-cache` under one clock (R0)

Phase 0 of `docs/research/remediation-program-2026-08-11.md`, operational
half. The code half shipped 2026-08-18 and was hardened the same day by
an adversarial review round (PR #358): every rolling store records the
normalization that wrote it (`BAR_CLOCK` in the analyzer's `bars.ts`,
`CALENDAR_CLOCK` in `scripts/clockWitness.ts`); an unstamped or
mismatched store **refuses to load** (`cacheClockMismatch`), and a
corrupt or truncated one refuses too (`cacheStoreUnreadable`) instead of
silently refetching; the manifest carries the clock and per-year
witnesses; every corpus reader — the aggregation doors *and* all nine
bare emit readers, the population pinned by a sweep-style test over the known
line-reading idioms — refuses a corpus that cannot prove its clock, and
since round 4 refuses a corpus whose STATED clock is not this build's
(a BAR_CLOCK bump forces the re-sweep, not just the cache rebuild). The
condemned 3.9 GB store on the studio machine therefore cannot be read,
topped up, or quietly deepened by anything at this commit or later — the
only way forward is this rebuild.

**This runbook runs on the studio machine** (where `.calibration-cache`
lives). Nothing here touches the minute bank — it is a separate
append-only store with its own launchd agent, probes its provider's clock
per symbol, and was never carried by the defect. Leave it running.

## 0. Preconditions — SATISFIED 2026-08-18

- **The allowance recovered early.** The owner purchased a **100 GB plan
  upgrade** on 2026-08-18, ending the blackout ahead of the ~2026-09-12
  drain date. Probed the same day from the rebuild PR's session (via the
  FMP connector, which shares the account): a quote request returned
  **200** — no 429. If this runbook is being executed much later, re-run
  one cheap probe first:

  The key rides a 600-mode curl config read with `-K`, never the URL on
  argv — the query-string form is inside the never-argv law's scope
  (#363 round 6; `ps -ax` on the studio machine shows argv, and a key
  inside a URL is still a key):

  ```sh
  f="$(mktemp)" && chmod 600 "$f" && \
    printf 'url = "https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=EURUSD&from=2026-09-10&to=2026-09-12&apikey=%s"\n' \
      "$(security find-generic-password -a peacock -s fmp-api-key -w)" > "$f" && \
    curl -sS -o /dev/null -w "%{http_code}\n" -K "$f"; rm -f "$f"
  ```

- **The `to`-inclusivity and BOTH caps are SETTLED, measured 2026-08-18:**
  `historical-chart/5min?symbol=BTCUSD&from=2026-08-10&to=2026-08-15`
  returned **1,728 rows — six full dates at 288 bars each**, so `to` is
  **inclusive** and the chunk plan's worst case (chunkDays+1 dates) is
  the real case; an 8-date 5-minute window returned **2,304 rows
  complete** (cap ≥ 2,304 — the audit-era ~2,000 clip is not currently
  binding); and a 29-day 15-minute window (`2026-07-15..2026-08-13`)
  returned **2,880 rows — 30 dates at 96/96 min/max per date, complete**
  (cap ≥ 2,880; the 15-minute cap had never been measured before). The
  sizing stays conservative (5/29 days). A future clip cannot be caught
  from inside one response without false positives — the guard is these
  measured facts and the verifier's density floor AND ceiling, whose
  sensitivity band is stated rather than overclaimed: a clipped
  15-minute primary inflates the 5min/15min ratio, and the 3.5 ceiling
  catches any cap below ~2,386; between ~2,386 and 2,784 only the
  15-minute series clips (up to ~14%) and the ratio stays in band —
  that blind band is carried by R1's E2 door. Tightening the ceiling is
  a data-informed follow-up once step 3 yields real ratios (record them).

- **Run the minute bank FIRST if it has not already resumed** — this is
  the time-critical piece, not the rebuild: FMP serves 1-minute bars
  only ~3 days deep, so each hour before the bank's next successful run
  is recoverable history expiring. If the bank's launchd agent is
  loaded, kickstart it; the rebuild can then proceed at leisure:

  ```sh
  launchctl kickstart -k "gui/$(id -u)/com.windwardline.levelflow-minute-bank"
  ```

- Be on a commit that includes the R0 change set (`scripts/intradayChunks.ts`
  exists).

## 1. Stop the nightly agent, then archive the condemned store

The 07:00 top-up agent (`RunAtLoad` included — a reboot mid-rebuild fires
it too) must not write into a cache that is mid-rebuild: after the `mv`,
stores are absent or half-written, not unstamped, so the clock guard has
nothing to refuse. Boot it out first; step 4 re-arms it.

```sh
launchctl bootout "gui/$(id -u)/com.windwardline.levelflow-cache-topup" 2>/dev/null || true
```

Archive the condemned store **outside the repository** — an in-repo
untracked directory is one `git clean -dfx` from deletion, and this
project has already lost one state-of-record artifact exactly that way:

```sh
cd ~/Projects/levelflow-cloud
mv .calibration-cache ~/levelflow-cache-condemned-2026-08-11
```

(The `INVALID-READ-ME.txt` marker inside travels with it. The cot-*.json
contract files travel too — they are bespoke, unstamped, and covered by
this archive rather than by the store guard.)

## 2. Rebuild — the ordinary warm path, with a declared ceiling

The rebuild is not a special code path: it is a cold cache warmed by the
same `--warm-only` run the nightly top-up performs, fetching every roster
symbol's full 15-minute, 5-minute and daily history plus the economic
calendar and COT contracts, all through the current normalizer, all
stamped, all witness-checked as they load. Run it directly so the output
streams (the launchd wrapper buffers everything until exit, which for a
run this long reads as a hang):

```sh
FMP_API_KEY="$(security find-generic-password -a peacock -s fmp-api-key -w)" \
  npx tsx scripts/replay-sweep.ts --symbols roster --days max --warm-only \
  --byte-budget 30gb 2>&1 | tee ~/levelflow-rebuild-$(date +%Y%m%d).log
```

- **Budget arithmetic**: 15-minute full depth is ~3 GB across the roster
  (deepest symbols ~380k bars ≈ 45 MB each; futures-era symbols ~6 MB),
  the repaired 5-minute fetch ~3× the rows over its shallower spans
  (~6–9 GB), daily/calendar/COT well under 0.2 GB, plus up to ~20% for
  the shared boundary date each chunk refetches — call it **10–14 GB
  expected**. 30 GB is headroom for retries and estimate error against
  the 150 GB monthly allowance, not a target. Raising it further is a
  decision, per §21j.
- **Duration**: ~120k requests at the built-in 250 ms pacing plus real
  latency is **8–12 hours**. Start it right after a day's 07:00 slot (or
  simply after step 1's bootout, which removes the collision entirely).
  It is **resumable**: completed symbols persist (pinned for the day), a
  re-run tops up cheaply and continues; a symbol that failed mid-fetch
  rewinds to its start; store writes are atomic (temp + rename), so a
  crash cannot leave a torn store.
- The chunk plan lives in `scripts/intradayChunks.ts` (5-minute: 5 days;
  15-minute: 29 — sized so the worst case under the measured-inclusive
  `to` fits the measured caps). Per-chunk clip detection is deliberately
  absent (three candidate detectors died in review as false-positive or
  dead — that file's header has the record); the clip guard is the
  measured caps and step 3's density floor+ceiling.
- Do not run sweeps or the full test suite on the machine while this
  runs.

## 3. Verify — the cache proves its clock, or it is not rebuilt

```sh
npx tsx scripts/verify-cache-clock.ts
```

Green requires, for every store: the expected clock stamp, readable; no
witness condemning a series — per-year daily stamps at New York
midnight, with a deep daily store REQUIRED to actually resolve (an
undecided witness on 100+ rows fails, matching the other absolute
gates); no spring-transition year in the naive-shaped band [0.93, 0.975]
that losing exactly one wall hour produces (outage dents read as gaps);
weekly opens moving with DST where the venue does; every 15min/5min pair
registering at zero shift — with a large-overlap pair that cannot
register at all treated as a failure, because at this gate uncertainty
resolves toward failing; a 5min/15min density between 2.5 and 3.5 over
the shared span (the 1b sawtooth read ~0.6–1.0 below the floor; a
clipped 15-minute PRIMARY inflates the ratio above the ceiling); the
^GSPC reference session anchored at 09:30 New York wall in both DST
regimes (the absolute check — it alone catches a provider convention
flip, which shifts every series together and is invisible to every
relative instrument — and the audit FAILS if this anchor never ran,
because without a ^GSPC intraday store the one absolute check goes dark
silently); a daily store beside every intraday pair; every roster
symbol's THREE stores present — 15min, 5min and daily, with an empty
store counting as absent, because a symbol FMP answered with empty
intraday windows ends up daily-only without any error and previously
read green on every witness it never ran; and the calendar store
present. Any red line: the rebuild did not take —
do not sweep, do not delete the archive, diagnose.

For the record, the same command pointed at the condemned archive should
fail on every store — it predates the stamp:

```sh
npx tsx scripts/verify-cache-clock.ts --cache-dir ~/levelflow-cache-condemned-2026-08-11
```

## 4. Re-arm the nightly top-up

Step 1 booted the agent out; a rebuilt cache that silently stops
updating is the same failure class inverted:

```sh
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.windwardline.levelflow-cache-topup.plist
```

Know what is and is not watching from here: the density floor+ceiling
runs only when `verify-cache-clock` is invoked by hand — nothing
re-checks it at top-up time, so a provider cap change landing AFTER step
3 stays invisible until R1's E2 density assertion reaches the corpus
door (or the next manual verify). If FMP announces plan or endpoint
changes, re-run step 3 before the next sweep. Two related notes: a
superseded-clock corpus read is possible only via the explicit
`LEVELFLOW_ALLOW_SUPERSEDED_CLOCK=1` override, which warns loudly on
every read — figures produced under it are historical, never current.

Next 07:00 run should log `top-up complete`. Confirm one green nightly
log before calling Phase 0 done. (If a future nightly log ever shows the
clock stand-down again, that means a `BAR_CLOCK` bump shipped without
its rebuild — this runbook applies again from step 0.)

## 5. Delete the archive

After step 3 is green and step 4 has produced one green nightly run:

```sh
rm -rf ~/levelflow-cache-condemned-2026-08-11
```

## What this rebuild cannot lose

Nothing in `.calibration-cache` is unrecoverable: FMP serves 15-minute
history to each symbol's provider floor (forex 2010; crypto majors
2013–2017, young listings 2020–2023 — per the 4a corpus manifest, which
superseded an earlier walk-back that read all crypto as ~3 years;
futures 2023+), 5-minute to its own shallower floor, daily deeper than
either, the calendar from 2013 and COT from 2009. The **unrecoverable**
population is the 1-minute bank's blackout gap (2026-08-13 → the bank's
first post-upgrade run), which lives in a different store and a
different program (§21). Do not conflate the two.

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

## Known instruments NOT covered by this rebuild

- The **daily EOD endpoint** is a single un-chunked request with no
  row-cap tripwire (no cap has ever been measured for it). A clip would
  surface as a truncated old end; the verifier prints each daily store's
  first date — eyeball the deep symbols (forex should reach ~2010,
  ZC-era agriculture ~2007) before accepting.
- **COT files never top up** — an existing `cot-*.json` is served
  forever. Clock-safe (weekly date labels, parse unchanged), but the
  staleness is real and is carried on HANDOFF's small-items list, not
  fixed here.
