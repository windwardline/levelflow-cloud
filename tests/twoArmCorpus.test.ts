import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import { GROSS_COST_SCALE } from "../supabase/functions/trade-analyzer/executionQuality.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * Item 5: one sweep, two cost arms, zero extra bandwidth.
 *
 * Amendment 36's re-decision needs a gross reading and a net one. The cost
 * scale is a per-process environment read, so `--grid` cannot produce two arms
 * in one run — and the sequence budgets ONE re-sweep against an exhausted FMP
 * allowance. Every emitted row now carries `grossRealizedR` and `grossOutcome`
 * beside its net figures: the same decision re-resolved charging E8's
 * published commission and none of our modelled spread or slippage.
 *
 * THE PAIRING IS THE DESIGN, not the saving. Running the whole sweep at a
 * second scale would also move the payoff GATE, so the two arms would carry
 * different accepted populations and the comparison would confound the cost
 * question with a selection effect — systematically, because a looser gate
 * admits MARGINAL setups, which drags the gross arm down and biases toward
 * keeping a decline. Here the decision set is identical by construction.
 */

/** Every state `evaluateSetupOutcome` can return once it has resolved. */
const RESOLVED_OUTCOMES = new Set([
  "ambiguous",
  "expired_at_loss",
  "expired_in_profit",
  "stop_loss",
  "take_profit",
  "tp1_partial",
  "unfilled",
]);

const startTime = Date.parse("2026-06-15T00:00:00.000Z");

function triangleBars(count: number, period = 20, amplitude = 4): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    const half = period / 2;
    const value = position < half
      ? 98 + (amplitude / half) * position
      : 98 + amplitude - (amplitude / half) * (position - half);
    return {
      close: value,
      high: value + 0.3,
      low: value - 0.3,
      open: value,
      time: startTime + index * 900_000,
      volume: 1_000,
    };
  });
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

const result = simulateSymbol({
  calibrationOverride: {
    blockedRegimes: [],
    runnerWindowShare: 1,
    tp1RiskShare: 0.8,
  },
  dailyBars: dailyBars(80),
  primaryBars: triangleBars(600),
  stepBars: 16,
  symbol: "EURUSD",
  warmupBars: 120,
});
const filled = result.outcomes.filter((row) => row.outcome !== "unfilled");

describe("both arms ride every row", () => {
  it("the fixture produces rows, or everything below is vacuous", () => {
    assert.ok(filled.length >= 10, `only ${filled.length} filled rows`);
  });

  it("carries a gross twin on EVERY emitted row, filled or not", () => {
    // Not only on filled rows: an unfilled decision has a gross outcome too,
    // and it is the one most likely to DIFFER — a smaller half-spread changes
    // where the limit fills.
    for (const row of result.outcomes) {
      assert.equal(typeof row.grossRealizedR, "number");
      assert.ok(Number.isFinite(row.grossRealizedR));
      // Named against the resolver's own vocabulary rather than checked for
      // non-emptiness, which the type already guarantees and which therefore
      // asserts nothing.
      assert.ok(
        RESOLVED_OUTCOMES.has(row.grossOutcome),
        `grossOutcome "${row.grossOutcome}" is not a resolved outcome`,
      );
    }
  });

  it("prices the same decisions — the pairing, asserted not assumed", () => {
    // If the two arms ever carried different populations this would be two
    // corpora wearing one file's name, and the comparison would confound cost
    // with selection. One row per decision, both arms on it.
    const times = result.outcomes.map((row) => row.time);
    assert.equal(new Set(times).size, times.length, "a decision emitted twice");
  });
});

describe("the gross arm actually charges less", () => {
  it("earns MORE in aggregate than the net arm", () => {
    // Direction is the claim. Removing our modelled spread and slippage from
    // the resolver must make the same trades pay more; if it only moved
    // admission, totals could drift either way — which is the defect M5 fixed
    // one layer up.
    const net = filled.reduce((sum, row) => sum + row.realizedR, 0);
    const gross = filled.reduce((sum, row) => sum + row.grossRealizedR, 0);
    assert.ok(
      gross > net,
      `gross ${gross.toFixed(4)}R must exceed net ${net.toFixed(4)}R — if ` +
        `these are equal the second arm is not being charged differently`,
    );
  });

  it("differs on individual rows, not merely in the sum", () => {
    const moved = filled.filter((row) => row.grossRealizedR !== row.realizedR);
    assert.ok(
      moved.length > 0,
      "no row's realized R moved between the arms, so the corpus carries a " +
        "duplicate column rather than a measurement",
    );
  });

  it("charges the commission on BOTH arms", () => {
    // Amendment 36's standard is about parameters of OUR making. The
    // commission is E8's published number, so it survives every scale — which
    // means the two figures subtract to exactly our modelled cost, and a gross
    // arm is never a no-cost arm.
    const scale = GROSS_COST_SCALE;
    assert.equal(scale, 0, "the gross arm must charge the published bill alone");
    const source = readFileSync(
      "supabase/functions/trade-analyzer/sweep.ts",
      "utf8",
    );
    const at = source.indexOf("grossRealizedR: realizedRFromLegs({");
    assert.ok(at > 0, "the gross figure moved — re-anchor this assertion");
    assert.match(
      source.slice(at, at + 320),
      /perLegCost: plan\.executionQuality\.estimatedCommission \/ 2/,
      "the gross arm stopped charging the venue's published commission, which " +
        "makes it a no-cost arm rather than amendment 36's arm",
    );
  });
});

describe("the corpus states what its second arm charged", () => {
  it("records the gross scale in the manifest", () => {
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(driver, /grossCostScale: GROSS_COST_SCALE,/);
  });

  it("makes two gross scales two measurements", () => {
    // The net rows of two such corpora are IDENTICAL, so nothing else in the
    // identity would tell them apart — and pooling them would report one
    // market's sensitivity from two different questions.
    const gate = readFileSync("scripts/grid-totalr.ts", "utf8");
    // Anchored to its SIBLING rather than to a byte offset from the function
    // head: the first draft sliced 2,600 characters from `conditionsOf` and
    // the term sat at 2,850, so the assertion failed on the window rather
    // than on the claim. `modeledCostScale` is the term this one belongs
    // beside, and if that moves they move together.
    const at = gate.indexOf("modeledCostScale: candidate.modeledCostScale");
    assert.ok(at > 0, "conditionsOf's cost terms moved — re-anchor this");
    assert.match(
      gate.slice(at, at + 600),
      /grossCostScale: candidate\.grossCostScale \?\? null,/,
      "two corpora whose gross arms charged differently would pool",
    );
  });

  it("refuses to grade a decision on one arm and guess the other", () => {
    // Both arms resolve or the decision is rejected. A row graded on one and
    // fabricated on the other is not a paired comparison, and the pairing is
    // the whole point.
    const source = readFileSync(
      "supabase/functions/trade-analyzer/sweep.ts",
      "utf8",
    );
    assert.match(
      source,
      /if \(evaluation\.state !== "resolved" \|\| grossEvaluation\.state !== "resolved"\)/,
    );
  });
});

describe("one corpus answers the question two sweeps used to", () => {
  const SRC = readFileSync("scripts/cost-sensitivity-verdict.ts", "utf8");

  it("reads both arms from a single corpus", () => {
    assert.match(SRC, /const pairedPaths = \(str\("--paired"\) \?\? ""\)/);
    assert.match(
      SRC,
      /pairedPaths\.length > 0 \? "grossRealizedR" : "realizedR",/,
      "the paired mode reads the same column twice, so both arms would be " +
        "identical and every market would come back INERT",
    );
  });

  it("keeps the two-corpus path for artifacts that cannot be re-derived", () => {
    // The 4c/4d emits are gone from the working tree and their corpus is the
    // one the clock defect invalidated, so those artifacts can never be
    // regenerated in paired form. Removing the old flags would strand them.
    assert.match(SRC, /str\("--net"\)/);
    assert.match(SRC, /str\("--gross"\)/);
  });

  it("names the paired option when it refuses a missing arm", () => {
    // A door that names only the retired flags teaches the wrong invocation.
    assert.match(SRC, /Pass --paired shard-a\.jsonl/);
  });
});
