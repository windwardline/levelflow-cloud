import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CONFIDENCE_TIERS,
  formatConfidenceTierRange,
  formatConfidenceWithTier,
  getConfidenceTier,
} from "../src/lib/confidenceTiers";
import { normalizeSetupOutcome, OUTCOME_COPY } from "../src/lib/outcomes";
import {
  getAssetType,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
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
  getTimeZoneAbbreviation,
  US_TIME_ZONE_GROUPS,
  US_TIME_ZONE_OPTIONS,
} from "../src/lib/profile";
import {
  CHART_TIMEFRAME_OPTIONS,
  defaultMarketDataDays,
  isChartTimeframe,
} from "../src/lib/marketData";
import {
  ADVISOR_EXECUTION_INTERVALS,
  ADVISOR_SIGNAL_INTERVALS,
  CONFIDENCE_THRESHOLD_BY_ASSET_TYPE,
  REVIEW_WINDOW_HOURS_BY_ASSET_TYPE,
  reviewWindowLabel,
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
  groupHistorySetups,
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
      ["Crypto", "Energies", "Forex", "Futures", "Metals"],
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
    assert.deepEqual(crypto, [
      "ADAUSD",
      "BCHUSD",
      "BTCUSD",
      "ETHUSD",
      "LTCUSD",
      "SOLUSD",
      "XRPUSD",
    ]);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("BNBUSD"), false);

    const energies = AVAILABLE_ASSET_GROUPS.find(
      (group) => group.label === "Energies",
    )?.options.map((option) => option.symbol);
    assert.deepEqual(energies, ["BRENT", "WTI"]);

    const indices = AVAILABLE_ASSET_GROUPS.find(
      (group) => group.label === "Indices",
    );
    assert.equal(indices, undefined);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("SP"), false);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("NGUSD"), false);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("HGUSD"), false);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("ASX"), false);
    assert.equal(isAvailableAssetSymbol("ASX"), false);
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
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("SP"), false);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("WTI"), true);
  });
});

describe("trade analyzer category handling", () => {
  it("routes manual reviews and market scans through one market-review pipeline", () => {
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

    assert.equal(sharedReviewCalls.length >= 3, true);
    assert.match(source, /reviewCurrentMarket\([\s\S]*"generate_setup"/);
    assert.match(source, /reviewCurrentMarket\([\s\S]*"scan_opportunities"/);
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

  it("marks the single-market review path as review origin", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const serveStart = source.indexOf("Deno.serve(");
    const serveEnd = source.indexOf("async function scanOpportunities");
    const serveSource = source.slice(serveStart, serveEnd);

    assert.match(serveSource, /upsertActiveSetup\([\s\S]*?"review",?\s*\);/);
  });

  it("persists every ranked scan opportunity as scan origin and reports the qualified count", () => {
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
    // The write goes through the persistence pass's injected writer now (spec
    // §17m.2, tests/scanPersistence.test.ts pins the contract itself), so the
    // origin argument closes the arrow rather than a bare call.
    assert.match(scanSource, /write: \(context\) =>\s*upsertActiveSetup\([\s\S]*?"scan",?\s*\),/);
    // And the report the response carries is what makes "showed setups, wrote
    // none" a state anything can see.
    assert.equal(scanSource.includes("persistence,"), true);
  });

  it("never lets a routine scan demote an existing review-origin setup", () => {
    // No node-test harness reaches upsertActiveSetup's actual DB round
    // trip (it's Deno-only code — see the other tests in this block); this
    // reads the real source the same way, scoped to the function body.
    const source = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const upsertStart = source.indexOf("async function upsertActiveSetup");
    const upsertEnd = source.indexOf(
      "async function invalidateActiveSetupsForSymbol",
    );
    const upsertSource = source.slice(upsertStart, upsertEnd);

    // The same-side dedupe UPDATE branch must not let a later scan flip an
    // already-reviewed row's origin back to 'scan' and drop it out of
    // global learning — origin only ever moves scan -> review. The insert
    // branch (no existing row to dedupe against) still sets origin freely.
    assert.equal(
      upsertSource.includes('activeSetup.origin === "review"'),
      true,
    );
    assert.equal(upsertSource.includes('? "review"'), true);
    assert.equal(upsertSource.includes("origin: nextOrigin,"), true);
  });

  it("never lets a scan touch a live (placed) position — C2", () => {
    // Same Deno-only reachability note as above: pin the guard in the real
    // source rather than exercising the DB round trip.
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
    const guardIndex = upsertSource.indexOf('origin === "scan"');
    const sameSideIndex = upsertSource.indexOf(
      "activeSetup.side === setup.side",
    );
    assert.notEqual(guardIndex, -1);
    assert.notEqual(sameSideIndex, -1);
    assert.equal(guardIndex < sameSideIndex, true);
    assert.match(upsertSource, /activeSetup\.status === "placed"/);
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
    assert.deepEqual(resolveProviderSymbols("NSDQ"), ["^NDX", "QQQ"]);
    assert.deepEqual(resolveProviderSymbols("WTI"), ["CLUSD", "USO"]);
    assert.deepEqual(resolveProviderSymbols("ASX"), ["^AXJO", "EWA"]);
    assert.equal(isTemporarilyUnavailableSymbol("NSDQ"), false);
    assert.equal(isTemporarilyUnavailableSymbol("ASX"), true);
    // r15 re-derivation retired the old CHF-pair and crypto-alt exclusions;
    // r16 made the menu binary — the only exclusions are the measured
    // no-trade list (cash indices, NGUSD, HGUSD, BNBUSD), out of every scan.
    assert.equal(defaultScanSymbols.includes("NSDQ"), false);
    assert.equal(defaultScanSymbols.includes("USDCHF"), true);
    assert.equal(defaultScanSymbols.includes("SOLUSD"), true);
    assert.equal(defaultScanSymbols.includes("BNBUSD"), false);
    assert.equal(defaultScanSymbols.includes("NGUSD"), false);
    assert.equal(defaultScanSymbols.includes("HGUSD"), false);
    assert.equal(isKnownSymbol("NSDQ"), true);
    assert.equal(isKnownSymbol("USDCHF"), true);
    assert.equal(defaultScanSymbols.includes("WTI"), true);
    assert.equal(defaultScanSymbols.includes("YMUSD"), true);
    assert.equal(defaultScanSymbols.includes("BTCUSD"), true);
    assert.equal(defaultScanSymbols.includes("ASX"), false);
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
    assert.deepEqual(
      CONFIDENCE_TIERS.map((tier) => ({
        id: tier.id,
        label: tier.label,
        range: formatConfidenceTierRange(tier),
      })),
      [
        { id: "qualified", label: "Qualified", range: "66-74" },
        { id: "strong", label: "Strong", range: "75-84" },
        { id: "best", label: "Best", range: "85-100" },
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
    assert.equal(
      formatConfidenceWithTier(forexThreshold, forexThreshold),
      "Qualified 40%",
    );
    assert.equal(formatConfidenceWithTier(55, forexThreshold), "Qualified 55%");
    // A score that already lands in a real fixed band keeps that band's
    // own label (Strong, not a downgraded "Qualified") — the threshold
    // only ever fills the gap below 66, never overrides a real tier match.
    assert.equal(formatConfidenceWithTier(76, forexThreshold), "Strong 76%");

    const cryptoThreshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Crypto;
    assert.equal(
      formatConfidenceWithTier(cryptoThreshold, cryptoThreshold),
      "Strong 82%",
    );

    const metalsThreshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Metals;
    assert.equal(
      formatConfidenceWithTier(metalsThreshold, metalsThreshold),
      "Best 90%",
    );
  });

  it("treats the threshold boundary as inclusive and stays a bare, honest percentage below it", () => {
    assert.equal(formatConfidenceWithTier(39, 40), "39%");
    assert.equal(formatConfidenceWithTier(40, 40), "Qualified 40%");
    assert.equal(formatConfidenceWithTier(41, 40), "Qualified 41%");
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
      assert.match(
        readFileSync(file, "utf8"),
        /CONFIDENCE_THRESHOLD_BY_ASSET_TYPE/,
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
  // codes are the same compact grammar the engine already speaks internally
  // (ADVISOR_SIGNAL_INTERVALS = ["4H", "1H", "15M"], advisorReview.ts) —
  // digits plus the unit's initial — so 15 minutes reads "15M": three
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
    assert.deepEqual(ADVISOR_SIGNAL_INTERVALS, ["4H", "1H", "15M"]);
    assert.deepEqual(ADVISOR_EXECUTION_INTERVALS, ["5M", "1M"]);
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
    assert.equal(reviewWindowLabel("Indices"), "Up to 5 hours");
  });

  it("keeps the confidence-threshold mirror aligned with live calibration for every asset class", () => {
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Crypto,
      getCategoryCalibration("BTCUSD").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Energies,
      getCategoryCalibration("WTI").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Forex,
      getCategoryCalibration("EURUSD").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Futures,
      getCategoryCalibration("ESUSD").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Indices,
      getCategoryCalibration("SP").confidenceThreshold,
    );
    assert.equal(
      CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Metals,
      getCategoryCalibration("XAUUSD").confidenceThreshold,
    );
  });

  it("groups U.S. time zones by Daylight Saving Time observance", () => {
    // Keyed on each option's IANA zone id, not a formatted label:
    // formatUsTimeZoneOptionLabel was Profile's old timezone-picker
    // formatter, removed as an orphan once Profile consolidated to spec
    // §11's read-only column (no timezone editing UI left to feed).
    // US_TIME_ZONE_GROUPS/US_TIME_ZONE_OPTIONS themselves stay — this pins
    // their grouping, independent of any one consumer's formatting needs.
    assert.deepEqual(
      US_TIME_ZONE_GROUPS.map((group) => ({
        label: group.label,
        options: group.options.map((option) => option.value),
      })),
      [
        {
          label: "Observes Daylight Saving Time",
          options: [
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "America/Anchorage",
            "America/Adak",
          ],
        },
        {
          label: "Standard Time Year-Round",
          options: [
            "America/Puerto_Rico",
            "America/Phoenix",
            "Pacific/Honolulu",
            "Pacific/Pago_Pago",
            "Pacific/Guam",
          ],
        },
      ],
    );
    assert.deepEqual(
      US_TIME_ZONE_OPTIONS.map((option) => option.value),
      US_TIME_ZONE_GROUPS.flatMap((group) =>
        group.options.map((option) => option.value)
      ),
    );
  });

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
  });

  it("uses IANA rules to switch daylight and standard labels by date", () => {
    assert.equal(
      getTimeZoneAbbreviation(
        "America/New_York",
        new Date("2026-06-24T12:00:00Z"),
      ),
      "EDT",
    );
    assert.equal(
      getTimeZoneAbbreviation(
        "America/New_York",
        new Date("2026-01-24T12:00:00Z"),
      ),
      "EST",
    );
    assert.equal(
      getTimeZoneAbbreviation(
        "America/Phoenix",
        new Date("2026-06-24T12:00:00Z"),
      ),
      "MST",
    );
    assert.equal(
      getTimeZoneAbbreviation(
        "America/Phoenix",
        new Date("2026-01-24T12:00:00Z"),
      ),
      "MST",
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
  it("uses the shared asset ordering when history is sorted by market", () => {
    const setups = [
      makeHistorySetup({
        createdAt: "2026-06-16T13:00:00.000Z",
        symbol: "ESUSD",
      }),
      makeHistorySetup({
        createdAt: "2026-06-16T14:00:00.000Z",
        symbol: "EURUSD",
      }),
      makeHistorySetup({
        createdAt: "2026-06-16T15:00:00.000Z",
        symbol: "BTCUSD",
      }),
    ];

    assert.deepEqual(
      sortHistorySetups(setups, "asset").map((setup) => setup.symbol),
      ["BTCUSD", "EURUSD", "ESUSD"],
    );
  });

  it("groups history statuses in the same order as the filter", () => {
    const groups = groupHistorySetups(
      [
        makeHistorySetup({ outcome: "unfilled", symbol: "EURUSD" }),
        makeHistorySetup({ outcome: "stop_loss", symbol: "BTCUSD" }),
        makeHistorySetup({ outcome: "take_profit", symbol: "XAUUSD" }),
        makeHistorySetup({ outcome: "ambiguous", symbol: "ESUSD" }),
        makeHistorySetup({ symbol: "ETHUSD" }),
      ],
      "status",
    );

    assert.deepEqual(
      groups.map((group) => group.label),
      [
        "Pending & open",
        "Banked full",
        "Stopped",
        "Unclear",
        "Unfilled",
      ],
    );
  });

  it("builds confidence bands without counting pending setups as resolved", () => {
    const bands = buildConfidenceBands([
      makeHistorySetup({ confidence: 70, outcome: "take_profit" }),
      makeHistorySetup({ confidence: 80, outcome: "stop_loss" }),
      makeHistorySetup({ confidence: 90, outcome: "ambiguous" }),
      makeHistorySetup({ confidence: 92 }),
    ]);

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
        { count: 2, label: "Best", resolved: 0, winRate: null },
      ],
    );
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
    status: outcome === "expired" ? "expired" : "active",
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
