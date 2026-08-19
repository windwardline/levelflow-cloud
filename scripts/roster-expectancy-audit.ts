// Every offered market, at its TRUE effective configuration, measured
// for absolute expectancy on the held-back fold.
//
// The 4d cycles measured the 72 markets that earned derived cells. The
// other 25 trade on CLASS calibration and were never measured in
// absolute terms at all — the same blind spot that hid fifteen losing
// markets, one population over. This closes it for the whole roster.
//
// The effective configuration of a market is:
//   derived cell  -> its variant, threshold 0 (the cell sets it)
//   no cell       -> the grid's baseline variant, filtered to the
//                    market's CLASS confidence threshold, which is what
//                    the shipped engine actually gates on
// Both are reads of the SAME capture-all corpus: every decision is
// present with its score, so a threshold is a filter, not a new
// assumption.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ENGINE_DECLINED_MARKETS,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { assertManifest, readLinesSync } from "./sweepStats.ts";
import { flagReader } from "./flagReader.ts";

const BASELINE =
  "confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1";
const MIN_FILLED = 30;

type Acc = { n: number; sum: number; sumSq: number };

function empty(): Acc {
  return { n: 0, sum: 0, sumSq: 0 };
}

function stats(acc: Acc) {
  if (acc.n < MIN_FILLED) {
    return { ci95Upper: null, expectancy: null, n: acc.n, se: null };
  }
  const expectancy = acc.sum / acc.n;
  const variance = Math.max(
    0,
    (acc.sumSq - acc.sum * acc.sum / acc.n) / (acc.n - 1),
  );
  const se = Math.sqrt(variance / acc.n);
  return {
    ci95Upper: expectancy + 1.96 * se,
    expectancy,
    n: acc.n,
    se,
  };
}

/**
 * Positional arguments are shard paths; `--flag value` pairs are skipped.
 *
 * An audit that read no shards is not an audit that found nothing. With zero
 * paths every market falls through to "unmeasurable" and the artifact reads
 * like a finished run — the exact silent pass the standard forbids, so this
 * refuses rather than reports (WIF-4, 2026-08-11).
 */
const VALUE_FLAGS = new Set(["--out"]);

export function shardPathsFromArgv(argv: string[]): string[] {
  // POSITIVE membership test (#364 round 50, finding 2): the old form
  // consumed the token after EVERY --flag, so a boolean or typo'd flag
  // ate the shard path following it and the audit ran over a corpus one
  // shard short of the one named — round 44's defect, surfaced here by
  // the derived scan.
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      if (VALUE_FLAGS.has(argv[index])) index += 1;
      continue;
    }
    paths.push(argv[index]);
  }
  if (paths.length === 0) {
    throw new Error(
      "roster-expectancy-audit: no shard paths given. Pass the sweep shards " +
        "explicitly; a run over zero rows cannot report a verdict.",
    );
  }
  return paths;
}

async function main() {
  const argv = process.argv.slice(2);
  const paths = shardPathsFromArgv(argv);
  const { str } = flagReader(argv, VALUE_FLAGS);
  const outPath = str("--out") ??
    "docs/research/baseline-2026-08-10/roster-expectancy-audit.json";
  const picksDir = "docs/research/baseline-2026-08-10";

  // Which markets carry a derived cell, and which variant.
  const derived = new Map<string, string>();
  for (
    const [picksFile, confirmFile] of [
      ["4d-final-picks.json", "4d-confirm-read.json"],
      ["4d-holdout-final-picks.json", "4d-holdout-confirm-read.json"],
      ["4d-totality-final-picks.json", "4d-totality-confirm-read.json"],
    ]
  ) {
    const picks = JSON.parse(
      readFileSync(`${picksDir}/${picksFile}`, "utf8"),
    ) as { finalPicks: Record<string, { variant: string }> };
    const confirm = JSON.parse(
      readFileSync(`${picksDir}/${confirmFile}`, "utf8"),
    ) as {
      confirmReport: Record<string, { confirmTotalDelta: number | null }>;
    };
    for (const [symbol, row] of Object.entries(confirm.confirmReport)) {
      if ((row.confirmTotalDelta ?? 0) > 0) {
        derived.set(symbol, picks.finalPicks[symbol].variant);
      }
    }
  }

  // Spans for per-market folds, from the manifests.
  const spans = new Map<string, { first: number; last: number }>();
  for (const path of paths) {
    const manifest = JSON.parse(
      readFileSync(`${path}.manifest.json`, "utf8"),
    ) as {
      symbols: Array<
        {
          symbol: string;
          series?: Record<string, { firstTime?: number; lastTime?: number }>;
        }
      >;
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

  const acc = new Map<string, { confirm: Acc; select: Acc }>();
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
      if (!symbol) return;
      const variant = row.variant ?? "baseline";
      const cell = derived.get(symbol);
      // A derived market is read at its own cell; every other market is
      // read at the grid baseline, gated by its CLASS threshold — which
      // is what the shipped engine does.
      if (cell !== undefined) {
        if (variant !== cell) return;
      } else {
        if (variant !== BASELINE && variant !== "baseline") return;
        const threshold = getCategoryCalibration(symbol).confidenceThreshold;
        const score = Number(row.confidenceScore);
        if (!Number.isFinite(score) || score < threshold) return;
      }
      if (row.accepted !== true || row.outcome === "unfilled") return;
      const span = spans.get(symbol);
      const time = Number(row.time);
      const r = Number(row.realizedR);
      if (!span || !Number.isFinite(time) || !Number.isFinite(r)) return;
      const fitEnd = span.first + (span.last - span.first) * 0.5;
      const selectEnd = span.first + (span.last - span.first) * 0.75;
      if (!acc.has(symbol)) {
        acc.set(symbol, { confirm: empty(), select: empty() });
      }
      const cells = acc.get(symbol)!;
      const exit = Number(row.exitAtMs);
      if (time >= fitEnd && time < selectEnd) {
        if (Number.isFinite(exit) && exit > selectEnd) return;
        cells.select.n += 1;
        cells.select.sum += r;
        cells.select.sumSq += r * r;
      } else if (time >= selectEnd) {
        cells.confirm.n += 1;
        cells.confirm.sum += r;
        cells.confirm.sumSq += r * r;
      }
    });
  }

  const report: Record<string, unknown> = {};
  const tally = {
    declined: 0,
    measurablyNegative: 0,
    measurablyPositive: 0,
    unmeasurable: 0,
    zeroSpanning: 0,
  };
  for (const symbol of [...defaultScanSymbols].sort()) {
    const cells = acc.get(symbol);
    const confirm = stats(cells?.confirm ?? empty());
    const select = stats(cells?.select ?? empty());
    const isDeclined = symbol in ENGINE_DECLINED_MARKETS;
    let verdict: string;
    if (isDeclined) {
      verdict = "DECLINED — the engine already refuses this market";
      tally.declined += 1;
    } else if (confirm.expectancy === null || confirm.ci95Upper === null) {
      verdict = "UNMEASURABLE — under the fill floor at its shipped settings";
      tally.unmeasurable += 1;
    } else if (confirm.ci95Upper < 0) {
      verdict =
        "MEASURABLY NEGATIVE — loses beyond its own error, and the engine still trades it";
      tally.measurablyNegative += 1;
    } else if (confirm.expectancy - 1.96 * (confirm.se ?? 0) > 0) {
      verdict = "MEASURABLY POSITIVE";
      tally.measurablyPositive += 1;
    } else {
      verdict = "ZERO-SPANNING — no measured edge, no measured loss";
      tally.zeroSpanning += 1;
    }
    report[symbol] = {
      confidenceThreshold: getCategoryCalibration(symbol).confidenceThreshold,
      confirm,
      configuration: derived.get(symbol) ?? "class calibration (no derived cell)",
      select,
      verdict,
    };
  }

  writeFileSync(
    outPath,
    JSON.stringify({ report, tally }, null, 2) + "\n",
  );
  console.log(
    `roster expectancy: ${tally.measurablyPositive} positive, ` +
      `${tally.zeroSpanning} zero-spanning, ` +
      `${tally.measurablyNegative} MEASURABLY NEGATIVE AND STILL TRADED, ` +
      `${tally.declined} already declined, ${tally.unmeasurable} unmeasurable -> ${outPath}`,
  );
}

// Self-execute only as the entrypoint (the grid-totalr idiom). An ESM body
// runs on import, so a bare `main()` call here made the module untestable —
// importing it ran the whole audit.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
