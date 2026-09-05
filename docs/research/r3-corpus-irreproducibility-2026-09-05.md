# The act-3 corpus cannot be restored — post-mortem, 2026-09-05

**Status: facts verified on the machine, design questions NOT yet refuted.**
The weekly agent limit was exhausted on 2026-09-04; the refuter round on §6
runs after it resets (2026-09-06 07:00 ET). Nothing in §6 is a decision.

## 1. What was lost

`docs/research/r3/capture-all-classfolds.jsonl` — 6,634,732 rows, 16.71 GB,
97 symbols, seven grid cells, revision `886fdf13` (clean, 0 untracked),
anchor 2026-08-26, manifest `021821537f28…`, emit sha256 `23ee6b98504c3a9c…`.
Shard 0 of the act-3 ledgered read (`docs/research/confirm-reads/ledgered-read-act3.json`,
which records both hashes). Overwritten at 2026-09-04 00:23 UTC by a research
agent in the payoff-gap fan-out (`docs/HANDOFF.md`, resume block of 2026-09-04).

## 2. The first restoration was the wrong corpus

The launcher written at 2026-09-04 04:28 UTC from the `levelflow-cloud-restore`
worktree omitted `--grid` and passed the manifest's alphabetical
`requestedSymbols` list instead of `--symbols roster`. It ran to completion at
04:59:31 UTC and produced a **one-cell** corpus: 2.33 GB, 366,420 rejection
rows against 2,523,837, 263 decisions against 1,841, manifest `a400760b…`,
`source.untracked: 1` (a `.calibration-cache` symlink the worktree needed), and
crypto-first row order where the record is roster order (EURUSD first). One
seventh of the record, in a different order. Its launcher and log lived in the
session scratchpad, which was wiped with the session; the manifest it wrote
over the tracked one is what exposed it. Removed 2026-09-05; the committed
manifest restored from git.

The recipe that made the record is in the corpus's own manifest — `grid`,
`requestedSymbols`, `stepBars`, `acceptance`, `days`, `anchor`, `source` — and
in the R3 launcher (`run-r3-classfolds.sh`, transcript of 2026-09-02):

```
--anchor 2026-08-26 --days 7000 --symbols roster --capture-all
--fold-spec docs/research/r3/fold-spec-2026-08-26.json
--grid "runnerProtection=breakeven,hold,trail_tp1;stopStructureSource=intraday,intraday_and_daily"
--byte-budget 1MB
```

A restoration must be derived from the manifest, never retyped.

## 3. Even the exact recipe cannot reproduce the bytes

The one-cell run is still a witness: everything it shares with the record it
reproduced, except the cache. Manifest against manifest, key by key —
`analyzerVersion`, `anchor`, `barRejections`, `calibrationByClass`, `clock`,
`conditions`, `days`, `engineDeclined`, `foldsByClass`, `grossCostScale`,
`holdoutSymbols`, `modeledCostScale`, `requestedSymbols`, `stepBars`,
`trainShare`, `treasuryCurve`, `warmupBars` — **SAME**. Differing:

| what | record (2026-09-02) | current cache (2026-09-04) |
|---|---|---|
| `calendarCensus.itemCount` | 74,152 | 74,153 (same first/last event, same 42,691 distinct times) |
| USDCAD 5min `count` / `recentCount` | 1,221,636 / 18,388 | 1,221,638 / 18,390 |
| BZUSD 15min / 5min `count` | 65,106 / 181,309 | 65,107 / 181,312 |
| RTYUSD 5min `count` | 204,331 | 204,332 |
| series facts changed, total | — | 16 of 97: USDCAD, BZUSD, RTYUSD, SIUSD, YMUSD, ZBUSD, ZFUSD, HOUSD, RBUSD, ZCUSX, ZSUSX, ZLUSX, ZMUSD, ZOUSX, LEUSX, GFUSX |
| `crossSeriesClock` / `crossSeriesDensity` | — | changed where a partner series changed |

Every added bar sits inside the sliced range — USDCAD's slice still ends at
the anchor, 2026-08-26 10:55 UTC — and inside the last 90 days of it
(`recentCount` moved by the same amount as `count`).

**Mechanism.** `scripts/calibrationCache.ts`: `TOP_UP_OVERLAP_MS = 3 days` —
every top-up re-fetches the three days before a store's last bar and
`mergeByTime` merges them in, so "a late-arriving revision in the previous pin
never survives as truth". Top-ups stood down on 429 from 2026-08-27 through
2026-09-02 05:48 UTC (`~/Library/Logs/levelflow-cache-topup.log`). The first
warms after the anchor — 2026-09-02 18:02 UTC (hand-started, stopped after
34 MB) and 2026-09-03 08:55 UTC (complete) — met stores whose tails sat at the
anchor, so the overlap straddled the pinned anchor day and rewrote bars at and
before 2026-08-26 10:55 UTC. USDCAD's store now pins 2026-08-24, 08-25, 08-26,
09-02 (17:55Z) and 09-03. A pin makes a run free and reproducible **within its
anchor day** — the code's own words — not across a later top-up. Counts expose
insertions; revised **values** inside the overlap are invisible to counts, so
the 81 symbols whose facts match are not proven identical either.

**No copy exists.** `tmutil listlocalsnapshots /` — none. No Time Machine
destination. R2 holds the minute bank only (`scripts/ops/push-minute-bank-offbox.sh`);
`.calibration-cache` is not an off-box dataset. Nothing on this machine or off
it holds the stores as they stood on 2026-09-02.

So the corpus was already irreproducible ~16 hours before it was destroyed.
The clobber turned a latent loss into an actual one; the top-up made it latent.

## 4. What stands

- The act-3 read's artifacts are committed with their input hashes
  (`ledgered-read-act3.json`, `r4/frozen-candidates.json`,
  `r4/admission-derived-grading*.json`, `r4/withdrawal-verdict-2026-09-03.json`).
  The decisions they carry — forex `maxCostShare: 0.15`, the 21-market register —
  were taken on bytes that existed and were sealed at the door. None of them can
  be re-run on those bytes. The provenance chain is a record, not a replay.
- The intact global-folds corpus `docs/research/r3/capture-all.jsonl` is
  verified today: 6,660,138 rows, matching the emitted count in
  `capture-all.stdout-redacted.txt`, and sha256
  `5ab22837cb163cee19132d1777f9eb4c6d94effc1963209dae9cc3feb97fa332` —
  recorded here for the first time (the R3 reads predate the door that records
  digests). Its 20 holdout markets and its `2,769,596` sealed confirm rows are
  as the tracked readers report them.
- `gated.jsonl` and `gated-classfolds.jsonl` were released deliberately on
  2026-09-02 19:06 UTC after the gate on each capture-all corpus was shown to
  equal the gate on its gated twin; only their rejection sidecars remain.

## 5. The successor

`docs/research/r3/capture-all-classfolds-2026-09-05.jsonl`: the §2 recipe, at
`886fdf13`, from a clean worktree with 0 untracked files (`--cache-dir` pointing
at the main checkout's cache instead of a symlink), launched 2026-09-05 19:57
UTC — "313 cache artifacts all carry the pin, so this run cannot reach the
provider". Its manifest is tracked beside the original's. The delta between
the two manifests is the cache drift, exactly; the delta between any reader run
on the successor and the same reader's act-3 artifact is what that drift is
worth in money. Fill in when it lands: rows, bytes, manifest, sha256.

## 6. Design questions — for the refuter round, not decided here

1. Should a top-up honour pins — never rewrite a bar at or before a pinned
   anchor's `pinnedThrough` — trading late revisions for cross-day
   reproducibility? Research reads the cache; the live desk fetches the provider
   directly and never reads it.
2. Should the manifest carry a content hash of each sliced series a run
   actually consumed, so drift is exact rather than count-visible?
3. Should a corpus of record archive its input stores off-box
   (R2 `levelflow-cloud/calibration-cache/<manifestHash>/`, or the ≤-anchor
   slices only), the way the minute bank already is?
4. Launchers and logs for multi-hour jobs live outside the session scratchpad.
   (Applied today: the successor's status goes to `classfolds.status.log`.)

## 7. FMP changed plan on 2026-09-04

Between 18:53 UTC (last complete top-up) and 20:38 UTC, three endpoints began
returning `HTTP 402 Restricted Endpoint: This endpoint is not available under
your current subscription`. Probed 2026-09-05 20:10 UTC, one request each:

| endpoint | status |
|---|---|
| `stable/quote` | 200 |
| `stable/historical-chart/5min` | **402** |
| `stable/historical-chart/1min` | **402** |
| `stable/economic-calendar` | **402** |
| `stable/treasury-rates` | 200 |
| `stable/historical-price-eod/full` | 200 |

Not a 429; a 402 does not drain by time. Consequences: the cache top-up fails
hard (the calendar fetch throws at `replay-sweep.ts:1563`; the wrapper's
"no quota signal, so this is a real failure" is the right classification); the
minute bank's circuit is open and its permanent-loss deadline is ~2026-09-06
19:19 UTC; production's `marketLoader.ts:350` fetches `historical-chart/` and
`newsContext.ts` the calendar, so **the desk cannot unpark on this plan**.
The FMP subscription page is a screen only the owner can open. Pinned research
is unaffected — the successor build spends nothing.

## 8. The payoff gap, measured on the intact corpus

Ad-hoc instrument (regex pass over `capture-all.jsonl`; baseline variant,
`accepted: true`, filled rows; **the confirm fold is skipped before any
aggregation** — 2,769,596 rows, the same count the door withholds). Not a
tracked reader and not refuted; it pools all 97 markets including the 20
holdouts, so its figures are not the class-pooled, holdout-stratified figures
of `grid-totalr-fit-select.txt`. It answers one question: what a win pays,
what a loss costs, and where the planned ratio goes.

| select fold | value |
|---|---|
| filled | 157,035 |
| net R / gross R | −1,265.0 / +5,896.2 |
| expectancy | −0.0081 R per fill |
| mean win / mean loss | +0.387 R / −0.934 R |
| realized payoff ratio | **0.414** |
| win share / break-even win share at that payoff | 70.06% / **70.70%** |
| planned reward:risk (gate) / planned ladder RR | 1.78 / 1.03 |

| outcome | share | mean net R | mean gross R | forgone runner R |
|---|---|---|---|---|
| tp1_partial | 65.16% | +0.352 | +0.358 | 0.129 |
| stop_loss | 25.11% | −1.044 | −0.883 | — |
| expired_at_loss | 4.59% | −0.336 | −0.269 | — |
| take_profit | 3.44% | +1.155 | +1.081 | 0.194 |
| expired_in_profit | 1.46% | +0.128 | +0.163 | — |
| ambiguous | 0.24% | −0.750 | −0.528 | 0.213 |

Fit fold, same instrument: 234,317 fills, net +1,161.5 R, gross +6,198.9 R,
payoff 0.443, win share 69.62% against break-even 69.28%.

Reading, as measurement only: the gate's 1.78:1 is paid in full on 3.4% of
fills; 65% of fills bank a partial worth 0.35 R; the realized ratio is 0.41:1,
which puts break-even at a 70.7% win share, and the select fold wins 70.06%.
Gross edge is positive in both folds and modeled costs (0.046 R per fill on
select) take all of it and more. This corroborates the four-lens finding of
2026-09-04 — whose verification aborted on the agent limit — and stands or
falls with the refuter round. Amendment 39 governs: nothing here may be closed
by stretching a target or tightening a stop.
