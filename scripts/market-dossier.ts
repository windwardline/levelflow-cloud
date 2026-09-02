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
// THE CONFIRM FOLD IS SEALED AT THE DOOR (R4 act 1, 2026-09-02): the corpus
// is read through the sealed door and each row is classified by its EMITTED
// split against the manifest's fold vocabulary — this reader used to re-cut
// folds at 50%/75% of each market's span and rank alternatives by a
// "confirm" expectancy nobody ledgered. It reads the select tuning fold, and
// the only confirm figures it carries are the RECORDED reads
// (`4d-*-confirm-read.json`), as the tranche notes it already carried.
//
//   npx tsx scripts/market-dossier.ts --net <shards> --gross <shards> \
//     --out docs/research/market-review-2026-08-11/dossiers.json
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
import {
  assertManifest,
  assertManifestedCorpusSync,
  SEALED_FOLD,
  tuningFolds,
} from "./sweepStats.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";
import { flagReader } from "./flagReader.ts";

const BASELINE =
  "confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1";
const MIN_FILLED = 30;

/**
 * What the re-gated pinned cell actually is (#364 round 50, finding 3).
 *
 * It was called "SHIPPED (baseline at class threshold)", which claimed
 * the cell is what the market runs. The pin fixes FOUR parameters and
 * the re-gate undoes only `confidenceThreshold`, so the claim held only
 * where the market's other three matched — and it is not checkable at
 * all: the manifest records each symbol's calibration as a HASH, so the
 * values in force when the corpus was swept cannot be recovered from
 * it, and comparing against the current build instead answers a
 * different question. Round 49 suppressed the cell on a
 * current-calibration comparison, which blanks essentially the whole
 * roster once 4d picks ship; that fix was worse than the defect. The
 * name now says what the cell is rather than asserting what it
 * represents, and the divergence from the current calibration rides
 * each dossier row as a stated caveat.
 */
export const RECONSTRUCTED = "PINNED BASELINE re-gated at this market's threshold";

export type Acc = { n: number; sum: number; sumSq: number };
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

/**
 * Which of the pinned cell's other parameters this market does not ship.
 *
 * The pinned grid cell fixes four values and the re-gate undoes only
 * `confidenceThreshold` (#364 round 49, finding 3), so the other three
 * are compared against what the market actually runs. Exported and at
 * module scope (#364 round 50, smaller) so the REAL closure — the one
 * that decides metals diverges, which is the entire motivating case —
 * is under executed coverage rather than only the injected stand-in.
 *
 * It reads the CURRENT build's calibration, which is what the dossier
 * says on the row: a class threshold or stop cap changed after the
 * sweep re-labels a published cell, and R2 and R4 move these by design.
 */
export function pinDivergence(
  shipped: {
    maxStopAtrMultiplier?: number;
    runnerProtection?: string;
    sizingHoursFactor?: number;
  },
): string[] {
  const differing: string[] = [];
  if ((shipped.maxStopAtrMultiplier ?? 1) !== 1) {
    differing.push(
      `maxStopAtrMultiplier=${shipped.maxStopAtrMultiplier} (pin 1)`,
    );
  }
  if ((shipped.runnerProtection ?? "breakeven") !== "breakeven") {
    differing.push(
      `runnerProtection=${shipped.runnerProtection} (pin breakeven)`,
    );
  }
  // The `?? 1` STAYS here, unlike the engine's, and the difference is the
  // input. pricePlan reads the live calibration table, where every class row
  // now states the value and absence is a type error. This reads a
  // calibration RECORDED IN A CORPUS — including corpora written before the
  // field existed, where the key is genuinely absent and 1 is genuinely what
  // ran. Removing the fallback here would report every legacy market as
  // diverging from a pin it actually matched.
  if ((shipped.sizingHoursFactor ?? 1) !== 1) {
    differing.push(`sizingHoursFactor=${shipped.sizingHoursFactor} (pin 1)`);
  }
  return differing;
}

/** Per market, per cell: the select-fold accumulation, plus what the door did. */
export type Collected = {
  byMarket: Map<string, Map<string, { select: Acc }>>;
  folds: { fit: string; select: string };
  rows: { fit: number; sealed: number; select: number };
};

/**
 * Every cell's SELECT-fold accumulation, so a market's ALTERNATIVES are
 * visible too. Rows are classified by the split the SWEEP emitted against
 * the manifest's fold vocabulary (`tuningFolds`): fit is dropped, select is
 * kept, and a split this reader cannot name is refused rather than skipped.
 * Confirm rows never arrive — the door withholds them and counts them.
 */
export function collect(
  paths: string[],
  thresholdOf: (symbol: string) => number,
): Collected {
  const byMarket = new Map<string, Map<string, { select: Acc }>>();
  const rows = { fit: 0, sealed: 0, select: 0 };
  let folds: { fit: string; select: string } | undefined;
  for (const path of paths) {
    // R0: the one-clock door — a corpus that cannot state its clock (or
    // whose witnesses condemn it) is refused here too, not only in the
    // aggregation readers. The manifest half is opened first for its fold
    // vocabulary, so every row is classified as it streams; the row door
    // below verifies the same manifest again before it hands over a line,
    // which costs one hash and keeps the door the only source of rows.
    const manifest = assertManifest(path);
    const named = tuningFolds(manifest);
    if (folds === undefined) {
      folds = named;
    } else if (folds.fit !== named.fit || folds.select !== named.select) {
      throw new Error(
        `market-dossier: ${path} names its tuning folds ` +
          `${named.fit}/${named.select} while the first shard named ` +
          `${folds.fit}/${folds.select} — a legacy two-split shard and a ` +
          `folded one are two measurements and cannot be pooled as one.`,
      );
    }
    const vocabulary = folds;
    const read = assertManifestedCorpusSync(path, (row) => {
      const symbol = row.symbol;
      if (!symbol) return;
      // Classified by the split the sweep EMITTED, never by where the row's
      // time falls in the span. A fold this reader cannot name is refused,
      // not skipped; the sealed fold never arrives.
      const split = String(row.split);
      if (split === vocabulary.fit) {
        rows.fit += 1;
        return;
      }
      if (split !== vocabulary.select) {
        throw new Error(
          `market-dossier: ${path}: ${symbol} carries a row in split ` +
            `"${split}", which this reader does not know. It reads the ` +
            `"${vocabulary.select}" fold and drops "${vocabulary.fit}"; the ` +
            `"${SEALED_FOLD}" fold is sealed at the door. A fold this reader ` +
            `cannot name is refused, not skipped.`,
        );
      }
      rows.select += 1;
      if (row.accepted !== true || row.outcome === "unfilled") return;
      const r = Number(row.realizedR);
      if (!Number.isFinite(r)) return;
      let variant = typeof row.variant === "string" ? row.variant : "baseline";
      // The grid's PINNED threshold-0 cell opened the confidence gate;
      // the SHIPPED engine gates at the market's own threshold, so that
      // cell — and only that cell — is re-read the way production reads
      // it, under the name RECONSTRUCTED.
      //
      // The bare-baseline cell (grid entry `{}`) must NOT join it. `{}`
      // applies no override, so the engine already gated those rows at
      // the market's shipped threshold: they are the SAME decision
      // points this branch reconstructs from the threshold-0 cell, and
      // folding both into one accumulator counted every outcome TWICE.
      // stats() then computed n, expectancy, se and the 95% interval
      // over the duplicated sample — se understated by a factor of √2,
      // so every published interval was about 29% narrower than the
      // data supports, and markets below the MIN_FILLED floor cleared
      // it on a doubled n. The signature in the shipped
      // docs/research/market-review-2026-08-11/dossiers-net.json is
      // conclusive: all 48 non-zero n on this pseudo-cell are EVEN,
      // against 82 even / 62 odd across every other variant.
      //
      // The re-gate is UNCONDITIONAL (#364 round 51, finding 2). Round
      // 49 gated it on the market's other three pinned parameters
      // matching and this comment described that rule; round 50 removed
      // the condition, because divergence is the norm once 4d picks
      // ship and suppressing on it blanked the roster. The mislabelling
      // that rule existed to prevent is closed by the NAME instead —
      // RECONSTRUCTED does not claim to be what the market runs — and
      // the divergence rides the dossier row as a stated caveat, on
      // reconstruction rows only. The record was corrected in the map
      // and this comment, one file away, was left saying the opposite.
      if (variant === BASELINE) {
        const score = Number(row.confidenceScore);
        if (Number.isFinite(score) && score >= thresholdOf(symbol)) {
          variant = RECONSTRUCTED;
        }
      }
      if (!byMarket.has(symbol)) byMarket.set(symbol, new Map());
      const cells = byMarket.get(symbol)!;
      if (!cells.has(variant)) {
        cells.set(variant, { select: empty() });
      }
      const cell = cells.get(variant)!.select;
      cell.n += 1;
      cell.sum += r;
      cell.sumSq += r * r;
    });
    rows.sealed += read.sealedRows;
  }
  if (folds === undefined) {
    throw new Error(
      "market-dossier: collect() was given no shard — a measurement over " +
        "zero rows cannot be written as one.",
    );
  }
  return { byMarket, folds, rows };
}

// The ONE declaration of which flags own the token after them — the
// form rounds 33-38 installed in the dialed readers, at the seventh
// (#364 round 49, finding 2). This file had a bare argv.indexOf: first
// occurrence only, no refusal for an undeclared flag, and no refusal for
// a missing or flag-shaped value.
const VALUE_FLAGS = new Set(["--net", "--gross", "--out"]);

function main() {
  const argv = process.argv.slice(2);
  const { str } = flagReader(argv, VALUE_FLAGS);
  const netPaths = (str("--net") ?? "").split(",").filter(Boolean);
  const grossPaths = (str("--gross") ?? "").split(",").filter(Boolean);
  const outPath = str("--out") ??
    "docs/research/market-review-2026-08-11/dossiers.json";
  // A run that measures nothing must not report a complete-looking
  // dossier (#364 round 49, finding 2) — the measured-nothing false
  // green rounds 20 and 33 closed in starvation-audit. With no net
  // corpus every market's measurement is null and the file still looked
  // like 97 reviewed markets, from the reader whose own header calls
  // itself the per-market review's factual spine.
  if (netPaths.length === 0) {
    throw new Error(
      "market-dossier: --net names the corpus this review rests on and " +
        "no shard was given, so every measurement would be null while " +
        "the artifact still listed every market. Pass --net " +
        "<shard.jsonl[,shard.jsonl...]>",
    );
  }
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
  const net = collect(netPaths, thresholdOf);
  const gross = grossPaths.length > 0 ? collect(grossPaths, thresholdOf) : null;
  if (
    gross !== null &&
    (gross.folds.fit !== net.folds.fit || gross.folds.select !== net.folds.select)
  ) {
    throw new Error(
      `market-dossier: the gross corpus names its tuning folds ` +
        `${gross.folds.fit}/${gross.folds.select} and the net corpus ` +
        `${net.folds.fit}/${net.folds.select} — one dossier cannot read two ` +
        `fold vocabularies as one measurement.`,
    );
  }

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
    // A market with no derived pick falls back to the reconstruction,
    // which is now named for what it is rather than for what it was
    // assumed to represent.
    const diverging = pinDivergence(effective);
    const effectiveVariant = cell?.variant ?? RECONSTRUCTED;
    const netCells = net.byMarket.get(symbol);
    const grossCells = gross?.byMarket.get(symbol);
    const readCell = (
      source: Map<string, { select: Acc }> | undefined,
      variant: string,
    ) => ({ select: stats(source?.get(variant)?.select ?? empty()) });
    // Every alternative cell this market was measured under, best first
    // by SELECT expectancy — so "was a better configuration available?"
    // is answerable per market instead of assumed. What a RECORDED confirm
    // read said about the pick rides trancheHistory; the fold itself is
    // sealed.
    const alternatives = [...(netCells?.entries() ?? [])]
      .map(([variant, cells]) => ({ select: stats(cells.select), variant }))
      .filter((row) => row.select.expectancy !== null)
      .sort((a, b) => (b.select.expectancy ?? 0) - (a.select.expectancy ?? 0));

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
      // The caveat rides ONLY the rows it applies to (#364 round 50,
      // finding 3). It exists for a market with no derived pick, whose
      // published measurement is read from the pinned cell while it runs
      // something else. For a market WITH a derived pick the same
      // divergence is the expected state — the pick is what set those
      // parameters — and the row's measurement comes from the derived
      // cell, not the pin. Emitting it on every row made one field carry
      // two opposite meanings and, since divergence is the norm, made it
      // non-null across nearly the whole roster: a constant, not a
      // caveat. Labelled with the calibration it was compared against
      // (the shape round 30 forced on the E8 report) — the current
      // build's, not the one in force at sweep time, which R2/R4 move.
      shippedCellPinDivergence:
        effectiveVariant === RECONSTRUCTED && diverging.length > 0
          ? { differsOn: diverging, comparedAgainst: "current calibration" }
          : null,
    };
  }

  writeResearchArtifact(outPath, {
    dossiers,
    folds: { dropped: net.folds.fit, judgedOn: net.folds.select, sealed: SEALED_FOLD },
    rows: { gross: gross?.rows ?? null, net: net.rows },
  });
  const inheritedOnly = Object.values(dossiers).filter((d) => {
    const p = (d as { provenance: Record<string, string> }).provenance;
    return Object.values(p).every((value) => value.startsWith("inherited"));
  }).length;
  console.log(
    `dossiers: ${population.length} markets on the ${net.folds.select} fold ` +
      `(${net.rows.sealed} ${SEALED_FOLD} rows withheld at the door) -> ${outPath} ` +
      `(${inheritedOnly} run entirely inherited calibration)`,
  );
}

// Run only as a binary, never on import — the grid-totalr pattern. Until
// now this file executed main() at import time, so the only coverage it
// could carry was a source pin, which is why a sample-doubling fold
// survived in a shipped reader. collect() is exported so the join it
// performs can be tested against a real two-cell corpus.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
