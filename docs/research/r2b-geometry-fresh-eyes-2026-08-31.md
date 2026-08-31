# R2b — the geometry model's fresh-eyes round

Run 2026-08-31. Six independent lenses on `pricePlan.ts`, each asked what the
geometry **model is missing** rather than how to tune it; every finding then
handed to an adversarial refuter told to kill it. 24 findings judged, 9
survived. Everything below was then re-derived by hand against the shipped
calibration, and that step changed one of the answers completely — see
"The error this round made" at the end.

**R2b's exit criterion is a named field list, not a review.** HANDOFF restated
it: an item whose exit criterion is "a review ran" produces findings; one whose
criterion is "the emit and manifest carry this named field list" produces a
corpus R4, R5 and R6 can read. The list is section 3.

---

## 1. Three dead instruments, measured on all 98 markets

Each of these was checked against `getCategoryCalibration(symbol)` for every
symbol in `knownSymbols` — the real per-market population, not the class rows.

### 1a. `window_cap` can never fire. On any market.

`tp1Distance = min(max(riskDistance x tp1RiskShare, atr x tp1AtrMultiplier),
expectedWindowMove x 0.6)` (`pricePlan.ts:564-567`), and `tp1Provenance`
records which of the three bound.

The ladder is only built when `expectedWindowMove >= riskDistance x
minimumTargetRewardRisk / runnerWindowShare` — `pricePlan.ts:584` refuses the
plan outright otherwise. So `tp1WindowCap >= 0.6 x (mTRR / rWS) x riskDistance`,
and the cap can bind only if `0.6 x mTRR / rWS < tp1RiskShare`.

**That inequality is false on all 98 markets**, and the ATR arm fails too.
The bound runs 0.686 to 1.600 against a `tp1RiskShare` of 0.4 or 0.8 and a
`tp1AtrMultiplier` of 0.3 to 0.5.

`window_cap` is unreachable code, an unreachable `Tp1Provenance` value, and a
corpus column that can never take one of its three states. Any analysis
conditioning on it reads an empty set — and would report "no market is
window-capped" as a finding rather than as an arithmetic impossibility.

### 1b. `tp1Provenance` records the calibration cell, not the market

With `window_cap` gone the field is binary, and the survivor is decided by
`riskDistance / atr < tp1AtrMultiplier / tp1RiskShare`. `riskDistance / atr` is
bounded by the stop chain into `[min(1.25, maxStopAtr), maxStopAtr]`, and on
**all 98 markets** that interval sits entirely on one side of the threshold.

The column is constant per market. It is per-row width carrying zero per-row
information, on the one corpus R3 gets to write.

### 1c. 27 markets can never be structure-stopped

`structuralStop` is the farther of the pivot-buffered stop and `entry -/+ atr x
1.25`, so it is **never nearer than 1.25 ATR** (`pricePlan.ts:226-234`).
`capStop` sits at `atr x maxStopAtrMultiplier`. Where that multiplier is at or
below 1.25 the cap therefore binds on every decision, and `stopProvenance` is
the constant `"cap"`.

**27 of 98 markets**, by class: futures 7, crypto 12, indices 3, livestock 3
(all of them), agriculture 2. Named: MGCUSD, NIKKEI, DOW, ASX, ZFUSD, ZTUSD,
HOUSD, RBUSD, PLUSD, PAUSD, ZSUSX, ZRUSD, LEUSX, GFUSX, HEUSX, ALGOUSD,
ARWUSD, ATOMUSD, AVAXUSD, DOTUSD, DYDXUSD, FILUSD, NEARUSD, THETAUSD,
TRUMPUSD, TRXUSD, XTZUSD.

On those markets the pivot search, the buffer and the 1.25-ATR floor are
computed and then discarded, `riskDistance` is exactly `atr x
maxStopAtrMultiplier`, and `stopPivotDistance` — a field #472 paid a permanent
column for — describes a level that never influenced the stop.

**This is not a tuning claim.** Nothing here says the multiplier is wrong. It
says the model reports a structural provenance it cannot have had.

## 2. The window the geometry budgets is not the window the order gets

`expectedWindowMove = dailyAtr x sqrt(defaultReviewHours x sizingHoursFactor /
24)` (`pricePlan.ts:557-560`) drives the TP1 cap, the runner ceiling **and the
feasibility refusal** at `:584` — the gate whose stated purpose is to reject a
setup rather than decorate it with an unreachable target.

`getSetupExpiryTime` (`replay.ts:827-846`) returns `min(created + reviewHours,
weeklyCutoff)`. The geometry never sees that clamp: `buildPricePlan`'s
parameters are side, symbol, market, regime, calibration and a refusal channel
— no clock, no calendar, no session.

So for a setup whose nominal window crosses the weekly close, the targets are
placed for time the order will not get, and the feasibility gate reasons about
a window that does not exist.

| class | review hours | share of the trading week affected |
| --- | --- | --- |
| livestock | 24 | **20.0%** |
| forex, indices, metals | 8 | 6.7% |
| agriculture, energies, futures | 6 | 5.0% |
| crypto | 12 | exempt — no weekly close |

At the midpoint of the affected span the reach is overstated by **sqrt(2) =
1.41x**. `sizingHoursFactor` is the one knob that could absorb this and it is
**1 on every class**, so no correction is applied anywhere.

**Narrowed by refutation, and the narrowing matters.** The session layer
already blocks the weekend outright and penalises the last half hour
(`sessions.ts:229-245`), so this is not "setups are generated on a closed
market". It is setups generated *before* the close whose window crosses it.

## 3. THE FIELD LIST — R2b's exit criterion

Deliberately short. Per-row width is the cost, R3 is one re-sweep, and the
repo's standard is five fields doing the work of twelve.

| where | field | what it recovers | why not reconstructable |
| --- | --- | --- | --- |
| **rejection ledger** | `reason` widened from `"planRejected"` to the specific geometry cause | Which of `buildPricePlan`'s **13** `return null` paths fired | A refused decision emits **no outcome row at all**. The ledger's `{reason, time}` is the entire record, and the reason is one word for thirteen causes |

**IMPLEMENTED 2026-08-31, the same day.** `PlanRefusalReason` names ten causes
across fourteen `return null` sites; `buildPricePlan` and `buildLadderTargets`
both take the channel; `sweep.ts` passes it and records
`planRejected:<cause>` on the ledger. The ladder's merged
`minimumRunnerDistance > runnerLimit || tp1Distance <= 0` is split, because a
window lever and a TP1 lever are the two furthest-apart remedies in the set.
The COUNTER is untouched — `rejections.planRejected` stays the aggregate every
reader enumerates, and a detailed counter key would be a breaking change for a
fact that belongs per decision.

**One field, and it is not an emit column.** `buildPricePlan` already offers a
`refusal` out-channel (`pricePlan.ts:161-166`); `sweep.ts:847-853` calls it with
five arguments and does not pass one, so every cause collapses at
`sweep.ts:855` into `reject("planRejected", ...)`.

**The price of not having it is measured, twice.** Livestock's ladder refused
396 of 416 decisions that reached the geometry — 5% survival against a healthy
73-99% — and the repair was a review-window change. Indices refused 63% of
every decision reaching their geometry; a 96-variant grid over four axes moved
survival 37% to 38% and named the incumbent as its own best combination, while
the real cause was the one axis held fixed, whose correction took survival
37% to 96% and out-of-sample R +7.4 to +19.2. `docs/trade-model.md`'s own words:
"planRejected — a counter that names no lever, which is why four grids walked
past it".

`scripts/starvation-audit.ts:414` computes `geometryKill = planRejected +
belowPayoff`, so the standing audit can say which MARKET is starved and never
which GATE.

### Rejected as fields, deliberately

- **`expiresAtMs`** — derivable, but **not by the formula `sweep.ts:324-332`
  states.** That comment says "`time` plus the review hours of the calibration
  this row's `variant` names", which is wrong for every non-crypto row whose
  window crosses the weekly close. The clamp is a pure function of `(symbol,
  time)` and any reader can apply it, so no column is needed — but the stated
  derivation must be corrected or a reader will compute the wrong window on
  5-20% of rows.
- **`realizedWindowMove`** — the excursion accumulators start at the FILL, not
  at the decision, so they do not measure what `expectedWindowMove` predicts.
- **`tp1Provenance`** — already emitted, and by 1b it should be reconsidered
  rather than kept: a constant column is width without information.

## 4. Model questions for the owner — NOT changes made here

Each survived refutation. None is a tuning suggestion, and none may be actioned
by widening a target or tightening a stop to improve a printed ratio
(amendment 39).

1. **The banked fraction is the literal `0.5`, in four places** (`replay.ts:247-249`,
   `:327`, `pricePlan.ts:467-468`), and `CategoryCalibration` has no field for
   it. Realized R is linear in that allocation and it has never been varied,
   measured, or represented — while `forgoneRunnerR` already measures the
   give-back with nothing upstream able to act on it.
2. **A plan without a partial cannot be built.** `takeProfit1` is typed
   `number` (`pricePlan.ts:117, :531, :633-635`) so the null branch at `:466`
   is dead, while the resolver handles a null TP1 on every path — it can price
   a full-size plan the builder cannot produce.
3. **TP1 never consults structure.** `pivotLevels` reaches
   `buildLadderTargets` and is spent entirely on the runner (`:587-593`,
   `:605-609`, both floored at `minimumRunnerDistance`). Since
   `tp1RiskShare` (0.4-0.8) is always below `minimumTargetRewardRisk`
   (1.5-1.7), TP1 is always strictly nearer than the nearest recorded
   structural distance — so the partial is parked in a band the corpus
   describes with no level at all.
4. **The stop consults intraday structure only.** `dailyPivots`
   (`pricePlan.ts:183`) reaches the ladder's `pivotLevels` (`:319-320`) and
   never `nearestStopPivot` (`:208-212`). Targets see daily structure; stops do
   not.

## 5. The error this round made, recorded because it is the archetype

Findings 1a-1c were first derived against `getClassCalibration` — the class
rows. **The class rows govern about 18 markets; 79 carry derived per-market
cells shipping 4x stops.** Re-derived against `getCategoryCalibration` over
`knownSymbols`:

- 1a and 1b **survived unchanged** — they hold on all 98.
- 1c **changed completely**: "seven of eight classes are always cap-stopped at
  1 ATR" became "27 of 98 markets", and the mechanism moved from a class
  property to a per-market one.

The empirical check is what caught it: a fixture run printed `riskDistance /
atr = 4.000` where the class cap said 1.0, which is impossible unless the
calibration in force was not the one being reasoned about.

`scripts/roster-expectancy-audit.ts:184-187` carries this warning in terms —
"measured across all 97 markets, ZERO match this cell — the 79 derived markets
ship 4x stops and never reach here. Judge the branch on the population that
reaches it" — and it was read earlier the same day. **A stated population rule
does not protect the next derivation; only re-deriving on the real population
does.**
