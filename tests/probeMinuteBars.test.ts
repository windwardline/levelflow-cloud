import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { openCircuit } from "../scripts/fmpCircuit.ts";
import { readDay, recordUsage } from "../scripts/fmpGovernor.ts";
import type { FmpStatePaths } from "../scripts/fmpState.ts";
import { runProbe } from "../scripts/probe-minute-bars.ts";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";
import { BODIES, tempState } from "./fixtures/fmpTestState.ts";
import { scratchDir } from "./support/scratchDir.ts";

/**
 * One dated 1-minute question per run, through the governor.
 *
 * The probe used to loop the whole master list with undated requests and no
 * ledger entry, and the 2026-09-14 hand probes ran outside any ledger at all.
 * Whether a DATED request reaches deeper than the ~3 days an undated one
 * returns has never been measured; this is the governed way to ask it.
 */

const AT = Date.parse("2026-09-16T12:00:00Z");
const SYMBOL = "EURUSD";
const DATED = ["--symbol", SYMBOL, "--from", "2026-09-10", "--to", "2026-09-11"];
const BARS = JSON.stringify([
  { close: 1, date: "2026-09-11 09:31:00", high: 1, low: 1, open: 1 },
  { close: 1, date: "2026-09-11 09:30:00", high: 1, low: 1, open: 1 },
  { close: 1, date: "2026-09-10 16:00:00", high: 1, low: 1, open: 1 },
  { close: 1, date: "2026-09-10 15:59:00", high: 1, low: 1, open: 1 },
  { close: 1, date: "2026-09-10 15:58:00", high: 1, low: 1, open: 1 },
]);

async function probe(options: { argv?: string[]; respond?: () => Response; state?: FmpStatePaths } = {}) {
  const state = options.state ?? tempState();
  const urls: URL[] = [];
  const lines: string[] = [];
  const code = await runProbe({
    argv: options.argv ?? DATED,
    fetch: (input) => {
      urls.push(new URL(String(input)));
      return Promise.resolve((options.respond ?? (() => new Response(BARS)))());
    },
    key: "test-key",
    now: () => AT,
    print: { err: (line) => lines.push(line), out: (line) => lines.push(line) },
    state,
  });
  return { code, output: lines.join("\n"), state, urls };
}

describe("probe-minute-bars asks one dated question", () => {
  it("probes a roster symbol", () => {
    assert.ok(MASTER_LIST_ROWS.some((row) => row.fmpSymbol === SYMBOL));
  });

  it("issues exactly one request carrying the symbol and both dates", async () => {
    const result = await probe();
    assert.equal(result.code, 0, result.output);
    assert.equal(result.urls.length, 1);
    const [url] = result.urls;
    assert.equal(url.pathname, "/stable/historical-chart/1min");
    assert.equal(url.searchParams.get("symbol"), SYMBOL);
    assert.equal(url.searchParams.get("from"), "2026-09-10");
    assert.equal(url.searchParams.get("to"), "2026-09-11");
  });

  it("prints what the provider actually returned and bills it to the ad-hoc class", async () => {
    const result = await probe();
    assert.match(result.output, /5 bars/);
    assert.match(result.output, /first 2026-09-10 15:58:00/);
    assert.match(result.output, /last 2026-09-11 09:31:00/);
    assert.match(result.output, /2026-09-10: 3/);
    assert.match(result.output, /2026-09-11: 2/);
    const day = readDay(AT, result.state);
    assert.ok(day.ok);
    assert.equal(day.day.adhoc, Buffer.byteLength(BARS));
  });

  it("writes the answer to --json when asked", async () => {
    const out = join(scratchDir("probe-json-"), "probe.json");
    const result = await probe({ argv: [...DATED, "--json", out] });
    assert.equal(result.code, 0);
    const written = JSON.parse(readFileSync(out, "utf8")) as { bars: number; dates: Record<string, number> };
    assert.equal(written.bars, 5);
    assert.deepEqual(written.dates, { "2026-09-10": 3, "2026-09-11": 2 });
  });

  it("reports an empty answer as an answer", async () => {
    const result = await probe({ respond: () => new Response("[]") });
    assert.equal(result.code, 0);
    assert.match(result.output, /0 bars returned for 2026-09-10\.\.2026-09-11/);
  });
});

describe("probe-minute-bars refuses red", () => {
  it("does not ask through an open breaker", async () => {
    const state = tempState();
    openCircuit({ atMs: AT - 60_000, consumer: "bank", endpointPath: "/stable/historical-chart/1min", kind: "entitlement", reason: BODIES.restricted }, state);
    const result = await probe({ state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.length, 0);
    assert.match(result.output, /fmpStandDown: kind=entitlement source=breaker/);
  });

  it("does not ask when the ad-hoc class's day is spent", async () => {
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 256 * 1024 * 1024, consumer: "adhoc", label: "seeded" }, state);
    const result = await probe({ state });
    assert.equal(result.code, 1);
    assert.equal(result.urls.length, 0);
  });

  // The dated-depth question is scarce by design. An answer whose bytes cross
  // the ad-hoc class's day is still an answer that was bought, so it is printed
  // and written first, and the run then exits red on the crossing.
  it("prints and writes an answer that crossed the class's day before exiting red on it", async () => {
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 256 * 1024 * 1024 - 100, consumer: "adhoc", label: "seeded" }, state);
    const out = join(scratchDir("probe-json-"), "probe.json");
    const result = await probe({ argv: [...DATED, "--json", out], state });
    assert.equal(result.code, 1, result.output);
    assert.equal(result.urls.length, 1);
    const answerAt = result.output.indexOf(`5 bars for ${SYMBOL} 2026-09-10..2026-09-11`);
    const tokenAt = result.output.indexOf("fmpStandDown: kind=dailyCeiling source=governor");
    assert.ok(answerAt >= 0, result.output);
    assert.ok(tokenAt > answerAt, result.output);
    assert.equal((JSON.parse(readFileSync(out, "utf8")) as { bars: number }).bars, 5);
    const day = readDay(AT, state);
    assert.ok(day.ok);
    assert.equal(day.day.adhoc, 256 * 1024 * 1024 - 100 + Buffer.byteLength(BARS));
  });

  it("records a refusal on the breaker and exits 1", async () => {
    const result = await probe({ respond: () => new Response(BODIES.restricted.slice(9), { status: 402 }) });
    assert.equal(result.code, 1);
    assert.match(result.output, /fmpStandDown: kind=entitlement source=provider/);
    const events = readdirSync(result.state.breakerDir).flatMap((name) =>
      readFileSync(join(result.state.breakerDir, name), "utf8").split("\n").filter((line) => line.includes('"refused"'))
    );
    assert.equal(events.length, 1);
  });

  it("refuses every malformed question before any request", async () => {
    const refusals: Array<[string[], RegExp]> = [
      [["--from", "2026-09-10", "--to", "2026-09-11"], /--symbol/],
      [["--symbol", "NOTASYMBOL", "--from", "2026-09-10", "--to", "2026-09-11"], /NOTASYMBOL/],
      [["--symbol", SYMBOL], /--from/],
      [["--symbol", SYMBOL, "--to", "2026-09-11"], /--from/],
      [["--symbol", SYMBOL, "--from", "2026-09-10"], /--to/],
      [["--symbol", SYMBOL, "--from", "2026-02-30", "--to", "2026-03-01"], /2026-02-30/],
      [["--symbol", SYMBOL, "--from", "09/10/2026", "--to", "2026-09-11"], /09\/10\/2026/],
      [["--symbol", SYMBOL, "--from", "2026-09-12", "--to", "2026-09-11"], /after/],
      [["--symbol", SYMBOL, "--from", "2026-09-01", "--to", "2026-09-08"], /7 dates/],
      [["--symbol", SYMBOL, "--from", "--to", "2026-09-11"], /--from/],
    ];
    for (const [argv, message] of refusals) {
      const result = await probe({ argv });
      assert.equal(result.code, 1, argv.join(" "));
      assert.equal(result.urls.length, 0, argv.join(" "));
      assert.match(result.output, message, argv.join(" "));
      assert.equal(existsSync(result.state.breakerDir), false);
    }
  });
});
