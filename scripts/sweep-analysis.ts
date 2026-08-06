// The refinement cycle's analysis pass (owner mandate, 2026-08-05: the sweep
// reshapes the engine where the findings support it, not merely observes).
// Reads replay-sweep.ts's --emit JSONL and prints the tables a calibration
// ruling is made from. Analysis only: it never writes engine values, and every
// table states its own sample size so a thin cell can never read as a finding.
//
// Usage:
//   npx tsx scripts/sweep-analysis.ts --emit path/setups.jsonl [--min-n 30]
//
// The bands are the live thresholds of record (supabase/functions/
// trade-analyzer/calibration.ts): crypto 82 · energies 69 · forex 40 ·
// futures 68 · indices 68 · metals 90. Every curve below is printed against
// them so a proposed change is a delta from the resting state, never a number
// arriving from nowhere.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";

type Row = {
  accepted: boolean;
  confidenceScore: number;
  cotStance: string | null;
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

const LIVE_THRESHOLDS: Record<string, number> = {
  crypto: 82,
  energies: 69,
  forex: 40,
  futures: 68,
  indices: 68,
  metals: 90,
};

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

type Stats = {
  n: number;
  filled: number;
  tp1: number;
  stopped: number;
  ambiguous: number;
  rSum: number;
};

function emptyStats(): Stats {
  return { ambiguous: 0, filled: 0, n: 0, rSum: 0, stopped: 0, tp1: 0 };
}

// Mirrors summarizeSweepOutcomes (supabase/functions/trade-analyzer/sweep.ts)
// field for field, deliberately: an analysis that computes its own rates can
// drift from the engine's, and this one did — a first cut classified wins by
// regex (/tp1|target/), which silently dropped every `take_profit` (the
// biggest wins) and divided by all rows instead of filled ones, understating
// every hit rate and diluting expectancy with the unfilled rows' realizedR of
// 0. The engine's vocabulary is the authority: filled = outcome !== unfilled;
// a win is take_profit OR tp1_partial; a stop is stop_loss; expectancy is the
// mean realizedR OVER FILLED. `ambiguous` is reported in its own column
// rather than folded anywhere, because a run the simulator could not resolve
// is neither a win nor a loss and hiding it inside a denominator would be the
// same class of error.
function add(stats: Stats, row: Row): void {
  stats.n += 1;
  if (row.outcome === "unfilled") {
    return;
  }
  stats.filled += 1;
  stats.rSum += typeof row.realizedR === "number" && Number.isFinite(row.realizedR)
    ? row.realizedR
    : 0;
  if (row.outcome === "take_profit" || row.outcome === "tp1_partial") {
    stats.tp1 += 1;
  }
  if (row.outcome === "stop_loss") {
    stats.stopped += 1;
  }
  if (row.outcome === "ambiguous") {
    stats.ambiguous += 1;
  }
}

function rate(part: number, whole: number): string {
  return whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)}%`;
}

function expectancy(stats: Stats): string {
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

  // Streamed, and narrowed to the fields the tables use: the 2026-08-05 run
  // emitted 672,739 records (505 MB), where a readFileSync + split would hold
  // the whole file, an array of every line, AND every parsed object at once.
  // One pass, compact records, no ceiling worth worrying about.
  const rows: Row[] = [];
  const reader = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(emitPath),
  });
  for await (const line of reader) {
    if (line.trim().length === 0) {
      continue;
    }
    const parsed = JSON.parse(line) as Row;
    rows.push({
      accepted: parsed.accepted,
      confidenceScore: parsed.confidenceScore,
      cotStance: parsed.cotStance,
      newsPenalty: parsed.newsPenalty,
      outcome: parsed.outcome,
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
        String(LIVE_THRESHOLDS[name] ?? "—"),
        String(cell.accepted.n),
        rate(cell.accepted.tp1, cell.accepted.filled),
        rate(cell.accepted.stopped, cell.accepted.filled),
        expectancy(cell.accepted),
        String(cell.all.n),
        rate(cell.all.tp1, cell.all.filled),
        expectancy(cell.all),
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
    const live = LIVE_THRESHOLDS[className] ?? 0;
    table(
      `${className} — confidence reliability (5-point buckets; * marks the live threshold's bucket, ! marks n < ${minN})`,
      ["band", "n", "tp1", "stop", "unfilled", "expR", "flag"],
      [...buckets.entries()]
        .sort(([a], [b]) => a - b)
        .map(([bucket, stats]) => [
          `${bucket}-${bucket + 4}`,
          String(stats.n),
          rate(stats.tp1, stats.filled),
          rate(stats.stopped, stats.filled),
          rate(stats.n - stats.filled, stats.n),
          expectancy(stats),
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
        const live = LIVE_THRESHOLDS[className] ?? 0;
        return [
          String(threshold),
          String(stats.n),
          rate(stats.tp1, stats.filled),
          rate(stats.stopped, stats.filled),
          expectancy(stats),
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
        rate(cell.accepted.tp1, cell.accepted.filled),
        expectancy(cell.accepted),
        String(cell.all.n),
        expectancy(cell.all),
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
          rate(stats.tp1, stats.filled),
          rate(stats.stopped, stats.filled),
          expectancy(stats),
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
        rate(stats.tp1, stats.filled),
        expectancy(stats),
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
