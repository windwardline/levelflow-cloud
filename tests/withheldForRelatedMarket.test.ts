import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A market that produced a qualifying setup was told none was found.
 *
 * The panel decided whether a market had been withheld for a related one by
 * pattern-matching the reason sentence:
 *
 *   /stronger (?:related|closely linked) setup/i
 *
 * The engine has TWO withholding paths and they word it differently:
 *
 *   cross-scan  "A stronger closely linked setup is already active on EURUSD."
 *               -> matches
 *   collapse    "Showing EURUSD instead; it is the STRONGEST current setup
 *                among closely linked markets."
 *               -> does not match
 *
 * So half the withholdings rendered as "Nothing passed review" — on a market
 * whose setup really had been found and deliberately held back in favour of a
 * stronger sibling. The operator was told the opposite of what happened.
 *
 * It is a field now. A branch that reads prose breaks silently every time the
 * prose is improved, and improving prose is something this repo does weekly.
 */

const ENGINE = readFileSync("supabase/functions/trade-analyzer/index.ts", "utf8");
const PANEL = readFileSync(
  "src/components/workspace/AdvisorRecommendationPanel.tsx",
  "utf8",
);
const WORKSPACE = readFileSync(
  "src/components/workspace/AdvisorWorkspace.tsx",
  "utf8",
);
const TYPES = readFileSync("src/lib/tradeAnalyzer.ts", "utf8");

/** Every reason sentence the engine emits for a correlation withholding. */
function withholdingSentences(): string[] {
  return (ENGINE.match(/`[^`]*closely linked[^`]*`/g) ?? []).map((raw) =>
    raw.slice(1, -1)
  );
}

describe("a withheld market says so as a field", () => {
  it("still emits both withholding sentences, worded differently", () => {
    // The premise. If the engine ever collapsed these into one wording the
    // retired regex would start working again, and this file's reason for
    // existing would need restating rather than quietly evaporating.
    const sentences = withholdingSentences();
    assert.ok(
      sentences.length >= 2,
      `expected two distinct withholding sentences, found ${sentences.length}`,
    );
    assert.ok(
      sentences.some((line) => /stronger closely linked setup/i.test(line)),
      "the cross-scan sentence is gone",
    );
    assert.ok(
      sentences.some((line) => /strongest current setup/i.test(line)),
      "the collapse sentence is gone",
    );
  });

  it("proves the retired regex only ever matched one of them", () => {
    // Executed against the engine's own strings rather than asserted from
    // memory: this is the arithmetic of the defect, and it is the reason the
    // branch had to stop reading prose.
    const retired = /stronger (?:related|closely linked) setup/i;
    const matched = withholdingSentences().filter((line) => retired.test(line));
    assert.equal(
      matched.length,
      1,
      "the retired regex should match exactly one of the two withholding " +
        "sentences — if it now matches both or neither, the defect this file " +
        "documents has changed shape",
    );
  });

  it("sets withheldFor on BOTH engine paths", () => {
    // Fixing only the sentence that failed would leave the same coin-flip in
    // place for the next wording change.
    //
    // NAMED, NOT COUNTED. This asserted `=== 2` until the rebuild in
    // scanOpportunity became a third site — and a raw count is exactly the
    // shape that let the field be lost in transit while this file stayed
    // green. Each producer is pinned by the expression that sets it.
    assert.match(ENGINE, /withheldFor: winner\.symbol/);
    assert.match(ENGINE, /withheldFor: strongerExisting\.symbol/);
  });

  it("carries it across the client boundary, which is where it would be lost", () => {
    // Widening the server alone is a no-op against the type. adoptScanVerdict
    // rebuilds the response from named fields, so anything it does not name is
    // dropped between the scan and the panel.
    assert.match(TYPES, /withheldFor\?: SupportedSymbol;/);
    assert.match(WORKSPACE, /withheldFor: blocked\.withheldFor/);
  });

  it("branches on the field and nowhere on the sentence", () => {
    assert.match(
      PANEL,
      /const relatedMarketBlocked = Boolean\(result\.withheldFor\)/,
      "the panel is not reading the typed field",
    );
    assert.doesNotMatch(
      PANEL,
      /stronger \(\?:related\|closely linked\) setup/,
      "the prose-matching branch is back",
    );
  });
});

/** scanOpportunity's blocked rebuild — the one narrowing between engine and client. */
function rebuildBlock(): string {
  const at = ENGINE.indexOf("const review = await reviewCurrentMarket");
  assert.ok(at >= 0, "scanOpportunity no longer calls reviewCurrentMarket");
  const from = ENGINE.indexOf("blocked: {", at);
  assert.ok(from >= 0, "the blocked rebuild is gone");
  return ENGINE.slice(from, ENGINE.indexOf("},", from) + 2);
}

describe("withheldFor survives the trip to the panel", () => {
  // WHY THIS EXISTS SEPARATELY. The guard above counts engine sites, and it
  // passed while the field was provably lost: scanOpportunity rebuilds the
  // blocked candidate FIELD BY FIELD, so anything it does not name is dropped
  // between the review and the panel. #457 set withheldFor at both engine sites
  // and missed the rebuild, which took the cross-scan withholding from working
  // — the panel's retired regex matched its sentence — to broken.
  //
  // A count of producers cannot see a value dropped in transit. This pins the
  // hand-off itself.
  it("is carried by scanOpportunity's rebuild", () => {
    const block = rebuildBlock();
    assert.match(
      block,
      /blocked: \{[\s\S]*?withheldFor: review\.withheldFor,[\s\S]*?\}/,
      "scanOpportunity drops withheldFor again, so every scan-path withholding " +
        "renders as 'Nothing passed review'",
    );
  });

  it("names every field the panel needs, at the one place they are re-listed", () => {
    // The general form: the panel reads `reason` and `withheldFor`, and this
    // rebuild is the only narrowing between the engine and the client. Both
    // must appear or the panel is reading undefined.
    const block = rebuildBlock();
    for (const field of ["reason: review.reason", "withheldFor: review.withheldFor"]) {
      assert.ok(block.includes(field), `the rebuild no longer carries ${field}`);
    }
  });
});
