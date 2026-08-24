import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// THE BOUNDARY CROSS-PRODUCT (C1/P3).
//
// The sweep evaluates every visibility gate at the decision bar's OPEN (`B`)
// while live evaluates at wall clock, which is never earlier than that bar's
// CLOSE (`B + 15min`). Correcting it means moving every gate by one primary
// span — and the tempting version of that fix is a blanket
// `latest.time + 15 * 60 * 1000`, validated on whichever markets someone
// happened to run and shipped across the roster. That is the archetype this
// program has now hit roughly a dozen times, so the blast radius is
// ENUMERATED here before any fix moves, rather than measured after.
//
// The enumeration is finite arithmetic on the bar grid: it needs no sweep, no
// FMP call and no calibration cache. What it establishes is which boundaries
// move by exactly one bar (all the grid-aligned ones) and which do not — and
// the ones that do not are where a roster-wide constant silently changes a
// market's behaviour in a way no grid-aligned class would reveal.
//
// EVERY ROW IS CHECKED AGAINST ITS SOURCE, not asserted from memory. A table
// of constants that can drift from the code it describes is a hand-picked
// list wearing a derivation's clothes — the exact defect this file exists to
// prevent one level up.

const PRIMARY_SPAN_MIN = 15;

type Boundary = {
  /** What the boundary gates. */
  name: string;
  /** Where it lives, and the literal that must still be there. */
  source: { file: string; literal: string };
  /** Minutes past midnight in the boundary's own zone. */
  minutes: number;
  zone: "ET" | "UTC";
  classes: string[];
};

const BOUNDARIES: Boundary[] = [
  // --- sessions.ts, agriculture ---
  {
    classes: ["agriculture"],
    minutes: 20 * 60,
    name: "grain session open, 20:00 ET",
    source: { file: "sessions.ts", literal: "const open = 20 * 60;" },
    zone: "ET",
  },
  {
    classes: ["agriculture"],
    minutes: 14 * 60 + 20,
    name: "grain session close, 14:20 ET",
    source: { file: "sessions.ts", literal: "const close = 14 * 60 + 20;" },
    zone: "ET",
  },
  // --- sessions.ts, futures ---
  {
    classes: ["futures", "metals", "energies", "indices"],
    minutes: 17 * 60,
    name: "futures daily pause open, 17:00 ET",
    source: { file: "sessions.ts", literal: "minutes >= 17 * 60 && minutes < 18 * 60" },
    zone: "ET",
  },
  {
    classes: ["futures", "metals", "energies", "indices"],
    minutes: 16 * 60 + 30,
    name: "futures Friday thin, 16:30 ET",
    source: { file: "sessions.ts", literal: "minutes >= 16 * 60 + 30" },
    zone: "ET",
  },
  // --- sessions.ts, FX ---
  {
    classes: ["forex"],
    minutes: 16 * 60 + 59,
    name: "FX daily rollover start, 16:59 ET",
    source: { file: "sessions.ts", literal: "easternMinutes >= 16 * 60 + 59" },
    zone: "ET",
  },
  {
    classes: ["forex"],
    minutes: 17 * 60 + 5,
    name: "FX daily rollover end / Sunday reopen, 17:05 ET",
    source: { file: "sessions.ts", literal: "easternMinutes < 17 * 60 + 5" },
    zone: "ET",
  },
  {
    classes: ["forex"],
    minutes: 8 * 60,
    name: "London/NY overlap open, 08:00 ET",
    source: { file: "sessions.ts", literal: "easternMinutes >= 8 * 60 && easternMinutes < 12 * 60" },
    zone: "ET",
  },
  // --- sessions.ts, low-edge windows ---
  {
    classes: ["crypto"],
    minutes: 12 * 60,
    name: "crypto low-edge window open, 12:00 UTC",
    source: { file: "sessions.ts", literal: "return hour >= 12 && hour < 18;" },
    zone: "UTC",
  },
  {
    classes: ["crypto"],
    minutes: 18 * 60,
    name: "crypto low-edge window close, 18:00 UTC",
    source: { file: "sessions.ts", literal: "return hour >= 12 && hour < 18;" },
    zone: "UTC",
  },
  // --- dailyCompletion.ts ---
  {
    classes: ["crypto"],
    minutes: 0,
    name: "crypto daily completion, 00:00 UTC",
    source: { file: "dailyCompletion.ts", literal: "+ 86_400_000" },
    zone: "UTC",
  },
  {
    classes: ["agriculture"],
    minutes: 14 * 60 + 20,
    name: "agriculture daily completion, 14:20 ET",
    source: { file: "dailyCompletion.ts", literal: "      14,\n      20,\n      0," },
    zone: "ET",
  },
  {
    classes: ["forex", "futures", "metals", "energies", "indices", "livestock"],
    minutes: 17 * 60,
    name: "complex + FX daily completion, 17:00 ET",
    source: {
      file: "dailyCompletion.ts",
      literal: "newYorkWallClockToUtcMs(stamp.year, stamp.month, stamp.day, 17, 0, 0)",
    },
    zone: "ET",
  },
  // --- macroRates.ts ---
  {
    classes: ["*"],
    minutes: 0,
    name: "Treasury visibility, New York midnight after the label",
    source: { file: "macroRates.ts", literal: "const visibleAt = newYorkWallClockToUtcMs(" },
    zone: "ET",
  },
];

const ENERGY_LOW_EDGE_UTC_HOURS = [3, 4, 12, 15, 19, 21];

describe("decision-instant boundary cross-product (C1/P3)", () => {
  it("every boundary's literal is still in its source file", () => {
    // The table cannot be allowed to drift from the code it describes. If a
    // constant moves, this fails before any downstream reasoning built on the
    // old value can mislead anyone.
    for (const boundary of BOUNDARIES) {
      const source = readFileSync(
        `supabase/functions/trade-analyzer/${boundary.source.file}`,
        "utf8",
      );
      assert.ok(
        source.includes(boundary.source.literal),
        `${boundary.name}: ${boundary.source.file} no longer contains ` +
          `${JSON.stringify(boundary.source.literal)} — the table has drifted ` +
          `from the code, so re-derive it rather than editing this string`,
      );
    }
  });

  it("energy low-edge hours are whole UTC hours, so all six sit on the grid", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/sessions.ts",
      "utf8",
    );
    assert.ok(
      source.includes(
        `new Set([${ENERGY_LOW_EDGE_UTC_HOURS.join(", ")}])`,
      ),
      "the energy low-edge hour set moved — re-derive this row",
    );
    for (const hour of ENERGY_LOW_EDGE_UTC_HOURS) {
      assert.equal((hour * 60) % PRIMARY_SPAN_MIN, 0);
    }
  });

  // THE FINDING THIS FILE EXISTS FOR. A boundary on the 15-minute grid moves
  // by exactly one bar when the decision instant moves from B to B+15min:
  // the bar that used to be the last one before the boundary is still the
  // last one, one position earlier. A boundary OFF the grid does not, because
  // the shift can cross it without landing on it — and the bar that changes
  // is not the bar a grid-aligned class would predict.
  it("names exactly which boundaries are off the 15-minute grid", () => {
    const offGrid = BOUNDARIES
      .filter((b) => b.minutes % PRIMARY_SPAN_MIN !== 0)
      .map((b) => b.name)
      .sort();
    assert.deepEqual(
      offGrid,
      [
        "FX daily rollover end / Sunday reopen, 17:05 ET",
        "FX daily rollover start, 16:59 ET",
        "agriculture daily completion, 14:20 ET",
        "grain session close, 14:20 ET",
      ],
      "a fix validated only on grid-aligned classes does not validate these — " +
        "if this set changes, the decision-instant fix's blast radius changed " +
        "with it",
    );
  });

  it("shows the grain close costs agriculture a decision bar the grid classes keep", () => {
    // Under B, the last decision bar whose OPEN precedes the 14:20 close is
    // 14:15. Under B+15, that same bar's instant is 14:30, which is past the
    // close — so agriculture loses it, while a class whose boundary sits on
    // the grid loses nothing at all. Predicted here before the fix runs.
    const close = 14 * 60 + 20;
    const lastOpenUnderB = Math.floor((close - 1) / PRIMARY_SPAN_MIN) *
      PRIMARY_SPAN_MIN;
    assert.equal(lastOpenUnderB, 14 * 60 + 15, "14:15 under the bar-open clock");
    assert.ok(
      lastOpenUnderB + PRIMARY_SPAN_MIN > close,
      "and its completion instant 14:30 is past the 14:20 close",
    );
    const lastOpenUnderBPlusS = Math.floor((close - 1) / PRIMARY_SPAN_MIN) *
      PRIMARY_SPAN_MIN - PRIMARY_SPAN_MIN;
    assert.equal(
      lastOpenUnderBPlusS,
      14 * 60,
      "so the last admissible open becomes 14:00 — one decision bar lost, " +
        "for agriculture only",
    );

    // The contrast: 17:00 ET is on the grid, so the complex loses nothing.
    const gridClose = 17 * 60;
    assert.equal(
      Math.floor((gridClose - 1) / PRIMARY_SPAN_MIN) * PRIMARY_SPAN_MIN,
      16 * 60 + 45,
    );
    assert.equal(
      (16 * 60 + 45) + PRIMARY_SPAN_MIN,
      gridClose,
      "16:45 completes exactly AT 17:00, so it stays admissible — the " +
        "equality case the grid-aligned rules lean on",
    );
  });

  it("shows the FX rollover window is shorter than one bar span", () => {
    // [16:59, 17:05) is six minutes wide against a fifteen-minute bar, and
    // neither edge is on the grid. Exactly one bar falls inside it either
    // way, but WHICH bar changes under the shift — so a fix cannot be
    // validated by counting blocked bars.
    const start = 16 * 60 + 59;
    const end = 17 * 60 + 5;
    assert.ok(end - start < PRIMARY_SPAN_MIN, "narrower than a bar span");
    assert.notEqual(start % PRIMARY_SPAN_MIN, 0);
    assert.notEqual(end % PRIMARY_SPAN_MIN, 0);
  });

  it("states that a validation inside one DST regime does not cover the other", () => {
    // 16:30 ET is 20:30 UTC under EDT and 21:30 under EST. The energy
    // low-edge set is expressed in UTC HOURS, so which ET session edges it
    // intersects changes by season — a run inside one regime validates one
    // half of the cross product.
    const etEdgeMinutes = 16 * 60 + 30;
    const utcUnderEdt = (etEdgeMinutes + 4 * 60) / 60;
    const utcUnderEst = (etEdgeMinutes + 5 * 60) / 60;
    assert.equal(Math.floor(utcUnderEdt), 20);
    assert.equal(Math.floor(utcUnderEst), 21);
    assert.ok(
      ENERGY_LOW_EDGE_UTC_HOURS.includes(21) &&
        !ENERGY_LOW_EDGE_UTC_HOURS.includes(20),
      "21 is a low-edge hour and 20 is not, so this ET edge falls inside the " +
        "low-edge set under EST and outside it under EDT",
    );
  });
});
