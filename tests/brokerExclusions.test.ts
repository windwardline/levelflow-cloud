import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BROKER_VISIBILITY_EXCLUSIONS,
  MIN_FILLED_FOR_PERFORMANCE_EXCLUSION,
  MIN_SURVIVAL_FOR_PERFORMANCE_EXCLUSION,
  isExcludedForAccountType,
  isReentryCandidate,
  reentryCandidates,
  type BrokerVisibilityExclusion,
} from "../src/lib/broker/exclusions.ts";

// Amendment 24 (§19 retrofit, Task 19, owner 2026-08-05, distilled): the
// first-class, per-account-type owner-exclusion register. §19f discipline:
// every entry's literal shape is pinned here, so a change to what is
// excluded — or on which account type — cannot land without a deliberate
// test edit.

describe("BROKER_VISIBILITY_EXCLUSIONS — the register's current content", () => {
  it("carries exactly one entry today: BRENT, scoped to forex only", () => {
    assert.equal(BROKER_VISIBILITY_EXCLUSIONS.length, 1);
    const [brent] = BROKER_VISIBILITY_EXCLUSIONS;
    assert.equal(brent.levelflowSymbol, "BRENT");
    assert.deepEqual(brent.accountTypes, ["forex"]);
    assert.equal(brent.ground, "data-drift");
    assert.ok(brent.detail.length > 20, "BRENT's exclusion detail is too thin");
  });

  it("every entry names at least one account type — an exclusion naming zero would not exclude anything", () => {
    for (const exclusion of BROKER_VISIBILITY_EXCLUSIONS) {
      assert.ok(
        exclusion.accountTypes.length > 0,
        `${exclusion.levelflowSymbol} names no account types`,
      );
    }
  });

  it("every entry's ground is one of the three named grounds", () => {
    for (const exclusion of BROKER_VISIBILITY_EXCLUSIONS) {
      assert.ok(
        ["no-fmp-source", "data-drift", "sweep-performance"].includes(exclusion.ground),
        `${exclusion.levelflowSymbol} carries an unrecognized ground: ${exclusion.ground}`,
      );
    }
  });

  it("every entry carries a non-empty detail citation", () => {
    for (const exclusion of BROKER_VISIBILITY_EXCLUSIONS) {
      assert.equal(typeof exclusion.detail, "string");
      assert.ok(exclusion.detail.length > 0, `${exclusion.levelflowSymbol} has an empty detail`);
    }
  });
});

describe("isExcludedForAccountType", () => {
  it("BRENT is excluded on forex", () => {
    assert.equal(isExcludedForAccountType("BRENT", "forex"), true);
  });

  it("BRENT is not excluded on crypto or futures — it is not offered there either, but the predicate itself must say so honestly", () => {
    assert.equal(isExcludedForAccountType("BRENT", "crypto"), false);
    assert.equal(isExcludedForAccountType("BRENT", "futures"), false);
  });

  it("a symbol with no register entry is excluded on no account type", () => {
    assert.equal(isExcludedForAccountType("EURUSD", "forex"), false);
    assert.equal(isExcludedForAccountType("EURUSD", "crypto"), false);
    assert.equal(isExcludedForAccountType("EURUSD", "futures"), false);
  });

  it("accepts an injected exclusion list instead of the real register — the mechanism is testable without editing production data", () => {
    const synthetic: readonly BrokerVisibilityExclusion[] = [
      {
        levelflowSymbol: "BTCUSD",
        accountTypes: ["crypto"],
        ground: "sweep-performance",
        detail: "test fixture — not a real exclusion",
      },
    ];
    assert.equal(isExcludedForAccountType("BTCUSD", "crypto", synthetic), true);
    assert.equal(isExcludedForAccountType("BTCUSD", "forex", synthetic), false);
    // And the real register is untouched by passing a synthetic one in.
    assert.equal(isExcludedForAccountType("BTCUSD", "crypto"), false);
  });
});

describe("the reentry rule — no visibility exclusion is permanent", () => {
  it("isReentryCandidate returns true for every current entry", () => {
    for (const exclusion of BROKER_VISIBILITY_EXCLUSIONS) {
      assert.equal(isReentryCandidate(exclusion), true);
    }
  });

  it("isReentryCandidate returns true even for a hypothetical entry the register does not carry today — the fact is a standing invariant, not a per-row flag that could be set false", () => {
    const hypothetical: BrokerVisibilityExclusion = {
      levelflowSymbol: "SOME-FUTURE-SYMBOL",
      accountTypes: ["futures"],
      ground: "no-fmp-source",
      detail: "a hypothetical future exclusion",
    };
    assert.equal(isReentryCandidate(hypothetical), true);
  });

  it("reentryCandidates() returns every entry in the register, no fewer", () => {
    assert.deepEqual(reentryCandidates(), BROKER_VISIBILITY_EXCLUSIONS);
  });

  it("BrokerVisibilityExclusion's own type carries no field that could mark an entry permanent", () => {
    const [brent] = BROKER_VISIBILITY_EXCLUSIONS;
    const keys = Object.keys(brent).sort();
    assert.deepEqual(keys, ["accountTypes", "detail", "ground", "levelflowSymbol"]);
  });
});

// Amendment 25 (owner, 2026-08-06). One failure repeated five times in a single
// night — oil, indices, copper/gas, oats/rice, livestock — each a market that
// looked edgeless and was in fact constrained by our own parameters. The rule:
// a market's measured performance may not exclude it unless the market had a
// fair chance to produce evidence. Enforced here rather than documented, and
// deliberately enforced on the REGISTER, so it binds every broker that ever
// lands an exclusion in it, not just E8.
describe("amendment 25 — a performance exclusion must prove the market was not starved", () => {
  it("requires a starvation check on every sweep-performance entry", () => {
    for (const entry of BROKER_VISIBILITY_EXCLUSIONS) {
      if (entry.ground !== "sweep-performance") continue;
      assert.ok(
        entry.starvationCheck,
        `${entry.levelflowSymbol} is excluded on performance with no starvation check — ` +
          `run scripts/starvation-audit.ts and record survivalRate + filledSetups`,
      );
    }
  });

  it("refuses a performance exclusion on a starved or thin market", () => {
    for (const entry of BROKER_VISIBILITY_EXCLUSIONS) {
      if (entry.ground !== "sweep-performance" || !entry.starvationCheck) continue;
      const { survivalRate, filledSetups, source } = entry.starvationCheck;
      assert.ok(
        survivalRate >= MIN_SURVIVAL_FOR_PERFORMANCE_EXCLUSION,
        `${entry.levelflowSymbol}: survival ${survivalRate} is below ` +
          `${MIN_SURVIVAL_FOR_PERFORMANCE_EXCLUSION} — the geometry, not the market, ` +
          `is deciding how much evidence exists. Fix the geometry, re-sweep, then judge.`,
      );
      assert.ok(
        filledSetups >= MIN_FILLED_FOR_PERFORMANCE_EXCLUSION,
        `${entry.levelflowSymbol}: ${filledSetups} filled setups is under ` +
          `${MIN_FILLED_FOR_PERFORMANCE_EXCLUSION}. Rough rice's "-0.200" was seven.`,
      );
      assert.ok(source.length > 10, `${entry.levelflowSymbol} must cite its source artifact`);
    }
  });

  it("forbids a starvation check on grounds where it means nothing", () => {
    // A no-fmp-source or data-drift exclusion is not a performance claim, so
    // attaching survival evidence to one would imply a judgement that was never
    // made — and would let a future reader think the market had been measured.
    for (const entry of BROKER_VISIBILITY_EXCLUSIONS) {
      if (entry.ground === "sweep-performance") continue;
      assert.equal(
        entry.starvationCheck,
        undefined,
        `${entry.levelflowSymbol} carries a starvation check on ${entry.ground} grounds`,
      );
    }
  });

  it("keeps the floors at the values the failures justify", () => {
    // 0.33: the five markets that fooled us ran 5% (feeder cattle) to 27%
    // (rough rice); the healthy core runs 73-99%. 300: the smallest sample any
    // exclusion tonight would have needed to survive scrutiny.
    assert.equal(MIN_SURVIVAL_FOR_PERFORMANCE_EXCLUSION, 0.33);
    assert.equal(MIN_FILLED_FOR_PERFORMANCE_EXCLUSION, 300);
  });
});
