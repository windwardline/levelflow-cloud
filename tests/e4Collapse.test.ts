import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";

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
  it("suppresses at least as much at a wider bucket", () => {
    const rows = [
      row("EURUSD", 0, 1),
      row("GBPUSD", 3, -1),
      row("EURUSD", 6, 1),
      row("GBPUSD", 9, -1),
    ];
    const emit = corpusWith(rows);
    const narrow = run([emit, "--bucket-minutes", "60"]);
    const wide = run([emit, "--bucket-minutes", "1440"]);
    assert.equal(narrow.code, 0, narrow.out);
    assert.equal(wide.code, 0, wide.out);
    const suppressedIn = (out: string) =>
      Number(/suppression (\d+)\//.exec(out)?.[1] ?? "-1");
    assert.ok(
      suppressedIn(wide.out) >= suppressedIn(narrow.out),
      `a wider bucket cannot suppress less: narrow ${
        suppressedIn(narrow.out)
      }, wide ${suppressedIn(wide.out)}`,
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

  it("refuses to pool two shards swept under different engines", () => {
    const first = corpusWith([row("EURUSD", 0, 1)]);
    const second = corpusWith([row("GBPUSD", 0, -1)]);
    const manifest = JSON.parse(
      execFileSync("cat", [`${second}.manifest.json`], { encoding: "utf8" }),
    );
    manifest.analyzerVersion = "2026.08.09.other";
    // Re-hash so the corpus fails on the ENGINE mismatch rather than on the
    // manifest hash — otherwise this test would pass for the wrong reason.
    const { manifestHash: _drop, generatedAt, ...rest } = manifest;
    void _drop;
    void generatedAt;
    writeFileSync(
      `${second}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    void rest;
    const { code, out } = run([first, second, "--bucket-minutes", "60"]);
    assert.equal(code, 1);
    assert.match(out, /manifest hash mismatch|not one sweep/);
  });
});
