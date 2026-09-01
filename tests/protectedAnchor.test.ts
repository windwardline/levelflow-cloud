import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PROTECTED_ANCHORS } from "../scripts/calibrationCache.ts";

/**
 * R3 is the ONE re-sweep the remediation program allows, and it can run for
 * nothing — or for a full roster of provider fetches, depending on one date.
 *
 * `loadRollingSeries` returns straight from the store when
 * `store.pinned[anchor]` exists, with zero requests. Measured 2026-09-01 across
 * all 290 stores: every one pins 2026-08-26; only 13 pin 2026-08-27. So the
 * sweep is free at that anchor and makes 277 stores fetch at any later one,
 * against an allowance the owner is deliberately not topping up.
 *
 * The ordinary prune is what spends that. Pins drop oldest-first past
 * `PINS_KEPT = 5`, stores hold two to four today, and the nightly top-up is
 * standing down only because the provider is refusing — so eviction begins the
 * moment the allowance recovers. That is the same hour a sweep becomes
 * possible, and the last hour anyone would think to check.
 *
 * A note in HANDOFF cannot stop a launchd timer. These tests can.
 */

const SOURCE = readFileSync("scripts/calibrationCache.ts", "utf8");

describe("the protected anchor survives the prune", () => {
  it("holds protected days OUT of the prunable set, not merely early in it", () => {
    // Counting them against PINS_KEPT would let a run of ordinary top-ups
    // push the protected day out of the keep-window and evict it anyway —
    // which is the exact failure this exists to prevent, arriving later.
    assert.match(
      SOURCE,
      /\.filter\(\(day\) => !PROTECTED_DAYS\.has\(day\)\)/,
      "the prune no longer excludes protected anchors before slicing",
    );
    const pruneAt = SOURCE.indexOf("const prunable = Object.keys(store.pinned)");
    assert.ok(pruneAt > 0, "the prune moved — re-anchor this assertion");
    const prune = SOURCE.slice(pruneAt, pruneAt + 420);
    assert.match(prune, /prunable\.slice\(0, Math\.max\(0, prunable\.length - PINS_KEPT\)\)/);
    assert.doesNotMatch(
      prune,
      /Object\.keys\(store\.pinned\)\.sort\(\)\s*\n?\s*\.slice/,
      "the unfiltered key list is being sliced again",
    );
  });

  it("survives more top-ups than PINS_KEPT, by execution", () => {
    // The mechanism, run rather than read. Ten ordinary anchors written after
    // the protected one must not evict it.
    const protectedDay = PROTECTED_ANCHORS[0].day;
    const pinned: Record<string, number> = { [protectedDay]: 1_000 };
    const PINS_KEPT = 5;
    const PROTECTED = new Set(PROTECTED_ANCHORS.map((entry) => entry.day));
    for (let day = 1; day <= 10; day += 1) {
      pinned[`2026-09-${String(day).padStart(2, "0")}`] = 2_000 + day;
      // The shipped arithmetic, transcribed once and asserted against the
      // source above so the two cannot drift.
      const prunable = Object.keys(pinned).filter((d) => !PROTECTED.has(d)).sort();
      for (const stale of prunable.slice(0, Math.max(0, prunable.length - PINS_KEPT))) {
        delete pinned[stale];
      }
    }
    assert.ok(
      protectedDay in pinned,
      `${protectedDay} was evicted after ten later anchors — R3 would fetch ` +
        `a full roster instead of nothing`,
    );
    assert.equal(
      Object.keys(pinned).filter((d) => !PROTECTED.has(d)).length,
      PINS_KEPT,
      "growth is no longer bounded: protection must not disable pruning",
    );
  });

  it("still prunes everything that is NOT protected", () => {
    // Protection that quietly stopped pruning would trade one unbounded thing
    // for another — the store would grow a pin per anchor day forever.
    const PROTECTED = new Set(PROTECTED_ANCHORS.map((entry) => entry.day));
    const pinned: Record<string, number> = {};
    for (let day = 1; day <= 12; day += 1) {
      pinned[`2026-10-${String(day).padStart(2, "0")}`] = day;
    }
    const prunable = Object.keys(pinned).filter((d) => !PROTECTED.has(d)).sort();
    for (const stale of prunable.slice(0, Math.max(0, prunable.length - 5))) {
      delete pinned[stale];
    }
    assert.deepEqual(Object.keys(pinned).sort(), [
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
  });
});

describe("the list cannot quietly become permanent", () => {
  it("names a real anchor day, in the format the store keys on", () => {
    assert.ok(PROTECTED_ANCHORS.length >= 1, "nothing is protected");
    for (const entry of PROTECTED_ANCHORS) {
      assert.match(
        entry.day,
        /^\d{4}-\d{2}-\d{2}$/,
        `"${entry.day}" is not an anchor key — the store pins YYYY-MM-DD`,
      );
    }
  });

  it("makes every entry carry a reason and a condition for removal", () => {
    // A protected anchor that outlives its purpose is a store that never
    // prunes. The reason is what lets a future reader know when it is spent.
    for (const entry of PROTECTED_ANCHORS) {
      assert.ok(
        entry.why.length > 60,
        `${entry.day} carries no real reason: "${entry.why}"`,
      );
      assert.match(
        entry.why,
        /Remove once|remove once/,
        `${entry.day} does not say when it stops being needed, so it will ` +
          `outlive its sweep and prune nothing forever`,
      );
    }
  });

  it("stays a repository constant, not an environment variable", () => {
    // The agent that would evict the pin runs from a launchd plist with its
    // own environment. A guard that depends on a shell being right is not a
    // guard against that agent.
    const block = SOURCE.slice(
      SOURCE.indexOf("export const PROTECTED_ANCHORS"),
      SOURCE.indexOf("const PROTECTED_DAYS"),
    );
    assert.ok(block.length > 40, "PROTECTED_ANCHORS moved — re-anchor this");
    assert.doesNotMatch(block, /process\.env|Deno\.env/);
  });
});

describe("the anchor is still pinned where it matters", () => {
  it("reads the live cache when one is present, and says so when not", (t) => {
    // Executed against the REAL store, because the whole claim is about what
    // this machine holds. Skipped with a stated reason elsewhere — a silent
    // pass on a missing cache would be the vacuous kind.
    const dir = ".calibration-cache";
    let stores: string[] = [];
    try {
      stores = readdirSync(dir).filter((name) => name.endsWith(".rolling.json"));
    } catch {
      // No cache directory at all — a fresh clone, or CI.
      stores = [];
    }
    if (stores.length === 0) {
      t.skip("no .calibration-cache on this machine, so there is no pin to check");
      return;
    }
    const protectedDay = PROTECTED_ANCHORS[0].day;
    // A DETERMINISTIC SAMPLE, and the limit is stated. Reading all 290 stores
    // parses ~7.7 GB and took 33 seconds — the slowest test in the suite by an
    // order of magnitude, for a claim a sample answers. Every thirtieth store,
    // sorted, so the set is stable across runs and covers the alphabet rather
    // than one corner of it. The eviction this guards against is uniform:
    // pruning runs per store on the same rule, so a partial eviction large
    // enough to matter cannot hide from a spread sample.
    const sampled = stores.sort().filter((_, index) => index % 30 === 0);
    let holding = 0;
    for (const name of sampled) {
      try {
        const store = JSON.parse(readFileSync(join(dir, name), "utf8")) as {
          pinned?: Record<string, number>;
        };
        if (store.pinned && protectedDay in store.pinned) holding += 1;
      } catch {
        // A store this test cannot parse is not this test's finding.
      }
    }
    assert.ok(
      sampled.length >= 5,
      `only ${sampled.length} store(s) sampled — too few to judge`,
    );
    assert.ok(
      holding / sampled.length >= 0.9,
      `only ${holding} of ${sampled.length} sampled stores still pin ` +
        `${protectedDay} — ` +
        `the free anchor has already been partly evicted, and R3 would fetch ` +
        `for every store that lost it`,
    );
  });
});
