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

export function findSwingPivots(bars: Bar[], strength: number) {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let index = strength; index < bars.length - strength; index += 1) {
    const candidate = bars[index];
    let isPivotHigh = true;
    let isPivotLow = true;

    for (let offset = 1; offset <= strength; offset += 1) {
      const before = bars[index - offset];
      const after = bars[index + offset];
      if (before.high >= candidate.high || after.high >= candidate.high) {
        isPivotHigh = false;
      }
      if (before.low <= candidate.low || after.low <= candidate.low) {
        isPivotLow = false;
      }
      if (!isPivotHigh && !isPivotLow) {
        break;
      }
    }

    if (isPivotHigh) {
      highs.push(candidate.high);
    }
    if (isPivotLow) {
      lows.push(candidate.low);
    }
  }

  return { highs, lows };
}

export function nearestLevelBeyond(
  side: "buy" | "sell",
  entry: number,
  levels: number[],
) {
  const beyond = levels.filter((level) =>
    side === "buy" ? level > entry : level < entry
  );
  if (beyond.length === 0) {
    return null;
  }
  return side === "buy" ? Math.min(...beyond) : Math.max(...beyond);
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

// The same series the old shape produced, without rebuilding the history for
// every point of it. `averageTrueRange(bars.slice(0, index), period)` allocated
// an array of length `index` on each of ~1,000 daily iterations — half a million
// copied references to read the last `period` of them — and classifyRegime calls
// this once per symbol on every scan. Each window is still summed left to right
// from zero over the same `period` true ranges, so every value is bit-identical;
// tests/barDecode.test.ts proves it against the old implementation.
export function rollingAtr(bars: Bar[], period: number) {
  const values: number[] = [];
  if (period < 1 || bars.length < period + 1) {
    return values;
  }

  // trueRanges[index - 1] is bar `index` measured against its predecessor.
  const trueRanges: number[] = [];
  for (let index = 1; index < bars.length; index += 1) {
    const bar = bars[index];
    const previousClose = bars[index - 1].close;
    trueRanges.push(Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    ));
  }

  for (let end = period; end <= trueRanges.length; end += 1) {
    let sum = 0;
    for (let offset = end - period; offset < end; offset += 1) {
      sum += trueRanges[offset];
    }
    const value = sum / period;
    if (Number.isFinite(value) && value > 0) {
      values.push(value);
    }
  }
  return values;
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
