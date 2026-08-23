import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  collapseGroupKey,
  comparatorRewardRisk,
  compareScanCandidates,
  groupCollapseCandidates,
  rankCollapseGroup,
} from "../supabase/functions/trade-analyzer/scanCollapse.ts";
import {
  defaultScanSymbols,
  getCorrelationGroup,
} from "../supabase/functions/trade-analyzer/symbols.ts";

const ANALYZER = "supabase/functions/trade-analyzer/index.ts";

// Every tier is asserted by EXECUTION, not by reading the argument order.
// Until this file existed the collapse was covered only by
// `source.includes("function compareScanCandidates")` in tests/core.test.ts —
// which passes against any body whatsoever, including one that sorts the wrong
// way. E4's whole measurement is decided by which candidate wins each group.
const candidate = (
  symbol: string,
  confidenceScore?: number,
  rewardRisk?: number,
  executionScore?: number,
) => ({ confidenceScore, executionScore, rewardRisk, symbol });

// The live sort call, transcribed: index.ts sorts with the arguments SWAPPED,
// and sorted[0] is the winner. The tests drive the winner through this rather
// than through compareScanCandidates directly, so they pin the direction a
// reader actually experiences.
const winnerOf = (candidates: ReturnType<typeof candidate>[]) =>
  rankCollapseGroup(candidates)[0];

describe("scan collapse — the comparator's four tiers", () => {
  it("tier 1: the highest confidence wins", () => {
    assert.equal(
      winnerOf([candidate("AAAUSD", 70, 1, 1), candidate("ZZZUSD", 80, 1, 1)])
        .symbol,
      "ZZZUSD",
    );
  });

  it("tier 2: on a confidence tie, the highest payoff wins", () => {
    assert.equal(
      winnerOf([candidate("AAAUSD", 80, 2.5, 1), candidate("ZZZUSD", 80, 1.5, 1)])
        .symbol,
      "AAAUSD",
    );
  });

  it("tier 3: on a confidence AND payoff tie, the highest execution score wins", () => {
    assert.equal(
      winnerOf([candidate("AAAUSD", 80, 2, 40), candidate("ZZZUSD", 80, 2, 90)])
        .symbol,
      "ZZZUSD",
    );
  });

  // The asymmetry, and the reason this test is worth its length: the three
  // numeric tiers are descending because the caller swaps the arguments, but
  // the symbol tier reverses a second time and cancels the swap. So the total
  // tie goes to the SMALLEST symbol, not the largest.
  it("tier 4: a total tie is won by the lexicographically smallest symbol", () => {
    assert.equal(
      winnerOf([
        candidate("ZZZUSD", 80, 2, 50),
        candidate("AAAUSD", 80, 2, 50),
        candidate("MMMUSD", 80, 2, 50),
      ]).symbol,
      "AAAUSD",
    );
  });

  it("tier 4 does not depend on input order", () => {
    const members = [
      candidate("AAAUSD", 80, 2, 50),
      candidate("MMMUSD", 80, 2, 50),
      candidate("ZZZUSD", 80, 2, 50),
    ];
    assert.equal(winnerOf(members).symbol, "AAAUSD");
    assert.equal(winnerOf([...members].reverse()).symbol, "AAAUSD");
  });

  it("an absent numeric field scores zero and loses to any positive value", () => {
    assert.equal(
      winnerOf([candidate("AAAUSD"), candidate("ZZZUSD", 1)]).symbol,
      "ZZZUSD",
    );
  });

  it("ranks the whole group winner-first, so the losers keep the order they were blocked in", () => {
    const ranked = rankCollapseGroup([
      candidate("BBBUSD", 70, 2, 50),
      candidate("AAAUSD", 90, 2, 50),
      candidate("CCCUSD", 80, 2, 50),
    ]);
    assert.deepEqual(ranked.map((entry) => entry.symbol), [
      "AAAUSD",
      "CCCUSD",
      "BBBUSD",
    ]);
  });

  it("never returns zero for two distinct symbols, so no tie survives to input order", () => {
    assert.notEqual(
      compareScanCandidates(candidate("AAAUSD"), candidate("ZZZUSD")),
      0,
    );
  });
});

describe("scan collapse — grouping", () => {
  it("groups on the primary correlation group", () => {
    const grouped = groupCollapseCandidates([
      { correlationGroup: "gold", symbol: "XAUUSD" },
      { correlationGroup: "gold", symbol: "GCUSD" },
      { correlationGroup: "silver", symbol: "XAGUSD" },
    ]);
    assert.deepEqual([...grouped.keys()], ["gold", "silver"]);
    assert.deepEqual(grouped.get("gold")?.map((entry) => entry.symbol), [
      "XAUUSD",
      "GCUSD",
    ]);
  });

  it("keys an ungrouped candidate on its own symbol, so it collapses alone", () => {
    assert.equal(collapseGroupKey({ symbol: "TRUMPUSD" }), "TRUMPUSD");
  });

  it("prefers the stated group over the symbol", () => {
    assert.equal(
      collapseGroupKey({ correlationGroup: "gold", symbol: "GCUSD" }),
      "gold",
    );
  });
});

// The quantization is the difference between replaying the live rule and
// replaying a rule that resolves on tier 2 every time. Live's comparator reads
// confluence.rewardRisk, which analyzeSetup writes rounded to two decimals; the
// sweep emits plan.rewardRisk at full precision.
describe("scan collapse — the comparator's two-decimal payoff", () => {
  it("quantizes to two decimals", () => {
    assert.equal(comparatorRewardRisk(2.34567), 2.35);
    assert.equal(comparatorRewardRisk(2.3), 2.3);
  });

  // The whole reason the quantization is load-bearing, as a worked case: two
  // payoffs that differ in the third decimal, where quantizing FLIPS the
  // winner. A replay that skips it reports the wrong market as the one
  // production would have shown.
  it("makes two payoffs that differ below the second decimal tie, as they do live", () => {
    const raw = [
      candidate("AAAUSD", 80, 2.3438, 10),
      candidate("ZZZUSD", 80, 2.3412, 90),
    ];
    assert.equal(
      comparatorRewardRisk(2.3438),
      comparatorRewardRisk(2.3412),
      "fixture must tie at two decimals or it tests nothing",
    );
    // Unquantized, AAAUSD wins on tier 2 and tier 3 is never consulted.
    assert.equal(winnerOf(raw).symbol, "AAAUSD");
    // Quantized the way live sees it, both are 2.34, so tier 3 decides and the
    // higher execution score takes it — the opposite winner.
    const quantized = raw.map((entry) => ({
      ...entry,
      rewardRisk: comparatorRewardRisk(entry.rewardRisk!),
    }));
    assert.equal(winnerOf(quantized).symbol, "ZZZUSD");
  });

  // Pinned in both directions: if the live write site stops rounding, the
  // reader's quantization is stale and this fails rather than the corpus
  // quietly measuring a different rule.
  it("the live write site still rounds to two decimals", () => {
    const source = readFileSync(ANALYZER, "utf8");
    assert.ok(
      source.includes("rewardRisk: Number(pricePlan.rewardRisk.toFixed(2))"),
      `${ANALYZER} no longer writes confluence.rewardRisk rounded to two ` +
        `decimals — comparatorRewardRisk in scanCollapse.ts mirrors that ` +
        `rounding and is now wrong`,
    );
  });

  it("the acceptance gate still reads the UNROUNDED payoff", () => {
    const source = readFileSync(ANALYZER, "utf8");
    assert.ok(
      source.includes("pricePlan.rewardRisk < calibration.minRewardRisk"),
      `${ANALYZER} must gate on the unrounded payoff — the two-decimal value ` +
        `exists for the comparator and the display, never for a decision`,
    );
  });
});

describe("scan collapse — the live path uses this module, not a copy", () => {
  it("index.ts imports the extracted collapse rather than defining its own", () => {
    const source = readFileSync(ANALYZER, "utf8");
    assert.ok(
      source.includes(`from "./scanCollapse.ts"`),
      `${ANALYZER} must import the shared collapse module — a second copy of ` +
        `the comparator is the defect this extraction exists to prevent`,
    );
    assert.ok(
      !source.includes("function compareScanCandidates"),
      `${ANALYZER} still defines its own compareScanCandidates — the offline ` +
        `E4 reader would then replay a transcription, not the live rule`,
    );
  });

  // The cross-runtime hazard, pinned rather than fixed. compareScanCandidates
  // ties on localeCompare while both sibling comparators deliberately use code
  // units, because locale collation is not guaranteed equal across runtimes —
  // and this module now runs in Node (the E4 reader) as well as Deno. Over the
  // live roster the two orderings agree, so the live tie-break is left exactly
  // as it has always been; a symbol that ever breaks the equivalence fails
  // here instead of silently picking a different winner in one runtime.
  it("localeCompare and code-unit order agree over every scan symbol", () => {
    const symbols = [...defaultScanSymbols].sort();
    for (const first of symbols) {
      for (const second of symbols) {
        if (first === second) {
          continue;
        }
        const locale = Math.sign(first.localeCompare(second));
        const codeUnit = first < second ? -1 : 1;
        assert.equal(
          locale,
          codeUnit,
          `${first} vs ${second}: localeCompare and code-unit ordering ` +
            `disagree, so the collapse tie-break is runtime-dependent — ` +
            `decide the tie-break deliberately before shipping this symbol`,
        );
      }
    }
  });
});

// The two mechanisms read DIFFERENT populations, and a reader that uses one
// grouping for both measures something that never ran. This pins the half the
// collapse owns: the primary group is single-membership.
describe("scan collapse — the primary group is not the RM-5 union", () => {
  it("every scan symbol resolves to exactly one primary group key", () => {
    for (const symbol of defaultScanSymbols) {
      const key = collapseGroupKey({
        correlationGroup: getCorrelationGroup(symbol),
        symbol,
      });
      assert.equal(typeof key, "string");
      assert.ok(key.length > 0, `${symbol} resolved to an empty group key`);
    }
  });

  it("an ungrouped symbol keys on itself, which is what makes it a singleton", () => {
    const ungrouped = defaultScanSymbols.filter(
      (symbol) => getCorrelationGroup(symbol) === symbol,
    );
    for (const symbol of ungrouped) {
      assert.equal(collapseGroupKey({ correlationGroup: symbol, symbol }), symbol);
    }
  });
});
