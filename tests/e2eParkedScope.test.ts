import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PARKING_GATE } from "../src/lib/parkingGate.ts";

/**
 * While the desk is parked, the live-desk E2E projects buy nothing.
 *
 * `workspace`, `visual-proof` and `analyzer-abuse` drive the authenticated
 * surfaces against production, at roughly 190 live provider calls per deploy.
 * `PARKING_GATE` turns every arrival away, so those surfaces are unreachable
 * in production — the calls price a desk nobody can open, on an account whose
 * trailing-30 allowance is the constraint the desk scales into.
 *
 * THE COST IS REAL AND IS NOT HIDDEN. An app change now ships without live-desk
 * verification. That is the trade, it is printed on every such run, and it
 * reverses automatically on the first app-touching push after unparking — no
 * one has to remember to undo it.
 *
 * A SEPARATE SCOPE VALUE, not a reuse. The existing stand-down sentence says
 * "this push changed nothing under src/…", which is FALSE of a parked
 * app-touching push. Printing it would be the reporter committing the defect it
 * exists to refuse.
 */

const WORKFLOW = readFileSync(".github/workflows/deploy.yml", "utf8");
const REPORTER = readFileSync("tests/e2e/coverageReporter.ts", "utf8");
const CONFIG = readFileSync("playwright.config.ts", "utf8");

/** The scope step's shell block, so assertions cannot match elsewhere. */
function scopeStep(): string {
  const start = WORKFLOW.indexOf("Decide whether the E2E may spend bandwidth");
  assert.ok(start >= 0, "the scope step is gone — re-point this guard");
  const end = WORKFLOW.indexOf("- name: Run browser tests", start);
  return WORKFLOW.slice(start, end);
}

describe("the scope decision is readable on every path", () => {
  it("sets `scope` wherever it sets `full`", () => {
    // An unset output arrives as the empty string, which the reporter refuses
    // — so a path that sets one and not the other turns a legitimate full run
    // red. The unresolvable-base early exit was exactly that, caught here.
    const step = scopeStep();
    const full = [...step.matchAll(/echo "full=/g)].length;
    const scope = [...step.matchAll(/echo "scope=/g)].length;
    assert.equal(
      scope,
      full,
      `${full} paths set full= and ${scope} set scope= — every path must set both`,
    );
    assert.ok(full >= 4, `only ${full} paths found`);
  });

  it("emits only values the reporter recognises", () => {
    const emitted = [...scopeStep().matchAll(/echo "scope=([\w-]+)"/g)]
      .map((match) => match[1]);
    assert.ok(emitted.length > 0, "no scope values emitted");
    for (const value of emitted) {
      assert.match(
        REPORTER,
        new RegExp(`"${value}"`),
        `the workflow emits scope "${value}" and the reporter cannot read it`,
      );
    }
  });

  it("reads the desk's own constant rather than grepping for it", () => {
    // A regex over the source drifts the day the file is reformatted, and this
    // decides whether ~190 live provider calls go out.
    assert.match(
      scopeStep(),
      /import \{ PARKING_GATE \} from '\.\/src\/lib\/parkingGate\.ts'/,
      "the scope step no longer imports the constant",
    );
    assert.doesNotMatch(
      scopeStep(),
      /grep[^\n]*PARKING_GATE/,
      "the parking state is being grepped out of the source again",
    );
  });

  it("stands the FMP projects down when parked and the app changed", () => {
    assert.match(scopeStep(), /elif \[ "\$parked" = "true" \]; then/);
    assert.match(scopeStep(), /scope=stood-down-parked/);
  });
});

describe("the reporter states the true reason, and refuses one it cannot", () => {
  it("gives the parked stand-down its own sentence", () => {
    assert.match(REPORTER, /stood-down-parked/);
    // It must NOT claim the push changed nothing — that is the other reason.
    const branch = REPORTER.slice(REPORTER.indexOf('"stood-down-parked"'));
    const sentence = branch.slice(0, branch.indexOf('} else if (fmpProjects === "ran")'));
    assert.match(sentence, /DID touch the app/);
    assert.match(sentence, /PARKED/);
    assert.doesNotMatch(
      sentence,
      /changed nothing under/,
      "the parked branch reuses the docs-only sentence, which is false here",
    );
  });

  it("states the cost rather than only the saving", () => {
    assert.match(REPORTER, /THE COST: /);
    assert.match(REPORTER, /without live-desk verification/);
  });

  it("refuses a scope value it cannot read, past the clean-run early return", () => {
    // The bug this nearly shipped with: `if (verdict.ok) return` sits BEFORE
    // the problems loop, so a scope problem appended to `verdict.problems`
    // would be swallowed on exactly the runs where it matters — a clean suite
    // under a scope nobody can state.
    assert.match(REPORTER, /const scopeUnreadable = fmpProjects !== undefined/);
    assert.match(REPORTER, /if \(verdict\.ok && !scopeUnreadable\)/);
    assert.match(REPORTER, /COVERAGE REFUSED: LEVELFLOW_E2E_FMP_PROJECTS is/);
  });

  it("says nothing when the variable is unset, which is a local run", () => {
    assert.match(REPORTER, /fmpProjects !== undefined/);
  });
});

describe("the named project set is the config's own", () => {
  it("names exactly the projects that exist", () => {
    // The reporter names three projects in prose. If one is renamed or added
    // in the config, the sentence becomes a claim about something that is not
    // there — and the reader has no way to tell.
    const configured = [...CONFIG.matchAll(/name: "([\w-]+)"/g)].map((m) => m[1]);
    for (const named of ["workspace", "visual-proof", "analyzer-abuse"]) {
      assert.ok(
        configured.includes(named),
        `the reporter names "${named}" and playwright.config.ts has no such project`,
      );
    }
    // And the non-spending pair the narrowed run selects must also exist.
    for (const named of ["public-auth", "public-auth-built"]) {
      assert.ok(configured.includes(named), `${named} is gone from the config`);
    }
  });

  it("selects the non-spending projects by name in the narrowed run", () => {
    assert.match(
      WORKFLOW,
      /--project=public-auth --project=public-auth-built/,
      "the narrowed run no longer names the non-spending projects",
    );
  });
});

describe("the gate is live because the desk is parked", () => {
  it("PARKING_GATE is true, which is what makes this branch reachable", () => {
    // Stated as an executable premise: the day the desk unparks, this test
    // fails and whoever unparks it reads why the gate existed rather than
    // finding a dormant branch nobody can explain.
    assert.equal(
      PARKING_GATE,
      true,
      "the desk is no longer parked — the parked stand-down stops firing on " +
        "its own, and this guard should be retired with the same change set " +
        "that unparks (§17p: a park is two steps, and so is its reversal)",
    );
  });
});
