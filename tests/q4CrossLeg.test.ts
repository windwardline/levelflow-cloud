import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runQ4 } from "../scripts/q4-daily-structure-stop.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * The Q4 reader on a forex cross (2026-09-14): its commission needs the USD
 * leg's last completed daily close, read from the leg's own pinned store
 * the same zero-byte way as the cross's series. Executed end to end over a
 * hand-built cache, because a key that misses the leg's store or a pointer
 * that never advances would otherwise read as every decision refusing —
 * the reader defect wearing a market refusal.
 */

const ANCHOR = "2026-08-26";
const DAYS = 7000;
// A Monday 00:00 New York (04:00Z in June): the stamps the true-clock era
// carries, so the witness never mistakes the fixture for a naive store.
const START = Date.UTC(2026, 5, 15, 4);

function sawtooth(count: number, fall: number, rise: number): number[] {
  const period = fall + rise;
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    return position < fall ? 168 - (8 / fall) * position : 160 + (8 / rise) * (position - fall);
  });
}

function intraday(values: readonly number[], stepMs: number, wick: number): Bar[] {
  return values.map((value, index) => ({
    close: value,
    high: value + wick,
    low: value - wick,
    open: value,
    time: START + index * stepMs,
    volume: 1_000,
  }));
}

function daily(count: number, close: number): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: close + (index % 2 === 0 ? 0.5 : -0.5) * (close / 100),
    high: close * 1.032,
    low: close * 0.968,
    open: close,
    time: START - (count - index) * 86_400_000,
    volume: 10_000,
  }));
}

function writeStore(dir: string, key: string, items: Bar[]): string {
  const path = join(dir, `${key}.rolling.json`);
  const pinnedThrough = items.length > 0 ? items.at(-1)!.time : START;
  writeFileSync(path, JSON.stringify({ clock: BAR_CLOCK, items, pinned: { [ANCHOR]: pinnedThrough } }));
  return path;
}

// The cross beside a USD pair that needs no leg: the runner refuses a run in
// which NO market produced a plan before it reports anything (q4NoDecisions,
// exit 2), so the unpinned cross must be reported beside a market that measured.
function buildCache(): { dir: string; legStore: string } {
  const dir = mkdtempSync(join(tmpdir(), "q4-cross-"));
  const shape = [...sawtooth(450, 12, 4), ...sawtooth(450, 24, 8)];
  writeStore(dir, `EURJPY-15min-${DAYS}`, intraday(shape, 900_000, 0.15));
  writeStore(dir, `EURJPY-daily-${DAYS}`, daily(80, 166));
  writeStore(dir, `EURJPY-5min-${DAYS}`, []);
  writeStore(dir, `EURUSD-15min-${DAYS}`, intraday(shape.map((value) => value / 150), 900_000, 0.001));
  writeStore(dir, `EURUSD-daily-${DAYS}`, daily(80, 166 / 150));
  writeStore(dir, `EURUSD-5min-${DAYS}`, []);
  const legStore = writeStore(dir, `USDJPY-daily-${DAYS}`, daily(80, 153.5));
  return { dir, legStore };
}

describe("the Q4 reader prices a cross from its leg's pinned daily store", () => {
  it("walks the cross with the leg pinned: plans are built, nothing is unpinned", async () => {
    const { dir } = buildCache();
    const json = join(dir, "out.json");
    const code = await runQ4(["--symbols", "EURJPY,EURUSD", "--cache-dir", dir, "--anchor", ANCHOR, "--json", json]);
    const out = JSON.parse(readFileSync(json, "utf8")) as { byMarket: Record<string, { planned: number }>; unpinned: unknown[]; skipped: unknown[] };
    assert.deepEqual(out.unpinned, [], `unpinned: ${JSON.stringify(out.unpinned)}`);
    assert.deepEqual(out.skipped, [], `skipped: ${JSON.stringify(out.skipped)}`);
    assert.ok(out.byMarket.EURJPY, "the cross was measured");
    assert.ok(out.byMarket.EURJPY.planned > 0, "no decision produced a plan — a cross with its leg must price");
    assert.ok(out.byMarket.EURUSD?.planned > 0, "the USD pair measures beside it");
    assert.ok(code === 0 || code === 3, `exit ${code}: 4 would mean the leg read as unpinned`);
  });

  it("names the leg when its store is missing, and fails the run rather than planning nothing", async () => {
    const { dir, legStore } = buildCache();
    unlinkSync(legStore);
    const json = join(dir, "out.json");
    const code = await runQ4(["--symbols", "EURJPY,EURUSD", "--cache-dir", dir, "--anchor", ANCHOR, "--json", json]);
    assert.equal(code, 4, "the population is short of the one asked for");
    const out = JSON.parse(readFileSync(json, "utf8")) as { byMarket: Record<string, { planned: number } | undefined>; unpinned: Array<{ symbol: string; why: string }> };
    assert.equal(out.unpinned.length, 1);
    assert.equal(out.unpinned[0].symbol, "EURJPY");
    assert.match(out.unpinned[0].why, /USD leg USDJPY: q4PinMissing/);
    assert.equal(out.byMarket.EURJPY, undefined, "a cross without its leg must not be measured as if it priced");
    assert.ok(out.byMarket.EURUSD && out.byMarket.EURUSD.planned > 0, "the USD pair still measures");
  });
});
