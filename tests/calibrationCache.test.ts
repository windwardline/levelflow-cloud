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
      fetchFull: async () => [tick(1_000), tick(2_000)],
      fetchSince: async () => [],
      key: "SYM-15min-max",
      timeOf,
    });
    const next = await loadRollingSeries<Tick>({
      anchor: "2026-07-31",
      cacheDir: dir,
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

  it("seeds from the newest legacy date-keyed file and pins same-day for free", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "SYM-15min-max-2026-07-29.json"),
      JSON.stringify([tick(10)]),
    );
    writeFileSync(
      join(dir, "SYM-15min-max-2026-07-30.json"),
      JSON.stringify([tick(10), tick(20)]),
    );
    const bars = await loadRollingSeries<Tick>({
      anchor: "2026-07-30",
      cacheDir: dir,
      fetchFull: async () => {
        throw new Error("legacy seed must not refetch full history");
      },
      fetchSince: async () => {
        throw new Error("same-day legacy seed must not top up");
      },
      key: "SYM-15min-max",
      legacyPrefix: "SYM-15min-max-",
      timeOf,
    });
    assert.deepEqual(bars.map(timeOf), [10, 20]);
    const store = JSON.parse(
      readFileSync(join(dir, "SYM-15min-max.rolling.json"), "utf8"),
    );
    assert.equal(store.pinned["2026-07-30"], 20);
  });
});
