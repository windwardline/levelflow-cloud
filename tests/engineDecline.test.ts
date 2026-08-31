import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ENGINE_DECLINED_MARKETS,
  engineDeclineSentence,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { cleanReviewMessage } from "../src/components/workspace/reviewCopy.ts";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { knownSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";

/**
 * The fifteen markets the engine will not build a setup for, and the sentence
 * they get.
 *
 * ONE READER-FACING DEFECT, and two that were never on a screen. The first
 * version of this docblock called all three "reader-facing, all live", and
 * that was wrong in a way its own first item proves.
 *
 * 1. THE ONE A READER SAW. All fifteen declined markets were answered "No
 *    current limit setup met the review threshold." — a transient sentence
 *    inviting a rescan that can never succeed, against an FMP quota already
 *    exhausted twice. The honest sentence rode `analysisDiagnostics`, which
 *    `scanOpportunity` and `AdvisorWorkspace` both rebuild without: TWO
 *    boundaries, which is why a fix widening only the server type would have
 *    shipped and done nothing. This is #457 one surface over.
 *
 * 2. `analysisDiagnostics` REACHES NO CLIENT AT ALL. The scan payload is
 *    `{blocked, opportunities, persistence, qualified, scanned}` and none of
 *    the four `setAnalysisState` calls sets the field, so the panel's read of
 *    it is dead code against every path. It reaches `analyzer_events` and
 *    stops. So the score sentence, riding the same channel, never contradicted
 *    the decline on a screen — only in telemetry — and the dead rewrite in
 *    `reviewCopy.ts` had no reader-facing effect either, because nothing it
 *    rewrote ever arrived. The decline now rides `reason`, which is the
 *    channel that does arrive.
 *
 * 3. The score sentence was a tautology on most markets: 72 of the 98 markets
 *    in the symbol map resolve to `confidenceThreshold: 0` through
 *    `getCategoryCalibration`, so it read "requires 0 or higher". 26 carry a
 *    positive threshold and still get it. (An earlier note said "72 of the 81
 *    calibration entries" — the table holds 80, and a per-entry census answers
 *    a different question from a per-market one.)
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

  it("explainNoSetup stops after the decline, but keeps the instrument", () => {
    const at = analyzer.indexOf("diagnostics.push(engineDeclineSentence(declined))");
    assert.ok(at >= 0, "the decline diagnostic is gone");
    // Bounded by the next branch rather than by a character count: the window
    // was 700 characters and the comment explaining WHY the return is there
    // grew past it, so the test failed on prose.
    const branchEnd = analyzer.indexOf("\n    }", at);
    assert.ok(branchEnd > at, "the decline branch no longer closes");
    const branch = analyzer.slice(at, branchEnd);
    assert.match(
      branch,
      /return diagnostics;/,
      "without the return, the score sentence follows the decline into " +
        "analyzer_events and contradicts it there",
    );
    // The instrument is recorded BEFORE the branch, which is the only way an
    // early return can keep it. Asserted by position, because "the push
    // exists somewhere in the file" would pass with it stranded after the
    // return.
    const refusalAt = analyzer.indexOf(
      "The live market has already crossed the computed limit entry",
    );
    assert.ok(refusalAt >= 0, "the crossed-limit reading is gone");
    assert.ok(
      refusalAt < at,
      "the plan-refusal reading sits AFTER the decline's early return, so 15 " +
        "markets stopped contributing to the through-market instrument while " +
        "still paying to compute it — the population would be 82 of 97, " +
        "narrowed as a side effect of a copy fix",
    );
  });

  it("the score sentence is gated on a threshold that can actually reject", () => {
    assert.match(
      analyzer,
      /if \(pricePlan && calibration\.confidenceThreshold > 0\) \{/,
      "a zero threshold makes this sentence true of every score",
    );
  });

  it("and that gate is not cosmetic — most MARKETS carry a zero threshold", () => {
    // THE POPULATION IS THE MARKETS, and this assertion used to count source
    // lines instead. A regex census over `calibration.ts` counts table
    // ENTRIES, which answers a different question: every zero is a per-symbol
    // override while the positive values are category bases covering many
    // markets each, so the two only coincided at 72 by accident. Counting the
    // wrong population is the failure this repo names by name, and it was
    // sitting inside the guard written to stop exactly that.
    //
    // Resolved through `getCategoryCalibration`, which is the function the
    // engine itself calls, so a base/override merge cannot drift from it.
    const thresholds = knownSymbols.map(
      (symbol) => getCategoryCalibration(symbol).confidenceThreshold,
    );
    const zero = thresholds.filter((value) => value === 0).length;
    assert.ok(
      thresholds.length >= 90,
      `only ${thresholds.length} markets resolved — the census is vacuous`,
    );
    assert.ok(
      zero > thresholds.length / 2,
      `only ${zero} of ${thresholds.length} MARKETS carry a zero threshold; ` +
        `if this has fallen below half the tautology is no longer the common ` +
        `case and the gate above deserves re-reading rather than assuming`,
    );
    assert.ok(
      zero < thresholds.length,
      `every market carries a zero threshold, so the gate silences the score ` +
        `sentence everywhere — at that point it is a deletion, not a gate`,
    );
  });
});
