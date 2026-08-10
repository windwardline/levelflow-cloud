# 4b — the geometry-model review (owner decides before any sweep tunes)

Phase 2 of the calibration program (HANDOFF §4, amendment 33). The owner's
charge, verbatim in intent: review the MODEL before tuning it — is
TP1+runner the right shape, is the stop right as static-at-entry, does
confidence rank outcomes at all on a repaired sample, is a fixed review
window right, are there regime-conditional structures we do not have.
Adversarial, several lenses, evidence not opinion, and **the owner decides
before the 4c sweep runs**.

Everything below is measured on the first repaired corpus
(`sweeps/2026-08-10-evaluator-repair-baseline.jsonl`, engine
`2026.08.09.evaluator-repair`, manifest-verified) — the first corpus in the
project's history whose clock, fills, legs, costs and abstentions are all
honest. Numbers from any earlier corpus are not comparable and are not
cited.

Status: **mechanics documented; measurements pending the baseline sweep's
completion tonight.** Each question carries its as-built mechanism
(file:line), the adversarial lenses, and the exact measurement that
answers it; results fill in below each once the corpus lands.

---

## Q1 — Is TP1+runner the right ladder shape?

**As built** (`pricePlan.ts:buildLadderTargets`): TP1 = clamp(risk ×
tp1RiskShare, ≥ atr × tp1AtrMultiplier, ≤ 0.6 × expectedWindowMove);
runner = nearest structural level inside [minRR × risk, runnerWindowShare ×
expectedWindowMove], else the window ceiling itself. Half banks at TP1,
half rides; after TP1 the stop moves to breakeven
(`replay.ts:evaluateSetupOutcome`, `sweep.ts:realizedRFromLegs` halves).

**Lenses:**
- *Payoff-decomposition lens:* how much of realized R comes from the TP1
  half vs the runner half, per class? If runners contribute little after
  cost, the ladder is a fee on the partial.
- *Breakeven-tax lens:* the breakeven stop after TP1 converts would-be
  winners into 0R scratches when price retests entry before running. Count
  tp1_partial-via-breakeven vs take_profit sequences; the counterfactual
  (hold full stop) is computable from the legs.
- *Single-target null:* a no-TP1 ladder (full size to the runner) is the
  simplest competitor; its realized R is reconstructable per setup from
  recorded legs without re-simulating.

**Measurement:** per class — banked-half R sum, runner-half R sum,
breakeven-exit count and their forgone runner R (max favorable move vs
target from feedback), single-target counterfactual total R.

**Result:** _pending corpus._

## Q2 — Is the stop right as static-at-entry?

**As built:** stop = min(pivot-buffered, entry − 1.25·ATR) capped at
maxStopAtrMultiplier × ATR (`pricePlan.ts:139-170`); never moves except
the breakeven jump after TP1. Gap-through exits now realize the open's
print (2f), so the corpus prices stop placement honestly for the first
time.

**Lenses:**
- *Excursion lens:* distribution of maxAdverseMove / plannedRisk for
  eventual winners vs losers. If winners routinely draw down close to the
  stop, the stop is tight for the volatility it survives; if losers blow
  far through it (gap exits ≪ −1R), static placement is bearing gap risk
  the window model ignores.
- *Provenance lens (r14 instrumentation):* outcomes by stopProvenance
  (cap/pivot/volatility_floor) — does the cap, which binds in seven of
  eight classes, produce worse-than-−1R realizations than structure-backed
  stops?
- *Time-stop null:* expiry outcomes (expired_in_profit/at_loss) already
  measure "no price stop hit inside the window" — their R distribution vs
  stopped setups bounds what a pure time-stop would have done.

**Measurement:** realized-R histograms by stopProvenance; gap-exit
tail (realized < −1.1R) frequency per class; winner-MAE distribution.

**Result:** _pending corpus._

## Q3 — Does confidence rank outcomes on a repaired sample?

**As built:** score = 30 + winning×0.72 − opposing×0.55 + agreement×18 +
regimeBonus − penalties (`strategies.ts:scoreConsensus`,
`scoring.ts:scoreSetupConfidence`); the acceptance gate thresholds it per
class (20–85). Capture-all corpora record BELOW-threshold decisions too,
so rank power is measurable across the full score range, not just above
the gate.

**Lenses:**
- *Rank lens:* realized R by score decile (accepted=false rows included).
  The question is monotonicity, not magnitude.
- *Component lens:* does any single component (consensus score, agreement
  ratio, regime bonus, execution penalty) rank better alone than the
  composite? Each is recoverable from the emit's votes and penalties.
- *Replacement null:* if deciles are flat, the honest replacements are
  (a) no score — gate on payoff and regime alone, or (b) a measured
  per-class logistic refit in 4d. Naming them now keeps 4b a decision,
  not a lament.

**Measurement:** decile table of realized R and fill rate per class;
Spearman rank correlation score→R per class with clustered SEs.

**Result:** _pending corpus._

## Q4 — Is a fixed review window right?

**As built:** defaultReviewHours per class (6–24h), one override (ZOUSX
24h); expiry forces resolution; weekly-close truncation
(`replay.ts:getSetupExpiryTime`). The window also SIZES the geometry
(expectedWindowMove = dailyATR × √(hours/24)) — window and ladder are one
knob wearing two hats.

**Lenses:**
- *Censoring lens:* what share of expiries died with the position in
  profit but short of TP1 (expired_in_profit)? A high share says the
  window truncates resolutions the geometry expected to complete.
- *Time-to-resolution lens:* distribution of (exitAt − filledAt) for
  resolved outcomes vs the window; if the mass sits far inside the
  window, the window is not the binding constraint and its geometry role
  dominates; if it piles at the boundary, the window censors.
- *Volatility-conditional lens:* resolution times under high vs low
  volatilityPercentile — a fixed window is defensible only if resolution
  time is stable across regimes.

**Measurement:** per class — expiry-share, in-profit-expiry share,
time-to-exit quantiles vs window, split by regime.

**Result:** _pending corpus._

## Q5 — Are there regime-conditional structures we lack?

**As built:** one geometry per class; regime affects entry offset
(trend vs default), the chop block, and a score bonus — never the ladder
itself.

**Lenses:**
- *Interaction lens:* realized R by (regime × class) under the one
  geometry. Persistent sign flips (e.g., range-regime setups negative
  where trend-regime positive under identical geometry) are the evidence
  a conditional structure would use.
- *Session lens:* the 1e-reconciled calendars make session labels honest
  for the first time; R by sessionLabel × class exposes hour-conditional
  structure the low-edge gates only partially encode.
- *Cost lens:* 2j's per-symbol floors changed relative costs inside
  classes; a "class" geometry may really be a cost-tier geometry.

**Measurement:** regime × class R table with clustered SEs; sessionLabel
cuts for the two largest classes.

**Result:** _pending corpus._

---

## Corpus-independent observations (stated now, evidence in code)

1. **The window wears two hats** (Q4): `defaultReviewHours` both sizes
   the ladder (expectedWindowMove) and censors resolution. Any 4d tuning
   of one hat moves the other; if 4b keeps the fixed window, 4d should
   still split the knob (a sizing-hours and a patience-hours) so the
   sweep can tell which effect a change carries.
2. **The breakeven jump is the only dynamic element** in an otherwise
   static plan, and under 2f's gap pricing it can exit at a LOSS (gap
   through breakeven) — the "protected" runner half is protected only
   against continuous paths. The corpus now measures this honestly for
   the first time (Q1's breakeven-tax lens).
3. **The confidence composite was tuned pre-repair**: its weights
   (0.72/0.55/18/8) were fitted, informally, against corpora with
   phantom fill-bar wins and free ambiguity. Q3 is therefore not "did it
   decay" but "was it ever measuring rank on honest outcomes".

## Decision sheet (for the owner, after results land)

Per question: keep / replace / conditionally-keep, each with the 4c/4d
consequence spelled out. Prepared blank; filled with the results.

| Q | Verdict options | 4c/4d consequence |
| --- | --- | --- |
| Q1 ladder shape | keep · single-target · per-class shape axis in 4c | adds/removes a grid axis |
| Q2 stop model | keep static · cap-rework only · trailing candidate | 4d stop-cap derivation scope |
| Q3 confidence | keep · refit per class in 4d · retire to payoff+regime gate | changes 4d's threshold work entirely |
| Q4 window | keep fixed · split the two hats · per-market windows in 4d | axis count in 4c |
| Q5 conditional structures | none warranted · regime-conditional ladder as 4c axis | largest potential 4c expansion |
