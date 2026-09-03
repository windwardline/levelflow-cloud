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
import { gradeCorpus, type VariantVerdict } from "./grid-totalr.ts";
import { assertManifest } from "./sweepStats.ts";
import { resolveHeldOut } from "./sweepFolds.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";
import {
  describeNumericToken,
  describeToken,
  assertInDomain,
  soleFlagIndex,
  tokenFault,
  type NumericDomain,
} from "./flagReader.ts";

// The ONE declaration of which flags own the token after them (#364
// round 44, smaller) — the form rounds 33–38 installed in the four
// dialed readers, at the two 4d scripts they did not reach.
const VALUE_FLAGS = new Set([
  "--baseline",
  "--out",
  "--targets",
  "--permutations",
  "--seed",
]);

type MarketCandidates = {
  /** In the stratified held-out set — graded and labelled, never dropped (R4 act 2). */
  heldOut: boolean;
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
  // Positional args are shard paths; a DECLARED value flag consumes the
  // token after it, and nothing else does (#364 round 44, smaller). The
  // inverted form that stood here listed the flags taking no value and
  // consumed the next token for every other --flag, and its comment
  // claimed "a flag VALUE can never masquerade as a path" — true, but
  // the inverse was the live hazard: a typo'd or newly-added boolean
  // flag ate the shard PATH after it and the run graded a corpus one
  // shard short, silently.
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
          `shard paths; pass ${arg} <number>`,
      );
    }
    if (domain !== undefined) assertInDomain(arg, parsed, domain);
    return parsed;
  };
  const baselineVariant = str("--baseline") ?? "baseline";
  const outPath = str("--out") ??
    "docs/research/baseline-2026-08-10/4d-candidates.json";
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
    // The ONE holdout population (R4 act 2): the stratified set over the
    // REQUESTED roster, verified against the anchor's tracked pin — never
    // over the symbols that happen to have rows.
    symbolFilter = new Set(resolveHeldOut(paths.map((path) => assertManifest(path))).held);
    console.log(
      `holdout cycle: ${symbolFilter.size} held-out markets -> ${
        [...symbolFilter].sort().join(",")
      }`,
    );
  }

  // Totality mode: explicit target list + per-market re-cut folds; the
  // targets ride the surgical filter and holdout members are included
  // (their rows are the whole point).
  const targetsFlag = str("--targets");
  if (targetsFlag) {
    symbolFilter = new Set(
      targetsFlag.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
    );
    console.log(`targets: ${symbolFilter.size} markets`);
  }
  const { heldOutSet, manifest, verdicts } = await gradeCorpus(paths, {
    baselineVariant,
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
      // Labelled, never dropped: the market unit grades every market (R4 act 2).
      heldOut: heldOutSet.includes(symbol),
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
  writeResearchArtifact(outPath, summary);

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
