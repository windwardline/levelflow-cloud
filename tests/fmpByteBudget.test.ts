// §21j Phase 1: the replay sweeps exhausted a 150 GB trailing-30-day FMP
// allowance in days (2026-08-13), and the cost was permanent — 1-minute bars
// are served ~3 days deep, so every day the bank stayed dark is a day of
// unrecoverable history. Nothing between `tsx scripts/replay-sweep.ts` and the
// provider could refuse the spend. This is that refusal: the sweep declares a
// byte ceiling up front and halts on it.
//
// FMP meters BYTES, not requests (§21a), so the budget counts payload and the
// 3,000/min rate ceiling is irrelevant here. The ledger of §21d is the durable
// answer; this is the guard that bounds the one consumer that has ever caused
// an outage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ByteBudgetExceededError,
  createByteBudget,
  parseByteBudgetArg,
  readJsonWithBudget,
} from "../scripts/fmpByteBudget.ts";

describe("createByteBudget — the sweep halts before the allowance does", () => {
  it("accumulates recorded bytes and reports what is left", () => {
    const budget = createByteBudget(1_000);
    budget.record(400);
    budget.record(350);
    assert.equal(budget.spent(), 750);
    assert.equal(budget.remaining(), 250);
  });

  it("throws when a record crosses the ceiling, naming spent and limit", () => {
    const budget = createByteBudget(1_000);
    budget.record(900);
    assert.throws(
      () => budget.record(200),
      (error: unknown) => {
        assert.ok(error instanceof ByteBudgetExceededError);
        assert.match(error.message, /1000/);
        assert.match(error.message, /1100/);
        return true;
      },
    );
  });

  // Bytes are counted after the response is read, so by then FMP has already
  // served them. The budget halts the next fetch; it cannot un-spend this one.
  // Crediting only what stayed under the ceiling would under-report real
  // consumption — the precise error that makes an allowance vanish unseen.
  it("credits bytes that were genuinely spent before halting", () => {
    const budget = createByteBudget(1_000);
    budget.record(900);
    assert.throws(() => budget.record(200));
    assert.equal(budget.spent(), 1_100);
    assert.equal(budget.remaining(), -100);
  });

  it("allows a record that lands exactly on the ceiling", () => {
    const budget = createByteBudget(1_000);
    budget.record(1_000);
    assert.equal(budget.remaining(), 0);
  });

  // The minute-bank carries the same law (#344, "refuse a limit that reads as
  // nothing"): a ceiling that is absent, zero, or unparseable must stop the
  // run, never silently mean "unlimited".
  it("refuses a limit that reads as nothing", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => createByteBudget(bad),
        /byte budget/i,
        `limit ${String(bad)} should be refused`,
      );
    }
  });
});

describe("readJsonWithBudget — what FMP actually billed us for", () => {
  const body = (text: string) => ({ text: () => Promise.resolve(text) });

  it("returns the parsed payload and charges its byte length", async () => {
    const budget = createByteBudget(1_000);
    const payload = await readJsonWithBudget(body('[{"close":1}]'), budget);
    assert.deepEqual(payload, [{ close: 1 }]);
    assert.equal(budget.spent(), 13);
  });

  // FMP bills bytes on the wire, not JavaScript string length. A payload of
  // multi-byte characters costs more than `.length` reports, and charging the
  // cheaper number is how a budget drifts under the real spend.
  it("charges UTF-8 bytes, not string length", async () => {
    const budget = createByteBudget(1_000);
    await readJsonWithBudget(body('["€"]'), budget);
    assert.equal(budget.spent(), 7);
  });

  it("halts when a payload carries the run past its ceiling", async () => {
    const budget = createByteBudget(10);
    await assert.rejects(
      () => readJsonWithBudget(body('[{"close":1}]'), budget),
      ByteBudgetExceededError,
    );
    assert.equal(budget.spent(), 13);
  });
});

// The guard that keeps the guard. A budget wired into two of three fetch
// sites bounds nothing, and the gap would be invisible — the sweep would run,
// report a spend, and be wrong by whatever the unmetered site cost. Pinned in
// both directions, the way tests/securityHardening.test.ts pins its revokes.
describe("replay-sweep — every FMP read is metered", () => {
  const source = readFileSync("scripts/replay-sweep.ts", "utf8");

  it("routes every provider read through the budget", () => {
    const fetches = source.match(/fetchFmpWithRetry\(/g) ?? [];
    const metered = source.match(/readJsonWithBudget\(/g) ?? [];
    assert.ok(fetches.length > 0, "expected the sweep to fetch from FMP");
    assert.equal(
      metered.length,
      fetches.length,
      "every fetchFmpWithRetry site must read its body through readJsonWithBudget",
    );
  });

  it("leaves no unmetered body read behind", () => {
    assert.doesNotMatch(
      source,
      /await\s+response\.json\(\)/,
      "a bare response.json() spends bytes the budget never sees",
    );
  });

  it("refuses to start without a declared ceiling", () => {
    assert.match(source, /parseByteBudgetArg\(/);
  });
});

describe("parseByteBudgetArg — an ad-hoc run declares its cost or does not start", () => {
  it("reads the declared ceiling from --byte-budget", () => {
    assert.equal(parseByteBudgetArg(["--byte-budget", "2500"]), 2_500);
  });

  it("accepts the GB shorthand a human would actually type", () => {
    assert.equal(parseByteBudgetArg(["--byte-budget", "2gb"]), 2 * 1024 ** 3);
  });

  it("refuses to start when no ceiling is declared", () => {
    assert.throws(() => parseByteBudgetArg(["--days", "30"]), /--byte-budget/);
  });

  it("refuses a declared ceiling it cannot parse", () => {
    assert.throws(
      () => parseByteBudgetArg(["--byte-budget", "lots"]),
      /--byte-budget/,
    );
  });
});
