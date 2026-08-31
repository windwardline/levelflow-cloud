import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * R2b's field list, and its only entry.
 *
 * Fourteen `return null` paths in `buildPricePlan` reached the corpus as the
 * single word `planRejected`, and a refused decision emits NO outcome row — so
 * the rejection ledger's `{reason, time}` was the entire record of a decision
 * the engine declined, with one word for fourteen causes.
 *
 * The price is measured twice. Livestock's ladder refused 396 of the 416
 * decisions that reached its geometry. Indices refused 63%, and a 96-variant
 * grid across four axes moved survival 37% to 38% while the binding axis was
 * held fixed; correcting it took survival to 96% and out-of-sample R from
 * +7.4 to +19.2.
 *
 * Tested by RUNNING the engine into each refusal, not by matching source — a
 * stamp that compiles but is never reached names nothing.
 */

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

function ledgerReasons(override: Record<string, unknown>) {
  const result = simulateSymbol({
    calibrationOverride: { blockedRegimes: [], ...override },
    dailyBars: dailyBars(80),
    primaryBars: triangleBars(600),
    stepBars: 16,
    symbol: "EURUSD",
    warmupBars: 120,
    captureAll: true,
  });
  return {
    ledger: result.rejectionLedger,
    rejections: result.rejections,
    reasons: new Set(result.rejectionLedger.map((row) => row.reason)),
  };
}

describe("a geometry refusal names its own branch", () => {
  it("the window that cannot carry the payoff floor says so", () => {
    // The feasibility refusal: `minimumRunnerDistance > runnerLimit`. Squeezing
    // runnerWindowShare makes the window unable to carry the payoff floor on
    // every decision, which is livestock's measured shape.
    const { reasons, rejections } = ledgerReasons({
      runnerWindowShare: 0.01,
      tp1RiskShare: 0.8,
    });
    assert.ok(
      reasons.has("planRejected:window_cannot_carry_payoff"),
      `the ledger never named the feasibility refusal: ${[...reasons]}`,
    );
    assert.ok(
      rejections.planRejected > 0,
      "the aggregate counter must still move — every existing reader counts it",
    );
  });

  it("the aggregate counter is unchanged in name and meaning", () => {
    // The detail rides the LEDGER. A new counter key would be a breaking
    // change for every reader that enumerates the struct, and the driver
    // copies it whole.
    const { rejections } = ledgerReasons({ runnerWindowShare: 0.01 });
    assert.ok("planRejected" in rejections);
    for (const key of Object.keys(rejections)) {
      assert.ok(
        !key.includes(":"),
        `the counter struct grew a detailed key "${key}" — the detail belongs ` +
          `on the ledger, per decision, not on the struct, per run`,
      );
    }
  });

  it("every ledger entry that names a cause carries a KNOWN one", () => {
    const { ledger } = ledgerReasons({ runnerWindowShare: 0.01 });
    const named = ledger.filter((row) => row.reason.startsWith("planRejected:"));
    assert.ok(named.length > 0, "no geometry refusal was recorded at all");
    for (const row of named) {
      const cause = row.reason.slice("planRejected:".length);
      assert.notEqual(
        cause,
        "unnamed",
        "a geometry branch refused without stamping its cause — a `return " +
          "null` was added without a reason, which is the defect returning",
      );
    }
  });
});

describe("the out-channel reaches every branch it claims", () => {
  it("stamps a reason on EVERY refusal, across a spread of calibrations", () => {
    // The channel is only worth having if a refusal cannot happen without it.
    // Driven through the REAL decision path rather than a hand-built context:
    // a fixture that stubs MarketContext proves the stamp compiles, not that
    // the branch is reachable.
    const seen = new Set<string>();
    let refusals = 0;
    // The entry offset is swept too, and it is what makes this test mean
    // something: at an offset of ~0 the limit sits on the current print and
    // `entry_too_close` fires, which is a DIFFERENT branch from the
    // feasibility gate. Without it every refusal on this fixture is
    // `window_cannot_carry_payoff` and the assertion below passes vacuously.
    const grid: Array<Record<string, unknown>> = [];
    for (const share of [0.005, 0.05, 1, 8]) {
      for (const tp1 of [0.0005, 0.4, 4]) {
        grid.push({ runnerWindowShare: share, tp1RiskShare: tp1 });
      }
    }
    grid.push({ entryOffsetDefault: 0, entryOffsetTrend: 0 });
    grid.push({ entryOffsetDefault: 0.000001, entryOffsetTrend: 0.000001 });
    {
      for (const override of grid) {
        const { ledger } = ledgerReasons(override);
        for (const row of ledger) {
          if (!row.reason.startsWith("planRejected")) continue;
          refusals += 1;
          const cause = row.reason.slice("planRejected:".length);
          assert.ok(
            row.reason.includes(":") && cause !== "unnamed",
            `a refusal reached the ledger as "${row.reason}" under ` +
              `${JSON.stringify(override)}`,
          );
          seen.add(cause);
        }
      }
    }
    assert.ok(refusals >= 5, `only ${refusals} refusals — sweep wider`);
    assert.ok(
      seen.size >= 2,
      `every refusal gave the same cause (${[...seen]}), so the channel is ` +
        `not discriminating between branches`,
    );
  });
});
