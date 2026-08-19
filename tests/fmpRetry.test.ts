// Round-8 OP-6: one FMP key serves the fleet, the scan, and the banks;
// 3,000 requests/min is the ceiling and NOTHING retried a 429 — the
// probable killer of the first fleet's silent shard deaths. The retry
// policy lives in one module with the fetch injected, so both the sweep
// driver's three sites and the bank script share it and the tests can
// exercise every branch without a network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fetchFmpWithRetry } from "../scripts/fmpRetry.ts";

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
