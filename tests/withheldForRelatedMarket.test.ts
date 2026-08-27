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
    assert.equal(
      (ENGINE.match(/withheldFor: /g) ?? []).length,
      2,
      "both the collapse path and the cross-scan path must state withheldFor",
    );
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
