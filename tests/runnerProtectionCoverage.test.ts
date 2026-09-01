import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAssetType,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { GRID_STRING_KEYS } from "../scripts/sweepGrid.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";

/**
 * R3's run card must carry the `runnerProtection` axis, and this is why.
 *
 * Amendment 39 makes the runner's give-back the standing priority, so which
 * protection mode a runner ran under is one of the two questions R3 is for.
 * R3 is the ONE re-sweep. If it runs the roster AT REST rather than across the
 * axis, each market is measured under whatever its own cell says — and the
 * resting distribution is not a comparison, it is three unequal samples.
 *
 * This pins the RELATIONSHIP rather than the counts. A calibration edit that
 * balanced the roster would fail here and send someone back to the run card
 * instead of leaving a stale "must run the axis" instruction standing after its
 * premise dissolved.
 */

const FLEET_SHARE = 2 / 3;

function restingArm(symbol: string): string {
  // The EFFECTIVE mode, matching `replay.ts:572`: an unset cell resolves to
  // breakeven at the resolver, so counting it as "unset" would make the
  // largest arm invisible in exactly the comparison this is about.
  return getCategoryCalibration(symbol).runnerProtection ?? "breakeven";
}

describe("the resting roster cannot answer the runnerProtection question", () => {
  const arms = new Map<string, string[]>();
  for (const symbol of defaultScanSymbols) {
    const arm = restingArm(symbol);
    arms.set(arm, [...(arms.get(arm) ?? []), symbol]);
  }

  it("every grid value is a value the roster actually ships", () => {
    // A grid axis whose values no market carries would be measuring a mode
    // that does not exist; one the roster ships but the axis omits would be
    // unmeasurable in R3. Both directions.
    const axis = new Set<string>(GRID_STRING_KEYS.runnerProtection);
    for (const arm of arms.keys()) {
      assert.ok(axis.has(arm), `the roster ships "${arm}", the axis omits it`);
    }
    for (const value of axis) {
      assert.ok(
        arms.has(value),
        `the axis offers "${value}" and no market rests there`,
      );
    }
  });

  it("at least one arm is too thin at rest for a fleet reading", () => {
    // THE RUN CARD'S PREMISE. If this ever passes vacuously — every arm above
    // the share — the instruction to run the axis is no longer justified by
    // coverage and someone must decide it on other grounds.
    const thin = [...arms].filter(
      ([, list]) => list.length < defaultScanSymbols.length * FLEET_SHARE,
    );
    assert.ok(
      thin.length > 0,
      "every protection arm now rests on two thirds of the roster, so the " +
        "run card's coverage argument has dissolved — revisit it",
    );
  });

  it("names the thinnest arm and how narrow it is", () => {
    const ranked = [...arms].sort((a, b) => a[1].length - b[1].length);
    const [arm, list] = ranked[0];
    const classes = new Set(list.map(getAssetType));
    // Not a literal count: the assertion is that the thinnest arm cannot
    // support a fleet verdict, stated as a share of the roster and a share of
    // its classes. A calibration edit moves the numbers and this still holds
    // or fails on the thing that matters.
    assert.ok(
      list.length < defaultScanSymbols.length * 0.25,
      `the thinnest arm "${arm}" now covers ${list.length} of ` +
        `${defaultScanSymbols.length} markets — wide enough that the run ` +
        `card's wording should be re-derived`,
    );
    assert.ok(
      classes.size <= 4,
      `"${arm}" now spans ${classes.size} classes; the run card says it ` +
        `cannot support a fleet verdict, which is a claim about breadth`,
    );
  });
});
