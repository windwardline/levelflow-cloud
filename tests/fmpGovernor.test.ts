import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  BASE_PLAN_BYTES,
  maySpend,
  readLedger,
  recordUsage,
  spentToday,
  spentTrailing30,
} from "../scripts/fmpGovernor.ts";

/**
 * The owner's rule, mechanised: background work does not touch the allowance
 * unless the app needs it, the bulk of each 30-day window stays unused, and a
 * spender nobody remembered cannot quietly exist.
 *
 * THE POPULATION IS DERIVED, NEVER LISTED. That is the whole point — a fifth
 * script written next month is exactly the case a hand-maintained list cannot
 * cover, and measured 2026-08-31 the situation was four spenders, one breaker
 * reader, one byte budget, and that budget per PROCESS rather than per day.
 */

const scratch = () => join(mkdtempSync(join(tmpdir(), "gov-")), "usage.json");
/**
 * A CLOSED breaker in a temp file. Without this every ceiling test reads this
 * machine's live marker — which is open tonight, because the allowance really
 * is exhausted — and the suite would pass or fail on the weather.
 */
const closedCircuit = () => join(mkdtempSync(join(tmpdir(), "circ-")), "c.json");
const DAY = 86_400_000;

describe("every FMP spender goes through the governor", () => {
  /** Files that reach FMP, discovered from the tree rather than enumerated. */
  // From the FILESYSTEM, not `git ls-files`. Same population, one fewer
  // dependency: `scripts/scratch-clone.sh --no-git` produces a tree with no
  // `.git`, and four tests already fail there in a way that reads as missing
  // DATA rather than a missing directory. There is no reason to make it five.
  const spenders = readdirSync("scripts")
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `scripts/${name}`)
    .filter((path) => {
      const source = readFileSync(path, "utf8");
      // The provider's host, not a mention of it: the governor and the breaker
      // both TALK about FMP without calling it.
      return /financialmodelingprep\.com/.test(source) &&
        !path.endsWith("fmpGovernor.ts") && !path.endsWith("fmpCircuit.ts");
    });

  it("finds the spenders at all", () => {
    // A discovery that returns nothing passes every assertion below.
    assert.ok(
      spenders.length >= 3,
      `only ${spenders.length} FMP spender(s) discovered — the detector broke, ` +
        `and a broken detector reads exactly like a clean tree`,
    );
  });

  for (const path of spenders) {
    it(`${path} asks the governor before it spends`, () => {
      const source = readFileSync(path, "utf8");
      assert.match(
        source,
        /from "\.\/fmpGovernor\.ts"|from "\.\.\/fmpGovernor\.ts"/,
        `${path} reaches FMP without importing the governor. Every spender ` +
          `goes through one chokepoint, or the daily ceiling is a suggestion ` +
          `and the breaker reaches one of four again`,
      );
      // THE CALL AND THE REFUSAL, not just the name. A first draft asserted
      // `/maySpend\(/` and a mutation deleting the whole gate SURVIVED — the
      // import line alone satisfied it. A guard whose absence the suite cannot
      // feel is not a guard.
      assert.match(
        source,
        /maySpend\(\{/,
        `${path} imports the governor and never calls it`,
      );
      assert.match(
        source,
        /!\w*[Gg]ate\w*\.allowed|!\w*\.allowed/,
        `${path} calls the governor and ignores the answer — a decision that ` +
          `nothing branches on is a comment`,
      );
      assert.match(
        source,
        /noteRefusal\(/,
        `${path} never reports a refusal, so its discovery of the wall stays ` +
          `private and every other consumer rediscovers it`,
      );
    });
  }
});

describe("the ledger is a DAY, not a process", () => {
  it("accumulates across processes", () => {
    // The defect this replaces: `createByteBudget` held `let spent = 0` in a
    // closure, so a 2 GiB ceiling meant 2 GiB per launchd firing. Two runs in
    // a day spent 4 GiB against a ceiling that read as 2.
    const path = scratch();
    const at = Date.parse("2026-08-31T12:00:00Z");
    recordUsage(1_000_000, at, path);
    recordUsage(2_000_000, at, path);
    assert.equal(spentToday(at, path), 3_000_000);
  });

  it("keys on the UTC day, so a run either side of midnight is two days", () => {
    const path = scratch();
    const before = Date.parse("2026-08-31T23:59:00Z");
    const after = Date.parse("2026-09-01T00:01:00Z");
    recordUsage(5_000_000, before, path);
    recordUsage(7_000_000, after, path);
    assert.equal(spentToday(before, path), 5_000_000);
    assert.equal(spentToday(after, path), 7_000_000);
  });

  it("answers the question FMP actually bills — the trailing 30 days", () => {
    const path = scratch();
    const now = Date.parse("2026-08-31T12:00:00Z");
    for (let back = 0; back < 40; back += 1) {
      recordUsage(1_000_000, now - back * DAY, path);
    }
    // 30 days inclusive of today, and the 10 older days are outside the window
    // even though some survive in the ledger for context.
    assert.equal(spentTrailing30(now, path), 30_000_000);
  });

  it("prunes beyond the retained window rather than growing forever", () => {
    const path = scratch();
    const now = Date.parse("2026-08-31T12:00:00Z");
    for (let back = 0; back < 60; back += 1) {
      recordUsage(1_000, now - back * DAY, path);
    }
    assert.ok(Object.keys(readLedger(path)).length <= 35);
  });

  it("invents nothing from an unreadable ledger", () => {
    // Fails OPEN where the breaker fails CLOSED, and the asymmetry is the
    // point: a fabricated total refuses work just as wrongly as a missed one.
    const path = scratch();
    writeFileSync(path, "{ not json");
    assert.deepEqual(readLedger(path), {});
    assert.equal(spentToday(Date.now(), path), 0);
  });
});

describe("the daily ceiling refuses, and says what it knows", () => {
  const at = Date.parse("2026-08-31T12:00:00Z");

  it("allows a spender under its ceiling", () => {
    const path = scratch();
    const decision = maySpend({
      atMs: at,
      circuitPath: closedCircuit(),
      dailyLimitBytes: 10_000_000,
      label: "probe",
      usagePath: path,
    });
    assert.equal(decision.allowed, true);
  });

  it("refuses once the DAY is spent, however many processes spent it", () => {
    const path = scratch();
    recordUsage(6_000_000, at, path);
    recordUsage(5_000_000, at, path);
    const decision = maySpend({
      atMs: at,
      circuitPath: closedCircuit(),
      dailyLimitBytes: 10_000_000,
      label: "probe",
      usagePath: path,
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /per UTC day, not per process/);
    assert.match(decision.reason, /Trailing 30 days/);
  });

  it("refuses a ceiling that reads as nothing rather than meaning unlimited", () => {
    for (const limit of [0, -1, Number.NaN]) {
      const decision = maySpend({
        atMs: at,
        circuitPath: closedCircuit(),
        dailyLimitBytes: limit,
        label: "probe",
        usagePath: scratch(),
      });
      assert.equal(decision.allowed, false, `limit ${limit} was allowed`);
      assert.match(decision.reason, /reads as nothing/);
    }
  });

  it("states the base plan rather than a boost, so the steady state is legible", () => {
    // A ceiling that moves when someone buys a boost teaches nothing about the
    // consumption the owner is trying to hold down.
    assert.equal(BASE_PLAN_BYTES, 150 * 1024 * 1024 * 1024);
  });
});

describe("the breaker and the ledger are anchored to the repo, not the cwd", () => {
  it("resolves both paths from the module", () => {
    // A scratch clone resolving these against its own cwd reads a CLOSED
    // breaker and an EMPTY ledger — believing the allowance is untouched at
    // exactly the moment that belief is most expensive.
    const circuit = readFileSync("scripts/fmpCircuit.ts", "utf8");
    assert.match(circuit, /fileURLToPath\(import\.meta\.url\)/);
    const governor = readFileSync("scripts/fmpGovernor.ts", "utf8");
    assert.match(governor, /fileURLToPath\(import\.meta\.url\)/);
  });
});
