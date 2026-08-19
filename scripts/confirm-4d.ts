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
import {
  describeNumericToken,
  describeToken,
  soleFlagIndex,
  tokenFault,
} from "./flagReader.ts";

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
  // Both directories are overridable so this script — the one that
  // BURNS — can be driven end to end by a test without writing into the
  // research record or the repository's confirm ledger (#364 round 45,
  // finding 2: it had no executed coverage at all, which is why the
  // counter conflation survived).
  "--research-dir",
  "--confirm-log-dir",
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
    const index = soleFlagIndex(argv, arg);
    if (index === -1) return undefined;
    const token = argv[index + 1];
    if (tokenFault(token) !== null) {
      throw new Error(
        `${arg} owns the token after it and got ${describeToken(token)} — a ` +
          `value, never a flag and never blank; pass ${arg} <value>`,
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
    const index = soleFlagIndex(argv, arg);
    if (index === -1) return fallback;
    const token = argv[index + 1];
    const parsed = Number(token);
    if (tokenFault(token) !== null || !Number.isFinite(parsed)) {
      throw new Error(
        `${arg} owns the token after it and cannot read ${
          describeNumericToken(token)
        } as a number — the walker already kept that token out of the ` +
          `shard paths, and this script burns the confirm read; pass ` +
          `${arg} <number>`,
      );
    }
    return parsed;
  };
  const baselineVariant = str("--baseline") ?? "baseline";
  const dir = str("--research-dir") ?? "docs/research/baseline-2026-08-10";
  const holdoutCycle = argv.includes("--holdout-cycle");
  const perMarketFolds = argv.includes("--per-market-folds");
  const targetsFlag = str("--targets");
  const prefix = str("--prefix") ??
    (holdoutCycle ? "4d-holdout" : "4d");
  // VALIDATE BEFORE MUTATING (#364 round 54, found by round 54's own
  // derived scan running every corpus reader with no arguments). This
  // script wrote `<prefix>-final-picks.json` — a TRACKED artifact naming
  // which variant each market ships — from the candidates and feasibility
  // files ALONE, then called gradeCorpus, which refused with "no corpus
  // paths given" and exited 1. So a run that refused still rewrote the
  // picks on disk, with a fresh `frozenAt`, and the operator saw exit 1
  // and reasonably assumed nothing had happened. Every sibling that
  // writes an artifact checks its corpus first — derive-4d:115,
  // feasibility-4d:96, threshold-rescue:67, cost-sensitivity-verdict:211,
  // market-dossier:259, roster-expectancy-audit:79 — this one alone did
  // the work first and validated second, which is the state-mutated-
  // before-validation shape, in the script that BURNS the confirm read.
  if (paths.length === 0) {
    throw new Error(
      "confirm-4d: no shard paths given. This script freezes the final " +
        "picks and then burns the held-back confirm fold, so it must not " +
        "rewrite the picks artifact for a corpus it cannot read; pass the " +
        "sweep shards explicitly.",
    );
  }
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
  // An invalidation banner already on the artifact is CARRIED FORWARD,
  // never dropped by a rewrite (#364 round 54). The shipped
  // 4d-final-picks.json carries an "INVALID" key — the 2026-08-11 clock
  // defect — and this writer emits no such key, so any re-run silently
  // removed the notice saying these numbers must not be used to withdraw,
  // defend or ship a market, from the file that names each market's
  // variant. A banner is retired by whoever re-validates the corpus, by
  // hand, with the reason recorded; it is not retired as a side effect of
  // running the script again.
  const picksPath = `${dir}/${prefix}-final-picks.json`;
  const priorBanner = ((): string | undefined => {
    try {
      const prior = JSON.parse(readFileSync(picksPath, "utf8")) as {
        INVALID?: unknown;
      };
      return typeof prior.INVALID === "string" ? prior.INVALID : undefined;
    } catch {
      return undefined;
    }
  })();
  writeFileSync(
    picksPath,
    JSON.stringify(
      {
        ...(priorBanner === undefined ? {} : { INVALID: priorBanner }),
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
      `${capacityGated.length} capacity-gated -> ${prefix}-final-picks.json` +
      (priorBanner === undefined
        ? ""
        : "\n  INVALID banner carried forward from the previous artifact — " +
          "remove it by hand when the corpus behind it has been revalidated"),
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
    confirmLogDir: str("--confirm-log-dir"),
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
      // Which of the gate's dispositions this pick carries, so a null
      // delta names its own cause per market rather than only in the
      // rollup counts (#364 round 45, finding 2).
      gateDisposition: string;
      gateReason: string | null;
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
  // not the gate), and this counter absorbed it silently (#364 round
  // 44, finding 2).
  //
  // Round 45, finding 2: the split still merged the gate's OWN
  // dispositions. A verdict carrying noVerdict (a pairing below
  // MIN_EFFECTIVE_PAIRS, or a group baseline with no select-fold days)
  // or thin always has accepted === false, so both landed in
  // "notAccepted" and were reported as having lost the gate — when the
  // gate could not judge them at all, with a different remedy again
  // (the pairing, the baseline, the corpus depth). Each disposition now
  // carries its own counter and its own per-pick field, and the
  // residual bucket is named missingVerdict rather than noVerdict,
  // which is a DIFFERENT fact on VariantVerdict and was colliding
  // across the two files an operator reads together.
  let refusedByGate = 0;
  let gateCouldNotJudge = 0;
  let thin = 0;
  let unevidenced = 0;
  let missingVerdict = 0;
  for (const [symbol, pick] of Object.entries(finalPicks)) {
    const verdict = verdicts.get(symbol)?.get(pick.variant);
    const delta = verdict?.confirmTotalDelta ?? null;
    confirmReport[symbol] = {
      confirmTotalDelta: delta,
      confirmFilled: verdict?.confirmFilled ?? null,
      confirmBaseFilled: verdict?.confirmBaseFilled ?? null,
      gateDisposition: !verdict
        ? "missing-verdict"
        : delta !== null
        ? "confirmed"
        : verdict.thin
        ? "thin"
        : verdict.noVerdict
        ? "gate-could-not-judge"
        : verdict.accepted
        ? "accepted-but-unevidenced"
        : "refused-by-gate",
      gateReason: verdict?.reason ?? null,
      variant: pick.variant,
    };
    if (delta !== null) {
      if (delta > 0) confirmedPositive += 1;
      else confirmedNegative += 1;
    } else if (!verdict) missingVerdict += 1;
    else if (verdict.thin) thin += 1;
    else if (verdict.noVerdict) gateCouldNotJudge += 1;
    else if (!verdict.accepted) refusedByGate += 1;
    else unevidenced += 1;
  }
  const unreadable = refusedByGate + gateCouldNotJudge + thin + unevidenced +
    missingVerdict;
  // The REASON names the causes actually present, not just the two the
  // three-way split could tell apart (#364 round 45, self-review after
  // finding 2). Splitting the counters and leaving this sentence
  // collapsed reproduces the same defect one field over: a corpus whose
  // every pick was thin, or which the gate could not judge, read "no
  // pick's variant was accepted" — literally true, since thin and
  // noVerdict verdicts both carry accepted === false, and pointing at
  // the calibration when the remedy is the corpus's depth or the
  // pairing. This line is what a 4d ruling's author reads first.
  const notReadCauses = [
    unevidenced > 0 &&
    `${unevidenced} accepted but carried no filled outcomes on both sides ` +
      `of the confirm fold`,
    refusedByGate > 0 && `${refusedByGate} refused by the 4c gate`,
    gateCouldNotJudge > 0 &&
    `${gateCouldNotJudge} the gate could not judge (the pairing, or a ` +
      `baseline with no select-fold days)`,
    thin > 0 && `${thin} thin — under the market grain's filled floor`,
    missingVerdict > 0 &&
    `${missingVerdict} carried no verdict at all — frozen picks the ` +
      `grading pass never reached`,
  ].filter((cause): cause is string => typeof cause === "string");
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
        gateCouldNotJudge,
        missingVerdict,
        notReadReason: confirmRead
          ? null
          : notReadCauses.length > 0
          ? `nothing burned — ${notReadCauses.join("; ")}`
          : "nothing burned — there were no frozen picks to confirm",
        readAt: confirmRead ? new Date().toISOString() : null,
        refusedByGate,
        thin,
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
      `(${refusedByGate} refused by the gate, ${gateCouldNotJudge} the ` +
      `gate could not judge, ${thin} thin, ${unevidenced} accepted but ` +
      `unevidenced in the confirm fold, ${missingVerdict} with no verdict ` +
      `at all) -> ${prefix}-confirm-read.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
