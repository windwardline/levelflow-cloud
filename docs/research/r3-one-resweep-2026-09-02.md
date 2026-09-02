# R3 — the one re-sweep, run 2026-09-02

The record of the remediation program's Phase 3
(`docs/research/remediation-program-2026-08-11.md`): one corpus, one clock,
one engine, the instrument repaired, both arms of the run card in
`docs/HANDOFF.md` ("R3's run card") at anchor 2026-08-26. This file is the
evidence; the artifacts sit beside it in `docs/research/r3/`.

**What R3 is and is not.** It produces the first valid corpus since the
2026-08-11 clock defect condemned the 4c/4d one. It does not derive a single
calibration value: that is R4's per-market program, and the confirm fold is
SEALED for it — nothing in this record reads that fold, and the readers that
would have are named in §7. Every figure here is fit and select only.

## 1. Preconditions, re-derived rather than assumed

| precondition | how it was checked | result |
| --- | --- | --- |
| clean, merged main | `git status --short` empty; `HEAD == origin/main == e51e742` | held |
| pin population | the driver's own `anchoredPreflight` at launch | **313 of 313 checks pass**: 291 bar-store checks over 288 distinct stores (WTI and CLUSD share one source), the calendar and the Treasury curve — all carrying the 2026-08-26 pin — plus 20 COT files present and parseable (COT caches by contract and carries no pins); the shared spend gate was not consulted. The driver's own line reads "313 cache artifacts all carry the pin", which overstates the COT half — a wording defect in the driver, recorded here |
| density door and clock witnesses at this depth | an anchored `--warm-only` roster survey, the door in report mode (`docs/research/r3/preflight-survey-2026-09-02.txt`, copied from the session's scratch log, whose own stamp is 06:11:11Z — before the 06:12:37Z launch) | 97 of 97 warmed, **zero `WOULD REFUSE`**, zero witness refusals, zero provider bytes |
| per-market cost | two single-market probes (EURUSD, BTCUSD), baseline variant, full depth | ~30 s per market-variant, ~1.9 GB peak RSS, 18,598 rows / 46 MB for EURUSD |
| heap headroom | `v8.getHeapStatistics().heap_size_limit` = 4.4 GB; largest store 121 MB (BTCUSD 5-minute) | no heap flag needed |
| disk | 284 GB free; `.calibration-cache` 7.7 GB; `.minute-bank` 219 MB; `/private/tmp` clean of repo copies | held |
| FMP | breaker open on the bandwidth wall (minute bank stood down at 05:36Z on a 429) | the run must not fetch — and cannot, by the preflight above |
| the post-sweep reader chain | rehearsed on the EURUSD probe pair (a gated and a capture-all single-market run, baseline, full depth) before the arms finished | `two-arm-reconcile`: 18,598 of 18,598 accepted rows byte-identical, 24 shared terms agree, `regimeBlocked` 3,338 preserved in the gated manifest and zeroed in the capture-all one; `tuning-folds-summary`, `data-limits`, `starvation-audit --report` and `grid-totalr` (no `--confirm-final`) all ran, and `docs/research/confirm-reads/` was untouched afterwards |

## 2. What ran

Both arms of the run card, exactly as written, launched 2026-09-02 06:12Z
from `e51e742` under `caffeinate`, the key delivered by `wl-secret` at exec:

```
npx tsx scripts/replay-sweep.ts --anchor 2026-08-26 --days 7000 --symbols roster \
  --grid "runnerProtection=breakeven,hold,trail_tp1;stopStructureSource=intraday,intraday_and_daily" \
  --byte-budget 1MB --emit docs/research/r3/gated.jsonl
npx tsx scripts/replay-sweep.ts --anchor 2026-08-26 --days 7000 --symbols roster --capture-all \
  --grid "runnerProtection=breakeven,hold,trail_tp1;stopStructureSource=intraday,intraday_and_daily" \
  --byte-budget 1MB --emit docs/research/r3/capture-all.jsonl
```

| arm | start | exit | elapsed | rows | emit | rejection sidecar | manifest |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| gated | 06:12:37Z | 0 at 08:45:20Z | 2h 32m 43s | 5,232,445 | 13.19 GB | 3,932,095 rows, 644 MB | `d0bb64d9e12f` |
| capture-all | 06:12:57Z | 0 at 08:48:28Z | 2h 35m 31s | 6,660,138 | 16.78 GB | 2,504,402 rows, 412 MB | `ce146c6b8b63` |

Zero provider bytes on both, by construction: the first line of each stdout
table is the preflight's assertion, no spend line appears in either, no
`.fmp-usage.json` was written, and the breaker had stood open since
2026-08-31 (`docs/research/r3/*.stdout-redacted.txt`).
Folds, common-origin over the roster's own 15-minute span: fit
2009-09-25..2018-03-11 (decisions to 2018-03-06) · select ..2022-06-03
(decisions to 2022-05-29) · confirm ..2026-08-26 (decisions to 2026-08-21).
Step 16 (a decision every four hours). Seven variants: `baseline` plus the
2×3 cross. Per-market cost 94 s mean across seven variants (9,163 s over 97
markets — the deep forex markets ~3 minutes, the 2023-era markets well under
a minute); RSS 1.1–2.8 GB per arm, observed by `ps` during the run.

**One deviation from the card's "in order", stated:** the two arms ran
CONCURRENTLY as two single-process runs (one corpus file per arm), twenty
seconds apart, from the same clean tree. Sequential execution would have
blocked every gate for five hours. Concurrency changes nothing either arm
reads or writes: both read pinned stores (a pinned hit returns the filtered
items and writes nothing), and each writes its own emit, manifest and sidecar.

**The provenance mark, and its proof.** Both manifests record
`source: { revision: e51e742…, dirty: true }`. The tracked tree matched
`e51e742` byte for byte when both arms resolved their source (within seconds
of 06:12:37Z and 06:12:57Z): the earliest tracked modification on the branch
is `.gitignore` at 06:15:05Z, every other changed file is later still
(`stat -f %m`, listed in PR #563), and `git reflog` shows no other revision
was ever checked out. What made `git status --porcelain` non-empty was one
untracked file, the launcher's own `arms.status` (the stdout logs were still
ignored by the global `*.log` rule at that instant, and the corpora were
excluded) — the driver's definition of dirty was "porcelain non-empty",
untracked files included. The refuter re-derived this from the session
transcript: `git status --short` was empty inside the launch command at
06:12:37Z, both arms had printed their fold lines (which follow source
resolution) by 06:13:22Z, and the first tracked write is 06:15:05Z. The
reconciliation output's sentence "whose engine is not the recorded revision"
is therefore false of this run; the instrument now says so itself for a
manifest written under the old definition. That definition is changed in this change set (§7): `dirty` now
means tracked change, and untracked files are counted beside it.

**Four hours unexplained.** The arms ended at 08:48Z, the reader chain ran
08:49–08:51Z, and the acceptance gate — dispatched in the same turn — did not
start until 12:56Z; the session's next turn is stamped 13:04Z. An earlier
version of this paragraph said the machine idle-slept. It did not:
`kern.sleeptime` is zero since the 05:35Z boot and `pmset -g log` records no
sleep on 2026-09-02 (checked by the record refuter, then by hand). The gap
is on the harness side and is not explained here. A session-long
`caffeinate` was started anyway; it is cheap insurance, not the lesson.

## 3. The corpus — population and identity

Both manifests: anchor `2026-08-26`, engine
`2026.09.01.platinum-group-rate-inverse`, depth 7000, step 16, 7 variants,
**71 emitted columns** (every pre-R3 field present), `modeledCostScale` 1,
`grossCostScale` 0, clock `venue-wall-utc-v4` / the composite-key calendar,
calendar census 74,152 events over 42,691 distinct instants, Treasury curve
3,413 rows. `acceptance.captureAll` is `false` on the gated manifest and
`true` on the capture-all one; `ignoreLowEdge` false on both.

- **97 requested, 97 survived** — no market dropped at a door.
- **Stamped holdout, 19 markets:** AUDCHF, AUDJPY, AUDUSD, BCHUSD, BNBUSD,
  CADJPY, DAX, EURCHF, EURGBP, EURUSD, FILUSD, GBPCHF, GBPJPY, NEARUSD,
  NGUSD, NQUSD, SP, XLMUSD, ZOUSX. The gate excludes its own read-time
  stratified set (20 markets) instead.
- **Engine-declined at the run, 15 markets** (recorded, symbols only):
  AAVEUSD, CAKEUSD, DASHUSD, DOGEUSD, EGLDUSD, ETCUSD, GRTUSD, HBARUSD,
  IMXUSD, LTCUSD, PAUSD, UNIUSD, XLMUSD, XMRUSD, ZCUSX.
- **9,164,540 decision points** across 1,379 (symbol, variant, split) cells —
  identical in both arms, because both arms walk the same instants.
- **Where the decisions went (gated), ten buckets that partition the
  9,164,540 exactly:** regimeBlocked 1,291,003 · sessionBlocked 1,032,297 ·
  noConsensus 910,637 · belowPayoff 409,521 · planRejected 224,258 ·
  newsBlocked 52,941 · belowConfidence 8,589 · notWarm 2,849 · regimeGated 0
  · unresolvable 0 · emitted 5,232,445. `belowThreshold` 418,110 is the
  AGGREGATE of belowConfidence + belowPayoff + regimeGated (`sweep.ts`, "an
  aggregate, not a twelfth reason"), and is not a bucket of its own.
- **The capture-all arm zeroes three of those counters and their aggregate by
  construction** (regimeBlocked, belowConfidence, belowPayoff, hence
  belowThreshold → 0) and walks on: noConsensus rises to 1,160,236 and
  planRejected to 256,079, emitted 6,660,138. That is register item H's
  mechanism, measured.
- `starvation-audit --report` on the gated table (the only table it accepts):
  8 of 97 markets flagged, ranked worst first
  (`docs/research/r3/starvation-audit-gated.txt`).

**The data limits, and what they do to the folds** (`data-limits-gated.txt`):
forex begins 2009-09-25, crypto 2013-11-04, XAUUSD 2013-07-14, SP 2020-02-24
and NSDQ 2020-08-14 — and **every futures, energies, agriculture and
livestock market, the other four indices, and XAGUSD begin between
2023-08-30 and 2023-10-02**: FMP serves ~1,060 days of intraday history for
them. Under the run card's global folds those markets have **no fit or select
days at all**; their entire history sits inside the sealed confirm fold.

## 4. Two arms, one measurement — register item H, executed

`scripts/two-arm-reconcile.ts` (new; `tests/twoArmReconcile.test.ts`)
streams both corpora in lockstep. Output `docs/research/r3/reconcile-two-arms.txt`:

- 24 shared manifest terms agree; `decisionPoints` agree on all 1,379 cells;
  each arm's rows per cell equal its manifest's `emitted`.
- **5,232,445 of 5,232,445 accepted rows byte-identical** between the arms;
  0 field-identical-after-reserialization; 0 divergent. The gated corpus
  carries no `accepted: false` row; the capture-all corpus carries 1,427,693.
- The instrument's verdict line reads `DIVERGENT — 2 finding(s)` and it
  exited 1, as it must when any finding stands. Both findings are the
  provenance flag (`source.dirty is true` under the old definition), explained
  and proven in §2; the row and term checks found nothing. The verdict is
  overridden HERE, in writing, not by the instrument.
- Independently (refuter, Lens B): the SHA-256 of the capture-all arm's
  top-level `accepted: true` lines in file order equals the SHA-256 of the
  whole gated file (`bc97167b…`), every per-cell count matches both
  manifests by a regex stream that shares nothing with the instrument, and
  three accounting identities hold on all 1,379 cells (belowThreshold =
  belowConfidence + belowPayoff; the emitted delta equals regimeBlocked +
  belowThreshold − Δ(noConsensus + planRejected); the ledger delta
  3,932,095 − 2,504,402 equals the 1,427,693 non-accepted rows).

The claim in HANDOFF's item H — "the accepted subset is bit-identical
between the arms" — was measured on two markets at step 256; it now holds on
the whole roster at step 16.

## 5. What R3 measured — fit and select, confirm sealed

`scripts/tuning-folds-summary.ts` (new; `tests/tuningFoldsSummary.test.ts`)
refuses the confirm fold by name, excludes the 19 held-out markets from every
class rollup, skips rows the sweep did not accept, and prints net beside
gross and the rate beside the money. Full tables:
`docs/research/r3/tuning-folds-summary-gated.txt` (and the capture-all twin,
whose accepted population is identical by §4). Net R is after modelled spread,
slippage and commission at scale 1; gross R charges the published commission
only.

**Per class at rest (`baseline`), fit + select pooled, held-out excluded:**

| class | n | filled | TP1 hit | stop | net E | ±SE clustered (k markets) | gross E | net total R | gross total R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| forex | 252,522 | 218,364 | 68.8% | 23.7% | **+0.013** | ±0.006 (19) | +0.037 | **+2,896.9** | +8,047.8 |
| crypto | 63,521 | 53,454 | 67.9% | 28.4% | −0.036 | ±0.029 (23) | +0.053 | −1,930.3 | +2,857.9 |
| metals | 9,150 | 7,222 | 59.6% | 29.9% | −0.077 | — (XAUUSD alone) | +0.006 | −554.4 | +42.3 |
| indices | 145 | 131 | 48.1% | 12.2% | +0.004 | — (NSDQ alone) | +0.016 | +0.6 | +2.2 |
| futures, energies, agriculture, livestock | 0 | 0 | — | — | — | — | — | — | — |

Per fold, forex at rest: fit +0.006 (150,296 filled, +947.3R), select
**+0.029** (68,068 filled, +1,949.6R). Crypto at rest: fit **+0.123**
(8,284 filled, +1,017.8R), select **−0.065** (45,170 filled, −2,948.2R) — the
sign flips between folds, and select carries five times the fills.

**The runner axis, fit + select pooled, net:**

| class | breakeven | hold | trail_tp1 (intraday) | trail_tp1 + daily structure |
| --- | ---: | ---: | ---: | ---: |
| forex | −0.023 / −5,010.5R | −0.016 / −3,440.8R | +0.013 / +2,896.9R (= baseline) | +0.015 / +3,225.1R |
| crypto | −0.071 / −3,805.1R | −0.050 / −2,650.9R | −0.032 / −1,686.7R | −0.030 / −1,594.5R |
| metals | −0.096 / −693.1R | −0.103 / −741.2R | −0.077 / −554.4R (= baseline) | −0.079 / −582.7R |

`trail_tp1` is the least-bad or best mode in every class that can be
measured on the summary's pooled net expectancy: over `breakeven` / `hold`
by 0.036 / 0.029R in forex, 0.039 / 0.018R in crypto, 0.019 / 0.026R in
metals and 0.016 / 0.020R on indices' 131 fills. The `intraday_and_daily`
stop source moves the money by less than 0.005R per trade in forex, crypto
and metals (0.004R at most, either direction) and by 0.011–0.019R on
indices' 131–132 fills, where nothing is evidence; and its population is NOT
a superset of the
intraday one: per mode it drops 2,434 intraday decisions and admits 13,506
new ones (net +1.4%), on 69 of the 71 structure-stoppable markets, and six
markets end with fewer decisions (LTCUSD 8,374→8,194, BCHUSD, ZBUSD, ZNUSD,
ZOUSX, GCUSD); net +1.49% (11,072 on 742,747). The record's standing claim that the daily arm "admits more
and loses none" was true of the three markets it was measured on and false
of the roster; and the claim that daily structure "always tightens and never
widens" is false wherever the intraday search found no pivot — the shipped
stop then sits at the volatility floor and a daily pivot moves it out (49.8%
of floor rows widened in a 25% paired sample; 27.9% of cap rows tightened).
Both are corrected in place in HANDOFF, the q4 record and the engine comment.

**The acceptance gate, class grain, fit and select only**
(`scripts/grid-totalr.ts` without `--confirm-final`;
`docs/research/r3/grid-totalr-fit-select.txt`; 1,000 permutations, seed 7):

- Forex: `breakeven` and `hold` fail against baseline at p = 1.000 (ΔR
  select −3,245 and −2,518). `trail_tp1 + daily` beats baseline on select
  (ΔR +236.1, paired p 0.018) but not on fit (ΔR −1.7), so it fails the
  both-folds rule. Baseline's select expectancy on the gate's own population
  is +0.020 (lower 95% +0.016).
- Crypto: both `trail_tp1` arms beat baseline on both folds (ΔR select +190.9
  and +242.7, paired p 0.001) and still **fail D4's absolute term** — their
  select expectancy is −0.087 / −0.085. Beating the baseline is not earning
  money, and the gate says so.
- Metals: every variant fails; `trail_tp1 + daily` ΔR select −23.6, p 0.993.
- Indices (SP alone on the gate's population, resting mode `hold`): effective
  pairs 36 / 55 / 0 / 25 / 65 / 78 across the six variants; `hold, intraday`
  is NO VERDICT (bit-identical to baseline), the other five fail; no evidence
  either way.
- **Futures, energies, agriculture, livestock: NO VERDICT — "baseline has no
  select-fold days in this group".** See §3 and §8.
- The `trail_tp1, intraday` row reads NO VERDICT with 0 nonzero pairs in
  forex and metals: it is bit-identical to baseline there (the resting mode),
  which is the axis default being honest, not the knob being inert.

**Frequency beside money, at rest** (baseline, fit + select, held-out
excluded, ≥30 filled): 44 markets clear the floor; **21 have net expectancy
above zero; 16 win at least half of their filled setups while losing money**
— AAVEUSD, ADAUSD, EURJPY, GBPAUD, GBPUSD, GRTUSD, LINKUSD, LTCUSD, NZDUSD,
SOLUSD, TRXUSD, UNIUSD, USDCAD, USDCHF, USDJPY, XAUUSD. Amendment 39's
premise — that a market can win four in five and shrink the account — is now
a measurement on a valid corpus rather than an argument from the ladder's
arithmetic.

**Cost is the whole loss in crypto and metals.** Gross expectancy is positive
in every measurable class at rest (+0.037 forex, +0.053 crypto, +0.006
metals); the modelled spread and slippage take 0.024R (forex), 0.089R
(crypto) and 0.083R (metals) per filled trade. This is the lever amendment 39
names as highest-confidence, measured; it is not a decision.

**Two holdout rules, two populations — read the gate and the summary as
different instruments, not as two prints of one number.** The summary
excludes the manifest's STAMPED holdout (19 markets, the driver's
sha256-mod-5 draw); the gate excludes its own read-time STRATIFIED set (20
markets), by design and as its output says. The two sets share only five
markets (AUDCHF, BNBUSD, EURUSD, NGUSD, XLMUSD), so the gate tunes on 14
stamped-held-out markets and excludes 15 the corpus stamped as tuning
markets. That is why forex at rest reads +0.029 on select in the summary (19
markets) and +0.020 in the gate (22 markets), and why the two indices rows
are DISJOINT single markets: the summary's is NSDQ, the gate's is SP — which
the manifest stamps HELD OUT. Neither figure is wrong; they answer different
questions, and R4 must pick one rule per read and say which. Found by the
look-ahead refuter, not by the author.

**None of this is a calibration decision.** The stopping rule stands: no
value moves on R3 evidence. R4 grades every market individually with absolute
expectancy as the criterion and owns the one confirm read.

## 6. What survived adversarial review, and what died

Three refuters ran against the readings (statistical validity and
look-ahead; the reconciliation instrument; engine-axis conformance) and a
fourth against this record. Their verdicts are in §6a; nothing in §3–§5 was
written before the corpus existed. Every CORPUS figure in §3–§5 quotes a
tracked artifact in `docs/research/r3/`; the run-cost figures (probe rows and
sizes, RSS, heap limit) and the refuters' own recomputations (the paired
25% sample, the 2,434 / 13,506 decision sets, the per-mode row counts, the
`bc97167b…` hash) come from the session and its scratch outputs, which are
not tracked, and are marked as such where they appear.

### 6a. Verdicts

**Lens A — statistical validity and look-ahead** (independent one-pass
recount of the gated corpus):
- Fit+select only, no confirm figure in any printed number — SURVIVES; every
  forex baseline figure re-derived to printed precision (n 252,522, filled
  218,364, TP1 68.8%, net +0.0133, +2,896.9R, gross +8,047.8R).
- The embargo held: 0 of 3,209,603 fit/select rows decided inside the
  5-day embargo, 0 exits past a fold end; a −1-day mutation of the embargo
  fired 1,321 fit and 511 select violations, so the counter is live —
  SURVIVES.
- Holdout exclusions hold in both readers — SURVIVES — but **WORSE THAN
  FILED**: the stamped and read-time holdout rules share five markets, so the
  gate tunes on 14 stamped-held-out markets and the two indices rows are
  disjoint single markets (recorded in §5).
- 44 / 21 / 16 and the clustered SEs — SURVIVES, names identical.
- Four starved classes and the 145 index decisions — SURVIVES, with cause:
  no `--fold-spec` on the card.

**Lens D — engine-axis conformance** (one pass over all 97 markets):
- `baseline` is bit-identical (full row minus `variant`, same order) to
  exactly one explicit intraday variant on all 97 markets; derived resting
  distribution trail_tp1 65 / breakeven 25 / hold 7, matching the manifest
  and HEAD — SURVIVES, stronger than filed.
- "Daily structure admits more decisions and loses none" — **KILLED** (§5).
- The three runner modes differ in outcome mix and net R on every market
  and class that has rows; stop_loss, unfilled and expiry counts are
  identical across modes (the knob acts only after TP1) — SURVIVES.
- `runnerProtection` recorded on 4,451,317 filled rows equals the variant's
  mode; all 781,128 unfilled rows read `unrecorded` — SURVIVES, 0 violations.
- "A capped stop cannot move between stop sources" — **KILLED**, and the
  engine comment's "always tightens, never widens" with it (§5).

**Lens B — the reconciliation instrument** (a route sharing nothing with
the instrument):
- The SHA-256 of the capture-all arm's top-level `accepted: true` lines in
  file order equals the SHA-256 of the whole gated file — the identity,
  proven without the instrument — SURVIVES.
- The instrument is order-strict (a swap shows as two differing rows), and
  compares nested `legs` and `votes`; two stated blind spots (absent vs
  `null`, `−0` vs `0`) are unreachable on a byte-identical corpus — SURVIVES.
- The test file was **WORSE THAN FILED**: 11 of 16 instrument mutants
  survived it. Nine executed tests were added (nested divergence, the
  capture-all side's manifest count, orphan keys, missing counterparts in
  both directions, a missing `decisions[]`, `ignoreLowEdge`, a dirty gated
  arm under both definitions, the enumerated shared-term list, a
  non-boolean `accepted`), and two mutants were re-applied by hand and
  killed before the fix was kept.
- The provenance explanation SURVIVES with one correction: the only
  untracked path at resolution was `arms.status` (the logs were still
  ignored); the instrument's old sentence "engine is not the recorded
  revision" was false of this run and now distinguishes the two
  definitions.

**Lens C — this record** killed twelve sentences, all corrected in place:
the eleven-bucket sum (an aggregate counted as a bucket), the machine-sleep
explanation (no sleep occurred), "lose to `trail_tp1` at p = 1.000" (the
gate pairs against baseline, which is `trail_tp1` only in forex and metals),
the indices pair count, the "< 0.003R" and "0.02–0.04R" ranges, the 313
"artifacts carrying the pin" (COT carries none), the tracked stdout logs
carrying the confirm split's outcome columns (now redacted, see §7), the
reconciliation verdict's wording, "every figure quotes an artifact", the
livestock fold end, the "status and log" wording, and three minor figures.

<!-- §6a-end -->

## 7. Defects found, and how each was closed

- **The run card's global folds starve four classes — FOUND, and CLOSED by
  the per-class arm (§10).** `--fold-spec` exists for exactly this ("one 17-year global
  calendar starved every 2023-era market … of fit and select entirely",
  `scripts/sweepFolds.ts`), the 4c fleet ran on per-class calendars, and the
  card as proven on two forex and crypto markets could not show it. The
  per-class spec at the anchor is derived and tracked
  (`docs/research/r3/fold-spec-2026-08-26.json`: forex 2009-09-25, metals
  2013-07-14, crypto 2013-11-04, indices 2020-02-24, futures 2023-09-24,
  agriculture 2023-09-25, livestock 2023-09-25, energies 2023-10-01, each to
  2026-08-26 except livestock, whose last pinned bar is 2026-08-25T18:00Z). A per-class arm costs zero bytes at the pinned anchor and is
  the class-grain instrument for those classes. **Launched 2026-09-02
  15:07Z from merged main `886fdf1` (PR #563)**, both acceptance modes,
  concurrently, preflight 313 pinned, tree clean (`dirty: false`,
  `untracked: 0` under the new definition — the status file and logs are
  ignored paths this time). Per-class folds as printed by the driver: forex
  fit 2009-09-25..2018-03-11 · select ..2022-06-03 · confirm ..2026-08-26;
  crypto 2013-11-04..2020-03-31 · ..2023-06-13 · ..2026-08-26; metals
  2013-07-14..2020-02-04 · ..2023-05-16 · ..2026-08-26; indices
  2020-02-24..2023-05-27 · ..2025-01-09 · ..2026-08-26; futures
  2023-09-24..2025-03-11 · ..2025-12-02 · ..2026-08-26; energies
  2023-10-01..2025-03-14 · ..2025-12-04 · ..2026-08-26; agriculture
  2023-09-25..2025-03-11 · ..2025-12-02 · ..2026-08-26; livestock the same to
  2026-08-25. Results in §10. Item 2's law is about corpus coherence under
  one engine, not process count, and the engine is unchanged.
- **The fold-spec deriver pinned itself to the run day — CLOSED.**
  `scripts/derive-fold-spec.ts` read the cache at `new Date()`, the same
  defect the driver carried until `--anchor`; at 2026-08-26 it would have
  refused a fully warm cache as cold. It now takes `--anchor`, `roster`, is
  importable, and refuses rather than fetches; `tests/deriveFoldSpec.test.ts`
  proves the spans are read at the pin and truncated there.
- **`source.dirty` fired on the run's own output files — CLOSED for future
  corpora, explained for these.** `resolveSweepSource` now reports tracked
  change as `dirty` and counts untracked files in `untracked`; the old
  definition called R3's tree dirty over its own status file. Executed tests
  cover every porcelain shape.
- **The minute-bank backup's off-box push cannot run under launchd — CLOSED.**
  At 2026-09-02T05:36:29Z the agent placed the local snapshot and logged
  `FAIL wl-secret is not on PATH; the R2 token cannot be read`, exit 1. The
  plist runs `/bin/zsh -lc`, a login shell that never sources `~/.zshrc`,
  which is where `~/.local/bin` joins PATH — so the lookup worked in every
  interactive shell and failed in the one environment the schedule runs from.
  `scripts/ops/backup-minute-bank.sh` now resolves the launcher by absolute
  path (`${LEVELFLOW_WL_SECRET:-$HOME/.local/bin/wl-secret}`) and the
  launcher hands the push script a known PATH. Three executed tests in
  `tests/minuteBankBackup.test.ts` run the script under a launchd-shaped
  environment with a recording stub: RED before the fix (the script hit its
  own "not on PATH" branch), GREEN after. **Verified live 2026-09-02T15:08Z**,
  after the fix merged: kickstarted under launchd, the agent placed the
  snapshot, archived it (17,460,969 bytes), uploaded it to R2 and verified
  the remote MD5 (`c5b28271…`), exit 0 — the first off-box copy the schedule
  has ever completed on its own.
- **The same script found its repository by a literal path — CLOSED, found
  by CI.** `REPO="/Users/peacock/Projects/levelflow-cloud"` made the off-box
  branch unreachable on any other checkout: CI's first run of the launchd
  cases died on a "missing" push script before the launcher check they
  exercise, and the pre-existing tests never reached that branch because
  they skip the off-box step. The root is now derived from the script's own
  location, pinned by a source test, and proven by running the script from a
  foreign checkout root under a launchd-shaped PATH (exit 0, the launcher
  invoked by absolute path).
- **Twelve corpus readers read the confirm fold with no opt-in and no ledger
  entry — RECORDED, ranked as R4's first act.** The 2026-09-02 audit (verified
  by hand on `sweep-analysis`, `cost-sensitivity-verdict`,
  `roster-expectancy-audit` and `stop-provenance`) found that only
  `data-limits`, `derive-4d`, `feasibility-4d` and `grid-totalr` without
  `--confirm-final` leave the fold sealed. The other twelve pool or print
  confirm-fold figures (the audit that found them counted eleven; named, they
  are twelve) — five re-cut the folds themselves at 50/75% of the span and
  never read `row.split` (`roster-expectancy-audit`, `market-dossier`,
  `cost-sensitivity-verdict`, `threshold-rescue`, and `grid-totalr`'s
  `--per-market-folds` path) — and none writes the LA-6 ledger. A confirm read
  through any of them is an unrecorded one. R3's report used none of them;
  the sealed summary reader exists because of this. Ranked in
  `docs/HANDOFF.md` (6b-0's reopened corpus-readers row). **CLOSED the same
  day by R4 act 1** (`r4-act1-seal-readers-2026-09-02.md`): the door seals
  the fold by default, the population — nineteen once derived rather than
  listed, two more exposures than this audit found — is migrated, and an
  executed differential guard fails in both directions.
- **The driver's own stdout table prints the confirm split's outcome columns
  — FOUND, contained.** `replay-sweep.ts` prints one row per (market,
  variant, split) with `tp1HitRate`, `stopRate` and `expectancyR`, the
  confirm split included, by design and on every run. The record refuter
  found those 679 rows per arm staged for tracking under "the confirm fold
  is sealed". The raw logs now stay local (gitignored again); the tracked
  evidence is `*.stdout-redacted.txt`, in which the three outcome columns of
  every confirm row read `sealed` and the gate tallies are untouched —
  `starvation-audit --report` produces byte-identical output from the
  redacted table. **CLOSED the same day by R4 act 1**: the driver prints
  `sealed` in those cells unless `--print-confirm-table` is passed, and the
  four raw logs that held the unsealed cells were deleted.
- **The nightly cache top-up read the shared breaker's refusal as "a real
  failure" — CLOSED.** Its 11:00Z run was refused by the open breaker (the
  intended stand-down: "FMP circuit open for 35.7h … Next probe in 0.8h"),
  but the script's stand-down grep knew only the provider's own tokens
  (`(429)`, `providerQuotaExhausted`, `Too Many Requests`), which a run the
  breaker refuses never carries — so it logged "no quota signal in the
  output, so this is a real failure" and the agent read FAILING for the
  breaker doing its job, every run since #493. The breaker's refusal now
  leads with a stable `fmpCircuitOpen:` token (executed test), and the
  top-up has a third named stand-down for it, after the must-stay-red guard
  (source pin, with ordering). Found in the agent logs while sweeping for
  strays; nothing about R3 caused it. **A live exercise of the fix went
  wrong and is recorded as such:** kickstarting the agent at 18:01Z, the
  breaker allowed its probe, FMP SERVED it — the allowance is back under the
  ceiling, ten days before the estimate — and the top-up began a real warm.
  It was stopped after ZBUSD and ZNUSD, having spent **34.1 MB** of
  allowance (`.fmp-usage.json`), the only provider bytes this session
  spent and not ones it was permitted to; the scheduled 07:00 run resumes
  the warm, and the 2026-08-26 pin is untouched by construction. The
  breaker branch could not be exercised live because there is no longer an
  open breaker to refuse a run; it stands on its executed token test and
  the source pin.
- **`grid-totalr` called a three-fold corpus "legacy two-split" whenever it
  was graded without `--confirm-final` — CLOSED.** The sealed state now has
  its own words, legacy is reserved for a manifest that declares no folds,
  and an executed test drives the real binary on a three-fold fixture without
  the flag and proves the ledger directory stays empty. The gate's
  statistical core is untouched.
- **`PROTECTED_ANCHORS` said "Remove once R3 has run" while register items B
  and C said it must survive R4's supplementary arms — RESOLVED.** The entry
  states both facts and the later ruling governs; the per-class arm above is
  the first use of the kept pin.

## 8. Decided, open, and what gates it

**Decided by R3:**
- The corpus exists, is one measurement in two acceptance modes, and is
  readable by the sealed readers; register item H is closed.
- At rest, forex is the only class with positive net expectancy on both
  tuning folds; crypto, metals and indices are not; four classes are
  unmeasured at the class grain until the per-class arm runs.
- Against baseline on the gate's paired test, `breakeven` and `hold` fail at
  p = 1.000 in forex, crypto and metals — a comparison with `trail_tp1` only
  where baseline IS `trail_tp1` (forex, metals; crypto's baseline is a mix and
  the gate's index market rests on `hold`). On the summary's pooled net
  expectancy `trail_tp1` is the best of the three modes in every class with
  rows. Daily stop structure moves the money by less than 0.005R per trade
  where there is a sample.
- Modelled cost is larger than the net loss in crypto and metals.

**Decided by the per-class arm (§10):** every class now has a class-grain
reading; no grid variant is accepted in any class; forex at rest is the only
net-positive class; futures, energies, indices and livestock lose before
modelled spread and slippage are charged at all.

**Open, and what gates each:**
- Every per-market verdict and every calibration value — gated on R4, which
  is gated on sealing the twelve readers (§7) so its one confirm read is a
  recorded one.
- Whether forex's +0.013 survives the confirm fold — R4's read, nobody
  else's.
- The crypto fit/select sign flip (+0.123 → −0.065) — R4's per-market
  program, with the fold calendars per class rather than global.

## 9. Storage

| | before | after |
| --- | --- | --- |
| free disk | 284 GB | 224 GB (after both arm pairs) |
| `.calibration-cache` | 7.7 GB (pinned reads write nothing) | 7.7 GB |
| `.minute-bank` | 219 MB | 219 MB |
| `docs/research/r3/` corpora + sidecars + raw stdout logs (gitignored) | — | 61.95 GB across the four arms |
| tracked artifacts in `docs/research/r3/` | — | ~5 MB (manifests, redacted stdout tables, reader outputs, fold spec) |
| strays under `/private/tmp` | none | none (the probe corpora were removed; scratch holds 3 MB of refuter scripts) |

**Later the same day (R4 act 1).** The two gated emits were released after
proving them derivable: `grid-totalr` and the sealed summary produce
identical output from the capture-all arms filtered to `accepted: true`,
so the gated files carried no information the capture-all arms do not.
Free space 249 GB after the release (from 284 GB with all four corpora on
disk). The four raw stdout logs were deleted (§7). `docs/research/r3/` now
holds the two capture-all arms (33.5 GB) with their sidecars; the tracked
evidence is unchanged.

## 10. The per-class arm — the class-grain instrument for all eight classes

Launched 2026-09-02 15:07:10Z and 15:07:30Z from merged main `886fdf1` (PR
#563), tree clean, both acceptance modes, the same anchor, grid, depth and
step as §2, plus `--fold-spec docs/research/r3/fold-spec-2026-08-26.json`.
Zero provider bytes by the same preflight.

| arm | exit | elapsed | rows | emit | rejection sidecar | manifest |
| --- | --- | --- | ---: | ---: | ---: | --- |
| gated-classfolds | 0 at 17:36:07Z | 2h 28m 57s | 5,216,341 | 13.15 GB | 3,942,228 rows | `50cf0f69921a` |
| capture-all-classfolds | 0 at 17:39:57Z | 2h 32m 27s | 6,634,732 | 16.71 GB | 2,523,837 rows | `021821537f28` |

Both manifests: `source { dirty: false, untracked: 0, revision: 886fdf1… }`
— the new definition, stamped at launch from a tree whose only outputs were
ignored paths (the manifests themselves are untracked until this change set
lands). 97 of 97 markets, 71 columns, 19 stamped holdout,
15 engine-declined, **9,158,569 decision points across 1,841 cells** (more
cells than the global arm's 1,379 because every class now has three
populated folds; 5,971 fewer decisions, from the class calendars' own
embargoes and fold-boundary warm-ups — which of the two, untested).
Reconciliation (`reconcile-two-arms-classfolds.txt`): 24 terms agree,
decision points agree on all 1,841 cells, **5,216,341 of 5,216,341 accepted
rows byte-identical**, the identical-corpus verdict printed, exit 0. The three
counters and their aggregate: regimeBlocked 1,286,866 · belowPayoff 402,565
· belowConfidence 8,554 (belowThreshold 411,119) in the gated manifest, 0 in
the capture-all one.

**The class calendars** (each class folds 50/25/25 on its own span, embargo
5 days): forex fit 2009-09-25..2018-03-11 · select ..2022-06-03 · confirm
..2026-08-26 (identical to the global calendar, so forex's figures are
unchanged from §5); crypto 2013-11-04..2020-03-31 · ..2023-06-13 ·
..2026-08-26; metals 2013-07-14..2020-02-04 · ..2023-05-16 · ..2026-08-26;
indices 2020-02-24..2023-05-27 · ..2025-01-09 · ..2026-08-26; futures
2023-09-24..2025-03-11 · ..2025-12-02 · ..2026-08-26; energies
2023-10-01..2025-03-14 · ..2025-12-04 · ..2026-08-26; agriculture and
livestock 2023-09-25..2025-03-11 · ..2025-12-02 · ..2026-08-26 (livestock to
08-25). The 2023-era classes therefore tune on ~17 months of fit and ~9 of
select — thin, and every figure below carries its own error.

**Per class at rest (`baseline`), fit + select pooled, held-out excluded**
(`tuning-folds-summary-gated-classfolds.txt`):

| class | n | filled | TP1 hit | stop | net E | ±SE clustered (k) | gross E | net total R | gross total R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| forex | 252,522 | 218,364 | 68.8% | 23.7% | **+0.013** | ±0.006 (19) | +0.037 | **+2,896.9** | +8,047.8 |
| crypto | 86,130 | 72,674 | 66.4% | 29.9% | −0.065 | ±0.028 (24) | +0.028 | −4,725.5 | +2,080.9 |
| metals | 10,120 | 8,004 | 59.2% | 30.0% | −0.078 | — (XAUUSD alone) | +0.004 | −621.2 | +31.5 |
| futures | 20,893 | 16,446 | 52.2% | 34.2% | −0.101 | ±0.028 (16) | **−0.042** | −1,666.9 | −710.6 |
| agriculture | 6,021 | 4,246 | 53.3% | 31.5% | −0.135 | ±0.031 (5) | +0.019 | −573.4 | +86.2 |
| indices | 681 | 594 | 46.1% | 26.3% | −0.167 | ±0.091 (4) | **−0.125** | −99.3 | −75.5 |
| energies | 1,048 | 875 | 41.4% | 35.8% | −0.201 | — (WTI alone) | **−0.164** | −176.1 | −145.4 |
| livestock | 1,044 | 772 | 58.0% | 38.1% | −0.205 | ±0.149 (3) | **−0.062** | −158.1 | −48.4 |

Per fold at rest: futures fit −0.126 (10,719 filled) / select −0.056
(5,727); agriculture −0.137 (2,835) / −0.131 (1,411); energies −0.201 (577)
/ −0.202 (298); livestock −0.136 (517) / −0.345 ±0.364 (255 — no evidence);
indices −0.038 (195) / −0.230 (399); metals −0.091 (5,497) / −0.047 (2,507);
crypto on its own calendar +0.048 (24,665) / −0.123 (48,009) — the same sign
flip as §5 on a different cut.

**Where the loss sits, by class.** In crypto, metals and agriculture the
GROSS arm is positive: the published commission alone leaves money on the
table and the modelled spread and slippage take it (≈0.093, 0.081 and
0.154R per filled trade — approximate, because the gross arm fills a
slightly different set: metals 8,204 gross fills against 8,004 net). In
futures, indices, energies and livestock the gross arm
is itself negative — the structure loses before our cost model is charged at
all, so cost is not the lever there. Forex is the only class positive on
both arms.

**Frequency beside money, at rest** (≥30 filled, held-out excluded): 73
markets clear the floor; **20 have net expectancy above zero; 35 win at
least half of their filled setups while losing money** (named in the
summary file; among them 9 of the 16 non-held-out futures markets — CLUSD,
ESUSD, GCUSD, HGUSD, PAUSD, PLUSD, RTYUSD, YMUSD, ZTUSD — three of the four
graded indices, both graded livestock markets, XAUUSD, and eleven crypto
markets; BTCUSD, ETHUSD and XRPUSD are net-positive and not among them).

**The acceptance gate, class grain, fit and select, confirm sealed**
(`grid-totalr-fit-select-classfolds.txt`; holdout 20 read-time stratified;
2,269 data-absent rows held out): **no variant is accepted in any of the
eight classes.**
- Where baseline is a mixed or non-`trail_tp1` cell, the INTRADAY
  `trail_tp1` arm beats baseline on both folds at paired p = 0.001 — crypto
  ΔR +158.9 fit / +211.5 select, futures +78.5 / +43.8, indices +3.8 / +14.1
  — and every one fails D4's absolute term (select expectancy −0.147,
  −0.053, −0.132). The daily `trail_tp1` arm reaches p = 0.001 only in crypto
  (+169.0 / +269.2); futures' daily arm is +49.9 / +13.2 at p 0.595 and
  indices' +4.2 / +12.3 at p 0.003. The gate's two questions are separable,
  and the second is the one that matters.
- Where baseline is `trail_tp1` (forex, metals, energies), `breakeven` and
  `hold` fail at p ≥ 0.97 on every arm; `trail_tp1 + daily` fails on fit
  (forex −1.7, metals −28.2, energies −22.6).
- Livestock's baseline is `breakeven`; `hold` fails (ΔE select −0.089) and
  `trail_tp1` fails (p 0.911). Agriculture: every arm fails, the daily
  arms worst (ΔR select −42 to −63 at p = 1.000).

**What this changes.** The class-grain reading now exists for all eight
classes and it is uniform: at rest, only forex is net-positive on the
tuning folds; the runner axis prefers `trail_tp1` wherever the resting mode
is `hold` or a mix (crypto, futures, indices) but not on livestock, which
rests on `breakeven` and reads −0.206 against −0.205 (p 0.911), and never
enough to earn money on select; the daily stop source never earns
acceptance — it is marginally better than its intraday twin on every crypto
arm and on forex's `trail_tp1` arm, and worse on the rest. The per-class corpus is the
class-grain corpus of record; the global-fold corpus stays as the card as
written and as R4's input for read-time per-market folds. The confirm fold
of BOTH corpora remains sealed; R4 owns the one read of whichever it grades.

**Refuted before it was recorded.** A fifth refuter recomputed §10 from the
per-class corpus in one streaming pass: every table cell, per-fold figure,
calendar date and gate verdict matched; fold scoping held with zero rows
outside their own class calendar and zero embargo violations across all 24
(class, split) cells; the 73 / 20 / 35 line and its names reproduced
exactly. It killed five sentences, corrected above: the daily `trail_tp1`
arm's p-value in futures and indices, "every futures-shaped market except
three", "the daily stop source never helps", the metals cost figure and its
denominators, and livestock's preference.
