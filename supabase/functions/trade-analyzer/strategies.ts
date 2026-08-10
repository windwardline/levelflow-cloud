import { getAssetType } from "./calibration.ts";
import {
  averageTrueRange,
  directionalBias,
  ema,
  findStructureLevels,
  percentileRank,
  relativeStrengthIndex,
  rollingAtr,
} from "./indicators.ts";
import { applyStrategyProfile } from "./strategyProfiles.ts";
import type {
  Direction,
  MarketContext,
  Regime,
  Side,
  StrategyVote,
} from "./types.ts";

export function runStrategyCommittee(
  symbol: string,
  market: MarketContext,
  regime: Regime,
) {
  const votes: StrategyVote[] = [
    voteMultiTimeframeAlignment(market, regime),
    voteSmartMoneyConcepts(market),
    voteTrendPullback(market, regime),
    voteBreakoutFailure(market),
    voteRangeMeanReversion(market, regime),
    voteMomentumDivergence(market),
    voteVolatilityExpansion(market, regime),
    voteVolumeProfile(market),
  ];

  return applyStrategyProfile(getAssetType(symbol), votes).filter((vote) =>
    vote.score > 0 || vote.direction === "block"
  );
}

export function scoreConsensus(votes: StrategyVote[], regime: Regime) {
  const buyScore = votes.filter((vote) => vote.direction === "buy").reduce(
    (sum, vote) => sum + vote.score,
    0,
  );
  const sellScore = votes.filter((vote) => vote.direction === "sell").reduce(
    (sum, vote) => sum + vote.score,
    0,
  );
  const blockScore = votes.filter((vote) => vote.direction === "block").reduce(
    (sum, vote) => sum + vote.score,
    0,
  );
  const totalDirectional = buyScore + sellScore;

  if (blockScore >= 30 || totalDirectional < 42) {
    return {
      buyScore,
      sellScore,
      blockScore,
      score: 0,
      side: null as Side | null,
    };
  }

  const side: Side = buyScore >= sellScore ? "buy" : "sell";
  const winningScore = Math.max(buyScore, sellScore);
  const opposingScore = Math.min(buyScore, sellScore);
  const agreementRatio = winningScore / Math.max(totalDirectional, 1);
  const regimeBonus = regime.bias === side
    ? 8
    : regime.bias === "neutral"
    ? 2
    : -8;
  const score = clampInteger(
    Math.round(
      30 + winningScore * 0.72 - opposingScore * 0.55 + agreementRatio * 18 +
        regimeBonus,
    ),
    0,
    100,
  );

  return {
    agreementRatio: Number(agreementRatio.toFixed(3)),
    blockScore,
    buyScore,
    score,
    sellScore,
    side,
  };
}

// 2n (2026-08-09): null when the daily series cannot warm the slow EMA — a
// regime "classified" from an abstaining input is a guess wearing a label.
// The sweep counts these refusals in their own notWarm bucket; the live
// loader's >=80-bar sufficiency makes them unreachable in production, and
// the shared engine still refuses honestly if that ever changes.
export function classifyRegime(market: MarketContext): Regime | null {
  const bars = market.daily;
  const latest = bars.at(-1);
  const closes = bars.map((bar) => bar.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  if (!latest || ema20 === null || ema50 === null) {
    return null;
  }
  const atr = averageTrueRange(bars, 14);
  const atrHistory = rollingAtr(bars, 14).slice(-80);
  const volatilityPercentile = percentileRank(atrHistory, atr);
  const trendStrength = Math.abs(ema20 - ema50) / Math.max(atr, 0.00001);
  const compression = volatilityPercentile < 0.28 && trendStrength < 0.9;
  const bias: Direction = latest.close > ema20 && ema20 > ema50
    ? "buy"
    : latest.close < ema20 && ema20 < ema50
    ? "sell"
    : "neutral";

  if (compression) {
    return {
      bias,
      name: "compression",
      rationale:
        "Volatility is compressed and directional trend strength is modest.",
      trendStrength: Number(trendStrength.toFixed(3)),
      volatilityPercentile: Number(volatilityPercentile.toFixed(3)),
    };
  }

  if (volatilityPercentile > 0.78 && trendStrength < 1.1) {
    return {
      bias: "neutral",
      name: "volatile_chop",
      rationale: "Volatility is elevated without clean trend separation.",
      trendStrength: Number(trendStrength.toFixed(3)),
      volatilityPercentile: Number(volatilityPercentile.toFixed(3)),
    };
  }

  if (trendStrength > 0.95 && bias !== "neutral") {
    return {
      bias,
      name: "trend",
      rationale:
        "Moving average separation and price location support a trend regime.",
      trendStrength: Number(trendStrength.toFixed(3)),
      volatilityPercentile: Number(volatilityPercentile.toFixed(3)),
    };
  }

  return {
    bias: "neutral",
    name: "range",
    rationale:
      "Trend separation is limited; range and failed-breakout behavior should carry more weight.",
    trendStrength: Number(trendStrength.toFixed(3)),
    volatilityPercentile: Number(volatilityPercentile.toFixed(3)),
  };
}

function voteMultiTimeframeAlignment(
  market: MarketContext,
  regime: Regime,
): StrategyVote {
  const reviewTimeframes = market.availableTimeframes.filter((timeframe) =>
    timeframe !== "1min"
  );
  const timeframeBiases = reviewTimeframes.map((timeframe) => ({
    direction: directionalBias(market.timeframes[timeframe] ?? []),
    timeframe,
  }));
  const buyCount =
    timeframeBiases.filter((bias) => bias.direction === "buy").length;
  const sellCount =
    timeframeBiases.filter((bias) => bias.direction === "sell").length;
  const direction: Direction = buyCount > sellCount
    ? "buy"
    : sellCount > buyCount
    ? "sell"
    : "neutral";
  const alignedWithRegime = regime.bias === direction;
  const agreement = Math.max(buyCount, sellCount) /
    Math.max(timeframeBiases.length, 1);

  return {
    confidence: Number(agreement.toFixed(2)),
    direction,
    name: "multi_timeframe_bias",
    rationale: `${
      Math.max(buyCount, sellCount)
    } of ${timeframeBiases.length} available timeframes align${
      alignedWithRegime ? " with the higher-timeframe regime" : ""
    }.`,
    score: direction === "neutral"
      ? 5
      : Math.round(14 + agreement * 16 + Number(alignedWithRegime) * 6),
    timeframe: "multi",
  };
}

function voteSmartMoneyConcepts(market: MarketContext): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const swing = findStructureLevels(bars);
  const atr = averageTrueRange(bars, 14);
  const sweptLow = latest.low < swing.latestSwingLow &&
    latest.close > previous.close;
  const sweptHigh = latest.high > swing.latestSwingHigh &&
    latest.close < previous.close;
  const fairValueGap = Math.abs(previous.high - latest.low) > atr * 0.35 ||
    Math.abs(latest.high - previous.low) > atr * 0.35;
  const changeOfCharacter = latest.close > swing.latestSwingHigh ||
    latest.close < swing.latestSwingLow;
  const direction: Direction = sweptLow
    ? "buy"
    : sweptHigh
    ? "sell"
    : changeOfCharacter
    ? (latest.close > previous.close ? "buy" : "sell")
    : "neutral";
  const score = direction === "neutral"
    ? 8
    : 18 + Number(sweptLow || sweptHigh) * 16 + Number(fairValueGap) * 8 +
      Number(changeOfCharacter) * 8;

  return {
    confidence: Number((score / 46).toFixed(2)),
    direction,
    name: "smart_money_liquidity",
    rationale: sweptLow
      ? "Liquidity sweep below structure with bullish recovery."
      : sweptHigh
      ? "Liquidity sweep above structure with bearish rejection."
      : "No clean liquidity sweep; structure still informs invalidation.",
    score,
    timeframe: market.primaryTimeframe,
  };
}

function voteTrendPullback(
  market: MarketContext,
  regime: Regime,
): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const closes = bars.map((bar) => bar.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const atr = averageTrueRange(bars, 14);
  // Unwarm EMAs abstain (2m): no value zone can be measured, so no vote.
  const warm = ema20 !== null && ema50 !== null;
  const nearValue = warm &&
    (Math.abs(latest.close - ema20) <= atr * 0.75 ||
      Math.abs(latest.close - ema50) <= atr * 0.9);
  const upTrend = warm && latest.close > ema50 && ema20 > ema50;
  const downTrend = warm && latest.close < ema50 && ema20 < ema50;
  const direction: Direction = regime.name === "trend" && nearValue && upTrend
    ? "buy"
    : regime.name === "trend" && nearValue && downTrend
    ? "sell"
    : "neutral";

  return {
    confidence: direction === "neutral" ? 0.2 : 0.74,
    direction,
    name: "trend_pullback_to_value",
    rationale: direction === "neutral"
      ? "Trend pullback conditions are not clean enough."
      : "Trend regime is active and price is pulling back toward value.",
    score: direction === "neutral" ? 4 : 26,
    timeframe: market.primaryTimeframe,
  };
}

function voteBreakoutFailure(market: MarketContext): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const structure = findStructureLevels(bars);
  const brokeHigh = previous.close <= structure.latestSwingHigh &&
    latest.close > structure.latestSwingHigh;
  const brokeLow = previous.close >= structure.latestSwingLow &&
    latest.close < structure.latestSwingLow;
  const failedHigh = latest.high > structure.latestSwingHigh &&
    latest.close < structure.latestSwingHigh;
  const failedLow = latest.low < structure.latestSwingLow &&
    latest.close > structure.latestSwingLow;
  const direction: Direction = brokeHigh || failedLow
    ? "buy"
    : brokeLow || failedHigh
    ? "sell"
    : "neutral";
  const failure = failedHigh || failedLow;

  return {
    confidence: direction === "neutral" ? 0.15 : failure ? 0.76 : 0.68,
    direction,
    name: failure ? "failed_breakout_reversal" : "breakout_continuation",
    rationale: failure
      ? "A failed break outside structure signals reversal risk."
      : direction === "neutral"
      ? "No decisive structure break."
      : "Price closed beyond recent structure.",
    score: direction === "neutral" ? 5 : failure ? 24 : 21,
    timeframe: market.primaryTimeframe,
  };
}

function voteRangeMeanReversion(
  market: MarketContext,
  regime: Regime,
): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const range = findStructureLevels(bars);
  const width = Math.max(
    range.nextLiquidityHigh - range.nextLiquidityLow,
    0.00001,
  );
  const location = (latest.close - range.nextLiquidityLow) / width;
  // A frozen or thin series has no oscillator reading (2m) — no edge vote.
  const rsi = relativeStrengthIndex(bars, 14);
  const buy = regime.name === "range" && location < 0.22 && rsi !== null &&
    rsi < 42;
  const sell = regime.name === "range" && location > 0.78 && rsi !== null &&
    rsi > 58;
  const direction: Direction = buy ? "buy" : sell ? "sell" : "neutral";

  return {
    confidence: direction === "neutral" ? 0.15 : 0.7,
    direction,
    name: "range_mean_reversion",
    rationale: direction === "neutral"
      ? "Range edge and oscillator conditions are not aligned."
      : "Range regime with price extended at an edge and oscillator support.",
    score: direction === "neutral" ? 4 : 22,
    timeframe: market.primaryTimeframe,
  };
}

function voteMomentumDivergence(market: MarketContext): StrategyVote {
  const bars = market.primary;
  const recent = bars.slice(-24);
  const first = recent[0];
  const latest = recent.at(-1)!;
  const rsi = relativeStrengthIndex(bars, 14);
  const closes = bars.map((bar) => bar.close);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  // Both oscillator legs may abstain (2m): a null RSI on a frozen series
  // used to read as 100 here and fire a buy against range-reversion's
  // simultaneous overbought sell — one degenerate input, two opposite votes.
  const macdSlope = ema12 !== null && ema26 !== null ? ema12 - ema26 : null;
  const priceBias: Direction = latest.close >= first.close ? "buy" : "sell";
  const oscillatorBias: Direction =
    (rsi !== null && rsi > 55) || (macdSlope !== null && macdSlope > 0)
      ? "buy"
      : (rsi !== null && rsi < 45) || (macdSlope !== null && macdSlope < 0)
      ? "sell"
      : "neutral";
  const divergence = priceBias !== oscillatorBias &&
    oscillatorBias !== "neutral";
  const direction = oscillatorBias;

  return {
    confidence: oscillatorBias === "neutral" ? 0.2 : divergence ? 0.62 : 0.72,
    direction,
    name: divergence ? "momentum_divergence" : "momentum_confirmation",
    rationale: divergence
      ? "Price direction and oscillator direction diverge."
      : "RSI and MACD slope support directional momentum.",
    score: oscillatorBias === "neutral" ? 5 : divergence ? 18 : 24,
    timeframe: market.primaryTimeframe,
  };
}

function voteVolatilityExpansion(
  market: MarketContext,
  regime: Regime,
): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const atr = averageTrueRange(bars, 14);
  const body = Math.abs(latest.close - latest.open);
  const expanding = body > atr * 0.8 &&
    Math.abs(latest.close - previous.close) > atr * 0.55;
  const direction: Direction = expanding
    ? (latest.close > latest.open ? "buy" : "sell")
    : "neutral";
  const compressionBonus = regime.name === "compression" ? 8 : 0;

  return {
    confidence: direction === "neutral" ? 0.1 : 0.7,
    direction,
    name: "volatility_expansion",
    rationale: direction === "neutral"
      ? "No clean expansion candle after compression."
      : "Range expansion suggests directional participation.",
    score: direction === "neutral" ? 3 : 18 + compressionBonus,
    timeframe: market.primaryTimeframe,
  };
}

function voteVolumeProfile(market: MarketContext): StrategyVote {
  const bars = market.primary.slice(-100);
  const latest = bars.at(-1)!;
  const totalVolume = bars.reduce((sum, bar) => sum + (bar.volume || 1), 0) ||
    bars.length;
  const pointOfControl =
    bars.reduce((sum, bar) => sum + bar.close * (bar.volume || 1), 0) /
    totalVolume;
  const atr = averageTrueRange(bars, 14);
  const nearPoc = Math.abs(latest.close - pointOfControl) <= atr * 0.35;
  const stretchedAbove = latest.close > pointOfControl + atr * 1.1;
  const stretchedBelow = latest.close < pointOfControl - atr * 1.1;
  const direction: Direction = nearPoc
    ? directionalBias(bars)
    : stretchedBelow
    ? "buy"
    : stretchedAbove
    ? "sell"
    : "neutral";

  return {
    confidence: direction === "neutral" ? 0.18 : nearPoc ? 0.62 : 0.56,
    direction,
    name: nearPoc ? "volume_value_retest" : "volume_value_extension",
    rationale: nearPoc
      ? "Price is retesting volume-weighted value."
      : "Price is extended away from volume-weighted value.",
    score: direction === "neutral" ? 5 : nearPoc ? 18 : 14,
    timeframe: market.primaryTimeframe,
  };
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}
