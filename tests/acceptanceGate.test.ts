import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import {
  classVerdicts,
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
    days: 365,
    generatedAt: "2026-08-10T05:00:00.000Z",
    grid: [{}, { tp1RiskShare: 0.9 }],
    stepBars: 16,
    symbols: [{
      calibration: {},
      providerSymbol: "EURUSD",
      series: { "15min": seriesFacts([{ time: 0 }]) },
      symbol: "EURUSD",
    }],
    trainShare: 0.6,
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
  it("derives fit/select/confirm from the manifest and reads confirm once, for accepted variants only", () => {
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
        series: { "15min": seriesFacts([{ time: 0 }]) },
        symbol: "EURUSD",
      }],
      trainShare: 0.6,
      warmupBars: 240,
    });
    writeFileSync(
      `${emitPath}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    const graded = gradeCorpus(emitPath, { permutations: 100, seed: 4 });
    assert.deepEqual(graded.foldNames, {
      confirm: "confirm",
      fit: "fit",
      select: "select",
    });
    const verdict = graded.verdicts.get("forex")!.get("wide")!;
    assert.equal(verdict.accepted, true);
    assert.equal(Number(verdict.confirmTotalDelta!.toFixed(1)), 24);
  });
});

describe("shards of one measurement (4c) — matched conditions or refusal", () => {
  const shardWith = (
    rows: SweepEmitRow[],
    gridOverride?: unknown[],
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
      days: 365,
      generatedAt: "2026-08-10T07:00:00.000Z",
      grid: gridOverride ?? [{}, { wide: true }],
      stepBars: 16,
      symbols: [{
        calibration: {},
        providerSymbol: rows[0]?.symbol ?? "EURUSD",
        series: { "15min": seriesFacts([{ time: 0 }]) },
        symbol: rows[0]?.symbol ?? "EURUSD",
      }],
      trainShare: 0.6,
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

  it("concatenates shards whose conditions match", () => {
    const graded = gradeCorpus(
      [shardWith(shardRows("EURUSD")), shardWith(shardRows("GBPUSD"))],
      { permutations: 50, seed: 6 },
    );
    const verdict = graded.verdicts.get("forex")!.get("wide")!;
    // Both shards' rows aggregate: 24 filled on the select fold.
    assert.equal(verdict.selectFilled, 24);
  });

  it("refuses shards measured under different conditions", () => {
    assert.throws(
      () =>
        gradeCorpus([
          shardWith(shardRows("EURUSD")),
          shardWith(shardRows("GBPUSD"), [{}, { different: true }]),
        ]),
      /shards of one measurement/,
    );
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

describe("gradeCorpus — the emit door end to end", () => {
  it("reads only a manifested corpus and grades it", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 12; day += 1) {
      rows.push(trainRow("baseline", day, 0.3));
      rows.push(trainRow("wide", day, 0.5));
      rows.push(outcomeRow("baseline", day, 0.3));
      rows.push(outcomeRow("wide", day, 0.5));
    }
    const graded = gradeCorpus(corpusWith(rows), {
      permutations: 50,
      seed: 2,
    });
    assert.equal(graded.manifest.analyzerVersion, "2026.08.09.test");
    assert.ok(graded.verdicts.get("forex")!.has("wide"));
  });
});
