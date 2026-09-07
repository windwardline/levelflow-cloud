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
import { bankedFraction, formatBankedFraction, FRACTIONS, parseFolds, rFromLegs, SEALED_FOLD, stopPrintSlippage } from "../scripts/banked-fraction.ts";

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
  kind?: string;
  sameBar?: boolean;
  slippage?: number;
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
  // The corpus's exit kinds: a partial's runner exits through the TP1 lock unless the fixture says otherwise.
  const kind = input.kind ?? (input.outcome === "tp1_partial" ? "tp1_lock" : input.outcome);
  legs.push({ kind, leg: "exit", price: input.exit, time: time + (input.sameBar ? 1 : 2) });
  return {
    accepted: input.accepted ?? true,
    entryPrice: entry,
    estimatedCommission: costR,
    estimatedSlippage: input.slippage ?? 0,
    holdout: input.holdout ?? false,
    legs,
    stopLoss: 99,
    ...(input.tp1 !== undefined && { takeProfit1: input.tp1 }),
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

describe("stratified by feed character", () => {
  it("--years contained and --years escaping split the fold by the witness's year map, and refuse without one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "banked-years-"));
    const table = join(dir, "feed-character.txt");
    // The fixture's select rows all fall in 2025: EURUSD's 2025 escapes, GBPUSD's does not.
    writeFileSync(table, "EURUSD 5min ESCAPES: 2025\nGBPUSD 5min contained\nNZDCHF 5min contained\nXAUUSD 5min contained\n");
    const path = writeCorpus(fixtureRows());
    const escaping = await read([path], { witnessTablePath: table, years: "escaping" });
    assert.equal(escaping.yearMapSource, "witness");
    const forexE = escaping.cells.get("forex|select")!;
    // EURUSD A, B, C, D, H: shipped 0.2 + 1.0 − 1 + 0.3 + 0.25 = 0.75 over 5 fills.
    assert.equal(forexE.filled, 5);
    near(forexE.shippedTotal, 0.75);
    assert.equal(escaping.cells.has("forex|fit"), false);
    // Sixteen rows reach the year filter (eight filled per fold); five are EURUSD select rows in the escaping year.
    assert.equal(escaping.rows.otherYears, 11);
    const contained = await read([path], { witnessTablePath: table, years: "contained" });
    const forexC = contained.cells.get("forex|select")!;
    assert.equal(forexC.filled, 1);
    near(forexC.shippedTotal, 1.25);
    assert.equal(contained.cells.get("forex|fit")!.filled, 6);
    const all = await read([path], { witnessTablePath: table, years: "all" });
    assert.equal(all.rows.otherYears, 0);
    assert.equal(all.cells.get("forex|select")!.filled, 6);
    await assert.rejects(read([path], { years: "contained" }), /no year map/);
    assert.match(formatBankedFraction(escaping), /years: escaping · year map: witness table/);
  });

  it("refuses before reading a row when the year map cannot place a market the read would price", async () => {
    const dir = mkdtempSync(join(tmpdir(), "banked-years-short-"));
    const table = join(dir, "feed-character.txt");
    // GBPUSD and XAUUSD are missing: an absent verdict is not a contained one.
    writeFileSync(table, "EURUSD 5min ESCAPES: 2025\nNZDCHF 5min contained\n");
    const path = writeCorpus(fixtureRows());
    await assert.rejects(read([path], { witnessTablePath: table, years: "escaping" }), /cannot place 2 market\(s\).*GBPUSD, XAUUSD/);
  });

  it("does not refuse on a held-out market the map cannot place — its rows reach no cell", async () => {
    const dir = mkdtempSync(join(tmpdir(), "banked-years-heldout-"));
    const table = join(dir, "feed-character.txt");
    writeFileSync(table, "EURUSD 5min ESCAPES: 2025\nGBPUSD 5min contained\nXAUUSD 5min contained\n");
    const path = writeCorpus(fixtureRows());
    const summary = await read([path], { witnessTablePath: table, years: "contained" });
    assert.deepEqual(summary.holdout.markets, ["NZDCHF"]);
    assert.equal(summary.yearMapSource, "witness");
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

/**
 * The slippage-priced table, hand-computed. EURUSD fit, riskDistance 1, six tp1 rows:
 *
 *   P  tp1_lock AT the lock (tp1 100.4, exit 100.4), slippage .2, SAME bar -> R(f) = 0.4;        charged .2
 *   Q  tp1_lock gapped below it (exit 100.3), slippage .2                  -> 0.3 + 0.1f;        not charged
 *   T  take_profit (exit 101.6), slippage .2                                -> 1.6 - 1.2f;        not charged (limit print)
 *   E  expiry (expired_in_profit, exit 100.5), slippage .1                  -> 0.5 - 0.1f;        charged .1
 *   B  breakeven_stop AT entry (exit 100.0), slippage .3                    -> 0.4f;              charged .3
 *   A  ambiguous AT the stop (exit 99), slippage .1                         -> -1 + 1.4f;         charged .1
 *
 *   R(f) = 1.8 + 0.6f: R(0) 1.8, R(½) 2.1, R(1) 2.4.  S = 0.7 over 4 stop prints.
 *   R_adj(f) = R(f) − (1−f)·0.7: R_adj(0) 1.1, R_adj(½) 1.75, R_adj(1) 2.4; best f (adj) 1, Δ_adj +0.65.
 *   Same-bar: lock exits 1 of 2 (P), take_profit exits 0 of 1.
 */
describe("slippage-priced and same-bar", () => {
  function slipRows(): Row[] {
    let index = 0;
    return [
      row({ exit: 100.4, index: index++, outcome: "tp1_partial", sameBar: true, slippage: 0.2, split: "fit", symbol: "EURUSD", tp1: 100.4 }),
      row({ exit: 100.3, index: index++, outcome: "tp1_partial", slippage: 0.2, split: "fit", symbol: "EURUSD", tp1: 100.4 }),
      row({ exit: 101.6, index: index++, outcome: "take_profit", slippage: 0.2, split: "fit", symbol: "EURUSD", tp1: 100.4 }),
      row({ exit: 100.5, index: index++, kind: "expiry", outcome: "expired_in_profit", slippage: 0.1, split: "fit", symbol: "EURUSD", tp1: 100.4 }),
      row({ exit: 100.0, index: index++, kind: "breakeven_stop", outcome: "tp1_partial", slippage: 0.3, split: "fit", symbol: "EURUSD", tp1: 100.4 }),
      row({ exit: 99, index: index++, kind: "ambiguous", outcome: "ambiguous", slippage: 0.1, split: "fit", symbol: "EURUSD", tp1: 100.4 }),
    ];
  }

  it("charges the sweep's own slippage on the runner fraction of every stop print at its level and every expiry, never on a limit print or a gapped stop", async () => {
    const summary = await read([writeCorpus(slipRows())], { folds: ["fit"] });
    const cell = summary.cells.get("forex|fit")!;
    assert.equal(cell.tp1Rows, 6);
    assert.equal(cell.stopPrintRows, 4);
    near(cell.slippageTotal, 0.7);
    near(cell.byFraction.get(0)!.total, 1.8);
    near(cell.byFraction.get(0.5)!.total, 2.1);
    near(cell.byFraction.get(1)!.total, 2.4);
    near(cell.byFractionAdjusted.get(0)!.total, 1.1);
    near(cell.byFractionAdjusted.get(0.5)!.total, 1.75);
    near(cell.byFractionAdjusted.get(1)!.total, 2.4);
    assert.equal(cell.bestFractionAdjusted, 1);
    near(cell.byFractionAdjusted.get(1)!.deltaVsShipped, 0.65);
    assert.deepEqual(cell.sameBar, { lockRows: 2, lockSameBar: 1, takeProfitRows: 1, takeProfitSameBar: 0 });
    const text = formatBankedFraction(summary);
    assert.match(text, /slippage rides only in gapped prints \(FR-7\)/);
    assert.match(text, /--- fit · slippage-priced and same-bar ---/);
    assert.match(text, /\| forex \| 6 \| 4 \| 0\.7 \| 1\.1 \| 1\.4 \| 1\.8 \| 2\.1 \| 2\.4 \| 1 \| 0\.7 \| 1\/2 \(50\.0%\) \| 0\/1 \(0\.0%\) \|/);
  });

  it("stopPrintSlippage names its population: at-level stop kinds and expiry are charged, limit prints and gapped stops are not, and a missing kind or level refuses", () => {
    // estimatedSlippage 1 over riskDistance 4: sR = 0.25 exactly in binary, so deepEqual can read it.
    const levels = { entryPrice: 100, stopLoss: 99, takeProfit1: 100.4 };
    const legs = (kind: string | undefined, exit: number) => [{ leg: "entry", price: 100 }, { leg: "tp1", price: 100.4 }, { kind, leg: "exit", price: exit }];
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 1, legs: legs("tp1_lock", 100.4), levels, riskDistance: 4 }), { charged: true, kind: "tp1_lock", sR: 0.25 });
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 0.02, legs: legs("tp1_lock", 100.39), levels, riskDistance: 0.1 }), { charged: false, kind: "tp1_lock", sR: 0 });
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 0.02, legs: legs("take_profit", 101.6), levels, riskDistance: 0.1 }), { charged: false, kind: "take_profit", sR: 0 });
    // A limit print is never charged, even one that happens to sit on a level: the kind decides, not the price.
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 0.02, legs: legs("take_profit", 100.4), levels, riskDistance: 0.1 }), { charged: false, kind: "take_profit", sR: 0 });
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 0.02, legs: legs("trail_stop", 99), levels, riskDistance: 0.1 }), { charged: false, kind: "trail_stop", sR: 0 });
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 1, legs: legs("expiry", 100.7), levels, riskDistance: 4 }), { charged: true, kind: "expiry", sR: 0.25 });
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 1, legs: legs("stop_loss", 99), levels, riskDistance: 4 }), { charged: true, kind: "stop_loss", sR: 0.25 });
    // A row without a tp1 leg moves nothing between fractions: never charged.
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 0.02, legs: [{ leg: "entry", price: 100 }, { kind: "stop_loss", leg: "exit", price: 99 }], levels, riskDistance: 0.1 }), { charged: false, kind: "stop_loss", sR: 0 });
    // A gapped stop_loss is already slipped by the resolver (FR-7): not charged, same as a gapped lock.
    assert.deepEqual(stopPrintSlippage({ estimatedSlippage: 1, legs: legs("stop_loss", 98.9), levels, riskDistance: 4 }), { charged: false, kind: "stop_loss", sR: 0 });
    assert.throws(() => stopPrintSlippage({ estimatedSlippage: 0.02, legs: legs(undefined, 100.4), levels, riskDistance: 0.1 }), /names no kind/);
    assert.throws(() => stopPrintSlippage({ estimatedSlippage: 0.02, legs: legs("", 100.4), levels, riskDistance: 0.1 }), /names no kind/);
    assert.throws(() => stopPrintSlippage({ estimatedSlippage: 0.02, legs: legs("tp1_lock", 100.4), levels: { ...levels, takeProfit1: null }, riskDistance: 0.1 }), /no level on the row/);
  });

  it("refuses a tp1 row that cannot be placed on the slippage-priced table: no estimatedSlippage, or legs without times", async () => {
    const noSlip = slipRows().slice(0, 1).map((entry) => ({ ...entry, estimatedSlippage: undefined }));
    await assert.rejects(read([writeCorpus(noSlip)], { folds: ["fit"] }), /no finite estimatedSlippage/);
    const noTimes = slipRows().slice(0, 1).map((entry) => ({ ...entry, legs: (entry.legs as Row[]).map((leg) => ({ ...leg, time: undefined })) }));
    await assert.rejects(read([writeCorpus(noTimes)], { folds: ["fit"] }), /carry no finite times/);
    // The helper's own refusal surfaces through the reader with the corpus path and the row named.
    const noKind = slipRows().slice(0, 1).map((entry) => ({ ...entry, legs: (entry.legs as Row[]).map((leg) => (leg.leg === "exit" ? { ...leg, kind: undefined } : leg)) }));
    await assert.rejects(read([writeCorpus(noKind)], { folds: ["fit"] }), /shard\.jsonl: EURUSD tp1_partial row — a tp1 row's exit leg names no kind/);
  });
});

