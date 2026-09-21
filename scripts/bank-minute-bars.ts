/**
 * 1-minute bar bank — append-only, starting 2026-08-06.
 *
 * FMP serves 1-minute bars for 99 of 99 probed symbols, and an undated request
 * returns about three days (probe, 2026-08-06). Whether a dated request reaches
 * deeper has not been measured; `scripts/probe-minute-bars.ts --symbol --from
 * --to` asks one such question. Until it is answered the depth is treated as
 * unrecoverable, so 15-minute resolution is a real ceiling today and the only
 * way to lift it is to accumulate forward: every day not banked is treated as a
 * day never recovered.
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
 * the error, and it must not have to be refetched once the correction lands:
 * an undated request returns about three days, and until a dated one is shown
 * to reach deeper a refetch is treated as impossible. So the store holds the
 * provider's own date string, unparsed. Re-normalising later is then a re-read
 * of local disk rather than a fetch that may no longer be possible.
 *
 * ## Shape
 *
 * One JSONL file per provider symbol, one bar per line, in append order: each
 * run appends its fresh bars oldest-first, and a minute the provider serves
 * late lands after that run's newest bar (see bankOne). A sidecar carries the
 * high-water mark and a recent-key window so a top-up dedupes without reading
 * the whole file back. Keys are the raw date strings, which sort
 * lexicographically because the format is zero-padded.
 *
 * Re-running the same day is safe and cheap: a bar whose key is already in the
 * window is dropped, so a revised bar is not re-banked and the first copy
 * stands.
 *
 *   FMP_API_KEY=... npx tsx scripts/bank-minute-bars.ts
 *   FMP_API_KEY=... npx tsx scripts/bank-minute-bars.ts --dir .minute-bank --concurrency 4
 */
import { realpathSync } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";
import { redactProviderSecrets } from "../supabase/functions/trade-analyzer/redact.ts";
import { flagReader } from "./flagReader.ts";
import {
  classifyRefusal,
  closeCircuit,
  type FetchLike,
  isCircuitRefusal,
} from "./fmpCircuit.ts";
import {
  BANK_RUN_BOUND_BYTES,
  noteRefusal,
  providerRefusal,
  readDay,
  recordUsage,
  reportDayProblems,
} from "./fmpGovernor.ts";
import { writeRunMarker } from "./fmpRunGate.ts";
import { isEntryPoint } from "./isEntryPoint.ts";
import {
  defaultStatePaths,
  type FmpStatePaths,
  reportBookkeepingFailure,
} from "./fmpState.ts";

const BASE = "https://financialmodelingprep.com/stable";

// Bars carry no timezone and FMP's window is ~3 days, so a key is only ever
// compared against keys from the same provider and endpoint. Recording both
// makes that assumption checkable rather than assumed.
const PROVIDER = "fmp";
const ENDPOINT = "historical-chart/1min";
/** The pathname the ledger and the breaker key this endpoint by. */
const ENDPOINT_PATH = new URL(`${BASE}/${ENDPOINT}`).pathname;
const LABEL = "bank-minute-bars";

// Kept in the sidecar so a top-up dedupes against the overlap without reading
// the bank back. Three days at 1440 bars/day is 4,320; 8,000 covers a long
// weekend plus a late revision with room to spare.
const RECENT_KEYS_KEPT = 8_000;

// launchd catches this job up on wake, which is the property that makes a
// three-day window survivable — and is also why a run can start before the
// machine's network does. On 2026-08-08 that cost all 100 symbols in six
// seconds. Five attempts from a 2s base spans 30 seconds of backoff, longer
// than a wake takes to bring an interface up, and costs a doomed run only time.
/**
 * What actually clears the wall we just hit.
 *
 * This sentence used to assert the bandwidth remedy for whatever the provider
 * refused with. From 2026-09-04 that was a 402 entitlement gap, and "the
 * window drains by time only" told four days of readers to wait for something
 * that was never going to happen on its own.
 */
function standDownRemedy(note: string): string {
  switch (classifyRefusal(note)) {
    case "bandwidth":
      return "The window drains by time only.";
    case "entitlement":
      return (
        "This is a subscription gap, not an exhausted allowance: it does not " +
        "drain by time and the FMP plan must change before any run succeeds."
      );
    case "suspended":
      return "The account is suspended: nothing clears it but the owner resolving it with FMP.";
    case "invalidKey":
      return "FMP rejected the key in the Keychain item fmp-api-key; no wait or re-run clears it.";
    default:
      return (
        "The refusal did not match a known wall, so neither waiting nor " +
        "re-running is known to clear it."
      );
  }
}

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
 * `fetchMinuteBars` throws `HTTP nnn <body>` when something answered and undici
 * throws `fetch failed` when nothing did. A 4xx other than 429 is settled — a
 * rejected key is still rejected on the fourth ask, and asking costs 100
 * symbols' worth of a metered quota. Everything else is the network, the
 * provider's weather, or an error page where JSON was expected, and all three
 * pass on their own.
 *
 * The status is read up to a word boundary, not to the end of the message.
 * Since the body joined the message (#493) an end anchor matched nothing, so
 * a suspension and a rejected key both read as "no status" and were retried.
 */
export function isRetryable(error: unknown): boolean {
  const status = /^HTTP (\d{3})\b/.exec(
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
        isCircuitRefusal(error instanceof Error ? error.message : "")
      ) {
        throw error;
      }
      await options.sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }
}


const encoder = new TextEncoder();

type Print = { out: (line: string) => void; err: (line: string) => void };

export type BankDeps = {
  argv: string[];
  key: string | undefined;
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Required: a test that forgets to pass state must not reach the machine's ledger. */
  state: FmpStatePaths;
  print: Print;
  /** Bytes one run may spend before it stops starting symbols. */
  runBoundBytes?: number;
};

type BankContext = {
  key: string;
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  state: FmpStatePaths;
  print: Print;
  /** Every body this run was served, refusals included. */
  runBytes: number;
  bookkeepingFailed: number;
  lastAnsweredAt: number | null;
};

/**
 * One request for one symbol.
 *
 * Every attempt's body is billed, refusals included, and nothing about the
 * bookkeeping can throw into `withRetry`: a ledger that cannot be written is
 * counted and reported, never retried, because re-issuing the request would
 * buy the same bytes again to record them.
 */
async function fetchMinuteBars(ctx: BankContext, fmpSymbol: string): Promise<RawBar[]> {
  const url = new URL(`${BASE}/${ENDPOINT}`);
  url.searchParams.set("symbol", fmpSymbol);
  url.searchParams.set("apikey", ctx.key);
  const res = await ctx.fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    // THE BODY, not just the status. FMP returns 429 for the per-minute rate
    // limit and for the trailing-30-day bandwidth wall, and only its own words
    // tell them apart. The bank never reports a mid-roster refusal to the
    // breaker; its scout does that once, below.
    const refusal = await providerRefusal(res, {
      atMs: ctx.now(),
      consumer: "bank",
      endpointPath: ENDPOINT_PATH,
      label: LABEL,
      note: false,
      state: ctx.state,
    });
    ctx.runBytes += refusal.bytes;
    if (refusal.bookkeepingFailed) ctx.bookkeepingFailed += 1;
    throw new Error(`HTTP ${refusal.status}${refusal.body ? ` ${refusal.body}` : ""}`);
  }
  // Measured at the only moment the real cost is knowable: FMP publishes no
  // usage endpoint and Content-Length is absent on chunked responses, so the
  // body's own size IS the bill.
  const answeredAt = ctx.now();
  const body = await res.text();
  const bytes = encoder.encode(body).length;
  ctx.runBytes += bytes;
  try {
    recordUsage(
      { atMs: answeredAt, bytes, consumer: "bank", endpointPath: ENDPOINT_PATH, label: LABEL },
      ctx.state,
    );
  } catch (error) {
    reportBookkeepingFailure(`${LABEL} usage record`, error, ctx.print.err);
    ctx.bookkeepingFailed += 1;
  }
  ctx.lastAnsweredAt = answeredAt;
  const payload = JSON.parse(body);
  if (!Array.isArray(payload)) {
    throw new Error("payload was not an array");
  }
  return payload as RawBar[];
}

async function bankOne(
  ctx: BankContext,
  dir: string,
  fmpSymbol: string,
  markets: string[],
  at: string,
): Promise<{ fetched: number; appended: number; note: string }> {
  const state = await readSidecar(dir, fmpSymbol, markets);
  let raw: RawBar[];
  try {
    raw = await withRetry(() => fetchMinuteBars(ctx, fmpSymbol), {
      attempts: RETRY_ATTEMPTS,
      baseDelayMs: RETRY_BASE_DELAY_MS,
      sleep: ctx.sleep,
    });
  } catch (error) {
    const note = redactProviderSecrets(error instanceof Error ? error.message : "fetch failed");
    state.runs = [...state.runs.slice(-29), { at, fetched: 0, appended: 0, note }];
    await writeFile(sidecarPath(dir, fmpSymbol), JSON.stringify(state, null, 2));
    return { fetched: 0, appended: 0, note };
  }

  const dropped = raw.length - raw.filter(usableBar).length;
  const seen = new Set(state.recentKeys);
  // Provider order is newest-first; each run's fresh bars are appended
  // oldest-first. That orders a RUN, not the FILE. The provider sometimes
  // omits a minute and serves it on a later call, and that later run appends
  // it after its own newest bar — so the file is append-ordered, not
  // chronological. Measured 2026-09-21: 664 backward steps in 76 of 100
  // files, and every one traceable to a run (252) sits at a run boundary
  // filling a hole inside coverage already banked. Nothing is duplicated or
  // lost; readers sort by `date`. See docs/minute-bank.md, "Shape".
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

function sameRealPath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * One bank run. Returns the exit code.
 *
 * NO DOOR. §21c says the bank "cannot be refused" and §21g that "a proxy
 * outage must never be able to cost minute bars", and until 2026-09-16 the
 * bank asked the shared breaker and the day ledger anyway — so a calendar 402
 * the top-up met at 11:00Z refused the bank at 11:20Z on 09-05 and 09-08, and
 * a refused bank run exited 0. The bank's first symbol is its own probe: an
 * outage costs one request per run, and no other consumer's claim, stale entry
 * or race can darken the one store whose loss is permanent.
 *
 * What bounds it instead: a per-run byte bound (512 MiB) after which no new
 * symbol starts, and an end-of-run alarm when the bank's own bytes for the UTC
 * day pass that bound. The alarm exits 1; it never refuses a run.
 */
export async function runBank(deps: BankDeps): Promise<number> {
  const { print, state } = deps;
  if (!deps.key) {
    print.err("FMP_API_KEY is required.");
    return 1;
  }
  const plan = planRun(deps.argv);
  const { dir, concurrency, roster, targets } = plan;
  await mkdir(dir, { recursive: true });
  const at = new Date(deps.now()).toISOString();
  const runBoundBytes = deps.runBoundBytes ?? BANK_RUN_BOUND_BYTES;
  const ctx: BankContext = {
    bookkeepingFailed: 0,
    fetch: deps.fetch,
    key: deps.key,
    lastAnsweredAt: null,
    now: deps.now,
    print,
    runBytes: 0,
    sleep: deps.sleep,
    state,
  };

  const beforeAt = deps.now();
  const ledgerBefore = readDay(beforeAt, state);
  if (ledgerBefore.ok === false) {
    print.err(`bank proceeds without a readable ledger: ${ledgerBefore.detail}`);
  } else {
    reportDayProblems(ledgerBefore.day, { atMs: beforeAt, emit: print.err, state });
  }

  let appendedTotal = 0;
  let fetchedTotal = 0;
  let failed = 0;
  let index = 0;

  // THE FIRST SYMBOL IS THE SCOUT, and it is banked normally rather than
  // probed — a separate probe would discard bars it had already paid for, and
  // the allowance is metered in BYTES. On a healthy run this costs nothing at
  // all; on a refusing provider it costs one symbol's request instead of the
  // roster's. `docs/HANDOFF.md` states the rule: do not re-run the bank into a
  // wall, because a whole-roster attempt learns the same fact ninety-seven
  // times.
  if (targets.length > 0) {
    const scout = targets[index++];
    const result = await bankOne(ctx, dir, scout.fmpSymbol, scout.markets, at);
    appendedTotal += result.appended;
    fetchedTotal += result.fetched;
    if (result.fetched === 0) {
      failed += 1;
      print.out(`  ${scout.fmpSymbol}: ${result.note || "no bars"}`);
      // Tell every other consumer what this one just learned. The bank never
      // READS the breaker; it only reports to it.
      if (isCircuitRefusal(result.note)) {
        try {
          noteRefusal(
            result.note,
            { atMs: deps.now(), consumer: "bank", endpointPath: ENDPOINT_PATH },
            state,
          );
        } catch (error) {
          reportBookkeepingFailure(`${LABEL} breaker refusal`, error, print.err);
        }
      }
      print.err(
        `The first symbol fetched nothing (${result.note || "no bars"}). ` +
          `Standing down without attempting the remaining ${
            targets.length - 1
          } — HANDOFF's rule is explicit that a re-run cannot succeed against ` +
          `an exhausted allowance, and a whole-roster attempt spends ~${
            targets.length * RETRY_ATTEMPTS
          } requests learning it again. ${standDownRemedy(result.note)} ` +
          `Recovery needs no catch-up: one successful run re-pulls each ` +
          `symbol's full window.`,
      );
      return 1;
    }
    // The provider answered. Whatever any consumer recorded before this
    // answer is stale; a refusal recorded after it stays open.
    if (ctx.lastAnsweredAt !== null) {
      try {
        closeCircuit(
          { consumer: "bank", endpointPath: ENDPOINT_PATH, evidenceAtMs: ctx.lastAnsweredAt },
          state,
        );
      } catch (error) {
        reportBookkeepingFailure(`${LABEL} breaker answer`, error, print.err);
        ctx.bookkeepingFailed += 1;
      }
    }
  }

  const runBoundReached: string[] = [];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < targets.length) {
      const target = targets[index++];
      // A bound on this run's own bytes, checked before each symbol starts, so
      // the overshoot is at most one body per worker.
      if (ctx.runBytes >= runBoundBytes) {
        runBoundReached.push(target.fmpSymbol);
        continue;
      }
      const result = await bankOne(ctx, dir, target.fmpSymbol, target.markets, at);
      appendedTotal += result.appended;
      fetchedTotal += result.fetched;
      if (result.fetched === 0) {
        failed += 1;
        print.out(`  ${target.fmpSymbol}: ${result.note || "no bars"}`);
      }
    }
  });
  await Promise.all(workers);

  print.out(
    `Banked ${appendedTotal} new 1-minute bars across ${targets.length} symbols` +
      (failed > 0 ? `; ${failed} returned nothing` : "") + ".",
  );

  // Three silences, and only one of them is nothing to worry about. A run with
  // no symbols at all examined nothing and must never read as a clean pass.
  // Fetching nothing means the provider or the key is broken, and the 3-day
  // window makes that unrecoverable within a day. Fetching bars and appending
  // none is what an immediate re-run does, and is merely worth saying.
  let code = 0;
  if (targets.length === 0) {
    print.err(
      "No symbols to bank. Nothing was examined, so this is a failure, not a quiet day.",
    );
    code = 1;
  } else if (fetchedTotal === 0) {
    print.err(
      "Nothing was fetched from any symbol. The provider window is 3 days — investigate now.",
    );
    code = 1;
  } else if (appendedTotal === 0) {
    print.out("Nothing new since the last run.");
  }

  if (runBoundReached.length > 0) {
    print.err(
      `runBoundReached: ${runBoundReached.length} symbols were not attempted because this ` +
        `run had spent ${ctx.runBytes} bytes against its ${runBoundBytes} byte bound ` +
        `(${runBoundReached.slice(0, 5).join(", ")}${runBoundReached.length > 5 ? ", …" : ""}). ` +
        `A normal run spends a small fraction of it, so read the ledger before re-running.`,
    );
    code = 1;
  }

  const afterAt = deps.now();
  const ledgerAfter = readDay(afterAt, state);
  if (ledgerAfter.ok === false) {
    print.err(`the bank's day alarm could not read the ledger: ${ledgerAfter.detail}`);
    code = 1;
  } else {
    reportDayProblems(ledgerAfter.day, { atMs: afterAt, emit: print.err, state });
  }
  if (ledgerAfter.ok && ledgerAfter.day.bank > BANK_RUN_BOUND_BYTES) {
    print.err(
      `the bank spent ${ledgerAfter.day.bank} bytes today, above its 512 MiB run bound — ` +
        `nothing was refused, but that is several runs' worth; find out why.`,
    );
    code = 1;
  }

  if (ctx.bookkeepingFailed > 0) {
    print.err(
      `${ctx.bookkeepingFailed} bookkeeping write(s) failed this run; the bars above are ` +
        `banked, but the ledger is short by what those writes carried.`,
    );
    code = 1;
  }

  // The run gate skips a boot run only after a clean run, and "clean" means
  // an exit-0 run that banked the whole roster with nothing lost, into the one
  // real store. A red run writes no marker even though its bars are banked:
  // a marker there turned the next boot, kickstart or hand run into a skip
  // that exits 0, and launchd's last exit code for the job with it.
  if (
    code === 0 &&
    failed === 0 &&
    runBoundReached.length === 0 &&
    roster.length > 0 &&
    targets.length === roster.length &&
    sameRealPath(dir, state.canonicalBankDir)
  ) {
    try {
      writeRunMarker(state.runsDir, "minute-bank", { atMs: deps.now(), dir: realpathSync(dir) });
    } catch (error) {
      reportBookkeepingFailure(`${LABEL} run marker`, error, print.err);
      print.err("the clean-run marker could not be written; the bars above are banked.");
      code = 1;
    }
  }

  // Last, and after the exit code is settled. This reads the directory rather
  // than the run's own results, so it is the one part of the summary that
  // depends on what else is on disk — it must not be able to preempt the
  // escalation above it.
  const orphans = await departedSymbols(dir, plan);
  if (orphans.length > 0) {
    print.out(
      `No longer on the roster, so no longer banked: ${orphans.join(", ")}.`,
    );
  }
  return code;
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await runBank({
    argv: process.argv.slice(2),
    fetch,
    key: process.env.FMP_API_KEY,
    now: Date.now,
    print: { err: (line) => console.error(line), out: (line) => console.log(line) },
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    state: defaultStatePaths(),
  });
}
