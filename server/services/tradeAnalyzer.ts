import { getCorrelationGroup, toFmpSymbol } from "../../src/lib/symbolMap";

export type OhlcvBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TradeSetup = {
  symbol: string;
  providerSymbol: string;
  side: "buy" | "sell";
  orderType: "limit";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  breakevenTriggerPrice: number;
  lotSize: number;
  confidenceScore: number;
  correlationGroup: string;
  confluence: Record<string, unknown>;
  riskModel: Record<string, unknown>;
};

export type NewsGuard = {
  highImpactWithinWindow: boolean;
  events: unknown[];
};

export class TradeAnalyzer {
  analyze(symbol: string, bars: OhlcvBar[], newsGuard: NewsGuard): TradeSetup | null {
    if (bars.length < 80) {
      return null;
    }

    if (this.shouldHaltForNews(newsGuard)) {
      return null;
    }

    const smc = this.detectSmartMoneyConcepts(bars);
    const volumeProfile = this.detectVolumeProfileImbalance(bars);
    const momentum = this.detectMomentumDivergence(bars);
    const atr = this.averageTrueRange(bars, 14);
    const structure = this.findStructureLevels(bars);
    const latest = bars.at(-1)!;
    const side = smc.bias === "bullish" && momentum.bias !== "bearish" ? "buy" : "sell";
    const entryPrice = side === "buy" ? Math.min(smc.limitLevel, latest.close - atr * 0.1) : Math.max(smc.limitLevel, latest.close + atr * 0.1);
    const stopLoss =
      side === "buy" ? Math.max(0.00001, structure.latestSwingLow - atr * 1.5) : structure.latestSwingHigh + atr * 1.5;
    const takeProfit = side === "buy" ? structure.nextLiquidityHigh : structure.nextLiquidityLow;
    const confidenceScore = this.scoreConfluence([smc.score, volumeProfile.score, momentum.score]);

    if (confidenceScore < 60 || Math.abs(entryPrice - stopLoss) === 0 || !this.isValidLimitPlan(side, latest.close, entryPrice, stopLoss, takeProfit)) {
      return null;
    }

    return {
      symbol,
      providerSymbol: toFmpSymbol(symbol),
      side,
      orderType: "limit",
      entryPrice,
      stopLoss,
      takeProfit,
      breakevenTriggerPrice: entryPrice + (takeProfit - entryPrice) * 0.5,
      lotSize: 0.01,
      confidenceScore,
      correlationGroup: getCorrelationGroup(symbol),
      confluence: {
        smartMoneyConcepts: smc,
        volumeProfile,
        momentum,
      },
      riskModel: {
        atr,
        positionSizingStatus: "not_calculated",
        positionSizingReason: "Local analyzer scaffold records market setups only.",
      },
    };
  }

  private shouldHaltForNews(newsGuard: NewsGuard) {
    return newsGuard.highImpactWithinWindow;
  }

  private detectSmartMoneyConcepts(bars: OhlcvBar[]) {
    const latest = bars.at(-1)!;
    const previous = bars.at(-2)!;
    const swing = this.findStructureLevels(bars);
    const sweptLow = latest.low < swing.latestSwingLow && latest.close > previous.close;
    const sweptHigh = latest.high > swing.latestSwingHigh && latest.close < previous.close;
    const bias = sweptLow ? "bullish" : sweptHigh ? "bearish" : latest.close > previous.close ? "bullish" : "bearish";
    const limitLevel = bias === "bullish" ? Math.min(previous.open, previous.close) : Math.max(previous.open, previous.close);

    return {
      bias,
      fairValueGap: Math.abs(previous.high - latest.low) > this.averageTrueRange(bars, 14) * 0.35,
      liquiditySweep: sweptLow || sweptHigh,
      changeOfCharacter: latest.close > swing.latestSwingHigh || latest.close < swing.latestSwingLow,
      limitLevel,
      score: 20 + Number(sweptLow || sweptHigh) * 15 + Number(latest.close !== previous.close) * 10,
    };
  }

  private detectVolumeProfileImbalance(bars: OhlcvBar[]) {
    const recent = bars.slice(-50);
    const volumeWeightedPrice =
      recent.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / recent.reduce((sum, bar) => sum + bar.volume, 0);
    const latest = bars.at(-1)!;
    const distance = Math.abs(latest.close - volumeWeightedPrice) / latest.close;

    return {
      pointOfControl: volumeWeightedPrice,
      imbalancePct: distance * 100,
      pocRetest: distance < 0.0015,
      score: distance < 0.0015 ? 25 : distance < 0.004 ? 15 : 5,
    };
  }

  private detectMomentumDivergence(bars: OhlcvBar[]) {
    const recent = bars.slice(-20);
    const first = recent[0];
    const latest = recent.at(-1)!;
    const rsi = this.relativeStrengthIndex(bars, 14);
    const macdSlope = this.ema(bars.map((bar) => bar.close), 12) - this.ema(bars.map((bar) => bar.close), 26);
    const priceBias = latest.close >= first.close ? "bullish" : "bearish";
    const oscillatorBias = rsi > 55 || macdSlope > 0 ? "bullish" : rsi < 45 || macdSlope < 0 ? "bearish" : "neutral";

    return {
      rsi,
      macdSlope,
      bias: oscillatorBias,
      divergence: priceBias !== oscillatorBias && oscillatorBias !== "neutral",
      score: oscillatorBias === "neutral" ? 5 : priceBias === oscillatorBias ? 25 : 15,
    };
  }

  private scoreConfluence(scores: number[]) {
    const score = scores.reduce((sum, value) => sum + value, 0);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private isValidLimitPlan(side: "buy" | "sell", latestClose: number, entry: number, stopLoss: number, takeProfit: number) {
    if (side === "buy") {
      return entry < latestClose && stopLoss < entry && takeProfit > entry;
    }

    return entry > latestClose && stopLoss > entry && takeProfit < entry;
  }

  private averageTrueRange(bars: OhlcvBar[], period: number) {
    const sample = bars.slice(-period - 1);
    const ranges = sample.slice(1).map((bar, index) => {
      const previousClose = sample[index].close;
      return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
    });

    return ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
  }

  private findStructureLevels(bars: OhlcvBar[]) {
    const recent = bars.slice(-40);
    const latestSwingHigh = Math.max(...recent.slice(0, -5).map((bar) => bar.high));
    const latestSwingLow = Math.min(...recent.slice(0, -5).map((bar) => bar.low));
    const nextLiquidityHigh = Math.max(...recent.map((bar) => bar.high));
    const nextLiquidityLow = Math.min(...recent.map((bar) => bar.low));

    return {
      latestSwingHigh,
      latestSwingLow,
      nextLiquidityHigh,
      nextLiquidityLow,
    };
  }

  private relativeStrengthIndex(bars: OhlcvBar[], period: number) {
    const closes = bars.slice(-period - 1).map((bar) => bar.close);
    let gains = 0;
    let losses = 0;

    for (let index = 1; index < closes.length; index += 1) {
      const delta = closes[index] - closes[index - 1];
      gains += Math.max(delta, 0);
      losses += Math.max(-delta, 0);
    }

    if (losses === 0) {
      return 100;
    }

    const relativeStrength = gains / losses;
    return 100 - 100 / (1 + relativeStrength);
  }

  private ema(values: number[], period: number) {
    const smoothing = 2 / (period + 1);
    return values.slice(-period * 3).reduce((ema, value) => value * smoothing + ema * (1 - smoothing), values[0]);
  }
}
