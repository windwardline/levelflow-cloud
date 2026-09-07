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
 * not on the size banked — and costs are the emitted commission (spread and
 * slippage ride in the leg prices — spread does; slippage only in gapped
 * prints, FR-7, so a fraction below ½ moves money onto a stop print the
 * resolver never slips and the slope is an upper bound by up to S/2 — round
 * 1, 2026-09-06). A row without a tp1 leg ran full size to
 * one exit and prices the same at every fraction.
 *
 * Its control runs on every row it prices: at ½ the arithmetic must reproduce
 * the emitted `realizedR` to its four decimals, or the whole corpus is
 * refused — an instrument that fails its control reports nothing.
 *
 * It ranks nothing and proposes nothing. Amendment 39 governs what may be
 * done with a figure here: nothing that manufactures a ratio.
 *
 *   tsx scripts/banked-fraction.ts <emit.jsonl> [more shards...]
 *     [--folds fit,select] [--variant baseline] [--include-holdout] [--grain class|market]
 *     [--years all|contained|escaping [--witness docs/research/r3/feed-character.txt]]
 *
 * `--years` stratifies by feed character (scripts/feedYears.ts): the year map
 * comes from the manifest's `feedCharacter` or from the tracked witness table;
 * rows outside the named bucket are counted, never priced. Default `all`.
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
const BOOLEAN_FLAGS = new Set(["--include-holdout"]);

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
 * The slippage a stop print carries in the resolver: none. A non-gapped stop
 * exit is printed exactly at its level (FR-7 charges gapExitSlippage only on
 * a gapped open), and an expiry is a market print at the bar's close. A
 * fraction below ½ moves money from the tp1 limit print onto that leg, so the
 * slippage-priced table charges the sweep's own estimatedSlippage, in R, on
 * the runner fraction of every such row — a hybrid model, named as such:
 * neither the resolver's gap-only rule nor the gate's every-side rule, and
 * the tp1 limit leg stays unslipped (FR-4's haircut is defaulted off).
 * Round 1, 2026-09-06: forex select's slope +1,100.2 → +785.2 R under it.
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
}): { charged: boolean; kind: string | null; sR: number } {
  const exit = input.legs.find((leg) => leg.leg === "exit");
  const tp1 = input.legs.find((leg) => leg.leg === "tp1");
  if (!exit || !tp1) return { charged: false, kind: exit?.kind ?? null, sR: 0 };
  if (typeof exit.kind !== "string" || exit.kind.length === 0) {
    throw new Error("a tp1 row's exit leg names no kind — the reader cannot tell a limit print from a stop print");
  }
  const sR = input.estimatedSlippage / input.riskDistance;
  if (exit.kind === "expiry") return { charged: true, kind: exit.kind, sR };
  if (!STOP_PRINT_KINDS.has(exit.kind)) return { charged: false, kind: exit.kind, sR: 0 };
  const candidates = exit.kind === "tp1_lock"
    ? [input.levels.takeProfit1]
    : exit.kind === "breakeven_stop"
    ? [input.levels.entryPrice]
    : exit.kind === "stop_loss"
    ? [input.levels.stopLoss]
    : [input.levels.takeProfit1, input.levels.entryPrice, input.levels.stopLoss];
  const levels = candidates.filter((level): level is number => level !== null && Number.isFinite(level));
  if (levels.length === 0) {
    throw new Error(`a ${exit.kind} print with no level on the row — the reader cannot tell a print at its level from a gapped one`);
  }
  const atLevel = levels.some((level) => Math.abs(exit.price - Number(level.toFixed(8))) <= LEVEL_TOLERANCE);
  return { charged: atLevel, kind: exit.kind, sR: atLevel ? sR : 0 };
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
  tp1Rows: number;
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

function rawCell(assetType: string, fold: string): RawCell {
  return {
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
    tp1Rows: raw.tp1Rows,
  };
}

export async function bankedFraction(input: {
  folds: string[];
  grain?: Grain;
  holdoutPinDir?: string;
  includeHoldout?: boolean;
  paths: string[];
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
      const keys = [`${assetType}|${split}`, `pooled|${split}`];
      if (grain === "market") keys.push(`${symbol}|${split}`);
      for (const key of keys) {
        let cell = raw.get(key);
        if (!cell) {
          cell = rawCell(key.startsWith("pooled|") ? "pooled" : assetType, split);
          if (key === `${symbol}|${split}`) {
            cell.symbol = symbol;
            cell.heldOut = holdout.markets.includes(symbol);
          }
          raw.set(key, cell);
        }
        cell.filled += 1;
        cell.shippedTotal += realized;
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
  lines.push("");
  lines.push(
    "allocation only: the exit path is the emitted one at every fraction (the runner's protection re-arms on the TP1 touch, not on the size banked); " +
      "costs are the emitted commission; spread rides in the leg prices; slippage rides only in gapped prints (FR-7). Rows without a tp1 leg price the same at every fraction.",
  );
  lines.push(
    "slippage-priced: R_adj(f) = R(f) − (1−f)·S_row on every tp1 row whose exit is a stop print sitting at its level or an expiry print, S_row = estimatedSlippage/riskDistance — " +
      "a hybrid model, neither the resolver's gap-only rule nor the gate's every-side rule; the tp1 limit leg stays unslipped. " +
      "same-bar = exits resolved on the TP1 touch bar itself (FR-3), which the corpus arms with zero latency and cannot price.",
  );
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

function share(part: number, whole: number): string {
  return whole === 0 ? "—" : `${part}/${whole} (${((100 * part) / whole).toFixed(1)}%)`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { str } = flagReader(args, VALUE_FLAGS);
  const paths: string[] = [];
  let includeHoldout = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) {
        index += 1;
      } else if (BOOLEAN_FLAGS.has(args[index])) {
        includeHoldout = true;
      } else {
        throw new OperatorInputError(`unknown flag ${args[index]}`);
      }
      continue;
    }
    paths.push(args[index]);
  }
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
  const summary = await bankedFraction({ folds, grain: grainArg as Grain, includeHoldout, paths, variant, witnessTablePath: str("--witness") ?? undefined, years: yearsArg });
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
