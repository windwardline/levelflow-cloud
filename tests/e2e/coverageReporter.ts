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

    if (verdict.ok) {
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
