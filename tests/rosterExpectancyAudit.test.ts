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
  type DerivedCell,
  EMPTY_CELL,
  shardPathsFromArgv,
  shippedCellOf,
  stats,
  verdictFor,
} from "../scripts/roster-expectancy-audit.ts";
import { describeOverride } from "../scripts/replay-sweep.ts";
import {
  type CategoryCalibration,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
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
    // The two act-2 value flags own the token after them too: a shard path
    // must never be walked into --baseline-cell or --ledgered-read.
    assert.deepEqual(
      shardPathsFromArgv([
        "a.jsonl",
        "--baseline-cell", EMPTY_CELL,
        "--ledgered-read", "read.json",
        "b.jsonl",
      ]),
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

// The grid cells the audit's three shapes are built from, as OBJECTS — the
// manifest carries objects and the audit names them with `describeOverride`,
// so a fixture that typed the strings by hand would prove agreement with
// itself. The named baseline is 4c's grid[1] exactly.
const NAMED_BASELINE_CELL: Partial<CategoryCalibration> = {
  confidenceThreshold: 0,
  runnerProtection: "breakeven",
  maxStopAtrMultiplier: 1,
  sizingHoursFactor: 1,
};
const DERIVED_OVERRIDE: Partial<CategoryCalibration> = {
  confidenceThreshold: 0,
  runnerProtection: "trail_tp1",
  maxStopAtrMultiplier: 4,
  sizingHoursFactor: 3,
};
const HOLD_OVERRIDE: Partial<CategoryCalibration> = {
  runnerProtection: "hold",
  stopStructureSource: "intraday",
};
const HOLD_CELL = "runnerProtection=hold,stopStructureSource=intraday";
/** The 4d-era shape: the named baseline beside a derived cell. */
const NAMED_GRID: unknown[] = [NAMED_BASELINE_CELL, DERIVED_OVERRIDE];
/** R3's shape: the empty cell beside explicit variants. */
const R3_GRID: unknown[] = [{}, HOLD_OVERRIDE];
/** 4c's shape: the empty cell AND the named baseline. */
const FOURC_GRID: unknown[] = [{}, NAMED_BASELINE_CELL];
// A derived cell's shape, as the picks artifacts record one.
const DERIVED_CELL =
  "confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3";

/**
 * The shipped cell is named from the manifest's grid (R4 act 2, design
 * deliverable 5). The audit used to read a NAMED 4d-era cell and refuse the
 * empty one on the strength of a comment claiming no tracked corpus carried
 * `{}` — false: 4c's grid[0] is `{}` and the 2026-08-10 evaluator-repair
 * corpus's grid is `[{}]`. On R3's corpora its derived branch filtered rows
 * to a 4d pick string no R3 cell carries and came back silently empty for
 * 79 markets. Now every grid cell is named the way the driver names it, and
 * the grid's shape decides the read.
 */
describe("the shipped cell is named from the manifest's grid", () => {
  it("names the empty override exactly as the driver does, and the fixtures round-trip", () => {
    // Pinned here because the audit's whole empty-cell rule rests on it and
    // the name was private and unpinned until act 2.
    assert.equal(describeOverride({}), "baseline");
    assert.equal(EMPTY_CELL, describeOverride({}));
    assert.equal(describeOverride(NAMED_BASELINE_CELL), BASELINE);
    assert.equal(describeOverride(DERIVED_OVERRIDE), DERIVED_CELL);
    assert.equal(describeOverride(HOLD_OVERRIDE), HOLD_CELL);
  });

  it("reads every market at the empty cell when the grid carries it without the named baseline (R3, evaluator-repair)", () => {
    const r3 = shippedCellOf(R3_GRID);
    assert.deepEqual(r3, {
      cell: EMPTY_CELL,
      mode: "empty",
      names: [EMPTY_CELL, HOLD_CELL],
      // The engine gated the empty cell's rows at each market's shipped
      // threshold already; nothing is re-applied.
      reapplyClassThreshold: false,
    });
    assert.equal(shippedCellOf([{}]).mode, "empty");
  });

  it("refuses the 4c shape — both cells present — unless --baseline-cell names one", () => {
    assert.throws(() => shippedCellOf(FOURC_GRID), /ONE CELL, NOT EITHER OF TWO/);
    assert.equal(shippedCellOf(FOURC_GRID, EMPTY_CELL).mode, "empty");
    const named = shippedCellOf(FOURC_GRID, BASELINE);
    assert.equal(named.mode, "named");
    assert.equal(named.cell, BASELINE);
    // The named cell pins threshold 0, so the class gate is re-applied.
    assert.equal(named.reapplyClassThreshold, true);
  });

  it("reads the named baseline as before when only it is present (the 4d-era shape)", () => {
    const named = shippedCellOf(NAMED_GRID);
    assert.equal(named.mode, "named");
    assert.equal(named.cell, BASELINE);
    assert.equal(named.reapplyClassThreshold, true);
  });

  it("admits --baseline-cell only for a shipped-standing cell the grid carries", () => {
    assert.throws(
      () => shippedCellOf(FOURC_GRID, HOLD_CELL),
      /neither the empty cell .* nor the named baseline/,
    );
    assert.throws(() => shippedCellOf(R3_GRID, BASELINE), /names no cell of this corpus's grid/);
  });

  it("refuses a grid that carries neither cell — the shipped configuration is not in it", () => {
    // The old fixture grid: a cell pinning threshold 0 and nothing else.
    assert.throws(() => shippedCellOf([{ confidenceThreshold: 0 }]), /neither the empty cell/);
    assert.throws(() => shippedCellOf([HOLD_OVERRIDE]), /neither the empty cell/);
  });

  it("names cells through the driver's own export, and reads one cell per market", () => {
    const source = readFileSync("scripts/roster-expectancy-audit.ts", "utf8");
    assert.match(
      source,
      /import \{ describeOverride \} from "\.\/replay-sweep\.ts";/,
      "the audit keeps a private copy of the cell name instead of the driver's",
    );
    assert.doesNotMatch(
      source,
      /variant !== BASELINE && variant !== "baseline"/,
      "the audit admits two different cells as one market's expectancy",
    );
    // ONE label per market — the Lens-D bit-identical twin variant is never
    // OR'd into the shipped cell.
    assert.match(source, /if \(variant !== cellFor\(symbol, cell\)\) return;/);
  });
});

/**
 * The named-baseline branch reads the RIGHT cell for the markets that reach
 * it.
 *
 * In the 4d-era shape the audit reads a derived market at its own grid cell
 * and every other market at the named baseline, "which is what the shipped
 * engine does". That claim is the kind that rots — it is prose about a
 * numeric relationship between two files that move independently — so it is
 * asserted here against the shipped calibration rather than believed.
 *
 * THE OBVIOUS TEST IS WRONG, and this is the point. Measured across all 97
 * roster markets, ZERO match the baseline cell: the derived markets ship 4x
 * ATR stops and `trail_tp1`, and they never reach this branch. Judged on the
 * population that DOES reach it — the markets with no derived cell — every
 * one matches. A guard that took the whole roster as its population would
 * report a defect that is not there.
 */
describe("the audit's named baseline cell is the shipped geometry, for its own population", () => {
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

  /** Markets with no derived cell — the ones the named branch judges. */
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
  symbol = SYMBOL,
): SweepEmitRow[] {
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < count; day += 1) {
    rows.push({
      accepted: true,
      confidenceScore: score,
      outcome: realizedR < 0 ? "stop_loss" : "take_profit",
      realizedR,
      split,
      symbol,
      time: (FOLD_START[split] ?? FOLD_START.select) + day * DAY +
        12 * 3_600_000,
      variant,
    } as SweepEmitRow);
  }
  return rows;
}

/** A shard beside its manifest: folded (fit/select/confirm) or legacy (train/test), under the given grid. */
function writeCorpus(
  rows: SweepEmitRow[],
  shape: "folded" | "legacy",
  grid: unknown[] = NAMED_GRID,
  symbols: string[] = [SYMBOL],
): string {
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
    grid,
    stepBars: 16,
    symbols: symbols.map((symbol) => ({
      calibration: {},
      providerSymbol: symbol,
      series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
      symbol,
      // The per-symbol layer the empty cell carries, as provenance.
      symbolOverride: { maxStopAtrMultiplier: 4 },
    })),
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
    cell: collected.cell,
    folds: collected.folds,
    rows: collected.rows,
    select: [...collected.select],
    swept: [...collected.swept],
  });
}

const derivedAtCell = new Map<string, DerivedCell>([
  [SYMBOL, { tranche: "4d", variant: DERIVED_CELL }],
]);

describe("roster-expectancy-audit — the confirm fold is sealed at the door (R4 act 1)", () => {
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
    const { cell, select } = collect([writeCorpus(rows, "folded")], new Map());
    assert.equal(cell.mode, "named");
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

// The grid's shape decides the read (R4 act 2), executed through collect():
// the empty cell for everyone on R3's shape, the operator's choice on 4c's,
// and a swept market read at a cell it did not run refused by name.
describe("roster-expectancy-audit — the empty cell is the shipped configuration (R4 act 2)", () => {
  const threshold = getCategoryCalibration(SYMBOL).confidenceThreshold;

  it("R3 shape: reads every market at the empty cell with the engine's own gate standing, the derived map an annotation", () => {
    const rows = [
      // Below the CLASS threshold and still accepted: the engine gated the
      // empty cell at the market's SHIPPED threshold, so nothing is
      // re-applied — a derived market ships threshold 0.
      ...rowsIn("select", 30, EMPTY_CELL, 0.5, threshold - 1),
      // Another cell's rows are not this market's measurement.
      ...rowsIn("select", 30, HOLD_CELL, -1),
      ...rowsIn("fit", 10, EMPTY_CELL, -1),
    ];
    // The derived map names EURUSD's 4d cell — and is NOT a row filter here:
    // no row carries DERIVED_CELL and the market is still read, at baseline.
    const { cell, select, swept } = collect(
      [writeCorpus(rows, "folded", R3_GRID)],
      derivedAtCell,
    );
    assert.equal(cell.mode, "empty");
    assert.deepEqual(select.get(SYMBOL), { n: 30, sum: 15, sumSq: 7.5 });
    assert.deepEqual(swept.get(SYMBOL), {
      readAtCell: EMPTY_CELL,
      selectRowsAtCell: 30,
      selectRowsInAnyCell: 60,
      symbolOverride: { maxStopAtrMultiplier: 4 },
    });
  });

  it("4c shape: refuses without --baseline-cell, and reads whichever cell it names", () => {
    const rows = [
      ...rowsIn("select", 30, EMPTY_CELL, 0.5, threshold - 1),
      ...rowsIn("select", 30, BASELINE, -1, threshold),
    ];
    const shard = writeCorpus(rows, "folded", FOURC_GRID);
    assert.throws(() => collect([shard], new Map()), /ONE CELL, NOT EITHER OF TWO/);
    const atEmpty = collect([shard], new Map(), { baselineCell: EMPTY_CELL });
    assert.equal(atEmpty.cell.mode, "empty");
    assert.deepEqual(atEmpty.select.get(SYMBOL), { n: 30, sum: 15, sumSq: 7.5 });
    const atNamed = collect([shard], new Map(), { baselineCell: BASELINE });
    assert.equal(atNamed.cell.mode, "named");
    // Re-gated at the class threshold: these rows sit exactly on it.
    assert.deepEqual(atNamed.select.get(SYMBOL), { n: 30, sum: -30, sumSq: 30 });
  });

  it("refuses a swept market whose select rows all sit in cells it is not read at", () => {
    // The silently-empty shape: EURUSD ran, its rows are all in the hold
    // cell, and the audit would have printed UNMEASURABLE n=0.
    const rows = rowsIn("select", 30, HOLD_CELL, 0.5);
    assert.throws(
      () => collect([writeCorpus(rows, "folded", R3_GRID)], new Map()),
      (error: Error) => {
        assert.match(error.message, /EURUSD at "baseline"/);
        assert.match(error.message, /never a silent UNMEASURABLE/);
        assert.match(error.message, new RegExp(`${HOLD_CELL}=30`));
        return true;
      },
    );
  });

  it("does not refuse a swept market with no select row in ANY cell, and says so in its provenance", () => {
    // Starved on this corpus, not misread: six markets on R3's per-class
    // corpus carry only confirm rows.
    const rows = rowsIn("fit", 10, EMPTY_CELL, -1);
    const { select, swept } = collect([writeCorpus(rows, "folded", R3_GRID)], new Map());
    assert.equal(select.get(SYMBOL), undefined);
    assert.equal(swept.get(SYMBOL)?.selectRowsInAnyCell, 0);
  });

  it("refuses a select row from a cell the grid does not name", () => {
    const rows = rowsIn("select", 5, HOLD_CELL, 0.5);
    assert.throws(
      () => collect([writeCorpus(rows, "folded", [{}])], new Map()),
      /cell "runnerProtection=hold,stopStructureSource=intraday", which this corpus's grid does not name/,
    );
  });

  it("refuses two shards whose grids differ", () => {
    assert.throws(
      () =>
        collect(
          [
            writeCorpus(rowsIn("select", 30, EMPTY_CELL, 0.5), "folded", R3_GRID),
            writeCorpus(rowsIn("select", 30, EMPTY_CELL, 0.5), "folded", [{}]),
          ],
          new Map(),
        ),
      /two grids are two measurements/,
    );
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
// every figure, state which fold it judged on and which it sealed, name the
// cell it read, and carry no figure computed over the confirm fold. The R3
// shape is the shape of record, so the recorded 4d reads (whatever they say
// about EURUSD) are provenance here and never a filter.
describe("roster-expectancy-audit — the artifact names its fold and its cell (executed)", () => {
  const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");

  type Artifact = {
    cell: unknown;
    confirmSource: string;
    folds: unknown;
    ledgeredRead: unknown;
    report: Record<string, Record<string, unknown>>;
    rows: unknown;
    tally: Record<string, number>;
  };

  function run(shard: string, extra: string[] = []) {
    const out = join(mkdtempSync(join(tmpdir(), "roster-out-")), "audit.json");
    try {
      const stdout = execFileSync(
        TSX,
        ["scripts/roster-expectancy-audit.ts", shard, "--out", out, ...extra],
        { cwd: process.cwd(), encoding: "utf8", stdio: "pipe", timeout: 120_000 },
      );
      return { out, stderr: "", stdout, threw: false };
    } catch (error) {
      const shell = error as { stderr?: string; stdout?: string };
      return { out, stderr: String(shell.stderr ?? ""), stdout: String(shell.stdout ?? ""), threw: true };
    }
  }

  it("writes select-named figures, the folds and cell it read, and no corpus-derived confirm figure", () => {
    const shard = writeCorpus(
      [
        ...rowsIn("fit", 40, EMPTY_CELL, -1, 100),
        ...rowsIn("select", 40, EMPTY_CELL, 0.5, 100),
        ...rowsIn(SEALED_FOLD, 40, EMPTY_CELL, -3, 100),
      ],
      "folded",
      R3_GRID,
    );
    const result = run(shard);
    assert.ok(!result.threw, `the audit refused the R3 shape: ${result.stderr}`);
    assert.match(result.stdout, /on the select fold \(40 confirm rows withheld at the door\)/);
    assert.match(result.stdout, /shipped cell "baseline" \(the empty cell/);
    assert.match(result.stdout, /no ledgered read given — select only/);

    const artifact = JSON.parse(readFileSync(result.out, "utf8")) as Artifact;
    assert.deepEqual(artifact.folds, {
      dropped: "fit",
      judgedOn: "select",
      sealed: SEALED_FOLD,
    });
    assert.deepEqual(artifact.rows, { fit: 40, sealed: 40, select: 40 });
    assert.deepEqual(artifact.cell, { grid: [EMPTY_CELL, HOLD_CELL], mode: "empty", readAtCell: EMPTY_CELL });
    assert.equal(artifact.ledgeredRead, null);
    assert.equal(artifact.confirmSource, "no ledgered read given — select only");

    const eurusd = artifact.report[SYMBOL];
    assert.equal(eurusd.selectN, 40);
    assert.equal(eurusd.selectExpectancy, 0.5);
    assert.equal(eurusd.verdict, "MEASURABLY POSITIVE");
    assert.match(String(eurusd.configuration), /shipped configuration at sweep time/);
    const provenance = eurusd.provenance as Record<string, unknown>;
    assert.equal(provenance.readAtCell, EMPTY_CELL);
    assert.equal(provenance.swept, true);
    assert.equal(provenance.selectRowsAtCell, 40);
    assert.deepEqual(provenance.symbolOverride, { maxStopAtrMultiplier: 4 });
    assert.equal(artifact.tally.measurablyPositive, 1);
    // A market the corpus never swept says so, rather than reading as a
    // market measured and found thin.
    const other = Object.entries(artifact.report).find(([symbol]) => symbol !== SYMBOL)!;
    assert.equal((other[1].provenance as Record<string, unknown>).swept, false);
    // Every figure names its fold; nothing in the report — nested provenance
    // included — names confirm.
    for (const [symbol, row] of Object.entries(artifact.report)) {
      assert.doesNotMatch(JSON.stringify(row), /confirm/i, `${symbol} names the sealed fold`);
      for (const key of Object.keys(row)) {
        if (typeof row[key] === "number" || row[key] === null) {
          assert.ok(
            key.startsWith("select") || key === "confidenceThreshold",
            `${symbol}.${key} is a figure with no fold in its name`,
          );
        }
      }
    }
  });

  it("refuses the 4c shape from the command line until --baseline-cell names a cell, then reads it", () => {
    const shard = writeCorpus(
      [
        ...rowsIn("select", 40, EMPTY_CELL, 0.5, 100),
        ...rowsIn("select", 40, BASELINE, -1, 100),
      ],
      "folded",
      FOURC_GRID,
    );
    const refused = run(shard);
    assert.ok(refused.threw, "the 4c shape was read without naming a cell");
    assert.match(refused.stderr, /ONE CELL, NOT EITHER OF TWO/);
    const read = run(shard, ["--baseline-cell", EMPTY_CELL]);
    assert.ok(!read.threw, read.stderr);
    const artifact = JSON.parse(readFileSync(read.out, "utf8")) as Artifact;
    assert.equal(artifact.report[SYMBOL].selectExpectancy, 0.5);
    assert.deepEqual(artifact.cell, { grid: [EMPTY_CELL, BASELINE], mode: "empty", readAtCell: EMPTY_CELL });
  });
});
