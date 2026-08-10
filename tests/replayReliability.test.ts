import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeReplayRecord,
  MEASURED_POPULATION_BY_ASSET_TYPE,
  REPLAY_RECORD_BY_ASSET_TYPE,
} from "../src/lib/replayReliability.ts";
import { SECURITY_OPTIONS } from "../src/lib/symbolMap.ts";

// One known member of each type's measured population (roster at the replay
// commit, 2026-07-30) — the symbol every per-type copy assertion speaks
// through, so no assertion accidentally exercises the null branch.
const MEASURED_MEMBER_BY_ASSET_TYPE: Record<string, string> = {
  Crypto: "BTCUSD",
  Energies: "WTI",
  Forex: "EURUSD",
  Futures: "ESUSD",
  Indices: "SP",
  Metals: "XAUUSD",
};

describe("replay record copy", () => {
  it("states the record as an honest-testing frequency, with its bound, before costs", () => {
    const record = describeReplayRecord("BTCUSD", "Crypto");
    assert.ok(record);
    const { sampleSize, moneyPositiveRate } =
      REPLAY_RECORD_BY_ASSET_TYPE.Crypto;
    const rate = Math.round(moneyPositiveRate * 100);
    const se = (
      Math.sqrt(moneyPositiveRate * (1 - moneyPositiveRate) / sampleSize) * 100
    ).toFixed(1);

    assert.equal(
      record!.detail,
      `Across ${sampleSize} past Crypto setups reserved for honest testing, ` +
        `filled setups ended money-positive ${rate}% (±${se}pp) of the time before costs.`,
    );
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
      const row = REPLAY_RECORD_BY_ASSET_TYPE[assetType];
      const member = MEASURED_MEMBER_BY_ASSET_TYPE[assetType];
      const record = describeReplayRecord(member, assetType);
      assert.ok(record);
      assert.match(record!.detail, /before costs\.$/);
      assert.doesNotMatch(record!.detail, /out-of-sample/i);
      // 1j: the statistical bound rides with the rate — one standard error
      // of a binomial proportion, in percentage points, derived from the
      // row's own n and p rather than typed beside them. Indices' 51% on
      // 952 is +/-1.6pp — a figure indistinguishable from a coin flip, and
      // the sentence now says so instead of printing it in the same grammar
      // as forex's 89% on 123,254 (+/-0.1pp).
      const se = (
        Math.sqrt(row.moneyPositiveRate * (1 - row.moneyPositiveRate) / row.sampleSize) * 100
      ).toFixed(1);
      assert.ok(
        record!.detail.includes(`(\u00b1${se}pp)`),
        `${assetType}: expected \u00b1${se}pp in: ${record!.detail}`,
      );
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
      const record = describeReplayRecord(MEASURED_MEMBER_BY_ASSET_TYPE[assetType], assetType);
      assert.ok(record);
      assert.doesNotMatch(record!.detail, /scans skip it/);
      assert.doesNotMatch(record!.detail, /historical record is weak/);
      // 1h: "measured-edge curation" was one of the run conditions the module
      // docblock listed — a mechanism nothing in the scan path implements.
      assert.doesNotMatch(record!.detail, /curation/i);
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

// 1g: a record belongs to the population it was measured on — derived from
// the roster at the replay commit (d947245, 2026-07-30), not subtracted by
// class. The old guard excluded agriculture and livestock by name and let
// every OTHER market onboarded since inherit a record that predates it:
// twelve newer Futures rows, twenty-five newer cryptos, every promoted
// forex exotic.
describe("the record gates on the measured population, not a class subtraction", () => {
  it("renders no record for a market the measurement predates", () => {
    // One live example per type where the roster has grown since 2026-07-30,
    // found from today's roster at runtime so the test stays true as the
    // roster moves again.
    for (const option of SECURITY_OPTIONS) {
      const measured = describeReplayRecord(option.symbol, option.assetType);
      const inPopulation = MEASURED_POPULATION_BY_ASSET_TYPE[option.assetType]
        ?.has(option.symbol) ?? false;
      assert.equal(
        measured !== null,
        inPopulation,
        `${option.symbol} (${option.assetType}): record iff measured`,
      );
    }
  });

  it("marks the one superseded row as superseded, in the sentence itself", () => {
    // Round 28 (2026-08-06) moved indices' shipped geometry — review window
    // 5 -> 8h, stop cap 3.0 -> 1.0 — so the 952 setups were produced by an
    // engine the shipped one no longer is. The sentence says so; re-measuring
    // is calibration item 4's first act, and this clause is what it deletes.
    const indices = describeReplayRecord("SP", "Indices");
    assert.ok(indices);
    assert.match(indices!.detail, /configuration the engine has since moved past/);
    const forex = describeReplayRecord("EURUSD", "Forex");
    assert.ok(forex);
    assert.doesNotMatch(forex!.detail, /moved past/);
  });
});
