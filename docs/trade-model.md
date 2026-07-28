# LevelFlow Trade Model

Model version: `2026.07.28.window-feasible-ladder`
Last reviewed: 2026-07-28

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

## Cohorts

`ANALYZER_VERSION` scopes global learning. Any change to setup
construction, scoring, calibration, or outcome evaluation must bump it.
History was reset at this version's deploy (migration
`20260728220000_reset_history_for_window_feasible_model.sql`) because
pre-fix outcomes measured an unreachable geometry, not market skill.
