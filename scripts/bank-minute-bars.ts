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
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";
import { flagReader } from "./flagReader.ts";

const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_API_KEY;

// Bars carry no timezone and FMP's window is ~3 days, so a key is only ever
// compared against keys from the same provider and endpoint. Recording both
// makes that assumption checkable rather than assumed.
import {
  closeCircuit,
  isBandwidthRefusal,
  mayCall,
  openCircuit,
} from "./fmpCircuit.ts";

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

// The ONE declaration of which flags own the token after them — the form
// rounds 33-38 installed across the corpus readers, extended to every
// script with a value-taking flag (#364 round 50, finding 2). The scan in
// tests/sweepManifest.test.ts now DERIVES its file list by globbing
// scripts/, so a new reader joins the law automatically instead of being
// found by a review round.
const VALUE_FLAGS = new Set(["--dir", "--concurrency", "--limit"]);

function parseArgs(argv: string[]) {
  const { num, str } = flagReader(argv, VALUE_FLAGS);
  return {
    dir: str("--dir") ?? ".minute-bank",
    concurrency: num("--concurrency", 4),
    limit: num("--limit", Infinity),
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

const SIDECAR_SUFFIX = ".state.json";

function sidecarPath(dir: string, fmpSymbol: string) {
  return `${dir}/${encodeURIComponent(fmpSymbol)}${SIDECAR_SUFFIX}`;
}

/**
 * What a run will fetch, and what it will measure the store against.
 *
 * These are two different lists and the difference is load-bearing. `--limit`
 * truncates the fetch for debugging; the departure check below compares the
 * store against the whole roster. Measuring against the truncated list instead
 * would report every unvisited symbol as departed on any limited run, which is
 * how an operator learns to skip the line. Exported so that split is pinned by
 * a test rather than by a comment.
 */
export function planRun(argv: string[]) {
  const { dir, concurrency, limit } = parseArgs(argv);
  // Number(undefined) is NaN and slice(0, NaN) is empty, so a trailing
  // `--limit`, or one followed by the next flag, used to fetch nothing at all
  // and exit 0 — a run that examined nothing wearing the result of one that
  // ran and passed. Infinity is the unflagged default and passes.
  // #364 round 38, finding 1 — the worst of the three dials, because
  // its failure EXITS 0: "--dir --concurrency 4" (the documented
  // invocation typed without its path) made the next flag the store
  // directory; mkdir CREATED it, every sidecar read fresh, the full
  // provider window refetched into a phantom store, none of the three
  // escalations fired, and departedSymbols read the phantom and saw
  // nothing wrong — while the real .minute-bank stopped growing inside
  // the 3-day window this file exists to never miss. A path flag
  // refuses a missing value or a flag token; the unflagged default
  // passes.
  // --dir's own guard is GONE (#364 round 52, finding 3): parseArgs
  // above reads it through flagReader, which refuses a missing or
  // flag-shaped token itself, so the hand-written block here was
  // unreachable in both of its conditions. It was kept after the port
  // on the belief that its message was pinned, but the tests matched on
  // the flag NAME alone and flagReader's message satisfies them too —
  // deleting the block left every one of them green. The round-38
  // defect it was written for is still closed; it is closed one call
  // earlier, by the shared reader, and the tests below now say which
  // layer they are exercising.
  // The same law for --concurrency (#364 round 37, smaller): Number of
  // a missing value is NaN, Math.max(1, NaN) is NaN, and Array.from
  // with a NaN length is EMPTY — zero workers, nothing fetched — and
  // the zero-fetch escalation then blames the provider window for a
  // mistyped flag no request was ever made under. The unflagged
  // default (4) passes.
  // Both messages report the value the READER produced, not a token
  // re-derived from argv (#364 round 53, finding 1). The re-derivation
  // that stood here was a second, unguarded resolution of a flag whose
  // value had already been resolved one line up — first-occurrence-only,
  // so the two could in principle name different tokens, and the
  // diagnostic would be the one that lied. It cannot happen today, since
  // flagReader refuses the repeat before either line runs; a refusal that
  // depends on another refusal firing first is exactly how this PR's
  // reachable-guard defects have read.
  if (!(concurrency > 0)) {
    throw new Error(
      `--concurrency must be a positive number; got ${concurrency}.`,
    );
  }
  if (!(limit > 0)) {
    throw new Error(`--limit must be a positive number; got ${limit}.`);
  }
  const roster = bankableSymbols();
  return { dir, concurrency, roster, targets: roster.slice(0, limit) };
}

/**
 * The symbols a run should report as departed, read from the store on disk.
 *
 * Takes the whole plan and reaches for `roster` itself. That is the point:
 * the wiring is the trap. Handing this `targets` reports every symbol a
 * `--limit` run did not visit as departed, and the split is invisible to any
 * test of `orphanedSidecars` alone — `targets` is `roster.slice(...)`, so
 * asserting the relationship between them only restates `slice`.
 */
export async function departedSymbols(
  dir: string,
  plan: { roster: Array<{ fmpSymbol: string }> },
): Promise<string[]> {
  return orphanedSidecars(
    await readdir(dir),
    plan.roster.map((entry) => entry.fmpSymbol),
  );
}

/**
 * Symbols the store still holds but the roster no longer banks.
 *
 * A departure is otherwise invisible. The run reports the symbols it banked,
 * so dropping one moves a count and says nothing — amendment 32 took ^MID,
 * ^STOXX50E and USDMXN on 2026-08-09 and the log read 100 then 97. A
 * deliberate retirement and a mistyped `fmpSymbol` produce that same silence,
 * and the second costs the series permanently three days later.
 *
 * Names, not a count, because the operator's question is which one. Reported
 * rather than fatal: retirement is legitimate and a run that failed every day
 * after one would be trained away within a week.
 */
export function orphanedSidecars(files: string[], roster: string[]): string[] {
  const banked = new Set(roster);
  return files
    .filter((file) => file.endsWith(SIDECAR_SUFFIX))
    .map((file) => decodeSidecarName(file.slice(0, -SIDECAR_SUFFIX.length)))
    .filter((symbol) => !banked.has(symbol))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Sidecars are written through encodeURIComponent, so every ^-prefixed index
 * sits on disk as %5E... and comparing raw names would orphan all of them.
 *
 * The directory can also hold files this script never wrote — one copied by
 * hand, one rescued from a backup — and decodeURIComponent throws URIError on
 * a stray percent. That throw would land in the same function as the exit-code
 * decision and silence the escalation that says the provider window is
 * closing. An undecodable name is reported exactly as it sits on disk: it is
 * not on the roster either way, so the operator still sees it named.
 */
function decodeSidecarName(stem: string): string {
  try {
    return decodeURIComponent(stem);
  } catch {
    return stem;
  }
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
      // A bandwidth refusal is FINAL within a run: the window drains by the
      // day, so the remaining attempts cannot succeed and exist only to make
      // the failure slower. The rate-limit 429 keeps its ladder, which is the
      // failure the ladder was written for.
      if (
        attempt >= options.attempts ||
        !isRetryable(error) ||
        isBandwidthRefusal(error instanceof Error ? error.message : "")
      ) {
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
    // THE BODY, not just the status. FMP returns 429 for two different walls —
    // the 3,000/minute rate limit, which a backoff ladder is exactly right for
    // and which clears in seconds, and the trailing-30-day bandwidth ceiling,
    // which clears in DAYS and against which a ladder is pure noise. The code
    // cannot carry that difference; only the provider's own words can
    // ("Bandwidth Limit Reach . Please upgrade your plan"). Throwing the bare
    // status is what left every consumer unable to tell them apart.
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${detail ? ` ${detail.trim()}` : ""}`);
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
  const plan = planRun(process.argv.slice(2));
  const { dir, concurrency, targets } = plan;
  await mkdir(dir, { recursive: true });
  const at = new Date().toISOString();

  // ONE REQUEST BEFORE 97, because the allowance drains by time and nothing
  // else. `docs/HANDOFF.md` states the rule outright — "Do not re-run the bank
  // into a 429 — a re-run cannot succeed against an exhausted allowance, and
  // one whole-roster attempt burns ~485 requests" — and the job was doing
  // exactly that, twice a day, for five days straight.
  //
  // THE RETRY LADDER IS THE REASON, and its own comment says so: five attempts
  // from a 2s base "costs a doomed run only time", which was true of the
  // failure it was written for — launchd waking the job before the network is
  // up (2026-08-08, all 100 symbols lost in six seconds). It is not true of a
  // quota 429, where every symbol spends its whole ladder against a wall that
  // will not move until the trailing window drains.
  //
  // What this does NOT claim: that the retries made the exhaustion worse. FMP
  // bills BYTES over a trailing 30 days, not requests
  // (`2026-08-16-fmp-consumption-governor-design.md`), and a 429 body is a few
  // of them. The cost is wall time, a log nobody can read, and a failure that
  // looks identical whether the provider is exhausted or the key is revoked.

  let appendedTotal = 0;
  let fetchedTotal = 0;
  let failed = 0;
  let index = 0;

  // THE SHARED BREAKER, checked before the scout. Six consumers were each
  // rediscovering the same wall independently; this one asks whether anybody
  // already found it. An open breaker still lets ONE probe through per
  // cool-off window, so recovery is noticed without the roster being spent to
  // notice it.
  const gate = mayCall(Date.now());
  if (!gate.allowed) {
    console.error(`Standing down: ${gate.reason}`);
    process.exitCode = 1;
    return;
  }

  // THE FIRST SYMBOL IS THE SCOUT, and it is banked normally rather than
  // probed — a separate probe would discard bars it had already paid for, and
  // the allowance is metered in BYTES. On a healthy run this costs nothing at
  // all; on an exhausted one it costs one symbol's ladder instead of the
  // roster's.
  if (targets.length > 0) {
    const scout = targets[index++];
    const result = await bankOne(dir, scout.fmpSymbol, scout.markets, at);
    appendedTotal += result.appended;
    fetchedTotal += result.fetched;
    if (result.fetched === 0) {
      failed += 1;
      console.log(`  ${scout.fmpSymbol}: ${result.note || "no bars"}`);
      // Tell every other consumer what this one just learned, so the cache
      // top-up and the sweeps do not each spend a roster finding out.
      if (isBandwidthRefusal(result.note)) {
        openCircuit(result.note, Date.now());
      }
      console.error(
        `The first symbol fetched nothing (${result.note || "no bars"}). ` +
          `Standing down without attempting the remaining ${
            targets.length - 1
          } — HANDOFF's rule is explicit that a re-run cannot succeed against ` +
          `an exhausted allowance, and a whole-roster attempt spends ~${
            targets.length * RETRY_ATTEMPTS
          } requests learning it again. The window drains by time only. ` +
          `Recovery needs no catch-up: one successful run re-pulls each ` +
          `symbol's full window.`,
      );
      process.exitCode = 1;
      return;
    }
    // The provider answered. Whatever any other consumer recorded is stale.
    closeCircuit();
  }

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

  // Three silences, and only one of them is nothing to worry about. A run with
  // no symbols at all examined nothing and must never read as a clean pass.
  // Fetching nothing means the provider or the key is broken, and the 3-day
  // window makes that unrecoverable within a day. Fetching bars and appending
  // none is what an immediate re-run does, and is merely worth saying.
  if (targets.length === 0) {
    console.error(
      "No symbols to bank. Nothing was examined, so this is a failure, not a quiet day.",
    );
    process.exitCode = 1;
  } else if (fetchedTotal === 0) {
    console.error(
      "Nothing was fetched from any symbol. The provider window is 3 days — investigate now.",
    );
    process.exitCode = 1;
  } else if (appendedTotal === 0) {
    console.log("Nothing new since the last run.");
  }

  // Last, and after the exit code is settled. This reads the directory rather
  // than the run's own results, so it is the one part of the summary that
  // depends on what else is on disk — it must not be able to preempt the
  // escalation above it.
  const orphans = await departedSymbols(dir, plan);
  if (orphans.length > 0) {
    console.log(
      `No longer on the roster, so no longer banked: ${orphans.join(", ")}.`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
