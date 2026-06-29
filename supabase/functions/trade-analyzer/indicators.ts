import type { Bar, Direction } from "./types.ts";

export function directionalBias(bars: Bar[]): Direction {
  if (bars.length < 30) {
    return "neutral";
  }
  const latest = bars.at(-1)!;
  const closes = bars.map((bar) => bar.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  if (latest.close > ema20 && ema20 >= ema50) {
    return "buy";
  }
  if (latest.close < ema20 && ema20 <= ema50) {
    return "sell";
  }
  return "neutral";
}

export function findStructureLevels(bars: Bar[]) {
  const recent = bars.slice(-80);
  const structureSample = recent.slice(0, Math.max(1, recent.length - 5));
  return {
    latestSwingHigh: Math.max(...structureSample.map((bar) => bar.high)),
    latestSwingLow: Math.min(...structureSample.map((bar) => bar.low)),
    nextLiquidityHigh: Math.max(...recent.map((bar) => bar.high)),
    nextLiquidityLow: Math.min(...recent.map((bar) => bar.low)),
  };
}

export function averageTrueRange(bars: Bar[], period: number) {
  if (bars.length < 2) {
    return 0;
  }
  const sample = bars.slice(-period - 1);
  const ranges = sample.slice(1).map((bar, index) => {
    const previousClose = sample[index].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });
  return ranges.reduce((sum, range) => sum + range, 0) /
    Math.max(ranges.length, 1);
}

export function rollingAtr(bars: Bar[], period: number) {
  const values: number[] = [];
  for (let index = period + 1; index <= bars.length; index += 1) {
    values.push(averageTrueRange(bars.slice(0, index), period));
  }
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

export function relativeStrengthIndex(bars: Bar[], period: number) {
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

export function ema(values: number[], period: number) {
  if (values.length === 0) {
    return 0;
  }
  const smoothing = 2 / (period + 1);
  const sample = values.slice(-period * 3);
  return sample.slice(1).reduce(
    (currentEma, value) => value * smoothing + currentEma * (1 - smoothing),
    sample[0],
  );
}

export function percentileRank(values: number[], current: number) {
  if (values.length === 0) {
    return 0.5;
  }
  return values.filter((value) => value <= current).length / values.length;
}
