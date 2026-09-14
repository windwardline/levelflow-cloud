import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { completedDailyBars } from "../supabase/functions/trade-analyzer/dailyCompletion.ts";
import { type QuoteCurrencyRateMemo, resolveQuoteCurrencyUsd } from "../supabase/functions/trade-analyzer/quoteCurrencyRate.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * The live half of the cross commission's rate: the USD leg's previous
 * completed daily close, memoised per scan request, refused by name when the
 * leg cannot be read. Pure, so it is tested here under Node; index.ts wires
 * it beside the market load (pinned by source in crossCommissionRate.test.ts).
 */

// A Wednesday in June: forex daily bars stamped Monday..Wednesday complete
// at their New York close, and only the completed ones are readable.
const NOW = Date.parse("2026-06-17T12:00:00.000Z");

function dailyBars(close: number, days = 10): Bar[] {
  return Array.from({ length: days }, (_, index) => ({
    close: close + index * 0.001,
    high: close * 1.01,
    low: close * 0.99,
    open: close,
    time: Date.parse("2026-06-05T00:00:00.000Z") + index * 86_400_000,
    volume: 1,
  }));
}

describe("resolveQuoteCurrencyUsd", () => {
  it("answers none for every symbol whose commission needs no rate, loading nothing", async () => {
    let loads = 0;
    const loadDaily = () => { loads += 1; return Promise.resolve(dailyBars(1)); };
    for (const symbol of ["EURUSD", "USDJPY", "XAUUSD", "ESUSD", "BTCUSD", "NOPE"]) {
      const answer = await resolveQuoteCurrencyUsd({ loadDaily, memo: new Map(), nowMs: NOW, symbol });
      assert.deepEqual(answer, { kind: "none" }, symbol);
    }
    assert.equal(loads, 0);
  });

  it("prices a USD-based leg inverted and a USD-quoted leg direct, from the last COMPLETED bar", async () => {
    const usdjpy = dailyBars(153.5);
    const gbpusd = dailyBars(1.35);
    const loadDaily = (leg: string) => Promise.resolve(leg === "USDJPY" ? usdjpy : gbpusd);
    const eurjpy = await resolveQuoteCurrencyUsd({ loadDaily, memo: new Map(), nowMs: NOW, symbol: "EURJPY" });
    const eurgbp = await resolveQuoteCurrencyUsd({ loadDaily, memo: new Map(), nowMs: NOW, symbol: "EURGBP" });
    assert.equal(eurjpy.kind, "rate");
    assert.equal(eurgbp.kind, "rate");
    if (eurjpy.kind !== "rate" || eurgbp.kind !== "rate") return;
    const lastJpy = completedDailyBars("USDJPY", usdjpy, NOW).at(-1)!;
    const lastGbp = completedDailyBars("GBPUSD", gbpusd, NOW).at(-1)!;
    assert.ok(lastJpy.time < usdjpy.at(-1)!.time, "the gate must withhold the forming and weekend bars for this to bite");
    assert.deepEqual(eurjpy.rate, { leg: "USDJPY", legCloseAtMs: lastJpy.time, usdPerQuote: 1 / lastJpy.close });
    assert.deepEqual(eurgbp.rate, { leg: "GBPUSD", legCloseAtMs: lastGbp.time, usdPerQuote: lastGbp.close });
  });

  it("memoises the leg's load by PROMISE: concurrent first callers share one load", async () => {
    let loads = 0;
    const loadDaily = async () => { loads += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return dailyBars(153.5); };
    const memo: QuoteCurrencyRateMemo = new Map();
    const answers = await Promise.all(
      ["EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "CHFJPY", "NZDJPY"].map((symbol) =>
        resolveQuoteCurrencyUsd({ loadDaily, memo, nowMs: NOW, symbol })
      ),
    );
    assert.equal(loads, 1, "six crosses on one leg, one load");
    assert.ok(answers.every((answer) => answer.kind === "rate"));
    assert.equal(new Set(answers.map((answer) => answer.kind === "rate" ? answer.rate.usdPerQuote : NaN)).size, 1);
  });

  it("is unavailable, naming the leg, when the load throws — and the detail is scrubbed at birth", async () => {
    const loadDaily = () => Promise.reject(new Error("FMP request failed: https://financialmodelingprep.com/stable/x?symbol=USDJPY&apikey=SECRET123"));
    const answer = await resolveQuoteCurrencyUsd({ loadDaily, memo: new Map(), nowMs: NOW, symbol: "EURJPY" });
    assert.equal(answer.kind, "unavailable");
    if (answer.kind !== "unavailable") return;
    assert.equal(answer.leg, "USDJPY");
    assert.doesNotMatch(answer.detail, /SECRET123/);
    assert.match(answer.detail, /apikey=REDACTED/);
  });

  it("is unavailable when the leg has no completed bar", async () => {
    // Bars stamped after now: nothing has completed.
    const future = dailyBars(153.5).map((bar) => ({ ...bar, time: NOW + 86_400_000 + bar.time - Date.parse("2026-06-05T00:00:00.000Z") }));
    const answer = await resolveQuoteCurrencyUsd({ loadDaily: () => Promise.resolve(future), memo: new Map(), nowMs: NOW, symbol: "EURJPY" });
    assert.deepEqual(answer, { detail: "no completed daily bar", kind: "unavailable", leg: "USDJPY" });
    const empty = await resolveQuoteCurrencyUsd({ loadDaily: () => Promise.resolve([]), memo: new Map(), nowMs: NOW, symbol: "EURJPY" });
    assert.equal(empty.kind, "unavailable");
  });
});
