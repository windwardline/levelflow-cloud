import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  forgoneRunnerR,
  type ResolutionLeg,
} from "../supabase/functions/trade-analyzer/replay.ts";

/**
 * The runner's give-back, made measurable on every resolution.
 *
 * WHY. The 4b geometry review found the ladder's halves pointing in opposite
 * directions in every class: the TP1 half banks positive R everywhere — forex
 * +62,646R over 323,631 fills — while the runner half loses 51,696R of it back. Those magnitudes are UNVERIFIED (from docs/research/baseline-2026-08-10, which remediation-program-2026-08-11.md lists as not to be trusted until re-measured — the direction is why this is ranked first, the magnitudes are not evidence)
 * 44% of forex fills exited at breakeven AFTER touching TP1, at a median
 * favourable excursion of 0.92R. Up nearly a full risk unit, and the runner
 * half surrendered.
 *
 * That was a one-time finding over a corpus. Nothing measured it on a live
 * resolution, so the engine's largest single loss was invisible between
 * reviews. Amendment 39 makes closing that gap the standing priority, and a
 * priority nothing measures is a preference.
 *
 * The fixtures state their own R arithmetic rather than recomputing it from the
 * function's own expression, so a change to that expression fails here instead
 * of agreeing with itself.
 */

const RISK = 10; // price units; every R below is a multiple of this

function legs(entry: number, exit: number, withTp1: boolean): ResolutionLeg[] {
  const rows: ResolutionLeg[] = [
    { leg: "entry", price: entry, time: 0 },
    { leg: "exit", price: exit, time: 3 },
  ];
  if (withTp1) rows.splice(1, 0, { leg: "tp1", price: entry + 4, time: 1 });
  return rows;
}

describe("the runner's give-back", () => {
  // Every case below fills AT the plan (plannedEntry === the entry leg), stated
  // explicitly. Left implicit they hid a real defect: the excursion is measured
  // from the PLANNED limit and the exit from the FILL, and equal fixtures made
  // the two baselines indistinguishable. The price-improved case is its own
  // describe block below.
  it("measures a breakeven exit after a 0.92R excursion", () => {
    // THE 44% CASE, at the review's own median. Entry 100, stop 10 away, so
    // 0.92R of favourable excursion is 9.2 price units. The runner exits at
    // entry, taking nothing. Half the position gave back 0.92R => 0.46R.
    const result = forgoneRunnerR({
      legs: legs(100, 100, true),
      maxFavorableMove: 9.2,
      plannedEntry: 100,
      riskDistance: RISK,
      side: "buy",
    });
    assert.equal(result, 0.46);
  });

  it("is zero when the runner exits at its own high", () => {
    // Nothing was handed back: the exit IS the excursion. Zero here is a real
    // measurement, which is why the no-runner case below returns null instead.
    const result = forgoneRunnerR({
      legs: legs(100, 109.2, true),
      maxFavorableMove: 9.2,
      plannedEntry: 100,
      riskDistance: RISK,
      side: "buy",
    });
    assert.equal(result, 0);
  });

  it("counts the give-back on a runner that stopped out below entry too", () => {
    // Entry 100, peak +9.2 (0.92R), exit 95 (-0.5R). The runner half swung
    // 1.42R from peak to exit; half of that is 0.71R.
    const result = forgoneRunnerR({
      legs: legs(100, 95, true),
      maxFavorableMove: 9.2,
      plannedEntry: 100,
      riskDistance: RISK,
      side: "buy",
    });
    assert.equal(result, 0.71);
  });

  it("reads a sell the same way, since excursion is a distance not a difference", () => {
    // The sign trap: maxFavorableMove is already a favourable DISTANCE
    // (`isBuy ? bar.high - entry : entry - bar.low`), so it must not be signed
    // a second time. A sell from 100 that ran to 90.8 and returned to entry
    // gave back the same 0.46R the mirrored buy did.
    const rows: ResolutionLeg[] = [
      { leg: "entry", price: 100, time: 0 },
      { leg: "tp1", price: 96, time: 1 },
      { leg: "exit", price: 100, time: 3 },
    ];
    const result = forgoneRunnerR({
      legs: rows,
      maxFavorableMove: 9.2,
      plannedEntry: 100,
      riskDistance: RISK,
      side: "sell",
    });
    assert.equal(result, 0.46);
  });

  it("refuses when there was no runner to give anything back", () => {
    // A full-size resolution with no tp1 leg never had a runner half. Returning
    // 0 would read as "gave nothing back" beside rows where that is a real
    // measurement, so it refuses instead — §19e applied to a statistic.
    assert.equal(
      forgoneRunnerR({
        legs: legs(100, 95, false),
        maxFavorableMove: 9.2,
        plannedEntry: 100,
        riskDistance: RISK,
        side: "buy",
      }),
      null,
    );
  });

  it("refuses an unusable risk distance or excursion rather than dividing by it", () => {
    assert.equal(
      forgoneRunnerR({
        legs: legs(100, 100, true),
        maxFavorableMove: 9.2,
        plannedEntry: 100,
        riskDistance: 0,
        side: "buy",
      }),
      null,
    );
    assert.equal(
      forgoneRunnerR({
        legs: legs(100, 100, true),
        maxFavorableMove: Number.NaN,
        plannedEntry: 100,
        riskDistance: RISK,
        side: "buy",
      }),
      null,
    );
  });

  it("never reports a negative give-back", () => {
    // An exit beyond the recorded excursion means the two were measured over
    // different windows. A negative would render as the runner having BEATEN
    // its own peak, so it floors — and the floor is asserted rather than
    // assumed, because the fill-bar rule already makes the two windows differ
    // by one bar (replay.ts: the excursion statistic begins after the fill).
    const result = forgoneRunnerR({
      legs: legs(100, 120, true),
      maxFavorableMove: 9.2,
      plannedEntry: 100,
      riskDistance: RISK,
      side: "buy",
    });
    assert.equal(result, 0);
  });
});

describe("the give-back is recorded, not just computable", () => {
  const source = readFileSync(
    join(
      new URL("..", import.meta.url).pathname,
      "supabase/functions/trade-analyzer/replay.ts",
    ),
    "utf8",
  );

  it("rides on the accountant every resolution path calls", () => {
    assert.match(
      source,
      /const realizedFields = \(\) => \(\{[\s\S]{0,400}?forgoneRunnerR: forgoneRunnerR\(/,
      "forgoneRunnerR left the shared accountant, so some resolution paths " +
        "will record it and others will not",
    );
  });

  it("is not dropped by the expiry branch's re-listing", () => {
    // THE BUG THIS CAUGHT BEFORE IT SHIPPED. The expiry branch destructured two
    // fields off the accountant and named them back one at a time, so a new
    // field was present on two resolution paths and silently absent on the
    // third — and expiry-after-TP1 is one of the give-back cases this exists to
    // measure. The repo has paid for this exact shape before: 12 dropped emit
    // fields, 2026-08-23.
    const expiry = source.slice(source.indexOf("kind: \"expiry\","));
    const body = expiry.slice(0, expiry.indexOf("state: \"resolved\","));
    assert.match(
      body,
      /\.\.\.resolved,/,
      "the expiry branch is re-listing the accountant's fields again instead " +
        "of spreading them; the next field added will be missing here",
    );
    assert.doesNotMatch(
      body,
      /^\s*realizedR,\s*$/m,
      "a hand-listed realizedR is back in the expiry feedback, which is the " +
        "re-listing this guard exists to prevent",
    );
  });
});

describe("one baseline, even when the fill beats the plan", () => {
  /**
   * THE DEFECT THE EQUAL FIXTURES HID.
   *
   * `maxFavorableMove` is measured against the PLANNED limit
   * (`isBuy ? bar.high - entry : entry - bar.low`), while the entry LEG carries
   * `fillPrice` — and a buy fills at `min(fillBar.open + halfSpread, entry)`,
   * at or better than plan. Reading the excursion off one baseline and the exit
   * off the other under-reported every price-improved fill's give-back by half
   * the improvement.
   *
   * Understating it is the flattering direction, which is why it needed a
   * fixture that can tell the two apart rather than a re-read.
   */
  it("counts the improvement as gain reached, not as gain forgone", () => {
    // Planned 100, filled 99.5 (half a point better), peak 9.2 above PLAN.
    // From the fill the trade reached 9.7; the runner exits at the fill, so it
    // handed back all of it: half of 0.97R = 0.485R.
    const result = forgoneRunnerR({
      legs: [
        { leg: "entry", price: 99.5, time: 0 },
        { leg: "tp1", price: 104, time: 1 },
        { leg: "exit", price: 99.5, time: 3 },
      ],
      maxFavorableMove: 9.2,
      plannedEntry: 100,
      riskDistance: RISK,
      side: "buy",
    });
    assert.equal(result, 0.485);
  });

  it("mirrors on a sell, where a better fill is a higher price", () => {
    // Planned 100, filled 100.5, peak 9.2 below PLAN. From the fill the trade
    // reached 9.7 in its favour and gave all of it back.
    const result = forgoneRunnerR({
      legs: [
        { leg: "entry", price: 100.5, time: 0 },
        { leg: "tp1", price: 96, time: 1 },
        { leg: "exit", price: 100.5, time: 3 },
      ],
      maxFavorableMove: 9.2,
      plannedEntry: 100,
      riskDistance: RISK,
      side: "sell",
    });
    assert.equal(result, 0.485);
  });

  it("is unchanged when the fill lands exactly on the plan", () => {
    // The regression guard for the rebasing itself: adding a term that is zero
    // in the common case must not disturb it.
    const result = forgoneRunnerR({
      legs: [
        { leg: "entry", price: 100, time: 0 },
        { leg: "tp1", price: 104, time: 1 },
        { leg: "exit", price: 100, time: 3 },
      ],
      maxFavorableMove: 9.2,
      plannedEntry: 100,
      riskDistance: RISK,
      side: "buy",
    });
    assert.equal(result, 0.46);
  });
});
