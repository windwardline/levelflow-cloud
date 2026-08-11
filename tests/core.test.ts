import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isContractSizeVariant } from "../src/lib/broker/contractVariants.ts";
import {
  CONFIDENCE_TIERS,
  formatConfidenceWithTier,
  getConfidenceTier,
  resolveConfidenceTier,
} from "../src/lib/confidenceTiers";
import { normalizeSetupOutcome, OUTCOME_COPY } from "../src/lib/outcomes";
import { deriveTradeState } from "../src/lib/tradeState";
import {
  getAssetType,
  getCategoryCalibration,
  getClassCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { getCorrelatedSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  executionTimeframes,
  intradayTimeframes,
  signalTimeframes,
} from "../supabase/functions/trade-analyzer/types.ts";
import {
  defaultScanSymbols,
  getCorrelationGroup as getAnalyzerCorrelationGroup,
  isHeadlineNewsRelevantForSymbol,
  getRelatedSymbols,
  isKnownSymbol,
  isTemporarilyUnavailableSymbol,
  resolveProviderSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  coerceToSupportedUsTimeZone,
  isUsTimezone,
  US_TIME_ZONES,
} from "../src/lib/profile";
import {
  CHART_TIMEFRAME_OPTIONS,
  defaultMarketDataDays,
  isChartTimeframe,
} from "../src/lib/marketData";
import {
  CONFIDENCE_THRESHOLD_BY_ASSET_TYPE,
  REVIEW_WINDOW_HOURS_BY_ASSET_TYPE,
} from "../src/lib/advisorReview";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
  CORRELATION_GROUPS,
  formatSecurityLabel,
  getCorrelationGroup as getUiCorrelationGroup,
  isAvailableAssetSymbol,
  sortAssetSymbols,
} from "../src/lib/symbolMap";
import {
  buildConfidenceBands,
  sortHistorySetups,
} from "../src/components/workspace/historyUtils";
import type {
  MarketScanCandidate,
  MarketScanResponse,
  TradeSetupRow,
} from "../src/lib/tradeAnalyzer";

describe("asset catalog", () => {
  it("keeps the public asset list focused and sorted by category, base, then quote", () => {
    assert.deepEqual(
      AVAILABLE_ASSET_GROUPS.map((group) => group.label),
      // Indices vanished in r15: every member is on the measured no-trade
      // list, so the group has no generatable options.
      ["Crypto", "Energies", "Forex", "Futures", "Indices", "Metals"],
    );

    const forex = AVAILABLE_ASSET_GROUPS.find(
      (group) => group.label === "Forex",
    )?.options.map((option) => option.symbol);
    assert.deepEqual(forex?.slice(0, 8), [
      "AUDCAD",
      "AUDCHF",
      "AUDJPY",
      "AUDNZD",
      "AUDUSD",
      "CADCHF",
      "CADJPY",
      "CHFJPY",
    ]);

    const crypto = AVAILABLE_ASSET_GROUPS.find(
      (group) => group.label === "Crypto",
    )?.options.map((option) => option.symbol);
    // All 33 the Crypto account offers, every one FMP-matched with a measured
    // delta. Pinned as a prefix plus a count so the ordering rule stays under
    // test without the literal becoming the test's whole subject.
    assert.equal(crypto?.length, 33);
    assert.deepEqual(crypto?.slice(0, 6), [
      "AAVEUSD",
      "ADAUSD",
      "ALGOUSD",
      "ARWUSD",
      "ATOMUSD",
      "AVAXUSD",
    ]);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("BNBUSD"), true);

    const energies = AVAILABLE_ASSET_GROUPS.find(
      (group) => group.label === "Energies",
    )?.options.map((option) => option.symbol);
    assert.deepEqual(energies, // BRENT left 2026-08-09 (amendment 32, the owner's frame).
      ["WTI"]);

    // Indices is a rendered group again, and SP, NGUSD, HGUSD and ASX are all
    // available — every one has an FMP match, which is the only test the
    // owner's 2026-08-07 ruling admits. ASX additionally satisfied its own hide
    // condition: F2 measured ^AXJO at -5.7 (0.06%) in Sydney's cash session.
    const indices = AVAILABLE_ASSET_GROUPS.find(
      (group) => group.label === "Indices",
    );
    assert.ok(indices, "Indices renders as a group again");
    assert.deepEqual(
      indices!.options.map((option) => option.symbol).sort(),
      ["ASX", "DAX", "DOW", "NIKKEI", "NSDQ", "SP"],
    );
    for (const symbol of ["SP", "NGUSD", "HGUSD", "ASX"]) {
      assert.equal(AVAILABLE_ASSET_SYMBOLS.includes(symbol), true, symbol);
    }
    assert.equal(isAvailableAssetSymbol("ASX"), true);
  });

  it("formats user-facing asset labels without provider fallback details", () => {
    assert.equal(formatSecurityLabel("EURUSD"), "EUR/USD - Euro / U.S. Dollar");
    assert.equal(formatSecurityLabel("XAUUSD"), "XAU/USD - Gold / U.S. Dollar");
    assert.equal(formatSecurityLabel("BZUSD"), "BZ - Brent Crude Oil Futures");
    assert.equal(formatSecurityLabel("CLUSD"), "CL - WTI Crude Oil Futures");
    assert.equal(formatSecurityLabel("SP"), "SP - S&P 500 Index");
  });

  it("uses the same category, base, quote ordering for asset lists outside the selector", () => {
    assert.deepEqual(
      sortAssetSymbols([
        "XAUUSD",
        "ETHUSD",
        "AUDJPY",
        "BTCUSD",
        "ESUSD",
        "SP",
        "WTI",
        "EURUSD",
      ]),
      ["BTCUSD", "ETHUSD", "WTI", "AUDJPY", "EURUSD", "ESUSD", "SP", "XAUUSD"],
    );
  });

  it("keeps market scan symbols aligned with the visible advisor dropdown", () => {
    assert.deepEqual(
      AVAILABLE_ASSET_SYMBOLS,
      AVAILABLE_ASSET_GROUPS.flatMap((group) =>
        group.options.map((option) => option.symbol)
      ),
    );
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("SP"), true);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("WTI"), true);
  });

  it("offers no market the scan door would silently drop", () => {
    // Since §17m.1 the Scan column is the only door, and the stage is a pure
    // display of what that door returns: it adopts this scan's verdict about
    // the market on screen, and leaves the market alone when the scan did not
    // cover it. Those two rules are exhaustive only while every market the
    // menu offers is one the server actually attempts — scanOpportunities
    // drops unknown, temporarily-unavailable and no-scan symbols during
    // normalization, and a dropped symbol appears in neither `opportunities`
    // nor `blocked`. Drift here would leave the stage showing a stale ladder
    // under a rail that found nothing, so it fails the build instead.
    assert.deepEqual(
      // Contract-size variants are excluded from the comparison, not exempted
      // from the rule. AVAILABLE_ASSET_SYMBOLS is the knowable-and-sizeable
      // list; a variant sits there so it earns a BROKER_INSTRUMENTS sizing row,
      // and visibleAssetGroups filters it before any user surface. So it is
      // never a market "the menu offers" — this test's actual subject — and the
      // scan correctly never attempts it, because it reads its parent's series.
      AVAILABLE_ASSET_SYMBOLS.filter(
        (symbol) =>
          !isContractSizeVariant(symbol) &&
          (!isKnownSymbol(symbol) || isTemporarilyUnavailableSymbol(symbol) ||
            !defaultScanSymbols.includes(symbol)),
      ),
      [],
    );
    // And the other direction: the default universe a scan of "All markets"
    // walks is exactly the menu, so no scanned market is unreachable from it —
    // the menu being the knowable list minus contract-size variants, which are
    // present for sizing and are never a market the scan should walk.
    assert.deepEqual(
      [...defaultScanSymbols].sort(),
      [...AVAILABLE_ASSET_SYMBOLS].filter((symbol) => !isContractSizeVariant(symbol)).sort(),
    );
  });
});

describe("trade analyzer category handling", () => {
  it("routes every scanned market through one market-review pipeline", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const sharedReviewCalls = source.match(/reviewCurrentMarket\(/g) ?? [];
    const sharedReviewStart = source.indexOf(
      "async function reviewCurrentMarket",
    );
    const sharedReviewEnd = source.indexOf("async function scanOpportunity");
    const sharedReviewSource = source.slice(sharedReviewStart, sharedReviewEnd);

    // One door since §17m.1, so exactly one call site plus the declaration.
    assert.equal(sharedReviewCalls.length, 2);
    assert.match(source, /const review = await reviewCurrentMarket\(/);
    assert.equal(
      source.includes("async function reviewCurrentMarket"),
      true,
    );
    assert.equal(
      (source.match(/fetchFirstAvailableMarketContext\(/g) ?? []).length,
      1,
    );
    assert.equal((source.match(/await analyzeSetup\(/g) ?? []).length, 1);
    assert.equal(sharedReviewSource.includes("fetchRelevantNews("), true);
    assert.equal(
      sharedReviewSource.includes("fetchFirstAvailableMarketContext("),
      true,
    );
    assert.equal(sharedReviewSource.includes("await analyzeSetup("), true);
  });

  it("collapses market scan candidates to one setup per related group", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const scanStart = source.indexOf("async function scanOpportunities");
    const scanEnd = source.indexOf("async function reviewCurrentMarket");
    const scanSource = source.slice(scanStart, scanEnd);

    assert.equal(
      source.includes("function collapseRelatedMarketOpportunities"),
      true,
    );
    assert.equal(
      source.includes("function compareScanCandidates"),
      true,
    );
    assert.equal(
      scanSource.includes("collapseRelatedMarketOpportunities(opportunities)"),
      true,
    );
  });

  it("persists every ranked scan opportunity and reports the qualified count", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const scanStart = source.indexOf("async function scanOpportunities");
    const scanEnd = source.indexOf("async function reviewCurrentMarket");
    const scanSource = source.slice(scanStart, scanEnd);

    // The response's qualified count and the persisted rows must come from
    // the same post-ranking, post-collapse list the user is shown.
    assert.equal(scanSource.includes("opportunities: rankedOpportunities"), true);
    assert.equal(scanSource.includes("qualified: rankedOpportunities.length"), true);
    assert.equal(scanSource.includes("persistScannedOpportunities({"), true);
    // The write goes through the persistence pass's injected writer (spec
    // §17m.2, tests/scanPersistence.test.ts pins the contract itself).
    assert.match(
      scanSource,
      /write: \(context\) =>\s*upsertActiveSetup\([\s\S]*?context\.newsContext,\s*\),/,
    );
    // And the report the response carries is what makes "showed setups, wrote
    // none" a state anything can see.
    assert.equal(scanSource.includes("persistence,"), true);
  });

  it("has no second door: the analyzer answers only refresh_outcomes and scan_opportunities", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const serveStart = source.indexOf("Deno.serve(");
    const serveEnd = source.indexOf("async function scanOpportunities");
    const serveSource = source.slice(serveStart, serveEnd);

    // §17m.1: "All trades originate from the Scan column — no other path,
    // desktop or mobile." The single-market generate_setup branch wrote
    // origin 'review' and, through that origin, switched OFF the C2
    // placed-guard — so deleting it is what makes the guard unconditional.
    assert.equal(serveSource.includes("upsertActiveSetup("), false);
    assert.equal(serveSource.includes("reviewCurrentMarket("), false);
    assert.equal(source.includes("generate_setup"), false);
    // An unrecognized action is refused outright rather than falling through
    // to a default engine path: a silently-reinterpreted request is how the
    // second door existed in the first place.
    assert.match(serveSource, /Unsupported analyzer action/);
    assert.equal(source.includes('"review"'), false);
  });

  it("never lets a scan touch a live (placed) position — C2, now unconditional", () => {
    // No node-test harness reaches upsertActiveSetup's actual DB round trip
    // (it's Deno-only code — see the other tests in this block); this reads
    // the real source the same way, scoped to the function body.
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const upsertStart = source.indexOf("async function upsertActiveSetup");
    const upsertEnd = source.indexOf(
      "async function invalidateActiveSetupsForSymbol",
    );
    const upsertSource = source.slice(upsertStart, upsertEnd);

    // A scan is advisory background research, never an authority over a
    // position that's already filled and live — it must neither rewrite it
    // (the same-side UPDATE branch) nor erase it (the opposite-side
    // invalidateActiveSetupsForSymbol call), so the guard has to run before
    // both, immediately after activeSetup is fetched.
    const guardIndex = upsertSource.indexOf('activeSetup.status === "placed"');
    const sameSideIndex = upsertSource.indexOf(
      "activeSetup.side === setup.side",
    );
    assert.notEqual(guardIndex, -1);
    assert.notEqual(sameSideIndex, -1);
    assert.equal(guardIndex < sameSideIndex, true);
    // The origin exemption is gone with the door that needed it: no caller can
    // opt out of the guard any more.
    assert.equal(upsertSource.includes('origin === "scan"'), false);
    assert.equal(upsertSource.includes("nextOrigin"), false);
    // Every row this one door writes says how it arrived, and there is now
    // only one honest answer.
    assert.match(upsertSource, /origin: "scan",/);
  });

  it("trains global learning on every origin, since Scan is the only door (§17m)", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const weightsStart = source.indexOf(
      "async function refreshGlobalStrategyWeights(",
    );
    const weightsEnd = source.indexOf("function extractSetupKey");
    const weightsSource = source.slice(weightsStart, weightsEnd);

    // Inverted deliberately: this used to require `&origin=eq.review`, from a
    // build where a scan ran alongside deliberate single-market reviews. §17m.1
    // deleted the stage's Review button and made the Scan column the only door,
    // so that filter would leave the cohort with nothing to train on —
    // permanently frozen weights that still look like a learning model. The
    // signal is unchanged either way: these are measured outcomes resolved by
    // the same replay engine from the same live bars.
    assert.equal(weightsSource.includes("trade_setups?select="), true);
    assert.equal(weightsSource.includes("origin=eq.review"), false);
    // The outcome filter is what scopes the cohort, and it stays exactly as it
    // was — only resolved, measured outcomes train the weights.
    assert.equal(
      weightsSource.includes(
        "outcome=in.(take_profit,tp1_partial,stop_loss,ambiguous)",
      ),
      true,
    );
  });

  it("loads Ultimate intraday data without replacing the signal timeframes", () => {
    assert.deepEqual(signalTimeframes, ["4hour", "1hour", "15min"]);
    assert.deepEqual(executionTimeframes, ["5min", "1min"]);
    assert.deepEqual(intradayTimeframes, [
      "4hour",
      "1hour",
      "15min",
      "5min",
      "1min",
    ]);
  });

  it("keeps asset categories on distinct analyzer calibrations", () => {
    assert.equal(getAssetType("BTCUSD"), "crypto");
    assert.equal(getAssetType("WTI"), "energies");
    assert.equal(getAssetType("EURUSD"), "forex");
    assert.equal(getAssetType("ESUSD"), "futures");
    assert.equal(getAssetType("SP"), "indices");
    assert.equal(getAssetType("XAUUSD"), "metals");

    const crypto = getCategoryCalibration("BTCUSD");
    const energies = getCategoryCalibration("WTI");
    const forex = getCategoryCalibration("EURUSD");
    const futures = getCategoryCalibration("ESUSD");
    const indices = getCategoryCalibration("SP");
    const metals = getCategoryCalibration("XAUUSD");

    assert.ok(crypto.defaultReviewHours > futures.defaultReviewHours);
    assert.ok(energies.stopAtrMultiplier > futures.stopAtrMultiplier);
    assert.ok(crypto.minRewardRisk > forex.minRewardRisk);
    assert.ok(indices.newsPenaltyPerEvent > futures.newsPenaltyPerEvent);
    assert.ok(forex.newsPenaltyPerEvent >= crypto.newsPenaltyPerEvent);
    assert.ok(metals.stopAtrMultiplier > forex.stopAtrMultiplier);
    assert.ok(futures.defaultReviewHours < metals.defaultReviewHours);
  });

  it("keeps analyzer symbol routing aligned with public availability", () => {
    // Task 16c: ASX/DAX/NSDQ's fallbacks were removed too (the same scale
    // bar WTI's USO fallback failed in Task 16b) — every symbol now resolves
    // to its primary alone, whether or not it ever had a second source.
    // DAX included here for the first time: Task 16b's fix round 1 noted its
    // fallback had never been asserted through this import-based door.
    assert.deepEqual(resolveProviderSymbols("NSDQ"), ["^NDX"]);
    assert.deepEqual(resolveProviderSymbols("WTI"), ["CLUSD"]);
    assert.deepEqual(resolveProviderSymbols("ASX"), ["^AXJO"]);
    assert.deepEqual(resolveProviderSymbols("DAX"), ["^GDAXI"]);
    assert.equal(isTemporarilyUnavailableSymbol("NSDQ"), false);
    // ASX un-hidden 2026-08-07: its hide asked whether the chart feed matched
    // the traded CFD, and F2 answered — -5.7 (0.06%) in Sydney's cash session,
    // "TRACKS (cash hours)".
    assert.equal(isTemporarilyUnavailableSymbol("ASX"), false);
    // The no-trade list is empty since the same release: a market E8 offers
    // with an FMP match is scanned, and the only ground for withholding is no
    // verifiable data source. So every one of these is in the scan universe.
    for (const symbol of ["NSDQ", "USDCHF", "SOLUSD", "BNBUSD", "ASX"]) {
      assert.equal(defaultScanSymbols.includes(symbol), true, symbol);
    }
    assert.equal(defaultScanSymbols.includes("NGUSD"), true);
    assert.equal(defaultScanSymbols.includes("HGUSD"), true);
    assert.equal(isKnownSymbol("NSDQ"), true);
    assert.equal(isKnownSymbol("USDCHF"), true);
    assert.equal(defaultScanSymbols.includes("WTI"), true);
    assert.equal(defaultScanSymbols.includes("YMUSD"), true);
    assert.equal(defaultScanSymbols.includes("BTCUSD"), true);
    assert.equal(defaultScanSymbols.includes("ASX"), true);
    assert.deepEqual(getRelatedSymbols("EURUSD").slice(0, 2), [
      "EURNZD",
      "EURJPY",
    ]);
  });

  it("limits related-market checks to intentional linked sets", () => {
    assert.equal(
      getAnalyzerCorrelationGroup("EURUSD"),
      getAnalyzerCorrelationGroup("EURJPY"),
    );
    assert.notEqual(
      getAnalyzerCorrelationGroup("EURUSD"),
      getAnalyzerCorrelationGroup("AUDJPY"),
    );
    assert.equal(
      getAnalyzerCorrelationGroup("SP"),
      getAnalyzerCorrelationGroup("ESUSD"),
    );
    assert.notEqual(
      getAnalyzerCorrelationGroup("DAX"),
      getAnalyzerCorrelationGroup("SP"),
    );
    assert.equal(
      getAnalyzerCorrelationGroup("XAUUSD"),
      getAnalyzerCorrelationGroup("GCUSD"),
    );
    assert.notEqual(
      getAnalyzerCorrelationGroup("XAUUSD"),
      getAnalyzerCorrelationGroup("XAGUSD"),
    );
    assert.deepEqual(getRelatedSymbols("BTCUSD"), ["ETHUSD"]);
    assert.equal(
      getAnalyzerCorrelationGroup("AUDJPY"),
      getUiCorrelationGroup("AUDJPY"),
    );
    assert.equal(
      getAnalyzerCorrelationGroup("NQUSD"),
      getUiCorrelationGroup("NQUSD"),
    );
  });

  it("keeps each visible market in at most one linked set", () => {
    const groupedSymbols = Object.values(CORRELATION_GROUPS).flat();
    const duplicates = groupedSymbols.filter(
      (symbol, index) => groupedSymbols.indexOf(symbol) !== index,
    );
    assert.deepEqual(duplicates, []);
  });

  it("lists each visible market exactly once", () => {
    // The menu's own hygiene, and load-bearing twice over since the scan became
    // a fan-out: src/lib/scanBatching.ts partitions THIS list into requests, so
    // a duplicated entry would scan and persist one market twice, and
    // tests/scanBatching.test.ts's "exactly once" guard compares against this
    // list's length — a duplicate here would make that guard agree with itself.
    assert.deepEqual(
      AVAILABLE_ASSET_SYMBOLS.filter(
        (symbol, index) => AVAILABLE_ASSET_SYMBOLS.indexOf(symbol) !== index,
      ),
      [],
    );
    assert.equal(
      new Set(AVAILABLE_ASSET_SYMBOLS).size,
      AVAILABLE_ASSET_SYMBOLS.length,
    );
  });

  it("maps targeted headline symbols to the matching market only", () => {
    assert.equal(isHeadlineNewsRelevantForSymbol("EURUSD", "EURUSD"), true);
    assert.equal(isHeadlineNewsRelevantForSymbol("BTCUSD", "BTC"), true);
    assert.equal(isHeadlineNewsRelevantForSymbol("SP", "SPY"), true);
    assert.equal(isHeadlineNewsRelevantForSymbol("ESUSD", "SPY"), true);
    assert.equal(isHeadlineNewsRelevantForSymbol("XAUUSD", "GLD"), true);
    assert.equal(isHeadlineNewsRelevantForSymbol("WTI", "USO"), true);
    assert.equal(isHeadlineNewsRelevantForSymbol("EURUSD", "SPY"), false);
    assert.equal(isHeadlineNewsRelevantForSymbol("BTCUSD", "QQQ"), false);
  });

  it("keeps the scan response's qualified count explicit rather than implicit", () => {
    const opportunities: MarketScanCandidate[] = [
      { assetType: "forex", confidenceScore: 91, symbol: "EURUSD" },
      { assetType: "metals", confidenceScore: 82, symbol: "XAUUSD" },
    ];
    const response = buildMarketScanResponse({ opportunities, scanned: 24 });

    assert.equal(response.qualified, opportunities.length);
    assert.equal(response.scanned, 24);
    assert.deepEqual(response.opportunities, opportunities);
  });

  it("declares the qualified count on the client-facing scan response type", () => {
    // tests/**/*.ts is outside tsc -b's project include (tsconfig.app.json
    // / tsconfig.node.json both scope to src/), and `tsx --test` transpiles
    // without type-checking — so a typed fixture alone never fails here.
    // This reads the real declaration, the same way the tests above read
    // the real edge-function source.
    const source = readFileSync("src/lib/tradeAnalyzer.ts", "utf8");
    const responseStart = source.indexOf("export type MarketScanResponse");
    const responseEnd = source.indexOf("export type TradeSetupRow");
    const responseSource = source.slice(responseStart, responseEnd);

    assert.equal(responseSource.includes("qualified: number;"), true);
  });
});

function buildMarketScanResponse({
  blocked = [],
  opportunities = [],
  scanned,
}: {
  blocked?: MarketScanCandidate[];
  opportunities?: MarketScanCandidate[];
  scanned: number;
}): MarketScanResponse {
  return {
    blocked,
    opportunities,
    qualified: opportunities.length,
    scanned,
  };
}

describe("confidence tiers", () => {
  it("keeps setup confidence labels on one shared scale", () => {
    // Pinned on the tiers' own min/max, the raw bounds of record.
    // formatConfidenceTierRange used to sit between this pin and the data;
    // it lost its last production reader when the band rows dropped their
    // unread `range` field (Qualified's lower edge is class-relative now, so
    // a single stated range stopped being one truth) and was swept as an
    // orphan rather than kept alive by its own test.
    assert.deepEqual(
      CONFIDENCE_TIERS.map((tier) => ({
        id: tier.id,
        label: tier.label,
        max: tier.max,
        min: tier.min,
      })),
      [
        { id: "qualified", label: "Qualified", max: 74, min: 66 },
        { id: "strong", label: "Strong", max: 84, min: 75 },
        { id: "best", label: "Best", max: 100, min: 85 },
      ],
    );
  });

  it("classifies confidence scores at tier boundaries", () => {
    assert.equal(getConfidenceTier(65), null);
    assert.equal(getConfidenceTier(66)?.label, "Qualified");
    assert.equal(getConfidenceTier(74)?.label, "Qualified");
    assert.equal(getConfidenceTier(75)?.label, "Strong");
    assert.equal(getConfidenceTier(84)?.label, "Strong");
    assert.equal(getConfidenceTier(85)?.label, "Best");
    assert.equal(getConfidenceTier(100)?.label, "Best");
  });

  it("formats compact confidence labels consistently", () => {
    assert.equal(formatConfidenceWithTier(73.6), "Qualified 74%");
    assert.equal(formatConfidenceWithTier("80"), "Strong 80%");
    assert.equal(formatConfidenceWithTier(91), "Best 91%");
    assert.equal(formatConfidenceWithTier(null), "Pending");
  });

  it("without a threshold, never labels a score the fixed 66-100 bands don't cover — exactly the old behavior", () => {
    assert.equal(formatConfidenceWithTier(45), "45%");
    assert.equal(formatConfidenceWithTier(65), "65%");
  });

  it("earns at least Qualified once a score clears its own class's threshold, even below the fixed 66 floor", () => {
    const forexThreshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Forex;
    // Reads the live bar rather than restating it, so the 2026-08-06 move from
    // 40 to 20 does not need a literal here at all.
    assert.equal(
      formatConfidenceWithTier(forexThreshold, forexThreshold),
      `Qualified ${forexThreshold}%`,
    );
    assert.equal(formatConfidenceWithTier(55, forexThreshold), "Qualified 55%");
    // A score that already lands in a real fixed band keeps that band's
    // own label (Strong, not a downgraded "Qualified") — the threshold
    // only ever fills the gap below 66, never overrides a real tier match.
    assert.equal(formatConfidenceWithTier(76, forexThreshold), "Strong 76%");

    // A bar that lands INSIDE a real fixed band keeps that band's own label
    // rather than being relabelled "Qualified". Pinned on literal bars, not on
    // live calibration: the 2026-08-06 re-derivation moved every class bar below
    // the 66 floor, and coupling a formatter test to calibration values means it
    // breaks on every future round without the formatter having changed. The
    // rule is the subject here; the thresholds are not.
    assert.equal(formatConfidenceWithTier(82, 82), "Strong 82%");
    assert.equal(formatConfidenceWithTier(90, 90), "Best 90%");

    // And the live bars, whatever they are: each class's own bar earns at least
    // Qualified at its own value. This is the assertion that tracks calibration,
    // and it holds without naming a single number.
    for (const bar of Object.values(CONFIDENCE_THRESHOLD_BY_ASSET_TYPE)) {
      assert.match(formatConfidenceWithTier(bar, bar), /^(Qualified|Strong|Best) /);
      // One point under the bar is a bare percentage ONLY where the bar sits
      // below the fixed 66 floor. Above it, a near-miss score is still inside a
      // real fixed band and keeps that band's word — energies' bar is 85, and 84
      // is Strong on its own merits, bar or no bar. Asserting bare here would
      // contradict the very rule this test exists to protect.
      if (bar - 1 < 66) {
        assert.equal(formatConfidenceWithTier(bar - 1, bar), `${bar - 1}%`);
      } else {
        assert.match(formatConfidenceWithTier(bar - 1, bar), /^(Qualified|Strong|Best) /);
      }
    }
  });

  it("treats the threshold boundary as inclusive and stays a bare, honest percentage below it", () => {
    assert.equal(formatConfidenceWithTier(39, 40), "39%");
    assert.equal(formatConfidenceWithTier(40, 40), "Qualified 40%");
    assert.equal(formatConfidenceWithTier(41, 40), "Qualified 41%");
  });

  it("resolves band membership by the same rule the formatter labels with — the class bar fills the gap below 66, never overrides a real tier", () => {
    const forex = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Forex;
    const crypto = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Crypto;

    // Class-relative in both directions, on a score that straddles the two live
    // bars. 22 clears forex's 20 and does not clear crypto's 25 — the same
    // property the old 52-against-40-and-82 pair carried, re-pointed at the
    // 2026-08-06 bars instead of hard-coding a gap that no longer exists.
    assert.ok(forex < 22 && 22 < crypto, "fixture must straddle the live bars");
    assert.equal(resolveConfidenceTier(22, forex)?.id, "qualified");
    assert.equal(resolveConfidenceTier(22, crypto), null);
    // A score inside a real fixed band keeps that band's own tier, whatever the
    // class bar says. Literal bars, for the reason given in the formatter test:
    // every live bar now sits below 66, so live values cannot exercise this.
    assert.equal(resolveConfidenceTier(70, 82)?.id, "qualified");
    assert.equal(resolveConfidenceTier(82, 82)?.id, "strong");
    assert.equal(resolveConfidenceTier(90, 90)?.id, "best");
    // Inclusive at the bar, exclusive below it — the formatter's own edges.
    assert.equal(resolveConfidenceTier(forex, forex)?.id, "qualified");
    assert.equal(resolveConfidenceTier(forex - 1, forex), null);
    // Rounds the way the formatter rounds, so the band a row lands in and
    // the word printed beside its score can never disagree.
    assert.equal(resolveConfidenceTier(74.6, forex)?.id, "strong");
    assert.equal(resolveConfidenceTier(65.5, 82)?.id, "qualified");
    // Without a threshold: exactly the fixed-band behavior.
    assert.equal(resolveConfidenceTier(65), null);
    assert.equal(resolveConfidenceTier(70)?.id, "qualified");
    // An unreadable score resolves to no band rather than throwing.
    assert.equal(resolveConfidenceTier(null, forex), null);
    assert.equal(resolveConfidenceTier(undefined, forex), null);
    assert.equal(resolveConfidenceTier("", forex), null);
    assert.equal(resolveConfidenceTier("not-a-score", forex), null);
  });

  it("agrees with the formatter on every score and every class bar — one law, two readers", () => {
    // The display half (formatConfidenceWithTier) shipped first; the resolver
    // is the aggregate half of the same rule. This sweep pins them together
    // in both directions: a tier resolved is a word printed, and no tier is
    // a bare percentage. Quarter-point steps, not integers: both sites round
    // before deciding, and a future divergence in either rounding site (the
    // formatter rounds for printing, the resolver rounds for membership)
    // would only ever show on fractional input — the seam the old raw
    // min/max comparison dropped rows into.
    const thresholds = [
      ...Object.values(CONFIDENCE_THRESHOLD_BY_ASSET_TYPE),
      undefined,
    ];
    for (const threshold of thresholds) {
      for (let quarter = 0; quarter <= 400; quarter += 1) {
        const score = quarter / 4;
        const printed = Math.round(score);
        const tier = resolveConfidenceTier(score, threshold);
        assert.equal(
          formatConfidenceWithTier(score, threshold),
          tier ? `${tier.label} ${printed}%` : `${printed}%`,
          `score ${score}, bar ${threshold}`,
        );
      }
    }
  });

  it("wires the class threshold into every formatConfidenceWithTier call site", () => {
    for (
      const file of [
        // Insights recomposition (spec §10) folded the old HistorySetupCard
        // into a day-grouped table; its confidence-formatting call site
        // moved to historyUtils.ts's formatSetupConfidence. AdvisorStatusPanels.tsx
        // (the old MarketResultsPanel) dropped out of this list when I7
        // retired that panel, and spec §16 deleted the file outright along
        // with the rest of the Desk's status furniture.
        //
        // MarketScanPanel dropped out with the same recomposition: the mock's
        // rail row (a-desk-v3.html:152) carries one meta line — "Buy ·
        // confidence 86", from marketScanFilters.formatScanRowMeta — in place
        // of the tiered "Qualified 86%" metric grid, so nothing there resolves
        // a class threshold anymore. formatConfidenceWithTier's own threshold
        // behavior is pinned directly above; historyUtils is its last call
        // site.
        "src/components/workspace/historyUtils.ts",
      ]
    ) {
      // Either export satisfies the requirement, which is that the threshold
      // comes from the calibration mirror rather than a literal. Since 2026-08-06
      // the symbol-aware resolver is the correct one: agriculture and livestock
      // are separate calibration classes that both DISPLAY as Futures, so the
      // SecurityType table alone would report futures' 68 for corn's 30.
      assert.match(
        readFileSync(file, "utf8"),
        /CONFIDENCE_THRESHOLD_BY_ASSET_TYPE|confidenceThresholdForAssetOrSymbol/,
        `${file} must resolve its class threshold from the calibration mirror`,
      );
    }
  });
});

describe("profile preferences", () => {
  it("exposes Ultimate-ready intraday chart timeframes", () => {
    assert.deepEqual(
      CHART_TIMEFRAME_OPTIONS.map((option) => option.value),
      ["1min", "5min", "15min", "1hour", "4hour", "1day"],
    );
    assert.equal(isChartTimeframe("1min"), true);
    assert.equal(isChartTimeframe("5min"), true);
    assert.equal(defaultMarketDataDays("1min"), 3);
    assert.equal(defaultMarketDataDays("1day"), 520);
  });

  // Spec §17: "Timeframes are two characters universally — 1H, 4H, 1D (every
  // surface that names a timeframe … any option labels)." This list is the
  // single source every such surface reads (advisorFormat's TIMEFRAMES
  // re-exports it, and the Desk's chart-view select renders option.label
  // straight from it), so pinning it here pins every surface at once. The
  // codes are the same compact grammar the engine already speaks internally for
  // its review timeframes ("4H", "1H", "15M") — digits plus the unit's initial —
  // so 15 minutes reads "15M": three
  // characters, because fifteen has two digits, not because the grammar
  // differs. Nothing here may go back to prose ("1 hour", "Daily").
  it("labels every chart timeframe as a compact code, never prose (spec §17)", () => {
    assert.deepEqual(
      CHART_TIMEFRAME_OPTIONS.map((option) => option.label),
      ["1M", "5M", "15M", "1H", "4H", "1D"],
    );
    for (const option of CHART_TIMEFRAME_OPTIONS) {
      assert.match(
        option.label,
        /^\d{1,2}[MHD]$/,
        `"${option.label}" is not a compact timeframe code`,
      );
      assert.ok(
        option.label.length <= 3,
        `"${option.label}" is longer than the compact grammar allows`,
      );
    }
  });

  it("keeps advisor review intervals and valid windows aligned with backend rules", () => {
    assert.equal(
      REVIEW_WINDOW_HOURS_BY_ASSET_TYPE.Crypto,
      getCategoryCalibration("BTCUSD").defaultReviewHours,
    );
    assert.equal(
      REVIEW_WINDOW_HOURS_BY_ASSET_TYPE.Forex,
      getCategoryCalibration("EURUSD").defaultReviewHours,
    );
    assert.equal(
      REVIEW_WINDOW_HOURS_BY_ASSET_TYPE.Futures,
      getCategoryCalibration("ESUSD").defaultReviewHours,
    );
    assert.equal(
      REVIEW_WINDOW_HOURS_BY_ASSET_TYPE.Indices,
      getCategoryCalibration("SP").defaultReviewHours,
    );
  });

  // Q2-I3 deleted profile.ts's display half — the option table's labels,
  // US_TIME_ZONE_GROUPS, getUsTimeZoneOption and getTimeZoneAbbreviation, none of
  // which had a reader since §16 removed the timezone control. What survives is
  // the zone LIST and the coercion the profile hook actually calls, so that is
  // what stays covered.
  it("normalizes detailed browser zones to the supported profile choices", () => {
    assert.equal(
      coerceToSupportedUsTimeZone("America/Indiana/Indianapolis"),
      "America/New_York",
    );
    assert.equal(
      coerceToSupportedUsTimeZone("America/Phoenix"),
      "America/Phoenix",
    );
    assert.equal(coerceToSupportedUsTimeZone("Pacific/Saipan"), "Pacific/Guam");
    assert.equal(
      coerceToSupportedUsTimeZone("America/St_Thomas"),
      "America/Puerto_Rico",
    );
    // Anything unrecognised lands on the app's own default rather than throwing.
    assert.equal(coerceToSupportedUsTimeZone("Europe/Berlin"), "America/New_York");
    assert.equal(coerceToSupportedUsTimeZone(null), "America/New_York");
  });

  it("accepts every zone it lists, and only those", () => {
    assert.equal(US_TIME_ZONES.length, 11);
    for (const zone of US_TIME_ZONES) {
      assert.equal(isUsTimezone(zone), true, zone);
      assert.equal(coerceToSupportedUsTimeZone(zone), zone, zone);
    }
    assert.equal(isUsTimezone("Europe/Berlin"), false);
    assert.equal(US_TIME_ZONES[0], "America/New_York");
  });

  it("keeps the confidence-threshold mirror aligned with live calibration for every asset class", () => {
    // The CLASS rows (4d, 2026-08-11): the old per-symbol probes now land
    // on markets carrying derived floor-0 cells; the class mirror pins
    // the class table, and the per-symbol derived mirror is swept
    // exhaustively in tests/calibrationState.test.ts.
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Crypto,
      getClassCalibration("crypto").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Energies,
      getClassCalibration("energies").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Forex,
      getClassCalibration("forex").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Futures,
      getClassCalibration("futures").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Indices,
      getClassCalibration("indices").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Metals,
      getClassCalibration("metals").confidenceThreshold,
    );
  });

});

describe("recommendation outcomes", () => {
  it("uses clear user-facing labels for each internal status", () => {
    // §17d, owner-approved verbatim: every label re-derives from the canonical
    // seven result words, so this record and the ledger's own formatter speak
    // one vocabulary. §17b's unresolved bucket spans two of those states
    // (Pending and Open) and names both rather than inventing another word.
    assert.equal(OUTCOME_COPY.still_tracking.label, "Pending & open");
    assert.equal(OUTCOME_COPY.target_reached.label, "Banked full");
    assert.equal(OUTCOME_COPY.partial_target.label, "Banked half");
    assert.equal(OUTCOME_COPY.stopped_out.label, "Stopped");
    assert.equal(OUTCOME_COPY.expired_in_profit.label, "Expired");
    assert.equal(OUTCOME_COPY.expired_in_loss.label, "Expired");
    // The two words the controller added in wave 4 to finish the table: an
    // ambiguous path is "Unclear" (it read "Needs review", which phrased a
    // result as an instruction and collided with the stage's Review action), and
    // the unreachable manual_close enum value is "Closed".
    assert.equal(OUTCOME_COPY.unclear_path.label, "Unclear");
    assert.equal(OUTCOME_COPY.closed_manually.label, "Closed");
    assert.equal(OUTCOME_COPY.entry_not_filled.label, "Unfilled");
  });

  it("separates unresolved, unfilled, and unclear results", () => {
    assert.equal(
      normalizeSetupOutcome(buildSetup({ status: "generated" })),
      "still_tracking",
    );
    assert.equal(
      normalizeSetupOutcome(buildSetup({ status: "expired" })),
      "entry_not_filled",
    );
    assert.equal(
      normalizeSetupOutcome(
        buildSetup({ outcome: "ambiguous", status: "filled" }),
      ),
      "unclear_path",
    );
    assert.equal(
      normalizeSetupOutcome(
        buildSetup({ outcome: "take_profit", status: "filled" }),
      ),
      "target_reached",
    );
    assert.equal(
      normalizeSetupOutcome(
        buildSetup({ outcome: "stop_loss", status: "filled" }),
      ),
      "stopped_out",
    );
  });
});

describe("history workspace logic", () => {

  it("orders a same-second scan batch by confidence, then base/quote symbol — never database return order (owner-observed, 2026-08-01)", () => {
    // One scan writes its whole batch inside a second, so created_at cannot
    // separate the rows. The tie-break chain must: confidence descending
    // (echoing the scan results' own sanctioned ordering), then the
    // universal symbol comparator for equal scores.
    const batch = [
      makeHistorySetup({ confidence: 62, createdAt: "2026-08-01T18:05:00.000Z", symbol: "EURUSD" }),
      makeHistorySetup({ confidence: 88, createdAt: "2026-08-01T18:05:00.000Z", symbol: "XRPUSD" }),
      makeHistorySetup({ confidence: 74, createdAt: "2026-08-01T18:05:00.000Z", symbol: "BTCUSD" }),
      makeHistorySetup({ confidence: 74, createdAt: "2026-08-01T18:05:00.000Z", symbol: "ADAUSD" }),
    ];

    assert.deepEqual(
      sortHistorySetups(batch).map((setup) => setup.symbol),
      ["XRPUSD", "ADAUSD", "BTCUSD", "EURUSD"],
    );
  });

  // Q2-I7: the guard that would have caught the fixtures. Every status these
  // fixtures produce has to be one the database can actually hold, and the
  // unresolved ones have to reach the Pending branch — "Pending & open" below
  // used to appear for the right reason only by accident, through the open
  // branch, because "active" is not a setup_status value at all.
  it("builds fixtures the database could hold, and unresolved ones read as Pending", () => {
    const SETUP_STATUS = new Set(
      Array.from(
        readFileSync("supabase/init.sql", "utf8").match(
          /create type public\.setup_status as enum \(([^)]*)\)/,
        )?.[1].matchAll(/'([a-z_]+)'/g) ?? [],
        (match) => match[1],
      ),
    );
    assert.equal(SETUP_STATUS.size, 6, [...SETUP_STATUS].join(","));

    const unresolved = makeHistorySetup({ symbol: "ETHUSD" });
    assert.ok(SETUP_STATUS.has(unresolved.status), unresolved.status);
    assert.equal(deriveTradeState(unresolved, new Date())?.status, "pending");

    for (
      const outcome of ["unfilled", "stop_loss", "take_profit", "ambiguous", "expired"] as const
    ) {
      const setup = makeHistorySetup({ outcome, symbol: "EURUSD" });
      assert.ok(SETUP_STATUS.has(setup.status), `${outcome}: ${setup.status}`);
      // Resolved either way — the rail holds none of them (spec §8).
      assert.equal(deriveTradeState(setup, new Date()), null, outcome);
    }
  });


  it("builds confidence bands without counting pending setups as resolved", () => {
    const { bands } = buildConfidenceBands([
      makeHistorySetup({ confidence: 70, outcome: "take_profit" }),
      makeHistorySetup({ confidence: 80, outcome: "stop_loss" }),
      makeHistorySetup({ confidence: 90, outcome: "ambiguous" }),
      makeHistorySetup({ confidence: 92 }),
    ]);

    // PH-7 (2e): the ambiguous row at 90 is a RESOLVED LOSS now — the
    // engine priced its exit at the stop side, and the band may not
    // resurrect it as a non-event. Only the truly pending row at 92
    // stays unresolved.
    assert.deepEqual(
      bands.map((band) => ({
        count: band.count,
        label: band.label,
        resolved: band.resolved,
        winRate: band.winRate,
      })),
      [
        { count: 1, label: "Qualified", resolved: 1, winRate: 100 },
        { count: 1, label: "Strong", resolved: 1, winRate: 0 },
        { count: 2, label: "Best", resolved: 1, winRate: 0 },
      ],
    );
  });

  it("bands every row that cleared its own class's bar and counts the rest — no row vanishes (the exhaustiveness invariant)", () => {
    // EURUSD qualifies at 20 (CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Forex), so a
    // 22 cleared its own bar and belongs to Qualified — the aggregate half of
    // formatConfidenceWithTier's shipped rule, which already prints this row
    // "Qualified 22%". Before this wave the band find() dropped it silently.
    const setups = [
      makeHistorySetup({ confidence: 22, outcome: "take_profit" }),
      makeHistorySetup({ confidence: 70, outcome: "stop_loss" }),
      makeHistorySetup({ confidence: 80, outcome: "take_profit" }),
      // LINKUSD qualifies at the crypto class bar 25 (capacity-gated, so
      // no 4d floor): the same 22 cleared nothing there, so it lands in
      // no band — class-relative in both directions — but it is counted,
      // never dropped. (BTCUSD would qualify at its derived floor of 0
      // now, which is exactly why the fixture names LINK.)
      makeHistorySetup({
        confidence: 22,
        outcome: "take_profit",
        symbol: "LINKUSD",
      }),
    ];

    const { bands, unbanded } = buildConfidenceBands(setups);

    assert.deepEqual(
      bands.map((band) => ({
        count: band.count,
        label: band.label,
        resolved: band.resolved,
        winRate: band.winRate,
      })),
      [
        { count: 2, label: "Qualified", resolved: 2, winRate: 50 },
        { count: 1, label: "Strong", resolved: 1, winRate: 100 },
        { count: 0, label: "Best", resolved: 0, winRate: null },
      ],
    );
    assert.equal(unbanded, 1);
    assert.equal(
      bands.reduce((total, band) => total + band.count, 0) + unbanded,
      setups.length,
    );
  });

  it("counts a row with an unreadable score in the unbanded remainder, so the invariant holds on any input", () => {
    const { bands, unbanded } = buildConfidenceBands([
      makeHistorySetup({ confidence: Number.NaN }),
      makeHistorySetup({ confidence: 70, outcome: "take_profit" }),
    ]);

    assert.equal(unbanded, 1);
    assert.equal(
      bands.reduce((total, band) => total + band.count, 0) + unbanded,
      2,
    );
  });

  it("bands a fractional score exactly where the ledger's formatter prints it", () => {
    // 74.6 rounds to 75 and the ledger prints "Strong 75%" — the old raw
    // min/max comparison matched it to no band at all (74.6 sits between
    // Qualified's 74 and Strong's 75), one more way a row could vanish.
    const { bands, unbanded } = buildConfidenceBands([
      makeHistorySetup({ confidence: 74.6, outcome: "take_profit" }),
    ]);

    assert.equal(bands[1].count, 1);
    assert.equal(unbanded, 0);
  });

  it("returns band rows keyed by tier id and carrying no range — the exact shape, both directions", () => {
    // No `range`: Qualified's lower edge is each class's own bar now, so a
    // single stated range stopped being one truth, and a field with no
    // reader is not carried as data (the same orphan rule that swept
    // formatConfidenceTierRange — CONFIDENCE_TIERS' own min/max stay the
    // raw bounds of record). `id` IS carried: it is the join key
    // buildAttribution's confidence slice reads, replacing the old
    // positional band[i]↔tier[i] contract.
    const { bands, unbanded } = buildConfidenceBands([]);

    assert.deepEqual(
      bands,
      [
        {
          ambiguous: 0,
          count: 0,
          id: "qualified",
          label: "Qualified",
          resolved: 0,
          winRate: null,
        },
        {
          ambiguous: 0,
          count: 0,
          id: "strong",
          label: "Strong",
          resolved: 0,
          winRate: null,
        },
        {
          ambiguous: 0,
          count: 0,
          id: "best",
          label: "Best",
          resolved: 0,
          winRate: null,
        },
      ],
    );
    assert.equal(unbanded, 0);
  });
});

function makeHistorySetup({
  confidence = 80,
  createdAt = "2026-06-16T12:00:00.000Z",
  outcome,
  symbol = "EURUSD",
}: {
  confidence?: number;
  createdAt?: string;
  outcome?: "ambiguous" | "expired" | "stop_loss" | "take_profit" | "unfilled";
  symbol?: string;
}): TradeSetupRow {
  return {
    analyzer_version: "test",
    breakeven_trigger_price: 1.2,
    confidence_score: confidence,
    confluence: { rewardRisk: 2.4, setupKey: "test_setup" },
    correlation_group: symbol,
    created_at: createdAt,
    id: `${symbol}-${confidence}-${outcome ?? "pending"}`,
    limit_entry: 1.1,
    risk_model: {},
    side: "buy",
    // Q2-I7: real setup_status values (supabase/init.sql's six-value enum).
    // These fixtures used to say "active", which is not one of them — so
    // deriveTradeState fell through to its open branch and every unresolved row
    // below reached the "Pending & open" bucket and the confidence bands as an
    // OPEN trade, never through the generated→Pending path those suites read as
    // the thing they were testing. An unresolved row is a generated one; a
    // resolved row is placed (i.e. filled and live) unless the outcome itself
    // says the window closed.
    status: outcome === "expired"
      ? "expired"
      : outcome
      ? "placed"
      : "generated",
    stop_loss: 1,
    symbol,
    take_profit: 1.3,
    trade_outcomes: outcome
      ? [{
        outcome,
        realized_pnl: null,
      }]
      : [],
  };
}

describe("database schema", () => {
  it("uses provider-neutral market symbol naming in the current baseline schema", () => {
    const initSql = readFileSync("supabase/init.sql", "utf8");

    assert.match(initSql, /provider_symbol text not null/);
    assert.doesNotMatch(initSql, /massive_symbol text not null/);
  });

  it("keeps setup persistence consolidated and records data health", () => {
    const initSql = readFileSync("supabase/init.sql", "utf8");

    assert.doesNotMatch(
      initSql,
      /create table if not exists public\.pending_orders/,
    );
    assert.doesNotMatch(initSql, /pending_order_id uuid/);
    assert.match(
      initSql,
      /create table if not exists public\.market_data_health/,
    );
    assert.match(initSql, /create table if not exists public\.analyzer_events/);
    assert.match(
      initSql,
      /market data health readable by authenticated users/,
    );
  });
});

function buildSetup({
  outcome,
  status,
}: {
  outcome?: string;
  status: string;
}): Pick<TradeSetupRow, "status" | "trade_outcomes"> {
  return {
    status,
    trade_outcomes: outcome
      ? [
        {
          exit_at: null,
          feedback: null,
          filled_at: null,
          outcome,
          realized_pnl: null,
          reviewed_at: "2026-06-16T12:00:00.000Z",
        },
      ]
      : [],
  };
}

describe("correlation completion — the whole complex, both sides of every pair (round-8 RM-5)", () => {
  it("a JPY cross correlates with the full JPY complex, not just its base family", () => {
    const related = getCorrelatedSymbols("CADJPY");
    for (const jpy of ["USDJPY", "AUDJPY", "CHFJPY", "EURJPY", "GBPJPY", "NZDJPY"]) {
      assert.ok(related.includes(jpy), `CADJPY must correlate with ${jpy}`);
    }
    assert.ok(related.includes("USDCAD"), "the CAD side still counts too");
  });

  it("every altcoin shares one exposure group — one alt setup at a time", () => {
    const related = getCorrelatedSymbols("DOGEUSD");
    for (const alt of ["SOLUSD", "AVAXUSD", "XMRUSD", "TRUMPUSD", "LINKUSD"]) {
      assert.ok(related.includes(alt), `DOGEUSD must correlate with ${alt}`);
    }
    assert.ok(!related.includes("BTCUSD"), "majors keep their own group");
  });

  it("the new futures carry their complexes: grains, livestock, the curve, PGMs, products", () => {
    assert.ok(getCorrelatedSymbols("ZCUSX").includes("ZSUSX"));
    assert.ok(getCorrelatedSymbols("LEUSX").includes("GFUSX"));
    assert.ok(getCorrelatedSymbols("ZTUSD").includes("ZBUSD"));
    assert.ok(getCorrelatedSymbols("PLUSD").includes("PAUSD"));
    assert.ok(getCorrelatedSymbols("RBUSD").includes("CLUSD"));
  });

  it("the scan gate screens against the symbol union, not one stored group", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    assert.match(source, /symbol=in\./);
    assert.match(source, /getCorrelatedSymbols/);
  });
});
