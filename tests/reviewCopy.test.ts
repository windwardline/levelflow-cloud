import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanReviewMessage } from "../src/components/workspace/reviewCopy.ts";

describe("the payoff refusal names its cause (round-8 PH-9)", () => {
  it("translates the cost-driven refusal distinctly from the geometry one", () => {
    assert.equal(
      cleanReviewMessage(
        "Trading costs took the payoff from 2.10x to 1.18x; Levelflow requires at least 1.25x for this market.",
      ),
      "Trading costs took the payoff from 2.10x to 1.18x (1.25x required).",
    );
    assert.equal(
      cleanReviewMessage(
        "Payoff was 1.10x; Levelflow requires at least 1.25x for this market.",
      ),
      "The target was not far enough from the entry to justify the risk (1.10x payoff; 1.25x required).",
    );
  });

  it("the cost sentence covers the whole bill, old rows included", () => {
    assert.equal(
      cleanReviewMessage("Estimated trading costs reduced the setup score by 4."),
      "Trading costs reduced the score by 4.",
    );
    assert.equal(
      cleanReviewMessage(
        "Estimated spread and slippage reduced the setup score by 4.",
      ),
      "Trading costs reduced the score by 4.",
    );
  });
});
