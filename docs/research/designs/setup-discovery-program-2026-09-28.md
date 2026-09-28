# Setup discovery program (2026-09-28)

> **Status: design.** Nothing here is registered, hashed or computed. It lands on `main` before any
> stage below computes a decision. Four owner questions (Q8a, Q8b, Q10, Q12) and six E8 facts come
> first. Figures are labelled MEASURED (with source) or JUDGED.

## Purpose

The owner's directive: "We have years of history at our disposal. Use that to identify the best
possible approach to finding setups." The goal behind it is a desk that opens on net realized R
(amendment 39) as early as the law allows.

History cannot confirm anything. Only dates at or after the frontier (2026-08-26T10:45Z) confirm, and
they accrue in real time (amendment 46). This program uses history for three jobs:

1. **Instrument truth.** It measures what the feed, the cost model, the vintage and a hand-placed
   order do to a bracket, by hour.
2. **Screen and select.** It grades families that registered before any of their decisions existed.
3. **One counted search.** If the owner rules Q8a and Q8b yes, it runs one pre-registered search whose
   survivors register as units.

Its output is the family with the highest honest price, frozen once on forex's first draw. If nothing
earns that price, the output is a measured reason to freeze nothing.

## How this was judged

- Four designs were judged, each attacked by a law refuter and a statistics refuter. The designs:
  environment-brackets, rigorous-mining, meta-labeling and structural-priors.
- The relay carried the full text of the first two designs and three of their four refutations. It
  cut off inside the rigorous-mining law refutation.
- The other two designs were judged from their drafts (`predeclared-grid.json`, `slate-draft.json`)
  and their refuters' scripts. The structural-priors refuters left no files, so the judge refuted that
  design itself (below).
- The judge verified these by hand before ranking:
  - the fold spans, from the manifest's `foldsByClass`;
  - the flagged-month counts;
  - each pair's amendment-48 fit/select boundary, re-run;
  - the naming winner's curse, re-run at 8,000 repetitions.
- The judge also ran a new end-to-end simulation of the synthesized ladder.

The companion files are listed at the end.

## Ranking

| Rank | Design | Can its output register under the law as ruled? | What it gives the goal |
|---:|---|---|---|
| 1 | **structural-priors**: two registrations hashed before any decision; five instrument controls; eleven pre-registered predictions that tell a mechanism from an artifact | Yes. It hashes before it computes. | The lawful spine, and the controls that calibrate the instrument. On its own it opens nothing soon: the nearest published effect prices at post-cost S 0.65–0.99, which is 8.6–20 years to confirm ([screen](/docs/research/designs/published-effects-screen-2026-09-27.md) #1). |
| 2 | **environment-brackets**: 37,800 native programs, an artifact detector, a kill battery | No. It computes every program before any registration (fatal, accepted). | The kill battery, the one-bar-late arm, a bounded native space, quarantine of the known cell. |
| 3 | **rigorous-mining**: 2,920,320 candidates from a geometry × mask tensor; StepM, SPA, pricing on a vault | No. Same fatal flaw. It would also bar the simple-rule space on 22 pairs for good. | Studentized StepM, the trial ledger, the tensor split, pricing on unselected reads, a freeze floor that protects forex's first draw. |
| 4 | **meta-labeling**: a boosted-tree filter over the plain TP1 bracket, 24 configurations | No. Its parent is not a shipped cell, and a model is not "one field and one op" (48 rule 3). Its parent's decisions exist on every fold. | Money labels; a ban on intraday-scale features, which carry the 2021–24 feed escape; the escaping-month canary. |

Why this order:

- **The first freeze blocks forex.** The first forex freeze claims [C_s, C_s + L_m) on every pair it
  names. Under 48's frontier definition, a later forex family then waits for that claim to end. So
  every family meant for that freeze must register before the registry lands. Only structural-priors
  can register now.
- **The searches are the only fast route, and cannot register.** A search is the only way to find an
  effect larger than any published one, which is the only route to an open desk before 2030. As
  written, neither search can register what it finds. The synthesis gives them one lawful path (Q8b)
  and runs a search only if the owner rules it.
- **environment-brackets ranks above rigorous-mining.** Its space is 77 times smaller. Its build is 3–4
  sessions against 3–4 weeks. It also attacks the likeliest failure, a feed artifact.
- **meta-labeling can only refine the known positive.** That positive has no direction
  ([mirror](/docs/research/ladder-mirror-control-2026-09-27.md)). Its held-out select is −12.2 R, and
  its in-sample S is 1.8–4.2 times the literature's 0.6–1.0 as a plain bracket, and 2.6–5.5 times with
  the lock at TP1 (MEASURED, orchestrator 2026-09-28).

## The program in brief

Four tracks. This document landed alone (#710). The specs of M and S land together in one pull
request before anything computes, so nothing that Tracks I and R print can shape them. Track S also
waits for the execution version: under the eighth pass's rule 12, a pre-law screen that grades R
counts only at or after the engine version that grades a hand-placed entry one bar late, so S2 run
before it would make every survivor unregistrable.

- **I, instrument.** The anchor, the doors, battery calibration, the clock witness, the vintage by
  hour, and E8 spreads and paths. It computes no family that could register.
- **R, the ridge verdict.** It runs the kill battery on the one known positive, the 16–21 UTC plain
  TP1 bracket. That cell's decisions already exist, so reading them spends nothing more. It reports
  market, artifact or undecided, and registers nothing by default.
- **M, the mechanism slate.** `ldnfix-reversal-v1`, hashed before any of its decisions is computed.
  Its reads run after Track R.
- **S, the counted search (only if Q8a and Q8b are yes).** Grammar v1 holds 5,440 native programs. It
  reads only each pair's 48 fit fold, with no decision clock from 14:00 to 22:59 UTC.

Two rules bind every unit:
- It is priced only on reads its own selection did not use.
- It freezes only at a price that confirms inside 4 years at 80 % power.

## Refutations: disposition

Accepted, with where each is closed (EB = environment-brackets, RM = rigorous-mining, ML =
meta-labeling):

| Refutation | Closed by |
|---|---|
| Computing before registration bars every survivor (EB law fatal 1, RM law fatal 1) | Q8b is ruled before anything runs. If it is declined, Track S does not run in any form. |
| A pooled screen contradicts 46's per-market grain, so no candidate can open (EB law, RM law fatal 2) | Q8a goes to the owner. A market opens only on its own positive fit and select point estimates. |
| Select is read before survivors register; the post-law boundaries (EB law 1b, RM law major 1) | Track S reads only each pair's 48 fit fold. Survivors register before S4. |
| W sits in the freeze grid; "both" has no label (EB law 1c, 1d) | W is a program field. "Both" is dropped. |
| The known cell's select, held-out and clock-shift evidence is contaminated (EB law fatal 2, EB stats, RM law) | The grammar excludes 14:00–22:59 UTC by construction. Programs whose fit day series correlates above 0.3 with the ridge leave StepM's family. Track R judges the ridge by kill-only tests. Held-out is kill-only everywhere. |
| No gate reads a price path FMP did not build (EB stats fatal 1) | Gate B1: the E8-path gate, from owner data, before any freeze. |
| The deflated-Sharpe gate cannot be passed and double-counts (EB stats fatal 2) | The deflated Sharpe is reported only. |
| The plain TP1 bracket and risk-multiple geometry against amendment 39 (EB law, RM law) | Q10. Grammar v1 uses structural stops and structural or window targets, and refuses any decision where the target is not beyond the stop. |
| The vault is survivor-selected for engine geometry (EB law) | Class-row calibration by value. No derived-4d or holdout-cycle override enters a program. The ridge's vault read is kill-only. |
| Containment is inconsistent, and looser at month grain (EB law, EB stats) | One registered map: year AND month, plus a buffer month either side of every flag. escapeShare is a continuous covariate (B5). |
| Execution: A1 at zero latency, a manual time exit, OCO and hedging (EB law, RM law) | A1 grades placement and exit one bar late. The time exit is declared manual. The E8 facts and Q12 come first. |
| The pooled claim and the first draw are unpriced (EB law) | floor(c), a 4-year maximum confirm length, and the yield priced below. |
| The news environments are a coverage artifact (EB law, EB stats) | Dropped. |
| G7 opens NSDQ, a pinned market (EB law, EB stats, RM law) | Transport dropped. |
| Thresholds were set from confirm-window counts (EB law) | Thresholds come from priors and fit-fold arithmetic only. |
| Month- and year-scale dependence; StepM not studentized (EB stats) | Studentized max-t, a stationary bootstrap with a mean block of 21 weekdays, and year-block and leave-one-year-out gates. |
| The cost is wrong for the clock (EB stats) | E8 spreads captured by hour, gated in A2. The rollover hours are excluded. |
| The vintage haircut is uncertain and matched to neither clock nor k (EB stats, RM law) | I7 re-measures it by hour and k. A3 uses its upper 95 % bound. |
| The detector's logic has holes (EB stats) | Named gates with thresholds. A planted calibration at +0.02 R per fill, with detection and false-alarm rates. |
| The UTC-versus-NY inference is invalid (EB stats) | Dropped as an inference. Venue clocks stay as hypotheses. |
| Power is misstated and the yield inflated (EB stats) | Recomputed from a simulation of this ladder. |
| Gated reads are reused as an unselected price (RM law, RM stats winner's curse) | Select enters the price through its gate-truncated likelihood, and the vault untruncated. The prior is fixed, not fitted to survivors. |
| The confirm law is unwritten: Q7's text, the draw, the post-law door (RM law) | Listed as dependencies. No freeze until 48's text as ruled is law. |
| Mining bars future families (RM law) | 5,440 programs. No event, calendar or month-end environment, and no USD factor. |
| Naming markets inflates the pooled S (ML stats) | The price is computed on the unit's whole pool, never on the named subset. |

Rejected:
- **"The A3 haircut needs an owner question on the vintage of record" (EB law).** Rule 2 already fixes
  the canonical cache as confirm's vintage. The haircut here is a gate before the freeze, not a vintage
  of record.
- **"Set A1 to the captured E8 spread" (EB stats).** Rules 2–4 pin the engine's cost closure at
  `modeledCostScale` 1 for both screen and confirm, so an arm of record at captured spreads would grade
  a different cost from the confirm. The capture gates as A2 instead.
- **"Grade the confirm on E8 paths" (EB stats).** Rule 2 names the canonical cache for the confirm. E8
  paths gate the freeze and monitor the live desk.
- **"A search contradicts 46" (EB law, RM law).** A search whose grammar, threshold and alpha are fixed
  before any fold is read keeps 46's three terms. Its form differs, so the owner rules it (Q8b), and
  the program recommends yes.

The judge's refutation of structural-priors (accepted and closed):
- **ldnfix's stop cap.** The spec read `maxStopAtrMultiplier`, which the shipped cells override to 4 on
  all 28 forex pairs. It now takes the class-row value.
- **ldnfix's targets.** It could trade a target at or inside its stop. Such a decision is now refused.
- **`usaft-thin-bracket-v1`.** It is a plain TP1 bracket, about 0.4 R against 1 R. It registers only if
  Q10 allows it, and its price of about 0.95–1.4 (JUDGED) sits under the 4-year floor.
- **P10.** Its artifact reading is known before it runs (held-out select −12.2 R), so it is dropped.
- **C1.** It read EURUSD, a pinned held-out pair. It now reads only the six in-pool USD majors.
- **maxConfirmYears 6.** Six years would lock forex on a weak candidate. The program-wide cap is 4.

## Hypothesis space and its size

**Track M: 1 family, 4 members.** `ldnfix-reversal-v1` on the 22 in-pool forex pairs.
- *Clock.* One decision per pair per London business day, at the close of the 5-minute bar ending
  16:05 London. FOMC statement days are excluded (static tracked table).
- *Label.* side = −sign(P1600 − P0800), where P is the close of the 5-minute bar ending at that London
  time. It is 0 when the two are equal.
- *Reference and unit.* The decision close; primary 15-minute ATR(14).
- *Order.* A limit at P1605 ± 0.25 ATR in the London move's direction, good until 12:30 ET.
- *Stop.* Beyond the 08:00–16:05 London extreme plus b ATR.
- *Target.* A retracement r of the London move, measured from P1600.
- *Refusals.* The decision is refused if the stop exceeds the class-row `maxStopAtrMultiplier` (by
  value), if the target does not lie beyond the stop, or if the target lies beyond
  dailyAtr × √(W/24).
- *Exit.* A timed close at 16:30 ET, graded one bar late.
- *Grid.* The label-preserving grid is r ∈ {0.333, 0.5} and b ∈ {0.25, 0.5}.

**Track R: 1 known cell.** It is not a candidate unless the owner rules otherwise. The cell is the
shipped forex plans, in-pool, at decision hours 16–21 UTC (`decisionHourDistance` ≤ 2.5), with the
whole position off at TP1. That is about 50k decisions (JUDGED), run through 14 battery variants.

**Controls (none registrable).**
- C1: the Krohn–Mueller–Whelan dollar W, pre-London long USD and post-London short USD, on the six
  in-pool USD majors, gross at mid, on the fit fold.
- C3: the clock witness.
- C4: ldnfix at 13:05 London, as a placebo.
- C5: the escaping-year positive control.
- Two planted signals, each at 50 seeds.

C1 gives up the dollar W as a family at no cost. Its fit fold lies inside the paper's 1999–2018
sample, which is the refusal the
[2026-09-24 round](/docs/research/designs/entry-family-design-round-2026-09-24.md) applied to crypto
momentum.

**Track S: grammar v1, 17 × 8 × 5 × 8 = 5,440 programs.**
- **Clocks (17).** Hourly UTC decision instants at 23:00 and 00:00–13:00, plus London 08:05 and New
  York 08:35 local, DST-aware. A decision is dropped on any day its instant falls in [16:30, 18:30) ET,
  which drops 23:00 UTC in winter. Clocks outside the owner's declared hours (Q12) are removed before
  any decision is computed.
- **Side rules (8).** All are known at the decision close:
  - fixed long;
  - fixed short;
  - fade or follow the 1-hour return into t;
  - fade or follow the move since 00:00 UTC;
  - fade or follow the prior completed UTC day.
- **Environments (5).** All come from completed daily bars only:
  - all days;
  - daily ATR(14) percentile over the last 250 days, bottom third;
  - the same percentile, top third;
  - decision close in the outer 20 % of the prior day's range, or outside it;
  - decision close in the middle 60 % of the prior day's range.
- **Geometry (8).**
  - *Entry.* A limit 0.25 or 0.5 ATR15 beyond the decision close, against the side.
  - *Stop.* The engine's structural stop at class-row constants by value: pivot-buffered, a 1.25 ATR15
    floor, refused above the cap, never tightened.
  - *Target.* Either the nearest opposing 15-minute swing pivot (`findSwingPivots` and
    `nearestLevelBeyond`, `indicators.ts:37, :71`), or the window move 1.0 × dailyAtr × √(W/24). The
    decision is refused unless the target is beyond the stop and within the window move.
  - *W.* 4 or 8 hours, cut at 16:30 ET.
- **Excluded by construction,** so each stays registrable later:
  - 14:00–22:59 UTC: the ridge, its lead-in and the rollover;
  - London 16:05, which is ldnfix's clock;
  - event days, month-end, weekday and news environments;
  - a USD factor;
  - every other class.
- **Size.** The nominal N is 5,440, and the bootstrap measures N_eff (JUDGED about 10³). That is
  22 pairs × about 2,150 contained fit weekdays × 17 clocks × 2 sides × 8 geometries, or about 12.9M
  resolutions.
- **Trial ledger.** v1 is 5,440. Every later version deflates on the union of all versions, and a cell
  computed once is never recomputed under a new id.

## Evaluation

- **Resolver.**
  - Every outcome comes from the engine's `evaluateSetupOutcome` (`replay.ts:374`), with the sweep's
    slice and options exactly as the mirror anchored them
    ([`resolve.mts.txt`](/docs/research/r3/mirror-2026-09-27/resolve.mts.txt), slice 306–322).
  - It uses the 5-minute tier from `resolutionSeriesFor` (`replay.ts:362`) and R from
    `realizedRFromLegs` (`replay.ts:254`).
  - Series come through `pinnedSeries` (`scripts/q4-daily-structure-stop.ts:182`), with `fetch`
    replaced by a thrower.
  - Throughput: 3.2M resolutions in 58 s in one process (MEASURED,
    [run log](/docs/research/r3/mirror-2026-09-27/run.log.txt)).
- **Plans.**
  - The decision context is the engine's own: `buildDecisionMarketContext`, `completedDailySeries`,
    `visibleQuoteCurrencyUsd` and `getSessionContext`.
  - Calibration is the class row by value. No per-symbol derived-4d or holdout-cycle value enters.
    All 28 forex cells were confirmed on 2022-05-22..2026-08-11, and none is held back from it
    (MEASURED, [provenance](/docs/research/r4/shipped-cell-provenance.json)). A program that
    inherited them would make the vault survivor-selected.
- **Costs.**
  - `estimateExecutionQuality` (`executionQuality.ts:265`) runs per plan at `modeledCostScale` 1, and
    `resolverCostOptions` (`:555`) feeds the resolver.
  - E8's commission is charged per leg. The engine's `maxCostShare` 0.15 admits (rule 10).
  - The modelled spread and slippage on contained select forex come to about 0.033 R per fill
    (MEASURED, derived from
    [converge](/docs/research/converge-route-to-profit-2026-09-27.md) §3: −1,336.0 to +322.7 R at
    +0.0065 R per fill).
- **Arms.**
  - *A1, the record.* The engine cost. `entryLatencyBars` 1 grades the order placed one bar after the
    decision close. Expiry and the time exit fall at W + 5 minutes, one bar late. No stop ever moves,
    so net equals arming-bound, and the bench asserts that per row. Gross is printed beside.
  - *A2, a gate.* E8's captured spread by hour, or twice the modelled spread where none was captured;
    `touchFillPenetration` of 0.5 spread; the entry two bars late.
  - *A3, a gate.* A1 less the vintage haircut per filled bracket at the program's hour and k, taken at
    the upper 95 % bound of I7. The pooled table, −0.057, −0.026 and −0.010 R at k = 0.5, 1 and 2
    (MEASURED, [vintage bound](/docs/research/vintage-bound-2026-09-24.md)), is the least it can be.
  - *A0.* Frictionless, as a diagnostic.
- **Native execution.**
  - Each decision is one order set: a limit entry with a stop-loss and take-profit attached, good until
    its expiry, and one timed close at the earlier of W and 16:30 ET.
  - There is one live plan per pair, and no hedging.
  - No position is open across 16:30–18:30 ET.
  - The time exit is a manual instruction, graded one bar late.
- **Pooling.**
  - Per UTC decision day, a unit's net R is summed over the pairs contained that month. A weekday with
    no trade counts as 0.
  - Annual S = mean ÷ SD × √(traded days a year).
  - Years to confirm = 8.38 ÷ S² at c = 1 (10.04, 11.0 and 11.68 at c = 2, 3 and 4).
  - The per-fold descriptive intervals use `clusteredBound` (`entry-excursion-screen.ts:307`). Every
    gate uses the block bootstrap below. Per-market and per-year tables print beside every pooled
    figure. No rate is ranked or gated.
- **Contained months.**
  - One registered map covers every stage: year-contained AND month-unflagged, plus one buffer month
    either side of each flag. It is hashed with the feed witness table's sha256.
  - Flagged months inside the fit era number 62 on all 28 pairs and 39 in-pool (MEASURED, the judge's
    count from the manifest's escape months).
  - The converge measured flagged fit months at +0.085 R per fill against −0.003 unflagged, so a flag
    is a dose. escapeShare enters every table as a continuous covariate.
  - The year map is used only to reproduce the orchestrator's figures.
- **Held-out markets.** The six pinned pairs (AUDCHF, AUDNZD, EURUSD, GBPCAD, NZDCHF, NZDJPY;
  [pin](/docs/research/r4/holdout-2026-08-26.json)) open once, for every unit together, after S4.
  They are kill-only: a pooled point estimate below 0 on both folds kills the unit. They never enter a
  price, because they share every calendar day with the pool.

## Validation ladder

**The multiplicity control is named.** Track S uses Romano-Wolf StepM over the cumulative trial ledger:
studentized max-t, a stationary bootstrap, FWER 0.05 one-sided on fit. Holm across at most three
carried units covers select. The alpha cap of amendments 46 and 48 covers confirm.

**Track S** (one gate fails, the unit stops):

- **S0. Pre-register.**
  - This document and `grammar-v1.json` (the machine form of the grammar above) land on `main` with
    their sha256, before any decision is computed.
  - The same pull request carries the battery spec: every threshold below, the seeds, and the clusters
    that exclude the ridge.
  - The owner's rulings on Q8a, Q8b, Q10 and Q12 are recorded in the hash.
- **S1. Anchor.** Any mismatch stops the run and prints nothing.
  - The mirror anchor reproduces 355,722 rows on 15 fields to 1e-9.
  - `buildPricePlan`, run with the row's own resolved calibration, reproduces entry, stop, TP1, target
    and the cost triple to 1e-9 on in-pool fit and select forex rows.
  - The orchestrator's in-pool plain-bracket figures reproduce to 0.1 R: +993.7 on fit and +236.4 on
    select, on the year map.
  - Four mutations each break the anchor: a plan built for the wrong side, the daily completion gate
    removed, the fold door moved by one day, and a held-out pair admitted.
  - The door tests pass: fetch throws, and a bar past the door refuses.
- **S2. Discovery on fit.**
  - *Window.* Each pair runs from its first bar to its 48 fit/select boundary under the registered map,
    less 5 days (`calendarFoldsExcluding`, `sweepFolds.ts:94`). Under the month map these boundaries
    run from 2018-06-05 (EURGBP) to 2020-05-07 (USDJPY); under the union map they are earlier, from
    2018-02-23 (MEASURED, [rule-1
    boundaries](/docs/research/designs/setup-discovery-program-2026-09-28/rule1-boundaries.out.txt),
    [union](/docs/research/designs/setup-discovery-program-2026-09-28/postlaw-boundary.out.txt)).
  - *Family.* Every program except those whose fit day series correlates above 0.3 with the ridge's.
  - *Test.* StepM on the per-day A1 money, with a stationary bootstrap (mean block 21 weekdays,
    B = 2,000, seeded from the grammar hash).
  - *Survivors must also:*
    - beat the same-clock random-day null (a contained fit day, |shift| > W, 20 draws), with lo95 > 0
      on the paired per-day difference. This is 46's random-entry null.
    - survive a year-block bootstrap (block 261 weekdays) at FWER 0.05;
    - keep a positive pooled point estimate when any one calendar year is dropped;
    - pass battery gates B2, B3, B5, B6, B8 and B9 on fit.
  - *Carried forward.* Survivors cluster where their day series correlate above 0.5. Each cluster
    keeps the program with the highest t, ties going to fewer non-default axes. At most K = 3 carry.
  - *Reported only:* Hansen SPA_c, the deflated Sharpe at the measured N_eff, BY-FDR at q 0.10, and
    CSCV PBO.
- **S3. Register the survivors.** Each takes rule 3's fields and a grid of one member, before any of
  its select decisions is computed (Q8b). Each carries the disclosure below.
- **S4. Select, the pre-law part.**
  - *Window.* Each pair's boundary to the select fold's last decision, 2022-05-29, on contained months.
  - *Gates.* Holm, one-sided 0.05, across the carried units on the pooled A1 money. The A2 and A3
    point estimates must be above 0.
  - *B10.* The edge in the 2021-01..2022-05 escaping months is at most the contained edge plus 2 SE of
    the unit's own random-day uplift.
  - *Held-out.* The one opening, kill-only, for every unit together.
- **S5. The vault.** This step waits until 48 is law.
  - *What it is.* Each unit's remaining rule-1 select: the contained months in [2022-06-03,
    F°_s − 5 days) under the registered map.
  - *How it is read.* Once, and it prices without gating.
  - *How much there is.* About 1.6–2.25 years per pair. 2.25 is the mean under the month map
    (MEASURED, [feed dose](/docs/research/designs/setup-discovery-program-2026-09-28/feed-dose.out.txt));
    1.6 is JUDGED for the union-plus-buffer map.
  - *Its feed.* The window's feed character is checked before grading, because 24 pair-months on 14
    pairs are flagged in 2025-01..2026-08 (MEASURED).
- **S6. The E8 gate, B1.**
  - The owner's E8 bars are compared with the FMP cache using synthetic symmetric brackets at every hour
    and at each k: d = R on E8 − R on FMP. This is the vintage bound's method.
  - It prints differences only, never a unit's money.
  - A unit passes where the upper 95 % bound of d at its hours and k lies below its A1 edge per fill.
  - A2 must be above 0 at the captured E8 spreads on fit and select.
  - With no E8 data, nothing freezes.
- **S7. Price and freeze.**
  - *The price.* The posterior median of the pooled S under a prior of N(0, 1.0²). Select enters by its
    gate-truncated likelihood and the vault by its normal one. The fit read carries no weight.
  - *Pooled over the whole pool.* The price is computed over the unit's whole pool, not the named
    subset. Naming pairs by a positive select mean lifts a zero effect's pooled S to +1.07 at ρ 0.1
    (MEASURED simulation,
    [naming curse](/docs/research/designs/setup-discovery-program-2026-09-28/naming-curse.out.txt)).
  - *The floor.* floor(c) = √(coefficient_c ÷ 4): 1.45, 1.58, 1.66 and 1.71 at c = 1 to 4. Here c is
    the count of candidates at the freeze, found as a fixed point: start from every eligible unit and
    drop those under floor(c) until c is stable.
  - *Readiness floor.* The number of clusters that gives 80 % power at the price, and at least 30.
  - *Confirm length.* L_m is capped at 4 years.
  - *Naming.* Named pairs have positive point estimates on fit and select (Q7).
- **S8. Confirm.**
  - Post-frontier and pooled (Q7), one-sided at draw ÷ 2 (0.02 at c = 1).
  - It uses rule 2's canonical cache at its anchor.
  - It must pass on the full population and on the registered map (rule 10).
  - A pair ships only on its own positive point estimate across fit, select and confirm.

**Track M.**
- M0: the spec lands with rule 3's fields before any of its decisions is computed.
- M1: the rule 4 screen on its 48 fit fold, at the grain Q8a sets.
- M2: C4 kills the family unless fix minus placebo, paired by day, has lo95 > 0 on fit.
- M3: B2, B3, B5, B6, B8 and B9 on fit.
- M4: the pre-law select. The freeze rule picks the member with the highest pooled select S among those
  whose pooled fit lo95 per day is above 0 and whose pooled mirror S − M lo95 is above 0 on select.
  B7 and B10 apply.
- M5–M8: as S4 (the held-out opening) through S8.

**Track R.** Its thresholds are pre-registered in the battery spec.
- **Gates.**
  - P1: money share minus decision share, from decisions closing in [16:00, 18:00) ET. At or above
    +0.20 it reads artifact; at or below 0 it reads mechanism.
  - B2: an entry that must penetrate one spread, and a TP that must be crossed by one spread, keep at
    least 60 % of the money.
  - B3: winsorizing wicks at the pair × hour × year q99 keeps at least 70 %.
  - B5: the slope of money on escapeShare has t < 2, and the lowest tercile of dose is positive.
  - B6 and B7: point estimates above 0 on each fold.
  - P7: the rank correlation between each pair's edge and its spread ÷ ATR is at most 0.3.
  - B1: the E8-path gate at 16–21 UTC and the ridge's k.
- **Reported only.** EDT against EST at the same ET hours, the close-only path, and the mirror S − M.
- **Verdict.**
  - *Artifact* if P1, B3, B5 or B1 reads artifact.
  - *Market* if B2, B3, B5, B6, B7 and B1 pass, P1 ≤ 0 and P7 ≤ 0.3.
  - *Undecided* otherwise.
- **Weight.** Select and held-out give the ridge no weight.

**Battery calibration (I2).**
- A multi-bar reversion and a single-bar wick artifact at a fixed clock are each planted at
  +0.02 R per fill, the ridge's size, over 50 seeds.
- The battery must pass the reversion in at least 80 % of seeds and fail the wick in at least 80 %.
- If it does not, the battery has no verdict and no unit freezes on its basis.

**The power bar.** These are the ladder's pass probabilities by true pooled S (a JUDGED model with
simulated outputs:
[ladder-sim](/docs/research/designs/setup-discovery-program-2026-09-28/ladder-sim.out.txt); fit
thresholds from
[mining-power](/docs/research/designs/setup-discovery-program-2026-09-28/mining-power.out.txt)):

| True S | S2 fit (N_eff 10³–10⁴) | S4 select | Price ≥ floor, given S4 | Confirm, given freeze | End to end, battery 0.7 |
|---:|---:|---:|---:|---:|---:|
| 0 | 0.000 | 0.02 | 0.00 | — | 0.000 |
| 1.0 | 0.07–0.16 | 0.28 | 0.05 | 0.40 | 0.0002–0.0007 |
| 1.45 | 0.42–0.63 | 0.55 | 0.20 | 0.68 | 0.022–0.032 |
| 1.67 | 0.67–0.83 | 0.68 | 0.33 | 0.77 | 0.08–0.10 |
| 2.0 | 0.92–0.97 | 0.84 | 0.58 | 0.86 | 0.27–0.28 |
| 2.5 | 1.00 | 0.96 | 0.87 | 0.91 | 0.53 |

End to end, the program passes a true S of 2.0 about 27 % of the time and a true S of 1.45 about
3 %. The best published post-cost intraday effects run 0.6–1.0, and a null from this program says
nothing about them. A true null freezes with probability below 0.001 in the model. A feed artifact
that passes the battery is outside the model: B1 is the guard.

## Law and disclosure

Owner questions, all ruled before S0 lands:

- **Q8a. Screen grain.** A family that confirms pooled (Q7) screens pooled. It takes one verdict over
  its named pairs' summed money per day, and opens on a pair only with that pair's own positive fit
  and select point estimates.
  - *Recommended: yes.* A pooled S of 1.5–2.0 over a pooling gain of 6.5–11 (MEASURED, converge) is
    0.45–0.78 per pair, which a per-market screen cannot pass. The per-market grain would bar every
    pooled family by construction.
  - It amends 46's screen grain, so the owner rules it (Q1 as ruled).
- **Q8b. A search as the registration unit.** A search whose grammar, doors, statistic, bootstrap,
  threshold, seeds and survivor rule are hashed on `main` before any of its decisions is computed
  registers as one unit. Its StepM verdict and random-day null on each pair's 48 fit fold stand as
  each survivor's screen. Each survivor registers with rule 3's fields before any of its select
  decisions is computed.
  - *Recommended: yes.* The hypotheses, the threshold and the alpha cap are fixed before any data is
    read. The confirm's size does not depend on how a family was found, because each draw is fixed
    before its window's prices exist.
  - *If no:* Track S does not run, not even as advice. A cell once computed can never register.
- **Q10. Amendment 39 per trade.** "Profit potential must exceed loss potential structurally" binds
  each order set's traded target. The target must lie strictly beyond the stop distance before costs,
  or the decision is refused. The 1.6 payoff floor stays a test of the ladder's runner and does not
  apply to a single-target bracket.
  - *Recommended: yes.*
  - *What it costs.* It bars the plain TP1 bracket, and with it the ridge in its only strong form.
    Grammar v1 is the same under either ruling.
- **Q12. Staffed hours.** The owner declares the UTC hours in which the operator can place orders
  within 5 minutes of a decision and close a position by hand at a time exit.

E8 facts, which cost no FMP bytes:
1. whether GTD expiry is native on TradeLocker and MatchTrader;
2. whether a pending limit takes an attached SL and TP, or OCO;
3. whether the account hedges or nets;
4. whether E8 permits a timed close by hand (the desk may instruct one: OQ-3, ruled 2026-09-28);
5. one week of E8 spreads by hour on AUDUSD, USDJPY, GBPUSD, EURGBP, GBPJPY and AUDCAD, including
   16:00–19:00 ET;
6. either 8 weeks of exported E8 5-minute bars on those six pairs, or a 4-week demo of the orders.

The E8-path read covers post-frontier dates, so it is recorded in the ledger as an instrument read.
It ends before the earliest T + 21 days, so it moves no C_s.

The law this program rests on:
- **46.** Every unit is hashed before any of its decisions is computed. It is screened against the
  random-entry null at a threshold fixed in advance, and it draws on one capped alpha.
- **48, still to land.** The pieces still to land are:
  - the text as ruled on Q1–Q7, including Q7's pooled confirm;
  - the Q2 × Q7 draw: one draw per named pair, counted in each c_m;
  - Q4's program text;
  - rule 12, pre-law registration;
  - the post-law door at F°_s, with decisions ending 5 days before it;
  - the registry.

  Until 48 is law, the confirm fold (2022-06-03..2026-08-26) stays sealed. Before the law, S4 reads
  select only up to the 2022-05-29 decision end.
- **Claims.** The first forex freeze claims up to 4 years on each pair it names, and 0.04 of each
  pair's 0.05. A later forex family draws at most 0.008.
- **39.** Only net realized R counts. Stops come from structure, and targets from structure or the
  window. Nothing is tuned to a printed ratio.
- **45.** The test is pooled money. Per-market tables print, and no sign count is cited.
- **42.** The desk instructs exactly the graded orders.
- **47.** No provider bytes are spent.
- **`ANALYZER_VERSION`.** The bench does not change it. A confirmed family needs a scheduled emission
  at its clock and a version bump placed in `PLACED_ENGINE_VERSIONS`.
- **The seal.**
  - No recursive search runs under `docs/research/r3`.
  - Corpus rows are read only through `assertManifestedCorpusStreaming`, with the split read first.
  - The bar door truncates every pinned series at the class's select end (forex
    2022-06-03T14:03:45Z, MEASURED manifest `foldsByClass`). A mutation test shows that removing the
    door fails.

Every unit discloses, when it registers:
- the [hour-gate verdict](/docs/research/hour-gate-verdict-2026-09-12.md) and the hour-mechanism
  reads;
- the [alpha review](/docs/research/alpha-review-2026-09-07.md), which printed held-out 16–21 UTC
  money;
- the mirror control;
- the converge;
- the orchestrator's plain-bracket reads of 2026-09-28, in-pool and held-out;
- act 3's class and cell totals;
- the vintage bound;
- the published-effects screen;
- the four designs and their refutations, and this judgment;
- the outputs of Tracks I and R, which follow the grammar's hash and precede Track S's results;
- the seal incident of 2026-09-27.

## Build list

The scripts are committed as `.mts.txt` under `docs/research/r3/discovery-2026-09-28/`, per the
mirror's convention. The cube lives in `~/.local/share/levelflow-cloud/discovery/` under sha256
manifests, because the scratchpad is reaped. numpy is absent (MEASURED), so statistics run on
TypeScript typed arrays. Sizes are JUDGED.

| File | Lines (+ tests) | Does | Reuses |
|---|---:|---|---|
| `doors.mts` | 220 (+160) | Per-pair 48 fit door under the registered map; holdout door; month door with buffers; the post-law door, built but off until the law; a throwing fetch | `calendarFoldsExcluding`, `resolveHeldOut` (`sweepFolds.ts:614`), `assertEmbargoCoversReview` (`:705`), `resolveYearMap` (`feedYears.ts:97`), `pinnedSeries` |
| `plans.mts` | 380 (+220) | Instants; engine context; class-row calibration by value; structural stop and target; window move; refusals; daily-only environments; side rules | engine modules; `indicators.ts:37, :71, :85` |
| `resolve.mts` | 320 | One worker per pair on 7 of 8 cores; arms A0–A3; net = bound asserted; columnar cube of about 270 MB | `resolve.mts.txt` options and slice |
| `anchor.mts` | 250 | S1's four anchors, four mutations and their logs | the mirror's anchor fields and harness |
| `battery.mts` | 420 (+220) | B2–B11, P1, P7 and I2's planted calibration | — |
| `grade.mts` | 520 (+220) | Pooling; studentized StepM with stationary and year blocks; leave-one-year-out; random-day null; Holm; clustering; ridge exclusion; truncated-likelihood price; the floor's fixed point; tables | `clusteredBound`, `tMultiplier95`, `power-years.py.txt` |
| `e8path.mts` | 220 (+120) | E8 bar ingest; clock alignment; synthetic brackets by hour and k on both paths; prints differences only; spreads by hour | vintage bound `forex.py.txt` |
| `vintage-by-hour.py.txt` | 150 | I7: bank against cache, 2026-08-04..26, by hour and k | vintage bound scripts |
| `controls.mts` | 250 (+100) | C1, C3, C4, C5 | — |
| `ledger.mts` | 100 | The cumulative trial ledger | — |
| Specs | 300 | `grammar-v1.json`, the battery spec, `ldnfix-reversal-v1` | — |

In total that is about 2,830 lines plus 1,040 lines of tests, across five sessions. Nothing changes
the analyzer.

## First pass

**Inputs.**
- The `.calibration-cache` pins at anchor 2026-08-26 for the 28 forex pairs: 5-minute, 15-minute and
  daily.
- The manifest `capture-all-classfolds-2026-09-24.jsonl.manifest.json`, for `foldsByClass` and
  `feedCharacter`.
- The mirror extract, read through the door on fit and select only.
- The holdout pin.
- The minute bank for 2026-08-04..26, for I7.
- The owner's E8 data, when it arrives.

**Order.** Each step starts only after the one before.
1. S0 and M0 land in one pull request.
2. I1 and S1, the anchors: about 3 minutes.
3. I2, the planted calibration: 50 seeds × 2 plants, about 5 minutes.
4. Track R's battery: about 50k decisions × 14 variants, or 0.7M resolutions, about 1 minute.
5. I3 and I5 (C3, C5) and I7: about 3 minutes.

That is about 15 minutes of compute (JUDGED, from 55k resolutions a second, MEASURED). The first pass
computes no registrable family. Its candidates are the one known cell and the controls.

**Outputs.**
- `anchor.json`
- `battery-calibration.txt`
- `ridge-verdict.txt`, provisional until B1
- `clock-witness.txt`
- `escaping-control.txt`
- `vintage-by-hour.txt`

Each summary is committed the day it is made.

**Then Track M.** M1–M4, C1 and C4 run, in minutes.

**Then Track S,** if Q8a and Q8b are yes and Q12 is declared.
- The run covers up to 5,440 programs and 12.9M resolutions.
- The resolutions take about 4 minutes in one process, or under 1 minute on 7 workers.
- Building the plans takes 5–10 minutes.
- The bootstrap, 2,000 draws under two block schemes over a 5,440 × 2,150 matrix, takes about
  10 minutes.
- In total that is about 30 minutes of wall time (JUDGED).

Its outputs are `stageA-programs.tsv`, with one row per program (days, R, mean, SD, S, t, StepM p,
null difference, the leave-one-year-out minimum, dose slope, S − M and the ridge correlation), then
`clusters.txt`, and `survivors.json` with its hash.

**Dates** (all JUDGED).

| Date | Step |
|---|---|
| By 2026-10-02 | Rulings, E8 facts, spread capture begins |
| By 2026-10-05 | S0 and M0 land |
| By 2026-10-12 | The first pass |
| By 2026-10-19 | Track S, S3, S4 and the held-out opening |
| About 2026-11-16 | 48 as law and the registry; then S5, S6 and S7 inside 21 days |
| About 2026-12-07 | C_s |

## Stopping rules

1. An anchor mismatch stops everything. Nothing prints.
2. If I2 fails, the battery has no verdict. Track R records NO VERDICT, and no unit freezes on the
   battery.
3. If Q8a or Q8b is declined, Track S does not run in any form.
4. If S2 rejects nothing, v1's null is recorded: no native program in v1 carries a pooled S above the
   measured threshold on its fit folds. No v2 runs in this cycle. A v2 is hashed before it runs,
   deflates on the union, and never recomputes a v1 cell.
5. A unit stops at its first failed gate. It is never re-parameterized, and a neighbour never takes
   its place.
6. With no E8 data, nothing freezes.
7. A price below floor(c) means no freeze, and the unit lapses under rule 8. Only an owner ruling
   recorded in the freeze line overrides this, with the longer L_m and the forex claim priced in it.
8. If Track R reads artifact, the 16–21 UTC ridge is closed in every form (program, family and filter),
   and HANDOFF records it.
9. If Track S's survivors cannot finish S4 inside their own 21-day window, they register later and
   take a later C_s. Nothing is rushed.

## Expected yield and earliest date

| Track | P(freeze) | P(freeze and confirm) | Basis |
|---|---:|---:|---|
| S, if Q8a and Q8b are yes | 0.055–0.066 | 0.048–0.053 | ladder-sim mixture over a JUDGED prior on the best effect in v1: 3 % at S ≥ 2.5, 5 % at 2–2.5, 10 % at 1.5–2 |
| M, ldnfix | about 0.02 | about 0.01 | JUDGED from Krohn's EUR 0.65–0.99 and GBP −0.51 post-cost |
| R, the ridge | under 0.01 | under 0.01 | Its price, about 0.95–1.4 (JUDGED from held-out fit S 0.93 and select −12.2 R), sits under floor 1.45 |
| Any, with Q8 yes | about 0.08 | about 0.06 | JUDGED |
| Any, with Q8 no | about 0.03 | about 0.01–0.02 | JUDGED |

An artifact that passes B1–B10 adds about 1–2 % of false freezes (JUDGED). Each one spends a draw and
fails at confirm.

**Earliest dates.** C_s is about 2026-12-07 (JUDGED). The read ends at C_s + L_m. The desk opens on
the confirmed pairs a few weeks after that.

| True pooled S | L_m | Read ends |
|---:|---:|---|
| 2.5 | 1.34 years | 2028-04 |
| 2.0 | 2.10 years | 2029-01 |
| 1.67 | 3.0 years | 2029-12 |
| 1.45 (the floor) | 4.0 years | 2030-12 |

The ridge's owner option applies only if Track R reads market and Q10 allows plain brackets. The owner
may then register the ridge as a Q4 program with a 6-year cap. At S 1.2 its power would be 0.81, with
the read ending about 2032-12, and it would hold forex's calendar for those six years.

**The likeliest outcome, about 92 % (JUDGED).** No forex freeze comes from this cycle, and the desk
stays parked. By about 2026-10-19 it will have produced:
- the ridge verdict;
- E8's spreads, path gap and placement lag by hour;
- if Q8 is yes, a counted null for v1 above about S 1.5–1.7;
- one mechanism family registered for the post-frontier calendar.

The next cycle can then use metals, crypto and indices, whose claims forex does not block, or event
families this grammar left registrable, such as the FOMC-day dollar short.

## Risks

- **The feed.** FMP builds the forex bars, and E8's prices are a third construction. A defect FMP
  carries at a low dose everywhere passes every test inside FMP. B1 covers only the hours, k and weeks
  the owner exports.
- **Power.** The program passes a true S of 2.0 about 27 % of the time end to end. Post-cost published
  effects are 0.6–1.0. Its likeliest result is a null that says nothing below S 1.5.
- **Nonstationarity.** Fit runs 2009–2020 and confirm 2027 onward. The 2015 reform of the fix window
  and the shift to electronic trading both fall in between. The vault, 2024–26, is the only recent
  unselected read.
- **Cost.** The modelled forex spread does not vary by hour. One week of E8 capture is a thin
  measurement of the hours that decide the sign.
- **Vintage.** The haircut comes from 14 days (MEASURED, vintage bound). Its upper 95 % bound may kill
  every bracket at k ≤ 1.
- **Law.** Q8a, Q8b, Q10, Q12 and 48's text as ruled all come before any freeze. A refusal changes the
  plan by stopping rules 3 and 7.
- **The first draw.** A weak first forex freeze spends 0.04 of every named pair's 0.05, and holds up to
  4 years of forex calendar.
- **Leakage.** The grammar was written after the hour finding, the mirror, the orchestrator's reads,
  four designs and eight refutations. Excluding 14:00–22:59 UTC and hashing before Track R reduce the
  leak. They do not remove it.
- **Operations.**
  - Placing up to 22 brackets at one clock by hand is heavy work.
  - E8's daily loss limit binds on correlated stops, so each trade's size is a share of the day's risk
    budget.
  - Two units on one pair on one day: the later skips.
- **Seal and data.**
  - The cache holds confirm-era bars, so the door is proven by mutation.
  - The cube and outputs live outside the scratchpad, under sha256 manifests.
  - The workflow journal is copied to session-artifacts before the session ends.

## Companion files

These sit beside this file in `docs/research/designs/setup-discovery-program-2026-09-28/`, stored as
`.txt` so the citation guard covers them. Each is run with `python3 <file>` from that folder.

| File | What it is |
|---|---|
| `ladder-sim.py.txt`, `ladder-sim.out.txt` | The judge's end-to-end simulation of Track S's ladder, stdlib and seeded |
| `naming-curse.py.txt`, `naming-curse.out.txt` | The meta-labeling refuter's naming simulation, re-run at 8,000 repetitions |
| `rule1-boundaries.py.txt`, `forex-months.json.txt`, `rule1-boundaries.out.txt` | The rigorous-mining law refuter's 48 fit/select boundaries per pair under the month map. It takes the JSON as its argument. |
| `postlaw-boundary.out.txt` | The environment-brackets law refuter's boundaries under the month and union maps. Its generating script was not kept. |
| `feed-dose.out.txt` | The rigorous-mining statistics refuter's feed-dose census. Its script was not kept, and it can be rebuilt from `feedCharacter`. |
| `winners-curse.py.txt`, `winners-curse.out.txt` | The rigorous-mining statistics refuter's winner's-curse simulation |
| `mining-power.py.txt`, `mining-power.out.txt` | The rigorous-mining designer's deflation thresholds and stage powers |
