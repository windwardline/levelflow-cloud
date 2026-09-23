/**
 * banked-fraction — what the ladder's allocation is worth, at every fraction.
 *
 * The share of the position banked at TP1 is the literal `0.5` in
 * `realizedRFromLegs` (replay.ts) — the R2b geometry round's first standing
 * question: "realized R is linear in that allocation and it has never been
 * varied, measured, or represented", and "answerable from R3's corpus without
 * a second sweep: net R at any fraction is exact arithmetic on `legs`". This
 * reader is that arithmetic, per class and fold, at 0, ¼, ½ (shipped), ¾ and 1.
 *
 * What it is: the ALLOCATION question alone. The exit path is the emitted
 * one at every fraction — the runner's protection re-arms on the TP1 touch,
 * not on the size banked — and costs are the emitted commission (spread
 * rides in the leg prices; slippage rides in whichever market-order exits the
 * corpus's engine slipped, its SLIPPAGE CLASS (`slippageClassOf`), which every
 * read states. On a `gapped-only` corpus — every corpus of record — slippage is
 * only in gapped prints, FR-7, so a fraction below ½ moves money onto a stop
 * print that resolver never slipped and the slope is an upper bound by up to
 * S/2 — round 1, 2026-09-06). A row without a tp1 leg ran full size to one
 * exit and prices the same at every fraction.
 *
 * Its control runs on every row it prices: at ½ the arithmetic must reproduce
 * the emitted `realizedR` to its four decimals, or the whole corpus is
 * refused — an instrument that fails its control reports nothing.
 *
 * It ranks nothing and proposes nothing. Amendment 39 governs what may be
 * done with a figure here: nothing that manufactures a ratio.
 *
 *   tsx scripts/banked-fraction.ts <emit.jsonl> [more shards...]
 *     [--folds fit,select] [--variant baseline] [--include-holdout] [--grain class|market] [--exit-slippage]
 *     [--years all|contained|escaping [--witness docs/research/r3/feed-character.txt]]
 *
 * `--years` stratifies by feed character (scripts/feedYears.ts): the year map
 * comes from the manifest's `feedCharacter` or from the tracked witness table;
 * rows outside the named bucket are counted, never priced. Default `all`.
 *
 * `--exit-slippage` adds one table per fold: the shipped ladder's R with every
 * market-order exit the corpus's engine left unslipped re-priced at the
 * current resolver's physics (see `exitSlippageCharge`) — clean stops from
 * CLEAN_STOP_SLIPPAGE_SINCE, the review-end close from EXPIRY_SLIPPAGE_SINCE —
 * tp1 rows or not. It replaces `--stop-exit-slippage` (stops only, retired
 * 2026-09-23 so an old command fails by name rather than answer with a
 * different number), and it refuses a corpus that already slips both.
 */
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import {
  describeHeldOut,
  type ResolvedHeldOut,
  resolveHeldOut,
} from "./sweepFolds.ts";
import { type SweepManifest, stableStringify } from "./sweepManifest.ts";
import {
  assertManifest,
  assertManifestedCorpusStreaming,
  type SweepEmitRow,
} from "./sweepStats.ts";
import { describeYearMap, resolveYearMap, type YearMap, yearOf, type YearsFilter } from "./feedYears.ts";
import { parseFolds, SEALED_FOLD } from "./tuning-folds-summary.ts";

export { parseFolds, SEALED_FOLD };

/** The fractions priced; ½ is what the engine ships. */
export const FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
export const SHIPPED_FRACTION = 0.5;

/** The emitted realizedR is rounded to four decimals; the control allows that and nothing more. */
const CONTROL_TOLERANCE = 0.00011;

/** The outcomes a resolution can carry; anything else never filled and prices nothing. */
const FILLED_OUTCOMES = new Set(["take_profit", "tp1_partial", "stop_loss", "expired_at_loss", "expired_in_profit", "ambiguous"]);

const VALUE_FLAGS = new Set(["--folds", "--grain", "--variant", "--years", "--witness"]);
/**
 * The grain a read is printed at. Amendment 33 is "per market, never per
 * class": a class value survives only where that market's own data supports
 * it. The market grain prints every market's own slope and, per class and
 * fold, how many markets' own data supports the class direction; the
 * "admissible" verdict is THIS READER's stricter summary of that rule —
 * every market with an informative slope reads the same sign of Δ_adj — not
 * the amendment's text. A market whose rows are all without a tp1 leg has
 * no slope at all (it prices the same at every fraction) and is counted as
 * flat: it neither supports nor contradicts, and it does not veto. The
 * class grain is the summary the round read.
 */
export const GRAINS = ["class", "market"] as const;
export type Grain = (typeof GRAINS)[number];
const BOOLEAN_FLAGS = new Set(["--include-holdout", "--exit-slippage"]);
/** Every flag the CLI accepts. A recorded command using any other is from a retired reader and its record must say so. */
export const DECLARED_FLAGS: ReadonlySet<string> = new Set([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);

const IDENTITY_TERMS = [
  "acceptance",
  "analyzerVersion",
  "anchor",
  "clock",
  "conditions",
  "days",
  "folds",
  "foldsByClass",
  "grid",
  "grossCostScale",
  "modeledCostScale",
] as const;

type Leg = { kind?: string; leg: string; price: number; time?: number };

/** Exit kinds the resolver prints AT their level when the bar did not gap through (replay.ts adverseExitPrice). */
export const STOP_PRINT_KINDS = new Set(["tp1_lock", "breakeven_stop", "stop_loss", "ambiguous"]);
/** replay.ts roundPrice is toFixed(8); a print at its level matches to that. */
export const LEVEL_TOLERANCE = 1.5e-8;

/**
 * The slippage a stop print carries in a `gapped-only` corpus: none. There a
 * non-gapped stop exit is printed exactly at its level (FR-7 charges
 * gapExitSlippage only on a gapped open), and an expiry is a market print at
 * the bar's close with none either. A
 * fraction below ½ moves money from the tp1 limit print onto that leg, so the
 * slippage-priced table charges the sweep's own estimatedSlippage, in R, on
 * the runner fraction of every such row — a hybrid model, named as such, and
 * the table prints it so. Its slippage term follows the current resolver's
 * market-exit rule at modeledCostScale 1 only: S_row is the unscaled
 * estimatedSlippage, so on a corpus run at scale c the resolver charges
 * c × S_row and the term's slope across fractions is c times the table's.
 * Its LEVELS do not follow at any scale: it charges tp1 rows only (a row
 * without a tp1 leg prices the same at every fraction, though the resolver
 * slips its stop and expiry prints at full size). Both are stated on every
 * read, with the corpus's scale. `--exit-slippage` prices the levels. The tp1
 * limit leg stays unslipped (FR-4's haircut is defaulted off).
 * Round 1, 2026-09-06: forex select's slope +1,100.2 → +785.2 R under it.
 *
 * The class decides what is still unslipped (review of #689, finding 1): on a
 * `clean-stops` corpus every stop already carries its slippage in the print,
 * so only the expiry is charged; on an `every-market-exit` corpus nothing is,
 * and R_adj(f) = R(f) by construction — the slippage already rides at (1−f).
 *
 * Rows without a tp1 leg move nothing between fractions and are never
 * charged. A tp1 row whose exit leg names no kind, or a stop print whose
 * level the row does not carry, is a hole: refused, never priced as a limit.
 */
export function stopPrintSlippage(input: {
  estimatedSlippage: number;
  legs: Leg[];
  levels: { entryPrice: number | null; stopLoss: number | null; takeProfit1: number | null };
  riskDistance: number;
  slippageClass: SlippageClass;
}): { charged: boolean; kind: string | null; sR: number } {
  const exit = input.legs.find((leg) => leg.leg === "exit");
  const tp1 = input.legs.find((leg) => leg.leg === "tp1");
  if (!exit || !tp1) return { charged: false, kind: exit?.kind ?? null, sR: 0 };
  if (typeof exit.kind !== "string" || exit.kind.length === 0) {
    throw new Error("a tp1 row's exit leg names no kind — the reader cannot tell a limit print from a stop print");
  }
  const sR = input.estimatedSlippage / input.riskDistance;
  if (exit.kind === "expiry") {
    const unslipped = input.slippageClass !== "every-market-exit";
    return { charged: unslipped, kind: exit.kind, sR: unslipped ? sR : 0 };
  }
  if (!STOP_PRINT_KINDS.has(exit.kind)) return { charged: false, kind: exit.kind, sR: 0 };
  if (input.slippageClass !== "gapped-only") return { charged: false, kind: exit.kind, sR: 0 };
  const atLevel = levelOfStopPrint(exit.kind, exit.price, input.levels) !== null;
  return { charged: atLevel, kind: exit.kind, sR: atLevel ? sR : 0 };
}

type StopLevels = { entryPrice: number | null; stopLoss: number | null; takeProfit1: number | null };

/**
 * The level a stop-kind exit printed AT, or null when it printed off every
 * level it could belong to — a gapped stop. The kind names the level
 * (replay.ts): the lock sits at TP1, breakeven at the planned entry, the stop
 * at the stop; an ambiguous bar resolves at whichever of the three was in
 * force. A kind whose level the row does not carry is a hole: refused.
 */
function levelOfStopPrint(kind: string, price: number, levels: StopLevels): number | null {
  const candidates = kind === "tp1_lock"
    ? [levels.takeProfit1]
    : kind === "breakeven_stop"
    ? [levels.entryPrice]
    : kind === "stop_loss"
    ? [levels.stopLoss]
    : [levels.takeProfit1, levels.entryPrice, levels.stopLoss];
  const finiteLevels = candidates.filter((level): level is number => level !== null && Number.isFinite(level));
  if (finiteLevels.length === 0) {
    throw new Error(`a ${kind} print with no level on the row — the reader cannot tell a print at its level from a gapped one`);
  }
  return finiteLevels.find((level) => Math.abs(price - Number(level.toFixed(8))) <= LEVEL_TOLERANCE) ?? null;
}

/** The engine version from which the resolver slips every clean stop-kind print (replay.ts `stopExitSlippage`). */
export const CLEAN_STOP_SLIPPAGE_SINCE = "2026.09.23.stop-exit-slippage";
/** The engine version from which the resolver slips the review-end close too (replay.ts `expiryExitSlippage`). */
export const EXPIRY_SLIPPAGE_SINCE = "2026.09.23.expiry-exit-slippage";

/**
 * Which market-order exits a corpus's resolver already printed with the
 * modelled slippage:
 *   gapped-only        before CLEAN_STOP_SLIPPAGE_SINCE — FR-7's gapped stops alone;
 *   clean-stops        CLEAN_STOP_SLIPPAGE_SINCE — every stop-kind exit, not the expiry close;
 *   every-market-exit  from EXPIRY_SLIPPAGE_SINCE — every stop-kind exit and the expiry close.
 */
export type SlippageClass = "gapped-only" | "clean-stops" | "every-market-exit";

/**
 * Every engine version from CLEAN_STOP_SLIPPAGE_SINCE on, placed by name with
 * the exits its resolver slips. The population, not a rule: a later date is no
 * evidence of which exits an engine slips (review of #692, finding 2), so the
 * next ANALYZER_VERSION is refused here until someone places it —
 * `tests/bankedFraction.test.ts` fails on the bump that forgets.
 */
export const PLACED_ENGINE_VERSIONS: ReadonlyMap<string, SlippageClass> = new Map<string, SlippageClass>([
  [CLEAN_STOP_SLIPPAGE_SINCE, "clean-stops"],
  [EXPIRY_SLIPPAGE_SINCE, "every-market-exit"],
]);

/**
 * A corpus's slippage class, from its engine version. A version dated before
 * CLEAN_STOP_SLIPPAGE_SINCE's day slipped gapped stops alone; from that day
 * on a version is placed by name in PLACED_ENGINE_VERSIONS or refused — the
 * two changes shipped on one day, so no date can tell them apart, and no date
 * after them says what a later engine did. A version that carries no date is
 * refused too. Never guessed.
 */
export function slippageClassOf(analyzerVersion: string): SlippageClass {
  const placed = PLACED_ENGINE_VERSIONS.get(analyzerVersion);
  if (placed !== undefined) return placed;
  const day = (version: string) => /^(\d{4}\.\d{2}\.\d{2})\./.exec(version)?.[1] ?? null;
  const corpusDay = day(analyzerVersion);
  if (corpusDay === null) {
    throw new Error(`the corpus's engine version "${analyzerVersion}" carries no date — the reader cannot tell which exits it already slipped`);
  }
  if (corpusDay < (day(CLEAN_STOP_SLIPPAGE_SINCE) as string)) return "gapped-only";
  throw new Error(
    `the corpus's engine version "${analyzerVersion}" is dated on or after ${CLEAN_STOP_SLIPPAGE_SINCE} and is not placed in PLACED_ENGINE_VERSIONS — ` +
      "the reader cannot place which exits it already slipped; add it with the exits its resolver slips",
  );
}

/**
 * What the current resolver does to one row its corpus's engine left
 * unslipped, from the legs, without a re-simulate.
 *
 * The resolver now prints every market-order exit with the modelled slippage
 * against the position: a stop-kind exit that did not gap — stop_loss,
 * breakeven_stop, tp1_lock, ambiguous, FR-3's same-bar exit among them — at
 * its level ∓ estimatedSlippage × scale (CLEAN_STOP_SLIPPAGE_SINCE), and the
 * review-end close at its emitted print ∓ the same (EXPIRY_SLIPPAGE_SINCE).
 * Nothing else about the resolution moves: the trigger, the exit time and
 * every limit print are what the corpus emitted. So the row's realized R
 * falls by exactly its exit fraction (1 without a tp1 leg, ½ with one) times
 * the price moved, over the planned risk. The new print is rounded as the
 * resolver rounds it (toFixed(8)); a stop's is exact from its level, an
 * expiry's from its already-rounded print, within 1e-8 in price.
 *
 * By class: a `gapped-only` row prices both; a `clean-stops` row prices the
 * expiry alone (its stops already slipped) and returns null for a stop;
 * an `every-market-exit` row prices nothing. Null for a limit print. A stop
 * printed off its level gapped and already carries FR-7's gap slippage:
 * counted, charged nothing. Every hole refuses — an exit without a kind, a
 * stop kind without its level, a priced exit without a finite slippage.
 */
export function exitSlippageCharge(input: {
  estimatedSlippage: number;
  legs: Leg[];
  levels: StopLevels;
  riskDistance: number;
  scale: number;
  side: "buy" | "sell";
  slippageClass: SlippageClass;
}): { charged: boolean; chargeR: number; kind: string } | null {
  const exit = input.legs.find((leg) => leg.leg === "exit");
  if (!exit) {
    throw new Error("a filled row carries no exit leg");
  }
  if (typeof exit.kind !== "string" || exit.kind.length === 0) {
    throw new Error("a filled row's exit leg names no kind — the reader cannot tell a stop print from a limit print");
  }
  const isExpiry = exit.kind === "expiry";
  if (!isExpiry && !STOP_PRINT_KINDS.has(exit.kind)) return null;
  if (input.slippageClass === "every-market-exit") return null;
  if (!isExpiry && input.slippageClass !== "gapped-only") return null;
  if (!Number.isFinite(input.estimatedSlippage) || input.estimatedSlippage < 0) {
    throw new Error(`a ${exit.kind} row carries no finite estimatedSlippage — the charge cannot be priced from what the row does not state`);
  }
  const level = isExpiry ? exit.price : levelOfStopPrint(exit.kind, exit.price, input.levels);
  if (level === null) return { charged: false, chargeR: 0, kind: exit.kind };
  const against = input.side === "buy" ? -1 : 1;
  const slipped = Number((level + against * input.estimatedSlippage * input.scale).toFixed(8));
  const exitFraction = input.legs.some((leg) => leg.leg === "tp1") ? 1 - SHIPPED_FRACTION : 1;
  const chargeR = (exitFraction * against * (slipped - exit.price)) / input.riskDistance;
  // At scale 0 the product is −0 on a buy; a charge of nothing is 0.
  return { charged: true, chargeR: chargeR === 0 ? 0 : chargeR, kind: exit.kind };
}

/**
 * Realised R at a banked fraction, from the legs — `realizedRFromLegs` with
 * the 0.5 freed. Null when the legs do not describe a resolution.
 */
export function rFromLegs(input: {
  commission: number;
  fraction: number;
  legs: Leg[];
  riskDistance: number;
  side: "buy" | "sell";
}): number | null {
  const entry = input.legs.find((leg) => leg.leg === "entry");
  const exit = input.legs.find((leg) => leg.leg === "exit");
  if (!entry || !exit || !(input.riskDistance > 0)) {
    return null;
  }
  const sign = input.side === "buy" ? 1 : -1;
  const tp1 = input.legs.find((leg) => leg.leg === "tp1");
  const costR = input.commission / input.riskDistance;
  const exitR = (sign * (exit.price - entry.price)) / input.riskDistance;
  if (!tp1) {
    return exitR - costR;
  }
  const tp1R = (sign * (tp1.price - entry.price)) / input.riskDistance;
  return input.fraction * tp1R + (1 - input.fraction) * exitR - costR;
}

export type FractionCell = {
  assetType: string;
  /** Set on market-grain cells: the market's own symbol; `heldOut` marks one the verdict pool excludes. */
  symbol?: string;
  heldOut?: boolean;
  /** The shipped ladder's TP1 half: ½ × tp1R summed over rows with a tp1 leg. */
  bankedHalf: number;
  bestFraction: number;
  /** Best fraction under the slippage-priced model. */
  bestFractionAdjusted: number;
  byFraction: Map<number, { deltaVsShipped: number; expectancy: number | null; total: number }>;
  /** R_adj(f) = R(f) − (1−f)·sR on charged rows; deltaVsShipped is against R_adj(½). */
  byFractionAdjusted: Map<number, { deltaVsShipped: number; total: number }>;
  costTotal: number;
  filled: number;
  fold: string;
  noTp1Rows: number;
  /** Rows without a tp1 leg, at their one price. */
  noTp1Total: number;
  /** The shipped ladder's runner half: ½ × exitR summed over rows with a tp1 leg. */
  runnerHalf: number;
  /** Exits resolved on the TP1 touch bar itself (FR-3's same-bar arming), by exit kind. */
  sameBar: { lockRows: number; lockSameBar: number; takeProfitRows: number; takeProfitSameBar: number };
  shippedTotal: number;
  /** Σ estimatedSlippage/riskDistance over charged rows — the S of the round-1 finding. */
  slippageTotal: number;
  /** tp1 rows whose exit is a stop print at its level or an expiry print. */
  stopPrintRows: number;
  /** Set under --exit-slippage only: every market-order exit the corpus's engine left unslipped, charged. */
  exitSlippage?: ExitSlippageCell;
  tp1Rows: number;
};

/** One cell of the --exit-slippage table. Charges are Σ exit fraction × slippage × scale / risk, in R — what the current physics takes from `shippedTotal`. */
export type ExitSlippageCell = {
  /** Clean (charged) stop-kind rows by exit kind. */
  cleanByKind: Record<string, number>;
  cleanStops: number;
  expiryCharge: number;
  /** Expiry rows without a tp1 leg that the charge moves from expired_in_profit to expired_at_loss (FR-8 reads net R). */
  expiryLabelFlips: number;
  expiryRows: number;
  gappedStops: number;
  stopCharge: number;
  /** Stop-kind rows priced — zero on a clean-stops corpus, whose stops already slipped. */
  stopKindRows: number;
};

type RawCell = {
  assetType: string;
  symbol?: string;
  heldOut?: boolean;
  bankedHalf: number;
  byFraction: number[];
  byFractionAdjusted: number[];
  costTotal: number;
  filled: number;
  fold: string;
  noTp1Rows: number;
  noTp1Total: number;
  runnerHalf: number;
  sameBar: { lockRows: number; lockSameBar: number; takeProfitRows: number; takeProfitSameBar: number };
  shippedTotal: number;
  slippageTotal: number;
  stopPrintRows: number;
  exitSlippage?: ExitSlippageCell;
  tp1Rows: number;
};

/** Per class and fold at the market grain: how the class's markets read, and whether a class value is admissible (this reader's summary of amendment 33's per-market rule). */
export type ClassAgreement = {
  assetType: string;
  fold: string;
  markets: number;
  /** Markets with no slope at all — every row without a tp1 leg — counted, never a vote. */
  flat: number;
  /** Markets whose Δ_adj (best f vs ½, slippage-priced) is positive, i.e. read best f ≠ ½. */
  bestNotHalf: number;
  bestZero: number;
  bestOne: number;
  /** Markets whose R_adj(0) − R_adj(½) is positive / negative. */
  zeroBeatsHalf: number;
  halfBeatsZero: number;
  /** True only when every market with a slope reads the same sign of R_adj(0) − R_adj(½); flat markets do not vote and do not veto. */
  classValueAdmissible: boolean;
};

export type FractionSummary = {
  agreement: Map<string, ClassAgreement>;
  analyzerVersion: string;
  anchor: string;
  cells: Map<string, FractionCell>;
  grain: Grain;
  corpora: Array<{ manifestHash: string; path: string }>;
  folds: string[];
  holdout: ResolvedHeldOut;
  includeHoldout: boolean;
  years: YearsFilter;
  yearMapSource: YearMap["source"] | null;
  witnessTablePath?: string;
  /** The --exit-slippage pass, when asked for: the modelled-cost scale its charge is priced at. */
  exitSlippage: { scale: number } | null;
  /** Which market-order exits the corpus's engine already slipped — decided from its version, stated on every read. */
  slippageClass: SlippageClass;
  /** The modelled-cost scale the corpus's resolver ran at, as its manifest states it; null when it states none. Printed beside the hybrid table, which does not apply it. */
  modeledCostScale: number | null;
  rows: {
    controlChecked: number;
    otherYears: number;
    dataAbsent: number;
    heldOut: number;
    notAccepted: number;
    otherFolds: number;
    otherVariants: number;
    sealed: number;
    total: number;
    unfilled: number;
  };
  variant: string;
};

function rawCell(assetType: string, fold: string, exitSlippage: boolean): RawCell {
  return {
    ...(exitSlippage && {
      exitSlippage: { cleanByKind: {}, cleanStops: 0, expiryCharge: 0, expiryLabelFlips: 0, expiryRows: 0, gappedStops: 0, stopCharge: 0, stopKindRows: 0 },
    }),
    assetType,
    bankedHalf: 0,
    byFraction: FRACTIONS.map(() => 0),
    byFractionAdjusted: FRACTIONS.map(() => 0),
    costTotal: 0,
    filled: 0,
    fold,
    noTp1Rows: 0,
    noTp1Total: 0,
    runnerHalf: 0,
    sameBar: { lockRows: 0, lockSameBar: 0, takeProfitRows: 0, takeProfitSameBar: 0 },
    shippedTotal: 0,
    slippageTotal: 0,
    stopPrintRows: 0,
    tp1Rows: 0,
  };
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return value !== undefined && value !== null && Number.isFinite(number) ? number : null;
}

function declaredFoldNames(manifest: SweepManifest): Set<string> | null {
  if (manifest.folds) {
    return new Set(manifest.folds.map((fold) => fold.name));
  }
  if (manifest.foldsByClass) {
    const names = new Set<string>();
    for (const classFolds of Object.values(manifest.foldsByClass)) {
      for (const fold of classFolds) names.add(fold.name);
    }
    return names;
  }
  return null;
}

function derive(raw: RawCell): FractionCell {
  const byFraction = new Map<number, { deltaVsShipped: number; expectancy: number | null; total: number }>();
  // Ties resolve to the shipped fraction: a cell that prices the same at every
  // fraction has no preference, and the first candidate must not inherit one.
  let best = SHIPPED_FRACTION;
  let bestTotal = raw.byFraction[FRACTIONS.indexOf(SHIPPED_FRACTION)];
  FRACTIONS.forEach((fraction, index) => {
    const total = raw.byFraction[index];
    byFraction.set(fraction, {
      deltaVsShipped: total - raw.shippedTotal,
      expectancy: raw.filled > 0 ? total / raw.filled : null,
      total,
    });
    if (total > bestTotal + 1e-9) {
      bestTotal = total;
      best = fraction;
    }
  });
  const byFractionAdjusted = new Map<number, { deltaVsShipped: number; total: number }>();
  const shippedAdjusted = raw.byFractionAdjusted[FRACTIONS.indexOf(SHIPPED_FRACTION)];
  let bestAdjusted = SHIPPED_FRACTION;
  let bestAdjustedTotal = shippedAdjusted;
  FRACTIONS.forEach((fraction, index) => {
    const total = raw.byFractionAdjusted[index];
    byFractionAdjusted.set(fraction, { deltaVsShipped: total - shippedAdjusted, total });
    if (total > bestAdjustedTotal + 1e-9) {
      bestAdjustedTotal = total;
      bestAdjusted = fraction;
    }
  });
  return {
    assetType: raw.assetType,
    ...(raw.symbol !== undefined && { symbol: raw.symbol, heldOut: Boolean(raw.heldOut) }),
    bankedHalf: raw.bankedHalf,
    bestFraction: best,
    bestFractionAdjusted: bestAdjusted,
    byFraction,
    byFractionAdjusted,
    costTotal: raw.costTotal,
    filled: raw.filled,
    fold: raw.fold,
    noTp1Rows: raw.noTp1Rows,
    noTp1Total: raw.noTp1Total,
    runnerHalf: raw.runnerHalf,
    sameBar: { ...raw.sameBar },
    shippedTotal: raw.shippedTotal,
    slippageTotal: raw.slippageTotal,
    stopPrintRows: raw.stopPrintRows,
    ...(raw.exitSlippage && { exitSlippage: { ...raw.exitSlippage, cleanByKind: { ...raw.exitSlippage.cleanByKind } } }),
    tp1Rows: raw.tp1Rows,
  };
}

export async function bankedFraction(input: {
  folds: string[];
  grain?: Grain;
  holdoutPinDir?: string;
  includeHoldout?: boolean;
  paths: string[];
  /** Price every market-order exit the corpus left unslipped at the current resolver's physics (the --exit-slippage table). */
  exitSlippage?: boolean;
  variant: string;
  witnessTablePath?: string;
  years?: YearsFilter;
}): Promise<FractionSummary> {
  if (input.paths.length === 0) {
    throw new OperatorInputError(
      "banked-fraction: no corpus paths given — pass one or more emit.jsonl shards, each with its .manifest.json beside it",
    );
  }
  if (input.folds.includes(SEALED_FOLD)) {
    throw new OperatorInputError(`the "${SEALED_FOLD}" fold is sealed — see --folds`);
  }
  const wanted = new Set(input.folds);
  const manifests = input.paths.map((path) => assertManifest(path));
  let identity: string | null = null;
  for (const [index, manifest] of manifests.entries()) {
    const record = manifest as unknown as Record<string, unknown>;
    const shardIdentity = stableStringify(
      Object.fromEntries(IDENTITY_TERMS.map((term) => [term, record[term]])),
    );
    if (identity === null) {
      identity = shardIdentity;
    } else if (identity !== shardIdentity) {
      throw new Error(
        `${input.paths[index]}: this shard's engine, anchor, depth, grid, folds, clock, conditions, cost scales or acceptance mode differ from the first shard's — two measurements cannot be priced as one`,
      );
    }
    const declared = declaredFoldNames(manifest);
    if (declared === null) {
      throw new Error(`${input.paths[index]}: the manifest declares no folds — a legacy two-split corpus cannot be read by fold name`);
    }
    for (const fold of input.folds) {
      if (!declared.has(fold)) {
        throw new OperatorInputError(
          `${input.paths[index]}: the manifest declares no "${fold}" fold (it declares ${[...declared].sort().join(", ")})`,
        );
      }
    }
  }
  // Every slippage model here depends on which exits the corpus's engine
  // already slipped, so the class is decided before a row is read, on every
  // path. The identity check above holds every shard to one engine version.
  let slippageClass: SlippageClass;
  try {
    slippageClass = slippageClassOf(manifests[0].analyzerVersion);
  } catch (error) {
    throw new Error(`${input.paths[0]}: ${error instanceof Error ? error.message : String(error)}`);
  }
  // The exit-slippage pass prices only what the corpus left unslipped, and
  // charges at the scale its resolver ran at — stated, never assumed.
  let exitScale: number | null = null;
  if (input.exitSlippage) {
    for (const [index, manifest] of manifests.entries()) {
      if (slippageClass === "every-market-exit") {
        throw new Error(
          `${input.paths[index]}: engine ${manifest.analyzerVersion} already slips every market-order exit (from ${EXPIRY_SLIPPAGE_SINCE}) — charging it again would bill the slippage twice`,
        );
      }
      const scale = manifest.modeledCostScale;
      if (typeof scale !== "number" || !Number.isFinite(scale) || scale < 0) {
        throw new Error(`${input.paths[index]}: the manifest states no modeledCostScale — the exit charge is the slippage at the scale the resolver ran at, and this corpus does not say what that was`);
      }
      // The identity check above already holds every shard to one scale.
      exitScale = scale;
    }
  }
  const holdout = resolveHeldOut(manifests, input.holdoutPinDir);
  const heldOut = new Set(input.includeHoldout ? [] : holdout.markets);
  const years: YearsFilter = input.years ?? "all";
  // A stratified read needs a year map for every market it will price,
  // resolved BEFORE a row is read: an absent verdict is not a contained one.
  const yearMap = years === "all"
    ? null
    : resolveYearMap({ manifests, witnessTablePath: input.witnessTablePath });
  if (yearMap) {
    const unplaceable = manifests.flatMap((manifest) => manifest.symbols.map((entry) => entry.symbol))
      .filter((symbol, index, all) => all.indexOf(symbol) === index && !heldOut.has(symbol) && yearMap.bucketOf(symbol, 2000) === "unknown")
      .sort();
    if (unplaceable.length > 0) {
      throw new OperatorInputError(`the year map (${yearMap.source}) cannot place ${unplaceable.length} market(s) this read would price: ${unplaceable.join(", ")}`);
    }
  }
  const raw = new Map<string, RawCell>();
  const grain: Grain = input.grain ?? "class";
  const summary: FractionSummary = {
    agreement: new Map(),
    grain,
    analyzerVersion: manifests[0].analyzerVersion,
    anchor: manifests[0].anchor,
    cells: new Map(),
    corpora: [],
    folds: [...input.folds],
    holdout,
    includeHoldout: Boolean(input.includeHoldout),
    exitSlippage: exitScale === null ? null : { scale: exitScale },
    modeledCostScale: typeof manifests[0].modeledCostScale === "number" && Number.isFinite(manifests[0].modeledCostScale)
      ? manifests[0].modeledCostScale
      : null,
    slippageClass,
    years,
    yearMapSource: yearMap ? yearMap.source : null,
    ...(input.witnessTablePath && { witnessTablePath: input.witnessTablePath }),
    rows: {
      controlChecked: 0,
      otherYears: 0,
      dataAbsent: 0,
      heldOut: 0,
      notAccepted: 0,
      otherFolds: 0,
      otherVariants: 0,
      sealed: 0,
      total: 0,
      unfilled: 0,
    },
    variant: input.variant,
  };
  for (const path of input.paths) {
    const manifest = await assertManifestedCorpusStreaming(path, (row: SweepEmitRow) => {
      summary.rows.total += 1;
      if (row.accepted !== true) {
        summary.rows.notAccepted += 1;
        return;
      }
      const split = String(row.split);
      if (!wanted.has(split)) {
        summary.rows.otherFolds += 1;
        return;
      }
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      if (variant !== input.variant) {
        summary.rows.otherVariants += 1;
        return;
      }
      if (row.noBarsInReviewWindow === true) {
        summary.rows.dataAbsent += 1;
        return;
      }
      if (!FILLED_OUTCOMES.has(String(row.outcome))) {
        // "unfilled", and any synthetic label a fixture uses for a row that
        // never resolved: no legs, nothing to price.
        summary.rows.unfilled += 1;
        return;
      }
      const symbol = String(row.symbol);
      if (heldOut.has(symbol)) {
        summary.rows.heldOut += 1;
        return;
      }
      if (yearMap) {
        const time = finite(row.time);
        if (time === null) {
          throw new Error(`${path}: a filled ${symbol} row carries no finite time — a stratified read cannot place it`);
        }
        if (yearMap.bucketOf(symbol, yearOf(time)) !== years) {
          summary.rows.otherYears += 1;
          return;
        }
      }
      const legs = Array.isArray(row.legs) ? (row.legs as Leg[]) : null;
      const riskDistance = finite(row.riskDistance);
      const realized = finite(row.realizedR);
      const side = row.side === "sell" ? "sell" : row.side === "buy" ? "buy" : null;
      const commission = finite(row.estimatedCommission) ?? 0;
      if (!legs || riskDistance === null || realized === null || side === null) {
        throw new Error(`${path}: a filled ${symbol} row carries no legs, riskDistance, realizedR or side — a hole in the corpus is a refused corpus`);
      }
      const priced = FRACTIONS.map((fraction) => rFromLegs({ commission, fraction, legs, riskDistance, side }));
      if (priced.some((value) => value === null)) {
        throw new Error(`${path}: a filled ${symbol} row's legs describe no resolution (no entry or exit leg)`);
      }
      // The control: at the shipped fraction the arithmetic IS the emitter's.
      const shipped = priced[FRACTIONS.indexOf(SHIPPED_FRACTION)] as number;
      if (Math.abs(shipped - realized) > CONTROL_TOLERANCE) {
        throw new Error(
          `${path}: the shipped fraction does not reproduce realizedR on a ${symbol} ${String(row.outcome)} row ` +
            `(legs give ${shipped.toFixed(4)}, the row says ${realized.toFixed(4)}) — this reader's arithmetic is not this corpus's, so it reports nothing`,
        );
      }
      summary.rows.controlChecked += 1;
      const entry = legs.find((leg) => leg.leg === "entry") as Leg;
      const exit = legs.find((leg) => leg.leg === "exit") as Leg;
      const tp1 = legs.find((leg) => leg.leg === "tp1");
      const sign = side === "buy" ? 1 : -1;
      const assetType = getAssetType(symbol);
      let slip = { charged: false, kind: null as string | null, sR: 0 };
      let sameBar = false;
      if (tp1) {
        const estimatedSlippage = finite(row.estimatedSlippage);
        if (estimatedSlippage === null) {
          throw new Error(`${path}: a ${symbol} tp1 row carries no finite estimatedSlippage — the slippage-priced table cannot charge what the row does not state`);
        }
        try {
          slip = stopPrintSlippage({
            estimatedSlippage,
            legs,
            levels: { entryPrice: finite(row.entryPrice), stopLoss: finite(row.stopLoss), takeProfit1: finite(row.takeProfit1) },
            riskDistance,
            slippageClass,
          });
        } catch (error) {
          throw new Error(`${path}: ${symbol} ${String(row.outcome)} row — ${error instanceof Error ? error.message : String(error)}`);
        }
        const tp1Time = finite(tp1.time);
        const exitTime = finite(exit.time);
        if (tp1Time === null || exitTime === null) {
          throw new Error(`${path}: a ${symbol} tp1 row's legs carry no finite times — the same-bar share cannot be read`);
        }
        sameBar = exitTime === tp1Time;
      }
      let exitCharge: ReturnType<typeof exitSlippageCharge> = null;
      if (exitScale !== null) {
        try {
          exitCharge = exitSlippageCharge({
            estimatedSlippage: finite(row.estimatedSlippage) ?? Number.NaN,
            legs,
            levels: { entryPrice: finite(row.entryPrice), stopLoss: finite(row.stopLoss), takeProfit1: finite(row.takeProfit1) },
            riskDistance,
            scale: exitScale,
            side,
            slippageClass,
          });
        } catch (error) {
          throw new Error(`${path}: ${symbol} ${String(row.outcome)} row — ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const keys = [`${assetType}|${split}`, `pooled|${split}`];
      if (grain === "market") keys.push(`${symbol}|${split}`);
      for (const key of keys) {
        let cell = raw.get(key);
        if (!cell) {
          cell = rawCell(key.startsWith("pooled|") ? "pooled" : assetType, split, exitScale !== null);
          if (key === `${symbol}|${split}`) {
            cell.symbol = symbol;
            cell.heldOut = holdout.markets.includes(symbol);
          }
          raw.set(key, cell);
        }
        cell.filled += 1;
        cell.shippedTotal += realized;
        if (cell.exitSlippage && exitCharge) {
          const pass = cell.exitSlippage;
          if (exitCharge.kind === "expiry") {
            pass.expiryRows += 1;
            pass.expiryCharge += exitCharge.chargeR;
            // FR-8 labels an expiry without a tp1 leg by the sign of its net R.
            if (!tp1 && row.outcome === "expired_in_profit" && Number((realized - exitCharge.chargeR).toFixed(4)) <= 0) {
              pass.expiryLabelFlips += 1;
            }
          } else {
            pass.stopKindRows += 1;
            if (exitCharge.charged) {
              pass.cleanStops += 1;
              pass.cleanByKind[exitCharge.kind] = (pass.cleanByKind[exitCharge.kind] ?? 0) + 1;
              pass.stopCharge += exitCharge.chargeR;
            } else {
              pass.gappedStops += 1;
            }
          }
        }
        priced.forEach((value, index) => {
          cell.byFraction[index] += value as number;
          cell.byFractionAdjusted[index] += (value as number) - (slip.charged ? (1 - FRACTIONS[index]) * slip.sR : 0);
        });
        if (tp1) {
          cell.tp1Rows += 1;
          if (slip.charged) {
            cell.stopPrintRows += 1;
            cell.slippageTotal += slip.sR;
          }
          if (slip.kind === "tp1_lock") {
            cell.sameBar.lockRows += 1;
            if (sameBar) cell.sameBar.lockSameBar += 1;
          } else if (slip.kind === "take_profit") {
            cell.sameBar.takeProfitRows += 1;
            if (sameBar) cell.sameBar.takeProfitSameBar += 1;
          }
          cell.bankedHalf += (SHIPPED_FRACTION * sign * (tp1.price - entry.price)) / riskDistance;
          cell.runnerHalf += ((1 - SHIPPED_FRACTION) * sign * (exit.price - entry.price)) / riskDistance;
          cell.costTotal += commission / riskDistance;
        } else {
          cell.noTp1Rows += 1;
          cell.noTp1Total += realized;
        }
      }
    });
    summary.rows.total += manifest.sealedRows;
    summary.rows.sealed += manifest.sealedRows;
    summary.corpora.push({ manifestHash: manifest.manifestHash, path });
  }
  for (const [key, cell] of [...raw.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    summary.cells.set(key, derive(cell));
  }
  if (grain === "market") {
    for (const cell of summary.cells.values()) {
      if (cell.symbol === undefined || cell.heldOut) continue;
      const key = `${cell.assetType}|${cell.fold}`;
      let agreement = summary.agreement.get(key);
      if (!agreement) {
        agreement = { assetType: cell.assetType, bestNotHalf: 0, bestOne: 0, bestZero: 0, classValueAdmissible: false, flat: 0, fold: cell.fold, halfBeatsZero: 0, markets: 0, zeroBeatsHalf: 0 };
        summary.agreement.set(key, agreement);
      }
      agreement.markets += 1;
      const zeroVsHalf = cell.byFractionAdjusted.get(0)!.deltaVsShipped;
      if (zeroVsHalf > 0) agreement.zeroBeatsHalf += 1;
      else if (zeroVsHalf < 0) agreement.halfBeatsZero += 1;
      else {
        // No slope: every row without a tp1 leg. Not a vote either way.
        agreement.flat += 1;
        continue;
      }
      if (cell.bestFractionAdjusted !== SHIPPED_FRACTION) agreement.bestNotHalf += 1;
      if (cell.bestFractionAdjusted === 0) agreement.bestZero += 1;
      if (cell.bestFractionAdjusted === 1) agreement.bestOne += 1;
    }
    for (const agreement of summary.agreement.values()) {
      // This reader's summary of amendment 33's per-market rule: every market WITH a slope reads the same
      // sign, slippage-priced; a flat market neither supports nor contradicts, so it does not veto.
      const voting = agreement.markets - agreement.flat;
      agreement.classValueAdmissible = voting > 0 &&
        (agreement.zeroBeatsHalf === voting || agreement.halfBeatsZero === voting);
    }
  }
  return summary;
}

function fmt(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function formatBankedFraction(summary: FractionSummary): string {
  const lines: string[] = [];
  lines.push(
    `corpus ${summary.corpora.map((corpus) => corpus.manifestHash.slice(0, 12)).join("+")} · engine ${summary.analyzerVersion} · anchor ${summary.anchor} · variant ${summary.variant}`,
  );
  lines.push(
    `folds read: ${summary.folds.join(", ")} · ${SEALED_FOLD}: SEALED, not read (${summary.rows.sealed} rows withheld at the door)`,
  );
  lines.push(
    `rows ${summary.rows.total}: ${summary.rows.controlChecked} priced · ${summary.rows.notAccepted} not accepted · ${summary.rows.otherFolds} in other folds · ${summary.rows.otherVariants} other variants · ${summary.rows.unfilled} unfilled · ${summary.rows.dataAbsent} data-absent · ${summary.rows.heldOut} held out · ${summary.rows.otherYears} in other years`,
  );
  lines.push(
    summary.years === "all"
      ? "years: all (no feed-character stratification)"
      : `years: ${summary.years} · ${describeYearMap(summary.yearMapSource, summary.witnessTablePath)}`,
  );
  lines.push(
    `control: ${summary.rows.controlChecked} rows reproduced their emitted realizedR at the shipped fraction ${SHIPPED_FRACTION} (tolerance ${CONTROL_TOLERANCE})`,
  );
  lines.push(
    summary.includeHoldout
      ? `held-out markets INCLUDED in every pool (--include-holdout): ${summary.holdout.markets.join(", ")} — a whole-roster measurement, not a verdict's`
      : describeHeldOut(summary.holdout, { labels: false, pools: true }),
  );
  const [classLine, ...physics] = statementLines({
    exitScale: summary.exitSlippage?.scale ?? null,
    modeledCostScale: summary.modeledCostScale,
    slippageClass: summary.slippageClass,
  });
  lines.push(classLine);
  lines.push("");
  lines.push(...physics);
  for (const fold of summary.folds) {
    lines.push("");
    lines.push(`=== ${fold.toUpperCase()} ===`);
    lines.push(
      `| class | filled | tp1 rows | no-tp1 rows | shipped R (½) | banked half | runner half | costs | no-tp1 R | ${FRACTIONS.map((fraction) => `R(${fraction})`).join(" | ")} | best f | Δ best vs ½ |`,
    );
    lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ${FRACTIONS.map(() => "---:").join(" | ")} | ---: | ---: |`);
    for (const [key, cell] of summary.cells) {
      // The class tables print class and pooled cells only; a market cell has its own table below.
      if (cell.fold !== fold || cell.symbol !== undefined) continue;
      const best = cell.byFraction.get(cell.bestFraction)!;
      lines.push(
        `| ${key.startsWith("pooled|") ? "**pooled**" : cell.assetType} | ${cell.filled} | ${cell.tp1Rows} | ${cell.noTp1Rows} | ${fmt(cell.shippedTotal)} | ${fmt(cell.bankedHalf)} | ${fmt(cell.runnerHalf)} | ${fmt(-cell.costTotal)} | ${fmt(cell.noTp1Total)} | ${FRACTIONS.map((fraction) => fmt(cell.byFraction.get(fraction)!.total)).join(" | ")} | ${cell.bestFraction} | ${fmt(best.deltaVsShipped)} |`,
      );
    }
    lines.push("");
    lines.push(`--- ${fold} · slippage-priced and same-bar ---`);
    lines.push(
      `| class | tp1 rows | stop prints | S | ${FRACTIONS.map((fraction) => `R_adj(${fraction})`).join(" | ")} | best f (adj) | Δ_adj best vs ½ | lock exits same-bar | take_profit exits same-bar |`,
    );
    lines.push(`| --- | ---: | ---: | ---: | ${FRACTIONS.map(() => "---:").join(" | ")} | ---: | ---: | ---: | ---: |`);
    for (const [key, cell] of summary.cells) {
      if (cell.fold !== fold || cell.symbol !== undefined) continue;
      const bestAdjusted = cell.byFractionAdjusted.get(cell.bestFractionAdjusted)!;
      lines.push(
        `| ${key.startsWith("pooled|") ? "**pooled**" : cell.assetType} | ${cell.tp1Rows} | ${cell.stopPrintRows} | ${fmt(cell.slippageTotal)} | ${FRACTIONS.map((fraction) => fmt(cell.byFractionAdjusted.get(fraction)!.total)).join(" | ")} | ${cell.bestFractionAdjusted} | ${fmt(bestAdjusted.deltaVsShipped)} | ${share(cell.sameBar.lockSameBar, cell.sameBar.lockRows)} | ${share(cell.sameBar.takeProfitSameBar, cell.sameBar.takeProfitRows)} |`,
      );
    }
    if (summary.exitSlippage) {
      lines.push("");
      lines.push(`--- ${fold} · exit slippage (market-order exits at the current resolver's physics; class ${summary.slippageClass}) ---`);
      lines.push(EXIT_SLIPPAGE_HEADER);
      lines.push(EXIT_SLIPPAGE_RULE);
      for (const [key, cell] of summary.cells) {
        if (cell.fold !== fold || cell.symbol !== undefined) continue;
        lines.push(exitSlippageLine(key.startsWith("pooled|") ? "**pooled**" : cell.assetType, cell, summary.slippageClass));
      }
      if (summary.grain === "market") {
        lines.push("");
        lines.push(`--- ${fold} · exit slippage per market ---`);
        lines.push(EXIT_SLIPPAGE_HEADER.replace("| class |", "| class | market | held out |"));
        lines.push(EXIT_SLIPPAGE_RULE.replace("| --- |", "| --- | --- | --- |"));
        const markets = [...summary.cells.values()]
          .filter((cell) => cell.fold === fold && cell.symbol !== undefined)
          .sort((a, b) => a.assetType.localeCompare(b.assetType) || a.symbol!.localeCompare(b.symbol!));
        for (const cell of markets) {
          lines.push(exitSlippageLine(`${cell.assetType} | ${cell.symbol} | ${cell.heldOut ? "yes" : "no"}`, cell, summary.slippageClass));
        }
      }
    }
    if (summary.grain === "market") {
      lines.push("");
      lines.push(`--- ${fold} · per market (amendment 33: per market, never per class) ---`);
      lines.push(
        `| class | market | held out | filled | tp1 rows | R(½) | R(0) | R(1) | best f | Δ best vs ½ | stop prints | S | ${FRACTIONS.map((fraction) => `R_adj(${fraction})`).join(" | ")} | best f (adj) | Δ_adj best vs ½ | lock exits same-bar |`,
      );
      lines.push(`| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ${FRACTIONS.map(() => "---:").join(" | ")} | ---: | ---: | ---: |`);
      const markets = [...summary.cells.values()]
        .filter((cell) => cell.fold === fold && cell.symbol !== undefined)
        .sort((a, b) => a.assetType.localeCompare(b.assetType) || a.symbol!.localeCompare(b.symbol!));
      for (const cell of markets) {
        const best = cell.byFraction.get(cell.bestFraction)!;
        const bestAdjusted = cell.byFractionAdjusted.get(cell.bestFractionAdjusted)!;
        lines.push(
          `| ${cell.assetType} | ${cell.symbol} | ${cell.heldOut ? "yes" : "no"} | ${cell.filled} | ${cell.tp1Rows} | ${fmt(cell.shippedTotal)} | ${fmt(cell.byFraction.get(0)!.total)} | ${fmt(cell.byFraction.get(1)!.total)} | ${cell.bestFraction} | ${fmt(best.deltaVsShipped)} | ${cell.stopPrintRows} | ${fmt(cell.slippageTotal)} | ${FRACTIONS.map((fraction) => fmt(cell.byFractionAdjusted.get(fraction)!.total)).join(" | ")} | ${cell.bestFractionAdjusted} | ${fmt(bestAdjusted.deltaVsShipped)} | ${share(cell.sameBar.lockSameBar, cell.sameBar.lockRows)} |`,
        );
      }
      lines.push("");
      lines.push(`--- ${fold} · class value admissible? (this reader's summary of amendment 33's per-market rule: every market with a slope reads the same sign of R_adj(0) − R_adj(½); a flat market has no tp1 rows and does not vote) ---`);
      lines.push("| class | markets | flat | R_adj(0) > R_adj(½) | R_adj(½) > R_adj(0) | best f (adj) = 0 | = 1 | ≠ ½ | class value admissible |");
      lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
      for (const agreement of [...summary.agreement.values()].filter((entry) => entry.fold === fold).sort((a, b) => a.assetType.localeCompare(b.assetType))) {
        lines.push(
          `| ${agreement.assetType} | ${agreement.markets} | ${agreement.flat} | ${agreement.zeroBeatsHalf} | ${agreement.halfBeatsZero} | ${agreement.bestZero} | ${agreement.bestOne} | ${agreement.bestNotHalf} | ${agreement.classValueAdmissible ? "yes" : "NO"} |`,
        );
      }
    }
  }
  return lines.join("\n");
}

/** What each slippage class means, in one clause each, for the header and the two model lines. */
const SLIPPAGE_CLASS_TEXT: Record<SlippageClass, string> = {
  "gapped-only": `the engine that wrote this corpus slipped only gapped stop prints (FR-7); every clean stop and every expiry close printed without slippage (before ${CLEAN_STOP_SLIPPAGE_SINCE})`,
  "clean-stops": `the engine that wrote this corpus slipped every stop-kind print, gapped or clean, and not the expiry close (${CLEAN_STOP_SLIPPAGE_SINCE})`,
  "every-market-exit": `the engine that wrote this corpus slipped every market-order exit — every stop-kind print and the expiry close (from ${EXPIRY_SLIPPAGE_SINCE})`,
};
const SLIPPAGE_RIDES: Record<SlippageClass, string> = {
  "gapped-only": "slippage rides only in gapped prints (FR-7)",
  "clean-stops": "slippage rides in every stop-kind print, gapped (FR-7) or clean, and not in the expiry print",
  "every-market-exit": "slippage rides in every stop-kind print and in the expiry print",
};
/**
 * The prefixes of every prose statement this reader has printed above its
 * tables, current or retired. `stop-exit slippage:` is retired (#689's
 * `--stop-exit-slippage`, gone since #692): the current reader never prints
 * it, so a transcript carrying it is stale by construction.
 */
export const STATEMENT_PREFIXES = ["engine slippage class:", "allocation only:", "slippage-priced:", "exit slippage:", "stop-exit slippage:"] as const;

/**
 * The prose statements printed above the tables, in order: the class line,
 * the allocation line, the slippage-priced line and, under --exit-slippage,
 * the exit-slippage line. One function so the reader and the test that holds
 * recorded transcripts to it print from the same text.
 */
export function statementLines(input: { exitScale: number | null; modeledCostScale: number | null; slippageClass: SlippageClass }): string[] {
  const lines = [
    `engine slippage class: ${input.slippageClass} — ${SLIPPAGE_CLASS_TEXT[input.slippageClass]}`,
    "allocation only: the exit path is the emitted one at every fraction (the runner's protection re-arms on the TP1 touch, not on the size banked); " +
    `costs are the emitted commission; spread rides in the leg prices; ${SLIPPAGE_RIDES[input.slippageClass]}. Rows without a tp1 leg price the same at every fraction.`,
    `${SLIPPAGE_PRICED[input.slippageClass](input.modeledCostScale)} ` +
    "same-bar = exits resolved on the TP1 touch bar itself (FR-3), which the corpus arms with zero latency and cannot price.",
  ];
  if (input.exitScale !== null) {
    lines.push(
      `exit slippage: every market-order exit this corpus left unslipped is re-printed with estimatedSlippage × modeledCostScale ${input.exitScale} against the position, at its exit fraction (1 without a tp1 leg, ½ with one) — ` +
        `a stop-kind exit that did not gap (stop_loss, breakeven_stop, tp1_lock, ambiguous; FR-3's same-bar exit included) at its level ∓ s (${CLEAN_STOP_SLIPPAGE_SINCE}), the review-end close at its print ∓ s (${EXPIRY_SLIPPAGE_SINCE}) — ` +
        "priced from the legs without a re-simulate, exact to the emitted realizedR's four decimals. A stop printed off its level gapped and already carries FR-7's slippage (counted, not charged); " +
        "take_profit, tp1 and entry prints do not move. 'in profit → at loss' counts expiries without a tp1 leg that FR-8 relabels once the close slips. R and E are the shipped ladder at ½." +
        (input.slippageClass === "clean-stops" ? " The stop prints already carry their slippage in this corpus: not priced (—); the expiry alone is." : ""),
    );
  }
  return lines;
}

/** The corpus's scale as the hybrid statement names it: stated, or stated as absent. */
function scaleClause(scale: number | null): string {
  return scale === null
    ? "the manifest states no modeledCostScale"
    : `this corpus's resolver ran at modeledCostScale ${scale}`;
}
/**
 * The slippage-priced line per class. True on every class and every scale: the
 * hybrid charges tp1 rows only, at the unscaled estimatedSlippage, and says
 * both — so its slope across fractions is the resolver's rule and its levels
 * are not (review of #692, finding 1).
 */
const SLIPPAGE_PRICED: Record<SlippageClass, (scale: number | null) => string> = {
  "gapped-only": (scale) =>
    "slippage-priced: R_adj(f) = R(f) − (1−f)·S_row on tp1 rows only, where the exit is a stop print sitting at its level or an expiry print, " +
    `S_row = estimatedSlippage/riskDistance at the unscaled modelled slippage (${scaleClause(scale)}; S_row does not apply it) — a hybrid model: ` +
    "its slippage term follows the current resolver's market-exit rule at modeledCostScale 1 only (at scale c the resolver charges c × S_row, so the term's slope across fractions is c times this); " +
    "its levels do not, because rows without a tp1 leg are never charged " +
    "(they price the same at every fraction) though the resolver slips their stop and expiry prints; --exit-slippage prices the levels. The tp1 limit leg stays unslipped.",
  "clean-stops": (scale) =>
    "slippage-priced: R_adj(f) = R(f) − (1−f)·S_row on tp1 rows only, where the exit is an expiry print, " +
    `S_row = estimatedSlippage/riskDistance at the unscaled modelled slippage (${scaleClause(scale)}; S_row does not apply it) — a hybrid model: ` +
    "this corpus's stops already print with their slippage, so R(f) carries it at (1−f) and no stop print is charged; 'stop prints' and S count expiry prints only, by design; " +
    "rows without a tp1 leg are never charged; --exit-slippage prices the levels.",
  "every-market-exit": () =>
    "slippage-priced: R_adj(f) = R(f) on every row — this corpus prints every market-order exit with its slippage, so R(f) already carries it at (1−f); " +
    "'stop prints' and S are 0 by design, not because any row gapped. The same-bar columns do not depend on slippage.",
};

const STOP_EXIT_KINDS = ["stop_loss", "breakeven_stop", "tp1_lock", "ambiguous"] as const;
const EXIT_SLIPPAGE_HEADER =
  `| class | filled | stop-kind exits | clean | gapped | ${STOP_EXIT_KINDS.join(" | ")} | stop charge R | expiry exits | expiry charge R | in profit → at loss | R as emitted | R, market exits slipped | E as emitted | E, market exits slipped | charge R/fill |`;
const EXIT_SLIPPAGE_RULE = `| --- | ${Array.from({ length: 17 }, () => "---:").join(" | ")} |`;

function exitSlippageLine(label: string, cell: FractionCell, slippageClass: SlippageClass): string {
  const pass = cell.exitSlippage!;
  const charge = pass.stopCharge + pass.expiryCharge;
  const corrected = cell.shippedTotal - charge;
  const perFill = (value: number) => (cell.filled > 0 ? fmt(value / cell.filled, 4) : "—");
  // A clean-stops corpus's stops already slipped: their columns are not a zero, they are not priced.
  const stops = slippageClass === "clean-stops"
    ? Array.from({ length: 8 }, () => "—").join(" | ")
    : `${pass.stopKindRows} | ${pass.cleanStops} | ${pass.gappedStops} | ${STOP_EXIT_KINDS.map((kind) => pass.cleanByKind[kind] ?? 0).join(" | ")} | ${fmt(-pass.stopCharge)}`;
  return `| ${label} | ${cell.filled} | ${stops} | ${pass.expiryRows} | ${fmt(-pass.expiryCharge)} | ${pass.expiryLabelFlips} | ${fmt(cell.shippedTotal)} | ${fmt(corrected)} | ${perFill(cell.shippedTotal)} | ${perFill(corrected)} | ${perFill(-charge)} |`;
}

function share(part: number, whole: number): string {
  return whole === 0 ? "—" : `${part}/${whole} (${((100 * part) / whole).toFixed(1)}%)`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { str } = flagReader(args, VALUE_FLAGS);
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) {
        index += 1;
      } else if (!BOOLEAN_FLAGS.has(args[index])) {
        throw new OperatorInputError(`unknown flag ${args[index]}`);
      }
      continue;
    }
    paths.push(args[index]);
  }
  // Read by NAME after the walk, never inferred from membership in it
  // (2026-09-22): a flag dropped from BOOLEAN_FLAGS then leaves this literal
  // read undeclared, which tests/unknownFlagRefused.test.ts refuses. Set by
  // the walk, the dropped flag was refused as unknown and nothing noticed.
  const includeHoldout = args.includes("--include-holdout");
  const exitSlippage = args.includes("--exit-slippage");
  const folds = parseFolds(str("--folds") ?? "fit,select");
  const variant = (str("--variant") ?? "baseline").trim();
  if (!variant) {
    throw new OperatorInputError("--variant names no variant — the default is baseline");
  }
  const yearsArg = (str("--years") ?? "all").trim();
  if (yearsArg !== "all" && yearsArg !== "contained" && yearsArg !== "escaping") {
    throw new OperatorInputError(`--years must be all, contained or escaping — got "${yearsArg}"`);
  }
  const grainArg = str("--grain") ?? "class";
  if (!(GRAINS as readonly string[]).includes(grainArg)) {
    throw new OperatorInputError(`--grain must be one of ${GRAINS.join(", ")} — got "${grainArg}"`);
  }
  const summary = await bankedFraction({ folds, grain: grainArg as Grain, includeHoldout, exitSlippage, paths, variant, witnessTablePath: str("--witness") ?? undefined, years: yearsArg });
  console.log(formatBankedFraction(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    if (error instanceof OperatorInputError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  });
}
