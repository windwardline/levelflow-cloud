import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  calculateMacroRateAdjustment,
  getMacroRateRole,
  MACRO_RATE_ROLE_BY_SYMBOL,
  type MacroRateRole,
  parseTreasuryRow,
  TREASURY_MAX_STALE_MS,
  treasuryContextFromRows,
  treasuryCurveIsStale,
  treasuryCurveStaleMs,
  treasuryVisibleAtMs,
  unavailableContext,
} from "../supabase/functions/trade-analyzer/macroRates.ts";
import {
  ASSET_TYPE_BY_SYMBOL,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  correlationGroups,
  knownSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import type {
  Side,
  SupportedSymbol,
} from "../supabase/functions/trade-analyzer/types.ts";

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
    //
    // The AS-OF instant is the driver's own business and differs by design
    // (2026-09-01): live is now, and an anchored replay's decisions end at its
    // anchor, so the driver passes `staleAsOf(args.anchor, Date.now())`.
    // Judged against the wall clock, the 2026-08-26 anchor's curve read seven
    // days stale and refused the one free sweep the program is sequenced
    // around. This assertion is about there being ONE bound, never about which
    // instant each caller judges it at — pinning `Date.now()` here made it
    // look like both.
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(driver, /treasuryCurveIsStale\(lastRow\.dateMs, asOfMs\)/);
    assert.match(
      driver,
      /const asOfMs = staleAsOf\(args\.anchor, Date\.now\(\)\)/,
      "the driver's as-of instant must still be derived, not a bare literal",
    );
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

describe("the macro role table — an omission cannot hide in it", () => {
  const ctx = (bps: number) => ({
    curveSpreadBps: 50,
    latestDate: "2026-08-24",
    previousDate: "2026-08-21",
    source: "fmp_treasury_rates" as const,
    tenYearChangeBps: bps,
    tenYearYield: 4.2,
    twoYearYield: 3.7,
  });
  const adjust = (symbol: string, side: Side, bps: number) =>
    calculateMacroRateAdjustment(symbol as SupportedSymbol, side, ctx(bps));
  const membersOf = (role: MacroRateRole) =>
    Object.entries(MACRO_RATE_ROLE_BY_SYMBOL)
      .filter(([, entry]) => entry.role === role)
      .map(([symbol]) => symbol)
      .sort();

  it("covers every symbol the analysis door admits — derived, not listed", () => {
    // THE structural guarantee, and the one the four Sets could never give.
    // They were exhaustive over the 59-symbol roster the day they were
    // written and silently stopped being exhaustive when nineteen futures
    // landed on 2026-08-06. This fails on the NEXT onboarding batch instead
    // of five weeks later.
    //
    // Derived from knownSymbols — the door's own population via
    // isKnownSymbol — and NOT from defaultScanSymbols, which subtracts
    // contract-size variants the door still admits. MGCUSD is the
    // difference, and deriving from the scan roster would omit a market that
    // is scored today.
    const missing = knownSymbols.filter(
      (symbol) => !(symbol in MACRO_RATE_ROLE_BY_SYMBOL),
    );
    assert.deepEqual(missing, [], `no macro role stated for: ${missing}`);
  });

  it("names no symbol the door does not admit — rot in the other direction", () => {
    // BRENT sat in ENERGY_SYMBOLS for fifteen days after it left symbolMap
    // (#287). A membership naming a market that cannot be analyzed reads as
    // coverage and is not.
    const known = new Set(knownSymbols);
    const dead = Object.keys(MACRO_RATE_ROLE_BY_SYMBOL).filter(
      (symbol) => !known.has(symbol),
    );
    assert.deepEqual(dead, [], `role stated for unknown symbol: ${dead}`);
  });

  it("keeps each family the repo already asserts whole — the C1/C2 test", () => {
    // Populations DERIVED from structures this repo maintains for other
    // reasons, so they cannot drift apart silently. correlationGroups calls
    // the four Treasury tenors one curve that moves "together far more than
    // they diverge" — the exact claim that makes a two-of-four rate rule
    // indefensible.
    //
    // No derived closure for energies on purpose: correlationGroups has no
    // group naming crude with its refined products, and ASSET_TYPE_BY_SYMBOL
    // .energies is ["BRENT", "WTI"]. Deriving one would mean inventing the
    // family and then presenting a judgement as though the repo had stated
    // it. That question stays in the `why` fields, where it is visibly open.
    for (
      const [label, members] of [
        ["treasury_futures", correlationGroups.treasury_futures],
        ["us_equity_indices", correlationGroups.us_equity_indices],
        ["indices", ASSET_TYPE_BY_SYMBOL.indices],
        ["crypto", ASSET_TYPE_BY_SYMBOL.crypto],
      ] as const
    ) {
      const off = members.filter(
        (symbol) => getMacroRateRole(symbol).role !== "rate-inverse",
      );
      assert.deepEqual(
        off,
        [],
        `${label} is split across roles; these are not rate-inverse: ${off}`,
      );
    }
  });

  it("states every role's membership literally — the decision record", () => {
    // Deliberately LISTED, not derived, and the one test here that is.
    // Exhaustiveness above catches a market with no role; this catches a
    // market quietly moved between roles, which no derivation can see
    // because a reclassification changes the derivation too.
    assert.deepEqual(membersOf("usd-base"), ["USDCAD", "USDCHF", "USDJPY"]);
    assert.deepEqual(membersOf("usd-quote"), [
      "AUDUSD",
      "EURUSD",
      "GBPUSD",
      "NZDUSD",
    ]);
    assert.deepEqual(membersOf("energy-shock"), [
      "BZUSD",
      "CLUSD",
      "HOUSD",
      "NGUSD",
      "RBUSD",
      "WTI",
    ]);
    assert.equal(membersOf("rate-inverse").length, 52);
    assert.equal(membersOf("none").length, 33);
    assert.equal(Object.keys(MACRO_RATE_ROLE_BY_SYMBOL).length, 98);
  });

  it("claims seven currency pairs, where the regex claimed thirty", () => {
    // The defect none of the symptom-level findings named. The old
    // getUsdStrengthSide tested whether a symbol LOOKED like a pair, so gold,
    // bitcoin and the Russell were all routed as currency pairs — and any
    // future ticker shaped XXXUSD would have been claimed sight unseen.
    const pairs = [...membersOf("usd-base"), ...membersOf("usd-quote")];
    assert.equal(pairs.length, 7);
    const shaped = knownSymbols.filter((symbol) =>
      /^USD[A-Z]{3}$/.test(symbol) || /^[A-Z]{3}USD$/.test(symbol)
    );
    // 30 over the DOOR's population, not the 29 the scan roster shows —
    // MGCUSD is the difference, and quoting the scan figure here would be
    // the same wrong-population mistake one level down.
    assert.equal(shaped.length, 30);
  });

  it("gives every `none` a reason, so an oversight cannot pass as a decision", () => {
    const silent = Object.entries(MACRO_RATE_ROLE_BY_SYMBOL)
      .filter(([, entry]) => entry.why.trim().length === 0)
      .map(([symbol]) => symbol);
    assert.deepEqual(silent, []);
  });

  it("pins that usd-quote and rate-inverse agree — a coincidence, recorded", () => {
    // They are separate roles emitting the same side on this roster. That is
    // why the old regex never produced a wrong answer while shadowing three
    // Set memberships. Recorded here so the day they diverge, it is a test
    // failure and not a silent reinterpretation.
    for (const bps of [7, -7]) {
      assert.equal(
        adjust("EURUSD", "buy", bps).stance,
        adjust("BTCUSD", "buy", bps).stance,
      );
    }
  });

  it("routes each role to the side and magnitude it names", () => {
    assert.equal(adjust("USDJPY", "buy", 7).stance, "aligned");
    assert.equal(adjust("EURUSD", "sell", 7).stance, "aligned");
    for (const symbol of ["ESUSD", "GCUSD", "BTCUSD", "ZBUSD"]) {
      assert.equal(adjust(symbol, "sell", 7).stance, "aligned", symbol);
      assert.equal(adjust(symbol, "buy", -7).stance, "aligned", symbol);
    }
    // Magnitude doubles past the 8bps shock line, on both sides of it.
    assert.equal(adjust("ESUSD", "sell", 7).adjustment, 1);
    assert.equal(adjust("ESUSD", "sell", 10).adjustment, 2);
    // energy-shock carries no direction: a penalty on a large move, zero
    // otherwise, and never an alignment either way.
    assert.equal(adjust("WTI", "buy", 10).adjustment, -1);
    assert.equal(adjust("WTI", "sell", 10).adjustment, -1);
    assert.equal(adjust("WTI", "buy", 5).adjustment, 0);
    assert.equal(adjust("WTI", "buy", 10).stance, "neutral");
    // `none` is inert in both directions at every magnitude.
    for (const bps of [5, 10, -5, -10]) {
      assert.equal(adjust("ZCUSX", "buy", bps).adjustment, 0);
      assert.equal(adjust("ZCUSX", "buy", bps).stance, "neutral");
    }
  });

  it("closed the four open questions and left the two that are owner calls", () => {
    // The transcription PR marked six markets OPEN. Four are now answered by
    // the families the repo itself already asserts; two are not, and the
    // difference is the whole point. A question closed because it was
    // derivable is a repair. A question closed because someone picked is a
    // model change, and PLUSD/PAUSD need a criterion separating monetary from
    // industrial metals that nothing in this repo states.
    assert.deepEqual(
      Object.entries(MACRO_RATE_ROLE_BY_SYMBOL)
        .filter(([, entry]) => entry.why.startsWith("OPEN"))
        .map(([symbol]) => symbol)
        .sort(),
      ["PAUSD", "PLUSD"],
    );
    // HGUSD is NOT open: copper's exclusion is a decision written in the old
    // metals Set's own composition, which admitted every precious metal and
    // left this one out. It is recorded, not pending.
    assert.equal(getMacroRateRole("HGUSD").role, "none");
    assert.ok(!getMacroRateRole("HGUSD").why.startsWith("OPEN"));
  });

  it("moves the score for exactly the four markets it meant to", () => {
    // The behaviour change, stated as behaviour. The equivalence proof that
    // licensed the transcription is deleted with this commit: it reproduced
    // the OLD routing, and asserting the old routing after deliberately
    // changing it would pin the defect.
    for (const symbol of ["ZFUSD", "ZTUSD"]) {
      assert.equal(adjust(symbol, "sell", 7).adjustment, 1, symbol);
      assert.equal(adjust(symbol, "buy", 7).adjustment, -1, symbol);
      assert.equal(adjust(symbol, "buy", -10).adjustment, 2, symbol);
    }
    for (const symbol of ["HOUSD", "RBUSD"]) {
      // No direction — a penalty on a large move, and nothing otherwise.
      assert.equal(adjust(symbol, "buy", 10).adjustment, -1, symbol);
      assert.equal(adjust(symbol, "sell", 10).adjustment, -1, symbol);
      assert.equal(adjust(symbol, "buy", 5).adjustment, 0, symbol);
      assert.equal(adjust(symbol, "buy", 10).stance, "neutral", symbol);
    }
    // And nothing else moved: the two owner calls stay inert at every
    // magnitude, on both sides.
    for (const symbol of ["PLUSD", "PAUSD", "HGUSD"]) {
      for (const bps of [5, 10, -5, -10]) {
        assert.equal(adjust(symbol, "buy", bps).adjustment, 0, `${symbol} ${bps}`);
      }
    }
  });

});
