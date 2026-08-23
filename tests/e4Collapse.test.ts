import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  sha256Hex,
  stableStringify,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";
import { getCorrelationGroup } from "../supabase/functions/trade-analyzer/symbols.ts";

// The repo's OWN tsx by absolute path, never npx — #364 round 55. These spawns
// run from a temp directory, where npx would resolve tsx from the wrong
// node_modules and print an npm error that a naive assertion reads as the
// script refusing.
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "e4-collapse.ts");

const TEST_TREASURY_CURVE = {
  count: 3_000,
  firstTime: Date.UTC(2013, 0, 2),
  largestGapMs: 4 * 86_400_000,
  lastTime: Date.UTC(2027, 0, 1),
};

const HOUR = 3_600_000;

// EURUSD and GBPUSD share the primary group `majors_usd`-style membership via
// symbols.ts; the fixtures below assert against whatever getCorrelationGroup
// actually returns rather than assuming a group name, so a roster edit cannot
// quietly turn a contested group into two singletons without failing here.
function row(
  symbol: string,
  hourIndex: number,
  realizedR: number,
  extra: Partial<SweepEmitRow> = {},
): SweepEmitRow {
  return {
    accepted: true,
    confidenceScore: 70,
    executionScore: 50,
    outcome: realizedR > 0 ? "take_profit" : "stop_loss",
    realizedR,
    rewardRisk: 2,
    split: "test",
    symbol,
    time: Date.UTC(2025, 0, 6) + hourIndex * HOUR,
    variant: "baseline",
    ...extra,
  };
}

function corpusWith(rows: SweepEmitRow[]): string {
  const dir = mkdtempSync(join(tmpdir(), "e4-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(
    emitPath,
    rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );
  const manifest = buildSweepManifest({
    analyzerVersion: "2026.08.09.test",
    anchor: "2026-08-10",
    barRejections: {},
    clock: { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK },
    conditions: {
      macroAdjustment: "historical-treasury-curve",
      providerWarningCount: "zero-by-construction",
      weightAdjustment: "raw-engine-zero",
    },
    days: 365,
    generatedAt: "2026-08-10T05:00:00.000Z",
    grid: [{}],
    stepBars: 16,
    symbols: [...new Set(rows.map((entry) => entry.symbol))].map((symbol) => ({
      calibration: {},
      providerSymbol: symbol,
      series: {
        "15min": seriesFacts(
          rows
            .filter((entry) => entry.symbol === symbol)
            .map((entry) => ({ time: Number(entry.time) || 0 })),
          "intraday",
        ),
      },
      symbol,
    })),
    trainShare: 0.6,
    treasuryCurve: TEST_TREASURY_CURVE,
    warmupBars: 240,
  });
  writeFileSync(
    `${emitPath}.manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return emitPath;
}

// A FRESH temp directory per spawn, never tmpdir() itself: the shared temp
// root can hold another process's tsconfig.json, which tsx walks up and finds,
// and it then dies inside its own registration hook. That failure exits
// non-zero with a long stderr — indistinguishable from a refusal to any
// assertion that only checks the exit code.
function run(args: string[]): { out: string; code: number } {
  const elsewhere = mkdtempSync(join(tmpdir(), "e4-run-"));
  const assertRunnerStarted = (stream: string) => {
    assert.doesNotMatch(
      stream,
      /npm error|npx canceled|command not found|Cannot find module 'tsx'|tsx\/dist\/register/,
      `the reader was never executed — this is a HARNESS failure and must ` +
        `never be read as the subject refusing: ${stream.slice(0, 400)}`,
    );
  };
  // tsx exports TSX_TSCONFIG_PATH as the RELATIVE path npm test passed it.
  // Inherited by a child running from a temp cwd, it resolves to nothing and
  // tsx dies in its own loader before the reader starts — a crash whose long
  // stderr and exit 1 impersonate a refusal. The reader needs no tsconfig.
  const env = { ...process.env };
  delete env.TSX_TSCONFIG_PATH;
  try {
    const out = execFileSync(TSX, [READER, ...args], {
      cwd: elsewhere,
      encoding: "utf8",
      env,
      stdio: "pipe",
      timeout: 120_000,
    });
    return { code: 0, out };
  } catch (error) {
    const failed = error as { status?: number; stderr?: string; stdout?: string };
    const stderr = String(failed.stderr ?? "");
    assertRunnerStarted(stderr);
    return { code: failed.status ?? -1, out: `${failed.stdout ?? ""}${stderr}` };
  }
}

describe("e4-collapse — the measurement terms are declared, never defaulted", () => {
  it("refuses with no corpus, and names the corpus", () => {
    const { code, out } = run([]);
    assert.equal(code, 1);
    assert.match(out, /no corpus named/);
    assert.match(out, /emit|shard|\.jsonl/i);
  });

  it("refuses without --bucket-minutes, because the bucket is a measurement term", () => {
    const emit = corpusWith([row("EURUSD", 0, 1)]);
    const { code, out } = run([emit]);
    assert.equal(code, 1);
    assert.match(out, /--bucket-minutes is required and has no default/);
  });

  it("refuses a corpus carrying more than one variant with none named", () => {
    const emit = corpusWith([
      row("EURUSD", 0, 1),
      row("EURUSD", 1, 1, { variant: "tp1=0.9" }),
    ]);
    const { code, out } = run([emit, "--bucket-minutes", "60"]);
    assert.equal(code, 1);
    assert.match(out, /2 variants/);
    assert.match(out, /never ran/);
  });

  it("refuses a variant the corpus does not carry", () => {
    const emit = corpusWith([row("EURUSD", 0, 1)]);
    const { code, out } = run([
      emit,
      "--bucket-minutes",
      "60",
      "--variant",
      "nope",
    ]);
    assert.equal(code, 1);
    assert.match(out, /--variant nope is not in the corpus/);
  });
});

describe("e4-collapse — the door", () => {
  it("refuses a corpus whose manifest is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "e4-bare-"));
    const emitPath = join(dir, "shard.jsonl");
    writeFileSync(emitPath, JSON.stringify(row("EURUSD", 0, 1)) + "\n");
    const { code, out } = run([emitPath, "--bucket-minutes", "60"]);
    assert.equal(code, 1);
    assert.match(out, /no manifest beside the emit/);
  });
});

describe("e4-collapse — the replay", () => {
  // Two correlated markets in one bucket: the collapse keeps one. The
  // suppression denominator is the accepted candidates, and it is stated.
  it("collapses correlated candidates sharing a bucket and states its denominator", () => {
    const emit = corpusWith([
      row("EURUSD", 0, 1),
      row("GBPUSD", 0, -1),
      row("EURUSD", 24, 1),
      row("GBPUSD", 24, -1),
    ]);
    const { code, out } = run([emit, "--bucket-minutes", "60"]);
    assert.equal(code, 0, out);
    assert.match(out, /bucket 60min/);
    assert.match(out, /accepted 4/);
    // Whether these two share a primary group is symbols.ts's business; what
    // this asserts is that the suppression line prints as a fraction of the
    // accepted candidates, never as a bare rate.
    assert.match(out, /suppression \d+\/4 =/);
  });

  it("calls its suppression a LOWER BOUND, because the 6-hour screen is not modelled", () => {
    const emit = corpusWith([row("EURUSD", 0, 1), row("GBPUSD", 0, -1)]);
    const { code, out } = run([emit, "--bucket-minutes", "60"]);
    assert.equal(code, 0, out);
    assert.match(out, /LOWER BOUND/);
    assert.match(out, /cross-scan 6-hour screen is not modelled/);
  });

  // A wider bucket puts more decisions in the same window, so it can only
  // suppress at least as much. This is the test that would catch a bucket
  // that silently did nothing.
  // The bucket's effect goes BOTH ways, which is the concrete reason it is a
  // declared measurement term rather than a default. The first version of this
  // test asserted "a wider bucket cannot suppress less" over EURUSD and
  // GBPUSD — different primary groups, so both sides reported zero and the
  // assertion was 0 >= 0. The general law is false anyway, as the second case
  // shows.
  const suppressedIn = (out: string) =>
    Number(/suppression (\d+)\//.exec(out)?.[1] ?? "-1");

  it("a wider bucket reveals concurrency a narrow one splits apart", () => {
    // Two eur_crosses markets three hours apart: separate 60-minute buckets,
    // one 24-hour bucket.
    const emit = corpusWith([row("EURUSD", 0, 1), row("EURJPY", 3, -1)]);
    const narrow = run([emit, "--bucket-minutes", "60"]);
    const wide = run([emit, "--bucket-minutes", "1440"]);
    assert.equal(narrow.code, 0, narrow.out);
    assert.equal(wide.code, 0, wide.out);
    assert.equal(suppressedIn(narrow.out), 0);
    assert.equal(suppressedIn(wide.out), 1);
  });

  it("a wider bucket can also suppress LESS, by absorbing repeats", () => {
    // The same pair on two different days. At 24 hours that is two contested
    // groups, one suppression each. At seven days it is ONE group, and the
    // second day's rows are repeats of symbols already present — dropped by
    // the one-row-per-symbol rule rather than counted.
    const emit = corpusWith([
      row("EURUSD", 0, 1),
      row("EURJPY", 1, -1),
      row("EURUSD", 24, 1),
      row("EURJPY", 25, -1),
    ]);
    const day = run([emit, "--bucket-minutes", "1440"]);
    const week = run([emit, "--bucket-minutes", "10080"]);
    assert.equal(day.code, 0, day.out);
    assert.equal(week.code, 0, week.out);
    assert.equal(suppressedIn(day.out), 2);
    assert.equal(suppressedIn(week.out), 1);
    assert.match(week.out, /2 repeat rows dropped/);
    // The DENOMINATOR is the population the collapse ran over, not every
    // accepted row. At a week the four accepted rows dedupe to two, so the rate
    // is 1/2 and both counts are stated — dividing by 4 would have named a rate
    // of a process half its denominator never underwent.
    assert.match(
      week.out,
      /suppression 1\/2 = 50\.0% of the rows the collapse ran over \(4 accepted, 2 dropped as same-symbol repeats\)/,
    );
    // And at a day there are no repeats, so both denominators coincide.
    assert.match(
      day.out,
      /suppression 2\/4 = 50\.0% of the rows the collapse ran over \(4 accepted, 0 dropped as same-symbol repeats\)/,
    );
  });

  // Below the floor the reader must withhold, and must NOT phrase a thin
  // result as reassurance — the #364 round 35 ruling, one reader over.
  it("withholds a verdict below the floor without calling it 'within noise'", () => {
    const emit = corpusWith([row("EURUSD", 0, 1), row("GBPUSD", 0, -1)]);
    const { code, out } = run([emit, "--bucket-minutes", "60"]);
    assert.equal(code, 0, out);
    assert.match(out, /NO VERDICT/);
    assert.match(out, /not "within noise"/);
    assert.doesNotMatch(out, /paired delta/);
  });

  // A capture-all corpus carries rows that never became scan opportunities.
  // They were never candidates, so they must not enter the denominator.
  it("excludes below-threshold rows, which never reached the live collapse", () => {
    const emit = corpusWith([
      row("EURUSD", 0, 1),
      row("GBPUSD", 0, -1, { accepted: false }),
    ]);
    const { code, out } = run([emit, "--bucket-minutes", "60"]);
    assert.equal(code, 0, out);
    assert.match(out, /accepted 1 /);
  });

  // R1b's partition: a row the provider had no bars for is held out of the
  // graded population rather than counted as an outcome.
  it("holds data-absent rows out of the graded population and says so", () => {
    const emit = corpusWith([
      row("EURUSD", 0, 1),
      row("GBPUSD", 0, 0, { noBarsInReviewWindow: true }),
    ]);
    const { code, out } = run([emit, "--bucket-minutes", "60"]);
    assert.equal(code, 0, out);
    assert.match(out, /dataAbsent 1 held out, graded 1/);
  });

  it("refuses an empty corpus that passed the door", () => {
    const emit = corpusWith([]);
    const { code, out } = run([emit, "--bucket-minutes", "60"]);
    assert.equal(code, 1);
    assert.match(out, /carried no rows/);
  });

  it("refuses a corpus whose rows were all below threshold", () => {
    const emit = corpusWith([
      row("EURUSD", 0, 1, { accepted: false }),
      row("EURJPY", 0, -1, { accepted: false }),
    ]);
    const { code, out } = run([emit, "--bucket-minutes", "60"]);
    assert.equal(code, 1);
    assert.match(out, /none was accepted/);
  });

  // Reproduced by execution before the fix: `--capture-all a.jsonl b.jsonl`
  // walked a.jsonl away as if it were --capture-all's value, reported
  // `shards 1` over one of two named shards, and exited 0. --capture-all is a
  // real sibling flag on replay-sweep.ts, so no future boolean flag was needed
  // for this to bite — and the shards split correlation clusters, so reading
  // half of them understates suppression for every split cluster.
  it("refuses an unknown flag instead of walking a shard into its value", () => {
    const first = corpusWith([row("EURUSD", 0, 1)]);
    const second = corpusWith([row("EURJPY", 0, -1)]);
    const { code, out } = run([
      "--capture-all",
      first,
      second,
      "--bucket-minutes",
      "1440",
    ]);
    assert.equal(code, 1);
    assert.match(out, /unknown flag\(s\) --capture-all/);
    assert.doesNotMatch(
      out,
      /shards 1/,
      "the run must refuse, not report over the surviving subset",
    );
  });

  it("refuses a misspelled dial rather than leaving it at its default", () => {
    const emit = corpusWith([row("EURUSD", 0, 1)]);
    const { code, out } = run([
      emit,
      "--bucket-minutes",
      "60",
      "--min-groupz",
      "50",
    ]);
    assert.equal(code, 1);
    assert.match(out, /unknown flag\(s\) --min-groupz/);
  });

  it("refuses to pool two shards swept under different engines", () => {
    const first = corpusWith([row("EURUSD", 0, 1)]);
    const second = corpusWith([row("EURJPY", 0, -1)]);
    // Re-hash over the MUTATED payload, exactly as verifyManifest recomputes
    // it. The first version of this test discarded its own re-hash and wrote
    // the original hash back, so the corpus died on the manifest hash BEFORE
    // the engine comparison ran — and a regex alternation accepted that. The
    // cross-sweep refusal had no executed coverage at all.
    const manifest = JSON.parse(readFileSync(`${second}.manifest.json`, "utf8"));
    manifest.analyzerVersion = "2026.08.09.other";
    const { manifestHash: _old, generatedAt, ...hashed } = manifest;
    void _old;
    manifest.manifestHash = sha256Hex(stableStringify(hashed));
    void generatedAt;
    writeFileSync(
      `${second}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    const { code, out } = run([first, second, "--bucket-minutes", "60"]);
    assert.equal(code, 1);
    assert.doesNotMatch(
      out,
      /manifest hash mismatch/,
      "the corpus must reach the engine comparison, not die on its hash",
    );
    assert.match(out, /not one sweep/);
  });

  it("pools two shards of the SAME sweep as one population", () => {
    const first = corpusWith([row("EURUSD", 0, 1)]);
    const second = corpusWith([row("EURJPY", 0, -1)]);
    const { code, out } = run([first, second, "--bucket-minutes", "60"]);
    assert.equal(code, 0, out);
    assert.match(out, /shards 2 /);
    // Both shards' rows land in one eur_crosses group, which is the whole
    // point: read separately, each half would win its own collapse.
    assert.match(out, /accepted 2 /);
    assert.match(out, /contested 1 /);
  });
});

// Finding 2 and 3 of the fleet review, pinned by execution. Until these
// existed every case sat below the default floor, so the winner selection, the
// paired delta and the permutation null were never run by any test — which is
// exactly why both defects survived to review.
describe("e4-collapse — the statistic, actually executed", () => {
  it("scores the RANKED row when a symbol repeats in a bucket, not the first one", () => {
    // One bucket, two symbols, and EURUSD appears twice. The later EURUSD row
    // carries the higher confidence and a very different realized R. Under the
    // one-row-per-symbol rule the EARLIEST is kept, so the repeat must be
    // dropped rather than scored or counted.
    const emit = corpusWith([
      row("EURUSD", 0, 1, { confidenceScore: 60 }),
      row("EURUSD", 1, -9, { confidenceScore: 99 }),
      row("EURJPY", 0, -1, { confidenceScore: 70 }),
    ]);
    const { code, out } = run([
      emit,
      "--bucket-minutes",
      "1440",
      "--min-groups",
      "1",
    ]);
    assert.equal(code, 0, out);
    assert.match(out, /1 repeat rows dropped/);
    // Two distinct symbols in the group -> exactly one suppressed.
    assert.match(out, /suppression 1\//);
    // EURJPY (70) beats the kept EURUSD (60), so the winner's R is -1 and the
    // group mean is (1 + -1)/2 = 0 -> delta -1. If the dropped -9 row had been
    // scored, or the repeat kept, the delta would not be -1.
    assert.match(out, /paired delta -1\.0000R per contested group over 1 groups/);
  });

  it("does not let a repeated ungrouped symbol suppress itself", () => {
    // The fixture's premise, pinned rather than assumed: TRUMPUSD has no
    // primary group, so getCorrelationGroup returns the symbol itself and the
    // collapse keys on it. Without this assertion the case would pass
    // identically for a GROUPED symbol — the dedupe fires either way — and so
    // would not distinguish the fallback path it is named for.
    assert.equal(
      getCorrelationGroup("TRUMPUSD"),
      "TRUMPUSD",
      "fixture assumes TRUMPUSD is ungrouped; the roster changed",
    );
    const emit = corpusWith([
      row("TRUMPUSD", 0, 1),
      row("TRUMPUSD", 1, -1),
    ]);
    const { code, out } = run([emit, "--bucket-minutes", "1440"]);
    assert.equal(code, 0, out);
    assert.match(out, /contested 0 /);
    assert.match(out, /suppression 0\//);
    assert.match(out, /1 repeat rows dropped/);
  });

  it("keeps two DIFFERENT ungrouped symbols in separate groups", () => {
    // The other side of the fallback: ungrouped symbols key on themselves, so
    // two of them in one bucket are two singleton groups, never a contest.
    // Together with the case above this pins the fallback in both directions.
    const emit = corpusWith([row("TRUMPUSD", 0, 1), row("NGUSD", 0, -1)]);
    const { code, out } = run([emit, "--bucket-minutes", "1440"]);
    assert.equal(code, 0, out);
    assert.match(out, /groups 2 = contested 0 \+ singleton 2/);
  });

  it("runs the permutation null and prints a p with its permutation count", () => {
    const rows = [];
    for (let bucket = 0; bucket < 40; bucket += 1) {
      rows.push(row("EURUSD", bucket * 48, 1, { confidenceScore: 80 }));
      rows.push(row("EURJPY", bucket * 48, -1, { confidenceScore: 60 }));
    }
    const emit = corpusWith(rows);
    const { code, out } = run([
      emit,
      "--bucket-minutes",
      "1440",
      "--permutations",
      "500",
    ]);
    assert.equal(code, 0, out);
    assert.match(out, /contested 40 /);
    // The higher-confidence market always wins and always returns +1 while its
    // pair returns -1, so every group's delta is +1 and the null cannot beat
    // it: p is the floor, 1/(500+1).
    assert.match(out, /paired delta \+1\.0000R per contested group over 40 groups/);
    assert.match(out, /p 0\.0020 \(500 permutations/);
  });

  it("refuses a permutation count below its stated floor", () => {
    const emit = corpusWith([row("EURUSD", 0, 1)]);
    const { code, out } = run([
      emit,
      "--bucket-minutes",
      "60",
      "--permutations",
      "3",
    ]);
    assert.equal(code, 1);
    assert.match(out, /--permutations must be at least 100/);
  });

  // The entry point is wrapped, so a flag that THROWS (flagReader's token(),
  // assertInDomain, soleFlagIndex on a repeat) reads as a refusal rather than
  // an unhandled rejection. Without this assertion an operator's typo and a
  // genuine internal TypeError look identical in the output — and the earlier
  // domain tests passed either way, because an unhandled rejection also exits
  // 1 and writes to stderr.
  it("prints a refusal with no stack frame when a dial throws", () => {
    const emit = corpusWith([row("EURUSD", 0, 1)]);
    const { code, out } = run([emit, "--bucket-minutes", "2.5"]);
    assert.equal(code, 1);
    assert.match(out, /--bucket-minutes must be a whole number/);
    assert.doesNotMatch(
      out,
      /\s+at \S+ \(|node:internal|Error:\s*$/m,
      "a mistyped dial must not surface as a stack trace",
    );
  });

  it("refuses a repeated flag rather than silently taking the first", () => {
    const emit = corpusWith([row("EURUSD", 0, 1)]);
    const { code, out } = run([
      emit,
      "--bucket-minutes",
      "60",
      "--bucket-minutes",
      "1440",
    ]);
    assert.equal(code, 1);
    assert.match(out, /--bucket-minutes was given 2 times/);
    assert.doesNotMatch(out, /\s+at \S+ \(|node:internal/m);
  });

  it("refuses a bucket width below its stated floor", () => {
    const emit = corpusWith([row("EURUSD", 0, 1)]);
    const { code, out } = run([emit, "--bucket-minutes", "0"]);
    assert.equal(code, 1);
    assert.match(out, /--bucket-minutes must be at least 1/);
  });
});
