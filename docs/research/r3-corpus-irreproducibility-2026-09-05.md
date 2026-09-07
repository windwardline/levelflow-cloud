# The act-3 corpus cannot be restored — post-mortem, 2026-09-05

**CORRECTED 2026-09-05 22:10 UTC — the corpus IS restored, byte for byte.**
The rebuild of §5 finished with sha256
`23ee6b98504c3a9c1428aea5434a431fe15ef3e368dbed37fcdaf09c52c3712f` —
exactly the digest the act-3 read recorded for the destroyed corpus — on
6,634,732 rows and 16,709,806,104 bytes, with 2,523,837 rejection-ledger rows
and 1,841 decisions, the same as the record. §3 below argued from the
manifest's cache facts that the bytes could not come back; the digest says
the cache drift changed the manifest's facts (series counts, calendar census,
grid registration) and not one emitted byte. §3 is kept as written because
the reasoning error is the lesson: I inferred a row difference from an input
difference without measuring it, when the recorded digest was the measure.
The restored corpus sits at the record's path beside the committed manifest
`021821537f28`; the rebuild's own manifest (`1d1a8e7bdf5b`) is tracked beside
it as the witness of what the cache looked like on 2026-09-05.

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

## 3. Even the exact recipe cannot reproduce the bytes — REFUTED by the digest (see the correction above; kept as the record of the error)

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

### 3b. Three cache states — and the read straddled two of them

The manifests of every corpus the act-3 read consumed, compared symbol by
symbol on their sliced-series counts:

| state | when | witness | symbols whose series differ from the previous state |
|---|---|---|---|
| pre | 2026-09-02 17:39 UTC | shard 0 `021821537f28` (and `capture-all.jsonl`, `gated*.jsonl`) | — |
| mid | 2026-09-03 07:21–08:54 UTC | all six arms: `review-window`, `class-default-gate-off`, `class-default`, `stop-cap`, `review-window-96`, `stop-cap-8` | BZUSD, RTYUSD, SIUSD, **USDCAD**, YMUSD, ZBUSD |
| now | 2026-09-04 04:59 UTC | the one-cell run of §2 | GFUSX, HOUSD, LEUSX, RBUSD, ZCUSX, ZFUSD, ZLUSX, ZMUSD, ZOUSX, ZSUSX |

The pre→mid change is the 2026-09-02 18:02 UTC hand-started warm (stopped after
34 MB): its log names 42 stores it wrote, and the six changed symbols are all
among them. The mid→now change is the 2026-09-03 08:55 UTC top-up, which
started one minute after the last arm finished. Three later top-ups ran
(09-03 11:00, 18:51; then 402s) and the successor's manifest will show whether
"now" still holds.

So the read's baseline shard and its six arms were not built on the same
inputs: six symbols, one of them forex, differed by one to three 5-minute
bars, all inside the three days before the anchor.

### 3c. What that does to the read

The read confirmed exactly one candidate — forex `costShareMax=0.15`:
confirm ΔE +0.00637 R per fill, CI **[+0.00005, +0.01269]**, n 77,537,
confirm ΔR +283.0; frozen tuning-fold deltas fit +563.7 R, select +306.2 R.
Every other candidate in every class read "indistinguishable".

USDCAD is one of the 22 pool members. Its two extra bars sit in the confirm
fold (forex confirm runs 2022-06-03 → 2026-08-26; the tuning folds end
2022-06-03), so the fit and select deltas are unaffected by construction and
the entire perturbation lives in the sealed fold. Bounding it without a read:
two bars can change only setups whose review window contains them —
USDCAD setups opened within the baseline's eight-hour window before
2026-08-26 10:55 UTC, on the order of ten rows at the class's fill density,
at most ±1.2 R each. That is a perturbation of roughly ±10 R against a
lower-bound margin of about +4 R (0.00005 × 77,537). **The bound does not
exclude a flip to "indistinguishable"; it does not suggest one either.** It
cannot be resolved without a second confirm read, and the one-read rule
forbids that.

For the refuter round, two questions and my position on each:

1. Does the mismatch withdraw the shipped cap? Amendment 36: never on a flaw
   of our own making — and this is one (the top-up). The cap's tuning-fold
   evidence is intact and strongly positive; the confirm read was the check,
   and the check's outcome is "positive, within the mismatch's perturbation".
   Position: **0.15 stays shipped**, recorded as confirmed-on-mixed-inputs.
2. Does the mismatch void the read? The 2026-08-11 precedent voided a corpus
   and its reads because the instrument was wrong; here the instrument was
   right and one input drifted by bars in its final three days. Position:
   the read stands as a record; the next program builds every arm and its
   baseline on one cache, and proves it from the manifests before reading.

### 3d. §3b and §3c, refuted by measurement (22:15 UTC)

With the corpus back, the concern could be measured instead of bounded. The
baseline rows of `docs/research/r4/stop-cap.jsonl` — an act-3 arm built on
2026-09-03 on the "mid" cache at revision `1a64151a` — against the restored
shard 0's baseline rows, keyed by symbol and decision time: **935,241 of
935,241 byte-identical, none missing on either side** — the arm's baseline
population; the corpus of record itself holds 941,947 baseline rows (fit
379,224 · select 258,954 · confirm 303,769, a count only) with zero duplicate
keys (`baseline-rows-vs-keys-2026-09-06.log`). The six symbols whose
series facts differed between the two caches produced the same emitted rows,
byte for byte. The read's baseline and arms were on identical inputs; the
"straddle" existed in the manifests' cache facts and nowhere else. The
forex `costShareMax=0.15` confirmation's margin was never exposed. §3b's
table stands as a description of the cache; §3c's positions stand with
nothing left to argue: nothing to withdraw, nothing to void, and the next
program still proves single-cache inputs from the manifests before it reads
— now knowing that a fact difference is not a row difference until measured.

The tuning-fold readers on the restored corpus (`tuning-folds-summary`,
`grid-totalr` fit/select) reproduce the record's tracked outputs line for
line; the one diff is a longer holdout caption the reader gained after
2026-09-02. Recorded so the next reader of this note does not repeat the
inference: a cache fact moved, the bytes did not.

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

## 5. The successor — which turned out to be the original

Result (2026-09-05 22:07 UTC, 2 h 10 min, zero provider bytes): rows
6,634,732; bytes 16,709,806,104; sha256 `23ee6b98504c3a9c…` = the recorded
digest; manifest `1d1a8e7bdf5b…` (7 grid cells, same symbol order, 1,841
decisions, 2,523,837 rejection rows — identical to `021821537f28` in every
hashed term except the cache facts: 16 symbols' series counts, the calendar
census, and `gridRegistration`, where ~50 symbols' partially-formed final
bars were repaired by the top-up's overlap re-fetch, AUDUSD from 20
violations to 0). The tuning-fold readers on it must therefore reproduce the
record's outputs line for line, corpus-hash line aside — that diff is the
proof the readers are deterministic on the bytes, and it is recorded below.


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

Weighed again after the digest matched (§3d): question 2's content hashes
would have differed too — the sliced series did change — and would have
invited the same wrong inference; the emit digest is the oracle, and the
manifest should carry it (it does, on the read artifact; it should also sit
in the manifest itself). **Adopted (change set after #593):** every sweep
manifest now carries `emit` — sha256 over exactly the bytes the sweep wrote,
the byte count and the row count, inside the hashed payload — and
`rejections` for the sidecar; both doors (`assertManifestedCorpusStreaming`,
`assertManifestedCorpusSync`) recompute the digest as they stream and refuse
a corpus whose bytes, byte count or row count are not the manifest's, before
any reader returns a summary. A manifest that predates the field is read as
before. Question 3 keeps its force: an archived cache makes
a rebuild possible when the drift does reach a row. Question 1 reduces how
often that happens.

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

The instrument is now a tracked reader: `scripts/payoff-decomposition.ts`
(`tests/payoffDecomposition.test.ts`, 13 cases hand-computed from a fixture,
eight guard mutations each killed by the case written for it and reverted by
blob hash — held-out set, break-even rest term, win vocabulary, sealed count,
CLI seal, variant filter, unfilled filter, and the census's own coverage;
registered in the sealed-reader census `tests/confirmFoldSealed.test.ts`,
where both of its shapes are executed against planted confirm rows and shown
to move with nothing on the fold). It reads through the same door as every
other reader — the confirm fold withheld before a row arrives, the held-out
set the stratified one — and it ranks nothing. Its control: on this corpus
with `--include-holdout` it reproduces the ad-hoc regex pass that first
produced the figures below, field for field (filled 157,035, net −1,265.0,
gross +5,896.2, every outcome's n and means, planned 1.78 / 1.03). Outputs
tracked: `docs/research/r3/payoff-decomposition-capture-all.txt` (verdict
form, 20 markets held out) and `…-include-holdout.txt` (whole roster).

The table below is the whole-roster form, kept because it is what the
2026-09-04 research measured; "win" there is `take_profit + tp1_partial +
expired_in_profit` and "loss" `stop_loss + expired_at_loss`. The reader uses
the repo's vocabulary instead — wins are `take_profit + tp1_partial`, stops
are `stop_loss`, and expiries and ambiguous rows are held fixed when the
break-even is solved — which on the same rows reads: mean win +0.393 R, mean
stop −1.044 R, payoff **0.376**, win share 68.6% against break-even 69.2%.
Same 0.6-point shortfall, stated in the vocabulary a verdict would use.

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

Verdict form (held-out excluded, per class), select fold, from
`payoff-decomposition-capture-all.txt`. The global-folds corpus starves four
classes of tuning-fold rows — that is what the per-class-fold corpus exists
for — so only four classes appear here:

| class | filled | net R | gross R | payoff | win share | break-even | planned RR / ladder RR |
|---|---|---|---|---|---|---|---|
| forex | 78,932 | +1,603.8 | +3,493.6 | 0.377 | 69.8% | 68.4% | 1.69 / 1.00 |
| crypto | 40,220 | −3,699.1 | +572.5 | 0.370 | 64.7% | 71.0% | 1.96 / 1.08 |
| metals | 3,227 | −212.1 | +15.8 | 0.410 | 60.8% | 65.3% | 1.63 / 0.91 |
| indices | 182 | −14.0 | −10.8 | 0.390 | 44.5% | 49.9% | 2.18 / 1.23 |
| pooled | 122,561 | −2,321.4 | +4,071.1 | 0.375 | 67.9% | 69.2% | 1.78 / 1.03 |

Forex clears its bar by 1.4 points and is the only class that does; crypto
sits 6.3 points under it. That is the R3 record's "forex the only net-positive
class", now with the mechanism beside it.

### 8b. The banked fraction, priced — the R2b round's first standing question

`scripts/banked-fraction.ts` (`tests/bankedFraction.test.ts`, 12 cases
hand-computed; census-registered, both shapes; eight guard mutations each
killed by its own case and reverted by blob hash — control disabled, fraction
on the wrong leg, commission dropped, held-out ignored, sealed count, CLI
seal, unfilled priced, sell read as buy). The share of the position banked at
TP1 is the literal `0.5` in `realizedRFromLegs`; R2b §4.1 asked for it to be
varied and said it was exact arithmetic on the emitted legs. It is:
`R(f) = f·tp1R + (1−f)·exitR − commission/risk`, and at ½ that arithmetic
reproduced the emitted `realizedR` on **308,111 of 308,111** priced rows
(391,352 of 391,352 whole-roster) — the reader refuses a corpus it cannot
reproduce. Outputs tracked: `docs/research/r3/banked-fraction-capture-all.txt`
and `…-include-holdout.txt`.

It is the allocation question alone: the exit path is the emitted one at
every fraction, because the runner's protection re-arms on the TP1 touch and
not on the size banked; spread rides in the leg prices, slippage rides ONLY
in gapped prints (FR-7 — a non-gapped stop exit prints at its level, so a
share below ½ moves money onto a leg the resolver never slips; round 1 bounds
the optimism at S/2, forex select +1,100.2 → +785.2 R, and the reader now
prints that bound itself in its slippage-priced table), and the commission is
charged once per row. A row with no tp1 leg prices the same at every fraction.
Round 1's verdict on the share is §0 of `banked-share-design-2026-09-05.md`:
nothing ships.

Verdict form (20 markets held out), net R by banked fraction:

| fold | class | filled | R(0) | R(¼) | **R(½) shipped** | R(¾) | R(1) | best f | Δ best vs ½ |
|---|---|---|---|---|---|---|---|---|---|
| fit | forex | 174,503 | +3,201.9 | +1,553.6 | **−94.7** | −1,743.0 | −3,391.4 | 0 | +3,296.6 |
| fit | crypto | 7,052 | +414.5 | +546.2 | **+677.9** | +809.5 | +941.2 | 1 | +263.4 |
| fit | metals | 3,995 | −257.1 | −299.7 | **−342.3** | −384.9 | −427.5 | 0 | +85.2 |
| select | forex | 78,932 | +2,704.0 | +2,153.9 | **+1,603.8** | +1,053.7 | +503.6 | 0 | +1,100.2 |
| select | crypto | 40,220 | −3,593.2 | −3,646.2 | **−3,699.1** | −3,752.1 | −3,805.0 | 0 | +105.9 |
| select | metals | 3,227 | −164.7 | −188.4 | **−212.1** | −235.8 | −259.5 | 0 | +47.4 |
| select | pooled | 122,561 | −1,066.2 | −1,693.8 | **−2,321.4** | −2,949.0 | −3,576.6 | 0 | +1,255.2 |

Whole roster, select: pooled −1,265.0 at ½ → **+259.0 at 0**; forex +2,507.9
→ +3,902.6. R is linear in f, so the sign of the slope is the whole story,
and in forex it is the same sign on both tuning folds.

**Why, measured on the same rows** (baseline, tuning folds, whole roster; an
ad-hoc pass bucketing each row's runner exit against its TP1 price):

| outcome | protection | rows | exit at TP1 | below | above | mean (exit − TP1) R |
|---|---|---|---|---|---|---|
| tp1_partial | trail_tp1 | 249,117 | 227,358 (91.3%) | 19,473 | 2,286 | −0.007 |
| tp1_partial | hold | 3,490 | — | 2,625 | 865 | −0.689 |
| tp1_partial | breakeven | 2,102 | — | 2,081 | 21 | −0.567 |
| take_profit | trail_tp1 | 9,928 | 192 | — | 9,736 | +1.325 |
| take_profit | hold / breakeven | 2,000 | 21 | — | 1,979 | +1.52 / +1.61 |

Under `trail_tp1` — 97.8% of partial rows — the lock sits AT the TP1 price,
so on a pullback the runner half pays what the banked half paid, to within
0.007 R. The partial protects nothing there; what it does is sell half of
every target reached, +1.3 R per take_profit row on the runner half. Only
under `hold` and `breakeven` (2.2% of partial rows) does the partial protect
money, about 0.6 R per such row — which is why crypto, where those
protections sit, reads best at f = 1 on fit and f = 0 on select while forex
reads f = 0 on both.

**On the restored per-class-fold corpus** (`banked-fraction-capture-all-classfolds.txt`,
control 346,226 of 346,226), net R by banked fraction, select fold, with the
fit fold's best f beside it:

| class | filled | R(0) | **R(½) shipped** | R(1) | best f (select) | Δ best vs ½ | best f (fit) |
|---|---|---|---|---|---|---|---|
| forex | 78,932 | +2,704.0 | **+1,603.8** | +503.6 | 0 | +1,100.2 | 0 |
| crypto | 43,085 | −6,056.8 | **−6,550.0** | −7,043.3 | 0 | +493.2 | 1 |
| futures | 5,020 | −313.4 | **−310.7** | −308.0 | 1 | +2.7 | 0 |
| metals | 2,507 | −82.9 | **−118.4** | −153.9 | 0 | +35.5 | 0 |
| agriculture | 1,263 | −127.3 | **−149.4** | −171.6 | 0 | +22.2 | 0 |
| indices | 613 | −86.5 | **−94.8** | −103.1 | 0 | +8.3 | 0 |
| energies | 298 | −55.0 | **−60.1** | −65.2 | 0 | +5.1 | 0 |
| livestock | 170 | +10.5 | **−0.5** | −11.5 | 0 | +11.0 | 0 |
| pooled | 131,888 | −4,007.3 | **−5,680.1** | −7,352.8 | 0 | +1,672.8 | 0 |

Six classes read f = 0 on both folds; crypto flips (fit 1, select 0) and
futures is flat (±3 R). The slope is a property of `trail_tp1`, not of forex.

**What this is and is not.** It is a measurement with an exact control. It
is NOT the standing rejection's subject (2026-08-30: raising `tp1RiskShare`
to lift the blended payoff — a level moved for a printed figure); the
fraction moves no level, and the figure it is judged on is net realised R
on the tuning folds. It is not a decision. A banked share other than ½
cannot be swept today — the builder types `takeProfit1` as a number and
`CategoryCalibration` has no field for the share (R2b §4.2) — so pricing it
through the program means: a calibration field for the banked share, the
grid axis, the builder and resolver reading it, `ladderRewardRisk` following
it, tests, then arms at the protected anchor for zero bytes, one confirm
read. That, and whether E8's execution rules let a full-size position ride
a stop moved to TP1, are the refuter round's questions — and the second is
the one that can kill it.

**On the restored per-class-fold corpus (all eight classes; verdict form;
`payoff-decomposition-capture-all-classfolds.txt`), select fold:**

| class | filled | net R | gross R | payoff | win share | break-even | planned RR / ladder RR |
|---|---|---|---|---|---|---|---|
| forex | 78,932 | +1,603.8 | +3,493.6 | 0.377 | 69.8% | 68.4% | 1.69 / 1.00 |
| crypto | 43,085 | −6,550.0 | −1,664.3 | 0.359 | 61.1% | 71.5% | 1.96 / 1.07 |
| futures | 5,020 | −310.7 | −59.1 | 0.529 | 55.4% | 59.8% | 1.94 / 1.12 |
| metals | 2,507 | −118.4 | +49.7 | 0.422 | 61.3% | 64.7% | 1.68 / 0.95 |
| agriculture | 1,263 | −149.4 | −7.3 | 0.493 | 51.5% | 59.5% | 1.54 / 0.83 |
| indices | 613 | −94.8 | −69.7 | 0.343 | 55.1% | 65.7% | 2.01 / 1.11 |
| energies | 298 | −60.1 | −56.0 | 0.557 | 41.9% | 52.9% | 1.46 / 1.00 |
| livestock | 170 | −0.5 | +10.2 | 0.815 | 54.7% | 54.9% | 2.05 / 1.21 |
| pooled | 131,888 | −5,680.1 | +1,697.1 | 0.377 | 65.9% | 68.9% | 1.79 / 1.03 |

Forex is the only class above its break-even, by 1.4 points; every other
class sits 0.2 (livestock) to 11.0 (energies) points under it, and the
realised payoff runs 0.34–0.82 against planned 1.46–2.05 everywhere.

Reading, as measurement only: the gate's 1.78:1 is paid in full on 3.4% of
fills; 65% of fills bank a partial worth 0.35 R; the realized ratio is 0.41:1,
which puts break-even at a 70.7% win share, and the select fold wins 70.06%.
Gross edge is positive in both folds and modeled costs (0.046 R per fill on
select) take all of it and more. This corroborates the four-lens finding of
2026-09-04 — whose verification aborted on the agent limit — and stands or
falls with the refuter round. Amendment 39 governs: nothing here may be closed
by stretching a target or tightening a stop.
