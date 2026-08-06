import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BROKER_VISIBILITY_EXCLUSIONS,
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
