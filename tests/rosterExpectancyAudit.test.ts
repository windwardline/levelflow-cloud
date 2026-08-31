import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BASELINE,
  shardPathsFromArgv,
} from "../scripts/roster-expectancy-audit.ts";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";

// WIF-4 (readiness audit, 2026-08-11): run with no shard paths, the audit
// read zero rows, called every market "unmeasurable", and wrote an artifact
// that looked like a finished run. An instrument that examined nothing must
// refuse to report — the no-silent-failure standard, applied to the one
// script whose output is quoted as a roster verdict.
describe("roster-expectancy-audit argv", () => {
  it("collects the positional shard paths and drops flag pairs", () => {
    assert.deepEqual(
      shardPathsFromArgv(["a.jsonl", "--out", "x.json", "b.jsonl"]),
      ["a.jsonl", "b.jsonl"],
    );
  });

  it("refuses a run with no shard paths instead of reporting on zero rows", () => {
    assert.throws(
      () => shardPathsFromArgv(["--out", "x.json"]),
      /no shard paths/,
    );
  });
});

/**
 * The baseline branch reads the RIGHT cell for the markets that reach it.
 *
 * `roster-expectancy-audit` reads a derived market at its own grid cell and
 * every other market at the named baseline, "which is what the shipped engine
 * does". That claim is the kind that rots — it is prose about a numeric
 * relationship between two files that move independently — so it is asserted
 * here against the shipped calibration rather than believed.
 *
 * THE OBVIOUS TEST IS WRONG, and this is the point. Measured across all 97
 * roster markets, ZERO match the baseline cell: the derived markets ship 4x
 * ATR stops and `trail_tp1`, and they never reach this branch. Judged on the
 * population that DOES reach it — the markets with no derived cell — every
 * one matches. A guard that took the whole roster as its population would
 * report a defect that is not there.
 */
describe("the audit's baseline cell is the shipped geometry, for its own population", () => {
  // PARSED FROM THE CONSTANT THE AUDIT USES, never retyped. A literal here
  // passed while `BASELINE` was changed to a cell matching no shipped market
  // — the test asserted shipped calibration against a number I had typed,
  // which is agreement with myself rather than with the audit.
  const CELL = Object.fromEntries(
    BASELINE.split(",").map((pair) => {
      const [key, raw] = pair.split("=");
      const numeric = Number(raw);
      return [key, Number.isFinite(numeric) && raw !== "" ? numeric : raw];
    }),
  ) as Record<string, unknown>;

  /** Markets with no derived cell — the ones the baseline branch judges. */
  function fallThroughMarkets(): string[] {
    const derived = new Set<string>();
    for (
      const file of [
        "4d-final-picks.json",
        "4d-holdout-final-picks.json",
        "4d-totality-final-picks.json",
      ]
    ) {
      const picks = JSON.parse(
        readFileSync(`docs/research/baseline-2026-08-10/${file}`, "utf8"),
      ) as { finalPicks?: Record<string, unknown> };
      for (const symbol of Object.keys(picks.finalPicks ?? {})) {
        derived.add(symbol);
      }
    }
    return (defaultScanSymbols as unknown as string[]).filter(
      (symbol) => !derived.has(symbol),
    );
  }

  it("has a fall-through population worth judging", () => {
    // NON-VACUITY: if every market earned a derived cell the loop below would
    // pass having compared nothing.
    const fallThrough = fallThroughMarkets();
    assert.ok(
      fallThrough.length >= 5,
      `only ${fallThrough.length} markets reach the baseline branch — the ` +
        `comparison below would prove little`,
    );
  });

  it("matches every market that reaches it, on geometry", () => {
    for (const symbol of fallThroughMarkets()) {
      const calibration = getCategoryCalibration(
        symbol as Parameters<typeof getCategoryCalibration>[0],
      ) as unknown as Record<string, unknown>;
      // `replay.ts` resolves an absent mode with `?? "breakeven"`, so an
      // undefined shipped value IS the cell's value, not a mismatch.
      const protection = calibration.runnerProtection ?? "breakeven";
      assert.equal(
        calibration.maxStopAtrMultiplier,
        CELL.maxStopAtrMultiplier,
        `${symbol}: audited at a stop multiple it does not ship`,
      );
      assert.equal(
        calibration.sizingHoursFactor,
        CELL.sizingHoursFactor,
        `${symbol}: audited at a sizing window it does not ship`,
      );
      assert.equal(
        protection,
        CELL.runnerProtection,
        `${symbol}: audited under a runner protection it does not ship`,
      );
    }
  });

  it("re-applies the CLASS threshold rather than inheriting the cell's zero", () => {
    // The one term that legitimately differs: the cell pins
    // `confidenceThreshold=0` and these markets ship 25, 40 or 68. The branch
    // re-applies the class value, which is why the mismatch is correct rather
    // than a defect — and why deleting that filter would silently admit every
    // sub-threshold decision.
    const source = readFileSync("scripts/roster-expectancy-audit.ts", "utf8");
    assert.match(
      source,
      /const threshold = getCategoryCalibration\(symbol\)\.confidenceThreshold;/,
    );
    assert.match(source, /if \(!Number\.isFinite\(score\) \|\| score < threshold\) return;/);
    const positive = fallThroughMarkets().filter((symbol) =>
      (getCategoryCalibration(
        symbol as Parameters<typeof getCategoryCalibration>[0],
      ) as unknown as { confidenceThreshold: number }).confidenceThreshold > 0
    );
    assert.ok(
      positive.length > 0,
      "no fall-through market carries a positive threshold, so the re-apply " +
        "above is doing nothing and this branch deserves re-reading",
    );
  });

  it("refuses the EMPTY grid cell rather than pooling it with the named one", () => {
    // `BASELINE` and `describeOverride({})`'s "baseline" are two different
    // calibrations. No tracked corpus carries the empty cell — all 25
    // distinct cells across `sweeps/**` have explicit overrides — so the old
    // `||` never fired and its hazard never showed.
    const source = readFileSync("scripts/roster-expectancy-audit.ts", "utf8");
    assert.doesNotMatch(
      source,
      /variant !== BASELINE && variant !== "baseline"/,
      "the audit admits two different cells as one market's expectancy",
    );
    assert.match(
      source,
      /if \(variant === "baseline"\) \{\s*\n\s*throw new Error\(/,
      "the empty cell is silently dropped instead of refused, so a grid that " +
        "gains one reports a smaller population as a smaller result",
    );
  });
});
