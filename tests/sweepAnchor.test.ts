import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseArgs } from "../scripts/replay-sweep.ts";

/**
 * R3's whole bandwidth plan is one flag, and until 2026-09-01 the flag did not
 * exist.
 *
 * `replay-sweep.ts` read its cache pin from `isoDate(new Date())` at five
 * separate call sites — the warm loop, the simulate loop, the economic
 * calendar, the Treasury curve, and the manifest — so the driver could only
 * ever anchor at the run day. The spend gate's own comment already claimed the
 * capability: "R3 is the reason this matters now: anchored at a pinned day the
 * sweep fetches nothing." Nothing implemented it.
 *
 * Measured over all 290 rolling stores on 2026-09-01: 2026-08-25 and
 * 2026-08-26 are pinned in EVERY store, 2026-08-27 in 13, and the current day
 * in NONE. So an unanchored R3 refetches the whole roster against an exhausted
 * trailing-30 allowance, and the free run the program is sequenced around was
 * unreachable.
 */

const today = new Date().toISOString().slice(0, 10);

describe("the sweep can be anchored at a pinned day", () => {
  it("defaults to today, so every existing invocation is unchanged", () => {
    assert.equal(parseArgs([]).anchor, today);
  });

  it("takes a past day", () => {
    assert.equal(parseArgs(["--anchor", "2026-08-26"]).anchor, "2026-08-26");
  });

  it("refuses a token the store cannot match", () => {
    // A malformed anchor is not a typo the run can absorb: `pinned[anchor]` is
    // simply undefined, so the sweep refetches everything and reports success.
    for (const bad of ["26-08-26", "2026-8-26", "yesterday", "2026-08-26T00:00Z"]) {
      assert.throws(
        () => parseArgs(["--anchor", bad]),
        /--anchor must be YYYY-MM-DD/,
        `"${bad}" was accepted`,
      );
    }
  });

  it("refuses a future day, which no store can hold", () => {
    assert.throws(
      () => parseArgs(["--anchor", "2099-01-01"]),
      /is in the future/,
    );
  });

  it("refuses --repin together with a past anchor", () => {
    // They are opposites. `--repin` deletes the anchor's pin and refetches
    // every series to a common instant; a past anchor exists to READ a pin
    // that is already there. Together they spend exactly the bandwidth the
    // anchor was chosen to avoid — and roll the tail past the day the run
    // names, so it would not even measure what it says it measured.
    assert.throws(
      () => parseArgs(["--anchor", "2026-08-26", "--repin"]),
      /would delete that day's pins/,
    );
    // Still allowed at today's anchor, which is the rebuild's last pass.
    assert.equal(parseArgs(["--anchor", today, "--repin"]).repin, true);
    assert.equal(parseArgs(["--repin"]).repin, true);
  });
});

describe("the anchor reaches every series and the manifest", () => {
  const source = readFileSync("scripts/replay-sweep.ts", "utf8");

  it("leaves no run-day anchor behind", () => {
    // The defect was FIVE call sites agreeing with each other and with
    // nothing else. One missed site would silently refetch that series while
    // the rest read pins — the most expensive shape, because the run would
    // still look anchored.
    assert.doesNotMatch(
      source,
      /anchor:?\s*=?\s*isoDate\(new Date\(\)\)/,
      "a call site still derives its own anchor from the run day",
    );
  });

  it("threads the parsed anchor into both series loaders", () => {
    assert.match(source, /loadEconomicCalendar\([^)]*args\.anchor/s);
    assert.match(source, /loadTreasuryRates\(\s*args\.cacheDir,\s*args\.repin,\s*args\.anchor,/s);
  });

  it("records the anchor the run USED in the manifest", () => {
    // A corpus is a measurement of the bars visible at one instant. A manifest
    // stating the run day while the series were read at another would make
    // two different corpora indistinguishable — which is the whole failure
    // `conditionsOf` exists to prevent, one field earlier.
    assert.match(source, /^\s{6}anchor: args\.anchor,$/m);
  });
});
