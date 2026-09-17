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
  parseDailyCeilingArg,
  readJsonWithBudget,
  SpendRefusedError,
} from "../scripts/fmpByteBudget.ts";
import { formatGib } from "../scripts/replay-sweep.ts";

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

  it("hands the ledger the endpoint and the instant the provider answered", async () => {
    // The breaker closes on EVIDENCE TIME, not on append order, so the
    // instant must be taken before the body is read: a refusal another
    // consumer appends while this body streams is newer than the answer.
    const realNow = Date.now;
    let bodyRead = false;
    Date.now = () => (bodyRead ? 2_000 : 1_000);
    try {
      const seen: Array<{ bytes: number; meta?: { endpointPath: string; answeredAtMs: number } }> = [];
      const budget = {
        record: (bytes: number, meta?: { endpointPath: string; answeredAtMs: number }) => {
          seen.push({ bytes, meta });
        },
        remaining: () => 0,
        spent: () => 0,
      };
      await readJsonWithBudget(
        {
          text: () => {
            bodyRead = true;
            return Promise.resolve("[]");
          },
        },
        budget,
        "/stable/historical-chart/5min",
      );
      assert.deepEqual(seen, [
        { bytes: 2, meta: { answeredAtMs: 1_000, endpointPath: "/stable/historical-chart/5min" } },
      ]);
    } finally {
      Date.now = realNow;
    }
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
    // The entry points are DERIVED from fmpRetry.ts's own exports, not named
    // here. This test previously counted `fetchFmpWithRetry(` alone and went
    // red the moment a second entry point arrived — a guard that fails on a
    // change which strengthens the invariant it protects is a guard people
    // learn to edit rather than heed. A third entry point now inherits the
    // check instead of slipping past it.
    const entryPoints = [
      ...readFileSync("scripts/fmpRetry.ts", "utf8")
        .matchAll(/export async function (fetchFmp\w*)/g),
    ].map((match) => match[1]);
    assert.ok(entryPoints.length > 0, "fmpRetry.ts exports no fetch entry point");
    const fetches = entryPoints.reduce(
      (total, name) =>
        total + (source.match(new RegExp(`${name}\\(`, "g")) ?? []).length,
      0,
    );
    const metered = source.match(/readJsonWithBudget\(/g) ?? [];
    assert.ok(fetches > 0, "expected the sweep to fetch from FMP");
    assert.equal(
      metered.length,
      fetches,
      `every FMP fetch site (${entryPoints.join(", ")}) must read its body through readJsonWithBudget`,
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

  it("sends every provider request through the probe gate's fetch", () => {
    // A bare fetch(endpoint) skips the breaker's probe claim, so two
    // consumers past the cool-off would both probe.
    assert.doesNotMatch(source, /[^\w.]fetch\(endpoint\)/);
    assert.equal((source.match(/providerFetch\(endpoint\)/g) ?? []).length, 4);
  });

  it("treats every governor and breaker refusal as final in the retry ladder", () => {
    assert.match(
      source,
      /isRetryableError: \(error: unknown\) => !\(error instanceof SpendRefusedError\)/,
    );
  });
});

describe("the refusal family — one base class every ladder can recognise", () => {
  it("makes the run budget a spend refusal with its own stand-down kind", () => {
    const error = new ByteBudgetExceededError(10, 11);
    assert.ok(error instanceof SpendRefusedError);
    assert.equal(error.standDownKind, "runBudget");
    assert.equal(error.source, "governor");
  });
});

describe("parseDailyCeilingArg — an owner-approved raise is declared, never implied", () => {
  it("is absent unless the flag is given", () => {
    assert.equal(parseDailyCeilingArg(["--byte-budget", "1gb"]), undefined);
  });

  it("reads the same sizes the byte budget reads", () => {
    assert.equal(parseDailyCeilingArg(["--daily-ceiling", "30gb"]), 30 * 1024 ** 3);
  });

  it("refuses a missing value, a repeat and an unreadable size by name", () => {
    assert.throws(() => parseDailyCeilingArg(["--daily-ceiling"]), /--daily-ceiling/);
    assert.throws(
      () => parseDailyCeilingArg(["--daily-ceiling", "--warm-only"]),
      /--daily-ceiling/,
    );
    assert.throws(() => parseDailyCeilingArg(["--daily-ceiling", "lots"]), /--daily-ceiling/);
    assert.throws(
      () => parseDailyCeilingArg(["--daily-ceiling", "1gb", "--daily-ceiling", "2gb"]),
      /--daily-ceiling was given 2 times/,
    );
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

  // #364 round 53, finding 1. This file is exempt from the VALUE_FLAGS
  // law because the size regex above closes the two failure modes that
  // law exists for by mechanism — but the shared reader's header lists
  // THREE, and the third was open here: `indexOf` reads the first
  // occurrence, so `--byte-budget 2gb --byte-budget 150gb` started under
  // whichever ceiling came first, on the one dial that exists because
  // nothing between the command line and the provider can otherwise
  // refuse an ad-hoc run's spend.
  it("refuses a ceiling declared twice rather than picking one", () => {
    assert.throws(
      () =>
        parseByteBudgetArg(["--byte-budget", "2gb", "--byte-budget", "150gb"]),
      /--byte-budget was given 2 times/,
    );
  });
});

// The reporter and the parser must share a base. They did not: `formatGib` used
// 1e9 while `parseByteBudgetArg` scales a `gb` suffix by 1024**3, so
// `--byte-budget 30gb` printed "of 32.21GB" — the declared ceiling and the
// reported ceiling disagreeing in units, on the one dial that exists because
// nothing else can refuse an ad-hoc run's spend. Pinned as a ROUND TRIP rather
// than against a literal, so the two cannot drift apart again whatever base
// either picks.
describe("formatGib round-trips the byte-budget parser", () => {
  for (const declared of ["1gb", "30gb", "150gb"]) {
    it(`--byte-budget ${declared} reports as the number the operator typed`, () => {
      const bytes = parseByteBudgetArg(["--byte-budget", declared]);
      const expected = declared.replace("gb", "");
      assert.equal(formatGib(bytes), `${Number(expected).toFixed(2)}GiB`);
    });
  }
});
