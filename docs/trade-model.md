# Levelflow Trade Model

> # ⛔ THE CALIBRATION CORPUS IS INVALID (2026-08-11)
>
> **Read `docs/research/remediation-program-2026-08-11.md` before this
> file, and before trusting any calibration figure anywhere in this
> repo.** The 4c/4d corpus resolved every setup 4–5 hours out of register
> with its own decision bar: the cached 15-minute and daily series carry
> naive New-York stamps read as UTC while the 5-minute series carries
> true UTC, so roughly half of each review window lies BEFORE the
> decision. Re-stamped and re-run, the flagship "measurably positive"
> markets collapse — EURUSD +0.213R → −0.008, BTCUSD +0.198 → −0.082,
> XAUUSD +0.247 → −0.031. **The measured edge is an artifact.**
>
> Everything below that reports a calibration RESULT — derived cells,
> confirmed counts, per-market verdicts, expectancy, fill rates — is
> superseded by that program. The engine's structure, the identity work
> and the product-truth fixes stand. `.calibration-cache` itself carries
> the defect and must be rebuilt (Phase 0) before anything is re-measured.


Model version: `2026.09.01.platinum-group-rate-inverse` (**not yet deployed**
— the desk is parked, so this version has never served a request. R2's D1:
global learning derived `confidence_adjustment` from a WIN RATE against a
neutral point of 0.5, which is break-even only when a win and a loss are the
same size. On the ladder they are not — a `tp1_partial` banks the partial and
the runner exits at entry, a `take_profit` banks that AND carries the runner
half to at least `minimumTargetRewardRisk`, and both increment `wins`. Derived
from shipped calibration: a cohort winning 65% of the time, 65% of those
partials, means -0.0055R on forex and -0.049R on indices, and the retired
curve paid it +3 confidence. The adjustment now comes from mean `netRealizedR`
shrunk to the end of its own 95% interval nearest zero, over a population
widened by `expired_in_profit` and `expired_at_loss` — filled trades that
banked or lost real money and were excluded outright. Note the accrual query
below already counted them; the learning query was the narrow one. Before it,
`2026.08.27.calendar-provenance`. AXES-9:
`voteMomentumDivergence` resolved every RSI/MACD disagreement to buy, an
artifact of OR-chain precedence rather than a choice, and emitted those
contradictory states at score 18-24 rather than the abstention's 5. Two of
sixteen enumerated states change, both to neutral. Before it,
`2026.08.25.treasury-tenors` gave ZFUSD and ZTUSD headline proxies (IEI, SHY),
so Treasury news reaches the 5-year and 2-year the way it already reached the
30-year and 10-year. Before that, the Treasury-rate layer's
symbol routing moved from four hand-typed Sets and two regexes on the symbol
name to one per-market role table, and four markets changed what the curve is
allowed to say about them: ZFUSD and ZTUSD take the rate rule their own
correlation family already claimed, and HOUSD and RBUSD take the shock penalty
their crude already carried. Calibration cells are unchanged.)

The previous version, `2026.08.18.one-physics`, is what is deployed and
verified — 2026-08-18, deploy run 380, green end-to-end including the E2E
chart gate. R1a slices 1+2: realized R from legs on every filled resolution;
live grading on the sweep's resolution tiering with the row's stored
runner-protection mode and review window; the decision anchor on the last
completed primary bar; calibration cells unchanged from
`2026.08.11.declines`. The per-market layer this records was derived from the
invalidated corpus — see the banner above.
Last reviewed: 2026-07-30 (round 23 — the calibration arc is complete;
see "The stopping point" and "Resumption protocol" below)

The version moved twice on 2026-08-01, both times without a calibration
round. `2026.08.01.scan-only-door`: spec §17m made the Scan column the only
door a setup comes through, so global learning stopped filtering its cohort
to review-origin setups and now trains on every measured outcome.
`2026.08.01.one-door-guarded`: the second door — the single-market
`generate_setup` action, still live on mobile — was deleted, so the cohort
is prospectively scan-origin only and every write is guarded against the
hourly outcome-sync that resolves the same rows. Setup construction,
scoring, windows and outcome evaluation are byte-identical to
`2026.07.30.forex-gate-forty` through all three: what changed is which
population the weights learn from and which writes are allowed to land.
Round 23's measurements below stand unchanged; they were made on the
geometry, not on the cohort filter.

## Current engine state (2026-08-07)

The state of record through round 28. Every value is derived at full
available history under the walk-forward both-splits gate. The sections
that follow explain the mechanisms; the round journal at the bottom is
history.

`tests/calibrationState.test.ts` pins this table against the engine's own
values, so a number here that drifts from the code fails CI. Read it as
current, not as a snapshot.

| Class | Threshold | Window | Stop cap | TP1 share | Runner share | Entry offsets (def/trend) | News cap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agriculture | 30 | 6h | 1.0 | 0.4 | 1.4 | 0.58 / 0.75 | 8 |
| Livestock | 40 | 24h | 1.0 | 0.4 | 0.6 | 0.58 / 0.75 | 8 |
| Crypto | 25 | 12h | 1.0 | 0.4 | 1.0 | 0.78 / 0.80 | 4 |
| Energies | 85 | 6h | 1.0 | 0.8 | 0.8 | 0.60 / 0.48 | 8 |
| Forex | 20 | 8h | 1.0 | 0.4 | 1.0 | 0.55 / 0.55 | 8 |
| Futures | 25 | 6h | 1.0 | 0.4 | 1.0 | 0.58 / 0.75 | 8 |
| Indices | 68 | 8h | 1.0 | 0.4 | 1.0 | 0.18 / 0.12 | 9 |
| Metals | 30 | 8h | 1.6 | 0.4 | 0.8 | 0.75 / 0.78 | 8 |

Agriculture and livestock are calibration classes, not display groups:
both render as Futures. The two axes are independent, which is what let
corn and cattle take their own geometry without moving between account
types.

Per-symbol overrides: BZUSD/CLUSD keep TP1 0.6 and runner 0.8 (oil
trends; both reject earlier banking on test). ZOUSX takes a 24-hour
window, a 1.4 stop cap and a 1.0 runner (round 28) — the only override
that touches a value the UI mirrors, which is why
`src/lib/advisorReview.ts` now resolves per symbol before per class.

Session gates: 12:00–18:00 UTC blocked for crypto, futures, and indices
(r22 full-depth validation — futures emphatic, crypto retained as a
net-quality filter); energies additionally blocked at UTC hours 3, 4,
12, 15, 19, 21 (r15). Chop-regime gate active for all classes (r3b).
Forex/futures carry the buy-side tilt (r5). High-impact scheduled news
blocks reviews; penalties per the caps above (r23 validated them as
calibrated).

Tradable menu: **97 distinct markets** (forex 45 · crypto 33 · futures 27 per account type — those sum to 105 only because eight crypto CFDs appear on two account types) — full matched coverage under amendment
32 (2026-08-09): every market E8 offers for which FMP carries a verified
IDENTITY-MATCHED series is visible and scannable; a derivative is not its
underlying, and a time-varying gap is not a match.

| Account | Markets | Composition |
| --- | --- | --- |
| Forex | 45 | 28 forex · 8 crypto · 6 indices · 2 metals · 1 energy |
| Crypto | 33 | 33 crypto |
| Futures | 27 | 27 futures |

Crypto matches E8's published offering exactly. The dormant rows are
evidence-graded, not withheld: thirteen futures-classified rows fell to
amendment 32 (fourteen no-series candidates plus the six cash-index CFDs
and five index futures whose FMP series is the underlying index, not the
contract), and `BRENT` went dormant on the owner's F13 frame — its offset
to FMP's `BZUSD` moved with the contract month (+1.61 → +1.10 in a week),
a spread in motion, while WTI's +0.10 sat inside E8's own quoted spread
and stays served. Grounds and re-probe paths live in
`src/lib/broker/masterList.ts`; `scripts/verify-fmp-matches.ts` re-probes
candidates each run. Nothing here is a coverage verdict — amendment 31's
default stands, and only calibration verdicts remove served markets.

`noTradeSymbols` is empty by derivation: every symbol it held turned out
to have a match. The mechanism stays, and still refuses anything added to
it. There is no second tier — `noScanSymbols` IS `noTradeSymbols`, so
"the scan skips it" and "the server refuses it" are one condition, and the
menu the UI offers is exactly the universe a scan of All markets walks
(pinned by `tests/core.test.ts`).

Indices are reachable in production for the first time. The class was
withheld through r12 on a negative record; round 28 found the record had
been drawn on a starved sample (see below) and the class now posts
positive R on both splits.

Measured record (test split, filled setups, money-positive): forex
.89/123,254 · metals .90/453 · futures .83/2,368 · crypto .87/6,106 ·
energies .60/474 · indices .51/952. The indices row predates round 28 and
is the pre-fix record; it is left as measured rather than restated, and
re-measuring it is the first item when the sweeps resume. The UI's
replay-record rows mirror these exactly (`src/lib/replayReliability.ts`).
**Read the whole record against the evaluator-repair note below**: these
numbers were produced by the pre-repair instrument, every corpus behind
them is invalidated by design, and the first post-repair sweep re-measures
all of them before any is treated as current again.

## Evaluator repair (2026-08-09, item 2 — `2026.08.09.evaluator-repair`)

Fourteen defects in the measuring instrument itself, mapped in
`docs/research/evaluator-repair-map-2026-08-09.md` and landed as one
change set. What changed, in the order the data flows:

- **The provider boundary tells the truth (2b, 2h).** FMP stamps bars on
  the New York wall clock; three duplicated parsers read them as UTC, so
  every session gate, low-edge hour, news join and expiry in the corpus
  sat 4–5 DST-variable hours off. One normalizer (`bars.ts`) now parses
  NY-aware with a DST-safe two-pass conversion, validates OHLC coherence,
  rejects spike ticks against neighbor consensus, and counts every
  rejection — nothing is silently repaired.
- **A decision sees only what existed (2a, 2k, 2l).** Daily bars gate on
  COMPLETION, not stamp — probed empirically: FMP dailies are
  settlement-day aggregates (ES opens on Thursday 18:00's print exactly;
  corn on Thursday 20:00; FX Mondays open at Sunday-evening opens; BTC
  rolls at UTC midnight to the cent), so the old stamp-time admission
  leaked the decision day's completed OHLC into ATR, EMAs, regime and the
  expected-window move all day. The same shared gate
  (`dailyCompletion.ts`) drops the live loader's forming current row and
  the weekend-stamped transients. Resampling buckets on the NY wall clock
  FMP anchors to (hourly :00, 4hour 00/04/08/12/16/20 NY), and replay
  carries a real fetched 5min series so the committee votes over the five
  timeframes production votes over.
- **The path evaluator stops inventing prints (2c, 2f, 2e).** On a fill
  bar only adverse facts are knowable — the fill IS the crossing, and any
  path to the stop passes entry first — so fill-bar target and TP1
  touches no longer resolve. Resolutions carry gap-aware legs
  ({leg, price, time}: a bar opening beyond a level executes at its open),
  and ambiguity is priced at the stop side, so the pessimistic −1 is
  arithmetic, not a special case.
- **One R accountant, cost charged once (2g, 2d).** `realizedRFromLegs`
  replaces the ten nominal-level reconstructions: planned risk is the
  unit, actual leg prints the numerator, one round trip of cost charged in
  R space. `effectiveRewardRisk` drops its double-charged denominator so
  the payoff gate's forward metric means what the measured corpus means.
  **D2 closed (R1a slice 1, 2026-08-18):** the accountant moved into
  `replay.ts` and the resolver writes `realizedR`/`netRealizedR` from its
  own legs on EVERY filled resolution — the expiry branch had been the
  only writer, and it billed full size on a half-sized runner after TP1
  banked; a TP1-banked expiry now scores the ladder. Unfilled rows carry
  no R. Back-deriving R for rows graded before the bump rides with
  Phase 2's D1 recompute.
- **Indicators abstain (2m, 2n).** EMA seeds on a real SMA and is null
  below its period; RSI is null on a frozen series instead of reading 100
  overbought; a regime that cannot warm refuses the decision into a new
  `notWarm` bucket so decision arithmetic still closes.
- **Costs are per-symbol where the tick is known (2j).** Tick-gridded
  contracts pay their own one-tick floor instead of a family-mean bps
  (the E-mini Nasdaq wore ~13 ticks; the 2-year note paid under one), per
  the dossier's finding that E8 applies no futures spread over
  exchange-native pricing. Production now BANKS every quoted spread it
  sees (append-only `analyzer_events` rows) so 4a can measure instead of
  model.
- **The corpus describes itself (2i).** Every sweep emit writes
  `<emit>.manifest.json`: analyzer version, hashed per-symbol
  calibration, grid, warmup/split, anchor, per-(symbol, timeframe) bar
  facts including the largest gap, and the rejection tally. Item 3's
  readers assert the hash before aggregating anything.

Consequences: the accepted-setup count moves by design (fill-bar phantom
wins are gone, expectancy is net of execution, abstention re-routes
tallies), so **no pre-repair corpus is comparable to a post-repair one**
— which is exactly what the manifest hash now makes impossible to do by
accident. The learning cohort scopes to `2026.08.09.evaluator-repair` on
deploy. The one re-sweep that follows this change set is the first
measurement the repaired instrument produces, and item 3's acceptance
procedure reads only manifested corpora from then on.

**The first repaired baseline (2026-08-10, corpus `3b108f43d4c2`)
measured the accepted stream NEGATIVE in every class** — forex −0.057
±0.009 (market-clustered), crypto −0.122, metals −0.225, futures −0.279,
agriculture −0.367, livestock −0.161 over 764,936 non-holdout baseline
records at full discovered depth. The measured-record table above is
therefore the PRE-repair instrument's output, kept as history; the
repaired record of record lives in
`docs/research/baseline-2026-08-10/` with the 4b geometry review
(`4b-geometry-model-review-2026-08-10.md`) explaining WHERE the loss
lives (runner leg + cost + breakeven tax; banking itself is positive)
and what item 4c will vary. The UI's replay-record rows still mirror the
pre-repair record while the desk is parked; they are re-derived when 4d
lands a geometry that survives item 3's gate.

Operational loop, running without operator attention: hourly
outcome-sync (cron :23) resolves pending setups; hourly news-calendar
ingestion (cron :07) with a watchdog (cron :41); a launchd agent tops up
the local replay cache daily at 07:00 so the replay basis stays current
for the day the work resumes. Global learning accrues inside the
`2026.08.09.evaluator-repair` cohort — every origin, since Scan is the
only door (§17m); the cohort scoped fresh when item 2's engine deployed.
**The desk is parked** (§17p, re-parked 2026-08-07): the gate turns
arrivals away and every session was ended; reopening is one flag plus its
tests, recorded in HANDOFF §1.

## Engine v2 (2026-08-11, round-8 batch 3 — `2026.08.11.engine-v2`)

CONVERGE round 8's cost and fill-realism lenses found that the repaired
evaluator still measured a venue that does not exist: no commission
anywhere in the cost model, and every event triggered on MID while the
venue executes on bid/ask. Engine v2 is the venue's bill and the venue's
fills, in one version:

- **The commission exists** (`venueCosts.ts`, CO-1/3/4). E8's published
  bill per line, converted to price distance: the futures program's three
  itemized per-contract fees over tick value (primary), forex's $5/lot RT
  as 0.5bp of price (primary), the index $6/$12 split over published
  $/point multipliers, metals/energies per lot, crypto's conflicted
  published units resolved conservatively at 0.035% per side. Symbols E8
  publishes no row for carry a NAMED conservative sibling proxy. The
  measurement paths refuse non-roster symbols outright — a null, never a
  guess — and `estimateExecutionQuality` now reports
  `estimatedCommission` inside the round trip. On the flagship forex
  fixture the commission is 75% of the whole pre-repair modeled round
  trip: the exact understatement CO-3 measured.
- **The crypto book floors the model** (CO-2). The sampled per-symbol
  bid/ask widths from the crypto account observation (0.35bp BTC to
  275bp FIL) join the modeled spread as floors under max(); one class
  number cannot span that book. Quoted spreads still outrank everything.
- **Triggers live in bid/ask space** (FR-1). For a long: the entry needs
  the ask down at the limit, the stop fires when the BID touches it
  (half a spread EARLIER than mid showed), the targets need the bid up
  at their level (half a spread LATER). Gap prints land on the
  executable side of the open, with reopen slippage on top where the bar
  truly gapped (FR-7); the expiry close crosses the book once. In the
  sweep the leg accountant now charges commission only — spread and
  slippage live in the prints, and charging them again would double-bill
  the trip.
- **Resolution runs on the 5min series where it exists** (FR-5) — 3x
  finer event ordering shrinks the ambiguous bucket honestly. A bar
  whose span straddles expiry resolves nothing (LA-2). The expired
  in-profit/at-loss split reads NET of the round trip (FR-8). Banking
  TP1 arms the runner's protection within the same bar's close (FR-3,
  2c's own knowability principle applied forward). TP1 manual haircut,
  one-bar entry latency and touch-fill penetration exist as parameters
  for 4d sensitivity work (FR-4/6, LA-13), defaulted off.
- **Named boundary — CLOSED 2026-08-11 (#314):** live outcome-sync now
  replays each row's own stored decision-time costs (risk_model carries
  the full executionQuality, so no migration was ever needed): bid/ask
  triggers, gap slippage, net expired labels, same-bar arming — the
  measured semantics and the live semantics are one engine. A row
  without stored quality resolves v1-style, stated, never invented.

Every v2 behavior is opt-in through `ReplayFillOptions`; with no options
the resolver reproduces v1 exactly, which is what keeps the live path
and 2,100+ existing pins honest while the corpus side moves ahead.

## The derived per-market layer (2026-08-11, item 4d — `2026.08.11.totality`)

The first per-market calibration derived entirely behind the repaired
instrument: engine v2's venue bill and fills, gate v2's enforced
statistics, one confirm read burned into the corpus log.

**Thirty-nine markets carry a derived cell** — exactly the variant that
was frozen before the confirm fold was opened and confirmed positive on
it. The cell is (confidenceThreshold 0 · runnerProtection ·
maxStopAtrMultiplier · sizingHoursFactor), dominated by trail_tp1 at
cap 4 but derived per market (SP confirmed hold; two forex crosses took
cap 2.5). The zero threshold is the record-speaks model the Guide's §5
teaches: the gate that ranked nothing (measured ρ ≤ 0.06) no longer
pretends to, and the payoff and regime gates still stand.

**Everything else keeps its class values, in a NAMED state**: 2
confirm-reverted (HOUSD, RBUSD — accepted on select, failed the sealed
fold), 11 capacity-gated (RM-1: one step of the instrument at the
widened stop exceeds the published 3% daily tier at the line's smallest
account — treasuries, PA, ZO/ZR, six sub-dollar coins), 7 measure-only
including all three livestock, 18 starved late-listed, and ~20 held-out
markets that no tuning step ever saw — the next cycle's unseen
validation. Record and artifacts:
`docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md`.

The UI mirrors the derived floors
(`DERIVED_CONFIDENCE_FLOOR_BY_SYMBOL`) under the same exhaustive
parity sweep that holds every other mirror to the engine's resolver.

**Three tranches, 72 cells, and one unflattering number.** The holdout
cycle (11/11 confirmed) and the totality cycle (22 more on per-market
full-span folds) followed the same day; the engine carries 72 derived
cells under `2026.08.11.totality`. But the gate measures IMPROVEMENT
against a negative baseline, so **50 of those 72 markets are
money-positive on the held-back fold and 20 are not** — they lose less,
not nothing. A per-market threshold rescue was attempted across every
threshold their own scores admit and FAILED. That is an open owner
decision under amendment 31's 4d exit, recorded in full in
`docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md`.

## Resumption protocol (for the operator)

The arc resumes when genuinely new data exists — not on a calendar
whim. Two triggers, whichever comes first:

1. **Cohort trigger (the one that matters):** any single class reaches
   **~500 resolved, filled live outcomes** under the current version.
   That is the smallest population the arc's own methods treated as
   conditionable (per-symbol threshold curves used 300–800; bands below
   ~150 were noise). Forex will get there first, and the Desk build's
   scan persistence multiplies the accrual rate the day it ships. Check
   the count in the Supabase SQL editor:

   `trade_setups` carries no `asset_type` column — the analyzer derives the
   class from the symbol at request time and persists it inside the setup's
   own confluence, so the count reads it from there:

   ```sql
   select ts.confluence -> 'categoryCalibration' ->> 'assetType' as asset_type,
          count(*) as resolved_filled
   from trade_outcomes o
   join trade_setups ts on ts.id = o.setup_id
   -- Use the LIVE cohort (calibration.ts ANALYZER_VERSION) — a dead
   -- version here counts zero accrual forever (round-8 PH-13).
   where o.analyzer_version = '2026.09.01.platinum-group-rate-inverse'
     and o.outcome not in ('pending', 'unfilled')
   group by 1
   order by resolved_filled desc;
   ```

2. **Season trigger (the owner's chosen mechanism, 2026-07-30):**
   quarterly re-validation on new provider bars, first pass
   **2026-10-28**, then every ~13 weeks. The owner runs it from a
   calendar reminder carrying the kickoff prompt below; if the cohort
   trigger fires earlier, the same prompt applies — the cohort simply
   becomes part of that pass. Every gate is re-derivable (r22's
   `--ignore-low-edge` instrumentation exists for exactly this).

The kickoff prompt (authoritative — when this arrives in a fresh
session it is a directive to execute this protocol, not a question):

> It's time for the seasonal recalibration of the Levelflow engine, per
> the Resumption Protocol in docs/trade-model.md (arc stopped
> 2026-07-30 after Round 23). Begin with the compliance audit. Check
> the cohort counts with the protocol's SQL and reconcile whatever live
> cohort exists against replay expectations, class by class. Then run
> the seasonal re-validation on the provider data accrued since the
> last pass: re-derive the state-of-record table at full depth under
> the standing discipline — pre-registered rules before results,
> walk-forward both-splits gate, cross-run reconciliation on
> same-anchor runs, no concurrent same-symbol sweeps, no change for
> its own sake. Ship only what improves both splits; validate and
> leave alone everything else; update the state-of-record docs, the
> calibrationState test pins, and memories either way. As always:
> test, verify, commit, push, merge, clean up, and verify live in
> production. Conclude with an honest read: did new data reopen any
> lever, and when should the next seasonal pass run?

When either trigger fires, open the session with:

> "Begin the cohort round with the compliance audit. Then reconcile the
> live cohort against replay expectations, class by class, and only
> where they diverge re-open the specific gates — with the full
> discipline: pre-registered rules before results, walk-forward
> both-splits, cross-run reconciliation, and no change for its own
> sake."

The first cohort round is a **drift test, not a grid hunt**: per class,
does the live money-positive rate and expectancy match what replay
predicted for the same setups? Agreement validates the engine on data
it has never seen — the strongest evidence this arc could never
produce. Divergence localizes exactly which mechanism to re-open, and
the round journal below documents how each was derived the first time.
Between now and then: no rounds. The engine is not waiting for ideas;
it is waiting for evidence.

## Geometry

Every setup is a limit-entry bracket built on one timescale — the review
window — instead of mixing intraday entries with swing stops and multi-day
targets (the pre-2026-07-28 defect that produced 50% expired-open outcomes
and near-zero take-profit hits in production).

- **Expected window move**: `dailyATR × sqrt(reviewHours / 24)`. Every level
  must fit inside it.
- **Entry**: limit order offset from the latest close by a per-class ATR
  fraction (indices sit near the market; deep offsets never filled).
- **Stop**: the structural candidate — nearest confirmed swing pivot with a
  volatility buffer, floored at 1.25 ATR — clipped by the class cap
  `maxStopAtrMultiplier × ATR(15m)`. Wherever the cap sits at or below the
  floor the cap binds by arithmetic and `stopProvenance` records `cap`. That
  is 26 of the 97 scan-roster markets as of 2026-08-25; the other 71 carry a
  cap of 2.5 or 4.0 and can be set by any of the three. The class-level
  reading this passage carried — "seven of eight classes, both other levers
  dead" — predates the per-market cells, which themselves come from the
  corpus the banner above declares invalid. The prose here used to state
  the pivot case as the rule; the emitted `stopLogic` now derives from the
  provenance instead, and so does this sentence.
- **TP1**: `max(tp1RiskShare × risk, tp1AtrMultiplier × ATR)`, capped at 60%
  of the expected window move. Banks half the position; the stop moves to
  entry.
- **Runner**: nearest swing pivot whose distance is at least
  `minimumTargetRewardRisk × risk` and at most
  `runnerWindowShare × expectedWindowMove`. With no structure in that band,
  the expected-move objective itself is the target. If the payoff floor is
  unreachable inside the window, the setup is rejected — the floor filters,
  it never stretches targets.

## Direction

An eight-method committee (multi-timeframe alignment, liquidity sweeps,
trend pullback to value, breakout/failed-breakout, range mean reversion,
momentum, volatility expansion, volume-profile position) weighted per asset
class, gated by a daily-chart regime classifier, scored to a 0–100
confidence with news, session, execution-cost, macro-rate, and learned
penalties.

### What the Treasury curve is allowed to say about a market

Every market carries one macro role, in `MACRO_RATE_ROLE_BY_SYMBOL`
(`supabase/functions/trade-analyzer/macroRates.ts`). The table is exhaustive
over `symbolMap` and each entry states its own reason; those reasons are the
record, not this section.

| role | on a rising 10-year | markets |
|---|---|---|
| `usd-base` | favours buy | 3 |
| `usd-quote` | favours sell | 4 |
| `rate-inverse` | favours sell | 52 |
| `energy-shock` | no side; −1 at \|Δ\| ≥ 8bps | 6 |
| `none` | nothing | 33 |

Magnitude is 1, doubling to 2 past 8bps. Moves under 4bps are inert for every
role.

`usd-quote` and `rate-inverse` emit the same side on today's roster and are
deliberately kept apart: the agreement is a coincidence of the current
membership, and one table pins it so a divergence becomes a failure rather
than a silent reinterpretation.

Two markets carry an open question rather than a settled reason. PLUSD and
PAUSD are platinum-group — industrial as much as monetary — and admitting
them to `rate-inverse` means stating a criterion separating a monetary metal
from an industrial one that nothing in this repo states. That is an owner
ruling. HGUSD is not open: copper's exclusion is a decision written into the
old metals set's own composition, which admitted every precious metal and
left this one out.

## Acceptance bar

No calibration value ships without walk-forward validation in
`scripts/replay-sweep.ts` (60/40 train-test split, live pipeline, honest
expiry). The harness applies the same confidence-threshold and
effective-payoff gates as production.

Sweep of 2026-07-28 (60 days, 10 symbols, out-of-sample):

- Metals carry a real edge at high selectivity — thresholds raised to 82
  (XAUUSD +0.18R expectancy, 68% TP1 rate, 16% stop rate).
- Crypto is positive only at high selectivity — threshold 82.
- Forex, indices, and energies showed no positive out-of-sample expectancy
  at any tested threshold; their calibrations stay conservative and their
  next levers (session gating, regime gating, per-pair profiles) must be
  validated against the fresh outcome cohort this version starts.
- NGUSD setups fail the effective-payoff gate almost always — its trading
  costs were never viable; the honest model shows fewer or no NG setups.
  **FALSIFIED 2026-08-05 (round 24).** The costs were not gas's; they were
  the cost model's. An absolute-price floor of 0.01 on the futures class
  charged natural gas 2.7x its entire risk distance. Corrected, NGUSD
  produces 305 train / 209 test accepted setups. Its expectancy is still
  split-inconsistent (-0.084 / +0.001), so the *conclusion* to keep gas out
  survives — but the *reason* recorded here was wrong, and the same bad
  reason was silently suppressing copper, which turns out to be one of the
  strongest markets in the book.

## Round-3 universe findings (2026-07-28)

Every supported symbol was swept individually (58 symbols, 60 days,
walk-forward). Durable character groups emerged:

- CHF-quote pairs: 7 of 7 OOS-negative. CAD/NZD-quote pairs: 8 of 8
  positive. Metals and index futures positive; cash indices negative on
  small truncated-session samples; crypto majors positive, alts negative.
- A volatile-chop regime gate and character-group threshold bumps were
  implemented and A/B swept. Neither validated: effects were inconsistent
  across symbols and threshold bumps shrank samples without repairing
  expectancy (in no-edge groups the confidence score does not
  discriminate). The unvalidated knobs were reverted; the regime-gate
  mechanism (`blockedRegimes`) remains available and tested for future
  cohort evidence.
- The adopted, durable response is scan curation: the default all-market
  scan covers only markets with measured edge (CHF-quote pairs, crypto
  alts, and cash indices are excluded). Every symbol remains reviewable
  directly, and explicit group scans cover the full group. Curation is
  data-driven and should be revisited as the live cohort accumulates.
  **Superseded twice** — later rounds returned all 28 forex pairs and all
  seven non-BNB cryptos to the default universe, and §17m.1 deleted the
  direct review path, so nothing is "reviewable directly" any more. Then
  amendment 31 (2026-08-07) retired scan curation entirely: full matched
  coverage is the resting state — every identity-matched E8 market live
  per account type (97 distinct today; the per-account views are 45/33/27
  and sum to 105 only by double-counting the eight dual-listed crypto
  CFDs. Amendment 32 tightened "matched" to identity and BRENT's
  dormancy debited one more; the 106 → 105 → 97 sequence is three
  successive arithmetic corrections, the last by the 2026-08-11 audit)
  — and the only path out of the offering is a
  calibration verdict under item 4d. No curation mechanism exists in the
  scan path today, and no sentence anywhere should claim one. See the menu
  under "Current engine state" for the state of record.

## Round-3b calibration (2026-07-28, 150-day instrumented replay)

The sweep gained a bar cache (pinned, drift-free A/B), a capture-all mode
that evaluates below-threshold setups, and per-setup emission (score,
regime, payoff, outcome). 31,466 records across all 58 symbols produced:

- **Score-expectancy curves are flat.** The confidence score ranks
  committee agreement, not outcomes; raising thresholds is not a money
  lever anywhere except marginally for BTC/ETH. Thresholds therefore stay
  put, and the UI now shows *measured* replay frequencies instead of
  implying predictive power the score does not have.
- **The volatile-chop gate validated**: zero-or-negative OOS in every
  group, improvement on both splits over identical pinned bars
  (+0.003R train, +0.008R test per filled setup). `blockedRegimes:
  ["volatile_chop"]` is active for all classes; model version
  `2026.07.28.chop-gate-validated`.
- **A 60-day mirage caught**: the CAD/NZD-quote group's earlier 8/8
  positive collapsed to ~0.00R at 150 days. Windows lie; the pinned
  150-day harness is the new minimum bar for calibration evidence.
- Honest system state: after gating, OOS expectancy per filled setup is
  futures +0.06, energies +0.01, forex −0.03, crypto −0.05, metals −0.06,
  indices −0.23 (curated out of the default scan). Range is the only
  broadly OOS-positive regime — consistent with the pullback-limit style.
  Closing the remaining gap is the standing calibration program: pinned
  replay plus the live outcome cohort now accumulating.

## Round-4 calibration (2026-07-28, 1,200-day session-aware replay)

The harness became session-aware (bar-time session context: blocks and
penalties now apply in replay exactly as in production) and the bar cache
anchors to the run day, so the window always rolls forward with time.
148,465 records across all 58 symbols over ~3.3 years produced:

- **Range-emphasis rejected.** The 150-day "range is the good regime"
  finding did not survive the 8x sample: regime score adjustments moved
  expectancy by less than ±0.01R with split disagreement everywhere. The
  mechanism (`regimeScoreAdjustments`) remains available, unconfigured.
- **Low-edge hour gates validated.** Setups opened 12:00-18:00 UTC were
  negative on BOTH splits for crypto and futures (US-session momentum
  flows against pullback entries; the London/NY overlap similarly tested
  negative for forex — the "liquidity is always good" prior is wrong for
  this style). Crypto and futures no longer open setups in that window.
- **Durability table (150d vs 1,200d):** every previously curated group
  re-confirmed negative in both independent windows. Four new durable
  negatives joined the scan curation: AUDCAD, AUDUSD, GBPAUD, GBPJPY.
  Durable positives: BRENT, BZUSD, EURGBP, GCUSD.
- **First OOS-positive whole-system configuration.** Gates + curation
  moved 16-month out-of-sample expectancy from -0.008R to +0.003R per
  filled setup (n=18,410), with the training split improving in lockstep
  (+0.027 to +0.035). Per class OOS: metals +0.041, energies +0.032,
  futures +0.007, forex +0.004, crypto -0.008, indices -0.073 (curated
  out of the default scan). Small, real, and measured — not a promise.
- Next designed feature: a COT positioning vote (weekly CFTC data maps to
  the full universe via FMP), which requires an honest historical join in
  the replay before it can gate.

## Round-5 calibration (2026-07-29, full available history + COT)

Depth became self-discovering (see the table below) and CFTC positioning was
added as a first-class, replay-joined input. 124,483 records across all 58
symbols on each symbol's full history produced:

- **Depth was the single largest accuracy gain of any round.** On the full
  window the whole system measures **+0.030R train / +0.044R test per filled
  setup, ~59-60% money-positive** on the shipped configuration — versus
  +0.003R on the 1,200-day window. The short window was not wrong so much as
  blind: 16 years of forex contains regimes a 3-year sample cannot show.
  (These figures were re-derived in the post-round review on the corrected
  basis: chop-regime records excluded, as the shipped config actually
  trades. The capture-all `accepted` flag now honors the regime gate so
  offline aggregates cannot drift from production behavior again.)
- **COT positioning: implemented, tested, and rejected as a gate.** Contract
  mapping covers the universe (crosses net both legs, USD-first pairs
  invert), percentiles rank against each contract's own trailing history, and
  publication lag is enforced in `buildCotContext` with a test that fails on
  lookahead. But the contrarian effect did not validate: train showed no
  spread between joining and fading a crowded book (+0.028 vs +0.028), the
  effect appeared only in test, and the two crowding directions contradicted
  each other (fading crowded longs +0.147, fading crowded shorts −0.021).
  `cotScoreAdjustment` therefore ships at zero — the mechanism is ready if
  the live cohort ever supports it.
- **Validated: a buy-side tilt.** Sell setups beat buy setups on *both*
  splits for forex (train +0.042 vs +0.023, test +0.118 vs −0.010) and
  futures (train −0.016 vs −0.035, test +0.110 vs +0.054), consistently
  across every COT percentile bucket and every regime. Buys remained
  profitable in the training era, so they are not blocked — they carry a
  −6 confidence bar in those two classes. Validated apples-to-apples on
  identical records with all gates honored: train +0.0287→+0.0299 and test
  +0.0357→+0.0435, keeping ~91% of setups. A deeper tilt improves test
  further but not train, so 6 is the honest choice.
- Per-class OOS on the shipped config (corrected basis): energies +0.155,
  futures +0.091, forex +0.045, crypto +0.032, metals −0.071, indices
  −0.081 (curated out).

## Round-6 calibration (2026-07-29, per-symbol curves + news-aware replay)

- **Per-symbol threshold curves.** With full-history samples (forex pairs
  carry 400-630 OOS setups each), per-symbol expectancy-vs-cutoff curves
  became statistically legitimate. The gate (raises only; both walk-forward
  splits must improve by >=0.01R; train n>=300, test n>=150) passed exactly
  2 of 33 eligible symbols: EURGBP and EURJPY, both 66 -> 82. The other 31
  showed flat curves or split disagreement and correctly keep class
  thresholds — the EURUSD case (train +0.058, test −0.051) is the
  archetypal overfit the gate exists to block.
- **News-aware replay.** Scheduled medium/high-impact events (FMP calendar,
  the medium/high events FMP serves from 2013 — the store held far fewer until the 2026-08-25 merge-key fix, which was discarding many events per instant) now join the replay at decision time: active
  high-impact events block reviews and the remainder feed the score
  penalty, mirroring production exactly. Measured effect on expectancy:
  neutral (train +0.000, test +0.001) while removing the event-window
  setups production would refuse — a fidelity ship. Noted for future
  study: penalized-but-accepted setups slightly outperformed clean ones in
  training, so the medium-impact penalty weight deserves examination once
  the live cohort can arbitrate.
- Final shipped configuration on the full window: **+0.032R train /
  +0.044R test per filled setup, 58.8% / 59.8% money-positive** — the
  strongest measured state to date. Per-class OOS: energies +0.152,
  futures +0.083, forex +0.046, crypto +0.032, metals −0.064, indices
  −0.097 (curated out).

## Round-8 calibration (2026-07-29, ladder-geometry revalidation)

The exit ladder's two class-level knobs were grid-swept at full depth on
the warm pinned caches — `tp1RiskShare` (0.6/1.0/1.2 vs 0.8 baseline) and
`runnerWindowShare` (0.8/1.2 vs 1.0–1.1) — 58 symbols, both splits,
~1.99M grid records. One coherent story emerged: at this review horizon,
closer objectives earn more than ambitious ones.

Axis-aligned winners under the both-splits gate:

- `tp1RiskShare 0.6` (bank TP1 earlier): forex, crypto, metals, futures.
  Energies failed (kept 0.8). Indices INVERTED — later banking (1.2)
  reduces losses on both splits, broad across 4 of 5 symbols on test.
- `runnerWindowShare 0.8` (nearer runner objective): forex, energies,
  futures. Crypto, metals, indices keep their current runner.

Because forex, energies, and futures change both knobs, the combination
was re-validated as a single candidate against the same caches. It passed
every class and the whole system on both splits — the largest validated
improvement since depth discovery:

| Scope | Train expR | Test expR |
| --- | --- | --- |
| Whole system | +0.034 → +0.063 | +0.050 → +0.082 |
| Forex | +0.035 → +0.066 | +0.055 → +0.091 |
| Crypto | +0.041 → +0.053 | +0.039 → +0.052 |
| Metals | +0.043 → +0.045 | +0.001 → +0.008 |
| Energies | +0.021 → +0.043 | +0.016 → +0.028 |
| Futures | +0.014 → +0.041 | +0.004 → +0.038 |
| Indices | −0.051 → −0.037 | −0.090 → −0.060 |

Test-split money-positive rates rose with expectancy (forex 60.5% → 70.5%)
because earlier TP1 banking converts near-miss reversals into banked
partials. The tighter runner window also acts as a feasibility filter: the
three runner-0.8 classes accept ~8.5% fewer setups through the payoff
gate (classes that kept their runner have byte-identical setup counts).
Version `2026.07.29.ladder-geometry-v2`; reliability table re-based to the
combined run's test split.

## Round-9 calibration (2026-07-29, forex per-symbol tp1 curves)

The round asked whether individual forex pairs want individual TP1
banking shares. The grid (28 pairs, full depth, fresh caches, variants
0.5/0.8/1.0 against the shipped 0.6, conditioned on the shipped
runner 0.8) answered with uniformity instead: **0.5 improved on 0.6 for
28/28 pairs on both splits** (24/28 passed the strict per-symbol gate of
≥+0.01R on both splits with n floors), and no pair preferred a higher
share. The monotone slope obligated one probe below: 0.4 beat 0.5 on
both splits for 27/28 pairs (EURGBP split the difference by ±0.004 on
test) and beat the 0.6 baseline everywhere.

Shipped: class-level `tp1RiskShare 0.4` for forex — no per-symbol
overrides, because the durable finding is that none are warranted. On
identical setup populations (131,746 train / 69,390 test filled
setups):

| Config | Train expR | Test expR | Test money-positive |
| --- | --- | --- | --- |
| 0.6 (prior) | +0.066 | +0.092 | 70.5% |
| 0.5 | +0.084 | +0.111 | 76.7% |
| **0.4 (shipped)** | **+0.108** | **+0.131** | **83.7%** |

Mechanism, not curve-fit: first-target hit rates rise to 78–87% and
stop-out rates nearly halve, because half the position banks before
ordinary pullbacks reach the stop; the runner objective (0.8× window
move) is unchanged and carries the upside. The knob self-limits below
this range — TP1 never drops beneath the 0.5×ATR floor — so 0.4 is
where measurement stopped mattering, not merely where we stopped
measuring. Version `2026.07.29.forex-tp1-early-bank`; forex reliability
row re-based to the 0.4 test split.

## Round-10 calibration (2026-07-29, early bank extended to the other classes)

Forex's round-9 mechanism — bank half before ordinary pullbacks reach
the stop — is not forex-specific. The same grid (tp1RiskShare 0.4/0.5
vs the shipped 0.6) ran for crypto (8 symbols), metals (2), and
futures (13) at full depth. All three classes pass the both-splits
gate at 0.4, with one coherent exception: the oil futures.

| Class | Train expR | Test expR | Test money-positive |
| --- | --- | --- | --- |
| Crypto 0.6 → 0.4 | +0.053 → +0.079 | +0.032 → +0.063 | 64.9% → 77.5% |
| Metals 0.6 → 0.4 | +0.045 → +0.092 | +0.013 → +0.049 | 65.5% → 77.0% |
| Futures 0.6 → 0.4* | +0.041 → +0.075 | +0.060 → +0.100 | 66.8% → 76.4% |

*Shipped futures config: class 0.4 with `BZUSD`/`CLUSD` overridden to
keep 0.6 — both oil futures REGRESS on the test split at any earlier
bank (BZ −0.024, CL −0.041 at 0.4), exactly as cash energies rejected
0.6 in round 8. Oil trends where the rest of the universe pulls back;
later banking is its validated shape. The table's futures row shows
the shipped combination measured on records (0.4 ex-oil + 0.6 oil).

Setup populations are identical across variants per class (the knob
touches exits only). Version `2026.07.29.early-bank-classes`;
reliability rows re-based for crypto, metals, futures. Indices (1.2)
and energies (0.8) keep their round-8 values — both rejected earlier
banking when tested.

## Round-11 calibration (2026-07-30, runners re-tuned under the early bank)

The runner objective was tuned in round 8 when TP1 banked at 0.6–0.8×
risk; rounds 9–10 moved the bank to 0.4× for most classes, so the
runner side of the interaction was unmeasured. Full-depth grids per
class (same warm caches) answered: **tighter runners win under the
early bank**, with the same two coherent exceptions as before.

| Class | Runner | Train expR | Test expR |
| --- | --- | --- | --- |
| Forex 0.8 → 0.6 | +0.108 → +0.122 | +0.131 → +0.138 |
| Futures 0.8 → 0.6* | +0.075 → +0.082 | +0.100 → +0.113 |
| Crypto 1.1 → 0.8 | +0.079 → +0.081 | +0.063 → +0.068 |
| Metals 1.0 → 0.8 | +0.092 → +0.100 | +0.049 → +0.066 |

*Oil futures (`BZUSD`/`CLUSD`) rejected every tighter runner on test —
their overrides now pin both knobs (tp1 0.6, runner 0.8). Indices
rejected all variants (train/test disagree) and keep 1.1; energies
were out of scope (their TP1 never moved, so their r8 runner remains
conditioned correctly).

Two structural notes. First, 0.6 is the floor by design, not by
timidity: the runner objective share meets TP1's 0.6×window-move cap
there, so probing lower would invert the ladder. Second, tightening
the runner shrinks acceptance through the payoff gate (forex accepts
~30% fewer setups on test) — the config trades quantity for quality,
and the reliability table's sample sizes shrink accordingly. Version
`2026.07.30.tight-runners`; reliability rows re-based.

## Round-12 calibration (2026-07-30, the indices verdict)

Cash indices (SP, NSDQ, DOW, NIKKEI, DAX) got their dedicated round
after rejecting every generic knob since round 8. From 2,375
current-config records at full depth, every index-specific lever fails:

- **Threshold curves diverge**: train improves monotonically with the
  cutoff (+0.073 at ≥90) while test stays negative at every level
  (−0.042 to −0.064). The confidence score does not rank index
  outcomes out-of-sample — disqualifying on its own.
- **Sessions**: 12:00–18:00 UTC is the worst stretch (−0.055 train /
  −0.094 test); even the best bucket (06–12) is negative on both
  splits (−0.006/−0.014).
- **Regimes**: all negative on both splits.

Shipped policy — the honest conclusion:
1. **No scan path includes cash indices** (`noScanSymbols`, enforced
   server-side in the scan handler and mirrored in the UI's scannable
   groups). They remain individually reviewable in the advisor so the
   live cohort can earn them back.
2. **The 12:00–18:00 UTC low-edge gate extends to indices** — for
   whoever reviews them anyway, the worst window is closed. Removing
   that bucket improves both splits arithmetically (blended
   −0.037/−0.060 → remaining −0.006/−0.014).
3. **The quality receipt says it plainly** when a market's measured
   record is weak (money-positive < 55%): scans skip it, review with
   care.

The road back is cohort evidence: if live index outcomes accumulate a
record the replay never found, the policy reverses. Version
`2026.07.30.indices-no-edge-policy` (the session gate changes setup
construction; the curation alone would not have bumped it).

## Round-13 calibration (2026-07-30, tight stop caps)

`maxStopAtrMultiplier` grids per class at full depth, walked through
three probe waves because every class kept winning at its grid's tight
edge (the monotone-edge rule fired twice). Both-splits gate at every
step; each config compared on its own accepted population.

| Class | Shipped | Final | Test delta (R) | Test money-positive |
| --- | --- | --- | --- | --- |
| Forex | 2.2 | **1.4** | +0.054 | 74.9% → 78.3% |
| Futures | 2.2 | **1.4** | +0.075 | 66.7% → 70.6% |
| Metals | 2.4 | **1.6** | +0.055 | 69.4% → 72.2% |
| Crypto | 2.8 | **1.8** | +0.059 | 70.2% → 74.9% |
| Energies | 2.4 | 2.4 | every variant fails | unchanged |

Mechanism, honestly stated: a tighter cap shrinks the risk denominator,
which raises reward-to-risk — more candidates clear the payoff gate
(accepted populations grew every wave) and each win pays more R, so
R-expectancy alone could inflate on arithmetic. The gate did not rest on
that number: the money-positive rate — which has no denominator — rose
on the test split in every class at every wave, and the filled-only
test-split rates in the reliability table rose too (forex .84→.88,
futures .77→.81, metals .78→.84, crypto .78→.83). Improvement stopped
being probed, not being found: per the standing stop-rule the round
ships the best measured set after the committed final wave.

Per-symbol notes:
- **XAGUSD's loose-stop override (2.8) is deleted** — silver alone
  passes the metals 1.6 cap emphatically (train +0.100R, test +0.071R).
- **NGUSD produced zero accepted setups** in the full-history replay
  under every variant including baseline — its override is inert and
  untestable; kept unchanged pending an acceptance audit. HGUSD shows
  the same drought (zero emitted records all waves).
- **Oil needs no stop exception**: BZ/CL pass 1.4 inside the futures
  class (test +0.035R), unlike their tp1/runner behavior in r10/r11.

Open question the round could not answer from existing emits: how often
the cap now BINDS (overrides the pivot-anchored stop). At these caps the
ladder may be predominantly ATR-stopped rather than structure-stopped —
fine if true, but it should be measured, not assumed. Cap-binding
instrumentation is the leading next-round lever.

Version `2026.07.30.tight-stop-caps`. Reliability table re-based on the
final-config replay (test split, filled setups, `tp1_partial` counted by
ladder accounting as always).

## Round-14 instrumentation (2026-07-30, stop provenance + acceptance audit)

Round 13 ended with an open question: at these caps, does the pivot still
anchor stops, or has the cap become the stop? Round 14 instruments instead
of guessing. `buildPricePlan` now classifies every stop's provenance —
`pivot` (structure won), `volatility_floor` (the 1.25-ATR minimum width or
the no-pivot buffer), or `cap` (the class ceiling clipped structure) — and
the fact flows to the live setup's `risk_model` and every replay record.
The sweep also attributes acceptance rejections to the exact failing gate
(`belowConfidence` / `belowPayoff` / `regimeGated`) and prints all gate
columns.

Measured at shipped config, full history, accepted setups:

| Class | Cap-bound | Pivot | Floor | expR cap vs pivot |
| --- | --- | --- | --- | --- |
| Futures | 97.1% | 2.2% | 0.7% | 0.146 vs 0.157 |
| Metals | 87.4% | 12.1% | 0.5% | 0.147 vs 0.097 |
| Forex | 84.5% | 9.7% | 5.7% | 0.167 vs 0.170 |
| Crypto | 80.9% | 18.8% | 0.3% | 0.113 vs 0.133 |
| Energies | 67.1% | 30.2% | 2.7% | 0.027 vs 0.072 |
| Indices | 67.0% | 30.6% | 2.5% | −0.055 vs 0.101 |

The honest reading: **the model is now an ATR-stop model with a structural
override in a minority of cases**, and that is fine — provenance parity
holds where it matters (forex within 0.003R; metals prefers the cap;
crypto's pivot edge is modest). The two classes with real structure
preference are exactly the two that rejected tighter caps: energies (kept
2.4) and no-edge indices. Round 13's ship stands validated post-hoc, and
the geometry section's framing is updated by this table rather than by
assumption. Live setups now accrue provenance in the cohort, so a future
round can condition on it with production evidence.

Acceptance audit: NGUSD and HGUSD produced **zero accepted setups across
full history** — not one dominant gate but distributed starvation (NGUSD
train, of 2,427 decisions: 699 session-blocked, 415 regime-blocked, 419
plan-rejected, 565 below confidence even at its lowered 70 threshold, 235
below payoff). Both symbols joined `scanDeprioritizedSymbols`: the default
scan stops spending review slots on guaranteed nothing, while individual
review and explicit group scans keep them reachable. NGUSD's inert
calibration override stays, documented, pending live-cohort evidence.

No `ANALYZER_VERSION` bump: provenance recording and scan curation change
no setup construction (R12 precedent). Next lever identified: per-class
session-hour curves at full depth — the 12:00–18:00 UTC gate was validated
once at 1,200 days for crypto/futures only; full-history per-hour curves
across all classes can close more dead windows (or reopen wrong ones)
under the same both-splits gate.

## Round-15 calibration (2026-07-30, session-hour curves + the measured menu)

Per-class per-UTC-hour expectancy curves at full depth (from the r14
baseline emits — 238k accepted records with timestamps):

- **Forex, futures, crypto, metals: no hour is negative on both splits.**
  The existing 12–18 UTC gates show up as the absent rows they created;
  nothing new closes, nothing wrongly-closed reopens. A null result,
  honestly earned.
- **Energies: six hours fail both splits** ({03,04,12,15,19,21} UTC).
  Excluding them lifts the class from +0.036/+0.041R to **+0.079/+0.081R**
  per accepted setup (the R12 arithmetic method: hour blocks only subtract
  records). Shipped as the energies low-edge hour set; the energies
  reliability row improves to 0.60/474 and sheds its weak-record caution.
- Indices' 09:00 both-negative hour is moot — see below.

**The curation re-derivation and the measured menu.** The r3/r4-era scan
exclusions (CHF-quote pairs, AUDCAD/AUDUSD/GBPAUD/GBPJPY, alt crypto) were
verdicts on the pre-r8 geometry. Re-derived at full depth under the current
model, **every one measures both-splits positive** (e.g. AUDCAD +0.174
train/+0.169 test, 79% money-positive) — all fourteen return to the default
scan. Only BNBUSD stays deprioritized (split disagreement). This is the
reintroduction path working exactly as designed.

The curation policy, stated durably (owner directive, r15):

1. **Identities are permanent.** Symbol names, display labels, and chart
   sources are byte-preserved from the E8-aligned build (verified against
   the pre-round commit); exclusions are separate sets layered on top.
   Nothing is ever deleted from the map.
2. **Everything stays under analysis forever.** The replay universe is the
   full symbol map — excluded assets included — and FMP history accrues
   for all of it regardless of user activity. Every calibration round
   re-derives the verdicts; today fourteen symbols came back by exactly
   that mechanism.
3. **Three visibility tiers.** `scanDeprioritizedSymbols` (out of the
   default scan only; group scans and individual review unchanged — today:
   BNBUSD). `noTradeSymbols` (the evidence clearly says no: no scan path
   AND setup generation refused server-side with a plain reason — today:
   the five cash indices, NGUSD, HGUSD). Everything else: fully live.
4. **No-trade is enforced at the server**, not the UI: the advisor's
   market list simply omits these markets, and the analyzer refuses them
   even if asked directly. Past setups on them remain visible in history —
   history is history.

Version `2026.07.30.measured-menu` (the generation refusal and the
energies hour gate both change setup construction).

## Round-16 calibration (2026-07-30, the committee-weight audit)

The eight-method committee's hand-set per-class weights — untouched since
inception, the largest untested surface left — got the full treatment:
per-method votes now ride every replay record (`votes: [{n,d,s}]`,
mirroring the r14 provenance pattern), and per-method vote-vs-outcome
curves were derived per class at full depth (238k accepted records).

The curves themselves: mostly flat. Among accepted setups, whether a
method voted with the taken side barely predicts outcome — the method-
level echo of round-3b's "score-expectancy curves are flat." A few
spreads were consistent on both splits (forex volume-profile positive,
forex momentum/multi-timeframe negative, metals momentum positive), so
conservative weight nudges became candidates — with the derivation
itself flagging the collider risk: conditional-on-acceptance spreads
are not causal weights.

The full A/B (candidate weights vs same-cache baseline, each config's
own accepted population) returned the honest verdict: **forex
−0.000/−0.000, futures +0.001/−0.000, crypto −0.002/−0.001 — fail;
metals +0.001/+0.002 — nominally positive but noise-scale**, an order
of magnitude below any prior ship. Round-3 precedent applied: every
weight change reverted, metals included. The hand-set weights are
approximately optimal at this selectivity; the acceptance gates already
extract what the committee knows.

What ships: the vote instrumentation (permanent — every future round
can condition on committee composition for free) and this null, which
retires speculative re-weighting as a lever. No `ANALYZER_VERSION`
bump (emit-only change). Next lever identified: **entry-offset grids**
(`entryOffsetDefault` / `entryOffsetTrend`) — core geometry that sets
fill rate and entry quality, never swept at any depth, and directly
grid-sweepable with the standard machinery.

### Round-16 menu amendment (owner directive) and the clean slate

The menu is binary now. BNBUSD's mixed record (train −0.030 / test
+0.099, split disagreement) does not meet the provable bar — it joined
the no-trade list and the "deprioritized" middle tier was retired: a
market is measured-in or fully out. With the menu settled, all user
trade history reset (`20260730070000_clean_slate_binary_menu.sql`,
mirroring the round-2 precedent: setups, outcomes, learned weightings)
so every user's record starts on the current engine, and all sessions
were revoked in the same migration — refresh stops immediately, access
tokens age out within the hour, everyone re-enters through a fresh
sign-in. Profiles and preferences untouched. Version
`2026.07.30.binary-menu`.

## Round-17 calibration (2026-07-30, patient entries)

The last unswept core-geometry knobs: the entry offsets that set how far
from the market the limit order waits. Three grid waves per knob per
class at full depth, then a combined confirmation run.

**Default offsets** (non-trend regimes): shallower failed everywhere;
crypto and metals found interior peaks — 0.62 → **0.78** and 0.6 →
**0.75** (each beats both its neighbors on both splits; the 0.9 probes
turn down). Forex's deeper candidate was noise (+0.0003 test) and
futures/energies rejected change — all three keep their values.

**Trend offsets** — the round's finding. The design premise said trends
deserve entries closer to the market (0.42-0.5 vs 0.55-0.62 defaults).
The measurement says the opposite: every traded class wants MORE
patience in trends, and by wide margins:

| Class | Trend offset | Test delta (R) |
| --- | --- | --- |
| Forex | 0.42 → **0.55** | +0.016 (statistical tie with 0.7; less extreme wins) |
| Futures | 0.46 → **0.75** | +0.038 |
| Metals | 0.48 → **0.78** | +0.034 |
| Crypto | 0.5 → **0.8** | +0.027 |
| Energies | 0.48 unchanged | both candidates fail |

Futures and crypto were still rising at their final probes; the
standing stop-rule shipped best-measured rather than chasing (ledgered
for a future revisit with fresh eyes, not micro-iteration).

**Combined confirmation** (all winners at once vs the same-cache
baseline): every class passes with deltas matching the sum of the
separately-measured effects — crypto to the third decimal — and
untouched energies came back byte-identical, proving both the
disjoint-regime partition argument and the drift-free cache. Final
test expectancies per accepted setup: forex **0.191**, futures
**0.189**, metals **0.172**, crypto **0.155**. Reliability table
re-based (test split, filled): forex .89/63,118, metals .89/981,
crypto .87/6,106, futures .83/2,368.

Version `2026.07.30.patient-entries`. Same round, the research
infrastructure hardened: the calibration cache became durable and
incremental (`scripts/calibrationCache.ts` rolling stores, anchor pins
for drift-free same-day A/B, legacy seeding verified byte-identical)
and tops itself up daily under launchd (`--warm-only` +
`scripts/ops/daily-cache-topup.sh`) — cold mornings retired.

Next lever identified: **confidence-threshold curves re-derived under
the current engine.** The confidence gate rejects more candidates than
every other gate combined (e.g. gold: 6,661 of 11,193 train decisions),
and its thresholds predate the entire r8-r17 rebuild — the r15
curation re-derivation proved old-geometry verdicts can flip wholesale.
The r17 emits make the curves free to derive; if the score ranks
outcomes under the new geometry, thresholds become a validated lever in
either direction.

## Round-18 calibration (2026-07-30, earned confidence)

The confidence gate — the engine's largest filter — audited under the
rebuilt engine, with capture-all curves isolating the score dimension
(records clearing the payoff and regime gates, bucketed by score band,
both splits). The verdict differs by class, so the treatment does too:

- **Metals: the score earned meaning.** Expectancy rises monotonically
  by band (0.131/0.119 below 60 → 0.196/0.189 at 90+) — the rebuilt
  engine gave metals' score genuine ranking power the old engine never
  had. Threshold 82 → **90** (+0.033 train / +0.018 test, money-positive
  75.2%, samples healthy at 447/540); 95 collapses acceptance (0 train /
  53 test) and is rejected. Metals confidence tiers now describe
  measured quality differences.
- **Forex: the score still ranks nothing** — every band flat, including
  the 117k-record sub-60 band the gate was rejecting at identical
  quality. The old threshold was pure volume tax. Pre-registered rule
  (equal quality: test expectancy within ±0.005, volume +≥25%,
  money-positive within 1pt) passed at both probes; the less-extreme
  candidate ships: 66 → **55**, +44% accepted volume at unchanged
  per-setup quality (the 40 probe, +95% volume at −0.0006, is ledgered
  for a future step). The r6-era EURGBP/EURJPY raises to 82 delete —
  their evidentiary basis dissolved under the new engine and both
  measured fine at 55 in-run.
- **Energies: the gate works** — the sub-60 band is genuinely negative
  (−0.022/−0.027, 47% positive). Unchanged.
- **Futures and crypto: no clean structure** — noisy-flat curves, no
  candidates, documented rather than tuned.

Reliability re-based where populations changed: forex .89 across
**90,907** test setups (the rate held while the sample grew 44% — the
volume claim in user-facing form), metals **.90/453**. Version
`2026.07.30.earned-confidence`.

Next lever identified: **review-window grids** (`defaultReviewHours`) —
the window every geometry scale derives from
(`expectedWindowMove = dailyATR × sqrt(reviewHours/24)`), per-class
values never swept at any depth, directly grid-sweepable.

## Round-19 calibration (2026-07-30, review windows)

The review window (`defaultReviewHours`) — the horizon every geometry
scale derives from (`expectedWindowMove = dailyATR × sqrt(reviewHours/24)`)
and the deadline the window-feasibility model enforces — swept per class
for the first time at full depth, two probe waves (A: one step shorter and
one longer than shipped; B: one further edge probe where A improved).
Because the window feeds the feasibility gate, shorter windows make the
engine pickier: acceptance falls and the question is whether per-setup
quality rises enough on both splits to justify it.

- **Metals: 8 → 4.** Monotone through both waves (5h: +0.010/+0.004;
  4h: **+0.0147 train / +0.0089 test**, money-positive 75.2 → 76.3%,
  volume −14.8%). The stop rule ships the best measured value after the
  committed probe wave.
- **Energies: 6 → 3.** The largest both-splits gain of the round
  (4h: +0.010/+0.033; 3h: **+0.0385 train / +0.0451 test** — test
  expectancy 0.081 → 0.126, +56% relative). Volume −43.8% is the price
  of a class whose edge lives in its first hours; the class keeps its
  low-edge hour gates on top.
- **Forex: keep 8.** Both probes pass the formal gate but the test gains
  (+0.002 at 5h, +0.0036 at 4h) sit inside the ±0.005 noise band while
  volume collapses (−27%, then −41%). A noise-level per-setup gain does
  not buy 41% of the flagship class's accepted volume.
- **Crypto: keep 12.** The 8h candidate was thin (+0.0013/+0.0033,
  BNB excluded to match the tradable menu) and the committed 6h probe
  breaks the train split (−0.0013) — the trend is noise, not structure.
  16h also fails. No change.
- **Futures: keep 6.** Wave A (4h/9h) produced no both-splits
  improvement; no wave B.

Reliability re-based where windows changed: metals **.90/389** (rate
held on the smaller, stricter population), energies **.60 → .62/265**.
Version `2026.07.30.review-windows`.

Next lever identified: **ladder-geometry re-probe under the new
windows**. The window change rescales every derived geometry quantity
for metals and energies (`expectedWindowMove` shrank by √2 and √2
respectively), and the tp1/runner/stop multipliers were last derived
under the old 8h/6h horizons. Re-probing geometry for the two changed
classes is the direct follow-through; the unchanged classes' geometry
remains valid.

**Correction (Round 20, same day): this round's shipped changes were
reverted.** The grid variants were measured through a harness defect —
see Round 20. The honest full-depth verdict is that 4h/3h windows are
worse than 8h/6h on both splits for both classes. The keep decisions
(forex, crypto, futures) survive: their variants were inflated by the
same defect and still failed to clear the bar.

## Round-20 calibration (2026-07-30, the window-grid artifact)

Round 20 opened as the ladder-geometry re-probe under the new windows and
instead caught its own premise. The geometry baselines would not
reproduce Round 19's winning-variant numbers on what should have been the
same population — identical acceptance counts (metals 382/460), identical
pinned bars (no cache file written between the runs), yet 85 of 842
records carried different realized outcomes, scattered across 2013–2014
rather than clustered at the data tail. Outcome flips ran one way:
`tp1_partial → unfilled`, `take_profit → tp1_partial`.

Root cause: **grid variants of `defaultReviewHours` never reached outcome
resolution.** `simulateSymbol` merges the variant into the calibration
object used for setup construction, but `evaluateSetupOutcome` derived
its expiry from `getSetupExpiryTime`, which reads the calibration module
directly. A window variant therefore built short-window geometry and then
granted it the file's longer window to resolve — systematically inflating
every shortened-window variant. Round 19 was the first grid ever run on a
resolution-time knob, which is why eleven prior rounds of
construction-time grids (thresholds, offsets, geometry, caps) never
tripped it; their knobs are fully consumed before acceptance.

The clean measurements existed on both sides of the ship: Round 19's own
baselines (file at 8h/6h) and Round 20's baselines (file at 4h/3h), taken
on byte-identical pinned bars. Honest verdict, both splits, full depth:

- **Metals: 8h wins.** True 4h 0.1894/0.1463 vs true 8h 0.1932/0.1894 —
  the shipped change cost −0.043 test expectancy.
- **Energies: 6h wins.** True 3h 0.0474/0.0467 vs true 6h 0.0793/0.0808 —
  worse on both splits.

Shipped in response: `evaluateSetupOutcome` and `getSetupExpiryTime`
accept a review-hours override and the sweep passes its variant value —
with a regression test that resolves the same setup under both windows
and demands different outcomes. Calibration reverted to metals 8h /
energies 6h, UI mirror and reliability rows restored (metals .90/453,
energies .60/474), version `2026.07.30.windows-restored`. The wave-A
geometry grids run before the discovery were discarded: internally
consistent, but measured under windows that were about to revert.

Method lesson, stated durably: **a new grid key is only trustworthy after
its variant machinery is validated — reproduce one variant as a
file-edit baseline and demand matching numbers before reading the grid.**
Cross-run baseline reconciliation (this round's accidental control) is
now part of the round template: when a new round's baseline disagrees
with the prior round's shipped-variant numbers beyond noise, stop and
reconcile before interpreting anything.

Next lever identified: **the ladder-geometry re-probe is moot** — the
windows are back on the basis under which geometry was derived
(rounds 8–13). The next standing candidates: (a) the r18-ledgered forex
threshold-40 probe (+95% accepted volume at −0.0006 test, a pure volume
lever awaiting a product decision); (b) full-depth session-hour curves
for crypto/futures beyond the single 12–18 UTC gate; (c) news-conditioned
acceptance (the r6 curiosity that penalized-but-accepted setups
outperform, never re-examined at full depth).

## Round-21 calibration (2026-07-30, the forty gate)

The r18-ledgered forex threshold-40 candidate, confirmed on fresh caches
under the restored windows and shipped. Within-run A/B against the
shipped 55: train −0.0004, test +0.0001, money-positive 78.6 → 78.7%,
accepted volume **+35.5%** — roughly 49,000 more accepted test setups at
statistically identical per-setup quality. The reliability row re-based:
forex **.89 across 123,254** filled test setups (the rate held while the
sample grew 36%). Version `2026.07.30.forex-gate-forty` (superseded by
`2026.08.01.scan-only-door`, which changed the learning cohort and no
measurement above).

Two process notes, recorded in the open:

- **This round's own pre-registration contained a derivation error.** It
  demanded ≥+50% volume, citing r18's "+95%" — but that figure measured
  40 against the old 66 gate; r18's own curve arithmetic predicts
  40-vs-55 at +35.4%, and the fresh run measured +35.5%. The decision
  therefore rode on r18's elder pre-registered equal-quality rule
  (quality within ±0.005 both splits, volume ≥+25%, money-positive
  within 1pt — all pass), not on a bar amended after the results. When a
  registration is discovered to contradict the evidence it cites, the
  correction is documented, never silently applied.
- **The UTC-midnight anchor hazard.** The runs straddled 00:00 UTC, so
  12 of 28 symbols re-anchored mid-run to the new day (fresh top-up,
  re-phased fold boundaries) while 16 stayed on the prior pin. Harmless
  within-run — every A/B compares identical folds on an identical data
  view per symbol, and record-level reconciliation found **zero**
  outcome discrepancies on shared records — but cross-run baseline
  comparisons wobble when anchors mix. Standing rule: launch sweeps
  clear of the UTC rollover, and reconcile cross-run numbers only
  between same-anchor runs.

Next lever identified: **full-depth session-hour curves for crypto and
futures** — their only session gating is the single 12–18 UTC block
validated at 1,200-day depth in round 4; round 15 proved full-depth
per-hour curves can both validate existing gates (as absent rows) and
find real ones (energies' six blocked hours). The same emit-driven
method applies directly.

## Round-22 calibration (2026-07-30, session hours at full depth)

The 12–18 UTC gates on crypto and futures — the engine's shallowest
evidence, validated once at 1,200 days in round 4 — re-derived at full
depth. Doing it required instrumentation the harness never had: the
low-edge gates block like market closures, so their hours were invisible
to every sweep. `SessionContext.lowEdge` now marks measurement-only
gates and the sweep's `--ignore-low-edge` flag sees through them —
block bypassed AND penalty neutralized (the first run caught that the
penalty alone re-hid the hours at the confidence gate: sessionBlocked 0,
belowConfidence +5,451). Hard closures are never bypassed, by test.

Full-depth per-hour curves, both splits, every hour visible:

- **Futures: the gate is emphatically validated.** Hours 12–17 are the
  weakest stretch of the day (test hours 16 and 17 negative at −0.007
  and −0.028); removing the gate costs **−0.022 train / −0.027 test**
  in aggregate. Keep, unchanged.
- **Crypto: the gate is retained, but its story changed.** At full depth
  the gated hours are no longer negative (the r4 finding at 1,200d) —
  they are positive but dilutive: ungating adds +33% accepted volume at
  train +0.002 / test **−0.008**, failing the both-splits bar. The gate
  survives as a net-quality filter, and the user-facing refusal reason
  now says exactly that ("run well below every other hour") instead of
  the no-longer-true "were negative."
- **No new low-edge hours in either class** — zero negative-both buckets
  outside the gated window, matching r15's null for forex, futures,
  crypto, and metals open hours.

No calibration values change; the ships are the instrumentation and the
honest copy. This is the second consecutive validation round.

Next lever identified: **news-conditioned acceptance** — the round-6
curiosity (news-penalized-but-accepted setups slightly outperformed
clean ones on train) is the last substantive untested question in the
replay data. Full-depth, both-splits examination of expectancy
conditioned on news-penalty presence decides whether the penalty gates
are calibrated, inverted, or inert. Per the owner's stopping rule: if it
returns a null like this round did, the replay well is dry and the
natural stopping point is reached — the engine then rests until
genuinely new data exists (live cohort outcomes foremost).

## Round-23 calibration (2026-07-30, news-conditioned acceptance — the closing null)

The round-6 curiosity — news-penalized-but-accepted setups slightly
outperforming clean ones — examined at full depth, in two phases.

Phase 1 (conditioning, existing emits): forex null (+0.0008/+0.0003),
metals and energies sign-flip between splits (null, thin samples), but
crypto (+0.016/+0.014) and futures (+0.038/+0.012) show
penalized-beats-clean on both splits with healthy samples.

Phase 2 (the deciding A/B, per round 16's collider rule — conditioning
suggests, only an experiment decides): `maxNewsPenalty` gridded to 0 and
half-current for both classes. **Complete null.** Removing the penalty
entirely admits only +1.1% volume (crypto) and +3.0% (futures) at
flat-to-negative deltas; every variant fails the both-splits gate. The
conditional spread was selection, not signal: setups that clear the same
acceptance bar carrying a penalty are simply stronger underneath —
the collider mechanism, now confirmed by experiment rather than
inferred. The news penalties stay exactly as calibrated.

## The stopping point (declared 2026-07-30)

Round 23 closes the last substantive untested question in the replay
data, and it is the third consecutive round without a both-splits
improvement (r21 confirmed a ledgered volume lever; r22 validated
existing gates; r23 is a null). Per the owner's standing rule — no
change for its own sake; declare diminished returns when the well is
dry — **the calibration arc stops here.**

The engine rests at its measured best: test-split money-positive rates
of forex .89/123,254, metals .90/453, futures .83/2,368, crypto
.87/6,106, energies .60/474, with per-class geometry, thresholds, entry
offsets, review windows, stop caps, session gates, news rules, and
curation each derived at full depth under the walk-forward both-splits
gate across 23 rounds.

What reopens the work, in order of expected value:

1. **Live cohort outcomes** under the current version — the learning
   loop and Insights record accrue them continuously, and the Desk
   build's scan-path persistence multiplies the accrual rate the day it
   ships. A cohort large enough to condition on is the single dataset
   this arc never had.
2. **New provider history** — the daily cache top-up keeps the replay
   basis rolling forward; a future season of data supports a
   re-validation pass (the r22 method makes any gate re-derivable).
3. **New markets or brokers** — per-broker calibration is a declared
   product direction and would restart derivation on a new basis, not
   re-tune this one.

Until one of those exists, further grids would be curve-polishing, and
the honest recommendation is none.

## Confirmed provider history depth (measured 2026-07-29)

Replay depth is **discovered per symbol at run time**, not configured: the
fetcher walks backward in 30-day windows until three consecutive windows come
back empty, which is the end of that symbol's history. The window therefore
rolls forward automatically with every run, and the safety ceiling
(`MAX_DEPTH_DAYS`) sits above every real floor so it never binds.

| Market group | History begins | Approx. days |
| --- | --- | --- |
| Forex (all 28 pairs) | 2010-01 | ~6,050 |
| XAUUSD | 2013-07 | ~4,760 |
| SP (`^GSPC`) | 2020-02 | ~2,350 |
| NSDQ (`^NDX`) | 2020-08 | ~2,175 |
| Crypto, XAGUSD | 2023-04 / 2023-08 | ~1,060–1,200 |
| CME futures, DOW, DAX, NIKKEI | 2023-09 / 2023-10 | ~1,031–1,038 |

CFTC positioning (COT) reports are available weekly from 2010, deeper than
the deepest intraday series, so every replay decision point can carry a real
positioning percentile.

## Cohorts

`ANALYZER_VERSION` scopes global learning. Global learning reads every
measured outcome, whichever door generated the setup: spec §17m made the
Scan column the only door, and a review-origin-only cohort would have
frozen the weights permanently. `origin` is historical bookkeeping and
nothing more: every row written since §17m.1 says `scan`, no code reads the
column, and the Current-trades rail derives Pending from status and outcome
alone (`src/lib/tradeState.ts`).

The cohort is production traffic only. The e2e suite scans the live project
on every push to main, and global learning reads outcomes with no user
filter, so those rows would otherwise train the weights and count toward the
trigger below — from a run schedule clustered in the owner's working hours,
inside a model whose per-hour gates were the arc's most contested finding.
`tests/e2e/authenticated-workspace.spec.ts` deletes the setups each run
created, through the test user's own JWT, and logs the count; outcomes
cascade with them. Any change to setup construction, scoring,
calibration, or outcome evaluation must bump the version — and so must a
change to the learning population itself, which is why widening the cohort
moved it to `2026.08.01.scan-only-door` even though no geometry changed.
History was reset at the window-feasible model's deploy (migration
`20260728220000_reset_history_for_window_feasible_model.sql`) because
pre-fix outcomes measured an unreachable geometry, not market skill; the
launch runbook cleared it again on 2026-08-01 (§17l), so the cohort this
version scopes starts empty by design.

## Round-24 calibration (2026-08-05, the execution-cost scale defect)

The refinement cycle's first shipped finding, and it is a defect rather than
a tuning result. `executionQuality.ts` floored spread, slippage, and ATR at a
per-class `minimumCost` expressed as an **absolute price increment** —
futures and indices carried `0.01`. E8's futures program spans natural gas
near 2.67 to the E-mini S&P near 7752, a 2,900x range, so no single absolute
constant can be right across it. At the bottom of the range the guard became
the governing term.

Measured, with gross reward:risk held at exactly 2.0 by construction:

| instrument | price | risk | modeled cost | cost/risk | effective RR |
|---|---|---|---|---|---|
| natural gas | 2.67 | 0.0154 | 0.0300 | 1.95 | 0.018 |
| copper | 6.73 | 0.0168 | 0.0300 | 1.79 | 0.077 |
| 10-year note | 108.89 | 0.0630 | 0.0327 | 0.52 | 0.976 |
| bond | 110.06 | 0.1176 | 0.0330 | 0.28 | 1.342 |
| E-mini S&P | 7752 | 12.60 | 2.3256 | 0.19 | 1.533 |

The cost was identical (0.0300) for gas and copper — the floor ignores price
and ATR entirely. Consequences, verified against the emitted corpus:

- HGUSD cleared reward:risk 1.25 in **0 of 2304** replayed setups (max 0.956).
- NGUSD in **0 of 1689** (max 1.140).
- ZNUSD was throttled to 136 filled against ZBUSD's 1540.
- NGUSD's own `maxStopAtrMultiplier: 2.8` override, written to accommodate
  gas's volatility, doubled its risk and so guaranteed the disqualification
  it was meant to relieve. Its "currently inert and untestable" comment was
  describing this defect without naming it.

Fix: `minimumCost` is removed from the class profiles and replaced by a
single documented `COST_EPSILON = 1e-9` divide-by-zero guard. Cost is already
modeled two market-specific ways — basis points of price, and a fraction of
ATR — and the guard may never outrank either.

Result on the same pinned bars (train / test):

| market | before | after | hit | stop |
|---|---|---|---|---|
| HGUSD copper | 0 accepted | 403 / 317 | 70% / 84% | 1% / 3% |
| NGUSD gas | 0 accepted | 305 / 209 | 64% / 69% | 30% / 27% |
| ZNUSD note | 136 filled | 111 / 15 | 78% / 82% | 10% / 9% |
| ZBUSD bond | — | 416 / 257 | 83% / 87% | 9% / 8% |

Expectancy: copper **+0.210 / +0.241** (both splits, strongly positive — it
now ranks among the best markets Levelflow analyzes, and was invisible
before). Bond +0.221 / +0.220. Note +0.217 / +0.143 but starved: its
cost-to-risk is a legitimate ~0.52 because 1.4 bps of 108.89 is 0.0152,
within rounding of ZN's real one-tick spread (1/64), and a 15-minute-ATR stop
sits only ~4 spreads away. That is a geometry question for ZN's own
calibration, never something to fix by understating cost — pinned as such in
`tests/executionQuality.test.ts`. Gas -0.084 / +0.001: no demonstrated edge,
now honestly measurable rather than structurally silenced.

The fix is a no-op wherever the bps or ATR term already outranked 0.01 — the
E-mini prices bit-identically before and after, pinned as a regression guard.
Scale invariance is the invariant now enforced: two contracts with the same
price:ATR ratio must be charged the same cost-to-risk regardless of where the
decimal point sits. Before the fix, copper and a synthetic contract 1000x its
price were charged 1.786 and 0.120.


## Round-25 (2026-08-06) — the stop cap, and the harness's resolution ceiling

Stop caps derived per class from a 102-market grid read by TOTAL R across both
splits. Six classes tightened to 1.0, metals held at 1.6, indices loosened to 3.0.
Total test R: forex +30457 -> +49828, crypto +3627 -> +4375, futures +855 ->
+1260, agriculture +161 -> +194, energies +58 -> +119, livestock +1.4 -> +27.8,
indices -32.4 -> -5.6 (still negative, still withheld).

### Why tighter is better, and why it is not a denominator trick

TP1 scales with risk, but the runner is capped by the review window in ABSOLUTE
terms. A tighter stop therefore puts the runner further away IN R, and winners pay
more. Under fixed-fractional sizing — position scales inversely with stop distance
— a 2R win is genuinely twice the dollars of a 1R win, so the gain is real.
Confirmed on behaviour rather than totals: EURUSD's stop rate FALLS 6% -> 4% and
its setup count RISES 5947 -> 6259, because a nearer TP1 banks the partial before
the stop is reached.

### The resolution ceiling — an apparent 60% gain DECLINED

A follow-up probe found the improvement monotone below 1.0: forex test R 5157
(1.4) -> 7479 (1.0) -> 8565 (0.85) -> 9805 (0.7) -> 12012 (0.5). It was not
shipped, and the reason is a limit of the harness rather than a property of the
market.

A stop half as far should be hit MORE often. It is not: EURUSD's stop rate is 6%
at 1.4 and 7% at 0.5, essentially flat, while expectancy nearly triples. What
actually rises is the share of setups ending in NEITHER a target nor a stop:

| stop cap | unresolved share (EURUSD) | (ESUSD) |
|---|---|---|
| 1.4 | 6% | 12% |
| 1.0 | 10% | 15% |
| 0.85 | 13% | 17% |
| 0.7 | 18% | 20% |
| 0.5 | **26%** | **26%** |

At a quarter unresolved, the expectancy figure reports how `evaluateSetupOutcome`
treats expiry and ambiguity, not how the market behaved. The replay resolves
outcomes from 15-minute bar extremes and cannot order intrabar events, and a stop
that close to the entry makes that ordering decisive far more often.

**The rule: 1.0 is the tightest stop cap this harness can adjudicate.** Going
below it requires finer bars or an explicit intrabar model, not a grid. Anything
past 1.0 should be treated as unmeasured until one of those exists.

## Round-26 (2026-08-06) — the runner ceiling, re-derived because the stop moved

Runner ceilings derived per class from a 1,020-row grid, read by TOTAL R across
both splits. Five classes moved; three held.

| class | ceiling | test R before | after |
|---|---|---|---|
| forex | 0.6 → **1.0** | +49828 | **+54316** |
| futures | 0.6 → **1.0** | +1267 | **+1317** |
| crypto | 0.8 → **1.0** | +4375 | **+4377** |
| agriculture | 0.8 → **1.4** | +56.6 | **+62.7** |
| indices | 1.1 → **1.0** | −5.6 | **+7.4** |
| energies / livestock / metals | held | — | nothing improved both splits |

### Why this grid had to be run twice

The first runner grid ran at the OLD stop caps. Tightening the stop shrinks risk,
and the runner's minimum distance is derived from risk through
`minimumTargetRewardRisk` — so the set of structural levels that qualify as
reachable changes when the stop changes. The two levers are not independent.

The pre-stop-cap grid named 1.4 the best futures ceiling. At the shipped caps it
is 1.0. Had the first result been applied, the engine would carry a ceiling
derived for a configuration that no longer exists. **Any lever downstream of risk
must be re-derived after the stop cap moves** — that now applies to the runner
ceiling and to TP1's ATR floor.

### Indices turn positive — and what that does NOT yet establish

The indices class posts positive total R on both splits for the first time since
r12: train +25.3, test +7.4, from −32.4/−5.6 at the start of the night. Nothing
about the markets changed. What changed is a stop cap that was clipping
structural stops and a runner ceiling set for a different stop — both ours.
This is the stop-provenance split's prediction confirmed, and precisely the
failure amendment 25 now guards against.

It does not reopen the cash indices, and the final sweep settled why — see
round 27. Two claims written here first were wrong or incomplete:

1. ~~The rollup mixes traded index futures with the withheld cash CFDs.~~
   **FALSE.** The `indices` class is cash-only: SP, NSDQ, DOW, NIKKEI, DAX, ASX.
   The index FUTURES — ESUSD, NQUSD, YMUSD, RTYUSD — classify as `futures`. So
   the entire +7.4 came from the cash indices, with nothing else mixed in.
2. **r12 excluded them on ranking, not on expectancy.** Still true, and the
   final sweep confirms it holds engine-wide rather than for indices alone.

Correcting (1) makes the conclusion stronger, not weaker. The class's positive
total R was earned entirely by markets whose geometry stage rejects 55-70% of
the decisions reaching it — DOW survives 30%, SP 37%, NIKKEI 38%, NSDQ 38%,
ASX 40%, DAX 45%. Amendment 25 is explicit that a starved sample yields no
verdict, and it does not carve out favourable ones. The number is not evidence
of edge; it is another measurement of our own parameters.

`noTradeSymbols` shrinks the round the evidence flips, exactly as it did for
fourteen symbols in r15 — but the evidence has to be about the symbols, and this
is not yet about the symbols.


## Round-27 (2026-08-06) — the final sweep, and every confidence floor re-derived

One run at the shipped geometry: 102 markets, 1,020,464 setups, 776,531 of them
clearing the payoff and regime gates. Every per-class confidence floor was
re-derived from it. The old values were set before the execution-cost and
stop-cap defects were found, so they were gating against expectancy curves the
engine no longer produces.

| class | was | now | evidence at the floor |
|---|---|---|---|
| crypto | 82 | **25** | test E +0.204, 704 test fills |
| forex | 40 | **20** | test E +0.298, 479 test fills |
| futures | 68 | **25** | test E +0.218, 145 test fills |
| metals | 90 | **30** | test E +0.185, 101 test fills |
| energies | 69 | **85** | test E +0.308, 122 test fills |
| livestock | 30 | **40** | test E +0.264, 42 test fills |
| agriculture | 30 | **30** | HELD — no floor survives |
| indices | 68 | **68** | HELD — starved sample, amendment 25 |

Four classes drop by 40 to 65 points. Energies moves the other way: its band-80
bucket is −0.002, which holds the floor up at 85.

### The sample guard

Forex derived a floor of 15 and crypto 20, each resting on 32 to 42 test fills.
Both were raised one bucket, to 20 (479 fills) and 25 (704). Shipping a
class-wide gate off 32 fills is the fragility amendment 25 exists to prevent,
and the cost is nil — forex's band-15 bucket is 42 fills out of 452,565, under a
hundredth of a percent of volume.

The guard only ever TIGHTENS. Raising the judgeable minimum outright was
considered and rejected: it would also silence thin NEGATIVE buckets, and
energies' floor would have fallen from 85 to 75 by ignoring a −0.002 reading on
69 fills. A robustness rule that can loosen a gate is not a robustness rule.

### Confidence does not rank outcomes anywhere

The finding r12 recorded for indices is engine-wide. Forex test expectancy is
+0.349 at band 15, +0.288 at 25, +0.277 at 30, +0.289 at 85, +0.317 at 95 —
flat across the whole range. Crypto sits at 0.20-0.25 everywhere, metals
0.12-0.20, futures 0.20-0.29.

The score separates setups the engine will take from ones it will not. Within
the accepted population it does not order them by outcome. That is why the
threshold behaves as a pure volume dial, and why lowering it raises total R
without costing quality — there is no quality gradient to give up. It is also
the honest limit on what a confidence number can be presented as meaning.

### The stop is a volatility stop now, except in indices

`stopProvenance` across the final corpus, by class:

| class | cap | pivot | volatility floor |
|---|---|---|---|
| agriculture, crypto, energies, forex, futures, livestock | 100% | 0% | 0% |
| metals (1.6 cap) | 84% | 13% | 3% |
| indices (3.0 cap) | 5% | **84%** | 11% |

At a 1.0 ATR cap the cap binds on every single stop, so structural pivots no
longer place it. The ladder is described as pivot-anchored; in six of eight
classes it is not, and has not been since the caps tightened. That is a
documentation correction, not a defect — the caps were derived on measured total
R and tighter won decisively.

Indices is the one class where structure still wins, and structure is exactly
what starves it: a far pivot at a 3.0 cap makes risk large, and a large risk
cannot satisfy `minimumTargetRewardRisk` against a runner the review window caps
in absolute terms. The rejection lands as `planRejected`, which carries all of
it — `belowPayoff` is zero for all six. **The next indices lever is a JOINT
(stop cap × runner ceiling) search, not another coordinate pass.** Round 26's
lesson, one level deeper: two coupled levers cannot be derived one at a time.

### Starvation, engine-wide

1 market of 102 trips the gate — DOW at 30% survival. The five other cash
indices sit just above the 33% line. Every other market on the list survives
64% or better, and 83 of them at 90% or better. Before tonight's corrections the
condition was pervasive.

## Round-28 (2026-08-06) — the starvation was ours, and a derivation reversed

Round 27 closed with the cash indices refusing 63% of every decision that
reached their geometry stage, and r12's verdict on the class — "confidence
does not rank outcomes" — resting on whatever survived. A starved sample
yields no verdict, so the sample was the thing to fix.

**Four levers ruled out.** A 96-variant joint grid over stop cap × review
window × runner ceiling × `minimumTargetRewardRisk` moved survival by one
point, 37% → 38%, and named the then-current setting as its own best
combination. That result reads as "the geometry is right." It was the
search being exhaustive over the wrong space.

**The cause was the value the grid held fixed.** `tp1RiskShare` sat at 1.2
for indices where every other class runs 0.4–0.8. At 1.2 the partial is
required *further out than the stop itself*, so at a 3.0 ATR stop TP1
needed 3.6 ATR of room inside a five-hour window. No plan could satisfy
it. The rejection surfaced as `planRejected` — a counter that names no
lever, which is why four grids walked past it.

    survival 37% → 96%    setups 512 → 1421
    train R +25.3 → +38.2   test R +7.4 → +19.2

Chosen over a marginally higher total-R variant at a five-hour window
(train +42.7 / test +17.5, 93% survival) on the two figures that matter
more than the total: out-of-sample R is higher, and 96% means the sample
is no longer geometry-limited, which was the whole point.

**A derivation reversed, and the reversal is the finding.** The stop cap
went 3.0 → 1.0, undoing a value derived the day before on evidence that
looked strong — it improved total R on both splits, NSDQ turned −0.081 →
+0.039, ASX −0.124 → +0.028, and provenance had *predicted* it, indices
being the one class where structure-set stops beat cap-set. All of it was
measured at `tp1RiskShare` 1.2. Every widening of the cap pushed TP1 out
with it, so "wider is better" was the search climbing the wrong gradient:
it was buying relief from a TP1 constraint and reporting it as a stop-cap
result. At 0.4, the wide stop stops paying.

This is the lesson round 26 met from the measurement side, when the runner
grid had to be re-run after the caps moved. A lever downstream of risk
cannot be derived at another lever's old setting.
`scripts/replay-sweep.ts` now takes semicolon-separated crossed axes
(`--grid a=1,2;b=3,4`) so joint derivation is the cheap path rather than
the deliberate one. One axis still means exactly what it always did.

**Oats, one of four re-gridded holdouts.** `ZOUSX` refused 56% of
decisions at agriculture's class values and posted +0.001 train / −0.168
test, which reads as a market whose splits disagree. It was a market being
asked for the wrong shape.

    survival 44% → 69%    setups 473 → 748
    train R +0.3 → +26.8   test R −25.0 → +12.9

A 24-hour window is what the grain needs, and it is not an outlier — the
same window is what made livestock measurable. Oats is the thinnest grain
contract E8 lists, so a five- or six-hour window asks a slow book for a
move it does not make; the wider stop then works only *because* the window
gives the runner somewhere to go. Derived jointly for that reason. The
other three holdouts were not rescued and keep their class values.

**One defect this surfaced.** `ZOUSX` is the first per-symbol override to
touch `defaultReviewHours`, a value `src/lib/advisorReview.ts` mirrors for
the UI. The mirror resolved per class and would have shown an oats user
"6h" while the engine reviewed over 24. It now resolves per symbol first,
and `tests/calibrationState.test.ts` walks *every* tradable symbol against
the engine's own resolver rather than one representative per class — so
the next override is covered without an edit to that test.

**Bar resolution is still the ceiling, and is now measurable.**
`scripts/probe-minute-bars.ts` reports 1-minute coverage, depth and
recency per market. 15-minute bars cannot order intrabar events, which is
why a measured ~60% gain at sub-1.0 stop caps was declined in round 25 —
at a 0.5 cap, 26% of setups end in neither a target nor a stop, and the
expectancy figure then reports how the harness treats ambiguity rather
than how the market behaved. Resolution sits upstream of the stop cap the
way the stop cap sits upstream of the runner ceiling. Per-symbol geometry
tuned at 15 minutes before that question is answered would repeat round
26's mistake one level up.
