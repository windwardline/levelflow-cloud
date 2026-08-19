import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  // #364 round 37, finding 1: a variant sharing NO select day with the
  // baseline had scored the MINIMUM attainable p — with every family
  // member degenerate, the permutation loop contributed nothing, maxT
  // stayed -Infinity, and pairedP = 1/(permutations+1) ≈ 0.001 from
  // zero pairs, exactly (no RNG involved) — and `accepted` never read
  // the sharedDays it recorded, so a profitable-both-folds disjoint
  // variant was ACCEPTED. A paired test with no pairs supports no
  // verdict: p floors at 1 and acceptance requires a nonzero pairing.
  it("refuses a variant with zero shared select days — a paired test with no pairs supports no verdict", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 12; day += 1) {
      rows.push(trainRow("baseline", day, 0.4));
      rows.push(outcomeRow("baseline", day, 0.4));
      rows.push(trainRow("disjoint", day, 0.9));
    }
    // The variant's select-fold days never overlap the baseline's.
    for (let day = 12; day < 24; day += 1) {
      rows.push(outcomeRow("disjoint", day, 0.9));
    }
    const options = {
      foldNames: { fit: "train", select: "test" },
      permutations: 100,
      seed: 5,
    };
    const verdict = classVerdicts(readGridCube(rows), options)
      .get("forex")!.get("disjoint")!;
    assert.equal(verdict.sharedDays, 0);
    assert.equal(verdict.pairedP, 1);
    assert.equal(verdict.accepted, false);
    // Same law in the per-market singleton families the incidental
    // route runs through.
    const market = marketVerdicts(readGridCube(rows), options)
      .get("EURUSD")!.get("disjoint")!;
    assert.equal(market.sharedDays, 0);
    assert.equal(market.pairedP, 1);
    assert.equal(market.accepted, false);
  });

  // #364 round 38, finding 2: the statistic's own resolution puts the
  // smallest significant pairing at FIVE shared days (same-signed
  // deltas reach the sign-flip maximum only on the all-matching
  // assignment, so min p ~ 2^-n: 0.0625 at n=4, 0.03125 at n=5) — and
  // below that the permutation ESTIMATE could still dip under 0.05 by
  // seed. A four-day pairing with heavy composition — the variant
  // trades sixteen select days the baseline never touches, profitable
  // both folds, expectancy up, not thin — must be refused
  // deterministically by the floor, not left to estimator noise.
  it("refuses a pairing below the statistic's resolution — four shared days cannot carry an acceptance", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 4; day += 1) {
      rows.push(trainRow("baseline", day, 0.3));
      rows.push(outcomeRow("baseline", day, 0.3));
      rows.push(trainRow("compose", day, 0.8));
      rows.push(outcomeRow("compose", day, 0.8));
    }
    for (let day = 4; day < 20; day += 1) {
      rows.push(trainRow("compose", day, 0.8));
      rows.push(outcomeRow("compose", day, 0.8));
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 9,
    }).get("forex")!.get("compose")!;
    assert.equal(verdict.sharedDays, 4);
    assert.equal(verdict.effectivePairs, 4);
    assert.equal(verdict.accepted, false);
    // #364 round 39, finding 2: a floor refusal names itself — never
    // the same "fails" as a measured loss.
    assert.equal(
      verdict.reason,
      "NO VERDICT — pairing 4 nonzero of 4 shared days is below the " +
        "statistic's floor (5)",
    );
  });

  // #364 round 39, finding 1: a zero delta contributes nothing under
  // any sign assignment, so the floor gates the SUPPORT, not the raw
  // shared-day count. This variant is bit-identical to the baseline on
  // 36 of 40 shared days (delta exactly 0) and better on four —
  // round 38's day-count floor read sharedDays 40 and admitted it,
  // while its effective pairing is 4, where the minimum attainable p
  // is 0.0625 and only seed noise could dip under 0.05.
  it("refuses a pairing whose support is below the floor — zero-delta days cannot flip the statistic", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 40; day += 1) {
      rows.push(trainRow("baseline", day, 0.3));
      rows.push(outcomeRow("baseline", day, 0.3));
      const edge = day < 4 ? 0.5 : 0;
      rows.push(trainRow("sparse", day, 0.3 + edge));
      rows.push(outcomeRow("sparse", day, 0.3 + edge));
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 7,
    }).get("forex")!.get("sparse")!;
    assert.equal(verdict.sharedDays, 40);
    assert.equal(verdict.effectivePairs, 4);
    assert.equal(verdict.accepted, false);
    assert.equal(
      verdict.reason,
      "NO VERDICT — pairing 4 nonzero of 40 shared days is below the " +
        "statistic's floor (5)",
    );
  });

  // #364 round 39, smaller; hardened round 40: the five-pair boundary
  // is pinned from the ACCEPTING side too — a decisive same-sign
  // pairing at exactly the floor must clear it. At 2,000 permutations
  // the exceed count is Binomial(2000, 1/32) (mean 62.5, sd ≈ 7.8):
  // p ≤ 0.05 sits ≈ 4.7 sd inside and p > 0.02 ≈ 3 sd, so the accept
  // is a property of the derivation at any seed, not one seed's
  // estimate landing under the threshold — the same estimator-noise
  // standard the refusing side already meets. The p band asserts the
  // derived value (~0.031), not merely the verdict.
  it("accepts at exactly the floor — five effective pairs is the smallest pairing the statistic can certify", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 5; day += 1) {
      rows.push(trainRow("baseline", day, 0.2));
      rows.push(outcomeRow("baseline", day, 0.2));
      rows.push(trainRow("edge", day, 1.0));
      rows.push(outcomeRow("edge", day, 1.0));
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 2_000,
      seed: 11,
    }).get("forex")!.get("edge")!;
    assert.equal(verdict.sharedDays, 5);
    assert.equal(verdict.effectivePairs, 5);
    assert.ok(
      verdict.pairedP > 0.02 && verdict.pairedP <= 0.05,
      `pairedP ${verdict.pairedP} should sit at the derived ~0.031`,
    );
    assert.equal(verdict.accepted, true);
  });

  // #364 round 40, finding 1: the non-shared portion's OTHER half — a
  // tightening dial trades a strict subset of the baseline's days, so
  // its printed comp is 0.0 while the baseline R it forwent (15 days
  // netting −4.5 here) had appeared in no printed quantity despite
  // driving the whole-fold delta. droppedR names it.
  it("reports the baseline R a subset variant forwent — droppedR is the other half of composition", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 40; day += 1) {
      const r = day < 25 ? 0.2 : -0.3;
      rows.push(trainRow("baseline", day, r));
      rows.push(outcomeRow("baseline", day, r));
      if (day < 25) {
        rows.push(trainRow("tighter", day, 0.4));
        rows.push(outcomeRow("tighter", day, 0.4));
      }
    }
    const verdict = classVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 200,
      seed: 5,
    }).get("forex")!.get("tighter")!;
    assert.equal(verdict.sharedDays, 25);
    assert.equal(verdict.effectivePairs, 25);
    assert.equal(verdict.compositionR, 0);
    assert.ok(
      verdict.droppedR !== null && Math.abs(verdict.droppedR + 4.5) < 1e-9,
      `droppedR ${verdict.droppedR} should carry the 15 forgone days (−4.5)`,
    );
  });

  // #364 round 40, finding 2: the family-wise null spans only the
  // hypotheses under test. B's two-pair deltas ([+1, +1]) reach
  // T = √2 ≈ 1.414 on a quarter of sign draws — above A's observed
  // ≈ 1.195 — so with B in the maxT family, A's p ran ≈ 0.25 and an
  // accept-eligible variant printed "fails", blocked by a sibling the
  // floor had already declared unable to carry any verdict. Every
  // earlier fixture was a singleton family, so the max-loop's
  // membership was never exercised.
  it("a sub-floor sibling neither blocks its family nor receives a p — the null spans hypotheses under test", () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 6; day += 1) {
      rows.push(trainRow("baseline", day, 0.2));
      rows.push(outcomeRow("baseline", day, 0.2));
      const aEdge = day === 0 ? 5.0 : 0.2;
      rows.push(trainRow("A", day, 0.2 + aEdge));
      rows.push(outcomeRow("A", day, 0.2 + aEdge));
      const bEdge = day < 2 ? 1.0 : 0;
      rows.push(trainRow("B", day, 0.2 + bEdge));
      rows.push(outcomeRow("B", day, 0.2 + bEdge));
    }
    const options = {
      foldNames: { fit: "train", select: "test" },
      permutations: 400,
      seed: 3,
    };
    const family = classVerdicts(readGridCube(rows), options).get("forex")!;
    const a = family.get("A")!;
    assert.equal(a.effectivePairs, 6);
    assert.ok(a.pairedP < 0.05, `A's own null gives ~1/64, got ${a.pairedP}`);
    assert.equal(a.accepted, true);
    const b = family.get("B")!;
    assert.equal(b.effectivePairs, 2);
    assert.equal(b.pairedP, 1);
    assert.equal(b.accepted, false);
    assert.equal(
      b.reason,
      "NO VERDICT — pairing 2 nonzero of 6 shared days is below the " +
        "statistic's floor (5)",
    );
  });

  // #364 round 37, finding 2: a baseline variant that carries no cell
  // made every class degenerate at once — deltas against nothing, the
  // variants' own totals wearing delta names — and (before finding 1's
  // floor) accepted every profitable variant at the minimum p. A typo
  // refuses, naming what the corpus actually carries.
  it("refuses a baseline variant that carries no cell, naming the variants present", () => {
    assert.throws(
      () =>
        classVerdicts(readGridCube(better()), {
          baselineVariant: "tp1Atr=0.5",
          foldNames: { fit: "train", select: "test" },
          permutations: 50,
          seed: 2,
        }),
      /baseline variant "tp1Atr=0\.5" carries no cell in this corpus[\s\S]*variants present: baseline, tp1=0\.9/,
    );
  });

  // #364 round 41, finding 1: the burned-log records READS, never
  // attempts. Appended before the verdicts, a throw in between —
  // round 37's baseline-exists refusal, reached by exactly the typo
  // the str() message names — burned the corpus's one acknowledged
  // confirm read on a run that produced no confirm number, and the
  // corrected re-run then demanded --acknowledge-prior-reads. A legacy
  // two-split corpus has no confirm fold to read, so a successful
  // --confirm-final run against one burns nothing either.
  it("burns the confirm log only after a confirm read actually happened", async () => {
    const emitPath = corpusWith(better());
    const confirmLogPath = `${emitPath}.confirm-log.jsonl`;
    await assert.rejects(
      () =>
        gradeCorpus([emitPath], {
          baselineVariant: "tp1Atr=0.5",
          confirmFinal: true,
          confirmLogPath,
          permutations: 50,
          seed: 2,
        }),
      /carries no cell/,
    );
    assert.equal(existsSync(confirmLogPath), false);
    const graded = await gradeCorpus([emitPath], {
      confirmFinal: true,
      confirmLogPath,
      permutations: 50,
      seed: 2,
    });
    assert.equal(graded.foldNames.confirm, undefined);
    assert.equal(existsSync(confirmLogPath), false);
  });

  // #364 round 41, smaller: at the market grain a symbol whose baseline
  // carries no cell is a per-group gap the cube-wide refusal cannot see
  // — the amendment-25 starvation shape (the shipped baseline accepted
  // nothing where a looser variant traded). The diagnosis names the
  // absent baseline, never the pairing it empties.
  it("names a group's absent baseline instead of blaming the pairing — market grain", () => {
    // 30 days so the market grain's absolute minFilled floor does not
    // fire first — THIN keeps precedence over the baseline diagnosis,
    // and this fixture isolates the baseline branch.
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 30; day += 1) {
      rows.push(trainRow("baseline", day, 0.2));
      rows.push(outcomeRow("baseline", day, 0.2));
      rows.push(trainRow("wide", day, 0.5));
      rows.push(outcomeRow("wide", day, 0.5));
      rows.push({ ...trainRow("wide", day, 0.5), symbol: "GBPUSD" });
      rows.push({ ...outcomeRow("wide", day, 0.5), symbol: "GBPUSD" });
    }
    const gbp = marketVerdicts(readGridCube(rows), {
      foldNames: { fit: "train", select: "test" },
      permutations: 100,
      seed: 5,
    }).get("GBPUSD")!.get("wide")!;
    assert.equal(gbp.accepted, false);
    assert.equal(
      gbp.reason,
      'NO VERDICT — baseline "baseline" has no test-fold days in this ' +
        "group; no comparison is possible",
    );
  });

  // #364 round 41, finding 2: the paired machinery's support predicate
  // lives ONCE — familyPairedP's null membership and p-floor and
  // groupVerdicts' acceptance floor and reason all call supportOf, so
  // the invariant "in the null IFF acceptable" cannot silently split
  // into two zero tests. The single occurrence of the zero test is
  // pinned at source.
  it("the support predicate is declared once and consumed by both the null and the verdict", () => {
    const source = readFileSync("scripts/grid-totalr.ts", "utf8");
    const zeroTests = [...source.matchAll(/delta !== 0/g)];
    assert.equal(
      zeroTests.length,
      1,
      "the delta zero test must live only inside supportOf",
    );
    const calls = [...source.matchAll(/supportOf\(/g)];
    assert.ok(
      calls.length >= 3,
      "supportOf must be declared and consumed by familyPairedP and groupVerdicts",
    );
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

  // #364 round 24, finding 3: the graded population states its own
  // denominator — the vocabulary already holds a data-absence row out of
  // every cell's n, and gradeCorpus now RETURNS the held-out volume so
  // the report prints it instead of leaving it silent. Executed both
  // ways: the marked row is counted, and it moves no verdict. Scoped to
  // the GRADED folds (#364 round 25, finding 2): the confirm-split
  // marked row below must NOT count on this non-confirm-final read,
  // whose tables never compute that fold — the count must reconcile
  // with the population the verdicts describe.
  it("counts data-absence rows held out of the graded population without moving a verdict — executed", async () => {
    const rows = shardRows("EURUSD");
    const marked = {
      ...outcomeRow("baseline", 3, 0),
      noBarsInReviewWindow: true,
      symbol: "EURUSD",
    };
    const confirmMarked = {
      ...outcomeRow("baseline", 5, 0),
      noBarsInReviewWindow: true,
      split: "confirm",
      symbol: "EURUSD",
    };
    const withMarked = await gradeCorpus(
      [shardWith([...rows, marked, confirmMarked])],
      {
        permutations: 50,
        seed: 6,
      },
    );
    const without = await gradeCorpus([shardWith(rows)], {
      permutations: 50,
      seed: 6,
    });
    assert.equal(withMarked.dataAbsentRows, 1);
    assert.equal(without.dataAbsentRows, 0);
    assert.equal(
      withMarked.verdicts.get("forex")!.get("wide")!.accepted,
      without.verdicts.get("forex")!.get("wide")!.accepted,
    );
    // The report line the returned count feeds exists at source (the
    // script runs main() only under its own argv, so the print itself
    // is pinned rather than executed).
    assert.match(
      readFileSync("scripts/grid-totalr.ts", "utf8"),
      /data-absence rows held out of every fold denominator: \$\{dataAbsentRows\}/,
    );
  });

  // #364 round 29, finding 1: the folds line printed the manifest's
  // STAMPED holdout list while gradeCorpus excludes the read-time
  // stratified set — different definitions (round 27), different
  // counts — and kept printing under --include-holdout, where nothing
  // is excluded. gradeCorpus now returns the held set's size. Three
  // same-class shards make the stratified rule bite (max(1,
  // round(0.2*3)) = 1 of 3 forex markets) while the fixture manifests
  // stamp NO holdout list at all — the reported count is the read's
  // own, never the stamp's.
  it("reports the read-time stratified holdout count, and none under includeHoldout — executed", async () => {
    const shards = [
      shardWith(shardRows("EURUSD")),
      shardWith(shardRows("GBPUSD")),
      shardWith(shardRows("USDJPY")),
    ];
    const graded = await gradeCorpus(shards, { permutations: 50, seed: 6 });
    assert.equal(graded.heldOutMarkets, 1);
    const included = await gradeCorpus(shards, {
      includeHoldout: true,
      permutations: 50,
      seed: 6,
    });
    assert.equal(included.heldOutMarkets, 0);
    // The print site consumes the returned figure, never the stamp.
    const source = readFileSync("scripts/grid-totalr.ts", "utf8");
    assert.match(
      source,
      /holdout \$\{heldOutMarkets\} markets excluded \(read-time stratified\)/,
    );
    assert.doesNotMatch(source, /manifest\.holdoutSymbols\?\.length/);
  });

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

  it("still refuses shards whose curve DEPTH differs within the door's tolerance (#364 rounds 8 and 16)", async () => {
    // firstTime is day-stable, so two stores of different depth are two
    // measurements even when BOTH are individually admissible (each
    // firstTime inside the fetch-floor tolerance, so the door's
    // leading-edge check passes both) — the identity comparison is what
    // separates them. A shard shallow enough to trip the door itself
    // now refuses THERE on every read path (round 16: present curve
    // evidence binds historical reads too), so this layer's population
    // is exactly the within-tolerance mismatches.
    const slightlyDeeper: TreasuryCurveFacts = {
      ...TEST_TREASURY_CURVE,
      firstTime: Date.UTC(2013, 0, 7),
    };
    await assert.rejects(
      gradeCorpus([
        shardWith(shardRows("EURUSD")),
        shardWith(
          shardRows("GBPUSD"),
          undefined,
          undefined,
          undefined,
          slightlyDeeper,
        ),
      ]),
      /shards of one measurement/,
    );
  });

  // (#364 round 16, finding 1: the door-level law — PRESENT curve
  // evidence showing a corpus-touching hole refuses on every read path,
  // the superseded-clock override included — is executed in
  // tests/sweepStats.test.ts's historical-reads test, whose fixtures
  // carry a real corpus span for the gap to touch; gradeCorpus routes
  // every shard through that same verifyManifest.)
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
