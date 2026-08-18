import { newYorkClockParts, newYorkWallClockToUtcMs } from "./bars.ts";
import {
  type CategoryCalibration,
  getCategoryCalibration,
} from "./calibration.ts";
import { completedDailySeries } from "./dailyCompletion.ts";
import { buildPricePlan } from "./pricePlan.ts";
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
  time: number;
};

export type SweepOutcomeRecord = {
  // False when the setup failed the confidence/payoff gates but was still
  // evaluated (capture-all calibration mode).
  accepted: boolean;
  confidenceScore: number;
  cotPercentile: number | null;
  cotStance: string;
  // The resolver's evidence, carried whole (4b's input — the map's
  // "captured and simply never read"): the gap-aware execution legs, the
  // exit and fill instants, both excursion statistics against the nominal
  // entry, and whether TP1 banked. Geometry review reads these from the
  // corpus instead of re-simulating.
  exitAtMs: number;
  filledAtMs: number | null;
  legs: ResolutionLeg[];
  // E6 (R1b): the reconstructed Treasury-curve adjustment this row was
  // scored under — recorded per row like newsPenalty and sessionPenalty,
  // on the stopProvenance principle: every input that moves a score is a
  // measurable column, never an assumed constant.
  macroAdjustment: number;
  maxAdverseMove: number | null;
  maxFavorableMove: number | null;
  newsPenalty: number;
  // E2 (R1b): the resolver's data-absence marker, carried into the corpus
  // so a cohort read can separate "the provider had no bars inside the
  // review window" from a market that genuinely never filled the limit.
  noBarsInReviewWindow?: true;
  outcome: Exclude<ResolvedOutcome, "pending">;
  realizedR: number;
  regime: string;
  // E1's tier, per row (emit symmetry with the live writers'
  // feedback.resolutionIntervalMs): 300000 when the 5-minute series
  // resolved this row, 900000 when it degraded to 15-minute physics.
  resolutionIntervalMs: number;
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
  const outcomes: SweepOutcomeRecord[] = [];
  // Force every simulated setup past its review window so outcomes resolve.
  const resolutionTime = (input.primaryBars.at(-1)?.time ?? 0) +
    14 * 24 * 60 * 60 * 1000;
  let decisionPoints = 0;
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
      rejections.sessionBlocked += 1;
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
      }
    }
    if (activeNews.some(isBlockingNewsEvent)) {
      rejections.newsBlocked += 1;
      continue;
    }
    const newsPenaltyUnits = calculateNewsPenaltyUnits(
      activeNews,
      upcomingNews,
    );

    const regime = classifyRegime(market);
    if (!regime) {
      rejections.notWarm += 1;
      continue;
    }
    if (
      !input.captureAll && calibration.blockedRegimes?.includes(regime.name)
    ) {
      rejections.regimeBlocked += 1;
      continue;
    }
    const votes = runStrategyCommittee(input.symbol, market, regime);
    const consensus = scoreConsensus(votes, regime);
    if (!consensus.side) {
      rejections.noConsensus += 1;
      continue;
    }
    const plan = buildPricePlan(
      consensus.side,
      input.symbol,
      market,
      regime,
      calibration,
    );
    if (!plan) {
      rejections.planRejected += 1;
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
      if (belowConfidence) rejections.belowConfidence += 1;
      else if (belowPayoff) rejections.belowPayoff += 1;
      else rejections.regimeGated += 1;
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
    const evaluation = evaluateSetupOutcome(
      {
        created_at: new Date(latest.time).toISOString(),
        limit_entry: plan.entryPrice,
        side: consensus.side,
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
        barIntervalMs: resolutionIntervalMs,
        gapExitSlippage: plan.executionQuality.estimatedSlippage,
        halfSpread: plan.executionQuality.estimatedSpread / 2,
        reviewHours: calibration.defaultReviewHours,
        roundTripCost: plan.executionQuality.estimatedCommission,
        runnerProtection: calibration.runnerProtection,
        sameBarProtectionArming: true,
      },
    );
    if (evaluation.state !== "resolved") {
      // E2's sweep half (R1b): this used to wear planRejected — "no future
      // bars inside the review window" counted as a plan verdict. That
      // case now RESOLVES: the resolver's far-future clock turns every
      // no-bars window into an unfilled row carrying the
      // noBarsInReviewWindow marker, which the emit below preserves. What
      // reaches this branch is a constructed plan the resolver still could
      // not grade (non-finite plan numbers) — its own bucket, so
      // planRejected keeps one meaning and decision arithmetic stays exact.
      rejections.unresolvable += 1;
      continue;
    }

    const feedbackNumber = (key: string) => {
      const value = Number(
        (evaluation.feedback as Record<string, unknown>)[key],
      );
      return Number.isFinite(value) ? value : null;
    };
    outcomes.push({
      accepted,
      confidenceScore: scoreBreakdown.confidenceScore,
      cotPercentile: cotContext.percentile,
      cotStance: cotContext.stance,
      exitAtMs: Date.parse(evaluation.exitAt),
      filledAtMs: evaluation.filledAt ? Date.parse(evaluation.filledAt) : null,
      legs: evaluation.legs,
      macroAdjustment: macroRate.adjustment,
      maxAdverseMove: feedbackNumber("maxAdverseMove"),
      maxFavorableMove: feedbackNumber("maxFavorableMove"),
      newsPenalty: newsPenaltyUnits,
      ...(evaluation.feedback.noBarsInReviewWindow === true &&
        { noBarsInReviewWindow: true as const }),
      outcome: evaluation.outcome,
      resolutionIntervalMs,
      riskDistance: Math.abs(plan.entryPrice - plan.stopLoss),
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
    expectancyR: roundStat(expectancy),
    filled,
    stopRate: filled > 0 ? roundStat(stops / filled) : 0,
    total,
    tp1HitRate: filled > 0 ? roundStat(tp1Hits / filled) : 0,
    unfilled: total - filled,
  };
}

function roundStat(value: number) {
  return Number(value.toFixed(4));
}
