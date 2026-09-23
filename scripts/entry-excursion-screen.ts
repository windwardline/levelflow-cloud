/**
 * entry-excursion-screen — the random-entry excursion screen, controls only.
 *
 * Built from the smallest defensible design in the REFUTED section of
 * `docs/research/designs/random-entry-screen-2026-09-14.md`, which governs
 * over the draft above it. Amendment 46 makes this screen the precondition
 * for any new entry family, and registers a family before any fold is read.
 * The registry (amendment 48) does not exist, so this reader screens NO real
 * family. It runs the four controls the design requires first, on the fit
 * fold only, and has deliberately no way to be handed a family: before the
 * registry exists, an input path would be the route around amendment 46.
 * Whether a rising count of registered families raises the bar is the
 * owner's, and nothing here decides it.
 *
 * THE STATISTIC. For a decision (symbol, decision bar t, side): the
 * UNCENSORED excursion over (t, t+W] — MFE minus MAE in the side's direction,
 * from the decision bar's close, over the pinned 5-minute series from the bar
 * after the decision bar to the last bar that closes by the engine's own
 * expiry (`getSetupExpiryTime`, wall-clock hours with its weekly-close clamp)
 * — in units of the engine's ATR(14) on the 15-minute series at t. No ladder,
 * no stop, no fill: the corpus's excursions are censored by all three.
 *
 * THE NULL. The same symbol, side and UTC clock on a random fit-fold day
 * whose month the feed witness calls contained, |shift| > W, K = 20 draws.
 * A fair-coin side is NOT a null: it swaps favourable and adverse exactly, so
 * its mean is zero by construction (the refutation's first verdict).
 *
 * THE VERDICT, per market (amendment 45): the mean of candidate minus null,
 * with a 95 % interval clustered by UTC decision day (CR1) at
 * tMultiplier95(days − 1). Fewer than 30 day clusters is NO VERDICT. PASS
 * needs the lower bound above the floor: the family's round-trip cost
 * (`estimatedRoundTripCost`) per decision, in ATR, the statistic's own unit.
 * The floor also prints in R, because amendment 48 has not settled the unit.
 * The class pool and the 16:00–21:59 UTC span split print beside it and
 * carry no verdict.
 *
 * THE CONTROLS, on the shipped entry's own decision clock:
 *   look-ahead  side = the sign of the window's last close against the
 *               reference — a family that knows the future. Must PASS in
 *               every market that reaches a verdict.
 *   coin-flip   side = a seeded fair coin. Must pass nowhere.
 *   shipped     side = the corpus's own (variant baseline, accepted, fit,
 *               in-pool). Must pass nowhere; the alpha review read t = −0.01.
 *   censoring   on a seeded fit-row sample, re-applying the resolver's
 *               censoring (`replay.ts`: adverse from the fill bar, favourable
 *               from the bar after it, through the exit bar, from the planned
 *               entry) must reproduce the row's maxFavorableMove and
 *               maxAdverseMove exactly.
 * Every read row is also ANCHORED: the decision bar's close and the ATR this
 * reader computes must equal the row's `latestClose` and `atr`, or the row is
 * counted unanchored and the run exits 4. A shadow of production is trusted
 * only where something outside it agrees.
 *
 * ZERO PROVIDER BYTES, BY CONSTRUCTION. Every series is read through q4's
 * `pinnedSeries` at the corpus manifest's anchor, whose fetchers throw; a
 * missing pin is a refusal naming the market, never a purchase. The cache
 * directory must already exist, so nothing is created either.
 *
 * WHAT IT READS. The fit fold only: the door withholds confirm, and select is
 * this reader's own filter. It writes nothing; stdout is the record.
 *
 * Exit codes: 0 no control failed and every read row anchored; 3 a control
 * FAILED where it was judged; 4 a market was not pinned or a row did not
 * anchor; 2 nothing to screen. NO VERDICT is printed, not an exit code, as
 * every reader here prints it.
 *
 *   npx tsx scripts/entry-excursion-screen.ts --corpus <capture-all.jsonl> \
 *     --window-hours 8 [--cache-dir .calibration-cache] [--witness <table>]
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { averageTrueRange } from "../supabase/functions/trade-analyzer/indicators.ts";
import { getSetupExpiryTime } from "../supabase/functions/trade-analyzer/replay.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";
import { DEFAULT_CACHE_DIR } from "./calibrationCache.ts";
import { type MonthMap, monthMapOf, readWitnessMonths, type WitnessMonths } from "./feedMonths.ts";
import { MAP_TIER } from "./feedYears.ts";
import { flagReader, flagsOnly, OperatorInputError } from "./flagReader.ts";
import { isEntryPoint } from "./isEntryPoint.ts";
import { pinnedSeries } from "./q4-daily-structure-stop.ts";
import { describeHeldOut, resolveHeldOut } from "./sweepFolds.ts";
import type { SweepManifest } from "./sweepManifest.ts";
import {
  assertAcceptanceMode,
  assertEmitColumns,
  assertManifest,
  assertManifestedCorpusStreaming,
  type SweepEmitRow,
  tMultiplier95,
  tuningFolds,
} from "./sweepStats.ts";

const SCRIPT = "entry-excursion-screen";
const VALUE_FLAGS = new Set(["--cache-dir", "--corpus", "--window-hours", "--witness"]);
const BOOLEAN_FLAGS = new Set<string>([]);

/** K: null draws per decision, fixed by the design. */
export const NULL_DRAWS = 20;
/** Day clusters a market needs before it can take a verdict. */
export const MIN_DAY_CLUSTERS = 30;
/** Fit rows the censoring control re-resolves. */
export const CENSOR_SAMPLE = 2_000;
/**
 * The seed of every random draw, a constant rather than a dial: a seed an
 * operator can change is a window search by another name.
 */
const SEED = "random-entry-screen-2026-09-14";
/** The empty grid cell: the shipped engine's rows. */
const SHIPPED_VARIANT = "baseline";
const STREAM_MS = 5 * 60_000;
const DECISION_BAR_MS = 15 * 60_000;
const ATR_PERIOD = 14;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** The alpha review's hour span, as arming-bound-cells.ts states it. */
const SPAN_HOURS = { first: 16, last: 21 };
const DRAW_ATTEMPTS = 40 * NULL_DRAWS;
const REQUIRED_COLUMNS = [
  "accepted",
  "atr",
  "entryPrice",
  "estimatedRoundTripCost",
  "filledAtMs",
  "latestClose",
  "legs",
  "maxAdverseMove",
  "maxFavorableMove",
  "resolutionIntervalMs",
  "riskDistance",
  "side",
  "split",
  "symbol",
  "time",
  "variant",
] as const;

export const FAMILIES = ["look-ahead", "coin-flip", "shipped"] as const;
export type Family = (typeof FAMILIES)[number];
export type Side = "buy" | "sell";
export type Verdict = "FAIL" | "NO VERDICT" | "PASS";
export type ControlState = "FAILS" | "HOLDS" | "NO VERDICT";

export type ScreenArgs = {
  cacheDir: string;
  corpus: string;
  windowHours: number;
  witness: string | undefined;
};

/**
 * Flags first, then the corpus, then the window: an operator's typo is named
 * before anything else is read, and a run without a corpus says so first.
 */
export function parseScreenArgs(argv: readonly string[]): ScreenArgs {
  flagsOnly(argv, VALUE_FLAGS, BOOLEAN_FLAGS, SCRIPT);
  const { num, str } = flagReader(argv, VALUE_FLAGS);
  const corpus = str("--corpus");
  if (corpus === undefined) {
    throw new OperatorInputError(
      `${SCRIPT}: no corpus — pass --corpus <capture-all.jsonl>; the shipped entry's decisions and ` +
        `the fit fold's calendar both come from the corpus and its manifest`,
    );
  }
  if (str("--window-hours") === undefined) {
    throw new OperatorInputError(
      `${SCRIPT}: --window-hours is required — W is the family's stated window, one value, and ` +
        `there is no default to fall back on`,
    );
  }
  const windowHours = num("--window-hours", Number.NaN);
  if (!(windowHours > 0)) {
    throw new OperatorInputError(
      `${SCRIPT}: --window-hours must be a positive number of wall-clock hours and got ${windowHours}`,
    );
  }
  const cacheDir = str("--cache-dir") ?? DEFAULT_CACHE_DIR;
  return { cacheDir, corpus, windowHours, witness: str("--witness") };
}

// ---------------------------------------------------------------------------
// The measurement, as pure functions.
// ---------------------------------------------------------------------------

function firstAtOrAfter(bars: readonly Bar[], time: number): number {
  let low = 0;
  let high = bars.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (bars[mid].time < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

export type Excursion = { bars: number; down: number; last: number; up: number };

/**
 * The uncensored window: bars from the one after the decision bar (FR-5 — the
 * decision bar's interior is decision-time information) to the last whose
 * five minutes close by expiry (the resolver's own admission rule). `up` and
 * `down` are the largest moves above and below the reference, never negative.
 */
export function windowExcursion(input: {
  bars: readonly Bar[];
  decisionMs: number;
  expiryMs: number;
  reference: number;
}): Excursion | null {
  const from = input.decisionMs + DECISION_BAR_MS;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let last = Number.NaN;
  let count = 0;
  for (let index = firstAtOrAfter(input.bars, from); index < input.bars.length; index += 1) {
    const bar = input.bars[index];
    if (bar.time + STREAM_MS > input.expiryMs) break;
    if (bar.high > high) high = bar.high;
    if (bar.low < low) low = bar.low;
    last = bar.close;
    count += 1;
  }
  if (count === 0) return null;
  return {
    bars: count,
    down: Math.max(0, input.reference - low),
    last,
    up: Math.max(0, high - input.reference),
  };
}

/** MFE − MAE in the side's direction. */
export function signedExcursion(side: Side, excursion: { down: number; up: number }): number {
  return side === "buy" ? excursion.up - excursion.down : excursion.down - excursion.up;
}

/**
 * The engine's ATR at a bar: `averageTrueRange` over the fifteen bars ending
 * there, which is exactly the sample it takes from any longer history.
 */
export function atrAt(bars: readonly Bar[], index: number): number | null {
  if (index < ATR_PERIOD || index >= bars.length) return null;
  return averageTrueRange(bars.slice(index - ATR_PERIOD, index + 1), ATR_PERIOD);
}

/** `replay.ts`'s price rounding, which the corpus's excursion fields carry. */
function roundPrice(value: number): number {
  return Number(value.toFixed(8));
}

/**
 * The resolver's censoring, re-applied (`replay.ts`, the fill-to-exit loop):
 * from the PLANNED entry, adverse over every bar from the fill bar through the
 * exit bar, favourable over the same bars except the fill bar, whose
 * favourable extreme may predate the fill. Null when the series does not hold
 * the fill bar — a reproduction that cannot start is not a reproduction.
 */
export function censoredExcursion(input: {
  bars: readonly Bar[];
  entry: number;
  exitMs: number;
  filledMs: number;
  side: Side;
}): { adverse: number; favourable: number } | null {
  const start = firstAtOrAfter(input.bars, input.filledMs);
  if (input.bars[start]?.time !== input.filledMs) return null;
  const isBuy = input.side === "buy";
  let favourable = 0;
  let adverse = 0;
  for (let index = start; index < input.bars.length && input.bars[index].time <= input.exitMs; index += 1) {
    const bar = input.bars[index];
    if (index !== start) {
      favourable = Math.max(favourable, isBuy ? bar.high - input.entry : input.entry - bar.low);
    }
    adverse = Math.max(adverse, isBuy ? input.entry - bar.low : bar.high - input.entry);
  }
  return { adverse: roundPrice(adverse), favourable: roundPrice(favourable) };
}

export type Bound = {
  clusters: number;
  lower: number | null;
  mean: number;
  n: number;
  se: number | null;
  t: number | null;
  upper: number | null;
};

/**
 * The mean and its 95 % interval, clustered by the key each value carries.
 * CR1: the cluster-robust variance with the G/(G − 1) small-sample factor —
 * wider than `clusteredStandardError` in sweepStats.ts, which omits it — at
 * tMultiplier95(G − 1). No interval below two clusters.
 */
export function clusteredBound(values: ReadonlyArray<{ cluster: number; value: number }>): Bound {
  const n = values.length;
  if (n === 0) return { clusters: 0, lower: null, mean: Number.NaN, n: 0, se: null, t: null, upper: null };
  let sum = 0;
  for (const entry of values) sum += entry.value;
  const mean = sum / n;
  const residuals = new Map<number, number>();
  for (const entry of values) {
    residuals.set(entry.cluster, (residuals.get(entry.cluster) ?? 0) + (entry.value - mean));
  }
  const clusters = residuals.size;
  if (clusters < 2) return { clusters, lower: null, mean, n, se: null, t: null, upper: null };
  let squares = 0;
  for (const residual of residuals.values()) squares += residual * residual;
  const se = Math.sqrt((clusters / (clusters - 1)) * squares) / n;
  const margin = tMultiplier95(clusters - 1) * se;
  return { clusters, lower: mean - margin, mean, n, se, t: se > 0 ? mean / se : null, upper: mean + margin };
}

/** Per market: NO VERDICT under 30 day clusters, PASS only above the floor. */
export function verdictOf(bound: Bound, floor: number): Verdict {
  if (bound.clusters < MIN_DAY_CLUSTERS || bound.lower === null) return "NO VERDICT";
  return bound.lower > floor ? "PASS" : "FAIL";
}

/**
 * A control holds only where it was judged. The look-ahead family must pass
 * in every market with a verdict; the coin flip and the shipped entry must
 * pass in none. A control judged nowhere is NO VERDICT, never a hold.
 */
export function judgeFamilyControl(family: Family, verdicts: readonly Verdict[]): ControlState {
  const judged = verdicts.filter((verdict) => verdict !== "NO VERDICT");
  if (judged.length === 0) return "NO VERDICT";
  if (family === "look-ahead") return judged.every((verdict) => verdict === "PASS") ? "HOLDS" : "FAILS";
  return judged.some((verdict) => verdict === "PASS") ? "FAILS" : "HOLDS";
}

/**
 * K null values for one decision, drawn with replacement from the pool of
 * same-clock times. A time within W of the decision is refused (|shift| > W),
 * as is one `usable` rejects; a decision the pool cannot supply K usable days
 * for gets no null at all rather than a short one.
 */
export function drawNull(input: {
  attempts: number;
  decisionMs: number;
  k: number;
  pool: readonly number[];
  random: () => number;
  usable: (time: number) => number | null;
  windowMs: number;
}): number[] | null {
  if (input.pool.length === 0) return null;
  const out: number[] = [];
  for (let attempt = 0; attempt < input.attempts && out.length < input.k; attempt += 1) {
    const time = input.pool[Math.floor(input.random() * input.pool.length)];
    if (Math.abs(time - input.decisionMs) <= input.windowMs) continue;
    const value = input.usable(time);
    if (value === null) continue;
    out.push(value);
  }
  return out.length === input.k ? out : null;
}

/** A time's UTC clock: milliseconds since its UTC midnight. */
function clockOf(time: number): number {
  return ((time % DAY_MS) + DAY_MS) % DAY_MS;
}

/**
 * Every time a null may land on, grouped by UTC clock: a 15-minute bar the
 * engine could decide on (ATR needs fourteen true ranges before it), inside
 * the fit fold's decision span, inside the 5-minute series, in a month the
 * witness calls contained.
 */
export function nullPools(input: {
  bars: readonly Bar[];
  excluded: (time: number) => boolean;
  fiveStart: number;
  fold: { decisionEndMs: number; startMs: number };
}): Map<number, number[]> {
  const pools = new Map<number, number[]>();
  for (let index = ATR_PERIOD; index < input.bars.length; index += 1) {
    const time = input.bars[index].time;
    if (time < input.fold.startMs || time > input.fold.decisionEndMs) continue;
    if (time < input.fiveStart || input.excluded(time)) continue;
    const pool = pools.get(clockOf(time));
    if (pool) pool.push(time);
    else pools.set(clockOf(time), [time]);
  }
  return pools;
}

/**
 * Whether a corpus row is this cache's decision: the 15-minute bar at the
 * row's time exists, its close IS the row's `latestClose`, and the engine's
 * ATR there equals the row's `atr` to 1e-9 relative. A row that fails is not
 * screened: its candidate would be measured on a series the corpus never read.
 */
export function anchoredAt(
  bars: readonly Bar[],
  index: number | undefined,
  row: { atr: number; latestClose: number },
): boolean {
  if (index === undefined) return false;
  const atr = atrAt(bars, index);
  if (atr === null) return false;
  return Math.abs(atr - row.atr) <= 1e-9 * Math.abs(row.atr) && bars[index].close === row.latestClose;
}

function seededRandom(...parts: string[]): () => number {
  let state = createHash("sha256").update(parts.join("|")).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// ---------------------------------------------------------------------------
// The corpus, through the door.
// ---------------------------------------------------------------------------

type Decision = {
  adverse: number | null;
  atr: number;
  cost: number;
  entry: number;
  exitMs: number | null;
  favourable: number | null;
  filledMs: number | null;
  latestClose: number;
  risk: number;
  side: Side;
  tier: number;
  time: number;
};

type Fold = { decisionEndMs: number; endMs: number; name: string; startMs: number };

function finite(row: SweepEmitRow, key: string, where: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${where}: ${key} is ${JSON.stringify(value)} — a shipped fit row without it cannot be screened`);
  }
  return value;
}

function nullableNumber(row: SweepEmitRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function project(row: SweepEmitRow, where: string): Decision {
  const side = row.side;
  if (side !== "buy" && side !== "sell") throw new Error(`${where}: side is ${JSON.stringify(side)}`);
  const risk = finite(row, "riskDistance", where);
  if (risk <= 0) throw new Error(`${where}: riskDistance ${risk} — the R floor has no unit`);
  const filledMs = nullableNumber(row, "filledAtMs");
  const legs = Array.isArray(row.legs) ? (row.legs as Array<{ leg?: unknown; time?: unknown }>) : [];
  const exit = legs.find((leg) => leg.leg === "exit");
  return {
    adverse: nullableNumber(row, "maxAdverseMove"),
    atr: finite(row, "atr", where),
    cost: finite(row, "estimatedRoundTripCost", where),
    entry: finite(row, "entryPrice", where),
    exitMs: typeof exit?.time === "number" ? exit.time : null,
    favourable: nullableNumber(row, "maxFavorableMove"),
    filledMs,
    latestClose: finite(row, "latestClose", where),
    risk,
    side,
    tier: finite(row, "resolutionIntervalMs", where),
    time: finite(row, "time", where),
  };
}

type ManifestSymbol = SweepManifest["symbols"][number];

/**
 * The month map at its finest grain (`feedMonths.ts`): the manifest's own
 * `feedCharacter` when every market carries it, else the witness table, never
 * a mix. A market the witness never judged, or judged unjudgeable, is refused
 * by `monthMapOf` — an absent verdict is not a contained one.
 */
function resolveMonthMap(manifest: SweepManifest, witness: string | undefined): { describe: string; map: MonthMap } {
  const carrying = manifest.symbols.filter((entry) => entry.feedCharacter?.[MAP_TIER] !== undefined);
  if (carrying.length > 0 && carrying.length < manifest.symbols.length) {
    throw new Error(
      `the manifest carries feedCharacter on ${carrying.length} of ${manifest.symbols.length} markets — a mixed month map is refused`,
    );
  }
  if (carrying.length > 0) {
    const witnessMonths = new Map<string, WitnessMonths>();
    for (const entry of carrying) {
      const record = entry.feedCharacter![MAP_TIER];
      witnessMonths.set(entry.symbol, {
        escapeYears: new Set(record.escapeYears),
        hiddenMonths: new Set(record.escapeMonths),
        verdict: record.verdict,
      });
    }
    const source = "manifest feedCharacter (5min tier)";
    return {
      describe: `month map: ${source}${witness ? `; --witness ${witness} not consulted` : ""}`,
      map: monthMapOf(witnessMonths, source),
    };
  }
  if (!witness) {
    throw new OperatorInputError(
      `${SCRIPT}: the manifest carries no feedCharacter — pass --witness <table> (e.g. ` +
        `docs/research/r3/feed-character.txt); contained months are not guessed`,
    );
  }
  const source = `witness table ${witness} (5min tier)`;
  return { describe: `month map: ${source}`, map: monthMapOf(readWitnessMonths(witness), source) };
}

function fitFoldOf(manifest: SweepManifest, className: string, fitName: string): Fold {
  const folds = manifest.foldsByClass ? manifest.foldsByClass[className] : manifest.folds;
  const fold = folds?.find((entry) => entry.name === fitName);
  if (!fold) throw new Error(`the manifest has no ${fitName} fold for class ${className}`);
  return fold;
}

function classOf(entry: ManifestSymbol): string {
  return entry.assetType ?? getAssetType(entry.symbol);
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

type Point = { cluster: number; floorAtr: number; floorR: number; inSpan: boolean; value: number };

type MarketResult = {
  className: string;
  counts: {
    anchored: number;
    escaping: number;
    noBars: number;
    notInFive: number;
    nullShort: number;
    read: number;
    screened: number;
    unanchored: number;
    zeroAtr: number;
  };
  families: Map<Family, Point[]>;
  symbol: string;
};

type Censoring = {
  examples: string[];
  matched: number;
  sampled: number;
  tiers: Map<number, number>;
};

function fmt(value: number | null, digits = 4): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return values.length === 0 ? Number.NaN : sum / values.length;
}

type Tabled = {
  bound: Bound;
  className: string;
  family: Family;
  floorAtr: number;
  floorR: number;
  market: string;
  verdict: Verdict;
};

/** A floor, or a dash where no decision carried one. */
function floorCell(value: number, width: number): string {
  return (Number.isFinite(value) ? value.toFixed(4) : "-").padStart(width);
}

function tableRow(family: string, market: string, className: string, bound: Bound, floorAtr: number, floorR: number, verdict: string): string {
  return [
    family.padEnd(11),
    market.padEnd(9),
    className.padEnd(12),
    String(bound.n).padStart(8),
    String(bound.clusters).padStart(6),
    fmt(bound.mean).padStart(9),
    fmt(bound.lower).padStart(9),
    fmt(bound.upper).padStart(9),
    fmt(bound.t, 2).padStart(8),
    floorCell(floorAtr, 9),
    floorCell(floorR, 8),
    ` ${verdict}`,
  ].join(" ");
}

export async function runScreen(argv: readonly string[]): Promise<number> {
  const args = parseScreenArgs(argv);
  const path = args.corpus;
  const windowMs = args.windowHours * HOUR_MS;
  if (!existsSync(args.cacheDir)) {
    throw new OperatorInputError(`${SCRIPT}: --cache-dir ${args.cacheDir} does not exist — this reader creates nothing`);
  }

  // The manifest half of the door first, so the fold, the month map and the
  // held-out set are known before a row is kept.
  const manifest = assertManifest(path);
  if (manifest.clock.normalizer !== BAR_CLOCK) {
    throw new Error(
      `${args.corpus}: the corpus was built under clock "${manifest.clock.normalizer}" and the cache reads ` +
        `"${BAR_CLOCK}" — its decision bars are not this cache's bars`,
    );
  }
  if (assertEmitColumns(args.corpus, manifest, REQUIRED_COLUMNS).unverifiable) {
    throw new Error(`${args.corpus}: the manifest records no emitColumns — this read cannot confirm the corpus carries its columns`);
  }
  if (assertAcceptanceMode(args.corpus, manifest, { ignoreLowEdge: false }).unverifiable) {
    throw new Error(`${args.corpus}: the manifest records no acceptance mode — the shipped population cannot be stated`);
  }
  if (!manifest.folds && !manifest.foldsByClass) {
    throw new Error(`${args.corpus}: a two-split corpus has no fold embargo to bound W — the screen needs a folded corpus`);
  }
  if (!manifest.grid.some((cell) => typeof cell === "object" && cell !== null && Object.keys(cell).length === 0)) {
    throw new Error(`${args.corpus}: the grid has no empty cell, so no "${SHIPPED_VARIANT}" rows are the shipped engine's`);
  }
  const fitName = tuningFolds(manifest).fit;
  const bySymbol = new Map(manifest.symbols.map((entry) => [entry.symbol, entry]));
  for (const entry of manifest.symbols) {
    const fold = fitFoldOf(manifest, classOf(entry), fitName);
    const embargo = fold.endMs - fold.decisionEndMs;
    if (windowMs > embargo) {
      throw new OperatorInputError(
        `${SCRIPT}: --window-hours ${args.windowHours} exceeds the ${embargo / HOUR_MS}h embargo of ` +
          `${classOf(entry)}'s ${fitName} fold — a window past the embargo reads the next fold's bars`,
      );
    }
  }
  const monthMap = resolveMonthMap(manifest, args.witness);
  const holdout = resolveHeldOut([manifest]);

  // THE ROWS. Confirm never arrives (the door seals it); select is refused
  // here on its split, before any other field of the row is read.
  const kept = new Map<string, Decision[]>();
  const rows = { heldOut: 0, kept: 0, notAccepted: 0, otherFolds: 0, otherVariants: 0, total: 0 };
  const read = await assertManifestedCorpusStreaming(path, (row) => {
    rows.total += 1;
    if (row.split !== fitName) {
      rows.otherFolds += 1;
      return;
    }
    if (row.variant !== SHIPPED_VARIANT) {
      rows.otherVariants += 1;
      return;
    }
    if (row.accepted !== true) {
      rows.notAccepted += 1;
      return;
    }
    if (holdout.held.has(row.symbol)) {
      rows.heldOut += 1;
      return;
    }
    const decision = project(row, `${args.corpus}: ${row.symbol} ${String(row.time)}`);
    rows.kept += 1;
    const list = kept.get(row.symbol);
    if (list) list.push(decision);
    else kept.set(row.symbol, [decision]);
  });
  if (rows.kept === 0) {
    console.error(`${SCRIPT}: the corpus holds no shipped ${fitName} decision (variant ${SHIPPED_VARIANT}, accepted, in-pool) — nothing to screen`);
    return 2;
  }

  const markets = [...kept.keys()].sort();
  const unplaceable: Array<{ symbol: string; why: string }> = [];
  const placeable = markets.filter((symbol) => {
    try {
      monthMap.map.excludedMonths(symbol);
      return true;
    } catch (error) {
      if (!(error instanceof OperatorInputError)) throw error;
      unplaceable.push({ symbol, why: error.message });
      return false;
    }
  });

  // The censoring sample: a seeded draw over the filled shipped rows of the
  // markets the screen can place, fixed before any bar is read.
  const filled: Array<{ decision: Decision; symbol: string }> = [];
  for (const symbol of placeable) {
    for (const decision of kept.get(symbol)!) {
      if (decision.filledMs !== null) filled.push({ decision, symbol });
    }
  }
  filled.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.decision.time - b.decision.time);
  const sampleRandom = seededRandom(SEED, "censoring");
  for (let index = 0; index < Math.min(CENSOR_SAMPLE, filled.length); index += 1) {
    const swap = index + Math.floor(sampleRandom() * (filled.length - index));
    [filled[index], filled[swap]] = [filled[swap], filled[index]];
  }
  const drawnSample = Math.min(CENSOR_SAMPLE, filled.length);
  const sample = new Map<string, Decision[]>();
  for (const { decision, symbol } of filled.slice(0, CENSOR_SAMPLE)) {
    const list = sample.get(symbol);
    if (list) list.push(decision);
    else sample.set(symbol, [decision]);
  }

  const censoring: Censoring = { examples: [], matched: 0, sampled: 0, tiers: new Map() };
  const results: MarketResult[] = [];
  const unpinned: Array<{ symbol: string; why: string }> = [];

  for (const symbol of placeable) {
    const entry = bySymbol.get(symbol);
    if (!entry) throw new Error(`${args.corpus}: ${symbol} has rows and no manifest entry`);
    const className = classOf(entry);
    const fold = fitFoldOf(manifest, className, fitName);
    let fifteen: Bar[];
    let five: Bar[];
    try {
      [fifteen, five] = await Promise.all([
        pinnedSeries({ anchor: manifest.anchor, cacheDir: args.cacheDir, key: `${entry.providerSymbol}-15min-${manifest.days}` }),
        pinnedSeries({ anchor: manifest.anchor, cacheDir: args.cacheDir, key: `${entry.providerSymbol}-5min-${manifest.days}` }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Only the pin miss. Anything else is about the cache itself.
      if (!message.startsWith("q4PinMissing:")) throw error;
      unpinned.push({ symbol, why: message.split(" is not pinned")[0].replace("q4PinMissing: ", "") });
      continue;
    }
    const excluded = (time: number) => monthMap.map.excludedAt(symbol, time);
    const fiveStart = five.length > 0 ? five[0].time : Number.POSITIVE_INFINITY;
    const indexOf = new Map<number, number>();
    for (let index = 0; index < fifteen.length; index += 1) indexOf.set(fifteen[index].time, index);

    const pools = nullPools({ bars: fifteen, excluded, fiveStart, fold });

    type Measured =
      | { kind: "ok"; atr: number; down: number; last: number; reference: number; up: number }
      | { kind: "escaping" | "noBars" | "zeroAtr" };
    const memo = new Map<number, Measured>();
    const measure = (index: number): Measured => {
      const hit = memo.get(index);
      if (hit) return hit;
      const time = fifteen[index].time;
      const atr = atrAt(fifteen, index);
      let result: Measured;
      if (atr === null || !(atr > 0)) {
        result = { kind: "zeroAtr" };
      } else {
        const expiryMs = getSetupExpiryTime(symbol, time, args.windowHours);
        const reference = fifteen[index].close;
        if (excluded(expiryMs)) {
          result = { kind: "escaping" };
        } else {
          const window = windowExcursion({ bars: five, decisionMs: time, expiryMs, reference });
          result = window === null
            ? { kind: "noBars" }
            : { atr, down: window.down / atr, kind: "ok", last: window.last, reference, up: window.up / atr };
        }
      }
      memo.set(index, result);
      return result;
    };

    const nullRandom = seededRandom(SEED, symbol, "null");
    const coinRandom = seededRandom(SEED, symbol, "coin");
    const result: MarketResult = {
      className,
      counts: { anchored: 0, escaping: 0, noBars: 0, notInFive: 0, nullShort: 0, read: 0, screened: 0, unanchored: 0, zeroAtr: 0 },
      families: new Map(FAMILIES.map((family) => [family, []])),
      symbol,
    };
    const decisions = [...kept.get(symbol)!].sort((a, b) => a.time - b.time);
    for (const decision of decisions) {
      result.counts.read += 1;
      const index = indexOf.get(decision.time);
      if (index === undefined || !anchoredAt(fifteen, index, decision)) {
        result.counts.unanchored += 1;
        continue;
      }
      result.counts.anchored += 1;
      if (excluded(decision.time)) {
        result.counts.escaping += 1;
        continue;
      }
      if (decision.time < fiveStart) {
        result.counts.notInFive += 1;
        continue;
      }
      const candidate = measure(index);
      if (candidate.kind !== "ok") {
        result.counts[candidate.kind] += 1;
        continue;
      }
      const clock = clockOf(decision.time);
      // Each draw answers the 15-minute index it landed on; its excursion is
      // the memoised measurement of that bar, signed below per family.
      const drawn = drawNull({
        attempts: DRAW_ATTEMPTS,
        decisionMs: decision.time,
        k: NULL_DRAWS,
        pool: pools.get(clock) ?? [],
        random: nullRandom,
        usable: (time) => {
          const at = indexOf.get(time)!;
          return measure(at).kind === "ok" ? at : null;
        },
        windowMs,
      });
      if (drawn === null) {
        result.counts.nullShort += 1;
        continue;
      }
      const nulls = drawn.map((at) => measure(at) as Extract<Measured, { kind: "ok" }>);
      result.counts.screened += 1;
      const lookAhead: Side | null = candidate.last > candidate.reference
        ? "buy"
        : candidate.last < candidate.reference
        ? "sell"
        : null;
      const sides: Record<Family, Side | null> = {
        "coin-flip": coinRandom() < 0.5 ? "buy" : "sell",
        "look-ahead": lookAhead,
        shipped: decision.side,
      };
      const cluster = Math.floor(decision.time / DAY_MS);
      const hour = new Date(decision.time).getUTCHours();
      for (const family of FAMILIES) {
        const side = sides[family];
        if (side === null) continue;
        const nullMean = mean(nulls.map((draw) => signedExcursion(side, draw)));
        result.families.get(family)!.push({
          cluster,
          floorAtr: decision.cost / decision.atr,
          floorR: decision.cost / decision.risk,
          inSpan: hour >= SPAN_HOURS.first && hour <= SPAN_HOURS.last,
          value: signedExcursion(side, candidate) - nullMean,
        });
      }
    }

    for (const decision of sample.get(symbol) ?? []) {
      censoring.sampled += 1;
      censoring.tiers.set(decision.tier, (censoring.tiers.get(decision.tier) ?? 0) + 1);
      const series = decision.tier === STREAM_MS ? five : decision.tier === DECISION_BAR_MS ? fifteen : null;
      const got = series === null || decision.exitMs === null || decision.filledMs === null
        ? null
        : censoredExcursion({ bars: series, entry: decision.entry, exitMs: decision.exitMs, filledMs: decision.filledMs, side: decision.side });
      const matches = got !== null && decision.favourable !== null && decision.adverse !== null &&
        got.favourable === roundPrice(decision.favourable) && got.adverse === roundPrice(decision.adverse);
      if (matches) {
        censoring.matched += 1;
      } else if (censoring.examples.length < 5) {
        censoring.examples.push(
          `${symbol} ${new Date(decision.time).toISOString()} tier ${decision.tier / 60_000}min: row ` +
            `fav ${decision.favourable} adv ${decision.adverse}, re-applied ` +
            (got === null ? "no fill bar or exit in the series" : `fav ${got.favourable} adv ${got.adverse}`),
        );
      }
    }

    results.push(result);
    process.stderr.write(
      `${String(results.length).padStart(3)}/${placeable.length} ${symbol.padEnd(10)} ` +
        `${String(result.counts.screened).padStart(6)} screened of ${result.counts.read}\n`,
    );
  }

  // ---------------------------------------------------------------------------
  // Verdicts and the record.
  // ---------------------------------------------------------------------------
  const tabled: Tabled[] = [];
  for (const result of results) {
    for (const family of FAMILIES) {
      const points = result.families.get(family)!;
      const bound = clusteredBound(points);
      const floorAtr = mean(points.map((point) => point.floorAtr));
      const floorR = mean(points.map((point) => point.floorR));
      tabled.push({
        bound,
        className: result.className,
        family,
        floorAtr,
        floorR,
        market: result.symbol,
        verdict: points.length === 0 ? "NO VERDICT" : verdictOf(bound, floorAtr),
      });
    }
  }
  const states = new Map<Family, ControlState>(
    FAMILIES.map((family) => [family, judgeFamilyControl(family, tabled.filter((row) => row.family === family).map((row) => row.verdict))]),
  );
  const censoringState: ControlState = censoring.sampled === 0
    ? "NO VERDICT"
    : censoring.matched === censoring.sampled
    ? "HOLDS"
    : "FAILS";
  const unanchored = results.reduce((sum, result) => sum + result.counts.unanchored, 0);

  const out: string[] = [];
  out.push(
    "Entry excursion screen — controls only. No family is screened: amendment 46 registers a family " +
      "before any fold is read, and the registry that needs (amendment 48) does not exist.",
  );
  out.push(
    `corpus ${args.corpus} · manifest ${manifest.manifestHash.slice(0, 12)} · anchor ${manifest.anchor} · ` +
      `depth ${manifest.days}d · analyzer ${manifest.analyzerVersion}`,
  );
  out.push(
    `fold: ${fitName} only — ${read.sealedRows} confirm rows withheld at the door, ${rows.otherFolds} rows of ` +
      `other folds (select among them) refused on their split before any other field was read`,
  );
  out.push(
    `population: variant ${SHIPPED_VARIANT}, accepted, in-pool — ${rows.kept} kept of ${rows.total} read ` +
      `(${rows.otherVariants} other variants, ${rows.notAccepted} not accepted, ${rows.heldOut} held out)`,
  );
  out.push(
    `W = ${args.windowHours}h wall-clock through the engine's expiry (weekly-close clamp) · reference = the decision ` +
      `bar's close · stream from the next bar on the pinned 5-minute series · unit = ATR(14) of the 15-minute ` +
      `series at the decision, anchored to each row's atr and latestClose`,
  );
  out.push(
    `null: same symbol, side and UTC clock on a random ${fitName}-fold day in a contained month, |shift| > W, ` +
      `K = ${NULL_DRAWS} draws with replacement, seed "${SEED}"`,
  );
  out.push(
    `verdict: per market (amendment 45), mean of candidate − null with a 95% interval clustered by UTC decision ` +
      `day (CR1) at tMultiplier95(days − 1); fewer than ${MIN_DAY_CLUSTERS} days is NO VERDICT; PASS iff the lower ` +
      `bound clears the floor`,
  );
  out.push(
    "floor: the row's round-trip cost (estimatedRoundTripCost), mean per market, in ATR and in R — amendment 48 " +
      "has not settled the unit; the verdict reads the ATR floor against the ATR statistic",
  );
  out.push(monthMap.describe);
  out.push(`${describeHeldOut(holdout, { labels: false, pools: true })}; also absent from every per-market line`);

  out.push("", "CONTROLS");
  for (const family of FAMILIES) {
    const lines = tabled.filter((row) => row.family === family);
    const judged = lines.filter((row) => row.verdict !== "NO VERDICT");
    const passed = judged.filter((row) => row.verdict === "PASS");
    const state = states.get(family)!;
    let detail = `passes in ${passed.length} of ${judged.length} markets with a verdict ` +
      `(${lines.length - judged.length} NO VERDICT)`;
    if (family === "look-ahead" && judged.length > 0) {
      const narrowest = [...judged].sort((a, b) => (a.bound.lower! - a.floorAtr) - (b.bound.lower! - b.floorAtr))[0];
      detail += `; narrowest margin ${fmt(narrowest.bound.lower! - narrowest.floorAtr)} ATR above the floor (${narrowest.market})`;
    }
    if (family === "shipped") {
      const covers = judged.filter((row) => row.bound.lower! <= 0 && row.bound.upper! >= 0).length;
      detail += `; the interval covers zero in ${covers} of ${judged.length} (about 95% expected at no effect)`;
    }
    out.push(`control ${family.padEnd(12)} ${state} — ${detail}`);
  }
  const tiers = [...censoring.tiers].sort((a, b) => a[0] - b[0]).map(([tier, count]) => `${tier / 60_000}-minute ${count}`).join(", ");
  out.push(
    `control ${"censoring".padEnd(12)} ${censoringState} — ${censoring.matched} of ${censoring.sampled} sampled ` +
      `${fitName} rows reproduce maxFavorableMove and maxAdverseMove exactly (${tiers || "no rows"}; ` +
      `${drawnSample} drawn, and a drawn row of an unpinned market is not re-resolved)`,
  );
  for (const example of censoring.examples) out.push(`  mismatch: ${example}`);
  const allStates = [...states.values(), censoringState];
  out.push(
    allStates.every((state) => state === "HOLDS")
      ? "controls established: yes"
      : allStates.some((state) => state === "FAILS")
      ? "controls established: NO — a control FAILED; the instrument is not trusted"
      : "controls established: NO — a control reached NO VERDICT; nothing may be screened on this read",
  );

  out.push("", "SHIPPED DECISIONS BY MARKET");
  out.push("market    class        read  anchored  screened  unanchored  escaping  no-bars  pre-5min  zero-ATR  null-short");
  for (const result of results) {
    const c = result.counts;
    out.push(
      [
        result.symbol.padEnd(9),
        result.className.padEnd(10),
        String(c.read).padStart(6),
        String(c.anchored).padStart(9),
        String(c.screened).padStart(9),
        String(c.unanchored).padStart(11),
        String(c.escaping).padStart(9),
        String(c.noBars).padStart(8),
        String(c.notInFive).padStart(9),
        String(c.zeroAtr).padStart(9),
        String(c.nullShort).padStart(11),
      ].join(" "),
    );
  }
  for (const entry of unplaceable) out.push(`${entry.symbol.padEnd(9)} NOT SCREENED — ${entry.why}`);

  out.push("", "PER MARKET (candidate − null, ATR)");
  out.push(
    "family      market    class        decisions   days      mean      lo95      hi95        t  floorATR  floorR  verdict",
  );
  for (const family of FAMILIES) {
    for (const row of tabled.filter((entry) => entry.family === family)) {
      out.push(tableRow(family, row.market, row.className, row.bound, row.floorAtr, row.floorR, row.verdict));
    }
  }

  out.push("", "CLASS POOLS AND THE 16:00–21:59 UTC SPAN (no verdict — amendment 45)");
  out.push("pool family      class        span    decisions   days      mean      lo95      hi95        t  floorATR  floorR");
  const classes = [...new Set(results.map((result) => result.className))].sort();
  for (const family of FAMILIES) {
    for (const className of classes) {
      const points = results
        .filter((result) => result.className === className)
        .flatMap((result) => result.families.get(family)!);
      for (const [span, subset] of [
        ["all", points],
        ["in", points.filter((point) => point.inSpan)],
        ["out", points.filter((point) => !point.inSpan)],
      ] as const) {
        if (subset.length === 0) continue;
        const bound = clusteredBound(subset);
        out.push(
          `pool ${family.padEnd(11)} ${className.padEnd(12)} ${span.padEnd(4)} ${String(bound.n).padStart(10)} ` +
            `${String(bound.clusters).padStart(6)} ${fmt(bound.mean).padStart(9)} ${fmt(bound.lower).padStart(9)} ` +
            `${fmt(bound.upper).padStart(9)} ${fmt(bound.t, 2).padStart(8)} ` +
            `${floorCell(mean(subset.map((point) => point.floorAtr)), 9)} ` +
            `${floorCell(mean(subset.map((point) => point.floorR)), 7)}`,
        );
      }
    }
  }
  console.log(out.join("\n"));

  if (unpinned.length > 0) {
    console.error(
      `\n${unpinned.length} of ${placeable.length} markets are not pinned at ${manifest.anchor} and were NOT ` +
        `screened; the tables describe the markets that were, which is not the corpus:`,
    );
    for (const entry of unpinned) console.error(`  ${entry.symbol}: ${entry.why} is not pinned`);
  }
  if (unanchored > 0) {
    console.error(
      `\n${unanchored} shipped rows did not anchor: the cache's decision bar or ATR differs from the row's, so ` +
        `the cache is not the one the corpus read. They are excluded from every figure above.`,
    );
  }
  if ([...states.values(), censoringState].includes("FAILS")) return 3;
  if (unpinned.length > 0 || unanchored > 0) return 4;
  return 0;
}

if (isEntryPoint(import.meta.url)) {
  runScreen(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof OperatorInputError ? error.message : error);
      process.exitCode = 1;
    },
  );
}
