/**
 * 4a — discover the data limits; never assume them.
 *
 * Reads ONE manifested corpus and prints, per market and per timeframe,
 * the true usable span the manifest measured while the corpus was built:
 * first bar, last bar, count, largest gap, span. A sweep that assumes a
 * common span silently truncates the markets with more history and
 * manufactures confidence about the markets with less — this table is
 * what 4c's per-market sweeps read their own limits from, and the
 * largest-gap column is where a hole big enough to invalidate a span
 * announces itself.
 *
 *   npx tsx scripts/data-limits.ts <emit.jsonl>
 */
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { describeHeldOut, resolveHeldOut } from "./sweepFolds.ts";
import { assertManifest } from "./sweepStats.ts";

function iso(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toISOString().slice(0, 10);
}

function days(ms: number): string {
  return (ms / 86_400_000).toFixed(1);
}

function main(): void {
  const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (paths.length !== 1) {
    console.error("usage: data-limits.ts <emit.jsonl>");
    process.exit(1);
  }
  const manifest = assertManifest(paths[0]);
  // One holdout population (R4 act 2): the stratified set over the requested
  // roster, verified against the anchor's tracked pin when one stands, is
  // what every reader and the gate exclude on — labelled per market here so
  // a per-market sweep planned off this table reads the same set. The
  // manifest's STAMPED flag (the driver's class-blind sha256 mod 5) prints
  // beside it as provenance; nothing excludes on it.
  const holdout = resolveHeldOut([manifest]);
  console.log(
    `corpus ${manifest.manifestHash.slice(0, 12)} · engine ${manifest.analyzerVersion} · anchor ${manifest.anchor}`,
  );
  if (manifest.folds) {
    console.log(
      manifest.folds.map((fold) =>
        `${fold.name}: ${iso(fold.startMs)}..${iso(fold.endMs)}`
      ).join(" · "),
    );
  }
  console.log(
    `\n| class | market | held out | 15min span | first | last | bars | gap (d) | 5min span | 5min first | 1day bars |`,
  );
  console.log(
    `| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | ---: |`,
  );
  const sorted = [...manifest.symbols].sort((a, b) => {
    const classOrder = getAssetType(a.symbol).localeCompare(
      getAssetType(b.symbol),
    );
    return classOrder !== 0 ? classOrder : a.symbol.localeCompare(b.symbol);
  });
  for (const entry of sorted) {
    const primary = entry.series["15min"];
    const five = entry.series["5min"];
    const daily = entry.series["1day"];
    if (!primary) continue;
    console.log(
      `| ${getAssetType(entry.symbol)} | ${entry.symbol} | ${
        holdout.held.has(entry.symbol) ? "HELD OUT" : ""
      } | ${
        primary.spanDays.toFixed(0)
      }d | ${iso(primary.firstTime)} | ${iso(primary.lastTime)} | ${primary.count} | ${
        days(primary.largestGapMs)
      } | ${five ? `${five.spanDays.toFixed(0)}d` : "—"} | ${
        five ? iso(five.firstTime) : "—"
      } | ${daily?.count ?? "—"} |`,
    );
  }
  // The set by name (#364 round 30, finding 3 asked that the stamp never be
  // read as the gate's holdout; R4 act 2 made the gate's set the only one).
  console.log(`\n${describeHeldOut(holdout, { labels: true, pools: false })}`);
  console.log(
    `held out (${holdout.markets.length}): ${holdout.markets.join(", ") || "none"}`,
  );
  console.log(
    `stamped flag (${holdout.stamped.length}, provenance only): ${
      holdout.stamped.join(", ") || "none"
    }`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
