// The refinement cycle's analysis pass (owner mandate, 2026-08-05: the sweep
// reshapes the engine where the findings support it, not merely observes).
// Reads replay-sweep.ts's --emit JSONL and prints the tables a calibration
// ruling is made from. Analysis only: it never writes engine values, and every
// table states its own sample size so a thin cell can never read as a finding.
//
// Usage:
//   npx tsx scripts/sweep-analysis.ts --emit path/setups.jsonl [--min-n 30]
//
// The bands are the live thresholds of record, DERIVED at runtime from
// calibration.ts — a hardcoded copy of them sat here through three
// generations of threshold changes, presenting a retired resting state as
// current. Every curve below is printed against the live values so a
// proposed change is a delta from the actual resting state, never a number
// arriving from nowhere. Stats arithmetic is scripts/sweepStats.ts — the
// one vocabulary (item 3) — and the emit enters through the streaming
// manifest door (2i): hash verified before a single row is read.
import {
  getAssetType,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  addOutcome,
  assertManifestedCorpusStreaming,
  emptyStats,
  type SweepEmitRow,
  type SweepStats,
  vocabularyRow,
} from "./sweepStats.ts";

type Row = {
  accepted: boolean;
  holdout?: boolean;
  confidenceScore: number;
  cotStance: string | null;
  // R1b's per-row facts (#364 round 6, finding 1): the marker rides via
  // vocabularyRow in the projection below; the two macro fields are
  // carried so this file CAN read them — a closed projection had
  // silently dropped all three.
  macroAdjustment?: number;
  macroStance?: string;
  noBarsInReviewWindow?: true;
  newsPenalty: number;
  outcome: string;
  realizedR: number | null;
  regime: string;
  rewardRisk: number;
  sessionLabel: string;
  sessionPenalty: number;
  side: string;
  split: string;
  stopProvenance: string;
  symbol: string;
  time: number;
  variant: string;
};

// One representative roster symbol per class — only a key into
// getCategoryCalibration, never a source of numbers. The thresholds
// printed are whatever calibration.ts holds the moment this runs.
const CLASS_REPRESENTATIVE: Record<string, string> = {
  agriculture: "ZCUSX",
  crypto: "BTCUSD",
  energies: "WTI",
  forex: "EURUSD",
  futures: "ESUSD",
  indices: "SP",
  livestock: "LEUSX",
  metals: "XAUUSD",
};

function liveThreshold(className: string): number | null {
  const representative = CLASS_REPRESENTATIVE[className];
  return representative
    ? getCategoryCalibration(representative).confidenceThreshold
    : null;
}

// The ten markets Phase 5 made sizeable for the first time (29 -> 39 on the
// three full forex lines). Their curves have never existed before this run,
// which is the whole reason the owner reopened the calibration arc.
const NEWLY_SIZEABLE = new Set([
  "XAGUSD",
  "WTI",
  "BRENT",
  "BTCUSD",
  "ETHUSD",
  "XRPUSD",
  "SOLUSD",
  "ADAUSD",
  "DOGEUSD",
  "LTCUSD",
  "BCHUSD",
]);

// The engine's own classifier, not a second copy of the map: getAssetType is
// what calibration.ts uses to pick a class's thresholds at runtime, so every
// table below buckets exactly the way the live gate does.
function classOf(symbol: string): string {
  return getAssetType(symbol);
}

// The stats arithmetic lives in scripts/sweepStats.ts now — this file's
// own private copy is where the drift this comment used to record actually
// happened (regex-classified wins, all-rows denominators), and item 3's
// unification exists so it cannot happen a second time. `ambiguous` stays
// its own column because a run the simulator could not resolve is neither
// a win nor a loss, and hiding it inside a denominator is the same class
// of error the regex was.
type Stats = SweepStats;

function add(stats: Stats, row: Row): void {
  // The RAW row rides through (#364 round 5, finding 1): a rebuilt
  // three-field row stripped noBarsInReviewWindow, so this reader — the
  // one whose historical all-rows denominator is the reason sweepStats
  // exists — kept blending provider absence into the market verdict
  // after round 4 partitioned it. Spreading the row makes the omission
  // impossible for future marker fields too; only realizedR is coerced.
  addOutcome(stats, {
    ...row,
    realizedR: typeof row.realizedR === "number" ? row.realizedR : Number.NaN,
  } as SweepEmitRow);
}

function rate(part: number, whole: number): string {
  return whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)}%`;
}

function expectancyLabel(stats: Stats): string {
  return stats.filled === 0 ? "—" : (stats.rSum / stats.filled).toFixed(3);
}

function table(title: string, header: string[], rows: string[][]): void {
  console.log(`\n## ${title}`);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) {
    console.log(line(row));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const emitPath = args[args.indexOf("--emit") + 1];
  const minNIndex = args.indexOf("--min-n");
  const minN = minNIndex === -1 ? 30 : Number(args[minNIndex + 1]);
  if (!emitPath || emitPath.startsWith("--")) {
    console.error("Usage: npx tsx scripts/sweep-analysis.ts --emit path.jsonl");
    process.exit(1);
  }

  // Streamed through the manifest door (2i), and narrowed to the fields the
  // tables use: the 2026-08-05 run emitted 672,739 records (505 MB), where a
  // readFileSync + split would hold the whole file, an array of every line,
  // AND every parsed object at once. The hash verifies before the first row;
  // holdout markets (3e) never enter a tuning table.
  const rows: Row[] = [];
  let holdoutSkipped = 0;
  await assertManifestedCorpusStreaming(emitPath, (raw) => {
    const parsed = raw as unknown as Row;
    if (parsed.holdout === true) {
      holdoutSkipped += 1;
      return;
    }
    // The vocabulary's own projection rides first (#364 round 6,
    // finding 1): a field the partition reads can no longer be dropped
    // by this narrowing — round 5 fixed the add() call while THIS push
    // was the layer that stripped the marker. The narrowing itself
    // stays: it exists for the 505 MB corpus.
    rows.push({
      ...vocabularyRow(raw),
      accepted: parsed.accepted,
      confidenceScore: parsed.confidenceScore,
      cotStance: parsed.cotStance,
      macroAdjustment: parsed.macroAdjustment,
      macroStance: parsed.macroStance,
      newsPenalty: parsed.newsPenalty,
      realizedR: parsed.realizedR,
      regime: parsed.regime,
      rewardRisk: parsed.rewardRisk,
      sessionLabel: parsed.sessionLabel,
      sessionPenalty: parsed.sessionPenalty,
      side: parsed.side,
      split: parsed.split,
      stopProvenance: parsed.stopProvenance,
      symbol: parsed.symbol,
      time: parsed.time,
      variant: parsed.variant,
    });
  });
  if (holdoutSkipped > 0) {
    console.log(`(holdout markets excluded: ${holdoutSkipped} rows)`);
  }

  console.log(`# Sweep analysis — ${rows.length} evaluated setups`);
  console.log(`Emit: ${emitPath} · min-n for a reportable cell: ${minN}`);
  const splits = [...new Set(rows.map((row) => row.split))];
  const variants = [...new Set(rows.map((row) => row.variant))];
  console.log(`Splits: ${splits.join(", ")} · variants: ${variants.join(", ")}`);

  // ---------------------------------------------------------------- per class
  const byClass = new Map<string, { all: Stats; accepted: Stats }>();
  for (const row of rows) {
    const key = classOf(row.symbol);
    if (!byClass.has(key)) {
      byClass.set(key, { accepted: emptyStats(), all: emptyStats() });
    }
    const cell = byClass.get(key)!;
    add(cell.all, row);
    if (row.accepted) {
      add(cell.accepted, row);
    }
  }
  table(
    "Per class — accepted setups (the engine's own live gate) vs every evaluated decision",
    ["class", "live thr", "acc n", "acc tp1", "acc stop", "acc expR", "all n", "all tp1", "all expR"],
    [...byClass.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, cell]) => [
        name,
        String(liveThreshold(name) ?? "—"),
        String(cell.accepted.n),
        rate(cell.accepted.wins, cell.accepted.filled),
        rate(cell.accepted.stops, cell.accepted.filled),
        expectancyLabel(cell.accepted),
        String(cell.all.n),
        rate(cell.all.wins, cell.all.filled),
        expectancyLabel(cell.all),
      ]),
  );

  // ------------------------------------------------- confidence reliability
  // The calibration mirror: 5-point buckets over EVERY evaluated decision
  // (--capture-all is what makes the below-threshold half visible), so the
  // curve shows what a threshold move would actually buy or cost.
  for (const className of [...byClass.keys()].sort()) {
    const classRows = rows.filter((row) => classOf(row.symbol) === className);
    const buckets = new Map<number, Stats>();
    for (const row of classRows) {
      const bucket = Math.floor(row.confidenceScore / 5) * 5;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, emptyStats());
      }
      add(buckets.get(bucket)!, row);
    }
    const live = liveThreshold(className) ?? 0;
    table(
      `${className} — confidence reliability (5-point buckets; * marks the live threshold's bucket, ! marks n < ${minN})`,
      ["band", "n", "tp1", "stop", "unfilled", "dataAbs", "expR", "flag"],
      [...buckets.entries()]
        .sort(([a], [b]) => a - b)
        .map(([bucket, stats]) => [
          `${bucket}-${bucket + 4}`,
          String(stats.n),
          rate(stats.wins, stats.filled),
          rate(stats.stops, stats.filled),
          rate(stats.n - stats.filled, stats.n),
          String(stats.dataAbsent),
          expectancyLabel(stats),
          `${bucket <= live && live <= bucket + 4 ? "*" : ""}${stats.n < minN ? "!" : ""}`,
        ]),
    );
  }

  // ------------------------------------------------ threshold sensitivity
  // What the class would have produced at each candidate threshold: the
  // acceptance count is the cost side (fewer setups), expectancy the benefit
  // side. A move only earns its keep if expectancy rises without starving
  // the class of setups.
  const candidates = [35, 40, 45, 50, 55, 60, 65, 68, 70, 75, 80, 82, 85, 90, 95];
  for (const className of [...byClass.keys()].sort()) {
    const classRows = rows.filter((row) => classOf(row.symbol) === className);
    table(
      `${className} — threshold sensitivity (all evaluated decisions at or above each candidate)`,
      ["thr", "n", "tp1", "stop", "expR", "flag"],
      candidates.map((threshold) => {
        const stats = emptyStats();
        for (const row of classRows) {
          if (row.confidenceScore >= threshold) {
            add(stats, row);
          }
        }
        const live = liveThreshold(className) ?? 0;
        return [
          String(threshold),
          String(stats.n),
          rate(stats.wins, stats.filled),
          rate(stats.stops, stats.filled),
          expectancyLabel(stats),
          `${threshold === live ? "* live" : ""}${stats.n < minN ? " !" : ""}`,
        ];
      }),
    );
  }

  // ------------------------------------------------------- per symbol
  const bySymbol = new Map<string, { all: Stats; accepted: Stats }>();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) {
      bySymbol.set(row.symbol, { accepted: emptyStats(), all: emptyStats() });
    }
    const cell = bySymbol.get(row.symbol)!;
    add(cell.all, row);
    if (row.accepted) {
      add(cell.accepted, row);
    }
  }
  table(
    "Per symbol (NEW marks a market Phase 5 made sizeable for the first time)",
    ["symbol", "class", "acc n", "acc tp1", "acc expR", "all n", "all expR", "flag"],
    [...bySymbol.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([symbol, cell]) => [
        symbol,
        classOf(symbol),
        String(cell.accepted.n),
        rate(cell.accepted.wins, cell.accepted.filled),
        expectancyLabel(cell.accepted),
        String(cell.all.n),
        expectancyLabel(cell.all),
        `${NEWLY_SIZEABLE.has(symbol) ? "NEW " : ""}${cell.accepted.n < minN ? "!" : ""}`,
      ]),
  );

  // ------------------------------------- the existing levers, re-measured
  for (const [label, keyOf] of [
    ["regime", (row: Row) => row.regime],
    ["session", (row: Row) => row.sessionLabel],
    ["stop provenance", (row: Row) => row.stopProvenance],
    ["COT stance", (row: Row) => row.cotStance ?? "none"],
    ["news penalty", (row: Row) => (row.newsPenalty > 0 ? "penalized" : "clear")],
  ] as Array<[string, (row: Row) => string]>) {
    const buckets = new Map<string, Stats>();
    for (const row of rows) {
      if (!row.accepted) {
        continue;
      }
      const key = keyOf(row);
      if (!buckets.has(key)) {
        buckets.set(key, emptyStats());
      }
      add(buckets.get(key)!, row);
    }
    table(
      `${label} — accepted setups only (the lever's own re-measurement)`,
      [label, "n", "tp1", "stop", "expR", "flag"],
      [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, stats]) => [
          key,
          String(stats.n),
          rate(stats.wins, stats.filled),
          rate(stats.stops, stats.filled),
          expectancyLabel(stats),
          stats.n < minN ? "!" : "",
        ]),
    );
  }

  // --------------------------------------------- walk-forward honesty
  // Every candidate ruling must hold on BOTH splits or it is curve-fitting.
  // This table is the acceptance test for anything the analysis proposes.
  const bySplit = new Map<string, Map<string, Stats>>();
  for (const row of rows) {
    if (!row.accepted) {
      continue;
    }
    const className = classOf(row.symbol);
    if (!bySplit.has(className)) {
      bySplit.set(className, new Map());
    }
    const splitMap = bySplit.get(className)!;
    if (!splitMap.has(row.split)) {
      splitMap.set(row.split, emptyStats());
    }
    add(splitMap.get(row.split)!, row);
  }
  const splitRows: string[][] = [];
  for (const [className, splitMap] of [...bySplit.entries()].sort()) {
    for (const [split, stats] of [...splitMap.entries()].sort()) {
      splitRows.push([
        className,
        split,
        String(stats.n),
        rate(stats.wins, stats.filled),
        expectancyLabel(stats),
        stats.n < minN ? "!" : "",
      ]);
    }
  }
  table(
    "Walk-forward split agreement — a candidate that holds on one split only is curve-fitting",
    ["class", "split", "n", "tp1", "expR", "flag"],
    splitRows,
  );
}

await main();
