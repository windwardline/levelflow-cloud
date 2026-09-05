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
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  bankedFraction,
  formatBankedFraction,
  FRACTIONS,
  parseFolds,
  rFromLegs,
  SEALED_FOLD,
} from "../scripts/banked-fraction.ts";

/**
 * The banked fraction is the literal 0.5 in `realizedRFromLegs` — the R2b
 * geometry round's first standing question: "realized R is linear in that
 * allocation and it has never been varied, measured, or represented", and
 * "answerable from R3's corpus without a second sweep: net R at any fraction
 * is exact arithmetic on `legs`". This reader is that arithmetic. Every
 * figure below is hand-computed from the fixture; the reader's own control —
 * that at 0.5 it reproduces the emitted realizedR on every row — is executed,
 * and its refusal is executed too. The confirm fold is sealed.
 */

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "banked-fraction.ts");
const HOUR = 3_600_000;
const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2025, 0, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 8, 1);

type Row = Record<string, unknown>;

/** Risk distance is 1 on every row, so leg prices read as R directly. */
function row(input: {
  accepted?: boolean;
  commission?: number;
  exit: number;
  holdout?: boolean;
  index: number;
  outcome: string;
  realizedR?: number;
  side?: "buy" | "sell";
  split: string;
  symbol: string;
  tp1?: number;
  variant?: string;
}): Row {
  const base = input.split === "fit"
    ? FIT_START
    : input.split === "select"
    ? SELECT_START
    : CONFIRM_START;
  const time = base + input.index * HOUR;
  const side = input.side ?? "buy";
  const sign = side === "buy" ? 1 : -1;
  const entry = 100;
  const tp1R = input.tp1 === undefined ? 0 : sign * (input.tp1 - entry);
  const exitR = sign * (input.exit - entry);
  const costR = input.commission ?? 0;
  const shipped = input.tp1 === undefined ? exitR - costR : 0.5 * tp1R + 0.5 * exitR - costR;
  const legs: Row[] = [{ leg: "entry", price: entry, time }];
  if (input.tp1 !== undefined) legs.push({ leg: "tp1", price: input.tp1, time: time + 1 });
  legs.push({ kind: input.outcome, leg: "exit", price: input.exit, time: time + 2 });
  return {
    accepted: input.accepted ?? true,
    estimatedCommission: costR,
    holdout: input.holdout ?? false,
    legs,
    outcome: input.outcome,
    realizedR: input.realizedR ?? Number(shipped.toFixed(4)),
    riskDistance: 1,
    side,
    split: input.split,
    symbol: input.symbol,
    time,
    variant: input.variant ?? "baseline",
  };
}

/**
 * Forex pool (EURUSD + stamped-holdout GBPUSD; NZDCHF held out by the
 * stratified rule), per fold, R(f) per row:
 *
 *   A  tp1_partial   tp1 100.4 exit 100.0          -> 0.4f
 *   B  take_profit   tp1 100.4 exit 101.6          -> 1.6 - 1.2f
 *   C  stop_loss     no tp1, exit 99               -> -1
 *   D  tp1_partial   tp1 100.6 exit 100.2, cost .1 -> 0.1 + 0.4f
 *   H  tp1_partial   SELL: tp1 99.5 exit 100.0     -> 0.5f
 *   G  take_profit   GBPUSD tp1 100.5 exit 102     -> 2 - 1.5f
 *
 *   sum = 2.7 - 1.4f : R(0) 2.7, R(0.5) 2.0 (= the emitted total), R(1) 1.3.
 *   Shipped halves: banked 0.5 x 2.4 = 1.2, runner 0.5 x 3.8 = 1.9, costs 0.1,
 *   no-tp1 rows -1  ->  1.2 + 1.9 - 0.1 - 1 = 2.0.
 *
 * Metals (XAUUSD): stop -1, tp1_partial tp1 100.8 exit 100.4 -> -0.6 + 0.4f.
 */
function fixtureRows(): Row[] {
  const rows: Row[] = [];
  let index = 0;
  for (const split of ["fit", "select"]) {
    rows.push(row({ exit: 100.0, index: index++, outcome: "tp1_partial", split, symbol: "EURUSD", tp1: 100.4 }));
    rows.push(row({ exit: 101.6, index: index++, outcome: "take_profit", split, symbol: "EURUSD", tp1: 100.4 }));
    rows.push(row({ exit: 99, index: index++, outcome: "stop_loss", split, symbol: "EURUSD" }));
    rows.push(row({ commission: 0.1, exit: 100.2, index: index++, outcome: "tp1_partial", split, symbol: "EURUSD", tp1: 100.6 }));
    rows.push(row({ exit: 100.0, index: index++, outcome: "tp1_partial", side: "sell", split, symbol: "EURUSD", tp1: 99.5 }));
    rows.push(row({ exit: 100, index: index++, outcome: "unfilled", split, symbol: "EURUSD" }));
    rows.push(row({ accepted: false, exit: 99, index: index++, outcome: "stop_loss", split, symbol: "EURUSD" }));
    rows.push(row({ exit: 101, index: index++, outcome: "take_profit", split, symbol: "EURUSD", tp1: 100.4, variant: "runnerProtection=hold" }));
    rows.push(row({ exit: 102, holdout: true, index: index++, outcome: "take_profit", split, symbol: "GBPUSD", tp1: 100.5 }));
    rows.push(row({ exit: 100, index: index++, outcome: "tp1_partial", split, symbol: "NZDCHF", tp1: 100.3 }));
    rows.push(row({ exit: 99, index: index++, outcome: "stop_loss", split, symbol: "XAUUSD" }));
    rows.push(row({ exit: 100.4, index: index++, outcome: "tp1_partial", split, symbol: "XAUUSD", tp1: 100.8 }));
  }
  // Confirm rows worth +5R each at the shipped fraction; never read.
  for (let step = 0; step < 20; step += 1) {
    rows.push(row({ exit: 100, index: index++, outcome: "tp1_partial", split: SEALED_FOLD, symbol: "EURUSD", tp1: 110 }));
  }
  return rows;
}

function writeCorpus(rows: Row[], name = "shard"): string {
  const dir = mkdtempSync(join(tmpdir(), "banked-fraction-"));
  const emitPath = join(dir, `${name}.jsonl`);
  writeFileSync(emitPath, rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const symbols = [...new Set(rows.map((entry) => String(entry.symbol)))];
  const manifest = buildSweepManifest({
    acceptance: { captureAll: true, ignoreLowEdge: false },
    analyzerVersion: "2026.09.05.test",
    anchor: "2026-08-26",
    barRejections: {},
    clock: { calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK },
    conditions: {
      availableTimeframeCount: "min-four-by-construction",
      macroAdjustment: "historical-treasury-curve",
      providerWarningCount: "zero-by-construction",
      spreadSource: "modeled-by-construction",
      weightAdjustment: "raw-engine-zero",
    },
    days: 7000,
    emitColumns: Object.keys(rows[0]).sort(),
    folds: [
      { decisionEndMs: SELECT_START - 5 * 86_400_000, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - 5 * 86_400_000, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - 5 * 86_400_000, endMs: END, name: SEALED_FOLD, startMs: CONFIRM_START },
    ],
    generatedAt: "2026-09-05T22:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    grossCostScale: 0,
    holdoutSymbols: ["GBPUSD"],
    modeledCostScale: 1,
    requestedSymbols: symbols,
    source: { dirty: false, revision: "99ff1430000000000000000000000000000000000" },
    stepBars: 16,
    symbols: symbols.map((symbol) => ({
      calibration: {},
      providerSymbol: symbol,
      series: {
        "15min": seriesFacts(
          rows.filter((entry) => entry.symbol === symbol).map((entry) => ({ time: Number(entry.time) })),
          "intraday",
        ),
      },
      symbol,
    })),
    trainShare: 0.6,
    treasuryCurve: {
      count: 3_000,
      firstTime: Date.UTC(2013, 0, 2),
      largestGapMs: 4 * 86_400_000,
      lastTime: Date.UTC(2027, 0, 1),
    },
    warmupBars: 240,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return emitPath;
}

const NO_PIN_DIR = join(mkdtempSync(join(tmpdir(), "banked-fraction-pins-")), "none");

function read(paths: string[], overrides: Partial<Parameters<typeof bankedFraction>[0]> = {}) {
  return bankedFraction({ folds: ["fit", "select"], holdoutPinDir: NO_PIN_DIR, paths, variant: "baseline", ...overrides });
}

function near(actual: number | null | undefined, expected: number, digits = 6): void {
  assert.notEqual(actual, null);
  assert.notEqual(actual, undefined);
  assert.equal(Number((actual as number).toFixed(digits)), Number(expected.toFixed(digits)));
}

describe("the arithmetic", () => {
  it("R(f) on one row is the emitted blend with the fraction freed", () => {
    const legs = [{ leg: "entry", price: 100 }, { leg: "tp1", price: 100.4 }, { leg: "exit", price: 101.6 }];
    near(rFromLegs({ commission: 0, fraction: 0.5, legs, riskDistance: 1, side: "buy" }), 1.0);
    near(rFromLegs({ commission: 0, fraction: 0, legs, riskDistance: 1, side: "buy" }), 1.6);
    near(rFromLegs({ commission: 0, fraction: 1, legs, riskDistance: 1, side: "buy" }), 0.4);
    // A sell reads the legs with the sign flipped; a commission is a round trip over risk.
    const sell = [{ leg: "entry", price: 100 }, { leg: "tp1", price: 99.5 }, { leg: "exit", price: 100 }];
    near(rFromLegs({ commission: 0.2, fraction: 0.5, legs: sell, riskDistance: 2, side: "sell" }), 0.125 - 0.1);
    // Without a tp1 leg the fraction is moot: the position ran full size to one exit.
    const stop = [{ leg: "entry", price: 100 }, { leg: "exit", price: 99 }];
    near(rFromLegs({ commission: 0, fraction: 0.25, legs: stop, riskDistance: 1, side: "buy" }), -1);
    assert.equal(rFromLegs({ commission: 0, fraction: 0.5, legs: [{ leg: "entry", price: 100 }], riskDistance: 1, side: "buy" }), null);
  });

  it("the fraction grid is fixed and carries the shipped 0.5", () => {
    assert.deepEqual([...FRACTIONS], [0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("the confirm fold is sealed", () => {
  it("refuses the fold by name before touching a corpus", () => {
    assert.throws(() => parseFolds("fit,confirm"), /held-back fold/);
  });

  it("never lets confirm rows reach a figure, even though the corpus carries them", async () => {
    const summary = await read([writeCorpus(fixtureRows())]);
    assert.equal(summary.rows.sealed, 20);
    const forex = summary.cells.get("forex|fit")!;
    near(forex.byFraction.get(0.5)!.total, 2.0);
    near(forex.byFraction.get(1)!.total, 1.3);
  });

  it("the CLI refuses --folds confirm", () => {
    assert.throws(
      () =>
        execFileSync(TSX, [READER, writeCorpus(fixtureRows()), "--folds", "fit,confirm"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      /held-back fold/,
    );
  });
});

describe("what the allocation is worth", () => {
  it("prices every fraction on the class pool, hand-computed", async () => {
    const summary = await read([writeCorpus(fixtureRows())]);
    const forex = summary.cells.get("forex|select")!;
    assert.equal(forex.filled, 6);
    assert.equal(forex.tp1Rows, 5);
    assert.equal(forex.noTp1Rows, 1);
    near(forex.shippedTotal, 2.0);
    near(forex.byFraction.get(0)!.total, 2.7);
    near(forex.byFraction.get(0.25)!.total, 2.35);
    near(forex.byFraction.get(0.5)!.total, 2.0);
    near(forex.byFraction.get(0.75)!.total, 1.65);
    near(forex.byFraction.get(1)!.total, 1.3);
    near(forex.byFraction.get(0)!.expectancy, 2.7 / 6);
    near(forex.byFraction.get(0)!.deltaVsShipped, 0.7);
    assert.equal(forex.bestFraction, 0);
    // The shipped ladder's two halves, and what sits outside them.
    near(forex.bankedHalf, 1.2);
    near(forex.runnerHalf, 1.9);
    near(forex.costTotal, 0.1);
    near(forex.noTp1Total, -1);
  });

  it("a class whose runner pays reads the other way", async () => {
    const summary = await read([writeCorpus(fixtureRows())]);
    const metals = summary.cells.get("metals|fit")!;
    assert.equal(metals.filled, 2);
    near(metals.byFraction.get(0)!.total, -0.6);
    near(metals.byFraction.get(0.5)!.total, -0.4);
    near(metals.byFraction.get(1)!.total, -0.2);
    assert.equal(metals.bestFraction, 1);
  });

  it("pools every class read, held-out markets excluded", async () => {
    const summary = await read([writeCorpus(fixtureRows())]);
    const pooled = summary.cells.get("pooled|fit")!;
    assert.equal(pooled.filled, 8);
    near(pooled.byFraction.get(0)!.total, 2.1);
    near(pooled.byFraction.get(0.5)!.total, 1.6);
    near(pooled.byFraction.get(1)!.total, 1.1);
    assert.deepEqual(summary.holdout.markets, ["NZDCHF"]);
    assert.equal(summary.rows.heldOut, 2);
  });

  it("--include-holdout pools the held-out market too, and says so", async () => {
    const summary = await read([writeCorpus(fixtureRows())], { includeHoldout: true });
    const forex = summary.cells.get("forex|fit")!;
    assert.equal(forex.filled, 7);
    near(forex.byFraction.get(0.5)!.total, 2.15);
    assert.match(formatBankedFraction(summary), /held-out markets INCLUDED/);
  });
});

describe("the control, and what it keeps apart", () => {
  it("refuses a corpus on which the shipped fraction does not reproduce realizedR", async () => {
    const rows = fixtureRows();
    // Row A's emitted realizedR disagrees with its legs by more than rounding.
    (rows[0] as { realizedR: number }).realizedR = 0.9;
    await assert.rejects(read([writeCorpus(rows)]), /does not reproduce/);
  });

  it("counts every row it did not price, and says so", async () => {
    const summary = await read([writeCorpus(fixtureRows())]);
    assert.equal(summary.rows.unfilled, 2);
    assert.equal(summary.rows.notAccepted, 2);
    assert.equal(summary.rows.otherVariants, 2);
    assert.equal(summary.rows.controlChecked, 16);
    const text = formatBankedFraction(summary);
    assert.match(text, /confirm: SEALED, not read/);
    assert.match(text, /20 rows withheld at the door/);
    assert.match(text, /control: 16 rows reproduced/);
    assert.match(text, /allocation only/);
  });

  it("refuses a corpus whose manifest does not verify", async () => {
    const path = writeCorpus(fixtureRows());
    const manifestPath = `${path}.manifest.json`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.anchor = "2026-08-27";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    await assert.rejects(read([path]), /hash/i);
    const { generatedAt: _g, manifestHash: _h, ...payload } = manifest;
    manifest.manifestHash = sha256Hex(stableStringify(payload));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    assert.equal((await read([path])).anchor, "2026-08-27");
  });
});
