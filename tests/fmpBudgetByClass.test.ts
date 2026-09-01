import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FMP_DAILY_CEILINGS,
  type FmpBudgetDeps,
  mayFetch,
  readAndRecord,
  recordFetch,
} from "../supabase/functions/trade-analyzer/fmpBudget.ts";

/**
 * The Edge functions share one allowance and could not see each other's
 * spending. `scripts/fmpGovernor.ts` solved that for the local tooling with a
 * file; ephemeral isolates cannot read a file, so this shares through the
 * database — the pattern `market_bars` proved.
 *
 * THE PRIORITY ORDER IS THE POINT. The standing rule: background work does not
 * touch the allowance unless the app needs it, the bulk of each 30-day window
 * stays unused, and of what IS spent the bulk should be live users generating
 * real trades. A single total cannot express "background yields first".
 */

function deps(over: Partial<FmpBudgetDeps> = {}): FmpBudgetDeps & {
  claims: Array<[string, number]>;
  records: Array<[string, number]>;
} {
  const claims: Array<[string, number]> = [];
  const records: Array<[string, number]> = [];
  return {
    claims,
    records,
    claim: async (cls, limit) => {
      claims.push([cls, limit]);
      return [{
        allowed: true,
        limit_bytes: limit,
        spent_today: 0,
        trailing_30_bytes: 0,
      }];
    },
    record: async (cls, bytes) => {
      records.push([cls, bytes]);
    },
    ...over,
  };
}

describe("the ceilings encode the rule, not a preference", () => {
  it("leaves the bulk of the plan unused", () => {
    // 150 GB per trailing 30 days is 5 GB/day at break-even — the rate that
    // consumes the allowance exactly and leaves nothing for growth. The rule
    // is that the BULK stays unused, so the ceilings sum to a fifth of that.
    const total = FMP_DAILY_CEILINGS.user + FMP_DAILY_CEILINGS.background;
    const breakEvenPerDay = (150 * 1024 * 1024 * 1024) / 30;
    assert.ok(
      total <= breakEvenPerDay * 0.25,
      `the ceilings sum to ${(total / 1e6).toFixed(0)} MB/day against a ` +
        `break-even of ${(breakEvenPerDay / 1e6).toFixed(0)} MB/day — that is ` +
        `not "the bulk stays unused"`,
    );
  });

  it("gives the user class the larger share", () => {
    // "Of what IS spent, the bulk should be live users generating real
    // trades." A background share at or above the user's would invert it.
    assert.ok(
      FMP_DAILY_CEILINGS.user > FMP_DAILY_CEILINGS.background * 3,
      "background's share is not decisively smaller, so it does not yield " +
        "first in any meaningful sense",
    );
  });

  it("still affords a real desk", () => {
    // A full 97-market scan is ~6 MB with the store warm. A ceiling that
    // cannot serve a working day is a bug wearing a policy's clothes.
    const fullScanBytes = 6 * 1024 * 1024;
    assert.ok(
      FMP_DAILY_CEILINGS.user / fullScanBytes >= 100,
      `the user ceiling affords only ` +
        `${(FMP_DAILY_CEILINGS.user / fullScanBytes).toFixed(0)} full scans a day`,
    );
  });
});

describe("the decision", () => {
  it("asks with the class's own ceiling", async () => {
    const d = deps();
    await mayFetch(d, "background");
    assert.deepEqual(d.claims, [["background", FMP_DAILY_CEILINGS.background]]);
  });

  it("refuses when the class has spent its day, and says what it knows", async () => {
    const d = deps({
      claim: async () => [{
        allowed: false,
        limit_bytes: FMP_DAILY_CEILINGS.background,
        spent_today: FMP_DAILY_CEILINGS.background,
        trailing_30_bytes: 4_000_000_000,
      }],
    });
    const decision = await mayFetch(d, "background");
    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? "", /background has spent its day/);
    assert.match(decision.reason ?? "", /Trailing 30 days/);
  });

  it("FAILS OPEN when the ledger is unreachable, and says so", async () => {
    // Deliberately the opposite of `claimMarketDataRequest`, which fails
    // CLOSED. That one guards an unbounded per-request path where a meter
    // that cannot answer is all that stands between one tab and the
    // allowance. This is a daily aggregate over paths already bounded per
    // request, and refusing the whole desk because the ledger blinked would
    // take the product down to protect a budget.
    for (const broken of [
      { claim: async () => { throw new Error("ledger down"); } },
      { claim: async () => [] },
    ]) {
      const decision = await mayFetch(deps(broken as Partial<FmpBudgetDeps>), "user");
      assert.equal(decision.allowed, true);
      assert.match(decision.reason ?? "", /not accounted/);
    }
  });
});

describe("the accounting", () => {
  it("charges the class that spent it", async () => {
    const d = deps();
    await recordFetch(d, "user", 4096);
    assert.deepEqual(d.records, [["user", 4096]]);
  });

  it("ignores a non-cost rather than writing a zero row", async () => {
    const d = deps();
    for (const bytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await recordFetch(d, "user", bytes);
    }
    assert.deepEqual(d.records, []);
  });

  it("never throws on a failed write", async () => {
    // These bytes were spent before they could be counted. Failing the
    // request that already paid for them turns one accounting outage into a
    // user-visible error on a response the desk already holds.
    const d = deps({ record: async () => { throw new Error("down"); } });
    await recordFetch(d, "user", 1024);
  });

  it("measures the body once, for the caller and the ledger", async () => {
    const d = deps();
    const body = await readAndRecord(d, { text: async () => "hello" }, "user");
    assert.equal(body, "hello");
    assert.deepEqual(d.records, [["user", 5]]);
  });
});

describe("every Edge path that reaches the provider is accounted", () => {
  // DERIVED, not listed — the same mechanism as the scripts governor. A fifth
  // Edge module written next month is exactly what a hand-kept list misses.
  const spenders = execFileSync("grep", [
    "-rl", "financialmodelingprep", "supabase/functions",
  ], { encoding: "utf8" }).split("\n").filter(Boolean);

  it("finds them at all", () => {
    assert.ok(
      spenders.length >= 3,
      `only ${spenders.length} Edge spender(s) found — the detector broke, ` +
        `which reads exactly like a clean tree`,
    );
  });

  for (const path of spenders) {
    it(`${path} charges what it spends`, () => {
      const source = readFileSync(path, "utf8");
      assert.match(
        source,
        /recordFetch\(|readAndRecord\(/,
        `${path} buys provider bytes and never charges them to the ledger, ` +
          `so the trailing-30 total under-reports and the ceilings guard less ` +
          `than they claim`,
      );
    });
  }
});

describe("the Edge graph type-checks against its REAL runtime", () => {
  // THE GAP THIS CLOSES, found 2026-09-01 while wiring the budget: the Edge
  // modules are excluded from `tsconfig.tests.json` because they use Deno
  // globals, so `npm run check` never sees them — and ESLint does not flag an
  // undefined identifier in them either. A missing import in `marketLoader.ts`
  // therefore passes typecheck, lint and every test, and fails at runtime in
  // the deployed analyzer. It happened twice inside one change.
  //
  // A BASELINE RATHER THAN ZERO, stated honestly: the graph carries 14
  // pre-existing errors that nothing has ever checked. Gating at zero would
  // mean fixing fourteen type errors on the money path in the same change set
  // that adds a budget, which is how a careful change becomes a risky one.
  // The gate is "no NEW errors", and it would have caught both of mine.
  const BASELINE: Record<string, number> = {
    "market-data": 1,
    "news-calendar": 0,
    "outcome-sync": 1,
    "trade-analyzer": 12,
  };

  const hasDeno = (() => {
    try {
      execFileSync("deno", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  for (const [fn, allowed] of Object.entries(BASELINE)) {
    it(`${fn} adds no new type error`, (t) => {
      if (!hasDeno) {
        // Stated, never silent: this suite's own law is that a stand-down
        // says why.
        t.skip("deno is not installed here, so the real runtime's type-checker cannot run");
        return;
      }
      const entry = `supabase/functions/${fn}/index.ts`;
      assert.ok(existsSync(entry), `${entry} is gone — re-anchor this gate`);
      let output = "";
      try {
        execFileSync("deno", ["check", entry], { encoding: "utf8", stdio: "pipe" });
      } catch (error) {
        const shell = error as { stderr?: string; stdout?: string };
        output = `${shell.stdout ?? ""}${shell.stderr ?? ""}`;
      }
      const count = (output.match(/TS\d{4}/g) ?? []).length;
      assert.ok(
        count <= allowed,
        `${entry} now has ${count} type error(s) against a baseline of ` +
          `${allowed}. Nothing else in this repo checks these files: ` +
          `npm run check excludes them and lint does not see an undefined ` +
          `identifier in them.\n${output.slice(0, 1200)}`,
      );
    });
  }
});
