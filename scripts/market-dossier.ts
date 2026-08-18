// One dossier per market — the per-market review's factual spine.
//
// The mandate (owner, 2026-08-11): every E8-tradable, FMP-matched market
// reviewed INDIVIDUALLY, not by class. Piecemeal population-level answers
// have repeatedly left money on the table — 4d validated deltas and
// inherited levels, and thirteen markets traded at up to -1.8R per setup
// because nobody asked whether the level they inherited was profitable.
//
// So this emits, per market, every fact a verdict should rest on, with
// each calibration field carrying its PROVENANCE — derived for this
// market, or inherited from a class, or a legacy override. An inherited
// number is not wrong; an inherited number nobody has ever tested for
// this market is the defect.
//
//   npx tsx scripts/market-dossier.ts --net <shards> --gross <shards> \
//     --out docs/research/market-review-2026-08-11/dossiers.json
import { readFileSync, writeFileSync } from "node:fs";
import {
  ENGINE_DECLINED_MARKETS,
  getAssetType,
  getCategoryCalibration,
  getClassCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  contractSizeVariants,
  defaultScanSymbols,
  getCorrelatedSymbols,
  getCorrelationGroup,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import { getFuturesContractSpec } from "../supabase/functions/trade-analyzer/futures.ts";
import { SECURITY_OPTIONS } from "../src/lib/symbolMap.ts";
import { assertManifest, readLinesSync } from "./sweepStats.ts";

const BASELINE =
  "confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1";
const MIN_FILLED = 30;

type Acc = { n: number; sum: number; sumSq: number };
const empty = (): Acc => ({ n: 0, sum: 0, sumSq: 0 });

function stats(acc: Acc) {
  if (acc.n < MIN_FILLED) {
    return { ci95Lower: null, ci95Upper: null, expectancy: null, n: acc.n, se: null };
  }
  const expectancy = acc.sum / acc.n;
  const variance = Math.max(
    0,
    (acc.sumSq - acc.sum * acc.sum / acc.n) / (acc.n - 1),
  );
  const se = Math.sqrt(variance / acc.n);
  return {
    ci95Lower: expectancy - 1.96 * se,
    ci95Upper: expectancy + 1.96 * se,
    expectancy,
    n: acc.n,
    se,
  };
}

function spansFrom(paths: string[]) {
  const spans = new Map<string, { first: number; last: number }>();
  for (const path of paths) {
    const manifest = JSON.parse(
      readFileSync(`${path}.manifest.json`, "utf8"),
    ) as {
      symbols: Array<{
        symbol: string;
        series?: Record<
          string,
          { count?: number; firstTime?: number; lastTime?: number; largestGapMs?: number }
        >;
      }>;
    };
    for (const entry of manifest.symbols) {
      const series = entry.series?.["15min"];
      if (
        !Number.isFinite(series?.firstTime) || !Number.isFinite(series?.lastTime)
      ) continue;
      const current = spans.get(entry.symbol);
      spans.set(entry.symbol, {
        first: Math.min(current?.first ?? Infinity, series!.firstTime!),
        last: Math.max(current?.last ?? -Infinity, series!.lastTime!),
      });
    }
  }
  return spans;
}

/** Every cell's per-fold accumulation, so a market's ALTERNATIVES are visible too. */
function collect(
  paths: string[],
  spans: Map<string, { first: number; last: number }>,
  thresholdOf: (symbol: string) => number,
) {
  const byMarket = new Map<string, Map<string, { confirm: Acc; select: Acc }>>();
  for (const path of paths) {
    // R0: the one-clock door — a corpus that cannot state its clock (or
    // whose witnesses condemn it) is refused here too, not only in the
    // aggregation readers. These five scripts produced the invalidated
    // 4d-era figures by reading emits bare.
    assertManifest(path);
    readLinesSync(path, (line) => {
      if (!line) return;
      const row = JSON.parse(line) as {
        accepted?: boolean;
        confidenceScore?: number;
        exitAtMs?: number;
        outcome?: string;
        realizedR?: number;
        symbol?: string;
        time?: number;
        variant?: string;
      };
      const symbol = row.symbol;
      if (!symbol || row.accepted !== true || row.outcome === "unfilled") return;
      const span = spans.get(symbol);
      const time = Number(row.time);
      const r = Number(row.realizedR);
      if (!span || !Number.isFinite(time) || !Number.isFinite(r)) return;
      let variant = row.variant ?? "baseline";
      // The grid opened the confidence gate; the SHIPPED engine gates at
      // the market's own threshold, so the baseline cell is read the way
      // production actually reads it and recorded under its own name.
      if (variant === BASELINE || variant === "baseline") {
        const score = Number(row.confidenceScore);
        if (Number.isFinite(score) && score >= thresholdOf(symbol)) {
          variant = "SHIPPED (baseline at class threshold)";
        }
      }
      const fitEnd = span.first + (span.last - span.first) * 0.5;
      const selectEnd = span.first + (span.last - span.first) * 0.75;
      if (!byMarket.has(symbol)) byMarket.set(symbol, new Map());
      const cells = byMarket.get(symbol)!;
      if (!cells.has(variant)) {
        cells.set(variant, { confirm: empty(), select: empty() });
      }
      const cell = cells.get(variant)!;
      const exit = Number(row.exitAtMs);
      if (time >= fitEnd && time < selectEnd) {
        if (Number.isFinite(exit) && exit > selectEnd) return;
        cell.select.n += 1;
        cell.select.sum += r;
        cell.select.sumSq += r * r;
      } else if (time >= selectEnd) {
        cell.confirm.n += 1;
        cell.confirm.sum += r;
        cell.confirm.sumSq += r * r;
      }
    });
  }
  return byMarket;
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const netPaths = (flag("net") ?? "").split(",").filter(Boolean);
  const grossPaths = (flag("gross") ?? "").split(",").filter(Boolean);
  const outPath = flag("out") ??
    "docs/research/market-review-2026-08-11/dossiers.json";
  const picksDir = "docs/research/baseline-2026-08-10";

  const derived = new Map<string, { variant: string; tranche: string }>();
  const tranches: Array<[string, string, string]> = [
    ["tuning", "4d-final-picks.json", "4d-confirm-read.json"],
    ["holdout", "4d-holdout-final-picks.json", "4d-holdout-confirm-read.json"],
    ["totality", "4d-totality-final-picks.json", "4d-totality-confirm-read.json"],
  ];
  const trancheHistory = new Map<string, string[]>();
  for (const [tranche, picksFile, confirmFile] of tranches) {
    const picks = JSON.parse(readFileSync(`${picksDir}/${picksFile}`, "utf8")) as {
      capacityGated?: string[];
      finalPicks: Record<string, { variant: string; feasibleLines: string[] }>;
    };
    const confirm = JSON.parse(
      readFileSync(`${picksDir}/${confirmFile}`, "utf8"),
    ) as { confirmReport: Record<string, { confirmTotalDelta: number | null }> };
    for (const [symbol, row] of Object.entries(confirm.confirmReport)) {
      const note = (row.confirmTotalDelta ?? 0) > 0
        ? `${tranche}: confirmed (Δ ${row.confirmTotalDelta?.toFixed(1)})`
        : `${tranche}: confirm-REFUSED (Δ ${row.confirmTotalDelta?.toFixed(1)})`;
      trancheHistory.set(symbol, [...(trancheHistory.get(symbol) ?? []), note]);
      if ((row.confirmTotalDelta ?? 0) > 0) {
        derived.set(symbol, { tranche, variant: picks.finalPicks[symbol].variant });
      }
    }
    for (const symbol of picks.capacityGated ?? []) {
      trancheHistory.set(symbol, [
        ...(trancheHistory.get(symbol) ?? []),
        `${tranche}: capacity-gated`,
      ]);
    }
  }

  const thresholdOf = (symbol: string) =>
    getCategoryCalibration(symbol).confidenceThreshold;
  const netSpans = spansFrom(netPaths);
  const net = collect(netPaths, netSpans, thresholdOf);
  const gross = grossPaths.length > 0
    ? collect(grossPaths, spansFrom(grossPaths), thresholdOf)
    : new Map();

  const menuBySymbol = new Map(SECURITY_OPTIONS.map((o) => [o.symbol, o]));
  const population = [
    ...new Set([...defaultScanSymbols, ...contractSizeVariants]),
  ].sort();

  const dossiers: Record<string, unknown> = {};
  for (const symbol of population) {
    const assetType = getAssetType(symbol);
    const effective = getCategoryCalibration(symbol);
    const classRow = getClassCalibration(assetType);
    // Provenance per field: what this market actually runs, and whether
    // anything ever derived it FOR this market.
    const provenance: Record<string, string> = {};
    for (const key of Object.keys(effective) as Array<keyof typeof effective>) {
      const own = effective[key];
      const inherited = classRow[key];
      provenance[key] = JSON.stringify(own) === JSON.stringify(inherited)
        ? `inherited from class '${assetType}'`
        : "set for THIS market (derived cell or legacy override)";
    }
    const cell = derived.get(symbol);
    const effectiveVariant = cell?.variant ??
      "SHIPPED (baseline at class threshold)";
    const netCells = net.get(symbol);
    const grossCells = gross.get(symbol);
    const readCell = (
      source: Map<string, { confirm: Acc; select: Acc }> | undefined,
      variant: string,
    ) => {
      const found = source?.get(variant);
      return {
        confirm: stats(found?.confirm ?? empty()),
        select: stats(found?.select ?? empty()),
      };
    };
    // Every alternative cell this market was measured under, best first
    // by confirm expectancy — so "was a better configuration available?"
    // is answerable per market instead of assumed.
    const alternatives = [...(netCells?.entries() ?? [])]
      .map(([variant, cells]) => ({
        confirm: stats(cells.confirm),
        select: stats(cells.select),
        variant,
      }))
      .filter((row) => row.confirm.expectancy !== null)
      .sort((a, b) => (b.confirm.expectancy ?? 0) - (a.confirm.expectancy ?? 0));

    const spec = getFuturesContractSpec(symbol);
    const span = netSpans.get(symbol);
    dossiers[symbol] = {
      alternatives: alternatives.slice(0, 5),
      assetType,
      correlation: {
        primaryGroup: getCorrelationGroup(symbol),
        sharesExposureWith: getCorrelatedSymbols(symbol),
      },
      dataSpan: span
        ? {
          days: Math.round((span.last - span.first) / 86_400_000),
          firstIso: new Date(span.first).toISOString().slice(0, 10),
          lastIso: new Date(span.last).toISOString().slice(0, 10),
        }
        : null,
      effectiveCalibration: effective,
      engineDeclined: symbol in ENGINE_DECLINED_MARKETS
        ? ENGINE_DECLINED_MARKETS[symbol]
        : null,
      fmpSource: menuBySymbol.get(symbol)?.fmpSymbol ?? null,
      grossMeasurement: readCell(grossCells, effectiveVariant),
      isContractSizeVariant: contractSizeVariants.has(symbol),
      label: menuBySymbol.get(symbol)?.label ?? null,
      netMeasurement: readCell(netCells, effectiveVariant),
      offered: defaultScanSymbols.includes(symbol),
      provenance,
      tickSpec: spec ?? null,
      trancheHistory: trancheHistory.get(symbol) ?? [],
      effectiveVariant,
    };
  }

  writeFileSync(outPath, JSON.stringify({ dossiers }, null, 2) + "\n");
  const inheritedOnly = Object.values(dossiers).filter((d) => {
    const p = (d as { provenance: Record<string, string> }).provenance;
    return Object.values(p).every((value) => value.startsWith("inherited"));
  }).length;
  console.log(
    `dossiers: ${population.length} markets -> ${outPath} ` +
      `(${inheritedOnly} run entirely inherited calibration)`,
  );
}

main();
