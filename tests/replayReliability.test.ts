import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeReplayRecord,
  REPLAY_RECORD_BY_ASSET_TYPE,
} from "../src/lib/replayReliability.ts";

describe("replay record copy", () => {
  it("states the record as an honest-testing frequency, not a promise", () => {
    const record = describeReplayRecord("Crypto");
    assert.ok(record);
    const { sampleSize, moneyPositiveRate } =
      REPLAY_RECORD_BY_ASSET_TYPE.Crypto;
    const rate = Math.round(moneyPositiveRate * 100);

    assert.equal(
      record!.detail,
      `Across ${sampleSize} past Crypto setups reserved for honest testing, filled setups ended money-positive ${rate}% of the time.`,
    );
    assert.equal(record!.value, `${rate}% money-positive`);
  });

  it("never uses the retired out-of-sample phrasing the language guard bans", () => {
    for (const assetType of Object.keys(
      REPLAY_RECORD_BY_ASSET_TYPE,
    ) as (keyof typeof REPLAY_RECORD_BY_ASSET_TYPE)[]) {
      const record = describeReplayRecord(assetType);
      assert.ok(record);
      assert.doesNotMatch(record!.detail, /out-of-sample/i);
    }
  });

  it("keeps the weak-record caution sentence appended, unchanged, only under the 55% floor", () => {
    // Indices sits below the 0.55 floor today; this pins that the caution
    // sentence is present and worded exactly as before this task's edit —
    // this task changes only the base sentence, never this suffix.
    const weak = describeReplayRecord("Indices");
    assert.ok(weak);
    assert.match(
      weak!.detail,
      /This market's historical record is weak, so Levelflow's scans skip it — review it here only with care\.$/,
    );

    const strong = describeReplayRecord("Crypto");
    assert.ok(strong);
    assert.doesNotMatch(strong!.detail, /historical record is weak/);
  });
});
