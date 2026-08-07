import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeReplayRecord,
  REPLAY_RECORD_BY_ASSET_TYPE,
} from "../src/lib/replayReliability.ts";

describe("replay record copy", () => {
  it("states the record as an honest-testing frequency, before costs", () => {
    const record = describeReplayRecord("BTCUSD", "Crypto");
    assert.ok(record);
    const { sampleSize, moneyPositiveRate } =
      REPLAY_RECORD_BY_ASSET_TYPE.Crypto;
    const rate = Math.round(moneyPositiveRate * 100);

    assert.equal(
      record!.detail,
      `Across ${sampleSize} past Crypto setups reserved for honest testing, ` +
        `filled setups ended money-positive ${rate}% of the time before costs.`,
    );
    assert.equal(record!.value, `${rate}% money-positive before costs`);
  });

  it("never renders a replay figure without its bound", () => {
    // The replay fills whenever price touches the level and subtracts no
    // spread, commission or financing anywhere. A rate presented without
    // "before costs" reads as a net result and is a claim the engine cannot
    // support — the two words are the difference between a ceiling and a
    // forecast. Both the sentence and the short value carry them.
    for (const assetType of Object.keys(
      REPLAY_RECORD_BY_ASSET_TYPE,
    ) as (keyof typeof REPLAY_RECORD_BY_ASSET_TYPE)[]) {
      const record = describeReplayRecord("EURUSD", assetType);
      assert.ok(record);
      assert.match(record!.detail, /before costs\.$/);
      assert.match(record!.value, /before costs$/);
      assert.doesNotMatch(record!.detail, /out-of-sample/i);
    }
  });

  it("claims no curation the scan does not actually perform", () => {
    // Indices sits below the old 0.55 floor and used to append "This market's
    // historical record is weak, so Levelflow's scans skip it". The scan does
    // not skip it — TEMPORARILY_HIDDEN_ASSET_TYPES is empty and defaultScanSymbols
    // excludes only no-trade, unavailable and variant symbols — so the operator
    // could see SP in the results and read, on the next screen, that scans skip
    // it. The damage is not the contradiction; it is that a stated curation rule
    // turned out not to be enforced, which devalues every other rule the app
    // states about itself. A gate must be code, never a sentence.
    for (const assetType of Object.keys(
      REPLAY_RECORD_BY_ASSET_TYPE,
    ) as (keyof typeof REPLAY_RECORD_BY_ASSET_TYPE)[]) {
      const record = describeReplayRecord("EURUSD", assetType);
      assert.ok(record);
      assert.doesNotMatch(record!.detail, /scans skip it/);
      assert.doesNotMatch(record!.detail, /historical record is weak/);
    }
  });

  it("gives agriculture and livestock no record rather than a sibling's", () => {
    // Both display as `Futures`, so keying on the display type handed corn and
    // lean hogs "Across 2,368 past Futures setups ... 83%" — measured on a
    // handful of CME financials weeks before either class existed. A precise,
    // numeric, market-specific sentence is what makes a claim credible, and
    // what makes a wrong one damaging.
    for (const symbol of ["ZCUSX", "ZSUSX", "ZOUSX", "LEUSX", "GFUSX", "HEUSX"]) {
      assert.equal(
        describeReplayRecord(symbol, "Futures"),
        null,
        `${symbol} has no measured record of its own and must render none`,
      );
    }
    // A market that IS in the measured population still gets its record.
    assert.ok(describeReplayRecord("ESUSD", "Futures"));
  });
});
