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
  /**
   * confidencePenalty, split by WHAT CAUSED IT.
   *
   * The total is charged once and is unchanged; these two say where it came
   * from. It had to be split because the operator was told the whole number
   * was a cost: index.ts printed "Estimated trading costs reduced the setup
   * score by N", and `label` — the Clean/Acceptable/Thin/Poor word whose gloss
   * says trading costs are eating the payoff — derives from
   * `100 - confidencePenalty * 8`. So a failed 5-minute chart fetch could move
   * the Costs label from Clean to Thin and be read as a spread problem.
   *
   * `cost` is the round trip against risk, plus the entry sitting inside the
   * spread. `coverage` is everything about how well the market could be SEEN:
   * missing chart intervals, provider warnings, and short-term movement
   * running hot against the daily range. Neither is a judgement about the
   * other, and the two carry different instructions to the reader.
   */
  costPenalty: number;
  /** 100 - costPenalty*8: what `label` is derived from. See the label's own note. */
  costScore: number;
  /** The modelled round trip as a share of the risk unit — the cost weight per trade (amendment 39). */
  costToRisk: number;
  coveragePenalty: number;
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
  const modeledSpread = costLeg(
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
    : costLeg(Math.max(quotedSpread, COST_EPSILON));
  const spreadSource = quotedSpread === null ? "modeled" : "quoted";
  const estimatedSlippage = costLeg(
    Math.max(
      latestClose * (profile.slippageBps / 10_000),
      atr * profile.atrSlippageFactor,
      COST_EPSILON,
    ),
  );
  const estimatedCommission = costLeg(
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
  // AND IT NOW DOES, since M5 (2026-08-31). It did not for three weeks: this
  // was the ONLY value the scale touched, and the replay resolver never read
  // it — fills took `estimatedSpread` and `estimatedSlippage` straight and
  // realized R charged commission through `perLegCost`. Setting the scale to
  // 0 removed nothing from the R accounting and only loosened the payoff
  // gate, so a "sensitivity run" admitted MORE setups rather than costing
  // them less, and amendment 36's standard could not be met through this
  // path at all (defect 1c, `remediation-program-2026-08-11.md`).
  //
  // The scale now reaches the resolver through `resolverCostOptions`, the
  // single mapping the sweep and the live bridge share. This line keeps the
  // gate and the resolver charging the SAME modelled half, which is what
  // made the divergence invisible while it lasted.
  //
  // Defaults to 1 (full model); the live analyzer never sets it — pinned in
  // tests/executionQuality.test.ts.
  const modeledCostScale = modeledCostScaleFromEnv();
  const estimatedRoundTripCost = costLeg(
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
  // Accumulated in two buckets so the total can be ATTRIBUTED, not just
  // charged. The arithmetic below is unchanged: cost + coverage is the same
  // number the single `penalty` accumulator produced.
  let costPenaltyRaw = Math.round(costToRisk * 90);
  let coveragePenaltyRaw = 0;
  if (entryCushion < estimatedSpread * 2) {
    costPenaltyRaw += 3;
    notes.push("Entry is close to the current spread.");
  }
  if (input.availableTimeframes.length < 3) {
    coveragePenaltyRaw += 2;
    notes.push("Fewer chart intervals were available.");
  }
  if (input.providerWarnings.length > 0) {
    coveragePenaltyRaw += Math.min(3, input.providerWarnings.length);
    notes.push("Chart coverage has provider warnings.");
  }
  if (dailyAtr > 0 && atr / dailyAtr > 0.5) {
    coveragePenaltyRaw += 2;
    notes.push("Short-term movement is elevated versus daily range.");
  }
  const penalty = costPenaltyRaw + coveragePenaltyRaw;
  if (effectiveRewardRisk < grossRewardRisk * 0.85) {
    notes.push("Estimated execution cost meaningfully reduces payoff.");
  }

  const confidencePenalty = clampInteger(penalty, 0, profile.maxPenalty);
  // The parts must SUM to the total the score is charged, including when the
  // cap binds. Cost is settled first because it is the one the label claims to
  // describe, and coverage takes whatever headroom is left — so a clamped row
  // never reports coverage the score did not actually charge.
  const costPenalty = Math.min(costPenaltyRaw, confidencePenalty);
  const coveragePenalty = confidencePenalty - costPenalty;
  // TWO SCORES, because two different questions are being asked of this row.
  //
  // `score` is overall EXECUTABILITY and keeps the whole penalty. It is not a
  // display figure: scanCollapse.ts breaks a correlated cluster's tie on it, so
  // it decides which market the reader is shown, and preferring the
  // better-priced AND better-covered market there is correct.
  //
  // `label` is the operator-facing COST rating. Its own gloss says "trading
  // costs are a small fraction of the risk" / "trading costs are high relative
  // to this setup's risk" (reviewCopy describeExecutionLabel), and index.ts
  // prints it as "{label} trading-cost check." Deriving it from a penalty that
  // also carries missing chart intervals, provider warnings and hot short-term
  // movement made a failed 5-minute fetch read as a pricing verdict — the same
  // mis-attribution the diagnostics sentence was split to end, still live one
  // row away because the split stopped at the sentence.
  const score = clampInteger(100 - confidencePenalty * 8, 0, 100);
  const costScore = clampInteger(100 - costPenalty * 8, 0, 100);
  const label = costScore >= 84
    ? "Clean"
    : costScore >= 72
    ? "Acceptable"
    : costScore >= 55
    ? "Thin"
    : "Poor";

  if (notes.length === 0) {
    notes.push("Spread and slippage estimates are within the risk budget.");
  }

  return {
    confidencePenalty,
    costPenalty,
    costScore,
    coveragePenalty,
    costToRisk: Number(costToRisk.toFixed(4)),
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
 *
 * EXPORTED so the sweep driver records the value it will actually run under,
 * rather than re-parsing the env and clamping differently. A second reader of
 * the same variable is a second clamp to keep in step, and the manifest's
 * whole job is to state the term the run used.
 */
export function modeledCostScaleFromEnv(): number {
  const raw = typeof globalThis.process?.env?.LEVELFLOW_MODELED_COST_SCALE ===
      "string"
    ? Number(globalThis.process.env.LEVELFLOW_MODELED_COST_SCALE)
    : 1;
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
}

/**
 * Does the modelled cost scale reach the RESOLVER?
 *
 * It does, since M5. It did NOT between 2026-08-09 and 2026-08-31, and that
 * gap is the whole reason this constant exists rather than a comment: the
 * scale multiplied `estimatedRoundTripCost` alone — the payoff gate, the cost
 * penalty, `executionScore` — while the resolver was handed the RAW spread,
 * slippage and commission by two separate hand-written call sites. A "gross
 * arm" at scale 0 therefore charged the net arm's costs and merely loosened
 * the gate, admitting MORE setups and changing nothing about what they
 * earned. Eleven of twenty rows came back bit-identical and the no-op was
 * read as agreement (defect 1c, `remediation-program-2026-08-11.md`).
 *
 * `resolverCostOptions` below is now the only mapping from a cost reading to
 * the resolver's triple, so the scale cannot reach one call site and miss the
 * other. The constant stays because the sweep driver and the sensitivity
 * verdict both branch on it, and a fact two scripts act on belongs somewhere
 * they can read it.
 */
export const MODELED_COST_SCALE_REACHES_RESOLVER = true;

/**
 * Amendment 36's arm: E8's PUBLISHED bill and nothing of ours.
 *
 * "A market may not be withdrawn on a flawed parameter of our own making."
 * The modelled spread and slippage are ours — for crypto they rest on a single
 * Monday-afternoon book sample `venueCosts` itself warns "is not a cost model"
 * — so the arm that tests a decline charges neither, while the commission,
 * which is the venue's own number, is charged in full at every scale.
 */
export const GROSS_COST_SCALE = 0;

/** What the resolver charges, from one execution-quality reading. */
export type ResolverCostOptions = {
  gapExitSlippage: number;
  halfSpread: number;
  roundTripCost: number;
};

/**
 * The resolver's cost triple — ONE definition, because there were two.
 *
 * `sweep.ts` and `fillOptionsFromRiskModel` each built this mapping by hand,
 * and that duplication is how defect 1c got written twice over. Both copies
 * passed the raw components straight through, so there was no single place
 * where routing the scale in would have fixed both.
 *
 * WHAT THE SCALE MULTIPLIES mirrors `estimatedRoundTripCost` exactly: the
 * MODELED half — spread and slippage, which for crypto rest on the single
 * Monday-afternoon book sample `venueCosts` itself warns "is not a cost
 * model" — and never the PUBLISHED commission, which is the venue's own
 * number and is charged in full at every scale. That is the entire point of
 * amendment 36's standard: no withdrawal on a flawed parameter of our own
 * making, and the commission is not ours.
 *
 * At scale 1 the arithmetic is BIT-IDENTICAL to the hand-written form it
 * replaces — `x * 1` is exact in IEEE 754 — so the live engine and every
 * existing corpus are unmoved. `tests/executionQuality.test.ts` pins that.
 *
 * `scale` is a PARAMETER, not an environment read, and the two callers pass
 * different things on purpose. The sweep is a measurement instrument and
 * passes the run's declared scale; the live resolver passes 1 unconditionally,
 * so a stray environment variable in a production deployment can never
 * quietly re-grade the outcome corpus. Reading the env in here would make
 * that difference invisible at both call sites.
 */
export function resolverCostOptions(
  quality: {
    estimatedCommission: number;
    estimatedSlippage: number;
    estimatedSpread: number;
  },
  scale: number,
): ResolverCostOptions {
  return {
    gapExitSlippage: quality.estimatedSlippage * scale,
    halfSpread: quality.estimatedSpread * scale / 2,
    roundTripCost: quality.estimatedCommission,
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Quantize a PRICE to the five decimals a quote carries.
 *
 * It must not govern a COST. `tests/executionQuality.test.ts` states the
 * invariant this file lives under — "execution cost is SCALE-FREE... a
 * market's cost-to-risk ratio must not depend on where its decimal point
 * sits" — and an absolute 1e-5 increment is the definition of scale-dependent.
 * Both statements cannot be true, and the test's is the one that is right.
 *
 * The sharpest case is commission, because it is a PUBLISHED figure rather
 * than a model: `venueCommissionRoundTripPrice` returns price × 5e-5, which is
 * E8's $5/lot. Quantizing it to 1e-5 restates that published number by
 * 0.1/price — measured, +66.7% at price 0.12, +13.2% at 0.53, and zero at
 * price >= 1, so the error is invisible on every instrument anyone happened to
 * probe and material on the sub-dollar ones.
 *
 * Kept for the two ratio fields at the bottom of this file, which are reported
 * figures rather than cost terms.
 */
function roundPrice(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(5)) : 0;
}

/**
 * A cost leg, kept at full precision but guarded against NaN.
 *
 * Costs are internal terms that feed a ratio; nothing displays them at five
 * decimals, so there was never a reason to quantize them and there is a
 * measured reason not to.
 */
function costLeg(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * A quoted spread, validated but NOT quantized.
 *
 * It returned `roundPrice(value)` until 2026-08-24, which annihilated any
 * positive spread below 5e-6 to exactly zero — and zero survives downstream,
 * because `replay.ts` guards `spread < 0` rather than `spread <= 0`. The
 * result would be a setup priced as if the book were free, carrying
 * `spreadSource: "quoted"` so nothing downstream could tell it from a real
 * reading.
 *
 * Latent rather than live: the band needs a 6-decimal quote and this feed
 * serves none. Fixed as correctness, not as an incident — the guard above
 * already rejects zero and negatives, so there was never a reason to round
 * afterwards.
 */
function normalizeQuotedSpread(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}
