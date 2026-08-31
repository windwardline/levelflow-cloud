import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Amendment 39: profit is the measure. A figure the operator is shown as the
 * payoff must also be a column in the corpus that grades the engine.
 *
 * THE DEFECT THIS EXISTS TO PREVENT, found 2026-08-30 by an adversarial review
 * and not by any test here. #468 corrected the Desk to print
 * `ladderRewardRisk` — what the ladder actually pays, half the position having
 * left at TP1 — because `rewardRisk`, the runner target's full-size ratio,
 * overstates the edge by roughly 60%. The Desk moved. The corpus did not: the
 * field was computed on every plan, shown on every screen, and emitted
 * nowhere.
 *
 * R3 IS ONE RE-SWEEP. Had it run that way, R4 would have graded all 97 markets
 * against `rewardRisk` — measuring every one of them against a promise the
 * ladder never makes, and reading the shortfall as markets underdelivering
 * rather than as the wrong yardstick. Recovering that costs a second full
 * sweep against an FMP quota exhausted twice.
 *
 * So the coupling is DERIVED from the Desk rather than pinned by name: the
 * test reads which field the panel prefers for the payoff and requires that
 * field to be an emitted column. Move the Desk's figure again and this fails
 * until the corpus follows — which is the only mechanism that would have
 * caught the original.
 */

const PANEL = readFileSync(
  "src/components/workspace/AdvisorRecommendationPanel.tsx",
  "utf8",
);
const SWEEP = readFileSync(
  "supabase/functions/trade-analyzer/sweep.ts",
  "utf8",
);
const PLAN = readFileSync(
  "supabase/functions/trade-analyzer/pricePlan.ts",
  "utf8",
);

/**
 * The confluence fields the Desk reads when it computes the payoff it prints.
 * Read out of the expression rather than named here, so the assertion tracks
 * the panel instead of restating it.
 */
function payoffFieldsTheDeskReads(): string[] {
  const at = PANEL.indexOf("const ladderRewardRisk = Number(confluence?.");
  assert.ok(
    at >= 0,
    "the Desk no longer resolves its payoff here — re-anchor this test " +
      "rather than deleting it; the coupling is the point",
  );
  const block = PANEL.slice(at, at + 400);
  const fields = Array.from(
    block.matchAll(/confluence\?\.([a-zA-Z][a-zA-Z0-9]*)/g),
  ).map((m) => m[1]);
  return Array.from(new Set(fields));
}

describe("the corpus carries the figure the Desk calls the payoff", () => {
  it("reads a real, non-empty set of payoff fields off the panel", () => {
    // NON-VACUITY. An extractor that found nothing would make every
    // requirement below hold over an empty set — the exact shape of failure
    // that let the original defect ship.
    const fields = payoffFieldsTheDeskReads();
    assert.ok(
      fields.length >= 2,
      `found ${fields.length} payoff fields (${fields.join(", ")}); the Desk ` +
        "prefers the ladder's figure and falls back to the runner's, so " +
        "fewer than two means the extractor broke",
    );
    assert.ok(
      fields.includes("ladderRewardRisk"),
      `the Desk's preferred payoff field is not ladderRewardRisk (${
        fields.join(", ")
      }) — if that is deliberate, this file's premise moved`,
    );
  });

  it("emits every one of them as a corpus column", () => {
    const fields = payoffFieldsTheDeskReads();
    // The DECLARATION is read out of the type block alone. A looser
    // whole-file match was satisfied by the emit line itself, so deleting the
    // column passed this test and was caught only by tsc — an assertion that
    // did not check what its message claimed. Mutation found it.
    const typeAt = SWEEP.indexOf("export type SweepOutcomeRecord = {");
    assert.ok(typeAt >= 0, "SweepOutcomeRecord is gone");
    const typeEnd = SWEEP.indexOf("\n};", typeAt);
    assert.ok(typeEnd > typeAt, "SweepOutcomeRecord's body did not close");
    const declaration = SWEEP.slice(typeAt, typeEnd);
    for (const field of fields) {
      assert.match(
        declaration,
        new RegExp(`^\\s+${field}[?]?:`, "m"),
        `SweepOutcomeRecord has no \`${field}\` column, but the Desk prints ` +
          `it as the payoff. R3 is the one re-sweep — a field absent then ` +
          `costs a second full sweep to recover`,
      );
      assert.match(
        SWEEP,
        new RegExp(`${field}: plan\\.${field}`),
        `\`${field}\` is declared on the record but never populated from the ` +
          `plan — a column of undefined reads exactly like a column of data`,
      );
    }
  });

  it("takes it from the plan rather than recomputing it in the sweep", () => {
    // A second computation is a second thing to be wrong. The blend and the
    // cost subtraction live in pricePlan.ts; the sweep copies.
    assert.match(
      PLAN,
      /ladderRewardRisk: takeProfit1 === null \? null :/,
      "the ladder payoff moved out of the plan",
    );
    const emitAt = SWEEP.indexOf("ladderRewardRisk: plan.ladderRewardRisk");
    assert.ok(emitAt >= 0, "the sweep no longer copies the plan's figure");
    assert.doesNotMatch(
      SWEEP,
      /ladderRewardRisk:\s*\(?0\.5\s*\*/,
      "the sweep is recomputing the blend instead of copying it",
    );
  });

  it("keeps the runner's ratio too — they answer different questions", () => {
    // Not a redundancy. `rewardRisk` is what the GATE admits on
    // (`pricePlan.rewardRisk < calibration.minRewardRisk`), and R4 cannot ask
    // whether the gate's currency is right without both figures in the same
    // row. Whether admission SHOULD judge in the ladder's currency is an
    // owner question and deliberately not settled here.
    assert.match(SWEEP, /^\s+rewardRisk: number;/m);
    assert.match(SWEEP, /^\s+grossRewardRisk: number;/m);
  });
});
