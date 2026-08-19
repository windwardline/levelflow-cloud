// Round-8 OP-6: one FMP key serves the fleet, the scan, and the banks;
// 3,000 requests/min is the ceiling and NOTHING retried a 429 — the
// probable killer of the first fleet's silent shard deaths. The retry
// policy lives in one module with the fetch injected, so both the sweep
// driver's three sites and the bank script share it and the tests can
// exercise every branch without a network.
import assert from "node:assert/strict";
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

  it("paces every request when a pace is set", async () => {
    // Both sides measure performance.now() — the pacer runs on the same
    // monotonic clock (#364 round-9 CI: on Date.now(), an NTP step on
    // the runner cut the wait below even this 5ms cushion), and its
    // re-check loop makes the floor strict, so ≥ pace-minus-cushion
    // cannot flake on scheduling delay, which only lands late.
    const stamps: number[] = [];
    await fetchFmpWithRetry(
      () => {
        stamps.push(performance.now());
        return Promise.resolve(response(200));
      },
      { delaysMs: [1], paceMs: 25 },
    );
    const start = performance.now();
    await fetchFmpWithRetry(
      () => {
        stamps.push(performance.now());
        return Promise.resolve(response(200));
      },
      { delaysMs: [1], paceMs: 25 },
    );
    assert.ok(
      stamps[1] - start >= 20,
      `second call must wait out the pace: ${stamps[1] - start}ms`,
    );
  });
});
