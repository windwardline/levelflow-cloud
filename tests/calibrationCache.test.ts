import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
    // The precedent it now matches.
    assert.match(sweep, /FMP request failed \(\$\{response\.status\}\)/);
  });
});
