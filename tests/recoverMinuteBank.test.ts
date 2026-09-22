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

const clockOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
/** Every minute of a 24-hour market's day. */
const wholeDay = (date: string) => Array.from({ length: 1440 }, (_, m) => `${date} ${clockOf(m)}`);
/** A US equity session, 09:30-15:59. */
const sessionOf = (date: string) => Array.from({ length: 390 }, (_, i) => `${date} ${clockOf(9 * 60 + 30 + i)}`);
const minuteOf = (key: string) => Date.parse(`${key.replace(" ", "T")}Z`) / 60_000;
/** The key `minutes` later. */
const later = (key: string, minutes: number) =>
  new Date((minuteOf(key) + minutes) * 60_000).toISOString().replace("T", " ").slice(0, 19);
/** A close that repeats only every 10,007 minutes, so no offset within a day matches it by chance. */
const varying = (key: string) => 100 + ((minuteOf(key) * 7919) % 10_007) / 100;

function bank(
  state: FmpStatePaths,
  symbol: string,
  dates: string[],
  options: { torn?: boolean; price?: (date: string) => number } = {},
) {
  mkdirSync(state.canonicalBankDir, { recursive: true });
  const file = join(state.canonicalBankDir, `${encodeURIComponent(symbol)}.jsonl`);
  const body = dates.map((date) => JSON.stringify(bar(date, options.price?.(date) ?? 1))).join("\n");
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

/** Answers `keys(date)` at `price`, with the clock moved `shift` minutes: the close of t is keyed t+shift. */
const answering =
  (keys: (date: string) => string[], price: (key: string) => number, shift = 0): Provider =>
  (_symbol, date) =>
    new Response(JSON.stringify(keys(date).map((key) => bar(key, price(later(key, -shift))))));

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
    ["a mistyped --dry-run", [...WINDOW, "--dryrun"], /recover-minute-bank: unknown flag --dryrun/],
    ["a stray value", [...WINDOW, "2026-09-06"], /recover-minute-bank: stray argument "2026-09-06"/],
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
    // It held one minute of 2026-09-03, and the answer agreed with it.
    assert.deepEqual(after.runs.at(-1).note, "recovered 2026-09-03..2026-09-05; 0 of 1 held minutes came back revised");
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

describe("recover-minute-bank keeps a revised history and refuses a moved clock", () => {
  // FMP revises minutes after the bank takes them live. Against a dated probe
  // of 2026-09-03, ^GSPC came back revised at 164 of 389 held minutes and
  // AAVEUSD at 114 of 1,159, and neither matched better at any other offset.
  // A revised minute is reported and never rewritten; a moved clock is an
  // offset at which the held minutes match the answer better than where they
  // are keyed.

  it("appends a history revised at 40% of held minutes, in a block, and reports it", async () => {
    // ^GSPC's shape: a session market, agreement until 11:00, then a
    // structured share of minutes revised by about 1e-5.
    const state = tempState();
    const revisedAt = (key: string) => {
      const m = Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16));
      return key.startsWith("2026-09-03") && m >= 11 * 60 && (m - 11 * 60) % 15 < 8;
    };
    const held = [
      ...["2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"].flatMap(sessionOf),
      ...sessionOf("2026-09-03").slice(0, 360),
    ];
    const spx = bank(state, "^GSPC", held, { price: (key) => (revisedAt(key) ? varying(key) * (1 + 1e-5) : varying(key)) });
    const before = readFileSync(spx.file, "utf8");
    const result = await recover({ provider: answering(sessionOf, varying), state });
    assert.equal(result.code, 0, result.output);
    assert.match(
      result.output,
      /^\^GSPC\tfetched 1170\tappended 810\tdropped 0\t144 of 360 held minutes came back revised, median relative close difference 1\.00e-5$/m,
    );
    const after = readFileSync(spx.file, "utf8");
    assert.ok(after.startsWith(before), "a revised minute is never rewritten");
    assert.equal(lines(spx.file).length, held.length + 810, "only the missing minutes are appended");
    assert.equal(
      JSON.parse(readFileSync(spx.sidecar, "utf8")).runs.at(-1).note,
      "recovered 2026-09-03..2026-09-05; 144 of 360 held minutes came back revised",
    );
  });

  // New York against UTC is 240 or 300 minutes; the reach is a day either side.
  for (const [shift, span, pairs] of [
    [1, "1 minute later", 720],
    [60, "60 minutes later", 720],
    [-60, "60 minutes earlier", 660],
    [240, "240 minutes later", 720],
    [300, "300 minutes later", 720],
    [-300, "300 minutes earlier", 420],
    [600, "600 minutes later", 720],
  ] as const) {
    it(`refuses a clock moved ${shift > 0 ? "+" : ""}${shift} minutes on a partly held day, and goes on`, async () => {
      // A 24-hour file holds every time of day, so only the prices can say
      // the clock moved. One such file is its own; the run goes on.
      const state = tempState();
      const eur = bank(state, "EURUSD", [...wholeDay("2026-08-06"), ...wholeDay("2026-09-03").slice(0, 720)], { price: varying });
      const gbp = bank(state, "GBPUSD", ["2026-08-06 00:00:00"]);
      const before = readFileSync(eur.file, "utf8");
      const moved = answering(wholeDay, varying, shift);
      const result = await recover({ provider: (symbol, date) => (symbol === "EURUSD" ? moved(symbol, date) : served(symbol, date)), state });
      assert.equal(result.code, 1);
      assert.match(
        result.output,
        new RegExp(
          `EURUSD: ${pairs} of ${pairs} minutes the file holds match the answer ${span}, more than the 0 of 720 that match at the same minute; ` +
            `the keys no longer name the same minutes, so nothing was appended \\(4320 bars were bought\\)`,
        ),
      );
      assert.match(result.output, /^EURUSD\tfetched 4320\tappended 0\tdropped 0\trefused$/m, "a moved clock is not reported as revisions");
      assert.equal(readFileSync(eur.file, "utf8"), before);
      assert.doesNotMatch(result.output, /stands down|Not started after the stop/);
      assert.equal(lines(gbp.file).length, 1 + 9);
    });
  }

  it("appends a 24-hour history revised at 40% of held minutes, with a day of offsets scanned", async () => {
    // The shape of the ^GSPC case on a file that holds every time of day, so
    // every offset out to a day finds pairs on the answer's other days.
    const state = tempState();
    const revisedAt = (key: string) => {
      const m = Number(key.slice(11, 13)) * 60 + Number(key.slice(14, 16));
      return key.startsWith("2026-09-03") && m >= 4 * 60 && (m - 4 * 60) % 15 < 9;
    };
    const held = [...wholeDay("2026-08-06"), ...wholeDay("2026-09-03").slice(0, 720)];
    const eur = bank(state, "EURUSD", held, { price: (key) => (revisedAt(key) ? varying(key) * (1 + 1e-5) : varying(key)) });
    const before = readFileSync(eur.file, "utf8");
    const result = await recover({ provider: answering(wholeDay, varying), state });
    assert.equal(result.code, 0, result.output);
    assert.match(
      result.output,
      /^EURUSD\tfetched 4320\tappended 3600\tdropped 0\t288 of 720 held minutes came back revised, median relative close difference 1\.00e-5$/m,
    );
    assert.ok(readFileSync(eur.file, "utf8").startsWith(before));
  });

  describe("a price that repeats, as AAVEUSD's does", () => {
    // A walk that holds its price 70% of minutes, so neighbouring minutes
    // agree by chance. 113 of the 1,159 held minutes of 2026-09-03 are
    // revised, in 00:00-06:59 and 14:00-18:59, nine of them to the minute
    // before's close, as 9 of AAVEUSD's 114 were.
    const keys = [...wholeDay("2026-09-03"), ...wholeDay("2026-09-04"), ...wholeDay("2026-09-05")];
    const walk = new Map<string, number>();
    let seed = 7;
    let price = 250;
    for (const key of [...wholeDay("2026-08-06"), ...keys]) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      if (seed / 2147483648 >= 0.7) price = Math.round((price + (seed % 2 === 0 ? 0.01 : -0.01)) * 100) / 100;
      walk.set(key, price);
    }
    const repeats = (key: string) => walk.get(key)!;
    const heldKeys = [...wholeDay("2026-08-06"), ...wholeDay("2026-09-03").slice(0, 1159)];
    const revisedClose = new Map<string, number>();
    for (const [m, key] of wholeDay("2026-09-03").slice(0, 1159).entries()) {
      if (!((m < 7 * 60 && m % 8 === 0) || (m >= 14 * 60 && m < 19 * 60 && m % 5 === 0))) continue;
      const previous = walk.get(later(key, -1));
      const neighbour = revisedClose.size < 9 && m > 0 && previous !== repeats(key);
      revisedClose.set(key, neighbour ? previous! : repeats(key) * (1 + 1e-7));
    }
    const heldPrice = (key: string) => revisedClose.get(key) ?? repeats(key);

    it("appends it: chance agreement at a neighbouring minute does not beat offset 0", async () => {
      const state = tempState();
      const aave = bank(state, "AAVEUSD", heldKeys, { price: heldPrice });
      const before = readFileSync(aave.file, "utf8");
      const result = await recover({ provider: answering(wholeDay, repeats), state });
      assert.equal(result.code, 0, result.output);
      assert.equal(revisedClose.size, 113);
      assert.match(
        result.output,
        /^AAVEUSD\tfetched 4320\tappended 3161\tdropped 0\t113 of 1159 held minutes came back revised, median relative close difference 1\.00e-7$/m,
      );
      assert.ok(readFileSync(aave.file, "utf8").startsWith(before));
    });

    it("refuses it when the same series comes back a minute late", async () => {
      const state = tempState();
      const aave = bank(state, "AAVEUSD", heldKeys, { price: heldPrice });
      const before = readFileSync(aave.file, "utf8");
      const result = await recover({ provider: answering(wholeDay, repeats, 1), state });
      assert.equal(result.code, 1);
      assert.match(result.output, /AAVEUSD: 1046 of 1159 minutes the file holds match the answer 1 minute later, more than the \d+ of 1159/);
      assert.equal(readFileSync(aave.file, "utf8"), before);
    });
  });

  it("does not judge a day whose same-key pairs fall below the floor, whatever a neighbouring day matches", async () => {
    // The held minutes sit on a day whose fetch failed, so none pairs with its
    // own key; at a whole day's offset they pair with the next day's answer,
    // which repeats each time of day's price. That is no evidence of a clock.
    const state = tempState();
    const daily = (key: string) => 100 + (minuteOf(key) % 1440) / 100;
    const held = [...wholeDay("2026-08-06"), ...wholeDay("2026-09-03").slice(0, 720)];
    const eur = bank(state, "EURUSD", held, { price: daily });
    const answered = answering(wholeDay, daily);
    const provider: Provider = (symbol, date) =>
      date === "2026-09-03" ? new Response("{}", { status: 404 }) : answered(symbol, date);
    const result = await recover({ provider, state });
    assert.doesNotMatch(result.output, /match the answer/);
    assert.match(result.output, /^EURUSD\tfetched 2880\tappended 2880\tdropped 0\tshift test unjudged: 0 same-key pairs, below the 60 it needs\tnot recovered: 2026-09-03$/m);
    assert.equal(lines(eur.file).length, held.length + 2880);
  });

  it("does not judge the prices from fewer pairs than the floor", async () => {
    // Five held minutes of a flat price, the first three revised: a shift of
    // three minutes slides the revision off the edge and matches all five,
    // which is a coincidence of the edge, not a clock.
    const state = tempState();
    const held = ["2026-08-06 00:00:00", ...wholeDay("2026-09-03").slice(0, 5)];
    const eur = bank(state, "EURUSD", held);
    const provider: Provider = (_symbol, date) =>
      new Response(JSON.stringify(wholeDay(date).slice(0, 30).map((key, m) => bar(key, date === "2026-09-03" && m < 3 ? 1.00001 : 1))));
    const result = await recover({ provider, state });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /^EURUSD\tfetched 90\tappended 85\tdropped 0\t3 of 5 held minutes came back revised, median relative close difference 1\.00e-5\tshift test unjudged: 5 same-key pairs, below the 60 it needs$/m);
    assert.equal(lines(eur.file).length, held.length + 85);
  });

  it("appends a history revised at every minute that no offset explains better", async () => {
    // A constant 2 against a held constant 1: every held minute is revised,
    // and every offset matches none of them, so nothing says the clock moved.
    const state = tempState();
    const eur = bank(state, "EURUSD", [...wholeDay("2026-08-06"), ...wholeDay("2026-09-03").slice(0, 720)]);
    const before = readFileSync(eur.file, "utf8");
    const result = await recover({ provider: answering(wholeDay, () => 2), state });
    assert.equal(result.code, 0, result.output);
    assert.match(
      result.output,
      /^EURUSD\tfetched 4320\tappended 3600\tdropped 0\t720 of 720 held minutes came back revised, median relative close difference 1\.00e\+0$/m,
    );
    assert.ok(readFileSync(eur.file, "utf8").startsWith(before));
    assert.ok(lines(eur.file).slice(0, 1440 + 720).every((line) => line.close === 1), "the held closes stay as banked");
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
    const gbp = bank(state, "GBPUSD", session);
    const other = bank(state, "USDJPY", session);
    const result = await recover({
      provider: (_symbol, date) => new Response(JSON.stringify(shifted(date))),
      state,
    });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD: 720 of 1170 new minutes fall at times of day the file has never held/);
    assert.match(result.output, /GBPUSD: 720 of 1170 new minutes fall at times of day the file has never held/);
    assert.match(result.output, /EURUSD, GBPUSD each came back .* so the run stands down: recover each side of a change separately/);
    assert.match(result.output, /^Not started after the stop: USDJPY\.$/m);
    assert.ok(!result.urls.some((url) => url.searchParams.get("symbol") === "USDJPY"), "the calendar's fact is learned from two symbols");
    assert.ok(readFileSync(other.file, "utf8").length > 0);
    assert.equal(readFileSync(eur.file, "utf8"), before);
    assert.equal(readFileSync(gbp.file, "utf8"), before);
  });

  it("refuses one symbol whose clock looks moved, and goes on", async () => {
    // A thin contract's short file has not seen its whole session: on the
    // real bank ZOUSX trips the clock bound on ordinary days. One such file
    // costs its own symbol, not the run.
    const state = tempState();
    const session: string[] = [];
    for (const day of ["2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"]) {
      for (let m = 9 * 60 + 30; m < 16 * 60; m += 1) {
        session.push(`${day} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`);
      }
    }
    bank(state, "EURUSD", session);
    const gbp = bank(state, "GBPUSD", ["2026-08-06 00:00:00"]);
    const shifted = (date: string) =>
      Array.from({ length: 390 }, (_, i) => {
        const m = 13 * 60 + 30 + i;
        return bar(`${date} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`);
      });
    const result = await recover({ provider: (_symbol, date) => new Response(JSON.stringify(shifted(date))), state });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD: 720 of 1170 new minutes fall at times of day the file has never held/);
    assert.doesNotMatch(result.output, /stands down|Not started after the stop/);
    assert.equal(lines(gbp.file).length, 1 + 1170);
  });

  it("stands down on a moved clock that also shifts a partly held day", async () => {
    // The approved window's ends are partial days, so a session served an hour
    // late matches the minutes the file holds an hour on AND lands at times it
    // has never held. The clock is the cause, and it is every symbol's.
    const state = tempState();
    const session = [
      ...["2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"].flatMap(sessionOf),
      ...sessionOf("2026-09-03").slice(0, 210),
    ];
    const eur = bank(state, "EURUSD", session, { price: varying });
    const gbp = bank(state, "GBPUSD", session, { price: varying });
    const other = bank(state, "USDJPY", session, { price: varying });
    const before = readFileSync(eur.file, "utf8");
    const result = await recover({ provider: answering((date) => sessionOf(date).map((key) => later(key, 60)), varying, 60), state });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD: 210 of 210 minutes the file holds match the answer 60 minutes later, more than the 0 of 150 that match at the same minute; the keys no longer name the same minutes; 180 of 1020 new minutes also fall at times of day the file has never held/);
    assert.match(result.output, /EURUSD, GBPUSD each came back .* so the run stands down/);
    assert.match(result.output, /^Not started after the stop: USDJPY\.$/m);
    assert.ok(!result.urls.some((url) => url.searchParams.get("symbol") === "USDJPY"), "two symbols pay, not the roster");
    assert.equal(readFileSync(eur.file, "utf8"), before);
    assert.equal(readFileSync(gbp.file, "utf8"), before);
    assert.ok(readFileSync(other.file, "utf8").length > 0);
  });

  it("stands down when two 24-hour files match better an hour on, whose clock cannot look moved", async () => {
    // Forex and crypto files hold every time of day, so a shifted session
    // lands only on held times; on a partly held day it shows in prices alone.
    const state = tempState();
    const held = [...wholeDay("2026-08-06"), ...wholeDay("2026-09-03").slice(0, 720)];
    for (const symbol of ["EURUSD", "GBPUSD", "USDJPY"]) bank(state, symbol, held, { price: varying });
    const result = await recover({ provider: answering(wholeDay, varying, 60), state });
    assert.equal(result.code, 1);
    assert.match(result.output, /EURUSD: 720 of 720 minutes the file holds match the answer 60 minutes later, more than the 0 of 720 that match at the same minute; the keys no longer name the same minutes, so nothing/);
    assert.match(result.output, /EURUSD, GBPUSD each came back .* so the run stands down/);
    assert.match(result.output, /^Not started after the stop: USDJPY\.$/m);
  });

  describe("a window neither clock bound can judge", () => {
    // A window of wholly missing days gives the price bound no held minute to
    // pair on, and a file holding nearly every time of day gives the clock
    // bound nothing to see: a moved clock there would be appended for good.
    const aDay = (date: string, keep: (minute: number) => boolean) =>
      Array.from({ length: 1440 }, (_, m) => m).filter(keep).map((m) => `${date} ${clockOf(m)}`);
    const everyMinute = () => true;
    const futuresBreak = (m: number) => m < 21 * 60 || m >= 22 * 60; // an hour's daily break
    const session = (m: number) => m >= 9 * 60 + 30 && m < 16 * 60;
    const held = (keep: (minute: number) => boolean) => ["2026-08-06", "2026-08-07"].flatMap((day) => aDay(day, keep));

    for (const [shape, keep] of [["a 24-hour file", everyMinute], ["a futures file with an hour's break", futuresBreak]] as const) {
      it(`refuses ${shape} before asking a byte, and goes on`, async () => {
        const state = tempState();
        const eur = bank(state, "EURUSD", held(keep));
        const gbp = bank(state, "GBPUSD", held(session));
        const before = readFileSync(eur.file, "utf8");
        const result = await recover({ state });
        assert.equal(result.code, 1, "a refused symbol leaves its hole open");
        assert.match(
          result.output,
          /EURUSD: not asked — its window holds 0 minutes, below the 60 the price bound pairs on, and its file \d+ of 1440 times of day/,
        );
        assert.ok(!result.urls.some((url) => url.searchParams.get("symbol") === "EURUSD"), "not a byte for EURUSD");
        assert.equal(readFileSync(eur.file, "utf8"), before);
        // The session file's clock bound can see a shift, so it is asked, and
        // the refused symbol never becomes the scout.
        assert.doesNotMatch(result.output, /stands down|scout/);
        assert.ok(lines(gbp.file).length > held(session).length, "the judgeable symbol was recovered");
      });
    }

    it("says so in a dry run, where it costs nothing", async () => {
      const state = tempState();
      bank(state, "EURUSD", held(everyMinute));
      const result = await recover({ argv: [...WINDOW, "--dry-run"], state });
      assert.match(result.output, /EURUSD: not asked — /);
      assert.match(result.output, /no symbol's clock can be judged in 2026-09-03\.\.2026-09-05/);
      assert.equal(result.urls.length, 0);
    });

    it("asks a 24-hour file whose window holds a partly held day", async () => {
      const state = tempState();
      const eur = bank(state, "EURUSD", [...held(everyMinute), ...aDay("2026-09-03", (m) => m < 120)]);
      const result = await recover({ state });
      assert.equal(result.code, 0, result.output);
      assert.doesNotMatch(result.output, /not asked/);
      assert.ok(lines(eur.file).length > 2 * 1440 + 120);
    });

    it("leaves a file of under a day's minutes as the runbook states: asked, and marked unjudged", async () => {
      const state = tempState();
      const eur = bank(state, "EURUSD", aDay("2026-08-06", (m) => m < 1400));
      const result = await recover({ state });
      assert.doesNotMatch(result.output, /not asked/);
      assert.match(result.output, /^EURUSD\tfetched \d+\tappended \d+\tdropped 0\tshift test unjudged: 0 same-key pairs/m);
      assert.ok(lines(eur.file).length > 1400);
    });
  });

  describe("where the second dispute is met", () => {
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
    const session: string[] = [];
    for (const day of ["2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"]) {
      for (let m = 9 * 60 + 30; m < 16 * 60; m += 1) session.push(`${day} ${hhmm(m)}`);
    }
    const shifted: Provider = (_symbol, date) =>
      new Response(JSON.stringify(Array.from({ length: 390 }, (_, i) => bar(`${date} ${hhmm(13 * 60 + 30 + i)}`))));
    const asked = (urls: URL[]) => [...new Set(urls.map((url) => url.searchParams.get("symbol")))];

    it("does not count an expected clock refusal toward the stand-down", async () => {
      const state = tempState();
      bank(state, "EURUSD", session);
      bank(state, "ZOUSX", session);
      const zr = bank(state, "ZRUSD", ["2026-08-06 00:00:00"]);
      const result = await recover({ provider: shifted, state });
      assert.equal(result.code, 1, "ZOUSX's hole stays open");
      assert.match(result.output, /ZOUSX: an expected clock refusal \(561 distinct times of day/);
      assert.doesNotMatch(result.output, /stands down|Not started after the stop/);
      assert.equal(lines(zr.file).length, 1 + 1170);
    });

    it("settles a disputed scout past an expected refusal, alone", async () => {
      const state = tempState();
      for (const symbol of ["EURUSD", "ZOUSX", "ZRUSD", "ZSUSX", "ZTUSD"]) bank(state, symbol, session);
      const result = await recover({ provider: shifted, state });
      assert.equal(result.code, 1);
      assert.match(result.output, /EURUSD, ZRUSD each came back .* so the run stands down/);
      assert.match(result.output, /^Not started after the stop: ZSUSX, ZTUSD\.$/m);
      assert.deepEqual(asked(result.urls), ["EURUSD", "ZOUSX", "ZRUSD"]);
    });

    it("counts a shifted price from a symbol whose clock refusal is expected", async () => {
      const state = tempState();
      const held = [...wholeDay("2026-08-06"), ...wholeDay("2026-09-03").slice(0, 720)];
      for (const symbol of ["EURUSD", "ZOUSX", "ZRUSD"]) bank(state, symbol, held, { price: varying });
      const result = await recover({ provider: answering(wholeDay, varying, 60), state });
      assert.equal(result.code, 1);
      assert.match(result.output, /ZOUSX: 720 of 720 minutes the file holds match the answer 60 minutes later/);
      assert.match(result.output, /EURUSD, ZOUSX each came back .* so the run stands down/);
      assert.match(result.output, /^Not started after the stop: ZRUSD\.$/m);
    });

    it("settles a disputed scout on an expected symbol that came back clean", async () => {
      // The settling step stops on what the symbol it ran came back with, not
      // on its name: a clean answer from ZOUSX is evidence like any other, so
      // the pool opens, and a dispute met there lets its workers in flight
      // finish.
      const state = tempState();
      const held = [...wholeDay("2026-08-06"), ...wholeDay("2026-09-03").slice(0, 720)];
      for (const symbol of ["EURUSD", "ZOUSX", "ZRUSD", "ZSUSX", "ZTUSD"]) bank(state, symbol, held, { price: varying });
      const moved = answering(wholeDay, varying, 60);
      const clean = answering(wholeDay, varying);
      const result = await recover({
        provider: (symbol, date) => (symbol === "EURUSD" || symbol === "ZRUSD" ? moved : clean)(symbol, date),
        state,
      });
      assert.equal(result.code, 1);
      assert.match(result.output, /^ZOUSX\tfetched 4320\tappended 3600\tdropped 0\t0 of 720 held minutes came back revised$/m);
      assert.match(result.output, /EURUSD, ZRUSD each came back .* so the run stands down/);
      assert.doesNotMatch(result.output, /Not started after the stop/);
      assert.deepEqual(asked(result.urls), ["EURUSD", "ZOUSX", "ZRUSD", "ZSUSX", "ZTUSD"]);
    });

    it("lets the pool's workers in flight finish when the scout was clean", async () => {
      // The bound the runbook states: a dispute first met inside the pool costs
      // up to --concurrency symbols, and no more start.
      const state = tempState();
      bank(state, "AUDCAD", ["2026-08-06 00:00:00"]);
      for (const symbol of ["AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "EURUSD"]) bank(state, symbol, session);
      const result = await recover({ provider: shifted, state });
      assert.equal(result.code, 1);
      assert.match(result.output, /so the run stands down/);
      assert.match(result.output, /^Not started after the stop: EURUSD\.$/m);
      assert.deepEqual(asked(result.urls), ["AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD"]);
    });
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
    assert.match(result.output, /EURUSD\tfetched 6\tappended 6\tdropped 0\tshift test unjudged: 0 same-key pairs, below the 60 it needs\tnot recovered: 2026-09-04/);
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
    assert.match(result.output, /EURUSD\tfetched 6\tappended 6\tdropped 0\tshift test unjudged: 0 same-key pairs, below the 60 it needs\tnot recovered: 2026-09-04/);
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

describe("what a run refuses and reports", () => {
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

  it("refuses a checkout whose every bank file is unreadable, before the governor is asked", async () => {
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"], { torn: true });
    const result = await recover({ state });
    assert.equal(result.code, 1);
    assert.match(result.output, /no bank file under .* could be read whole, so there is nothing to recover into/);
    assert.doesNotMatch(result.output, /Recovered 0 bars/);
    assert.equal(result.urls.length, 0);
  });
});

describe("the lock is the bank's own", () => {
  it("removes the lock when its pid cannot be written, and rethrows", () => {
    // bank-lock.sh reads an absent pid as a holder that has not named itself
    // yet and never breaks it, so a lock left without one would stop every
    // scheduled bank and backup until a person removed it.
    const state = tempState();
    mkdirSync(state.canonicalBankDir, { recursive: true });
    const lock = `${state.canonicalBankDir}.lock`;
    const failure = new Error("ENOSPC: no space left on device, open 'pid'");
    const written: string[] = [];
    assert.throws(
      () =>
        acquireBankLock(state.canonicalBankDir, (file) => {
          written.push(file);
          throw failure;
        }),
      (error) => error === failure,
    );
    assert.deepEqual(written, [join(lock, "pid")]);
    assert.ok(!existsSync(lock), "a half-taken lock was left behind");
    const again = acquireBankLock(state.canonicalBankDir);
    assert.ok("release" in again, "refused" in again ? again.refused : "");
    again.release();
  });

  it("has its signal handlers in place before it takes the lock, and a signal releases it", async () => {
    // Without a handler a signal ends the process where it stands; with one,
    // Node runs it only after the synchronous acquisition has finished.
    const baseline = { SIGINT: process.listeners("SIGINT"), SIGTERM: process.listeners("SIGTERM") };
    const added = (signal: "SIGINT" | "SIGTERM") => process.listeners(signal).filter((listener) => !baseline[signal].includes(listener));

    // Refused: the handlers were registered before the attempt.
    const held = tempState();
    bank(held, "EURUSD", ["2026-08-06 00:00:00"]);
    mkdirSync(`${held.canonicalBankDir}.lock`);
    writeFileSync(join(`${held.canonicalBankDir}.lock`, "pid"), `${process.pid}\n`);
    const atRefusal: number[] = [];
    await runRecover({
      argv: WINDOW,
      fetch: () => Promise.reject(new Error("no request expected")),
      key: "test-key",
      now: () => AT,
      print: {
        err: (line) => {
          if (/is held by pid/.test(line)) atRefusal.push(added("SIGINT").length, added("SIGTERM").length);
        },
        out: () => {},
      },
      sleep: () => Promise.resolve(),
      state: held,
    });
    assert.deepEqual(atRefusal, [1, 1]);
    assert.deepEqual([added("SIGINT").length, added("SIGTERM").length], [0, 0], "the handlers are removed after the run");

    // Taken: a SIGTERM at the notice releases the lock and exits 143.
    const state = tempState();
    bank(state, "EURUSD", ["2026-08-06 00:00:00"]);
    const lock = `${state.canonicalBankDir}.lock`;
    const exits: Array<number | string | null | undefined> = [];
    const seen: boolean[] = [];
    const exit = process.exit;
    process.exit = ((code?: number | string | null) => {
      exits.push(code);
    }) as typeof process.exit;
    try {
      await runRecover({
        argv: WINDOW,
        fetch: (input) => Promise.resolve(served("EURUSD", new URL(String(input)).searchParams.get("from") ?? "")),
        key: "test-key",
        now: () => AT,
        print: {
          err: (line) => {
            if (!line.startsWith("holding the bank lock")) return;
            const handlers = added("SIGTERM");
            seen.push(handlers.length === 1, existsSync(lock));
            (handlers[0] as (signal: NodeJS.Signals) => void)("SIGTERM");
            seen.push(existsSync(lock));
          },
          out: () => {},
        },
        sleep: () => Promise.resolve(),
        state,
      });
    } finally {
      process.exit = exit;
    }
    assert.deepEqual(seen, [true, true, false], "one handler, the lock held, then released by the signal");
    assert.deepEqual(exits, [143]);
  });

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
