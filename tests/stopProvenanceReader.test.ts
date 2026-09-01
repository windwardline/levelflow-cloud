import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";


/**
 * The reader looked up folds nobody emits any more, and said nothing about it.
 *
 * `stop-provenance.ts` asked `acc.get(key(class, provenance, "test"))`. The
 * fold vocabulary became `fit` / `select` / `confirm` (`sweepFolds.ts`), so
 * that lookup was undefined on every row of every modern corpus, the `!te`
 * guard skipped all of them, and the script printed its column header and
 * exited 0. Measured on a 322 MB three-market emit before the fix: 2,966 rows
 * read, nine tallies built, ZERO rows printed, exit 0.
 *
 * The file's own door comment had already named the shape — "the table prints
 * its column header alone under exit 0, which is exactly what a real corpus
 * holding no qualifying row also prints" — and the door it installed covered
 * only the zero-FILES case. The zero-MATCHED-ROWS case is the one that fired.
 *
 * Two things are pinned here, and they are opposite: that the reader takes its
 * fold names from the corpus, and that a table which printed nothing is a
 * REFUSAL rather than a green.
 */

const SCRIPT = "scripts/stop-provenance.ts";

function corpus(rows: Array<Record<string, unknown>>): string {
  const dir = mkdtempSync(join(tmpdir(), "sprov-"));
  const path = join(dir, "emit.jsonl");
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n"));
  // The corpus door checks the manifest's hash, its clock block AND its
  // conditions block, so the fixture builds a real one with the repo's own
  // `buildSweepManifest` — the pattern `tests/emptyCorpusRefusals.test.ts`
  // already uses. A hand-stubbed manifest would exercise the door rather than
  // the reader, and would rot the next time a required term is added.
  writeFileSync(
    `${path}.manifest.json`,
    JSON.stringify(
      buildSweepManifest({
        acceptance: { captureAll: true, ignoreLowEdge: false },
        analyzerVersion: "2026.09.01.test",
        anchor: "2026-08-26",
        barRejections: {},
        clock: { calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK },
        conditions: {
          availableTimeframeCount: "min-four-by-construction",
          macroAdjustment: "historical-treasury-curve",
          providerWarningCount: "zero-by-construction",
          spreadSource: "modeled-by-construction",
          weightAdjustment: "raw-engine-zero",
        },
        days: 365,
        generatedAt: "2026-09-01T00:00:00.000Z",
        grid: [{}],
        stepBars: 16,
        symbols: [{
          calibration: {},
          providerSymbol: "BTCUSD",
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: "BTCUSD",
        }],
        trainShare: 0.6,
        treasuryCurve: {
          count: 3_000,
          firstTime: Date.UTC(2013, 0, 2),
          largestGapMs: 4 * 86_400_000,
          lastTime: Date.UTC(2027, 0, 1),
        },
        warmupBars: 240,
      }),
      null,
      2,
    ) + "\n",
  );
  return path;
}

function row(split: string, extra: Record<string, unknown> = {}) {
  return {
    accepted: true,
    outcome: "take_profit",
    realizedR: 0.5,
    rewardRisk: 2,
    split,
    stopProvenance: "pivot",
    symbol: "BTCUSD",
    variant: "baseline",
    ...extra,
  };
}

function run(path: string): { code: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", SCRIPT, path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("the reader takes its fold names from the corpus", () => {
  it("knows every fold the fold spec actually ships", () => {
    // DERIVED FROM THE CANONICAL DECLARATION, not restated. `FoldName` in
    // sweepFolds.ts is where the vocabulary lives; a fold added there and not
    // here would be silently omitted from the table, which is the same defect
    // one level up — and is exactly how "test" went stale.
    const folds = execFileSync("cat", ["scripts/sweepFolds.ts"], {
      encoding: "utf8",
    });
    const declared = /export type FoldName =([^;]*);/.exec(folds);
    assert.ok(declared, "FoldName is no longer declared as a union");
    const canonical = [...declared[1].matchAll(/"([\w]+)"/g)].map((m) => m[1]);
    assert.ok(canonical.length >= 3, `only found ${canonical.join(", ")}`);

    const source = execFileSync("cat", [SCRIPT], { encoding: "utf8" });
    const known = /const FOLD_ORDER = \[([^\]]*)\]/.exec(source);
    assert.ok(known, "FOLD_ORDER is no longer declared literally");
    const names = [...known[1].matchAll(/"([\w]+)"/g)].map((m) => m[1]);
    for (const fold of canonical) {
      assert.ok(
        names.includes(fold),
        `the fold spec ships "${fold}" and the reader does not know it`,
      );
    }
  });

  it("prints rows for a fit/select/confirm corpus", () => {
    // The regression itself. Before the fix this produced a header and exit 0.
    const rows = [];
    for (const split of ["fit", "select", "confirm"]) {
      for (let index = 0; index < 40; index += 1) rows.push(row(split));
    }
    const result = run(corpus(rows));
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /^crypto\s+pivot/m);
    assert.match(result.out, /fit E/);
    assert.match(result.out, /confirm E/);
  });

  it("still reads a legacy train/test corpus", () => {
    // grid-totalr.ts carries the legacy map, so both vocabularies are live in
    // the corpus population and neither may be hardcoded.
    const rows = [];
    for (const split of ["train", "test"]) {
      for (let index = 0; index < 40; index += 1) rows.push(row(split));
    }
    const result = run(corpus(rows));
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /^crypto\s+pivot/m);
    assert.match(result.out, /train E/);
  });
});

describe("a table that printed nothing is a refusal", () => {
  it("REFUSES a corpus whose every cell is under the filled floor", () => {
    const result = run(corpus([row("confirm"), row("confirm")]));
    assert.equal(result.code, 1, "a header-only table exited 0 again");
    assert.match(result.out, /printed NO rows/);
    assert.match(result.out, /refusal, not a result/);
  });

  it("REFUSES a split name it does not know, rather than omitting it", () => {
    const rows = [];
    for (let index = 0; index < 40; index += 1) rows.push(row("holdout2"));
    const result = run(corpus(rows));
    assert.equal(result.code, 1);
    assert.match(result.out, /does not know/);
    assert.match(result.out, /holdout2/);
  });

  it("excludes gate-failed rows, so capture-all reads the shipped population", () => {
    // A --capture-all corpus carries accepted:false rows. Folding them into
    // the provenance tallies would answer the question over setups the engine
    // would never ship.
    const shipped = [];
    for (let index = 0; index < 40; index += 1) shipped.push(row("confirm"));
    const withRejects = [...shipped];
    for (let index = 0; index < 400; index += 1) {
      withRejects.push(row("confirm", { accepted: false, realizedR: -9 }));
    }
    const a = run(corpus(shipped));
    const b = run(corpus(withRejects));
    assert.equal(a.code, 0, a.out);
    assert.equal(b.code, 0, b.out);
    assert.equal(
      b.out,
      a.out,
      "the rejected rows changed the table, so the reader is not reading the " +
        "shipped population",
    );
  });
});
