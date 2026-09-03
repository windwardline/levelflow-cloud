import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  getAssetType,
  getClassCalibration,
  getSymbolCalibrationOverride,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { estimateExecutionQuality } from "../supabase/functions/trade-analyzer/executionQuality.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";
import { GRID_OVERRIDE_KEYS, parseGridSpec } from "../scripts/sweepGrid.ts";

/**
 * The cost weight per trade as an admission cap (R4 act 3, amendment 39's
 * named axis). ONE row carries it: forex, at 0.15, set 2026-09-03 by the one
 * ledgered confirm read (`docs/research/confirm-reads/ledgered-read-act3.json`,
 * read f3b72ce8261a…) — the only candidate that read confirmed. Every other
 * class moved R on the tuning folds and failed D4, so every other row leaves
 * it unset and every corpus swept outside forex still reproduces.
 *
 * What the cap READS is load-bearing. The gate derived the confirmed
 * predicate from the emit as `estimatedRoundTripCost / riskDistance` — the
 * raw quotient — while `executionQuality.costToRisk` is that quotient rounded
 * to 4 dp for display. On R3's corpus 105 of 941,947 baseline rows sit in the
 * band where the two disagree at a 0.15 cap (44 markets, 19 of them forex),
 * so admission compares `costShare`, and these tests pin that it does.
 */

const startTime = Date.UTC(2024, 0, 2, 14, 30);
function dailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
    high: 103.2,
    low: 96.8,
    open: 100,
    time: startTime - count * 86_400_000 + index * 86_400_000,
    volume: 10_000,
  }));
}
function triangleBars(count: number, period = 20, amplitude = 4): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    const half = period / 2;
    const value = position < half
      ? 98 + (amplitude / half) * position
      : 98 + amplitude - (amplitude / half) * (position - half);
    return { close: value, high: value + 0.3, low: value - 0.3, open: value, time: startTime - count * 900_000 + index * 900_000, volume: 1_000 };
  });
}
const base = {
  // EURUSD is forex, and forex now SHIPS a cap — so the uncapped reference
  // these tests compare against has to unset it explicitly.
  calibrationOverride: { blockedRegimes: [], maxCostShare: undefined, runnerWindowShare: 1, tp1RiskShare: 0.8 },
  dailyBars: dailyBars(80),
  primaryBars: triangleBars(600),
  stepBars: 16,
  symbol: "EURUSD" as const,
  warmupBars: 120,
};

describe("maxCostShare caps the cost weight per trade", () => {
  it("forex alone carries it, at the value the read confirmed", () => {
    const prov = JSON.parse(readFileSync("docs/research/r4/shipped-cell-provenance.json", "utf8")) as { markets: Array<{ symbol: string }> };
    const symbols = prov.markets.map((entry) => entry.symbol);
    assert.ok(symbols.length >= 90, "the roster artifact is the population, not a guess");
    for (const className of new Set(symbols.map((symbol) => getAssetType(symbol)))) {
      const cap = getClassCalibration(className).maxCostShare;
      if (className === "forex") {
        assert.equal(cap, 0.15, "forex's cap is the figure the ledgered read confirmed, not a rounded retelling of it");
      } else {
        assert.equal(cap, undefined, `${className}'s class row sets maxCostShare, and no read earned it a value`);
      }
    }
    for (const symbol of symbols) {
      assert.equal((getSymbolCalibrationOverride(symbol) as { maxCostShare?: number }).maxCostShare, undefined, `${symbol}'s layer sets maxCostShare before any read earned it`);
    }
  });

  it("is a grid axis, so a sweep can carry it as a cell", () => {
    assert.ok((GRID_OVERRIDE_KEYS as readonly string[]).includes("maxCostShare"));
  });

  it("an unreachable cap reproduces the uncapped run exactly, and a zero cap declines every setup the other gates admitted", () => {
    const uncapped = simulateSymbol(base);
    assert.ok(uncapped.summary.total > 0, "the fixture admits setups, or the cap has nothing to decline");
    assert.equal(uncapped.rejections.aboveCostShare, 0);
    const unreachable = simulateSymbol({ ...base, calibrationOverride: { ...base.calibrationOverride, maxCostShare: Number.POSITIVE_INFINITY } });
    assert.deepEqual(unreachable.rejections, uncapped.rejections);
    assert.deepEqual(unreachable.summary, uncapped.summary);
    const zero = simulateSymbol({ ...base, calibrationOverride: { ...base.calibrationOverride, maxCostShare: 0 } });
    assert.equal(zero.summary.total, 0, "nothing is admitted past a zero cap");
    assert.equal(zero.rejections.aboveCostShare, uncapped.summary.total, "exactly the setups the other gates admitted die at the cost gate — first failing gate wins");
    assert.equal(zero.rejections.belowConfidence, uncapped.rejections.belowConfidence);
    assert.equal(zero.rejections.belowPayoff, uncapped.rejections.belowPayoff);
    assert.equal(
      zero.rejections.belowThreshold,
      zero.rejections.belowConfidence + zero.rejections.belowPayoff + zero.rejections.aboveCostShare + zero.rejections.regimeGated,
      "the aggregate counts the fourth branch",
    );
    assert.equal(zero.rejectionLedger.filter((entry) => entry.reason === "aboveCostShare").length, zero.rejections.aboveCostShare, "the ledger names the reason on every declined instant");
  });

  it("the field it caps is the RAW quotient; costToRisk is that number rounded for display", () => {
    // The acceptance gate derives `costShare` from an emitted row as
    // estimatedRoundTripCost / riskDistance. The engine must cap the same
    // quantity, or the shipped rule is not the measured one.
    const entryPrice = 1.156;
    const stopLoss = 1.1508;
    const quality = estimateExecutionQuality({
      assetType: "forex",
      atr: 0.0012,
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      dailyAtr: 0.006,
      entryPrice,
      latestClose: 1.158,
      providerWarnings: [],
      side: "buy" as const,
      stopLoss,
      symbol: "EURUSD",
      takeProfit: 1.1664,
    });
    assert.equal(
      quality.costShare,
      quality.estimatedRoundTripCost / Math.max(Math.abs(entryPrice - stopLoss), 0.00001),
      "costShare is the gate's own quotient, unrounded",
    );
    assert.equal(quality.costToRisk, Number(quality.costShare.toFixed(4)), "costToRisk is costShare at 4 dp");
    assert.notEqual(quality.costShare, quality.costToRisk, "this fixture cannot tell the two apart — pick one that can");
  });

  it("every cap site reads the unrounded share — pinned at the source, because one of them has no other reader", () => {
    // index.ts carries Deno globals, so it sits outside tsconfig.tests.json
    // and no test imports it; setupAnalysis.test.ts reads a COPY of its
    // diagnostics. A copy cannot catch the original drifting, and it did not:
    // reverting the live admission to the 4-dp field left the whole suite
    // green until this pin existed (mutation M3, 2026-09-03).
    const sites = (source: string) =>
      source.match(/executionQuality\.\w+ > calibration\.maxCostShare/g) ?? [];
    const analyzer = readFileSync("supabase/functions/trade-analyzer/index.ts", "utf8");
    assert.deepEqual(
      sites(analyzer),
      [
        "executionQuality.costShare > calibration.maxCostShare",
        "executionQuality.costShare > calibration.maxCostShare",
      ],
      "the live admission and its diagnostic must both cap the unrounded share",
    );
    assert.ok(
      analyzer.includes("(pricePlan.executionQuality.costShare * 100).toFixed(1)"),
      "the diagnostic must quote the share it actually decided on",
    );
    assert.ok(
      analyzer.includes("(calibration.maxCostShare * 100).toFixed(1)"),
      "and both halves of the sentence at the same precision, or a refusal reads as 15% exceeding 15%",
    );
    const sweep = readFileSync("supabase/functions/trade-analyzer/sweep.ts", "utf8");
    assert.deepEqual(
      sites(sweep),
      ["executionQuality.costShare > calibration.maxCostShare"],
      "the sweep decides admission on the same field the live analyzer does, or a corpus grades a rule production does not run",
    );
  });

  it("every reader that re-applies the engine's gates applies this one too", () => {
    // Two readers ask "what would the engine decide TODAY" and re-apply the
    // gates against the current calibration. Both were written when there
    // were three; a fourth that only production knows about makes each of
    // them report a population production does not trade. Derived from the
    // sources that declare the function, so a third reader cannot appear
    // without either applying the gate or failing here.
    const readers = readdirSync("scripts")
      .filter((name) => name.endsWith(".ts"))
      .map((name) => ({ name, source: readFileSync(`scripts/${name}`, "utf8") }))
      .filter((file) => file.source.includes("function passesOtherGates("));
    assert.ok(readers.length >= 2, "the gate-re-applying readers vanished — this pin is now measuring nothing");
    for (const reader of readers) {
      assert.match(
        reader.source,
        /maxCostShare !== undefined &&\s*\n?\s*costShareOfRow\(row\) > calibration\.maxCostShare/,
        `scripts/${reader.name} re-applies the engine's gates but not the cost-share cap`,
      );
      assert.ok(
        reader.source.includes("estimatedRoundTripCost/riskDistance, so the gate cannot be applied"),
        `scripts/${reader.name} must REFUSE a corpus without the columns, never silently skip the gate`,
      );
    }
  });

  it("a grid that names no usable value refuses instead of sweeping the shipped cell", () => {
    // `Infinity` is the natural way to write "no cap at all", and it parses to
    // a non-finite number: the axis was dropped and the arm swept the SHIPPED
    // value under the name of the arm that was asked for. That is how an
    // uncapped-forex control run would have come back looking capped.
    assert.throws(
      () => parseGridSpec("maxCostShare=Infinity"),
      /names no usable value/,
      "a non-finite axis must refuse, not skip",
    );
    const unreachable = parseGridSpec("maxCostShare=1e9");
    assert.equal(unreachable.length, 1);
    assert.equal(unreachable[0].maxCostShare, 1e9);
  });

  it("a cap inside the rounding band declines the row the display form would have admitted", () => {
    // Derived from the fixture's own rows rather than hand-built: find a
    // setup whose 4-dp share rounds DOWN, then cap between the two. The
    // read's predicate declines it; a cap read against `costToRisk` admits it.
    const shareOf = (row: { estimatedRoundTripCost: number; riskDistance: number }) =>
      row.estimatedRoundTripCost / Math.max(row.riskDistance, 0.00001);
    const uncapped = simulateSymbol({ ...base, captureAll: true });
    const bandIndex = uncapped.outcomes.findIndex((row) =>
      row.accepted && Number(shareOf(row).toFixed(4)) < shareOf(row)
    );
    assert.ok(bandIndex >= 0, "no accepted row rounds down — the band cannot be exercised on this fixture");
    const raw = shareOf(uncapped.outcomes[bandIndex]);
    const cap = (Number(raw.toFixed(4)) + raw) / 2;
    assert.ok(Number(raw.toFixed(4)) <= cap && cap < raw, "the cap must sit between the display form and the raw share");

    const capped = simulateSymbol({
      ...base,
      captureAll: true,
      calibrationOverride: { ...base.calibrationOverride, maxCostShare: cap },
    });
    assert.equal(capped.outcomes.length, uncapped.outcomes.length, "the same decision points, so the rows line up one for one");
    assert.equal(capped.outcomes[bandIndex].accepted, false, "the band row survived, so admission is reading the rounded share");
    for (const [index, row] of capped.outcomes.entries()) {
      assert.equal(
        row.accepted,
        uncapped.outcomes[index].accepted && shareOf(row) <= cap,
        `row ${index}: acceptance must be the other gates AND the read's own predicate`,
      );
    }
  });
});
