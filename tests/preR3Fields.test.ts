import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildLadderTargets } from "../supabase/functions/trade-analyzer/pricePlan.ts";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * The two columns R2b's owner questions need, and they need them BEFORE R3.
 *
 * R3 is the one re-sweep the remediation program budgets against an exhausted
 * FMP allowance. A column missing from the emit is a question nobody can answer
 * until a sweep that does not exist.
 *
 * Q1 — the banked fraction. Realized R at any allocation is exact arithmetic on
 * the NET arm's `legs`, which the emit already carries, so that half needs no
 * new column at all. The GROSS arm's legs were computed and thrown away, so the
 * same question under E8's published bill was unanswerable.
 *
 * Q3 — TP1's band. Every structural distance the corpus carried was floored at
 * `minimumRunnerDistance`, and TP1 sits strictly nearer than that floor on all
 * 98 markets, so nothing described the band the partial is parked in.
 */

const startTime = Date.parse("2026-06-15T00:00:00.000Z");

/**
 * An asymmetric sawtooth: a slow decline that fills a buy limit, then a rally.
 *
 * Two regimes concatenated, because ONE shape produces one outcome. The
 * symmetric triangle the other sweep fixtures use resolves every row to
 * `stop_loss`, which would make both claims below vacuous — a rebuild test with
 * no banked partial to rebuild, and a distance comparison with nothing to
 * compare. The steep leg (12 down, 4 up) banks partials; the shallow one
 * (24 down, 8 up) stops out.
 */
function sawtooth(count: number, fall: number, rise: number): number[] {
  const period = fall + rise;
  const low = 96;
  const high = 104;
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    return position < fall
      ? high - ((high - low) / fall) * position
      : low + ((high - low) / rise) * (position - fall);
  });
}

function toBars(values: readonly number[]): Bar[] {
  return values.map((value, index) => ({
    close: value,
    high: value + 0.15,
    low: value - 0.15,
    open: value,
    time: startTime + index * 900_000,
    volume: 1_000,
  }));
}

function dailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
    high: 103.2,
    low: 96.8,
    open: 100,
    time: startTime - count * 86_400_000 + index * 86_400_000,
    volume: 10_000,
  }));
}

const rows = simulateSymbol({
  calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
  dailyBars: dailyBars(80),
  primaryBars: toBars([...sawtooth(450, 12, 4), ...sawtooth(450, 24, 8)]),
  stepBars: 8,
  symbol: "EURUSD",
  warmupBars: 120,
}).outcomes;

describe("the nearest structure is recorded UNFLOORED", () => {
  it("the fixture resolves more than one way, or the claims are vacuous", () => {
    const outcomes = new Set(rows.map((row) => row.outcome));
    assert.ok(rows.length >= 20, `only ${rows.length} rows`);
    assert.ok(
      outcomes.has("tp1_partial") && outcomes.has("stop_loss"),
      `one regime only: ${[...outcomes].join(", ")}`,
    );
  });

  it("sees structure where the floored field reports NOTHING", () => {
    // THE WHOLE POINT. `runnerNearestBeyondMinimum` reports null when the
    // nearest level sits inside `minimumRunnerDistance` — which is where TP1
    // lives on every one of the 98 markets. Those rows carried no structural
    // reading at all, so the corpus could not say whether the partial was
    // parked against a level or in open space.
    const blind = rows.filter((row) =>
      row.nearestStructureDistance !== null &&
      row.runnerNearestBeyondMinimum === null
    );
    assert.ok(
      blind.length > 0,
      "the floor was never binding on this fixture, so the new column is " +
        "indistinguishable from the old one here and proves nothing",
    );
  });

  it("never exceeds the floored field where both report", () => {
    // A floored search cannot find a NEARER level than an unfloored one over
    // the same pivots. If it ever did, the two are not the same search.
    const both = rows.filter((row) =>
      row.nearestStructureDistance !== null &&
      row.runnerNearestBeyondMinimum !== null
    );
    assert.ok(both.length > 0, "no row carried both distances");
    for (const row of both) {
      assert.ok(
        row.nearestStructureDistance! <= row.runnerNearestBeyondMinimum!,
        `unfloored ${row.nearestStructureDistance} exceeds floored ` +
          `${row.runnerNearestBeyondMinimum}`,
      );
    }
  });

  it("is a DISTANCE, comparable across markets without a price", () => {
    for (const row of rows) {
      if (row.nearestStructureDistance === null) continue;
      assert.ok(
        row.nearestStructureDistance >= 0,
        "a distance went negative, so it is a level rather than a distance",
      );
    }
  });

  it("is the only field that CAN reach TP1's band, on every market", () => {
    // The premise both comments state, derived over the roster rather than
    // asserted from it — and pinned here so a calibration edit that retires
    // it fails a test instead of rotting a comment.
    //
    // `runnerNearestBeyondMinimum` cannot report a level nearer than
    // `minimumTargetRewardRisk` x risk. TP1 from the risk share is
    // `tp1RiskShare` x risk. Where the ratio is at least 2, TP1 sits at most
    // half the nearest distance that field can carry.
    //
    // COVERS THE RISK-SHARE BRANCH ONLY, deliberately. The ATR floor is a
    // multiple of ATR, not of risk, so no ratio of calibration cells bounds
    // it — which is why the distance is recorded rather than reasoned about.
    assert.ok(defaultScanSymbols.length > 50, "the roster came back empty");
    let worst = Infinity;
    let worstAt = "";
    for (const symbol of defaultScanSymbols) {
      const cell = getCategoryCalibration(symbol);
      const ratio = cell.minimumTargetRewardRisk / cell.tp1RiskShare;
      if (ratio < worst) {
        worst = ratio;
        worstAt = symbol;
      }
    }
    assert.ok(
      worst >= 2,
      `${worstAt} places TP1 at ${worst.toFixed(2)}x the recorded floor, so ` +
        "the comments' claim no longer holds on the whole roster",
    );
  });

  it("reaches inside TP1's band, which the floored field cannot", () => {
    // Deterministic rather than sampled: the floor is
    // `minimumTargetRewardRisk` times risk and TP1 is at most 0.8 of risk, so
    // the floored field can never report a level inside TP1's band on ANY
    // market. One ladder with a level at 0.5 risk shows both readings at once.
    const calibration = getCategoryCalibration("EURUSD");
    const ladder = buildLadderTargets({
      atr: 1,
      calibration: { ...calibration, runnerWindowShare: 1, tp1RiskShare: 0.8 },
      dailyAtr: 4,
      entryPrice: 100,
      pivotLevels: [100.5, 106],
      riskDistance: 1,
      side: "buy",
    });
    assert.ok(ladder, "the fixture produced no ladder");
    assert.equal(
      ladder!.nearestStructureDistance,
      0.5,
      "the unfloored search did not see the level inside TP1's band",
    );
    assert.ok(
      (ladder!.runnerNearestBeyondMinimum ?? 0) > 1,
      "the floored field saw it too, so the fixture proves nothing",
    );
  });
});

describe("the gross arm's R can be re-apportioned", () => {
  const filled = rows.filter((row) => row.outcome !== "unfilled");

  it("carries its own entry and exit prints on every filled row", () => {
    assert.ok(filled.length >= 20, `only ${filled.length} filled rows`);
    for (const row of filled) {
      assert.equal(typeof row.grossEntryPrice, "number");
      assert.equal(typeof row.grossExitPrice, "number");
    }
  });

  it("prints its OWN fills, not the net arm's", () => {
    // If the gross legs were copies, the columns would be storage rather than
    // information: the half-spread differs between the arms, so the limit fills
    // somewhere else.
    const entries = new Map(
      filled.map((row) => [row.entryPrice, row.grossEntryPrice]),
    );
    assert.ok(
      [...entries].some(([net, gross]) => net !== gross),
      "every gross fill equals the net fill, so the arms are not being " +
        "priced differently and the whole two-arm corpus is one arm twice",
    );
  });

  it("rebuilds grossRealizedR from the prints, which is the whole claim", () => {
    // If the emitted prints cannot reproduce the emitted R at the shipped
    // fraction, they cannot be trusted to produce it at any other fraction
    // either — and re-apportioning is the only reason they are kept.
    const banked = filled.filter((row) => row.grossTp1Price !== null);
    assert.ok(banked.length > 0, "no gross row banked a partial");
    for (const row of filled) {
      const sign = row.side === "buy" ? 1 : -1;
      const risk = row.riskDistance;
      // `realizedRFromLegs`: half banked at tp1 and half at the exit when a
      // partial filled, otherwise the full position rides to one exit.
      const fraction = row.grossTp1Price === null ? 1 : 0.5;
      const bankedR = row.grossTp1Price === null
        ? 0
        : 0.5 * sign * (row.grossTp1Price - row.grossEntryPrice!) / risk;
      const exitR = fraction * sign *
        (row.grossExitPrice! - row.grossEntryPrice!) / risk;
      // perLegCost is `estimatedCommission / 2` at both call sites, so the
      // round trip is the commission itself.
      const rebuilt = Number(
        (bankedR + exitR - row.estimatedCommission / risk).toFixed(4),
      );
      assert.ok(
        Math.abs(rebuilt - row.grossRealizedR) < 1e-4,
        `${row.outcome}: rebuilt ${rebuilt} against emitted ` +
          `${row.grossRealizedR}`,
      );
    }
  });

  it("leaves the NET arm alone, because its legs are already emitted", () => {
    // Stated here so nobody adds the same three columns for the net arm later:
    // `legs` already carries entry, tp1 and exit prints, so net R(f) is exact
    // without them.
    const source = readFileSync(
      "supabase/functions/trade-analyzer/sweep.ts",
      "utf8",
    );
    assert.match(source, /^\s{2}legs: ResolutionLeg\[\];/m);
    assert.doesNotMatch(
      source,
      /netEntryPrice|netExitPrice|netTp1Price/,
      "the net arm grew leg columns it does not need — `legs` already has them",
    );
  });
});
