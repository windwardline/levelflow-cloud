import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advisorExecutionIntervalLabel,
  advisorSignalIntervalLabel,
} from "../src/lib/advisorReview.ts";

describe("advisor interval labels", () => {
  it("maps signal interval codes to plain words joined by comma", () => {
    // ADVISOR_SIGNAL_INTERVALS is ["4H", "1H", "15M"].
    assert.equal(advisorSignalIntervalLabel(), "4-hour, 1-hour, 15-minute");
  });

  it("maps execution interval codes to plain words joined by comma", () => {
    // ADVISOR_EXECUTION_INTERVALS is ["5M", "1M"].
    assert.equal(advisorExecutionIntervalLabel(), "5-minute, 1-minute");
  });

  it("never renders a raw interval code on a working surface", () => {
    for (
      const label of [
        advisorSignalIntervalLabel(),
        advisorExecutionIntervalLabel(),
      ]
    ) {
      assert.doesNotMatch(label, /\b(1M|5M|15M|1H|4H|1D)\b/);
    }
  });
});
