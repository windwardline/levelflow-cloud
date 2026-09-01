import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readPinnedDays } from "../scripts/calibrationCache.ts";
import { anchoredPreflight } from "../scripts/replay-sweep.ts";
import { getCotContractMapping } from "../supabase/functions/trade-analyzer/cotContext.ts";
import { resolveProviderSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";

/**
 * A run that provably spends nothing is not subject to a gate on spending.
 *
 * Measured 2026-09-01: the shared breaker is OPEN on the bandwidth wall, which
 * drains by time over days and re-arms every six hours as probes fail. The
 * spend gate sits on the RUN, so it refused a run that would fetch nothing —
 * the exact run the anchor exists to make possible, blocked by a guard on
 * bytes it will not spend. The free ride was unreachable for as long as the
 * wall stood.
 *
 * The exemption is EARNED, never asserted. An anchored run still fetches any
 * series whose store lacks that pin, so a blanket exemption would spend the
 * roster behind an open breaker while claiming to be free. The pre-flight is
 * the proof, and it also mechanizes the HANDOFF's standing instruction to
 * re-measure the pin population immediately before the sweep — an instruction
 * to remember something is not a guard against forgetting it.
 */

function store(pinned: Record<string, number>, items = 3): string {
  // Same key order this module writes: clock, items, pinned last.
  return JSON.stringify({
    clock: "venue-wall-utc-v4",
    items: Array.from({ length: items }, (_, index) => ({
      close: 1 + index,
      time: 1_700_000_000_000 + index,
    })),
    pinned,
  });
}

describe("the pin census reads the tail, not the store", () => {
  const dir = mkdtempSync(join(tmpdir(), "pins-"));

  it("returns the pins without parsing megabytes", async () => {
    const path = join(dir, "a.rolling.json");
    writeFileSync(path, store({ "2026-08-26": 17 }));
    assert.deepEqual(await readPinnedDays(path), { "2026-08-26": 17 });
  });

  it("survives a store far larger than the tail window", async () => {
    // 64 KB is the window; this store is comfortably past it, which is the
    // case that matters — the real ones reach 121 MB.
    const path = join(dir, "big.rolling.json");
    writeFileSync(path, store({ "2026-08-26": 17, "2026-08-27": 18 }, 20_000));
    assert.deepEqual(await readPinnedDays(path), {
      "2026-08-26": 17,
      "2026-08-27": 18,
    });
  });

  it("falls back to a full parse when the tail cannot prove it", async () => {
    // Key order is a fact about this module's own writes, not about JSON. A
    // store written with `pinned` FIRST must still read correctly, or the
    // census would report a pinned store unpinned and send someone to refetch
    // sixteen gigabytes.
    const path = join(dir, "reordered.rolling.json");
    writeFileSync(
      path,
      JSON.stringify({ pinned: { "2026-08-26": 17 }, clock: "c", items: [] }),
    );
    assert.deepEqual(await readPinnedDays(path), { "2026-08-26": 17 });
  });

  it("is not fooled by a LATER 'pinned' key belonging to an item", async () => {
    // The case that makes the trailing-brace proof load-bearing, and it took a
    // surviving mutation to find: with `pinned` last, the tail's last
    // occurrence IS the store's own, so removing the proof changed nothing and
    // the guard read as tested while asserting nothing.
    //
    // A decoy inside a STRING cannot do it either — JSON escapes the quotes,
    // so `"pinned":` never appears. A nested object KEY after the store's own
    // map can, and that is what this builds. Without the proof the census
    // returns the item's map and reports every store unpinned.
    const path = join(dir, "decoy.rolling.json");
    writeFileSync(
      path,
      JSON.stringify({
        pinned: { "2026-08-26": 17 },
        clock: "c",
        items: [{ pinned: { "2026-01-01": 1 }, time: 1 }],
      }),
    );
    assert.deepEqual(await readPinnedDays(path), { "2026-08-26": 17 });
  });

  it("says ABSENT for a missing store and THROWS for a broken one", async () => {
    // Different answers to different questions. A pre-flight that conflated
    // them would report a market unpinned and send someone to refetch a store
    // that is merely unreadable.
    assert.equal(await readPinnedDays(join(dir, "nothing.rolling.json")), null);
    const broken = join(dir, "broken.rolling.json");
    writeFileSync(broken, "{ not json");
    await assert.rejects(readPinnedDays(broken));
  });
});

describe("the pre-flight is derived from the run", () => {
  const anchor = "2026-08-26";
  const symbols = ["EURUSD", "BTCUSD"];
  const days = 7000;

  function seed(options: {
    dropCot?: boolean;
    dropFrame?: string;
    pinDay?: string;
  }): string {
    const dir = mkdtempSync(join(tmpdir(), "pf-"));
    const pinned = { [options.pinDay ?? anchor]: 1 };
    for (const symbol of symbols) {
      const provider = resolveProviderSymbols(symbol)[0];
      for (const frame of ["15min", "daily", "5min"]) {
        if (options.dropFrame === `${provider}-${frame}`) continue;
        writeFileSync(
          join(dir, `${provider}-${frame}-${days}.rolling.json`),
          store(pinned),
        );
      }
    }
    writeFileSync(join(dir, "econ-calendar.rolling.json"), store(pinned));
    writeFileSync(join(dir, "treasury-rates.rolling.json"), store(pinned));
    if (!options.dropCot) {
      for (const symbol of symbols) {
        const mapping = getCotContractMapping(symbol);
        if (!mapping) continue;
        for (const contract of [mapping.primary, mapping.secondary]) {
          if (!contract) continue;
          writeFileSync(join(dir, `cot-${contract}.json`), "[]");
        }
      }
    }
    return dir;
  }

  it("passes when every artifact the run reads carries the pin", async () => {
    const result = await anchoredPreflight({
      anchor,
      cacheDir: seed({}),
      days,
      symbols,
    });
    assert.deepEqual(result.missing, []);
    // Three frames per symbol, plus the calendar and the curve, plus whatever
    // COT contracts the roster's own mapping produces — derived, not counted.
    assert.ok(result.checked >= symbols.length * 3 + 2);
  });

  it("names the frame that is missing, rather than failing a count", async () => {
    const provider = resolveProviderSymbols("BTCUSD")[0];
    const result = await anchoredPreflight({
      anchor,
      cacheDir: seed({ dropFrame: `${provider}-5min` }),
      days,
      symbols,
    });
    assert.equal(result.missing.length, 1);
    assert.match(result.missing[0], new RegExp(`${provider}-5min-${days}`));
    assert.match(result.missing[0], /no store/);
  });

  it("reports which pins a store DOES hold, so the fix is obvious", async () => {
    const result = await anchoredPreflight({
      anchor,
      cacheDir: seed({ pinDay: "2026-08-27" }),
      days,
      symbols,
    });
    assert.ok(result.missing.length > 0);
    assert.match(result.missing[0], /holds 2026-08-27/);
  });

  it("checks the COT files, which fetch on a cache miss", async () => {
    // COT caches BY CONTRACT rather than by run day — a plain array with no
    // pins — so it is invisible to a census that only looks at rolling
    // stores, and it is the one artifact that would still reach the provider.
    const withCot = await anchoredPreflight({
      anchor,
      cacheDir: seed({}),
      days,
      symbols,
    });
    const withoutCot = await anchoredPreflight({
      anchor,
      cacheDir: seed({ dropCot: true }),
      days,
      symbols,
    });
    assert.equal(withCot.missing.length, 0);
    assert.ok(
      withoutCot.missing.length > 0,
      "the roster maps to no COT contract, so this fixture proves nothing",
    );
    for (const entry of withoutCot.missing) {
      assert.match(entry, /^cot-.*absent or unreadable/);
    }
  });

  it("refuses a COT file that is not an array, not merely a missing one", async () => {
    const dir = seed({});
    const mapping = getCotContractMapping("EURUSD");
    assert.ok(mapping, "EURUSD no longer maps to a COT contract");
    writeFileSync(join(dir, `cot-${mapping!.primary}.json`), '{"rows":[]}');
    const result = await anchoredPreflight({ anchor, cacheDir: dir, days, symbols });
    assert.equal(result.missing.length, 1);
    assert.match(result.missing[0], /not an array/);
  });
});
