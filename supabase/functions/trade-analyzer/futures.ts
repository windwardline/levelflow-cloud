import { getAssetType } from "./calibration.ts";

export type FuturesSide = "buy" | "sell";

/**
 * 1b: which symbols must carry a tick grid before a plan may ship. The old
 * gate asked `assetType === "futures"`, so agriculture and livestock —
 * exchange futures on the same grids — never reached alignment at all: 19 of
 * 31 live futures markets shipped every price off-grid, with a copy button
 * beside each. A futures-shaped symbol without a spec refuses at the
 * analysis door; this predicate is what both the door and the plan consult.
 */
export function needsFuturesTickGrid(symbol: string): boolean {
  const assetType = getAssetType(symbol);
  return assetType === "futures" || assetType === "agriculture" ||
    assetType === "livestock";
}

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

// SYMBOLS: external exchange contract specifications | 28 of 98 vs known
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
  // --- Added 2026-08-09 (1b). Ticks from E8's published tick table
  // (13004287), the same source as the rows above — transcribed in
  // src/lib/broker/instruments.ts CANONICAL_ROWS and pinned to this table by
  // tests/futuresRules.test.ts across the Deno boundary. Min-distance ticks
  // are provisional class-sibling values pending calibration item 4d.
  HEUSX: {
    contractLabel: "Lean hog futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.025,
  },
  HOUSD: {
    contractLabel: "Heating oil futures",
    minStopTicks: 12,
    minTargetTicks: 24,
    tickSize: 0.0001,
  },
  LEUSX: {
    contractLabel: "Live cattle futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.025,
  },
  PAUSD: {
    contractLabel: "Palladium futures",
    minStopTicks: 6,
    minTargetTicks: 12,
    tickSize: 0.1,
  },
  PLUSD: {
    contractLabel: "Platinum futures",
    minStopTicks: 6,
    minTargetTicks: 12,
    tickSize: 0.1,
  },
  RBUSD: {
    contractLabel: "RBOB gasoline futures",
    minStopTicks: 12,
    minTargetTicks: 24,
    tickSize: 0.0001,
  },
  ZCUSX: {
    contractLabel: "Corn futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.25,
  },
  ZLUSX: {
    contractLabel: "Soybean oil futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.01,
  },
  ZMUSD: {
    contractLabel: "Soybean meal futures",
    minStopTicks: 6,
    minTargetTicks: 12,
    tickSize: 0.1,
  },
  ZSUSX: {
    contractLabel: "Soybean futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.25,
  },
  // Contract-size variants (scan-excluded, §19h): specs exist so a variant
  // that ever becomes scannable aligns on day one, and so the sizing-side
  // mapping table and this grid can be pinned to each other without holes.
  // Ticks are E8-published; min distances mirror each full-size parent.
  MES: {
    contractLabel: "Micro E-mini S&P 500 futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.25,
  },
  MNQ: {
    contractLabel: "Micro E-mini Nasdaq 100 futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.25,
  },
  MYM: {
    contractLabel: "Micro E-mini Dow futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 1,
  },
  QG: {
    contractLabel: "E-mini natural gas futures",
    minStopTicks: 12,
    minTargetTicks: 24,
    tickSize: 0.005,
  },
  QM: {
    contractLabel: "E-mini crude oil futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.025,
  },
  // --- CME contract specifications, where E8 publishes no tick — the
  // precedent ZBUSD (1/32) and ZNUSD (1/64) above already set: the grid of an
  // exchange-traded contract is the exchange's property. §20i ruling 5 still
  // bars exchange values from the SIZING table; alignment is a price-grid
  // fact, not a money fact. RATIFIED as amendment 40 (2026-09-01): the
  // boundary's own first sentence scopes it to "every number in both
  // sections", and both sections are the §19/§20 sizing governor. That
  // reading was correct; it is now law rather than a comment.
  //
  // Four of these five do not need the exchange route at all. ZOUSX (0.25)
  // and ZRUSD (0.005) match the price-delta gcd of the banked minute series
  // EXACTLY, so they are grounded in Levelflow's own data. ZFUSD/ZTUSD are
  // confirmed by the futures dossier's own conversion (ZFU6 106'070 =
  // 106.21875 = exactly 13,596 quarter-32nds). Only GFUSX rests on the grid
  // alone.
  //
  // GFUSX's old corroboration is STRUCK 2026-09-01 (amendment 40, §6b-1 E). It read
  // "consistent with the live watchlist print (GFQ6 348.300) and its LE/HE
  // siblings' published 0.025". Neither half holds: 348.300 divides evenly by
  // 0.025 AND by 0.005, discriminating nothing, and inference from siblings is
  // what the third route forbids ("nothing adjacent to it").
  //
  // What grounds it instead is a CONTROL on the alternative. Re-deriving ticks
  // from the bank was tested where E8 publishes the answer, and missed both by
  // 5x: LEUSX and HEUSX are published 0.025 and their bank gcd is 0.005. The
  // bank measures the vendor data's finest increment, not the contract's tick.
  // Residual risk is bounded because 0.025 is a MULTIPLE of 0.005 — every
  // aligned price is on-grid under either reading, and the only cost of being
  // wrong is a wider minimum stop, never an unfillable price.
  GFUSX: {
    contractLabel: "Feeder cattle futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.025,
  },
  ZFUSD: {
    contractLabel: "5-year Treasury note futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.0078125,
  },
  ZOUSX: {
    contractLabel: "Oat futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.25,
  },
  ZRUSD: {
    contractLabel: "Rough rice futures",
    minStopTicks: 8,
    minTargetTicks: 16,
    tickSize: 0.005,
  },
  ZTUSD: {
    contractLabel: "2-year Treasury note futures",
    minStopTicks: 4,
    minTargetTicks: 8,
    tickSize: 0.0078125,
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
