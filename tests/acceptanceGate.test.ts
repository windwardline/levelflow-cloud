import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  type SweepConditions,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  classVerdicts,
  marketVerdicts,
  gradeCorpus,
  readGridCube,
} from "../scripts/grid-totalr.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";

// 3b + 3f + 3g (the map): grid-totalr was the only place variants meet, and
// it read a PRINTED table — total R as expectancy-over-filled x
// setups-including-unfilled (the e x n unit mismatch behind rounds 25-28),
// bare > inequalities for the gate, and a criterion that deliberately
// ignored per-trade expectancy while sweep-analysis ignored volume. The
// rebuilt gate reads the manifested emit itself: total R is a SUM of
// realized R over filled outcomes, improvement is stated in standard
// errors (3f), acceptance requires the total AND the per-trade delta (3g),
// and a day-block permutation null prices how often label-shuffling alone
// produces the observed improvement (3b) — blocks, not rows, because
// outcomes within a day share their market.

// A healthy Treasury-curve evidence block for fixtures (#364 round 2,
// finding 1): far end date so no fixture's corpus outruns it, gap under
// the door's 7-day bound.
const TEST_TREASURY_CURVE = {
  count: 3_000,
  firstTime: Date.UTC(2013, 0, 2),
  largestGapMs: 4 * 86_400_000,
  lastTime: Date.UTC(2027, 0, 1),
};

const DAY = 86_400_000;

function outcomeRow(
  variant: string,
  dayIndex: number,
  realizedR: number,
  outcome = realizedR > 0 ? "take_profit" : "stop_loss",
  symbol = "EURUSD",
): SweepEmitRow {
  return {
    accepted: true,
    outcome,
    realizedR,
    split: "test",
    symbol,
    time: Date.UTC(2025, 0, 6) + dayIndex * DAY + 12 * 3_600_000,
    variant,
  };
}

// Train-split mirror so both-splits gates have data on both sides.
function trainRow(
  variant: string,
  dayIndex: number,
  realizedR: number,
): SweepEmitRow {
  return {
    ...outcomeRow(variant, dayIndex, realizedR),
    split: "train",
    time: Date.UTC(2024, 0, 8) + dayIndex * DAY + 12 * 3_600_000,
  };
}

function corpusWith(rows: SweepEmitRow[]): string {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  const emitPath = join(dir, "grid.jsonl");
  writeFileSync(
    emitPath,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
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
    grid: [{}, { tp1RiskShare: 0.9 }],
    stepBars: 16,
    // Series facts mirror the rows' own time range, the way a real shard
    // manifest measures its bars — per-market fold re-cutting reads spans
    // from here.
    symbols: [...new Set(rows.map((row) => row.symbol))].map((symbol) => ({
      calibration: {},
      providerSymbol: symbol,
      series: {
        "15min": seriesFacts(
          rows
            .filter((row) => row.symbol === symbol)
            .map((row) => ({ time: Number(row.time) || 0 })),
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

describe("readGridCube — sums realized R, never e x n", () => {
  it("aggregates per symbol, variant and split over filled outcomes only", () => {
    const cube = readGridCube([
      outcomeRow("baseline", 0, 1.5),
      outcomeRow("baseline", 1, -1),
      { ...outcomeRow("baseline", 2, 0), outcome: "unfilled" },
      outcomeRow("tp1=0.9", 0, 2),
    ]);
    const baseline = cube.get("EURUSD")!.get("baseline")!.get("test")!;
    assert.equal(baseline.filled, 2);
    assert.equal(baseline.n, 3);
    assert.equal(Number(baseline.rSum.toFixed(2)), 0.5);
    assert.equal(cube.get("EURUSD")!.get("tp1=0.9")!.get("test")!.rSum, 2);
  });

  it("keeps capture-all's rejected records out of the graded stream", () => {
    const cube = readGridCube([
      outcomeRow("baseline", 0, 1.5),
      { ...outcomeRow("baseline", 1, 5), accepted: false },
    ]);
    assert.equal(cube.get("EURUSD")!.get("baseline")!.get("test")!.filled, 1);
  });
});

describe("classVerdicts — 3f/3g/3b in one gate", () => {
  const better = () => {
    // The day-block null is deliberately conservative — whole days swap
    // sides — so the accepting fixture carries a decisive effect: every
    // variant day (+0.9 or +1.5) clears every baseline day (-0.1 or
    // +0.5), making the observed delta the pool's maximum arrangement.
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 24; day += 1) {
      const swing = day % 2 === 0 ? 0.5 : -0.1;
      rows.push(trainRow("baseline", day, swing));
      rows.push(trainRow("tp1=0.9", day, swing + 1));
      rows.push(outcomeRow("baseline", day, swing));
      rows.push(outcomeRow("tp1=0.9", day, swing + 1));
    }
    return rows;
  };

  it("accepts a variant that improves both splits beyond noise, with a small permutation p", () => {
    const verdicts = classVerdicts(readGridCube(better()), {
      foldNames: { fit: "train", select: "test" },
      permutations: 400,
      seed: 11,
    });
    const verdict = verdicts.get("forex")!.get("tp1=0.9")!;
    assert.equal(verdict.accepted, true);
    assert.ok(verdict.selectSigma > 1, `select sigma ${verdict.selectSigma}`);
    assert.ok(
      verdict.permutationP < 0.05,
      `permutation p ${verdict.permutationP}`,
    );
    // A legacy two-split corpus has no confirm fold to read.
    assert.equal(verdict.confirmTotalDelta, null);
  });

  it("rejects an identical variant and prices it as noise", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 24; day += 1) {
      const swing = day % 3 === 0 ? 1.2 : -0.8;
      rows.push(trainRow("baseline", day, swing));
      rows.push(trainRow("same", day, swing));
      rows.push(outcomeRow("baseline", day, swing));
      rows.push(outcomeRow("same", day, swing));
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 3,
    }).get("forex")!.get("same")!;
    assert.equal(verdict.accepted, false);
    assert.ok(verdict.permutationP > 0.2, `p ${verdict.permutationP}`);
  });

  it("refuses a thin variant outright — a win on a third of the volume is an artifact of tightness", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 24; day += 1) {
      rows.push(trainRow("baseline", day, 0.2));
      rows.push(outcomeRow("baseline", day, 0.2));
      if (day < 8) {
        rows.push(trainRow("tight", day, 0.9));
        rows.push(outcomeRow("tight", day, 0.9));
      }
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 100,
      seed: 5,
    }).get("forex")!.get("tight")!;
    assert.equal(verdict.accepted, false);
    assert.equal(verdict.thin, true);
  });

  it("3g: rejects volume bought with per-trade quality — total R up, expectancy down", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 24; day += 1) {
      // Baseline: one clean +0.5 per day. Variant: three trades a day at
      // +0.25 mean — more total R, worse per trade.
      rows.push(trainRow("baseline", day, 0.5));
      rows.push(outcomeRow("baseline", day, 0.5));
      for (let extra = 0; extra < 3; extra += 1) {
        rows.push(trainRow("volume", day, 0.25));
        rows.push(outcomeRow("volume", day, 0.25));
      }
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 100,
      seed: 9,
    }).get("forex")!.get("volume")!;
    assert.ok(verdict.selectTotalDelta > 0);
    assert.ok(verdict.selectExpectancyDelta < 0);
    assert.equal(verdict.accepted, false);
  });

  it("is deterministic under a seed", () => {
    const rows = better();
    const legacy = { fit: "train", select: "test" };
    const first = classVerdicts(readGridCube(rows), {
      foldNames: legacy,
      permutations: 150,
      seed: 21,
    }).get("forex")!.get("tp1=0.9")!;
    const second = classVerdicts(readGridCube(rows), {
      foldNames: legacy,
      permutations: 150,
      seed: 21,
    }).get("forex")!.get("tp1=0.9")!;
    assert.equal(first.permutationP, second.permutationP);
  });
});

describe("holdout — excluded from tuning, present for the one confirmation read (3e)", () => {
  it("keeps holdout rows out of the cube unless explicitly included", () => {
    const rows = [
      outcomeRow("baseline", 0, 0.5),
      { ...outcomeRow("baseline", 1, -5, "stop_loss", "GBPUSD"), holdout: true },
    ];
    const excluded = readGridCube(rows);
    assert.equal(excluded.has("GBPUSD"), false);
    const included = readGridCube(rows, { includeHoldout: true });
    assert.equal(included.has("GBPUSD"), true);
  });
});

describe("a folded corpus names its own partition (3c/3d)", () => {
  it("derives fit/select/confirm from the manifest and reads confirm once, for accepted variants only", async () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 24; day += 1) {
      const swing = day % 2 === 0 ? 0.5 : -0.1;
      for (const [split, offset] of [["fit", 0], ["select", 40], ["confirm", 80]] as const) {
        rows.push({
          ...outcomeRow("baseline", day + offset, swing),
          split,
        });
        rows.push({
          ...outcomeRow("wide", day + offset, swing + 1),
          split,
        });
      }
    }
    const dir = mkdtempSync(join(tmpdir(), "gate-folds-"));
    const emitPath = join(dir, "folded.jsonl");
    writeFileSync(
      emitPath,
      rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
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
      folds: [
        { decisionEndMs: 4, endMs: 5, name: "fit", startMs: 0 },
        { decisionEndMs: 8, endMs: 9, name: "select", startMs: 5 },
        { decisionEndMs: 12, endMs: 13, name: "confirm", startMs: 9 },
      ],
      generatedAt: "2026-08-10T06:00:00.000Z",
      grid: [{}, { wide: true }],
      holdoutSymbols: [],
      stepBars: 16,
      symbols: [{
        calibration: {},
        providerSymbol: "EURUSD",
        series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
        symbol: "EURUSD",
      }],
      trainShare: 0.6,
      treasuryCurve: TEST_TREASURY_CURVE,
      warmupBars: 240,
    });
    writeFileSync(
      `${emitPath}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    const graded = await gradeCorpus(emitPath, { permutations: 100, seed: 4 });
    // v2 (LA-6): without confirmFinal the confirm fold is never derived,
    // let alone computed — the discipline test below covers the read.
    assert.deepEqual(graded.foldNames, { fit: "fit", select: "select" });
    const verdict = graded.verdicts.get("forex")!.get("wide")!;
    assert.equal(verdict.accepted, true);
    assert.equal(verdict.confirmTotalDelta, null);
  });
});

describe("shards of one measurement (4c) — matched conditions or refusal", () => {
  const shardWith = (
    rows: SweepEmitRow[],
    gridOverride?: unknown[],
    clockOverride?: { calendar: string; normalizer: string },
    conditionsOverride?: Record<string, string>,
    treasuryCurveOverride?: TreasuryCurveFacts,
  ): string => {
    const dir = mkdtempSync(join(tmpdir(), "gate-shard-"));
    const emitPath = join(dir, "shard.jsonl");
    writeFileSync(
      emitPath,
      rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    );
    const manifest = buildSweepManifest({
      analyzerVersion: "2026.08.09.test",
      anchor: "2026-08-10",
      barRejections: {},
      clock: clockOverride ??
        { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK },
      conditions: (conditionsOverride ?? {
        macroAdjustment: "historical-treasury-curve",
        providerWarningCount: "zero-by-construction",
        weightAdjustment: "raw-engine-zero",
      }) as SweepConditions,
      days: 365,
      generatedAt: "2026-08-10T07:00:00.000Z",
      grid: gridOverride ?? [{}, { wide: true }],
      stepBars: 16,
      symbols: [{
        calibration: {},
        providerSymbol: rows[0]?.symbol ?? "EURUSD",
        series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
        symbol: rows[0]?.symbol ?? "EURUSD",
      }],
      trainShare: 0.6,
      treasuryCurve: treasuryCurveOverride ?? TEST_TREASURY_CURVE,
      warmupBars: 240,
    });
    writeFileSync(
      `${emitPath}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    return emitPath;
  };
  const shardRows = (symbol: string) => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 12; day += 1) {
      rows.push({ ...trainRow("baseline", day, 0.3), symbol });
      rows.push({ ...trainRow("wide", day, 0.6), symbol });
      rows.push({ ...outcomeRow("baseline", day, 0.3), symbol });
      rows.push({ ...outcomeRow("wide", day, 0.6), symbol });
    }
    return rows;
  };

  it("concatenates shards whose conditions match", async () => {
    const graded = await gradeCorpus(
      [shardWith(shardRows("EURUSD")), shardWith(shardRows("GBPUSD"))],
      { permutations: 50, seed: 6 },
    );
    const verdict = graded.verdicts.get("forex")!.get("wide")!;
    // Both shards' rows aggregate: 24 filled on the select fold.
    assert.equal(verdict.selectFilled, 24);
  });

  it("refuses shards measured under different conditions", async () => {
    await assert.rejects(
      gradeCorpus([
        shardWith(shardRows("EURUSD")),
        shardWith(shardRows("GBPUSD"), [{}, { different: true }]),
      ]),
      /shards of one measurement/,
    );
  });

  it("refuses shards swept under different clocks — no mixed-clock corpus at read time (R0)", async () => {
    // The door itself refuses a superseded-clock shard first; the
    // conditionsOf comparison is the second layer, reachable only under
    // the deliberate historical-read override — exercise both.
    await assert.rejects(
      gradeCorpus([
        shardWith(shardRows("EURUSD")),
        shardWith(shardRows("GBPUSD"), undefined, {
          calendar: CALENDAR_CLOCK,
          normalizer: "some-other-clock",
        }),
      ]),
      /superseded-clock corpus/,
    );
    process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK = "1";
    try {
      await assert.rejects(
        gradeCorpus([
          shardWith(shardRows("EURUSD")),
          shardWith(shardRows("GBPUSD"), undefined, {
            calendar: CALENDAR_CLOCK,
            normalizer: "some-other-clock",
          }),
        ]),
        /shards of one measurement/,
      );
    } finally {
      delete process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK;
    }
  });

  it("refuses shards whose STATED CONDITIONS differ, on the historical-read path where the door does not assert them (#364 round 7)", async () => {
    // Both shards share one superseded clock, so under the override they
    // pass the door (which skips the conditions and curve-evidence
    // checks for deliberate historical reads) and only conditionsOf
    // stands between a hardwired-zero-macro shard and a
    // reconstructed-macro shard pooling into one verdict — the exact
    // post-clock-bump shape, since R1b deliberately bumps neither the
    // clock nor ANALYZER_VERSION.
    const supersededClock = {
      calendar: CALENDAR_CLOCK,
      normalizer: "some-other-clock",
    };
    const warned = console.warn;
    console.warn = () => {};
    process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK = "1";
    try {
      await assert.rejects(
        gradeCorpus([
          shardWith(shardRows("EURUSD"), undefined, supersededClock),
          shardWith(shardRows("GBPUSD"), undefined, supersededClock, {
            macroAdjustment: "hardwired-zero",
            providerWarningCount: "zero-by-construction",
            weightAdjustment: "raw-engine-zero",
          }),
        ]),
        /shards of one measurement/,
      );
    } finally {
      console.warn = warned;
      delete process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK;
    }
  });

  it("pools shards whose curves differ only in the day-variant facts — count and lastTime (#364 round 8)", async () => {
    // The rolling store tops up per anchor day, so two shards of one
    // logical sweep run either side of midnight legitimately carry
    // different count/lastTime. Identity keeps only firstTime and
    // largestGapMs; a tail top-up must POOL, not refuse.
    const toppedUp: TreasuryCurveFacts = {
      ...TEST_TREASURY_CURVE,
      count: 3_022,
      lastTime: Date.UTC(2027, 1, 1),
    };
    const graded = await gradeCorpus(
      [
        shardWith(shardRows("EURUSD")),
        shardWith(shardRows("GBPUSD"), undefined, undefined, undefined, toppedUp),
      ],
      { permutations: 50, seed: 6 },
    );
    const verdict = graded.verdicts.get("forex")!.get("wide")!;
    assert.equal(verdict.selectFilled, 24);
  });

  it("still refuses shards whose curve DEPTH differs, on the historical-read path (#364 round 8)", async () => {
    // firstTime is day-invariant — the floor is fixed at 2013 — so a
    // shallow-store shard against a full-depth shard is two
    // measurements. With the current clock the door's leading-edge
    // check refuses the shallow shard first; the identity comparison is
    // the second layer for the superseded-clock override, where the
    // door skips the curve checks.
    const shallow: TreasuryCurveFacts = {
      ...TEST_TREASURY_CURVE,
      firstTime: Date.UTC(2020, 0, 6),
    };
    const supersededClock = {
      calendar: CALENDAR_CLOCK,
      normalizer: "some-other-clock",
    };
    const warned = console.warn;
    console.warn = () => {};
    process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK = "1";
    try {
      await assert.rejects(
        gradeCorpus([
          shardWith(shardRows("EURUSD"), undefined, supersededClock),
          shardWith(
            shardRows("GBPUSD"),
            undefined,
            supersededClock,
            undefined,
            shallow,
          ),
        ]),
        /shards of one measurement/,
      );
    } finally {
      console.warn = warned;
      delete process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK;
    }
  });
});

describe("the baseline is a named cell (4c's retired-gate grids)", () => {
  it("compares every variant against the configured baseline cell", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 12; day += 1) {
      rows.push(trainRow("confidenceThreshold=0", day, 0.3));
      rows.push(outcomeRow("confidenceThreshold=0", day, 0.3));
      rows.push(trainRow("confidenceThreshold=0,hold", day, 0.9));
      rows.push(outcomeRow("confidenceThreshold=0,hold", day, 0.9));
    }
    const verdicts = classVerdicts(readGridCube(rows), {
      baselineVariant: "confidenceThreshold=0",
      foldNames: { fit: "train", select: "test" },
      permutations: 50,
      seed: 8,
    });
    const classMap = verdicts.get("forex")!;
    assert.equal(classMap.has("confidenceThreshold=0"), false);
    assert.ok(classMap.get("confidenceThreshold=0,hold")!.selectTotalDelta > 0);
  });
});

describe("gate v2 — the statistics become the rule (round-8 batch 1)", () => {
  const pairedRows = (
    variant: string,
    deltasByDay: number[],
    base = 0.1,
  ): SweepEmitRow[] => {
    const rows: SweepEmitRow[] = [];
    deltasByDay.forEach((delta, day) => {
      rows.push(trainRow("baseline", day, base));
      rows.push(trainRow(variant, day, base + delta));
      rows.push(outcomeRow("baseline", day, base));
      rows.push(outcomeRow(variant, day, base + delta));
    });
    return rows;
  };

  const pairedFamily = (
    deltasByVariant: Record<string, number[]>,
    base = 0.1,
  ): SweepEmitRow[] => {
    const rows: SweepEmitRow[] = [];
    const days = Math.max(
      ...Object.values(deltasByVariant).map((deltas) => deltas.length),
    );
    for (let day = 0; day < days; day += 1) {
      rows.push(trainRow("baseline", day, base));
      rows.push(outcomeRow("baseline", day, base));
      for (const [variant, deltas] of Object.entries(deltasByVariant)) {
        if (day < deltas.length) {
          rows.push(trainRow(variant, day, base + deltas[day]));
          rows.push(outcomeRow(variant, day, base + deltas[day]));
        }
      }
    }
    return rows;
  };

  it("enforces the paired permutation p in acceptance — a one-day fluke with a big sum is refused (LA-3/LA-4)", () => {
    // Variant X: +0.05 on every one of 20 shared days — consistent,
    // paired-significant. Variant Y: one +2.0 day, zeros elsewhere — the
    // sum and sigma are large but sign-flipping one day reproduces it
    // half the time; p is high and v2 refuses what v1's sigma accepted.
    const verdicts = classVerdicts(readGridCube(pairedFamily({
      fluke: [2, ...Array(19).fill(0)],
      steady: Array(20).fill(0.05),
    })), {
      foldNames: { fit: "train", select: "test" },
      permutations: 400,
      seed: 5,
    });
    const classMap = verdicts.get("forex")!;
    assert.equal(classMap.get("steady")!.accepted, true);
    assert.ok(classMap.get("steady")!.pairedP <= 0.05);
    assert.equal(classMap.get("fluke")!.accepted, false);
    assert.ok(classMap.get("fluke")!.pairedP > 0.05);
    assert.ok(classMap.get("fluke")!.selectTotalDelta > 0);
  });

  it("controls the family — a null variant beside a strong one is not carried in (max-T)", () => {
    const verdicts = classVerdicts(readGridCube(pairedFamily({
      noise: Array(24).fill(0).map((_, index) =>
        index % 2 === 0 ? 0.04 : -0.04
      ),
      strong: Array(24).fill(0.08),
    })), {
      foldNames: { fit: "train", select: "test" },
      permutations: 400,
      seed: 9,
    });
    assert.equal(verdicts.get("forex")!.get("strong")!.accepted, true);
    assert.equal(verdicts.get("forex")!.get("noise")!.accepted, false);
  });

  it("reports composition separately from the paired test", () => {
    // Variant trades 6 extra days the baseline never traded: those days'
    // R is composition, not paired improvement.
    const rows = pairedRows("wide", Array(12).fill(0.05));
    for (let day = 20; day < 26; day += 1) {
      rows.push(outcomeRow("wide", day, 0.5));
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 3,
    }).get("forex")!.get("wide")!;
    assert.equal(Number(verdict.compositionR!.toFixed(1)), 3);
    assert.equal(verdict.sharedDays, 12);
  });

  it("carries the censoring readout — expiry share per cell (LA-10)", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 10; day += 1) {
      rows.push(trainRow("baseline", day, 0.2));
      rows.push(trainRow("exp", day, 0.25));
      rows.push(outcomeRow("baseline", day, 0.2));
      rows.push({
        ...outcomeRow("exp", day, 0.25),
        outcome: day < 4 ? "expired_in_profit" : "take_profit",
      });
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 100,
      seed: 2,
    }).get("forex")!.get("exp")!;
    assert.equal(verdict.selectExpiryShare, 0.4);
  });

  it("computes the worst-day survival readout from the variant's own days (RM-3/8)", () => {
    const rows = pairedRows("surv", Array(19).fill(0.05));
    rows.push(outcomeRow("surv", 19, -4.5));
    rows.push(outcomeRow("baseline", 19, 0.1));
    rows.push(trainRow("surv", 19, 0.05));
    rows.push(trainRow("baseline", 19, 0.1));
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 100,
      seed: 7,
    }).get("forex")!.get("surv")!;
    assert.equal(verdict.worstDayR, -4.5);
    assert.ok(verdict.breachDayShare! > 0);
  });
});

describe("gate v2 — confirm-fold discipline by mechanism (LA-6)", () => {
  const foldedCorpus = (): string => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 16; day += 1) {
      for (const [split, offset] of [["fit", 0], ["select", 40], ["confirm", 80]] as const) {
        rows.push({ ...outcomeRow("baseline", day + offset, 0.1), split });
        rows.push({ ...outcomeRow("good", day + offset, 0.4), split });
      }
    }
    const dir = mkdtempSync(join(tmpdir(), "gate-v2-"));
    const emitPath = join(dir, "folded.jsonl");
    writeFileSync(
      emitPath,
      rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    );
    const manifest = buildSweepManifest({
      analyzerVersion: "2026.08.09.test",
      anchor: "2026-08-11",
      barRejections: {},
      clock: { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK },
      conditions: {
        macroAdjustment: "historical-treasury-curve",
        providerWarningCount: "zero-by-construction",
        weightAdjustment: "raw-engine-zero",
      },
      days: 365,
      folds: [
        { decisionEndMs: 4, endMs: 5, name: "fit", startMs: 0 },
        { decisionEndMs: 8, endMs: 9, name: "select", startMs: 5 },
        { decisionEndMs: 12, endMs: 13, name: "confirm", startMs: 9 },
      ],
      generatedAt: "2026-08-11T05:00:00.000Z",
      grid: [{}, { good: true }],
      stepBars: 16,
      symbols: [{
        calibration: {},
        providerSymbol: "EURUSD",
        series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
        symbol: "EURUSD",
      }],
      trainShare: 0.6,
      treasuryCurve: TEST_TREASURY_CURVE,
      warmupBars: 240,
    });
    writeFileSync(
      `${emitPath}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    return emitPath;
  };

  it("never reads confirm without the explicit flag", async () => {
    const graded = await gradeCorpus(foldedCorpus(), {
      permutations: 100,
      seed: 4,
    });
    const verdict = graded.verdicts.get("forex")!.get("good")!;
    assert.equal(verdict.accepted, true);
    assert.equal(verdict.confirmTotalDelta, null);
  });

  it("logs the read and refuses a re-read without acknowledgement", async () => {
    const emitPath = foldedCorpus();
    const logPath = `${emitPath}.confirm-log.jsonl`;
    const first = await gradeCorpus(emitPath, {
      confirmFinal: true,
      confirmLogPath: logPath,
      permutations: 100,
      seed: 4,
    });
    assert.notEqual(
      first.verdicts.get("forex")!.get("good")!.confirmTotalDelta,
      null,
    );
    const logged = readFileSync(logPath, "utf8").trim().split("\n");
    assert.equal(logged.length, 1);
    await assert.rejects(
      gradeCorpus(emitPath, {
        confirmFinal: true,
        confirmLogPath: logPath,
        permutations: 100,
        seed: 4,
      }),
      /already been read/,
    );
    const again = await gradeCorpus(emitPath, {
      acknowledgePriorReads: true,
      confirmFinal: true,
      confirmLogPath: logPath,
      permutations: 100,
      seed: 4,
    });
    assert.notEqual(
      again.verdicts.get("forex")!.get("good")!.confirmTotalDelta,
      null,
    );
    assert.equal(readFileSync(logPath, "utf8").trim().split("\n").length, 2);
  });
});

describe("gradeCorpus — the emit door end to end", () => {
  it("reads only a manifested corpus and grades it", async () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 12; day += 1) {
      rows.push(trainRow("baseline", day, 0.3));
      rows.push(trainRow("wide", day, 0.5));
      rows.push(outcomeRow("baseline", day, 0.3));
      rows.push(outcomeRow("wide", day, 0.5));
    }
    const graded = await gradeCorpus(corpusWith(rows), {
      permutations: 50,
      seed: 2,
    });
    assert.equal(graded.manifest.analyzerVersion, "2026.08.09.test");
    assert.ok(graded.verdicts.get("forex")!.has("wide"));
  });
});

describe("marketVerdicts — the 4d unit is one market, same statistics (amendment 33)", () => {
  const twoMarketRows = (): SweepEmitRow[] => {
    const rows: SweepEmitRow[] = [];
    // 40 days: comfortably past the per-market 30-filled floor, so the
    // verdicts test the statistics rather than the sample gate.
    for (let day = 0; day < 40; day += 1) {
      // EURUSD: the variant beats its baseline steadily.
      rows.push({ ...trainRow("baseline", day, 0.1), symbol: "EURUSD" });
      rows.push({ ...outcomeRow("baseline", day, 0.1), symbol: "EURUSD" });
      rows.push({ ...trainRow("wide", day, 0.18), symbol: "EURUSD" });
      rows.push({ ...outcomeRow("wide", day, 0.18), symbol: "EURUSD" });
      // USDJPY: the variant LOSES steadily — a class rollup would hide it.
      rows.push({ ...trainRow("baseline", day, 0.1), symbol: "USDJPY" });
      rows.push({ ...outcomeRow("baseline", day, 0.1), symbol: "USDJPY" });
      rows.push({ ...trainRow("wide", day, 0.04), symbol: "USDJPY" });
      rows.push({ ...outcomeRow("wide", day, 0.04), symbol: "USDJPY" });
    }
    return rows;
  };

  it("grades each market on its own rows — one accepts, its class-mate refuses", () => {
    const verdicts = marketVerdicts(readGridCube(twoMarketRows()), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 7,
    });
    const eur = verdicts.get("EURUSD")?.get("wide");
    const jpy = verdicts.get("USDJPY")?.get("wide");
    assert.ok(eur?.accepted, "EURUSD's steady gain must accept");
    assert.equal(jpy?.accepted, false, "USDJPY's steady loss must refuse");
  });

  it("refuses a market whose sample is thin, by name", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 3; day += 1) {
      rows.push({ ...trainRow("baseline", day, 0.1), symbol: "EURUSD" });
      rows.push({ ...outcomeRow("baseline", day, 0.1), symbol: "EURUSD" });
      rows.push({ ...trainRow("wide", day, 0.3), symbol: "EURUSD" });
      rows.push({ ...outcomeRow("wide", day, 0.3), symbol: "EURUSD" });
    }
    const verdicts = marketVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 7,
    });
    const eur = verdicts.get("EURUSD")?.get("wide");
    assert.equal(eur?.accepted, false);
    assert.match(eur?.reason ?? "", /THIN/i);
  });

  it("agrees with classVerdicts when the class IS one market (above the floor)", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 40; day += 1) {
      rows.push(trainRow("baseline", day, 0.1));
      rows.push(outcomeRow("baseline", day, 0.1));
      rows.push(trainRow("steady", day, 0.15));
      rows.push(outcomeRow("steady", day, 0.15));
    }
    const byClass = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 7,
    });
    const byMarket = marketVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 7,
    });
    const classCell = [...byClass.values()][0]?.get("steady");
    const marketCell = [...byMarket.values()][0]?.get("steady");
    assert.equal(classCell?.accepted, marketCell?.accepted);
    assert.equal(classCell?.pairedP, marketCell?.pairedP);
  });
});

describe("gradeCorpus — the market unit rides the same door (4d)", () => {
  it("grades per market when asked, same manifest discipline", async () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 40; day += 1) {
      rows.push(trainRow("baseline", day, 0.1));
      rows.push(outcomeRow("baseline", day, 0.1));
      rows.push(trainRow("wide", day, 0.2));
      rows.push(outcomeRow("wide", day, 0.2));
    }
    const emitPath = corpusWith(rows);
    const { verdicts } = await gradeCorpus(emitPath, {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 7,
      verdictUnit: "market",
    });
    const eur = verdicts.get("EURUSD")?.get("wide");
    assert.ok(eur?.accepted, "the market unit must grade EURUSD's own rows");
    assert.equal(eur?.fitFilled, 40);
  });
});

describe("gradeCorpus — the holdout cycle's surgical read (symbolFilter)", () => {
  it("grades ONLY the named symbols, holdout included, others never enter the cube", async () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 40; day += 1) {
      for (const symbol of ["EURUSD", "USDJPY"]) {
        rows.push({ ...trainRow("baseline", day, 0.1), symbol });
        rows.push({ ...outcomeRow("baseline", day, 0.1), symbol });
        rows.push({ ...trainRow("wide", day, 0.2), symbol });
        rows.push({ ...outcomeRow("wide", day, 0.2), symbol });
      }
    }
    const emitPath = corpusWith(rows);
    const { verdicts } = await gradeCorpus(emitPath, {
      foldNames: { fit: "train", select: "test" },
      includeHoldout: true,
      permutations: 200,
      seed: 7,
      symbolFilter: new Set(["USDJPY"]),
      verdictUnit: "market",
    });
    assert.equal(verdicts.has("EURUSD"), false, "filtered symbols never enter");
    assert.ok(verdicts.get("USDJPY")?.get("wide")?.accepted);
  });
});

describe("gradeCorpus — per-market folds cut over each market's OWN span (totality)", () => {
  it("re-cuts fit/select/confirm from row times and drops boundary-leaking rows exactly", async () => {
    const DAY_MS = 86_400_000;
    const start = Date.UTC(2025, 0, 6);
    const rows: SweepEmitRow[] = [];
    // 200 days: the select quarter holds 50 filled rows, clear of the
    // market unit's 30-filled floor.
    for (let day = 0; day < 200; day += 1) {
      for (const [variant, r] of [["baseline", 0.1], ["wide", 0.2]] as const) {
        rows.push({
          accepted: true,
          exitAtMs: start + day * DAY_MS + 3_600_000,
          outcome: "take_profit",
          realizedR: r,
          split: "ignored-by-refold",
          symbol: "EURUSD",
          time: start + day * DAY_MS,
          variant,
        });
      }
    }
    // The leaker: decided in the select quarter (day 120), exits in
    // confirm (day 160) — dropped by exact containment.
    rows.push({
      accepted: true,
      exitAtMs: start + 160 * DAY_MS,
      outcome: "take_profit",
      realizedR: 50,
      split: "ignored-by-refold",
      symbol: "EURUSD",
      time: start + 120 * DAY_MS + 7_200_000,
      variant: "wide",
    });
    const emitPath = corpusWith(rows);
    const { verdicts, foldNames } = await gradeCorpus(emitPath, {
      includeHoldout: true,
      perMarketFolds: true,
      permutations: 200,
      seed: 7,
      verdictUnit: "market",
    });
    assert.equal(foldNames.fit, "fit");
    const wide = verdicts.get("EURUSD")?.get("wide");
    assert.ok(wide?.accepted, "steady gain across re-cut folds accepts");
    // 50 select days for the variant; the +50R leaker was dropped, so
    // the select delta stays the honest 50 x 0.1.
    assert.ok(
      Math.abs((wide?.selectTotalDelta ?? 0) - 5) < 1e-6,
      `leaker must be dropped: selectTotalDelta ${wide?.selectTotalDelta}`,
    );
  });
});
