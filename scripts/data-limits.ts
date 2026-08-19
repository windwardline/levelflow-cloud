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
    `\n| class | market | 15min span | first | last | bars | gap (d) | 5min span | 5min first | 1day bars |`,
  );
  console.log(
    `| --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | ---: |`,
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
        primary.spanDays.toFixed(0)
      }d | ${iso(primary.firstTime)} | ${iso(primary.lastTime)} | ${primary.count} | ${
        days(primary.largestGapMs)
      } | ${five ? `${five.spanDays.toFixed(0)}d` : "—"} | ${
        five ? iso(five.firstTime) : "—"
      } | ${daily?.count ?? "—"} |`,
    );
  }
  const holdout = manifest.holdoutSymbols ?? [];
  if (holdout.length > 0) {
    // The STAMPED flag, named as such (#364 round 30, finding 3): this
    // is the driver's class-blind 1-in-5 draw recorded in the manifest.
    // The 4c gate (grid-totalr) ignores it and excludes its own
    // read-time stratified set — a different set by design — and prints
    // that count itself; a per-market sweep planned off this table must
    // not read this list as the gate's holdout.
    console.log(
      `\nholdout (${holdout.length}, the manifest's STAMPED flag — the 4c ` +
        `gate excludes its own read-time stratified set instead): ${
          holdout.join(", ")
        }`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
