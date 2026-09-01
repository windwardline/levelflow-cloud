// Makes the E2E run say what it did not verify, on every run, green or not.
//
// Playwright's own summary is a count. A count cannot tell you that the 14
// skips in one green and the 1 skip in another are different kinds of run —
// which is exactly what went unsaid for four days while FMP was dark. The
// decision logic is in ./coverage.ts and unit-tested; this is the adapter that
// collects the run and prints the verdict.
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { type StoodDown, summarizeE2ECoverage } from "./coverage.ts";

// Evidence for the number: this suite stands down 1 test on a healthy run
// (2026-08-12) and 14 while the upstream market feed is refusing (2026-08-17),
// out of 115. The ceiling sits well above the known-legitimate worst case on
// purpose — it is a runaway guard, not a coverage target, and tripping it
// should mean something new is wrong rather than something known is ongoing.
const DEFAULT_CEILING = 25;

export default class CoverageReporter implements Reporter {
  private readonly stoodDown: StoodDown[] = [];
  private passed = 0;
  private failed = 0;

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === "skipped") {
      // `test.skip(condition, description)` records the description as a
      // "skip" annotation. Read it rather than the status, because the status
      // alone cannot distinguish a reasoned stand-down from a silent one.
      const annotations = [...test.annotations, ...(result.annotations ?? [])];
      const reason = annotations.find(
        (annotation) => annotation.type === "skip" || annotation.type === "fixme",
      )?.description;
      this.stoodDown.push({ title: test.titlePath().slice(1).join(" › "), reason });
      return;
    }
    if (result.status === "passed") {
      this.passed += 1;
      return;
    }
    this.failed += 1;
  }

  // Async because Reporter.onEnd may only return void or a Promise of the
  // status override — a bare object does not satisfy the interface.
  async onEnd(result: FullResult) {
    const verdict = summarizeE2ECoverage({
      passed: this.passed,
      failed: this.failed,
      stoodDown: this.stoodDown,
      ceiling: DEFAULT_CEILING,
    });

    for (const line of verdict.lines) {
      console.log(line);
    }

    // A WHOLE PROJECT ABSENT IS THE SAME DEFECT AS A SILENT SKIP, one level up.
    //
    // The deploy runs the FMP-spending projects — `workspace`, `visual-proof`,
    // `analyzer-abuse` — only when the push changed `src/`,
    // `supabase/functions/` or `supabase/migrations/`, because 45% of merges
    // change none of them and spent a full live scan matrix proving a
    // documentation edit. That saving is only safe while the narrowing is
    // VISIBLE: this file's whole reason for existing is that "115 passed, 0
    // skipped" and "101 passed, 14 skipped" are different runs, and a
    // narrowed suite reporting a clean 40-of-40 is that same confusion with a
    // smaller denominator.
    const fmpProjects = process.env.LEVELFLOW_E2E_FMP_PROJECTS;
    if (fmpProjects === "stood-down") {
      console.log(
        "E2E SCOPE — the FMP-spending projects (workspace, visual-proof, " +
          "analyzer-abuse) did NOT run: this push changed nothing under src/, " +
          "supabase/functions/ or supabase/migrations/, so no commit in it " +
          "could have moved the scan or chart paths. The market data they " +
          "verify costs provider bandwidth, and the allowance is the " +
          "constraint the desk scales into.",
      );
    } else if (fmpProjects === "stood-down-parked") {
      // A DIFFERENT REASON, AND IT MUST READ AS ONE. This push DID touch the
      // app — reusing the sentence above would print a claim that is false of
      // this run, which is the failure this reporter exists to prevent rather
      // than commit.
      //
      // THE COST IS REAL AND IS STATED HERE. While the desk is parked these
      // three projects are the only live verification of the authenticated
      // surfaces, so an app change now ships without them. The trade is that
      // each of their runs costs ~190 live provider calls to prove a desk no
      // operator can reach: PARKING_GATE turns every arrival away, so the
      // surfaces under test are unreachable in production for as long as this
      // holds. The moment the desk unparks, this branch stops firing and the
      // full matrix returns on the next app-touching push.
      console.log(
        "E2E SCOPE — the FMP-spending projects (workspace, visual-proof, " +
          "analyzer-abuse) did NOT run, and this push DID touch the app: the " +
          "desk is PARKED (src/lib/parkingGate.ts), so the authenticated " +
          "surfaces they verify are unreachable in production and their ~190 " +
          "live provider calls would prove a desk nobody can open. THE COST: " +
          "this app change ships without live-desk verification. It returns " +
          "automatically on the first app-touching push after unparking.",
      );
    } else if (fmpProjects === "ran") {
      console.log(
        "E2E SCOPE — the FMP-spending projects ran: this push touched the app.",
      );
    }

    // Unset is a local run and says nothing. A value the reporter does not
    // recognise is a WIRING error, and a scope decision nobody can read is the
    // silent narrowing this file exists to refuse — so it goes red.
    //
    // Handled on its own rather than appended to `verdict.problems`, because
    // the early return on `verdict.ok` below would swallow it on exactly the
    // runs where it matters: a clean suite under a scope nobody can state.
    const scopeUnreadable = fmpProjects !== undefined &&
      !["ran", "stood-down", "stood-down-parked"].includes(fmpProjects);
    if (scopeUnreadable) {
      console.error(
        `COVERAGE REFUSED: LEVELFLOW_E2E_FMP_PROJECTS is "${fmpProjects}", ` +
          "which this reporter does not recognise — the run's scope cannot be " +
          "stated, so it cannot be certified",
      );
    }

    if (verdict.ok && !scopeUnreadable) {
      return;
    }

    for (const problem of verdict.problems) {
      console.error(`COVERAGE REFUSED: ${problem}`);
    }
    // Only escalate a run the suite itself considered clean. A run that was
    // already failing keeps its own verdict — this must add a reason to go
    // red, never mask one.
    return result.status === "passed"
      ? { status: "failed" as const }
      : undefined;
  }
}
