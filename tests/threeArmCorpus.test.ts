import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * The arming-bound arm (2026-09-14): the net arm's decision at the net arm's
 * cost, resolved a third time with FR-3's same-bar arming OFF, so the
 * runner's protection exists from the bar AFTER the partial banks.
 *
 * The open-scope round found 89–97 % of the lock's value over hold sitting on
 * runners that exited at exactly the lock level inside the TP1 touch bar, and
 * only one of four forex in-span cells clearing zero once those rows were
 * priced without that credit (docs/research/open-scope-round-2026-09-13.md
 * §3). This column is the other end of that interval on identical fills.
 *
 * Its invariants are exact, not statistical: the third arm differs from the
 * net arm ONLY on rows whose TP1 bar closed back through the armed level —
 * there the net arm printed the exit inside the touch bar and the bound arm
 * kept resolving — and is identical everywhere else, legs and all.
 */

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

/**
 * An uptrend with a five-bar pattern the committee buys into: a dip that fills
 * the resting limit (phase 2), then a wick-back bar whose high reaches TP1
 * while its close sits below it (phase 3) — exactly the bar FR-3 fires on.
 * The two-arm test's triangle never banks TP1 (every fill is stopped on the
 * falling leg), so it cannot exercise this arm.
 */
function patternBars(count: number, period = 5): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const base = 98 + 0.12 * index;
    const phase = index % period;
    let close = base;
    let high = base + 0.15;
    let low = base - 0.15;
    if (phase === 2) low = base - 0.7;
    if (phase === 3) {
      close = base - 0.4;
      high = base + 0.6;
      low = close - 0.15;
    }
    return {
      close,
      high: Math.max(high, close),
      low: Math.min(low, close),
      open: base,
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
  primaryBars: patternBars(600),
  stepBars: 16,
  symbol: "EURUSD",
  warmupBars: 120,
});
const filled = result.outcomes.filter((row) => row.outcome !== "unfilled");

/** A net-arm row whose exit printed inside the bar that banked TP1 (FR-3). */
function sameBarExit(row: (typeof result.outcomes)[number]): boolean {
  const tp1 = row.legs.find((leg) => leg.leg === "tp1");
  const exit = row.legs.find((leg) => leg.leg === "exit");
  return tp1 !== undefined && exit !== undefined && tp1.time === exit.time &&
    (exit.kind === "tp1_lock" || exit.kind === "breakeven_stop");
}

describe("the arming-bound arm rides every row", () => {
  it("the fixture produces rows, or everything below is vacuous", () => {
    assert.ok(filled.length >= 10, `only ${filled.length} filled rows`);
  });

  it("carries the bound twin on EVERY emitted row, filled or not", () => {
    for (const row of result.outcomes) {
      assert.equal(typeof row.armingBoundRealizedR, "number");
      assert.ok(Number.isFinite(row.armingBoundRealizedR));
      assert.ok(
        RESOLVED_OUTCOMES.has(row.armingBoundOutcome),
        `armingBoundOutcome "${row.armingBoundOutcome}" is not a resolved outcome`,
      );
      assert.ok(Number.isFinite(row.armingBoundExitAtMs), "the bound arm's exit time is a number");
    }
  });
});

describe("the arming-bound arm differs from the net arm exactly where FR-3 fired", () => {
  const sameBar = filled.filter(sameBarExit);
  const others = filled.filter((row) => !sameBarExit(row));

  it("the fixture has both kinds of row, or the invariants below prove nothing", () => {
    assert.ok(sameBar.length > 0, "no row banked TP1 and exited at the lock inside the same bar");
    assert.ok(others.length > 0, "every row exited inside its TP1 bar");
  });

  it("is identical to the net arm on every row without a same-bar exit", () => {
    for (const row of others) {
      assert.equal(row.armingBoundRealizedR, row.realizedR, `${row.time}: R moved with no same-bar exit`);
      assert.equal(row.armingBoundOutcome, row.outcome, `${row.time}: outcome moved with no same-bar exit`);
      assert.equal(row.armingBoundExitAtMs, row.exitAtMs, `${row.time}: exit time moved with no same-bar exit`);
      assert.equal(
        row.armingBoundExitPrice,
        row.legs.find((leg) => leg.leg === "exit")?.price ?? null,
        `${row.time}: exit price moved with no same-bar exit`,
      );
    }
  });

  it("keeps resolving past the touch bar on every same-bar row — a strictly later exit", () => {
    for (const row of sameBar) {
      assert.ok(
        row.armingBoundExitAtMs > row.exitAtMs,
        `${row.time}: the bound arm exited at ${row.armingBoundExitAtMs}, not after the touch bar ${row.exitAtMs}`,
      );
    }
  });

  it("moves money on at least one same-bar row, so the column is a measurement and not a duplicate", () => {
    const moved = sameBar.filter((row) => row.armingBoundRealizedR !== row.realizedR);
    assert.ok(moved.length > 0, "every same-bar row re-priced to exactly the lock's R");
  });
});

describe("the driver resolves the third arm with the switch off — pinned at the source", () => {
  it("resolves at the net cost scale with sameBarProtectionArming false, and emits from that evaluation", () => {
    const source = readFileSync("supabase/functions/trade-analyzer/sweep.ts", "utf8");
    assert.match(source, /const armingBoundEvaluation = resolveAtScale\(modeledCostScale, false\);/);
    assert.match(source, /armingBoundRealizedR: realizedRFromLegs\(\{\n\s*legs: armingBoundEvaluation\.legs,/);
    assert.match(source, /armingBoundOutcome: armingBoundEvaluation\.outcome,/);
    // All arms or none: a decision graded on two arms and guessed on the third
    // is not a paired comparison.
    assert.match(source, /if \(armingBoundEvaluation\.state !== "resolved"\) \{\n\s*reject\("unresolvable", latest\.time\);/);
  });
});
