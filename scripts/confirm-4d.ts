// 4d final assembly — the frozen choice, then the ONE authorized confirm
// read (LA-6's burned log; every read is recorded forever).
//
//   npx tsx scripts/confirm-4d.ts sweeps/4c/shard-{0..7}.jsonl \
//     --baseline "confidenceThreshold=0,..." [--acknowledge-prior-reads]
//
// Order is the discipline: the per-market choice is assembled and WRITTEN
// from candidates x feasibility BEFORE the confirm fold is opened, so the
// held-back data can never influence the pick — it can only pass or fail
// it. The confirm read runs once, per corpus hash, into the burned log.
import { readFileSync, writeFileSync } from "node:fs";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { gradeCorpus } from "./grid-totalr.ts";
import { stratifiedHoldout } from "./sweepFolds.ts";
import { assertManifest } from "./sweepStats.ts";

type Candidate = {
  selectExpectancyDelta: number;
  pairedP: number;
  selectFilled: number;
  selectExpiryShare: number | null;
  variant: string;
  worstDayR: number | null;
};

async function main() {
  const argv = process.argv.slice(2);
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      if (
        argv[index] !== "--acknowledge-prior-reads" &&
        argv[index] !== "--holdout-cycle"
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
  const dir = "docs/research/baseline-2026-08-10";
  const holdoutCycle = argv.includes("--holdout-cycle");
  const prefix = holdoutCycle ? "4d-holdout" : "4d";
  const candidates = JSON.parse(
    readFileSync(`${dir}/${prefix}-candidates.json`, "utf8"),
  ) as {
    analyzerVersion: string;
    markets: Record<
      string,
      { accepted: Candidate[]; measureOnly: boolean; starved: boolean }
    >;
  };
  const feasibility = JSON.parse(
    readFileSync(`${dir}/${prefix}-feasibility.json`, "utf8"),
  ) as {
    feasibility: Record<
      string,
      Record<
        string,
        { feasibleLines: string[]; medianRiskDistance: number | null }
      >
    >;
  };

  // THE FROZEN CHOICE: best accepted candidate with at least one feasible
  // program line; a market whose every accepted cell is unsizeable keeps
  // its shipped calibration (capacity-gated, stated — not deleted).
  const finalPicks: Record<
    string,
    {
      demotedFrom: string | null;
      feasibleLines: string[];
      selectExpectancyDelta: number;
      variant: string;
    }
  > = {};
  const capacityGated: string[] = [];
  for (const [symbol, market] of Object.entries(candidates.markets)) {
    if (market.accepted.length === 0) continue;
    const top = market.accepted[0];
    let chosen: { candidate: Candidate; lines: string[] } | null = null;
    for (const candidate of market.accepted) {
      const entry = feasibility.feasibility[symbol]?.[candidate.variant];
      const lines = entry?.feasibleLines ?? [];
      if (lines.length > 0) {
        chosen = { candidate, lines };
        break;
      }
    }
    if (!chosen) {
      capacityGated.push(symbol);
      continue;
    }
    finalPicks[symbol] = {
      demotedFrom: chosen.candidate.variant === top.variant
        ? null
        : top.variant,
      feasibleLines: chosen.lines,
      selectExpectancyDelta: chosen.candidate.selectExpectancyDelta,
      variant: chosen.candidate.variant,
    };
  }
  writeFileSync(
    `${dir}/${prefix}-final-picks.json`,
    JSON.stringify(
      {
        analyzerVersion: candidates.analyzerVersion,
        capacityGated,
        finalPicks,
        frozenAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `frozen: ${Object.keys(finalPicks).length} picks, ` +
      `${capacityGated.length} capacity-gated -> ${prefix}-final-picks.json`,
  );

  // THE ONE READ. Confirm totals come back per market per accepted
  // variant; only the frozen picks' rows are reported.
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
  }
  const { verdicts } = await gradeCorpus(paths, {
    acknowledgePriorReads: argv.includes("--acknowledge-prior-reads"),
    baselineVariant,
    confirmFinal: true,
    includeHoldout: holdoutCycle,
    permutations: Number(flagValue("permutations") ?? 1_000),
    seed: Number(flagValue("seed") ?? 7),
    symbolFilter,
    verdictUnit: "market",
  });

  const confirmReport: Record<
    string,
    { confirmTotalDelta: number | null; variant: string }
  > = {};
  let confirmedPositive = 0;
  let confirmedNegative = 0;
  let unreadable = 0;
  for (const [symbol, pick] of Object.entries(finalPicks)) {
    const verdict = verdicts.get(symbol)?.get(pick.variant);
    const delta = verdict?.confirmTotalDelta ?? null;
    confirmReport[symbol] = {
      confirmTotalDelta: delta,
      variant: pick.variant,
    };
    if (delta === null) unreadable += 1;
    else if (delta > 0) confirmedPositive += 1;
    else confirmedNegative += 1;
  }
  writeFileSync(
    `${dir}/${prefix}-confirm-read.json`,
    JSON.stringify(
      {
        confirmReport,
        confirmedNegative,
        confirmedPositive,
        readAt: new Date().toISOString(),
        unreadable,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `confirm read: ${confirmedPositive} picks positive, ` +
      `${confirmedNegative} negative, ${unreadable} unreadable -> ${prefix}-confirm-read.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
