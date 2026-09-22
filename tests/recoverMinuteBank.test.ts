import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { readBreaker } from "../scripts/fmpCircuit.ts";
import { readDay, recordUsage } from "../scripts/fmpGovernor.ts";
import type { FmpStatePaths } from "../scripts/fmpState.ts";
import { isRetryable, withRetry } from "../scripts/bank-minute-bars.ts";
import { LedgerUnreadableError, ProbeLostError } from "../scripts/fmpByteBudget.ts";
import { acquireBankLock, runRecover } from "../scripts/recover-minute-bank.ts";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";
import { BODIES, tempState } from "./fixtures/fmpTestState.ts";

/**
 * Recovering a minute-bank hole from dated requests.
 *
 * From 2026-09-04 to 2026-09-14 the bank could not run, and the store has a
 * hole it was built on the belief it could never fill: an undated request
 * returns about three days. On 2026-09-22 a governed probe asked FMP for one
 * dated day, and it answered with every minute (EURUSD and BTCUSD, 2026-09-08,
 * 2025-09-09 and 2021-09-08, 1,440 bars each). This fills a hole inside what
 * the bank already holds and nothing else: it appends, it never rewrites, and
 * it dedupes against every key in the file rather than the sidecar's
 * recent-key window, which cannot see a partial day two weeks old.
 *
 * Every test here passes its own fetch and its own temporary state, so no
 * test can reach the provider or this machine's ledger.
 */

const MIB = 1024 * 1024;
const AT = Date.parse("2026-09-22T12:00:00Z");
const WINDOW = ["--from", "2026-09-03", "--to", "2026-09-05"];

const bar = (date: string, price = 1) => ({ close: price, date, high: price, low: price, open: price, volume: 0 });

/** Three minutes a day, newest first, as FMP orders them. */
const day = (date: string) => [bar(`${date} 00:02:00`), bar(`${date} 00:01:00`), bar(`${date} 00:00:00`)];

type Bar = ReturnType<typeof bar>;

function bank(state: FmpStatePaths, symbol: string, dates: string[], options: { torn?: boolean } = {}) {
  mkdirSync(state.canonicalBankDir, { recursive: true });
  const file = join(state.canonicalBankDir, `${encodeURIComponent(symbol)}.jsonl`);
  const body = dates.map((date) => JSON.stringify(bar(date))).join("\n");
  writeFileSync(file, options.torn ? `${body}\n{"date":"2026-09-21 23:5` : `${body}\n`);
  const sidecar = {
    bars: dates.length,
    endpoint: "historical-chart/1min",
    firstDate: dates[0],
    fmpSymbol: symbol,
    highWaterMark: dates.at(-1),
    markets: [symbol],
    provider: "fmp",
    recentKeys: dates.slice(-2),
    runs: [],
    sourceTimezone: null,
  };
  writeFileSync(join(state.canonicalBankDir, `${encodeURIComponent(symbol)}.state.json`), JSON.stringify(sidecar, null, 2));
  return { file, sidecar: join(state.canonicalBankDir, `${encodeURIComponent(symbol)}.state.json`) };
}

type Provider = (symbol: string, date: string) => Response;

const served: Provider = (_symbol, date) => new Response(JSON.stringify(day(date)));

async function recover(
  options: { argv?: string[]; provider?: Provider; state?: FmpStatePaths; key?: string | null } = {},
) {
  const state = options.state ?? tempState();
  const urls: URL[] = [];
  const lines: string[] = [];
  const provider = options.provider ?? served;
  const code = await runRecover({
    argv: options.argv ?? WINDOW,
    fetch: (input) => {
      const url = new URL(String(input));
      urls.push(url);
      return Promise.resolve(provider(url.searchParams.get("symbol") ?? "", url.searchParams.get("from") ?? ""));
    },
    key: options.key === null ? undefined : (options.key ?? "test-key"),
    now: () => AT,
    print: { err: (line) => lines.push(line), out: (line) => lines.push(line) },
    sleep: () => Promise.resolve(),
    state,
  });
  return { code, output: lines.join("\n"), state, urls };
}

const lines = (file: string): Bar[] =>
  readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Bar);

describe("recover-minute-bank refuses before it spends", () => {
  it("recovers roster symbols", () => {
    for (const symbol of ["EURUSD", "BTCUSD"]) assert.ok(MASTER_LIST_ROWS.some((row) => row.fmpSymbol === symbol));
  });

  for (const [why, argv, message] of [
    ["no window", [], /--from is required/],
    ["no end", ["--from", "2026-09-03"], /--to is required/],
    ["an impossible date", ["--from", "2026-09-31", "--to", "2026-10-01"], /must be a real YYYY-MM-DD date/],
    ["a reversed window", ["--from", "2026-09-05", "--to", "2026-09-03"], /is after --to/],
    ["a window longer than a month", ["--from", "2026-07-01", "--to", "2026-08-10"], /spans 41 dates/],
    ["a mistyped --dry-run", [...WINDOW, "--dryrun"], /unknown argument --dryrun/],
    ["a stray value", [...WINDOW, "2026-09-06"], /unknown argument 2026-09-06/],
  ] as const) {
    it(`refuses ${why}, and fetches nothing`, async () => {
      const state = tempState();
      bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
      const result = await recover({ argv: [...argv], state });
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, message);
      assert.equal(result.urls.length, 0);
    });
  }

  it("refuses a window the scheduled bank is still served, so the two never append the same minute", async () => {
    // The bank dedupes against its recent-key window only. A minute recovered
    // inside the ~3 days an undated request still returns would be banked
    // again by the next scheduled run.
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({ argv: ["--from", "2026-09-14", "--to", "2026-09-16"], state });
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /--to 2026-09-16 is inside the last 7 days/);
    assert.equal(result.urls.length, 0);
  });

  it("refuses a real run without a key", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({ key: null, state });
    assert.equal(result.code, 1);
    assert.match(result.output, /FMP_API_KEY is required/);
    assert.equal(result.urls.length, 0);
  });

  it("refuses while the bank lock is held, and leaves the holder's lock alone", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const lock = `${state.canonicalBankDir}.lock`;
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), `${process.pid}\n`);
    const result = await recover({ state });
    assert.equal(result.code, 1);
    assert.match(result.output, new RegExp(`the bank lock .*\\.lock is held by pid ${process.pid}`));
    assert.equal(result.urls.length, 0);
    assert.equal(readFileSync(join(lock, "pid"), "utf8"), `${process.pid}\n`);
  });

  it("stands down when the ad-hoc class has no room left today", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    recordUsage({ atMs: AT, bytes: 256 * MIB, consumer: "adhoc", label: "earlier" }, state);
    const result = await recover({ state });
    assert.equal(result.code, 1);
    assert.match(result.output, /the adhoc class has no FMP headroom left today/);
    assert.match(result.output, /^fmpStandDown: kind=dailyCeiling source=governor$/m);
    assert.equal(result.urls.length, 0);
    assert.ok(!existsSync(`${state.canonicalBankDir}.lock`), "a refused run releases the lock");
  });

  it("refuses a file whose last line is torn and appends nothing to it", async () => {
    // Appending after a torn line would bury it mid-file, where every reader
    // that parses line by line meets it.
    const state = tempState();
    const torn = bank(state, "EURUSD", ["2026-08-06 00:00:00"], { torn: true });
    bank(state, "BTCUSD", ["2026-08-06 00:00:00"]);
    const before = readFileSync(torn.file, "utf8");
    const result = await recover({ state });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD.*does not end in a newline/);
    assert.equal(readFileSync(torn.file, "utf8"), before);
    assert.ok(!result.urls.some((url) => url.searchParams.get("symbol") === "EURUSD"), "no bytes bought for it");
    assert.ok(result.urls.some((url) => url.searchParams.get("symbol") === "BTCUSD"), "the rest still recover");
  });
});

describe("recover-minute-bank fills the hole and nothing else", () => {
  it("asks one dated question per symbol and day, from the first day each file holds", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00", "2026-09-03 00:00:00", "2026-09-12 00:00:00"]);
    // A file that started inside the window: nothing before its first day.
    bank(state, "BTCUSD", ["2026-09-04 00:00:00", "2026-09-12 00:00:00"]);
    const result = await recover({ state });
    assert.equal(result.code, 0, result.output);
    const asked = result.urls.map((url) => `${url.searchParams.get("symbol")} ${url.searchParams.get("from")}..${url.searchParams.get("to")}`);
    assert.deepEqual(asked.sort(), [
      "BTCUSD 2026-09-04..2026-09-04",
      "BTCUSD 2026-09-05..2026-09-05",
      "EURUSD 2026-09-03..2026-09-03",
      "EURUSD 2026-09-04..2026-09-04",
      "EURUSD 2026-09-05..2026-09-05",
    ]);
    for (const url of result.urls) {
      assert.equal(url.pathname, "/stable/historical-chart/1min");
      assert.equal(url.searchParams.get("apikey"), "test-key");
    }
  });

  it("appends only minutes the file lacks, inside the asked day, oldest first, after what was there", async () => {
    const state = tempState();
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00", "2026-09-03 00:00:00", "2026-09-12 00:00:00"]);
    const before = readFileSync(eur.file, "utf8");
    const provider: Provider = (_symbol, date) =>
      new Response(
        JSON.stringify([
          ...day(date),
          // A minute of the day before, which a from=to answer should not
          // carry. It is the provider's to fix, not this store's to keep.
          bar("2026-09-02 23:59:00"),
          // Malformed: dropped, never repaired.
          { date: `${date} 00:03:00`, high: 1, low: 1, open: 1 },
        ]),
      );
    const result = await recover({ provider, state });
    assert.equal(result.code, 0, result.output);
    const after = readFileSync(eur.file, "utf8");
    assert.ok(after.startsWith(before), "the file was rewritten, not appended to");
    const added = after.slice(before.length).split("\n").filter(Boolean).map((line) => (JSON.parse(line) as Bar).date);
    assert.deepEqual(added, [
      "2026-09-03 00:01:00",
      "2026-09-03 00:02:00",
      "2026-09-04 00:00:00",
      "2026-09-04 00:01:00",
      "2026-09-04 00:02:00",
      "2026-09-05 00:00:00",
      "2026-09-05 00:01:00",
      "2026-09-05 00:02:00",
    ]);
    assert.equal(new Set(lines(eur.file).map((b) => b.date)).size, lines(eur.file).length, "no minute banked twice");
    const appendedLine = after.slice(before.length).split("\n")[0];
    assert.deepEqual(Object.keys(JSON.parse(appendedLine)), ["date", "open", "high", "low", "close", "volume"], "the bank's own line shape");
    // Dropped: three malformed and three from outside the asked day.
    assert.match(result.output, /EURUSD\tfetched 15\tappended 8\tdropped 6/);
    // The sidecar's `fetched` is the bank's: usable bars only.
    assert.equal(JSON.parse(readFileSync(eur.sidecar, "utf8")).runs.at(-1).fetched, 9);
  });

  it("keeps the sidecar's high-water mark, first date and recent keys, and counts what it added", async () => {
    const state = tempState();
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00", "2026-09-03 00:00:00", "2026-09-12 00:00:00"]);
    const before = JSON.parse(readFileSync(eur.sidecar, "utf8"));
    const result = await recover({ state });
    assert.equal(result.code, 0, result.output);
    const after = JSON.parse(readFileSync(eur.sidecar, "utf8"));
    assert.equal(after.highWaterMark, before.highWaterMark);
    assert.equal(after.firstDate, before.firstDate);
    assert.deepEqual(after.recentKeys, before.recentKeys, "the scheduled bank's dedupe window is its own");
    assert.equal(after.bars, before.bars + 8);
    assert.equal(after.bars, lines(eur.file).length);
    assert.deepEqual(after.runs.at(-1).note, "recovered 2026-09-03..2026-09-05");
    assert.equal(after.runs.at(-1).appended, 8);
  });

  it("charges every byte to the ad-hoc class and releases the lock", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({ state });
    assert.equal(result.code, 0, result.output);
    const spent = readDay(AT, state);
    assert.ok(spent.ok);
    const body = Buffer.byteLength(JSON.stringify(day("2026-09-03")));
    assert.equal(spent.day.adhoc, body * 3);
    assert.equal(spent.day.bank, 0);
    assert.ok(!existsSync(`${state.canonicalBankDir}.lock`));
    assert.match(result.output, /Recovered 9 bars across 1 symbol for 2026-09-03\.\.2026-09-05: 3 requests/);
  });

  it("appends nothing on a second run", async () => {
    const state = tempState();
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const first = await recover({ state });
    assert.equal(first.code, 0, first.output);
    const between = readFileSync(eur.file, "utf8");
    const second = await recover({ state });
    assert.equal(second.code, 0, second.output);
    assert.equal(readFileSync(eur.file, "utf8"), between);
    assert.match(second.output, /EURUSD\tfetched 9\tappended 0/);
  });

  it("measures the hole with --dry-run, spending nothing and needing no key", async () => {
    const state = tempState();
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00", "2026-09-03 00:00:00", "2026-09-03 00:01:00"]);
    const before = readFileSync(eur.file, "utf8");
    const result = await recover({ argv: [...WINDOW, "--dry-run"], key: null, state });
    assert.equal(result.code, 0, result.output);
    assert.equal(result.urls.length, 0);
    assert.match(result.output, /^EURUSD\t2026-09-03 2\t2026-09-04 0\t2026-09-05 0$/m);
    assert.match(result.output, /would ask 3 dated questions for 1 symbol/);
    assert.equal(readFileSync(eur.file, "utf8"), before);
    const spent = readDay(AT, state);
    assert.ok(spent.ok);
    assert.equal(spent.day.adhoc, 0);
  });
});

describe("recover-minute-bank refuses a symbol whose answers would not dedupe", () => {
  // Dedupe is string equality on the provider's date, in an append-only
  // store. A key shape that drifted would append every minute again, for good.
  it("refuses a date in another shape, and appends nothing for that symbol", async () => {
    const state = tempState();
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const before = readFileSync(eur.file, "utf8");
    const provider: Provider = (_symbol, date) =>
      new Response(JSON.stringify([...day(date), bar(`${date}T00:03:00`)]));
    const result = await recover({ provider, state });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD: the provider answered with the date "2026-09-03T00:03:00", not the bank's/);
    assert.match(result.output, /^EURUSD\t.*\trefused$/m);
    assert.equal(readFileSync(eur.file, "utf8"), before);
  });

  it("refuses a day that would hold more minutes than a day has", async () => {
    const state = tempState();
    const minutes = Array.from({ length: 1440 }, (_, i) =>
      `2026-09-03 ${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`);
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00", ...minutes]);
    const before = readFileSync(eur.file, "utf8");
    // The same minutes, keyed a second later: a dedupe that did not hold.
    const provider: Provider = (_symbol, date) =>
      new Response(JSON.stringify(date === "2026-09-03" ? minutes.map((m) => bar(m.replace(/:00$/, ":30"))) : []));
    const result = await recover({ provider, state });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD: 2026-09-03 would hold 2880 minutes, more than a day has/);
    assert.equal(readFileSync(eur.file, "utf8"), before);
  });

  it("leaves the sidecar of a symbol with no asked day alone", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const btc = bank(state, "BTCUSD", ["2026-09-12 00:00:00"]);
    const before = readFileSync(btc.sidecar, "utf8");
    const result = await recover({ state });
    assert.equal(result.code, 0, result.output);
    assert.equal(readFileSync(btc.sidecar, "utf8"), before, "a no-op must not spend one of the thirty remembered runs");
    assert.ok(!result.urls.some((url) => url.searchParams.get("symbol") === "BTCUSD"));
  });

  it("refuses a symbol whose answer disagrees with the minutes it already holds", async () => {
    // Same shape, other clock: the keys collide and the prices do not.
    const state = tempState();
    const minutes = Array.from({ length: 20 }, (_, i) => `2026-09-03 00:${String(i).padStart(2, "0")}:00`);
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00", ...minutes]);
    const before = readFileSync(eur.file, "utf8");
    const provider: Provider = (_symbol, date) =>
      new Response(JSON.stringify(date === "2026-09-03" ? minutes.map((m) => bar(m, 2)) : []));
    const result = await recover({ provider, state });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD: 20 of 20 minutes the file already holds came back at another price/);
    assert.match(result.output, /nothing was appended \(20 bars were bought\)/);
    assert.equal(readFileSync(eur.file, "utf8"), before);
  });

  it("refuses new minutes at times of day the file has never held", async () => {
    // A session banked at 09:30-15:59 for days, answered at 13:30-19:59: the
    // clock moved, and none of it collides to say so.
    const state = tempState();
    const session: string[] = [];
    for (const day of ["2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"]) {
      for (let m = 9 * 60 + 30; m < 16 * 60; m += 1) {
        session.push(`${day} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`);
      }
    }
    const eur = bank(state, "EURUSD", session);
    const before = readFileSync(eur.file, "utf8");
    const shifted = (date: string) =>
      Array.from({ length: 390 }, (_, i) => {
        const m = 13 * 60 + 30 + i;
        return bar(`${date} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`);
      });
    const other = bank(state, "GBPUSD", session);
    const result = await recover({ provider: (_symbol, date) => new Response(JSON.stringify(shifted(date))), state });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD: 720 of 1170 new minutes fall at times of day the file has never held/);
    assert.match(result.output, /moves every session alike, so the run stands down: recover each side of a change separately/);
    assert.match(result.output, /^Not started after the stop: GBPUSD\.$/m);
    assert.ok(!result.urls.some((url) => url.searchParams.get("symbol") === "GBPUSD"), "the calendar's fact is learned once");
    assert.ok(readFileSync(other.file, "utf8").length > 0);
    assert.equal(readFileSync(eur.file, "utf8"), before);
  });

  it("does not judge the clock from less than a day of history", async () => {
    // A file that has not yet held a day's minutes has not seen its session,
    // so new times of day are expected, not evidence.
    const state = tempState();
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const thirty = (date: string) =>
      Array.from({ length: 30 }, (_, i) => bar(`${date} 00:${String(i).padStart(2, "0")}:00`));
    const result = await recover({ provider: (_symbol, date) => new Response(JSON.stringify(thirty(date))), state });
    assert.equal(result.code, 0, result.output);
    assert.equal(lines(eur.file).length, 1 + 90);
  });

  it("buys a malformed answer once, never on the retry ladder", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const provider: Provider = (_symbol, date) =>
      new Response(date === "2026-09-04" ? JSON.stringify({ note: "not bars" }) : JSON.stringify(day(date)));
    const result = await recover({ provider, state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.filter((url) => url.searchParams.get("from") === "2026-09-04").length, 1);
    assert.match(result.output, /EURUSD 2026-09-04: the answer was not a list of bars/);
    assert.match(result.output, /not recovered: 2026-09-04/);
  });
});

describe("recover-minute-bank stops on a wall and keeps what it paid for", () => {
  it("stops at the class's share of the day, appending the minutes already bought", async () => {
    const state = tempState();
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const body = Buffer.byteLength(JSON.stringify(day("2026-09-03")));
    // Room for less than one answer: the first crosses the class's share.
    recordUsage({ atMs: AT, bytes: 256 * MIB - Math.floor(body / 2), consumer: "adhoc", label: "earlier" }, state);
    const result = await recover({ state });
    assert.equal(result.code, 1);
    assert.match(result.output, /crossed its share of the UTC day/);
    assert.match(result.output, /^fmpStandDown: kind=dailyCeiling source=governor$/m);
    assert.equal(result.urls.length, 1, "no request after the crossing");
    assert.deepEqual(lines(eur.file).slice(1).map((b) => b.date), [
      "2026-09-03 00:00:00",
      "2026-09-03 00:01:00",
      "2026-09-03 00:02:00",
    ]);
  });

  it("stops on a bandwidth wall at the first answer, records it on the breaker, and names it", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    bank(state, "BTCUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({
      argv: [...WINDOW, "--concurrency", "1"],
      provider: () => new Response(BODIES.bandwidth, { status: 429 }),
      state,
    });
    assert.equal(result.code, 1);
    assert.equal(result.urls.length, 1, "a wall no retry clears is not retried, nor asked again");
    assert.match(result.output, /^fmpStandDown: kind=bandwidth source=provider$/m);
    const breaker = readBreaker(AT, state);
    assert.ok(breaker.ok);
    assert.ok(breaker.entries.some((entry) => entry.open && entry.kind === "bandwidth"));
  });

  it("asks a settled 404 once, misses that day and goes on", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const provider: Provider = (_symbol, date) =>
      date === "2026-09-04" ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(day(date)));
    const result = await recover({ provider, state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.filter((url) => url.searchParams.get("from") === "2026-09-04").length, 1);
    assert.match(result.output, /EURUSD\tfetched 6\tappended 6\tdropped 0\tnot recovered: 2026-09-04/);
    assert.doesNotMatch(result.output, /fmpStandDown/);
  });

  it("retries a transient failure, then names the day it could not recover and goes on", async () => {
    const state = tempState();
    const eur = bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const provider: Provider = (_symbol, date) =>
      date === "2026-09-04" ? new Response("upstream", { status: 502 }) : new Response(JSON.stringify(day(date)));
    const result = await recover({ provider, state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.filter((url) => url.searchParams.get("from") === "2026-09-04").length, 5);
    assert.match(result.output, /EURUSD\tfetched 6\tappended 6\tdropped 0\tnot recovered: 2026-09-04/);
    assert.deepEqual(
      [...new Set(lines(eur.file).slice(1).map((b) => b.date.slice(0, 10)))],
      ["2026-09-03", "2026-09-05"],
    );
  });
});

describe("the retry ladder never retries a spend refusal", () => {
  // The probe gate refuses inside the retried unit. Its refusals carry no
  // HTTP status, and a ladder that reads "no status" as the network retried
  // them five times before anything could stop the run.
  it("reads every spend refusal as final, by its base class", async () => {
    for (const error of [new ProbeLostError("bandwidth", "another consumer claimed the probe"), new LedgerUnreadableError("unreadable")]) {
      assert.equal(isRetryable(error), false, error.name);
      let attempts = 0;
      await assert.rejects(
        withRetry(
          () => {
            attempts += 1;
            return Promise.reject(error);
          },
          { attempts: 5, baseDelayMs: 1, sleep: () => Promise.resolve() },
        ),
        error,
      );
      assert.equal(attempts, 1, error.name);
    }
    assert.equal(isRetryable(new Error("fetch failed")), true, "the network is still retried");
  });

  it("names every symbol a stop left unstarted", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    bank(state, "BTCUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({ provider: () => new Response(BODIES.bandwidth, { status: 429 }), state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.length, 1, "the scout alone meets the wall");
    assert.match(result.output, /^Not started after the stop: EURUSD\.$/m);
  });
});

describe("the first symbol that asks is the scout", () => {
  it("stands the run down when the scout asked and got no bars, whatever the reason", async () => {
    // A 200 with a body that is not bars, on every day: the pool would buy the
    // same answer for every symbol to learn the same fact.
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    bank(state, "BTCUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({ provider: () => new Response(JSON.stringify({ note: "not bars" })), state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.length, 3, "the scout's three days only");
    assert.match(result.output, /the scout BTCUSD asked 3 dated question\(s\) and got no usable bars back \(0 fetched, 0 dropped\); standing down/);
    assert.match(result.output, /^Not started after the stop: EURUSD\.$/m);
  });

  it("stands the run down on an empty answer too, and exits 1", async () => {
    // A 200 of [] throws nothing: the scout misses no day and still brings
    // nothing back, which is the answer a narrowed dated depth would give.
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    bank(state, "BTCUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({ provider: () => new Response("[]"), state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.length, 3, "the scout's three days only");
    assert.match(result.output, /the scout BTCUSD asked 3 dated question\(s\) and got no usable bars back/);
    assert.match(result.output, /^Not started after the stop: EURUSD\.$/m);
  });

  it("stands the run down when the scout's bars all fall outside the asked days", async () => {
    // The provider no longer honours from/to: every bar is bought and dropped.
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    bank(state, "BTCUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({ provider: () => new Response(JSON.stringify(day("2026-09-20"))), state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.length, 3, "the scout's three days only");
    assert.match(result.output, /got no usable bars back \(9 fetched, 9 dropped\)/);
    assert.match(result.output, /^Not started after the stop: EURUSD\.$/m);
  });

  it("stands the run down on a date shape the endpoint serves every symbol", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    bank(state, "BTCUSD", ["2026-08-06 00:00:00"]);
    const provider: Provider = (_symbol, date) => new Response(JSON.stringify([bar(`${date}T00:03:00`), ...day(date)]));
    const result = await recover({ provider, state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.length, 3, "the scout's three days only");
    assert.match(result.output, /the endpoint answers this way for every symbol, so the run stands down/);
    assert.match(result.output, /^Not started after the stop: EURUSD\.$/m);
  });

  it("refuses a checkout that holds no bank file at all", async () => {
    const state = tempState();
    mkdirSync(state.canonicalBankDir, { recursive: true });
    const result = await recover({ state });
    assert.equal(result.code, 1);
    assert.match(result.output, /no roster symbol has a bank file under .*; this checkout holds no minute bank/);
    assert.equal(result.urls.length, 0);
  });

  it("fails a run whose refusal bookkeeping could not be written", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    chmodSync(state.usageDir, 0o500);
    try {
      const result = await recover({ provider: () => new Response("{}", { status: 404 }), state });
      assert.equal(result.code, 1);
      assert.match(result.output, /refusal bookkeeping write\(s\) failed this run; the ledger or the breaker is short/);
    } finally {
      chmodSync(state.usageDir, 0o700);
    }
  });

  it("counts refusal bodies in the bytes it reports", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const provider: Provider = (_symbol, date) =>
      date === "2026-09-04" ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(day(date)));
    const result = await recover({ provider, state });
    const body = Buffer.byteLength(JSON.stringify(day("2026-09-03")));
    assert.match(result.output, new RegExp(`${body * 2 + 2} bytes to the ad-hoc class \\(2 of them refusal bodies\\)`));
  });

  it("scouts with the first symbol that asks a question, not the first by name", async () => {
    const state = tempState();
    bank(state, "BTCUSD", ["2026-09-12 00:00:00"]);
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    bank(state, "GBPUSD", ["2026-08-06 00:00:00"]);
    const result = await recover({ provider: () => new Response(BODIES.bandwidth, { status: 429 }), state });
    assert.equal(result.code, 1);
    assert.deepEqual(result.urls.map((url) => url.searchParams.get("symbol")), ["EURUSD"], "one request, from a symbol that asks");
    assert.match(result.output, /^Not started after the stop: GBPUSD\.$/m);
    assert.match(result.output, /holding the bank lock .*\.lock: the scheduled bank and its backup wait for it \(900 s by default\)/);
  });
});

describe("the lock is the bank's own", () => {
  it("makes the bank's shell lock wait while a recovery holds it", () => {
    // bank-lock.sh derives the lock from the bank directory. Were this taken
    // anywhere else, the scheduled bank and the backup would walk past it.
    const state = tempState();
    mkdirSync(state.canonicalBankDir, { recursive: true });
    const held = acquireBankLock(state.canonicalBankDir);
    assert.ok("release" in held, "refused" in held ? held.refused : "");
    try {
      // By absolute path, and the helper's own words before the exit status:
      // bash that cannot find the file also exits non-zero.
      const helper = resolve("scripts/ops/bank-lock.sh");
      assert.ok(existsSync(helper), helper);
      const shell = spawnSync("/bin/bash", ["-c", `. "$1" && acquire_bank_lock "$2"`, "_", helper, state.canonicalBankDir], {
        encoding: "utf8",
        env: { ...process.env, LEVELFLOW_BANK_LOCK_TIMEOUT: "0" },
      });
      assert.match(`${shell.stdout}${shell.stderr}`, new RegExp(`could not acquire the bank lock .* \\(held by pid ${process.pid}\\)`));
      assert.notEqual(shell.status, 0, `${shell.stdout}${shell.stderr}`);
    } finally {
      held.release();
    }
    assert.deepEqual(readdirSync(join(state.canonicalBankDir, "..")).filter((name) => name.endsWith(".lock")), []);
  });
});
