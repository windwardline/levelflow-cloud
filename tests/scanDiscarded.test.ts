import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A scan whose answer was taken away has to say so.
 *
 * AdvisorWorkspace holds two guards that return the rail to null when an
 * account switch makes a finished scan's numbers describe a universe the reader
 * can no longer see. Both are right — a forex account must not sit under a
 * crypto scan's counts — and both were completely silent. The reader pressed
 * Scan, watched rows arrive, and watched the rail empty itself back to its
 * opening state with nothing said.
 *
 * §17c's silent null is for a rail nobody has asked anything yet. It is not for
 * one whose answer was discarded, and the difference is invisible on screen
 * unless the rail says which it is.
 *
 * IT ALSO COST FOUR DEPLOYS. authenticated-workspace.spec.ts:2597 scopes to
 * Crypto and then activates an E8 One account that resolves FOREX, so the
 * classification guard fires and the rail clears. The helper waits for a count
 * line or a failure line, a cleared rail is neither, and the run burned its
 * 150s timeout on a state nothing could ever satisfy — intermittently, because
 * whether the guard wins the race depends on timing. Deploys for #447, #451 and
 * #452 and one re-run all died there while #448-#450 passed.
 *
 * No jsdom in this stack, so the wiring is pinned against source text the way
 * tests/historyPanel.test.tsx and tests/scopeMenu.test.tsx already do.
 */

const WORKSPACE = readFileSync(
  "src/components/workspace/AdvisorWorkspace.tsx",
  "utf8",
);
const PANEL = readFileSync(
  "src/components/workspace/MarketScanPanel.tsx",
  "utf8",
);

export const DISCARDED_MESSAGE =
  "That scan covered markets this account does not trade. Scan again.";

describe("a discarded scan is not a silent one", () => {
  it("renders its own sentence, distinct from every other empty state", () => {
    assert.ok(
      PANEL.includes(DISCARDED_MESSAGE),
      "the rail has no sentence for a discarded scan",
    );
    // The four states must stay four. Folding this into "No markets match the
    // current scan filters." would be worse than silence: that sentence says
    // the scan RAN and found nothing, which is a claim about the market rather
    // than about the account switch that actually happened.
    for (
      const other of [
        "Checking active markets.",
        "Market scan could not complete. Try again shortly.",
        "No markets match the current scan filters.",
      ]
    ) {
      assert.ok(PANEL.includes(other), `${other} went missing from the rail`);
      assert.notEqual(other, DISCARDED_MESSAGE);
    }
  });

  it("gates the sentence on the discard, never on an un-scanned rail", () => {
    // The ordering in the ternary chain is the whole contract: `result` cases
    // are answered first, so a live result can never be described as discarded,
    // and the bare null still renders nothing at all.
    const chain = PANEL.slice(PANEL.indexOf("const emptyMessage"));
    const body = chain.slice(0, chain.indexOf(";"));
    assert.match(body, /: scanDiscarded\s*\n?\s*\/\//);
    assert.ok(
      body.indexOf("result?.failed") < body.indexOf("scanDiscarded"),
      "a failed scan must answer before the discard branch",
    );
    assert.ok(
      body.trimEnd().endsWith(": null"),
      "the un-scanned rail must still fall through to null (§17c)",
    );
  });

  it("is raised by the classification guard and lowered by the next scan", () => {
    // Raised where the discard actually happens, and lowered when a new scan
    // starts — otherwise the sentence outlives the condition it describes and
    // becomes its own stale claim.
    assert.match(
      WORKSPACE,
      /!== scanClassification\) \{\s*setScanDiscarded\(true\);\s*\}/,
      "nothing raises the discard flag on a classification mismatch",
    );
    assert.match(
      WORKSPACE,
      /setScanDiscarded\(false\);\s*setScanStatus\("scanning"\)/,
      "a new scan must clear the previous discard before it starts",
    );
  });

  it("keeps the flag out of the pinned clear sequences", () => {
    // tests/marketScanFilters.test.ts pins both guards' clears as contiguous
    // sequences, precisely so a future edit cannot move them apart. Adding a
    // line inside either one silently breaks that guard, which is how this
    // change first failed — so the separation is asserted here too, from the
    // side that would otherwise only discover it by breaking the other file.
    assert.match(
      WORKSPACE,
      /setScanResult\(null\);\s*setScanCompletedAt\(null\);\s*setScanClassification\(null\);\s*\}/,
      "the pinned clear sequence has something wedged into it again",
    );
  });

  it("reaches both surfaces, not just the desktop rail", () => {
    // The mobile scan surface renders MarketScanResults directly rather than
    // through MarketScanPanel, so a prop threaded only through the panel
    // reaches one of the two. The 375px leg of the same E2E is where this
    // last failed.
    assert.equal(
      (WORKSPACE.match(/scanDiscarded=\{scanDiscarded\}/g) ?? []).length,
      2,
      "both the panel and the mobile surface must receive the flag",
    );
  });
});
