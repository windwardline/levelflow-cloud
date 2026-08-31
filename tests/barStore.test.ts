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
  it("buys the full cold-start window when the store is empty", () => {
    assert.deepEqual(
      windowToBuy(null, "2026-08-31", "2022-07-19"),
      { from: "2022-07-19", to: "2026-08-31" },
    );
  });

  it("RE-BUYS the newest stored date rather than skipping past it", () => {
    // The one bug this design could introduce that no test of a warm store
    // would notice. The newest stored date's bars were fetched while that date
    // was still FORMING, so the store's copy is partial by construction.
    // Skipping it would leave a permanent hole at every date boundary — the
    // afternoon's bars for a date first seen at 09:00 would never be bought.
    assert.deepEqual(
      windowToBuy("2026-08-30", "2026-08-31", "2022-07-19"),
      { from: "2026-08-30", to: "2026-08-31" },
    );
    // Same date: still re-bought, which is what completes today intraday.
    assert.deepEqual(
      windowToBuy("2026-08-31", "2026-08-31", "2022-07-19"),
      { from: "2026-08-31", to: "2026-08-31" },
    );
  });

  it("never asks for a window that ends before it starts", () => {
    // A store holding a date AFTER today — a provider stamping ahead, or clock
    // skew — would otherwise produce a reversed range the provider answers
    // unpredictably.
    assert.deepEqual(
      windowToBuy("2026-09-05", "2026-08-31", "2022-07-19"),
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
    const { deps: d } = deps([bar("2026-08-30")]);
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
      assert.deepEqual(asked, { from: "2026-08-30", to: "2026-08-31" });
      assert.deepEqual(result.rows.map((row) => row.date), [
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
      limit: 3000,
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
      limit: 3000,
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
