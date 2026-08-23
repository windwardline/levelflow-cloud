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
import { assertInDomain, flagReader } from "./flagReader.ts";

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


// Every flag that owns the token after it, declared literally so the path
// walker above cannot swallow a value as a shard name. The law is
// bidirectional — each of these is read through a guarded accessor below.
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
  // A flag's VALUE is not a corpus path: drop any token that directly follows
  // a --flag, so `--bucket-minutes 60` cannot be read as a shard named "60".
  const corpora = argv.reduce<string[]>((kept, token, index) => {
    if (token.startsWith("--")) {
      return kept;
    }
    if (index > 0 && argv[index - 1].startsWith("--")) {
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

  const bucketMs = bucketMinutes * 60_000;
  const groups = new Map<string, Group>();
  for (const row of candidates) {
    const bucket = Math.floor(row.time / bucketMs);
    const key = collapseGroupKey({
      correlationGroup: getCorrelationGroup(row.symbol),
      symbol: row.symbol,
    });
    const id = `${bucket} ${key}`;
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

  const suppressionRate = candidates.length === 0
    ? null
    : suppressed / candidates.length;
  console.log(
    `suppression ${suppressed}/${candidates.length} = ${
      suppressionRate === null ? "—" : (suppressionRate * 100).toFixed(1) + "%"
    } of accepted candidates — a LOWER BOUND: the cross-scan 6-hour screen is ` +
      `not modelled here`,
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
  await main();
}
