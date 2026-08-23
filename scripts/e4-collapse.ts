/**
 * R1c — the E4 correlation-collapse instrument.
 *
 * Production collapses correlated candidates within a scan and the sweep does
 * not, so the corpus overstates concurrent exposure and never measures the
 * selection the live engine performs. This replays that selection over corpus
 * rows and reports what it would have changed.
 *
 *   npx tsx scripts/e4-collapse.ts <emit.jsonl> [<emit.jsonl> ...] \
 *     --bucket-minutes 60 [--variant baseline] [--min-groups 30] \
 *     [--permutations 2000]
 *
 * It replays the live rule rather than a transcription of it: the grouping key,
 * the comparator and the winner-first ordering are imported from
 * scanCollapse.ts, which index.ts also calls.
 *
 * THREE THINGS THIS INSTRUMENT DOES NOT DO, stated here because each is a way
 * a number from it could be over-read:
 *
 * 1. It does not model the cross-scan 6-hour screen
 *    (findStrongerActiveCorrelatedSetup). That mechanism is a database query
 *    over trade_setups scoped to a user, a 6-hour created_at window and
 *    `status in (generated, placed)` — none of which the corpus has — and its
 *    input is the collapse's own output, since persistence runs after the
 *    collapse. Modelling it offline means inventing a persistence state
 *    machine, and every invented rule would be an unpinned assumption inside a
 *    figure the program reads as a measurement. So the suppression reported
 *    here is a LOWER BOUND on total live suppression, and says so in the
 *    report.
 * 2. It does not reconstruct the historical roster. Group membership is read
 *    from today's symbols.ts, not from the roster as it stood at each decision
 *    instant.
 * 3. It does not decide whether the sweep should collapse in-line. That is the
 *    Phase 3 question this measurement informs, and it is expensive: the sweep
 *    emits each symbol's rows before the next begins and shards split
 *    correlation clusters, so in-line collapse means buffering across every
 *    symbol and shard, or re-sharding by cluster — either of which changes
 *    corpus identity and spends the one re-sweep.
 */
import { fileURLToPath } from "node:url";
import {
  collapseGroupKey,
  comparatorRewardRisk,
  rankCollapseGroup,
} from "../supabase/functions/trade-analyzer/scanCollapse.ts";
import { getCorrelationGroup } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  assertManifestedCorpusStreaming,
  type SweepEmitRow,
} from "./sweepStats.ts";
import { assertInDomain, flagReader, OperatorInputError } from "./flagReader.ts";

// The comparator's inputs plus what grading needs. Projected explicitly rather
// than through vocabularyRow, whose closed key set exists for a different
// reader and would silently drop executionScore — the R1b lesson about closed
// projections, one reader over.
type CollapseRow = {
  accepted: boolean;
  confidenceScore: number;
  dataAbsent: boolean;
  executionScore: number | undefined;
  realizedR: number;
  rewardRisk: number;
  symbol: string;
  time: number;
  variant: string;
};

type Group = {
  bucket: number;
  key: string;
  members: CollapseRow[];
};


// Every flag that owns the token after it, declared literally. The law is
// bidirectional — each of these is read through a guarded accessor in main().
//
// This set does DOUBLE duty, and the second job constrains what can be added:
// main() refuses any `--` token that is not a member, and its corpus-path
// walker skips a token only when its predecessor IS a member. So a future
// BOOLEAN flag has no legal home here — left out, the unknown-flag gate
// refuses it; put in, it must be read through num()/str() to satisfy the flag
// law (tests/sweepManifest.test.ts), which a boolean is not. Adding one means
// changing both, deliberately.
const VALUE_FLAGS = new Set([
  "--bucket-minutes",
  "--min-groups",
  "--permutations",
  "--variant",
]);

const MIN_GROUPS_DEFAULT = 30;
const PERMUTATIONS_DEFAULT = 2_000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// A deterministic RNG so a rerun of the same corpus reproduces the same p.
// Deliberately local: grid-totalr.ts's permutation null is a two-sample block
// permutation over baseline/variant day blocks, a different statistic from the
// within-group selection null below, and its mulberry32 is module-private
// inside the fingerprinted statistical core that HANDOFF pins. Converging the
// two seeds into scripts/sweepStats.ts — the stated home of the one stats
// vocabulary — is a named follow-up, not something to do inside this reader.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// The live collapse ranks on payoff QUANTIZED to two decimals, because the scan
// candidate carries confluence.rewardRisk and analyzeSetup writes that rounded.
// The emit carries full precision. Quantizing here is what makes tier 3 bind at
// the rate it binds live instead of being skipped.
function asLiveCandidate(row: CollapseRow) {
  return {
    confidenceScore: row.confidenceScore,
    correlationGroup: getCorrelationGroup(row.symbol),
    executionScore: row.executionScore,
    rewardRisk: comparatorRewardRisk(row.rewardRisk),
    symbol: row.symbol,
  };
}

function project(raw: SweepEmitRow): CollapseRow | null {
  const time = Number(raw.time);
  const realizedR = Number(raw.realizedR);
  const symbol = String(raw.symbol ?? "");
  if (!Number.isFinite(time) || !symbol) {
    return null;
  }
  return {
    accepted: raw.accepted === true,
    confidenceScore: Number(raw.confidenceScore ?? 0),
    dataAbsent: raw.noBarsInReviewWindow === true,
    executionScore: raw.executionScore === undefined
      ? undefined
      : Number(raw.executionScore),
    realizedR: Number.isFinite(realizedR) ? realizedR : Number.NaN,
    rewardRisk: Number(raw.rewardRisk ?? 0),
    symbol,
    time,
    variant: String(raw.variant ?? ""),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // An UNDECLARED flag refuses, before anything is walked. Without this the
  // walker below silently halved a population: `--capture-all a.jsonl b.jsonl`
  // dropped `a.jsonl` as if it were --capture-all's value and reported
  // `shards 1` over one of the two named shards, exit 0. --capture-all is a
  // real sibling flag on replay-sweep.ts, so this needed no future boolean flag
  // to bite. flagReader cannot catch it — its guard fires when the SCRIPT reads
  // an undeclared flag, never when the OPERATOR types one, which is exactly the
  // third failure mode flagReader's own header names.
  //
  // It also closes the quieter half: `--min-groupz 50` would otherwise leave
  // min-groups at its default with no word said, which is the "a run measures
  // something other than what was asked" class this reader exists inside.
  // Single dash too. `-variant baseline` is a typo an operator makes, and
  // keying on `--` alone let it fall through to the corpus list and die in the
  // manifest reader as a plain Error with a full stack — the shape the entry
  // point deliberately reserves for genuine faults.
  const undeclared = argv.filter(
    (token) =>
      /^-{1,2}[A-Za-z]/.test(token) && !VALUE_FLAGS.has(token),
  );
  if (undeclared.length > 0) {
    fail(
      `unknown flag(s) ${undeclared.join(", ")} — this reader declares ${
        [...VALUE_FLAGS].sort().join(", ")
      }. Refused rather than ignored: an unrecognised flag's next token would ` +
        `be walked into the shard list, or silently leave a dial at its default.`,
    );
  }

  // A declared flag's VALUE is not a corpus path. Consults VALUE_FLAGS rather
  // than "any token starting with --", which is what the sibling readers do.
  //
  // Behaviourally this is DEFENCE IN DEPTH, not an independently observable
  // half: the gate above already refuses every `--` token outside VALUE_FLAGS,
  // so by the time control reaches here the two forms are pointwise identical
  // and reverting this line leaves every black-box test green. It is pinned by
  // the walker law in `tests/sweepManifest.test.ts` instead — a source law,
  // because that is the only thing that CAN pin it — and it is the right form
  // to keep, so the day the gate is relaxed the walker does not become the
  // defect on its own.
  const corpora = argv.reduce<string[]>((kept, token, index) => {
    if (token.startsWith("--")) {
      return kept;
    }
    if (index > 0 && VALUE_FLAGS.has(argv[index - 1])) {
      return kept;
    }
    kept.push(token);
    return kept;
  }, []);

  if (corpora.length === 0) {
    fail(
      "usage: e4-collapse.ts <emit.jsonl> [<emit.jsonl> ...] --bucket-minutes N\n" +
        "no corpus named — the E4 collapse instrument reads one or more " +
        "manifested sweep emit shards and cannot report over zero rows. Pass " +
        "every shard of one sweep: the shards split correlation clusters, so " +
        "a subset measures a suppression rate lower than the truth.",
    );
  }

  const { num, str } = flagReader(argv, VALUE_FLAGS);

  // No default, deliberately. The corpus has no notion of a scan — decision
  // instants are per-symbol bar indices over series with different spans, so
  // correlated symbols rarely share a timestamp. The bucket is how wide a
  // window counts as "the same scan", and a default would hide a measurement
  // term inside the code instead of printing it in the report.
  const bucketToken = str("--bucket-minutes");
  if (bucketToken === undefined) {
    fail(
      "--bucket-minutes is required and has no default — it is a measurement " +
        "term. The corpus has no notion of a scan, so the bucket is what " +
        "decides which decisions counted as concurrent, and it belongs in the " +
        "report rather than in this file.",
    );
  }
  // Buckets are epoch-aligned (`Math.floor(row.time / bucketMs)` below), so the
  // reading is sensitive to bin PHASE as well as width: two candidates two
  // minutes apart can land either side of a boundary and not contest. That is
  // the other half of why the width is a declared term — and it is why a wider
  // bucket does not monotonically suppress more, since widening also absorbs a
  // symbol's own repeats.
  const bucketMinutes = Number(bucketToken);
  if (!Number.isFinite(bucketMinutes)) {
    fail(`--bucket-minutes must be a number and got ${JSON.stringify(bucketToken)}`);
  }
  assertInDomain("--bucket-minutes", bucketMinutes, {
    basis:
      "a bucket must span at least one minute; the width is stated in the " +
      "report because it decides which decisions counted as concurrent",
    integer: true,
    min: 1,
  });

  const minGroups = num("--min-groups", MIN_GROUPS_DEFAULT, {
    basis:
      "below this many fully graded contested groups the delta's sign is not " +
      "informative in either direction, so the reader withholds a verdict " +
      "rather than reporting a thin negative as reassurance",
    integer: true,
    min: 1,
  });
  const permutations = num("--permutations", PERMUTATIONS_DEFAULT, {
    basis:
      "the smallest attainable p is 1/(permutations+1), so 2,000 puts 0.05 " +
      "comfortably inside reach",
    integer: true,
    min: 100,
  });
  const requestedVariant = str("--variant");

  const rows: CollapseRow[] = [];
  const manifests: Awaited<ReturnType<typeof assertManifestedCorpusStreaming>>[] = [];
  const hashes: string[] = [];
  const engines = new Set<string>();
  const clocks = new Set<string>();
  let unreadable = 0;

  for (const corpus of corpora) {
    const manifest = await assertManifestedCorpusStreaming(corpus, (raw) => {
      const row = project(raw);
      if (row === null) {
        unreadable += 1;
        return;
      }
      rows.push(row);
    });
    manifests.push(manifest);
    hashes.push(manifest.manifestHash.slice(0, 12));
    engines.add(manifest.analyzerVersion);
    clocks.add(`${manifest.clock?.normalizer}/${manifest.clock?.calendar}`);
  }

  // Two sweeps of different engine, clock, DEPTH or stated terms are two
  // measurements. Refused rather than pooled, on the reasoning that keeps
  // `days` inside the corpus identity in grid-totalr.ts — and the check now
  // covers what that reasoning covers, rather than citing it while testing
  // less. `grid-totalr.ts`'s `conditionsOf` is the fuller predicate and is
  // module-private; the overlap that matters for pooling shards is asserted
  // here, and lifting one shared predicate into sweepStats.ts is the named
  // follow-up.
  const identities = new Set(
    manifests.map((manifest) =>
      JSON.stringify({
        calendar: manifest.clock?.calendar,
        conditions: manifest.conditions ?? null,
        days: manifest.days,
        normalizer: manifest.clock?.normalizer,
        stepBars: manifest.stepBars,
        version: manifest.analyzerVersion,
      })
    ),
  );
  if (identities.size > 1) {
    fail(
      `the named shards are not one sweep — they differ in engine, clock, ` +
        `depth, step or stated conditions. Two sweeps are two measurements ` +
        `and cannot pool. Engines {${[...engines].join(", ")}}, clocks ` +
        `{${[...clocks].join(", ")}}, depths {${
          [...new Set(manifests.map((m) => m.days))].join(", ")
        }}, steps {${
          [...new Set(manifests.map((m) => m.stepBars))].join(", ")
        }}.`,
    );
  }
  if (unreadable > 0) {
    fail(
      `${unreadable} corpus rows carry no usable time or symbol — a holed ` +
        `corpus is refused, not shrunk`,
    );
  }

  // WIF-4, the zero-row rule by its second route: the door can pass a corpus
  // that is simply empty, and a report of zeros over nothing is a run that
  // examined nothing reporting success. Sibling readers close this
  // (threshold-rescue refuses "cells that matched no row"); so does this one.
  if (rows.length === 0) {
    fail(
      `the corpus carried no rows — ${corpora.join(", ")} passed the manifest ` +
        `door and is empty. A run over zero rows cannot report a suppression ` +
        `rate or a verdict.`,
    );
  }

  const variants = new Set(rows.map((row) => row.variant));
  if (requestedVariant === undefined && variants.size > 1) {
    fail(
      `the corpus carries ${variants.size} variants {${
        [...variants].sort().join(", ")
      }} and no --variant was named. The grid's variants are not live ` +
        `configurations, so pooling them measures a universe production never ` +
        `ran. Name the one that reproduces live's gates.`,
    );
  }
  const variant = requestedVariant ?? [...variants][0] ?? "";
  if (requestedVariant !== undefined && !variants.has(requestedVariant)) {
    fail(
      `--variant ${requestedVariant} is not in the corpus {${
        [...variants].sort().join(", ")
      }}`,
    );
  }

  const inVariant = rows.filter((row) => row.variant === variant);
  // Only an ACCEPTED setup ever became a scan opportunity, and only
  // opportunities reach the collapse. A capture-all corpus carries the
  // below-threshold rows too; they were never candidates.
  const candidates = inVariant.filter((row) => row.accepted);
  const dataAbsent = candidates.filter((row) => row.dataAbsent);
  const graded = candidates.filter(
    (row) => !row.dataAbsent && Number.isFinite(row.realizedR),
  );

  if (candidates.length === 0) {
    fail(
      `no ACCEPTED rows in variant ${JSON.stringify(variant)} — ${
        inVariant.length
      } rows matched the variant and none was accepted. Only an accepted setup ` +
        `became a scan opportunity, and only opportunities reach the collapse, ` +
        `so there is nothing here the live rule would ever have seen.`,
    );
  }

  const bucketMs = bucketMinutes * 60_000;
  const groups = new Map<string, Group>();
  for (const row of candidates) {
    const bucket = Math.floor(row.time / bucketMs);
    const key = collapseGroupKey({
      correlationGroup: getCorrelationGroup(row.symbol),
      symbol: row.symbol,
    });
    // The separator is NUL because no symbol or group name can contain it.
    // Written as an ESCAPE, never as a raw byte: a literal U+0000 in the source
    // makes ripgrep and git grep classify this whole file as binary and skip it,
    // which silently removes it from every grep-derived population audit — in a
    // repo whose discipline is derived populations rather than curated ones. It
    // shipped that way once and cost a review round to find.
    const id = `${bucket}\u0000${key}`;
    const existing = groups.get(id);
    if (existing) {
      existing.members.push(row);
      continue;
    }
    groups.set(id, { bucket, key, members: [row] });
  }

  // ONE ROW PER SYMBOL PER BUCKET, and this is a declared measurement rule.
  // Production sees each symbol exactly once per scan. A bucket does not: the
  // sweep steps decisions per symbol (`--step`, 16 bars = 4h by default), so any
  // bucket wider than the step holds several rows of the same symbol — and the
  // bucket must be wide, which is the whole premise of --bucket-minutes.
  //
  // Left in, those repeats corrupt both outputs. They would count as
  // suppression, inflating a figure labelled a LOWER BOUND in the direction
  // that makes the label false; and because `getCorrelationGroup` falls back to
  // the symbol itself, an ungrouped symbol's own repeats would form a
  // "contested" group and suppress itself, pushing intra-symbol time variation
  // into a statistic documented as measuring cross-symbol selection.
  //
  // The rule: keep the EARLIEST decision in the bucket, the one nearest the
  // instant the bucket is standing in for. The number of rows dropped is
  // printed, never silent — a rule that discards rows must say how many.
  let repeatsDropped = 0;
  for (const group of groups.values()) {
    const earliestBySymbol = new Map<string, CollapseRow>();
    for (const row of group.members) {
      const held = earliestBySymbol.get(row.symbol);
      if (held === undefined || row.time < held.time) {
        earliestBySymbol.set(row.symbol, row);
      }
    }
    repeatsDropped += group.members.length - earliestBySymbol.size;
    group.members = [...earliestBySymbol.values()];
  }

  const contested = [...groups.values()].filter(
    (group) => group.members.length > 1,
  );
  const singletons = groups.size - contested.length;

  let suppressed = 0;
  const deltas: number[] = [];
  const gradedGroups: CollapseRow[][] = [];
  for (const group of contested) {
    suppressed += group.members.length - 1;
    // A group contributes to the paired statistic only if EVERY member is
    // graded — a group with an ungradeable member has no honest mean to
    // compare its winner against.
    const members = group.members;
    if (!members.every((row) => !row.dataAbsent && Number.isFinite(row.realizedR))) {
      continue;
    }
    // Rank objects that CARRY their row. Resolving the winner back by symbol
    // returns the first row holding that symbol rather than the ranked one, so
    // the delta would be computed from a different row's realized R than the
    // collapse actually chose — silently, with no refusal and no marker.
    const winnerRow = rankCollapseGroup(
      members.map((row) => ({ ...asLiveCandidate(row), row })),
    )[0].row;
    deltas.push(winnerRow.realizedR - mean(members.map((row) => row.realizedR)));
    gradedGroups.push(members);
  }

  console.log(
    `corpus ${hashes.join("+")} · engine ${[...engines][0]} · clock ${
      [...clocks][0]
    }`,
  );
  console.log(
    `shards ${corpora.length} · variant ${variant || "(unnamed)"} · bucket ${bucketMinutes}min`,
  );
  console.log(
    `rows ${rows.length} → in-variant ${inVariant.length} → accepted ${candidates.length} ` +
      `(dataAbsent ${dataAbsent.length} held out, graded ${graded.length})`,
  );
  console.log(
    `groups ${groups.size} = contested ${contested.length} + singleton ${singletons}` +
      ` · ${repeatsDropped} repeat rows dropped (one row per symbol per bucket,` +
      ` earliest kept — production sees each symbol once per scan)`,
  );

  // The rate is taken over the population the collapse ACTUALLY ran over, not
  // over every accepted row. `suppressed` counts post-rule members, so dividing
  // by the pre-rule count named a rate of a process some of its denominator
  // never underwent. How far the two diverge is a function of the dial, not a
  // constant: repeats per symbol per bucket are bucketMinutes / (stepBars x 15),
  // so at --step 16 there are none below a 240-minute bucket and five in six are
  // dropped at 1440. Both counts print, because either alone misleads at some
  // bucket width.
  //
  // No zero guard: a corpus with no accepted rows refuses above, so the
  // denominator is non-zero by construction. The guard that used to sit here
  // rendered an em dash and could never fire — a dead branch reading as a live
  // one, on the line that prints the headline figure.
  const collapsedOver = candidates.length - repeatsDropped;
  console.log(
    `suppression ${suppressed}/${collapsedOver} = ${
      (suppressed / collapsedOver * 100).toFixed(1)
    }% of the rows the collapse ran over (${candidates.length} accepted, ` +
      `${repeatsDropped} dropped as same-symbol repeats) — a LOWER BOUND: the ` +
      `cross-scan 6-hour screen is not modelled here`,
  );

  if (deltas.length < minGroups) {
    console.log(
      `NO VERDICT — ${deltas.length} fully graded contested groups, floor ` +
        `${minGroups}. Below the floor the sign of the delta is not ` +
        `informative either way; this is not "within noise".`,
    );
    return;
  }

  const observed = mean(deltas);
  const random = mulberry32(0x0e4c0117);
  let atLeastAsExtreme = 0;
  for (let iteration = 0; iteration < permutations; iteration += 1) {
    let total = 0;
    for (const members of gradedGroups) {
      const picked = members[Math.floor(random() * members.length)];
      total += picked.realizedR - mean(members.map((row) => row.realizedR));
    }
    if (total / gradedGroups.length >= observed) {
      atLeastAsExtreme += 1;
    }
  }
  const p = (1 + atLeastAsExtreme) / (permutations + 1);

  console.log(
    `paired delta ${observed >= 0 ? "+" : ""}${observed.toFixed(4)}R per ` +
      `contested group over ${deltas.length} groups · p ${p.toFixed(4)} ` +
      `(${permutations} permutations, null = uniform within-group selection)`,
  );
  console.log(
    `  the estimand is paired per (bucket, group): the winner's realized R ` +
      `minus its own group's mean. Not a two-sample difference — a pooled ` +
      `uncollapsed mean weights each group by its size and the collapsed mean ` +
      `weights each group once, so any size/expectancy correlation would move ` +
      `that difference with no selection effect at all.`,
  );
  console.log(
    `  under an uninformative score the winner's R is distributionally a ` +
      `random member's, so the null expectation is ZERO and a positive delta ` +
      `is evidence about the rule.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Wrapped the way grid-totalr.ts wraps its own entry point. Every flag read
  // THROWS rather than calling fail() — flagReader's token(), assertInDomain
  // and soleFlagIndex all throw — so a bare `await main()` surfaced an
  // operator's typo as an unhandled rejection with a stack, while every other
  // refusal in this file prints one line. This repo's contract says a harness
  // failure must never read as the subject refusing; the converse holds too,
  // and without this a genuine internal TypeError and a mistyped dial were
  // indistinguishable in the output.
  await main().catch((error: unknown) => {
    // An operator's mistake prints one line; anything else keeps its stack.
    // Printing `.message` for BOTH was the first version of this fix and it
    // reproduced the very ambiguity it was written to remove — a genuine
    // TypeError exiting 1 with a single bare line, shaped exactly like a
    // refusal. Every sibling reader prints the error object; this one can do
    // better than that only because flagReader now names its own class.
    if (error instanceof OperatorInputError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  });
}
