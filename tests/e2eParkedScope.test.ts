import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { DESK_PARKED } from "../supabase/functions/_shared/deskParking.ts";

/**
 * While the desk is parked, the live-desk E2E projects buy nothing.
 *
 * `workspace`, `visual-proof` and `analyzer-abuse` drive the authenticated
 * surfaces against production, at roughly 190 live provider calls per deploy.
 * While `DESK_PARKED` holds, the Edge refuses every one of those provider
 * requests (supabase/functions/_shared/deskParking.ts), so the projects could
 * only fail — whatever the run changed, push or dispatch.
 *
 * PARKING IS DECIDED FIRST. A dispatch has no base, and the base check used to
 * run first: an unresolvable base ran the full suite before parking was read.
 * The decision now lives in scripts/deploy-e2e-scope.sh, executed case by case
 * against real git repositories by scripts/deploy-e2e-scope-test.sh, a declared
 * gate. What this file holds is the wiring those cases cannot see.
 *
 * THE COST IS REAL AND IS NOT HIDDEN. An app change now ships without live-desk
 * verification. That is the trade, it is printed on every such run, and it
 * reverses on the first app-touching run after DESK_PARKED turns false.
 *
 * A SEPARATE SCOPE VALUE, not a reuse. The docs-only sentence says "this push
 * changed nothing under src/…", which a parked run never checked. Printing it
 * would be the reporter committing the defect it exists to refuse.
 */

const WORKFLOW = readFileSync(".github/workflows/deploy.yml", "utf8");
const SCRIPT = readFileSync("scripts/deploy-e2e-scope.sh", "utf8");
const REPORTER = readFileSync("tests/e2e/coverageReporter.ts", "utf8");
const CONFIG = readFileSync("playwright.config.ts", "utf8");
const AGENTS = readFileSync("AGENTS.md", "utf8");

/** The deploy's scope step, so assertions cannot match elsewhere. */
function scopeStep(): string {
  const start = WORKFLOW.indexOf("Decide whether the E2E may spend bandwidth");
  assert.ok(start >= 0, "the scope step is gone — re-point this guard");
  const end = WORKFLOW.indexOf("- name: Run browser tests", start);
  return WORKFLOW.slice(start, end);
}

describe("the scope decision is readable on every path", () => {
  it("the deploy step runs the script, and nothing else decides", () => {
    const step = scopeStep();
    assert.match(step, /run: bash scripts\/deploy-e2e-scope\.sh/);
    assert.doesNotMatch(step, /GITHUB_OUTPUT/, "the step writes outputs of its own beside the script's");
  });

  it("sets `scope` wherever it sets `full`, through one helper", () => {
    // An unset output arrives as the empty string, which the reporter refuses
    // — so a path that sets one and not the other turns a legitimate run red.
    assert.equal([...SCRIPT.matchAll(/echo "full=/g)].length, 1);
    assert.equal([...SCRIPT.matchAll(/echo "scope=/g)].length, 1);
    const emits = [...SCRIPT.matchAll(/^\s*(?:true\) )?emit (true|false) ([\w-]+)/gm)];
    assert.ok(emits.length >= 4, `only ${emits.length} emit paths found`);
  });

  it("emits only values the reporter recognises", () => {
    const emitted = [...SCRIPT.matchAll(/\bemit (?:true|false) ([\w-]+)/g)].map((m) => m[1]);
    assert.ok(emitted.length > 0, "no scope values emitted");
    const recognised = REPORTER.slice(REPORTER.indexOf("const scopeUnreadable"));
    for (const value of emitted) {
      assert.match(
        recognised.slice(0, recognised.indexOf(";")),
        new RegExp(`"${value}"`),
        `the script emits scope "${value}" and the reporter cannot read it`,
      );
    }
  });

  it("reads the Edge's own constant rather than grepping for it", () => {
    // A regex over the source drifts the day the file is reformatted, and this
    // decides whether ~190 live provider calls go out.
    assert.match(
      SCRIPT,
      /import \{ DESK_PARKED \} from '\.\/supabase\/functions\/_shared\/deskParking\.ts'/,
      "the scope script no longer imports the constant",
    );
    assert.doesNotMatch(SCRIPT, /grep[^\n]*DESK_PARKED/, "the parking state is being grepped out of the source");
    assert.doesNotMatch(SCRIPT, /PARKING_GATE/, "the scope keys on the browser gate again, which cannot see the Edge");
  });

  it("decides parking before it reads the base", () => {
    const parked = SCRIPT.indexOf("# --- parked ---");
    const base = SCRIPT.indexOf("# --- base ---");
    assert.ok(parked > 0 && base > 0, "the block markers moved — the harness mutation needs them");
    assert.ok(parked < base, "the base is read before parking, so a parked dispatch runs the full suite");
    assert.match(SCRIPT.slice(parked, base), /true\) emit false stood-down-parked ;;/);
    assert.match(SCRIPT.slice(parked, base), /\*\)[\s\S]*exit 1/, "a non-boolean DESK_PARKED must stop the deploy");
  });

  it("tests app paths with a here-string, never a pipe into grep -q", () => {
    assert.match(SCRIPT, /grep -qE '\^\(src\/\|supabase\/functions\/\|supabase\/migrations\/\)' <<<"\$changed"/);
    assert.doesNotMatch(SCRIPT, /echo "\$changed" \| grep/, "under pipefail a SIGPIPE'd echo reads a large app diff as docs-only");
  });

  it("the harness is a declared gate, so CI runs it", () => {
    assert.match(AGENTS, /^gate: bash scripts\/deploy-e2e-scope-test\.sh$/m);
  });
});

describe("the reporter states the true reason, and refuses one it cannot", () => {
  it("gives the parked stand-down its own sentence", () => {
    assert.match(REPORTER, /stood-down-parked/);
    const branch = REPORTER.slice(REPORTER.indexOf('"stood-down-parked"'));
    const sentence = branch.slice(0, branch.indexOf('} else if (fmpProjects === "ran")'));
    assert.match(sentence, /PARKED/);
    assert.match(sentence, /DESK_PARKED/);
    assert.match(sentence, /THE COST: /);
    // It must claim neither that the run touched the app nor that it did not:
    // parking is decided before the diff is read.
    assert.doesNotMatch(sentence, /DID touch the app/, "the parked sentence claims a diff it never read");
    assert.doesNotMatch(sentence, /changed nothing under/, "the parked branch reuses the docs-only sentence");
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

describe("the stand-down is live because the Edge is parked", () => {
  it("DESK_PARKED is true, which is what makes this branch reachable", () => {
    // Stated as an executable premise: the day the Edge unparks, this test
    // fails and whoever unparks it reads why the stand-down existed rather than
    // finding a dormant branch nobody can explain.
    assert.equal(
      DESK_PARKED,
      true,
      "the Edge is no longer parked — the parked stand-down stops firing on " +
        "its own. Unpark step 1 (DESK_PARKED alone) retires this guard in the " +
        "same change set; PARKING_GATE follows only after that run's full E2E " +
        "is green.",
    );
  });
});
