// Can a per-market confidence threshold rescue a confirmed-but-negative
// cell? (Owner mandate 2026-08-11: a positive outcome where one is
// reachable, data-derived backing where it is not.)
//
// The 4d gate measured IMPROVEMENT against a negative baseline, so a
// confirmed cell can still carry negative ABSOLUTE expectancy — 20 of
// the 72 shipped cells do. This reads the SAME corpus (no re-simulation)
// and, for each such market, walks its own confidence-score distribution
// looking for a threshold whose accepted stream is positive on BOTH the
// select and the confirm folds with enough sample to mean anything.
//
// The corpus was swept with --capture-all at confidenceThreshold=0, so
// every decision is present with its score; a threshold is a READ over
// rows already measured, not a new assumption.
//
//   npx tsx scripts/threshold-rescue.ts sweeps/4c/shard-*.jsonl \
//     --markets EGLDUSD,ZCUSX,... --out docs/research/.../4d-threshold-rescue.json
import { writeFileSync } from "node:fs";
import { readLinesSync } from "./sweepStats.ts";

const MIN_FILLED = 30; // the same floor the market-unit gate uses

type Bucket = { filled: number; sumR: number };

function expectancy(bucket: Bucket): number | null {
  return bucket.filled >= MIN_FILLED ? bucket.sumR / bucket.filled : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      index += 1;
      continue;
    }
    paths.push(argv[index]);
  }
  const flag = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const wanted = new Map<string, string>();
  for (const pair of (flag("markets") ?? "").split(";")) {
    const [symbol, variant] = pair.split("|");
    if (symbol && variant) wanted.set(symbol.trim(), variant.trim());
  }
  const outPath = flag("out") ??
    "docs/research/baseline-2026-08-10/4d-threshold-rescue.json";
  // Fold boundaries per market, exactly as the totality cycle cut them.
  const spans = new Map<string, { first: number; last: number }>();

  type Row = { score: number; r: number; time: number; filled: boolean };
  const rowsBySymbol = new Map<string, Row[]>();

  for (const path of paths) {
    readLinesSync(path, (line) => {
      if (!line) return;
      const row = JSON.parse(line) as {
        accepted?: boolean;
        confidenceScore?: number;
        outcome?: string;
        realizedR?: number;
        symbol?: string;
        time?: number;
        variant?: string;
      };
      const symbol = row.symbol;
      if (!symbol) return;
      const time = Number(row.time);
      if (Number.isFinite(time)) {
        const span = spans.get(symbol);
        spans.set(symbol, {
          first: Math.min(span?.first ?? Infinity, time),
          last: Math.max(span?.last ?? -Infinity, time),
        });
      }
      if (wanted.get(symbol) !== (row.variant ?? "baseline")) return;
      // The tradeable stream: the variant's own payoff/regime gates said
      // yes. The confidence gate was open (threshold 0), which is what
      // makes this a clean threshold read.
      if (row.accepted !== true) return;
      const score = Number(row.confidenceScore);
      const r = Number(row.realizedR);
      if (!Number.isFinite(score) || !Number.isFinite(r)) return;
      if (!rowsBySymbol.has(symbol)) rowsBySymbol.set(symbol, []);
      rowsBySymbol.get(symbol)!.push({
        filled: row.outcome !== "unfilled",
        r,
        score,
        time,
      });
    });
  }

  const report: Record<string, unknown> = {};
  for (const [symbol, rows] of rowsBySymbol) {
    const span = spans.get(symbol);
    if (!span) continue;
    const fitEnd = span.first + (span.last - span.first) * 0.5;
    const selectEnd = span.first + (span.last - span.first) * 0.75;
    const candidates: Array<{
      threshold: number;
      selectE: number | null;
      confirmE: number | null;
      selectFilled: number;
      confirmFilled: number;
    }> = [];
    for (let threshold = 0; threshold <= 95; threshold += 5) {
      const select: Bucket = { filled: 0, sumR: 0 };
      const confirm: Bucket = { filled: 0, sumR: 0 };
      for (const row of rows) {
        if (row.score < threshold || !row.filled) continue;
        if (row.time >= fitEnd && row.time < selectEnd) {
          select.filled += 1;
          select.sumR += row.r;
        } else if (row.time >= selectEnd) {
          confirm.filled += 1;
          confirm.sumR += row.r;
        }
      }
      candidates.push({
        confirmE: expectancy(confirm),
        confirmFilled: confirm.filled,
        selectE: expectancy(select),
        selectFilled: select.filled,
        threshold,
      });
    }
    // A rescue is a threshold POSITIVE on both folds with sample on both
    // — chosen as the LOWEST such threshold, so the market keeps as much
    // of its stream as the evidence allows.
    const rescue = candidates.find((candidate) =>
      candidate.selectE !== null && candidate.confirmE !== null &&
      candidate.selectE > 0 && candidate.confirmE > 0
    ) ?? null;
    report[symbol] = { candidates, rescue };
  }

  writeFileSync(outPath, JSON.stringify({ minFilled: MIN_FILLED, report }, null, 2) + "\n");
  const rescued = Object.values(report).filter((entry) =>
    (entry as { rescue: unknown }).rescue !== null
  ).length;
  console.log(
    `threshold rescue: ${rescued} of ${Object.keys(report).length} markets have a both-folds-positive threshold -> ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
