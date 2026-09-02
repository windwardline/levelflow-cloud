import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";

// WIF-4 (readiness audit, 2026-08-11), applied to the three 4c/4d
// consumers that never carried it (#364 round 53, finding 2). Run with no
// corpus, each of these read zero rows and wrote an artifact that looked
// like a finished run:
//
//   threshold-rescue          "0 of 0 markets have a both-folds-positive
//                              threshold" — indistinguishable from a real
//                              corpus in which no threshold rescued
//                              anything, on the script that exists to
//                              answer whether a negative cell is rescuable
//   cost-sensitivity-verdict  verdicts {}, summary all zeros
//   feasibility-4d            "feasibility for 0 markets" — and its
//                              consumers read an absent line as "the venue
//                              cannot size this cell", so the empty join
//                              reads as INFEASIBLE EVERYWHERE
//
// roster-expectancy-audit and market-dossier had one door each; these had
// none. Executed rather than source-matched, because the thing under test
// is what the process DOES with no rows — which is exactly what a source
// scan cannot see.
// The repo's own tsx, by ABSOLUTE path. `npx --no-install tsx` resolves
// from the working directory's node_modules, so it cannot be paired with a
// spawn that runs elsewhere — see the note at the temp-cwd spawn below.
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");

const DAY = 86_400_000;
const SYMBOL = "EURUSD";

const TEST_TREASURY_CURVE: TreasuryCurveFacts = {
  count: 3_000,
  firstTime: Date.UTC(2013, 0, 2),
  largestGapMs: 4 * 86_400_000,
  lastTime: Date.UTC(2027, 0, 1),
};

function shardWithRows(days: number): string {
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < days; day += 1) {
    rows.push(
      {
        accepted: true,
        confidenceScore: 80,
        outcome: "take_profit",
        realizedR: 0.5,
        split: "test",
        symbol: SYMBOL,
        time: Date.UTC(2025, 0, 6) + day * DAY + 12 * 3_600_000,
        variant: "baseline",
      } as SweepEmitRow,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "empty-refusal-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(emitPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(
    `${emitPath}.manifest.json`,
    JSON.stringify(
      buildSweepManifest({
        // This fixture feeds threshold-rescue, whose whole premise is a
        // capture-all corpus — it now asserts that premise instead of
        // stating it in a header comment, so the fixture must be honest
        // about which sweep it stands for.
        acceptance: { captureAll: true, ignoreLowEdge: false },
        analyzerVersion: "2026.08.09.test",
        anchor: "2026-08-11",
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
        generatedAt: "2026-08-11T05:00:00.000Z",
        grid: [{}],
        stepBars: 16,
        symbols: [{
          calibration: {},
          providerSymbol: SYMBOL,
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: SYMBOL,
        }],
        trainShare: 0.6,
        treasuryCurve: TEST_TREASURY_CURVE,
        warmupBars: 240,
      }),
      null,
      2,
    ) + "\n",
  );
  return emitPath;
}

function refuses(script: string, args: string[], pattern: RegExp, why: string) {
  assert.throws(
    () =>
      execFileSync(TSX, [script, ...args], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
        timeout: 120_000,
      }),
    (error: unknown) => {
      assert.match(String((error as { stderr?: string }).stderr ?? ""), pattern);
      return true;
    },
    why,
  );
}

describe("the 4c/4d consumers refuse a run that examined nothing", () => {
  it("threshold-rescue refuses no shards, no cells, and cells that matched no row", () => {
    refuses(
      "scripts/threshold-rescue.ts",
      ["--markets", "EURUSD|baseline"],
      /no shard paths given/,
      "a rescue read over zero shards is not a rescue verdict",
    );
    // The shard is never opened: the --markets door stands before the
    // corpus loop, so a nonexistent path proves the ORDER as well as the
    // refusal.
    refuses(
      "scripts/threshold-rescue.ts",
      ["never-opened.jsonl"],
      /--markets named no \(symbol\|variant\) cell/,
      "an empty --markets filters every row out and reports on nothing",
    );
    const shard = shardWithRows(40);
    refuses(
      "scripts/threshold-rescue.ts",
      [shard, "--markets", "EURUSD|no-such-variant"],
      /none of the 1 named cell\(s\) matched a row across 1 shard\(s\)/,
      "a named cell absent from the corpus must not read as no-rescue",
    );
  });

  it("cost-sensitivity-verdict refuses a missing arm and an empty cell list", () => {
    refuses(
      "scripts/cost-sensitivity-verdict.ts",
      ["--gross", "g.jsonl", "--cells", "EURUSD|baseline"],
      /--net named no shard/,
      "one arm of a two-corpus comparison cannot stand for both",
    );
    refuses(
      "scripts/cost-sensitivity-verdict.ts",
      ["--net", "n.jsonl", "--cells", "EURUSD|baseline"],
      /--gross named no shard/,
      "the gross arm is the one the comparison exists for",
    );
    refuses(
      "scripts/cost-sensitivity-verdict.ts",
      ["--net", "n.jsonl", "--gross", "g.jsonl"],
      /--cells named no \(symbol\|variant\) cell/,
      "the verdict loop walks the cell map — an empty one judges nothing",
    );
  });

  it("feasibility-4d refuses no shards, a candidate file with no accepts, and a corpus with no geometry", () => {
    const dir = mkdtempSync(join(tmpdir(), "feas-refusal-"));
    const noAccepts = join(dir, "no-accepts.json");
    writeFileSync(
      noAccepts,
      JSON.stringify({
        analyzerVersion: "2026.08.09.test",
        baselineVariant: "baseline",
        markets: {
          EURUSD: { accepted: [], measureOnly: false, starved: false },
        },
      }) + "\n",
    );
    refuses(
      "scripts/feasibility-4d.ts",
      ["--candidates", noAccepts],
      /no shard paths given/,
      "an empty join reads as infeasible everywhere, not as missing",
    );
    refuses(
      "scripts/feasibility-4d.ts",
      ["never-opened.jsonl", "--candidates", noAccepts],
      /names no accepted candidate on any market/,
      "a candidate file with no accepts poses no feasibility question",
    );
    // Rows exist under the named cell, and carry no planned entry price
    // or riskDistance — the geometry pass collects nothing. Only the
    // corpus can show this, which is why it is a third door rather than a
    // stricter reading of the first two.
    const shard = shardWithRows(40);
    const accepts = join(dir, "accepts.json");
    writeFileSync(
      accepts,
      JSON.stringify({
        analyzerVersion: "2026.08.09.test",
        baselineVariant: "baseline",
        markets: {
          EURUSD: {
            accepted: [{
              pairedP: 0.01,
              selectExpectancyDelta: 0.2,
              selectExpiryShare: null,
              selectFilled: 40,
              variant: "baseline",
              worstDayR: null,
            }],
            measureOnly: false,
            starved: false,
          },
        },
      }) + "\n",
    );
    refuses(
      "scripts/feasibility-4d.ts",
      [shard, "--candidates", accepts],
      /found a row with a planned entry price and a positive riskDistance/,
      "a join that collected no geometry must not be written as a result",
    );
  });
});

// #364 round 54, finding 2. Round 53 installed the law above over a
// HAND-PICKED five-file population — "three of the five consumers" — and
// the flag law one round earlier had already established why that is the
// wrong move: its population is DERIVED by globbing scripts/, precisely
// because a curated list is how market-dossier sat outside the flag law
// for 49 rounds. The empty-corpus law did not inherit the lesson, and the
// files it missed were listed by name two lines above it in the same test
// file: exclusion-suspects and stop-provenance printed their column
// header ALONE at exit 0, and ag-class-derivation printed "no rows" per
// cohort under a success code — each indistinguishable from a real corpus
// holding nothing that qualified.
//
// So the population is derived here, and the law is EXECUTED rather than
// source-matched: what a process does when it names no corpus is a fact
// about the process. Sixteen readers, ~11s.
describe("every corpus reader refuses a run that names no corpus", () => {
  // A reader is anything that opens the one-clock door. That is the same
  // definition the door's own derived scan uses (tests/sweepStats.test.ts),
  // and it is a fact about the file rather than a list someone maintains.
  // All four forms, the sync door included (R4 act 1): a reader migrated
  // onto it must stay in this population, or the law stops executing it.
  const DOOR = /assertManifest(?:edCorpus(?:Sync|Streaming)?)?\(/;
  const DEFINES_THE_DOOR = "scripts/sweepStats.ts";
  const repoRoot = process.cwd();

  // The tree as git sees it, minus the one directory a CONCURRENT test
  // file legitimately writes to: tests/acceptanceGate.test.ts drives the
  // LA-6 ledger through docs/research/confirm-reads/ and cleans up after
  // itself, but node:test runs files in parallel, so its fixture can be
  // on disk while this scan samples. Nothing here can write there — a
  // ledger line is only appended on a confirm READ, which needs a corpus.
  const trackedState = () =>
    execFileSync("git", ["status", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter((line) => line.trim() && !line.includes("docs/research/confirm-reads/"))
      .sort()
      .join("\n");

  const readers = readdirSync("scripts")
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `scripts/${name}`)
    .filter((file) => DOOR.test(readFileSync(file, "utf8")))
    .sort();

  it("the derived population is the readers, and the one exemption states why", () => {
    assert.ok(
      readers.includes(DEFINES_THE_DOOR),
      "the glob must find the module that defines the door, so its " +
        "exemption stays honest",
    );
    // The exemption VERIFIES ITS PREMISE, the way the flag law's do: this
    // file matches because it EXPORTS the doors, not because it opens one.
    const source = readFileSync(DEFINES_THE_DOOR, "utf8");
    assert.match(
      source,
      /export function assertManifest\(/,
      `${DEFINES_THE_DOOR} is exempted as the door's definition — if it ` +
        `stops exporting one, it is a reader like any other`,
    );
    // One below the current count, the same rule the sibling flag-law floor
    // states in words (tests/sweepManifest.test.ts). scripts/e4-collapse.ts
    // took this population from 17 to 18 and the floor stayed at 16, leaving
    // the tighter of the two pins carrying two files of slack — a refactor
    // could have dropped two readers out of the law with this still green.
    assert.ok(
      readers.length >= 17,
      `the glob must find the corpus readers, got ${readers.length} — if a ` +
        `refactor legitimately shrank the population, lower this floor in the ` +
        `same commit and say which files left and why`,
    );
  });

  for (const reader of readers.filter((file) => file !== DEFINES_THE_DOOR)) {
    it(`${reader} refuses with no corpus named — executed`, () => {
      let exitCode: number | undefined;
      let stderr = "";
      // Run from a temp directory, so a reader's DEFAULT relative output
      // path cannot resolve into the repository. That is not belt and
      // braces: this scan is how confirm-4d's write-before-validate was
      // found (#364 round 54). It wrote the tracked
      // 4d-final-picks.json from the candidates file alone and only THEN
      // called gradeCorpus, which refused — so the first run of this test
      // rewrote a tracked artifact, stamped a fresh frozenAt, and dropped
      // the INVALID banner, while the process exited 1 as if nothing had
      // happened.
      const elsewhere = mkdtempSync(join(tmpdir(), "no-corpus-"));
      const before = trackedState();
      try {
        // The runner is the repo's OWN tsx, by absolute path, never `npx`
        // (#364 round 55, self-inflicted). `npx --no-install tsx` resolves
        // from the CWD's node_modules, so pairing it with the temp cwd
        // above broke it on any machine without tsx already in the npx
        // cache — which is every CI runner. It printed "npx canceled due
        // to missing packages" and exited 1, and round 54's assertions
        // were `exitCode !== 0` and `stderr` non-empty, both of which an
        // npm error satisfies. So this scan passed in CI while running
        // NOTHING: the law that a run examining nothing must not report
        // success, broken by the test written to enforce it. It went
        // green locally because this machine had tsx cached.
        // …and the environment must be cleaned as deliberately as the cwd.
        // `npm test` runs this file under `tsx --tsconfig tsconfig.tests.json`,
        // and tsx exports that as TSX_TSCONFIG_PATH — RELATIVE. The child
        // inherits it, resolves it against the temp cwd above, and dies inside
        // tsx's own loader before the reader's first line runs.
        //
        // That crash is round 55's defect on a new axis, and it defeated every
        // assertion below: it exits 1, its stderr is long and non-empty, it
        // carries no npm/npx marker and no ENOENT — and the minified bundle it
        // dumps contains the substring "emit", so it even satisfied "names the
        // corpus". This whole scan asserted NOTHING about any reader, on this
        // machine and in CI alike, while reporting green.
        //
        // The subjects need no tsconfig to run, so the variable is dropped
        // rather than absolutized.
        const env = { ...process.env };
        delete env.TSX_TSCONFIG_PATH;
        execFileSync(TSX, [join(repoRoot, reader)], {
          cwd: elsewhere,
          encoding: "utf8",
          env,
          stdio: "pipe",
          timeout: 120_000,
        });
      } catch (error) {
        const failed = error as { status?: number; stderr?: string };
        exitCode = failed.status;
        stderr = String(failed.stderr ?? "");
      }
      // …and the law the temp cwd cannot enforce on its own, since a
      // reader may resolve a path from its own module location: a run
      // that names no corpus writes NOTHING. A refusal that has already
      // mutated the tree is not a refusal.
      assert.deepEqual(
        trackedState(),
        before,
        `${reader} changed tracked files while refusing — validate before ` +
          `mutating; every sibling that writes an artifact checks its ` +
          `corpus first`,
      );
      assert.notEqual(
        exitCode,
        undefined,
        `${reader} exited 0 with no corpus named — a run over zero rows ` +
          `cannot report a verdict (WIF-4), and an exit code saying the ` +
          `run finished is what makes the empty artifact readable as one`,
      );
      assert.notEqual(exitCode, 0, `${reader} must not exit 0`);
      // The RUNNER started. Without this, a harness that never launched
      // the script satisfies every assertion below it — which is exactly
      // what happened in CI at e1fc975, silently, for a whole round.
      assert.doesNotMatch(
        stderr,
        /npm error|npx canceled|command not found|Cannot find module 'tsx'|tsx\/dist\/register/,
        `${reader} was never executed — the failure is the test harness, ` +
          `not the script, and a harness failure must never be read as ` +
          `the subject refusing`,
      );
      assert.ok(
        stderr.trim().length > 0,
        `${reader} refused silently — the refusal must say what was missing`,
      );
      // "Says what was missing" is checked as SAYING WHAT WAS MISSING
      // (#364 round 55, finding 3). The first version asserted only
      // "exited non-zero, said something" — and the temp cwd above makes
      // that gap live rather than theoretical: several readers resolve a
      // cwd-relative default INPUT that cannot exist under a temp
      // directory, so deleting market-dossier's corpus door would leave
      // the run dying on `ENOENT: 4d-final-picks.json` — non-zero,
      // non-empty stderr, suite GREEN — with the round-49 defect restored
      // (a complete-looking 97-market dossier, every measurement null).
      //
      // Derived rather than a per-reader pattern table, which would be the
      // curated list this whole scan exists to replace: the refusal must
      // NAME the corpus, and must not be an incidental miss on some other
      // default input.
      assert.doesNotMatch(
        stderr,
        /ENOENT|no such file or directory/,
        `${reader} refused by failing to open a DEFAULT INPUT, not by ` +
          `naming its missing corpus — the corpus door is absent, or it ` +
          `sits behind an input read. Both are the shape round 54 found ` +
          `in confirm-4d`,
      );
      assert.match(
        stderr,
        /shard|corpus|emit|\.jsonl/i,
        `${reader}'s refusal must name the corpus it did not get, so an ` +
          `operator learns what to pass rather than what broke`,
      );
    });
  }
});
