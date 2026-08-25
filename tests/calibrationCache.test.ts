import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  ECON_CALENDAR_CLOCK,
  ECON_CALENDAR_MERGE_FIELDS,
} from "../scripts/clockWitness.ts";
import { join } from "node:path";
import {
  loadRollingSeries,
  mergeByTime,
  TOP_UP_OVERLAP_MS,
} from "../scripts/calibrationCache.ts";

type Tick = { time: number; value: number };
const timeOf = (tick: Tick) => tick.time;
const tick = (time: number, value = 0): Tick => ({ time, value });
const CLOCK = "test-clock-v1";

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "calib-cache-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("calibration rolling cache", () => {
  it("merges by time with the fresher fetch winning and sorts", () => {
    const merged = mergeByTime(
      [tick(1, 10), tick(3, 30)],
      [tick(2, 20), tick(3, 31)],
      timeOf,
    );
    assert.deepEqual(merged, [tick(1, 10), tick(2, 20), tick(3, 31)]);
  });

  it("fetches full once, then serves the pinned day without the network", async () => {
    const dir = tempDir();
    let fullCalls = 0;
    let sinceCalls = 0;
    const load = () =>
      loadRollingSeries<Tick>({
        anchor: "2026-07-30",
        cacheDir: dir,
        clock: CLOCK,
        fetchFull: async () => {
          fullCalls += 1;
          return [tick(100), tick(200)];
        },
        fetchSince: async () => {
          sinceCalls += 1;
          return [];
        },
        key: "SYM-15min-max",
        timeOf,
      });
    const first = await load();
    const second = await load();
    assert.equal(fullCalls, 1);
    assert.equal(sinceCalls, 0);
    assert.deepEqual(first, second);
    assert.equal(second.length, 2);
  });

  it("tops up a new day from the last stored time minus the overlap", async () => {
    const dir = tempDir();
    let sinceArg: number | null = null;
    await loadRollingSeries<Tick>({
      anchor: "2026-07-30",
      cacheDir: dir,
      clock: CLOCK,
      fetchFull: async () => [tick(1_000), tick(2_000)],
      fetchSince: async () => [],
      key: "SYM-15min-max",
      timeOf,
    });
    const next = await loadRollingSeries<Tick>({
      anchor: "2026-07-31",
      cacheDir: dir,
      clock: CLOCK,
      fetchFull: async () => {
        throw new Error("full refetch must not happen on top-up");
      },
      fetchSince: async (since) => {
        sinceArg = since;
        return [tick(2_000), tick(3_000)];
      },
      key: "SYM-15min-max",
      timeOf,
    });
    assert.equal(sinceArg, 2_000 - TOP_UP_OVERLAP_MS);
    assert.deepEqual(next.map(timeOf), [1_000, 2_000, 3_000]);
  });

  it("keeps earlier anchors' views stable after a later top-up", async () => {
    const dir = tempDir();
    const base = {
      cacheDir: dir,
      clock: CLOCK,
      fetchFull: async () => [tick(1_000)],
      key: "SYM-15min-max",
      timeOf,
    };
    await loadRollingSeries<Tick>({
      ...base,
      anchor: "2026-07-30",
      fetchSince: async () => [],
    });
    await loadRollingSeries<Tick>({
      ...base,
      anchor: "2026-07-31",
      fetchSince: async () => [tick(5_000)],
    });
    const dayOneAgain = await loadRollingSeries<Tick>({
      ...base,
      anchor: "2026-07-30",
      fetchSince: async () => {
        throw new Error("pinned day must not refetch");
      },
    });
    assert.deepEqual(dayOneAgain.map(timeOf), [1_000]);
  });

  // I3: the anchor pin is durable truth for the day, and later runs only ever
  // top up from the last stored time — so anything pinned short is never
  // refetched. A fetch that could not complete must therefore reach this
  // function as a throw, not as a partial array: `loadRollingSeries` cannot tell
  // "the series ends here" from "the provider dropped a chunk", and pinning the
  // second holes the news join under every future walk-forward measurement.
  it("pins nothing and writes nothing when the fetch could not complete", async () => {
    const dir = tempDir();
    await assert.rejects(
      loadRollingSeries<Tick>({
        anchor: "2026-07-30",
        cacheDir: dir,
        clock: CLOCK,
        fetchFull: async () => {
          throw new Error("provider chunk failed");
        },
        fetchSince: async () => [],
        key: "SYM-15min-max",
        timeOf,
      }),
      /provider chunk failed/,
    );
    assert.throws(() => readFileSync(join(dir, "SYM-15min-max.rolling.json")));

    // And the retry that follows sees a clean slate: full history, no pin.
    const recovered = await loadRollingSeries<Tick>({
      anchor: "2026-07-30",
      cacheDir: dir,
      clock: CLOCK,
      fetchFull: async () => [tick(10), tick(20)],
      fetchSince: async () => {
        throw new Error("a store miss must fetch full history");
      },
      key: "SYM-15min-max",
      timeOf,
    });
    assert.deepEqual(recovered.map(timeOf), [10, 20]);
  });
});

// R0 one clock (remediation program 2026-08-11, Phase 0). The cache stores
// NORMALIZED items and only ever tops up, so a normalizer change strands
// every previously cached bar on the old clock — the exact mechanism of
// the mixed-clock corpus. Each store now records the clock that wrote it
// and refuses to load under any other, LOUDLY: a silent refetch of a
// multi-gigabyte store against a possibly-exhausted FMP allowance must be
// a decision, never a side effect.
describe("R0 one-clock store guard", () => {
  it("stamps new stores with the clock that wrote them", async () => {
    const dir = tempDir();
    await loadRollingSeries<Tick>({
      anchor: "2026-08-18",
      cacheDir: dir,
      clock: CLOCK,
      fetchFull: async () => [tick(10)],
      fetchSince: async () => [],
      key: "SYM-15min-max",
      timeOf,
    });
    const store = JSON.parse(
      readFileSync(join(dir, "SYM-15min-max.rolling.json"), "utf8"),
    );
    assert.equal(store.clock, CLOCK);
  });

  it("refuses an unstamped (pre-R0) store instead of reading or topping it up", async () => {
    const dir = tempDir();
    // The 2026-08-11 poisoned store's exact shape: items and pins, no clock.
    writeFileSync(
      join(dir, "SYM-15min-max.rolling.json"),
      JSON.stringify({ items: [tick(10)], pinned: { "2026-08-18": 10 } }),
    );
    await assert.rejects(
      loadRollingSeries<Tick>({
        anchor: "2026-08-18",
        cacheDir: dir,
        clock: CLOCK,
        fetchFull: async () => {
          throw new Error("a refused store must not trigger a refetch");
        },
        fetchSince: async () => {
          throw new Error("a refused store must not be topped up");
        },
        key: "SYM-15min-max",
        timeOf,
      }),
      /cacheClockMismatch.*unstamped.*cache-rebuild-r0/s,
    );
    // The store itself is untouched — evidence, not casualty.
    const store = JSON.parse(
      readFileSync(join(dir, "SYM-15min-max.rolling.json"), "utf8"),
    );
    assert.deepEqual(store.items, [tick(10)]);
  });

  it("refuses a store stamped under a different clock, pinned day or not", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "SYM-15min-max.rolling.json"),
      JSON.stringify({
        clock: "some-older-clock",
        items: [tick(10)],
        pinned: { "2026-08-18": 10 },
      }),
    );
    await assert.rejects(
      loadRollingSeries<Tick>({
        anchor: "2026-08-18",
        cacheDir: dir,
        clock: CLOCK,
        fetchFull: async () => [],
        fetchSince: async () => [],
        key: "SYM-15min-max",
        timeOf,
      }),
      /cacheClockMismatch.*some-older-clock/s,
    );
  });

  // #358: a truncated or malformed store used to fall through to re-init
  // and silently start a full refetch — the exact "decision, not a side
  // effect" the header forbids — and on success OVERWROTE the evidence.
  // Every malformed shape now refuses loudly, under a token the nightly
  // top-up deliberately does NOT stand down for.
  for (
    const [label, content] of [
      ["truncated JSON", '{"items":[{"ti'],
      ["items is null", JSON.stringify({ clock: CLOCK, items: null, pinned: {} })],
      ["top-level array", JSON.stringify([{ time: 1 }])],
      ["pinned missing", JSON.stringify({ clock: CLOCK, items: [tick(1)] })],
    ] as const
  ) {
    it(`refuses a corrupt store (${label}) instead of silently refetching`, async () => {
      const dir = tempDir();
      writeFileSync(join(dir, "SYM-15min-max.rolling.json"), content);
      await assert.rejects(
        loadRollingSeries<Tick>({
          anchor: "2026-08-18",
          cacheDir: dir,
          clock: CLOCK,
          fetchFull: async () => {
            throw new Error("a corrupt store must not trigger a refetch");
          },
          fetchSince: async () => {
            throw new Error("a corrupt store must not be topped up");
          },
          key: "SYM-15min-max",
          timeOf,
        }),
        /cacheStoreUnreadable/,
      );
      // The file is untouched — evidence, not casualty.
      assert.equal(
        readFileSync(join(dir, "SYM-15min-max.rolling.json"), "utf8"),
        content,
      );
    });
  }

  it("ignores legacy date-keyed files — the r17 migration imported the defect era", async () => {
    const dir = tempDir();
    // Under the removed migration this file would have seeded the store
    // (and pinned same-day) with pre-clock-stamp data. It must now be
    // inert: a store miss fetches full history instead.
    writeFileSync(
      join(dir, "SYM-15min-max-2026-07-30.json"),
      JSON.stringify([tick(10), tick(20)]),
    );
    const bars = await loadRollingSeries<Tick>({
      anchor: "2026-07-30",
      cacheDir: dir,
      clock: CLOCK,
      fetchFull: async () => [tick(30)],
      fetchSince: async () => {
        throw new Error("a store miss must fetch full history");
      },
      key: "SYM-15min-max",
      timeOf,
    });
    assert.deepEqual(bars.map(timeOf), [30]);
  });
});

// The other half of I3, in the caller that feeds the cache. Read as text: the
// sweep script runs `main()` on import, so no harness reaches these functions.
describe("the sweep's fetchers report an incomplete series rather than pinning it", () => {
  const sweep = readFileSync("scripts/replay-sweep.ts", "utf8");

  it("throws on a failed economic-calendar chunk, as the bar fetcher already does", () => {
    // It used to warn and `continue`, so one transient FMP failure during the
    // 13-year backfill silently dropped a 90-day window — and because the merged
    // result was then pinned as the anchor day's truth, the hole was permanent
    // under every later run.
    assert.doesNotMatch(sweep, /Calendar fetch failed \(\$\{response\.status\}\); continuing\./);
    assert.match(
      sweep,
      /throw new Error\(\s*`Calendar fetch failed \(\$\{response\.status\}\)/,
    );
    // The precedent it now matches. Asserted on the SENTENCE rather than on
    // the exact interpolation: `fetchBars` reads its body inside the retry
    // now, so the status arrives as `result.response.status`, and pinning the
    // old expression would have failed a change that strengthened the very
    // behaviour this test protects.
    assert.match(sweep, /throw new Error\(\s*`FMP request failed \(\$\{[\w.]+\.status\}\)/);
  });
});

describe("repin — making a multi-hour rebuild into one snapshot", () => {
  // The pin exists so a run is reproducible within its anchor day: once a
  // market is fetched, every later call that day returns the same tail. Right
  // for a sweep, wrong for the last pass of a REBUILD.
  //
  // The v4 build took five attempts across a night, so each market was pinned
  // at whatever moment it happened to be fetched. Measured on the finished
  // cache: 16.4 hours between the oldest and newest tail, clustering by build
  // attempt. The clock verifier refused it on 57 checks, correctly — a corpus
  // whose markets were observed 16 hours apart is not one snapshot.

  const store = (dir: string, key: string, times: number[]) => {
    writeFileSync(
      join(dir, `${key}.rolling.json`),
      JSON.stringify({
        clock: "test-clock",
        items: times.map((time) => ({ time })),
        pinned: { "2026-08-25": times.at(-1) },
      }),
    );
  };

  it("tops up a pinned series instead of returning the pin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repin-"));
    store(dir, "X-15min-7000", [1_000, 2_000]);
    let fetched = false;
    const items = await loadRollingSeries<{ time: number }>({
      anchor: "2026-08-25",
      cacheDir: dir,
      clock: "test-clock",
      fetchFull: () => Promise.resolve([]),
      fetchSince: () => {
        fetched = true;
        return Promise.resolve([{ time: 3_000 }]);
      },
      key: "X-15min-7000",
      repin: true,
      timeOf: (item) => item.time,
    });
    assert.equal(fetched, true, "repin did not reach the provider");
    assert.deepEqual(items.map((item) => item.time), [1_000, 2_000, 3_000]);
  });

  it("still honours the pin when repin is off — the default must not change", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repin-off-"));
    store(dir, "Y-15min-7000", [1_000, 2_000]);
    let fetched = false;
    const items = await loadRollingSeries<{ time: number }>({
      anchor: "2026-08-25",
      cacheDir: dir,
      clock: "test-clock",
      fetchFull: () => Promise.resolve([]),
      fetchSince: () => {
        fetched = true;
        return Promise.resolve([{ time: 3_000 }]);
      },
      key: "Y-15min-7000",
      timeOf: (item) => item.time,
    });
    assert.equal(fetched, false, "the pin no longer holds without repin");
    assert.deepEqual(items.map((item) => item.time), [1_000, 2_000]);
  });

  it("is append-only — a shorter provider answer cannot shorten the store", async () => {
    // FMP's intraday depth ages out; a refetch can legitimately return fewer
    // bars than are already stored. Repinning must never turn that into data
    // loss, or the cure would be worse than the ragged edge.
    const dir = mkdtempSync(join(tmpdir(), "repin-short-"));
    store(dir, "Z-15min-7000", [1_000, 2_000, 3_000]);
    const items = await loadRollingSeries<{ time: number }>({
      anchor: "2026-08-25",
      cacheDir: dir,
      clock: "test-clock",
      fetchFull: () => Promise.resolve([]),
      fetchSince: () => Promise.resolve([{ time: 3_000 }]),
      key: "Z-15min-7000",
      repin: true,
      timeOf: (item) => item.time,
    });
    assert.deepEqual(items.map((item) => item.time), [1_000, 2_000, 3_000]);
  });

  it("every rolling-store load in the driver passes it — derived, not counted", () => {
    // Four of the six sites carried it on the first pass; the calendar and
    // the treasury curve did not. A corpus is one snapshot or it is not, and
    // "the bars are current but the calendar is sixteen hours behind" is the
    // same raggedness one layer down.
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    const loads = (driver.match(/loadRollingSeries</g) ?? []).length;
    const passes = (driver.match(/^\s+repin(,|: args\.repin,)$/gm) ?? []).length;
    assert.ok(loads > 0, "no rolling-store loads found — re-anchor this test");
    assert.equal(
      passes,
      loads,
      `${loads} rolling-store loads but ${passes} pass repin`,
    );
  });
});

describe("the calendar keeps every event on an instant", () => {
  // A Map keyed on the timestamp alone kept ONE survivor per instant, and an
  // economic calendar puts many releases on one. Measured against the live
  // store before the fix: three fetches returned 75,183 / 75,186 / 75,206
  // medium-high events; the store held 42,676 items with 42,676 distinct
  // times — 43% discarded.
  //
  // Sampling FMP for 2026-08-13: of 30 medium/high events, 13 survive keying
  // on time, 16 survive time|currency|impact, and 30 survive once the release
  // NAME joins the key. Core PPI and Initial Jobless Claims are both
  // USD/medium at 12:30; HICP and CPI both EUR/medium at 07:00.
  const event = (time: number, currency: string, name: string) => ({
    currency,
    impact: "medium" as const,
    name,
    time,
  });
  const calendarKey = (e: { currency: string; impact: string; name: string; time: number }) =>
    `${e.time}|${e.currency}|${e.impact}|${e.name}`;

  it("keeps two releases that share an instant, a currency and an impact", () => {
    const merged = mergeByTime(
      [],
      [
        event(1_000, "USD", "Core PPI MoM"),
        event(1_000, "USD", "Initial Jobless Claims"),
      ],
      (e) => e.time,
      calendarKey,
    );
    assert.equal(merged.length, 2);
    assert.deepEqual(merged.map((e) => e.name).sort(), [
      "Core PPI MoM",
      "Initial Jobless Claims",
    ]);
  });

  it("still lets a revision supersede its own original", () => {
    // Same quadruple twice is one release restated, not two events. The
    // fresher fetch wins, which is the behaviour the time-only key had and
    // the composite key must keep.
    const merged = mergeByTime(
      [{ ...event(1_000, "USD", "CPI YoY"), impact: "medium" as const }],
      [{ ...event(1_000, "USD", "CPI YoY"), impact: "medium" as const }],
      (e) => e.time,
      calendarKey,
    );
    assert.equal(merged.length, 1);
  });

  it("leaves bar stores on time-only keying — two bars at one instant is a defect", () => {
    // The default must not change. intradayChunks relies on this dissolution
    // to absorb chunk-boundary overlap, and a second bar at one instant on
    // one timeframe is a duplicate, not a pair.
    const merged = mergeByTime(
      [{ time: 1_000, close: 1 }],
      [{ time: 1_000, close: 2 }],
      (b) => b.time,
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].close, 2);
  });

  it("orders by time, then by identity, so a rebuild is byte-stable", () => {
    // Time alone is no longer a total order, so an unstable sort would make
    // two rebuilds of identical data produce different files and different
    // manifest hashes.
    const rows = [
      event(2_000, "EUR", "HICP YoY"),
      event(1_000, "USD", "Initial Jobless Claims"),
      event(1_000, "USD", "Core PPI MoM"),
    ];
    const once = mergeByTime([], rows, (e) => e.time, calendarKey);
    const again = mergeByTime([], [...rows].reverse(), (e) => e.time, calendarKey);
    assert.deepEqual(once.map(calendarKey), again.map(calendarKey));
    assert.deepEqual(once.map((e) => e.name), [
      "Core PPI MoM",
      "Initial Jobless Claims",
      "HICP YoY",
    ]);
  });

  it("recomputes stored keys on a top-up instead of duplicating them", () => {
    // THE FAILURE MODE THAT MAKES THE NAME A STORED FIELD. A top-up keys
    // everything already on disk, so a key needing a field the store does not
    // carry would treat every stored row as new. Here the stored rows carry
    // their names and merge cleanly with an overlapping refetch.
    const stored = [
      event(1_000, "USD", "Core PPI MoM"),
      event(1_000, "USD", "Initial Jobless Claims"),
    ];
    const merged = mergeByTime(
      stored,
      [event(1_000, "USD", "Core PPI MoM"), event(2_000, "EUR", "CPI YoY")],
      (e) => e.time,
      calendarKey,
    );
    assert.equal(merged.length, 3);
  });
});

describe("the calendar's wiring in the driver, derived from its source", () => {
  // The merge behaviour above is unit-testable; the driver's use of it is not
  // — fetchCalendarEvents is not exported and replay-sweep runs main() on
  // import. Both mutations below survived the unit tests, so these exist.
  const driver = readFileSync("scripts/replay-sweep.ts", "utf8");

  it("passes a composite key, built from the clock-coupled field list", () => {
    // Without a composite key the merge keeps its default and the store
    // collapses again, silently, with every unit test still green.
    //
    // The key was a hand-written template until the field list became the
    // single source for both it and the clock tag. Asserting the template
    // here would now pin the drift-prone form back into place.
    assert.match(
      driver,
      /keyOf: \(event\) =>\s*\n?\s*ECON_CALENDAR_MERGE_FIELDS\.map/,
      "the calendar no longer keys on the clock-coupled field list",
    );
  });

  it("captures the release name from the payload, and refuses a row without one", () => {
    // The name is the discriminator. A parse that defaulted it to "" would
    // key every same-instant, same-currency, same-impact event identically
    // and collapse exactly as before — so an absent name must drop the row
    // rather than silently produce a colliding one.
    assert.match(
      driver,
      /const name = String\(raw\.event \?\? ""\)\.trim\(\);/,
      "the calendar parse no longer reads the release name",
    );
    assert.match(
      driver,
      /if \(Number\.isFinite\(time\) && currency && name\) \{/,
      "a row with no release name must be refused, not stored nameless",
    );
  });

  it("stamps the calendar on its own clock, and leaves the Treasury curve alone", () => {
    // Splitting the constant is what lets a calendar-only defect invalidate
    // the calendar alone. Bumping the shared one would have deleted a
    // Treasury curve that took five build attempts to get right.
    assert.match(driver, /clock: ECON_CALENDAR_CLOCK,/);
    assert.match(
      driver,
      /clock: \{ calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK \}/,
      "the manifest must carry the new calendar clock so the door refuses older corpora",
    );
    assert.match(
      readFileSync("scripts/replay-sweep.ts", "utf8"),
      /clock: CALENDAR_CLOCK,\s*\n\s*repin,\s*\n\s*fetchFull: \(\) => fetchTreasuryRates/,
      "the Treasury store must stay on CALENDAR_CLOCK",
    );
  });
});

describe("the merge key and the clock tag cannot drift apart", () => {
  // A key ONE FIELD SHORT is the defect a census provably cannot see.
  // Measured on the live store: dropping `name` discards 42.4% of the
  // calendar, `currency` 32.9%, `impact` 27.0% — and only the degenerate
  // time-only case leaves itemCount === distinctTimes. Every partial key in
  // between reads a healthy events-per-instant ratio, because the healthy
  // range (1.463 in 2013 to 2.000 in 2026) straddles the collapsed 1.490.
  //
  // So the guard is not a threshold. It is that changing the key changes the
  // store stamp, which forces a refetch instead of producing a lighter corpus
  // that looks correct.

  it("derives the clock tag from the field list", () => {
    for (const field of ECON_CALENDAR_MERGE_FIELDS) {
      assert.ok(
        ECON_CALENDAR_CLOCK.includes(field),
        `the clock tag must name ${field}, or dropping it would not change the stamp`,
      );
    }
  });

  it("names exactly the fields that make an event distinct", () => {
    // Deliberately LISTED. Exhaustiveness cannot be derived here — "what
    // makes two releases different" is a judgement about the provider, not a
    // property of the code — so this is the decision record, and a change to
    // it is meant to be visible in a diff.
    assert.deepEqual([...ECON_CALENDAR_MERGE_FIELDS], [
      "time",
      "currency",
      "impact",
      "name",
    ]);
  });

  it("the driver builds its key FROM that list, not from a literal", () => {
    // A hand-written template string would drift from the tag silently,
    // which is exactly the uncoupling this replaces.
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(
      driver,
      /keyOf: \(event\) =>\s*\n?\s*ECON_CALENDAR_MERGE_FIELDS\.map/,
      "the calendar key is hand-written again and can drift from the clock tag",
    );
  });

  it("refuses a store stamped under a different field list", () => {
    // The mechanism itself, executed: a store written when the key was one
    // field shorter carries a different tag and must not load.
    const dir = mkdtempSync(join(tmpdir(), "keydrift-"));
    writeFileSync(
      join(dir, "econ-calendar.rolling.json"),
      JSON.stringify({
        clock: "fmp-econ-calendar-utc-v2-time+currency+impact",
        items: [{ time: 1_000 }],
        pinned: {},
      }),
    );
    assert.rejects(
      () =>
        loadRollingSeries<{ time: number }>({
          anchor: "2026-08-25",
          cacheDir: dir,
          clock: ECON_CALENDAR_CLOCK,
          fetchFull: () => Promise.resolve([]),
          fetchSince: () => Promise.resolve([]),
          key: "econ-calendar",
          timeOf: (item) => item.time,
        }),
      /cacheClockMismatch/,
    );
  });
});
