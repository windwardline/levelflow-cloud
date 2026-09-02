import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { SEALED_FOLD } from "../scripts/sweepStats.ts";
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
 * Then the fix overshot (R4 act 1, 2026-09-02): the first repair listed every
 * fold the spec ships, confirm included, printed a `confirm E` column, and took
 * the LAST fold in the corpus as its held fold — which on a folded corpus was
 * the sealed confirm fold, read with no opt-in and no ledger line. The door
 * now withholds confirm rows by default and the reader takes its two tuning
 * folds from `tuningFolds(manifest)`.
 *
 * Three things are pinned here: that the reader takes its fold names from the
 * manifest and spells none itself, that the confirm fold never reaches its
 * table, and that a table which printed nothing is a REFUSAL rather than a
 * green.
 */

const SCRIPT = "scripts/stop-provenance.ts";
// The repo's own tsx by absolute path, never `npx` — the harness lesson
// tests/emptyCorpusRefusals.test.ts records (#364 round 55).
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");

const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2025, 0, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 8, 1);
const DECISION_LEAD = 5 * 86_400_000;

/**
 * A corpus of either shape: "folded" carries the fit/select/confirm windows
 * (so `tuningFolds` names fit and select), "legacy" carries none (train and
 * test). The reader is meant to work on both, and `tuningFolds` is the one
 * place that decides which names apply.
 */
function corpus(
  rows: Array<Record<string, unknown>>,
  shape: "folded" | "legacy",
): string {
  const dir = mkdtempSync(join(tmpdir(), "sprov-"));
  const path = join(dir, "emit.jsonl");
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n"));
  // The corpus door checks the manifest's hash, its clock block AND its
  // conditions block, so the fixture builds a real one with the repo's own
  // `buildSweepManifest` — the pattern `tests/emptyCorpusRefusals.test.ts`
  // already uses. A hand-stubbed manifest would exercise the door rather than
  // the reader, and would rot the next time a required term is added.
  const input: Parameters<typeof buildSweepManifest>[0] = {
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
  };
  if (shape === "folded") {
    input.folds = [
      { decisionEndMs: SELECT_START - DECISION_LEAD, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - DECISION_LEAD, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - DECISION_LEAD, endMs: END, name: SEALED_FOLD, startMs: CONFIRM_START },
    ];
  }
  writeFileSync(
    `${path}.manifest.json`,
    JSON.stringify(buildSweepManifest(input), null, 2) + "\n",
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

function rows(split: string, count: number, extra: Record<string, unknown> = {}) {
  const out = [];
  for (let index = 0; index < count; index += 1) out.push(row(split, extra));
  return out;
}

/** Runs the reader; `out` is stdout AND stderr, so a refusal's sentence and a sealed-count note are both visible. */
function run(...paths: string[]): { code: number; out: string } {
  const result = spawnSync(TSX, [SCRIPT, ...paths], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120_000,
  });
  const out = `${result.stdout}${result.stderr}`;
  // The RUNNER started: a harness failure must never be read as the subject
  // refusing (tests/emptyCorpusRefusals.test.ts, #364 round 55).
  assert.equal(result.error, undefined, `tsx did not start: ${result.error}`);
  assert.doesNotMatch(
    out,
    /npm error|npx canceled|command not found|Cannot find module 'tsx'|tsx\/dist\/register/,
    "the reader was never executed — the failure is the harness",
  );
  if (result.status === null) {
    throw new Error(`the reader died on signal ${result.signal}: ${out}`);
  }
  return { code: result.status, out };
}

describe("the reader takes its fold names from the manifest", () => {
  it("spells none of the folds the fold spec ships — it asks tuningFolds", () => {
    // DERIVED FROM THE CANONICAL DECLARATION, not restated. `FoldName` in
    // sweepFolds.ts is where the vocabulary lives. The first version of this
    // test required the reader to LIST every fold declared there — which is
    // how `confirm` came to be a readable column. Inverted (R4 act 1): the
    // reader may spell none of them in code, because the two it reads come
    // from `tuningFolds(manifest)` and the third is sealed at the door.
    const folds = readFileSync("scripts/sweepFolds.ts", "utf8");
    const declared = /export type FoldName =([^;]*);/.exec(folds);
    assert.ok(declared, "FoldName is no longer declared as a union");
    const canonical = [...declared[1].matchAll(/"([\w]+)"/g)].map((m) => m[1]);
    assert.ok(canonical.length >= 3, `only found ${canonical.join(", ")}`);
    assert.ok(canonical.includes(SEALED_FOLD), "the sealed fold left the spec");

    // Comments stripped the way tests/sweepManifest.test.ts strips them:
    // prose may name a fold, code may not.
    const code = readFileSync(SCRIPT, "utf8")
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") &&
          !trimmed.startsWith("/*");
      })
      .join("\n");
    for (const fold of [...canonical, "train", "test"]) {
      assert.doesNotMatch(
        code,
        new RegExp(`["'\`]${fold}["'\`]`),
        `the reader spells "${fold}" itself instead of asking the manifest`,
      );
    }
    assert.match(code, /tuningFolds\(/, "the fold names must come from tuningFolds");
    assert.match(code, /SEALED_FOLD/, "the refusal names the seal by its one declaration");
  });

  it("prints fit and select on a folded corpus, and the confirm fold is gone", () => {
    // Was: "prints rows for a fit/select/confirm corpus", asserting a
    // `confirm E` column. The confirm figure is 0.900 here so its absence is
    // checked as a NUMBER, not only as a heading; the select figure is 0.250
    // so the counts column is provably select's and not the last fold's.
    const result = run(corpus([
      ...rows("fit", 40, { realizedR: 0.5 }),
      ...rows("select", 40, { realizedR: 0.25 }),
      ...rows(SEALED_FOLD, 40, { realizedR: 0.9 }),
    ], "folded"));
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /fit E/);
    assert.match(result.out, /select E/);
    assert.match(result.out, /filled on select\)/);
    assert.match(result.out, /^crypto\s+pivot\s+0\.500\s+0\.250\s+40\s+100%\s+0%/m);
    assert.doesNotMatch(result.out, /confirm E/);
    assert.doesNotMatch(result.out, /0\.900/);
    assert.match(
      result.out,
      new RegExp(`40 ${SEALED_FOLD} row\\(s\\) withheld at the door`),
      "the withheld count is said, so the missing column is not a mystery",
    );
  });

  it("still reads a legacy train/test corpus", () => {
    // grid-totalr.ts carries the legacy map, so both vocabularies are live in
    // the corpus population and neither may be hardcoded. Test is the held
    // fold there, and a legacy corpus has nothing to seal.
    const result = run(corpus([
      ...rows("train", 40, { realizedR: 0.5 }),
      ...rows("test", 40, { realizedR: 0.25 }),
    ], "legacy"));
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /train E/);
    assert.match(result.out, /test E/);
    assert.match(result.out, /filled on test\)/);
    assert.match(result.out, /^crypto\s+pivot\s+0\.500\s+0\.250\s+40\s+100%\s+0%/m);
    assert.doesNotMatch(result.out, /withheld at the door/);
  });

  it("REFUSES shards of two fold vocabularies as one corpus", () => {
    const folded = corpus([...rows("fit", 40), ...rows("select", 40)], "folded");
    const legacy = corpus([...rows("train", 40), ...rows("test", 40)], "legacy");
    const result = run(folded, legacy);
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /2 fold vocabularies/);
    assert.match(result.out, /two corpora, not one/);
  });
});

describe("a table that printed nothing is a refusal", () => {
  it("REFUSES a corpus whose every row sits in the sealed fold — nothing readable remains", () => {
    // Was: 40 confirm rows exiting 0 with a full table. The door withholds
    // them now, and the reader says the seal is why it has nothing, so the
    // operator does not go looking for a wrong path.
    const result = run(corpus(rows(SEALED_FOLD, 40), "folded"));
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /handed this reader NO rows/);
    assert.match(result.out, new RegExp(`all 40 sit in the sealed ${SEALED_FOLD} fold`));
    assert.match(result.out, /nothing readable remains/);
    assert.match(result.out, /refusal, not a result/);
  });

  it("REFUSES a corpus whose every cell is under the filled floor", () => {
    // Was two confirm rows; those never reach the tallies now. Two SELECT
    // rows are readable, tallied, and under the 30-filled floor — the
    // under-floor refusal, distinct from the sealed one above.
    const result = run(corpus(rows("select", 2), "folded"));
    assert.equal(result.code, 1, "a header-only table exited 0 again");
    assert.match(result.out, /printed NO rows/);
    assert.match(result.out, /refusal, not a result/);
  });

  it("REFUSES a split name it does not know, rather than omitting it", () => {
    const result = run(corpus(rows("holdout2", 40), "folded"));
    assert.equal(result.code, 1);
    assert.match(result.out, /does not know/);
    assert.match(result.out, /holdout2/);
  });

  it("excludes gate-failed rows, so capture-all reads the shipped population", () => {
    // A --capture-all corpus carries accepted:false rows. Folding them into
    // the provenance tallies would answer the question over setups the engine
    // would never ship. Select rows, since the held fold is select.
    const shipped = rows("select", 40);
    const withRejects = [
      ...shipped,
      ...rows("select", 400, { accepted: false, realizedR: -9 }),
    ];
    const a = run(corpus(shipped, "folded"));
    const b = run(corpus(withRejects, "folded"));
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
