import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { estimateExecutionQuality } from "../supabase/functions/trade-analyzer/executionQuality.ts";

/**
 * Amendment 39: profit is the measure. A figure the operator is shown as the
 * payoff must also be a column in the corpus that grades the engine.
 *
 * THE DEFECT THIS EXISTS TO PREVENT, found 2026-08-30 by an adversarial review
 * and not by any test here. #468 corrected the Desk to print
 * `ladderRewardRisk` — what the ladder actually pays, half the position having
 * left at TP1 — because `rewardRisk`, the runner target's full-size ratio,
 * overstates the edge by 33% to 60% by class. The Desk moved. The corpus did
 * not: the
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
const REPLAY = readFileSync(
  "supabase/functions/trade-analyzer/replay.ts",
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

  /**
   * The same omission one field over, and the reason a total is emitted rather
   * than left to arithmetic.
   *
   * `estimatedRoundTripCost` LOOKS recoverable: `rewardRisk` IS
   * `executionQuality.effectiveRewardRisk`, so the cost should fall out of
   * `(grossRewardRisk − rewardRisk) × riskDistance`. It does — until the round
   * trip exceeds the reward distance, where `effectiveRewardRisk` clamps at 0
   * and the inverse silently returns the REWARD instead of the COST.
   *
   * That is the case where cost is the dominant fact about the setup, and
   * under `captureAll` — how a calibration corpus keeps its gate-failing rows
   * — those rows are in the file. The clamped value reads as a smaller,
   * plausible cost, so nothing downstream can tell it apart from a real one.
   */
  it("proves the cost inverse breaks where cost matters most", () => {
    const plan = (takeProfit: number) =>
      estimateExecutionQuality({
        assetType: "crypto",
        atr: 1,
        availableTimeframes: ["1day", "1hour", "15min", "5min"],
        dailyAtr: 10,
        entryPrice: 100,
        latestClose: 100,
        providerWarnings: [],
        side: "buy",
        stopLoss: 99,
        symbol: "BTCUSD",
        takeProfit,
      });
    const riskDistance = 1;
    const inverse = (q: ReturnType<typeof plan>) =>
      (q.grossRewardRisk - q.effectiveRewardRisk) * riskDistance;

    // Wide target: the inverse is exact, which is why the gap was invisible.
    const wide = plan(103);
    assert.ok(
      Math.abs(inverse(wide) - wide.estimatedRoundTripCost) < 1e-9,
      "the inverse must hold where the clamp does not bind, or this test is " +
        "measuring something else entirely",
    );

    // Narrow target: the clamp binds and the inverse understates the cost.
    const narrow = plan(100.05);
    assert.equal(
      narrow.effectiveRewardRisk,
      0,
      "fixture drifted off the clamp — pick a target the round trip exceeds",
    );
    const understatement = 1 -
      inverse(narrow) / narrow.estimatedRoundTripCost;
    assert.ok(
      understatement > 0.5,
      `the inverse understates by ${(understatement * 100).toFixed(1)}% — if ` +
        `this has fallen below 50% the clamp's reach changed and the ` +
        `argument for emitting the total deserves re-reading, not deleting`,
    );
  });

  it("carries the cost itself, and the three components that differ in remedy", () => {
    const typeAt = SWEEP.indexOf("export type SweepOutcomeRecord = {");
    const declaration = SWEEP.slice(typeAt, SWEEP.indexOf("\n};", typeAt));
    for (
      const field of [
        "estimatedRoundTripCost",
        "estimatedSpread",
        "estimatedSlippage",
        "estimatedCommission",
      ]
    ) {
      assert.match(
        declaration,
        new RegExp(`^\\s+${field}: number;`, "m"),
        `\`${field}\` is not a corpus column`,
      );
      assert.match(
        SWEEP,
        new RegExp(`${field}: plan\\.executionQuality\\.${field}`),
        `\`${field}\` is declared but never populated from the plan`,
      );
    }
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

/**
 * Every field the resolver's shared accountant writes onto a resolution.
 *
 * `realizedFields()` is where the money on a resolved row is computed, and it
 * is spread into `feedback` on every resolution path. Reading its keys makes
 * the corpus requirement DERIVED: a new quantity added there has to be
 * emitted or explicitly excused, and neither can be forgotten quietly.
 *
 * Pinning `ladderRewardRisk` by name did not catch `forgoneRunnerR`, and would
 * not have caught the next one. This is the mechanism that does.
 */
function accountantFields(): string[] {
  const at = REPLAY.indexOf("const realizedFields = () => ({");
  assert.ok(at >= 0, "the shared accountant moved — re-anchor this test");
  let depth = 0;
  let end = at;
  for (let i = REPLAY.indexOf("{", at); i < REPLAY.length; i++) {
    if (REPLAY[i] === "{") depth++;
    else if (REPLAY[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = REPLAY.slice(at, end);
  // Top-level keys only — the nested call arguments are indented deeper — and
  // SHORTHAND properties too. The first version matched `name:` alone and so
  // missed `runnerProtection,`, which is exactly the field this test was being
  // written to catch: an extractor that silently skips a shape reports a
  // smaller population and passes.
  return Array.from(
    new Set(
      Array.from(body.matchAll(/^ {4}([a-zA-Z][a-zA-Z0-9]*)\s*[:,]/gm)).map((
        m,
      ) => m[1]),
    ),
  );
}

/**
 * Accountant fields deliberately absent from the corpus, each with the reason.
 * An entry here is an argument, not a name — the same standing the emitter
 * exclusions carry in `tests/reviewCopyCoupling.test.ts`.
 */
const NOT_A_CORPUS_COLUMN: Record<string, string> = {
  netRealizedR:
    "the corpus's `realizedR` IS the net figure — `sweep.ts` charges " +
    "commission through `perLegCost` and the leg prints already carry spread " +
    "and gap slippage. Emitting a second net column under a second name would " +
    "give the corpus two answers to one question. That `replay.ts` uses the " +
    "bare name for its GROSS twin is a real hazard and is named in the " +
    "record's docblock, not fixed by adding a column.",
};

describe("the corpus carries what the accountant computes", () => {
  it("reads a real set of accountant fields", () => {
    const fields = accountantFields();
    assert.ok(
      fields.length >= 4,
      `only ${fields.length} accountant fields found (${fields.join(", ")}) — ` +
        `the extractor broke rather than the accountant shrinking`,
    );
    assert.ok(
      fields.includes("forgoneRunnerR"),
      "the give-back left the accountant — amendment 39 names it by hand",
    );
  });

  it("emits every one of them, or carries an argument for not doing so", () => {
    const typeAt = SWEEP.indexOf("export type SweepOutcomeRecord = {");
    const declaration = SWEEP.slice(typeAt, SWEEP.indexOf("\n};", typeAt));
    const missing = accountantFields().filter((field) =>
      !new RegExp(`^\\s+${field}[?]?:`, "m").test(declaration) &&
      !(field in NOT_A_CORPUS_COLUMN)
    );
    assert.deepEqual(
      missing,
      [],
      `the accountant computes these on every resolution and the corpus does ` +
        `not carry them: ${missing.join(", ")}. R3 is the one re-sweep — ` +
        `either emit them or add the reason to NOT_A_CORPUS_COLUMN`,
    );
  });

  it("keeps no stale exclusion", () => {
    // An excuse for a field the accountant no longer computes is a stale
    // exemption, and stale exemptions are how a list stops describing the
    // thing it guards.
    const fields = new Set(accountantFields());
    const stale = Object.keys(NOT_A_CORPUS_COLUMN).filter((f) => !fields.has(f));
    assert.deepEqual(stale, [], `stale exclusions: ${stale.join(", ")}`);
  });

  it("reads the give-back and its protection mode off the resolution", () => {
    // The mode is the axis the give-back must be compared ACROSS, and it is
    // the one accountant value that is not a number — `Number("breakeven")` is
    // NaN, so the numeric helper would have recorded it as null and a column
    // of nulls reads exactly like a corpus where no runner was ever protected.
    assert.match(SWEEP, /forgoneRunnerR: feedbackNumber\("forgoneRunnerR"\)/);
    assert.match(SWEEP, /runnerProtection: feedbackString\("runnerProtection"\)/);
    assert.match(
      SWEEP,
      /const feedbackString = \(key: string\) => \{/,
      "the string accessor is gone, so the mode is being coerced through Number",
    );
  });
});
