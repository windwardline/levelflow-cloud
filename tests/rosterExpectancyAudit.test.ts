import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  BASELINE,
  collect,
  type CollectedSelect,
  shardPathsFromArgv,
  stats,
  verdictFor,
} from "../scripts/roster-expectancy-audit.ts";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import { SEALED_FOLD, type SweepEmitRow } from "../scripts/sweepStats.ts";

// WIF-4 (readiness audit, 2026-08-11): run with no shard paths, the audit
// read zero rows, called every market "unmeasurable", and wrote an artifact
// that looked like a finished run. An instrument that examined nothing must
// refuse to report — the no-silent-failure standard, applied to the one
// script whose output is quoted as a roster verdict.
describe("roster-expectancy-audit argv", () => {
  it("collects the positional shard paths and drops flag pairs", () => {
    assert.deepEqual(
      shardPathsFromArgv(["a.jsonl", "--out", "x.json", "b.jsonl"]),
      ["a.jsonl", "b.jsonl"],
    );
  });

  it("refuses a run with no shard paths instead of reporting on zero rows", () => {
    assert.throws(
      () => shardPathsFromArgv(["--out", "x.json"]),
      /no shard paths/,
    );
  });
});

/**
 * The baseline branch reads the RIGHT cell for the markets that reach it.
 *
 * `roster-expectancy-audit` reads a derived market at its own grid cell and
 * every other market at the named baseline, "which is what the shipped engine
 * does". That claim is the kind that rots — it is prose about a numeric
 * relationship between two files that move independently — so it is asserted
 * here against the shipped calibration rather than believed.
 *
 * THE OBVIOUS TEST IS WRONG, and this is the point. Measured across all 97
 * roster markets, ZERO match the baseline cell: the derived markets ship 4x
 * ATR stops and `trail_tp1`, and they never reach this branch. Judged on the
 * population that DOES reach it — the markets with no derived cell — every
 * one matches. A guard that took the whole roster as its population would
 * report a defect that is not there.
 */
describe("the audit's baseline cell is the shipped geometry, for its own population", () => {
  // PARSED FROM THE CONSTANT THE AUDIT USES, never retyped. A literal here
  // passed while `BASELINE` was changed to a cell matching no shipped market
  // — the test asserted shipped calibration against a number I had typed,
  // which is agreement with myself rather than with the audit.
  const CELL = Object.fromEntries(
    BASELINE.split(",").map((pair) => {
      const [key, raw] = pair.split("=");
      const numeric = Number(raw);
      return [key, Number.isFinite(numeric) && raw !== "" ? numeric : raw];
    }),
  ) as Record<string, unknown>;

  /** Markets with no derived cell — the ones the baseline branch judges. */
  function fallThroughMarkets(): string[] {
    const derived = new Set<string>();
    for (
      const file of [
        "4d-final-picks.json",
        "4d-holdout-final-picks.json",
        "4d-totality-final-picks.json",
      ]
    ) {
      const picks = JSON.parse(
        readFileSync(`docs/research/baseline-2026-08-10/${file}`, "utf8"),
      ) as { finalPicks?: Record<string, unknown> };
      for (const symbol of Object.keys(picks.finalPicks ?? {})) {
        derived.add(symbol);
      }
    }
    return (defaultScanSymbols as unknown as string[]).filter(
      (symbol) => !derived.has(symbol),
    );
  }

  it("has a fall-through population worth judging", () => {
    // NON-VACUITY: if every market earned a derived cell the loop below would
    // pass having compared nothing.
    const fallThrough = fallThroughMarkets();
    assert.ok(
      fallThrough.length >= 5,
      `only ${fallThrough.length} markets reach the baseline branch — the ` +
        `comparison below would prove little`,
    );
  });

  it("matches every market that reaches it, on geometry", () => {
    for (const symbol of fallThroughMarkets()) {
      const calibration = getCategoryCalibration(
        symbol as Parameters<typeof getCategoryCalibration>[0],
      ) as unknown as Record<string, unknown>;
      // `replay.ts` resolves an absent mode with `?? "breakeven"`, so an
      // undefined shipped value IS the cell's value, not a mismatch.
      const protection = calibration.runnerProtection ?? "breakeven";
      assert.equal(
        calibration.maxStopAtrMultiplier,
        CELL.maxStopAtrMultiplier,
        `${symbol}: audited at a stop multiple it does not ship`,
      );
      assert.equal(
        calibration.sizingHoursFactor,
        CELL.sizingHoursFactor,
        `${symbol}: audited at a sizing window it does not ship`,
      );
      assert.equal(
        protection,
        CELL.runnerProtection,
        `${symbol}: audited under a runner protection it does not ship`,
      );
    }
  });

  it("re-applies the CLASS threshold rather than inheriting the cell's zero", () => {
    // The one term that legitimately differs: the cell pins
    // `confidenceThreshold=0` and these markets ship 25, 40 or 68. The branch
    // re-applies the class value, which is why the mismatch is correct rather
    // than a defect — and why deleting that filter would silently admit every
    // sub-threshold decision.
    const source = readFileSync("scripts/roster-expectancy-audit.ts", "utf8");
    assert.match(
      source,
      /const threshold = getCategoryCalibration\(symbol\)\.confidenceThreshold;/,
    );
    assert.match(source, /if \(!Number\.isFinite\(score\) \|\| score < threshold\) return;/);
    const positive = fallThroughMarkets().filter((symbol) =>
      (getCategoryCalibration(
        symbol as Parameters<typeof getCategoryCalibration>[0],
      ) as unknown as { confidenceThreshold: number }).confidenceThreshold > 0
    );
    assert.ok(
      positive.length > 0,
      "no fall-through market carries a positive threshold, so the re-apply " +
        "above is doing nothing and this branch deserves re-reading",
    );
  });

  it("refuses the EMPTY grid cell rather than pooling it with the named one", () => {
    // `BASELINE` and `describeOverride({})`'s "baseline" are two different
    // calibrations. No tracked corpus carries the empty cell — all 25
    // distinct cells across `sweeps/**` have explicit overrides — so the old
    // `||` never fired and its hazard never showed.
    const source = readFileSync("scripts/roster-expectancy-audit.ts", "utf8");
    assert.doesNotMatch(
      source,
      /variant !== BASELINE && variant !== "baseline"/,
      "the audit admits two different cells as one market's expectancy",
    );
    assert.match(
      source,
      /if \(variant === "baseline"\) \{\s*\n\s*throw new Error\(/,
      "the empty cell is silently dropped instead of refused, so a grid that " +
        "gains one reports a smaller population as a smaller result",
    );
  });
});

// ---------------------------------------------------------------------------
// R4 act 1 (2026-09-02): the 2026-09-02 audit found this reader re-cutting
// folds at 50/75% of each market's span and accumulating a "confirm" cell
// from rows past the 75% mark — an unrecorded read of the held-back fold,
// ignoring the split the sweep had stamped on every row — and then resting
// its VERDICT on that cell. The door now withholds confirm rows; the reader
// classifies what arrives by label and judges on select.

const TEST_TREASURY_CURVE: TreasuryCurveFacts = {
  count: 3_000,
  firstTime: Date.UTC(2013, 0, 2),
  largestGapMs: 4 * 86_400_000,
  lastTime: Date.UTC(2027, 0, 1),
};
const DAY = 86_400_000;
const SYMBOL = "EURUSD";
// A derived cell's shape, as the picks artifacts record one.
const DERIVED_CELL =
  "confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3";
// One calendar per fold, so a row's TIME says where the retired 50/75
// re-cut would have binned it and its LABEL says where the sweep did.
const FOLD_START: Record<string, number> = {
  [SEALED_FOLD]: Date.UTC(2025, 6, 1),
  fit: Date.UTC(2025, 0, 1),
  select: Date.UTC(2025, 3, 1),
  test: Date.UTC(2025, 3, 1),
  train: Date.UTC(2025, 0, 1),
};
const END = Date.UTC(2025, 9, 1);

function rowsIn(
  split: string,
  count: number,
  variant: string,
  realizedR: number,
  score = 80,
): SweepEmitRow[] {
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < count; day += 1) {
    rows.push({
      accepted: true,
      confidenceScore: score,
      outcome: realizedR < 0 ? "stop_loss" : "take_profit",
      realizedR,
      split,
      symbol: SYMBOL,
      time: (FOLD_START[split] ?? FOLD_START.select) + day * DAY +
        12 * 3_600_000,
      variant,
    } as SweepEmitRow);
  }
  return rows;
}

/** A shard beside its manifest: folded (fit/select/confirm) or legacy (train/test). */
function writeCorpus(rows: SweepEmitRow[], shape: "folded" | "legacy"): string {
  const dir = mkdtempSync(join(tmpdir(), "roster-audit-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(emitPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const input: Parameters<typeof buildSweepManifest>[0] = {
    acceptance: { captureAll: true, ignoreLowEdge: false },
    analyzerVersion: "2026.08.09.test",
    anchor: "2026-08-11",
    barRejections: {},
    clock: { calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK },
    conditions: {
      availableTimeframeCount: "min-four-by-construction",
      macroAdjustment: "historical-treasury-curve",
      providerWarningCount: "zero-by-construction",
      spreadSource: "modeled-by-construction",
      weightAdjustment: "raw-engine-zero",
    },
    days: 365,
    generatedAt: "2026-08-11T05:00:00.000Z",
    grid: [{ confidenceThreshold: 0 }],
    stepBars: 16,
    symbols: [{
      calibration: {},
      providerSymbol: SYMBOL,
      series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
      symbol: SYMBOL,
    }],
    trainShare: 0.6,
    treasuryCurve: TEST_TREASURY_CURVE,
    warmupBars: 240,
  };
  if (shape === "folded") {
    input.folds = [
      {
        decisionEndMs: FOLD_START.select - 5 * DAY,
        endMs: FOLD_START.select,
        name: "fit",
        startMs: FOLD_START.fit,
      },
      {
        decisionEndMs: FOLD_START[SEALED_FOLD] - 5 * DAY,
        endMs: FOLD_START[SEALED_FOLD],
        name: "select",
        startMs: FOLD_START.select,
      },
      {
        decisionEndMs: END - 5 * DAY,
        endMs: END,
        name: SEALED_FOLD,
        startMs: FOLD_START[SEALED_FOLD],
      },
    ];
  }
  writeFileSync(
    `${emitPath}.manifest.json`,
    JSON.stringify(buildSweepManifest(input), null, 2) + "\n",
  );
  return emitPath;
}

/** Everything collect() returns, in a form two runs can be compared byte for byte. */
function serialize(collected: CollectedSelect): string {
  return JSON.stringify({
    folds: collected.folds,
    rows: collected.rows,
    select: [...collected.select],
  });
}

describe("roster-expectancy-audit — the confirm fold is sealed at the door (R4 act 1)", () => {
  const derivedAtCell = new Map([[SYMBOL, DERIVED_CELL]]);
  // Each fold carries a distinct R (fit −1, select +0.5, confirm as given),
  // so the sum over what collect() kept is a signature of WHICH rows it kept.
  const perFold = 40;
  const foldedRows = (confirmR: number, selectR = 0.5): SweepEmitRow[] => [
    ...rowsIn("fit", perFold, DERIVED_CELL, -1),
    ...rowsIn("select", perFold, DERIVED_CELL, selectR),
    ...rowsIn(SEALED_FOLD, perFold, DERIVED_CELL, confirmR),
  ];

  it("reads a derived market's cell on the select fold by its emitted label — fit dropped, confirm never arrives", () => {
    const { folds, rows, select } = collect(
      [writeCorpus(foldedRows(-3), "folded")],
      derivedAtCell,
    );
    assert.deepEqual(folds, { fit: "fit", select: "select" });
    assert.deepEqual(select.get(SYMBOL), { n: perFold, sum: perFold * 0.5, sumSq: perFold * 0.25 });
    // The door handed over the fit and select rows and withheld the confirm
    // rows — counted on the manifest, never read.
    assert.deepEqual(rows, { fit: perFold, sealed: perFold, select: perFold });
  });

  // The executed differential HANDOFF names for every sealed reader: two
  // corpora identical but for the confirm fold's R must produce byte-
  // identical output. A reader that can tell them apart has read the fold.
  it("is byte-identical across two corpora that differ only in the confirm fold's R", () => {
    const losing = collect([writeCorpus(foldedRows(-3), "folded")], derivedAtCell);
    const winning = collect([writeCorpus(foldedRows(3), "folded")], derivedAtCell);
    assert.equal(serialize(losing), serialize(winning));
    // NON-VACUITY: the same change on the select fold moves the output.
    const moved = collect([writeCorpus(foldedRows(-3, 0.6), "folded")], derivedAtCell);
    assert.notEqual(serialize(losing), serialize(moved));
  });

  it("reads a market with no derived cell at the named baseline, re-gated at its class threshold", () => {
    const threshold = getCategoryCalibration(SYMBOL).confidenceThreshold;
    const rows = [
      ...rowsIn("select", 30, BASELINE, 0.5, threshold),
      ...rowsIn("select", 30, BASELINE, -1, threshold - 1),
      // Another cell's rows are not this market's measurement.
      ...rowsIn("select", 30, DERIVED_CELL, -1),
    ];
    const { select } = collect([writeCorpus(rows, "folded")], new Map());
    assert.deepEqual(select.get(SYMBOL), { n: 30, sum: 15, sumSq: 7.5 });
  });

  it("maps a legacy corpus's test split to select and drops train", () => {
    const { folds, rows, select } = collect(
      [writeCorpus(
        [
          ...rowsIn("train", 30, DERIVED_CELL, -1),
          ...rowsIn("test", 30, DERIVED_CELL, 0.5),
        ],
        "legacy",
      )],
      derivedAtCell,
    );
    assert.deepEqual(folds, { fit: "train", select: "test" });
    assert.deepEqual(select.get(SYMBOL), { n: 30, sum: 15, sumSq: 7.5 });
    assert.deepEqual(rows, { fit: 30, sealed: 0, select: 30 });
  });

  it("refuses a split it cannot name rather than skipping it", () => {
    const rows = [
      ...rowsIn("select", 10, DERIVED_CELL, 0.5),
      ...rowsIn("holdout", 1, DERIVED_CELL, 0.5),
    ];
    assert.throws(
      () => collect([writeCorpus(rows, "folded")], derivedAtCell),
      /split "holdout", which this reader does not know/,
    );
  });

  it("refuses to pool a folded shard with a legacy one as one measurement", () => {
    assert.throws(
      () =>
        collect(
          [
            writeCorpus(rowsIn("select", 5, DERIVED_CELL, 0.5), "folded"),
            writeCorpus(rowsIn("test", 5, DERIVED_CELL, 0.5), "legacy"),
          ],
          derivedAtCell,
        ),
      /two measurements and cannot be pooled as one/,
    );
  });

  it("refuses to collect from no shard at all", () => {
    assert.throws(() => collect([], derivedAtCell), /no shard paths/);
  });
});

// The verdict used to branch on the confirm cell's interval. It now
// branches on the select fold's, with the same thresholds: upper bound
// below zero is a measured loss, lower bound above zero a measured edge,
// and anything spanning zero is neither.
describe("roster-expectancy-audit — the verdict rests on the select interval", () => {
  const acc = (rs: number[]) => ({
    n: rs.length,
    sum: rs.reduce((a, b) => a + b, 0),
    sumSq: rs.reduce((a, b) => a + b * b, 0),
  });

  it("carries the lower bound it judges from, and nulls under the floor", () => {
    const fold = stats(acc(Array.from({ length: 40 }, (_, i) => (i % 2 ? 1.5 : -0.5))));
    assert.ok(fold.se !== null && fold.expectancy !== null);
    assert.equal(fold.ci95Lower, fold.expectancy! - 1.96 * fold.se!);
    assert.equal(fold.ci95Upper, fold.expectancy! + 1.96 * fold.se!);
    const thin = stats(acc(Array.from({ length: 29 }, () => 0.5)));
    assert.deepEqual(thin, { ci95Lower: null, ci95Upper: null, expectancy: null, n: 29, se: null });
  });

  it("names each verdict from the interval, with declined ahead of all", () => {
    const positive = stats(acc(Array.from({ length: 40 }, () => 0.5)));
    assert.equal(verdictFor(positive, false).key, "measurablyPositive");
    const negative = stats(acc(Array.from({ length: 40 }, () => -1)));
    assert.equal(verdictFor(negative, false).key, "measurablyNegative");
    // Half +1, half −1: mean 0 with a real spread, so both bounds straddle it.
    const spanning = stats(acc(Array.from({ length: 40 }, (_, i) => (i % 2 ? 1 : -1))));
    assert.ok(spanning.ci95Lower! < 0 && spanning.ci95Upper! > 0);
    assert.equal(verdictFor(spanning, false).key, "zeroSpanning");
    const thin = stats(acc(Array.from({ length: 29 }, () => 0.5)));
    assert.equal(verdictFor(thin, false).key, "unmeasurable");
    assert.equal(verdictFor(positive, true).key, "declined");
  });
});

// The artifact, EXECUTED: the JSON a reader quotes must name the fold on
// every figure, state which fold it judged on and which it sealed, and
// carry no figure computed over the confirm fold. The market's effective
// cell is derived from the RECORDED confirm reads exactly as the audit
// derives it, so this holds whichever tranche last confirmed EURUSD.
describe("roster-expectancy-audit — the artifact names its fold (executed)", () => {
  const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");

  function derivedFromRecordedReads(): Map<string, string> {
    const dir = "docs/research/baseline-2026-08-10";
    const derived = new Map<string, string>();
    for (
      const [picksFile, confirmFile] of [
        ["4d-final-picks.json", "4d-confirm-read.json"],
        ["4d-holdout-final-picks.json", "4d-holdout-confirm-read.json"],
        ["4d-totality-final-picks.json", "4d-totality-confirm-read.json"],
      ]
    ) {
      const picks = JSON.parse(readFileSync(`${dir}/${picksFile}`, "utf8")) as {
        finalPicks: Record<string, { variant: string }>;
      };
      const confirm = JSON.parse(readFileSync(`${dir}/${confirmFile}`, "utf8")) as {
        confirmReport: Record<string, { confirmTotalDelta: number | null }>;
      };
      for (const [symbol, row] of Object.entries(confirm.confirmReport)) {
        if ((row.confirmTotalDelta ?? 0) > 0) {
          derived.set(symbol, picks.finalPicks[symbol].variant);
        }
      }
    }
    return derived;
  }

  it("writes select-named figures, the folds it read, and no corpus-derived confirm figure", () => {
    const variant = derivedFromRecordedReads().get(SYMBOL) ?? BASELINE;
    // Score 100 clears any class threshold, so the baseline branch keeps the
    // rows if EURUSD has no recorded cell; a derived cell ignores the score.
    const shard = writeCorpus(
      [
        ...rowsIn("fit", 40, variant, -1, 100),
        ...rowsIn("select", 40, variant, 0.5, 100),
        ...rowsIn(SEALED_FOLD, 40, variant, -3, 100),
      ],
      "folded",
    );
    const out = join(mkdtempSync(join(tmpdir(), "roster-out-")), "audit.json");
    const stdout = execFileSync(
      TSX,
      ["scripts/roster-expectancy-audit.ts", shard, "--out", out],
      { cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 120_000 },
    );
    assert.match(stdout, /on the select fold \(40 confirm rows withheld at the door\)/);

    const artifact = JSON.parse(readFileSync(out, "utf8")) as {
      folds: unknown;
      report: Record<string, Record<string, unknown>>;
      rows: unknown;
      tally: Record<string, number>;
    };
    assert.deepEqual(artifact.folds, {
      dropped: "fit",
      judgedOn: "select",
      sealed: SEALED_FOLD,
    });
    assert.deepEqual(artifact.rows, { fit: 40, sealed: 40, select: 40 });

    const eurusd = artifact.report[SYMBOL];
    assert.equal(eurusd.selectN, 40);
    assert.equal(eurusd.selectExpectancy, 0.5);
    assert.equal(eurusd.verdict, "MEASURABLY POSITIVE");
    assert.equal(artifact.tally.measurablyPositive, 1);
    // Every figure names its fold; nothing in the report names confirm.
    for (const [symbol, row] of Object.entries(artifact.report)) {
      for (const key of Object.keys(row)) {
        assert.doesNotMatch(key, /confirm/i, `${symbol}.${key}`);
        if (typeof row[key] === "number" || row[key] === null) {
          assert.ok(
            key.startsWith("select") || key === "confidenceThreshold",
            `${symbol}.${key} is a figure with no fold in its name`,
          );
        }
      }
    }
  });
});
