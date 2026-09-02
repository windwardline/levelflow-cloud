import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Every corpus reader must say what it does with the rows the gate rejected.
 *
 * A `--capture-all` sweep emits the decisions that failed the confidence,
 * payoff and regime gates alongside the ones that passed, flagged
 * `accepted: false`. A gated sweep emits only the survivors. The two corpora
 * are both legitimate — two readers REQUIRE capture-all
 * (`confidence-bands.ts`, `threshold-rescue.ts`) and R3 is expected to produce
 * one — so a reader that neither declares which it needs nor handles the flag
 * reports different numbers on the two and says nothing about it.
 *
 * That was not hypothetical. Found 2026-09-01, all four by reading rather than
 * by failure:
 *
 *   - `account-type-report.ts` re-applied the payoff and regime gates at read
 *     time and NOT the confidence gate, with `confidenceScore` declared on its
 *     row type and never read. Below-threshold rows would have driven
 *     per-market expectancy and the amendment-24 EXCLUDE verdicts, biased
 *     toward excluding markets.
 *   - `stop-provenance.ts` and `exclusion-suspects.ts` folded gate-failing
 *     rows into tallies whose whole question is what the engine would ship.
 *   - `ag-class-derivation.ts` promises "the monotone-survival confidence
 *     floor" and never asserted it needs the rows below the floor.
 *
 * THREE STRATEGIES ARE ALLOWED, because the right answer differs by reader:
 * declare the mode you need, filter to the shipped population, or re-apply the
 * gates yourself from the current calibration. What is not allowed is silence.
 */

/** Anything that opens the corpus door — the three exported forms. */
const DOOR = /assertManifest\(|assertManifestedCorpus/;
/** …and actually parses emit rows, rather than only reading the manifest. */
// 2026-09-02: readers migrated onto the sealed door take rows from its callback, not a line loop.
const READS_ROWS =
  /JSON\.parse\(line\)|readLinesSync\(|for await \(const line|assertManifestedCorpus(?:Streaming|Sync)?\(/;

const DECLARES = /assertAcceptanceMode\(/;
const FILTERS = /\.accepted === false|\.accepted !== true|row\.accepted\b/;
const REAPPLIES = /confidenceThreshold/;

/**
 * Readers that legitimately read every row, each with its premise stated here
 * and CHECKED below — an exemption whose reason nobody verifies is a hole with
 * a comment on it.
 */
const EXEMPT: Record<
  string,
  { because: string; forbids: RegExp; premise: RegExp }
> = {
  "feasibility-4d.ts": {
    because:
      "samples planned entry PRICES for sizing feasibility, never outcomes — " +
      "a gate-failing decision still priced a real instrument, so more " +
      "samples is strictly better and acceptance is irrelevant to the question",
    // The premise has two halves and BOTH are checked. Second: it reads no
    // outcome, R, fill or tp1 field — neither as a property read nor as a
    // column declared on its row type. This half is also what earns it
    // `confirm: "read"` on the sealed door (R4 act 1): prices are not
    // outcomes, so the exemption verifies the premise the door relies on.
    forbids:
      /\.(?:outcome|grossOutcome|realizedR|grossRealizedR|tp1Hit|filledAtMs|exitAtMs|legs|unfilledApproachDistance|maxFavorableMove|maxAdverseMove|forgoneRunnerR)\b|\b(?:outcome|grossOutcome|realizedR|grossRealizedR|tp1Hit|filledAtMs|exitAtMs|legs|unfilledApproachDistance|maxFavorableMove|maxAdverseMove|forgoneRunnerR)\??:/,
    // First: it reads the PLAN's entry price, carried on every row filled or
    // not. The entry LEG it read until R4 act 1 is empty on an unfilled row,
    // so that read learned the outcome from the leg's presence.
    premise: /row\.entryPrice\b/,
  },
};

const readers = readdirSync("scripts")
  .filter((name) => name.endsWith(".ts"))
  .filter((name) => {
    const source = readFileSync(`scripts/${name}`, "utf8");
    return DOOR.test(source) && READS_ROWS.test(source);
  })
  .sort();

describe("every corpus reader states what it does with rejected rows", () => {
  it("finds a real population to judge", () => {
    // Derived by globbing, never a curated list — the curated two-file version
    // of this law is what let four readers past it.
    assert.ok(readers.length >= 10, `only found ${readers.join(", ")}`);
  });

  for (const name of readers) {
    it(`${name} declares, filters, or re-applies`, () => {
      const source = readFileSync(`scripts/${name}`, "utf8");
      const exemption = EXEMPT[name];
      if (exemption) {
        assert.match(
          source,
          exemption.premise,
          `${name} is exempt because it ${exemption.because} — and that ` +
            "premise no longer holds, so the exemption must be re-earned",
        );
        assert.doesNotMatch(
          source,
          exemption.forbids,
          `${name} is exempt because it ${exemption.because} — and it now ` +
            "reads an outcome field, so the exemption must be re-earned",
        );
        return;
      }
      assert.ok(
        DECLARES.test(source) || FILTERS.test(source) || REAPPLIES.test(source),
        `${name} opens a corpus and reads its rows without saying what it ` +
          "does with the ones the gate rejected. It will report different " +
          "numbers on a gated and a capture-all corpus and mention neither. " +
          "Declare the mode (assertAcceptanceMode), filter to the shipped " +
          "population (accepted === false), or re-apply the gates from the " +
          "current calibration.",
      );
    });
  }

  it("keeps the two capture-all readers asserting their premise", () => {
    // The narrower law this replaces, preserved: these two do not merely need
    // to say something, they need to say captureAll: true. A band curve or a
    // threshold rescue built from survivors reads every band as perfect and
    // finds nothing to rescue. Neither fails; both report.
    for (const script of ["confidence-bands.ts", "threshold-rescue.ts"]) {
      assert.match(
        readFileSync(`scripts/${script}`, "utf8"),
        /assertAcceptanceMode\(\s*(path|file),[\s\S]{0,120}?\{ captureAll: true \}\)/,
        `${script} states a capture-all premise its header depends on`,
      );
    }
  });

  it("account-type-report re-applies ALL THREE gates, not two", () => {
    // The specific omission, pinned: the confidence gate was the missing one
    // and its input sat on the row type unread.
    const source = readFileSync("scripts/account-type-report.ts", "utf8");
    const body = /function passesOtherGates\(row: Row\): boolean \{[\s\S]*?\n\}/
      .exec(source);
    assert.ok(body, "passesOtherGates is gone — re-point this guard");
    for (const gate of ["confidenceThreshold", "minRewardRisk", "blockedRegimes"]) {
      assert.match(
        body[0],
        new RegExp(gate),
        `the read-time gate set is missing ${gate}, so a capture-all corpus ` +
          "feeds rows the engine would refuse into the EXCLUDE verdicts",
      );
    }
  });
});
