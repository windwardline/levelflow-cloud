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
import { summarizeTuningFolds } from "../scripts/tuning-folds-summary.ts";
import {
  breakEvenWinShare,
  decomposePayoff,
  formatDecomposition,
  parseFolds,
  SEALED_FOLD,
} from "../scripts/payoff-decomposition.ts";

/**
 * Amendment 39: profit is the measure, win rate is a result. This reader says
 * what a win pays, what a loss costs, and where the planned ratio goes — and
 * every figure below is hand-computed from the fixture, never read off the
 * reader. The confirm fold is sealed: every case plants confirm rows that
 * would move a figure if they were read, and asserts they did not.
 */

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "payoff-decomposition.ts");
const HOUR = 3_600_000;
const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2025, 0, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 8, 1);

type Row = Record<string, unknown>;

function row(input: {
  accepted?: boolean;
  forgoneRunnerR?: number;
  grossRealizedR?: number;
  holdout?: boolean;
  index: number;
  ladderRewardRisk?: number;
  outcome: string;
  realizedR: number;
  rewardRisk?: number;
  split: string;
  symbol: string;
  variant?: string;
}): Row {
  const base = input.split === "fit"
    ? FIT_START
    : input.split === "select"
    ? SELECT_START
    : CONFIRM_START;
  return {
    accepted: input.accepted ?? true,
    forgoneRunnerR: input.forgoneRunnerR ?? 0,
    grossOutcome: input.outcome,
    grossRealizedR: input.grossRealizedR ?? input.realizedR,
    holdout: input.holdout ?? false,
    ladderRewardRisk: input.ladderRewardRisk ?? 1.0,
    outcome: input.outcome,
    realizedR: input.realizedR,
    rewardRisk: input.rewardRisk ?? 1.8,
    split: input.split,
    symbol: input.symbol,
    time: base + input.index * HOUR,
    variant: input.variant ?? "baseline",
  };
}

/**
 * Forex has three markets so the stratified rule holds one out (NZDCHF, the
 * lowest sha256 rank of the three — the same roster the tuning-folds fixture
 * documents) while the STAMP sits on GBPUSD. Per fold:
 *
 *   EURUSD  4 x tp1_partial +0.3 (gross +0.35, forgone 0.1)
 *           1 x take_profit +1.2 (gross +1.25, forgone 0.2)
 *           2 x stop_loss   -1.0 (gross -0.9)
 *           1 x expired_at_loss -0.4 (gross -0.35)
 *           1 x expired_in_profit +0.1 (gross +0.15)
 *           + one unfilled, one not-accepted stop, one hold-variant win — none counted
 *   GBPUSD  3 x take_profit +2.0 (gross +2.1, forgone 0.3, rr 2.0, ladder 1.1) — stamped holdout, still pooled
 *   NZDCHF  2 x take_profit +1.0, 2 x stop_loss -1.0 — held out by the stratified rule
 *   XAUUSD  2 x take_profit +0.8 (gross +0.85, rr 1.6, ladder 0.9), 1 x stop_loss -1.0 (gross -0.95),
 *           1 x ambiguous -0.7 (gross -0.5, forgone 0.2)
 *
 * Forex pool (EURUSD + GBPUSD), 12 filled: net +6.1, gross +6.95, wins 8 for
 * +8.4 (mean +1.05), stops 2 (mean -1.0), rest 2 for -0.3 (mean -0.15).
 */
function fixtureRows(): Row[] {
  const rows: Row[] = [];
  let index = 0;
  for (const split of ["fit", "select"]) {
    for (let step = 0; step < 4; step += 1) {
      rows.push(row({ forgoneRunnerR: 0.1, grossRealizedR: 0.35, index: index++, outcome: "tp1_partial", realizedR: 0.3, split, symbol: "EURUSD" }));
    }
    rows.push(row({ forgoneRunnerR: 0.2, grossRealizedR: 1.25, index: index++, outcome: "take_profit", realizedR: 1.2, split, symbol: "EURUSD" }));
    rows.push(row({ grossRealizedR: -0.9, index: index++, outcome: "stop_loss", realizedR: -1, split, symbol: "EURUSD" }));
    rows.push(row({ grossRealizedR: -0.9, index: index++, outcome: "stop_loss", realizedR: -1, split, symbol: "EURUSD" }));
    rows.push(row({ grossRealizedR: -0.35, index: index++, outcome: "expired_at_loss", realizedR: -0.4, split, symbol: "EURUSD" }));
    rows.push(row({ grossRealizedR: 0.15, index: index++, outcome: "expired_in_profit", realizedR: 0.1, split, symbol: "EURUSD" }));
    rows.push(row({ index: index++, outcome: "unfilled", realizedR: 0, split, symbol: "EURUSD" }));
    rows.push(row({ accepted: false, index: index++, outcome: "stop_loss", realizedR: -1, split, symbol: "EURUSD" }));
    rows.push(row({ index: index++, outcome: "take_profit", realizedR: 0.5, split, symbol: "EURUSD", variant: "runnerProtection=hold" }));
    for (let step = 0; step < 3; step += 1) {
      rows.push(row({ forgoneRunnerR: 0.3, grossRealizedR: 2.1, holdout: true, index: index++, ladderRewardRisk: 1.1, outcome: "take_profit", realizedR: 2, rewardRisk: 2.0, split, symbol: "GBPUSD" }));
    }
    for (let step = 0; step < 2; step += 1) {
      rows.push(row({ index: index++, outcome: "take_profit", realizedR: 1, split, symbol: "NZDCHF" }));
      rows.push(row({ index: index++, outcome: "stop_loss", realizedR: -1, split, symbol: "NZDCHF" }));
    }
    rows.push(row({ grossRealizedR: 0.85, index: index++, ladderRewardRisk: 0.9, outcome: "take_profit", realizedR: 0.8, rewardRisk: 1.6, split, symbol: "XAUUSD" }));
    rows.push(row({ grossRealizedR: 0.85, index: index++, ladderRewardRisk: 0.9, outcome: "take_profit", realizedR: 0.8, rewardRisk: 1.6, split, symbol: "XAUUSD" }));
    rows.push(row({ grossRealizedR: -0.95, index: index++, ladderRewardRisk: 0.9, outcome: "stop_loss", realizedR: -1, rewardRisk: 1.6, split, symbol: "XAUUSD" }));
    rows.push(row({ forgoneRunnerR: 0.2, grossRealizedR: -0.5, index: index++, ladderRewardRisk: 0.9, outcome: "ambiguous", realizedR: -0.7, rewardRisk: 1.6, split, symbol: "XAUUSD" }));
  }
  // Confirm rows that would flip every figure if they were read.
  for (let step = 0; step < 20; step += 1) {
    rows.push(row({ index: index++, outcome: "take_profit", realizedR: 5, split: SEALED_FOLD, symbol: "EURUSD" }));
    rows.push(row({ index: index++, outcome: "stop_loss", realizedR: -5, split: SEALED_FOLD, symbol: "XAUUSD" }));
  }
  return rows;
}

function writeCorpus(rows: Row[], name = "shard"): string {
  const dir = mkdtempSync(join(tmpdir(), "payoff-decomposition-"));
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
    generatedAt: "2026-09-05T20:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    grossCostScale: 0,
    holdoutSymbols: ["GBPUSD"],
    modeledCostScale: 1,
    requestedSymbols: symbols,
    source: { dirty: false, revision: "958ff340000000000000000000000000000000000" },
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

/** A pin directory holding no pin: the fixture roster resolves its set unpinned. */
const NO_PIN_DIR = join(mkdtempSync(join(tmpdir(), "payoff-pins-")), "none");

function decompose(paths: string[], folds = ["fit", "select"]) {
  return decomposePayoff({ folds, holdoutPinDir: NO_PIN_DIR, paths, variant: "baseline" });
}

function near(actual: number | null, expected: number, digits = 6): void {
  assert.notEqual(actual, null);
  assert.equal(Number((actual as number).toFixed(digits)), Number(expected.toFixed(digits)));
}

describe("the confirm fold is sealed", () => {
  it("refuses the fold by name before touching a corpus", () => {
    assert.throws(() => parseFolds("fit,confirm"), /held-back fold/);
    assert.throws(() => parseFolds(""), /names no fold/);
  });

  it("never lets confirm rows reach a figure, even though the corpus carries them", async () => {
    const summary = await decompose([writeCorpus(fixtureRows())]);
    // 40 confirm rows sit in the file; the door withholds every one.
    assert.equal(summary.rows.sealed, 40);
    assert.equal(summary.rows.total, fixtureRows().length);
    const forex = summary.cells.get("forex|fit")!;
    // Had one +5R confirm row been read, net R and the mean win would both move.
    near(forex.rSum, 6.1);
    assert.equal(forex.filled, 12);
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

describe("what a win pays and what a loss costs", () => {
  it("decomposes the class pool by outcome, hand-computed", async () => {
    const summary = await decompose([writeCorpus(fixtureRows())]);
    const forex = summary.cells.get("forex|select")!;
    assert.equal(forex.filled, 12);
    near(forex.rSum, 6.1);
    near(forex.grossSum, 6.95);
    near(forex.expectancy, 6.1 / 12);
    // Wins are what the repo's vocabulary calls wins: take_profit and tp1_partial.
    assert.equal(forex.wins.n, 8);
    near(forex.wins.mean, 1.05);
    assert.equal(forex.stops.n, 2);
    near(forex.stops.mean, -1.0);
    near(forex.payoff, 1.05);
    near(forex.winShare, 8 / 12);
    // Expiries and ambiguous rows are neither win nor stop; they are held fixed.
    assert.equal(forex.rest.n, 2);
    near(forex.rest.mean, -0.15);
    near(forex.breakEvenWinShare, (5 / 6 + 0.15 / 6) / 2.05);
    near(forex.plannedRewardRisk, 1.85);
    near(forex.plannedLadderRewardRisk, 1.025);
    const tp1 = forex.byOutcome.get("tp1_partial")!;
    assert.equal(tp1.n, 4);
    near(tp1.mean, 0.3);
    near(tp1.grossMean, 0.35);
    near(tp1.forgoneRunnerMean, 0.1);
    const tp = forex.byOutcome.get("take_profit")!;
    assert.equal(tp.n, 4);
    near(tp.mean, 1.8);
    near(tp.grossMean, 1.8875);
    near(tp.forgoneRunnerMean, 0.275);
    assert.equal(forex.byOutcome.get("stop_loss")!.n, 2);
    assert.equal(forex.byOutcome.get("expired_at_loss")!.n, 1);
    assert.equal(forex.byOutcome.get("expired_in_profit")!.n, 1);
  });

  it("a class below break-even reads as below break-even", async () => {
    const summary = await decompose([writeCorpus(fixtureRows())]);
    const metals = summary.cells.get("metals|fit")!;
    assert.equal(metals.filled, 4);
    near(metals.expectancy, -0.025);
    near(metals.payoff, 0.8);
    near(metals.winShare, 0.5);
    near(metals.breakEvenWinShare, (0.75 + 0.175) / 1.8);
    assert.ok((metals.winShare as number) < (metals.breakEvenWinShare as number));
    assert.equal(metals.rest.n, 1);
    assert.equal(metals.byOutcome.get("ambiguous")!.n, 1);
  });

  it("pools every class read, held-out markets excluded", async () => {
    const summary = await decompose([writeCorpus(fixtureRows())]);
    const pooled = summary.cells.get("pooled|fit")!;
    assert.equal(pooled.filled, 16);
    near(pooled.rSum, 6.0);
    assert.equal(pooled.wins.n, 10);
    assert.equal(pooled.stops.n, 3);
  });

  it("the break-even win share zeroes the expectancy with the loss and expiry structure held fixed", () => {
    // Two-outcome case: payoff 1 -> 50%; payoff 0.5 -> 66.7%.
    near(breakEvenWinShare({ meanWin: 1, meanStop: -1, restShare: 0, restMean: 0 }), 0.5);
    near(breakEvenWinShare({ meanWin: 0.5, meanStop: -1, restShare: 0, restMean: 0 }), 2 / 3);
    // With a fixed expiry drag the bar rises; with a fixed expiry gain it falls.
    near(breakEvenWinShare({ meanWin: 1, meanStop: -1, restShare: 0.2, restMean: -0.5 }), (0.8 + 0.1) / 2);
    near(breakEvenWinShare({ meanWin: 1, meanStop: -1, restShare: 0.2, restMean: 0.5 }), (0.8 - 0.1) / 2);
    // No stops or no wins: there is no ratio to speak of.
    assert.equal(breakEvenWinShare({ meanWin: 1, meanStop: null, restShare: 0, restMean: 0 }), null);
    assert.equal(breakEvenWinShare({ meanWin: null, meanStop: -1, restShare: 0, restMean: 0 }), null);
  });
});

describe("what it keeps apart", () => {
  it("counts unfilled, not-accepted and other-variant rows out, and says so", async () => {
    const summary = await decompose([writeCorpus(fixtureRows())]);
    assert.equal(summary.rows.unfilled, 2);
    assert.equal(summary.rows.notAccepted, 2);
    assert.equal(summary.rows.otherVariants, 2);
    assert.equal(summary.variant, "baseline");
  });

  it("holds out the stratified set, not the stamp", async () => {
    const summary = await decompose([writeCorpus(fixtureRows())]);
    assert.deepEqual(summary.holdout.markets, ["NZDCHF"]);
    // NZDCHF's four filled rows per fold never reach the forex pool; stamped GBPUSD does.
    assert.equal(summary.rows.heldOut, 8);
    assert.equal(summary.cells.get("forex|fit")!.byOutcome.get("take_profit")!.n, 4);
  });

  it("--include-holdout pools the held-out market too, and says so", async () => {
    const path = writeCorpus(fixtureRows());
    const summary = await decomposePayoff({ folds: ["fit"], holdoutPinDir: NO_PIN_DIR, includeHoldout: true, paths: [path], variant: "baseline" });
    assert.equal(summary.rows.heldOut, 0);
    const forex = summary.cells.get("forex|fit")!;
    // NZDCHF's two wins and two stops join the twelve: net unchanged, four more filled.
    assert.equal(forex.filled, 16);
    near(forex.rSum, 6.1);
    assert.equal(forex.wins.n, 10);
    assert.equal(forex.stops.n, 4);
    assert.match(formatDecomposition(summary), /held-out markets INCLUDED/);
    assert.match(formatDecomposition(summary), /NZDCHF/);
  });

  it("reproduces the tuning-folds reader's cells on the same corpus — the control", async () => {
    const path = writeCorpus(fixtureRows());
    const mine = await decompose([path]);
    const theirs = await summarizeTuningFolds({ folds: ["fit", "select"], holdoutPinDir: NO_PIN_DIR, minFilled: 3, paths: [path] });
    for (const [key, cell] of theirs.byClassVariantFold) {
      const [assetType, variant, fold] = key.split("|");
      if (variant !== "baseline") continue;
      const own = mine.cells.get(`${assetType}|${fold}`)!;
      assert.equal(own.filled, cell.net.filled, key);
      near(own.rSum, cell.net.rSum);
    }
  });

  it("refuses a corpus whose manifest does not verify", async () => {
    const path = writeCorpus(fixtureRows());
    const manifestPath = `${path}.manifest.json`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.anchor = "2026-08-27";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    await assert.rejects(decompose([path]), /hash/i);
    // And a re-hashed edit is a different corpus, read as such.
    const { generatedAt: _g, manifestHash: _h, ...payload } = manifest;
    manifest.manifestHash = sha256Hex(stableStringify(payload));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const summary = await decompose([path]);
    assert.equal(summary.anchor, "2026-08-27");
  });

  it("prints the door on its first lines", async () => {
    const summary = await decompose([writeCorpus(fixtureRows())]);
    const text = formatDecomposition(summary);
    assert.match(text, /confirm: SEALED, not read/);
    assert.match(text, /40 rows withheld at the door/);
    assert.match(text, /variant baseline/);
    assert.match(text, /break-even/);
  });
});
