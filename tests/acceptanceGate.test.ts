import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
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
    // the same "fails" as a measured loss; round 42: the disposition
    // rides the field, not the wording.
    assert.equal(verdict.noVerdict, true);
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
    assert.equal(verdict.noVerdict, true);
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
    assert.equal(verdict.noVerdict, false);
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
    assert.equal(a.noVerdict, false);
    assert.equal(a.accepted, true);
    const b = family.get("B")!;
    assert.equal(b.effectivePairs, 2);
    assert.equal(b.pairedP, 1);
    assert.equal(b.noVerdict, true);
    assert.equal(b.accepted, false);
    assert.equal(
      b.reason,
      "NO VERDICT — pairing 2 nonzero of 6 shared days is below the " +
        "statistic's floor (5)",
    );
  });

  // #364 round 46, finding 1: every non-singleton fixture in this file
  // had a SUB-FLOOR sibling, so the max across the family was never
  // actually taken — the round-40 test above passes identically whether
  // the null is the family maximum or each variant's own statistic, and
  // a change replacing maxT with a per-variant map went out under a
  // green suite. Multiplicity control is what makes a class's whole
  // crossed grid one test rather than V independent ones; without it a
  // class's null false-accept rate runs ~1 − 0.95^V instead of ~0.05,
  // and this gate's output is the parameter set the desk ships.
  //
  // Three variants, each clearing MIN_EFFECTIVE_PAIRS with its edge on
  // a DISJOINT five-day block and matching the baseline elsewhere, so
  // their statistics are independent under a shared per-day sign draw
  // (a shared block would make them move together and the max would
  // equal each one). Each has support 5 with equal-magnitude deltas, so
  // observed = √5 and only the all-plus draw on its own block reaches
  // it: own null 1/32 ≈ 0.031, family null 1 − (31/32)³ ≈ 0.091. A
  // accepts alone and is refused with its siblings present, on an
  // identical observed statistic — which is the correction doing
  // exactly what it exists to do.
  const disjointFamily = (variants: readonly string[]): SweepEmitRow[] => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 5 * variants.length; day += 1) {
      rows.push(trainRow("baseline", day, 0.1));
      rows.push(outcomeRow("baseline", day, 0.1));
      variants.forEach((variant, index) => {
        // Matching the baseline off its own block gives a delta of
        // exactly zero there, which supportOf excludes — so every
        // variant is above the floor and none is thin.
        const own = day >= index * 5 && day < index * 5 + 5;
        rows.push(trainRow(variant, day, own ? 0.4 : 0.1));
        rows.push(outcomeRow(variant, day, own ? 0.4 : 0.1));
      });
    }
    return rows;
  };

  it("prices multiplicity across the family — a variant that accepts alone is refused beside floor-clearing siblings", () => {
    const options = {
      foldNames: { fit: "train", select: "test" },
      permutations: 2_000,
      seed: 11,
    };
    const alone = classVerdicts(readGridCube(disjointFamily(["A"])), options)
      .get("forex")!.get("A")!;
    assert.equal(alone.effectivePairs, 5);
    assert.equal(alone.thin, false);
    assert.ok(
      alone.pairedP > 0.02 && alone.pairedP < 0.05,
      `A's own null is 1/32 ≈ 0.031, got ${alone.pairedP}`,
    );
    assert.equal(alone.accepted, true);

    const family = classVerdicts(
      readGridCube(disjointFamily(["A", "B", "C"])),
      options,
    ).get("forex")!;
    const a = family.get("A")!;
    // Nothing about A's own evidence changed: same support, same
    // equal-magnitude deltas, same observed statistic. Only the family
    // it is tested within did.
    assert.equal(a.effectivePairs, 5);
    assert.equal(a.thin, false);
    assert.equal(a.noVerdict, false);
    assert.ok(
      a.pairedP > alone.pairedP,
      `the family null must be no smaller than A's own (${a.pairedP} vs ` +
        `${alone.pairedP}) — equality here means the max is not being taken`,
    );
    assert.ok(
      a.pairedP > 0.05,
      `three independent floor-clearing variants give ~0.091, got ${a.pairedP}`,
    );
    assert.equal(a.accepted, false);
    // Every member sees the same family null, so none of the three is
    // accepted on evidence that clears only its own.
    for (const variant of ["B", "C"]) {
      const sibling = family.get(variant)!;
      assert.equal(sibling.effectivePairs, 5);
      assert.equal(sibling.accepted, false);
      assert.ok(sibling.pairedP > 0.05);
    }
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
    assert.equal(gbp.noVerdict, true);
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
    // #364 round 42, finding 2: the printer keys on the noVerdict
    // FIELD, never a prefix match on the reason's wording — a reworded
    // reason had silently restored round 39's bare-"fails" defect with
    // every test green, since main() has no executed coverage.
    assert.doesNotMatch(
      source,
      /reason\.startsWith/,
      "no printer may re-derive the disposition from the reason string",
    );
    assert.match(
      source,
      /: verdict\.noVerdict\s*\n\s*\? verdict\.reason/,
      "the printed label keys on the noVerdict field and reuses the reason",
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
  // omitConfirmFor drops a variant's confirm-fold rows entirely, which is
  // what addRowToCube produces for a variant that generated no ACCEPTED
  // setups in the confirm window (#364 round 43, finding 1) — acceptance
  // is decided on fit+select alone, so nothing about clearing the gate
  // implies the confirm fold covered the variant at all.
  const foldedCorpus = (
    options: { omitConfirmFor?: string[] } = {},
  ): string => {
    const omit = new Set(options.omitConfirmFor ?? []);
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 16; day += 1) {
      for (const [split, offset] of [["fit", 0], ["select", 40], ["confirm", 80]] as const) {
        for (const variant of ["baseline", "good"] as const) {
          if (split === "confirm" && omit.has(variant)) continue;
          rows.push({
            ...outcomeRow(variant, day + offset, variant === "good" ? 0.4 : 0.1),
            split,
          });
        }
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

  // #364 round 42, finding 1: the fold merely existing is not a READ —
  // the confirm figure is produced for accepted variants only, so a
  // --confirm-final run that accepts nothing reads nothing and burns
  // nothing (the criterion that already exempts a legacy corpus).
  // Grading this corpus against "good" as the baseline makes the one
  // compared variant ("baseline", deltas −0.3 on every shared day)
  // fail both folds, so zero variants accept.
  it("does not burn the log when a confirm-final run accepts nothing", async () => {
    const emitPath = foldedCorpus();
    const logPath = `${emitPath}.confirm-log.jsonl`;
    const graded = await gradeCorpus(emitPath, {
      baselineVariant: "good",
      confirmFinal: true,
      confirmLogPath: logPath,
      permutations: 100,
      seed: 4,
    });
    const verdict = graded.verdicts.get("forex")!.get("baseline")!;
    assert.equal(verdict.accepted, false);
    assert.equal(verdict.confirmTotalDelta, null);
    assert.equal(graded.confirmRead, false);
    assert.equal(existsSync(logPath), false);
  });

  // #364 round 43, finding 1: a confirm delta needs evidence on BOTH
  // sides. totalOf is `rSum ?? 0` and mergeInto skips absent cells, so
  // an accepted variant that produced no filled confirm-fold outcomes
  // yielded a NON-NULL number — which since round 42 is exactly what
  // burns the corpus's one acknowledged read.
  it("gives an accepted variant with no confirm-fold evidence null, never a zero — and burns nothing", async () => {
    // One side missing: the variant never traded the confirm window
    // while the baseline did. Unfixed this reads 0 − 1.6 = −1.6, which
    // prints as the variant LOSING 1.6R when it simply did not trade.
    const oneSided = foldedCorpus({ omitConfirmFor: ["good"] });
    const oneSidedLog = `${oneSided}.confirm-log.jsonl`;
    const first = await gradeCorpus(oneSided, {
      confirmFinal: true,
      confirmLogPath: oneSidedLog,
      permutations: 100,
      seed: 4,
    });
    const good = first.verdicts.get("forex")!.get("good")!;
    assert.equal(good.accepted, true);
    assert.equal(good.confirmFilled, 0);
    assert.ok(
      (good.confirmBaseFilled ?? 0) > 0,
      "the baseline side must carry evidence for this to be the one-sided case",
    );
    assert.equal(good.confirmTotalDelta, null);
    assert.equal(first.confirmRead, false);
    assert.equal(existsSync(oneSidedLog), false);

    // Neither side: the 0 − 0 = 0 shape, a figure over an absent
    // denominator that printed identically to a real net zero.
    const neither = foldedCorpus({ omitConfirmFor: ["good", "baseline"] });
    const neitherLog = `${neither}.confirm-log.jsonl`;
    const second = await gradeCorpus(neither, {
      confirmFinal: true,
      confirmLogPath: neitherLog,
      permutations: 100,
      seed: 4,
    });
    const alsoGood = second.verdicts.get("forex")!.get("good")!;
    assert.equal(alsoGood.accepted, true);
    assert.equal(alsoGood.confirmFilled, 0);
    assert.equal(alsoGood.confirmBaseFilled, 0);
    assert.equal(alsoGood.confirmTotalDelta, null);
    assert.equal(second.confirmRead, false);
    assert.equal(existsSync(neitherLog), false);

    // The real read still states its two denominators.
    const full = foldedCorpus();
    const fullLog = `${full}.confirm-log.jsonl`;
    const third = await gradeCorpus(full, {
      confirmFinal: true,
      confirmLogPath: fullLog,
      permutations: 100,
      seed: 4,
    });
    const read = third.verdicts.get("forex")!.get("good")!;
    assert.notEqual(read.confirmTotalDelta, null);
    assert.equal(read.confirmFilled, 16);
    assert.equal(read.confirmBaseFilled, 16);
    assert.equal(third.confirmRead, true);
    assert.equal(readFileSync(fullLog, "utf8").trim().split("\n").length, 1);
  });

  // #364 round 43, finding 2: the printed report and the ledger must
  // give the same answer to "was the confirm fold read?". main() had NO
  // executed coverage at all — the round-39/41/42 tests assert the
  // verdict fields that groupVerdicts produces, which is the half that
  // keeps passing while the printer drifts — so this drives the real
  // binary end to end.
  // #364 round 44, finding 1: the ledger keys on the CORPUS's identity,
  // not shard 0's manifestHash. Every shard of one measurement hashes
  // differently (manifestHash covers the shard's own symbols array), so
  // the old key made a reorder, a subset, or an archived shard-0 look
  // like a corpus never read — and the held-back fold opened again with
  // no refusal. conditionsOf is what defines one measurement, and the
  // shard loop already refuses shards that disagree on it.
  // anchor and days are parameterised (#364 round 47, finding 1): every
  // fixture used to hardcode one anchor, so the axis on which round 45's
  // identity was population-dependent could not be exercised at all.
  const foldedShard = (
    symbol: string,
    shard: { anchor?: string; days?: number } = {},
  ): string => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 16; day += 1) {
      for (const [split, offset] of [["fit", 0], ["select", 40], ["confirm", 80]] as const) {
        rows.push({ ...outcomeRow("baseline", day + offset, 0.1, undefined, symbol), split });
        rows.push({ ...outcomeRow("good", day + offset, 0.4, undefined, symbol), split });
      }
    }
    const dir = mkdtempSync(join(tmpdir(), "gate-fshard-"));
    const emitPath = join(dir, `${symbol}.jsonl`);
    writeFileSync(
      emitPath,
      rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    );
    const manifest = buildSweepManifest({
      analyzerVersion: "2026.08.09.test",
      anchor: shard.anchor ?? "2026-08-11",
      barRejections: {},
      clock: { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK },
      conditions: {
        macroAdjustment: "historical-treasury-curve",
        providerWarningCount: "zero-by-construction",
        weightAdjustment: "raw-engine-zero",
      },
      days: shard.days ?? 365,
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
        providerSymbol: symbol,
        series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
        symbol,
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

  // #364 round 47, finding 1: round 45 hashed each shard's `anchor` into
  // the corpus identity on the reasoning that "every shard of one run
  // carries the same pair". `anchor` is isoDate(new Date()) stamped per
  // INVOCATION, and shards are separate invocations — which is why
  // --fold-end and --fold-spec exist. So a sweep crossing midnight, or
  // one dead shard re-run the next day, gave the shard set a
  // population-dependent id: the subset hashed differently, found no
  // prior read, and opened the held-back fold with nothing recorded.
  // Round 44's finding restored on a new axis, and in the direction the
  // file calls the one it cannot afford — a MISSED refusal traded for a
  // false one. Every fixture hardcoded a single anchor, so nothing saw
  // it.
  it("refuses a subset re-read when the shards were swept on different run days", async () => {
    const tuesday = foldedShard("EURUSD", { anchor: "2026-08-11" });
    const wednesday = foldedShard("GBPUSD", { anchor: "2026-08-12" });
    const confirmLogDir = mkdtempSync(join(tmpdir(), "gate-anchor-"));
    const grade = (paths: string[]) =>
      gradeCorpus(paths, {
        confirmFinal: true,
        confirmLogDir,
        permutations: 100,
        seed: 4,
      });

    // The shard loop admits them as one measurement — conditionsOf
    // excludes the run-day-variant facts precisely so a cross-midnight
    // pair POOLS rather than refusing (#364 round 8).
    const first = await grade([tuesday, wednesday]);
    assert.equal(first.confirmRead, true);

    // …so every subset of that set must find the read.
    await assert.rejects(grade([tuesday]), /has already been read 1 time\(s\)/);
    await assert.rejects(grade([wednesday]), /has already been read 1 time\(s\)/);
    await assert.rejects(
      grade([wednesday, tuesday]),
      /has already been read 1 time\(s\)/,
    );
    assert.equal(readdirSync(confirmLogDir).length, 1);
  });

  // The half of round 45's scope that survives, and it survives by
  // sitting in the shard-compatibility predicate rather than only in the
  // id: two sweeps of different DEPTH are two measurements, and the loop
  // refuses the mixture outright instead of pooling different corpus
  // spans into one verdict. That refusal is also what makes the id
  // derived from the predicate subset-invariant by construction.
  it("refuses to pool shards swept to different depths", async () => {
    const shallow = foldedShard("EURUSD", { days: 180 });
    const deep = foldedShard("GBPUSD", { days: 365 });
    await assert.rejects(
      gradeCorpus([shallow, deep], { permutations: 50, seed: 4 }),
      /sweep depth \(days\)[\s\S]*not shards of one measurement/,
    );
  });

  it("refuses a re-read of the same corpus under a reordered or reduced shard list", async () => {
    const a = foldedShard("EURUSD");
    const b = foldedShard("GBPUSD");
    // Distinct shards of ONE measurement: different manifest hashes,
    // identical conditions (which is why the shard loop admits them).
    const manifestOf = (path: string) =>
      JSON.parse(readFileSync(`${path}.manifest.json`, "utf8")) as {
        manifestHash: string;
      };
    assert.notEqual(manifestOf(a).manifestHash, manifestOf(b).manifestHash);

    // #364 round 45, finding 1: the ledger's canonical home is a fixed
    // repository directory, not the shards' own. Every call here names a
    // temp one — a test must never append to the real confirm record —
    // and they all name the SAME one, which is the point: the ledger no
    // longer moves when the corpus does.
    const confirmLogDir = mkdtempSync(join(tmpdir(), "gate-ledger-"));
    const grade = (paths: string[], extra: Record<string, unknown> = {}) =>
      gradeCorpus(paths, {
        confirmFinal: true,
        confirmLogDir,
        permutations: 100,
        seed: 4,
        ...extra,
      });

    const first = await grade([a, b]);
    assert.equal(first.confirmRead, true);

    // Reordered — the same corpus by every definition that matters.
    await assert.rejects(grade([b, a]), /has already been read 1 time\(s\)/);
    // A subset, including the one that drops the shard the first read
    // listed first — the case a single derived ledger path would miss.
    await assert.rejects(grade([b]), /has already been read 1 time\(s\)/);
    await assert.rejects(grade([a]), /has already been read 1 time\(s\)/);
    // One read is one entry, counted once by its readId rather than once
    // per copy.
    const again = await grade([b, a], { acknowledgePriorReads: true });
    assert.equal(again.confirmRead, true);
    await assert.rejects(grade([a, b]), /has already been read 2 time\(s\)/);

    // The identity is content-addressed and filed under ONE name, so the
    // whole record is a single file — round 45's smaller finding: the
    // per-directory fan-out could append to one shard's ledger and then
    // throw before the next, recording a read the caller never learned
    // about.
    assert.deepEqual(readdirSync(confirmLogDir).length, 1);
  });

  // #364 round 49, finding 1: the widened scan globs whole directories,
  // and --confirm-log-dir is operator-controlled. Pointing it at the
  // sweeps directory is the layout the retired round-44 form taught, and
  // without a filename prefix every corpus EMIT joined the candidate
  // ledger list — then got slurped whole by a reader sweepStats
  // documents as unable to read a full-depth corpus at all (1.2GB, past
  // Node's maximum string length). The ledger writes a confirm-log-
  // prefix and the glob requires it.
  it("does not treat the corpus emits as ledgers when the ledger dir IS the shard dir", async () => {
    const corpus = foldedShard("EURUSD");
    const shardDir = dirname(corpus);
    const before = readdirSync(shardDir).sort();
    assert.ok(
      before.some((name) => name.endsWith(".jsonl")),
      "the fixture must put an emit in the directory being used as the ledger dir",
    );

    const first = await gradeCorpus([corpus], {
      confirmFinal: true,
      confirmLogDir: shardDir,
      permutations: 100,
      seed: 4,
    });
    assert.equal(first.confirmRead, true);

    // The ledger it wrote is distinguishable from the emit by name, which
    // is the whole mechanism.
    const written = readdirSync(shardDir).filter((name) =>
      !before.includes(name)
    );
    assert.deepEqual(written.length, 1);
    assert.ok(
      written[0].startsWith("confirm-log-"),
      `the ledger must be named apart from the emits; got ${written[0]}`,
    );

    // …and the emit sitting beside it is never mistaken for a record:
    // a second read still refuses, on the ledger alone.
    await assert.rejects(
      gradeCorpus([corpus], {
        confirmFinal: true,
        confirmLogDir: shardDir,
        permutations: 100,
        seed: 4,
      }),
      /has already been read 1 time\(s\)/,
    );
  });

  // #364 round 48, finding 2: corpusId is sha256Hex(conditionsOf(...)),
  // and conditionsOf is a GROWING statement of what one measurement is —
  // this PR amended it three times. The id was both the filename and the
  // entry key, so a read recorded under a previous identity went
  // unreachable on both halves at once, which is the "recorded read
  // lost" outcome the file calls unaffordable, arriving by construction
  // on the next amendment. The scan now reads every file in the ledger
  // directory and matches on a shard-hash overlap, which no amendment to
  // conditionsOf can move.
  it("still refuses when the recorded read was filed under an older corpus identity", async () => {
    const corpus = foldedShard("EURUSD");
    const confirmLogDir = mkdtempSync(join(tmpdir(), "gate-identity-"));
    const first = await gradeCorpus([corpus], {
      confirmFinal: true,
      confirmLogDir,
      permutations: 100,
      seed: 4,
    });
    assert.equal(first.confirmRead, true);

    // Rewrite the recorded entry the way a FUTURE amendment to
    // conditionsOf would leave it: filed under a corpus hash this
    // build can no longer compute, in a file named for that dead hash.
    // Nothing about the shards changed — only the definition did.
    const [ledgerName] = readdirSync(confirmLogDir);
    const recorded = JSON.parse(
      readFileSync(join(confirmLogDir, ledgerName), "utf8").trim(),
    ) as { corpusHash: string; shardHashes: string[] };
    const stale = "0".repeat(64);
    assert.notEqual(recorded.corpusHash, stale);
    rmSync(join(confirmLogDir, ledgerName));
    writeFileSync(
      join(confirmLogDir, `confirm-log-${stale}.jsonl`),
      JSON.stringify({ ...recorded, corpusHash: stale }) + "\n",
    );

    await assert.rejects(
      gradeCorpus([corpus], {
        confirmFinal: true,
        confirmLogDir,
        permutations: 100,
        seed: 4,
      }),
      (error: Error) => {
        assert.match(error.message, /has already been read 1 time\(s\)/);
        // …and it says WHY it still matched, so the operator is not left
        // wondering how a hash that does not reproduce was found.
        // …and it READS the recorded identity payload rather than
        // asserting what happened (#364 round 49, smaller). This
        // fixture rewrote the hash alone, so the honest statement is
        // that the terms are identical and the hashing moved — a
        // different fact, and a different cause, from terms that
        // differ.
        assert.match(error.message, /a shard this read also covers/);
        assert.match(error.message, /identity terms are\s+IDENTICAL/);
        assert.doesNotMatch(error.message, /which differs on/);
        return true;
      },
    );
  });

  // #364 round 46, finding 3: feeding --confirm-log-dir to BOTH halves
  // made the test hatch an unrecorded bypass rather than a relocation —
  // a corpus already recorded in the repository's own ledger opened
  // again with no refusal, and the second read left no trace where the
  // next default run looks. The redirect keeps its write; the canonical
  // ledger is searched either way.
  //
  // This is the one test that touches the canonical directory, because
  // the property under test IS that directory being consulted. Three
  // things bound it (#364 round 47, finding 2). The path is derived the
  // way the BINARY derives it — from this module's own location up to
  // the repo root, never from process.cwd(); computing it relatively
  // pinned the claim round 46 replaced and agreed with the real
  // property only when the suite happened to run from the repo root.
  // The fixture id is asserted absent first, so the test can never
  // mistake a real recorded read for its own. And the removal is
  // registered on process exit and on SIGINT/SIGTERM as well as in
  // `finally`, since a killed worker would otherwise strand a
  // fabricated read in a tracked record whose README says to commit
  // whatever appears there.
  //
  // Not taken, deliberately: making the canonical root injectable would
  // let the suite avoid the directory altogether, but it is the same
  // shape as the bypass round 46's finding 3 closed — an option that
  // removes the repository's ledger from the scan. This file's stated
  // preference is that losing a recorded read is the one outcome the
  // discipline cannot afford, so the residual risk lands on tidiness
  // instead: a SIGKILL between write and removal strands one file named
  // for a corpus id only this fixture produces (analyzerVersion
  // "2026.08.09.test"), which refuses nothing real.
  it("still refuses a corpus the repository's own ledger recorded, even under a redirect", async () => {
    const corpus = foldedShard("EURUSD");
    const redirect = mkdtempSync(join(tmpdir(), "gate-redirect-"));
    const first = await gradeCorpus([corpus], {
      confirmFinal: true,
      confirmLogDir: redirect,
      permutations: 100,
      seed: 4,
    });
    assert.equal(first.confirmRead, true);
    const [ledgerName] = readdirSync(redirect);
    const canonical = join(
      dirname(dirname(fileURLToPath(import.meta.url))),
      "docs/research/confirm-reads",
      ledgerName,
    );
    assert.equal(
      existsSync(canonical),
      false,
      "this fixture's corpus id must not collide with a real recorded read",
    );
    const cleanup = () => rmSync(canonical, { force: true });
    const onSignal = () => {
      cleanup();
      process.exit(130);
    };
    process.on("exit", cleanup);
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    // The retired UNPREFIXED form, in the canonical directory (#364
    // round 50 verdict, finding 2). Round 50 restored honouring it by
    // globbing this directory with an empty prefix, and the README
    // promises a ledger written by any earlier version keeps refusing —
    // but every fixture wrote the NEW prefixed name, so re-tightening
    // that glob "for symmetry" would orphan the form again, silently,
    // with the suite green. That is the defect round 50 just found.
    const retired = join(dirname(canonical), ledgerName.replace(/^confirm-log-/, ""));
    assert.notEqual(retired, canonical, "the retired form must differ by name");
    const cleanupRetired = () => rmSync(retired, { force: true });
    process.on("exit", cleanupRetired);
    try {
      // The entry a default run would have filed, placed where a
      // default run files it.
      writeFileSync(canonical, readFileSync(join(redirect, ledgerName)));
      await assert.rejects(
        gradeCorpus([corpus], {
          confirmFinal: true,
          confirmLogDir: mkdtempSync(join(tmpdir(), "gate-redirect2-")),
          permutations: 100,
          seed: 4,
        }),
        /has already been read 1 time\(s\)/,
      );
      // …and the same entry under the retired unprefixed name, with the
      // prefixed one removed, must refuse on its own.
      rmSync(canonical, { force: true });
      writeFileSync(retired, readFileSync(join(redirect, ledgerName)));
      await assert.rejects(
        gradeCorpus([corpus], {
          confirmFinal: true,
          confirmLogDir: mkdtempSync(join(tmpdir(), "gate-redirect3-")),
          permutations: 100,
          seed: 4,
        }),
        /has already been read 1 time\(s\)/,
        "the unprefixed form the prefix rename retired must still refuse",
      );
    } finally {
      cleanup();
      cleanupRetired();
      process.off("exit", cleanup);
      process.off("exit", cleanupRetired);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
    assert.equal(existsSync(canonical), false);
    assert.equal(existsSync(retired), false);
  });

  // #364 round 46, smaller: "commit any line that appears here" was a
  // promise in a change set whose repeated law is mechanism. A burn left
  // uncommitted is invisible to every other checkout — the same failure
  // the README opens by naming — and CI cannot see it, because CI runs
  // on a clean checkout and the unrecorded line exists only on the
  // machine that did the reading. So the mechanism fires at the burn.
  // #364 round 47, smaller: the reminder was printed unconditionally, so
  // a redirected run said in one breath that its read was NOT in the
  // repository's record and in the next to `git add` it — naming a path
  // outside the working tree, where that command fails outright. The
  // round-46 fix had already established the two cases differ; the
  // reminder has to follow the split. The previous version of this test
  // asserted BOTH strings from one run, holding the contradiction in
  // place — the round-12 defect class, in a test.
  it("tells a redirected run its read is unrecorded, and does not also tell it to commit", async () => {
    const corpus = foldedShard("GBPUSD");
    const redirect = mkdtempSync(join(tmpdir(), "gate-warn-"));
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => void warnings.push(message);
    try {
      await gradeCorpus([corpus], {
        confirmFinal: true,
        confirmLogDir: redirect,
        permutations: 100,
        seed: 4,
      });
    } finally {
      console.warn = original;
    }
    assert.ok(
      warnings.some((line) =>
        line.includes("NOT in the repository's confirm record")
      ),
      "a redirected write must say so at the prior-read check",
    );
    assert.ok(
      warnings.some((line) => line.includes("nothing here to commit")),
      `the burn must not claim a record was made; got ${
        JSON.stringify(warnings)
      }`,
    );
    assert.ok(
      warnings.every((line) => !line.includes("git add ")),
      "a redirected run must never name a git add outside the working tree",
    );
  });

  // The default branch's reminder is source-pinned for the same reason
  // DEFAULT_CONFIRM_LOG_DIR is: executing it means letting a test append
  // to the repository's real confirm record, which is the one thing that
  // record must never receive from a test run.
  it("names the command that finishes the record when the write is NOT redirected", () => {
    const source = readFileSync("scripts/grid-totalr.ts", "utf8");
    const burn = source.slice(source.indexOf("if (confirmRead) {"));
    assert.match(
      burn,
      /const recordedMessage =[\s\S]*?git add \$\{canonicalLedgerPath\}/,
      "the default branch must name the git add that records the read",
    );
    assert.match(
      burn,
      /canonicalLedgerPath === defaultLedgerPath\s*\n\s*\? recordedMessage\s*\n\s*: unrecordedMessage/,
      "the commit reminder must be the DEFAULT branch's message alone",
    );
    assert.doesNotMatch(
      burn.slice(burn.indexOf("const unrecordedMessage")),
      /git add/,
      "the redirected branch must never name a git add",
    );
  });

  // #364 round 45, finding 1: keying the ledger's LOCATION on the
  // shards' directory made it invariant to order and to subsets but not
  // to a MOVE. Copying a corpus elsewhere to grade — ordinary
  // housekeeping — left the record behind, so the held-back fold opened
  // again with nothing recorded, and the copy could be read forever
  // while the original's count never moved.
  it("refuses a re-read of a corpus that was COPIED to a fresh directory", async () => {
    const original = foldedShard("EURUSD");
    const confirmLogDir = mkdtempSync(join(tmpdir(), "gate-ledger-copy-"));
    const first = await gradeCorpus([original], {
      confirmFinal: true,
      confirmLogDir,
      permutations: 100,
      seed: 4,
    });
    assert.equal(first.confirmRead, true);

    // A byte-identical copy at a path sharing nothing with the original.
    const elsewhere = mkdtempSync(join(tmpdir(), "gate-moved-"));
    const copied = join(elsewhere, "EURUSD.jsonl");
    copyFileSync(original, copied);
    copyFileSync(`${original}.manifest.json`, `${copied}.manifest.json`);
    assert.notEqual(dirname(copied), dirname(original));

    await assert.rejects(
      gradeCorpus([copied], {
        confirmFinal: true,
        confirmLogDir,
        permutations: 100,
        seed: 4,
      }),
      /has already been read 1 time\(s\)/,
    );

    // …and the refusal names its evidence rather than only its count
    // (#364 round 45, finding 3): where the record is, when the prior
    // read happened, and how this read's shard population compares to
    // the one recorded — which is what tells "I graded this yesterday"
    // apart from "someone else's run collided with mine".
    const readAt = (JSON.parse(
      readFileSync(join(confirmLogDir, readdirSync(confirmLogDir)[0]), "utf8")
        .trim(),
    ) as { readAt: string }).readAt;
    await assert.rejects(
      gradeCorpus([copied], {
        confirmFinal: true,
        confirmLogDir,
        permutations: 100,
        seed: 4,
      }),
      (error: Error) => {
        assert.match(error.message, new RegExp(readAt));
        assert.match(error.message, new RegExp(confirmLogDir));
        assert.match(error.message, /matched by corpus identity/);
        assert.match(error.message, /same shard population/);
        return true;
      },
    );
  });

  it("the printed report claims a read only when the ledger recorded one — executed through main()", () => {
    // The ledger is filed under the corpus identity in one canonical
    // directory (#364 round 45, finding 1), which the run names
    // explicitly here: an executed test drives the REAL binary, and the
    // real binary's default is the repository's own confirm record.
    const ledgerDir = mkdtempSync(join(tmpdir(), "gate-main-ledger-"));
    const ledgersIn = (): string[] => readdirSync(ledgerDir);
    const run = (emitPath: string, extra: string[]): string =>
      execFileSync(
        "npx",
        [
          "--no-install",
          "tsx",
          "scripts/grid-totalr.ts",
          emitPath,
          "--confirm-final",
          "--confirm-log-dir",
          ledgerDir,
          ...extra,
        ],
        { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
      );

    // Zero-accept: grading against "good" leaves "baseline" failing
    // both folds, so no confirm figure is produced.
    const zeroAccept = foldedCorpus();
    const zeroOut = run(zeroAccept, ["--baseline", "good"]);
    // #364 round 44, finding 3: the two false-states of confirmRead have
    // opposite next moves, so they are named apart. Nothing accepted →
    // the 4c gate produced no pick and the confirm fold is irrelevant.
    assert.match(
      zeroOut,
      /confirm=confirm NOT READ \(no variant was accepted, so there was no pick to confirm/,
    );
    assert.doesNotMatch(zeroOut, /read once/);
    assert.deepEqual(ledgersIn(), []);

    // An accepted variant the confirm fold never covered says so on its
    // own row rather than printing a silent confirm column.
    const oneSided = foldedCorpus({ omitConfirmFor: ["good"] });
    const oneSidedOut = run(oneSided, []);
    assert.match(
      oneSidedOut,
      /confirm NOT READ — no filled outcomes on both sides \(variant 0, baseline 16\)/,
    );
    // …while something WAS accepted here, so the folds line names the
    // other cause: the pick is real and this fold cannot judge it.
    assert.match(
      oneSidedOut,
      /confirm=confirm NOT READ \(accepted variants carried no filled outcomes on both sides/,
    );
    assert.deepEqual(ledgersIn(), []);

    // The real read: the statement, the per-row figure with both
    // denominators, and the ledger all agree.
    const full = foldedCorpus();
    const fullOut = run(full, []);
    assert.match(fullOut, /confirm=confirm \(read once, accepted variants only\)/);
    assert.match(fullOut, /confirm ΔR 4\.8 over 16\/16 filled/);
    const ledgers = ledgersIn();
    assert.equal(ledgers.length, 1);
    assert.equal(
      readFileSync(join(ledgerDir, ledgers[0]), "utf8").trim().split("\n")
        .length,
      1,
    );
    // Nothing was written beside the shards: the record travels with the
    // repository now, not with the corpus's current path.
    assert.deepEqual(
      readdirSync(dirname(full)).filter((name) => name.includes("confirm-log")),
      [],
    );
  });

  // A source pin, deliberately: the only way to EXECUTE the default is to
  // let a test append to the repository's real confirm ledger, which is
  // the one thing that record must never receive from a test run. The
  // law it holds is the round-45 finding one layer down — a bare relative
  // default resolves against process.cwd(), so grading from a
  // subdirectory would find no prior read, open the held-back fold, and
  // file the entry somewhere nobody looks. The location must depend on
  // the repository alone.
  it("resolves the default ledger location from the repository, never from the working directory", () => {
    const source = readFileSync("scripts/grid-totalr.ts", "utf8");
    const declared = source.match(
      /const DEFAULT_CONFIRM_LOG_DIR = ([\s\S]*?);/,
    );
    assert.ok(declared, "the default ledger location must be declared once");
    assert.match(
      declared![1],
      /fileURLToPath\(import\.meta\.url\)/,
      "the default must be anchored to this module's own path",
    );
    assert.doesNotMatch(
      declared![1],
      /process\.cwd\(\)/,
      "the working directory is exactly what the location must not depend on",
    );
  });
});

// #364 round 45, finding 2: confirm-4d is the script that BURNS, and it
// had no executed coverage at all — which is why its cause counters
// conflated three of the gate's dispositions for two rounds. The verdict
// fields the LA-6 tests above assert are the half that keeps passing
// while the artifact drifts. These drive the real binary.
describe("confirm-4d — the artifact names what the confirm fold could not judge", () => {
  const MARKETS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF"] as const;
  // The market grain's absolute floor is 30 filled select-fold days, so
  // 40 puts every market except the deliberately thin one past it.
  const DAYS = 40;

  // One row per (symbol, variant, fold, day). Each symbol is shaped to
  // land on exactly one of the gate's dispositions:
  //   EURUSD  variant wins everywhere, confirm covered      → confirmed
  //   GBPUSD  variant loses on the measured folds           → refused-by-gate
  //   USDJPY  40 filled days but only 3 nonzero deltas      → gate-could-not-judge
  //   AUDUSD  10 filled select days, under the floor        → thin
  //   USDCHF  wins fit+select, no confirm-fold rows at all  → accepted-but-unevidenced
  const rowsFor = (symbol: string): SweepEmitRow[] => {
    const rows: SweepEmitRow[] = [];
    const days = symbol === "AUDUSD" ? 10 : DAYS;
    for (let day = 0; day < days; day += 1) {
      for (
        const [split, offset] of [
          ["fit", 0],
          ["select", 100],
          ["confirm", 200],
        ] as const
      ) {
        const variantR = symbol === "GBPUSD"
          ? 0.05
          : symbol === "USDJPY"
          ? (day < 3 ? 0.4 : 0.1)
          : 0.4;
        rows.push({
          ...outcomeRow("baseline", day + offset, 0.1, undefined, symbol),
          split,
        });
        // The unevidenced case: the variant simply never traded the
        // held-back window, which is not the same fact as losing there.
        if (symbol === "USDCHF" && split === "confirm") continue;
        rows.push({
          ...outcomeRow("good", day + offset, variantR, undefined, symbol),
          split,
        });
      }
    }
    return rows;
  };

  const fixture = (symbols: readonly string[]): {
    corpus: string;
    ledgerDir: string;
    researchDir: string;
  } => {
    const rows = symbols.flatMap(rowsFor);
    const dir = mkdtempSync(join(tmpdir(), "confirm4d-"));
    const corpus = join(dir, "shard.jsonl");
    writeFileSync(
      corpus,
      rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    );
    writeFileSync(
      `${corpus}.manifest.json`,
      JSON.stringify(
        buildSweepManifest({
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
          symbols: symbols.map((symbol) => ({
            calibration: {},
            providerSymbol: symbol,
            series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
            symbol,
          })),
          trainShare: 0.6,
          treasuryCurve: TEST_TREASURY_CURVE,
          warmupBars: 240,
        }),
        null,
        2,
      ) + "\n",
    );

    const researchDir = join(dir, "research");
    mkdirSync(researchDir, { recursive: true });
    // NZDUSD rides the candidates and the feasibility map but never the
    // corpus: a frozen pick the grading pass produced no verdict for at
    // all, which is a different fact from any disposition the gate can
    // reach and used to share a counter with one of them.
    const picked = [...symbols, "NZDUSD"];
    writeFileSync(
      join(researchDir, "4d-candidates.json"),
      JSON.stringify({
        analyzerVersion: "2026.08.09.test",
        markets: Object.fromEntries(picked.map((symbol) => [symbol, {
          accepted: [{
            pairedP: 0.01,
            selectExpectancyDelta: 0.3,
            selectExpiryShare: 0,
            selectFilled: DAYS,
            variant: "good",
            worstDayR: -0.5,
          }],
          measureOnly: false,
          starved: false,
        }])),
      }) + "\n",
    );
    writeFileSync(
      join(researchDir, "4d-feasibility.json"),
      JSON.stringify({
        feasibility: Object.fromEntries(picked.map((symbol) => [symbol, {
          good: { feasibleLines: ["standard"], medianRiskDistance: 1 },
        }])),
      }) + "\n",
    );

    // Every fixture here shares conditions, anchor and days, so they all
    // share ONE corpus identity — which is the round-44/45 point, and
    // means each run needs its own ledger to be a first read.
    return {
      corpus,
      ledgerDir: mkdtempSync(join(tmpdir(), "confirm4d-ledger-")),
      researchDir,
    };
  };

  const run = (symbols: readonly string[]): {
    artifact: Record<string, unknown>;
    ledgerDir: string;
    stdout: string;
  } => {
    const { corpus, ledgerDir, researchDir } = fixture(symbols);
    const stdout = execFileSync("npx", [
      "--no-install",
      "tsx",
      "scripts/confirm-4d.ts",
      corpus,
      "--research-dir",
      researchDir,
      "--confirm-log-dir",
      ledgerDir,
      "--targets",
      symbols.join(","),
      "--permutations",
      "200",
    ], { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 });
    return {
      artifact: JSON.parse(
        readFileSync(join(researchDir, "4d-confirm-read.json"), "utf8"),
      ) as Record<string, unknown>,
      ledgerDir,
      stdout,
    };
  };

  it("gives each unconfirmed pick its own cause, and burns exactly one read", () => {
    const { artifact, ledgerDir, stdout } = run(MARKETS);
    const report = artifact.confirmReport as Record<
      string,
      { confirmTotalDelta: number | null; gateDisposition: string }
    >;

    assert.equal(report.EURUSD.gateDisposition, "confirmed");
    assert.ok((report.EURUSD.confirmTotalDelta ?? 0) > 0);
    assert.equal(report.GBPUSD.gateDisposition, "refused-by-gate");
    assert.equal(report.USDJPY.gateDisposition, "gate-could-not-judge");
    assert.equal(report.AUDUSD.gateDisposition, "thin");
    assert.equal(report.USDCHF.gateDisposition, "accepted-but-unevidenced");
    assert.equal(report.NZDUSD.gateDisposition, "missing-verdict");
    for (const symbol of ["GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "NZDUSD"]) {
      assert.equal(report[symbol].confirmTotalDelta, null);
    }

    // The five causes are five counters. Before round 45 the middle
    // three were one number called "notAccepted", read as "the gate
    // measured these and they lost" — three different remedies (the
    // corpus's depth, the pairing, the calibration) reported as one.
    assert.equal(artifact.confirmedPositive, 1);
    assert.equal(artifact.confirmedNegative, 0);
    assert.equal(artifact.refusedByGate, 1);
    assert.equal(artifact.gateCouldNotJudge, 1);
    assert.equal(artifact.thin, 1);
    assert.equal(artifact.unevidenced, 1);
    assert.equal(artifact.missingVerdict, 1);
    assert.equal(artifact.unreadable, 5);

    // Each null delta also carries the gate's own words for why, so the
    // artifact and the gate's printed table cannot disagree.
    const reasons = artifact.confirmReport as Record<
      string,
      { gateReason: string | null }
    >;
    assert.match(reasons.AUDUSD.gateReason!, /^THIN \(10 filled\)/);
    assert.match(reasons.USDJPY.gateReason!, /NO VERDICT — pairing 3 nonzero/);
    assert.equal(reasons.NZDUSD.gateReason, null);

    // Something was confirmed, so the fold WAS read: readAt is a real
    // instant, no cause rides beside it, and the ledger holds the one
    // entry that read is now permanently recorded as.
    assert.equal(artifact.confirmRead, true);
    assert.equal(artifact.notReadReason, null);
    assert.ok(typeof artifact.readAt === "string");
    assert.equal(readdirSync(ledgerDir).length, 1);
    assert.match(stdout, /confirm read: 1 picks positive, 0 negative/);
    assert.match(stdout, /1 the gate could not judge, 1 thin/);
  });

  it("burns nothing and names the cause when every pick is accepted but unevidenced", () => {
    const { artifact, ledgerDir, stdout } = run(["USDCHF"]);
    assert.equal(artifact.confirmRead, false);
    assert.equal(artifact.readAt, null);
    assert.equal(artifact.unevidenced, 1);
    assert.match(
      artifact.notReadReason as string,
      /carried no filled outcomes on both sides of the confirm fold/,
    );
    assert.deepEqual(readdirSync(ledgerDir), []);
    assert.match(stdout, /confirm NOT READ \(nothing burned\)/);
  });

  it("burns nothing and names the other cause when no pick cleared the gate", () => {
    const { artifact, ledgerDir } = run(["GBPUSD"]);
    assert.equal(artifact.confirmRead, false);
    assert.equal(artifact.readAt, null);
    assert.equal(artifact.refusedByGate, 1);
    assert.equal(artifact.unevidenced, 0);
    assert.match(
      artifact.notReadReason as string,
      /1 refused by the 4c gate/,
    );
    assert.deepEqual(readdirSync(ledgerDir), []);
  });

  // The reason line splits with the counters, or it reproduces the same
  // defect one field over: thin and noVerdict verdicts both carry
  // accepted === false, so a corpus of nothing but those had read "no
  // pick's variant was accepted" — true, and pointing at the
  // calibration when the remedy is the corpus's depth or the pairing.
  it("names thin and unjudgeable picks apart in the reason, never as a lost gate", () => {
    const { artifact } = run(["AUDUSD", "USDJPY"]);
    assert.equal(artifact.confirmRead, false);
    assert.equal(artifact.thin, 1);
    assert.equal(artifact.gateCouldNotJudge, 1);
    assert.equal(artifact.refusedByGate, 0);
    const reason = artifact.notReadReason as string;
    assert.match(reason, /1 thin — under the market grain's filled floor/);
    assert.match(reason, /1 the gate could not judge/);
    assert.doesNotMatch(reason, /refused by the 4c gate/);
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
