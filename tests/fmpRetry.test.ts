// Round-8 OP-6: one FMP key serves the fleet, the scan, and the banks;
// 3,000 requests/min is the ceiling and NOTHING retried a 429 — the
// probable killer of the first fleet's silent shard deaths. The retry
// policy lives in one module with the fetch injected, so both the sweep
// driver's three sites and the bank script share it and the tests can
// exercise every branch without a network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  fetchFmpJsonWithRetry,
  fetchFmpWithRetry,
  type FmpRetryEvent,
} from "../scripts/fmpRetry.ts";

type FakeResponse = { ok: boolean; status: number };

const response = (status: number): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
});

describe("fetchFmpWithRetry — the 429 survives, the run does not die (OP-6)", () => {
  it("returns the first success untouched", async () => {
    let calls = 0;
    const result = await fetchFmpWithRetry(
      () => {
        calls += 1;
        return Promise.resolve(response(200));
      },
      { delaysMs: [1, 1, 1] },
    );
    assert.equal(result.status, 200);
    assert.equal(calls, 1);
  });

  it("retries 429 with backoff and succeeds when the window clears", async () => {
    const statuses = [429, 429, 200];
    let calls = 0;
    const result = await fetchFmpWithRetry(
      () => Promise.resolve(response(statuses[calls++])),
      { delaysMs: [1, 1, 1] },
    );
    assert.equal(result.status, 200);
    assert.equal(calls, 3);
  });

  it("retries transient 5xx the same way", async () => {
    const statuses = [503, 200];
    let calls = 0;
    const result = await fetchFmpWithRetry(
      () => Promise.resolve(response(statuses[calls++])),
      { delaysMs: [1, 1, 1] },
    );
    assert.equal(result.status, 200);
    assert.equal(calls, 2);
  });

  it("returns the final failed response after exhaustion — the caller's own law decides", async () => {
    let calls = 0;
    const result = await fetchFmpWithRetry(
      () => {
        calls += 1;
        return Promise.resolve(response(429));
      },
      { delaysMs: [1, 1] },
    );
    assert.equal(result.status, 429);
    assert.equal(calls, 3);
  });

  it("does not retry durable client errors — a 404 is an answer", async () => {
    let calls = 0;
    const result = await fetchFmpWithRetry(
      () => {
        calls += 1;
        return Promise.resolve(response(404));
      },
      { delaysMs: [1, 1] },
    );
    assert.equal(result.status, 404);
    assert.equal(calls, 1);
  });

  it("paces every request when a pace is set — the full pace, strictly", async () => {
    // start is taken BEFORE the first call, so the pacer's own stamp
    // lands at or after it on the SAME monotonic clock, and the second
    // call's re-check loop guarantees stamps[1] >= that stamp + paceMs.
    // The bound is therefore exact — no cushion — and cannot flake:
    // scheduling delay only lands late. The old test measured from
    // after the first call and allowed a 20% under-wait, which is how a
    // wall-clock NTP step under-pacing by 5ms (#364 round-9 CI) was the
    // first anyone heard of it.
    const stamps: number[] = [];
    const start = performance.now();
    await fetchFmpWithRetry(
      () => {
        stamps.push(performance.now());
        return Promise.resolve(response(200));
      },
      { delaysMs: [1], paceMs: 25 },
    );
    await fetchFmpWithRetry(
      () => {
        stamps.push(performance.now());
        return Promise.resolve(response(200));
      },
      { delaysMs: [1], paceMs: 25 },
    );
    assert.ok(
      stamps[1] - start >= 25,
      `second call must wait out the full pace: ${stamps[1] - start}ms`,
    );
  });

  it("paces on the monotonic clock, never the wall clock — source pin (#364 round 9, finding 4)", () => {
    // Executed behaviour cannot catch a revert on an unstepped runner:
    // Date.now() only under-paces when NTP steps it forward, which is
    // exactly when a burst through FMP's 3,000/min ceiling goes silent
    // (the 429s retry, the run slows or dies unnamed). So the clock
    // choice and the strict-floor loop are pinned as source shapes, the
    // sweepManifest.test.ts idiom for laws a test cannot execute into.
    // Comments are stripped first: the module's own comments NAME the
    // banned call to explain the ban, and the pin's law is about code.
    const source = readFileSync("scripts/fmpRetry.ts", "utf8");
    const code = source.replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /Date\.now\(\)/);
    assert.match(code, /performance\.now\(\) - lastRequestAtMs/);
    assert.match(code, /while \(elapsed < paceMs\)/);
  });
});

describe("transport failures — the run that dies without a status", () => {
  // A socket timeout produces no HTTP status, so it never reached the
  // status test and escaped the retry entirely. Node reports every one of
  // them as the same TypeError with the real signal on `cause`.
  const timeout = () =>
    Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("read ETIMEDOUT"), { code: "ETIMEDOUT" }),
    });

  it("retries a thrown transport failure and returns the eventual success", async () => {
    let calls = 0;
    const result = await fetchFmpWithRetry(
      () => {
        calls += 1;
        return calls < 3
          ? Promise.reject(timeout())
          : Promise.resolve(response(200));
      },
      { delaysMs: [1, 1, 1] },
    );
    assert.equal(result.status, 200);
    assert.equal(calls, 3);
  });

  it("rethrows the ORIGINAL error once the ladder is spent", async () => {
    // Never swallowed and never dressed up as a response: a caller has to
    // be able to tell "the network is down" from "the provider answered".
    let calls = 0;
    const thrown = timeout();
    await assert.rejects(
      () =>
        fetchFmpWithRetry(
          () => {
            calls += 1;
            return Promise.reject(thrown);
          },
          { delaysMs: [1, 1] },
        ),
      (error: unknown) => error === thrown,
    );
    assert.equal(calls, 3);
  });

  it("does not retry forever — attempts are delays + 1, same as a 429", async () => {
    let calls = 0;
    await assert.rejects(() =>
      fetchFmpWithRetry(
        () => {
          calls += 1;
          return Promise.reject(timeout());
        },
        { delaysMs: [1] },
      )
    );
    assert.equal(calls, 2);
  });

  it("reports each retry with the cause code, not just `fetch failed`", async () => {
    // Every socket fault carries the identical message, which is how three
    // rebuild deaths looked the same in a log. The code is the signal.
    const events: FmpRetryEvent[] = [];
    let calls = 0;
    await fetchFmpWithRetry(
      () => {
        calls += 1;
        return calls < 2
          ? Promise.reject(timeout())
          : Promise.resolve(response(200));
      },
      { delaysMs: [1, 1], onRetry: (event) => events.push(event) },
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].reason, "transport");
    assert.equal(events[0].attempt, 0);
    assert.equal(events[0].detail, "fetch failed (ETIMEDOUT)");
  });

  it("reports a status retry too — that one was invisible as well", async () => {
    const events: FmpRetryEvent[] = [];
    let calls = 0;
    await fetchFmpWithRetry(
      () => {
        calls += 1;
        return Promise.resolve(response(calls < 2 ? 429 : 200));
      },
      { delaysMs: [1, 1], onRetry: (event) => events.push(event) },
    );
    assert.deepEqual(events.map((event) => [event.reason, event.detail]), [[
      "status",
      "HTTP 429",
    ]]);
  });

  it("describes a non-Error throw without crashing the reporter", async () => {
    const events: FmpRetryEvent[] = [];
    let calls = 0;
    await fetchFmpWithRetry(
      () => {
        calls += 1;
        return calls < 2 ? Promise.reject("nope") : Promise.resolve(response(200));
      },
      { delaysMs: [1], onRetry: (event) => events.push(event) },
    );
    assert.equal(events[0].detail, "nope");
  });
});

describe("every FMP fetch in the repo shares the one policy", () => {
  it("no call site passes bespoke retry options — derived, not remembered", () => {
    // The module's whole premise is "the one retry policy for every FMP
    // consumer on this machine". Four sites in the sweep driver each
    // repeated their own options object, which is how a fifth arrives with
    // different behaviour and nothing says so.
    //
    // The population is DERIVED: whatever calls fetchFmpWithRetry outside
    // this module is a consumer, and each must hand it a shared named
    // object rather than an inline literal. A remembered list of four call
    // sites would be right today and quietly wrong at five.
    const consumers = readdirSync("scripts")
      .filter((name) => name.endsWith(".ts") && name !== "fmpRetry.ts")
      .map((name) => ({
        name,
        text: readFileSync(join("scripts", name), "utf8"),
      }))
      .filter(({ text }) => text.includes("fetchFmpWithRetry("));
    assert.ok(consumers.length > 0, "derivation found no consumers — check it");
    for (const { name, text } of consumers) {
      const inline = [
        ...text.matchAll(/fetchFmpWithRetry\([^;]*?,\s*\{/g),
      ];
      assert.deepEqual(
        inline.map((match) => match[0].slice(-40)),
        [],
        `${name} passes an inline retry-options literal instead of a shared one`,
      );
    }
  });
});

describe("the bulk driver's ladder is sized for a bulk job", () => {
  it("spans minutes, not the module default's forty seconds", () => {
    // Four consecutive v4 rebuilds died on transport failures that outlasted
    // the 2s/8s/30s default. That default is right for the analyzer, where a
    // person is waiting; it is wrong for a run of tens of hours whose every
    // completed market is already durable on disk.
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    const declared = driver.match(/FMP_BULK_DELAYS_MS = \[([^\]]+)\]/);
    assert.ok(declared, "the bulk ladder was removed or renamed");
    const rungs = declared[1]
      .split(",")
      .map((part) => Number(part.trim().replaceAll("_", "")))
      .filter((value) => Number.isFinite(value) && value > 0);
    const totalMs = rungs.reduce((sum, value) => sum + value, 0);
    assert.ok(
      totalMs >= 8 * 60_000,
      `the bulk ladder covers only ${Math.round(totalMs / 1000)}s`,
    );
    // Bounded on purpose. An unbounded ladder cannot tell a blip from a
    // revoked key or an exhausted allowance, and the standing rule for this
    // provider is never to re-run into a limit.
    assert.ok(rungs.length <= 10, "the bulk ladder is effectively unbounded");
    assert.ok(
      driver.includes("delaysMs: FMP_BULK_DELAYS_MS"),
      "the bulk ladder is declared but not actually passed",
    );
  });
});

describe("the body read is inside the retry, not after it", () => {
  // fetchFmpWithRetry returns the moment the headers arrive. The body is
  // streamed afterwards, outside every guard this module provides — and for
  // the sweep's bar fetches the body is the large, slow, risky part.
  //
  // The fifth v4 rebuild died at 88 markets of 98 on `Fetch.onAborted /
  // read ECONNRESET` mid-stream and logged NO retry, because from the
  // retry's point of view the request had already succeeded.
  const reset = () =>
    Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("read ECONNRESET"), {
        code: "ECONNRESET",
      }),
    });

  it("retries when the BODY throws, not just the request", async () => {
    let reads = 0;
    const result = await fetchFmpJsonWithRetry(
      () => Promise.resolve(response(200)),
      () => {
        reads += 1;
        return reads < 3 ? Promise.reject(reset()) : Promise.resolve("rows");
      },
      { delaysMs: [1, 1, 1] },
    );
    assert.deepEqual(result, { body: "rows", ok: true });
    assert.equal(reads, 3);
  });

  it("repeats the WHOLE attempt, not just the read", async () => {
    // A partially read body is a failed request, not a partial success:
    // re-reading a broken stream is not a thing, so the request must be
    // reissued too.
    let requests = 0;
    let reads = 0;
    await fetchFmpJsonWithRetry(
      () => {
        requests += 1;
        return Promise.resolve(response(200));
      },
      () => {
        reads += 1;
        return reads < 2 ? Promise.reject(reset()) : Promise.resolve("rows");
      },
      { delaysMs: [1, 1] },
    );
    assert.equal(requests, 2, "the request was not reissued with the read");
    assert.equal(reads, 2);
  });

  it("rethrows the original body error once the ladder is spent", async () => {
    const thrown = reset();
    let reads = 0;
    await assert.rejects(
      () =>
        fetchFmpJsonWithRetry(
          () => Promise.resolve(response(200)),
          () => {
            reads += 1;
            return Promise.reject(thrown);
          },
          { delaysMs: [1] },
        ),
      (error: unknown) => error === thrown,
    );
    assert.equal(reads, 2);
  });

  it("never consumes a body it should not have read", async () => {
    // A non-ok status is handed back unconsumed: the caller owns what a 404
    // means, and reading the body of a failed request spends bytes against
    // the budget for nothing.
    let reads = 0;
    const result = await fetchFmpJsonWithRetry(
      () => Promise.resolve(response(404)),
      () => {
        reads += 1;
        return Promise.resolve("rows");
      },
      { delaysMs: [1] },
    );
    assert.equal(result.ok, false);
    assert.equal(reads, 0);
    if (!result.ok) assert.equal(result.response.status, 404);
  });

  it("still retries a 429 the same way, and reports both reasons", async () => {
    const events: FmpRetryEvent[] = [];
    let calls = 0;
    const result = await fetchFmpJsonWithRetry(
      () => {
        calls += 1;
        return calls < 2
          ? Promise.resolve(response(429))
          : Promise.resolve(response(200));
      },
      () => Promise.resolve("rows"),
      { delaysMs: [1, 1], onRetry: (event) => events.push(event) },
    );
    assert.equal(result.ok, true);
    assert.deepEqual(events.map((event) => event.reason), ["status"]);
  });

  it("the sweep's bar fetch routes through it — derived from the source", () => {
    // The bar fetch is the one that died. If it ever returns to the
    // headers-only helper, the large-body path is unguarded again.
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    const barFetch = driver.slice(driver.indexOf("async function fetchBars("));
    const body = barFetch.slice(0, barFetch.indexOf("\n}\n"));
    assert.match(
      body,
      /fetchFmpJsonWithRetry\(/,
      "fetchBars reads its body outside the retry again",
    );
    assert.ok(
      !/fetchFmpWithRetry\(/.test(body),
      "fetchBars uses the headers-only retry for a large body",
    );
  });
});
