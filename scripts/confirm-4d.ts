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
import { readFileSync } from "node:fs";
import { gradeCorpus } from "./grid-totalr.ts";
import { resolveHeldOut } from "./sweepFolds.ts";
import { assertManifest } from "./sweepStats.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";
import {
  describeNumericToken,
  describeToken,
  assertInDomain,
  soleFlagIndex,
  tokenFault,
  type NumericDomain,
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
  const num = (
    arg: string,
    fallback: number,
    domain?: NumericDomain,
  ): number => {
    if (!VALUE_FLAGS.has(arg)) {
      throw new Error(
        `num("${arg}") reads a value outside VALUE_FLAGS — declare it ` +
          `there, or its value stays in the shard paths`,
      );
    }
    const index = soleFlagIndex(argv, arg);
    if (index === -1) {
      // The DEFAULT is checked too — a default outside its own
      // dial's domain is a defect no operator would ever see.
      if (domain !== undefined) assertInDomain(arg, fallback, domain);
      return fallback;
    }
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
    if (domain !== undefined) assertInDomain(arg, parsed, domain);
    return parsed;
  };
  const baselineVariant = str("--baseline") ?? "baseline";
  const dir = str("--research-dir") ?? "docs/research/baseline-2026-08-10";
  const holdoutCycle = argv.includes("--holdout-cycle");
  // Retired (R4 act 2, 2026-09-02): the per-market time re-cut relabelled
  // the held-back fold into select under --confirm-final. The emitted
  // per-class folds are the only fold source; the market grain is
  // `verdictUnit: "market"` below, which this script has always passed.
  if (argv.includes("--per-market-folds")) {
    throw new Error(
      "--per-market-folds was retired on 2026-09-02: it re-cut each market's " +
        "span at 50/75% from row instants and, under --confirm-final, " +
        "relabelled a median 329 days of the held-back fold into select. " +
        "Grade on the emitted per-class folds (the per-class corpus " +
        "docs/research/r3/capture-all-classfolds.jsonl); the per-market " +
        "grain is already on.",
    );
  }
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
  // Both writes go through the shared artifact writer, which carries any
  // standing INVALID banner forward (#364 round 55, finding 1). Round 54
  // found the banner erasure here and fixed it BY HAND, at this site only
  // — so one invocation preserved the banner on -final-picks.json and
  // stripped it from -confirm-read.json a hundred lines below, which is
  // the artifact market-dossier and roster-expectancy-audit read to decide
  // which markets carry a confirmed derived cell. A hand-picked fix, in
  // the same commit that corrected a hand-picked population.
  writeResearchArtifact(`${dir}/${prefix}-final-picks.json`, {
    analyzerVersion: candidates.analyzerVersion,
    capacityGated,
    finalPicks,
    frozenAt: new Date().toISOString(),
  });
  console.log(
    `frozen: ${Object.keys(finalPicks).length} picks, ` +
      `${capacityGated.length} capacity-gated -> ${prefix}-final-picks.json`,
  );

  // THE ONE READ. Confirm totals come back per market per accepted
  // variant; only the frozen picks' rows are reported.
  let symbolFilter: Set<string> | undefined;
  if (holdoutCycle) {
    // The ONE holdout population (R4 act 2): the stratified set over the
    // REQUESTED roster, verified against the anchor's tracked pin — never
    // over the symbols that happen to have rows.
    symbolFilter = new Set(resolveHeldOut(paths.map((path) => assertManifest(path))).held);
  }
  if (targetsFlag) {
    symbolFilter = new Set(
      targetsFlag.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    );
  }
  const { confirmRead, heldOutSet, shipped, verdicts } = await gradeCorpus(paths, {
    acknowledgePriorReads: argv.includes("--acknowledge-prior-reads"),
    baselineVariant,
    confirmFinal: true,
    confirmLogDir: str("--confirm-log-dir"),
    includeHoldout: holdoutCycle || targetsFlag !== undefined,
    permutations: num("--permutations", 1_000, {
    basis:
      "a permutation p-value is (1 + #{at least as extreme}) / " +
      "(permutations + 1), so zero permutations makes every p exactly 1 " +
      "and the gate refuses every variant in silence",
    integer: true,
    min: 1,
  }),
    seed: num("--seed", 7),
    symbolFilter,
    verdictUnit: "market",
  });

  const confirmReport: Record<
    string,
    {
      confirmTotalDelta: number | null;
      heldOut: boolean;
      // The delta's two denominators travel with it (#364 rounds 43-44):
      // a null here is "the gate refused the pick" or "the confirm fold
      // could not judge it", and these are what tell them apart.
      confirmFilled: number | null;
      confirmBaseFilled: number | null;
      // M3: the MONEY on the held-back fold, with the interval the
      // disposition is decided on. `confirmTotalDelta` stays beside it — a
      // reader asked to trust a changed verdict is owed the figure it
      // replaces as well as the one that replaced it.
      confirmExpectancy: number | null;
      confirmExpectancyLower: number | null;
      confirmExpectancyUpper: number | null;
      confirmExpectancyDelta: number | null;
      confirmExpectancyDeltaLower: number | null;
      // Which of the gate's dispositions this pick carries, so a null
      // delta names its own cause per market rather than only in the
      // rollup counts (#364 round 45, finding 2).
      gateDisposition: string;
      gateReason: string | null;
      variant: string;
    }
  > = {};
  // M3: THREE OUTCOMES, and the two names changed with the quantity.
  //
  // The read decided `confirmTotalDelta > 0` — a bare inequality on a SUM,
  // with no sample floor, no error bar and no p. `confirmedPositive` was
  // therefore a bucket of positive DELTAS wearing an absolute name, which the
  // 2026-08-11 completeness pass recorded and killed as cosmetic. It is not
  // cosmetic once the quantity changes, so the keys change with it: a reader
  // comparing a new artifact to `4d-confirm-read.json` must not be able to put
  // two different measurements in the same column. The old artifacts keep
  // their old keys and their old meaning.
  //
  // `indistinguishable` is the outcome the binary could not express at all.
  // A fold whose interval spans zero has neither confirmed nor contradicted
  // the pick, and amendment 36 refuses acting on that in either direction —
  // the old code called every one of them "negative".
  let confirmedProfitable = 0;
  let contradicted = 0;
  let indistinguishable = 0;
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
  let notHeldBack = 0;
  let missingVerdict = 0;
  for (const [symbol, pick] of Object.entries(finalPicks)) {
    const verdict = verdicts.get(symbol)?.get(pick.variant);
    const delta = verdict?.confirmTotalDelta ?? null;
    // The MONEY. Present only for a pick the gate ACCEPTED — LA-6's one
    // authorized read — but unlike the total delta it does not also require
    // the baseline to have filled in the confirm fold. A fold that covered the
    // pick and not its baseline can still say whether the pick earned
    // anything, and that case used to report no figure at all.
    // ADMISSIBILITY (R4 act 2): the pick rides the shipped cell's layer, so
    // its absolute confirm figures are admissible only when that cell is
    // held back, or when the fold contradicts it (upper bound below zero);
    // the delta against the baseline stays. Nothing absolute is printed for
    // a market that is not held back.
    const heldBack = shipped.get(symbol)?.provenance.heldBack === true;
    const rawUpper = verdict?.confirmExpectancyUpper ?? null;
    const absoluteAdmissible = heldBack || (rawUpper !== null && rawUpper < 0);
    const lower = absoluteAdmissible ? (verdict?.confirmExpectancyLower ?? null) : null;
    const upper = absoluteAdmissible ? rawUpper : null;
    const measured = lower !== null && upper !== null;
    const disposition = !verdict
      ? "missing-verdict"
      : measured && lower > 0
      ? "confirmed-profitable"
      : measured && upper < 0
      ? "contradicted"
      : measured
      ? "indistinguishable"
      : verdict.accepted && rawUpper !== null && !absoluteAdmissible
      ? "not-held-back"
      : verdict.thin
      ? "thin"
      : verdict.noVerdict
      ? "gate-could-not-judge"
      : verdict.accepted
      ? "accepted-but-unevidenced"
      : "refused-by-gate";
    confirmReport[symbol] = {
      // Labelled, never dropped: the market unit grades every market (R4 act 2).
      heldOut: heldOutSet.includes(symbol),
      confirmTotalDelta: delta,
      confirmFilled: verdict?.confirmFilled ?? null,
      confirmBaseFilled: verdict?.confirmBaseFilled ?? null,
      // The figure the disposition was decided on, beside the figure it
      // replaces. A reader asked to trust a changed verdict is owed both.
      confirmExpectancy: absoluteAdmissible ? (verdict?.confirmExpectancy ?? null) : null,
      confirmExpectancyLower: lower,
      confirmExpectancyUpper: upper,
      // The comparison, REPORTED and not deciding (amendment 39: a rate or a
      // delta may sit beside money, never instead of it).
      confirmExpectancyDelta: verdict?.confirmExpectancyDelta ?? null,
      confirmExpectancyDeltaLower: verdict?.confirmExpectancyDeltaLower ?? null,
      gateDisposition: disposition,
      gateReason: verdict?.reason ?? null,
      variant: pick.variant,
    };
    if (disposition === "confirmed-profitable") confirmedProfitable += 1;
    else if (disposition === "contradicted") contradicted += 1;
    else if (disposition === "indistinguishable") indistinguishable += 1;
    else if (disposition === "not-held-back") notHeldBack += 1;
    else if (!verdict) missingVerdict += 1;
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
  writeResearchArtifact(`${dir}/${prefix}-confirm-read.json`, {
    confirmRead,
    confirmReport,
    confirmedProfitable,
    contradicted,
    gateCouldNotJudge,
    indistinguishable,
    missingVerdict,
    notHeldBack,
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
  });
  console.log(
    (confirmRead
      ? `confirm read: ${confirmedProfitable} picks profitable beyond error, ` +
        `${contradicted} contradicted, ${indistinguishable} indistinguishable ` +
        `from zero (every market's shipped cell read and recorded in the ledgered-read artifact)`
      : `confirm NOT READ (nothing burned): ${confirmedProfitable} ` +
        `profitable, ${contradicted} contradicted, ${indistinguishable} ` +
        `indistinguishable`) +
      `, ${unreadable} without a figure ` +
      `(${refusedByGate} refused by the gate, ${gateCouldNotJudge} the ` +
      `gate could not judge, ${thin} thin, ${notHeldBack} not held back (absolute figures withheld), ${unevidenced} accepted but ` +
      `unevidenced in the confirm fold, ${missingVerdict} with no verdict ` +
      `at all) -> ${prefix}-confirm-read.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
