import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { estimateExecutionQuality } from "../supabase/functions/trade-analyzer/executionQuality.ts";

/**
 * The execution penalty, attributed to what actually caused it.
 *
 * TWO ADDERS HAD NO COVERAGE AT ALL. Measured by deleting each and running the
 * whole suite on 2026-08-27: removing the provider-warning adder passed
 * 2793/2793, and removing the chart-interval adder passed 2793/2793. Their
 * counterparts in scoring.ts are both pinned, so exactly the executionQuality
 * half of each fact was unguarded — the shape where a population gets fixed one
 * member at a time and the other half is never enumerated.
 *
 * The only pre-existing fixture carrying providerWarnings sat above its
 * profile's cap, where the adder contributes nothing, so it could not have
 * caught the deletion either. Everything below is deliberately UNCLAMPED.
 *
 * WHAT THE SPLIT IS FOR. `confidencePenalty` is charged once and unchanged;
 * the parts say where it came from. It had to be split because the operator was
 * told the whole number was a cost — index.ts printed "Estimated trading costs
 * reduced the setup score by N" — and `label`, the Clean/Acceptable/Thin/Poor
 * word whose gloss says trading costs are eating the payoff, derives from
 * `100 - confidencePenalty * 8`. A failed 5-minute chart fetch could move that
 * label and be read as a spread problem. Costs and coverage carry different
 * instructions: size down or wait for pricing, versus the market cannot be seen
 * well enough yet.
 */

/** A forex setup priced so the cap does not bind and each adder is visible. */
function quality(overrides: Record<string, unknown> = {}) {
  return estimateExecutionQuality({
    assetType: "forex",
    atr: 0.0012,
    availableTimeframes: ["1day", "4hour", "1hour", "15min"],
    dailyAtr: 0.006,
    entryPrice: 1.156,
    latestClose: 1.158,
    providerWarnings: [],
    side: "buy",
    stopLoss: 1.153,
    symbol: "EURUSD",
    takeProfit: 1.164,
    ...overrides,
  } as never);
}

describe("the execution penalty says what caused it", () => {
  it("splits into parts that sum to the charge", () => {
    // The invariant that makes the split safe: attribution may never change
    // what the score is charged.
    for (
      const input of [
        {},
        { providerWarnings: ["5min: request failed"] },
        { availableTimeframes: ["1day", "1hour"] },
        { availableTimeframes: ["1day"], providerWarnings: ["a", "b", "c", "d"] },
      ]
    ) {
      const result = quality(input);
      assert.equal(
        result.costPenalty + result.coveragePenalty,
        result.confidencePenalty,
        `parts must sum to the total for ${JSON.stringify(input)}`,
      );
      assert.ok(result.costPenalty >= 0 && result.coveragePenalty >= 0);
    }
  });

  it("charges provider warnings, and charges them as COVERAGE not as cost", () => {
    // THE FIRST UNCOVERED ADDER. Deleting it passed the entire suite.
    const clean = quality();
    const warned = quality({ providerWarnings: ["5min: request failed"] });

    assert.ok(
      warned.confidencePenalty > clean.confidencePenalty,
      "a provider warning must cost the setup something, or the adder is dead",
    );
    assert.equal(
      warned.coveragePenalty - clean.coveragePenalty,
      1,
      "one warning is one point of coverage penalty",
    );
    assert.equal(
      warned.costPenalty,
      clean.costPenalty,
      "a failed chart fetch is not a trading cost and must not move the cost half",
    );
  });

  it("caps the provider adder at three however many warnings arrive", () => {
    const three = quality({ providerWarnings: ["a", "b", "c"] });
    const seven = quality({ providerWarnings: ["a", "b", "c", "d", "e", "f", "g"] });
    assert.equal(seven.coveragePenalty, three.coveragePenalty);
    assert.equal(three.coveragePenalty - quality().coveragePenalty, 3);
  });

  it("charges missing chart intervals, also as coverage", () => {
    // THE SECOND UNCOVERED ADDER. Deleting it passed the entire suite too.
    const full = quality();
    const thin = quality({ availableTimeframes: ["1day", "1hour"] });

    assert.equal(
      thin.coveragePenalty - full.coveragePenalty,
      2,
      "fewer than three intervals is two points of coverage penalty",
    );
    assert.equal(
      thin.costPenalty,
      full.costPenalty,
      "how many intervals the feed returned is not a spread",
    );
  });

  it("keeps the entry-inside-the-spread charge on the COST side", () => {
    // The one adder that genuinely is about execution price rather than about
    // seeing the market, pinned on the other side so the split cannot drift
    // into "everything that is not the round trip is coverage".
    const cushioned = quality();
    const inSpread = quality({ latestClose: 1.156 });
    assert.ok(
      inSpread.costPenalty > cushioned.costPenalty,
      "an entry sitting inside the spread is a cost fact",
    );
    assert.equal(inSpread.coveragePenalty, cushioned.coveragePenalty);
  });

  it("never reports coverage the score was not charged, when the cap binds", () => {
    // A clamped row used to be the case that hid the adders: above the cap the
    // extra points vanish, so a fixture there proves nothing. Here the split
    // must still sum to the CLAMPED total rather than to the raw one.
    const clamped = quality({
      availableTimeframes: ["1day"],
      // A stop this close makes cost-to-risk enormous, so the cap binds hard.
      providerWarnings: ["a", "b", "c"],
      stopLoss: 1.15599,
    });
    assert.equal(
      clamped.costPenalty + clamped.coveragePenalty,
      clamped.confidencePenalty,
    );
    assert.ok(
      clamped.coveragePenalty <= 5,
      "coverage cannot exceed what its own adders can produce",
    );
  });
});

describe("the analyzer names the cause it charged", () => {
  const source = readFileSync(
    join(
      new URL("..", import.meta.url).pathname,
      "supabase/functions/trade-analyzer/index.ts",
    ),
    "utf8",
  );

  it("prints costs and coverage as separate sentences", () => {
    // 1b's rule, which this branch had been violating: a distinct cause carries
    // its own sentence. The whole penalty was printed as "trading costs", so a
    // failed chart fetch reached the operator as a spread-and-slippage problem
    // — the wrong instruction, not merely an imprecise one.
    assert.match(
      source,
      /Estimated trading costs reduced the setup score by \$\{pricePlan\.executionQuality\.costPenalty\}/,
      "the costs sentence must quote the COST half, not the whole penalty",
    );
    assert.match(
      source,
      /Chart coverage gaps reduced the setup score by \$\{pricePlan\.executionQuality\.coveragePenalty\}/,
      "coverage must get its own sentence",
    );
    assert.doesNotMatch(
      source,
      /Estimated trading costs reduced the setup score by \$\{pricePlan\.executionQuality\.confidencePenalty\}/,
      "the whole penalty is being called a trading cost again",
    );
  });
});
