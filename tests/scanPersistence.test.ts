import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  persistScannedOpportunities,
  type ScanWriteOutcome,
} from "../supabase/functions/trade-analyzer/scanPersistence.ts";

// Spec §17m.2: "Every qualifying setup the Scan column generates persists to
// history/Insights/the cohort." The owner watched a scan fill the rail and
// leave Insights empty, and nothing anywhere reported it — the scan path
// caught every write failure, logged it to a console, and returned the full
// qualified count regardless.
//
// This file pins the contract that replaced that: every opportunity the
// response shows is accounted for exactly once, as written, skipped for a live
// position (C2), or FAILED — and a failure is reported, never swallowed.
type Context = { symbol: string };

function contextsFor(symbols: string[]): Map<string, Context> {
  return new Map(symbols.map((symbol) => [symbol, { symbol }]));
}

function opportunitiesFor(symbols: string[]) {
  return symbols.map((symbol) => ({ symbol }));
}

describe("scan persistence — the contract the response carries", () => {
  it("writes every qualifying opportunity exactly once", async () => {
    const symbols = ["EURUSD", "XAUUSD", "BTCUSD", "USDJPY", "ETHUSD"];
    const written: string[] = [];
    const report = await persistScannedOpportunities<Context>({
      contexts: contextsFor(symbols),
      onFailure: () => assert.fail("no failure was expected"),
      opportunities: opportunitiesFor(symbols),
      write: async (context) => {
        written.push(context.symbol);
        return { outcome: "inserted" };
      },
    });

    assert.deepEqual(written.sort(), [...symbols].sort());
    assert.deepEqual(report, {
      attempted: 5,
      failed: 0,
      persisted: 5,
      skipped: 0,
    });
  });

  it("balances: persisted + skipped + failed always equals attempted", async () => {
    const outcomes: Record<string, ScanWriteOutcome> = {
      BTCUSD: "skipped_live_position",
      ETHUSD: "updated",
      EURUSD: "inserted",
    };
    const report = await persistScannedOpportunities<Context>({
      contexts: contextsFor(["EURUSD", "ETHUSD", "BTCUSD", "XAUUSD"]),
      onFailure: () => {},
      opportunities: opportunitiesFor([
        "EURUSD",
        "ETHUSD",
        "BTCUSD",
        "XAUUSD",
      ]),
      write: async (context) => {
        const outcome = outcomes[context.symbol];
        if (!outcome) {
          throw new Error("PostgREST said no");
        }
        return { outcome };
      },
    });

    assert.deepEqual(report, {
      attempted: 4,
      failed: 1,
      persisted: 2,
      skipped: 1,
    });
    assert.equal(
      report.persisted + report.skipped + report.failed,
      report.attempted,
    );
  });

  it("counts the C2 live-position guard as skipped, never as written", async () => {
    // The guard itself is correct and stays (a scan must not rewrite a live
    // position) — what it may not do is masquerade as a write, which is how a
    // scan that saved nothing could report a clean run.
    const report = await persistScannedOpportunities<Context>({
      contexts: contextsFor(["EURUSD"]),
      onFailure: () => assert.fail("a live-position skip is not a failure"),
      opportunities: opportunitiesFor(["EURUSD"]),
      write: async () => ({ outcome: "skipped_live_position" }),
    });

    assert.equal(report.persisted, 0);
    assert.equal(report.skipped, 1);
    assert.equal(report.failed, 0);
  });

  it("reports every write failure and still writes the rest", async () => {
    const failures: string[] = [];
    const written: string[] = [];
    const report = await persistScannedOpportunities<Context>({
      contexts: contextsFor(["EURUSD", "XAUUSD", "BTCUSD"]),
      onFailure: (symbol, error) => {
        failures.push(
          `${symbol}: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
      opportunities: opportunitiesFor(["EURUSD", "XAUUSD", "BTCUSD"]),
      write: async (context) => {
        if (context.symbol === "XAUUSD") {
          throw new Error("row level security");
        }
        written.push(context.symbol);
        return { outcome: "inserted" };
      },
    });

    // The scan the user is looking at is never blanked by a write failure —
    // the other two markets still landed.
    assert.deepEqual(written.sort(), ["BTCUSD", "EURUSD"]);
    assert.deepEqual(failures, ["XAUUSD: row level security"]);
    assert.deepEqual(report, {
      attempted: 3,
      failed: 1,
      persisted: 2,
      skipped: 0,
    });
  });

  it("treats a missing write context as a failure, not a silent drop", async () => {
    // One context per non-blocked market is built by the caller, so an
    // opportunity without one means the response's qualified set and the
    // written set have diverged — the exact defect class §17m.2 names.
    const failures: string[] = [];
    const report = await persistScannedOpportunities<Context>({
      contexts: contextsFor(["EURUSD"]),
      onFailure: (symbol) => {
        failures.push(symbol);
      },
      opportunities: opportunitiesFor(["EURUSD", "GHOSTUSD"]),
      write: async () => ({ outcome: "inserted" }),
    });

    assert.deepEqual(failures, ["GHOSTUSD"]);
    assert.equal(report.attempted, 2);
    assert.equal(report.persisted, 1);
    assert.equal(report.failed, 1);
  });

  it("never throws out of the pass — a failing write cannot 500 the scan", async () => {
    await persistScannedOpportunities<Context>({
      contexts: contextsFor(["EURUSD"]),
      onFailure: () => {},
      opportunities: opportunitiesFor(["EURUSD"]),
      write: async () => {
        throw new Error("boom");
      },
    });
  });

  it("bounds concurrency rather than firing every write at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const symbols = Array.from({ length: 12 }, (_, index) => `SYM${index}`);
    await persistScannedOpportunities<Context>({
      concurrency: 4,
      contexts: contextsFor(symbols),
      onFailure: () => {},
      opportunities: opportunitiesFor(symbols),
      write: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return { outcome: "inserted" };
      },
    });

    assert.equal(peak, 4);
  });
});

describe("scan persistence — the call site honours the contract", () => {
  const analyzer = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  it("persists the exact set the response returns", () => {
    // Ranked, correlation-collapsed opportunities — the same array the
    // response's `opportunities` and `qualified` come from, so the record and
    // the rail can never disagree about what qualified.
    assert.match(
      analyzer,
      /const persistence = await persistScannedOpportunities\(\{[\s\S]{0,900}opportunities: rankedOpportunities,/,
    );
    assert.match(
      analyzer,
      /return \{\s*blocked,\s*opportunities: rankedOpportunities,\s*persistence,\s*qualified: rankedOpportunities\.length,/,
    );
  });

  it("reports every persistence failure to analyzer telemetry", () => {
    // Both directions: the report reaches the client, and the failure reaches
    // the record. A console.error alone is what made the live gap invisible.
    assert.match(analyzer, /onFailure: async \(symbol, error\) => \{/);
    assert.match(
      analyzer,
      /Scan setup persistence failed: \$\{[\s\S]{0,200}status: "scan_failure",/,
    );
    assert.match(
      analyzer,
      /status: scan\.persistence\.failed > 0 \? "scan_failure" : "success",/,
    );
    assert.match(analyzer, /persistence: scan\.persistence,/);
  });

  it("keeps the C2 live-position guard, now reported as a skip", () => {
    assert.match(
      analyzer,
      /if \(origin === "scan" && activeSetup && activeSetup\.status === "placed"\) \{\s*return \{\s*deduplicated: true,\s*outcome: "skipped_live_position",/,
    );
  });

  it("stamps every write path with the outcome it performed", () => {
    const outcomes = analyzer.match(/outcome: "(?:inserted|updated|skipped_live_position)"/g) ??
      [];
    assert.deepEqual(outcomes, [
      'outcome: "skipped_live_position"',
      'outcome: "updated"',
      'outcome: "inserted"',
    ]);
  });

  it("trains global learning on every origin, so the only door still feeds the cohort", () => {
    // §17m.1 deleted the stage's Review button; a review-origin-only learning
    // query would therefore have had no eligible rows to train on at all.
    assert.doesNotMatch(analyzer, /origin=eq\.review/);
    assert.match(
      analyzer,
      /trade_setups\?select=id,symbol,correlation_group,confluence&id=in\./,
    );
  });

  it("keeps one bounded-concurrency helper for the sweep and the writes", () => {
    assert.match(
      analyzer,
      /import \{ mapWithConcurrency \} from "\.\/concurrency\.ts";/,
    );
    assert.doesNotMatch(analyzer, /async function mapWithConcurrency/);
  });
});
