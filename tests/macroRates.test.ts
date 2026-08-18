import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  calculateMacroRateAdjustment,
  parseTreasuryRow,
  treasuryContextFromRows,
  treasuryVisibleAtMs,
  unavailableContext,
} from "../supabase/functions/trade-analyzer/macroRates.ts";

// E6 (R1b): the pure Treasury module both the live fetch and the offline
// sweep score through. These pins hold the two halves to ONE arithmetic —
// the sweep reconstructs macroAdjustment only because this construction,
// this visibility rule and this parser are exactly what the live path
// runs.

describe("treasuryContextFromRows — one construction for live and sweep", () => {
  const day = 86_400_000;
  const latest = { dateMs: Date.parse("2026-08-14"), tenYear: 4.31, twoYear: 3.92 };
  const previous = {
    dateMs: Date.parse("2026-08-14") - day,
    tenYear: 4.2,
    twoYear: 3.9,
  };

  it("computes the change and curve in rounded basis points", () => {
    const context = treasuryContextFromRows(latest, previous);
    assert.equal(context.source, "fmp_treasury_rates");
    assert.equal(context.tenYearChangeBps, 11);
    assert.equal(context.curveSpreadBps, 39);
    assert.equal(context.latestDate, "2026-08-14");
    assert.equal(context.previousDate, "2026-08-13");
    assert.equal(context.tenYearYield, 4.31);
    assert.equal(context.twoYearYield, 3.92);
  });

  it("feeds the adjustment the live thresholds — >=8 bps doubles the magnitude, EURUSD's rate-aligned side is sell", () => {
    const context = treasuryContextFromRows(latest, previous);
    assert.deepEqual(
      calculateMacroRateAdjustment("EURUSD", "sell", context).adjustment,
      2,
    );
    assert.deepEqual(
      calculateMacroRateAdjustment("EURUSD", "buy", context).adjustment,
      -2,
    );
    const unavailable = calculateMacroRateAdjustment(
      "EURUSD",
      "buy",
      unavailableContext("no rows"),
    );
    assert.equal(unavailable.adjustment, 0);
    assert.equal(unavailable.stance, "unavailable");
  });
});

describe("treasuryVisibleAtMs — a row is decision-time information from the New York midnight after its label", () => {
  it("resolves through the New York clock, not a fixed UTC offset — pinned across the 2026 DST fall-back", () => {
    // Label Sat 2026-10-31: visible from NY midnight Sun Nov 1, which is
    // still EDT (the clocks fall back at 02:00 that morning) — 04:00 UTC.
    assert.equal(
      treasuryVisibleAtMs(Date.parse("2026-10-31")),
      Date.parse("2026-11-01T04:00:00.000Z"),
    );
    // Label Sun 2026-11-01: visible from NY midnight Mon Nov 2, now EST —
    // 05:00 UTC. A fixed-offset rule gets one of these two wrong.
    assert.equal(
      treasuryVisibleAtMs(Date.parse("2026-11-01")),
      Date.parse("2026-11-02T05:00:00.000Z"),
    );
  });

  it("never admits a row before its label date ends anywhere in New York", () => {
    const labelMs = Date.parse("2026-08-14");
    assert.ok(treasuryVisibleAtMs(labelMs) > labelMs + 86_400_000);
  });
});

describe("macroContext.ts composes the same pieces — one construction, two callers", () => {
  // macroContext.ts reads Deno.env at module top and can never enter this
  // graph, so its half of the unity claim is a source pin (the R1a
  // slice-2 discipline): the live fetch must PARSE through
  // parseTreasuryRow and CONSTRUCT through treasuryContextFromRows, or
  // the sweep's reconstruction quietly measures a different arithmetic
  // than production scores under.
  it("parses and constructs through macroRates.ts, never a private copy", () => {
    const context = readFileSync(
      "supabase/functions/trade-analyzer/macroContext.ts",
      "utf8",
    );
    assert.match(context, /from "\.\/macroRates\.ts"/);
    assert.match(context, /\.map\(parseTreasuryRow\)/);
    assert.match(context, /return treasuryContextFromRows\(latest, previous\);/);
  });
});

describe("parseTreasuryRow — the provider's own field names", () => {
  it("reads the year2/year10 shape the stable endpoint serves (probed 2026-08-18)", () => {
    const row = parseTreasuryRow({
      date: "2013-03-01",
      month1: 0.07,
      month2: null,
      month3: 0.11,
      year1: 0.16,
      year2: 0.25,
      year10: 1.86,
      year30: 3.06,
    });
    assert.deepEqual(row, {
      dateMs: Date.parse("2013-03-01"),
      tenYear: 1.86,
      twoYear: 0.25,
    });
  });

  it("returns null rather than inventing a missing tenor", () => {
    assert.equal(parseTreasuryRow({ date: "2013-03-01", year2: 0.25 }), null);
    assert.equal(parseTreasuryRow({ year2: 0.25, year10: 1.86 }), null);
    assert.equal(parseTreasuryRow(null), null);
    assert.equal(parseTreasuryRow([1]), null);
  });

  it("takes the label as its date part at UTC midnight — never local-time parsed (#364 round 1, finding 6)", () => {
    // V8 parses a space-separated datetime as LOCAL time, which would
    // make dateMs — and through +24h day-naming, the whole visibility
    // join — depend on the sweep host's TZ. The parser now reads exactly
    // the leading YYYY-MM-DD (UTC by spec), so this equality holds under
    // any TZ, and a row without a leading bare date is refused.
    const datetime = parseTreasuryRow({
      date: "2026-08-11 00:00:00",
      year2: 3.9,
      year10: 4.2,
    });
    assert.equal(datetime?.dateMs, Date.parse("2026-08-11"));
    assert.equal(
      parseTreasuryRow({ date: "August 11, 2026", year2: 3.9, year10: 4.2 }),
      null,
    );
  });
});
