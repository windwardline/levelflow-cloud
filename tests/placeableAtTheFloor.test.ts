import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SIZEABLE_MARKETS_BY_LINE } from "../src/lib/broker/instruments.ts";
import {
  PROGRAM_LINES,
  RISK_PERCENT_MAX,
  RISK_PERCENT_MIN,
} from "../src/lib/broker/programs.ts";
import { sizeSetup } from "../src/lib/broker/sizing.ts";

/**
 * `programs.ts` justifies the risk floor with a claim about behaviour:
 *
 *   "The floor is 0.10% so the smallest ladder tier still produces a placeable
 *    size."
 *
 * That claim was tested nowhere.
 *
 * A CORRECTION TO THIS FILE'S FIRST VERSION, which said `RISK_PERCENT_MIN`
 * "appeared in exactly one file in the repository". It appears in three, and
 * src/lib/profile.ts is a live consumer that predates this test. The claim came
 * from a grep scoped to src/lib/broker and tests, stated as though it covered
 * the repository — the same population error this file exists to catch, made
 * in its own header.
 *
 * What survives the correction is the part that mattered: the floor had no
 * EXECUTING test. A justification with no mechanism is correct when written and
 * unable to notice itself going stale.
 *
 * WHAT THIS PINS is the property that makes the claim meaningful, rather than
 * the claim's arithmetic. §19e says a refusal beats a wrong number, and a size
 * of ZERO is a wrong number wearing a size's shape: it renders as a number the
 * operator could act on, and it is not placeable at any venue. So every
 * (program line, market) pair must resolve to either a genuinely placeable size
 * or an explicit refusal word — never a numeric nothing.
 *
 * The population is DERIVED from SIZEABLE_MARKETS_BY_LINE and PROGRAM_LINES,
 * never listed here. A curated list would drift the moment a market is
 * onboarded, and would do it silently, since a shorter list still passes.
 */

/**
 * A quote for every symbol any bridge might ask for. The VALUE is arbitrary
 * because this is a property test — bridges multiply, so a positive rate
 * exercises the same path a real one does — but it must be PRESENT, or every
 * bridged market short-circuits to `rateUnavailable` and the run proves nothing.
 * The non-vacuity floor below is what catches that if it ever happens.
 */
const QUOTES: Record<string, number> = Object.fromEntries(
  Object.values(SIZEABLE_MARKETS_BY_LINE)
    .flat()
    .map((symbol) => [symbol, 1.25]),
);

/**
 * Stop distances as a fraction of entry. The SIZE falls as the stop widens, so
 * the wide end is the adversarial case: it is where a floored size reaches zero
 * first. 12% of entry is past anything the ladder would place and is included
 * precisely because the property must hold there too.
 */
const STOP_FRACTIONS = [0.002, 0.01, 0.05, 0.12];
const ENTRY_PRICES = [0.65, 25, 1_900, 68_000];

type Case = {
  accountSize: number;
  entryPrice: number;
  line: string;
  stopLoss: number;
  symbol: string;
};

function cases(): Case[] {
  const out: Case[] = [];
  for (const program of PROGRAM_LINES) {
    const markets = SIZEABLE_MARKETS_BY_LINE[program.line] ?? [];
    // The SMALLEST account is the one the claim is about: a bigger account can
    // only ever produce a bigger size, so if the floor holds here it holds
    // everywhere above it.
    const accountSize = Math.min(...program.accountSizes);
    for (const symbol of markets) {
      for (const entryPrice of ENTRY_PRICES) {
        for (const fraction of STOP_FRACTIONS) {
          out.push({
            accountSize,
            entryPrice,
            line: program.line,
            stopLoss: entryPrice * (1 - fraction),
            symbol,
          });
        }
      }
    }
  }
  return out;
}

describe("sizing at the risk floor", () => {
  it("never answers with a size of nothing", () => {
    const all = cases();
    assert.ok(
      all.length > 0,
      "no (line, market) pairs were derived — the population collapsed",
    );

    const zeros: string[] = [];
    const belowStep: string[] = [];
    let placeable = 0;
    let refused = 0;

    for (const testCase of all) {
      const result = sizeSetup({
        accountSize: testCase.accountSize,
        entryPrice: testCase.entryPrice,
        levelflowSymbol: testCase.symbol,
        programLine: testCase.line as never,
        quotes: QUOTES,
        riskPercent: RISK_PERCENT_MIN,
        stage: "challenge",
        stopLoss: testCase.stopLoss,
      });

      const where =
        `${testCase.line}/${testCase.symbol} @ ${testCase.entryPrice} stop ${testCase.stopLoss.toFixed(4)}`;

      if (result.kind === "blocked") {
        assert.ok(
          typeof result.word === "string" && result.word.length > 0,
          `${where} refused with no word — a refusal must say something`,
        );
        refused++;
        continue;
      }

      placeable++;
      if (result.units === 0) zeros.push(where);
      else if (result.units < result.step) belowStep.push(where);
    }

    // NON-VACUITY, and the assertion that would have caught a quotes map that
    // silently short-circuited everything. A run where nothing sized would
    // report a clean pass having exercised only the refusal path.
    // Measured 2026-08-26: 1,169 of 4,016 size and 2,847 refuse with "Below
    // one" — the refusal this whole file exists to prove happens instead of a
    // zero. The floor is a SHARE rather than `> 0`, because one surviving case
    // would satisfy `> 0` while the other four thousand quietly stopped being
    // checked. A tenth is far under the observed 29% so a roster change does
    // not trip it, and far above the one-case pass that would mean nothing.
    assert.ok(
      placeable >= all.length * 0.1,
      `only ${placeable} of ${all.length} cases produced a size (refused=` +
        `${refused}). Too little of this population is reaching the sizing ` +
        `path for the zero-size assertions below to mean anything.`,
    );

    assert.deepEqual(
      zeros.slice(0, 8),
      [],
      `${zeros.length} of ${all.length} cases returned a SIZE of zero at the ` +
        `${RISK_PERCENT_MIN}% floor. Zero is not a placeable size; §19e ` +
        `requires a refusal word instead of a number the operator cannot act on.`,
    );
    assert.deepEqual(
      belowStep.slice(0, 8),
      [],
      `${belowStep.length} cases returned a size below the venue's own step, ` +
        `which cannot be submitted as an order.`,
    );
  });

  it("sizes no smaller at the floor than at the ceiling", () => {
    // The floor's whole justification is that it is the WORST case. If any
    // market sized larger at 0.10% than at 1.50% the ordering would be
    // inverted, the floor would not be the binding case, and the claim above
    // would be checking the wrong end of the range.
    const inverted: string[] = [];
    let compared = 0;

    for (const testCase of cases()) {
      const base = {
        accountSize: testCase.accountSize,
        entryPrice: testCase.entryPrice,
        levelflowSymbol: testCase.symbol,
        programLine: testCase.line as never,
        quotes: QUOTES,
        stage: "challenge" as const,
        stopLoss: testCase.stopLoss,
      };
      const atFloor = sizeSetup({ ...base, riskPercent: RISK_PERCENT_MIN });
      const atCeiling = sizeSetup({ ...base, riskPercent: RISK_PERCENT_MAX });
      if (atFloor.kind !== "size" || atCeiling.kind !== "size") continue;
      compared++;
      if (atFloor.units > atCeiling.units) {
        inverted.push(`${testCase.line}/${testCase.symbol}`);
      }
    }

    assert.ok(compared > 0, "no pair sized at both ends — nothing was compared");
    assert.deepEqual(inverted.slice(0, 8), [], `${inverted.length} inverted pairs`);
  });
});
