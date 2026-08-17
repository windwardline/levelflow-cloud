// What a green run is allowed to leave unsaid.
//
// Playwright reports counts; it does not report meaning. "101 passed, 14
// skipped" and "114 passed, 1 skipped" are both green, and on 2026-08-17 the
// difference between them was that an entire class of market-dependent
// coverage had gone dark for four days without the gate mentioning it.
//
// The suite skips on purpose — tests stand down rather than pin behaviour on
// market conditions — so stand-downs are not defects and this does not treat
// them as any. It makes them audible, and refuses the two states that are
// never legitimate.

export type StoodDown = { title: string; reason?: string };

export type CoverageVerdict = {
  ok: boolean;
  problems: string[];
  lines: string[];
};

export function summarizeE2ECoverage(input: {
  passed: number;
  failed: number;
  stoodDown: readonly StoodDown[];
  ceiling: number;
}): CoverageVerdict {
  const { passed, failed, stoodDown, ceiling } = input;
  const problems: string[] = [];

  // A stand-down with no stated reason is indistinguishable from a test
  // someone switched off, which is the whole failure this guards.
  const anonymous = stoodDown.filter((test) => !test.reason?.trim());
  for (const test of anonymous) {
    problems.push(
      `"${test.title}" stood down without a stated reason. Every skip must say why, ` +
        `or a disabled test and an unverifiable one look identical.`,
    );
  }

  if (stoodDown.length > ceiling) {
    problems.push(
      `${stoodDown.length} tests stood down against a ceiling of ${ceiling}. ` +
        `A run this dark cannot certify a deploy, whatever the reasons given.`,
    );
  }

  const lines = [
    "─".repeat(64),
    `E2E COVERAGE — ${passed} verified, ${stoodDown.length} stood down` +
      (failed > 0 ? `, ${failed} failed` : ""),
  ];

  if (stoodDown.length === 0) {
    lines.push("Every test ran. Nothing stood down.");
  } else {
    // Named individually rather than counted, so a stand-down that becomes
    // permanent has to keep announcing itself on every single run.
    lines.push("These were NOT verified on this run:");
    for (const test of stoodDown) {
      lines.push(`  · ${test.title} — ${test.reason?.trim() || "NO REASON GIVEN"}`);
    }
  }

  lines.push("─".repeat(64));

  return { ok: problems.length === 0, problems, lines };
}
