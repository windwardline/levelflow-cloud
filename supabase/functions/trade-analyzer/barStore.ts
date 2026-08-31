/**
 * The shared bar store: read what we already own, buy only what we do not.
 *
 * Every scan re-fetched the full window from FMP. Measured 2026-08-31: 11,470
 * bars per market per scan across the five decision frames, ~1.72 MB, ~167 MB
 * for a full 97-market scan. The bars are IMMUTABLE — a 15-minute bar from
 * last Tuesday never changes — so the account bought the same four years of
 * daily history on every scan, and FMP bills bytes over a trailing 30 days.
 *
 * The existing in-memory `candleCache` cannot fix that. It is a module-level
 * Map inside an ephemeral Edge instance: cold on every cold start, never
 * shared between instances, and never shared between the analyzer, the chart
 * feed and outcome-sync.
 *
 * WHAT THIS STORES. Raw provider rows, verbatim — the same line `.minute-bank`
 * holds. Normalization runs at READ time over the merged window, so:
 *   - nothing is stamped under a `BAR_CLOCK` revision (it is on its fourth),
 *   - the spike guard sees both neighbours of every bar rather than being
 *     handed a short chunk it cannot check,
 *   - a provider revision supersedes on `provider_date` because the fresher
 *     row wins the merge.
 *
 * WHAT IT DOES NOT CHANGE. The caller still gets `normalizeFmpBars` over a
 * window at least as long as today's, so the engine's input is bit-identical
 * for the same bars — same guards, same caps, same `completedIntradaySeries`
 * downstream. This is a change to what is BOUGHT, never to what is SEEN.
 */
import type { FmpBar } from "./bars.ts";

/** One raw row as FMP serves it, and as the store holds it. */
export type StoredBar = {
  close: number;
  date: string;
  high: number;
  low: number;
  open: number;
  volume: number;
};

export type BarStoreDeps = {
  /** Newest-first rows for one series, at most `limit`. */
  read: (
    providerSymbol: string,
    timeframe: string,
    limit: number,
  ) => Promise<StoredBar[]>;
  /** Upsert on (provider_symbol, timeframe, provider_date). */
  write: (
    providerSymbol: string,
    timeframe: string,
    rows: StoredBar[],
  ) => Promise<void>;
};

/**
 * The date window to buy, given what the store already holds.
 *
 * FMP's `from`/`to` are DATE-granular — `marketLoader` builds them with
 * `toISOString().slice(0, 10)` — so the smallest purchase is one calendar
 * date, never "the three bars since the last one". That is why this returns a
 * date rather than an instant, and why the steady state costs one date's bars
 * per series rather than nothing.
 *
 * The newest stored date is RE-BOUGHT rather than skipped. Its bars were
 * fetched while that date was still forming, so the store's copy is partial by
 * construction; buying it again is what completes it. Skipping it would leave
 * a permanent hole at every date boundary — the one bug this design could
 * introduce that no test of a warm store would notice.
 */
export function windowToBuy(
  newestStoredDate: string | null,
  today: string,
  coldStartFrom: string,
): { from: string; to: string } {
  if (newestStoredDate === null) {
    return { from: coldStartFrom, to: today };
  }
  // Never ask for a window that ends before it starts: a store holding a date
  // AFTER today (a provider stamping ahead, or a clock skew) would otherwise
  // produce a reversed range the provider answers unpredictably.
  const from = newestStoredDate > today ? today : newestStoredDate;
  return { from, to: today };
}

/** FMP serves newest-first; the store returns the same. */
function newestDateOf(rows: readonly StoredBar[]): string | null {
  let newest: string | null = null;
  for (const row of rows) {
    if (typeof row.date === "string" && (newest === null || row.date > newest)) {
      newest = row.date;
    }
  }
  return newest;
}

/**
 * Merge stored rows with freshly fetched ones, fresher winning per date.
 *
 * Returned OLDEST-FIRST because `normalizeFmpBars` sorts and slices from the
 * newest end; handing it a merged array in a stable order keeps the merge out
 * of the normalizer's business.
 */
export function mergeRows(
  stored: readonly StoredBar[],
  fresh: readonly StoredBar[],
): StoredBar[] {
  const byDate = new Map<string, StoredBar>();
  for (const row of stored) {
    if (typeof row?.date === "string") byDate.set(row.date, row);
  }
  // Fresh LAST, so a provider revision to a settled bar supersedes the stored
  // copy rather than being dropped as a duplicate.
  for (const row of fresh) {
    if (typeof row?.date === "string") byDate.set(row.date, row);
  }
  return [...byDate.values()].sort((first, second) =>
    first.date < second.date ? -1 : first.date > second.date ? 1 : 0
  );
}

/** Only the rows the store does not already hold identically. */
export function rowsToWrite(
  stored: readonly StoredBar[],
  merged: readonly StoredBar[],
): StoredBar[] {
  const existing = new Map(stored.map((row) => [row.date, row]));
  return merged.filter((row) => {
    const had = existing.get(row.date);
    if (had === undefined) return true;
    // A revision changes a value; an unchanged row is not rewritten, so
    // `fetched_at` stays the instant the row was actually bought.
    return had.open !== row.open || had.high !== row.high ||
      had.low !== row.low || had.close !== row.close ||
      had.volume !== row.volume;
  });
}

export type ReadThroughResult = {
  /** Raw rows, oldest-first, for the caller to normalize. */
  rows: StoredBar[];
  /** What actually crossed the wire, so a caller can report the saving. */
  fetchedRows: number;
  /** True when the store could not be reached and the fetch was unassisted. */
  storeUnavailable: boolean;
};

/**
 * Read the store, buy the missing window, merge, and persist.
 *
 * `fetchWindow` is the caller's existing FMP call, narrowed to a date range.
 * It is passed in rather than imported so this module never opens a socket and
 * every branch is testable without a network.
 *
 * A STORE FAILURE FALLS BACK TO A FULL FETCH, and says so. Refusing outright
 * would take the desk down for a cache outage, which is the wrong trade — but
 * a silent fallback is a cost regression that looks exactly like working
 * software, so `storeUnavailable` rides out with the result and the caller
 * records it.
 */
export async function readThrough(
  deps: BarStoreDeps,
  input: {
    coldStartFrom: string;
    fetchWindow: (from: string, to: string) => Promise<StoredBar[]>;
    limit: number;
    providerSymbol: string;
    timeframe: string;
    today: string;
  },
): Promise<ReadThroughResult> {
  let stored: StoredBar[] = [];
  let storeUnavailable = false;
  try {
    stored = await deps.read(input.providerSymbol, input.timeframe, input.limit);
  } catch {
    storeUnavailable = true;
  }

  const window = windowToBuy(newestDateOf(stored), input.today, input.coldStartFrom);
  const fresh = await input.fetchWindow(window.from, window.to);
  const merged = mergeRows(stored, fresh);

  if (!storeUnavailable) {
    const pending = rowsToWrite(stored, merged);
    if (pending.length > 0) {
      try {
        await deps.write(input.providerSymbol, input.timeframe, pending);
      } catch {
        // A failed write costs the NEXT scan, never this one. The rows are
        // already merged and returned; swallowing here would hide a store that
        // has stopped persisting, so it is surfaced through the flag.
        storeUnavailable = true;
      }
    }
  }

  return { fetchedRows: fresh.length, rows: merged, storeUnavailable };
}

/** Narrow an unknown payload row to a storable one, or null. */
export function asStoredBar(value: unknown): StoredBar | null {
  const row = value as Partial<FmpBar> & { date?: unknown };
  if (typeof row?.date !== "string" || row.date === "") return null;
  const numbers = [row.open, row.high, row.low, row.close];
  if (numbers.some((entry) => typeof entry !== "number" || !isFinite(entry))) {
    return null;
  }
  return {
    close: row.close as number,
    date: row.date,
    high: row.high as number,
    low: row.low as number,
    open: row.open as number,
    volume: typeof row.volume === "number" && isFinite(row.volume)
      ? row.volume
      : 0,
  };
}
