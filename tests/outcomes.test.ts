import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OUTCOME_COPY } from "../src/lib/outcomes.ts";

describe("outcome copy — plain target vocabulary", () => {
  it("labels the partial-target outcome around the first target, not TP1", () => {
    assert.equal(OUTCOME_COPY.partial_target.label, "First target reached");
    assert.equal(
      OUTCOME_COPY.partial_target.filterLabel,
      "First target reached",
    );
    assert.equal(OUTCOME_COPY.partial_target.shortLabel, "Target 1");
  });

  it("describes the partial-target outcome in first/second-target language", () => {
    assert.match(OUTCOME_COPY.partial_target.description, /first target/i);
    assert.match(OUTCOME_COPY.partial_target.description, /second target/i);
  });

  it("never mentions TP1 or runner in any outcome copy string", () => {
    for (const [outcome, copy] of Object.entries(OUTCOME_COPY)) {
      for (const [field, value] of Object.entries(copy)) {
        assert.doesNotMatch(value, /\bTP1\b/, `${outcome}.${field}: "${value}"`);
        assert.doesNotMatch(
          value,
          /\brunner\b/i,
          `${outcome}.${field}: "${value}"`,
        );
      }
    }
  });
});
