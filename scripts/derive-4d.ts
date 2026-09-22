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
// never touches the confirm fold. Unknown flags are refused by name, in
// the walk the gate and confirm-4d share.
import { gradeCorpus, type VariantVerdict } from "./grid-totalr.ts";
import { assertManifest } from "./sweepStats.ts";
import { resolveGradingPopulation } from "./sweepFolds.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";
import {
  describeNumericToken,
  describeToken,
  assertInDomain,
  OperatorInputError,
  positionalArgs,
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

// The flags that own no token, declared so an UNKNOWN flag is refused by
// name rather than walked past in silence (2026-09-21) — the form
// grid-totalr has carried since R4 act 2 (#570), at the sibling it
// never reached. `--per-market-folds` is declared KNOWN so its own refusal
// below, which says what the re-cut did to the held-back fold, wins over
// the generic one.
const BOOLEAN_FLAGS = new Set([
  "--holdout-cycle",
  "--per-market-folds",
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
  // history cannot carry a derivation at all. Derived from row counts, so it
  // sees only part of the empty-fit leg; `unjudged` is the gate's own word.
  starved: boolean;
  // EVERY variant reached NO VERDICT — the gate declined to judge rather than
  // judging and refusing. `measureOnly` covers both, and they have opposite
  // next moves: a refused market has been measured, an unjudged one has not.
  unjudged: boolean;
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
  // shard short, silently. Round 44 kept a hazard of its own — an
  // undeclared flag was walked past in silence — closed 2026-09-21 by
  // the shared walk, which refuses it by name.
  const paths = positionalArgs(argv, VALUE_FLAGS, BOOLEAN_FLAGS, "derive-4d");
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
      throw new OperatorInputError(
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
      throw new OperatorInputError(
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
    throw new OperatorInputError(
      "--per-market-folds was retired on 2026-09-02: it re-cut each market's " +
        "span at 50/75% from row instants and, under --confirm-final, " +
        "relabelled a median 329 days of the held-back fold into select. " +
        "Grade on the emitted per-class folds (the per-class corpus " +
        "docs/research/r3/capture-all-classfolds.jsonl); the per-market " +
        "grain is already on.",
    );
  }
  if (paths.length === 0) {
    throw new OperatorInputError("derive-4d: no corpus shards given");
  }

  // The holdout cycle (owner word, 2026-08-11) grades ONLY the markets the
  // read-time stratification held out of every tuning aggregate; totality
  // mode grades an explicit target list, holdout members included (their rows
  // are the whole point). The two are never taken together, and a target off
  // every shard's roster refuses by name (resolveGradingPopulation, shared
  // with confirm-4d): `--targets EURGBP,GBPJYP` used to write candidates for
  // EURGBP alone and say nothing, leaving GBPJPY none for confirm-4d to pick.
  const holdoutCycle = argv.includes("--holdout-cycle");
  const targetsFlag = str("--targets");
  const { heldOut, symbolFilter } = resolveGradingPopulation({
    holdoutCycle,
    manifests: paths.map((path) => assertManifest(path)),
    script: "derive-4d",
    targetsFlag,
  });
  if (heldOut !== undefined) {
    console.log(`holdout cycle: ${heldOut.length} held-out markets -> ${heldOut.join(",")}`);
  }
  if (targetsFlag !== undefined && symbolFilter !== undefined) {
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
    // THE GATE'S OWN DISPOSITION, not a row count. `starved` is derived from
    // `fitFilled < 30`, which covers part of the empty-fit leg and none of
    // underpowered, sub-floor pairing or absent baseline — so a market the gate
    // could not judge on any variant was published as `measureOnly`, which is
    // what a market whose variants were MEASURED and refused also reads as.
    // Those are opposite next moves, and the ladder already knows which is
    // which (#647, and the three consumer leaks repaired beside this one).
    const unjudged = rows.length > 0 && rows.every(([, verdict]) => verdict.noVerdict);
    markets[symbol] = {
      // Labelled, never dropped: the market unit grades every market (R4 act 2).
      heldOut: heldOutSet.includes(symbol),
      accepted,
      measureOnly: accepted.length === 0,
      starved,
      unjudged,
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
  // The categories OVERLAP and are counted that way. Suppressing `unjudged`
  // when `starved` is also true would let a row count hide the ladder's own
  // word — and a thin corpus, where every fit fold is under 30 rows, is exactly
  // when the gate judges nothing and the distinction is worth having. Printing
  // `0 unjudged` for a run in which nothing was judged is the failure this
  // whole change set exists to stop.
  const unjudged = Object.values(markets).filter((m) => m.unjudged).length;
  // Same overlap rule for the bucket beside it. `starved` is counted
  // independently and does not subtract here, because it is
  // `every(fitFilled < 30)` rather than `=== 0`: a market with thin but
  // NONEMPTY fit folds clears the evidence guard and is genuinely judged and
  // refused, so subtracting it would let a row count hide a real measurement.
  //
  // The one subtraction that stays is `unjudged`, and it is sound because
  // `unjudged` IMPLIES `measureOnly`: acceptance requires `beatsBaseline`,
  // which requires the pairing floor, and every no-verdict leg empties or
  // fails that floor, so no unjudged market carries an accept. That invariant
  // lives in `grid-totalr`'s ladder and is named here because this line rests
  // on it.
  //
  // A market with NO graded variants — a group whose only variant is the
  // baseline, which the verdict loop skips — is `measureOnly` with nothing
  // measured. `rows.length > 0` guards the two flags above, so it reads
  // neither starved nor unjudged. Unreachable on a real 4d sweep, where every
  // market carries the whole grid, and called out because the label now claims
  // a disposition where it used to name a residual.
  const measureOnly = Object.values(markets).filter((m) =>
    m.measureOnly && !m.unjudged
  ).length;
  const starved = Object.values(markets).filter((m) => m.starved).length;
  console.log(
    `4d candidates: ${tuned} markets with accepted variants, ` +
      `${measureOnly} measured and refused, ${unjudged} unjudged, ` +
      `${starved} starved -> ${outPath}`,
  );
}

main().catch((error) => {
  // An operator's typo refuses in one line; a real fault keeps its stack.
  console.error(error instanceof OperatorInputError ? error.message : error);
  process.exit(1);
});
