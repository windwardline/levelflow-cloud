import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { resolveOscillatorBias } from "../supabase/functions/trade-analyzer/strategies.ts";

/**
 * AXES-9. `voteMomentumDivergence` read its two oscillators through an OR chain
 * whose BUY arm was evaluated first and satisfied by EITHER indicator, so every
 * state where RSI and MACD disagreed resolved to buy. Derived from the source
 * expression rather than reasoned about: of sixteen enumerated (rsi, macdSlope)
 * states, six voted sell and two were conflicts — and BOTH conflicts voted buy.
 * No conflict state produced sell or neutral.
 *
 * The sharpest instance is RSI 70 with a falling MACD — an overbought
 * oscillator against fading momentum, which is the textbook BEARISH divergence
 * — voting BUY out of a function named momentum_divergence.
 *
 * Worse than the direction: conflict never reached the neutral branch, so
 * contradictory evidence emitted a directional vote at score 18-24 and
 * confidence 0.62-0.72 rather than the abstention's 5 and 0.2. The committee
 * was most confident precisely where its evidence contradicted itself.
 */

type Cell = "buy" | "sell" | "neutral";

const RSI: { label: string; value: number | null }[] = [
  { label: "oversold(30)", value: 30 },
  { label: "mid(50)", value: 50 },
  { label: "overbought(70)", value: 70 },
  { label: "absent", value: null },
];

const MACD: { label: string; value: number | null }[] = [
  { label: "falling", value: -0.5 },
  { label: "flat", value: 0 },
  { label: "rising", value: 0.5 },
  { label: "absent", value: null },
];

/**
 * The full table, stated once. Rows are RSI, columns MACD, in the orders above.
 * The two cells that read "neutral" where the old chain read "buy" are the
 * conflicts, and they are the entire behavioural change.
 */
const TABLE: Cell[][] = [
  /* oversold   */ ["sell", "sell", "neutral", "sell"],
  /* mid        */ ["sell", "neutral", "buy", "neutral"],
  /* overbought */ ["neutral", "buy", "buy", "buy"],
  /* absent     */ ["sell", "neutral", "buy", "neutral"],
];

describe("oscillator bias resolution (AXES-9)", () => {
  it("matches the enumerated table in every one of the sixteen states", () => {
    let checked = 0;
    for (let r = 0; r < RSI.length; r++) {
      for (let m = 0; m < MACD.length; m++) {
        assert.equal(
          resolveOscillatorBias(RSI[r].value, MACD[m].value),
          TABLE[r][m],
          `rsi=${RSI[r].label} macd=${MACD[m].label}`,
        );
        checked++;
      }
    }
    // NON-VACUITY: a table that shrank to nothing would pass a loop that never
    // ran. Sixteen is the product of the two axes, stated so a dropped row
    // fails here rather than silently narrowing the coverage.
    assert.equal(checked, 16, "the enumeration did not cover all sixteen states");
  });

  it("abstains when the two oscillators contradict each other", () => {
    // THE DEFECT, stated as its own case so it cannot be lost in a table edit.
    // Both of these read "buy" before the fix.
    assert.equal(
      resolveOscillatorBias(70, -0.5),
      "neutral",
      "overbought RSI against a falling MACD is a bearish divergence, not a buy",
    );
    assert.equal(
      resolveOscillatorBias(30, 0.5),
      "neutral",
      "oversold RSI against a rising MACD is contradictory, not a buy",
    );
  });

  it("still follows a single oscillator when the other abstains", () => {
    // The fix must not turn abstention into paralysis: one usable indicator is
    // still a signal, and a resolver that required both would silently mute the
    // vote on every frozen or short series.
    assert.equal(resolveOscillatorBias(70, null), "buy");
    assert.equal(resolveOscillatorBias(30, null), "sell");
    assert.equal(resolveOscillatorBias(null, 0.5), "buy");
    assert.equal(resolveOscillatorBias(null, -0.5), "sell");
    assert.equal(resolveOscillatorBias(50, null), "neutral");
    assert.equal(resolveOscillatorBias(null, null), "neutral");
  });

  it("is not directionally biased across the table", () => {
    // The old chain's tell was countable: buy outnumbered sell because both
    // conflicts fell to buy. Deriving the counts rather than asserting a
    // remembered pair means a future edit that reintroduces a lean fails here.
    const flat = TABLE.flat();
    const buys = flat.filter((c) => c === "buy").length;
    const sells = flat.filter((c) => c === "sell").length;
    assert.equal(
      buys,
      sells,
      `the table leans: ${buys} buy vs ${sells} sell. The OR-chain bug was ` +
        `exactly this shape — conflicts resolving one way.`,
    );
  });

  it("is the resolver production actually uses", () => {
    // THE ANCHOR. Every assertion above tests a pure function; none of them
    // prove voteMomentumDivergence calls it. Without this, the resolver could
    // be corrected while the vote kept its own inline OR chain, and the whole
    // file would pass over a live bug — which is the shadow-test failure this
    // repo has spent the week removing.
    const source = readFileSync(
      join(
        new URL("..", import.meta.url).pathname,
        "supabase/functions/trade-analyzer/strategies.ts",
      ),
      "utf8",
    );
    const vote = source.slice(source.indexOf("function voteMomentumDivergence"));
    const body = vote.slice(0, vote.indexOf("\n}\n"));
    assert.match(
      body,
      /const oscillatorBias = resolveOscillatorBias\(rsi, macdSlope\);/,
      "voteMomentumDivergence no longer delegates to the tested resolver",
    );
    assert.doesNotMatch(
      body,
      /rsi > 55|macdSlope > 0/,
      "voteMomentumDivergence has an inline oscillator comparison again — the " +
        "OR chain is back and this file is testing a function nothing calls",
    );
  });
});
