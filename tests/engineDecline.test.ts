import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ENGINE_DECLINED_MARKETS,
  engineDeclineSentence,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { cleanReviewMessage } from "../src/components/workspace/reviewCopy.ts";

/**
 * The fifteen markets the engine will not build a setup for, and the sentence
 * they get.
 *
 * THREE DEFECTS SHIPPED TOGETHER HERE, all reader-facing, all live:
 *
 * 1. The honest sentence reached nobody. It rode `analysisDiagnostics`, and
 *    `scanOpportunity` rebuilds the blocked candidate field by field while
 *    `AdvisorWorkspace` rebuilds it AGAIN — TWO boundaries, neither carrying
 *    the field. Every declined market was answered "No current limit setup met
 *    the review threshold.": a transient sentence inviting a rescan that can
 *    never succeed, against an FMP quota already exhausted twice. This is #457
 *    one surface over, and the reason a fix that widened only the server type
 *    would have shipped and done nothing.
 *
 * 2. The decline branch did not return, so the score sentence printed directly
 *    beneath it — telling the reader to come back with a higher score on a
 *    market whose record is the reason no score would help.
 *
 * 3. That score sentence was a tautology anyway: 72 of the 81 calibration
 *    entries carry `confidenceThreshold: 0`, so it read "requires 0 or higher".
 *
 * And the sentence itself claimed something false. It ended "after the venue's
 * published costs" while `remediation-program-2026-08-11.md` records that the
 * cost scale never reached the resolver — "the sentence shipped on all fifteen
 * was false". The register's internal `reason` was corrected on 2026-08-11 and
 * the operator-facing sentence was not, so the two disagreed for nineteen days.
 */

const DECLINED = Object.entries(ENGINE_DECLINED_MARKETS);

describe("the decline sentence says only what the corpus supports", () => {
  it("never claims a cost-adjusted measurement, on any entry", () => {
    // DERIVED from the register, not a sampled market: the clause was wrong on
    // all fifteen and a spot check would pass while one entry kept it.
    let checked = 0;
    for (const [symbol, decline] of DECLINED) {
      const sentence = engineDeclineSentence(decline);
      assert.doesNotMatch(
        sentence,
        /published costs|after the venue|after costs/i,
        `${symbol}: the cost clause is the claim amendment 36's standard was ` +
          `never met for — it cannot be said to a reader`,
      );
      assert.doesNotMatch(
        sentence,
        /-?\d+\.\d+\s*R/i,
        `${symbol}: the magnitude comes from the invalidated corpus (SC-5)`,
      );
      checked++;
    }
    assert.equal(checked, DECLINED.length);
    // NON-VACUITY: an empty register would pass every loop above.
    assert.ok(checked >= 15, `only ${checked} declined markets — register shrank`);
  });

  it("states the direction and the way back in, on every entry", () => {
    for (const [symbol, decline] of DECLINED) {
      const sentence = engineDeclineSentence(decline);
      assert.match(
        sentence,
        /measured record is negative/,
        `${symbol}: the direction IS the decline — it cannot be dropped`,
      );
      assert.ok(
        sentence.includes(decline.reprobe),
        `${symbol}: a decline without its reprobe is a dead end, not a verdict`,
      );
    }
  });

  it("is rewritten for the reader rather than shipped raw", () => {
    // The coupling that broke last time: the rewrite's pattern demanded the
    // cost clause, so correcting the engine's wording without correcting the
    // rule would silently send the raw engine sentence to all fifteen. This
    // asserts the rule still FIRES on what the engine now emits.
    for (const [symbol, decline] of DECLINED) {
      const raw = engineDeclineSentence(decline);
      const shown = cleanReviewMessage(raw);
      assert.notEqual(
        shown,
        raw,
        `${symbol}: the decline rewrite is dead against the engine's wording`,
      );
      assert.doesNotMatch(
        shown,
        /published costs|after the venue/i,
        `${symbol}: the rewrite reintroduced the false clause`,
      );
    }
  });
});

describe("the decline reaches the reader across both rebuilds", () => {
  const analyzer = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );
  const workspace = readFileSync(
    "src/components/workspace/AdvisorWorkspace.tsx",
    "utf8",
  );

  /**
   * The fields a rebuild actually carries, read out of the object literal
   * rather than counted. #457's guard counted ENGINE sites and was blind to a
   * field dropped in transit; the only thing that catches that is reading the
   * literal the transit builds.
   */
  function fieldsOfLiteral(
    source: string,
    anchor: string,
    mustContain: string,
  ): Set<string> {
    // `mustContain` selects the RIGHT literal rather than the first one with a
    // matching name. AdvisorWorkspace builds several `response: {` objects and
    // the first is the success path; anchoring on the name alone read that one
    // and reported a missing field that was never expected there.
    let at = -1;
    for (
      let from = source.indexOf(anchor);
      from >= 0;
      from = source.indexOf(anchor, from + 1)
    ) {
      if (source.slice(from, from + 600).includes(mustContain)) {
        at = from;
        break;
      }
    }
    assert.ok(at >= 0, `rebuild site is gone: ${anchor} containing ${mustContain}`);
    let depth = 0;
    let end = at;
    for (let i = at; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    assert.ok(end > at, `unbalanced literal at ${anchor}`);
    const body = source.slice(at, end);
    return new Set(
      Array.from(body.matchAll(/^\s{6,}([a-zA-Z][a-zA-Z0-9]*):/gm)).map((m) =>
        m[1]
      ),
    );
  }

  it("scanOpportunity's blocked candidate carries reason", () => {
    const fields = fieldsOfLiteral(analyzer, "blocked: {", "blocked: true");
    assert.ok(
      fields.has("reason"),
      `the scan rebuild dropped reason — it carries ${[...fields].join(", ")}`,
    );
  });

  it("AdvisorWorkspace's response carries reason", () => {
    // The second boundary, and the one the recommendation that produced this
    // work had missed. Its own comment says widening the server alone is a
    // no-op; that comment is only true because THIS rebuild exists.
    const fields = fieldsOfLiteral(workspace, "response: {", "blocked: true");
    assert.ok(
      fields.has("reason"),
      `the workspace rebuild dropped reason — it carries ${
        [...fields].join(", ")
      }`,
    );
  });

  it("the panel reads reason first, so the decline is the primary sentence", () => {
    const panel = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    const at = panel.indexOf("const reasons = uniqueReviewMessages([");
    assert.ok(at >= 0, "NoSetupPanel no longer assembles its reasons");
    const list = panel.slice(at, panel.indexOf("]);", at));
    assert.match(
      list,
      /uniqueReviewMessages\(\[\s*\n\s*result\.reason/,
      "reason must come first, or the decline is buried under a near-miss line",
    );
  });
});

describe("a decline is not answered as a near miss", () => {
  const analyzer = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  it("explainNoSetup stops after the decline", () => {
    const at = analyzer.indexOf("diagnostics.push(engineDeclineSentence(declined))");
    assert.ok(at >= 0, "the decline diagnostic is gone");
    const after = analyzer.slice(at, at + 700);
    assert.match(
      after,
      /return diagnostics;/,
      "without the return, the score sentence prints beneath the decline and " +
        "contradicts it",
    );
  });

  it("the score sentence is gated on a threshold that can actually reject", () => {
    assert.match(
      analyzer,
      /if \(pricePlan && calibration\.confidenceThreshold > 0\) \{/,
      "a zero threshold makes this sentence true of every score",
    );
  });

  it("and that gate is not cosmetic — most markets carry a zero threshold", () => {
    // The number that makes the gate load-bearing, DERIVED rather than
    // asserted: if thresholds are restored the sentence starts speaking again
    // on its own, and this assertion is what would notice the premise moving.
    const calibration = readFileSync(
      "supabase/functions/trade-analyzer/calibration.ts",
      "utf8",
    );
    const all = calibration.match(/confidenceThreshold: \d+/g) ?? [];
    const zero = all.filter((entry) => entry.endsWith(" 0")).length;
    assert.ok(all.length > 0, "no thresholds found — the census is vacuous");
    assert.ok(
      zero > all.length / 2,
      `only ${zero} of ${all.length} thresholds are zero; if this has fallen ` +
        `below half, the tautology is no longer the common case and the gate ` +
        `above deserves re-reading rather than assuming`,
    );
  });
});
