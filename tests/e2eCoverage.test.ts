// A green that ran 101 of 115 tests, saying nothing about the other 14, is the
// same silence §21h was written against — a signal that has stopped carrying
// what it claims to carry.
//
// Measured on this suite: a healthy run stands down 1 test (2026-08-12); the
// run during the FMP blackout stood down 14 (2026-08-17). Both reported green,
// and nothing in either green distinguished them. The stand-downs are
// legitimate — the suite deliberately skips rather than pinning behaviour on
// market conditions — but "legitimate" and "invisible" are different claims.
//
// This does not fail a run for standing down. Failing the famine case would
// recreate the permanently-red gate we just repaired, and a red nobody can act
// on is worse than a green that explains itself. It fails for the two things
// that are never legitimate: a stand-down with no stated reason, and a run so
// dark it cannot certify anything.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeE2ECoverage } from "./e2e/coverage.ts";

const clean = {
  passed: 114,
  failed: 0,
  stoodDown: [{ title: "crypto verdict", reason: "No Crypto market qualified." }],
  ceiling: 25,
};

describe("summarizeE2ECoverage — a green states what it did not verify", () => {
  it("passes a healthy run and still reports the stand-down", () => {
    const verdict = summarizeE2ECoverage(clean);
    assert.equal(verdict.ok, true);
    const report = verdict.lines.join("\n");
    assert.match(report, /114/);
    assert.match(report, /1 stood down/);
    assert.match(report, /No Crypto market qualified\./);
  });

  it("names every stood-down test and its reason", () => {
    const verdict = summarizeE2ECoverage({
      ...clean,
      stoodDown: [
        { title: "advisor chart", reason: "FMP allowance exhausted." },
        { title: "costs row", reason: "No qualifying setup right now." },
      ],
    });
    const report = verdict.lines.join("\n");
    assert.match(report, /advisor chart/);
    assert.match(report, /FMP allowance exhausted\./);
    assert.match(report, /costs row/);
    assert.match(report, /No qualifying setup right now\./);
  });

  // The one thing a stand-down may never be is anonymous. A reason is what
  // separates "this could not be verified, here is why" from a test quietly
  // switched off.
  it("fails a stand-down that states no reason", () => {
    const verdict = summarizeE2ECoverage({
      ...clean,
      stoodDown: [{ title: "silently disabled", reason: undefined }],
    });
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems.join("\n"), /silently disabled/);
  });

  it("fails a stand-down whose reason is only whitespace", () => {
    const verdict = summarizeE2ECoverage({
      ...clean,
      stoodDown: [{ title: "blank reason", reason: "   " }],
    });
    assert.equal(verdict.ok, false);
  });

  // The blackout stood down 14 of 115 and that is deliberately still a pass —
  // every one of them named a cause. The ceiling catches a different animal: a
  // run dark enough that a green certifies nothing.
  it("passes an outage-level run when every stand-down is explained", () => {
    const verdict = summarizeE2ECoverage({
      passed: 101,
      failed: 0,
      ceiling: 25,
      stoodDown: Array.from({ length: 14 }, (_, index) => ({
        title: `market-dependent ${index}`,
        reason: "Upstream market data unavailable.",
      })),
    });
    assert.equal(verdict.ok, true);
  });

  it("fails when more stood down than the run can certify around", () => {
    const verdict = summarizeE2ECoverage({
      passed: 60,
      failed: 0,
      ceiling: 25,
      stoodDown: Array.from({ length: 26 }, (_, index) => ({
        title: `dark ${index}`,
        reason: "Upstream market data unavailable.",
      })),
    });
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems.join("\n"), /26/);
    assert.match(verdict.problems.join("\n"), /25/);
  });
});
