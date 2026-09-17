import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  bankableSymbols,
  departedSymbols,
  isRetryable,
  orphanedSidecars,
  planRun,
  runBank,
  usableBar,
  withRetry,
} from "../scripts/bank-minute-bars.ts";
import { openCircuit, readBreaker } from "../scripts/fmpCircuit.ts";
import { readDay, recordUsage } from "../scripts/fmpGovernor.ts";
import type { FmpStatePaths } from "../scripts/fmpState.ts";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";
import { BODIES, INVALID_KEY_BODY_PREFIX, tempState } from "./fixtures/fmpTestState.ts";

// The bank is append-only against a provider window three days wide, so a bar
// banked wrong is banked wrong forever and a bar missed is missed forever.
// These pin the two properties that make it recoverable: the provider's own
// date string survives untouched, and a malformed bar is dropped rather than
// repaired.

describe("minute bank — what gets banked", () => {
  it("covers every master-list row that has an FMP mate, and nothing else", () => {
    const banked = new Set(bankableSymbols().map((entry) => entry.fmpSymbol));
    const expected = new Set(
      MASTER_LIST_ROWS.map((row) => row.fmpSymbol).filter(
        (symbol): symbol is string => Boolean(symbol),
      ),
    );
    assert.deepEqual([...banked].sort(), [...expected].sort());
  });

  it("banks 97 provider symbols", () => {
    // A figure nothing checks goes stale unnoticed: docs/HANDOFF.md carried
    // "100 symbols" for three days after amendment 32 retired ^MID, ^STOXX50E
    // and USDMXN on 2026-08-09, and the bank's own log read 100 then 97 with
    // nothing said. 100 -> 97 (amendment 32, #284). The next amendment fails
    // here and updates HANDOFF in the same change set.
    assert.equal(bankableSymbols().length, 97);
  });

  it("banks one entry per provider symbol, carrying every market it serves", () => {
    // WTI/CLUSD and BRENT/BZUSD already share one FMP series across two
    // account types, so a per-market bank would fetch the same series twice
    // and a per-market key would collide on merge.
    const entries = bankableSymbols();
    const symbols = entries.map((entry) => entry.fmpSymbol);
    assert.equal(new Set(symbols).size, symbols.length);
    const shared = entries.filter((entry) => entry.markets.length > 1);
    assert.ok(
      shared.length > 0,
      "at least one FMP series is expected to serve more than one market",
    );
  });
});

describe("minute bank — a symbol that leaves the roster", () => {
  // A roster change is silent by construction: the run reports the symbols it
  // banked, and a symbol it no longer banks is simply absent from that count.
  // Amendment 32 dropped three (^MID, ^STOXX50E, USDMXN) on 2026-08-09 and the
  // log read 100 -> 97 with nothing said. That is survivable when the change is
  // deliberate and unrecoverable when it is a typo, because the provider window
  // closes in three days. So the run names them instead of counting them.

  it("names a sidecar whose symbol is no longer on the roster", () => {
    const orphans = orphanedSidecars(
      ["%5EMID.state.json", "EURUSD.state.json"],
      ["EURUSD"],
    );
    assert.deepEqual(orphans, ["^MID"]);
  });

  it("decodes the filename before comparing, so an index is not falsely orphaned", () => {
    // Sidecars are named with encodeURIComponent, so every ^-prefixed index
    // lands on disk as %5E.... Comparing raw filenames would report all of
    // them as departed on the first run and teach the operator to ignore it.
    assert.deepEqual(orphanedSidecars(["%5EGDAXI.state.json"], ["^GDAXI"]), []);
  });

  it("reads sidecars only, not the bar files beside them", () => {
    assert.deepEqual(orphanedSidecars(["EURUSD.jsonl"], []), []);
  });

  it("returns nothing when the roster and the store agree", () => {
    assert.deepEqual(
      orphanedSidecars(["EURUSD.state.json"], ["EURUSD", "GBPUSD"]),
      [],
    );
  });

  it("sorts the names, so the reported line is stable run to run", () => {
    assert.deepEqual(
      orphanedSidecars(
        ["USDMXN.state.json", "%5EMID.state.json", "%5ESTOXX50E.state.json"],
        [],
      ),
      ["^MID", "^STOXX50E", "USDMXN"],
    );
  });

  it("still reports when a file it never wrote has a malformed name", () => {
    // readdir returns whatever sits in the directory, including a file rescued
    // from a backup or copied by hand. decodeURIComponent throws URIError on a
    // stray percent, and this report runs in the same function as the
    // exit-code decision — a throw here would silence the escalation that
    // says the provider window is closing.
    assert.deepEqual(orphanedSidecars(["EURUSD 50%.state.json"], []), [
      "EURUSD 50%",
    ]);
  });
});

describe("minute bank — --limit truncates the fetch, never the roster", () => {
  it("banks the whole roster when no limit is given", () => {
    const plan = planRun([]);
    assert.equal(plan.targets.length, plan.roster.length);
  });

  it("measures the store against the whole roster, not the fetch list", async () => {
    // The swap that matters is at the call site: handing the departure check
    // `targets` instead of `roster` reports every unvisited symbol as departed
    // on any --limit run, which is how an operator learns to skip the line.
    // Asserting that targets is roster.slice(0, limit) restates slice and
    // cannot catch it. This gives a store holding the entire roster to a plan
    // that fetches one symbol: nothing has departed, and reaching for
    // `targets` at the call site turns that into all-but-one.
    const dir = await mkdtemp(join(tmpdir(), "minute-bank-roster-"));
    try {
      const plan = planRun(["--limit", "1"]);
      for (const entry of plan.roster) {
        await writeFile(
          join(dir, `${encodeURIComponent(entry.fmpSymbol)}.state.json`),
          "{}",
        );
      }
      assert.equal(plan.targets.length, 1);
      assert.deepEqual(await departedSymbols(dir, plan), []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a --limit it cannot read rather than banking nothing", () => {
    // Number(undefined) is NaN and roster.slice(0, NaN) is empty, so a
    // trailing --limit silently banked nothing and exited 0 — a run that
    // examined nothing reporting the result of one that passed.
    assert.throws(() => planRun(["--limit"]), /--limit/);
    assert.throws(() => planRun(["--limit", "--dir", "/tmp/x"]), /--limit/);
  });

  it("refuses a --limit that would fetch nothing", () => {
    assert.throws(() => planRun(["--limit", "0"]), /--limit/);
    assert.throws(() => planRun(["--limit", "-3"]), /--limit/);
  });

  // #364 round 37, smaller: --concurrency had the same shape one flag
  // over — Number of a missing value is NaN, Math.max(1, NaN) is NaN,
  // and Array.from with a NaN length is an EMPTY worker pool, so
  // nothing was fetched and the zero-fetch escalation blamed the
  // provider window for a mistyped flag no request was made under.
  // Two layers refuse here and the assertions now name which (#364
  // round 52, finding 3): flagReader refuses a missing or flag-shaped
  // token at the read, and planRun's own law refuses a value that
  // parses but is not positive. These matched on the flag NAME alone,
  // which both messages satisfy, so they could not tell the layers
  // apart — and did not notice when one of them stopped running.
  it("refuses a --concurrency it cannot read rather than spawning zero workers", () => {
    assert.throws(
      () => planRun(["--concurrency"]),
      /--concurrency owns the token after it and got no value/,
    );
    assert.throws(
      () => planRun(["--concurrency", "--dir", "/tmp/x"]),
      /--concurrency owns the token after it and got "--dir"/,
    );
    // …and this one is planRun's own: 0 parses fine, and Array.from
    // over zero workers fetches nothing while the zero-fetch
    // escalation blames the provider window.
    assert.throws(
      () => planRun(["--concurrency", "0"]),
      /--concurrency must be a positive number/,
    );
  });

  // #364 round 38, finding 1: the third dial's failure was the worst —
  // "--dir --concurrency 4" banked the full window into a phantom
  // directory named "--concurrency" and EXITED 0 (mkdir creates it,
  // sidecars read fresh, no escalation fires, departedSymbols reads
  // the phantom), while the real store stopped growing inside the
  // 3-day provider window.
  // Closed by flagReader since the round-50 port, not by a guard in
  // this file — the hand-written one was unreachable and is gone.
  it("refuses a --dir it cannot read rather than banking into a phantom store", () => {
    assert.throws(
      () => planRun(["--dir"]),
      /--dir owns the token after it and got no value/,
    );
    assert.throws(
      () => planRun(["--dir", "--concurrency", "4"]),
      /--dir owns the token after it and got "--concurrency"/,
    );
  });
});

describe("minute bank — a bar is banked only if it is whole", () => {
  const whole = {
    date: "2026-08-06 09:30:00",
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 10,
  };

  it("accepts a whole bar", () => {
    assert.equal(usableBar(whole), true);
  });

  it("rejects a bar with no date rather than stamping it with the run time", () => {
    // bars.ts's toTimestamp falls back to Date.now() on an unparseable date.
    // That is survivable in a rolling cache that refetches; in an append-only
    // bank it writes a fabricated timestamp that can never be distinguished
    // from a real one.
    assert.equal(usableBar({ ...whole, date: undefined }), false);
    assert.equal(usableBar({ ...whole, date: "" }), false);
  });

  it("rejects a bar with a missing or non-finite price", () => {
    for (const field of ["open", "high", "low", "close"] as const) {
      assert.equal(usableBar({ ...whole, [field]: undefined }), false, field);
      assert.equal(usableBar({ ...whole, [field]: Number.NaN }), false, field);
    }
  });

  it("accepts a bar with no volume, because indices report none", () => {
    // ^GSPC and its siblings return volume 0 or omit it; that is not a defect.
    assert.equal(usableBar({ ...whole, volume: undefined }), true);
  });
});

// On 2026-08-08 the 07:20 job fired as a catch-up on wake and all 100 symbols
// failed within six seconds with undici's "fetch failed" — the machine's network
// was not up yet. Nothing was lost only because a human ran it by hand. launchd
// catching up on wake is the property that makes the 3-day window survivable, so
// the race it creates has to be absorbed here rather than designed away.

describe("minute bank — which failures are worth retrying", () => {
  it("retries a transport failure, which is what a run at wake hits", () => {
    // undici throws TypeError("fetch failed") for DNS, TLS and connection
    // errors alike: no status, because nothing answered.
    assert.equal(isRetryable(new TypeError("fetch failed")), true);
  });

  it("retries a rate limit and a server error", () => {
    assert.equal(isRetryable(new Error("HTTP 429")), true);
    assert.equal(isRetryable(new Error("HTTP 500")), true);
    assert.equal(isRetryable(new Error("HTTP 503")), true);
  });

  it("does not retry a rejected key, which would cost 400 requests to learn twice", () => {
    // 100 symbols against a metered quota. A bad key is settled on the first
    // answer; retrying it turns one broken run into four.
    assert.equal(isRetryable(new Error("HTTP 401")), false);
    assert.equal(isRetryable(new Error("HTTP 403")), false);
    assert.equal(isRetryable(new Error("HTTP 404")), false);
  });

  it("reads the status even when the provider's body follows it", () => {
    // Since #493 the bank throws the body after the status. The old
    // `/^HTTP (\d{3})$/` then matched nothing, so a suspension and a rejected
    // key both read as "no status" and were retried five times each.
    assert.equal(isRetryable(new Error(BODIES.suspended)), false);
    assert.equal(isRetryable(new Error(`HTTP 401 ${INVALID_KEY_BODY_PREFIX}`)), false);
    assert.equal(isRetryable(new Error(BODIES.restricted)), false);
    assert.equal(isRetryable(new Error('HTTP 429 {"Error Message": "slow down"}')), true);
    assert.equal(isRetryable(new Error("HTTP 503 <html>unavailable</html>")), true);
    assert.equal(isRetryable(new Error("HTTP 429")), true);
    assert.equal(isRetryable(new TypeError("fetch failed")), true);
  });
});

describe("minute bank — retrying a fetch", () => {
  /** Records what the caller would have slept instead of sleeping. */
  function recorder() {
    const delays: number[] = [];
    return {
      delays,
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    };
  }

  it("returns the first success without sleeping", async () => {
    const { delays, sleep } = recorder();
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        return "bars";
      },
      { attempts: 4, baseDelayMs: 1000, sleep },
    );
    assert.equal(result, "bars");
    assert.equal(calls, 1);
    assert.deepEqual(delays, []);
  });

  it("recovers when the network arrives late", async () => {
    const { sleep } = recorder();
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new TypeError("fetch failed");
        }
        return "bars";
      },
      { attempts: 4, baseDelayMs: 1000, sleep },
    );
    assert.equal(result, "bars");
    assert.equal(calls, 3);
  });

  it("backs off exponentially so a long wake is still covered", async () => {
    const { delays, sleep } = recorder();
    await assert.rejects(
      withRetry(
        async () => {
          throw new TypeError("fetch failed");
        },
        { attempts: 4, baseDelayMs: 1000, sleep },
      ),
    );
    assert.deepEqual(delays, [1000, 2000, 4000]);
  });

  it("gives up after the last attempt and throws what the provider said", async () => {
    const { delays, sleep } = recorder();
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw new TypeError("fetch failed");
        },
        { attempts: 3, baseDelayMs: 1000, sleep },
      ),
      { message: "fetch failed" },
    );
    assert.equal(calls, 3);
    assert.equal(delays.length, 2);
  });

  it("fails a rejected key on the first answer", async () => {
    const { delays, sleep } = recorder();
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("HTTP 401");
        },
        { attempts: 4, baseDelayMs: 1000, sleep },
      ),
      { message: "HTTP 401" },
    );
    assert.equal(calls, 1);
    assert.deepEqual(delays, []);
  });
});

/**
 * The roster does not get attempted when the provider is refusing.
 *
 * `docs/HANDOFF.md` states the rule outright — "Do not re-run the bank into a
 * 429 — a re-run cannot succeed against an exhausted allowance, and one
 * whole-roster attempt burns ~485 requests" — and the scheduled job did
 * exactly that, twice a day, for five consecutive days. Every run logged 97
 * HTTP 429s and banked zero bars.
 *
 * THE RETRY LADDER IS WHY, and its own comment explains the mismatch: five
 * attempts from a 2s base "costs a doomed run only time", which was true of
 * the failure it was written for — launchd waking the job before the network
 * is up, which on 2026-08-08 cost all 100 symbols in six seconds. It is not
 * true of a quota 429, where the wall does not move until the trailing window
 * drains.
 *
 * WHAT THIS DOES NOT CLAIM, because it was checked and is false: that the
 * retries made the exhaustion worse. FMP bills BYTES over a trailing 30 days,
 * not requests, so a 429 body is a few of them. The cost is wall time and a
 * failure indistinguishable from a revoked key.
 */
describe("a refusing provider costs one symbol, not the roster", () => {
  const SOURCE = readFileSync("scripts/bank-minute-bars.ts", "utf8");

  it("banks the first symbol as a SCOUT rather than probing separately", () => {
    // A separate probe would discard bars it had already paid for, and the
    // allowance is metered in bytes — so the scout is a real banking call
    // whose result is kept.
    assert.match(
      SOURCE,
      /const scout = targets\[index\+\+\];\s*\n\s*const result = await bankOne\(/,
      "the scout is gone, so the roster is attempted before anything knows " +
        "whether the provider is answering",
    );
    assert.doesNotMatch(
      SOURCE,
      /probeProvider/,
      "a discard-the-result probe is back; it spends bytes on a healthy run " +
        "for a question the first banking call already answers",
    );
    // Its bars must COUNT — a scout whose result is thrown away is the probe
    // wearing a different name.
    const at = SOURCE.indexOf("const scout = targets[index++];");
    const body = SOURCE.slice(at, at + 400);
    assert.match(body, /appendedTotal \+= result\.appended;/);
    assert.match(body, /fetchedTotal \+= result\.fetched;/);
  });

  it("stands down before the rest of the roster when the scout fetches nothing", () => {
    const at = SOURCE.indexOf("const scout = targets[index++];");
    const body = SOURCE.slice(at, at + 2400);
    assert.match(
      body,
      /if \(result\.fetched === 0\) \{/,
      "nothing checks the scout's result, so it is just the first symbol",
    );
    assert.match(
      body,
      /symbol's full window\.`,\s*\n\s*\);\s*\n\s*return 1;/,
      "the run continues into the remaining symbols after the scout failed",
    );
    const remedy = SOURCE.slice(SOURCE.indexOf("function standDownRemedy"));
    assert.match(remedy, /case "suspended":/);
    assert.match(remedy, /case "invalidKey":/);
  });

  it("says what it did not attempt, and that recovery needs no catch-up", () => {
    // The five silent days were the real defect. A stand-down that does not
    // explain itself reads the same as a clean quiet day in a log nobody
    // opens.
    const at = SOURCE.indexOf("Standing down without attempting");
    assert.ok(at >= 0, "the stand-down no longer says what it skipped");
    // Joined across the template-literal breaks before matching. The message
    // is assembled from concatenated fragments, so a phrase that reads as one
    // sentence in the log is not contiguous in the source — matching the raw
    // text tests the line wrapping rather than the wording.
    const raw = SOURCE.slice(at - 200, at + 900);
    // The COUNT is checked on the raw slice, where the interpolation is still
    // an expression. The PROSE is checked on a normalized copy: the message is
    // assembled from concatenated fragments, so a phrase that reads as one
    // sentence in the log is not contiguous in the source, and matching the
    // raw text would test the line wrapping rather than the wording.
    const message = raw
      .replace(/`\s*\+\s*\n\s*`/g, "")
      .replace(/\$\{[^}]*\}/gs, "N")
      .replace(/\s+/g, " ");
    assert.match(
      raw,
      /targets\.length - 1/,
      "the message does not name how many symbols went unattempted",
    );
    // The claim is unchanged — the message must tell the reader the wall
    // cannot be hurried. Where that sentence LIVES moved on 2026-09-07: it is
    // now chosen per refusal, because the bandwidth remedy ("drains by time")
    // is false of the 402 entitlement gap and asserting it there is what made
    // four days of a dead job read as ordinary waiting.
    assert.match(
      raw,
      /\$\{standDownRemedy\(result\.note\)\}/,
      "the message asserts one remedy for every wall again",
    );
    const remedy = SOURCE.slice(SOURCE.indexOf("function standDownRemedy"));
    assert.match(
      remedy,
      /drains by time only/,
      "the bandwidth branch no longer says the wall cannot be hurried",
    );
    assert.match(
      remedy,
      /the FMP plan must change before any run succeeds/,
      "the entitlement branch does not name the plan as the only lever, so " +
        "the next reader will wait out a wall that never drains",
    );
    assert.match(
      message,
      /re-pulls each symbol's full window/,
      "the message does not say recovery needs no catch-up, which is the " +
        "fact that makes standing down safe rather than lossy",
    );
  });
});

/**
 * The bank run, executed against stubbed fetch and temporary state.
 *
 * §21c: the bank "cannot be refused", and §21g: "a proxy outage must never be
 * able to cost minute bars". So the bank never consults the shared breaker —
 * its first symbol is its own probe — and it never asks the ledger for room.
 * It reports what it learns, bounds each run, and tells the run gate only
 * when a whole roster banked clean into the one real store.
 */
describe("minute bank — the run, end to end against a stubbed provider", () => {
  const AT = Date.parse("2026-09-16T23:20:05Z");
  const MIN1 = "/stable/historical-chart/1min";
  const ROSTER = bankableSymbols().length;
  const BAR_BODY = JSON.stringify([
    { close: 1.5, date: "2026-09-16 09:30:00", high: 2, low: 0.5, open: 1, volume: 1 },
    { close: 1.6, date: "2026-09-16 09:31:00", high: 2, low: 0.5, open: 1, volume: 1 },
  ]);
  const SUSPENDED_BODY = BODIES.suspended.slice(BODIES.suspended.indexOf("{"));
  const RESTRICTED_BODY = BODIES.restricted.slice("HTTP 402 ".length);

  type Responder = (symbol: string, call: number) => Response;

  async function run(options: {
    argv?: string[];
    dir?: string;
    respond?: Responder;
    runBoundBytes?: number;
    state?: FmpStatePaths;
  } = {}) {
    const state = options.state ?? tempState();
    const dir = options.dir ?? state.canonicalBankDir;
    mkdirSync(dir, { recursive: true });
    const symbols: string[] = [];
    const out: string[] = [];
    const sleeps: number[] = [];
    const code = await runBank({
      argv: ["--dir", dir, ...(options.argv ?? [])],
      fetch: (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, MIN1);
        symbols.push(url.searchParams.get("symbol") ?? "");
        const respond = options.respond ?? (() => new Response(BAR_BODY));
        return Promise.resolve(respond(url.searchParams.get("symbol") ?? "", symbols.length));
      },
      key: "test-key",
      now: () => AT,
      print: { err: (line) => out.push(line), out: (line) => out.push(line) },
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      state,
      ...(options.runBoundBytes === undefined ? {} : { runBoundBytes: options.runBoundBytes }),
    });
    return { code, dir, output: out.join("\n"), sleeps, state, symbols };
  }

  const breakerEvents = (state: FmpStatePaths) =>
    existsSync(state.breakerDir)
      ? readdirSync(state.breakerDir).flatMap((name) =>
        readFileSync(join(state.breakerDir, name), "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => JSON.parse(line) as Record<string, unknown>)
      )
      : [];
  const markerPath = (state: FmpStatePaths) => join(state.runsDir, "minute-bank.json");

  it("spends its scout through an open breaker and closes it on an answer", async () => {
    const state = tempState();
    openCircuit({ atMs: AT - 60_000, consumer: "topup", endpointPath: "/stable/historical-chart/5min", kind: "bandwidth", reason: BODIES.bandwidth }, state);
    const result = await run({ argv: ["--limit", "1"], state });
    assert.equal(result.symbols.length, 1);
    assert.equal(result.code, 0);
    const read = readBreaker(AT + 1, state);
    assert.ok(read.ok);
    assert.deepEqual(read.entries.map((entry) => [entry.key, entry.open]), [["account", false]]);
  });

  it("stands down red on a scout 402 and records it against the 1-minute endpoint", async () => {
    const result = await run({ respond: () => new Response(RESTRICTED_BODY, { status: 402 }) });
    assert.equal(result.code, 1);
    assert.equal(result.symbols.length, 1);
    const refused = breakerEvents(result.state).filter((event) => event.t === "refused");
    assert.deepEqual(refused.map((event) => [event.key, event.kind]), [[MIN1, "entitlement"]]);
    const sidecars = readdirSync(result.dir).filter((name) => name.endsWith(".state.json"));
    assert.deepEqual(sidecars, [`${encodeURIComponent(bankableSymbols()[0].fmpSymbol)}.state.json`]);
  });

  it("asks once on a rejected key, opens nothing, and names the Keychain item", async () => {
    const result = await run({ respond: () => new Response(INVALID_KEY_BODY_PREFIX, { status: 401 }) });
    assert.equal(result.code, 1);
    assert.equal(result.symbols.length, 1);
    assert.deepEqual(result.sleeps, []);
    assert.deepEqual(breakerEvents(result.state), []);
    assert.doesNotMatch(result.output, /fmpBookkeepingFailed/, "a rejected key never reaches the breaker at all");
    assert.match(result.output, /fmp-api-key/);
  });

  it("names the owner as the only remedy for a suspension", async () => {
    const result = await run({ respond: () => new Response(SUSPENDED_BODY, { status: 403 }) });
    assert.equal(result.code, 1);
    assert.equal(result.symbols.length, 1);
    assert.match(result.output, /nothing clears it but the owner/);
    assert.doesNotMatch(result.output, /did not match a known wall/);
  });

  it("does not report a mid-roster refusal to the shared breaker", async () => {
    const result = await run({
      argv: ["--concurrency", "1"],
      respond: (_symbol, call) =>
        call === 3 ? new Response(RESTRICTED_BODY, { status: 402 }) : new Response(BAR_BODY),
    });
    assert.equal(result.code, 0, "a partial loss still exits 0; the watcher owns it");
    assert.deepEqual(breakerEvents(result.state).filter((event) => event.t === "refused"), []);
    assert.equal(existsSync(markerPath(result.state)), false, "a partial run is not clean");
  });

  it("bounds a run and leaves the rest unattempted, whatever the ledger says", async () => {
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 600 * 1024 * 1024, consumer: "adhoc", label: "seeded" }, state);
    const padded = BAR_BODY.padEnd(300, " ");
    assert.equal(Buffer.byteLength(padded), 300);
    const result = await run({
      argv: ["--concurrency", "1"],
      respond: () => new Response(padded),
      runBoundBytes: 1_000,
      state,
    });
    assert.equal(result.symbols.length, 4);
    assert.equal(result.code, 1);
    assert.match(result.output, /runBoundReached/);
    assert.match(result.output, new RegExp(`\\b${ROSTER - 4}\\b`));
    assert.equal(readdirSync(result.dir).filter((name) => name.endsWith(".state.json")).length, 4);
    assert.equal(existsSync(markerPath(state)), false);
  });

  it("marks a clean full roster into the canonical store, and nothing less", async () => {
    const clean = await run();
    assert.equal(clean.code, 0, clean.output);
    const marker = JSON.parse(readFileSync(markerPath(clean.state), "utf8")) as { atMs: number; dir: string };
    assert.equal(marker.dir, realpathSync(clean.dir));
    assert.equal(marker.atMs, AT);
    const usage = readFileSync(join(clean.state.usageDir, "2026-09-16.jsonl"), "utf8")
      .split("\n")
      .filter((line) => line.includes('"consumer":"bank"'));
    assert.equal(usage.length, ROSTER);

    const limited = await run({ argv: ["--limit", "5"] });
    assert.equal(existsSync(markerPath(limited.state)), false, "a limited run is not the roster");

    const failedOne = await run({
      respond: (symbol) =>
        symbol === bankableSymbols()[10].fmpSymbol ? new Response("", { status: 500 }) : new Response(BAR_BODY),
    });
    assert.equal(failedOne.code, 0);
    assert.equal(existsSync(markerPath(failedOne.state)), false, "a symbol that failed is not clean");

    const elsewhere = tempState();
    const other = await run({ dir: mkdtempSync(join(tmpdir(), "not-the-bank-")), state: elsewhere });
    assert.equal(other.code, 0);
    assert.equal(existsSync(markerPath(elsewhere)), false, "a copy of the store is not the store");
  });

  it("keeps banking when the ledger cannot be written, and exits red", async () => {
    const state = tempState({ sentinel: false });
    mkdirSync(dirname(state.usageDir), { recursive: true });
    writeFileSync(state.usageDir, "a file where the ledger directory belongs");
    const result = await run({ state });
    assert.equal(result.symbols.length, ROSTER, "a bookkeeping failure never re-issues a request");
    assert.equal(result.code, 1);
    assert.match(result.output, /fmpBookkeepingFailed: /);
    const banked = readdirSync(result.dir).filter((name) => name.endsWith(".jsonl"));
    assert.equal(banked.length, ROSTER);
    assert.equal(existsSync(markerPath(state)), false, "a red run is not clean");
  });

  // A marker after a red run turned the next boot, kickstart or hand run into
  // "skipped by the run gate" with exit 0, and launchd's last exit code for the
  // job with it. The bars are banked either way; what the marker must not do is
  // hide the red.
  it("alarms when the bank's own day passes its run bound, and writes no clean-run marker", async () => {
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 536_870_000, consumer: "bank", label: "seeded" }, state);
    const result = await run({ state });
    assert.equal(result.code, 1);
    const day = readDay(AT, state);
    assert.ok(day.ok);
    assert.ok(result.output.includes(`spent ${day.day.bank} bytes today`), result.output);
    assert.equal(existsSync(markerPath(state)), false, "a red run is not clean");
  });

  // Each reading is checked alone: the provider stub repairs or tears the
  // legacy file mid-run, so only the reading that saw it torn can name it.
  it("names a torn legacy ledger in the reading before it banks, and still banks", async () => {
    const state = tempState({ legacyUsage: {} });
    writeFileSync(state.legacyUsagePath, '{"2026-09-16": ');
    const result = await run({
      argv: ["--limit", "1"],
      respond: () => {
        writeFileSync(state.legacyUsagePath, "{}");
        return new Response(BAR_BODY);
      },
      state,
    });
    assert.equal(result.symbols.length, 1);
    assert.equal(result.code, 0, result.output);
    assert.ok(result.output.includes(`fmpStateUnreadable: legacy ledger ${state.legacyUsagePath}: `), result.output);
  });

  it("names a legacy ledger torn during the run in the reading after it", async () => {
    const state = tempState({ legacyUsage: {} });
    const result = await run({
      argv: ["--limit", "1"],
      respond: () => {
        writeFileSync(state.legacyUsagePath, '{"2026-09-16": ');
        return new Response(BAR_BODY);
      },
      state,
    });
    assert.equal(result.symbols.length, 1);
    assert.ok(result.output.includes(`fmpStateUnreadable: legacy ledger ${state.legacyUsagePath}: `), result.output);
  });

  it("exits red when the clean-run marker cannot be written", async () => {
    const state = tempState();
    mkdirSync(dirname(state.runsDir), { recursive: true });
    writeFileSync(state.runsDir, "a file where the runs directory belongs");
    const result = await run({ state });
    assert.equal(result.code, 1);
    assert.match(result.output, /fmpBookkeepingFailed: bank-minute-bars run marker: /);
  });
});
