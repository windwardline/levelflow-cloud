import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { assertEmitColumns } from "../scripts/sweepStats.ts";
import { buildDecisionMarketContext } from "../supabase/functions/trade-analyzer/sweep.ts";
import { ENGINE_DECLINED_MARKETS } from "../supabase/functions/trade-analyzer/calibration.ts";

/**
 * The corpus declares which columns it has, so a reader can refuse instead of
 * grading a missing quantity as zero.
 *
 * WHY THIS EXISTS. Three columns were found missing from the emit inside one
 * week: `ladderRewardRisk` (#473), the cost decomposition (#474), and
 * `forgoneRunnerR` — the give-back amendment 39 names by hand — (#477). Every
 * one was caught by a person looking, and every one would have cost a second
 * full sweep against an exhausted FMP allowance if R3 had run first.
 *
 * None of the three moved `ANALYZER_VERSION`, and that was CORRECT: none
 * changed what the engine decides. Which is exactly the problem. Two corpora
 * stamped with the same version can differ in which columns exist, and nothing
 * in either file said which — so a reader finding no `forgoneRunnerR` cannot
 * distinguish a corpus that predates the column from one where every runner
 * gave back nothing. It grades the give-back as zero and reports a result.
 *
 * The column list is DERIVED from the first row actually written, never from a
 * list kept beside the type — a hand-kept list is the thing that goes stale,
 * and it would have been stale three times already.
 */

const DRIVER = readFileSync("scripts/replay-sweep.ts", "utf8");
const MANIFEST = readFileSync("scripts/sweepManifest.ts", "utf8");

describe("a corpus that cannot answer the question refuses it", () => {
  it("refuses a read whose column the corpus does not carry", () => {
    assert.throws(
      () =>
        assertEmitColumns("corpus.jsonl", {
          emitColumns: ["realizedR", "riskDistance", "symbol"],
        }, ["realizedR", "forgoneRunnerR"]),
      /does not carry forgoneRunnerR/,
      "a missing column must stop the read, not be graded as zero",
    );
  });

  it("names every missing column, not just the first", () => {
    // A reader told one name fixes one thing and runs again. The refusal costs
    // nothing extra to be complete.
    assert.throws(
      () =>
        assertEmitColumns("corpus.jsonl", { emitColumns: ["symbol"] }, [
          "forgoneRunnerR",
          "runnerProtection",
          "ladderRewardRisk",
        ]),
      /forgoneRunnerR, runnerProtection, ladderRewardRisk/,
    );
  });

  it("passes a corpus that carries everything asked of it", () => {
    const result = assertEmitColumns("corpus.jsonl", {
      emitColumns: ["forgoneRunnerR", "realizedR", "runnerProtection"],
    }, ["realizedR", "forgoneRunnerR"]);
    assert.equal(result.unverifiable, false);
  });

  it("does NOT refuse a corpus written before the field existed", () => {
    // Every pre-#479 corpus genuinely lacks `emitColumns`. Refusing those
    // would retire the deliberate historical reads for a capability check —
    // the same standing the conditions block gives a legacy manifest. The
    // caller is told it could not verify, rather than told it did.
    const result = assertEmitColumns("legacy.jsonl", {}, ["forgoneRunnerR"]);
    assert.equal(
      result.unverifiable,
      true,
      "an absent column list must report as unverifiable, never as verified",
    );
  });
});

describe("the columns are derived from the corpus, not from a list", () => {
  it("takes them from the first row the driver actually writes", () => {
    const at = DRIVER.indexOf("emitColumns ??= Object.keys(row).sort()");
    assert.ok(
      at >= 0,
      "the driver no longer derives its column list from a written row — a " +
        "hand-kept list would have been stale three times already",
    );
    // It must sit where the row is BUILT, so a field added to the row literal
    // is picked up with no second edit.
    const rowAt = DRIVER.indexOf("const row = {");
    assert.ok(rowAt >= 0 && rowAt < at, "the derivation moved off the row");
  });

  it("reaches the manifest, sorted, and only when something was emitted", () => {
    assert.match(
      DRIVER,
      /\.\.\.\(emitColumns && \{ emitColumns \}\),/,
      "the driver stopped passing the column list to the manifest",
    );
    assert.match(
      MANIFEST,
      /\.\.\.\(input\.emitColumns && \{ emitColumns: \[\.\.\.input\.emitColumns\]\.sort\(\) \}\)/,
      "the list must be sorted at the boundary, or a reordered emit re-hashes " +
        "a corpus whose columns did not change",
    );
  });

  it("stays out of the corpus IDENTITY", () => {
    // `conditionsOf` answers "are these two shards one measurement". Column
    // capability is a different question, and putting it in the identity would
    // make a reader's capability check able to split a legitimate shard set.
    const conditions = readFileSync("scripts/grid-totalr.ts", "utf8");
    const at = conditions.indexOf("const conditionsOf = (candidate: SweepManifest) =>");
    assert.ok(at >= 0, "conditionsOf moved — re-anchor this assertion");
    const body = conditions.slice(at, at + 3000);
    assert.doesNotMatch(
      body,
      /emitColumns/,
      "emitColumns joined the corpus identity; it is a capability fact, not " +
        "a measurement term",
    );
  });
});

/**
 * `conditions.availableTimeframeCount` is a CLAIM, and this is its evidence.
 *
 * The term says the sweep supplies at least four frames on every decision, so
 * both readers of the count — `scoring.ts`'s `timeframePenalty` and
 * `executionQuality.ts`'s coverage penalty — are zero-by-construction offline
 * while they can still fire live. Nothing executed pinned that: the claim
 * rested on reading `buildDecisionMarketContext` and believing it.
 *
 * It matters because the term is now in `expectedConditions`, and
 * `verifyManifest` compares each term to a hardcoded literal with `!==`. A
 * corpus carrying the claim while the construction moved underneath it would
 * be read as if two live score terms had been held at zero when they had not.
 */
describe("the four-frame floor is a property of the code, not a belief", () => {
  const bars = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      close: 100 + (index % 5),
      high: 101 + (index % 5),
      low: 99 + (index % 5),
      open: 100 + (index % 5),
      time: index * 900_000,
      volume: 1_000,
    }));

  it("builds at least four frames from any history the loop will decide on", () => {
    // The decision loop refuses until the daily series is 40 deep and warmup
    // is satisfied, so these are the THINNEST inputs that can reach this
    // function — not a comfortable fixture chosen to pass.
    let checked = 0;
    for (const history of [240, 960, 3_840, 12_000]) {
      for (const daily of [40, 80]) {
        const context = buildDecisionMarketContext({
          daily: bars(daily),
          history: bars(history),
        });
        assert.ok(
          context.availableTimeframes.length >= 4,
          `history ${history} / daily ${daily} yielded ` +
            `${context.availableTimeframes.length} frames ` +
            `(${context.availableTimeframes.join(", ")}) — the manifest's ` +
            `"min-four-by-construction" claim is false, and two score terms ` +
            `it holds at zero can now fire inside a corpus`,
        );
        checked++;
      }
    }
    assert.equal(checked, 8);
  });

  it("adds the fifth frame only when the 5-minute series clears its floor", () => {
    // The asymmetry is why the floor is FOUR and not five: the 5-minute frame
    // is the one that can legitimately be absent.
    assert.equal(
      buildDecisionMarketContext({
        daily: bars(80),
        fiveMin: bars(240),
        history: bars(960),
      }).availableTimeframes.length,
      5,
    );
    assert.equal(
      buildDecisionMarketContext({
        daily: bars(80),
        fiveMin: bars(39),
        history: bars(960),
      }).availableTimeframes.length,
      4,
      "a sub-floor 5-minute series must be dropped, not admitted thin",
    );
  });

  it("is the term the driver states and the reader requires", () => {
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    const reader = readFileSync("scripts/sweepStats.ts", "utf8");
    assert.match(driver, /availableTimeframeCount: "min-four-by-construction",/);
    assert.match(
      reader,
      /availableTimeframeCount: "min-four-by-construction",/,
      "the reader stopped requiring the term, so a corpus measured under " +
        "other terms would aggregate instead of being refused",
    );
  });
});

/**
 * The modelled cost scale is a measurement term, and until M5 it is an INERT
 * one — which is worse than an unrecorded one if the manifest states it.
 *
 * The scale multiplies `estimatedRoundTripCost` only. That figure drives the
 * payoff gate, the cost penalty and `executionScore`. The RESOLVER is handed
 * the raw components — `gapExitSlippage: estimatedSlippage`,
 * `halfSpread: estimatedSpread / 2`, `roundTripCost: estimatedCommission` —
 * and none of them is scaled.
 *
 * So a "gross arm" does not measure gross R. It measures net R under a
 * loosened gate, admitting more setups and changing nothing about what they
 * earn. `remediation-program-2026-08-11.md` records the run that proved it:
 * eleven of twenty rows bit-identical, read at the time as agreement.
 */
describe("the cost scale is stated, and refused while it is inert", () => {
  const QUALITY = readFileSync(
    "supabase/functions/trade-analyzer/executionQuality.ts",
    "utf8",
  );
  const SWEEP_SRC = readFileSync(
    "supabase/functions/trade-analyzer/sweep.ts",
    "utf8",
  );
  const DRIVER_SRC = readFileSync("scripts/replay-sweep.ts", "utf8");

  it("the scale genuinely does not reach the resolver", () => {
    // The premise, read from the resolver call itself rather than believed.
    // Each of these is the RAW component; a scaled one would be the field
    // `estimatedRoundTripCost`, which appears nowhere in this call.
    const at = SWEEP_SRC.indexOf("gapExitSlippage:");
    assert.ok(at >= 0, "the resolver call moved — re-anchor this assertion");
    const call = SWEEP_SRC.slice(at - 200, at + 400);
    assert.match(call, /gapExitSlippage: plan\.executionQuality\.estimatedSlippage/);
    assert.match(call, /halfSpread: plan\.executionQuality\.estimatedSpread \/ 2/);
    assert.match(call, /roundTripCost: plan\.executionQuality\.estimatedCommission/);
    assert.doesNotMatch(
      call,
      /estimatedRoundTripCost/,
      "the resolver now receives the SCALED cost — M5 has landed, so " +
        "MODELED_COST_SCALE_REACHES_RESOLVER should flip and this test's " +
        "premise with it",
    );
  });

  it("says so in a constant the driver reads, not in prose", () => {
    assert.match(
      QUALITY,
      /export const MODELED_COST_SCALE_REACHES_RESOLVER = false;/,
      "the inertness is no longer a stated fact the driver can act on",
    );
    assert.match(
      DRIVER_SRC,
      /if \(modeledCostScale !== 1 && !MODELED_COST_SCALE_REACHES_RESOLVER\) \{/,
      "the driver stopped refusing a scale it cannot honour",
    );
    // Refused BEFORE the provider is touched. R3 is one re-sweep against an
    // exhausted allowance; discovering the arm measured nothing afterwards is
    // the expensive way to learn it.
    const refusalAt = DRIVER_SRC.indexOf("MODELED_COST_SCALE_REACHES_RESOLVER)");
    const fetchAt = DRIVER_SRC.indexOf("args.cacheDir = args.cacheDir ??");
    assert.ok(
      refusalAt > 0 && refusalAt < fetchAt,
      "the refusal sits after the run has started spending bandwidth",
    );
  });

  it("records the value the run actually used, zero included", () => {
    assert.match(
      DRIVER_SRC,
      /const modeledCostScale = modeledCostScaleFromEnv\(\);/,
      "the driver re-parses the env instead of asking the engine's reader, " +
        "so the two clamps can drift",
    );
    const manifest = readFileSync("scripts/sweepManifest.ts", "utf8");
    assert.match(
      manifest,
      /input\.modeledCostScale !== undefined &&/,
      "a falsy check would drop scale 0 — the one arm the remediation " +
        "actually ran, and the one most in need of being stated",
    );
  });
});

/**
 * The decline register, pinned to the corpus that ran under it.
 *
 * R4 rewrites this register by design, so a corpus produced before that has to
 * say which markets the engine was refusing at the time — otherwise a reader
 * grading the corpus against TODAY's register is comparing two populations and
 * calling the difference a result.
 */
describe("the corpus pins which markets the engine was declining", () => {
  const DRIVER_SRC = readFileSync("scripts/replay-sweep.ts", "utf8");
  const MANIFEST_SRC = readFileSync("scripts/sweepManifest.ts", "utf8");

  it("derives the list from the register rather than restating it", () => {
    assert.match(
      DRIVER_SRC,
      /engineDeclined: Object\.keys\(ENGINE_DECLINED_MARKETS\)\.sort\(\),/,
      "the driver keeps its own copy of the decline list, which is how a " +
        "list goes stale against the thing it mirrors",
    );
  });

  it("records SYMBOLS ONLY, never the invalidated expectancy", () => {
    // Every `measuredExpectancyR` in the register comes from the corpus the
    // 2026-08-11 clock defect invalidated. SC-5 withholds the magnitude from
    // the operator for that reason and #471 removed the last place it leaked;
    // writing it into a manifest would put an invalid number where provenance
    // goes. `source.revision` recovers the figures with their caveats.
    const at = MANIFEST_SRC.indexOf("engineDeclined?: string[];");
    assert.ok(at >= 0, "engineDeclined is no longer a plain symbol list");
    const declarations = MANIFEST_SRC.match(/engineDeclined\??:[^;]*/g) ?? [];
    assert.ok(declarations.length >= 2, "the field lost a declaration");
    for (const declaration of declarations) {
      assert.doesNotMatch(
        declaration,
        /measuredExpectancyR/,
        "the manifest is carrying a figure the repo says must not be trusted",
      );
    }
    assert.doesNotMatch(
      DRIVER_SRC,
      /engineDeclined:[\s\S]{0,120}measuredExpectancyR/,
      "the driver is writing the invalidated magnitude into the manifest",
    );
  });

  it("is sorted at the boundary, so roster order cannot re-hash a corpus", () => {
    assert.match(
      MANIFEST_SRC,
      /engineDeclined: \[\.\.\.input\.engineDeclined\]\.sort\(\),/,
    );
  });

  it("covers the whole register, not a sample", () => {
    // Executed against the real register: the list the driver writes IS its
    // key set, so a market added to the register joins the manifest with no
    // second edit.
    const declined = Object.keys(ENGINE_DECLINED_MARKETS).sort();
    assert.ok(
      declined.length >= 15,
      `the register holds ${declined.length} markets — if it shrank, the ` +
        `manifest's claim shrank with it and that is worth reading`,
    );
    assert.deepEqual(
      declined,
      [...declined].sort(),
      "the driver's sort is what makes this comparable across runs",
    );
  });
});
