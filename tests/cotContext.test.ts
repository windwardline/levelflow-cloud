import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCotContext,
  combineCotSeries,
  type CotReportRow,
  cotScoreAdjustment,
  getCotContractMapping,
  netPctFromReport,
} from "../supabase/functions/trade-analyzer/cotContext.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function weeklySeries(netPcts: number[], startDate = Date.UTC(2024, 0, 2)) {
  return netPcts.map((netPct, index) => ({
    date: startDate + index * WEEK_MS,
    netPct,
  }));
}

describe("cot contract mapping", () => {
  it("maps USD-quoted majors directly and USD-based pairs inverted", () => {
    assert.deepEqual(getCotContractMapping("EURUSD"), {
      invert: false,
      primary: "E6",
    });
    // A long Swiss franc futures position is short USDCHF.
    assert.deepEqual(getCotContractMapping("USDCHF"), {
      invert: true,
      primary: "S6",
    });
  });

  it("maps crosses to both legs for a positioning differential", () => {
    assert.deepEqual(getCotContractMapping("EURGBP"), {
      invert: false,
      primary: "E6",
      secondary: "B6",
    });
  });

  it("maps commodities, indices, and crypto onto their own contracts", () => {
    assert.equal(getCotContractMapping("XAUUSD")?.primary, "GC");
    assert.equal(getCotContractMapping("WTI")?.primary, "CL");
    assert.equal(getCotContractMapping("SP")?.primary, "ES");
    assert.equal(getCotContractMapping("BTCUSD")?.primary, "BT");
  });

  it("returns null for markets with no reported contract", () => {
    assert.equal(getCotContractMapping("NIKKEI"), null);
  });
});

describe("cot net positioning", () => {
  it("expresses speculative net as a share of open interest", () => {
    const netPct = netPctFromReport({
      noncommPositionsLongAll: 150_000,
      noncommPositionsShortAll: 100_000,
      openInterestAll: 500_000,
    });

    assert.equal(netPct, 0.1);
  });

  it("rejects reports without usable open interest", () => {
    assert.equal(
      netPctFromReport({
        noncommPositionsLongAll: 10,
        noncommPositionsShortAll: 5,
        openInterestAll: 0,
      }),
      null,
    );
  });
});

describe("cot context", () => {
  it("never reads a report before its publication time", () => {
    const reports = weeklySeries(
      Array.from({ length: 60 }, (_, index) => index / 100),
    );
    const latest = reports[reports.length - 1];

    // Survey day itself: the newest report is not yet public.
    const onSurveyDay = buildCotContext(reports, latest.date);
    assert.notEqual(onSurveyDay.reportDate, new Date(latest.date).toISOString().slice(0, 10));

    // Five days later it is public and becomes the latest visible report.
    const afterPublication = buildCotContext(
      reports,
      latest.date + 5 * 24 * 60 * 60 * 1000,
    );
    assert.equal(
      afterPublication.reportDate,
      new Date(latest.date).toISOString().slice(0, 10),
    );
  });

  it("flags a crowded long book at the top of its own history", () => {
    // Rising series: the newest visible reading is the highest on record.
    const reports = weeklySeries(
      Array.from({ length: 60 }, (_, index) => index / 100),
    );
    const context = buildCotContext(
      reports,
      reports[reports.length - 1].date + 5 * 24 * 60 * 60 * 1000,
    );

    assert.equal(context.stance, "crowded_long");
    assert.equal(context.percentile, 1);
  });

  it("flags a crowded short book at the bottom of its own history", () => {
    const reports = weeklySeries(
      Array.from({ length: 60 }, (_, index) => -index / 100),
    );
    const context = buildCotContext(
      reports,
      reports[reports.length - 1].date + 5 * 24 * 60 * 60 * 1000,
    );

    assert.equal(context.stance, "crowded_short");
  });

  it("reports unavailable when history is too thin to rank", () => {
    const context = buildCotContext(weeklySeries([0.1, 0.2, 0.3]), Date.now());

    assert.equal(context.stance, "unavailable");
    assert.equal(context.percentile, null);
  });
});

describe("cot series combination", () => {
  it("inverts a single leg when the pair quotes USD first", () => {
    const combined = combineCotSeries(weeklySeries([0.2, 0.3]), undefined, true);

    assert.deepEqual(combined.map((row) => row.netPct), [-0.2, -0.3]);
  });

  it("nets both legs for a cross and drops unmatched weeks", () => {
    const primary = weeklySeries([0.3, 0.4, 0.5]);
    const secondary: CotReportRow[] = [
      { date: primary[0].date, netPct: 0.1 },
      { date: primary[2].date, netPct: 0.2 },
    ];

    const combined = combineCotSeries(primary, secondary, false);

    assert.equal(combined.length, 2);
    assert.equal(Number(combined[0].netPct.toFixed(4)), 0.2);
    assert.equal(Number(combined[1].netPct.toFixed(4)), 0.3);
  });
});

describe("cot score adjustment", () => {
  it("penalizes joining a crowded book and credits fading it", () => {
    const crowdedLong = {
      netPct: 0.3,
      percentile: 0.95,
      reportDate: "2026-01-06",
      sampleSize: 156,
      stance: "crowded_long" as const,
    };

    assert.equal(cotScoreAdjustment(crowdedLong, "buy", 4), -4);
    assert.equal(cotScoreAdjustment(crowdedLong, "sell", 4), 4);
  });

  it("stays inert at zero magnitude or without data", () => {
    const crowdedLong = {
      netPct: 0.3,
      percentile: 0.95,
      reportDate: "2026-01-06",
      sampleSize: 156,
      stance: "crowded_long" as const,
    };
    const unavailable = {
      netPct: null,
      percentile: null,
      reportDate: null,
      sampleSize: 0,
      stance: "unavailable" as const,
    };

    assert.equal(cotScoreAdjustment(crowdedLong, "buy", 0), 0);
    assert.equal(cotScoreAdjustment(unavailable, "buy", 4), 0);
  });
});
