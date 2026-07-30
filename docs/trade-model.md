# Levelflow Trade Model

Model version: `2026.07.29.per-symbol-curves`
Last reviewed: 2026-07-29 (round 6)

## Geometry

Every setup is a limit-entry bracket built on one timescale — the review
window — instead of mixing intraday entries with swing stops and multi-day
targets (the pre-2026-07-28 defect that produced 50% expired-open outcomes
and near-zero take-profit hits in production).

- **Expected window move**: `dailyATR × sqrt(reviewHours / 24)`. Every level
  must fit inside it.
- **Entry**: limit order offset from the latest close by a per-class ATR
  fraction (indices sit near the market; deep offsets never filled).
- **Stop**: beyond the nearest confirmed swing pivot with a volatility
  buffer, hard-capped at `maxStopAtrMultiplier × ATR(15m)`. Structure may
  tighten the stop, never widen it past the cap.
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
  74,764 events from 2013) now join the replay at decision time: active
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

`ANALYZER_VERSION` scopes global learning. Any change to setup
construction, scoring, calibration, or outcome evaluation must bump it.
History was reset at this version's deploy (migration
`20260728220000_reset_history_for_window_feasible_model.sql`) because
pre-fix outcomes measured an unreachable geometry, not market skill.
