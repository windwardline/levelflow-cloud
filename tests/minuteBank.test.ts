import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bankableSymbols,
  isRetryable,
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
