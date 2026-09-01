import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { resolveOscillatorBias } from "../supabase/functions/trade-analyzer/strategies.ts";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { runStrategyCommittee } from "../supabase/functions/trade-analyzer/strategies.ts";
import {
  buildDecisionMarketContext,
  simulateSymbol,
} from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar, Regime } from "../supabase/functions/trade-analyzer/types.ts";
import { GRID_OVERRIDE_KEYS, parseGridSpec } from "../scripts/sweepGrid.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";

/**
 * AXES-9. `voteMomentumDivergence` read its two oscillators through an OR chain
 * whose BUY arm was evaluated first and satisfied by EITHER indicator, so every
 * state where RSI and MACD disagreed resolved to buy. Derived from the source
 * expression rather than reasoned about: of sixteen enumerated (rsi, macdSlope)
 * states, FIVE voted sell and two were conflicts — and both conflicts voted buy.
 * No conflict state produced sell or neutral.
 *
 * (The count was written as six and is five: buy 7, sell 5, neutral 4, derived
 * by running the retired expression over the sixteen states. The same commit's
 * own "7 buy to 5 sell" was right and this line disagreed with it.)
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
    // The claim is DELEGATION, not the argument list. Pinning
    // `(rsi, macdSlope)` exactly made the two look like one thing, and the
    // thresholds became grid-expressible on 2026-09-01 (AXES-9, pre-R3
    // register item 4), so the call now carries two more arguments and still
    // delegates. What must never come back is an inline comparison, which the
    // second assertion holds.
    assert.match(
      body,
      /const oscillatorBias = resolveOscillatorBias\(\s*rsi,\s*macdSlope,/,
      "voteMomentumDivergence no longer delegates to the tested resolver",
    );
    assert.doesNotMatch(
      body,
      /rsi > \d|rsi < \d|macdSlope > 0/,
      "voteMomentumDivergence has an inline oscillator comparison again — the " +
        "OR chain is back and this file is testing a function nothing calls",
    );
  });
});

describe("the RSI band is a grid axis — AXES-9", () => {
  /**
   * Pre-R3 register item 4's other half. `resolveOscillatorBias` compared
   * against the literals 55 and 45, so the momentum voter's own thresholds
   * could not be varied by the grid and R4's per-market program could not read
   * them out of R3's corpus.
   *
   * The band decides when the RSI leg votes AT ALL. Between the two levels it
   * abstains — and abstention is the whole point of the OR-chain fix above, so
   * moving the band is not cosmetic.
   */
  it("defaults to the literals it replaced", () => {
    // Every shipped cell leaves both undefined, so the sixteen-state table
    // above is still the shipped behaviour.
    assert.equal(resolveOscillatorBias(60, null), "buy");
    assert.equal(resolveOscillatorBias(60, null, undefined, undefined), "buy");
    assert.equal(resolveOscillatorBias(50, null), "neutral");
    assert.equal(resolveOscillatorBias(40, null), "sell");
  });

  it("a wider band abstains where the default votes", () => {
    // RSI 60 is a buy at the shipped 55 and an abstention at 65 — the axis
    // moving a vote INTO neutral, which is the direction that matters.
    assert.equal(resolveOscillatorBias(60, null), "buy");
    assert.equal(resolveOscillatorBias(60, null, 65, 35), "neutral");
    assert.equal(resolveOscillatorBias(40, null), "sell");
    assert.equal(resolveOscillatorBias(40, null, 65, 35), "neutral");
  });

  it("a narrower band votes where the default abstains", () => {
    assert.equal(resolveOscillatorBias(52, null), "neutral");
    assert.equal(resolveOscillatorBias(52, null, 51, 49), "buy");
    assert.equal(resolveOscillatorBias(48, null), "neutral");
    assert.equal(resolveOscillatorBias(48, null, 51, 49), "sell");
  });

  it("still refuses to break a contradiction, at any band", () => {
    // The property the OR-chain fix installed must survive the axis: RSI and
    // MACD disagreeing is neutral regardless of where the band sits.
    for (const [buy, sell] of [[55, 45], [65, 35], [51, 49]] as const) {
      assert.equal(resolveOscillatorBias(70, -0.5, buy, sell), "neutral");
      assert.equal(resolveOscillatorBias(30, 0.5, buy, sell), "neutral");
    }
  });

  it("no shipped cell sets either threshold", () => {
    const set = defaultScanSymbols.filter((symbol) => {
      const cell = getCategoryCalibration(symbol);
      return cell.rsiBuyThreshold !== undefined ||
        cell.rsiSellThreshold !== undefined;
    });
    assert.deepEqual(
      set,
      [],
      `${set.join(", ")} now ship an RSI band — that is a behaviour-changing ` +
        "analyzer PR and must bump ANALYZER_VERSION",
    );
  });

  it("REACHES THE COMMITTEE, which a resolver unit test cannot show", () => {
    // The assertion that caught a defect in this very change. The first
    // implementation wired the voter to `getCategoryCalibration(symbol)` — a
    // fresh lookup — while the sweep merges its grid override onto the cell in
    // `simulateSymbol`. So the axis was declared, the resolver accepted the
    // thresholds, and `--grid rsiBuyThreshold=70` silently did nothing: the
    // variant would have reported the baseline's numbers back as if it had
    // varied, which is the exact hazard sweepGrid names for a typo'd value.
    //
    // Mutation-proved: removing the pass-through leaves every resolver
    // assertion above green.
    //
    // Asserted at the COMMITTEE rather than through a sweep, deliberately.
    // Downstream, `scoreConsensus` sums seven other votes and can absorb this
    // one entirely — a synthetic fixture then shows no corpus difference even
    // when the wiring is correct, so a sweep-level check would be measuring
    // consensus dynamics rather than the pass-through. The vote itself is
    // where the defect lives.
    const market = risingMarket();
    // The committee's other voters read the regime; only its NAME matters to
    // the momentum leg, so the rest is a neutral fixture.
    const regime: Regime = {
      bias: "buy",
      name: "trend",
      rationale: "fixture",
      trendStrength: 0.5,
      volatilityPercentile: 0.5,
    };
    const shipped = runStrategyCommittee("EURUSD", market, regime)
      .find((vote) => vote.name.startsWith("momentum_"));
    const banded = runStrategyCommittee("EURUSD", market, regime, {
      ...getCategoryCalibration("EURUSD"),
      // Outside RSI's range, so the leg cannot vote at all. Decisive rather
      // than plausible: a band the fixture never reaches would prove nothing.
      rsiBuyThreshold: 101,
      rsiSellThreshold: -1,
    }).find((vote) => vote.name.startsWith("momentum_"));

    // The fixture rises for 380 bars and then drops 10, which leaves RSI at
    // 28.6 (a sell) against a still-positive MACD slope (+0.13, a buy). Under
    // the shipped band the two legs CONTRADICT, and the resolver refuses to
    // break a contradiction — so the vote is neutral. Move the band out of
    // RSI's range and the RSI leg abstains instead of dissenting, leaving
    // MACD to carry: the vote becomes buy.
    //
    // That direction flip is the proof, and it also shows WHICH leg the band
    // controls. The reverse fixture — both legs agreeing — proves nothing,
    // because abstaining one still leaves the other voting the same way.
    assert.ok(shipped, "the fixture produced no momentum vote at all");
    assert.equal(
      shipped!.direction,
      "neutral",
      "the fixture no longer puts the two legs in contradiction — re-derive it",
    );
    assert.ok(banded, "the momentum vote vanished rather than changing");
    assert.equal(
      banded!.direction,
      "buy",
      "an out-of-range band did not abstain the RSI leg — the calibration is " +
        "not reaching voteMomentumDivergence, so the axis is declared and inert",
    );
  });

  it("THE SWEEP passes its effective calibration, not a fresh lookup", () => {
    // A second defect of the same shape, one level up, and it survived the
    // committee test above: `runStrategyCommittee` defaults its calibration
    // parameter to `getCategoryCalibration(symbol)`, so dropping the argument
    // at the sweep's call site leaves everything compiling and every
    // committee-level assertion green while the grid override stops reaching
    // the voter. Mutation-proved.
    //
    // A synthetic fixture only shows it if the momentum vote actually moves
    // the consensus, which a single contradiction does not — the other seven
    // votes absorb it. This one repeats the rise/drop cycle twelve times so
    // many decisions sit in the contradiction, and then it does show:
    // 58 rows against 65, noConsensus 23 against 16.
    const startTime = Date.parse("2026-06-15T00:00:00.000Z");
    const values: number[] = [];
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const base = 100 + cycle * 0.5;
      for (let index = 0; index < 70; index += 1) values.push(base + index * 0.05);
      const peak = values[values.length - 1];
      for (let index = 1; index <= 10; index += 1) values.push(peak - index * 0.05);
    }
    const primaryBars: Bar[] = values.map((value, index) => ({
      close: value,
      high: value + 0.05,
      low: value - 0.05,
      open: value,
      time: startTime + index * 900_000,
      volume: 1_000,
    }));
    const dailyBars: Bar[] = Array.from({ length: 300 }, (_, index) => {
      const close = 101.5 + 1.2 * Math.sin(index / 4.5);
      return {
        close,
        high: close + 2.5,
        low: close - 2.5,
        open: close,
        time: startTime - 300 * 86_400_000 + index * 86_400_000,
        volume: 10_000,
      };
    });
    const run = (override: Record<string, number> = {}) =>
      simulateSymbol({
        calibrationOverride: {
          blockedRegimes: [],
          runnerWindowShare: 1,
          tp1RiskShare: 0.8,
          ...override,
        },
        dailyBars,
        primaryBars,
        stepBars: 8,
        symbol: "EURUSD",
        warmupBars: 120,
      }).outcomes;

    const shipped = run();
    assert.ok(shipped.length > 20, `only ${shipped.length} rows`);
    assert.deepEqual(
      run({ rsiBuyThreshold: 55, rsiSellThreshold: 45 }),
      shipped,
      "the explicit defaults differ from the shipped literals",
    );
    assert.notDeepEqual(
      run({ rsiBuyThreshold: 101, rsiSellThreshold: -1 }),
      shipped,
      "an out-of-range band changed no decision — simulateSymbol is not " +
        "passing its effective calibration to runStrategyCommittee, so every " +
        "voter-side grid axis is silently inert",
    );
  });

  it("both fields are declared grid overrides", () => {
    for (const key of ["rsiBuyThreshold", "rsiSellThreshold"]) {
      assert.ok(
        (GRID_OVERRIDE_KEYS as readonly string[]).includes(key),
        `${key} is a calibration field the grid cannot reach — the state ` +
          "pre-R3 register item 4 recorded",
      );
    }
    assert.deepEqual(
      parseGridSpec("rsiBuyThreshold=55,65").map((c) => c.rsiBuyThreshold),
      [55, 65],
    );
  });
});

/**
 * A long rise then a short sharp drop, so the two oscillator legs CONTRADICT.
 *
 * 380 bars up then 10 down at 0.05 leaves RSI at 28.6 — a sell — against a MACD
 * slope still at +0.13 — a buy. That contradiction is what makes the band's
 * effect visible at the committee: under the shipped band the resolver refuses
 * to break it and votes neutral, and abstaining the RSI leg lets MACD carry.
 */
function risingMarket() {
  const startTime = Date.parse("2026-06-15T00:00:00.000Z");
  const values: number[] = [];
  for (let index = 0; index < 380; index += 1) values.push(100 + index * 0.05);
  const peak = values[values.length - 1];
  for (let index = 1; index <= 10; index += 1) values.push(peak - index * 0.05);
  const history: Bar[] = values.map((value, index) => ({
    close: value,
    high: value + 0.05,
    low: value - 0.05,
    open: value,
    time: startTime + index * 900_000,
    volume: 1_000,
  }));
  const daily: Bar[] = Array.from({ length: 60 }, (_, index) => {
    const value = 95 + index * 0.1;
    return {
      close: value,
      high: value + 1,
      low: value - 1,
      open: value,
      time: startTime - 60 * 86_400_000 + index * 86_400_000,
      volume: 10_000,
    };
  });
  return buildDecisionMarketContext({ daily, history });
}
