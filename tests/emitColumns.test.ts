import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { assertEmitColumns } from "../scripts/sweepStats.ts";

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
