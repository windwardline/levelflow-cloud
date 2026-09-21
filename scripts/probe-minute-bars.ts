/**
 * One dated 1-minute question, through the governor (rewritten 2026-09-16).
 *
 * The round-28 version looped every roster symbol with an undated request and
 * recorded nothing to the breaker's scope; the 2026-09-14 hand probes ran
 * outside every ledger. What it measured stands: an UNDATED request returns
 * about three days (2026-08-06). What nobody has measured is whether a DATED
 * request reaches deeper — the question that decides whether the minute bank's
 * gaps are permanent. This asks exactly that, once per run, for one symbol and
 * at most seven dates, spending as the ad-hoc class.
 *
 *   FMP_API_KEY=... npx tsx scripts/probe-minute-bars.ts \
 *     --symbol EURUSD --from 2026-09-04 --to 2026-09-05 [--json out.json]
 *
 * Every argument is refused before the governor is asked, and the governor is
 * asked before the one request.
 */
import { writeFileSync } from "node:fs";

import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";
import { redactProviderSecrets } from "../supabase/functions/trade-analyzer/redact.ts";
import { flagReader } from "./flagReader.ts";
import { createByteBudget, SpendRefusedError } from "./fmpByteBudget.ts";
import { createProbeGate, type FetchLike } from "./fmpCircuit.ts";
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
const LABEL = "probe-minute-bars";
/** One day of 1-minute bars is ~150 KB; sixteen MiB bounds a seven-date answer with room. */
const PROBE_BYTE_BUDGET = 16 * 1024 * 1024;
const MAX_DATES = 7;
const DAY_MS = 86_400_000;

// The ONE declaration of which flags own the token after them (#364
// round 50, finding 2 — the scan globs scripts/, so every reader with a
// value-taking flag is inside the law rather than on a curated list).
const VALUE_FLAGS = new Set(["--symbol", "--from", "--to", "--json"]);

type Print = { out: (line: string) => void; err: (line: string) => void };

export type ProbeDeps = {
  argv: string[];
  key: string | undefined;
  fetch: FetchLike;
  now: () => number;
  /** Required: a test that forgets to pass state must not reach the machine's ledger. */
  state: FmpStatePaths;
  print: Print;
};

type Question = { symbol: string; from: string; to: string; jsonPath: string | undefined };

function readQuestion(argv: string[]): Question {
  const { str } = flagReader(argv, VALUE_FLAGS);
  const symbol = str("--symbol");
  const from = str("--from");
  const to = str("--to");
  const jsonPath = str("--json");
  if (symbol === undefined) {
    throw new Error("--symbol is required: the probe asks one question about one roster symbol");
  }
  if (!MASTER_LIST_ROWS.some((row) => row.fmpSymbol === symbol)) {
    throw new Error(`--symbol ${symbol} is not an fmpSymbol on the master list`);
  }
  if (from === undefined) throw new Error("--from is required: an undated request answers nothing new");
  if (to === undefined) throw new Error("--to is required with --from");
  for (const [flag, value] of [["--from", from], ["--to", to]] as const) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    if (parsed === null || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error(`${flag} must be a real YYYY-MM-DD date; got ${value}`);
    }
  }
  if (from > to) throw new Error(`--from ${from} is after --to ${to}`);
  const dates = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (dates > MAX_DATES) {
    throw new Error(
      `${from}..${to} spans ${dates} dates; one probe asks about at most ${MAX_DATES} dates`,
    );
  }
  return { from, jsonPath, symbol, to };
}

export async function runProbe(deps: ProbeDeps): Promise<number> {
  const { print, state } = deps;
  let question: Question;
  try {
    question = readQuestion(deps.argv);
  } catch (error) {
    print.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (!deps.key) {
    print.err("FMP_API_KEY is required.");
    return 1;
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
  const budget = governedBudget(createByteBudget(PROBE_BYTE_BUDGET), {
    consumer: "adhoc",
    label: LABEL,
    now: deps.now,
    state,
  });
  const providerFetch = createProbeGate(decision, { consumer: "adhoc", now: deps.now }, state)
    .wrapFetch(deps.fetch);

  const url = new URL(`${BASE}/${ENDPOINT}`);
  url.searchParams.set("symbol", question.symbol);
  url.searchParams.set("from", question.from);
  url.searchParams.set("to", question.to);
  url.searchParams.set("apikey", deps.key);
  try {
    const response = await providerFetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      throw await providerRefusal(response, {
        atMs: deps.now(),
        consumer: "adhoc",
        endpointPath: ENDPOINT_PATH,
        label: LABEL,
        note: true,
        state,
      });
    }
    const answeredAtMs = deps.now();
    const text = await response.text();
    const bytes = Buffer.byteLength(text);
    // Recorded first, as every answer is. The bytes are bought either way, so a
    // refusal the record raises — the class's day crossed, the run's own bound,
    // a ledger write that failed — waits until the answer it paid for is
    // printed and written, then ends the run red.
    let recordRefusal: SpendRefusedError | null = null;
    try {
      budget.record(bytes, { answeredAtMs, endpointPath: ENDPOINT_PATH });
    } catch (error) {
      if (!(error instanceof SpendRefusedError)) throw error;
      recordRefusal = error;
    }
    let code = 1;
    try {
      code = reportAnswer(question, text, bytes, print);
    } finally {
      if (recordRefusal) {
        print.err(recordRefusal.message);
        print.err(standDownFor(recordRefusal)!);
      }
    }
    return recordRefusal ? 1 : code;
  } catch (error) {
    if (error instanceof SpendRefusedError || error instanceof ProviderRefusalError) {
      print.err(error.message);
      print.err(standDownFor(error)!);
      return 1;
    }
    print.err(`the probe request failed: ${redactProviderSecrets(error instanceof Error ? error.message : String(error))}`);
    return 1;
  }
}

/** Print and write what the provider returned. Returns 1 when it was not a list of bars. */
function reportAnswer(question: Question, text: string, bytes: number, print: Print): number {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  if (!Array.isArray(payload)) {
    print.err(
      `the provider did not answer with a list of bars: ${redactProviderSecrets(text).slice(0, 300)}`,
    );
    return 1;
  }
  const range = `${question.from}..${question.to}`;
  if (payload.length === 0) {
    print.out(`0 bars returned for ${range} (${question.symbol}, ${bytes} bytes)`);
    writeAnswer(question, { bars: 0, bytes, dates: {}, firstDate: null, lastDate: null });
    return 0;
  }
  const stamps = (payload as Array<{ date?: unknown }>)
    .map((bar) => (typeof bar.date === "string" ? bar.date : ""))
    .filter(Boolean)
    .sort();
  const dates: Record<string, number> = {};
  for (const stamp of stamps) {
    const date = stamp.slice(0, 10);
    dates[date] = (dates[date] ?? 0) + 1;
  }
  const firstDate = stamps[0] ?? null;
  const lastDate = stamps.at(-1) ?? null;
  print.out(
    `${payload.length} bars for ${question.symbol} ${range}; first ${firstDate}, last ${lastDate}; ${bytes} bytes`,
  );
  for (const [date, count] of Object.entries(dates)) print.out(`  ${date}: ${count}`);
  writeAnswer(question, { bars: payload.length, bytes, dates, firstDate, lastDate });
  return 0;
}

function writeAnswer(
  question: Question,
  answer: { bars: number; bytes: number; dates: Record<string, number>; firstDate: string | null; lastDate: string | null },
): void {
  if (question.jsonPath === undefined) return;
  writeFileSync(
    question.jsonPath,
    JSON.stringify({ from: question.from, symbol: question.symbol, to: question.to, ...answer }, null, 2),
  );
}

if (isEntryPoint(import.meta.url)) {
  process.exitCode = await runProbe({
    argv: process.argv.slice(2),
    fetch,
    key: process.env.FMP_API_KEY,
    now: Date.now,
    print: { err: (line) => console.error(line), out: (line) => console.log(line) },
    state: defaultStatePaths(),
  });
}
