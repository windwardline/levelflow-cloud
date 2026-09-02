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
  formatSummary,
  parseFolds,
  SEALED_FOLD,
  summarizeTuningFolds,
} from "../scripts/tuning-folds-summary.ts";

/**
 * The confirm fold is sealed and this reader cannot open it. Every case here
 * plants confirm rows that would move a figure if they were read, and asserts
 * they did not; the refusals are executed, not read off the source.
 */

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "tuning-folds-summary.ts");
const HOUR = 3_600_000;
const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2025, 0, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 8, 1);

type Row = Record<string, unknown>;

function row(input: {
  accepted?: boolean;
  holdout?: boolean;
  index: number;
  realizedR: number;
  split: string;
  symbol: string;
  variant?: string;
}): Row {
  const base = input.split === "fit"
    ? FIT_START
    : input.split === "select"
    ? SELECT_START
    : CONFIRM_START;
  const outcome = input.realizedR > 0
    ? "take_profit"
    : input.realizedR === 0
    ? "unfilled"
    : "stop_loss";
  return {
    accepted: input.accepted ?? true,
    grossOutcome: outcome,
    // The gross arm charges less, so every filled row earns a little more.
    grossRealizedR: input.realizedR === 0 ? 0 : input.realizedR + 0.05,
    holdout: input.holdout ?? false,
    outcome,
    realizedR: input.realizedR,
    split: input.split,
    symbol: input.symbol,
    time: base + input.index * HOUR,
    variant: input.variant ?? "baseline",
  };
}

/** EURUSD wins most and loses money; GBPUSD (held out) and XAUUSD are plain. */
function fixtureRows(): Row[] {
  const rows: Row[] = [];
  let index = 0;
  for (const split of ["fit", "select"]) {
    for (let step = 0; step < 6; step += 1) {
      // Four small wins, two stops per fold: 4 x 0.2 - 2 x 1.0 = -1.2R
      rows.push(row({ index: index++, realizedR: step < 4 ? 0.2 : -1, split, symbol: "EURUSD" }));
      rows.push(row({ holdout: true, index: index++, realizedR: step % 2 === 0 ? 1 : -1, split, symbol: "GBPUSD" }));
      rows.push(row({ index: index++, realizedR: step % 3 === 0 ? -1 : 0.8, split, symbol: "XAUUSD" }));
    }
    rows.push(row({ index: index++, realizedR: 0, split, symbol: "XAUUSD" }));
    rows.push(row({ accepted: false, index: index++, realizedR: -1, split, symbol: "XAUUSD" }));
    rows.push(row({ index: index++, realizedR: 0.5, split, symbol: "EURUSD", variant: "runnerProtection=hold" }));
  }
  // Confirm rows that would flip every sign if they were read.
  for (let step = 0; step < 40; step += 1) {
    rows.push(row({ index: index++, realizedR: 5, split: SEALED_FOLD, symbol: "EURUSD" }));
    rows.push(row({ index: index++, realizedR: -5, split: SEALED_FOLD, symbol: "XAUUSD" }));
  }
  return rows;
}

function writeCorpus(
  rows: Row[],
  overrides: Record<string, unknown> = {},
  name = "shard",
): string {
  const dir = mkdtempSync(join(tmpdir(), "tuning-folds-"));
  const emitPath = join(dir, `${name}.jsonl`);
  writeFileSync(emitPath, rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const symbols = [...new Set(rows.map((entry) => String(entry.symbol)))];
  const manifest = buildSweepManifest({
    acceptance: { captureAll: true, ignoreLowEdge: false },
    analyzerVersion: "2026.09.02.test",
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
    generatedAt: "2026-09-02T10:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    grossCostScale: 0,
    holdoutSymbols: ["GBPUSD"],
    modeledCostScale: 1,
    requestedSymbols: symbols,
    source: { dirty: false, revision: "e51e742c6ed50ef7a1a026760af61f39b0f9570f" },
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
    ...overrides,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return emitPath;
}

/** Rewrite a manifest field the way an older driver would have left it. */
function rewriteManifest(emitPath: string, mutate: (manifest: Record<string, unknown>) => void): void {
  const path = `${emitPath}.manifest.json`;
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutate(manifest);
  const { generatedAt: _generatedAt, manifestHash: _hash, ...payload } = manifest;
  manifest.manifestHash = sha256Hex(stableStringify(payload));
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}

describe("the confirm fold is sealed", () => {
  it("refuses the fold by name before touching a corpus", () => {
    assert.throws(() => parseFolds("fit,confirm"), /the held-back fold/);
    assert.throws(() => parseFolds("confirm"), /grid-totalr --confirm-final/);
    assert.throws(() => parseFolds(""), /names no fold/);
    assert.deepEqual(parseFolds("fit, select, fit"), ["fit", "select"]);
  });

  it("never lets confirm rows reach a figure, even though the corpus carries them", async () => {
    const summary = await summarizeTuningFolds({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    // 80 confirm rows sit in the file; none is read.
    assert.equal(summary.rows.otherFolds, 80);
    const eurusd = summary.bySymbolVariant.get("forex|EURUSD|baseline")!;
    // 12 filled, all in fit + select: 8 x 0.2 - 4 x 1.0 = -2.4R. Had a single
    // +5R confirm row been read the sign would flip.
    assert.equal(eurusd.net.filled, 12);
    assert.equal(Number(eurusd.net.rSum.toFixed(6)), -2.4);
    assert.ok(eurusd.net.rSum < 0);
  });

  it("refuses a fold the manifest never declared", async () => {
    await assert.rejects(
      summarizeTuningFolds({ folds: ["fit", "nonesuch"], minFilled: 3, paths: [writeCorpus(fixtureRows())] }),
      /no "nonesuch"/,
    );
  });

  it("refuses a legacy two-split corpus rather than guessing its folds", async () => {
    const path = writeCorpus(fixtureRows());
    rewriteManifest(path, (manifest) => {
      delete manifest.folds;
    });
    await assert.rejects(
      summarizeTuningFolds({ folds: ["fit", "select"], minFilled: 3, paths: [path] }),
      /legacy two-split corpus/,
    );
  });
});

describe("what it counts, and what it keeps apart", () => {
  it("excludes held-out markets from the class rollup and lists them per market", async () => {
    const summary = await summarizeTuningFolds({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    const forexBaseline = summary.byClassVariant.get("forex|baseline")!;
    // EURUSD alone: GBPUSD is held out and contributes to no class cell.
    assert.equal(forexBaseline.net.filled, 12);
    assert.equal(summary.rows.heldOut, 12);
    const gbpusd = summary.bySymbolVariant.get("forex|GBPUSD|baseline")!;
    assert.equal(gbpusd.holdout, true);
    assert.equal(gbpusd.net.filled, 12);
    const text = formatSummary(summary);
    assert.match(text, /\| forex \| GBPUSD \| baseline \| HELD OUT \|/);
  });

  it("skips rows the sweep did not accept and says how many", async () => {
    const summary = await summarizeTuningFolds({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    assert.equal(summary.rows.notAccepted, 2);
    const xauusd = summary.bySymbolVariant.get("metals|XAUUSD|baseline")!;
    // 12 accepted decisions per two folds plus one unfilled each: n 14, filled 12.
    assert.equal(xauusd.net.n, 14);
    assert.equal(xauusd.net.filled, 12);
  });

  it("carries the gross arm beside the net one, and the gross arm earns more", async () => {
    const summary = await summarizeTuningFolds({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    for (const entry of summary.bySymbolVariant.values()) {
      assert.ok(entry.gross.rSum > entry.net.rSum, entry.symbol);
      assert.equal(entry.gross.filled, entry.net.filled);
    }
  });

  it("puts the rate beside the money and names the markets that win most while losing", async () => {
    const summary = await summarizeTuningFolds({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    const text = formatSummary(summary);
    // EURUSD wins 8 of 12 and loses 2.4R: the amendment-39 divergence, named.
    assert.match(text, /winning at least half their filled setups while losing money: 1 \(EURUSD\)/);
    assert.match(text, /\| forex \| EURUSD \| baseline \|  \| 12 \| 12 \| 0 \| 66\.7% \| 33\.3% \| -0\.200 \|/);
  });

  it("marks a cell THIN below the floor and never prints an expectancy over zero filled", async () => {
    const summary = await summarizeTuningFolds({
      folds: ["fit", "select"],
      minFilled: 30,
      paths: [writeCorpus(fixtureRows())],
    });
    const text = formatSummary(summary);
    assert.match(text, /\| forex \| baseline \| 12 \| 12 \| 0 \|.*\| THIN \|/);
    assert.match(text, /markets above the thin floor at baseline: 0/);
  });

  it("splits the per-fold table so select stands apart from fit", async () => {
    const summary = await summarizeTuningFolds({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    const fit = summary.byClassVariantFold.get("forex|baseline|fit")!;
    const select = summary.byClassVariantFold.get("forex|baseline|select")!;
    assert.equal(fit.net.filled, 6);
    assert.equal(select.net.filled, 6);
    assert.equal(summary.byClassVariantFold.has("forex|baseline|confirm"), false);
  });

  it("refuses two shards that are two measurements", async () => {
    const first = writeCorpus(fixtureRows());
    const second = writeCorpus(fixtureRows(), { anchor: "2026-08-25" }, "other");
    await assert.rejects(
      summarizeTuningFolds({ folds: ["fit", "select"], minFilled: 3, paths: [first, second] }),
      /two measurements cannot be summarised as one/,
    );
  });

  it("pools two shards of one measurement", async () => {
    const first = writeCorpus(fixtureRows());
    const second = writeCorpus(fixtureRows(), {}, "other");
    const summary = await summarizeTuningFolds({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [first, second],
    });
    assert.equal(summary.manifestHashes.length, 2);
    assert.equal(summary.bySymbolVariant.get("forex|EURUSD|baseline")!.net.filled, 24);
  });
});

describe("as a binary", () => {
  function run(args: string[]): { code: number; stderr: string; stdout: string } {
    const env = { ...process.env };
    delete env.TSX_TSCONFIG_PATH;
    try {
      const stdout = execFileSync(TSX, [READER, ...args], {
        cwd: mkdtempSync(join(tmpdir(), "tuning-folds-run-")),
        encoding: "utf8",
        env,
        stdio: "pipe",
      });
      return { code: 0, stderr: "", stdout };
    } catch (error) {
      const failed = error as { status?: number; stderr?: string; stdout?: string };
      const stderr = String(failed.stderr ?? "");
      assert.doesNotMatch(
        stderr,
        /npm error|npx canceled|command not found|Cannot find module 'tsx'|tsx\/dist\/register/,
        `the reader was never executed — a harness failure must never read as the subject refusing: ${stderr.slice(0, 300)}`,
      );
      return { code: failed.status ?? -1, stderr, stdout: String(failed.stdout ?? "") };
    }
  }

  it("refuses with no corpus named, and says what to pass", () => {
    const result = run([]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /no corpus paths given — pass one or more emit\.jsonl shards/);
  });

  it("refuses --folds confirm at the command line", () => {
    const result = run([writeCorpus(fixtureRows()), "--folds", "fit,confirm"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /the held-back fold/);
  });

  it("prints the summary and exits 0 on a good corpus", () => {
    const result = run([writeCorpus(fixtureRows()), "--min-filled", "3"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /confirm: SEALED, not read/);
    assert.match(result.stdout, /## Per market × variant/);
  });
});
