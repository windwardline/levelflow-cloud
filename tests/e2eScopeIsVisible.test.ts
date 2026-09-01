import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The deploy stopped spending a live scan matrix on documentation merges — and
 * that saving is only safe while the narrowing is VISIBLE.
 *
 * Measured 2026-09-01 over the last 80 first-parent merges to main: 36 of them,
 * 45%, changed nothing under `src/`, `supabase/functions/` or
 * `supabase/migrations/`. Each of those ran the workspace project's live symbol
 * analyses against the deployed Edge functions, spending provider bandwidth to
 * re-prove paths no commit in the push could have moved.
 *
 * `tests/e2e/coverageReporter.ts` exists because "115 passed, 0 skipped" and
 * "101 passed, 14 skipped" are different runs and one of them went unsaid for
 * four days. A narrowed suite reporting a clean 40-of-40 is that same
 * confusion with a smaller denominator, so the scope is announced either way.
 */

const DEPLOY = readFileSync(".github/workflows/deploy.yml", "utf8");
const REPORTER = readFileSync("tests/e2e/coverageReporter.ts", "utf8");

describe("the deploy spends bandwidth only on pushes that could need it", () => {
  it("decides scope from the paths the push actually changed", () => {
    assert.match(DEPLOY, /id: e2e-scope/);
    assert.match(
      DEPLOY,
      /grep -qE '\^\(src\/\|supabase\/functions\/\|supabase\/migrations\/\)'/,
    );
  });

  it("runs EVERYTHING when the base cannot be resolved", () => {
    // The failure to avoid is a silent narrowing, so the ambiguous case buys
    // coverage rather than saving bytes.
    const step = DEPLOY.slice(
      DEPLOY.indexOf("id: e2e-scope"),
      DEPLOY.indexOf("- name: Run browser tests"),
    );
    assert.match(step, /0000000000000000000000000000000000000000/);
    assert.match(step, /full=true/);
    // BOUNDED AT `exit 0`, not at the end of the step. A first draft sliced to
    // the step's end and matched the `full=true` from the LATER app-paths
    // branch, so flipping this fallback to `full=false` — a silent narrowing
    // on every ambiguous push — survived the mutation.
    const start = step.indexOf("is not resolvable");
    const fallback = step.slice(start, step.indexOf("exit 0", start));
    assert.ok(fallback.length > 20, "the fallback branch moved — re-anchor");
    assert.match(
      fallback,
      /full=true/,
      "an unresolvable base must run the full suite, not the narrow one",
    );
    assert.doesNotMatch(
      fallback,
      /full=false/,
      "the ambiguous case narrows the suite silently, which is the one " +
        "failure this gate must not have",
    );
  });

  it("still deploys on every push — only the VERIFICATION narrows", () => {
    // A docs merge still builds, migrates, deploys the functions and runs the
    // auth suites. Gating the release would be a different and much worse
    // change.
    const deployStep = DEPLOY.indexOf("- name: Deploy Supabase functions");
    const scopeStep = DEPLOY.indexOf("id: e2e-scope");
    assert.ok(deployStep > 0 && scopeStep > deployStep);
    assert.doesNotMatch(
      DEPLOY.slice(deployStep, scopeStep),
      /if:/,
      "the deploy step grew a condition — this change gates verification, " +
        "never the release",
    );
  });

  it("keeps the two FMP-free projects running always", () => {
    assert.match(DEPLOY, /--project=public-auth --project=public-auth-built/);
  });

  it("fetches enough history for the diff to be possible", () => {
    // Without this the diff silently fails and every run takes the fallback —
    // which is safe, and also means the saving never happens.
    assert.match(DEPLOY, /fetch-depth: 2/);
  });
});

describe("a narrowed run says so", () => {
  it("announces the scope in BOTH directions", () => {
    // Only announcing the narrow case would make the full case's silence
    // ambiguous — the reader could not tell a full run from an old deploy.
    assert.match(REPORTER, /LEVELFLOW_E2E_FMP_PROJECTS/);
    assert.match(REPORTER, /did NOT run/);
    assert.match(REPORTER, /the FMP-spending projects ran/);
  });

  it("names which projects stood down, not just that some did", () => {
    assert.match(REPORTER, /workspace, visual-proof, /);
  });

  it("passes the flag from the same step that decided it", () => {
    // Two places deciding the same fact is how they drift; the env var is
    // derived from the step's own output.
    //
    // The OUTPUT NAME is not the claim. This pinned `outputs.full`, a boolean,
    // which stopped being enough on 2026-09-01: the scope has three states
    // now — ran, stood-down, and stood-down-parked — because a parked
    // app-touching push stands the FMP projects down for a reason the
    // docs-only sentence would state falsely. The env var carries the state
    // directly rather than a boolean the reporter would have to re-interpret.
    assert.match(
      DEPLOY,
      /LEVELFLOW_E2E_FMP_PROJECTS: \$\{\{ steps\.e2e-scope\.outputs\.\w+ \}\}/,
      "the flag no longer comes from the deciding step's own output",
    );
    // And it must be the state, not a re-derivation: no ternary rebuilding
    // the answer at the env line, which is where two places start to drift.
    assert.doesNotMatch(
      DEPLOY,
      /LEVELFLOW_E2E_FMP_PROJECTS:[^\n]*&&[^\n]*\|\|/,
      "the env line re-derives the scope instead of carrying it",
    );
  });
});
