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
 * Two bounds on a clock that moved while keeping its shape. Where an answer
 * lands on minutes the file already holds, the prices must agree; the bank
 * keeps a first copy and the provider revises a few, so more than 2% (and
 * more than 5) disagreeing means the keys no longer name the same minutes.
 * Where it lands on minutes the file lacks, their times of day must be ones
 * the file has held; a file of a day's minutes or more has seen its session,
 * so more than 5% (and more than 10) never seen means the session moved.
 */
const DISAGREE_SHARE = 0.02;
const DISAGREE_FLOOR = 5;
const NOVEL_SHARE = 0.05;
const NOVEL_FLOOR = 10;

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
 */
export function acquireBankLock(bank: string): { release: () => void } | { refused: string } {
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
  writeFileSync(`${lock}/pid`, `${pid}\n`);
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

type Context = {
  deps: RecoverDeps;
  fetch: FetchLike;
  budget: ByteBudget;
  dir: string;
  /** Set once, by the first refusal no later request can clear. */
  stop: unknown;
  requests: number;
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
        throw new Refused(
          await providerRefusal(response, {
            atMs: deps.now(),
            consumer: "adhoc",
            endpointPath: ENDPOINT_PATH,
            label: LABEL,
            note: true,
            state: deps.state,
          }),
        );
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

type Tally = { symbol: string; fetched: number; appended: number; dropped: number; missed: string[]; refused: boolean };

async function recoverOne(ctx: Context, symbol: string, store: Store, plan: Plan): Promise<Tally> {
  const tally: Tally = { appended: 0, dropped: 0, fetched: 0, missed: [], refused: false, symbol };
  const asked = plan.dates.filter((date) => date >= store.firstDay);
  if (asked.length === 0) return tally;
  const fresh: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = [];
  let foreign: string | null = null;
  let overlaps = 0;
  let disagree = 0;
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
      const banked = store.closes.get(bar.date);
      if (banked !== undefined) {
        overlaps += 1;
        if (Math.abs(banked - bar.close) > 1e-9 * Math.max(1, Math.abs(banked))) disagree += 1;
      }
      if (store.keys.has(bar.date)) continue;
      store.keys.add(bar.date);
      fresh.push({
        close: bar.close,
        date: bar.date,
        high: bar.high,
        low: bar.low,
        open: bar.open,
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
  let refusal: string | null = null;
  if (foreign !== null) {
    refusal = `the provider answered with the date "${foreign}", not the bank's YYYY-MM-DD HH:MM:SS; dedupe could not hold`;
  } else if (overfull !== undefined) {
    refusal = `${overfull[0]} would hold ${(store.perDay.get(overfull[0]) ?? 0) + overfull[1]} minutes, more than a day has; dedupe did not hold`;
  } else if (disagree > Math.max(DISAGREE_FLOOR, DISAGREE_SHARE * overlaps)) {
    refusal = `${disagree} of ${overlaps} minutes the file already holds came back at another price; the keys no longer name the same minutes`;
  } else if (novel > Math.max(NOVEL_FLOOR, NOVEL_SHARE * fresh.length)) {
    refusal = `${novel} of ${fresh.length} new minutes fall at times of day the file has never held; the session's clock moved`;
  }
  if (refusal !== null) {
    // Every asked day was bought and none is kept: an append-only store takes
    // no minute it cannot place.
    ctx.deps.print.err(`${symbol}: ${refusal}, so nothing was appended (${tally.fetched} bars were bought)`);
    tally.refused = true;
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
    { appended: fresh.length, at: new Date(ctx.deps.now()).toISOString(), fetched: tally.fetched, note: `recovered ${plan.from}..${plan.to}` },
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
  const lock = acquireBankLock(dir);
  if ("refused" in lock) {
    print.err(lock.refused);
    return 1;
  }
  print.err(
    `holding the bank lock ${dir}.lock: the scheduled bank and its backup wait for it (900 s by default), then fail`,
  );
  const onSignal = (signal: NodeJS.Signals) => {
    lock.release();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    return await recoverUnderLock(deps, plan, dir);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    lock.release();
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
    if (scout.fetched === 0 && !ctx.stop) {
      const asked = plan.dates.filter((date) => date >= store.firstDay).length;
      ctx.stop = new Error(
        `the scout ${symbol} asked ${asked} dated question(s) and got no bars back; standing down rather than asking every symbol the same`,
      );
    }
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
    print.out(`${tally.symbol}\tfetched ${tally.fetched}\tappended ${tally.appended}\tdropped ${tally.dropped}${missed}${refused}`);
    if (tally.missed.length > 0 || tally.refused) code = 1;
  }
  const appended = tallies.reduce((sum, tally) => sum + tally.appended, 0);
  print.out(
    `Recovered ${plural(appended, "bar")} across ${plural(tallies.length, "symbol")} for ${plan.from}..${plan.to}: ` +
      `${plural(ctx.requests, "request")}, ${ctx.budget.spent()} bytes to the ad-hoc class.`,
  );
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
