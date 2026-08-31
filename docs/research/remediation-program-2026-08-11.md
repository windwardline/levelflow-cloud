# The remediation program — written 2026-08-11, to be executed from Sunday

**Read this before touching calibration.** It supersedes the "next steps"
of every 2026-08-10/11 document, because the corpus those documents were
computed from is invalid.

The owner's framing, recorded because it turned out to be the correct
read of the situation: *"I expected we would have to redo everything,
since we continued to find faults as we fixed little, specific things."*
The pattern — each targeted fix surfacing another fault — was itself the
signal, and it was read correctly before the evidence was complete.

---

## 1. The determination

**The 4c/4d corpus cannot be trusted, and everything derived from it is
unproven.** Not the geometry conclusions, not the 72 derived cells, not
the 49 markets called measurably positive, not the fill rates, not the
declines' stated justification.

Three verified defects, in order of consequence.

### 1a. The clock defect — the corpus measured with look-ahead

The cached 15-minute and daily series carry **naive New-York stamps read
as UTC**; the 5-minute series carries **true UTC**. Every setup was
therefore resolved against a price stream **4–5 hours out of register
with the bar that decided it**, so roughly half of each review window
lies *before* its own decision. That is look-ahead, and it is why the
5-minute fill rate reads 97–98%.

Reproduced independently (2-line diff of `sweep.ts`, same cache,
5min-dense confirm-fold decisions only), then re-run with the 5-minute
series re-stamped onto the 15-minute clock:

| market | as measured | clock-corrected |
|---|---|---|
| EURUSD | +0.213R | **−0.008R** |
| BTCUSD | +0.198R | **−0.082R** |
| XAUUSD | +0.247R | **−0.031R** |

The corrected arms agree with the 15-minute arm in all three. **The
measured edge of the flagship positive markets is entirely an artifact.**

Corroborating evidence: the 15-minute weekly open sits at 17:15 UTC in
823 of 830 weeks with no DST variation (17:00 ET read as UTC), while the
5-minute open moves with DST; shifting the 5-minute series +4h reproduces
the 15-minute extremes in 75–84% of buckets across 2010–2025, and at zero
shift the exact-match rate is 0.0% for the whole history and 94% only in
2026-08 — the region refetched under the current normalizer. There is a
4-hour discontinuity in the 15-minute primary series at ~2026-08-03 where
the two normalizations meet.

This is the same defect class item 2 closed (2b: NY stamps read as UTC),
resurfacing on the one series that repair did not cover.

**Two corollaries**: the corpus's session gating and news joins were
computed on the same early stamps, so its decision set never matched
production's either.

### 1b. The 5-minute series is a third of a series

`replay-sweep.ts` sizes `INTRADAY_CHUNK_DAYS = 30` against FMP's ~3,000
row cap for 15-minute data and reuses it verbatim for the 5-minute fetch,
where 30 days is 6,200–8,600 rows. Each chunk returns only its most
recent ~2,000, producing a 30-day sawtooth across the whole span: EURUSD
has 5-minute-dense data on 1,408 of 5,247 days. Measured across all 97
markets the 5min/15min row ratio runs **0.607–1.040, never near 3**.

Consequence: **64.7% of confirm-fold decisions are phantoms** — 3,656 of
3,656 zero-coverage decisions recorded "unfilled" (100.0%) against a 2.2%
unfilled rate where coverage exists. This voids every fill-rate and
unfilled statistic in the record and costs ~3× the effective sample. It
does not by itself bias expectancy (coverage is a calendar sawtooth
uncorrelated with returns) — the bias is 1a.

Also: during zero-coverage stretches the committee still receives
`fiveMin.slice(-240)` with no recency test, so the 5-minute vote can be
cast on bars up to ~19 days stale.

### 1c. The cost-sensitivity test never ran

`LEVELFLOW_MODELED_COST_SCALE` scales `estimatedRoundTripCost`. **The
resolver never reads that value.** Fills are handed `estimatedSpread` and
`estimatedSlippage` directly (`sweep.ts:568-569`) and realized R charges
commission through `perLegCost`. Setting the scale to 0 removed nothing
from the R accounting; it only loosened the payoff gate, admitting more
setups. Eleven of twenty rows returned bit-identical — proof the switch
did nothing, read at the time as agreement.

**Amendment 36's standard was therefore never met for the 15 declines**,
and the sentence shipped on all fifteen was false. Corrected in the code
2026-08-11; the declines stand only on the conservative reading that 1a
*inflates* expectancy, so a market measured negative under it is very
unlikely to be positive under a correct measurement.

---

## 2. What must not be trusted until re-measured

- The **49 markets** called MEASURABLY POSITIVE. Their edge is the
  artifact of 1a until shown otherwise.
- Every **fill rate, unfilled rate and TP1-hit rate** in the record (1b).
- The **15 declines'** stated justification (1c) — though their direction
  is conservative.
- `docs/research/baseline-2026-08-10/*` verdict artifacts, and
  `roster-expectancy-audit.json` (which additionally double-counts the
  baseline variant — see M1).
- Any claim of the form "N confirmed cells" as evidence of profitability.

## 3. What stands

- **Engine v2's cost model structure** — the venue-bill tables are
  E8-published facts, independent of the corpus.
- **The identity work** — roster names, the strict classifier, the
  105/97 arithmetic.
- **The product-truth fixes** — ambiguous-as-loss, the Guide rulings,
  superseded flags, correlation completion.
- **Gate v2's machinery** — the permutation, the burned confirm log, the
  stratified holdout. Its *criterion* is wrong (D4: no absolute
  expectancy term), not its statistics.
- **The measurement instruments built during the audit** — the dossier
  generator, the threshold sweep, the per-market fold re-cutting.

---

## 4. The program, in order — the order is load-bearing

### Phase 0 — one clock (root cause; nothing else is meaningful first)
Rebuild `.calibration-cache` under a single normalization. Establish
which normalization is correct against a known instant, assert it in the
manifest, and add a guard that refuses a corpus whose series disagree on
the clock. Re-fetch what must be re-fetched. **Nothing downstream of a
mixed-clock cache is worth computing.**

Two operational facts Phase 0 inherits, both set 2026-08-11:

- The mixed-clock store is `.calibration-cache` (3.9 GB, gitignored). It
  carries a local `INVALID-READ-ME.txt`; because the directory is
  ignored, that marker exists only on this machine — this paragraph is
  the tracked record of it.
- **The daily top-up is STOPPED.** `com.windwardline.levelflow-cache-topup`
  (07:00, `scripts/ops/daily-cache-topup.sh`) was appending fresh bars to
  the defective store every morning. It was booted out rather than left to
  deepen it. **Phase 0 must restart it once the cache is rebuilt** — a
  cache that silently stops updating is the same class of failure in the
  other direction:

  ```
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.windwardline.levelflow-cache-topup.plist
  ```

  `com.windwardline.levelflow-minute-bank` was deliberately left running:
  it banks 1-minute bars for the E8 feed-identity corpus and touches
  nothing the clock defect reaches.

**Status 2026-08-18 — Phase 0's code half is in, and the rebuild is
UNBLOCKED.** Every rolling store now records the clock that wrote it and
refuses to load under another (`cacheClockMismatch`); per-year witnesses
and 15min↔5min registration ride in the manifest and are enforced at
every emit reader the repo has (nine bare readers doored plus the
aggregation doors — the population is pinned by a sweep-style test in
`tests/sweepStats.test.ts`, not by an enumeration in prose); the 1b
chunk sizing is fixed against caps measured complete on 2026-08-18
(per-chunk clip detection proved infeasible without false positives —
the guard is the measured caps, the verifier's density floor+ceiling,
and R1b's E2 density assertion, landed in TWO layers: the sweep
driver's pre-flight, refusing at the first violator before that
symbol simulates (the loop interleaves per symbol, so a late violator
costs the roster prefix already walked — #364 round 31), and the
read-time corpus door, with the nightly `--warm-only` log the
standing full-roster survey (running the door itself in report mode
since round 32 — would-refuse verdicts logged, never thrown); the
verifier ceiling's blind band is a
stated residue — ≤~7.7% under the assertion's clip-invariant
max(15-minute, 5-minute/3) population, plus the uncovered
symmetric-clip case — never a closure, #364 rounds 8–11); and
the nightly top-up stands down by name against the condemned store, so
the "stopped or not" ambiguity above no longer matters. The allowance
did NOT have to age out: the owner purchased a **100 GB plan upgrade on
2026-08-18** and the probes came back clean the same day (no 429s; the
minute bank's 13:00Z run banked all 97 symbols). The bytes are
available now — **`docs/cache-rebuild-r0.md`** is the runbook, including
the re-arm of this launchd agent.

### Phase 1 — one engine (close every sweep↔live divergence)
So that what is measured is what trades.

> **Map 2026-08-18:** every divergence below is pinned to code on both
> sides, each decision drafted, and the change set sequenced (three PRs:
> R1a one physics, R1b stated inputs + the E2 door, R1c the E4
> instrument) in `docs/research/r1-divergence-map-2026-08-18.md`. The
> mapping also DISCOVERED one divergence this list lacks — **E7: the
> live options bridge drops the runner-protection mode (and review
> window), so both live writers grade every row "breakeven" while the
> calibration ships trail_tp1/hold for most categories** — and settled
> E1's open depth question by measurement (the live 45-day 15-minute
> request returns complete: 4,266 rows / 45 dates, probed 2026-08-18).
- **E1** production resolves on 15-minute bars, the corpus on 5-minute.
  Decide the anchor deliberately — do NOT simply move production to
  5-minute, which would import 1b's sawtooth into the live path.
- **E2** add a distinct resolution state for "no bars in the review
  window" so those decisions are neither filled nor unfilled, and assert
  per-symbol 5-minute density in `assertManifest`.
- **E3** `market.latest` comes from the 1-minute series live and the
  15-minute decision bar in the sweep — pin one anchor for both.
- **E6** the sweep's score omits terms production adds; give the sweep
  the inputs or state that they must be zero.
- **E4** production collapses correlated candidates per scan and the
  sweep does not — measurable offline from the corpus (a read, not a
  re-sweep).
- ~~**D3** two live resolvers with different physics~~ — **DONE
  2026-08-11 (#333)**: both call sites now pass
  `fillOptionsFromRiskModel(setup.risk_model)`, guarded in
  `tests/securityHardening.test.ts` against a bare `(setup, bars)` call.
- **D2** production records `realizedR` only on the expiry branch, so any
  R sum is a sum over expiries alone.

### Phase 2 — repair the instrument
- ~~**D4** the gate's `accepted` is four delta conditions and a thinness
  check with **no absolute expectancy term** — the defect that let a
  losing market pass. Add select-fold expectancy and its error to the
  verdict and to the rule.~~ **LANDED 2026-08-31.**
  The old conjunction is now named `beatsBaseline`, which states the defect as
  code: every term in it is a comparison, and a variant can satisfy all five
  while losing money. `accepted = beatsBaseline && earnsMoney`, where
  `earnsMoney` is the variant's OWN select-fold expectancy positive beyond its
  95% lower bound. The verdict carries the expectancy, its standard error and
  that bound, and a variant that clears every delta and still cannot show a
  profit gets its own reason — `LOSES MONEY — beat the baseline on every
  delta…` — rather than the bare `fails` that made it indistinguishable from a
  variant that lost outright.
  **No sample floor sits beside it, deliberately.** The first draft carried one
  at 30 and refused a fixture earning +1.2R over 24 trades whose lower bound
  was +1.08 — the floor was doing the rejecting, not the statistics. The bound
  uses a Student-t multiplier (`rExpectancyLower95` in `sweepStats.ts`), so the
  small-n problem is answered where it belongs: two observations carry
  t = 12.706 and "too few to judge" becomes a consequence rather than a
  constant somebody chose.
  Found while landing it: a variant beating its baseline on all six days with
  +5.0 of its +7.2 total on ONE of them has a mean of +1.2R and a 95% lower
  bound of −0.86R, and the old gate accepted it. That was this repo's own
  fixture.
  **The 4d picks now fail on two independent grounds.** The corpus was already
  invalid (the clock defect); D4 says the CRITERION was also wrong, so a
  re-sweep alone would not have rescued them — R3 must re-run under the
  repaired gate, not merely on repaired data.
  Five mutations, each verified applied and each killed by the intended test,
  including the pre-D4 rule restored verbatim.
- ~~**M3** the confirm read decides on a bare `delta > 0` with no sample
  floor, no error bar, no p — give it the select stage's own bar.~~
  **LANDED 2026-08-31.** The bar is now the select stage's, which since D4
  means the MONEY: the pick's own confirm-fold expectancy with a 95% interval,
  and the delta reported beside it rather than deciding (amendment 39).
  **THREE outcomes, where the binary could hold two.** `confirmed-profitable`
  (lower bound above zero), `contradicted` (upper bound below zero), and
  `indistinguishable` — which the old code called "negative" along with every
  genuine loss. A total is the wrong unit for the question twice over: it grows
  with the number of trades, and it carries no dispersion, so +0.3R over four
  outcomes and over four thousand printed identically.
  **The artifact keys changed with the quantity** — `confirmedPositive` and
  `confirmedNegative` are gone, replaced by `confirmedProfitable`,
  `contradicted` and `indistinguishable`. The 2026-08-11 completeness pass had
  already recorded that `confirmedPositive` was "a bucket of positive DELTAS
  wearing an absolute name" and killed it as cosmetic; it stops being cosmetic
  once the quantity changes, and a reader must not be able to put two different
  measurements in the same column. The existing artifacts keep their old keys
  and their old meaning.
  The p is delivered as an INTERVAL rather than a separate statistic: a 95%
  interval excluding zero is exactly p < 0.05 for that expectancy, and a
  permutation p over confirm-fold days would be a second heavier instrument
  answering the same question on a fold LA-6 rations.
  **A mutation caught a real gap before this shipped.** Restoring the bare
  `delta > 0` passed all 90 tests, because every market in the confirm fixture
  had zero-variance outcomes and the two rules agreed on all of them. The
  fixture gained USDCAD — confirm outcomes swinging +2.2/-1.6 around a mean of
  +0.3, so the total is positive and the interval spans zero — and the mutation
  then died. Three mutations, each verified applied and each killed.
- ~~**M1** `roster-expectancy-audit.ts` double-counts the baseline variant;
  drop the `|| variant === "baseline"` alternative, re-run, and commit
  script and artifact together.~~ **CLOSED 2026-08-31 — and this item named
  the wrong file.**
  `roster-expectancy-audit.ts` never carried that alternative. `git log -S`
  over the full history of that path returns nothing; the `||` lived in
  **`scripts/market-dossier.ts`**, was introduced by #330 and removed by #364.
  The audit reads ONE cell per market and, since #494, REFUSES a corpus
  carrying both the named baseline and the empty grid cell rather than
  choosing between them.
  **Both files are guarded, and the guards were verified by mutation rather
  than by having the right names.** Restoring
  `variant === BASELINE || variant === "baseline"` in `market-dossier.ts` kills
  two tests in `tests/marketDossier.test.ts` — including the one that catches
  the sample doubling, where every outcome was counted twice and the standard
  error ran a factor of √2 low, clearing the MIN_FILLED floor on a doubled n.
  Removing the refusal from `roster-expectancy-audit.ts` kills
  `tests/rosterExpectancyAudit.test.ts`'s "refuses the EMPTY grid cell" case.
  **"Re-run and commit the artifact" is BLOCKED, and must not be attempted
  here.** The 4c emits are not present in the working tree — only logs and
  manifests survive — so there is nothing to re-run against. Even with them the
  run would be wrong: that corpus is the one the clock defect invalidated, and
  `roster-expectancy-audit.json` already carries the quarantine banner. A fresh
  run would replace quarantined figures with equally invalid ones that look
  like progress. The artifact is re-derived after R3 produces a valid corpus,
  under the gate D4 and M3 repaired — it belongs to R3/R4, not to R2.
- ~~**M5/1c** make the cost scale reach the resolver, and assert that an
  identical gross/net row emits "COST MODEL INERT" instead of a verdict.~~
  **LANDED 2026-08-31.** Both halves. `resolverCostOptions` is now the one
  mapping from a cost reading to the resolver's triple, and the sweep and the
  live bridge share it — the duplication was the mechanism, because with the
  mapping written out twice there was no single place where routing the scale
  in would have fixed both. It scales the MODELLED half and never the
  published commission, which is amendment 36's standard expressed as
  arithmetic. The live bridge passes 1 explicitly, so a stray environment
  variable in production cannot re-grade the outcome corpus.
  `cost-sensitivity-verdict.ts` names an identical pair INERT and refuses the
  run outright when every readable market comes back that way — the artifact
  is written first, because it is the evidence of the failure.
  `tests/costScaleReachesResolver.test.ts` proves it by RUNNING the engine at
  two scales and comparing realized R; every source-shape assertion in it
  would have passed throughout the three weeks the defect was live.
  **Still open, and unchanged by this:** the two arms need two runs, because
  the scale is a per-process environment read (section 5, item 5).
- ~~**D1** global learning derives `confidence_adjustment` from a win
  *rate*; derive it from mean realized R instead.~~ **LANDED 2026-08-31**,
  and it turned out to be two changes rather than one.
  **The quantity.** Mean `netRealizedR`, shrunk to the end of its own 95%
  interval nearest zero, so a cohort is scored on the least flattering reading
  its data supports in BOTH directions — amendment 36's symmetry, because a
  reward should not answer to a weaker bar than a penalty. In R the neutral
  point is 0 by definition, which retires the mix-dependent break-even that
  forced the withholding rather than solving it.
  **The population.** `expired_in_profit` and `expired_at_loss` were excluded
  outright — filled trades that banked or lost real money, dropped because
  under a win rate they were neither a win nor a loss and there was nowhere to
  put them. `docs/trade-model.md`'s accrual query had counted them all along;
  the learning query was the narrow one.
  Every constant is anchored rather than chosen: z = 1.96 and a 30-resolution
  floor are `cost-sensitivity-verdict.ts`'s existing bar, the ±10 cap is the
  retired curve's own range, and 20 points per R lands a good cohort in the
  same ±3 band the retired curve typically paid. `MIN_RESOLUTIONS_FOR_ADJUSTMENT`
  exists because a normal multiplier lies at small n — three resolutions scored
  +2.2 under 1.96 where t at two degrees of freedom puts the bound below zero.
  Six mutations, including the retired curve restored verbatim, each killed by
  the intended test.

### Phase 2b — the geometry model's own fresh-eyes round

Ranked into the sequence 2026-08-19; it had sat in HANDOFF's section 5 as
a lens nobody owned. Several lenses, each asked what the geometry MODEL is
missing rather than how to tune it — the one surface the adversarial
protocol has never been pointed at.

**It must clear before Phase 3 opens.** Its output changes what the sweep
should measure, and Phase 3 is the ONE re-simulate. Run it after Phase 3
and the choice is a second full re-sweep or shipping a geometry no
adversarial pass ever probed.

### Phase 3 — re-sweep, once
One corpus, one clock, one engine, with the instrument repaired. Item
2's law still governs: **one re-simulate after the instrument changes,
never one per fix.**

### Phase 4 — the per-market program (the owner's mandate)

*Numbering note: this is Phase 4 of THIS program. It is tracked as task
"Item 5: per-market review" in the session task list, which is NOT
HANDOFF §4's sequence item 5 (Prop-firm survival). Amendment 37 puts
that sequence's items 5-10 in the next CONVERGE.*
Every E8-tradable, FMP-matched market reviewed **individually**:
- graded against **its own shipped configuration**, not a grid reference
  cell — the defect that let 33 markets inherit untested levels and 13
  trade at up to −1.8R (POP-1, AXES-1)
- **absolute expectancy** as the acceptance criterion, not a delta
- every calibration field either derived for that market or carrying a
  stated reason for inheriting (AXES-6)
- the axes 4d never varied: TP1 family at the shipped cap (AXES-2), the
  stop family and pivot depth (AXES-3), `blockedRegimes` per market
  (AXES-4), `sideScoreAdjustments` re-derived post-repair (AXES-5), the
  momentum voter's sell path (AXES-9)
- amendment 36's precondition restated against the **roster**, not the
  derived-cell set, so a cell-less market can be declined (POP-2)

### Phase 5 — the populations never analyzed
- the **8 contract-size variants** (MES, MNQ, MYM, MGCUSD, QM, QG, XC,
  XK): different commissions, different tick grids (QM 0.025 vs CL 0.01;
  QG 0.005 vs NG 0.001), XC and XK with no tick spec at all — and the
  instruments most likely to resolve capacity gating
- the **dual-listed crypto CFDs**: one verdict currently covers both the
  forex and crypto lines despite different commission and leverage
  (POP-6)
- the **register gaps** (POP-3, reduced by refutation to 3 of 18 —
  re-verify before acting) and the unautomated reentry probe (POP-7)

### Phase 6 — the reader-facing claims
D7 (Record rows publish a frequency as a record), D8 (confidence tiers
assert an ordering the corpus inverts). Both pre-reopen; the desk is
parked, so no reader sees them today.

- **SC-5 — DONE 2026-08-11, ahead of its phase.** The decline sentence
  published each market's `measuredExpectancyR` to three decimals, a
  number straight out of the invalid corpus, and it would have shipped on
  the first scan after reopening. The magnitude is now withheld; the
  sentence states the direction only, which is what the decline actually
  rests on. Pinned by `tests/calibrationState.test.ts`. **Phase 4 puts a
  number back only after re-deriving it.**

---

## 5. Ledger

44 findings: 8 refuted, 27 surviving with severities corrected by an
adversarial pass whose brief was to kill them, and **9 that the refute
pass never reached** (it batched only the `redo-required` and
`measure-required` claims). The 9 unrefuted are `disclose-only` or
`cosmetic` as filed and are NOT vetted — treat them as unreviewed
candidates, not as findings. Full detail, including which is which:
`docs/research/completeness-findings-2026-08-11.json`.

**Findings not yet placed in a phase above** are in the ledger with
their remedies; Phase 2 and Phase 6 are where most belong. A finding's
absence from the phase list is a gap in this document, not a decision
that it does not matter.

The single most valuable procedural lesson: **every claim that changed a
decision today survived only because something independent tried to kill
it.** The cost-scale no-op, the clock artifact, and the
improvement-versus-positivity conflation were all caught by refutation,
not by the work that produced them. Whatever else Sunday does, it should
keep that pattern.
