import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { fiveMinuteFloorFor } from "../scripts/sweepStats.ts";

/**
 * The 5-minute class floors, checked against the population they bind.
 *
 * R0d, closed 2026-08-30. `crypto: 260` was derived from two probes — BTCUSD
 * 288.0 and THETAUSD 287.9 — that both sat AT the class ceiling, then
 * generalised to 33 symbols. It ended up ABOVE the thinnest market it binds
 * (ratio 1.042), which is a floor that can only refuse a healthy member, and
 * it was refusing exactly one: DYDXUSD.
 *
 * A test pinning `260` would have passed every day that was true. So this one
 * pins the RELATIONSHIP instead: every floor must sit in the band its siblings
 * occupy relative to its own class ceiling, and no floor may exceed the
 * thinnest market it binds. Both are properties of the measured population,
 * read from the census artifact rather than retyped here.
 *
 * The census is a fixed, reviewed artifact — not regenerated on the fly.
 * Regenerating it per run would re-baseline a decaying feed into looking
 * healthy, which is the same failure `derive-baselines.ts` documents in its
 * own header and refuses by default.
 */

type ClassCensus = {
  ceiling?: number;
  measured: number;
  min?: number;
  missingStores: string[];
  rosterSize: number;
  symbols: Record<string, { rowsPerDay: number; spanDays: number }>;
};

/**
 * The census records MEASUREMENT ONLY — no floor, no ratio. Everything
 * compared below is computed here from the shipped constant and that
 * evidence, so regenerating the artifact can never make a floor agree with
 * itself. An earlier draft stored the floor in the census and every
 * assertion became circular the moment the census was rebuilt.
 */
type Fit = {
  ceiling: number;
  floor: number;
  min: number;
  name: string;
  overCeiling: number;
  overMin: number;
  refuses: string[];
};

const census = JSON.parse(
  readFileSync("docs/research/five-minute-density-census-2026-08-30.json", "utf8"),
) as { classes: Record<string, ClassCensus>; window: string };

/** Classes the census measured AND that the shipped table gives a floor. */
const floored: Fit[] = Object.entries(census.classes).flatMap(([name, c]) => {
  const symbols = Object.keys(c.symbols);
  if (!c.measured || symbols.length === 0) return [];
  const floor = fiveMinuteFloorFor(symbols[0]);
  if (floor === undefined) return [];
  return [{
    ceiling: c.ceiling ?? 0,
    floor,
    min: c.min ?? 0,
    name,
    overCeiling: floor / (c.ceiling ?? 1),
    overMin: floor / (c.min ?? 1),
    refuses: symbols.filter((s) => c.symbols[s].rowsPerDay < floor),
  }];
});

describe("the 5-minute floors fit the population they bind", () => {
  it("has a census with something in it", () => {
    // NON-VACUITY, and it is not decoration: `floored` is a filter, and a
    // census whose stores all went missing would empty it and pass every
    // requirement below having checked nothing.
    assert.equal(census.window, "recent-90");
    assert.ok(
      floored.length >= 3,
      `only ${floored.length} floored classes were measured — the census ` +
        `cannot support the comparison this file makes`,
    );
  });

  it("never sets a floor above the thinnest market it binds", () => {
    // The defect in one assertion. A floor above its own class minimum is not
    // a conservative floor; it is a guaranteed refusal of a healthy member,
    // which amendment 31 forbids without a calibration verdict.
    for (const c of floored) {
      assert.ok(
        c.overMin < 1,
        `${c.name}: floor ${c.floor} exceeds its thinnest market (${c.min} ` +
          `rows/day, ratio ${c.overMin.toFixed(3)}) — it can only refuse a ` +
          `healthy member`,
      );
    }
  });

  it("keeps every class inside one band relative to its own ceiling", () => {
    // The floors were calibrated as "probed margin under the measured week",
    // and for a tight class the ceiling and the minimum coincide — so the
    // ratio that generalises across classes is to the CEILING. Crypto is the
    // only class whose two ratios diverge, because it has a genuine outlier
    // below it, and anchoring on the ceiling is what keeps the disputed
    // market out of its own threshold.
    const ratios = floored.map((c) => c.overCeiling);
    const lo = Math.min(...ratios);
    const hi = Math.max(...ratios);
    assert.ok(
      hi - lo <= 0.06,
      `floor/ceiling ratios span ${lo.toFixed(3)}-${hi.toFixed(3)} across ` +
        floored.map((c) => `${c.name} ${c.overCeiling.toFixed(3)}`).join(", ") +
        ` — one class is being judged by a different rule from the others, ` +
        `which is exactly what 260 was`,
    );
  });

  it("refuses nothing in the measured population", () => {
    // Not "refuses little" — nothing. Every market in the census is a matched
    // market the roster already carries, and the census was taken from warm
    // stores that passed the clock witnesses. A floor that refuses one of them
    // is making a calibration claim it has no evidence for.
    for (const c of floored) {
      assert.deepEqual(
        c.refuses,
        [],
        `${c.name}: the floor refuses ${c.refuses.join(", ")} — if that is a ` +
          `real verdict it belongs in the decline register with its ` +
          `measurement, not in a density gate`,
      );
    }
  });

  it("resolves each class through the real lookup, not the raw table", () => {
    // `fiveMinuteFloorFor` carries the forex-fallback guard, so reading the
    // table directly would test a path production does not take.
    for (const c of floored) {
      assert.ok(
        Number.isFinite(c.floor) && c.floor > 0,
        `${c.name}: no usable floor resolved`,
      );
    }
    assert.ok(
      floored.some((c) => c.name === "crypto"),
      "crypto must be in the compared set — it is the class this closed",
    );
  });

  it("still catches a materially clipped feed", () => {
    // The cost of lowering crypto, asserted rather than assumed. The depth
    // floor is the ONLY instrument that sees a clip applied symmetrically to
    // both resolutions; no ratio can. Halving a feed must still refuse in
    // every floored class, which is what keeps this a loosening and not a
    // removal.
    for (const c of floored) {
      const halved = c.ceiling / 2;
      assert.ok(
        halved < c.floor,
        `${c.name}: a feed clipped to half its ceiling (${halved.toFixed(1)}) ` +
          `would PASS a floor of ${c.floor} — the floor has stopped being a ` +
          `clip instrument`,
      );
    }
  });
});
