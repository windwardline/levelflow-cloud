import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";

/**
 * A split the reader does not know is refused by name, never tallied.
 *
 * The sealed door (R4 act 1) withholds the confirm fold; every reader that
 * classifies rows by their emitted split must then treat any OTHER split as
 * a vocabulary it does not know. Two readers tallied such rows into their
 * totals and printed only fit and select (found by the diff's refuter,
 * 2026-09-02); the four re-cutters and stop-provenance refused already.
 * Executed, because what a process does with a row it cannot place is a
 * fact about the process.
 */

const REPO = process.cwd();
const TSX = join(REPO, "node_modules/.bin/tsx");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2025, 0, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 8, 1);

type Row = Record<string, unknown>;

function row(symbol: string, split: string, index: number): Row {
  const time = (split === "fit" ? FIT_START : SELECT_START) + index * 6 * HOUR;
  const price = symbol === "EURUSD" ? 1.1 : 450;
  const risk = price * 0.005;
  return {
    accepted: true,
    confidenceScore: 55 + (index % 30),
    entryPrice: price,
    // The acceptance gates read the cost columns, and the readers refuse a
    // corpus without them rather than skipping the cost-share gate. A 1%
    // share sits under every cap, so no row here is declined by it and the
    // refusal this file measures is still the split's.
    estimatedRoundTripCost: risk * 0.01,
    exitAtMs: time + 4 * HOUR,
    filledAtMs: time + 15 * 60_000,
    grossRealizedR: index % 3 === 0 ? -0.98 : 0.37,
    holdout: false,
    legs: [{ leg: "entry", price, time: time + 15 * 60_000 }, { leg: "exit", price: price + risk, time: time + 4 * HOUR }],
    outcome: index % 3 === 0 ? "stop_loss" : "tp1_partial",
    realizedR: index % 3 === 0 ? -1 : 0.35,
    rewardRisk: 1.5,
    riskDistance: risk,
    split,
    stopLoss: price - risk,
    stopProvenance: "pivot",
    symbol,
    takeProfit: price + 1.5 * risk,
    takeProfit1: price + 0.35 * risk,
    time,
    tp1Hit: index % 3 !== 0,
    variant: "baseline",
  };
}

const fixtureDirs: string[] = [];
const removeFixtures = () => {
  for (const dir of fixtureDirs) rmSync(dir, { force: true, recursive: true });
};
process.on("exit", removeFixtures);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    removeFixtures();
    process.exit(signal === "SIGTERM" ? 143 : 130);
  });
}

function corpus(): string {
  const dir = mkdtempSync(join(tmpdir(), "unknown-split-"));
  fixtureDirs.push(dir);
  const rows: Row[] = [];
  for (const symbol of ["EURUSD", "ZCUSX"]) {
    for (const split of ["fit", "select"]) {
      for (let index = 0; index < 40; index += 1) rows.push(row(symbol, split, index));
    }
  }
  // One row the corpus's vocabulary does not name.
  rows.push({ ...row("EURUSD", "select", 41), split: "weird" });
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(emitPath, rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
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
    folds: [
      { decisionEndMs: SELECT_START - 5 * DAY, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - 5 * DAY, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - 5 * DAY, endMs: END, name: "confirm", startMs: CONFIRM_START },
    ],
    generatedAt: "2026-09-02T20:00:00.000Z",
    grid: [{}],
    stepBars: 16,
    symbols: ["EURUSD", "ZCUSX"].map((symbol) => ({
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
    treasuryCurve: { count: 3_000, firstTime: Date.UTC(2013, 0, 2), largestGapMs: 4 * DAY, lastTime: Date.UTC(2027, 0, 1) },
    warmupBars: 240,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return emitPath;
}

// Every reader that places rows by their emitted split and runs from the
// repo root without a recorded-picks tree. Tokens: F the corpus, O an
// artifact path inside the fixture.
const READERS: Record<string, string[]> = {
  "ag-class-derivation": ["F"],
  "confidence-bands": ["F"],
  "cost-sensitivity-verdict": ["--paired", "F", "--cells", "EURUSD|baseline", "--out", "O"],
  "stop-provenance": ["F"],
  "threshold-rescue": ["F", "--markets", "EURUSD|baseline", "--out", "O"],
};

describe("a split the reader does not know is refused by name", () => {
  const emitPath = corpus();
  for (const [reader, args] of Object.entries(READERS)) {
    it(`${reader} refuses the row rather than tallying it`, () => {
      const argv = args.map((token) =>
        token === "F" ? emitPath : token === "O" ? join(emitPath, "..", `${reader}.json`) : token
      );
      const result = spawnSync(TSX, [join(REPO, "scripts", `${reader}.ts`), ...argv], {
        cwd: REPO,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
        timeout: 120_000,
      });
      assert.equal(result.error, undefined, `harness failed to start ${reader}: ${String(result.error)}`);
      assert.notEqual(result.status, 0, `${reader} exited 0 with an unknown split in the corpus:\n${result.stdout}`);
      assert.match(result.stderr, /weird/, `${reader} did not name the split it refused:\n${result.stderr}`);
    });
  }
});
