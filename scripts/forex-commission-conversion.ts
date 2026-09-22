/**
 * The forex commission, re-priced in the right currency.
 *
 * E8 charges $5 round-turn per 100,000 BASE units — 5e-5 USD per base unit.
 * The R accountant needs that as a distance in QUOTE units: 5e-5 × (quote per
 * USD). Until 2026.09.13.forex-commission-usd-quote the engine charged
 * referencePrice × 5e-5 on every pair — the true figure multiplied by
 * USD-per-BASE, exact where USD is the base and two-sided everywhere else.
 * This reader prices every forex fill at the true figure and reports what the
 * correction does to the money the corpus recorded: the eight in/out-of-span
 * cells (fold × pool × decision hour 16–21 UTC), the per-base and per-pair
 * mis-charge, and the USD-quote subset where the true figure needs no rate.
 *
 * USD per quote comes from the corpus's own prices: the per-year mean close
 * of the quote currency's USD leg over the rows this read prices. The legs
 * come from the currency table, never from a ticker's shape — a roster pair
 * quoted in USD gives USD per unit of its base, a pair based in USD gives
 * units per USD and is inverted. A row whose quote has no leg in the corpus
 * is counted as unrated, never priced. The reader measures whatever the corpus charged — it reports how
 * many rows carry the legacy price × 5e-5 and how many the constant — so a
 * corpus emitted after the fix reads as a smaller correction, not a refusal.
 *
 * Record: forex-commission-conversion-2026-09-13.md under the research
 * tree, whose figures this reader reproduces from the R3 capture-all corpus
 * with `--years contained --witness <feed-character table>`.
 *
 * The confirm fold is sealed at the door (R4 act 1, 2026-09-02): only the
 * tuning folds reach this reader, and it filters to the shipped population
 * (row.accepted === true) before pricing anything.
 */
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { symbolCurrencyPair, usdLegsByCurrency } from "../supabase/functions/trade-analyzer/symbols.ts";
import { describeYearMap, resolveYearMap, type YearMap, yearOf, type YearsFilter } from "./feedYears.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { describeHeldOut, resolveHeldOut } from "./sweepFolds.ts";
import { type SweepManifest, stableStringify } from "./sweepManifest.ts";
import {
  assertManifest,
  assertManifestedCorpusStreaming,
  type SweepEmitRow,
} from "./sweepStats.ts";
import { parseFolds, SEALED_FOLD } from "./tuning-folds-summary.ts";

const VALUE_FLAGS = new Set(["--folds", "--variant", "--years", "--witness"]);
const BOOLEAN_FLAGS = new Set(["--include-holdout"]);

/** Two shards price as one measurement only when these agree (banked-fraction's rule). */
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

/**
 * The checks every neighbour runs before a row is read: one measurement
 * across shards, every requested fold declared, and — when the read
 * stratifies by year — every market it would price placeable. The caller
 * refuses an empty path list first, so the message names what was missing.
 */
export function admitManifests(
  paths: string[],
  folds: string[],
  yearMap: YearMap | null,
  prices: (symbol: string) => boolean,
): SweepManifest[] {
  const manifests = paths.map((path) => assertManifest(path));
  let identity: string | null = null;
  for (const [index, manifest] of manifests.entries()) {
    const record = manifest as unknown as Record<string, unknown>;
    const shardIdentity = stableStringify(Object.fromEntries(IDENTITY_TERMS.map((term) => [term, record[term]])));
    if (identity === null) {
      identity = shardIdentity;
    } else if (identity !== shardIdentity) {
      throw new OperatorInputError(
        `${paths[index]}: this shard's engine, anchor, depth, grid, folds, clock, conditions, cost scales or acceptance mode differ from the first shard's — two measurements cannot be priced as one`,
      );
    }
    const declared = declaredFoldNames(manifest);
    if (declared === null) {
      throw new OperatorInputError(`${paths[index]}: the manifest declares no folds — a legacy two-split corpus cannot be read by fold name`);
    }
    for (const fold of folds) {
      if (!declared.has(fold)) {
        throw new OperatorInputError(`${paths[index]}: the manifest declares no "${fold}" fold (it declares ${[...declared].sort().join(", ")})`);
      }
    }
  }
  if (yearMap) {
    const unplaceable = manifests.flatMap((manifest) => manifest.symbols.map((entry) => entry.symbol))
      .filter((symbol, index, all) => all.indexOf(symbol) === index && prices(symbol) && yearMap.bucketOf(symbol, 2000) === "unknown")
      .sort();
    if (unplaceable.length > 0) {
      throw new OperatorInputError(`the year map (${yearMap.source}) cannot place ${unplaceable.length} market(s) this read would price: ${unplaceable.join(", ")} — an absent verdict is not a contained one`);
    }
  }
  return manifests;
}

/** $5 per 100,000 base units, E8 PRIMARY (e8-markets-dossier §12a). */
export const ROUND_TRIP_USD_PER_BASE_UNIT = 5 / 100_000;
/** The decision hours the in-span finding names (hour-gate verdict, 2026-09-12). */
const SPAN_HOURS = { first: 16, last: 21 };
/**
 * The roster's USD leg for each non-USD currency, from the currency table:
 * the forex pair that quotes the currency in USD (USD per unit), or the one
 * based in USD (units per USD, so the rate is inverted). Derived, so a roster
 * change moves it without anyone remembering this list.
 */
export function usdLegsFromTable(): Map<string, { symbol: string; usdIsBase: boolean }> {
  // The engine's own derivation (symbols.ts, 2026-09-14): one table, one
  // reading of it, so the reader prices the legs the engine charges.
  return usdLegsByCurrency();
}

type Fill = {
  base: string;
  close: number;
  commission: number;
  heldOut: boolean;
  inSpan: boolean;
  quote: string;
  realizedR: number;
  riskDistance: number;
  split: string;
  symbol: string;
  year: number;
};

type Cell = { corrected: number; corrected2: number; n: number; net: number; net2: number };
type Charge = { charged: number; dR: number; n: number; truth: number };

export type ConversionInput = {
  folds: string[];
  /** Tests point this at an empty directory; the CLI takes the tracked pins. */
  holdoutPinDir?: string;
  includeHoldout: boolean;
  paths: string[];
  variant: string;
  witnessTablePath?: string;
  years: YearsFilter;
};

export type ConversionSummary = {
  cells: Map<string, Cell>;
  exact: Map<string, { dR: number; n: number }>;
  perBase: Map<string, Charge>;
  perPair: Map<string, Charge & { quote: string }>;
  provenance: string[];
  rows: {
    constantCharged: number;
    legacyCharged: number;
    missingFields: number;
    notAccepted: number;
    notFilled: number;
    notForex: number;
    otherCharged: number;
    otherYears: number;
    priced: number;
    sealed: number;
    total: number;
    unrated: number;
    wrongFold: number;
    wrongVariant: number;
  };
};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function lower95(sum: number, sumOfSquares: number, n: number): number {
  const mean = sum / n;
  const variance = n > 1 ? (sumOfSquares - n * mean * mean) / (n - 1) : 0;
  return mean - 1.96 * Math.sqrt(Math.max(variance, 0) / n);
}

const signed = (value: number, digits: number): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

export async function conversion(input: ConversionInput): Promise<ConversionSummary> {
  if (input.paths.length === 0) {
    throw new OperatorInputError("no corpus shard named — a run over zero rows cannot price a commission");
  }
  const preflight = input.paths.map((path) => assertManifest(path));
  const yearMap: YearMap | null = input.years === "all"
    ? null
    : resolveYearMap({ manifests: preflight, witnessTablePath: input.witnessTablePath });
  // Every forex market in the manifests is priced (held-out ones too, labelled), so every one must be placeable.
  const manifests = admitManifests(input.paths, input.folds, yearMap, (symbol) => getAssetType(symbol) === "forex" && symbolCurrencyPair(symbol) !== null);
  const holdout = resolveHeldOut(manifests, input.holdoutPinDir);
  const heldOut = new Set(input.includeHoldout ? [] : holdout.markets);
  const wanted = new Set(input.folds);
  const rows: ConversionSummary["rows"] = {
    constantCharged: 0, legacyCharged: 0, missingFields: 0, notAccepted: 0, notFilled: 0, notForex: 0,
    otherCharged: 0, otherYears: 0, priced: 0, sealed: 0, total: 0, unrated: 0, wrongFold: 0, wrongVariant: 0,
  };
  const fills: Fill[] = [];
  for (const path of input.paths) {
    const manifest = await assertManifestedCorpusStreaming(path, (row: SweepEmitRow) => {
      rows.total += 1;
      if (row.accepted !== true) {
        rows.notAccepted += 1;
        return;
      }
      const split = String(row.split);
      if (!wanted.has(split)) {
        rows.wrongFold += 1;
        return;
      }
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      if (variant !== input.variant) {
        rows.wrongVariant += 1;
        return;
      }
      const symbol = String(row.symbol);
      const pair = symbolCurrencyPair(symbol);
      if (getAssetType(symbol) !== "forex" || pair === null) {
        rows.notForex += 1;
        return;
      }
      const record = row as unknown as Record<string, unknown>;
      if (record.noBarsInReviewWindow === true || row.outcome === "unfilled") {
        rows.notFilled += 1;
        return;
      }
      const realizedR = finite(row.realizedR);
      const time = finite(row.time);
      const close = finite(record.latestClose);
      const riskDistance = finite(row.riskDistance);
      const commission = finite(record.estimatedCommission);
      if (
        realizedR === null || time === null || close === null || riskDistance === null ||
        commission === null || riskDistance <= 0 || close <= 0
      ) {
        rows.missingFields += 1;
        return;
      }
      const year = yearOf(time);
      if (yearMap && yearMap.bucketOf(symbol, year) !== input.years) {
        rows.otherYears += 1;
        return;
      }
      const hour = new Date(time).getUTCHours();
      fills.push({
        base: pair[0],
        close,
        commission,
        heldOut: heldOut.has(symbol),
        inSpan: hour >= SPAN_HOURS.first && hour <= SPAN_HOURS.last,
        quote: pair[1],
        realizedR,
        riskDistance,
        split,
        symbol,
        year,
      });
    });
    rows.total += manifest.sealedRows;
    rows.sealed += manifest.sealedRows;
  }

  // What the corpus charged, stated before anything is corrected: the legacy
  // price × 5e-5, the post-fix constant on USD-quote pairs, or neither.
  for (const fill of fills) {
    if (Math.abs(fill.commission / fill.close - ROUND_TRIP_USD_PER_BASE_UNIT) <= 1e-9) rows.legacyCharged += 1;
    else if (Math.abs(fill.commission - ROUND_TRIP_USD_PER_BASE_UNIT) <= 1e-12) rows.constantCharged += 1;
    else rows.otherCharged += 1;
  }

  // USD per quote by year, from the priced rows' own closes on the legs.
  const legs = usdLegsFromTable();
  const legSymbols = new Set([...legs.values()].map((leg) => leg.symbol));
  const yearMean = new Map<string, { n: number; sum: number }>();
  for (const fill of fills) {
    if (!legSymbols.has(fill.symbol)) continue;
    const key = `${fill.symbol}|${fill.year}`;
    const entry = yearMean.get(key) ?? { n: 0, sum: 0 };
    entry.n += 1;
    entry.sum += fill.close;
    yearMean.set(key, entry);
  }
  const mean = (symbol: string, year: number): number | null => {
    const entry = yearMean.get(`${symbol}|${year}`);
    return entry && entry.n > 0 ? entry.sum / entry.n : null;
  };
  const usdPerQuote = (quote: string, year: number): number | null => {
    if (quote === "USD") return 1;
    const leg = legs.get(quote);
    if (leg === undefined) return null;
    const close = mean(leg.symbol, year);
    if (close === null) return null;
    return leg.usdIsBase ? 1 / close : close;
  };

  const cells = new Map<string, Cell>();
  const perBase = new Map<string, Charge>();
  const perPair = new Map<string, Charge & { quote: string }>();
  const exact = new Map<string, { dR: number; n: number }>();
  for (const fill of fills) {
    const rate = usdPerQuote(fill.quote, fill.year);
    if (rate === null) {
      rows.unrated += 1;
      continue;
    }
    rows.priced += 1;
    // The true round trip in quote units per base unit, and the R the corpus
    // charged beyond it (positive: the model overcharged, R given back).
    const truth = ROUND_TRIP_USD_PER_BASE_UNIT / rate;
    const dR = (fill.commission - truth) / fill.riskDistance;
    const corrected = fill.realizedR + dR;
    const key = `${fill.split}|${fill.heldOut ? "held-out" : "in-pool"}|${fill.inSpan ? "in" : "out"}`;
    const cell = cells.get(key) ?? { corrected: 0, corrected2: 0, n: 0, net: 0, net2: 0 };
    cell.n += 1;
    cell.net += fill.realizedR;
    cell.net2 += fill.realizedR * fill.realizedR;
    cell.corrected += corrected;
    cell.corrected2 += corrected * corrected;
    cells.set(key, cell);
    const charged = fill.commission / fill.riskDistance;
    const trueR = truth / fill.riskDistance;
    const base = perBase.get(fill.base) ?? { charged: 0, dR: 0, n: 0, truth: 0 };
    base.n += 1;
    base.dR += dR;
    base.charged += charged;
    base.truth += trueR;
    perBase.set(fill.base, base);
    const pair = perPair.get(fill.symbol) ?? { charged: 0, dR: 0, n: 0, quote: fill.quote, truth: 0 };
    pair.n += 1;
    pair.dR += dR;
    pair.charged += charged;
    pair.truth += trueR;
    perPair.set(fill.symbol, pair);
    if (fill.quote === "USD") {
      const entry = exact.get(fill.symbol) ?? { dR: 0, n: 0 };
      entry.n += 1;
      entry.dR += dR;
      exact.set(fill.symbol, entry);
    }
  }

  const provenance = [
    `folds read: ${input.folds.join(", ")} · ${SEALED_FOLD}: SEALED, not read (${rows.sealed.toLocaleString()} rows withheld at the door) · variant ${input.variant} · years ${input.years}` +
      (yearMap ? ` (${describeYearMap(yearMap.source, input.witnessTablePath)})` : ""),
    input.includeHoldout
      ? `held-out markets INCLUDED in every pool (--include-holdout): ${holdout.markets.join(", ")}`
      : `${describeHeldOut(holdout, { labels: true, pools: false })} — held-out fills are labelled in the eight cells and POOLED with in-pool fills in the per-base, per-pair and USD-quote tables; nothing is excluded`,
    `span = decision hour ${SPAN_HOURS.first}–${SPAN_HOURS.last} UTC · rate = per-year mean close of the quote currency's USD leg over the priced rows (legs from the currency table: ${[...legs.values()].map((leg) => leg.symbol).sort().join(", ")})`,
  ];
  return { cells, exact, perBase, perPair, provenance, rows };
}

export function formatConversion(summary: ConversionSummary): string {
  const { rows } = summary;
  const lines: string[] = [];
  lines.push("THE FOREX COMMISSION, RE-PRICED IN THE RIGHT CURRENCY");
  for (const line of summary.provenance) lines.push(`  ${line}`);
  lines.push(
    `rows ${rows.total.toLocaleString()} (${rows.sealed.toLocaleString()} sealed) · not accepted ${rows.notAccepted.toLocaleString()} · other fold ${rows.wrongFold.toLocaleString()} · other variant ${rows.wrongVariant.toLocaleString()} · not forex ${rows.notForex.toLocaleString()} · unfilled ${rows.notFilled.toLocaleString()} · missing fields ${rows.missingFields.toLocaleString()} · other years ${rows.otherYears.toLocaleString()}`,
  );
  lines.push(
    `forex fills in scope ${(rows.priced + rows.unrated).toLocaleString()}: charged price × 5e-5 on ${rows.legacyCharged.toLocaleString()}, the constant 5e-5 on ${rows.constantCharged.toLocaleString()}, neither on ${rows.otherCharged.toLocaleString()} · unrated (no USD leg for the quote) ${rows.unrated.toLocaleString()} · priced ${rows.priced.toLocaleString()}`,
  );
  if (rows.priced === 0) {
    lines.push("nothing priced — no forex fill in scope could be rated, so no table follows");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("THE EIGHT CELLS — net as emitted, then with the commission conversion corrected");
  lines.push("| fold | pool | span | fills | E net | lo95 net | E corrected | lo95 corrected | ΔE |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|");
  for (const key of [...summary.cells.keys()].sort()) {
    const cell = summary.cells.get(key)!;
    const [fold, pool, span] = key.split("|");
    const net = cell.net / cell.n;
    const corrected = cell.corrected / cell.n;
    lines.push(
      `| ${fold} | ${pool} | ${span} | ${cell.n.toLocaleString()} | ${net.toFixed(4)} | ${lower95(cell.net, cell.net2, cell.n).toFixed(4)} | ${corrected.toFixed(4)} | ${lower95(cell.corrected, cell.corrected2, cell.n).toFixed(4)} | ${(corrected - net).toFixed(4)} |`,
    );
  }
  lines.push("");
  lines.push("PER BASE CURRENCY (charged/true > 1 means the model OVERcharged; ΔR > 0 is R given back)");
  lines.push("| base | fills | charged R | true R | charged/true | ΔR (corrected − emitted) |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const [base, charge] of [...summary.perBase].sort((a, b) => b[1].dR - a[1].dR)) {
    lines.push(
      `| ${base} | ${charge.n.toLocaleString()} | ${charge.charged.toFixed(1)} | ${charge.truth.toFixed(1)} | ${(charge.charged / charge.truth).toFixed(3)} | ${signed(charge.dR, 1)} |`,
    );
  }
  lines.push("");
  lines.push("PER PAIR, ranked by |ΔR total| — the mis-charge each pair carries in the corpus's own R");
  lines.push("| rank | pair | quote | fills | charged/true | ΔR total | ΔR/fill |");
  lines.push("|---:|---|---|---:|---:|---:|---:|");
  const ranked = [...summary.perPair].sort((a, b) => Math.abs(b[1].dR) - Math.abs(a[1].dR));
  ranked.forEach(([symbol, charge], index) => {
    lines.push(
      `| ${index + 1} | ${symbol} | ${charge.quote} | ${charge.n.toLocaleString()} | ${(charge.charged / charge.truth).toFixed(3)} | ${signed(charge.dR, 1)} | ${signed(charge.dR / charge.n, 5)} |`,
    );
  });
  lines.push("");
  lines.push("USD-QUOTE SUBSET — where the true figure is the constant 5e-5 per base unit and needs no rate");
  for (const [symbol, entry] of [...summary.exact].sort()) {
    lines.push(`  ${symbol}: ${entry.n.toLocaleString()} fills, ΔR ${signed(entry.dR, 1)} R (mean ${signed(entry.dR / entry.n, 5)} R/fill)`);
  }
  return lines.join("\n");
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
  // WIF-4: a run over zero rows cannot report a correction, and a header
  // printed under exit 0 reads exactly like a corpus that priced nothing.
  if (paths.length === 0) {
    throw new OperatorInputError(
      "usage: forex-commission-conversion.ts <emit.jsonl> [more.jsonl ...] " +
        "[--folds fit,select] [--variant baseline] [--years all|contained|escaping " +
        "[--witness <feed-character table>]] [--include-holdout] — no corpus " +
        "shard named, so there is nothing to price",
    );
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
  const summary = await conversion({
    folds,
    includeHoldout,
    paths,
    variant,
    witnessTablePath: str("--witness") ?? undefined,
    years: yearsArg,
  });
  console.log(formatConversion(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    if (error instanceof OperatorInputError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
