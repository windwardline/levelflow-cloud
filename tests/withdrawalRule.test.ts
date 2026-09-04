import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFileSync } from "node:fs";

import {
  type MarketVerdict,
  priorRegisterFrom,
  withdrawalArtifact,
  WITHDRAWAL_MIN_FILLED,
  WITHDRAWAL_RULE,
  withdrawalVerdicts,
} from "../scripts/register-verdict.ts";
import type { LedgeredReadArtifact } from "../scripts/ledgeredRead.ts";

/**
 * THE RULE'S PROSE IS HASHED INTO THE ARTIFACT; NOTHING HASHED THE CODE.
 *
 * `WITHDRAWAL_RULE` travels with every verdict and its hash is asserted where
 * the register is pinned, so the artifact cannot claim to have been written
 * under a rule it was not. But a hash over a sentence says nothing about the
 * function beneath it: the text could stand untouched while the code stopped
 * meaning it. The register re-decision is derived over 97 markets where, as it
 * happens, the 30-fill floor never binds and only two markets are retired —
 * so most of the rule is unexercised by the real read.
 *
 * Each clause is therefore exercised here on its own, one market at a time,
 * against a synthetic read. These are the sentences the prose makes, in the
 * order it makes them.
 */

type Figure = { expectancy: number; lower: number; n: number; upper: number };

function market(options: {
  candidate?: boolean;
  gross?: Figure | null;
  m3?: string;
  net?: Figure | null;
  noRetirementRecord?: boolean;
  retired?: boolean;
}) {
  return {
    // The read carries a retirement RECORD for every market it graded — an
    // object whose `retired` flag is the answer — and null only where it graded
    // none. The fixtures mirror that, because the reader refuses a read with no
    // records at all rather than nominating every candidate.
    retirement: options.noRetirementRecord === true
      ? null
      : { fragile: false, retired: options.retired ?? false },
    shipped: {
      confirm: { gross: options.gross ?? null, net: options.net ?? null },
      declineCandidate: options.candidate ?? false,
      m3: options.m3 ?? "confirmed-negative",
    },
  };
}

const negative = (n: number): Figure => ({ expectancy: -0.2, lower: -0.3, n, upper: -0.1 });
const grossNegative = (n: number): Figure => ({ expectancy: -0.1, lower: -0.2, n, upper: -0.02 });
const grossTouchingZero = (n: number): Figure => ({ expectancy: -0.05, lower: -0.16, n, upper: 0.06 });

function judge(
  markets: Record<string, ReturnType<typeof market>>,
  prior: string[] = [],
  removalArms: Array<{ arm: string; markets: Record<string, unknown> }> = [],
): Map<string, MarketVerdict> {
  const read = { markets } as unknown as LedgeredReadArtifact;
  const arms = removalArms as unknown as Parameters<typeof withdrawalVerdicts>[2];
  return new Map(withdrawalVerdicts(read, new Set(prior), arms).map((row) => [row.symbol, row]));
}

describe("the withdrawal rule means what its own sentence says", () => {
  it("declines a nominated market that fails on BOTH columns", () => {
    const verdicts = judge({
      AAAUSD: market({ candidate: true, gross: grossNegative(400), net: negative(400) }),
    });
    assert.equal(verdicts.get("AAAUSD")?.disposition, "declined");
    assert.match(verdicts.get("AAAUSD")!.reason, /confirmation fold/);
  });

  it("does NOT decline when the negative rests on our own modelled cost — amendment 36's clause", () => {
    // Same market, same net figure; only the gross interval changes, and it
    // touches zero. This is the clause ZCUSX is restored under.
    const verdicts = judge({
      AAAUSD: market({ candidate: true, gross: grossTouchingZero(400), net: negative(400) }),
    });
    assert.equal(verdicts.get("AAAUSD")?.disposition, "cleared");
  });

  it("does NOT decline on a starved sample, whatever the intervals say", () => {
    // The floor is asserted as a NUMBER, not read from the constant the code
    // under test uses: a test that says `WITHDRAWAL_MIN_FILLED - 1` moves with
    // the constant and passes at a floor of zero, which is a disabled floor.
    assert.equal(WITHDRAWAL_MIN_FILLED, 30, "amendment 25's market-unit floor is 30 filled outcomes");
    const thin = 29;
    const verdicts = judge({
      AAAUSD: market({ candidate: true, gross: grossNegative(thin), net: negative(thin) }),
    });
    assert.equal(verdicts.get("AAAUSD")?.disposition, "cleared");
    const standing = judge(
      { AAAUSD: market({ candidate: true, gross: grossNegative(thin), net: negative(thin) }) },
      ["AAAUSD"],
    );
    assert.equal(standing.get("AAAUSD")?.disposition, "restored");
    assert.match(standing.get("AAAUSD")!.reason, /starved verdict/);
  });

  it("will not ENTER a market the select fold never nominated, however it reads on the fold", () => {
    const verdicts = judge({
      AAAUSD: market({ candidate: false, gross: grossNegative(400), net: negative(400) }),
    });
    assert.equal(verdicts.get("AAAUSD")?.disposition, "unnominated");
    assert.match(verdicts.get("AAAUSD")!.reason, /dredged from the confirm fold/);
  });

  it("RETIRES a withdrawal when a removal cell lifts the bound AND does not make the money worse", () => {
    // Amendment 36's window and cap legs, decided on MONEY. The freeze's rule
    // retired a candidacy when a select GROSS bound crossed zero, and two
    // markets were being served on exactly that while the read condemned them
    // on both columns. A cell retires only when the NET upper reaches zero and
    // its point estimate is no worse than the shipped cell's.
    const arms = [{
      arm: "review-window",
      markets: {
        AAAUSD: {
          shipped: { select: { net: { expectancy: -0.05, n: 400 } } },
          variants: {
            "defaultReviewHours=96": { select: { gross: { upper: 0.02 }, net: { expectancy: -0.04, n: 420, upper: 0.001 } } },
          },
        },
      },
    }];
    const verdicts = judge(
      { AAAUSD: market({ candidate: true, gross: grossNegative(400), net: negative(400) }) },
      [],
      arms,
    );
    assert.equal(verdicts.get("AAAUSD")?.disposition, "retired");
    assert.match(verdicts.get("AAAUSD")!.reason, /removal cells retire the withdrawal/);
  });

  it("does NOT retire on a bound that crosses while the money gets worse", () => {
    const arms = [{
      arm: "review-window",
      markets: {
        AAAUSD: {
          shipped: { select: { net: { expectancy: -0.05, n: 400 } } },
          variants: {
            // The bound reaches zero, but only because the cell is worse and
            // wider: -0.09 against the shipped cell's -0.05.
            "defaultReviewHours=96": { select: { gross: { upper: 0.02 }, net: { expectancy: -0.09, n: 410, upper: 0.004 } } },
          },
        },
      },
    }];
    const verdicts = judge(
      { AAAUSD: market({ candidate: true, gross: grossNegative(400), net: negative(400) }) },
      [],
      arms,
    );
    assert.equal(verdicts.get("AAAUSD")?.disposition, "declined");
  });

  it("ignores a removal cell that keeps under half the shipped cell's fills", () => {
    const arms = [{
      arm: "stop-cap",
      markets: {
        AAAUSD: {
          shipped: { select: { net: { expectancy: -0.05, n: 400 } } },
          variants: {
            "maxStopAtrMultiplier=8": { select: { gross: { upper: 0.05 }, net: { expectancy: -0.01, n: 150, upper: 0.06 } } },
          },
        },
      },
    }];
    const verdicts = judge(
      { AAAUSD: market({ candidate: true, gross: grossNegative(400), net: negative(400) }) },
      [],
      arms,
    );
    assert.equal(verdicts.get("AAAUSD")?.disposition, "declined", "a quarter of the volume is a smaller sample, not a rescued market");
  });

  it("records a market no removal cell could test, instead of implying one ran", () => {
    const verdicts = judge(
      { AAAUSD: market({ candidate: true, gross: grossNegative(400), net: negative(400) }) },
      [],
      [],
    );
    assert.equal(verdicts.get("AAAUSD")?.disposition, "declined");
    assert.equal(verdicts.get("AAAUSD")?.removal?.tested, false);
    assert.match(verdicts.get("AAAUSD")!.reason, /NEVER REMOVAL-TESTED/);
  });

  it("KEEPS a standing decline that still fails, with no nomination required", () => {
    const verdicts = judge(
      { AAAUSD: market({ candidate: false, gross: grossNegative(400), net: negative(400) }) },
      ["AAAUSD"],
    );
    assert.equal(verdicts.get("AAAUSD")?.disposition, "stays");
  });

  it("RESTORES a standing decline the read cannot judge — a decline may not rest on invalidated evidence", () => {
    const verdicts = judge(
      {
        AAAUSD: market({ m3: "not-held-back", gross: null, net: null }),
        BBBUSD: market({ candidate: true, gross: grossNegative(400), net: negative(400) }),
      },
      ["AAAUSD"],
    );
    assert.equal(verdicts.get("AAAUSD")?.disposition, "restored");
    assert.match(verdicts.get("AAAUSD")!.reason, /invalidated/);
  });

  it("reports NOT TESTED when every removal cell falls below the floor, not merely when no arm is read", () => {
    // The no-arms case exercises the early return. This one reaches the other
    // exit: arms ARE read and the market HAS a shipped select figure, but every
    // cell is too thin to count — which is still a removal test that did not
    // happen, and reporting it as one lets an untested withdrawal stand.
    const arms = [{
      arm: "stop-cap",
      markets: {
        AAAUSD: {
          shipped: { select: { net: { expectancy: -0.05, n: 400 } } },
          variants: {
            "maxStopAtrMultiplier=8": { select: { gross: { upper: -0.02 }, net: { expectancy: -0.05, n: 120, upper: -0.01 } } },
          },
        },
      },
    }];
    const verdicts = judge(
      { AAAUSD: market({ candidate: true, gross: grossNegative(400), net: negative(400) }) },
      [],
      arms,
    );
    assert.equal(verdicts.get("AAAUSD")?.removal?.cellsTested, 0, "a cell under the fill-share floor is not a tested cell");
    assert.equal(verdicts.get("AAAUSD")?.removal?.tested, false, "no qualifying cell means the removal test did not run");
    assert.match(verdicts.get("AAAUSD")!.reason, /NEVER REMOVAL-TESTED/);
  });

  it("builds the tracked artifact from paths, prior register and removal arms included", () => {
    // main() was once the only place the prior register was resolved, so a
    // mutation replacing it with an empty set changed nothing any test could
    // see. The builder is exported, and this drives it over the real read and
    // the real removal arms.
    const body = withdrawalArtifact({
      armsDir: "docs/research/r4",
      manifestHash: "021821537f28e5d2777543989baa0631a38840d592fad74c4bdb2429fb627c59",
      priorPath: "docs/research/baseline-2026-08-10/4d-cost-sensitivity.json",
      readPath: "docs/research/confirm-reads/ledgered-read-act3.json",
    });
    const tracked = JSON.parse(
      readFileSync("docs/research/r4/withdrawal-verdict-2026-09-03.json", "utf8"),
    ) as Record<string, unknown>;
    assert.deepEqual(
      body.priorRegister,
      priorRegisterFrom("docs/research/baseline-2026-08-10/4d-cost-sensitivity.json"),
      "the builder's prior register is not the tracked artifact's population",
    );
    assert.ok((body.priorRegister as string[]).length >= 10, "an empty prior register would nominate every re-based decline afresh");
    for (const key of ["declined", "restored", "retired", "unnominated", "cleared", "priorRegister", "ruleHash", "minFilled", "removalArms"]) {
      assert.deepEqual(body[key], tracked[key], `the builder no longer reproduces the tracked artifact's ${key}`);
    }
    // AND THE REMOVAL TEST ACTUALLY RAN on the real population: a register
    // whose every entry reported "never removal-tested" would satisfy every
    // other assertion here.
    const declined = body.declined as Array<{ removal?: { cellsTested: number; tested: boolean }; symbol: string }>;
    const tested = declined.filter((row) => row.removal?.tested);
    assert.ok(
      tested.length >= declined.length - 1,
      `only ${tested.length} of ${declined.length} declined markets were removal-tested — the arms are not being read`,
    );
    assert.ok(
      tested.every((row) => (row.removal?.cellsTested ?? 0) >= 4),
      "a removal-tested market must carry cells from more than one arm",
    );
  });

  it("states every clause it applies — the prose and the code are one change set", () => {
    // A hash over the sentence proves the artifact was written under it. This
    // asserts the sentence still names what the tests above exercise, so the
    // two cannot drift apart quietly.
    for (const clause of [
      "confirmed-negative",
      String(WITHDRAWAL_MIN_FILLED),
      "net and the gross 95% upper",
      "nomination",
      "RESTORED",
      // The clauses this rule gained when the removal test became uniform and
      // retirement became a money test. The old text said "no accepted variant
      // retired it" while the code read a retirement flag and never read
      // acceptance at all — a pre-registration that misdescribed its own test,
      // and the direct cause of a finding that cost a full verification round.
      "REMOVAL TEST",
      "before ANY withdrawal",
      "net point estimate is no worse",
      "NEVER REMOVAL-TESTED",
    ]) {
      assert.ok(WITHDRAWAL_RULE.includes(clause), `the rule no longer states: ${clause}`);
    }
  });
});
