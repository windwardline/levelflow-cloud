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

  return {
    adjustments,
    contractSpec,
    entryPrice,
    side: input.side,
    stopLoss,
    symbol: input.symbol,
    takeProfit,
  };
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

function decimalPlaces(value: number) {
  const [, decimals = ""] = value.toString().split(".");
  return decimals.length;
}
