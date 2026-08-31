import { newYorkClockParts, newYorkWallClockToUtcMs } from "./bars.ts";
import {
  type CategoryCalibration,
  getCategoryCalibration,
} from "./calibration.ts";
import { completedDailySeries } from "./dailyCompletion.ts";
import { buildPricePlan, type PlanRefusal } from "./pricePlan.ts";
import {
  GROSS_COST_SCALE,
  modeledCostScaleFromEnv,
  resolverCostOptions,
} from "./executionQuality.ts";
import {
  evaluateSetupOutcome,
  realizedRFromLegs,
  type ReplayBar,
  resolutionSeriesFor,
  type ResolutionLeg,
  type ResolvedOutcome,
} from "./replay.ts";
import {
  buildCotContext,
  type CotReportRow,
  cotScoreAdjustment,
} from "./cotContext.ts";
import {
  calculateMacroRateAdjustment,
  type DatedTreasuryRow,
  treasuryContextFromRows,
  treasuryVisibleAtMs,
  unavailableContext,
} from "./macroRates.ts";
import {
  calculateNewsPenaltyUnits,
  isBlockingNewsEvent,
  NEWS_ACTIVE_AFTER_MS,
  NEWS_ACTIVE_BEFORE_MS,
  NEWS_UPCOMING_HORIZON_MS,
} from "./newsRules.ts";
import { scoreSetupConfidence } from "./scoring.ts";
import { getSessionContext } from "./sessions.ts";
import { isCurrencyRelevantForSymbol } from "./symbols.ts";
import {
  classifyRegime,
  runStrategyCommittee,
  scoreConsensus,
} from "./strategies.ts";
import {
  type Bar,
  intradayTimeframes,
  type MarketContext,
  type Timeframe,
} from "./types.ts";

// Scheduled macro event for the replay news join (medium/high impact only,
// currency uppercased), sorted by time ascending.
export type SweepNewsEvent = {
  currency: string;
  impact: "medium" | "high";
  /**
   * The release name, which is the only thing separating two events on one
   * instant — Core PPI and Initial Jobless Claims are both USD/medium at
   * 12:30. It is not read when scoring; it exists so the store can keep both.
   */
  name: string;
  time: number;
};

export type SweepOutcomeRecord = {
  // False when the setup failed the confidence/payoff gates but was still
  // evaluated (capture-all calibration mode).
  accepted: boolean;
  confidenceScore: number;
  cotPercentile: number | null;
  /**
   * How many COT reports the context actually saw.
   *
   * Computed by buildCotContext and discarded until now, and it is the one
   * COT fact not recoverable post hoc: `0` on a MAPPED symbol means nothing
   * reached the engine — a fetch or cache fault — while `1..39` means a
   * genuinely short contract history. `stance: "unavailable"` conflates them,
   * and R3 is the one re-sweep.
   */
  cotSampleSize: number;
  cotStance: string;
  /**
   * How close an UNFILLED setup came to its entry, in price. Null on every
   * filled outcome and on a row the window could not measure.
   *
   * Until now an unfilled row carried no price information whatsoever — the
   * legs are empty and riskDistance is a distance — so "missed by a tick" and
   * "never came near" were the same row, and R4 cannot ask whether an entry
   * offset is too wide from a corpus that cannot tell them apart.
   */
  unfilledApproachDistance: number | null;
  /**
   * Distance to the nearest structural level clearing the minimum payoff,
   * ignoring the window cap. Null when no level clears it at all.
   *
   * `runnerProvenance: "window_ceiling"` collapses two opposite causes — no
   * structure at these distances, or structure the review window cannot reach
   * — which are different findings with different remedies.
   */
  runnerNearestBeyondMinimum: number | null;
  // The resolver's evidence, carried whole (4b's input — the map's
  // "captured and simply never read"): the gap-aware execution legs, the
  // exit and fill instants, both excursion statistics against the nominal
  // entry, and whether TP1 banked. Geometry review reads these from the
  // corpus instead of re-simulating.
  exitAtMs: number;
  // E4 (R1c): the collapse comparator's THIRD tier. The live scan ranks
  // correlated candidates on confidence, then payoff, then this — and the
  // corpus carried the first two and not this one, so an offline replay
  // resolved on the symbol tie-break every case production resolved on
  // execution quality. It matters more than it looks: live compares payoff
  // quantized to two decimals, so tier-2 ties inside a group are common and
  // this tier binds often. Emitted rather than derived because R3 is the ONE
  // re-sweep — a field absent from the emit then cannot be backfilled without
  // a second one. No physics change: the value is already on the plan, read
  // three fields away for the commission.
  executionScore: number;
  filledAtMs: number | null;
  legs: ResolutionLeg[];
  // E6 (R1b): the reconstructed Treasury-curve adjustment this row was
  // scored under — recorded per row like newsPenalty and sessionPenalty,
  // on the stopProvenance principle: every input that moves a score is a
  // measurable column, never an assumed constant. The stance rides
  // beside it the way cotStance rides beside cotPercentile (#364 round
  // 3, finding 2): adjustment 0 alone conflates "no curve visible",
  // "rates steady", and "no rate-aligned side" — three different facts
  // a cohort read must be able to separate, and the disambiguation that
  // makes the curve's tolerated leading edge honestly VISIBLE downstream.
  macroAdjustment: number;
  macroStance: string;
  maxAdverseMove: number | null;
  maxFavorableMove: number | null;
  newsPenalty: number;
  // E2 (R1b): the resolver's data-absence marker, carried into the corpus
  // so a cohort read can separate "the provider had no bars inside the
  // review window" from a market that genuinely never filled the limit.
  noBarsInReviewWindow?: true;
  outcome: Exclude<ResolvedOutcome, "pending">;
  realizedR: number;
  /**
   * THE SAME DECISION, RE-PRICED AT THE PUBLISHED BILL ALONE.
   *
   * Amendment 36's re-decision needs a gross reading and a net one. The cost
   * scale is a per-process environment read, so `--grid` cannot produce two
   * arms in one run — and the sequence budgets ONE re-sweep against an
   * exhausted FMP allowance. These two columns retire that problem: the
   * resolver is pure given (bars, plan, options), so a second resolution at
   * `GROSS_COST_SCALE` costs CPU and not one byte of bandwidth.
   *
   * PAIRED, WHICH IS WHY IT IS TWO COLUMNS AND NOT TWO CORPORA. Running the
   * whole sweep at a second scale would also move the payoff GATE, so the two
   * arms would carry different accepted populations and the comparison would
   * confound the cost question with a selection effect — and systematically,
   * since a looser gate admits MARGINAL setups, which drags the gross arm down
   * and biases toward keeping a decline. Here the decision set is identical by
   * construction and only the execution assumptions differ, so the comparison
   * answers the question amendment 36 actually asks.
   *
   * The outcome is carried too, not just the R: a smaller half-spread changes
   * where the limit fills, so a decision unfilled under the full model can
   * fill under the published bill alone. That is a real consequence of the
   * cost model, not an artifact, and a reader needs to see it.
   */
  grossRealizedR: number;
  grossOutcome: Exclude<ResolvedOutcome, "pending">;
  regime: string;
  // E1's tier, per row (emit symmetry with the live writers'
  // feedback.resolutionIntervalMs): 300000 when the 5-minute series
  // resolved this row, 900000 when it degraded to 15-minute physics.
  resolutionIntervalMs: number;
  // R2b's field list (2026-08-23), owner-authorised. The keystone is
  // `latestClose`: before it the corpus contained NO PRICE LEVEL at all —
  // `riskDistance` is a distance and `legs` are EMPTY on an unfilled row, so an
  // unfilled setup recorded no price whatsoever. With the decision bar's close
  // the whole plan reconstructs deterministically, which is why seven
  // separately-proposed fields collapsed into these.
  //
  // `atr` is the volatility unit the entire geometry is scaled in — without it
  // nothing is comparable across markets, and R4 grades all 97 individually.
  // `dailyAtr` is the second stop lever the max() hid. `stopPivotDistance`
  // separates a chosen pivot from one that lost to the cap. `grossRewardRisk`
  // is payoff BEFORE cost; only the net figure was emitted, so the cost charge
  // was unmeasurable. `volatilityPercentile` and `trendStrength` are the
  // regime's own evidence, computed at every decision and discarded — they make
  // the fixed-versus-conditional review-window question answerable from THIS
  // corpus instead of a second sweep.
  //
  // Measured cost: 245 bytes/row, ~+0.09 GB on a single-cell sweep of the
  // roster. R3 is the one re-simulate, so a field absent then is unrecoverable
  // without a second full sweep — which is the whole reason these land now.
  atr: number;
  dailyAtr: number;
  grossRewardRisk: number;
  /**
   * WHAT THE LADDER PAYS ON A FULL WIN — the figure amendment 39 makes the
   * measure, and the one this corpus did not carry.
   *
   * `rewardRisk` beside it is the RUNNER TARGET's ratio on a full-size basis,
   * and half the position leaves at TP1. A setup admitted at 1.6x realises
   * `0.5 × tp1R + 0.5 × targetR ≈ 1.0R` against a −1.00R stop, so `rewardRisk`
   * overstates the edge by 33% to 60% depending on the class — 60.0% is
   * METALS, the maximum, and energies is 33.3%; the earlier "roughly 60%"
   * quoted the extreme as the typical case (tests/ladderPayoff.test.ts derives it
   * per class from shipped calibration). The Desk stopped printing it in #468.
   * The corpus was still going to record it as the only ex-ante payoff — so
   * R4, grading all 97 markets, would have measured every one of them against
   * a promise the ladder never makes, and read the shortfall as the markets
   * underdelivering rather than as the wrong yardstick.
   *
   * EMITTED RATHER THAN DERIVED, deliberately, and against this corpus's own
   * "emit primitives, reconstruct the rest" rule.
   *
   * The first version of this note gave a reason that is FALSE: "on an
   * unfilled row the legs are empty and neither target is recorded, so there
   * is nothing to blend." A reviewer rebuilt the value from the ex-ante
   * columns without touching the legs — exact on grid-free markets — and the
   * keystone note in `pricePlan.ts` says the same thing two files over. The
   * legs were never the obstacle.
   *
   * The real reasons, which still hold. Recovery is NOT exact on the 27
   * futures-shaped markets, where tick alignment and the min-stop clamp move
   * the blended targets. And recovery means re-running the ladder AND the cost
   * model, so a reader reimplements production and inherits whatever
   * production has wrong — the hazard, not the arithmetic, is what makes this
   * a column. It also nets `estimatedRoundTripCost`, a cost-model output the
   * manifest pins by `analyzerVersion`: stored, it stays attributed to the
   * model that produced it.
   *
   * Null when there is no TP1 leg, exactly as `PricePlan` reports it: a
   * full-size runner IS `rewardRisk`, and duplicating it under a second name
   * would give the corpus two answers to one question.
   */
  ladderRewardRisk: number | null;
  /**
   * THE GIVE-BACK — how much of a runner's best excursion the trade handed
   * back, in R. Null when the row had no runner to give anything back.
   *
   * Amendment 39 names this quantity by hand: "minimize give-back". The
   * HANDOFF pre-registers it as one of the TWO axes R3 exists to measure —
   * "the RUNNER LEG's placement/protection and the COST WEIGHT per trade" —
   * and states that "the three modes are comparable the moment" the corpus
   * can be read. That sentence was false until this landed. `realizedFields()`
   * writes both fields on every live resolution (`replay.ts`), the Desk prints
   * the give-back on the History surface, and the sweep read neither: R3 would
   * have produced a corpus that could not answer either pre-registered
   * question, on the one re-simulate there is.
   *
   * NOT RECONSTRUCTIBLE, unlike the ladder payoff beside it. `forgoneRunnerR`
   * rebases the excursion onto the FILL rather than the planned entry, and the
   * planned entry is not a column. A reader working from `maxFavorableMove`
   * and `riskDistance` would mix the two baselines — which is precisely the
   * defect #462 shipped and had to fix, so it is the mistake to expect rather
   * than one to hope against.
   */
  /**
   * THE LEVELS THE ORDER WAS PLACED AT — entry, stop, and both targets.
   *
   * The corpus recorded none of them. `legs` carries FILL prices and is empty
   * on an unfilled row, so a reader could not say where the order rested, and
   * §2.6's back-edge shift could not be re-resolved offline against the cache
   * without a second sweep.
   *
   * These are the ALIGNED levels: what the operator would actually have
   * placed. On the 27 futures-shaped markets they differ from the planned
   * geometry by the tick grid and the min-stop clamp, and #472 established
   * that recovering them means running production's own `applyFuturesTickRules`
   * — so a reader without them reimplements the tick rules and inherits
   * whatever they have wrong.
   *
   * WHICH ANCHOR EACH DISTANCE USES, stated once because the emit now carries
   * three distances on TWO anchors and the difference is invisible:
   *   - `stopPivotDistance` and `runnerNearestBeyondMinimum` are measured
   *     against the PLANNED (unaligned) entry. They are geometry facts about
   *     where structure sat when the plan was built, and the stop chain and
   *     the ladder both run before alignment.
   *   - `unfilledApproachDistance` is measured against the RESTING order —
   *     the aligned entry below. It is an execution fact about how close price
   *     came to a level that actually existed in the market.
   * Both are correct and they are not interchangeable. Mixing them is the
   * defect #462 shipped and #472 found again one field over.
   */
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit1: number;
  /**
   * WHAT THE DECISION COULD SEE, per row.
   *
   * Every sweep-live divergence in the enumeration is ultimately a question
   * about visibility — which bars had completed, which events were in scope,
   * which curve row was published — and the corpus recorded the ANSWER (a
   * score, an outcome) without the inputs. So a reader could not ask whether
   * live's clock would have admitted one more daily bar, or seen one more
   * event, and had to re-derive the whole thing by hand.
   *
   * `frameTailMs` is the instant each frame stood at, per frame. It is the
   * one thing the enumeration says it had to work out by hand across fifteen
   * consumers, and it is not derivable: the frames are resampled from a
   * sliced history, so their tails are not a function of `time`.
   *
   * `availableTimeframeCount` VARIES between 4 and 5 — the manifest's
   * `min-four-by-construction` is a floor, not a value — and the 5-minute
   * frame is the one that can legitimately be absent, so the count says which
   * rows were graded with it.
   *
   * `dailyVisibleCount` and `dailyTailCompleteAtMs` answer 429/433 directly:
   * how many daily bars this decision could read, and when the newest of them
   * finished. Without the completion instant a reader cannot test whether
   * live, on a wall clock, would have admitted one more.
   *
   * The news counts and `nextHighImpactMs` answer 483/484/502 for the
   * scheduled family. The loop shapes each event down to type and impact and
   * discards the instants, so the corpus recorded a penalty with no way to
   * ask which events produced it.
   *
   * `treasuryLabelMs` is the newest curve label visible at this decision. It
   * lets the 7-day staleness predicate be applied after the fact, per row,
   * rather than assumed for the run.
   *
   * DELIBERATELY NOT EMITTED, each because it is exactly derivable and a
   * duplicate column is a second thing to be wrong:
   *   - `symbolTailMs` — the manifest's `symbols[].series[].lastTime` already
   *     carries it, and per row it would be a constant column. The
   *     enumeration invited this check rather than assuming.
   *   - `resolutionStreamStartMs` — `time + 15min` exactly (FR-5), and the
   *     offset is pinned by `analyzerVersion`.
   *   - `expiresAtMs` — derivable, but NOT by the formula this line used to
   *     state. It said "`time` plus the review hours of the calibration this
   *     row's `variant` names", and that is false for every non-crypto row
   *     whose window crosses the weekly close: `getSetupExpiryTime` returns
   *     `min(time + reviewHours, weeklyCutoff)` (replay.ts). Measured by R2b:
   *     the clamp reaches 20% of livestock's trading week and 5-6.7% of the
   *     rest. The clamp IS a pure function of (symbol, time), so any reader
   *     can apply it and no column is needed — but a reader who trusts the
   *     old sentence computes the wrong window on those rows.
   */
  frameTailMs: Record<string, number>;
  availableTimeframeCount: number;
  dailyVisibleCount: number;
  dailyTailCompleteAtMs: number;
  newsActiveCount: number;
  newsUpcomingCount: number;
  nextHighImpactMs: number | null;
  treasuryLabelMs: number | null;
  forgoneRunnerR: number | null;
  /**
   * Which protection the runner was under: the axis the give-back has to be
   * compared ACROSS, and a three-value grid dimension that varies per market
   * in shipped calibration.
   *
   * `replay.ts` records the EFFECTIVE mode (`?? "breakeven"`) precisely
   * because nothing on the row said which mode produced a given give-back.
   * The sweep passed it INTO the resolver and did not emit it, so the corpus
   * carried the consequence without the cause. Recoverable from `variant` plus
   * the manifest on grid runs only — which makes the mode knowable and the
   * quantity to compare it on unknowable, the least useful of the two halves.
   */
  runnerProtection: string;
  /**
   * WHAT THE TRIP COST, in price — and it is NOT recoverable from the ratios
   * beside it on the rows where it matters most.
   *
   * The inverse looks exact: `estimatedRoundTripCost = (grossRewardRisk −
   * rewardRisk) × riskDistance`, since `rewardRisk` IS
   * `executionQuality.effectiveRewardRisk`. But that quantity is
   * `max(0, rewardDistance − roundTrip) / riskDistance`, and the clamp bites
   * exactly when the round trip exceeds the reward — the case where cost is
   * the dominant fact about the setup. Measured on a crypto unit-risk plan
   * with a 0.155 round trip: a 0.20 reward recovers 0.155 exactly, 0.10
   * recovers 0.100 (35% understated), 0.05 recovers 0.050 (68% understated).
   *
   * The clamped value does not announce itself. It reads as a smaller, wholly
   * plausible cost, so a reader cannot tell the two apart — and under
   * `captureAll`, which is how a calibration corpus keeps its gate-failing
   * rows, those are exactly the rows in the file. R4 asking "how much of this
   * market's edge do costs eat" would have been answered with a systematic
   * UNDERSTATEMENT on the most expensive markets, which biases toward keeping
   * markets that should be declined. Amendment 39 makes that the wrong
   * direction on the measure that governs.
   *
   * The three components ride beside it because they carry different
   * remedies, not for completeness: spread says size down or wait for better
   * pricing, slippage says the window is wrong, commission says the venue is.
   * A total alone cannot separate them, and the venue cost tables are what
   * STANDS from the 2026-08-11 remediation — the one cost input R4 may lean
   * on. `modeledCostScale` is folded into the total and is a manifest-level
   * measurement term, not a per-row one.
   */
  estimatedRoundTripCost: number;
  estimatedCommission: number;
  estimatedSlippage: number;
  estimatedSpread: number;
  latestClose: number;
  stopPivotDistance: number | null;
  trendStrength: number;
  volatilityPercentile: number;
  // The planned risk unit in PRICE terms — with the legs, every half of a
  // resolution reconstructs exactly (rewardRisk alone is a ratio).
  riskDistance: number;
  rewardRisk: number;
  sessionLabel: string;
  sessionPenalty: number;
  side: string;
  // Which anchor set the stop (r14 cap-binding instrumentation).
  stopProvenance: string;
  // The other three geometry choice points, instrumented 2026-08-06 on the
  // principle stopProvenance had already proved: every mechanism that CHOOSES
  // between alternatives records which one won. stopProvenance existed and
  // exposed a months-old defect — the ATR cap destroying indices' edge. These
  // three did not exist, so the runner's structural claim, TP1's binding
  // constraint, and the entry offset's regime split were all unmeasured.
  runnerProvenance: string;
  tp1Provenance: string;
  entryProvenance: string;
  time: number;
  tp1Hit: boolean;
  // Per-method committee votes (r16 weight audit): compact
  // {n: name, d: direction, s: weighted score} per strategy.
  votes: Array<{ n: string; d: string; s: number }>;
};

export type SweepSummary = {
  // #364 round 4, finding 2: no-bars rows split out of unfilled so the
  // summary's denominators state themselves — data absence is not a
  // market verdict, at the aggregator exactly as at the resolver.
  dataAbsent: number;
  expectancyR: number;
  filled: number;
  stopRate: number;
  total: number;
  tp1HitRate: number;
  unfilled: number;
};

export type SweepResult = {
  decisionPoints: number;
  outcomes: SweepOutcomeRecord[];
  /**
   * P1: one record per rejected decision — the account the counters below
   * cannot give. A rejected decision emits no outcome row, so before this the
   * engine's whole record of what it declined was eleven integers per run, and
   * no reader could ask which BAR produced nothing or why.
   *
   * `reason` is `keyof` the counter struct, derived rather than hand-listed.
   * `belowThreshold` never appears here: it is an aggregate of the three
   * acceptance-gate branches and appending it would double-count them.
   */
  rejectionLedger: Array<{ reason: string; time: number }>;
  rejections: {
    // belowThreshold = belowConfidence + belowPayoff + regimeGated: the
    // combined acceptance-gate tally, kept for continuity; the split fields
    // attribute exactly which gate rejected (r14 acceptance audit).
    belowConfidence: number;
    belowPayoff: number;
    belowThreshold: number;
    newsBlocked: number;
    noConsensus: number;
    // 2n: decisions refused because the regime could not form — the daily
    // series was past the 40-bar context floor but under the slow EMA's
    // warmth. Its own bucket, so decision arithmetic closes and a thin
    // corpus cannot hide inside noConsensus.
    notWarm: number;
    planRejected: number;
    regimeBlocked: number;
    regimeGated: number;
    sessionBlocked: number;
    // E2's sweep half (R1b): planRejected means "buildPricePlan refused"
    // and nothing else. A constructed plan whose evaluation still comes
    // back non-resolved lands here instead — with the sweep's far-future
    // resolution clock every no-bars case resolves through the marker, so
    // the only path left is non-finite plan numbers, and that is a defect
    // to surface, not a plan verdict to blend in.
    unresolvable: number;
  };
  summary: SweepSummary;
};

// 2g's one R accountant moved into replay.ts with D2 (R1a): the resolver
// itself now writes realized R from its own legs on every filled
// resolution, and this module imports the same function for the emit —
// one arithmetic, two call sites, zero copies.

// Bucket starts memoized per (width, bar time): the sweep resamples heavily
// overlapping history windows at every decision point, so the same bar's
// bucket is asked for thousands of times, and the two Intl reads behind it
// are the expensive part. Bar times sit on a shared 15min grid, so the map's
// growth is bounded by the corpus's unique timestamps, not by decisions.
const bucketStartCache = new Map<string, number>();

function newYorkBucketStartMs(timeMs: number, minutesPerBucket: number): number {
  const key = `${minutesPerBucket}:${timeMs}`;
  const cached = bucketStartCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const parts = newYorkClockParts(timeMs);
  const bucketMinute =
    Math.floor((parts.hour * 60 + parts.minute) / minutesPerBucket) *
    minutesPerBucket;
  const start = newYorkWallClockToUtcMs(
    parts.year,
    parts.month,
    parts.day,
    Math.floor(bucketMinute / 60),
    bucketMinute % 60,
    0,
  );
  bucketStartCache.set(key, start);
  return start;
}

// 2k (2026-08-09): time-aware resampling on the provider's own grid. FMP
// intraday bars anchor to the New York wall clock — hourly at :00, 4hour at
// 00/04/08/12/16/20 NY (probed on EURUSD and ESUSD; in EST that anchor is
// NOT a UTC floor). The count-grouping this replaces had no clock at all:
// bucket boundaries shifted with the slice offset, so the same hour
// resampled differently at different decision points, and session gaps were
// silently spanned into invented bars. Buckets are keyed on each bar's own
// wall-clock reading, so a gap simply has no bucket, a fall-back repeated
// hour merges under its one wall-clock label, and a trailing partial bucket
// survives — exactly the shape a live fetch of the higher timeframe has.
export function resampleBars(bars: Bar[], minutesPerBucket: number): Bar[] {
  const resampled: Bar[] = [];
  let currentStart = Number.NaN;
  for (const bar of bars) {
    const start = newYorkBucketStartMs(bar.time, minutesPerBucket);
    const last = resampled.at(-1);
    if (last && start === currentStart) {
      last.close = bar.close;
      if (bar.high > last.high) {
        last.high = bar.high;
      }
      if (bar.low < last.low) {
        last.low = bar.low;
      }
      last.volume += bar.volume;
    } else {
      currentStart = start;
      resampled.push({
        close: bar.close,
        high: bar.high,
        low: bar.low,
        open: bar.open,
        time: start,
        volume: bar.volume,
      });
    }
  }
  return resampled;
}

// 2l (2026-08-09): the one place a replay decision's MarketContext is
// assembled, so what the committee sees is a stated fact rather than an
// inline shape. Production's committee votes over five timeframes (1min is
// filtered from the vote, strategies.ts); replay voting over four moved
// scores on 63.9% of decisions — the agreement denominator — and flipped
// sides where 5min broke a 2-2 tie. The 5min series here is a REAL fetched
// series, never a resample: admitted at the same 40-bar floor
// marketLoader.ts applies live, absent below it, exactly like a thin live
// fetch. `latest` stays the 15min decision bar — the loop's clock — whose
// close a coherent feed shares with the 5min bar ending the same instant.
export function buildDecisionMarketContext(input: {
  daily: Bar[];
  fiveMin?: Bar[];
  history: Bar[];
}): MarketContext {
  const primary = input.history.slice(-240);
  const hourly = resampleBars(input.history.slice(-960), 60).slice(-240);
  const fourHour = resampleBars(input.history.slice(-3840), 240).slice(-240);
  const timeframes: Partial<Record<Timeframe, Bar[]>> = {
    "15min": primary,
    "1day": input.daily,
    "1hour": hourly,
    "4hour": fourHour,
  };
  if ((input.fiveMin?.length ?? 0) >= 40) {
    timeframes["5min"] = input.fiveMin!.slice(-240);
  }
  // Same construction order as the live loader's availableTimeframes.
  const availableTimeframes = (["1day", ...intradayTimeframes] as Timeframe[])
    .filter((timeframe) => (timeframes[timeframe]?.length ?? 0) > 0);
  return {
    availableTimeframes,
    daily: input.daily,
    latest: input.history.at(-1)!,
    latestTimeframe: "15min",
    primary,
    primaryTimeframe: "15min",
    providerWarnings: [],
    quote: null,
    timeframes,
  };
}

export function simulateSymbol(input: {
  calibrationOverride?: Partial<CategoryCalibration>;
  // Calibration mode: evaluate outcomes for below-threshold setups too and
  // skip the regime gate, so offline analysis sees the full distribution.
  captureAll?: boolean;
  // Measurement mode: see through measurement-only session gates (the
  // low-edge hour blocks) so per-hour curves can re-derive them. Hard
  // market closures still block.
  ignoreLowEdge?: boolean;
  // Positioning history for this symbol, already leg-combined and inverted.
  // buildCotContext enforces the publication lag, so passing full history is
  // safe: only reports published before the decision bar are ever visible.
  cotReports?: CotReportRow[];
  dailyBars: Bar[];
  // 3c's engine half: decisions stop at this instant while resolution
  // keeps reading later bars — how a calendar fold's embargo guarantees
  // every setup it decides resolves inside its own fold instead of
  // truncating at the boundary or consuming the next fold's price action.
  decisionEndMs?: number;
  // Real 5min bars for the full replay window (2l). Optional so synthetic
  // fixtures can exercise the four-frame shape, but the sweep driver always
  // fetches and passes it — replay without it votes over a committee
  // production never runs.
  fiveMinuteBars?: Bar[];
  // Scheduled macro events, sorted by time ascending. Blocking and penalty
  // rules mirror the live analyzer; schedules are known in advance, so the
  // join is honest at decision time.
  newsEvents?: SweepNewsEvent[];
  primaryBars: Bar[];
  stepBars: number;
  symbol: string;
  // E6 (R1b): daily 2Y/10Y Treasury rows, sorted ascending by dateMs. Each
  // decision instant scores under calculateMacroRateAdjustment fed by the
  // two most recent rows VISIBLE at that instant (macroRates.ts's New York
  // midnight rule), exactly the arithmetic the live analyzer runs on the
  // response's two most recent rows. Optional so fixtures can exercise the
  // outage shape; the driver always loads and passes the historical curve
  // — without it every decision scores stance "unavailable", the live
  // outage semantics, and the manifest could not honestly state
  // conditions.macroAdjustment as reconstructed.
  treasuryRates?: DatedTreasuryRow[];
  warmupBars: number;
}): SweepResult {
  const calibration: CategoryCalibration = {
    ...getCategoryCalibration(input.symbol),
    ...input.calibrationOverride,
  };
  // Read ONCE per symbol, not per decision: the resolve call below runs on
  // every decision point and this is a measurement term that cannot change
  // mid-run. The sweep is the instrument, so it passes the declared scale;
  // the live resolver passes 1 (see `resolverCostOptions`).
  const modeledCostScale = modeledCostScaleFromEnv();
  const outcomes: SweepOutcomeRecord[] = [];
  // Force every simulated setup past its review window so outcomes resolve.
  const resolutionTime = (input.primaryBars.at(-1)?.time ?? 0) +
    14 * 24 * 60 * 60 * 1000;
  let decisionPoints = 0;
  // P1: THE LEDGER, beside the counters that were the only record until
  // 2026-08-24.
  //
  // A rejected decision emitted no row, so `rejections` was the whole account
  // of every decision the engine declined — eleven integers for a run. That
  // makes recoverability track DIRECTION rather than effort: a divergence
  // where the sweep is more PERMISSIVE than live leaves rows a reader can find
  // and prune, while one where the sweep is more RESTRICTIVE leaves nothing
  // but an incremented integer. Four of the eleven measured sweep-live
  // divergences are sweep-restrictive, so their populations were not
  // measurable from the corpus at all.
  //
  // It is also amendment 33's second obligation stated as an artifact
  // property. "Identifies money-positive setups at a high rate, CAN ACCOUNT
  // FOR HOW EACH WAS DERIVED, and presents figures the operator can rely on" —
  // and the amendment names the second as the one most often dropped. A
  // counter cannot say why THIS bar produced nothing.
  const rejectionLedger: Array<{ reason: string; time: number }> = [];
  const rejections = {
    belowConfidence: 0,
    belowPayoff: 0,
    belowThreshold: 0,
    newsBlocked: 0,
    noConsensus: 0,
    notWarm: 0,
    planRejected: 0,
    regimeBlocked: 0,
    regimeGated: 0,
    sessionBlocked: 0,
    unresolvable: 0,
  };
  /**
   * Record a rejection ONCE, in both places, so the two can never disagree.
   *
   * The reason type is `keyof typeof rejections` — DERIVED from the counter
   * struct rather than hand-listed. Hand-listing is how the struct itself
   * froze: `regimeGated` arrived later as an else-branch and no reader knew to
   * expect it. Add a counter and the reason exists; there is no second list to
   * forget.
   */
  // `detail` narrows the LEDGER entry without touching the COUNTER (R2b).
  // The counter struct is what every existing reader enumerates — the driver
  // copies it whole and `tests/sweep.test.ts` pins that it is passed as a
  // struct rather than a chosen subset — so a new key there would be a
  // breaking change for a detail that belongs per decision, not per run.
  const reject = (
    reason: keyof typeof rejections,
    atMs: number,
    detail?: string,
  ) => {
    rejections[reason] += 1;
    rejectionLedger.push({
      reason: detail === undefined ? reason : `${reason}:${detail}`,
      time: atMs,
    });
  };
  const newsEvents = input.newsEvents ?? [];
  // Decision points advance chronologically, so a moving pointer keeps the
  // relevant-event window scan linear across the whole simulation.
  let newsStartIndex = 0;
  // E6: the Treasury join walks the same way — rows become visible in
  // dateMs order (the visibility instant is monotone in the label date),
  // so one pointer serves every decision.
  const treasuryRates = input.treasuryRates ?? [];
  let treasuryVisible = 0;
  // 2a: what a decision may read from the daily series is bounded by each
  // bar's COMPLETION instant, not its stamp. The old time<=now filter
  // admitted the decision day's own completed OHLC at 00:00 — ATR, EMAs,
  // regime, the volatility percentile and the expected-window move all read
  // the future for the entire trading day. Completions are precomputed once
  // (Intl reads are costly) and consumed by a moving pointer like the news
  // join; weekend duplicates are already gone from the series.
  const dailySeries = completedDailySeries(input.symbol, input.dailyBars);
  let dailyVisible = 0;
  const fiveMinuteBars = input.fiveMinuteBars;
  let fiveMinVisible = 0;
  // FR-5: resolution runs on the 5min series where it exists — 3x finer
  // event ordering shrinks the ambiguous bucket honestly instead of by
  // assumption. The pointer advances monotonically with decision time;
  // the slice's end is bounded by the review window so per-decision copies
  // stay proportional to the window, not the corpus.
  let fiveMinResolveStart = 0;

  for (
    let index = input.warmupBars;
    index < input.primaryBars.length - 1;
    index += input.stepBars
  ) {
    const history = input.primaryBars.slice(0, index + 1);
    const latest = history.at(-1)!;
    if (
      input.decisionEndMs !== undefined && latest.time >= input.decisionEndMs
    ) {
      break;
    }
    while (
      dailyVisible < dailySeries.length &&
      dailySeries[dailyVisible].completeAtMs <= latest.time
    ) {
      dailyVisible += 1;
    }
    if (dailyVisible < 40) {
      continue;
    }
    const daily = dailySeries.slice(0, dailyVisible).map((entry) => entry.bar);
    decisionPoints += 1;

    if (fiveMinuteBars) {
      while (
        fiveMinVisible < fiveMinuteBars.length &&
        fiveMinuteBars[fiveMinVisible].time <= latest.time
      ) {
        fiveMinVisible += 1;
      }
    }
    while (
      treasuryVisible < treasuryRates.length &&
      treasuryVisibleAtMs(treasuryRates[treasuryVisible].dateMs) <= latest.time
    ) {
      treasuryVisible += 1;
    }
    const market = buildDecisionMarketContext({
      daily,
      // The builder only reads the tail; slicing here keeps the per-point
      // copy at 240 elements instead of the whole series.
      fiveMin: fiveMinuteBars?.slice(
        Math.max(0, fiveMinVisible - 240),
        fiveMinVisible,
      ),
      history,
    });
    // Session context is evaluated at the bar's own time, mirroring the
    // live analyzer. Session blocks (weekends, rollover, maintenance) are
    // hard closures and apply in every mode.
    let sessionContext = getSessionContext(
      input.symbol,
      new Date(latest.time),
    );
    if (input.ignoreLowEdge && sessionContext.lowEdge) {
      // Measurement mode: the hour must be scored as if ungated — the
      // lowEdge penalty (100) would otherwise reject every decision at
      // the confidence gate and the hours would stay invisible.
      sessionContext = { ...sessionContext, block: false, penalty: 0 };
    }
    if (sessionContext.block) {
      reject("sessionBlocked", latest.time);
      continue;
    }
    // News join: mirror the live analyzer's scheduled-event handling.
    // Active high-impact events block the review outright; active-medium
    // and upcoming events feed the score penalty.
    const windowStart = latest.time - NEWS_ACTIVE_BEFORE_MS;
    const upcomingEnd = latest.time + NEWS_UPCOMING_HORIZON_MS;
    while (
      newsStartIndex < newsEvents.length &&
      newsEvents[newsStartIndex].time < windowStart
    ) {
      newsStartIndex += 1;
    }
    const activeNews = [];
    const upcomingNews = [];
    // The instant of the soonest high-impact event still ahead. The loop
    // shapes every event down to type and impact, so the corpus recorded a
    // penalty with no way to ask which events produced it — 483, 484 and 502
    // all turn on the instants, not the count.
    let nextHighImpactMs: number | null = null;
    for (let n = newsStartIndex; n < newsEvents.length; n += 1) {
      const event = newsEvents[n];
      if (event.time > upcomingEnd) {
        break;
      }
      if (!isCurrencyRelevantForSymbol(input.symbol, event.currency)) {
        continue;
      }
      const shaped = { event_type: "scheduled" as const, impact: event.impact };
      if (event.time <= latest.time + NEWS_ACTIVE_AFTER_MS) {
        activeNews.push(shaped);
      } else {
        upcomingNews.push(shaped);
        if (event.impact === "high" && nextHighImpactMs === null) {
          nextHighImpactMs = event.time;
        }
      }
    }
    if (activeNews.some(isBlockingNewsEvent)) {
      reject("newsBlocked", latest.time);
      continue;
    }
    const newsPenaltyUnits = calculateNewsPenaltyUnits(
      activeNews,
      upcomingNews,
    );

    const regime = classifyRegime(market);
    if (!regime) {
      reject("notWarm", latest.time);
      continue;
    }
    if (
      !input.captureAll && calibration.blockedRegimes?.includes(regime.name)
    ) {
      reject("regimeBlocked", latest.time);
      continue;
    }
    const votes = runStrategyCommittee(input.symbol, market, regime);
    const consensus = scoreConsensus(votes, regime);
    if (!consensus.side) {
      reject("noConsensus", latest.time);
      continue;
    }
    // R2b's field list, and its only entry. This call used to omit the
    // `refusal` out-channel `buildPricePlan` already offered, so fourteen
    // distinct geometry refusals reached the corpus as the single word
    // `planRejected` — and a refused decision emits NO outcome row, so the
    // ledger's {reason, time} was the entire record of the decision.
    //
    // The COUNTER is unchanged: `rejections.planRejected` stays the aggregate
    // every existing reader counts, and no reader has to learn a new key. The
    // detail rides the LEDGER, which already carried a free-form reason and
    // was the thing saying nothing.
    const planRefusal: PlanRefusal = {};
    const plan = buildPricePlan(
      consensus.side,
      input.symbol,
      market,
      regime,
      calibration,
      planRefusal,
    );
    if (!plan) {
      // `unnamed` rather than a silent fallback: a branch added later without a
      // stamp shows up as its own bucket in the ledger instead of hiding inside
      // one of the fourteen that do name themselves.
      reject("planRejected", latest.time, planRefusal.reason ?? "unnamed");
      continue;
    }

    // Mirror the live analyzer's acceptance gates: confidence threshold and
    // effective payoff floor. E6 (R1b) resolved the three score inputs the
    // sweep used to hardwire to zero, one per term:
    // - macroAdjustment is RECONSTRUCTED — the two most recent Treasury
    //   rows visible at this instant feed the same arithmetic live runs.
    // - providerWarningCount stays 0 because zero is CORRECT BY
    //   CONSTRUCTION offline: warnings are live transport failures, and
    //   the corpus door refuses a cache that cannot prove completeness
    //   (buildDecisionMarketContext pins providerWarnings: []). The
    //   manifest states it in conditions.providerWarningCount.
    // - weightAdjustment stays 0 as a DECISION: replaying the learning
    //   table honestly means simulating its own evolution (walk-forward
    //   learning — a program, not a patch), so the corpus measures the raw
    //   engine and says so in conditions.weightAdjustment, and no reader
    //   can mistake corpus expectancy for cohort-adjusted expectancy.
    const cotContext = buildCotContext(
      input.cotReports ?? [],
      latest.time,
    );
    const macroRate = calculateMacroRateAdjustment(
      input.symbol,
      consensus.side,
      treasuryVisible >= 2
        ? treasuryContextFromRows(
          treasuryRates[treasuryVisible - 1],
          treasuryRates[treasuryVisible - 2],
        )
        : unavailableContext(
          "No Treasury rows were visible at this decision instant.",
        ),
    );
    const scoreBreakdown = scoreSetupConfidence({
      availableTimeframeCount: market.availableTimeframes.length,
      calibration,
      consensusScore: consensus.score,
      cotAdjustment: cotScoreAdjustment(
        cotContext,
        consensus.side,
        calibration.cotScoreAdjustment ?? 0,
      ),
      executionPenalty: plan.executionQuality.confidencePenalty,
      macroAdjustment: macroRate.adjustment,
      newsPenaltyUnits,
      providerWarningCount: 0,
      regimeAdjustment: calibration.regimeScoreAdjustments?.[regime.name] ?? 0,
      sessionPenalty: sessionContext.penalty,
      sideAdjustment: calibration.sideScoreAdjustments?.[consensus.side] ?? 0,
      weightAdjustment: 0,
    });
    // "Accepted" means production would take this setup, so it must honor
    // every gate — including the regime gate that capture-all bypasses for
    // record collection. Otherwise offline aggregates silently include
    // chop-regime setups the live system never trades.
    const belowConfidence =
      scoreBreakdown.confidenceScore < calibration.confidenceThreshold;
    const belowPayoff = plan.rewardRisk < calibration.minRewardRisk;
    const regimeGated = calibration.blockedRegimes?.includes(regime.name) ??
      false;
    const accepted = !belowConfidence && !belowPayoff && !regimeGated;
    if (!accepted && !input.captureAll) {
      // First failing gate wins the attribution; belowThreshold stays the
      // combined tally so long-running analyses keep their column.
      if (belowConfidence) reject("belowConfidence", latest.time);
      else if (belowPayoff) reject("belowPayoff", latest.time);
      else reject("regimeGated", latest.time);
      // AN AGGREGATE, NOT A TWELFTH REASON: it counts the three branches
      // above, so it takes the counter and NOT a ledger row — appending
      // here would double-count every rejection at this gate.
      rejections.belowThreshold += 1;
      continue;
    }

    // FR-5: the decision bar is 15min; anything stamped inside it is
    // decision-time information, so the 5min resolution stream begins at
    // the bar AFTER the decision bar completes. The TIER is not decided
    // here (#362 round 2, finding 1): resolutionSeriesFor is the one
    // admission rule for all three callers — the 5-minute tier only when
    // that series reaches back to the decision instant. The whole-corpus
    // non-empty check that stood here admitted decisions the 5-minute
    // corpus could not see the start of, grading a truncated window (or
    // resolving "unfilled" through the no-bars branch — E2's own defect,
    // reproduced by the tiering) while live graded the same shape at
    // full-window 15-minute physics. The start offset and horizon slice
    // below stay the sweep's own: the rule picks the series, the sweep
    // bounds its copy.
    let resolutionBars: ReplayBar[];
    let resolutionIntervalMs = 15 * 60 * 1000;
    const resolution = resolutionSeriesFor({
      createdAtMs: latest.time,
      fifteenMinute: input.primaryBars,
      fiveMinute: fiveMinuteBars ?? [],
    });
    if (resolution.barIntervalMs === 5 * 60 * 1000) {
      const fiveMinute = resolution.bars;
      const resolveFromMs = latest.time + 15 * 60 * 1000;
      while (
        fiveMinResolveStart < fiveMinute.length &&
        fiveMinute[fiveMinResolveStart].time < resolveFromMs
      ) {
        fiveMinResolveStart += 1;
      }
      // The review window plus a day of margin bounds the slice; the
      // resolver's own expiry filter is the exact authority.
      const horizonMs = latest.time +
        (calibration.defaultReviewHours + 24) * 60 * 60 * 1000;
      let resolveEnd = fiveMinResolveStart;
      while (
        resolveEnd < fiveMinute.length &&
        fiveMinute[resolveEnd].time <= horizonMs
      ) {
        resolveEnd += 1;
      }
      resolutionBars = fiveMinute.slice(fiveMinResolveStart, resolveEnd);
      resolutionIntervalMs = 5 * 60 * 1000;
    } else {
      resolutionBars = input.primaryBars.slice(index + 1);
    }
    // ONE RESOLUTION SHAPE, TWO COST ARMS. Everything except the cost triple
    // is identical by construction rather than by two call sites agreeing —
    // which is the mistake `resolverCostOptions` was extracted to end.
    //
    // The side is captured OUTSIDE the closure: `consensus.side` is narrowed
    // by a guard above, and a closure re-widens it to `Side | null`.
    const resolvedSide = consensus.side;
    const resolveAtScale = (scale: number) =>
      evaluateSetupOutcome(
        {
          created_at: new Date(latest.time).toISOString(),
          limit_entry: plan.entryPrice,
          side: resolvedSide,
          stop_loss: plan.stopLoss,
          symbol: input.symbol,
          take_profit: plan.takeProfit,
          take_profit_1: plan.takeProfit1,
        },
        resolutionBars,
        resolutionTime,
        {
          // Engine v2 (round-8 FR-1/3/5/7/8, LA-2): the venue's fills. The
          // spread lives in the TRIGGERS and the expiry print, gap slippage
          // in gapped exits — so the leg accountant charges only what the
          // prints cannot carry: the commission.
          //
          // M5 (2026-08-31): through `resolverCostOptions`, so the modelled
          // cost scale reaches the RESOLVER and a gross arm measures gross R.
          // These three used to be written out by hand here and again in
          // `fillOptionsFromRiskModel`, and the scale reached neither — it
          // moved `estimatedRoundTripCost` alone, which is the payoff gate.
          ...resolverCostOptions(plan.executionQuality, scale),
          barIntervalMs: resolutionIntervalMs,
          reviewHours: calibration.defaultReviewHours,
          runnerProtection: calibration.runnerProtection,
          sameBarProtectionArming: true,
          // FR-5's stream begins one decision bar after creation on BOTH
          // tiers, and the no-bars marker's could-a-completed-bar-exist
          // question must ask about this stream, not the decision bar's
          // own slot (#364 round 4, finding 1 — the Friday weekly-clamp
          // false mark).
          streamStartsAtMs: latest.time + 15 * 60 * 1000,
        },
      );

    const evaluation = resolveAtScale(modeledCostScale);
    // The gross arm: the same decision, charged E8's published commission and
    // none of our modelled spread or slippage. Resolved unconditionally rather
    // than behind a flag, because R3 is ONE re-sweep against an exhausted
    // allowance and a flag nobody set is exactly how a second one gets needed.
    const grossEvaluation = resolveAtScale(GROSS_COST_SCALE);

    // BOTH ARMS OR NEITHER. The cost options are finite on both, so a plan the
    // net arm can grade the gross arm can too — but asserting that by emitting
    // a fabricated gross outcome would be the fabrication this file refuses
    // everywhere else. A decision graded on one arm and guessed on the other
    // is not a paired comparison, and the pairing is the whole point.
    if (evaluation.state !== "resolved" || grossEvaluation.state !== "resolved") {
      // E2's sweep half (R1b): this used to wear planRejected — "no future
      // bars inside the review window" counted as a plan verdict. That
      // case now RESOLVES: the resolver's far-future clock turns every
      // no-bars window into an unfilled row carrying the
      // noBarsInReviewWindow marker, which the emit below preserves. What
      // reaches this branch is a constructed plan the resolver still could
      // not grade (non-finite plan numbers) — its own bucket, so
      // planRejected keeps one meaning and decision arithmetic stays exact.
      reject("unresolvable", latest.time);
      continue;
    }

    const feedbackNumber = (key: string) => {
      const value = Number(
        (evaluation.feedback as Record<string, unknown>)[key],
      );
      return Number.isFinite(value) ? value : null;
    };
    // The protection mode is the one realizedFields() value that is not a
    // number. Read through its own accessor rather than coerced, because
    // `Number("breakeven")` is NaN and would have been silently recorded as
    // null by the helper above — a column of nulls reading exactly like a
    // corpus where no runner was ever protected.
    const feedbackString = (key: string) => {
      const value = (evaluation.feedback as Record<string, unknown>)[key];
      return typeof value === "string" ? value : "unrecorded";
    };
    outcomes.push({
      accepted,
      confidenceScore: scoreBreakdown.confidenceScore,
      cotPercentile: cotContext.percentile,
      cotSampleSize: cotContext.sampleSize,
      cotStance: cotContext.stance,
      exitAtMs: Date.parse(evaluation.exitAt),
      executionScore: plan.executionQuality.score,
      filledAtMs: evaluation.filledAt ? Date.parse(evaluation.filledAt) : null,
      legs: evaluation.legs,
      macroAdjustment: macroRate.adjustment,
      macroStance: macroRate.stance,
      maxAdverseMove: feedbackNumber("maxAdverseMove"),
      maxFavorableMove: feedbackNumber("maxFavorableMove"),
      forgoneRunnerR: feedbackNumber("forgoneRunnerR"),
      runnerProtection: feedbackString("runnerProtection"),
      newsPenalty: newsPenaltyUnits,
      // The marker's claim is scoped to the resolution stream (#364
      // round 1, finding 2): here that stream starts after the decision
      // bar completes (FR-5 slice above), so a marked corpus row says
      // "no GRADEABLE bar overlapped the window" — the decision bar's
      // own interior, which could never grade anything, is outside the
      // evidence and outside the claim. replay.ts's marker comment
      // carries the full statement for both callers.
      ...(evaluation.feedback.noBarsInReviewWindow === true &&
        { noBarsInReviewWindow: true as const }),
      outcome: evaluation.outcome,
      runnerNearestBeyondMinimum: plan.runnerNearestBeyondMinimum,
      unfilledApproachDistance:
        evaluation.state === "resolved" &&
          evaluation.outcome === "unfilled"
          ? evaluation.unfilledApproachDistance ?? null
          : null,
      resolutionIntervalMs,
      atr: plan.atr,
      dailyAtr: plan.dailyAtr,
      grossRewardRisk: plan.grossRewardRisk,
      ladderRewardRisk: plan.ladderRewardRisk,
      entryPrice: plan.entryPrice,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit,
      takeProfit1: plan.takeProfit1,
      // Derived from the context the decision actually read, never from a
      // list: a frame added to `buildDecisionMarketContext` appears here with
      // no second edit.
      frameTailMs: Object.fromEntries(
        market.availableTimeframes.flatMap((timeframe) => {
          const tail = market.timeframes[timeframe]?.at(-1)?.time;
          return typeof tail === "number"
            ? [[timeframe as string, tail] as const]
            : [];
        }),
      ),
      availableTimeframeCount: market.availableTimeframes.length,
      dailyVisibleCount: dailyVisible,
      dailyTailCompleteAtMs: dailySeries[dailyVisible - 1].completeAtMs,
      newsActiveCount: activeNews.length,
      newsUpcomingCount: upcomingNews.length,
      nextHighImpactMs,
      treasuryLabelMs: treasuryVisible > 0
        ? treasuryRates[treasuryVisible - 1].dateMs
        : null,
      estimatedRoundTripCost: plan.executionQuality.estimatedRoundTripCost,
      estimatedCommission: plan.executionQuality.estimatedCommission,
      estimatedSlippage: plan.executionQuality.estimatedSlippage,
      estimatedSpread: plan.executionQuality.estimatedSpread,
      latestClose: plan.latestClose,
      stopPivotDistance: plan.stopPivotDistance,
      trendStrength: regime.trendStrength,
      volatilityPercentile: regime.volatilityPercentile,
      riskDistance: Math.abs(plan.entryPrice - plan.stopLoss),
      // NET, and the name collides. This `realizedR` charges commission
      // through `perLegCost` while spread and gap slippage already ride in the
      // leg prints — so the corpus's figure is fully cost-net. `replay.ts`
      // uses the SAME NAME for its GROSS twin (`perLegCost: 0`) and carries
      // `netRealizedR` beside it, which is what the Desk reads. One name, two
      // cost bases, on the measure amendment 39 governs: a reader joining the
      // corpus to a live row on `realizedR` compares net against gross.
      // THE GROSS TWIN, on the same decision. The commission is charged in
      // full on BOTH arms — it is E8's published number, not a parameter of
      // ours, and amendment 36's standard is about the latter. What differs is
      // the spread and slippage already priced into the leg prints, so the two
      // figures subtract to exactly our modelled cost on this trade.
      grossRealizedR: realizedRFromLegs({
        legs: grossEvaluation.legs,
        perLegCost: plan.executionQuality.estimatedCommission / 2,
        riskDistance: Math.abs(plan.entryPrice - plan.stopLoss),
        side: resolvedSide,
      }),
      grossOutcome: grossEvaluation.outcome,
      realizedR: realizedRFromLegs({
        legs: evaluation.legs,
        // v2: spread and slippage are IN the leg prints (bid/ask triggers,
        // gapped opens, the expiry bid) — charging them again here would
        // double-bill the trip. The commission is the one cost no print
        // can carry, and half of it rides on each full-size unit.
        perLegCost: plan.executionQuality.estimatedCommission / 2,
        riskDistance: Math.abs(plan.entryPrice - plan.stopLoss),
        side: consensus.side,
      }),
      regime: regime.name,
      rewardRisk: plan.rewardRisk,
      sessionLabel: sessionContext.label,
      sessionPenalty: sessionContext.penalty,
      side: consensus.side,
      stopProvenance: plan.stopProvenance,
      runnerProvenance: plan.runnerProvenance,
      tp1Provenance: plan.tp1Provenance,
      entryProvenance: plan.entryProvenance,
      time: latest.time,
      tp1Hit: evaluation.feedback.tp1Hit === true,
      votes: votes.map((vote) => ({
        n: vote.name,
        d: vote.direction,
        s: vote.score,
      })),
    });
  }

  return {
    decisionPoints,
    outcomes,
    rejectionLedger,
    rejections,
    // Summary keeps its accepted-only semantics in both modes.
    summary: summarizeSweepOutcomes(
      outcomes.filter((record) => record.accepted),
    ),
  };
}

export function summarizeSweepOutcomes(
  records: SweepOutcomeRecord[],
): SweepSummary {
  const total = records.length;
  const dataAbsent = records.filter((record) =>
    record.noBarsInReviewWindow === true
  ).length;
  const filledRecords = records.filter((record) =>
    record.outcome !== "unfilled"
  );
  const filled = filledRecords.length;
  const tp1Hits = filledRecords.filter((record) =>
    record.outcome === "take_profit" || record.outcome === "tp1_partial"
  ).length;
  const stops = filledRecords.filter((record) =>
    record.outcome === "stop_loss"
  ).length;
  const expectancy = filled > 0
    ? filledRecords.reduce((sum, record) => sum + record.realizedR, 0) / filled
    : 0;

  return {
    dataAbsent,
    expectancyR: roundStat(expectancy),
    filled,
    stopRate: filled > 0 ? roundStat(stops / filled) : 0,
    total,
    tp1HitRate: filled > 0 ? roundStat(tp1Hits / filled) : 0,
    unfilled: total - filled - dataAbsent,
  };
}

function roundStat(value: number) {
  return Number(value.toFixed(4));
}
