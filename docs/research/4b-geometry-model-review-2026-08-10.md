> **CORPUS INVALID (2026-08-11)** — every measurement in this document
> comes from the corpus whose clock defect gave each setup 4–5 hours of
> look-ahead. The reasoning and the questions stand; the NUMBERS do not.
> Read `docs/research/remediation-program-2026-08-11.md` first.

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

Status: **MEASURED — corpus `3b108f43d4c2`, 1,017,734 records (764,936
non-holdout baseline), folds fit 2009–2018 / select 2018–2022 / confirm
2022–2026, 18 holdout markets.** Full tables:
`docs/research/baseline-2026-08-10/`. The headline, stated before the
questions because every question's answer descends from it:

**On the honest instrument, the accepted stream loses money in every
class** — forex E −0.057 ±0.009 (clustered), crypto −0.122 ±0.009,
metals −0.225 ±0.020, futures −0.279 ±0.033, agriculture −0.367 ±0.017,
livestock −0.161 ±0.014. The pre-repair +.89/+.90/+.83 record was the
measurement error (fill-bar phantom wins, free ambiguity, zero cost,
same-day daily leak), not the edge. Nearly every market individually
clears amendment 24's 2σ-negative bar — which is precisely why the
per-market exclusion rule is the WRONG tool here: when 90+ of 96 markets
"exclude", the finding is systemic, the model is what fails, and
amendment 31's coverage default stands. The desk being parked is what
makes this a measurement, not an incident.

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

**Result (Q1 table, baseline-2026-08-10):** The ladder's halves point in
opposite directions in every class: the TP1 half banks POSITIVE gross R
everywhere (forex +62,646R over 323,631 fills) while the runner half
loses it back (forex −51,696R) and cost takes 29,855R more — the runner
half plus cost swamp the banked half in all six classes. 44% of forex
fills (142,680) exit at breakeven AFTER touching TP1 with a median MFE
of 0.92R — the trade was up nearly a full risk unit and surrendered the
runner half back. The single-target counterfactual is WORSE than the
ladder in forex (−24,897 vs −18,905) and roughly equal elsewhere: the
ladder SHAPE is defensible; what fails is the runner leg's economics and
the cost weight per trade. Verdict input: keep two-leg banking, but the
runner's placement/protection is a 4c axis, and cost-per-trade dominates
everything (see Q2/Q4).

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

**Result (Q2 table):** The cap binds on effectively EVERY setup — metals
is the only class where pivot (1,233) or the volatility floor (259) ever
places the stop; everywhere else provenance is 100% "cap" (r14's finding,
now corpus-wide). Gap tails are severe under honest exit pricing:
records at R < −1.1 are 32% of agriculture fills, ~30% of crypto and
futures, 13% of forex — stops gap through far beyond their nominal −1R.
Winners barely draw down (MAE/R p50 ≈ 0.21–0.28, p90 ≈ 0.6–0.78): the
stop's width is never what saves a winner, and its placement is what the
gap tail bleeds through. Verdict input: static-at-entry is not
structurally condemned by this, but the CAP-always-binds fact means the
'structural stop' story has been fiction — stops are pure ATR multiples
in practice, and their width is a live 4c axis alongside gap-aware
classes' session-open avoidance.

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

**Result (Q3 table):** The composite score does not rank honest
outcomes: ρ = 0.014 (agriculture), 0.058 (crypto), 0.035 (forex), and
deciles are flat — forex decile 10 reads −0.023 vs decile 1's −0.085, a
whisper of ordering with no level a threshold gate can stand on; crypto's
top decile is its LARGEST (33,441 rows) and still −0.148. The
corpus-independent observation held: the weights were fitted against
phantom outcomes and never measured rank on honest ones. Verdict input:
the per-class threshold apparatus (20–85) gates nothing real; Q3's
replacements (payoff+regime-only gate, or a 4d per-class refit against
honest outcomes) are the live options.

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

**Result (Q4 table):** The window censors nothing: median time-to-exit
is 0.5 HOURS against 6–12 hour windows (p90 ≤ 4.3h except livestock's
20h), expiry shares are 0.3–5.2%. Resolution happens in the first hour —
touch TP1, retreat to breakeven, done (Q1's tax operates fast). So the
window's ONLY operative role is the sizing hat (expectedWindowMove =
dailyATR × √(hours/24) shapes every ladder), and tuning 'the window' in
4d moves geometry, not patience. Verdict input: split the two hats
explicitly (a sizing-hours knob and a patience-hours knob) so 4c can
move them independently; the fixed patience window is empirically
irrelevant at current geometry.

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

**Result (Q5 table):** Flat. Within every class the three tradable
regimes sit within ~0.05R of each other (forex: compression −0.060,
range −0.055, trend −0.061; clustered SEs 0.008–0.016) — under THIS
geometry no regime-conditional structure differentiates outcomes, and
livestock's compression +0.018 ±0.216 is 139 rows of noise. Verdict
input: no evidence for a regime-conditional ladder as a 4c axis now; the
question re-opens only if a geometry that is positive somewhere shows
regime spread.

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
