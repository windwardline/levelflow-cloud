import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeReplayRecord,
  formatReplayRecord,
  hasOwnMeasuredRecord,
  MEASURED_POPULATION_BY_ASSET_TYPE,
  REPLAY_RECORD_BY_ASSET_TYPE,
} from "../src/lib/replayReliability.ts";
import { SECURITY_OPTIONS } from "../src/lib/symbolMap.ts";

// One known member of each type's measured population (roster at the replay
// commit, 2026-07-30) — the symbol every per-type copy assertion speaks
// through, so no assertion accidentally exercises the null branch.
/**
 * A synthetic row that is NOT superseded.
 *
 * Every live row is, so `describeReplayRecord` renders nothing for all six and
 * the copy assertions below would have no sentence to inspect. They are kept
 * and pointed at `formatReplayRecord` instead, because the rules they pin —
 * the bound rides with the rate, "before costs" is load-bearing, no curation
 * the scan does not perform — apply again the moment the v2 corpus supplies
 * valid rows. Suspending the contract is not the same as dropping it.
 */
const VALID_ROW = { moneyPositiveRate: 0.87, sampleSize: 6106 } as const;

describe("the superseded rows render nothing at all", () => {
  it("refuses every live row, because all six are superseded", () => {
    // §19e: a refusal beats a wrong number. Before this, the operator read
    // "filled setups ended money-positive 89% (±0.1pp) of the time" on forex
    // — a figure from the retired pre-repair evaluator whose repaired
    // baseline measured the accepted stream NEGATIVE in every class.
    let checked = 0;
    for (const [symbol, assetType] of [
      ["SP", "Indices"], ["EURUSD", "Forex"], ["BTCUSD", "Crypto"],
      ["ESUSD", "Futures"], ["XAUUSD", "Metals"], ["WTI", "Energies"],
    ] as const) {
      assert.equal(REPLAY_RECORD_BY_ASSET_TYPE[assetType].superseded, true);
      assert.equal(
        describeReplayRecord(symbol, assetType), null,
        `${assetType} is superseded and must render no record`,
      );
      checked += 1;
    }
    // NON-VACUITY: an empty loop would pass having refused nothing.
    assert.equal(checked, 6);
  });

  it("renders again the moment a row is not superseded", () => {
    // The gate is supersession, not a blanket silence — otherwise the v2
    // corpus would land and the Record row would stay empty with nothing
    // saying why.
    assert.ok(formatReplayRecord(VALID_ROW, "Crypto").length > 0);
  });
});

describe("replay record copy", () => {
  it("states the record as an honest-testing frequency, with its bound, before costs", () => {
    const detail = formatReplayRecord(VALID_ROW, "Crypto");
    const { sampleSize, moneyPositiveRate } = VALID_ROW;
    const rate = Math.round(moneyPositiveRate * 100);
    const se = (
      Math.sqrt(moneyPositiveRate * (1 - moneyPositiveRate) / sampleSize) * 100
    ).toFixed(1);

    assert.equal(
      detail,
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
      const detail = formatReplayRecord(row, assetType);
      assert.match(detail, /before costs\.$/);
      assert.doesNotMatch(detail, /out-of-sample/i);
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
        detail.includes(`(\u00b1${se}pp)`),
        `${assetType}: expected \u00b1${se}pp in: ${detail}`,
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
      const detail = formatReplayRecord(REPLAY_RECORD_BY_ASSET_TYPE[assetType], assetType);
      assert.doesNotMatch(detail, /scans skip it/);
      assert.doesNotMatch(detail, /historical record is weak/);
      // 1h: "measured-edge curation" was one of the run conditions the module
      // docblock listed — a mechanism nothing in the scan path implements.
      assert.doesNotMatch(detail, /curation/i);
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
    // ESUSD IS in the measured population, but its row is superseded, so it
    // renders nothing either — the population gate and the supersession gate
    // are separate and both must hold.
    assert.equal(describeReplayRecord("ESUSD", "Futures"), null);
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
      // TWO INDEPENDENT GATES, PINNED SEPARATELY. Supersession hides every
      // record today, so asserting only the rendered output would stop
      // exercising the population rule entirely — and that rule must survive
      // the v2 corpus landing, when rendering resumes.
      assert.equal(
        describeReplayRecord(option.symbol, option.assetType), null,
        `${option.symbol}: every row is superseded and must render nothing`,
      );
      const inPopulation = MEASURED_POPULATION_BY_ASSET_TYPE[option.assetType]
        ?.has(option.symbol) ?? false;
      assert.equal(
        hasOwnMeasuredRecord(option.symbol, option.assetType),
        inPopulation,
        `${option.symbol} (${option.assetType}): population gate must hold independently of supersession`,
      );
    }
  });

  it("marks EVERY row as superseded, in the sentence itself (round-8 PH-1)", () => {
    // All six figures were measured by the retired pre-repair evaluator,
    // and the first repaired baseline measured the accepted stream negative
    // in every class. Five rows were printing the invalidated record
    // without the file's own flag. The engine-v2 corpus re-measures all
    // six; that re-sweep deletes these clauses by replacing the rows.
    for (const [symbol, assetType] of [
      ["SP", "Indices"],
      ["EURUSD", "Forex"],
      ["BTCUSD", "Crypto"],
      ["ESUSD", "Futures"],
      ["XAUUSD", "Metals"],
      ["WTI", "Energies"],
    ] as const) {
      const record = describeReplayRecord(symbol, assetType);
      if (record === null) {
        continue;
      }
      assert.match(
        record.detail,
        /configuration the engine has since moved past/,
        `${assetType} must state its supersession`,
      );
    }
  });
});
