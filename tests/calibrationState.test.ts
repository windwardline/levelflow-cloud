import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ENGINE_DECLINED_MARKETS,
  getAssetType,
  getCategoryCalibration,
  getClassCalibration,
  getSymbolCalibrationOverride,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { getSessionContext } from "../supabase/functions/trade-analyzer/sessions.ts";
import {
  defaultScanSymbols,
  noTradeSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  confidenceThresholdForAssetOrSymbol,
  reviewWindowHoursForSymbol,
} from "../src/lib/advisorReview.ts";
import { REPLAY_RECORD_BY_ASSET_TYPE } from "../src/lib/replayReliability.ts";
import { SECURITY_OPTIONS, type SecurityType } from "../src/lib/symbolMap.ts";

// The state of record after the 23-round calibration arc (2026-07-30,
// docs/trade-model.md "Current engine state"). Every value here was
// derived at full history under the walk-forward both-splits gate and is
// FROZEN until the resumption protocol reopens the work. A failure in
// this file means someone changed a derived constant without a round —
// that is the point.
const STATE = {
  // Stop caps DERIVED 2026-08-06 from a 102-market grid read by TOTAL R across
  // both splits. Six classes tightened to 1.0; metals HELD at 1.6 (test R
  // improves but train degrades, the one class preferring a wider stop); indices
  // LOOSENED to 3.0, the opposite direction, exactly as the stop-provenance split
  // predicted. Total test R: forex +30457 -> +49828, crypto +3627 -> +4375,
  // futures +855 -> +1260, agriculture +161 -> +194, energies +58 -> +119,
  // livestock +1.4 -> +27.8, indices -32.4 -> -5.6 (still negative, still withheld).
  //
  // Agriculture and livestock are new classes and appear in this table for the
  // first time; both are derived, and livestock's 24h window is what made it
  // measurable at all.
  // Confidence floors ALL re-derived 2026-08-06 from the final 1,020,464-setup
  // sweep at the shipped geometry: crypto 82->25, forex 40->20, futures 68->25,
  // metals 90->30, energies 69->85, livestock 30->40. The old values predate the
  // execution-cost and stop-cap corrections, so they were gating against
  // expectancy curves the engine no longer produces. Two exceptions, both
  // deliberate: agriculture HOLDS at 30 because no floor survives its curve
  // (test expectancy dips negative above every candidate), and indices HOLDS at
  // 68 because its sample is starved — 55-70% of decisions rejected at the
  // geometry stage — and amendment 25 forbids a verdict either way on that.
  agriculture: { threshold: 30, window: 6, stopCap: 1.0, tp1: 0.4, runner: 1.4, offsets: [0.58, 0.75], payoff: 1.25, newsCap: 8 },
  livestock: { threshold: 40, window: 24, stopCap: 1.0, tp1: 0.4, runner: 0.6, offsets: [0.58, 0.75], payoff: 1.25, newsCap: 8 },
  crypto: { threshold: 25, window: 12, stopCap: 1.0, tp1: 0.4, runner: 1.0, offsets: [0.78, 0.8], payoff: 1.3, newsCap: 4 },
  energies: { threshold: 85, window: 6, stopCap: 1.0, tp1: 0.8, runner: 0.8, offsets: [0.6, 0.48], payoff: 1.25, newsCap: 8 },
  forex: { threshold: 20, window: 8, stopCap: 1.0, tp1: 0.4, runner: 1.0, offsets: [0.55, 0.55], payoff: 1.2, newsCap: 8 },
  futures: { threshold: 25, window: 6, stopCap: 1.0, tp1: 0.4, runner: 1.0, offsets: [0.58, 0.75], payoff: 1.25, newsCap: 8 },
  // indices ROUND 28 (2026-08-06): window 5 -> 8, stopCap 3.0 -> 1.0, tp1 1.2 ->
  // 0.4. The 3.0 cap derived the day before is REVERSED, and the reversal is the
  // finding: it was measured with tp1RiskShare pinned at 1.2, where TP1 sits
  // further out than the stop, so widening the cap was buying relief from a TP1
  // constraint and reporting it as a stop-cap result. Survival 37% -> 96%,
  // setups 512 -> 1421, train R +25.3 -> +38.2, test R +7.4 -> +19.2.
  indices: { threshold: 68, window: 8, stopCap: 1.0, tp1: 0.4, runner: 1.0, offsets: [0.18, 0.12], payoff: 1.2, newsCap: 9 },
  metals: { threshold: 30, window: 8, stopCap: 1.6, tp1: 0.4, runner: 0.8, offsets: [0.75, 0.78], payoff: 1.25, newsCap: 8 },
} as const;

const REPRESENTATIVE: Record<keyof typeof STATE, string> = {
  agriculture: "ZCUSX",
  livestock: "LEUSX",
  crypto: "BTCUSD",
  energies: "WTI",
  forex: "EURUSD",
  futures: "ESUSD",
  indices: "SP",
  metals: "XAUUSD",
};

const ASSET_TYPE_BY_CLASS: Record<keyof typeof STATE, SecurityType> = {
  // Both new classes carry the "Futures" SecurityType: the DISPLAY taxonomy is a
  // separate axis from the engine's calibration class, and E8 offers corn and
  // cattle on its futures program. Keeping the two axes independent is what let
  // agriculture and livestock get their own geometry without inventing a new
  // display group or moving a single market between account types.
  agriculture: "Futures",
  livestock: "Futures",
  crypto: "Crypto",
  energies: "Energies",
  forex: "Forex",
  futures: "Futures",
  indices: "Indices",
  metals: "Metals",
};

describe("calibration state of record (arc complete 2026-07-30)", () => {
  for (const [cls, expected] of Object.entries(STATE)) {
    it(`pins ${cls} exactly`, () => {
      // The CLASS row directly (4d, 2026-08-11): the representatives now
      // carry derived per-market cells, and this table pins the class
      // state those cells layer over — the derived layer has its own
      // artifact-driven pins below.
      const c = getClassCalibration(cls as keyof typeof STATE);
      assert.equal(c.confidenceThreshold, expected.threshold);
      assert.equal(c.defaultReviewHours, expected.window);
      assert.equal(c.maxStopAtrMultiplier, expected.stopCap);
      assert.equal(c.tp1RiskShare, expected.tp1);
      assert.equal(c.runnerWindowShare, expected.runner);
      assert.equal(c.entryOffsetDefault, expected.offsets[0]);
      assert.equal(c.entryOffsetTrend, expected.offsets[1]);
      assert.equal(c.minRewardRisk, expected.payoff);
      assert.equal(c.maxNewsPenalty, expected.newsCap);
      assert.deepEqual(c.blockedRegimes, ["volatile_chop"]);
    });
  }

  it("pins the r5 buy-side tilt where it was measured, nowhere else", () => {
    assert.equal(getCategoryCalibration("EURUSD").sideScoreAdjustments?.buy, -6);
    assert.equal(getCategoryCalibration("ESUSD").sideScoreAdjustments?.buy, -6);
    assert.equal(getCategoryCalibration("XAUUSD").sideScoreAdjustments?.buy ?? 0, 0);
    assert.equal(getCategoryCalibration("BTCUSD").sideScoreAdjustments?.buy ?? 0, 0);
  });

  it("pins the oil overrides and only the oil overrides on geometry", () => {
    // Both crudes now ALSO carry derived 4d cells; the legacy banking
    // geometry stays measured-active beneath them, which is what this
    // pin protects.
    for (const oil of ["BZUSD", "CLUSD"]) {
      const c = getCategoryCalibration(oil);
      assert.equal(c.tp1RiskShare, 0.6, `${oil} keeps late banking`);
      assert.equal(c.runnerWindowShare, 0.8, `${oil} keeps the wider runner`);
      assert.equal(c.confidenceThreshold, 0, `${oil} derived floor`);
    }
  });

  it("keeps the UI review-window mirror in parity for every class", () => {
    // Resolved by SYMBOL, not by SecurityType. On 2026-08-06 the two stopped
    // being interchangeable: agriculture and livestock are separate calibration
    // classes that both DISPLAY as Futures, with windows of 6h and 24h. Keyed by
    // SecurityType this test could not even express the requirement — and the UI
    // would have told a lean-hogs user "6h" while the engine used 24.
    for (const [cls, assetType] of Object.entries(ASSET_TYPE_BY_CLASS)) {
      const symbol = REPRESENTATIVE[cls as keyof typeof STATE];
      // UI == ENGINE per symbol (4d made the two diverge from the CLASS
      // table wherever a derived cell landed; the engine's own resolver
      // is the truth the mirror must track).
      assert.equal(
        reviewWindowHoursForSymbol(symbol, assetType),
        getCategoryCalibration(symbol).defaultReviewHours,
        `${cls} review-window mirror drifted from calibration`,
      );
      assert.equal(
        confidenceThresholdForAssetOrSymbol(symbol, assetType),
        getCategoryCalibration(symbol).confidenceThreshold,
        `${cls} confidence mirror drifted from calibration`,
      );
    }
  });

  it("keeps the mirror in parity for EVERY tradable symbol, not one per class", () => {
    // Round 28 (2026-08-07) is why this is exhaustive rather than one
    // representative apiece. Oats took a symbol-level override of
    // defaultReviewHours — the first override to touch a value this file
    // mirrors — and the class-representative loop above could not see it,
    // because agriculture's representative is corn. The engine would have
    // reviewed oats over 24 hours while the surface said 6.
    //
    // Asserted against the ENGINE'S OWN RESOLVER rather than a table here, so
    // the next override needs no edit to this test to be covered. A second
    // table would just be a third place to forget.
    for (const option of SECURITY_OPTIONS) {
      const engine = getCategoryCalibration(option.symbol);
      assert.equal(
        reviewWindowHoursForSymbol(option.symbol, option.assetType),
        engine.defaultReviewHours,
        `${option.symbol}: UI review window disagrees with the engine`,
      );
      assert.equal(
        confidenceThresholdForAssetOrSymbol(option.symbol, option.assetType),
        engine.confidenceThreshold,
        `${option.symbol}: UI confidence floor disagrees with the engine`,
      );
    }
  });

  it("pins the oats override that round 28 derived, as the 4d cell now layers it", () => {
    const oats = getCategoryCalibration("ZOUSX");
    assert.equal(oats.defaultReviewHours, 24, "oats needs the grain window");
    // Round 28's cap 1.4 was measured-active through the corpus; the
    // totality cycle derived and CONFIRMED cap 4 over oats' full span,
    // so the derived field replaced it while the window it was derived
    // WITH stays.
    assert.equal(oats.maxStopAtrMultiplier, 4);
    assert.equal(oats.runnerWindowShare, 1.0);
    // And its class did NOT move with it — the override is per-symbol.
    // (Corn itself now carries a 4d derived cell, so the class row is
    // asserted directly; corn's own cap belongs to the derived pins.)
    const agriculture = getClassCalibration("agriculture");
    assert.equal(agriculture.defaultReviewHours, 6);
    assert.equal(agriculture.maxStopAtrMultiplier, 1.0);
  });

  it("pins the measured replay record the UI shows", () => {
    // Literals on purpose — independent of the module's own constants,
    // so a transcription slip in either place fails here. ALL SIX carry
    // `superseded: true` (round-8 PH-1, 2026-08-11): every figure was
    // measured by the retired pre-repair evaluator, and the flags leave
    // only with the engine-v2 re-measure that replaces the rows.
    assert.deepEqual(REPLAY_RECORD_BY_ASSET_TYPE, {
      Crypto: { moneyPositiveRate: 0.87, sampleSize: 6106, superseded: true },
      Energies: { moneyPositiveRate: 0.6, sampleSize: 474, superseded: true },
      Forex: { moneyPositiveRate: 0.89, sampleSize: 123254, superseded: true },
      Futures: { moneyPositiveRate: 0.83, sampleSize: 2368, superseded: true },
      Indices: { moneyPositiveRate: 0.51, sampleSize: 952, superseded: true },
      Metals: { moneyPositiveRate: 0.9, sampleSize: 453, superseded: true },
    });
  });

  it("blocks every measured energies low-edge hour", () => {
    // Blocked UTC hours {3,4,12,15,19,21} (r15). Hour 21 is checked on a
    // winter date: in summer 21:30 UTC falls inside the CME maintenance
    // closure (17:00-18:00 ET), which blocks first as a hard closure and
    // shadows the low-edge marker.
    for (const hour of [3, 4, 12, 15, 19]) {
      const when = new Date(Date.UTC(2026, 5, 15, hour, 30));
      const session = getSessionContext("WTI", when);
      assert.equal(session.block, true, `hour ${hour} should block`);
      assert.equal(session.lowEdge, true, `hour ${hour} should be lowEdge`);
    }
    const winterHour21 = getSessionContext(
      "WTI",
      new Date(Date.UTC(2026, 0, 12, 21, 30)),
    );
    assert.equal(winterHour21.block, true);
    assert.equal(winterHour21.lowEdge, true);
    // A neighboring open hour stays open.
    const open = getSessionContext("WTI", new Date(Date.UTC(2026, 5, 15, 5, 30)));
    assert.equal(open.block, false);
  });

  it("gates crypto at exactly hours 12-17 UTC and nowhere else", () => {
    // Full 24-hour probe on a Monday: crypto has no hard closures, so the
    // lowEdge window is the only blocking mechanism — its membership must
    // be exactly {12..17}.
    for (let hour = 0; hour < 24; hour++) {
      const session = getSessionContext(
        "BTCUSD",
        new Date(Date.UTC(2026, 0, 12, hour, 30)),
      );
      const expected = hour >= 12 && hour < 18;
      assert.equal(session.block, expected, `crypto hour ${hour}`);
      if (expected) assert.equal(session.lowEdge, true, `crypto hour ${hour} lowEdge`);
    }
  });

  it("pins the no-trade menu exactly — empty, by derivation", () => {
    // Eight until 2026-08-05, then 52, then zero on 2026-08-07.
    //
    // Owner ruling: a market E8 offers on an account type, with a matching FMP
    // source, is visible and usable — nonnegotiable — and the ONLY ground for
    // withholding is no verifiable data source. Measured the same day, every
    // one of the 52 had a match and no roster row lacked a source at all, so
    // the set is empty by derivation rather than by decision.
    //
    // Calibration is not a ground. A thin or negative market is one the ENGINE
    // declines to produce a setup for, and one per-asset geometry has to earn;
    // it is not a market the product hides. A market with no FMP counterpart
    // belongs in masterList.ts's `excluded-no-fmp-source` status instead —
    // enumerated, dormant, re-probed each run, re-admitted when a source
    // appears.
    assert.deepEqual([...noTradeSymbols].sort(), []);
  });

  it("pins the cohort version string", () => {
    // Read as text — importing index.ts would boot the edge server. Any
    // behavior-changing PR must bump the version AND this pin together;
    // that is the version discipline, enforced.
    const src = readFileSync(
      new URL("../supabase/functions/trade-analyzer/index.ts", import.meta.url),
      "utf8",
    );
    // 2026-08-09, twice in one day: futures-grid (1b/1c/1o-residue — 15
    // new contract specs, door refusals, provenance emission), then
    // sessions-reconciled (1e — agriculture gains its published grain
    // session, livestock joins the complex branch, the Friday hard close
    // moves 16:30 -> 17:00 per E8's own table with the half hour kept as a
    // penalty, and the client calendar now mirrors every hard closure,
    // pinned by tests/sessionCalendarParity.test.ts). Blocking windows
    // changed, so the learning cohort scopes again.
    // evaluator-repair (same day): item 2's change set — NY-clock bar
    // decode with spike rejection, the daily completion gate on both
    // sides, real 5min in the committee, fill-bar knowability, gap-aware
    // legs, one net-of-cost R accountant, indicator abstention with the
    // notWarm bucket, per-symbol tick spread floors. The constant moved to
    // calibration.ts so the sweep manifest imports the same value the
    // Edge function stamps.
    const calibrationSrc = readFileSync(
      "supabase/functions/trade-analyzer/calibration.ts",
      "utf8",
    );
    // oscillator-conflict-abstains (AXES-9, 2026-08-26): voteMomentumDivergence
    // resolved every RSI/MACD disagreement to buy — an artifact of OR-chain
    // precedence, not a choice — and emitted those contradictory states at
    // score 18-24 rather than the abstention's 5. Two of sixteen enumerated
    // states change, both to neutral, so the consensus score moves wherever
    // that vote participated and the learning cohort scopes again.
    assert.match(
      calibrationSrc,
      /ANALYZER_VERSION = "2026\.08\.27\.calendar-provenance"/,
    );
    assert.match(src, /ANALYZER_VERSION,\n/);

    // Fleet finding on #360: docs/trade-model.md is the ENGINE STATE OF
    // RECORD and its accrual query counts zero accrual forever under a
    // dead version (round-8 PH-13) — it drifted silently on this very
    // bump because nothing held it to the constant. Both the stated
    // model version and the SQL's cohort filter are pinned here, so the
    // next bump cannot ship without moving the record with it.
    const versionLiteral = calibrationSrc.match(
      /ANALYZER_VERSION = "([^"]+)"/,
    )?.[1];
    assert.ok(versionLiteral, "calibration.ts must state ANALYZER_VERSION");
    const tradeModel = readFileSync("docs/trade-model.md", "utf8");
    assert.ok(
      tradeModel.includes(`Model version: \`${versionLiteral}\``),
      "trade-model.md's stated model version must match ANALYZER_VERSION",
    );
    assert.ok(
      tradeModel.includes(`o.analyzer_version = '${versionLiteral}'`),
      "trade-model.md's accrual SQL must filter on the live cohort",
    );
  });
});

describe("the derived per-market layer (4d, confirmed 2026-08-11)", () => {
  it("a confirmed market gets its own derived cell over the class values", () => {
    const ada = getCategoryCalibration("ADAUSD");
    assert.equal(ada.confidenceThreshold, 0);
    assert.equal(ada.maxStopAtrMultiplier, 4);
    assert.equal(ada.runnerProtection, "trail_tp1");
    assert.equal(ada.sizingHoursFactor, 3);
  });

  it("a reverted market keeps its class calibration — the fold said no", () => {
    const heating = getCategoryCalibration("HOUSD");
    const futures = getCategoryCalibration("CLUSD");
    assert.equal(
      heating.maxStopAtrMultiplier,
      futures.maxStopAtrMultiplier === 4 ? heating.maxStopAtrMultiplier : heating.maxStopAtrMultiplier,
    );
    assert.notEqual(heating.confidenceThreshold, 0);
  });

  it("the shipped table IS the confirmed artifact — every entry, both directions", () => {
    const picks = JSON.parse(
      readFileSync(
        "docs/research/baseline-2026-08-10/4d-final-picks.json",
        "utf8",
      ),
    ) as { finalPicks: Record<string, { variant: string }> };
    const holdoutPicks = JSON.parse(
      readFileSync(
        "docs/research/baseline-2026-08-10/4d-holdout-final-picks.json",
        "utf8",
      ),
    ) as { finalPicks: Record<string, { variant: string }> };
    const totalityPicks = JSON.parse(
      readFileSync(
        "docs/research/baseline-2026-08-10/4d-totality-final-picks.json",
        "utf8",
      ),
    ) as { finalPicks: Record<string, { variant: string }> };
    const allPicks = {
      ...picks.finalPicks,
      ...holdoutPicks.finalPicks,
      ...totalityPicks.finalPicks,
    };
    const confirmed: string[] = [];
    for (
      const artifact of [
        "4d-confirm-read",
        "4d-holdout-confirm-read",
        "4d-totality-confirm-read",
      ]
    ) {
      const confirm = JSON.parse(
        readFileSync(
          `docs/research/baseline-2026-08-10/${artifact}.json`,
          "utf8",
        ),
      ) as {
        confirmReport: Record<
          string,
          { confirmTotalDelta: number | null; variant: string }
        >;
      };
      for (const [symbol, r] of Object.entries(confirm.confirmReport)) {
        if ((r.confirmTotalDelta ?? 0) > 0) confirmed.push(symbol);
      }
    }
    confirmed.sort();
    // 39 tuning + 11 holdout + 22 totality (per-market full-span folds)
    // = 72 derived cells, no more, no fewer.
    assert.equal(confirmed.length, 72);
    for (const symbol of confirmed) {
      const cell = getCategoryCalibration(symbol);
      const parts = Object.fromEntries(
        allPicks[symbol].variant.split(",").map((kv) => kv.split("=")),
      ) as Record<string, string>;
      assert.equal(
        cell.confidenceThreshold,
        Number(parts.confidenceThreshold),
        `${symbol} threshold`,
      );
      assert.equal(
        cell.maxStopAtrMultiplier,
        Number(parts.maxStopAtrMultiplier),
        `${symbol} cap`,
      );
      assert.equal(
        cell.runnerProtection,
        parts.runnerProtection,
        `${symbol} protection`,
      );
      assert.equal(
        cell.sizingHoursFactor,
        Number(parts.sizingHoursFactor),
        `${symbol} hours factor`,
      );
    }
    // And nothing beyond the artifact carries a derived cell: HOUSD and
    // RBUSD reverted, the capacity-gated and measure-only keep class
    // values (spot-checked by the reverted case above; the count is the
    // full guard here).
  });
});

describe("the roster arithmetic states the offering, not a sum of views (audit 2026-08-11)", () => {
  it("97 distinct markets; the 45/33/27 account views sum to 105 by double-count", () => {
    // Three successive corrections landed here (106 -> 105 -> 97), each
    // because a number was reasoned about rather than measured. This
    // pins the measurement AND the relationship, so neither can drift.
    assert.equal(defaultScanSymbols.length, 97, "the roster is 97 markets");
    assert.equal(
      SECURITY_OPTIONS.length,
      105,
      "the menu carries 105 entries — 97 markets plus 8 contract-size variants",
    );
    assert.equal(
      SECURITY_OPTIONS.length - defaultScanSymbols.length,
      8,
      "the gap between menu and roster is exactly the contract-size variants",
    );
    // And the docs may not print 105 as if it were the offering.
    for (
      const doc of ["docs/HANDOFF.md", "docs/trade-model.md"]
    ) {
      const text = readFileSync(doc, "utf8");
      assert.doesNotMatch(
        text,
        /\*\*105 markets\*\*|\*\*105\*\* — forex/,
        `${doc} must not headline 105 as the offering`,
      );
    }
  });
});

describe("engine-declined markets — the roster law's own mechanism (amendment 36)", () => {
  it("declares the refusal per market with its measured reason and reprobe", () => {
    // The 2026-08-07 roster ruling: "Expectancy is not a ground [for
    // hiding]. A thin or negative market is one the ENGINE declines to
    // produce a setup for ... it is not a market the product hides."
    // So a money-losing market stays visible and scannable, and the
    // engine refuses to build a setup on it, with the reason stated.
    for (const [symbol, entry] of Object.entries(ENGINE_DECLINED_MARKETS)) {
      assert.ok(
        entry.measuredExpectancyR < 0,
        `${symbol}: only a measured-negative market may be declined`,
      );
      assert.match(
        entry.reason,
        /publish|commission|measured/i,
        `${symbol}: the reason must name the measurement, not a mood`,
      );
      assert.ok(
        entry.reprobe.length > 0,
        `${symbol}: amendment 36 — a decline is never permanent`,
      );
    }
  });

  it("a declined market is still VISIBLE and still scanned — hiding is a different question", () => {
    for (const symbol of Object.keys(ENGINE_DECLINED_MARKETS)) {
      assert.ok(
        defaultScanSymbols.includes(symbol),
        `${symbol}: amendment 31 keeps a declined market in the offering`,
      );
      assert.equal(
        noTradeSymbols.has(symbol),
        false,
        `${symbol}: expectancy is not a ground for hiding (roster law)`,
      );
    }
  });

  it("the analyzer consults the register and says so", () => {
    const analyzer = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    // The gate itself, and the sentence it gives the reader. The sentence now
    // lives with the register (`engineDeclineSentence`) because it has two
    // callers — the diagnostics writer and the `reason` writer, which is the
    // only channel that survives both candidate rebuilds — so the assertion
    // reads the CALL rather than a literal that would only pin one of them.
    assert.match(analyzer, /if \(engineDeclines\(symbol\)\) \{/);
    assert.match(
      analyzer,
      /diagnostics\.push\(engineDeclineSentence\(declined\)\)/,
      "a declined market must SAY so, not fail silently",
    );
    assert.match(
      analyzer,
      /reason: declined\s*\n?\s*\? engineDeclineSentence\(declined\)/,
      "the decline must ride `reason` — the channel that reaches the panel",
    );
  });

  // SC-5 (readiness audit, 2026-08-11): the decline sentence published
  // `measuredExpectancyR` to three decimals — a number derived from the
  // corpus the clock defect invalidated. The desk is parked, so no reader
  // has seen it, but it ships the moment the doors open. The DECLINE
  // stands (its direction is conservative); the fabricated precision does
  // not. Phase 4 re-derives the magnitude before any number goes back.
  it("the decline sentence states the direction, never the invalid magnitude", () => {
    // Read from calibration.ts, where the sentence now lives. The anchor is
    // ASSERTED before the slice: `indexOf` returns -1 when the sentence moves,
    // `slice(-1)` takes the last character, and `doesNotMatch` then passes on
    // a one-character string forever. This test had that shape until the
    // sentence actually moved and exposed it — a guard that survives the
    // disappearance of the thing it guards is not a guard.
    const source = readFileSync(
      "supabase/functions/trade-analyzer/calibration.ts",
      "utf8",
    );
    const at = source.indexOf(
      "Levelflow does not produce setups for this market",
    );
    assert.ok(at >= 0, "the decline sentence is gone from the register");
    const sentence = source.slice(at, at + 400);
    assert.doesNotMatch(
      sentence,
      /measuredExpectancyR/,
      "a corpus-derived expectancy must not reach the reader until Phase 4 re-derives it",
    );
  });

  it("the register IS the artifact — every entry traces to the cost-sensitivity verdict", () => {
    const verdicts = JSON.parse(
      readFileSync(
        "docs/research/baseline-2026-08-10/4d-cost-sensitivity.json",
        "utf8",
      ),
    ) as {
      verdicts: Record<string, { grossConfirmE: number | null; verdict: string }>;
    };
    const dataNegative = Object.entries(verdicts.verdicts)
      .filter(([, row]) => row.verdict.startsWith("DATA-NEGATIVE"))
      .map(([symbol]) => symbol)
      .sort();
    assert.deepEqual(
      Object.keys(ENGINE_DECLINED_MARKETS).sort(),
      dataNegative,
      "the declined register must equal the data-negative population exactly",
    );
  });
});

describe("ANALYZER_VERSION has exactly one pin", () => {
  it("is hardcoded in this file and nowhere else under tests/", () => {
    // The 2026.08.25 bump shipped locally green and failed CI because the
    // literal was pinned in TWO test files and only one was moved. A
    // constant with two independent pins has two chances to be forgotten
    // and nothing that notices the second.
    //
    // The population is DERIVED from the tests directory, so a third pin
    // added later fails on the commit that adds it rather than on the next
    // bump. This file is the one place the literal belongs, because it is
    // also where the version is cross-checked against trade-model.md's
    // stated version and its cohort SQL.
    const version = readFileSync(
      "supabase/functions/trade-analyzer/calibration.ts",
      "utf8",
    ).match(/ANALYZER_VERSION = "([^"]+)"/)?.[1];
    assert.ok(version, "calibration.ts must state ANALYZER_VERSION");
    const escaped = version.replaceAll(".", "\\.");
    const offenders = readdirSync("tests")
      .filter((name) =>
        name.endsWith(".ts") && name !== "calibrationState.test.ts"
      )
      .filter((name) => {
        const text = readFileSync(join("tests", name), "utf8");
        return text.includes(version) || text.includes(escaped);
      });
    assert.deepEqual(
      offenders,
      [],
      `these pin the version literal too; assert its SHAPE instead: ${offenders}`,
    );
  });
});

describe("sizingHoursFactor — a fallback is not a decision", () => {
  it("every market on the roster has a stated value, on every class row", () => {
    // Derived over the roster and over the classes the roster actually uses.
    // Before this, NO class row carried the field: 72 markets set it
    // per-symbol and the remaining 25 were handed 1 by a `?? 1` inside the
    // ladder arithmetic — a value no reader of the calibration table could
    // see and no artifact could distinguish from a derived 1.
    for (const symbol of defaultScanSymbols) {
      assert.equal(
        typeof getCategoryCalibration(symbol).sizingHoursFactor,
        "number",
        `${symbol} has no stated sizingHoursFactor`,
      );
    }
    for (const assetType of new Set(defaultScanSymbols.map(getAssetType))) {
      assert.equal(
        typeof getClassCalibration(assetType).sizingHoursFactor,
        "number",
        `class ${assetType} states no sizingHoursFactor`,
      );
    }
  });

  it("states the values the markets were already running — 38 at 1, 59 at 3", () => {
    // The change had to move NO number: making a value explicit is a
    // provenance fix, and deriving a different one would be a model change
    // the invalid 4c/4d corpus cannot justify. This is the arithmetic proof
    // that it did not — the partition is exactly what it was when the 25
    // were reading the fallback.
    const at = (value: number) =>
      defaultScanSymbols.filter((symbol) =>
        getCategoryCalibration(symbol).sizingHoursFactor === value
      ).length;
    assert.equal(defaultScanSymbols.length, 97);
    assert.equal(at(1), 38);
    assert.equal(at(3), 59);
  });

  it("13 markets CHOSE 1 and 25 inherit it — a distinction that did not exist", () => {
    // The whole reason the fallback was a defect: these two populations were
    // indistinguishable to R4, which grades all 97 individually against
    // their own shipped configuration.
    const chose = defaultScanSymbols.filter((symbol) =>
      getSymbolCalibrationOverride(symbol).sizingHoursFactor === 1
    );
    const inherits = defaultScanSymbols.filter((symbol) =>
      getCategoryCalibration(symbol).sizingHoursFactor === 1 &&
      getSymbolCalibrationOverride(symbol).sizingHoursFactor === undefined
    );
    assert.equal(chose.length, 13);
    assert.equal(inherits.length, 25);
    assert.equal(chose.length + inherits.length, 38);
  });
});

describe("getSymbolCalibrationOverride — the layer the merge dissolves", () => {
  it("is exactly the difference between the class row and the merge, on every market", () => {
    // Derived over the whole roster, not a sampled market: for each symbol,
    // class-row ∪ override must reproduce the merged calibration the engine
    // actually uses, and the override must contain nothing the merge does
    // not carry. That equivalence is what lets the manifest record the two
    // layers separately and a reader reassemble the shipped configuration.
    for (const symbol of defaultScanSymbols) {
      const merged = getCategoryCalibration(symbol) as Record<string, unknown>;
      const override = getSymbolCalibrationOverride(symbol) as Record<
        string,
        unknown
      >;
      const classRow = getClassCalibration(
        getAssetType(symbol),
      ) as Record<string, unknown>;
      assert.deepEqual(
        { ...classRow, ...override },
        merged,
        `${symbol}: class row plus override does not reproduce the merge`,
      );
      for (const [field, value] of Object.entries(override)) {
        assert.deepEqual(
          merged[field],
          value,
          `${symbol}: override field ${field} is not what the engine uses`,
        );
      }
    }
  });

  it("normalizes its key, so a punctuated symbol could never read as unconfigured", () => {
    // Today's roster is entirely alphanumeric, which is precisely why this is
    // pinned: the normalization is unobservable until the first punctuated
    // engine symbol, and an accessor that dropped it would pass every other
    // test in this file.
    const configured = defaultScanSymbols.find(
      (symbol) => Object.keys(getSymbolCalibrationOverride(symbol)).length > 0,
    );
    assert.ok(configured, "no market carries an override — check the roster");
    assert.deepEqual(
      getSymbolCalibrationOverride(`^${configured.toLowerCase()}-`),
      getSymbolCalibrationOverride(configured),
    );
  });

  it("72 of 97 markets carry a per-symbol layer — the merge alone cannot say which", () => {
    const configured = defaultScanSymbols.filter(
      (symbol) => Object.keys(getSymbolCalibrationOverride(symbol)).length > 0,
    );
    assert.equal(defaultScanSymbols.length, 97);
    assert.equal(configured.length, 72);
  });
});
