// 4d — per-market derivation under gate v2 (amendment 33: per market,
// never per class; find, justify, defend).
//
//   npx tsx scripts/derive-4d.ts sweeps/4c/shard-{0..7}.jsonl \
//     --baseline "confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1" \
//     --out docs/research/baseline-2026-08-10/4d-candidates.json
//
// Reads the SAME corpus through the SAME door as the 4c grade (manifest
// assertion per shard, read-time stratified holdout, confirm SEALED) and
// grades every market on its own rows: singleton groups, the paired
// permutation, the 30-filled floor. Emits the candidate table the
// feasibility join and the one confirm-final read consume — this script
// never touches the confirm fold.
import { writeFileSync } from "node:fs";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { gradeCorpus, type VariantVerdict } from "./grid-totalr.ts";
import { assertManifest } from "./sweepStats.ts";
import { stratifiedHoldout } from "./sweepFolds.ts";

type MarketCandidates = {
  // Every accepted variant, best first by select-fold expectancy delta.
  accepted: Array<{
    selectExpectancyDelta: number;
    pairedP: number;
    selectFilled: number;
    selectExpiryShare: number | null;
    variant: string;
    worstDayR: number | null;
  }>;
  // No variant cleared the gate: the market keeps its shipped
  // calibration and is measured, not tuned (CV-3 / the livestock rule).
  measureOnly: boolean;
  // Thin in the FIT fold across the board — a late-listed market whose
  // history cannot carry a derivation at all.
  starved: boolean;
};

async function main() {
  const argv = process.argv.slice(2);
  // Positional args are shard paths; every --flag consumes the token
  // after it, so a flag VALUE can never masquerade as a path.
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      if (
        argv[index] !== "--holdout-cycle" &&
        argv[index] !== "--per-market-folds"
      ) index += 1;
      continue;
    }
    paths.push(argv[index]);
  }
  const flagValue = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const baselineVariant = flagValue("baseline") ?? "baseline";
  const outPath = flagValue("out") ??
    "docs/research/baseline-2026-08-10/4d-candidates.json";
  if (paths.length === 0) {
    throw new Error("derive-4d: no corpus shards given");
  }

  // The holdout cycle (owner word, 2026-08-11): grade ONLY the markets
  // the read-time stratification held out of every tuning aggregate —
  // recomputed here with the same determinism, then passed as the
  // surgical filter so nothing else enters the cube.
  const holdoutCycle = argv.includes("--holdout-cycle");
  let symbolFilter: Set<string> | undefined;
  if (holdoutCycle) {
    const union = new Set<string>();
    for (const path of paths) {
      for (const entry of assertManifest(path).symbols) {
        union.add(entry.symbol);
      }
    }
    symbolFilter = stratifiedHoldout(
      [...union],
      (symbol) => getAssetType(symbol),
    );
    console.log(
      `holdout cycle: ${symbolFilter.size} held-out markets -> ${
        [...symbolFilter].sort().join(",")
      }`,
    );
  }

  // Totality mode: explicit target list + per-market re-cut folds; the
  // targets ride the surgical filter and holdout members are included
  // (their rows are the whole point).
  const perMarketFolds = argv.includes("--per-market-folds");
  const targetsFlag = flagValue("targets");
  if (targetsFlag) {
    symbolFilter = new Set(
      targetsFlag.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    );
    console.log(`targets: ${symbolFilter.size} markets`);
  }
  const { manifest, verdicts } = await gradeCorpus(paths, {
    baselineVariant,
    includeHoldout: holdoutCycle || targetsFlag !== undefined,
    perMarketFolds,
    permutations: Number(flagValue("permutations") ?? 1_000),
    seed: Number(flagValue("seed") ?? 7),
    symbolFilter,
    verdictUnit: "market",
  });

  const markets: Record<string, MarketCandidates> = {};
  const sorted = [...verdicts.keys()].sort();
  for (const symbol of sorted) {
    const byVariant = verdicts.get(symbol)!;
    const rows: Array<[string, VariantVerdict]> = [...byVariant.entries()];
    const accepted = rows
      .filter(([, verdict]) => verdict.accepted)
      .map(([variant, verdict]) => ({
        selectExpectancyDelta: verdict.selectExpectancyDelta,
        pairedP: verdict.pairedP,
        selectFilled: verdict.selectFilled,
        selectExpiryShare: verdict.selectExpiryShare,
        variant,
        worstDayR: verdict.worstDayR,
      }))
      .sort((a, b) => b.selectExpectancyDelta - a.selectExpectancyDelta);
    const starved = rows.length > 0 &&
      rows.every(([, verdict]) => (verdict.fitFilled ?? 0) < 30);
    markets[symbol] = {
      accepted,
      measureOnly: accepted.length === 0,
      starved,
    };
  }

  const summary = {
    analyzerVersion: manifest.analyzerVersion,
    baselineVariant,
    corpusNote:
      "confirm fold NEVER read by this script; its one authorized read " +
      "belongs to the final candidate set (burned-log, grid-totalr).",
    derivedAt: new Date().toISOString(),
    markets,
  };
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");

  const tuned = Object.values(markets).filter((m) => !m.measureOnly).length;
  const measureOnly = Object.values(markets).filter((m) =>
    m.measureOnly && !m.starved
  ).length;
  const starved = Object.values(markets).filter((m) => m.starved).length;
  console.log(
    `4d candidates: ${tuned} markets with accepted variants, ` +
      `${measureOnly} measure-only, ${starved} starved -> ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
