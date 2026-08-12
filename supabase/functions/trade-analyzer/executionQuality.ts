import type { AssetType } from "./calibration.ts";
import {
  cryptoSpreadFloorPrice,
  venueCommissionRoundTripPrice,
} from "./venueCosts.ts";

export type ExecutionQualityInput = {
  assetType: AssetType;
  atr: number;
  availableTimeframes: string[];
  dailyAtr: number;
  entryPrice: number;
  latestClose: number;
  providerWarnings: string[];
  quotedSpread?: number | null;
  side: "buy" | "sell";
  stopLoss: number;
  symbol: string;
  takeProfit: number;
  // 2j: the contract's own tick, for tick-gridded symbols (futures.ts).
  // Present, it replaces the family-mean bps term with the symbol's one-tick
  // floor — E8 publishes no futures spread; cost is exchange-native tick
  // pricing (e8-futures-dossier §5.4, finding 9).
  tickSize?: number | null;
};

export type ExecutionQuality = {
  confidencePenalty: number;
  effectiveRewardRisk: number;
  // Round-8 CO-1/3/4: the venue's published commission for one round
  // trip, as price distance. Zero when the venue tables cannot bill the
  // symbol — stated in the field, never silently folded away.
  estimatedCommission: number;
  estimatedRoundTripCost: number;
  estimatedSlippage: number;
  estimatedSpread: number;
  grossRewardRisk: number;
  label: "Clean" | "Acceptable" | "Thin" | "Poor";
  modeledSpread: number;
  notes: string[];
  quotedSpread: number | null;
  score: number;
  spreadSource: "quoted" | "modeled";
};

type ExecutionProfile = {
  atrSlippageFactor: number;
  atrSpreadFactor: number;
  maxPenalty: number;
  slippageBps: number;
  spreadBps: number;
};

/**
 * Divide-by-zero guard, and nothing more.
 *
 * This replaced a per-class `minimumCost` expressed as an ABSOLUTE price
 * increment (futures and indices carried 0.01). A cost floor in absolute
 * price cannot be right for a class at all: E8's futures program spans
 * natural gas near 2.67 to the E-mini S&P near 7752, so one constant is
 * either invisible at the top of the range or ruinous at the bottom. At 0.01
 * it was ruinous — modeled round-trip cost reached 1.8x copper's whole risk
 * distance and 2.7x gas's, turning a genuine 2:1 setup into a reported 0.077
 * and 0.018 and rejecting every one of them. Copper cleared reward:risk 1.25
 * in 0 of 2304 replayed setups, gas in 0 of 1689, and the 10-year note was
 * throttled to 136 filled against the bond's 1540.
 *
 * Cost is modeled two ways that already scale with the instrument — basis
 * points of price, and a fraction of ATR. Both are market-specific by
 * construction. The guard exists only so a zero price or a zero ATR cannot
 * produce a zero denominator, and it must never outrank either real term.
 */
const COST_EPSILON = 1e-9;

const EXECUTION_PROFILES: Record<AssetType, ExecutionProfile> = {
  // Livestock, 2026-08-06. Same tick-over-price derivation as agriculture, and
  // it lands somewhere different — which is the point of measuring rather than
  // assuming the two "commodity" classes resemble each other:
  //   feeder cattle  0.025 / 348.30 = 0.72 bps
  //   live cattle    0.025 / 231.40 = 1.08
  //   lean hogs      0.025 / 97.65  = 2.56
  // A mean one-tick spread of 1.45 bps — FINER than agriculture's 4.0 and close
  // to the futures profile's 1.4, because these contracts tick in cents on
  // two-and-three-figure prices.
  //
  // Recorded as a one-tick FLOOR, not a claim about the live book: livestock is
  // thinly traded and real spreads may run wider than one tick. The model
  // prefers a quoted spread whenever the provider supplies one, so this governs
  // only the modeled fallback — and a future quoted-spread measurement should
  // revisit it.
  livestock: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.012,
    maxPenalty: 10,
    slippageBps: 1.0,
    spreadBps: 1.5,
  },
  // Agriculture, 2026-08-06. The bps terms are DERIVED, not judged: one tick is
  // the tightest spread a contract can quote, and tick over price is arithmetic.
  // Measured against the F9 sighting's own prices —
  //   soybean oil  0.01 / 67.75   = 1.5 bps
  //   soybeans     0.25c / 1168c  = 2.1
  //   soymeal      0.10 / 313.5   = 3.2
  //   rough rice   0.005 / 14.205 = 3.5
  //   corn         0.25c / 449.75c= 5.6
  //   oats         0.25c / 316.3c = 7.9
  // — a mean one-tick spread of 4.0 bps against the E-mini S&P's 0.32. That is
  // the whole reason this class exists: the futures profile's 1.4 bps understates
  // agricultural cost by roughly 3x, and understating cost is how a market gets
  // credited with edge it does not have.
  //
  // The two ATR-relative factors carry futures' values because nothing in the
  // corpus measures them, and the bps term dominates at these price levels
  // anyway. Marked so they are not mistaken for derived.
  agriculture: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.012,
    maxPenalty: 10,
    slippageBps: 2.5,
    spreadBps: 4.0,
  },
  crypto: {
    atrSlippageFactor: 0.012,
    atrSpreadFactor: 0.018,
    maxPenalty: 12,
    slippageBps: 2.5,
    spreadBps: 3.5,
  },
  energies: {
    atrSlippageFactor: 0.01,
    atrSpreadFactor: 0.014,
    maxPenalty: 11,
    slippageBps: 1.1,
    spreadBps: 1.8,
  },
  forex: {
    atrSlippageFactor: 0.006,
    atrSpreadFactor: 0.01,
    maxPenalty: 8,
    slippageBps: 0.16,
    spreadBps: 0.35,
  },
  futures: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.012,
    maxPenalty: 10,
    slippageBps: 0.8,
    spreadBps: 1.4,
  },
  indices: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.012,
    maxPenalty: 10,
    slippageBps: 0.7,
    spreadBps: 1.1,
  },
  metals: {
    atrSlippageFactor: 0.008,
    atrSpreadFactor: 0.014,
    maxPenalty: 10,
    slippageBps: 1.1,
    spreadBps: 1.9,
  },
};

export function estimateExecutionQuality(
  input: ExecutionQualityInput,
): ExecutionQuality {
  const profile = EXECUTION_PROFILES[input.assetType];
  const latestClose = Math.abs(input.latestClose);
  const atr = Math.max(Math.abs(input.atr), COST_EPSILON);
  const dailyAtr = Math.max(Math.abs(input.dailyAtr), atr);
  const riskDistance = Math.abs(input.entryPrice - input.stopLoss);
  const rewardDistance = Math.abs(input.takeProfit - input.entryPrice);
  // 2j: a symbol with a known tick pays its OWN floor, not its family's
  // mean. The family bps terms were derived as mean(one tick / price) per
  // class, and a lossy mean overcharges the big-price liquid contracts
  // (the E-mini Nasdaq wore ~13 ticks) while undercharging below one tick
  // at the cheap end (the 2-year note). The ATR term stays as the
  // volatility-widening model on both paths; quoted spreads, when the
  // provider supplies one, still outrank the whole modeled branch.
  const tickFloor = typeof input.tickSize === "number" &&
      Number.isFinite(input.tickSize) && input.tickSize > 0
    ? input.tickSize
    : null;
  // CO-2: the crypto book's sampled per-symbol widths join the model as
  // FLOORS — the class's 3.5bps understated the venue book's median by
  // 2-3x, and one class number cannot span a book running 0.35bp (BTC)
  // to 275bp (FIL). Quoted spreads, when banked, still outrank all of it.
  const sampledFloor = input.assetType === "crypto"
    ? cryptoSpreadFloorPrice(input.symbol, latestClose) ?? 0
    : 0;
  const modeledSpread = roundPrice(
    tickFloor !== null
      ? Math.max(tickFloor, atr * profile.atrSpreadFactor, COST_EPSILON)
      : Math.max(
        latestClose * (profile.spreadBps / 10_000),
        atr * profile.atrSpreadFactor,
        sampledFloor,
        COST_EPSILON,
      ),
  );
  const quotedSpread = normalizeQuotedSpread(input.quotedSpread);
  const estimatedSpread = quotedSpread === null
    ? modeledSpread
    : roundPrice(Math.max(quotedSpread, COST_EPSILON));
  const spreadSource = quotedSpread === null ? "modeled" : "quoted";
  const estimatedSlippage = roundPrice(
    Math.max(
      latestClose * (profile.slippageBps / 10_000),
      atr * profile.atrSlippageFactor,
      COST_EPSILON,
    ),
  );
  const estimatedCommission = roundPrice(
    venueCommissionRoundTripPrice(input.symbol, latestClose) ?? 0,
  );
  // MEASUREMENT-ONLY sensitivity (owner standard, 2026-08-11: a market
  // may not be withdrawn on a flawed parameter of our own making). The
  // round trip has two kinds of cost: E8's PUBLISHED commission, which
  // is the venue's own number, and our MODELED spread + slippage —
  // which for crypto rests on a single Monday-afternoon book sample the
  // venueCosts module itself warns "is not a cost model". Scaling the
  // modeled half to zero was MEANT to isolate the verdict the published
  // bill alone supports.
  //
  // ⛔ IT DOES NOT — the knob is INERT for measurement (defect 1c,
  // 2026-08-11). `estimatedRoundTripCost` is the only value it touches, and
  // the replay resolver never reads it: fills are handed `estimatedSpread`
  // and `estimatedSlippage` directly (`sweep.ts:568-569`) and realized R
  // charges commission through `perLegCost`. Setting the scale to 0 removes
  // nothing from the R accounting; it only loosens the payoff gate, so a
  // "sensitivity run" admits MORE setups rather than costing them less.
  // Amendment 36's standard cannot be met through this path. Phase 2 (M5)
  // must route the scale into the resolver and assert that a bit-identical
  // gross/net row emits "COST MODEL INERT" instead of a verdict — see
  // docs/research/remediation-program-2026-08-11.md.
  //
  // Defaults to 1 (full model); the live analyzer never sets it — pinned in
  // tests/executionQuality.test.ts.
  const modeledCostScale = modeledCostScaleFromEnv();
  const estimatedRoundTripCost = roundPrice(
    (estimatedSpread + estimatedSlippage * 2) * modeledCostScale +
      estimatedCommission,
  );
  const grossRewardRisk = rewardDistance / Math.max(riskDistance, 0.00001);
  // 2d (2026-08-09): one round trip, charged once — against the payoff. The
  // old form divided (reward - cost) by (risk + cost), billing the same
  // round trip to both sides of the ratio; realizedRFromLegs charges exactly
  // one round trip in R space, and the gate's forward-looking metric must
  // mean the same thing the measured corpus means.
  const effectiveRewardRisk = Math.max(
    0,
    rewardDistance - estimatedRoundTripCost,
  ) / Math.max(riskDistance, 0.00001);
  const costToRisk = estimatedRoundTripCost / Math.max(riskDistance, 0.00001);
  const entryCushion = Math.abs(input.latestClose - input.entryPrice);
  const notes: string[] = [];

  if (spreadSource === "quoted") {
    notes.push("Live bid/ask spread was used.");
  }
  let penalty = Math.round(costToRisk * 90);
  if (entryCushion < estimatedSpread * 2) {
    penalty += 3;
    notes.push("Entry is close to the current spread.");
  }
  if (input.availableTimeframes.length < 3) {
    penalty += 2;
    notes.push("Fewer chart intervals were available.");
  }
  if (input.providerWarnings.length > 0) {
    penalty += Math.min(3, input.providerWarnings.length);
    notes.push("Chart coverage has provider warnings.");
  }
  if (dailyAtr > 0 && atr / dailyAtr > 0.5) {
    penalty += 2;
    notes.push("Short-term movement is elevated versus daily range.");
  }
  if (effectiveRewardRisk < grossRewardRisk * 0.85) {
    notes.push("Estimated execution cost meaningfully reduces payoff.");
  }

  const confidencePenalty = clampInteger(penalty, 0, profile.maxPenalty);
  const score = clampInteger(100 - confidencePenalty * 8, 0, 100);
  const label = score >= 84
    ? "Clean"
    : score >= 72
    ? "Acceptable"
    : score >= 55
    ? "Thin"
    : "Poor";

  if (notes.length === 0) {
    notes.push("Spread and slippage estimates are within the risk budget.");
  }

  return {
    confidencePenalty,
    effectiveRewardRisk: roundPrice(effectiveRewardRisk),
    estimatedCommission,
    estimatedRoundTripCost,
    estimatedSlippage,
    estimatedSpread,
    grossRewardRisk: roundPrice(grossRewardRisk),
    label,
    modeledSpread,
    notes,
    quotedSpread,
    score,
    spreadSource,
  };
}

/**
 * Measurement-only, and deliberately env-driven rather than threaded
 * through every call site: a sweep sets it once for a whole run, and no
 * production path can pass it by accident. Anything outside [0,1] is
 * refused back to 1 — a scale above 1 would be inventing cost.
 */
function modeledCostScaleFromEnv(): number {
  const raw = typeof globalThis.process?.env?.LEVELFLOW_MODELED_COST_SCALE ===
      "string"
    ? Number(globalThis.process.env.LEVELFLOW_MODELED_COST_SCALE)
    : 1;
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function roundPrice(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(5)) : 0;
}

function normalizeQuotedSpread(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return roundPrice(value);
}
