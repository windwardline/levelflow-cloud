/**
 * The bar store's database wiring, in one place.
 *
 * Separate from `barStore.ts` deliberately: that module holds the windowing
 * and merge logic and must never open a socket, so every branch of it is
 * testable without a network. This one is the boundary, and it is shared —
 * the analyzer's loader and the chart feed call the SAME function, so neither
 * can drift into its own idea of what the store's rows look like.
 *
 * That mattered: the chart feed used to carry an independent copy of the whole
 * fetcher, buying the identical bars from FMP with no way to see the
 * analyzer's. Whichever path arrives first now pays, and the other reads.
 */
import type { BarStoreDeps, StoredBar } from "./barStore.ts";
import { adminFetchRows, adminUpsertRows } from "./supabaseRest.ts";

type BarRow = {
  close: number;
  high: number;
  low: number;
  open: number;
  provider_date: string;
  volume: number;
};

export function barStoreDeps(): BarStoreDeps {
  return {
    // NEWEST-FIRST and limited. The decode cap is what the engine reads, and
    // `findSwingPivots` walks the whole array into the stop and the ladder, so
    // this limit is a money-path input rather than a page size.
    read: async (providerSymbol, timeframe, limit) => {
      const rows = await adminFetchRows<BarRow>(
        `market_bars?select=provider_date,open,high,low,close,volume` +
          `&provider_symbol=eq.${encodeURIComponent(providerSymbol)}` +
          `&timeframe=eq.${encodeURIComponent(timeframe)}` +
          `&order=provider_date.desc&limit=${limit}`,
      );
      return rows.map((row): StoredBar => ({
        close: row.close,
        date: row.provider_date,
        high: row.high,
        low: row.low,
        open: row.open,
        volume: row.volume,
      }));
    },
    // ONE ROW, ASCENDING — the store's true minimum, which the newest-first
    // page above cannot answer. `market_bars_prune_idx` is
    // (provider_symbol, timeframe, provider_date desc), so this is an index
    // scan from the far end, not a table scan.
    oldestDate: async (providerSymbol, timeframe) => {
      const rows = await adminFetchRows<{ provider_date: string }>(
        `market_bars?select=provider_date` +
          `&provider_symbol=eq.${encodeURIComponent(providerSymbol)}` +
          `&timeframe=eq.${encodeURIComponent(timeframe)}` +
          `&order=provider_date.asc&limit=1`,
      );
      return rows[0]?.provider_date ?? null;
    },
    write: async (providerSymbol, timeframe, rows) => {
      await adminUpsertRows(
        "market_bars",
        rows.map((row) => ({
          close: row.close,
          high: row.high,
          low: row.low,
          open: row.open,
          provider_date: row.date,
          provider_symbol: providerSymbol,
          timeframe,
          volume: row.volume,
        })),
        "provider_symbol,timeframe,provider_date",
      );
    },
  };
}
