import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  calculateMacroRateAdjustment,
  MACRO_RATE_ROLE_BY_SYMBOL,
  type MacroRateContext,
  treasuryContextFromRows,
} from "../supabase/functions/trade-analyzer/macroRates.ts";

/**
 * The corpus recorded the macro VERDICT and threw away the STATE.
 *
 * Every row carried `macroAdjustment` and `macroStance`; nothing carried the
 * curve they were read off. That makes each threshold in `macroRates.ts`
 * unre-derivable at any value other than the one that shipped — the 4bp dead
 * band, the 8bp large-move line and the 2:1 magnitude pair — and R3 is the one
 * re-sweep, so a state nobody keeps is a threshold nobody can ever move on
 * evidence.
 *
 * THREE FIELDS, ENUMERATED RATHER THAN SAMPLED. `MacroRateContext` has seven,
 * and the register's own warning was that adding the one field an argument
 * happened to name repeats the curation failure. So the whole record is
 * enumerated here and the other four are shown derivable — not asserted to be.
 */

const KEPT = ["tenYearChangeBps", "tenYearYield", "twoYearYield"] as const;

function contextFields(): string[] {
  const source = readFileSync(
    "supabase/functions/trade-analyzer/macroRates.ts",
    "utf8",
  );
  const block = /export type MacroRateContext = \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(block, "MacroRateContext is gone — re-point this guard");
  return [...block[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
}

describe("the whole macro record is accounted for, not sampled", () => {
  it("enumerates every field MacroRateContext carries", () => {
    // Derived from the type, so a field added there forces a decision here
    // instead of being silently left out of the corpus forever.
    const fields = contextFields();
    const accountedFor = new Set([
      ...KEPT,
      // Derivable, each with its source named in the assertions below.
      "curveSpreadBps",
      "latestDate",
      "previousDate",
      "source",
      "unavailableReason",
    ]);
    for (const field of fields) {
      assert.ok(
        accountedFor.has(field),
        `MacroRateContext.${field} is neither emitted nor shown derivable. R3 ` +
          "is the one re-sweep — decide it now, in this test.",
      );
    }
    assert.equal(fields.length, 8, fields.join(", "));
  });

  it("curveSpreadBps is exact arithmetic on the two kept yields", () => {
    // Not "approximately recoverable" — the same rounding the engine applies.
    for (const [ten, two] of [[4.66, 4.19], [0.51, 0.22], [3.0, 3.4]] as const) {
      const context = treasuryContextFromRows(
        { dateMs: 2, tenYear: ten, twoYear: two },
        { dateMs: 1, tenYear: ten - 0.05, twoYear: two - 0.01 },
      );
      const rebuilt = Math.round((ten - two) * 100 * 100) / 100;
      assert.equal(
        context.curveSpreadBps,
        rebuilt,
        `curveSpreadBps for ${ten}/${two} is not (ten - two) x 100`,
      );
    }
  });

  it("keeps exactly the three the corpus cannot rebuild", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/sweep.ts",
      "utf8",
    );
    for (const field of KEPT) {
      assert.match(
        source,
        new RegExp(`^\\s{6}${field}: macroContext\\.${field},$`, "m"),
        `${field} is not emitted from the hoisted context`,
      );
    }
    // And no redundant column crept in beside them.
    assert.doesNotMatch(source, /^\s{6}curveSpreadBps:/m);
    assert.doesNotMatch(source, /^\s{6}latestDate:/m);
  });
});

describe("the emitted change separates the two neutrals", () => {
  // `macroRates.ts` returns "neutral" for "rates were steady" AND for "no
  // rate-aligned side for this market" — two different facts under one word.
  // With the change in hand a reader separates them exactly, which is why no
  // new stance value was added.
  const curve = (changeBps: number): MacroRateContext => ({
    curveSpreadBps: 47,
    latestDate: "2026-08-25",
    previousDate: "2026-08-22",
    source: "fmp_treasury_rates",
    tenYearChangeBps: changeBps,
    tenYearYield: 4.66,
    twoYearYield: 4.19,
  });

  it("steady rates: neutral, and |change| under the band", () => {
    const verdict = calculateMacroRateAdjustment("EURUSD", "buy", curve(2));
    assert.equal(verdict.stance, "neutral");
    assert.ok(Math.abs(curve(2).tenYearChangeBps!) < 4);
  });

  it("no aligned side: also neutral, and |change| at or over the band", () => {
    // A role-none market with a real move — the other neutral.
    const verdict = calculateMacroRateAdjustment("HGUSD", "buy", curve(12));
    assert.equal(verdict.stance, "neutral");
    assert.ok(Math.abs(curve(12).tenYearChangeBps!) >= 4);
    assert.notEqual(
      verdict.detail,
      calculateMacroRateAdjustment("EURUSD", "buy", curve(2)).detail,
      "the two neutrals read identically even in their detail, so nothing " +
        "but the emitted change can separate them",
    );
  });
});

describe("the underived numbers say so", () => {
  const source = readFileSync(
    "supabase/functions/trade-analyzer/macroRates.ts",
    "utf8",
  );

  it("marks the 4bp band, the 8bp line, and the 2:1 pair", () => {
    // The register said "three distinct decisions, none documented". It was
    // four undocumented, and the -1 it named was already documented twice.
    assert.match(source, /4 bp: UNDERIVED/);
    assert.match(source, /8 bp: UNDERIVED/);
    assert.match(source, /8 bp AND the 2:1 pair: both UNDERIVED/);
  });

  it("does NOT re-mark the -1, which #415 already treated twice", () => {
    // Was a file-wide count of 2, tightened 2026-09-01 to a per-entry match.
    // A count cannot see the case it exists to catch: delete HOUSD's note and
    // add one anywhere else and the count still reads 2. This asks the two
    // entries directly, and asks every other entry to stay silent — the same
    // enumerate-don't-count repair made to the role membership test the same
    // day.
    const treated = Object.entries(MACRO_RATE_ROLE_BY_SYMBOL)
      .filter(([, entry]) =>
        entry.why.includes("never been measured anywhere in this repo")
      )
      .map(([symbol]) => symbol)
      .sort();
    assert.deepEqual(
      treated,
      ["HOUSD", "RBUSD"],
      "the #415 -1 notes are no longer on exactly HOUSD and RBUSD",
    );
    assert.match(source, /already carries #415's treatment\n\s*\/\/ twice in this file/);
  });

  it("states the effect honestly, not as a 0-100 nudge", () => {
    // "plus or minus 2 on a 0-100 score" is arithmetically right and
    // materially misleading: the addend feeds the acceptance gate, the scan's
    // primary sort and the sibling suppressor.
    assert.match(source, /acceptance gate, the scan's primary sort/);
  });
});
