/**
 * 1-minute bar bank — append-only, starting 2026-08-06.
 *
 * FMP serves 1-minute bars for 99 of 99 probed symbols and only ~3 days deep
 * (scripts/probe-minute-bars.ts, .calibration-cache/minute-availability.json).
 * So 15-minute resolution is a real ceiling today, and the only way to lift it
 * is to accumulate forward: every day not banked is a day never recovered.
 * This is the one piece of work whose value depends purely on when it starts.
 *
 * What it is for: 15-minute bars cannot order intrabar events. That single
 * limitation is why a measured ~60% gain at sub-1.0 stop caps was declined in
 * round 25, and why the outcome evaluator has to report an "ambiguous" verdict
 * when a bar touches both the stop and a target. Minute bars resolve the order.
 *
 * ## Raw provider strings are stored verbatim, and that is the point
 *
 * The engine's own `toTimestamp` (supabase/functions/trade-analyzer/bars.ts)
 * appends "Z" to FMP's intraday "YYYY-MM-DD HH:MM:SS", but FMP returns those in
 * America/New_York. Proof from the existing corpus: the S&P cash session, truly
 * 09:30-16:00 New York, reads 09:30-15:45 in BOTH July and January. True UTC
 * would move it by an hour between them; New York wall clock stamped as UTC
 * does not move at all.
 *
 * That convention is wrong and will be corrected. This bank must not inherit
 * the error, and it must not have to be refetched once the correction lands —
 * it cannot be, because the provider's window is three days wide. So the store
 * holds the provider's own date string, unparsed. Re-normalising later is then
 * a re-read of local disk rather than a fetch that is no longer possible.
 *
 * ## Shape
 *
 * One JSONL file per provider symbol, one bar per line, appended in provider
 * order. A sidecar carries the high-water mark and a recent-key window so a
 * top-up dedupes without reading the whole file back. Keys are the raw date
 * strings, which sort lexicographically because the format is zero-padded.
 *
 * Re-running the same day is safe and cheap: overlapping bars are dropped by
 * key, and a revised bar supersedes its stored copy by being appended after it
 * (readers take the last occurrence of a key).
 *
 *   FMP_API_KEY=... npx tsx scripts/bank-minute-bars.ts
 *   FMP_API_KEY=... npx tsx scripts/bank-minute-bars.ts --dir .minute-bank --concurrency 4
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";

const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_API_KEY;

// Bars carry no timezone and FMP's window is ~3 days, so a key is only ever
// compared against keys from the same provider and endpoint. Recording both
// makes that assumption checkable rather than assumed.
const PROVIDER = "fmp";
const ENDPOINT = "historical-chart/1min";

// Kept in the sidecar so a top-up dedupes against the overlap without reading
// the bank back. Three days at 1440 bars/day is 4,320; 8,000 covers a long
// weekend plus a late revision with room to spare.
const RECENT_KEYS_KEPT = 8_000;

// launchd catches this job up on wake, which is the property that makes a
// three-day window survivable — and is also why a run can start before the
// machine's network does. On 2026-08-08 that cost all 100 symbols in six
// seconds. Five attempts from a 2s base spans 30 seconds of backoff, longer
// than a wake takes to bring an interface up, and costs a doomed run only time.
const RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 2_000;

type RawBar = {
  date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

type BankedBar = {
  /** The provider's own string, unparsed and unconverted. Load-bearing. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SidecarState = {
  provider: string;
  endpoint: string;
  fmpSymbol: string;
  markets: string[];
  /** Highest provider date string banked. Lexicographic order is chronological. */
  highWaterMark: string | null;
  bars: number;
  firstDate: string | null;
  runs: Array<{ at: string; fetched: number; appended: number; note: string }>;
  recentKeys: string[];
  /**
   * The provider's timezone for this endpoint, once established. Null means
   * unresolved — the banked strings are still exact, so this can be filled in
   * later without refetching. See the header.
   */
  sourceTimezone: string | null;
};

function parseArgs(argv: string[]) {
  const dirFlag = argv.indexOf("--dir");
  const concurrencyFlag = argv.indexOf("--concurrency");
  const limitFlag = argv.indexOf("--limit");
  return {
    dir: dirFlag >= 0 ? argv[dirFlag + 1] : ".minute-bank",
    concurrency: concurrencyFlag >= 0 ? Number(argv[concurrencyFlag + 1]) : 4,
    limit: limitFlag >= 0 ? Number(argv[limitFlag + 1]) : Infinity,
  };
}

/** Provider symbols to bank, with the Levelflow markets each one serves. */
export function bankableSymbols(): Array<{ fmpSymbol: string; markets: string[] }> {
  const byProvider = new Map<string, string[]>();
  for (const row of MASTER_LIST_ROWS) {
    const fmpSymbol = row.fmpSymbol;
    if (!fmpSymbol) {
      continue;
    }
    const markets = byProvider.get(fmpSymbol) ?? [];
    markets.push(row.levelflowSymbol ?? row.brokerName);
    byProvider.set(fmpSymbol, markets);
  }
  return [...byProvider.entries()]
    .map(([fmpSymbol, markets]) => ({ fmpSymbol, markets }))
    .sort((a, b) => a.fmpSymbol.localeCompare(b.fmpSymbol));
}

/**
 * A bar is banked only if every price field is a finite number and the date is
 * present. A malformed bar is dropped and counted — never repaired, never
 * defaulted to the current time the way `bars.ts` does, because a fabricated
 * timestamp in an append-only store is permanent.
 */
export function usableBar(bar: RawBar): bar is RawBar & BankedBar {
  return (
    typeof bar.date === "string" &&
    bar.date.length > 0 &&
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close)
  );
}

function sidecarPath(dir: string, fmpSymbol: string) {
  return `${dir}/${encodeURIComponent(fmpSymbol)}.state.json`;
}

function bankPath(dir: string, fmpSymbol: string) {
  return `${dir}/${encodeURIComponent(fmpSymbol)}.jsonl`;
}

async function readSidecar(
  dir: string,
  fmpSymbol: string,
  markets: string[],
): Promise<SidecarState> {
  try {
    const parsed = JSON.parse(
      await readFile(sidecarPath(dir, fmpSymbol), "utf8"),
    ) as SidecarState;
    return { ...parsed, markets };
  } catch {
    return {
      provider: PROVIDER,
      endpoint: ENDPOINT,
      fmpSymbol,
      markets,
      highWaterMark: null,
      bars: 0,
      firstDate: null,
      runs: [],
      recentKeys: [],
      sourceTimezone: null,
    };
  }
}

/**
 * A failure is worth retrying unless the provider gave a settled answer.
 *
 * `fetchMinuteBars` throws `HTTP nnn` when something answered and undici throws
 * `fetch failed` when nothing did. A 4xx other than 429 is settled — a rejected
 * key is still rejected on the fourth ask, and asking costs 100 symbols' worth
 * of a metered quota. Everything else is the network, the provider's weather,
 * or an error page where JSON was expected, and all three pass on their own.
 */
export function isRetryable(error: unknown): boolean {
  const status = /^HTTP (\d{3})$/.exec(
    error instanceof Error ? error.message : "",
  )?.[1];
  if (!status) {
    return true;
  }
  return Number(status) === 429 || Number(status) >= 500;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    attempts: number;
    baseDelayMs: number;
    sleep: (ms: number) => Promise<void>;
  },
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.attempts || !isRetryable(error)) {
        throw error;
      }
      await options.sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchMinuteBars(fmpSymbol: string): Promise<RawBar[]> {
  const url = new URL(`${BASE}/${ENDPOINT}`);
  url.searchParams.set("symbol", fmpSymbol);
  url.searchParams.set("apikey", KEY!);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const payload = await res.json();
  if (!Array.isArray(payload)) {
    throw new Error("payload was not an array");
  }
  return payload as RawBar[];
}

async function bankOne(
  dir: string,
  fmpSymbol: string,
  markets: string[],
  at: string,
): Promise<{ fetched: number; appended: number; note: string }> {
  const state = await readSidecar(dir, fmpSymbol, markets);
  let raw: RawBar[];
  try {
    raw = await withRetry(() => fetchMinuteBars(fmpSymbol), {
      attempts: RETRY_ATTEMPTS,
      baseDelayMs: RETRY_BASE_DELAY_MS,
      sleep,
    });
  } catch (error) {
    const note = error instanceof Error ? error.message : "fetch failed";
    state.runs = [...state.runs.slice(-29), { at, fetched: 0, appended: 0, note }];
    await writeFile(sidecarPath(dir, fmpSymbol), JSON.stringify(state, null, 2));
    return { fetched: 0, appended: 0, note };
  }

  const dropped = raw.length - raw.filter(usableBar).length;
  const seen = new Set(state.recentKeys);
  // Provider order is newest-first; bank oldest-first so the file reads
  // chronologically and an append is always a forward extension.
  const candidates = raw
    .filter(usableBar)
    .map((bar): BankedBar => ({
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: Number.isFinite(bar.volume) ? bar.volume! : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const fresh = candidates.filter((bar) => !seen.has(bar.date));
  if (fresh.length > 0) {
    await appendFile(
      bankPath(dir, fmpSymbol),
      fresh.map((bar) => JSON.stringify(bar)).join("\n") + "\n",
    );
  }

  const keys = [...state.recentKeys, ...fresh.map((bar) => bar.date)];
  state.recentKeys = keys.slice(-RECENT_KEYS_KEPT);
  state.bars += fresh.length;
  state.firstDate = state.firstDate ?? candidates[0]?.date ?? null;
  const newest = candidates.at(-1)?.date ?? null;
  if (newest && (!state.highWaterMark || newest > state.highWaterMark)) {
    state.highWaterMark = newest;
  }
  const note = dropped > 0 ? `${dropped} malformed bars dropped` : "";
  state.runs = [
    ...state.runs.slice(-29),
    { at, fetched: candidates.length, appended: fresh.length, note },
  ];
  await writeFile(sidecarPath(dir, fmpSymbol), JSON.stringify(state, null, 2));
  return { fetched: candidates.length, appended: fresh.length, note };
}

async function main() {
  if (!KEY) {
    console.error("FMP_API_KEY is required.");
    process.exitCode = 1;
    return;
  }
  const { dir, concurrency, limit } = parseArgs(process.argv.slice(2));
  await mkdir(dir, { recursive: true });
  const targets = bankableSymbols().slice(0, limit);
  const at = new Date().toISOString();

  let appendedTotal = 0;
  let fetchedTotal = 0;
  let failed = 0;
  let index = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < targets.length) {
      const target = targets[index++];
      const result = await bankOne(dir, target.fmpSymbol, target.markets, at);
      appendedTotal += result.appended;
      fetchedTotal += result.fetched;
      if (result.fetched === 0) {
        failed += 1;
        console.log(`  ${target.fmpSymbol}: ${result.note || "no bars"}`);
      }
    }
  });
  await Promise.all(workers);

  console.log(
    `Banked ${appendedTotal} new 1-minute bars across ${targets.length} symbols` +
      (failed > 0 ? `; ${failed} returned nothing` : "") + ".",
  );
  // Two different silences, and only one is a failure. Fetching nothing at all
  // means the provider or the key is broken, and the 3-day window makes that
  // unrecoverable within a day — so it exits non-zero. Fetching bars and
  // appending none is what an immediate re-run does, and is merely worth saying.
  if (targets.length > 0 && fetchedTotal === 0) {
    console.error(
      "Nothing was fetched from any symbol. The provider window is 3 days — investigate now.",
    );
    process.exitCode = 1;
  } else if (appendedTotal === 0 && targets.length > 0) {
    console.log("Nothing new since the last run.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
