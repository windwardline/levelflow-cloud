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
and R1's E2 door assertion); and
the nightly top-up stands down by name against the condemned store, so
the "stopped or not" ambiguity above no longer matters. The allowance
did NOT have to age out: the owner purchased a **100 GB plan upgrade on
2026-08-18** and the probes came back clean the same day (no 429s; the
minute bank's 13:00Z run banked all 97 symbols). The bytes are
available now — **`docs/cache-rebuild-r0.md`** is the runbook, including
the re-arm of this launchd agent.

### Phase 1 — one engine (close every sweep↔live divergence)
So that what is measured is what trades:
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
- **D4** the gate's `accepted` is four delta conditions and a thinness
  check with **no absolute expectancy term** — the defect that let a
  losing market pass. Add select-fold expectancy and its error to the
  verdict and to the rule.
- **M3** the confirm read decides on a bare `delta > 0` with no sample
  floor, no error bar, no p — give it the select stage's own bar.
- **M1** `roster-expectancy-audit.ts` double-counts the baseline variant;
  drop the `|| variant === "baseline"` alternative, re-run, and commit
  script and artifact together.
- **M5/1c** make the cost scale reach the resolver, and assert that an
  identical gross/net row emits "COST MODEL INERT" instead of a verdict.
- **D1** global learning derives `confidence_adjustment` from a win
  *rate*; derive it from mean realized R instead.

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
