import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  armingBoundCells,
  formatArmingBoundCells,
  lower95,
  mean,
  parseControlTable,
} from "../scripts/arming-bound-cells.ts";
import { gradeCorpus, projectArm } from "../scripts/grid-totalr.ts";
import { ARM_COLUMNS, type SweepEmitRow } from "../scripts/sweepStats.ts";
import { SEALED_FOLD } from "../scripts/tuning-folds-summary.ts";

/**
 * The two graders of the arming-bound arm, on a corpus whose every figure is
 * hand-computed. Each row carries three conventions of one decision: net
 * (realizedR), gross (grossRealizedR) and the arming-bound arm
 * (armingBoundRealizedR) — the last differing from net only on rows whose
 * TP1 bar closed back through the lock, as the sweep emits it. The confirm
 * fold is sealed at the door.
 */

const MINUTE = 60_000;
const FIT_START = Date.UTC(2017, 0, 1);
const SELECT_START = Date.UTC(2020, 0, 1);
const CONFIRM_START = Date.UTC(2023, 0, 1);
const END = Date.UTC(2026, 8, 1);
const NO_PIN_DIR = join(mkdtempSync(join(tmpdir(), "arming-graders-pins-")), "none");
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const GRID = join(process.cwd(), "scripts", "grid-totalr.ts");

type Row = Record<string, unknown>;

function row(input: {
  accepted?: boolean;
  bound?: number;
  gross?: number;
  r: number;
  split: string;
  symbol: string;
  time: number;
  unfilled?: boolean;
  variant?: string;
}): Row {
  const outcome = input.unfilled ? "unfilled" : input.r < 0 ? "stop_loss" : "tp1_partial";
  return {
    accepted: input.accepted ?? true,
    armingBoundExitAtMs: input.time + 8 * 3_600_000,
    armingBoundExitPrice: null,
    armingBoundOutcome: outcome,
    armingBoundRealizedR: input.bound ?? input.r,
    estimatedCommission: 0.00005,
    estimatedRoundTripCost: 0.00007,
    exitAtMs: input.time + 4 * 3_600_000,
    grossOutcome: outcome,
    grossRealizedR: input.gross ?? input.r,
    holdout: false,
    latestClose: 1.1,
    outcome,
    realizedR: input.r,
    riskDistance: 0.001,
    split: input.split,
    symbol: input.symbol,
    time: input.time,
    variant: input.variant ?? "baseline",
  };
}

// Decision times: in span = 18:xx UTC, out of span = 03:xx UTC; the index adds minutes.
const at = (year: number, month: number, hour: number, index: number) => Date.UTC(year, month, 2, hour) + index * MINUTE;

/**
 * Fit, EURUSD and GBPJPY, all accepted baseline unless stated:
 *   in span:  r +1.0 (bound +0.4, gross +1.1) · r −1.0 (bound −1.0, gross −0.9) · r +0.5 (bound +0.5, gross +0.6)
 *   out:      r +2.0 (bound +0.2, gross +2.1)
 * Select: in span r −0.5 (bound −0.5, gross −0.4); out r +0.3 (bound +0.3, gross +0.4)
 * Plus one unfilled row, one accepted:false row, a hold-variant row in fit
 * (r +3.0, bound +0.3 — the gate's ΔR fit is the variant's total minus the
 * baseline's: 3.0 − 2.5 = +0.5 under net, 0.3 − 0.1 = +0.2 under bound), and
 * ten confirm rows the door withholds. XAUUSD (metals) is out of scope.
 */
function fixtureRows(): Row[] {
  const rows: Row[] = [
    row({ bound: 0.4, gross: 1.1, r: 1, split: "fit", symbol: "EURUSD", time: at(2017, 2, 18, 0) }),
    row({ bound: -1, gross: -0.9, r: -1, split: "fit", symbol: "GBPJPY", time: at(2017, 3, 18, 1) }),
    row({ bound: 0.5, gross: 0.6, r: 0.5, split: "fit", symbol: "EURUSD", time: at(2017, 4, 18, 2) }),
    row({ bound: 0.2, gross: 2.1, r: 2, split: "fit", symbol: "GBPJPY", time: at(2017, 5, 3, 3) }),
    row({ bound: -0.5, gross: -0.4, r: -0.5, split: "select", symbol: "EURUSD", time: at(2020, 2, 18, 4) }),
    row({ bound: 0.3, gross: 0.4, r: 0.3, split: "select", symbol: "GBPJPY", time: at(2020, 3, 3, 5) }),
    row({ r: 0, split: "select", symbol: "EURUSD", time: at(2020, 4, 18, 6), unfilled: true }),
    row({ accepted: false, r: -1, split: "select", symbol: "EURUSD", time: at(2020, 5, 18, 7) }),
    row({ bound: 0.3, r: 3, split: "fit", symbol: "EURUSD", time: at(2017, 2, 18, 8), variant: "runnerProtection=hold,stopStructureSource=intraday" }),
    row({ r: 1, split: "fit", symbol: "XAUUSD", time: at(2017, 6, 18, 9) }),
  ];
  for (let i = 0; i < 10; i += 1) {
    rows.push(row({ r: 5, split: SEALED_FOLD, symbol: "EURUSD", time: at(2024, 2, 18, i) }));
  }
  return rows;
}

function writeCorpus(rows: Row[], options: { emitColumns?: string[]; feedCharacter?: Record<string, number[]> | null } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "arming-graders-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(emitPath, rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const symbols = [...new Set(rows.map((entry) => String(entry.symbol)))];
  const feedCharacter = options.feedCharacter === undefined ? { EURUSD: [], GBPJPY: [2021], XAUUSD: [] } : options.feedCharacter;
  const manifest = buildSweepManifest({
    acceptance: { captureAll: true, ignoreLowEdge: false },
    analyzerVersion: "2026.09.14.test",
    anchor: "2026-08-26",
    barRejections: {},
    clock: { calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK },
    conditions: { availableTimeframeCount: "min-four-by-construction", macroAdjustment: "historical-treasury-curve", providerWarningCount: "zero-by-construction", spreadSource: "modeled-by-construction", weightAdjustment: "raw-engine-zero" },
    days: 7000,
    emitColumns: options.emitColumns ?? Object.keys(rows[0]).sort(),
    folds: [
      { decisionEndMs: SELECT_START - 5 * 86_400_000, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - 5 * 86_400_000, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - 5 * 86_400_000, endMs: END, name: SEALED_FOLD, startMs: CONFIRM_START },
    ],
    generatedAt: "2026-09-14T02:00:00.000Z",
    grid: [{}, { runnerProtection: "hold", stopStructureSource: "intraday" }],
    grossCostScale: 0,
    holdoutSymbols: [],
    modeledCostScale: 1,
    requestedSymbols: symbols,
    source: { dirty: false, revision: "46d45450000000000000000000000000000000000" },
    stepBars: 16,
    symbols: symbols.map((symbol) => ({
      calibration: {},
      ...(feedCharacter && {
        feedCharacter: {
          "5min": { baseline: { barRangeRatio: 0.05, rangeRatio: 1 }, escapeYears: feedCharacter[symbol] ?? [], judgedDays: 100, verdict: (feedCharacter[symbol] ?? []).length ? "escapes" : "contained", years: {} },
        },
      }),
      providerSymbol: symbol,
      series: { "15min": seriesFacts(rows.filter((entry) => entry.symbol === symbol).map((entry) => ({ time: Number(entry.time) })), "intraday") },
      symbol,
    })),
    trainShare: 0.6,
    treasuryCurve: { count: 3_000, firstTime: Date.UTC(2013, 0, 2), largestGapMs: 4 * 86_400_000, lastTime: Date.UTC(2027, 0, 1) },
    warmupBars: 240,
  } as unknown as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return emitPath;
}

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${expected}, got ${actual}`);

function readCells(paths: string[], overrides: Partial<Parameters<typeof armingBoundCells>[0]> = {}) {
  return armingBoundCells({ folds: ["fit", "select"], holdoutPinDir: NO_PIN_DIR, includeHoldout: true, paths, variant: "baseline", years: "all", ...overrides });
}

describe("arming-bound-cells — the eight cells under three conventions, hand-computed", () => {
  it("sums each arm's column per fold × pool × span and accounts for every row it did not price", async () => {
    const summary = await readCells([writeCorpus(fixtureRows())]);
    assert.equal(summary.rows.total, 20);
    assert.equal(summary.rows.sealed, 10);
    assert.equal(summary.rows.notAccepted, 1);
    assert.equal(summary.rows.wrongVariant, 1);
    assert.equal(summary.rows.notForex, 1, "XAUUSD is metals");
    assert.equal(summary.rows.notFilled, 1);
    assert.equal(summary.rows.priced, 6);
    const cell = (key: string) => summary.cells.find((entry) => entry.cell === key)!;
    const fitIn = cell("fit|in-pool|in");
    assert.equal(fitIn.net.n, 3);
    near(fitIn.net.sum, 0.5);
    near(fitIn.gross.sum, 0.8);
    near(fitIn.bound.sum, -0.1);
    near(mean(fitIn.bound), -0.1 / 3);
    const fitOut = cell("fit|in-pool|out");
    assert.equal(fitOut.net.n, 1);
    near(fitOut.bound.sum, 0.2);
    near(cell("select|in-pool|in").gross.sum, -0.4);
    near(cell("select|in-pool|out").bound.sum, 0.3);
    // One fill is no interval: lo95 is NaN below two fills, so a one-fill cell
    // can never count as clearing zero.
    assert.ok(Number.isNaN(lower95(fitOut.net)));
  });

  it("prints the three conventions side by side and counts in-span cells clearing zero under each", async () => {
    const text = formatArmingBoundCells(await readCells([writeCorpus(fixtureRows())]));
    assert.match(text, /\| fit \| in-pool \| in \| 3 \| \+0\.5 \| \+0\.1667 \| /);
    assert.match(text, /arms: net = realizedR as emitted \(FR-3 zero-latency arming\) · gross = grossRealizedR · bound = armingBoundRealizedR/);
    assert.match(text, /in-span cells clearing zero at lo95: net \d of 2 · gross \d of 2 · bound \d of 2/);
    assert.match(text, /confirm: SEALED, not read \(10 rows withheld at the door\)/);
  });

  it("refuses a corpus that does not carry the arming-bound columns, rather than grading the net figure in their place", async () => {
    const rows = fixtureRows().map((entry) => {
      const { armingBoundRealizedR, armingBoundOutcome, armingBoundExitAtMs, armingBoundExitPrice, ...rest } = entry;
      void armingBoundRealizedR; void armingBoundOutcome; void armingBoundExitAtMs; void armingBoundExitPrice;
      return rest;
    });
    await assert.rejects(readCells([writeCorpus(rows)]), /does not carry armingBoundRealizedR, armingBoundOutcome/);
  });

  it("the control: reproduces the record's net cells or refuses to speak", async () => {
    const dir = mkdtempSync(join(tmpdir(), "arming-graders-control-"));
    const good = join(dir, "good.txt");
    // The record's format: | fold | pool | span | n | net R | E | lo95 | … — the
    // fixture's fit in-pool in-span cell is 3 fills, +0.5 R, E +0.1667, and its
    // lo95 is the sample formula the reader prints.
    const summary = await readCells([writeCorpus(fixtureRows())]);
    const fitIn = summary.cells.find((entry) => entry.cell === "fit|in-pool|in")!;
    const lo = lower95(fitIn.net).toFixed(4);
    writeFileSync(good, `| fold | pool | span | n | net R | E | lo95 | stop rate |\n| fit | in-pool | in | 3 | +0.5 | +0.1667 | ${lo} | 0.1 |\n`);
    const checked = await readCells([writeCorpus(fixtureRows())], { controlPath: good });
    assert.equal(checked.control?.cellsChecked, 1);
    assert.match(formatArmingBoundCells(checked), /control: the net column reproduces all 1 cells of /);
    const bad = join(dir, "bad.txt");
    writeFileSync(bad, `| fold | pool | span | n | net R | E | lo95 |\n| fit | in-pool | in | 4 | +0.5 | +0.1667 | ${lo} |\n`);
    await assert.rejects(readCells([writeCorpus(fixtureRows())], { controlPath: bad }), /does not reproduce the control[\s\S]*fit\|in-pool\|in: n 3 vs 4 recorded/);
    const empty = join(dir, "empty.txt");
    writeFileSync(empty, "nothing here\n");
    await assert.rejects(readCells([writeCorpus(fixtureRows())], { controlPath: empty }), /no eight-cell rows found/);
    assert.equal(parseControlTable("| select | held-out | out | 11661 |   -296.6 | -0.0254 | -0.0373 | 0.271 |").get("select|held-out|out")?.n, 11661);
  });

  it("refuses with no corpus named, a fold the manifest does not declare, and the sealed fold by name", async () => {
    await assert.rejects(readCells([]), /no corpus shard named/);
    await assert.rejects(readCells([writeCorpus(fixtureRows())], { folds: ["fit", "selct"] }), /declares no "selct" fold/);
    await assert.rejects(readCells([writeCorpus(fixtureRows())], { folds: ["fit", SEALED_FOLD] }), /confirm fold is sealed/);
  });

  it("with the holdout in force the cells still sum to the same fills and money, pool by pool", async () => {
    const pooled = await readCells([writeCorpus(fixtureRows())]);
    const split = await readCells([writeCorpus(fixtureRows())], { includeHoldout: false });
    const sum = (cells: typeof pooled.cells, span: string, pick: (c: (typeof pooled.cells)[number]) => number) =>
      cells.filter((c) => c.fold === "fit" && c.span === span).reduce((acc, c) => acc + pick(c), 0);
    assert.equal(sum(split.cells, "in", (c) => c.net.n), sum(pooled.cells, "in", (c) => c.net.n));
    near(sum(split.cells, "in", (c) => c.bound.sum), sum(pooled.cells, "in", (c) => c.bound.sum));
    assert.match(split.provenance[1], /labelled HELD OUT per market|held-out fills form the held-out cells/);
  });
});

describe("grid-totalr --r-arm — the gate reads the named convention", () => {
  it("projectArm swaps realizedR and outcome for the arm's columns and leaves everything else", () => {
    const base = { accepted: true, armingBoundOutcome: "stop_loss", armingBoundRealizedR: -1, grossOutcome: "tp1_partial", grossRealizedR: 0.6, outcome: "tp1_partial", realizedR: 0.5, symbol: "EURUSD", time: 1 } as unknown as SweepEmitRow;
    assert.equal(projectArm(base, "net", "x"), base);
    const bound = projectArm(base, "bound", "x") as unknown as Record<string, unknown>;
    assert.equal(bound.realizedR, -1);
    assert.equal(bound.outcome, "stop_loss");
    assert.equal(bound.grossRealizedR, 0.6, "the gross column is untouched");
    const gross = projectArm(base, "gross", "x") as unknown as Record<string, unknown>;
    assert.equal(gross.realizedR, 0.6);
    const bare = { accepted: true, outcome: "tp1_partial", realizedR: 0.5, symbol: "EURUSD", time: 1 } as unknown as SweepEmitRow;
    assert.throws(() => projectArm(bare, "bound", "x"), /carries no finite armingBoundRealizedR/);
    assert.equal(ARM_COLUMNS.bound.r, "armingBoundRealizedR");
  });

  it("grades on the bound column when asked — the gate's own ΔR fit moves, hand-computed", () => {
    // Baseline fit totals: net 1.0 − 1.0 + 0.5 + 2.0 = 2.5; bound 0.4 − 1.0 +
    // 0.5 + 0.2 = 0.1. The hold variant's one fit row: net 3.0, bound 0.3. So
    // ΔR fit is 3.0 − 2.5 = +0.5 under net and 0.3 − 0.1 = +0.2 under bound.
    const path = writeCorpus(fixtureRows(), { feedCharacter: null });
    const deltaFit = (args: string[]) => {
      const out = execFileSync(TSX, [GRID, path, "--permutations", "20", ...args], { encoding: "utf8" });
      const match = out.match(/runnerProtection=hold,stopStructureSource=intraday\s+(-?\d+\.\d)\s+/);
      assert.ok(match, `no variant line in:\n${out}`);
      // The first variant line is forex's (the fixture's other class, metals,
      // prints after it); pinned so the number read is the forex cell's.
      assert.ok(out.indexOf("forex") < (match!.index ?? 0), "the forex table must precede the line read");
      return Number(match![1]);
    };
    assert.equal(deltaFit([]), 0.5);
    assert.equal(deltaFit(["--r-arm", "bound"]), 0.2);
    assert.equal(deltaFit(["--r-arm", "net"]), 0.5);
  });

  it("refuses a corpus without the arm's columns, and a recorded read under a non-net arm", async () => {
    const bare = writeCorpus(fixtureRows().map((entry) => { const { armingBoundRealizedR, ...rest } = entry; void armingBoundRealizedR; return rest; }), { feedCharacter: null });
    await assert.rejects(
      gradeCorpus(bare, { includeHoldout: true, permutations: 20, rArm: "bound" }),
      /does not carry armingBoundRealizedR/,
    );
    await assert.rejects(
      gradeCorpus(writeCorpus(fixtureRows(), { feedCharacter: null }), { confirmFinal: true, includeHoldout: true, permutations: 20, rArm: "bound" }),
      /--r-arm bound with --confirm-final: the ledger records no arm/,
    );
  });

  it("the CLI names the arm it read, refuses an unknown one, and refuses a recorded read under a non-net arm", () => {
    const path = writeCorpus(fixtureRows(), { feedCharacter: null });
    const out = execFileSync(TSX, [GRID, path, "--permutations", "20", "--r-arm", "bound"], { encoding: "utf8" });
    assert.match(out, /R column: bound arm \(armingBoundRealizedR \/ armingBoundOutcome\) — the gate reads a convention other than the emitted one/);
    const plain = execFileSync(TSX, [GRID, path, "--permutations", "20"], { encoding: "utf8" });
    assert.match(plain, /R column: net arm \(realizedR \/ outcome\)\n/);
    assert.throws(
      () => execFileSync(TSX, [GRID, path, "--permutations", "20", "--r-arm", "sideways"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      /--r-arm must be one of bound, gross, net/,
    );
  });
});
