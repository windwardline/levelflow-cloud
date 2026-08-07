export type FuturesSide = "buy" | "sell";

export type FuturesContractSpec = {
  contractLabel: string;
  minStopTicks: number;
  minTargetTicks: number;
  tickSize: number;
};

export type FuturesPricePlanInput = {
  entryPrice: number;
  side: FuturesSide;
  stopLoss: number;
  symbol: string;
  takeProfit: number;
  /**
   * TP1 was the one ladder level never passed in here, so it was never aligned
   * — 98.9% of futures plans shipped a TP1 off the contract's grid, with a copy
   * button beside it. An ES TP1 of 4557.080357142857 is 18,228.32 ticks at 0.25.
   * Nullable because a plan without a ladder has no TP1 to align.
   */
  takeProfit1: number | null;
};

export type FuturesPricePlan = FuturesPricePlanInput & {
  adjustments: string[];
  contractSpec: FuturesContractSpec;
};

const FUTURES_CONTRACT_SPECS: Record<string, FuturesContractSpec> = {
  BZUSD: {
    contractLabel: "Brent crude futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.01,
  },
  CLUSD: {
    contractLabel: "WTI crude oil futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.01,
  },
  ESUSD: {
    contractLabel: "E-mini S&P 500 futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.25,
  },
  GCUSD: {
    contractLabel: "Gold futures",
    minStopTicks: 6,
    minTargetTicks: 12,
    tickSize: 0.1,
  },
  HGUSD: {
    contractLabel: "Copper futures",
    minStopTicks: 10,
    minTargetTicks: 20,
    tickSize: 0.0005,
  },
  MGCUSD: {
    contractLabel: "Micro gold futures",
    minStopTicks: 6,
    minTargetTicks: 12,
    tickSize: 0.1,
  },
  NGUSD: {
    contractLabel: "Natural gas futures",
    minStopTicks: 12,
    minTargetTicks: 24,
    tickSize: 0.001,
  },
  NQUSD: {
    contractLabel: "E-mini Nasdaq 100 futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.25,
  },
  RTYUSD: {
    contractLabel: "E-mini Russell 2000 futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.1,
  },
  SIUSD: {
    contractLabel: "Silver futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.005,
  },
  YMUSD: {
    contractLabel: "E-mini Dow futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 1,
  },
  ZBUSD: {
    contractLabel: "U.S. Treasury bond futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.03125,
  },
  ZNUSD: {
    contractLabel: "10-year Treasury note futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.015625,
  },
};

export function getFuturesContractSpec(symbol: string) {
  return FUTURES_CONTRACT_SPECS[symbol.toUpperCase()] ?? null;
}

export function applyFuturesTickRules(
  input: FuturesPricePlanInput,
): FuturesPricePlan | null {
  const contractSpec = getFuturesContractSpec(input.symbol);
  if (!contractSpec) {
    return null;
  }

  const entryPrice = alignFuturesLevel(
    input.entryPrice,
    contractSpec.tickSize,
    input.side === "buy" ? "down" : "up",
  );
  let stopLoss = alignFuturesLevel(
    input.stopLoss,
    contractSpec.tickSize,
    input.side === "buy" ? "down" : "up",
  );
  let takeProfit = alignFuturesLevel(
    input.takeProfit,
    contractSpec.tickSize,
    input.side === "buy" ? "up" : "down",
  );
  // Toward ENTRY, not outward. TP1 is the level the operator banks half at, so
  // rounding it further away can make a reachable partial unreachable; rounding
  // it nearer costs a fraction of a tick and keeps the ladder honest.
  const takeProfit1 = input.takeProfit1 === null ? null : alignFuturesLevel(
    input.takeProfit1,
    contractSpec.tickSize,
    input.side === "buy" ? "down" : "up",
  );
  const adjustments: string[] = [];
  const minStopDistance = contractSpec.tickSize * contractSpec.minStopTicks;
  const minTargetDistance = contractSpec.tickSize *
    contractSpec.minTargetTicks;

  if (input.side === "buy") {
    const minimumStop = entryPrice - minStopDistance;
    if (stopLoss > minimumStop) {
      stopLoss = alignFuturesLevel(minimumStop, contractSpec.tickSize, "down");
      adjustments.push("stop_distance");
    }

    const minimumTarget = entryPrice + minTargetDistance;
    if (takeProfit < minimumTarget) {
      takeProfit = alignFuturesLevel(
        minimumTarget,
        contractSpec.tickSize,
        "up",
      );
      adjustments.push("target_distance");
    }
  } else {
    const minimumStop = entryPrice + minStopDistance;
    if (stopLoss < minimumStop) {
      stopLoss = alignFuturesLevel(minimumStop, contractSpec.tickSize, "up");
      adjustments.push("stop_distance");
    }

    const minimumTarget = entryPrice - minTargetDistance;
    if (takeProfit > minimumTarget) {
      takeProfit = alignFuturesLevel(
        minimumTarget,
        contractSpec.tickSize,
        "down",
      );
      adjustments.push("target_distance");
    }
  }

  const plan: FuturesPricePlan = {
    adjustments,
    contractSpec,
    entryPrice,
    side: input.side,
    stopLoss,
    symbol: input.symbol,
    takeProfit,
    takeProfit1,
  };
  assertOnGrid(plan);
  return plan;
}

/**
 * Every returned level is an exact multiple of the contract's tick.
 *
 * A post-condition rather than a test, because the defect this closes was a
 * level that never entered the alignment at all — a test asserting the levels
 * it knew about could not have caught the one nobody passed in. This checks the
 * plan that is actually returned, so a fifth level added later is covered on
 * the day it is added.
 */
function assertOnGrid(plan: FuturesPricePlan) {
  const tick = plan.contractSpec.tickSize;
  for (
    const [name, level] of [
      ["entryPrice", plan.entryPrice],
      ["stopLoss", plan.stopLoss],
      ["takeProfit", plan.takeProfit],
      ["takeProfit1", plan.takeProfit1],
    ] as const
  ) {
    if (level === null) {
      continue;
    }
    const ticks = level / tick;
    if (Math.abs(ticks - Math.round(ticks)) > 1e-6) {
      throw new Error(
        `${plan.symbol} ${name} ${level} is not a multiple of its ${tick} tick`,
      );
    }
  }
}

function alignFuturesLevel(
  value: number,
  tickSize: number,
  mode: "down" | "up",
) {
  const scaled = value / tickSize;
  const tickCount = mode === "down"
    ? Math.floor(scaled + Number.EPSILON)
    : Math.ceil(scaled - Number.EPSILON);

  return Number((tickCount * tickSize).toFixed(decimalPlaces(tickSize)));
}

/**
 * Decimals implied by a tick size, correct for exponential notation.
 *
 * The previous form split `value.toString()` on "." — and a tick of 1e-7
 * stringifies as "1e-7", which has no decimal part, so it returned 0 and
 * toFixed(0) rounded the aligned price to a whole number. Latent today, and
 * armed the moment the grid is generated from E8's own table: E8 publishes
 * 6J at exactly 1e-7 (instruments.ts's E8_FUTURES_SPECS).
 */
function decimalPlaces(value: number) {
  const text = value.toString();
  // Exponential notation carries its decimals in the exponent, so splitting on
  // "." finds none and returns 0 — which made toFixed(0) round an aligned price
  // to a whole number. Latent today and armed the moment the grid is generated
  // from E8's own table: E8 publishes 6J at exactly 1e-7.
  const exponential = text.match(/^\d+(?:\.(\d+))?e-(\d+)$/);
  if (exponential) {
    return Number(exponential[2]) + (exponential[1]?.length ?? 0);
  }
  const [, decimals = ""] = text.split(".");
  return decimals.length;
}
