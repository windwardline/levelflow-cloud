/**
 * What the corrected forex commission does to admission at the cost cap.
 *
 * The forex class row declines a setup whose modelled round trip exceeds
 * `maxCostShare` of its risk unit (2026.09.03.forex-cost-share-cap). The
 * commission is part of that round trip, so charging it in the right currency
 * moves the share — and therefore which setups the cap admits. On the four
 * USD-quote pairs the true commission is the constant 5e-5 per base unit
 * (2026.09.13.forex-commission-usd-quote); this reader re-derives every one
 * of their rows' cost share with that constant in place of whatever the
 * corpus charged, and counts what crosses the cap in each direction, with
 * the R those rows carry as emitted.
 *
 * The pairs come from the currency table (every forex symbol whose quote is
 * USD), the cap from the forex class row unless `--cap` overrides it, and
 * the per-year buckets from the feed-character witness when `--witness`
 * names one. A corpus emitted after the fix already charges the constant,
 * so its shares do not move and the tables say so.
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
import { knownSymbols, symbolCurrencyPair } from "../supabase/functions/trade-analyzer/symbols.ts";
import { describeYearMap, resolveYearMap, type YearMap, yearOf } from "./feedYears.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { admitManifests, ROUND_TRIP_USD_PER_BASE_UNIT } from "./forex-commission-conversion.ts";
import {
  assertManifest,
  assertManifestedCorpusStreaming,
  type SweepEmitRow,
} from "./sweepStats.ts";
import { parseFolds, SEALED_FOLD } from "./tuning-folds-summary.ts";

const VALUE_FLAGS = new Set(["--cap", "--folds", "--variant", "--witness"]);

/** The forex symbols whose quote is USD — the table's answer, never the ticker's shape. */
export function usdQuoteForexSymbols(): string[] {
  return knownSymbols
    .filter((symbol) => getAssetType(symbol) === "forex" && symbolCurrencyPair(symbol)?.[1] === "USD")
    .sort();
}

type Bucket = {
  admittedFilled: number;
  admittedR: number;
  filled: number;
  keptFilled: number;
  keptR: number;
  newlyAdmitted: number;
  newlyDeclined: number;
  declinedFilled: number;
  declinedR: number;
  over: number;
  overCorrected: number;
  rows: number;
  shareCorrectedSum: number;
  shareSum: number;
};

export type AdmissionInput = {
  cap: number;
  folds: string[];
  paths: string[];
  variant: string;
  witnessTablePath?: string;
};

export type AdmissionSummary = {
  buckets: Map<string, Bucket>;
  cap: number;
  pairs: string[];
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
    admittedFilled: 0, admittedR: 0, declinedFilled: 0, declinedR: 0, filled: 0, keptFilled: 0, keptR: 0,
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
  const pairs = new Set(usdQuoteForexSymbols());
  admitManifests(input.paths, input.folds, yearMap, (symbol) => pairs.has(symbol));
  const wanted = new Set(input.folds);
  const rows: AdmissionSummary["rows"] = {
    chargedConstant: 0, chargedLegacy: 0, chargedOther: 0, missingFields: 0, notAccepted: 0, notForex: 0,
    otherPair: 0, sealed: 0, total: 0, wrongFold: 0, wrongVariant: 0,
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
      if (Math.abs(commission / close - ROUND_TRIP_USD_PER_BASE_UNIT) <= 1e-9) rows.chargedLegacy += 1;
      else if (Math.abs(commission - ROUND_TRIP_USD_PER_BASE_UNIT) <= 1e-12) rows.chargedConstant += 1;
      else rows.chargedOther += 1;
      // The share the engine gated on, and the share it would gate on with
      // the constant in place of the commission it charged. The other cost
      // terms stay exactly as emitted.
      const share = roundTrip / riskDistance;
      const shareCorrected = (roundTrip - commission + ROUND_TRIP_USD_PER_BASE_UNIT) / riskDistance;
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
          }
        } else if (share > input.cap && shareCorrected <= input.cap) {
          entry.newlyAdmitted += 1;
          if (realizedR !== null) {
            entry.admittedFilled += 1;
            entry.admittedR += realizedR;
          }
        } else if (share <= input.cap && realizedR !== null) {
          entry.keptFilled += 1;
          entry.keptR += realizedR;
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
    `pairs from the currency table (forex, USD quote): ${[...pairs].join(", ")}`,
  ];
  return { buckets, cap: input.cap, pairs: [...pairs], provenance, rows };
}

export function formatAdmission(summary: AdmissionSummary): string {
  const { rows } = summary;
  const lines: string[] = [];
  lines.push(`ADMISSION AT maxCostShare ${summary.cap} — emitted vs corrected (USD-quote commission = the constant 5e-5)`);
  for (const line of summary.provenance) lines.push(`  ${line}`);
  lines.push(
    `rows ${rows.total.toLocaleString()} (${rows.sealed.toLocaleString()} sealed) · not accepted ${rows.notAccepted.toLocaleString()} · other fold ${rows.wrongFold.toLocaleString()} · other variant ${rows.wrongVariant.toLocaleString()} · not forex ${rows.notForex.toLocaleString()} · other pair ${rows.otherPair.toLocaleString()} · missing fields ${rows.missingFields.toLocaleString()}`,
  );
  const inScope = rows.chargedLegacy + rows.chargedConstant + rows.chargedOther;
  lines.push(
    `USD-quote rows in scope ${inScope.toLocaleString()}: charged price × 5e-5 on ${rows.chargedLegacy.toLocaleString()}, the constant on ${rows.chargedConstant.toLocaleString()}, neither on ${rows.chargedOther.toLocaleString()}`,
  );
  if (inScope === 0) {
    lines.push("nothing to gate — no USD-quote forex row in scope carried the cost fields, so no table follows");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("| key | rows | filled | over cap now | over cap corrected | newly DECLINED (filled: n, R) | newly ADMITTED (filled: n, R) | kept (filled n, R) | mean share now → corrected |");
  lines.push("|---|---:|---:|---:|---:|---|---|---|---|");
  for (const key of [...summary.buckets.keys()].sort()) {
    const b = summary.buckets.get(key)!;
    lines.push(
      `| ${key} | ${b.rows.toLocaleString()} | ${b.filled.toLocaleString()} | ${b.over.toLocaleString()} | ${b.overCorrected.toLocaleString()} | ${b.newlyDeclined.toLocaleString()} (${b.declinedFilled}, ${signed(b.declinedR, 1)}) | ${b.newlyAdmitted.toLocaleString()} (${b.admittedFilled}, ${signed(b.admittedR, 1)}) | (${b.keptFilled.toLocaleString()}, ${signed(b.keptR, 1)}) | ${(b.shareSum / b.rows).toFixed(4)} → ${(b.shareCorrectedSum / b.rows).toFixed(4)} |`,
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
        "[--cap 0.15] [--folds fit,select] [--variant baseline] " +
        "[--witness <feed-character table>] — no corpus shard named, so " +
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
  const summary = await admission({ cap, folds, paths, variant, witnessTablePath: str("--witness") ?? undefined });
  console.log(formatAdmission(summary));
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
