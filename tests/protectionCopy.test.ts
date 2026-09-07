import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  afterTargetOneInstruction,
  LADDER_INSTRUCTIONS,
  ladderInstruction,
  PROTECTION_TERMS,
  RUNNER_PROTECTIONS,
  runnerProtectionOf,
} from "../src/lib/protectionCopy";

/**
 * Amendment 42 (owner ruling, 2026-09-07): the desk instructs the stop rule
 * the engine stamped on the setup. Three modes, three sentences, one module;
 * an unstamped row reads breakeven because that is the physics it was graded
 * under; a stamp with no sentence is a defect, never a fallback.
 */
describe("the stop rule after Target 1 — per stamped mode", () => {
  it("names the three modes the register can stamp, and no others", () => {
    assert.deepEqual([...RUNNER_PROTECTIONS], ["breakeven", "hold", "trail_tp1"]);
    // The register's own type union names exactly these (calibration.ts); a fourth mode there fails here.
    const calibration = readFileSync("supabase/functions/trade-analyzer/calibration.ts", "utf8");
    assert.match(calibration, /runnerProtection\?: "breakeven" \| "hold" \| "trail_tp1";/);
  });

  it("reads the stamped mode; an unstamped row is breakeven, the physics it was graded under; a stranger refuses", () => {
    assert.equal(runnerProtectionOf({ runnerProtection: "trail_tp1" }), "trail_tp1");
    assert.equal(runnerProtectionOf({ runnerProtection: "hold" }), "hold");
    assert.equal(runnerProtectionOf({ runnerProtection: "breakeven" }), "breakeven");
    assert.equal(runnerProtectionOf({ reviewWindowHours: 24 }), "breakeven");
    assert.equal(runnerProtectionOf(null), "breakeven");
    assert.equal(runnerProtectionOf(undefined), "breakeven");
    assert.throws(() => runnerProtectionOf({ runnerProtection: "trail_target" }), /has no desk instruction/);
    assert.throws(() => runnerProtectionOf({ runnerProtection: 1 }), /has no desk instruction/);
  });

  it("three distinct sentences, each naming its own stop action, and the instruction is the stamped one", () => {
    assert.equal(new Set(Object.values(LADDER_INSTRUCTIONS)).size, 3);
    assert.match(LADDER_INSTRUCTIONS.breakeven, /move your stop to your entry/);
    assert.match(LADDER_INSTRUCTIONS.trail_tp1, /move your stop to Target 1/);
    assert.match(LADDER_INSTRUCTIONS.hold, /leave your stop where it is/);
    for (const mode of RUNNER_PROTECTIONS) {
      assert.match(LADDER_INSTRUCTIONS[mode], /^Set your take-profit at Target 2\. When price reaches Target 1, close half and .* — the banked half is yours either way\.$/);
      assert.equal(ladderInstruction({ runnerProtection: mode }), LADDER_INSTRUCTIONS[mode]);
      assert.equal(PROTECTION_TERMS[mode].term.length > 0 && PROTECTION_TERMS[mode].body.length > 0, true);
    }
    // The glossary bodies are the guide-content spec's §11 lines, verbatim.
    assert.deepEqual(PROTECTION_TERMS, {
      breakeven: {
        body: "Edit the stop-loss order to the price you entered at. From there, the worst case for what remains is breaking even.",
        term: "Move your stop to your entry",
      },
      hold: {
        body: "Leave the stop-loss order at the level the setup gave it. What remains can still lose the full risk; the banked half is already yours.",
        term: "Leave your stop where it is",
      },
      trail_tp1: {
        body: "Edit the stop-loss order to the Target 1 price. From there, the worst case for what remains is closing at Target 1.",
        term: "Move your stop to Target 1",
      },
    });
    assert.equal(new Set(RUNNER_PROTECTIONS.map((mode) => PROTECTION_TERMS[mode].term)).size, 3);
  });

  it("after Target 1 names the level the mode moves the stop to", () => {
    const levels = { entry: "1.0865", stop: "1.0800", targetOne: "1.0905" };
    assert.equal(afterTargetOneInstruction({ ...levels, riskModel: { runnerProtection: "breakeven" } }), "Target 1 hit — bank half, move stop to 1.0865");
    assert.equal(afterTargetOneInstruction({ ...levels, riskModel: { runnerProtection: "trail_tp1" } }), "Target 1 hit — bank half, move stop to 1.0905");
    assert.equal(afterTargetOneInstruction({ ...levels, riskModel: { runnerProtection: "hold" } }), "Target 1 hit — bank half, leave stop at 1.0800");
    assert.equal(afterTargetOneInstruction({ ...levels, riskModel: null }), "Target 1 hit — bank half, move stop to 1.0865");
  });
});
