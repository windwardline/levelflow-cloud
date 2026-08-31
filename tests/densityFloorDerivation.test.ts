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

  it("keeps every class inside one band relative to its own MINIMUM", () => {
    // ANCHORED ON THE MINIMUM, and the first version of this test anchored on
    // the CEILING and passed — because the census it read had lost the one
    // class that disproves it. Nine of the 97 markets resolve to a different
    // PROVIDER symbol than their roster name (all six indices, WTI->CLUSD,
    // ARWUSD->ARUSD, TRUMPUSD->OTRUMPUSD), the 2026-08-30 census looked them
    // up by roster name and recorded them as missing, and indices is the class
    // whose members are furthest apart. Its floor sits at 0.464 of its ceiling
    // and 0.726 of its minimum: on the ceiling anchor it is a wild outlier, on
    // the minimum anchor it is in band with every sibling.
    //
    // The minimum is also the anchor that means something. A floor exists to
    // catch a degraded feed, and the market at risk of falling through it is
    // the thinnest one — so what has to be consistent across classes is the
    // headroom the thinnest member gets.
    const ratios = floored.map((c) => c.overMin);
    const lo = Math.min(...ratios);
    const hi = Math.max(...ratios);
    assert.ok(
      hi - lo <= 0.15,
      `floor/min ratios span ${lo.toFixed(3)}-${hi.toFixed(3)} across ` +
        floored.map((c) => `${c.name} ${c.overMin.toFixed(3)}`).join(", ") +
        ` — one class is being judged by a different rule from the others`,
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

  it("still catches a feed clipped to half its class MINIMUM", () => {
    // The property that actually matters, and the one every floored class
    // satisfies: a market at the class floor of health, halved, must refuse.
    for (const c of floored) {
      assert.ok(
        c.min / 2 < c.floor,
        `${c.name}: the thinnest market halved (${(c.min / 2).toFixed(1)}) ` +
          `would PASS a floor of ${c.floor} — the floor has stopped being a ` +
          `clip instrument`,
      );
    }
  });

  it("names the class where the two floor jobs are ARITHMETICALLY incompatible", () => {
    // A floor has two jobs and they can conflict. It must (a) catch a feed
    // clipped to half, for every member — so `floor > ceiling / 2` — and (b)
    // leave the thinnest member fleet-standard headroom, so
    // `floor <= ~0.72 x min`. Both hold only when `ceiling / min < 1.44`.
    //
    // DERIVED, not listed: the exception is computed from the census, so a
    // class that grows apart joins it and a class that tightens leaves it,
    // without anyone remembering to edit a name.
    const conflicted = floored.filter((c) => c.ceiling / c.min >= 1.44);
    assert.deepEqual(
      conflicted.map((c) => c.name),
      ["indices"],
      `classes whose members are too far apart for one floor to do both jobs: ` +
        conflicted.map((c) =>
          `${c.name} (ceiling/min ${(c.ceiling / c.min).toFixed(2)})`
        ).join(", ") +
        ` — if this set changed, the floor for the newcomer needs the same ` +
        `argument indices got rather than a number`,
    );
    // And the consequence, stated rather than hidden: indices' floor does NOT
    // catch a half-clip of its healthiest member. Raising it to cover that
    // would take the thinnest member's headroom below every sibling's. The
    // 5/15 ratio instrument is what covers clips there; the depth floor
    // cannot, and pretending otherwise with a tuned constant would be the
    // manufactured kind of fix.
    const indices = floored.find((c) => c.name === "indices");
    assert.ok(indices, "indices left the floored set — re-read this argument");
    assert.ok(
      indices.ceiling / 2 > indices.floor,
      "indices' floor now catches a half-clip of its ceiling, so the " +
        "incompatibility above has been resolved and this note is stale",
    );
  });
});
