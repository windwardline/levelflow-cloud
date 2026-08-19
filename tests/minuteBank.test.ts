import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  bankableSymbols,
  departedSymbols,
  isRetryable,
  orphanedSidecars,
  planRun,
  usableBar,
  withRetry,
} from "../scripts/bank-minute-bars.ts";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";

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
