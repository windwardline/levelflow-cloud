import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  calculateMacroRateAdjustment,
  parseTreasuryRow,
  TREASURY_MAX_STALE_MS,
  treasuryContextFromRows,
  treasuryCurveIsStale,
  treasuryCurveStaleMs,
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

  it("never coerces an absent-shaped tenor to 0.0%, and bounds the rest to plausible yields (#364 round 8, finding 3)", () => {
    // Number(null) and Number("") are both 0 — one such row would swing
    // tenYearChangeBps by hundreds of bps in both directions, pass every
    // continuity guard, and pin into the rolling store permanently.
    const date = "2026-08-11";
    assert.equal(parseTreasuryRow({ date, year2: 1.87, year10: null }), null);
    assert.equal(parseTreasuryRow({ date, year2: 1.87, year10: "" }), null);
    // A LITERAL zero is indistinguishable from the coercion signature and
    // no US tenor has printed 0.00 — refused, raising I11 live instead.
    assert.equal(parseTreasuryRow({ date, year2: 1.87, year10: 0 }), null);
    // Corruption bound: the 1981 all-time peak was 15.8%.
    assert.equal(parseTreasuryRow({ date, year2: 1.87, year10: 30 }), null);
    // The 2020 trough — genuinely tiny but positive — must still parse.
    const trough = parseTreasuryRow({
      date: "2020-08-04",
      year2: 0.11,
      year10: 0.52,
    });
    assert.deepEqual(trough, {
      dateMs: Date.parse("2020-08-04"),
      tenYear: 0.52,
      twoYear: 0.11,
    });
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

describe("Treasury curve staleness (C6) — a 200 is not freshness", () => {
  const DAY = 86_400_000;
  const label = Date.UTC(2026, 7, 17); // Monday 2026-08-17

  it("passes a curve published within the publication bound", () => {
    assert.equal(treasuryCurveIsStale(label, label + 1 * DAY), false);
    assert.equal(treasuryCurveIsStale(label, label + 6 * DAY), false);
  });

  it("does NOT trip on a lawful weekend or midweek-holiday gap", () => {
    // THE REMEDY MUST NOT RE-CREATE THE ARCHETYPE. Treasury publishes on
    // business days, so the curve legitimately gaps three calendar days across
    // a weekend and four across a midweek holiday. A predicate asking whether
    // the two newest rows are ADJACENT would refuse every Monday — and under
    // amendment 31 an unjustified refusal is a coverage loss, never a safe
    // default. Seven days clears the longest lawful gap.
    assert.equal(treasuryCurveIsStale(label, label + 3 * DAY), false, "weekend");
    assert.equal(treasuryCurveIsStale(label, label + 4 * DAY), false, "holiday");
  });

  it("refuses a curve whose newest label is past the bound", () => {
    assert.equal(treasuryCurveIsStale(label, label + 8 * DAY), true);
    assert.equal(treasuryCurveIsStale(label, label + 200 * DAY), true);
  });

  it("pins the bound at exactly seven days, from both sides", () => {
    assert.equal(TREASURY_MAX_STALE_MS, 7 * DAY);
    assert.equal(treasuryCurveIsStale(label, label + 7 * DAY), false);
    assert.equal(treasuryCurveIsStale(label, label + 7 * DAY + 1), true);
  });

  it("measures from the LABEL date, not from when the label became visible", () => {
    // The two differ by up to a day: treasuryVisibleAtMs moves a label to the
    // New York midnight AFTER it, so a bound taken there runs a day tighter.
    // Stated because a silent choice between them is a silent day of
    // tolerance.
    assert.ok(treasuryVisibleAtMs(label) > label);
    assert.equal(
      treasuryCurveStaleMs(label, label + 5 * DAY),
      5 * DAY,
      "staleness is asOf minus the label, with no visibility lead subtracted",
    );
  });

  it("is ONE definition, called by the sweep rather than copied", () => {
    // The sweep refused on this bound inline, twice, before the live path had
    // any bound at all. Moving the number to macroRates without making the
    // sweep call it would have minted a third copy to keep in step.
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(driver, /treasuryCurveIsStale\(lastRow\.dateMs, Date\.now\(\)\)/);
    assert.doesNotMatch(
      driver,
      /lastRow\.dateMs < Date\.now\(\) - 7 \* 86_400_000/,
      "the inline copy must be gone, not merely shadowed",
    );
    const live = readFileSync(
      "supabase/functions/trade-analyzer/macroContext.ts",
      "utf8",
    );
    assert.match(live, /treasuryCurveIsStale\(latest\.dateMs, Date\.now\(\)\)/);
  });
});
