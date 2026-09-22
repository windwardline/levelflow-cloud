/**
 * Fill a hole in the minute bank from dated requests, once, through the governor.
 *
 * The bank was built on a measurement: an UNDATED 1-minute request returns about
 * three days (probe, 2026-08-06), so a day it misses was treated as a day never
 * recovered. On 2026-09-22 a governed probe asked the dated question instead and
 * FMP answered with every minute of the day: EURUSD and BTCUSD, 1,440 bars each,
 * for 2026-09-08, 2025-09-09 and 2021-09-08. So the hole the 2026-09-04 to
 * 2026-09-14 suspension left (09-04 to 09-10 missing, 09-03 and 09-11 partial) can
 * be filled, and this is the one tool that fills it.
 *
 *   FMP_API_KEY=... npx tsx scripts/recover-minute-bank.ts --from 2026-09-03 --to 2026-09-11 [--dry-run] [--concurrency 4]
 *
 * It fills a hole and does nothing else:
 *
 * - It writes only to the checkout's own bank, the one the run gate's marker
 *   names, so there is no directory flag to point at a phantom store.
 * - It holds the bank's own lock (`<bank>.lock`, the directory and pid file
 *   `scripts/ops/bank-lock.sh` takes), so the scheduled bank and its backup wait
 *   on it. A held lock is refused, never waited on or broken: this runs by hand,
 *   and a person can run it again.
 * - It asks one dated question per symbol and day, and only for days on or
 *   after the first one the file holds. Extending the bank backward would be a
 *   backfill, which nobody has approved.
 * - It dedupes against every key in the file. The sidecar's recent-key window
 *   is the scheduled bank's and cannot see a partial day two weeks old.
 * - It appends, oldest first, after what is there, and never rewrites. The
 *   store is append-ordered already (docs/minute-bank.md, "Shape") and every
 *   reader sorts.
 * - It refuses a window reaching into the last seven days. The scheduled bank
 *   dedupes against its recent keys only, so a minute recovered where an
 *   undated request still reaches would be banked again by the next run.
 *
 * Every byte is the ad-hoc class's, under its 256 MiB day. `--dry-run` reads the
 * store and prints what each day holds, spending nothing.
 */
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { bankableSymbols, RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS, usableBar, withRetry } from "./bank-minute-bars.ts";
import { redactProviderSecrets } from "../supabase/functions/trade-analyzer/redact.ts";
import { flagReader, OperatorInputError, soleFlagIndex } from "./flagReader.ts";
import { createByteBudget, SpendRefusedError, type ByteBudget } from "./fmpByteBudget.ts";
import { createProbeGate, isCircuitRefusal, type FetchLike } from "./fmpCircuit.ts";
import {
  formatStandDown,
  governedBudget,
  maySpend,
  ProviderRefusalError,
  providerRefusal,
  standDownFor,
} from "./fmpGovernor.ts";
import { defaultStatePaths, type FmpStatePaths } from "./fmpState.ts";
import { isEntryPoint } from "./isEntryPoint.ts";

const BASE = "https://financialmodelingprep.com/stable";
const ENDPOINT = "historical-chart/1min";
const ENDPOINT_PATH = new URL(`${BASE}/${ENDPOINT}`).pathname;
const LABEL = "recover-minute-bank";
const MIB = 1024 * 1024;
/** The ad-hoc class's own day; the governor's check of the whole day is what binds. */
const RUN_BYTE_BUDGET = 256 * MIB;
/** A month bounds one recovery; the hole it was written for is nine days. */
const MAX_DATES = 31;
/**
 * How recent a recovered day may be. An undated request returns about three
 * days; a week keeps every recovered minute out of what the scheduled bank will
 * be served again, whatever the gap between UTC and the provider's New York
 * date strings.
 */
const UNDATED_REACH_DAYS = 7;
const DAY_MS = 86_400_000;
/** A day holds at most this many minutes; more means the dedupe did not hold. */
const MINUTES_PER_DAY = 1_440;
/** The bank's own key shape. Dedupe is string equality, so any other shape would append everything. */
const BANK_DATE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
/**
 * Two bounds on a clock that moved while keeping its shape.
 *
 * Where an answer lands on minutes the file already holds, other prices are
 * not evidence: FMP revises minutes after the bank takes them live. Against a
 * dated probe of 2026-09-03, ^GSPC came back revised at 164 of 389 held
 * minutes (median 7.75e-6 relative; none before 11:00) and AAVEUSD at 114 of
 * 1,159 (median 7.7e-8). Shifted one or two minutes, the bank matched 1 and 9
 * of those, and agreement peaked at offset 0. The 2% bound this replaces
 * refused 5 of the first real run's 7 symbols. So a revised minute is
 * reported and kept as banked, and a moved clock is an offset k within
 * SHIFT_REACH_MINUTES at which more held minutes t match the answer's t+k than
 * match its t. An offset is judged over SHIFT_MIN_PAIRS pairs or more: on
 * simulated revised walks that hold their price up to 90% of minutes, an
 * unfloored scan refused up to 82% of short overlaps, and 60 was the smallest
 * floor of 10, 20, 30, 45, 60 and 90 to refuse 2% or fewer. A flatter price
 * can still be refused, most often when the revisions open what the file
 * holds, and that leaves its hole open. The reach covers a daylight-saving
 * hour, not a whole timezone.
 *
 * Where it lands on minutes the file lacks, their times of day must be ones
 * the file has held; a file of a day's minutes or more has seen its session,
 * so more than 5% (and more than 10) never seen means the session moved.
 */
const SHIFT_REACH_MINUTES = 120;
const SHIFT_MIN_PAIRS = 60;
const NOVEL_SHARE = 0.05;
const NOVEL_FLOOR = 10;
/**
 * One symbol refused on either bound can be its own: a thin contract whose
 * short file has not seen its session. A second is the endpoint's or the
 * calendar's, and the run stands down. The bounds count together because a
 * 24-hour market's file holds every time of day: for forex and crypto, the
 * scout among them, a moved clock shows only as held minutes that match the
 * answer better at another offset.
 */
const DISPUTED_STOP = 2;

/**
 * Files measured to trip the clock bound on ordinary days, so their refusal is
 * no evidence about the endpoint. Each still refuses itself and fails the run,
 * because its hole stays open; it does not count toward DISPUTED_STOP, which
 * would otherwise start every run with a slot spoken for.
 */
const EXPECTED_CLOCK_REFUSALS = new Map([
  [
    "ZOUSX",
    "561 distinct times of day in 1,618 held minutes by 2026-09-03; replayed against the bank's own 2026-09-12..09-20, 59 of 508 minutes fell at never-held times, scattered across the day, the only trip in 100 symbols",
  ],
]);

// The ONE declaration of which flags own the token after them.
const VALUE_FLAGS = new Set(["--from", "--to", "--concurrency"]);
const SWITCHES = new Set(["--dry-run"]);

type Print = { out: (line: string) => void; err: (line: string) => void };

export type RecoverDeps = {
  argv: string[];
  key: string | undefined;
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Required: a test that forgets to pass state must not reach the machine's ledger or bank. */
  state: FmpStatePaths;
  print: Print;
};

type RawBar = { date?: string; open?: number; high?: number; low?: number; close?: number; volume?: number };

type Plan = { from: string; to: string; dates: string[]; concurrency: number; dryRun: boolean };

function readPlan(argv: string[], nowMs: number): Plan {
  // Every token is a known flag or a declared flag's value. A mistyped
  // `--dry-run` must not become a run that spends.
  for (let at = 0; at < argv.length; at += 1) {
    if (VALUE_FLAGS.has(argv[at])) {
      at += 1;
      continue;
    }
    if (!SWITCHES.has(argv[at])) {
      throw new OperatorInputError(`unknown argument ${argv[at]}; this script takes --from, --to, --concurrency and --dry-run`);
    }
  }
  const { num, str } = flagReader(argv, VALUE_FLAGS);
  const from = str("--from");
  const to = str("--to");
  if (from === undefined) throw new OperatorInputError("--from is required: a recovery names the days it fills");
  if (to === undefined) throw new OperatorInputError("--to is required with --from");
  for (const [flag, value] of [["--from", from], ["--to", to]] as const) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    if (parsed === null || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new OperatorInputError(`${flag} must be a real YYYY-MM-DD date; got ${value}`);
    }
  }
  if (from > to) throw new OperatorInputError(`--from ${from} is after --to ${to}`);
  const count = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (count > MAX_DATES) {
    throw new OperatorInputError(`${from}..${to} spans ${count} dates; one recovery fills at most ${MAX_DATES}`);
  }
  const latest = new Date(nowMs - UNDATED_REACH_DAYS * DAY_MS).toISOString().slice(0, 10);
  if (to > latest) {
    throw new OperatorInputError(
      `--to ${to} is inside the last ${UNDATED_REACH_DAYS} days, where the scheduled bank is still served ` +
        `these minutes and dedupes against its recent keys only; recover up to ${latest}`,
    );
  }
  const dates = Array.from({ length: count }, (_, index) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10),
  );
  const concurrency = num("--concurrency", 4, { basis: "workers fetch one symbol each", integer: true, min: 1 });
  return { concurrency, dates, dryRun: soleFlagIndex(argv, "--dry-run") !== -1, from, to };
}

// --- the bank's lock ---------------------------------------------------------

/**
 * Take `<bank>.lock` as `scripts/ops/bank-lock.sh` does: an atomic `mkdir`, then
 * this process's pid in `pid`. Refused if it exists at all, whoever holds it.
 * `writePid` is the pid write, replaceable so a test can make it fail.
 */
export function acquireBankLock(
  bank: string,
  writePid: (file: string, text: string) => void = (file, text) => writeFileSync(file, text),
): { release: () => void } | { refused: string } {
  const lock = `${bank}.lock`;
  try {
    mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let holder = "";
    try {
      holder = readFileSync(`${lock}/pid`, "utf8").trim();
    } catch {
      // A holder between its mkdir and its pid write has not named itself yet.
    }
    return {
      refused:
        `the bank lock ${lock} is held by pid ${holder || "(not yet named)"}: the scheduled bank or its ` +
        `backup is running, or one died holding it. Run again when it is free; bank-lock.sh breaks a ` +
        `dead holder's lock on the bank's next run`,
    };
  }
  const pid = String(process.pid);
  try {
    writePid(`${lock}/pid`, `${pid}\n`);
  } catch (error) {
    // bank-lock.sh reads an absent pid as a holder that has not named itself
    // yet, and never breaks it: a lock left here would stop every scheduled
    // bank and backup until a person removed it.
    rmSync(lock, { force: true, recursive: true });
    throw error;
  }
  return {
    release() {
      let named = "";
      try {
        named = readFileSync(`${lock}/pid`, "utf8").trim();
      } catch {
        return;
      }
      if (named === pid) rmSync(lock, { force: true, recursive: true });
    },
  };
}

// --- one symbol ----------------------------------------------------------------

const bankPath = (dir: string, symbol: string) => `${dir}/${encodeURIComponent(symbol)}.jsonl`;
const sidecarPath = (dir: string, symbol: string) => `${dir}/${encodeURIComponent(symbol)}.state.json`;

type Store = {
  keys: Set<string>;
  perDay: Map<string, number>;
  /** Close by key, for the keys inside the asked window only. */
  closes: Map<string, number>;
  /** Every time of day the file holds, `HH:MM:SS`. */
  times: Set<string>;
  firstDay: string;
  sidecar: Record<string, unknown>;
};

/** The file's every key, or why it cannot be appended to. */
function readStore(dir: string, symbol: string, window: { from: string; to: string }): Store | { problem: string } | null {
  let text: string;
  try {
    text = readFileSync(bankPath(dir, symbol), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (text.length > 0 && !text.endsWith("\n")) {
    return { problem: `${symbol}: ${bankPath(dir, symbol)} does not end in a newline, so its last line is torn; repair it by hand before appending` };
  }
  const keys = new Set<string>();
  const perDay = new Map<string, number>();
  const closes = new Map<string, number>();
  const times = new Set<string>();
  for (const [index, line] of text.split("\n").entries()) {
    if (line === "") continue;
    let row: { date?: unknown; close?: unknown };
    try {
      row = JSON.parse(line) as { date?: unknown; close?: unknown };
    } catch {
      return { problem: `${symbol}: line ${index + 1} of ${bankPath(dir, symbol)} is not JSON` };
    }
    const date = row.date;
    if (typeof date !== "string") return { problem: `${symbol}: line ${index + 1} has no date` };
    const day = date.slice(0, 10);
    if (!keys.has(date)) perDay.set(day, (perDay.get(day) ?? 0) + 1);
    keys.add(date);
    times.add(date.slice(11));
    if (day >= window.from && day <= window.to && typeof row.close === "number" && !closes.has(date)) {
      closes.set(date, row.close);
    }
  }
  let sidecar: Record<string, unknown>;
  try {
    sidecar = JSON.parse(readFileSync(sidecarPath(dir, symbol), "utf8")) as Record<string, unknown>;
  } catch (error) {
    return { problem: `${symbol}: its sidecar cannot be read (${error instanceof Error ? error.message : String(error)})` };
  }
  const first = typeof sidecar.firstDate === "string" ? sidecar.firstDate : [...keys].sort()[0];
  if (first === undefined) return { problem: `${symbol}: the file holds no bars, so there is no hole inside it to fill` };
  return { closes, firstDay: first.slice(0, 10), keys, perDay, sidecar, times };
}

/** The bank's tolerance for one close: relative above 1, absolute below. */
const sameClose = (banked: number, answered: number) => Math.abs(banked - answered) <= 1e-9 * Math.max(1, Math.abs(banked));

/** A bank key as seconds, read as UTC: only differences between keys are used. */
const keySeconds = (key: string) => Date.parse(`${key.replace(" ", "T")}Z`) / 1000;

export type PriceCheck = {
  /** Held minutes the answer carries at the same key. */
  overlaps: number;
  /** Of those, the ones whose close came back different. */
  revised: number;
  /** Median of |answered - banked| / |banked| over the revised minutes. */
  medianRevision: number | null;
  /** The offset, in minutes, at which the most held minutes agree, when it beats offset 0. */
  shift: { minutes: number; agree: number; pairs: number } | null;
};

/**
 * Where the answer lands on minutes the file holds: how many came back
 * revised, and whether another offset explains the file better than the
 * minute it is keyed at. A moved clock matches the file at its offset; a
 * revised history matches best where it is keyed, however much of it moved.
 */
export function checkPrices(held: ReadonlyMap<string, number>, answer: ReadonlyMap<string, number>): PriceCheck {
  const answered = new Map<number, number>();
  for (const [key, close] of answer) {
    const at = keySeconds(key);
    if (Number.isFinite(at) && !answered.has(at)) answered.set(at, close);
  }
  const banked: Array<[number, number]> = [];
  for (const [key, close] of held) {
    const at = keySeconds(key);
    if (Number.isFinite(at)) banked.push([at, close]);
  }
  const agreement = (minutes: number) => {
    let pairs = 0;
    let agree = 0;
    for (const [at, close] of banked) {
      const other = answered.get(at + minutes * 60);
      if (other === undefined) continue;
      pairs += 1;
      if (sameClose(close, other)) agree += 1;
    }
    return { agree, pairs };
  };
  const zero = agreement(0);
  const revisions: number[] = [];
  for (const [at, close] of banked) {
    const other = answered.get(at);
    if (other !== undefined && !sameClose(close, other)) revisions.push(Math.abs(other - close) / (close === 0 ? 1 : Math.abs(close)));
  }
  revisions.sort((a, b) => a - b);
  const middle = revisions.length >> 1;
  const medianRevision =
    revisions.length === 0 ? null : revisions.length % 2 === 1 ? revisions[middle] : (revisions[middle - 1] + revisions[middle]) / 2;
  let shift: PriceCheck["shift"] = null;
  // Nothing beats every held minute agreeing, so a clean overlap skips the scan.
  if (!(zero.pairs > 0 && zero.agree === zero.pairs)) {
    let best = zero.pairs > 0 ? zero.agree / zero.pairs : 0;
    // Nearest offsets first, so a tie keeps the smaller shift.
    for (let reach = 1; reach <= SHIFT_REACH_MINUTES; reach += 1) {
      for (const minutes of [reach, -reach]) {
        const at = agreement(minutes);
        if (at.pairs < SHIFT_MIN_PAIRS || at.agree / at.pairs <= best) continue;
        best = at.agree / at.pairs;
        shift = { agree: at.agree, minutes, pairs: at.pairs };
      }
    }
  }
  return { medianRevision, overlaps: zero.pairs, revised: zero.pairs - zero.agree, shift };
}

type Context = {
  deps: RecoverDeps;
  fetch: FetchLike;
  budget: ByteBudget;
  dir: string;
  /** Set once, by the first refusal no later request can clear. */
  stop: unknown;
  /** Symbols refused on a price or clock bound, in the order they were refused. */
  disputed: string[];
  requests: number;
  /**
   * Refusal bodies. The governor records them itself; the run's own budget
   * never sees them, so its 256 MiB bound excludes them and the closing line
   * adds them back.
   */
  refusalBytes: number;
  /** Ledger or breaker writes providerRefusal could not make. */
  bookkeepingFailed: number;
};

/**
 * A non-ok answer, carried through the bank's retry ladder. The message is the
 * bank's own `HTTP nnn <body>`, which is what that ladder reads: a 429 or 5xx
 * retries, any other 4xx is settled, and a wall no retry clears is final.
 */
class Refused extends Error {
  constructor(readonly refusal: ProviderRefusalError) {
    super(`HTTP ${refusal.status}${refusal.body ? ` ${refusal.body}` : ""}`);
  }
}

/**
 * A failure no later request in this run can clear: the governor's refusal, or
 * a wall the provider named (bandwidth, entitlement, suspension, a rejected
 * key). It stops the run. Anything else costs its own day and the run goes on:
 * a settled 404 for one symbol says nothing about the next.
 */
const final = (error: unknown) =>
  error instanceof SpendRefusedError ||
  (error instanceof Refused && (error.refusal.kind !== null || isCircuitRefusal(error.message)));

/**
 * One dated day, on the bank's retry ladder. Only the request and the body are
 * retried: the bytes are recorded once the body is read, and the answer parsed
 * after that, so a refusal the record raises or a malformed answer is bought
 * once and never asked again.
 */
async function fetchDay(ctx: Context, symbol: string, date: string): Promise<RawBar[]> {
  const { deps } = ctx;
  const url = new URL(`${BASE}/${ENDPOINT}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("from", date);
  url.searchParams.set("to", date);
  url.searchParams.set("apikey", deps.key!);
  const text = await withRetry(
    async () => {
      const response = await ctx.fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) {
        const refusal = await providerRefusal(response, {
          atMs: deps.now(),
          consumer: "adhoc",
          endpointPath: ENDPOINT_PATH,
          label: LABEL,
          note: true,
          state: deps.state,
        });
        ctx.refusalBytes += refusal.bytes;
        if (refusal.bookkeepingFailed) ctx.bookkeepingFailed += 1;
        throw new Refused(refusal);
      }
      return response.text();
    },
    { attempts: RETRY_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS, sleep: deps.sleep },
  );
  try {
    ctx.budget.record(Buffer.byteLength(text), { answeredAtMs: deps.now(), endpointPath: ENDPOINT_PATH });
  } catch (error) {
    if (!(error instanceof SpendRefusedError)) throw error;
    // Bought either way: keep the minutes, then stop.
    ctx.stop ??= error;
  }
  const payload = JSON.parse(text) as unknown;
  if (!Array.isArray(payload)) throw new Error(`the answer was not a list of bars: ${text.slice(0, 200)}`);
  return payload as RawBar[];
}

type Tally = {
  symbol: string;
  /** Bars the provider served, malformed and out-of-day ones included. */
  fetched: number;
  /** Bars that were usable and dated inside an asked day: the bank's own `fetched`. */
  usable: number;
  appended: number;
  dropped: number;
  missed: string[];
  refused: boolean;
  /** Refused on the clock bound, and named in EXPECTED_CLOCK_REFUSALS. */
  expected: boolean;
  /** Held minutes that came back at another close, when they were not a moved clock. */
  revision: { revised: number; overlaps: number; median: number | null } | null;
};

async function recoverOne(ctx: Context, symbol: string, store: Store, plan: Plan): Promise<Tally> {
  const tally: Tally = {
    appended: 0,
    dropped: 0,
    expected: false,
    fetched: 0,
    missed: [],
    refused: false,
    revision: null,
    symbol,
    usable: 0,
  };
  const asked = plan.dates.filter((date) => date >= store.firstDay);
  if (asked.length === 0) return tally;
  const fresh: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = [];
  let foreign: string | null = null;
  /** Close by key for every usable bar of an asked day, first copy kept. */
  const answer = new Map<string, number>();
  for (const date of asked) {
    if (ctx.stop) {
      tally.missed.push(date);
      continue;
    }
    let raw: RawBar[];
    try {
      raw = await fetchDay(ctx, symbol, date);
    } catch (error) {
      tally.missed.push(date);
      if (final(error)) ctx.stop ??= error;
      else ctx.deps.print.err(`${symbol} ${date}: ${redactProviderSecrets(error instanceof Error ? error.message : String(error))}`);
      continue;
    }
    tally.fetched += raw.length;
    for (const bar of raw) {
      if (!usableBar(bar)) {
        tally.dropped += 1;
        continue;
      }
      if (!BANK_DATE.test(bar.date)) {
        foreign ??= bar.date;
        tally.dropped += 1;
        continue;
      }
      if (bar.date.slice(0, 10) !== date) {
        tally.dropped += 1;
        continue;
      }
      tally.usable += 1;
      if (!answer.has(bar.date)) answer.set(bar.date, bar.close);
      if (store.keys.has(bar.date)) continue;
      store.keys.add(bar.date);
      // The bank's key order, so the store keeps one line shape.
      fresh.push({
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: Number.isFinite(bar.volume) ? bar.volume! : 0,
      });
    }
  }
  // Dedupe is string equality on the provider's date, and the store is
  // append-only: a key shape that drifted would append every minute again,
  // permanently. So the whole symbol is refused before a line is written.
  const perDay = new Map<string, number>();
  for (const bar of fresh) perDay.set(bar.date.slice(0, 10), (perDay.get(bar.date.slice(0, 10)) ?? 0) + 1);
  const overfull = [...perDay].find(([day, added]) => (store.perDay.get(day) ?? 0) + added > MINUTES_PER_DAY);
  const heldMinutes = [...store.perDay.values()].reduce((sum, count) => sum + count, 0);
  const novel = heldMinutes >= MINUTES_PER_DAY ? fresh.filter((bar) => !store.times.has(bar.date.slice(11))).length : 0;
  const movedClock = novel > Math.max(NOVEL_FLOOR, NOVEL_SHARE * fresh.length);
  const prices = checkPrices(store.closes, answer);
  const { shift } = prices;
  if (prices.overlaps > 0 && shift === null) {
    tally.revision = { median: prices.medianRevision, overlaps: prices.overlaps, revised: prices.revised };
  }
  let refusal: { kind: "foreign" | "overfull" | "shifted" | "novel"; message: string } | null = null;
  if (foreign !== null) {
    refusal = { kind: "foreign", message: `the provider answered with the date "${foreign}", not the bank's YYYY-MM-DD HH:MM:SS; dedupe could not hold` };
  } else if (overfull !== undefined) {
    refusal = { kind: "overfull", message: `${overfull[0]} would hold ${(store.perDay.get(overfull[0]) ?? 0) + overfull[1]} minutes, more than a day has; dedupe did not hold` };
  } else if (shift !== null) {
    const span = `${Math.abs(shift.minutes)} minute${Math.abs(shift.minutes) === 1 ? "" : "s"} ${shift.minutes > 0 ? "later" : "earlier"}`;
    refusal = {
      kind: "shifted",
      message:
        `${shift.agree} of ${shift.pairs} minutes the file holds match the answer ${span}, more than the ` +
        `${prices.overlaps - prices.revised} of ${prices.overlaps} that match at the same minute; the keys no longer name the same minutes`,
    };
  } else if (movedClock) {
    refusal = { kind: "novel", message: `${novel} of ${fresh.length} new minutes fall at times of day the file has never held; the session's clock moved` };
  }
  if (refusal !== null) {
    // Every asked day was bought and none is kept: an append-only store takes
    // no minute it cannot place.
    const also = refusal.kind === "shifted" && movedClock ? `; ${novel} of ${fresh.length} new minutes also fall at times of day the file has never held` : "";
    ctx.deps.print.err(`${symbol}: ${refusal.message}${also}, so nothing was appended (${tally.fetched} bars were bought)`);
    tally.refused = true;
    // A date shape and a day's granularity belong to the endpoint: every other
    // symbol would be bought and refused the same way. The price and clock
    // bounds stand the run down on their second symbol (DISPUTED_STOP).
    const expected = refusal.kind === "novel" ? EXPECTED_CLOCK_REFUSALS.get(symbol) : undefined;
    if (refusal.kind === "foreign" || refusal.kind === "overfull") {
      ctx.stop ??= new Error(`${symbol}: ${refusal.message}; the endpoint answers this way for every symbol, so the run stands down`);
    } else if (expected !== undefined) {
      tally.expected = true;
      ctx.deps.print.err(`${symbol}: an expected clock refusal (${expected}); it does not count toward a stand-down, and its hole stays open`);
    } else {
      ctx.disputed.push(symbol);
      if (ctx.disputed.length >= DISPUTED_STOP) {
        ctx.stop ??= new Error(
          `${ctx.disputed.join(", ")} each came back matching its file better at another offset, or at times of day its file has never held; one file can be its own, ${DISPUTED_STOP} are the endpoint or the calendar, and a daylight-saving change or a provider timezone moves every session alike, so the run stands down: recover each side of a change separately`,
        );
      }
    }
    return tally;
  }
  if (fresh.length > 0) {
    fresh.sort((a, b) => a.date.localeCompare(b.date));
    appendFileSync(bankPath(ctx.dir, symbol), `${fresh.map((bar) => JSON.stringify(bar)).join("\n")}\n`);
    tally.appended = fresh.length;
  }
  const sidecar = store.sidecar;
  const runs = Array.isArray(sidecar.runs) ? (sidecar.runs as unknown[]) : [];
  sidecar.bars = (typeof sidecar.bars === "number" ? sidecar.bars : 0) + fresh.length;
  sidecar.runs = [
    ...runs.slice(-29),
    {
      appended: fresh.length,
      at: new Date(ctx.deps.now()).toISOString(),
      fetched: tally.usable,
      note:
        `recovered ${plan.from}..${plan.to}` +
        (tally.revision ? `; ${tally.revision.revised} of ${tally.revision.overlaps} held minutes came back revised` : ""),
    },
  ];
  writeFileSync(sidecarPath(ctx.dir, symbol), JSON.stringify(sidecar, null, 2));
  return tally;
}

// --- the run -----------------------------------------------------------------

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

export async function runRecover(deps: RecoverDeps): Promise<number> {
  const { print, state } = deps;
  let plan: Plan;
  try {
    plan = readPlan(deps.argv, deps.now());
  } catch (error) {
    if (!(error instanceof OperatorInputError)) throw error;
    print.err(error.message);
    return 1;
  }
  if (!plan.dryRun && !deps.key) {
    print.err("FMP_API_KEY is required.");
    return 1;
  }
  const dir = state.canonicalBankDir;
  // The handlers go in before the lock is taken. Without one, a signal between
  // the mkdir and the handlers ends the process where it stands and leaves the
  // lock behind; with one, it waits for this synchronous acquisition to finish.
  let lock: { release: () => void } | undefined;
  const onSignal = (signal: NodeJS.Signals) => {
    lock?.release();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    const taken = acquireBankLock(dir);
    if ("refused" in taken) {
      print.err(taken.refused);
      return 1;
    }
    lock = taken;
    print.err(
      `holding the bank lock ${dir}.lock: the scheduled bank and its backup wait for it (900 s by default), then fail`,
    );
    return await recoverUnderLock(deps, plan, dir);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    lock?.release();
  }
}

async function recoverUnderLock(deps: RecoverDeps, plan: Plan, dir: string): Promise<number> {
  const { print, state } = deps;
  let code = 0;
  const stores: Array<{ symbol: string; store: Store }> = [];
  const absent: string[] = [];
  for (const { fmpSymbol } of bankableSymbols()) {
    const read = readStore(dir, fmpSymbol, plan);
    if (read === null) absent.push(fmpSymbol);
    else if ("problem" in read) {
      print.err(read.problem);
      code = 1;
    } else stores.push({ store: read, symbol: fmpSymbol });
  }
  if (absent.length > 0) print.out(`No bank file, so no hole to fill: ${absent.join(", ")}.`);
  if (stores.length === 0) {
    // A roster with no bank file at all is a checkout that holds no bank:
    // a scratch copy, or LEVELFLOW_CHECKOUT naming the wrong tree.
    print.err(
      code === 0
        ? `no roster symbol has a bank file under ${dir}; this checkout holds no minute bank, so there is nothing to recover into`
        : `no bank file under ${dir} could be read whole, so there is nothing to recover into`,
    );
    return 1;
  }
  const questions = stores.reduce((sum, { store }) => sum + plan.dates.filter((date) => date >= store.firstDay).length, 0);

  if (plan.dryRun) {
    for (const { symbol, store } of stores) {
      const days = plan.dates.filter((date) => date >= store.firstDay).map((date) => `${date} ${store.perDay.get(date) ?? 0}`);
      print.out([symbol, ...days].join("\t"));
    }
    print.out(
      `A run would ask ${plural(questions, "dated question")} for ${plural(stores.length, "symbol")}, ` +
        `${plan.from}..${plan.to}. Nothing was fetched.`,
    );
    return code;
  }

  const decision = maySpend({
    atMs: deps.now(),
    consumer: "adhoc",
    label: LABEL,
    requiredPaths: [ENDPOINT_PATH],
    state,
  });
  if (!decision.allowed) {
    print.err(decision.reason);
    print.err(formatStandDown(decision.kind, decision.source));
    return 1;
  }
  const ctx: Context = {
    budget: governedBudget(createByteBudget(RUN_BYTE_BUDGET), { consumer: "adhoc", label: LABEL, now: deps.now, state }),
    deps,
    dir,
    // Counted where a request leaves: a probe-gate refusal inside the wrapper
    // is not a request.
    fetch: createProbeGate(decision, { consumer: "adhoc", now: deps.now }, state).wrapFetch((input, init) => {
      ctx.requests += 1;
      return deps.fetch(input, init);
    }),
    bookkeepingFailed: 0,
    disputed: [],
    refusalBytes: 0,
    requests: 0,
    stop: undefined,
  };

  // The first symbol that asks a question is the scout, as in the bank: on a
  // refusing provider or an open breaker the run learns it from one symbol,
  // not from as many as there are workers, and a probe the breaker allows goes
  // out once. A scout that asked and came back with nothing stands the run
  // down, whatever the reason, because every other symbol would learn the
  // same fact.
  const asks = ({ store }: { store: Store }) => plan.dates.some((date) => date >= store.firstDay);
  const scoutAt = stores.findIndex(asks);
  const order = scoutAt < 0 ? stores : [stores[scoutAt], ...stores.filter((_, index) => index !== scoutAt)];
  const tallies: Tally[] = [];
  let next = 0;
  if (scoutAt >= 0) {
    const { symbol, store } = order[next++];
    const scout = await recoverOne(ctx, symbol, store, plan);
    tallies.push(scout);
    // No usable bars is no bars: an answer from outside the asked days means
    // the provider stopped honouring the dates.
    if ((scout.fetched === 0 || scout.dropped === scout.fetched) && !ctx.stop) {
      const asked = plan.dates.filter((date) => date >= store.firstDay).length;
      ctx.stop = new Error(
        `the scout ${symbol} asked ${asked} dated question(s) and got no usable bars back (${scout.fetched} fetched, ${scout.dropped} dropped); standing down rather than asking every symbol the same`,
      );
    }
  }
  // A disputed scout may be its own file or the endpoint's. The next symbol
  // that asks settles it alone, before the pool opens: in the pool the workers
  // already in flight would each buy their whole window before a second
  // dispute could stop them. An expected refusal settles nothing; an expected
  // symbol that came back clean settles it like any other.
  while (ctx.disputed.length > 0 && !ctx.stop && next < order.length) {
    const item = order[next++];
    const tally = await recoverOne(ctx, item.symbol, item.store, plan);
    tallies.push(tally);
    if (asks(item) && !tally.expected) break;
  }
  const workers = Array.from({ length: plan.concurrency }, async () => {
    while (next < order.length && !ctx.stop) {
      const { symbol, store } = order[next++];
      tallies.push(await recoverOne(ctx, symbol, store, plan));
    }
  });
  await Promise.all(workers);
  const unstarted = order.slice(next).filter(asks);
  if (unstarted.length > 0) {
    print.out(`Not started after the stop: ${unstarted.map(({ symbol }) => symbol).join(", ")}.`);
    code = 1;
  }

  tallies.sort((a, b) => a.symbol.localeCompare(b.symbol));
  for (const tally of tallies) {
    const missed = tally.missed.length > 0 ? `\tnot recovered: ${tally.missed.join(" ")}` : "";
    const refused = tally.refused ? "\trefused" : "";
    const { revision } = tally;
    const revised =
      revision === null
        ? ""
        : `\t${revision.revised} of ${revision.overlaps} held minutes came back revised` +
          (revision.median === null ? "" : `, median relative close difference ${revision.median.toExponential(2)}`);
    print.out(`${tally.symbol}\tfetched ${tally.fetched}\tappended ${tally.appended}\tdropped ${tally.dropped}${revised}${missed}${refused}`);
    if (tally.missed.length > 0 || tally.refused) code = 1;
  }
  const appended = tallies.reduce((sum, tally) => sum + tally.appended, 0);
  print.out(
    `Recovered ${plural(appended, "bar")} across ${plural(tallies.length, "symbol")} for ${plan.from}..${plan.to}: ` +
      `${plural(ctx.requests, "request")}, ${ctx.budget.spent() + ctx.refusalBytes} bytes to the ad-hoc class` +
      (ctx.refusalBytes > 0 ? ` (${ctx.refusalBytes} of them refusal bodies).` : "."),
  );
  if (ctx.bookkeepingFailed > 0) {
    print.err(
      `${ctx.bookkeepingFailed} refusal bookkeeping write(s) failed this run; the ledger or the breaker is short by what they carried`,
    );
    code = 1;
  }
  if (ctx.stop) {
    const stop = ctx.stop instanceof Refused ? ctx.stop.refusal : ctx.stop;
    print.err(redactProviderSecrets(stop instanceof Error ? stop.message : String(stop)));
    const token = standDownFor(stop);
    if (token) print.err(token);
    code = 1;
  }
  return code;
}

/**
 * The binary. Its state root is resolved here, inside a function: a checkout
 * that names nothing is refused in one line before anything else runs
 * (tests/fmpGovernor.test.ts pins where the call sits).
 */
async function main(): Promise<number> {
  const print = { err: (line: string) => console.error(line), out: (line: string) => console.log(line) };
  let state: FmpStatePaths;
  try {
    state = defaultStatePaths();
  } catch (error) {
    if (!(error instanceof OperatorInputError)) throw error;
    print.err(error.message);
    return 1;
  }
  return runRecover({
    argv: process.argv.slice(2),
    fetch,
    key: process.env.FMP_API_KEY,
    now: Date.now,
    print,
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    state,
  });
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await main();
}
