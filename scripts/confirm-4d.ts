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

// The ONE declaration of which flags own the token after them (#364
// round 44, smaller — the form rounds 33–38 installed in the four
// dialed readers, at the two scripts they did not reach). The walker
// here had been INVERTED: it listed the flags that take no value and
// consumed the next token for everything else, so a typo'd or
// newly-added boolean flag silently ate the shard path following it and
// this script BURNED the confirm read over a corpus one shard short of
// the one the operator named. A positive declaration cannot do that: an
// undeclared flag consumes nothing.
const VALUE_FLAGS = new Set([
  "--baseline",
  "--targets",
  "--prefix",
  "--permutations",
  "--seed",
]);

async function main() {
  const argv = process.argv.slice(2);
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      if (VALUE_FLAGS.has(argv[index])) index += 1;
      continue;
    }
    paths.push(argv[index]);
  }
  const str = (arg: string): string | undefined => {
    if (!VALUE_FLAGS.has(arg)) {
      throw new Error(
        `str("${arg}") reads a value outside VALUE_FLAGS — declare it ` +
          `there, or its value stays in the shard paths`,
      );
    }
    const index = argv.indexOf(arg);
    if (index === -1) return undefined;
    const token = argv[index + 1];
    if (token === undefined || token.startsWith("--")) {
      throw new Error(
        `${arg} owns the token after it and got ${
          token === undefined ? "no value" : `"${token}"`
        } — a value, never a flag; pass ${arg} <value>`,
      );
    }
    return token;
  };
  const num = (arg: string, fallback: number): number => {
    if (!VALUE_FLAGS.has(arg)) {
      throw new Error(
        `num("${arg}") reads a value outside VALUE_FLAGS — declare it ` +
          `there, or its value stays in the shard paths`,
      );
    }
    const index = argv.indexOf(arg);
    if (index === -1) return fallback;
    const parsed = Number(argv[index + 1]);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `${arg} owns the token after it and cannot read ${
          argv[index + 1] === undefined
            ? "a missing value"
            : `"${argv[index + 1]}"`
        } as a number — the walker already kept that token out of the ` +
          `shard paths, and this script burns the confirm read; pass ` +
          `${arg} <number>`,
      );
    }
    return parsed;
  };
  const baselineVariant = str("--baseline") ?? "baseline";
  const dir = "docs/research/baseline-2026-08-10";
  const holdoutCycle = argv.includes("--holdout-cycle");
  const perMarketFolds = argv.includes("--per-market-folds");
  const targetsFlag = str("--targets");
  const prefix = str("--prefix") ??
    (holdoutCycle ? "4d-holdout" : "4d");
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
    // Totality mode (owner mandate): capacity is DISCLOSURE, not a veto —
    // the §19 governor already refuses per account at runtime, which is
    // the product's honest surface for sizing. The per-line feasibility
    // still rides the artifact for every pick.
    const disclosureOnly = argv.includes("--feasibility-disclosure-only");
    for (const candidate of market.accepted) {
      const entry = feasibility.feasibility[symbol]?.[candidate.variant];
      const lines = entry?.feasibleLines ?? [];
      if (disclosureOnly || lines.length > 0) {
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
  if (targetsFlag) {
    symbolFilter = new Set(
      targetsFlag.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    );
  }
  const { confirmRead, verdicts } = await gradeCorpus(paths, {
    acknowledgePriorReads: argv.includes("--acknowledge-prior-reads"),
    baselineVariant,
    confirmFinal: true,
    includeHoldout: holdoutCycle || targetsFlag !== undefined,
    perMarketFolds,
    permutations: num("--permutations", 1_000),
    seed: num("--seed", 7),
    symbolFilter,
    verdictUnit: "market",
  });

  const confirmReport: Record<
    string,
    {
      confirmTotalDelta: number | null;
      // The delta's two denominators travel with it (#364 rounds 43-44):
      // a null here is "the gate refused the pick" or "the confirm fold
      // could not judge it", and these are what tell them apart.
      confirmFilled: number | null;
      confirmBaseFilled: number | null;
      variant: string;
    }
  > = {};
  let confirmedPositive = 0;
  let confirmedNegative = 0;
  // "unreadable" meant one thing when confirmTotalDelta was non-null
  // exactly for accepted variants: the pick did not clear the 4c gate.
  // #364 round 43 gave a null delta a SECOND cause — accepted, but the
  // confirm fold carried no filled outcomes on one or both sides — with
  // a different remedy (the fold boundary or the market's coverage,
  // not the gate), and this counter absorbed it silently. The causes
  // are separated here and the total kept, so a 4d ruling can tell a
  // pick that lost the gate from one the held-back window could not
  // judge (#364 round 44, finding 2).
  let notAccepted = 0;
  let unevidenced = 0;
  let noVerdict = 0;
  for (const [symbol, pick] of Object.entries(finalPicks)) {
    const verdict = verdicts.get(symbol)?.get(pick.variant);
    const delta = verdict?.confirmTotalDelta ?? null;
    confirmReport[symbol] = {
      confirmTotalDelta: delta,
      confirmFilled: verdict?.confirmFilled ?? null,
      confirmBaseFilled: verdict?.confirmBaseFilled ?? null,
      variant: pick.variant,
    };
    if (delta !== null) {
      if (delta > 0) confirmedPositive += 1;
      else confirmedNegative += 1;
    } else if (!verdict) noVerdict += 1;
    else if (!verdict.accepted) notAccepted += 1;
    else unevidenced += 1;
  }
  const unreadable = notAccepted + unevidenced + noVerdict;
  // The artifact a 4d ruling is read from states whether the confirm
  // fold was actually READ (#364 round 44, finding 2): it had carried a
  // readAt timestamp unconditionally, so a run that produced no figure
  // and burned nothing still left a file on disk saying the held-back
  // fold was opened at that instant — round 43's finding at the reader
  // that matters. readAt is null when nothing was read, and the cause
  // rides beside it.
  writeFileSync(
    `${dir}/${prefix}-confirm-read.json`,
    JSON.stringify(
      {
        confirmRead,
        confirmReport,
        confirmedNegative,
        confirmedPositive,
        noVerdict,
        notAccepted,
        notReadReason: confirmRead
          ? null
          : unevidenced > 0
          ? "accepted picks carried no filled outcomes on both sides of the confirm fold — nothing burned"
          : "no pick's variant was accepted, so there was nothing to confirm — nothing burned",
        readAt: confirmRead ? new Date().toISOString() : null,
        unevidenced,
        unreadable,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    (confirmRead
      ? `confirm read: ${confirmedPositive} picks positive, ` +
        `${confirmedNegative} negative`
      : `confirm NOT READ (nothing burned): ${confirmedPositive} positive, ` +
        `${confirmedNegative} negative`) +
      `, ${unreadable} without a figure ` +
      `(${notAccepted} not accepted, ${unevidenced} accepted but ` +
      `unevidenced in the confirm fold, ${noVerdict} with no verdict) ` +
      `-> ${prefix}-confirm-read.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
