import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { staleAsOf } from "../scripts/replay-sweep.ts";
import {
  TREASURY_MAX_STALE_MS,
  treasuryCurveIsStale,
} from "../supabase/functions/trade-analyzer/macroRates.ts";

/**
 * A staleness bound judged against the wall clock cannot judge a past anchor.
 *
 * The guard protects a real thing: a decision past the Treasury curve's end
 * scores against stale rows as if they were fresh. But "past the curve's end"
 * is a question about the DECISIONS, and an anchored run's decisions end at its
 * anchor — every pinned series is truncated there.
 *
 * Judged against `Date.now()`, the same corpus grows staler every day it is not
 * run, and an anchor whose curve ends the day before becomes unusable exactly
 * seven days later. Measured 2026-09-01: the 2026-08-26 anchor's curve ends
 * 08-25, and the free run this whole program is sequenced around was refused
 * with "more than 7 days stale".
 *
 * This repo has shipped the same shape once already — "a staleness bound that
 * judged against the wall clock and ignored the bar in flight" (#420).
 */

const DAY = 86_400_000;
const anchorEnd = (day: string) => Date.parse(`${day}T23:59:59.999Z`);

describe("staleness is judged at the anchor, not at the wall clock", () => {
  it("uses the wall clock at today's anchor, which is unchanged behaviour", () => {
    const now = Date.parse("2026-09-01T04:00:00.000Z");
    assert.equal(staleAsOf("2026-09-01", now), now);
  });

  it("uses the anchor's end once the anchor is in the past", () => {
    const now = Date.parse("2026-09-01T04:00:00.000Z");
    assert.equal(staleAsOf("2026-08-26", now), anchorEnd("2026-08-26"));
  });

  it("never judges LATER than the wall clock", () => {
    // A future anchor is refused at parseArgs, but the bound must not depend
    // on that: a rule that could reach past now would make the guard weaker
    // the further ahead someone aimed.
    const now = Date.parse("2026-09-01T04:00:00.000Z");
    assert.ok(staleAsOf("2099-01-01", now) <= now);
  });

  it("admits the curve the 2026-08-26 anchor actually has", () => {
    // The real numbers, so this test fails if either the tolerance or the
    // anchor's relationship to its curve changes. The store's last row is
    // 2026-08-25; at the anchor that is one day stale, and at the wall clock
    // on 2026-09-01 it is seven.
    const curveEnd = Date.parse("2026-08-25T00:00:00.000Z");
    const now = Date.parse("2026-09-01T04:00:00.000Z");
    assert.equal(
      treasuryCurveIsStale(curveEnd, staleAsOf("2026-08-26", now)),
      false,
      "the anchored run is still refused, so the free sweep is unreachable",
    );
    assert.equal(
      treasuryCurveIsStale(curveEnd, now),
      true,
      "the wall clock no longer refuses it, so this test proves nothing — " +
        "either the tolerance moved or the fixture dates drifted",
    );
  });

  it("degrades by exactly the tolerance, not by an ad-hoc grace", () => {
    const curveEnd = Date.parse("2026-08-25T00:00:00.000Z");
    assert.equal(treasuryCurveIsStale(curveEnd, curveEnd + TREASURY_MAX_STALE_MS), false);
    assert.equal(treasuryCurveIsStale(curveEnd, curveEnd + TREASURY_MAX_STALE_MS + DAY), true);
  });
});

describe("the guard reads the anchored bound", () => {
  it("no longer passes Date.now() straight into the staleness check", () => {
    // The defect was ONE expression inside a hundred-line guard, which is
    // exactly where a wall-clock read hides. Extracting it made the rule
    // executable; this keeps it extracted.
    const source = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.doesNotMatch(source, /treasuryCurveIsStale\([^)]*Date\.now\(\)/);
    assert.match(source, /treasuryCurveIsStale\(lastRow\.dateMs, asOfMs\)/);
    assert.match(source, /const asOfMs = staleAsOf\(args\.anchor, Date\.now\(\)\)/);
  });
});
