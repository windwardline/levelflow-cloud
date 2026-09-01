import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  asStoredBar,
  mergeRows,
  readThrough,
  rowsToWrite,
  type StoredBar,
  windowToBuy,
} from "../supabase/functions/trade-analyzer/barStore.ts";

/**
 * Stop re-buying history that cannot change.
 *
 * Measured 2026-08-31: every scan re-fetched the full window from FMP —
 * 11,470 bars per market across the five decision frames, ~1.72 MB, ~167 MB
 * for a full 97-market scan. The bars are immutable, and FMP bills bytes over
 * a trailing 30 days, so the account bought the same four years of daily
 * history on every scan.
 *
 * The in-memory `candleCache` cannot fix it: a module-level Map inside an
 * ephemeral Edge instance, cold on every cold start, shared with nothing.
 */

const bar = (date: string, close = 100): StoredBar => ({
  close,
  date,
  high: close + 1,
  low: close - 1,
  open: close,
  volume: 10,
});

describe("the window to buy", () => {
  const ask = (over: Partial<Parameters<typeof windowToBuy>[0]> = {}) =>
    windowToBuy({
      coldStartFrom: "2022-07-19",
      limit: 3,
      newestStoredDate: "2026-08-30",
      oldestStoredDate: "2022-07-19",
      today: "2026-08-31",
      ...over,
    });

  it("buys the full cold-start window when the store is empty", () => {
    assert.deepEqual(
      ask({ newestStoredDate: null, oldestStoredDate: null }),
      { from: "2022-07-19", to: "2026-08-31" },
    );
  });

  it("RE-BUYS the newest stored date rather than skipping past it", () => {
    // The one bug this design could introduce that no test of a warm store
    // would notice. The newest stored date's bars were fetched while that date
    // was still FORMING, so the store's copy is partial by construction.
    // Skipping it would leave a permanent hole at every date boundary — the
    // afternoon's bars for a date first seen at 09:00 would never be bought.
    assert.deepEqual(ask(), { from: "2026-08-30", to: "2026-08-31" });
    assert.deepEqual(
      ask({ newestStoredDate: "2026-08-31" }),
      { from: "2026-08-31", to: "2026-08-31" },
      "today must be re-bought too, which is what completes it intraday",
    );
  });

  it("buys the FULL window when the store does not SPAN it", () => {
    // The truncation this prevents is silent and expensive: `findSwingPivots`
    // walks the whole array into the stop and the ladder, so a store that
    // begins after the window does, plus a one-date tail, hands the engine
    // fewer pivots than a full buy and moves stops.
    assert.deepEqual(
      ask({ oldestStoredDate: "2026-08-28" }),
      { from: "2022-07-19", to: "2026-08-31" },
    );
  });

  it("takes the TAIL when the store spans the window, however few rows it holds", () => {
    // THE DEFECT THIS REPLACES, and the reason the count version cost money.
    // The first form asked `storedCount < limit` — what the store HOLDS
    // against what the engine DECODES — and on three of the five frames the
    // window cannot physically supply the cap:
    //
    //   4hour  180d x 6/day   = 1,080 against a 1,200 cap, failing even 24/7
    //   1hour   90d x 24/day  = 1,543 on a 24/5 market against 2,000
    //   5min    10d x 288/day = 2,057 on a 24/5 market against 2,400
    //
    // So the test was permanently true, the store was never consulted, and the
    // fix that removed ~167 MB per scan kept re-buying those frames forever.
    // A store holding fewer rows than the cap is a fact about the DATA; no
    // amount of buying changes it, and it is not a reason to re-buy.
    assert.deepEqual(
      ask({ limit: 3000 }),
      { from: "2026-08-30", to: "2026-08-31" },
    );
  });

  it("a chart reaching further back than the store spans buys the full window", () => {
    // Coverage subsumes the binding-start case the count version handled
    // separately: a chart asking past the store's start and an analyzer whose
    // window the store does not span are the SAME condition.
    assert.deepEqual(
      ask({ coldStartFrom: "2020-01-01" }),
      { from: "2020-01-01", to: "2026-08-31" },
    );
  });

  it("never asks for a window that ends before it starts", () => {
    assert.deepEqual(
      ask({ newestStoredDate: "2026-09-05" }),
      { from: "2026-08-31", to: "2026-08-31" },
    );
  });
});

describe("merging stored rows with fresh ones", () => {
  it("returns oldest-first, deduplicated by provider date", () => {
    const merged = mergeRows([bar("2026-08-29"), bar("2026-08-30")], [
      bar("2026-08-30"),
      bar("2026-08-31"),
    ]);
    assert.deepEqual(merged.map((row) => row.date), [
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
    ]);
  });

  it("lets a provider REVISION supersede the stored copy", () => {
    // FMP revises settled bars. Fresh must win, or the store pins the first
    // answer forever and the engine trades on a price the provider has
    // retracted.
    const merged = mergeRows([bar("2026-08-30", 100)], [bar("2026-08-30", 111)]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].close, 111);
  });
});

describe("what gets written back", () => {
  it("writes only rows the store does not already hold", () => {
    const stored = [bar("2026-08-29"), bar("2026-08-30")];
    const merged = mergeRows(stored, [bar("2026-08-31")]);
    assert.deepEqual(rowsToWrite(stored, merged).map((row) => row.date), [
      "2026-08-31",
    ]);
  });

  it("writes a revised row even though its date is already stored", () => {
    const stored = [bar("2026-08-30", 100)];
    const merged = mergeRows(stored, [bar("2026-08-30", 111)]);
    assert.deepEqual(rowsToWrite(stored, merged).map((row) => row.close), [111]);
  });

  it("writes nothing when nothing changed", () => {
    // So `fetched_at` stays the instant a row was actually bought, and a
    // no-op scan does not rewrite the table.
    const stored = [bar("2026-08-30")];
    assert.deepEqual(rowsToWrite(stored, mergeRows(stored, [bar("2026-08-30")])), []);
  });
});

describe("the read-through, end to end", () => {
  const deps = (stored: StoredBar[], fail?: "read" | "write") => {
    const written: StoredBar[] = [];
    return {
      written,
      deps: {
        // DERIVED from the rows this fake store holds, not stubbed. A stub of
        // null makes coverage fail for every case and turns every warm-path
        // assertion into a cold-path one — the exact mistake that let the
        // count gate ship looking tested.
        oldestDate: async () =>
          stored.length === 0
            ? null
            : stored.map((row) => row.date).sort()[0],
        read: async () => {
          if (fail === "read") throw new Error("store down");
          return stored;
        },
        write: async (_s: string, _t: string, rows: StoredBar[]) => {
          if (fail === "write") throw new Error("store down");
          written.push(...rows);
        },
      },
    };
  };

  it("buys ONE date when the store is warm, not the whole window", () => {
    // The saving, asserted rather than described.
    let asked: { from: string; to: string } | null = null;
    // The store SPANS the window — a bar at the cold-start date and one at the
    // newest. The first version held a single 2026 bar against a 2022 window,
    // which does not span it, so a full buy was correct and this test asserted
    // the warm path while exercising the cold one.
    const { deps: d } = deps([bar("2022-07-19"), bar("2026-08-30")]);
    return readThrough(d, {
      coldStartFrom: "2022-07-19",
      fetchWindow: async (from, to) => {
        asked = { from, to };
        return [bar("2026-08-31")];
      },
      // A LARGE limit, deliberately. Under the retired count gate this bought
      // the whole window and the warm path was never exercised; under coverage
      // the store spans the request and the tail is correct however many rows
      // it holds. That inversion is the fix, asserted.
      limit: 3000,
      providerSymbol: "EURUSD",
      timeframe: "15min",
      today: "2026-08-31",
    }).then((result) => {
      assert.deepEqual(asked, { from: "2026-08-30", to: "2026-08-31" });
      assert.deepEqual(result.rows.map((row) => row.date), [
        "2022-07-19",
        "2026-08-30",
        "2026-08-31",
      ]);
      assert.equal(result.storeUnavailable, false);
    });
  });

  it("buys the full window on a COLD store, exactly as today", () => {
    let asked: { from: string; to: string } | null = null;
    const { deps: d } = deps([]);
    return readThrough(d, {
      coldStartFrom: "2022-07-19",
      fetchWindow: async (from, to) => {
        asked = { from, to };
        return [bar("2026-08-31")];
      },
      limit: 3000,
      providerSymbol: "EURUSD",
      timeframe: "15min",
      today: "2026-08-31",
    }).then(() => {
      assert.deepEqual(asked, { from: "2022-07-19", to: "2026-08-31" });
    });
  });

  it("persists what it bought", () => {
    const { deps: d, written } = deps([bar("2026-08-30")]);
    return readThrough(d, {
      coldStartFrom: "2022-07-19",
      fetchWindow: async () => [bar("2026-08-31")],
      limit: 1,
      providerSymbol: "EURUSD",
      timeframe: "15min",
      today: "2026-08-31",
    }).then(() => {
      assert.deepEqual(written.map((row) => row.date), ["2026-08-31"]);
    });
  });

  it("FALLS BACK to a full fetch when the store cannot be read, and says so", () => {
    // Refusing outright would take the desk down for a cache outage, which is
    // the wrong trade. A SILENT fallback is worse than either: it is a cost
    // regression that looks exactly like working software.
    let asked: { from: string; to: string } | null = null;
    const { deps: d } = deps([bar("2026-08-30")], "read");
    return readThrough(d, {
      coldStartFrom: "2022-07-19",
      fetchWindow: async (from, to) => {
        asked = { from, to };
        return [bar("2026-08-31")];
      },
      limit: 3000,
      providerSymbol: "EURUSD",
      timeframe: "15min",
      today: "2026-08-31",
    }).then((result) => {
      assert.equal(result.storeUnavailable, true);
      assert.deepEqual(
        asked,
        { from: "2022-07-19", to: "2026-08-31" },
        "a store it could not read must not be treated as an EMPTY store " +
          "that happens to hold nothing — both buy the full window, but only " +
          "one of them is a fault worth reporting",
      );
    });
  });

  it("reports a failed WRITE too, since the next scan pays for it", () => {
    const { deps: d } = deps([bar("2026-08-30")], "write");
    return readThrough(d, {
      coldStartFrom: "2022-07-19",
      fetchWindow: async () => [bar("2026-08-31")],
      limit: 1,
      providerSymbol: "EURUSD",
      timeframe: "15min",
      today: "2026-08-31",
    }).then((result) => {
      assert.equal(result.storeUnavailable, true);
      assert.deepEqual(
        result.rows.map((row) => row.date),
        ["2026-08-30", "2026-08-31"],
        "a failed write must not cost THIS scan its bars",
      );
    });
  });
});

describe("only storable rows are stored", () => {
  it("keeps a well-formed row verbatim", () => {
    const row = asStoredBar({
      close: 4, date: "2026-08-31 09:30:00", high: 5, low: 2, open: 3, volume: 7,
    });
    assert.deepEqual(row, {
      close: 4, date: "2026-08-31 09:30:00", high: 5, low: 2, open: 3, volume: 7,
    });
  });

  it("refuses a row with no date or a non-finite price", () => {
    assert.equal(asStoredBar({ close: 1, high: 1, low: 1, open: 1 }), null);
    assert.equal(asStoredBar({ close: NaN, date: "x", high: 1, low: 1, open: 1 }), null);
    assert.equal(asStoredBar({ close: 1, date: "", high: 1, low: 1, open: 1 }), null);
  });

  it("defaults a missing volume rather than dropping the bar", () => {
    // FMP serves volume 0 on several index and FX series; treating that as
    // malformed would drop real bars.
    assert.equal(
      asStoredBar({ close: 1, date: "d", high: 1, low: 1, open: 1 })?.volume,
      0,
    );
  });
});

describe("the store holds RAW rows, and the loader normalizes over the merge", () => {
  const LOADER = readFileSync(
    "supabase/functions/trade-analyzer/marketLoader.ts",
    "utf8",
  );

  it("normalizes the MERGED window, not the fetched chunk", () => {
    // `normalizeFmpBars`' spike guard reads each bar's NEIGHBOURS, so a
    // one-date chunk normalized alone gets no spike check at all — and
    // persisting that is how a 135,533% bar gets cemented, this time into
    // live stop placement rather than a research corpus.
    assert.match(
      LOADER,
      /const bars = normalizeFmpBars\(\s*\n\s*result\.rows as unknown as FmpBar\[\],/,
      "the loader normalizes something other than the merged rows",
    );
    const rawAt = LOADER.indexOf("async function fetchRawWindow(");
    assert.ok(rawAt >= 0, "the raw window fetcher is gone");
    const rawBody = LOADER.slice(rawAt, LOADER.indexOf("\n}\n", rawAt));
    assert.doesNotMatch(
      rawBody,
      /normalizeFmpBars/,
      "the wire call normalizes its own chunk, so the spike guard never sees " +
        "both neighbours of a bar at a chunk boundary",
    );
  });

  it("stores no normalized bar, so no BAR_CLOCK revision is baked in", () => {
    const rawAt = LOADER.indexOf("async function fetchRawWindow(");
    const rawBody = LOADER.slice(rawAt, LOADER.indexOf("\n}\n", rawAt));
    assert.match(
      rawBody,
      /const row = asStoredBar\(entry\);/,
      "the wire call returns something other than raw provider rows",
    );
    const migration = readFileSync(
      "supabase/migrations/20260831140000_market_bars_store.sql",
      "utf8",
    );
    assert.match(
      migration,
      /provider_date text not null/,
      "the store keys on something other than the provider's own string, so " +
        "a clock revision would strand every row",
    );
    assert.doesNotMatch(
      migration,
      /\bclock\b\s+text/,
      "the table carries a clock column, which is the mixed-clock corpus " +
        "mechanism moved into production",
    );
  });

  it("is readable by NO client role", () => {
    // A client write here rewrites the price history from which every entry,
    // stop and ladder is computed AT GENERATION TIME — a stronger case than
    // the one that closed `trade_setups`, and `anon` was missed there once.
    const migration = readFileSync(
      "supabase/migrations/20260831140000_market_bars_store.sql",
      "utf8",
    );
    assert.match(migration, /alter table public\.market_bars enable row level security;/);
    assert.match(
      migration,
      /revoke all on public\.market_bars from anon, authenticated;/,
      "both client roles must be named in one statement, or one gets missed",
    );
    assert.doesNotMatch(
      migration,
      /grant\s+(select|all)[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i,
      "a client role was granted access to the price history",
    );
  });
});

describe("the chart feed shares the store rather than duplicating it", () => {
  const CHART = readFileSync("supabase/functions/market-data/index.ts", "utf8");
  const LOADER = readFileSync(
    "supabase/functions/trade-analyzer/marketLoader.ts",
    "utf8",
  );

  it("reads through the SAME store as the analyzer", () => {
    // The chart feed carried an independent copy of the whole fetcher — same
    // endpoints, same windows, same symbols — so a user opening a chart on a
    // market the analyzer had just scanned paid for that history twice.
    assert.match(CHART, /readThrough\(barStoreDeps\(\), \{/);
    assert.match(LOADER, /readThrough\(barStoreDeps\(\), \{/);
  });

  it("uses ONE database wiring, not a copy in each caller", () => {
    // Two `barStoreDeps` would be two ideas of what a stored row looks like,
    // and they would drift the first time either changed.
    const db = readFileSync(
      "supabase/functions/trade-analyzer/barStoreDb.ts",
      "utf8",
    );
    assert.match(db, /export function barStoreDeps\(\): BarStoreDeps \{/);
    for (const [name, source] of [["chart", CHART], ["loader", LOADER]] as const) {
      assert.match(
        source,
        /import \{ barStoreDeps \} from "[^"]*barStoreDb\.ts";/,
        `${name} defines its own store wiring instead of importing the shared one`,
      );
      assert.doesNotMatch(
        source,
        /function barStoreDeps\(/,
        `${name} still carries a local copy of the store wiring`,
      );
    }
  });

  it("asks one coverage question for both callers", () => {
    // The chart and the analyzer used to take different branches — a binding
    // start for one, a row count for the other. They are the same question:
    // does the store reach back to where the caller starts? One predicate
    // cannot disagree with itself, and the count half of the old pair was
    // permanently true on three frames.
    const store = readFileSync(
      "supabase/functions/trade-analyzer/barStore.ts",
      "utf8",
    );
    assert.match(
      store,
      /input\.oldestStoredDate === null \|\|\s*\n\s*input\.oldestStoredDate > input\.coldStartFrom/,
    );
    assert.doesNotMatch(
      store,
      /storedCount < input\.limit/,
      "the count gate is back — it compares rows held against rows decoded, " +
        "which is permanently true wherever the window cannot supply the cap",
    );
  });

  it("still returns only the range the chart asked for", () => {
    // The store's span is whatever has accumulated; the caller's is what it
    // requested. Returning the store's span would widen a chart silently.
    assert.match(
      CHART,
      /row\.date\.slice\(0, 10\) >= from && row\.date\.slice\(0, 10\) <= to/,
      "the chart returns the store's whole span rather than the requested range",
    );
  });
});
