# The evaluator repair map — 2026-08-09

Two read-only mapping passes over the replay evaluator and the acceptance
procedure, run before item 2's one-change-set implementation. Every claim
carries file:line evidence current at commit time. The layer model:

| Layer | Files | Items |
|---|---|---|
| A. Driver / corpus IO | `scripts/replay-sweep.ts`, `scripts/calibrationCache.ts` | 2i, 2k, 3c, 3d, 3e |
| B. Engine | `sweep.ts`, `replay.ts`, `executionQuality.ts`, `indicators.ts`, `strategies.ts`, `scoring.ts` | 2a–2h, 2j, 2l, 2m, 2n |
| C. Aggregation / reporting | `scripts/sweep-analysis.ts`, `grid-totalr.ts` + five sibling emit-readers | 3a, 3b, 3f, 3g |

The evaluator proper is `supabase/functions/trade-analyzer/sweep.ts`
(`simulateSymbol`) — `replay.ts` is only the outcome resolver.

## The four clusters (item 2 lands as one change set, in this order)

**Cluster A — the provider boundary (2b + 2h).** FMP stamps bars in
America/New_York; three duplicated `toTimestamp` copies read them as UTC
(`bars.ts:52-60`, `replay-sweep.ts:572-580`, `market-data/index.ts:527-533`;
plus two ad-hoc calendar/COT parses in replay-sweep). Proof is recorded in
`bank-minute-bars.ts:17-28`: the S&P cash session reads 09:30–15:45 in July
AND January — a New York wall clock stamped as UTC. Every session gate,
low-edge hour, news join and expiry in the corpus is 4–5 DST-variable hours
off. No value sanitisation exists anywhere (`high >= low` never checked; the
MGCUSD 135,533% bar is recorded only in the handoff); `calibrationCache`
cements a bad tick permanently. Fix: ONE normaliser + OHLC/spike validator at
the boundary, all five parse sites collapsed; a measured-alignment probe as a
test (the S&P-invariance assertion is directly executable); rejection COUNTED,
never silent. 2b must land before any re-sweep. Note: FMP minute series carry
finer-than-exchange-grid prices (ZCUSX 0.01 deltas on a 0.25 tick), so a
tick-grid conformance test is NOT a valid sanitiser.

**Cluster D — decision-time context (2a + 2l, with 2j's replay quote and 2k's
resampler).** `sweep.ts:173` admits a daily bar when its 00:00 OPEN stamp is
past — the completed OHLC of the decision's own day leaks into ATR, EMAs,
regime, volatility percentile, dailyAtr stop buffers and the expected-window
move (pivots are incidentally shielded by their strength window). The gate is
"this bar's session CLOSE ≤ decision time", generalising
`replay.ts:246-308`'s zoned-close machinery from weekly to daily — sound only
after 2b. Parity: the live loader admits a genuinely-partial current daily bar
(`marketLoader.ts:118-122`), so the gate lands on BOTH sides. 2l: replay
builds four timeframes by resampling 15min (`sweep.ts:180-198`); production
fetches six and the committee votes over five (1min filtered both sides,
`strategies.ts:157-176`) — the 63.9% score delta is the agreement denominator
5 vs 4, the 1.6% side flips are 5min breaking 2-2 ties. Replay must fetch
real 5min depth (resampling can't make 5min from 15min). Also here:
`sweep.ts:190` `quote: null` makes replay always modeled-spread while
production can be quoted; `resampleBars` groups by array index so one missing
bar phase-shifts every later "hourly" bar — time-aware or refuse.

**Cluster B — the path evaluator (2c + 2f + 2e), all rewriting
`replay.ts:133-208`.** The outcome loop starts ON the fill bar, so a bar's
high can be credited to a position its own low created (2c; no adverse-first
exists in code — it is the fix to install, and the corpus shows 26% ambiguous
at 0.5 caps, which is why 1.0 is the tightest adjudicable cap today). Legs
never resolve to prices: `tp1_partial` books 0.5×tp1R whether the runner
expired at breakeven or one tick short — the expiry R IS captured in
`feedback.realizedR` (`replay.ts:183-187`) and `sweep.ts:426-427` returns
before reading it; 63–68% of fills (2f). Gap-awareness is absent on every leg
(`bar.open` never consulted; stop books literal −1). `ambiguous` falls to
`default: return 0` (`sweep.ts:435-436`), diluting expectancy toward zero on
exactly the setups whose stop was touched (2e → explicit −1). Order matters:
2c shrinks the ambiguous population 2e re-scores.

**Cluster C — the accountant (2g + 2d + 2f), meeting at
`sweep.ts:410-438`.** TEN independent R implementations (table in the map's
source agent output; the worst is `grid-totalr.ts:25` computing total R as
expectancy-over-FILLED × SETUPS-including-unfilled — the reading device
rounds 25–28 shipped on). Replay carries NO cost anywhere while cost gates
acceptance (`plan.rewardRisk < minRewardRisk` uses the post-cost ratio), so a
setup pays cost at the door and books gross R. `effectiveRewardRisk`
(`executionQuality.ts:185-188`) charges the round trip in the numerator AND
denominator — delete, replace with per-leg cost inside ONE exported
accountant consuming 2f's leg prices; `SweepOutcomeRecord` gains explicit
cost/exit fields. Two R conventions collide today: `feedback.realizedR` is
full-position, everything in src/ reads it as the ladder figure.

**2m/2n (indicators, with the committee ripple).** `ema()` seeds on
`sample[0]` and returns 0 for empty input — a price, not a sentinel; RSI
returns 100 on a frozen series (`losses === 0` catches gains===0 too), firing
opposite-direction votes from two strategies on the same degenerate input.
Abstention propagates: committee filter → consensus floor → rejection tallies
— the accepted-setup COUNT moves, so 2m/2n cannot be validated against any
existing corpus. New "not warm" rejection bucket keeps decision arithmetic
closing.

**2i/2k (the manifest — 4a's input).** Nothing persists sweep results except
stdout and an operator-pathed JSONL with NO record of the calibration that
produced it (`variant:"baseline"` is byte-identical across engine edits — the
exact hazard `calibration.ts:617-627` documents for NGUSD). Discovery already
computes first/last/count/span per symbol and PRINTS AND DISCARDS it
(`replay-sweep.ts:117-129`); no gap term exists; `fetchIntradayBars` silently
tolerates empty windows below a 3-streak. Fix: a continuity function at the
`calibrationCache` choke point; a committed `<emit>.manifest.json` carrying
resolved per-symbol calibration (hashed), grid spec, warmup/split params,
anchor, and per-(symbol, timeframe) bar facts — first, last, count, largest
gap, usable span. Every layer-C reader asserts the hash before aggregating.

**2j (per-symbol spreads).** `EXECUTION_PROFILES` is per-class
(`executionQuality.ts:62-151`); NQ at ~23,000 pays 1.4bps ≈ 3.2 points
against a real 0.25 tick — the 16×. Replacement data in-repo: the 27-symbol
tick grid (`futures.ts`), E8's published specs (`instruments.ts`), live
quoted spreads (`quotes.ts` — production-only, never banked: START BANKING).
Per-symbol table with class fallback + tick floors; `sweep.ts:190` feeds
replay a modeled-or-banked spread so `spreadSource` agrees across paths.

## Item 3 — the acceptance procedure (follows item 2)

**Govern-all finding:** seven emit-readers share ZERO code — five private
`add`/`expectancy` implementations (`sweep-analysis.ts:84-95` records the
drift that already happened). **First commit: extract `scripts/sweepStats.ts`**;
the manifest-hash assertion (2i) lives there too.

- **3a** — the ±0.005 constant exists only in trade-model.md prose
  (:816/:859/:964); code has NO dispersion term at all (`Stats` carries no
  `rSumSq`). A working SE prototype exists at
  `account-type-report.ts:224-240` (σ≥2 exclusion) — lift it, measure rSd
  from the corpus instead of the `--r-sd 0.8` constant, CLUSTER BY MARKET.
- **3b** — the permutation null belongs in `grid-totalr.ts:34-62`, the only
  place variants are compared (it holds the full symbol×variant×split cube);
  the crossed-axes product (`replay-sweep.ts:406-451`) is the uncorrected
  multiplicity.
- **3c/3d/3e** — ALL in `replay-sweep.ts:151-155` (five lines): per-symbol
  fractional split (not common-origin — folds land in different calendar
  years per symbol, then grid-totalr sums "test R" across disjoint history),
  one fixed cut (not rolling), warm-up overlap with no embargo (train-fold
  setups truncate at the boundary; `sweep.ts:146-148`/`:323`). Fix: a fold
  generator over CALENDAR timestamps from the manifest; three folds
  (fit/select/confirm) — today's two folds make selection and confirmation
  the same fold; `--holdout` written INTO the emit records and manifest so
  the partition is a property of the corpus, not an invocation flag.
- **3f** — the release gate is `grid-totalr.ts:53-57`: bare `>` inequalities
  with a 0.5-volume thinness refusal. Restate in standard errors (the
  account-type-report σ form).
- **3g** — total-R (grid-totalr) and per-trade expectancy (sweep-analysis's
  split-agreement table) live in different files that deliberately reject
  each other's criterion; the joint gate lands in grid-totalr over a Cell
  with 3a's variance term. `planRejected` is parsed and NEVER used — a
  total-R gain achieved by starving the geometry gate is currently
  indistinguishable from found edge; the joint gate must read it.

## Ordering constraints (from the shared-surface matrix)

1. 2b before everything (2a's gate is zoned-close logic on bars whose stamps
   must first be true; the cache pins timestamps into the corpus).
2. 2a with 2l (both change what a decision sees; owner-sequenced).
3. 2c before measuring 2e (ambiguous denominator shrinks).
4. 2f feeds 2g feeds 2d (legs → accountant → cost) — one edit at
   `sweep.ts:410-438`.
5. 2m/2n force the re-sweep regardless (accepted-count moves).
6. The manifest (2i/2k) must exist before the re-sweep so the new corpus is
   the first self-describing one; item 3's sweepStats asserts its hash.
7. Item 3's shared-module extraction precedes 3a/3b/3f/3g.
