import {
  type CategoryCalibration,
  getCategoryCalibration,
} from "./calibration.ts";
import { buildPricePlan } from "./pricePlan.ts";
import {
  evaluateSetupOutcome,
  type ReplayBar,
  type ResolvedOutcome,
} from "./replay.ts";
import {
  buildCotContext,
  type CotReportRow,
  cotScoreAdjustment,
} from "./cotContext.ts";
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
import type { Bar, MarketContext } from "./types.ts";

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
  newsPenalty: number;
  outcome: Exclude<ResolvedOutcome, "pending">;
  realizedR: number;
  regime: string;
  rewardRisk: number;
  sessionLabel: string;
  sessionPenalty: number;
  side: string;
  time: number;
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
    belowThreshold: number;
    newsBlocked: number;
    noConsensus: number;
    planRejected: number;
    regimeBlocked: number;
    sessionBlocked: number;
  };
  summary: SweepSummary;
};

export function resampleBars(bars: Bar[], groupSize: number): Bar[] {
  const resampled: Bar[] = [];
  for (let index = 0; index + groupSize <= bars.length; index += groupSize) {
    const group = bars.slice(index, index + groupSize);
    resampled.push({
      close: group.at(-1)!.close,
      high: Math.max(...group.map((bar) => bar.high)),
      low: Math.min(...group.map((bar) => bar.low)),
      open: group[0].open,
      time: group[0].time,
      volume: group.reduce((sum, bar) => sum + bar.volume, 0),
    });
  }
  return resampled;
}

export function simulateSymbol(input: {
  calibrationOverride?: Partial<CategoryCalibration>;
  // Calibration mode: evaluate outcomes for below-threshold setups too and
  // skip the regime gate, so offline analysis sees the full distribution.
  captureAll?: boolean;
  // Positioning history for this symbol, already leg-combined and inverted.
  // buildCotContext enforces the publication lag, so passing full history is
  // safe: only reports published before the decision bar are ever visible.
  cotReports?: CotReportRow[];
  dailyBars: Bar[];
  // Scheduled macro events, sorted by time ascending. Blocking and penalty
  // rules mirror the live analyzer; schedules are known in advance, so the
  // join is honest at decision time.
  newsEvents?: SweepNewsEvent[];
  primaryBars: Bar[];
  stepBars: number;
  symbol: string;
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
    belowThreshold: 0,
    newsBlocked: 0,
    noConsensus: 0,
    planRejected: 0,
    regimeBlocked: 0,
    sessionBlocked: 0,
  };
  const newsEvents = input.newsEvents ?? [];
  // Decision points advance chronologically, so a moving pointer keeps the
  // relevant-event window scan linear across the whole simulation.
  let newsStartIndex = 0;

  for (
    let index = input.warmupBars;
    index < input.primaryBars.length - 1;
    index += input.stepBars
  ) {
    const history = input.primaryBars.slice(0, index + 1);
    const latest = history.at(-1)!;
    const daily = input.dailyBars.filter((bar) => bar.time <= latest.time);
    if (daily.length < 40) {
      continue;
    }
    decisionPoints += 1;

    const primary = history.slice(-240);
    // Mirror the live analyzer's timeframe coverage by resampling 15min bars.
    const hourly = resampleBars(history.slice(-960), 4).slice(-240);
    const fourHour = resampleBars(history.slice(-3840), 16).slice(-240);
    const market: MarketContext = {
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      daily,
      latest,
      latestTimeframe: "15min",
      primary,
      primaryTimeframe: "15min",
      providerWarnings: [],
      quote: null,
      timeframes: {
        "15min": primary,
        "1day": daily,
        "1hour": hourly,
        "4hour": fourHour,
      },
    };
    // Session context is evaluated at the bar's own time, mirroring the
    // live analyzer. Session blocks (weekends, rollover, maintenance) are
    // hard closures and apply in every mode.
    const sessionContext = getSessionContext(
      input.symbol,
      new Date(latest.time),
    );
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
    // effective payoff floor. News, session, macro, and learning inputs are
    // zero offline, matching a clean-conditions review.
    const cotContext = buildCotContext(
      input.cotReports ?? [],
      latest.time,
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
      macroAdjustment: 0,
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
    const accepted =
      scoreBreakdown.confidenceScore >= calibration.confidenceThreshold &&
      plan.rewardRisk >= calibration.minRewardRisk &&
      !calibration.blockedRegimes?.includes(regime.name);
    if (!accepted && !input.captureAll) {
      rejections.belowThreshold += 1;
      continue;
    }

    const futureBars: ReplayBar[] = input.primaryBars.slice(index + 1);
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
      futureBars,
      resolutionTime,
    );
    if (evaluation.state !== "resolved") {
      // No future bars inside the review window; count with plan rejections
      // so decision-point accounting stays exact.
      rejections.planRejected += 1;
      continue;
    }

    outcomes.push({
      accepted,
      confidenceScore: scoreBreakdown.confidenceScore,
      cotPercentile: cotContext.percentile,
      cotStance: cotContext.stance,
      newsPenalty: newsPenaltyUnits,
      outcome: evaluation.outcome,
      realizedR: realizedRFor(evaluation.outcome, evaluation.feedback, plan),
      regime: regime.name,
      rewardRisk: plan.rewardRisk,
      sessionLabel: sessionContext.label,
      sessionPenalty: sessionContext.penalty,
      side: consensus.side,
      time: latest.time,
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

function realizedRFor(
  outcome: Exclude<ResolvedOutcome, "pending">,
  feedback: Record<string, unknown>,
  plan: { entryPrice: number; stopLoss: number; takeProfit: number; takeProfit1: number },
) {
  const risk = Math.abs(plan.entryPrice - plan.stopLoss);
  if (risk <= 0) {
    return 0;
  }
  const runnerR = Math.abs(plan.takeProfit - plan.entryPrice) / risk;
  const tp1R = Math.abs(plan.takeProfit1 - plan.entryPrice) / risk;

  // Ladder accounting: half the position banks at TP1, half rides the runner.
  switch (outcome) {
    case "take_profit":
      return roundStat(0.5 * tp1R + 0.5 * runnerR);
    case "tp1_partial":
      return roundStat(0.5 * tp1R);
    case "stop_loss":
      return -1;
    case "expired_in_profit":
    case "expired_at_loss": {
      const realized = Number(feedback.realizedR);
      return Number.isFinite(realized) ? realized : 0;
    }
    default:
      return 0;
  }
}

function roundStat(value: number) {
  return Number(value.toFixed(4));
}
