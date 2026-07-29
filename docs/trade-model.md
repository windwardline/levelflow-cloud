# LevelFlow Trade Model

Model version: `2026.07.28.window-feasible-ladder`
Last reviewed: 2026-07-28 (round 3)

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

## Cohorts

`ANALYZER_VERSION` scopes global learning. Any change to setup
construction, scoring, calibration, or outcome evaluation must bump it.
History was reset at this version's deploy (migration
`20260728220000_reset_history_for_window_feasible_model.sql`) because
pre-fix outcomes measured an unreachable geometry, not market skill.
