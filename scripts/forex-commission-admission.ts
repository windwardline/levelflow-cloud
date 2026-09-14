/**
 * What the corrected forex commission does to admission at the cost cap.
 *
 * The forex class row declines a setup whose modelled round trip exceeds
 * `maxCostShare` of its risk unit (2026.09.03.forex-cost-share-cap). The
 * commission is part of that round trip, so charging it in the right currency
 * moves the share — and therefore which setups the cap admits. Two
 * populations, one at a time (`--pairs`):
 *   · `usd-quote` (default, the record's): the four pairs whose true
 *     commission is the constant 5e-5 (2026.09.13.forex-commission-usd-quote).
 *   · `crosses`: the 21 pairs whose true commission is 5e-5 / USD-per-quote,
 *     the rate being the USD leg's last completed daily close AT EACH
 *     DECISION (2026.09.14.forex-commission-cross-rate) — read from the pinned
 *     cache at the corpus's own anchor and depth behind fetchers that throw
 *     (`--cache-dir`, zero provider bytes), through the engine's own
 *     completion gate; a decision with no completed leg close is counted
 *     `unrated`, never priced.
 * The reader re-derives every row's cost share with the exact figure in place
 * of whatever the corpus charged and counts what crosses the cap in each
 * direction, with the R those rows carry as emitted AND corrected (the
 * conversion reader's per-fill dR).
 *
 * The pairs come from the currency table, the cap from the forex class row
 * unless `--cap` overrides it, and the per-year buckets from the
 * feed-character witness when `--witness` names one. A corpus emitted after
 * the fix already charges the exact figure, so its shares do not move and the
 * tables say so.
 *
 * Record: forex-commission-conversion-2026-09-13.md under the research
 * tree, whose admission table this reader reproduces from the R3
 * capture-all corpus with `--witness <feed-character table>`.
 *
 * The confirm fold is sealed at the door (R4 act 1, 2026-09-02): only the
 * tuning folds reach this reader, and it filters to the shipped population
 * (row.accepted === true) before deriving a share.
 */
import { fileURLToPath } from "node:url";
import { getAssetType, getClassCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { completedDailySeries } from "../supabase/functions/trade-analyzer/dailyCompletion.ts";
import { knownSymbols, quoteCurrencyUsdLeg, resolveProviderSymbols, symbolCurrencyPair } from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";
import { DEFAULT_CACHE_DIR, loadRollingSeries } from "./calibrationCache.ts";
import { describeYearMap, resolveYearMap, type YearMap, yearOf } from "./feedYears.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { admitManifests, ROUND_TRIP_USD_PER_BASE_UNIT } from "./forex-commission-conversion.ts";
import {
  assertManifest,
  assertManifestedCorpusStreaming,
  type SweepEmitRow,
} from "./sweepStats.ts";
import { parseFolds, SEALED_FOLD } from "./tuning-folds-summary.ts";

const VALUE_FLAGS = new Set(["--cache-dir", "--cap", "--folds", "--pairs", "--variant", "--witness"]);

/** The forex symbols whose quote is USD — the table's answer, never the ticker's shape. */
export function usdQuoteForexSymbols(): string[] {
  return knownSymbols
    .filter((symbol) => getAssetType(symbol) === "forex" && symbolCurrencyPair(symbol)?.[1] === "USD")
    .sort();
}

/** The 21 crosses — every forex symbol the currency table gives a USD leg. */
export function crossForexSymbols(): string[] {
  return knownSymbols
    .filter((symbol) => getAssetType(symbol) === "forex" && quoteCurrencyUsdLeg(symbol).kind === "leg")
    .sort();
}

/**
 * A leg's completed daily close at a decision instant: the bar whose
 * completion is the latest at or before `atMs`, or null when none has
 * completed — the engine's own rule (2026.09.14.forex-commission-cross-rate),
 * so the corrected share here is the share the engine now gates on.
 */
export type LegRates = (legSymbol: string, atMs: number) => { close: number; completeAtMs: number } | null;

type Bucket = {
  admittedFilled: number;
  admittedR: number;
  /** The same rows' R with the commission corrected (the conversion reader's dR, per fill). */
  admittedRCorrected: number;
  filled: number;
  keptFilled: number;
  keptR: number;
  keptRCorrected: number;
  newlyAdmitted: number;
  newlyDeclined: number;
  declinedFilled: number;
  declinedR: number;
  declinedRCorrected: number;
  over: number;
  overCorrected: number;
  rows: number;
  shareCorrectedSum: number;
  shareSum: number;
};

export type AdmissionInput = {
  cap: number;
  folds: string[];
  /** Required with `pairs: "crosses"`: the leg's completed close at each decision. */
  legRates?: LegRates;
  /** Which forex population to gate: the four USD-quote pairs (the record's, default) or the 21 crosses. */
  pairs?: "usd-quote" | "crosses";
  paths: string[];
  variant: string;
  witnessTablePath?: string;
};

export type AdmissionSummary = {
  buckets: Map<string, Bucket>;
  cap: number;
  pairs: string[];
  population: "usd-quote" | "crosses";
  provenance: string[];
  rows: {
    chargedConstant: number;
    chargedLegacy: number;
    chargedOther: number;
    missingFields: number;
    notAccepted: number;
    notForex: number;
    otherPair: number;
    sealed: number;
    total: number;
    /** Cross rows whose leg had no completed close at the decision — counted out, never priced. */
    unrated: number;
    wrongFold: number;
    wrongVariant: number;
  };
};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const signed = (value: number, digits: number): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

function bucket(): Bucket {
  return {
    admittedFilled: 0, admittedR: 0, admittedRCorrected: 0, declinedFilled: 0, declinedR: 0, declinedRCorrected: 0,
    filled: 0, keptFilled: 0, keptR: 0, keptRCorrected: 0,
    newlyAdmitted: 0, newlyDeclined: 0, over: 0, overCorrected: 0, rows: 0, shareCorrectedSum: 0, shareSum: 0,
  };
}

export async function admission(input: AdmissionInput): Promise<AdmissionSummary> {
  if (input.paths.length === 0) {
    throw new OperatorInputError("no corpus shard named — a run over zero rows cannot gate a commission");
  }
  const preflight = input.paths.map((path) => assertManifest(path));
  const yearMap: YearMap | null = input.witnessTablePath === undefined
    ? null
    : resolveYearMap({ manifests: preflight, witnessTablePath: input.witnessTablePath });
  const population = input.pairs ?? "usd-quote";
  if (population === "crosses" && input.legRates === undefined) {
    throw new OperatorInputError("the crosses need a rate source (legRates): the exact figure is 5e-5 over the leg's completed close at each decision, and there is no honest figure without it");
  }
  const pairs = new Set(population === "crosses" ? crossForexSymbols() : usdQuoteForexSymbols());
  admitManifests(input.paths, input.folds, yearMap, (symbol) => pairs.has(symbol));
  const wanted = new Set(input.folds);
  const rows: AdmissionSummary["rows"] = {
    chargedConstant: 0, chargedLegacy: 0, chargedOther: 0, missingFields: 0, notAccepted: 0, notForex: 0,
    otherPair: 0, sealed: 0, total: 0, unrated: 0, wrongFold: 0, wrongVariant: 0,
  };
  const buckets = new Map<string, Bucket>();
  for (const path of input.paths) {
    const manifest = await assertManifestedCorpusStreaming(path, (row: SweepEmitRow) => {
      rows.total += 1;
      if (row.accepted !== true) {
        rows.notAccepted += 1;
        return;
      }
      if (!wanted.has(String(row.split))) {
        rows.wrongFold += 1;
        return;
      }
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      if (variant !== input.variant) {
        rows.wrongVariant += 1;
        return;
      }
      const symbol = String(row.symbol);
      if (getAssetType(symbol) !== "forex") {
        rows.notForex += 1;
        return;
      }
      if (!pairs.has(symbol)) {
        rows.otherPair += 1;
        return;
      }
      const record = row as unknown as Record<string, unknown>;
      const time = finite(row.time);
      const close = finite(record.latestClose);
      const riskDistance = finite(row.riskDistance);
      const commission = finite(record.estimatedCommission);
      const roundTrip = finite(record.estimatedRoundTripCost);
      const filled = !(record.noBarsInReviewWindow === true || row.outcome === "unfilled");
      const realizedR = filled ? finite(row.realizedR) : null;
      if (
        time === null || close === null || riskDistance === null || commission === null ||
        roundTrip === null || riskDistance <= 0 || close <= 0 || (filled && realizedR === null)
      ) {
        rows.missingFields += 1;
        return;
      }
      // The exact figure for this row: the constant on a USD-quote pair;
      // 5e-5 over USD-per-quote from the leg's completed close at THIS
      // decision on a cross (inverted where the leg is based in USD).
      let truth = ROUND_TRIP_USD_PER_BASE_UNIT;
      if (population === "crosses") {
        const leg = quoteCurrencyUsdLeg(symbol);
        const legClose = leg.kind === "leg" ? input.legRates!(leg.leg, time) : null;
        if (leg.kind !== "leg" || legClose === null || !Number.isFinite(legClose.close) || legClose.close <= 0) {
          rows.unrated += 1;
          return;
        }
        const usdPerQuote = leg.usdIsBase ? 1 / legClose.close : legClose.close;
        truth = ROUND_TRIP_USD_PER_BASE_UNIT / usdPerQuote;
      }
      if (Math.abs(commission / close - ROUND_TRIP_USD_PER_BASE_UNIT) <= 1e-9) rows.chargedLegacy += 1;
      else if (Math.abs(commission - truth) <= 1e-12) rows.chargedConstant += 1;
      else rows.chargedOther += 1;
      // The share the engine gated on, and the share it would gate on with
      // the exact figure in place of the commission it charged. The other
      // cost terms stay exactly as emitted. The money moves the same way the
      // conversion reader prices it: dR = (charged − truth) / risk per fill.
      const share = roundTrip / riskDistance;
      const shareCorrected = (roundTrip - commission + truth) / riskDistance;
      const dR = (commission - truth) / riskDistance;
      const year = yearOf(time);
      const keys = [`${symbol}|all`, "all pairs|all"];
      if (yearMap) {
        const period = yearMap.bucketOf(symbol, year);
        keys.push(`${symbol}|${period}`, `all pairs|${period}`);
      }
      for (const key of keys) {
        const entry = buckets.get(key) ?? bucket();
        entry.rows += 1;
        if (filled) entry.filled += 1;
        entry.shareSum += share;
        entry.shareCorrectedSum += shareCorrected;
        if (share > input.cap) entry.over += 1;
        if (shareCorrected > input.cap) entry.overCorrected += 1;
        if (share <= input.cap && shareCorrected > input.cap) {
          entry.newlyDeclined += 1;
          if (realizedR !== null) {
            entry.declinedFilled += 1;
            entry.declinedR += realizedR;
            entry.declinedRCorrected += realizedR + dR;
          }
        } else if (share > input.cap && shareCorrected <= input.cap) {
          entry.newlyAdmitted += 1;
          if (realizedR !== null) {
            entry.admittedFilled += 1;
            entry.admittedR += realizedR;
            entry.admittedRCorrected += realizedR + dR;
          }
        } else if (share <= input.cap && realizedR !== null) {
          entry.keptFilled += 1;
          entry.keptR += realizedR;
          entry.keptRCorrected += realizedR + dR;
        }
        buckets.set(key, entry);
      }
    });
    rows.total += manifest.sealedRows;
    rows.sealed += manifest.sealedRows;
  }
  const provenance = [
    `folds read: ${input.folds.join(", ")} · ${SEALED_FOLD}: SEALED, not read (${rows.sealed.toLocaleString()} rows withheld at the door) · variant ${input.variant} · cap ${input.cap} (the forex class row unless --cap)` +
      (yearMap ? ` · years by ${describeYearMap(yearMap.source, input.witnessTablePath)}` : " · years pooled (no --witness)"),
    population === "crosses"
      ? `pairs from the currency table (forex crosses, ${pairs.size}): ${[...pairs].join(", ")} · cross commission = 5e-5 / USD-per-quote at the leg's last completed daily close, per decision (legs: ${[...new Set([...pairs].flatMap((cross) => { const leg = quoteCurrencyUsdLeg(cross); return leg.kind === "leg" ? [leg.leg] : []; }))].sort().join(", ")}) · unrated (no completed leg close at the decision) ${rows.unrated.toLocaleString()}`
      : `pairs from the currency table (forex, USD quote): ${[...pairs].join(", ")}`,
  ];
  return { buckets, cap: input.cap, pairs: [...pairs], population, provenance, rows };
}

export function formatAdmission(summary: AdmissionSummary): string {
  const { rows } = summary;
  const lines: string[] = [];
  lines.push(
    summary.population === "usd-quote"
      ? `ADMISSION AT maxCostShare ${summary.cap} — emitted vs corrected (USD-quote commission = the constant 5e-5)`
      : `ADMISSION AT maxCostShare ${summary.cap} — emitted vs corrected (the crosses' exact commission, per decision)`,
  );
  for (const line of summary.provenance) lines.push(`  ${line}`);
  lines.push(
    `rows ${rows.total.toLocaleString()} (${rows.sealed.toLocaleString()} sealed) · not accepted ${rows.notAccepted.toLocaleString()} · other fold ${rows.wrongFold.toLocaleString()} · other variant ${rows.wrongVariant.toLocaleString()} · not forex ${rows.notForex.toLocaleString()} · other pair ${rows.otherPair.toLocaleString()} · missing fields ${rows.missingFields.toLocaleString()}`,
  );
  const inScope = rows.chargedLegacy + rows.chargedConstant + rows.chargedOther;
  lines.push(
    `rows in scope ${inScope.toLocaleString()}: charged price × 5e-5 on ${rows.chargedLegacy.toLocaleString()}, the exact figure on ${rows.chargedConstant.toLocaleString()}, neither on ${rows.chargedOther.toLocaleString()}`,
  );
  if (inScope === 0) {
    lines.push("nothing to gate — no forex row in scope carried the cost fields, so no table follows");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("| key | rows | filled | over cap now | over cap corrected | newly DECLINED (filled: n, R emitted → corrected) | newly ADMITTED (filled: n, R emitted → corrected) | kept (filled n, R emitted → corrected) | mean share now → corrected |");
  lines.push("|---|---:|---:|---:|---:|---|---|---|---|");
  for (const key of [...summary.buckets.keys()].sort()) {
    const b = summary.buckets.get(key)!;
    lines.push(
      `| ${key} | ${b.rows.toLocaleString()} | ${b.filled.toLocaleString()} | ${b.over.toLocaleString()} | ${b.overCorrected.toLocaleString()} | ${b.newlyDeclined.toLocaleString()} (${b.declinedFilled}, ${signed(b.declinedR, 1)} → ${signed(b.declinedRCorrected, 1)}) | ${b.newlyAdmitted.toLocaleString()} (${b.admittedFilled}, ${signed(b.admittedR, 1)} → ${signed(b.admittedRCorrected, 1)}) | (${b.keptFilled.toLocaleString()}, ${signed(b.keptR, 1)} → ${signed(b.keptRCorrected, 1)}) | ${(b.shareSum / b.rows).toFixed(4)} → ${(b.shareCorrectedSum / b.rows).toFixed(4)} |`,
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { num, str } = flagReader(args, VALUE_FLAGS);
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) {
        index += 1;
      } else {
        throw new OperatorInputError(`unknown flag ${args[index]}`);
      }
      continue;
    }
    paths.push(args[index]);
  }
  // WIF-4: a run over zero rows cannot report an admission delta, and a
  // header printed under exit 0 reads exactly like a corpus that gated nothing.
  if (paths.length === 0) {
    throw new OperatorInputError(
      "usage: forex-commission-admission.ts <emit.jsonl> [more.jsonl ...] " +
        "[--cap 0.15] [--folds fit,select] [--variant baseline] [--pairs usd-quote|crosses] " +
        "[--cache-dir .calibration-cache] [--witness <feed-character table>] — no corpus shard named, so " +
        "there is nothing to gate",
    );
  }
  const folds = parseFolds(str("--folds") ?? "fit,select");
  const variant = (str("--variant") ?? "baseline").trim();
  if (!variant) {
    throw new OperatorInputError("--variant names no variant — the default is baseline");
  }
  const shipped = getClassCalibration("forex").maxCostShare;
  if (str("--cap") === undefined && shipped === undefined) {
    throw new OperatorInputError(
      "the forex class row declares no maxCostShare and no --cap was given — there is no cap to gate against",
    );
  }
  const cap = num("--cap", shipped ?? Number.NaN, {
    basis: "a cost share is the round trip as a fraction of the risk unit — zero or above",
    min: 0,
  });
  const pairsArg = (str("--pairs") ?? "usd-quote").trim();
  if (pairsArg !== "usd-quote" && pairsArg !== "crosses") {
    throw new OperatorInputError(`--pairs must be usd-quote or crosses — got "${pairsArg}"`);
  }
  const legRates = pairsArg === "crosses"
    ? await legRatesFromPinnedCache(paths, str("--cache-dir") ?? DEFAULT_CACHE_DIR)
    : undefined;
  const summary = await admission({
    cap,
    folds,
    legRates,
    pairs: pairsArg,
    paths,
    variant,
    witnessTablePath: str("--witness") ?? undefined,
  });
  console.log(formatAdmission(summary));
}

/**
 * The legs' daily series from the pinned cache at the corpus's own anchor
 * and depth — the store the sweep reads — behind fetchers that THROW, so this
 * reader spends zero provider bytes by construction: an unpinned leg is a
 * crash naming the key, never a purchase. Each leg is walked through the
 * engine's completion gate; a decision reads the last bar completed at or
 * before it, by binary search on the completion instants.
 */
export async function legRatesFromPinnedCache(paths: string[], cacheDir: string): Promise<LegRates> {
  const manifest = assertManifest(paths[0]);
  const anchor = manifest.anchor;
  const days = manifest.days;
  if (typeof anchor !== "string" || typeof days !== "number") {
    throw new OperatorInputError(`${paths[0]}: the manifest names no anchor/days, so the legs' stores cannot be addressed`);
  }
  const series = new Map<string, Array<{ close: number; completeAtMs: number }>>();
  // Only the legs a cross quotes in — six today; EURUSD is a leg of nothing
  // — so an unpinned store that no read needs cannot refuse the read.
  const legs = new Map<string, { symbol: string; usdIsBase: boolean }>();
  for (const cross of crossForexSymbols()) {
    const leg = quoteCurrencyUsdLeg(cross);
    if (leg.kind === "leg") legs.set(leg.leg, { symbol: leg.leg, usdIsBase: leg.usdIsBase });
  }
  for (const leg of legs.values()) {
    const provider = resolveProviderSymbols(leg.symbol)[0];
    if (!provider) throw new OperatorInputError(`${leg.symbol}: no provider symbol`);
    const key = `${provider}-daily-${days}`;
    const refuse = () => {
      throw new OperatorInputError(
        `${key} is not pinned at ${anchor} in ${cacheDir} — this reader spends zero provider bytes and will not buy the leg's series`,
      );
    };
    const bars = await loadRollingSeries<Bar>({ anchor, cacheDir, clock: BAR_CLOCK, fetchFull: refuse, fetchSince: refuse, key, timeOf: (bar) => bar.time });
    series.set(
      leg.symbol,
      completedDailySeries(leg.symbol, bars).map((entry) => ({ close: entry.bar.close, completeAtMs: entry.completeAtMs })),
    );
  }
  return (legSymbol, atMs) => {
    const entries = series.get(legSymbol);
    if (!entries || entries.length === 0) return null;
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (entries[mid].completeAtMs <= atMs) low = mid + 1;
      else high = mid;
    }
    return low === 0 ? null : entries[low - 1];
  };
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
