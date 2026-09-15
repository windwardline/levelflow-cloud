import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Amendment 43 (owner ruling, 2026-09-14): every constant in an execution
 * profile carries a derivation where it is defined, or it carries the word
 * JUDGED and the reason it could not be derived.
 *
 * The amendment states a rule that is a grep, and a rule of that shape without
 * a guard is a rule that the next constant quietly breaks. This is the guard.
 *
 * It reads the SOURCE rather than importing the table, because what the law
 * governs is what a reader sees at the definition. A number is not marked by
 * being marked in a research record somewhere — that is the exact failure the
 * amendment names, and the crypto case is the worked example: the sampled book
 * floor recorded in `venueCosts.ts` does not derive `EXECUTION_PROFILES.crypto`,
 * and for five weeks the repository's own rulings record said it did.
 */

const SOURCE_PATH = "supabase/functions/trade-analyzer/executionQuality.ts";
const SOURCE = readFileSync(SOURCE_PATH, "utf8");

/**
 * The asset types, written down rather than derived from the table under test.
 * A count taken from the same source the test reads cannot fail — it holds for
 * any source, including one with every profile deleted. Adding a ninth asset
 * type must fail here and be looked at.
 */
const ASSET_TYPES = [
  "agriculture",
  "crypto",
  "energies",
  "forex",
  "futures",
  "indices",
  "livestock",
  "metals",
] as const;

/** The contiguous `//` block immediately above a profile's opening line. */
function commentAbove(profile: string): string {
  const lines = SOURCE.split("\n");
  const at = lines.findIndex((line) => line.trimEnd() === `  ${profile}: {`);
  assert.notEqual(
    at,
    -1,
    `${SOURCE_PATH} has no profile opening for "${profile}" — the table was ` +
      `renamed or reshaped, so this guard is reading nothing`,
  );
  const block: string[] = [];
  for (let i = at - 1; i >= 0 && lines[i].trim().startsWith("//"); i -= 1) {
    block.unshift(lines[i]);
  }
  return block.join("\n");
}

describe("amendment 43 — an execution-profile constant is derived or it says JUDGED", () => {
  it("finds the table at all, so a rename fails here rather than passing vacuously", () => {
    assert.match(
      SOURCE,
      /const EXECUTION_PROFILES: Record<AssetType, ExecutionProfile> = \{/,
      `${SOURCE_PATH} no longer declares EXECUTION_PROFILES as this guard expects`,
    );
    const opened = ASSET_TYPES.filter((t) =>
      SOURCE.includes(`\n  ${t}: {`)
    ).length;
    assert.equal(
      opened,
      8,
      `${opened} of the 8 asset types open a profile block; the guard must see all of them`,
    );
  });

  for (const profile of ASSET_TYPES) {
    it(`marks ${profile} as DERIVED or JUDGED at its definition`, () => {
      const comment = commentAbove(profile);
      assert.ok(
        comment.length > 0,
        `${profile} carries no comment at its definition, so its two bps terms ` +
          `state no provenance at all — amendment 43 requires a derivation or ` +
          `the word JUDGED with the reason`,
      );
      assert.match(
        comment,
        /\b(DERIVED|JUDGED)\b/,
        `${profile}'s comment names neither DERIVED nor JUDGED. Amendment 43 ` +
          `makes silence the defect: an unmarked constant reads as a measured ` +
          `one. Comment above ${profile}:\n${comment}`,
      );
    });
  }

  it("keeps the two that really are derived distinguishable from the six that are not", () => {
    // Non-vacuity in literals: if this test could pass with every profile
    // marked the same way, it would not be checking the distinction the
    // amendment exists to preserve.
    const derived = ASSET_TYPES.filter((t) => /\bDERIVED\b/.test(commentAbove(t)));
    const judged = ASSET_TYPES.filter((t) => /\bJUDGED\b/.test(commentAbove(t)));
    assert.deepEqual(
      [...derived].sort(),
      ["agriculture", "livestock"],
      `only agriculture and livestock carry a worked tick-over-price derivation`,
    );
    assert.equal(
      judged.length,
      6,
      `${judged.length} profiles are marked JUDGED, expected 6: ${judged.join(", ")}`,
    );
  });
});
