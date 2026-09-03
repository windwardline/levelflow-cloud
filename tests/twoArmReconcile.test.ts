import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  sha256Hex,
  stableStringify,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import { rosterHashOf } from "../scripts/sweepFolds.ts";
import {
  CAPTURE_ALL_ZEROED,
  formatReport,
  linesOf,
  reconcileTwoArms,
  SHARED_TERMS,
} from "../scripts/two-arm-reconcile.ts";

/**
 * R3 register item H: two arms, one measurement — proven on the corpus rather
 * than asserted from a two-market dry run.
 *
 * Every case below builds BOTH arms from one row set, so the identical case
 * is identical by construction and each divergent case is one deliberate
 * mutation away from it. A reconciliation that could not tell them apart
 * would be a reader that reports agreement it never checked.
 */

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "two-arm-reconcile.ts");
const HOUR = 3_600_000;

type Row = Record<string, unknown>;

function row(
  symbol: string,
  variant: string,
  split: string,
  index: number,
  accepted: boolean,
  extra: Row = {},
): Row {
  return {
    accepted,
    holdout: false,
    // Nested values, so the field comparison is exercised past the top level:
    // a divergence inside `legs` or `votes` must be as visible as one in a
    // scalar (the 2026-09-02 refutation found the fixtures carried none).
    legs: accepted
      ? [{ exitAtMs: Date.UTC(2025, 0, 6) + index * HOUR + HOUR, price: 1.1 + index / 1000, size: 0.5 }]
      : [],
    outcome: accepted ? (index % 2 === 0 ? "take_profit" : "stop_loss") : "unfilled",
    realizedR: accepted ? (index % 2 === 0 ? 0.9 : -1) : 0,
    split,
    symbol,
    time: Date.UTC(2025, 0, 6) + index * HOUR,
    variant,
    votes: [{ side: "buy", strategy: "trend", weight: 1 }],
    ...extra,
  };
}

/** Interleaved accepted/rejected rows across two symbols and two variants. */
function captureAllRows(): Row[] {
  const rows: Row[] = [];
  for (const symbol of ["EURUSD", "GBPUSD"]) {
    for (const variant of ["baseline", "runnerProtection=hold"]) {
      for (let index = 0; index < 8; index += 1) {
        rows.push(row(symbol, variant, "fit", index, index % 3 !== 1));
      }
    }
  }
  return rows;
}

function decisionsFor(rows: Row[], captureAll: boolean) {
  const byKey = new Map<string, { emitted: number; symbol: string; variant: string; split: string }>();
  for (const entry of rows) {
    const key = `${entry.symbol}|${entry.variant}|${entry.split}`;
    const current = byKey.get(key) ??
      { emitted: 0, split: String(entry.split), symbol: String(entry.symbol), variant: String(entry.variant) };
    current.emitted += 1;
    byKey.set(key, current);
  }
  return [...byKey.values()].map((entry) => ({
    decisionPoints: 40,
    emitted: entry.emitted,
    rejections: {
      belowConfidence: captureAll ? 0 : 3,
      belowPayoff: captureAll ? 0 : 2,
      belowThreshold: captureAll ? 0 : 5,
      noConsensus: 7,
      regimeBlocked: captureAll ? 0 : 4,
    },
    split: entry.split,
    symbol: entry.symbol,
    variant: entry.variant,
  }));
}

function writeArm(
  dir: string,
  name: string,
  rows: Row[],
  options: {
    captureAll: boolean;
    factsRows: Row[];
    manifestOverrides?: Record<string, unknown>;
    lines?: string[];
  },
): string {
  const emitPath = join(dir, `${name}.jsonl`);
  const lines = options.lines ?? rows.map((entry) => JSON.stringify(entry));
  writeFileSync(emitPath, lines.join("\n") + "\n");
  const symbols = [...new Set(options.factsRows.map((entry) => String(entry.symbol)))];
  const manifest = buildSweepManifest({
    acceptance: { captureAll: options.captureAll, ignoreLowEdge: false },
    analyzerVersion: "2026.09.02.test",
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
    days: 7000,
    decisions: decisionsFor(rows, options.captureAll),
    emitColumns: Object.keys(rows[0]).sort(),
    generatedAt: "2026-09-02T10:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    grossCostScale: 0,
    modeledCostScale: 1,
    requestedSymbols: symbols,
    source: { dirty: false, revision: "e51e742c6ed50ef7a1a026760af61f39b0f9570f" },
    stepBars: 16,
    // The SAME series facts on both arms: the real arms read the same stores,
    // so a fixture whose facts followed each arm's own rows would manufacture a
    // `symbols` divergence the instrument is right to report.
    symbols: symbols.map((symbol) => ({
      calibration: {},
      providerSymbol: symbol,
      series: {
        "15min": seriesFacts(
          options.factsRows.filter((entry) => entry.symbol === symbol).map((
            entry,
          ) => ({ time: Number(entry.time) })),
          "intraday",
        ),
      },
      symbol,
    })),
    trainShare: 0.6,
    treasuryCurve: {
      count: 3_000,
      firstTime: Date.UTC(2013, 0, 2),
      largestGapMs: 4 * 86_400_000,
      lastTime: Date.UTC(2027, 0, 1),
    },
    warmupBars: 240,
    ...options.manifestOverrides,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(
    `${emitPath}.manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return emitPath;
}

function twoArms(mutate: {
  captureAllRows?: (rows: Row[]) => Row[];
  captureAllLines?: (lines: string[]) => string[];
  gatedRows?: (rows: Row[]) => Row[];
  gatedLines?: (lines: string[]) => string[];
  gatedManifest?: Record<string, unknown>;
  captureAllManifest?: Record<string, unknown>;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "two-arm-"));
  const all = mutate.captureAllRows?.(captureAllRows()) ?? captureAllRows();
  const accepted = all.filter((entry) => entry.accepted === true);
  const gatedRowSet = mutate.gatedRows?.(accepted) ?? accepted;
  const gatedLines = mutate.gatedLines?.(
    gatedRowSet.map((entry) => JSON.stringify(entry)),
  );
  const captureAllLines = mutate.captureAllLines?.(
    all.map((entry) => JSON.stringify(entry)),
  );
  return {
    captureAllPath: writeArm(dir, "capture-all", all, {
      captureAll: true,
      factsRows: all,
      lines: captureAllLines,
      manifestOverrides: mutate.captureAllManifest,
    }),
    gatedPath: writeArm(dir, "gated", gatedRowSet, {
      captureAll: false,
      factsRows: all,
      lines: gatedLines,
      manifestOverrides: mutate.gatedManifest,
    }),
    // No pin stands here, so every reconciliation below resolves its held-out
    // set "unpinned": the tracked docs/research/r4/ is this repo's, and a
    // fixture roster at R3's anchor must not be read against R3's pin.
    holdoutPinDir: join(dir, "pins"),
  };
}

describe("the identical case, by construction", () => {
  it("finds nothing and counts every accepted row byte-identical", () => {
    const report = reconcileTwoArms({ ...twoArms(), maxExamples: 20 });
    assert.deepEqual(report.findings, []);
    // 4 (symbol, variant) keys x 8 decisions, three of every eight rejected.
    assert.equal(report.gated.rows, 20);
    assert.equal(report.captureAll.rows, 32);
    assert.equal(report.captureAll.acceptedRows, 20);
    assert.equal(report.captureAll.rejectedRows, 12);
    assert.equal(report.identicalByBytes, 20);
    assert.equal(report.identicalByFields, 0);
    assert.equal(report.sharedTermsChecked, SHARED_TERMS.length + 2);
    // Register item H's own signature: the four counters read zero in the
    // capture-all manifest and stand in the gated one.
    for (const counter of CAPTURE_ALL_ZEROED) {
      assert.equal(report.captureAll.zeroedCounters[counter], 0);
      assert.ok(report.gated.zeroedCounters[counter] > 0);
    }
  });

  it("treats a re-serialized row as identical by fields, not as a divergence", () => {
    // Key order is not a value. A gated line with the same fields in a
    // different order must not read as the arms disagreeing.
    const report = reconcileTwoArms({
      ...twoArms({
        gatedLines: (lines) =>
          lines.map((line, index) => {
            if (index !== 3) return line;
            const parsed = JSON.parse(line) as Row;
            const reversed: Row = {};
            for (const key of Object.keys(parsed).reverse()) {
              reversed[key] = parsed[key];
            }
            return JSON.stringify(reversed);
          }),
      }),
      maxExamples: 20,
    });
    assert.deepEqual(report.findings, []);
    assert.equal(report.identicalByBytes, 19);
    assert.equal(report.identicalByFields, 1);
  });
});

describe("each divergence is one mutation away, and each is named", () => {
  it("a changed field on one accepted row names the row and the field", () => {
    const report = reconcileTwoArms({
      ...twoArms({
        gatedRows: (rows) =>
          rows.map((entry, index) =>
            index === 5 ? { ...entry, realizedR: 0.25 } : entry
          ),
      }),
      maxExamples: 20,
    });
    assert.equal(report.findings.length, 1, report.findings.join("\n"));
    assert.match(report.findings[0], /rows differ at EURUSD\|/);
    assert.match(report.findings[0], /realizedR: gated=0\.25 capture-all=/);
  });

  it("an accepted row the gated arm lacks is reported where the gated corpus ends", () => {
    const report = reconcileTwoArms({
      ...twoArms({ gatedRows: (rows) => rows.slice(0, -1) }),
      maxExamples: 20,
    });
    assert.ok(
      report.findings.some((finding) =>
        /gated corpus ended before the capture-all accepted set/.test(finding)
      ),
      report.findings.join("\n"),
    );
  });

  it("a corpus cut short mid-write is caught against its own manifest's count", () => {
    // The manifest still claims every row the run emitted; the file holds one
    // fewer. This is the shape a truncated stream leaves, and it must be a
    // finding here rather than a smaller result downstream.
    const report = reconcileTwoArms({
      ...twoArms({ gatedLines: (lines) => lines.slice(0, -1) }),
      maxExamples: 20,
    });
    assert.ok(
      report.findings.some((finding) =>
        /gated: GBPUSD\|runnerProtection=hold\|fit — manifest says 5 rows emitted, the file holds 4/
          .test(finding)
      ),
      report.findings.join("\n"),
    );
  });

  it("an accepted:false row inside the gated corpus is a finding", () => {
    const report = reconcileTwoArms({
      ...twoArms({
        gatedRows: (rows) =>
          rows.map((entry, index) =>
            index === 2 ? { ...entry, accepted: false } : entry
          ),
      }),
      maxExamples: 20,
    });
    assert.ok(
      report.findings.some((finding) =>
        /gated corpus carries an accepted:false row/.test(finding)
      ),
      report.findings.join("\n"),
    );
    assert.ok(
      report.findings.some((finding) =>
        /carries 1 accepted:false rows in all/.test(finding)
      ),
    );
  });

  it("rows the gated arm holds beyond the accepted set are counted", () => {
    const report = reconcileTwoArms({
      ...twoArms({
        gatedRows: (rows) => [
          ...rows,
          row("GBPUSD", "runnerProtection=hold", "fit", 99, true),
        ],
      }),
      maxExamples: 20,
    });
    assert.ok(
      report.findings.some((finding) =>
        /gated corpus holds 1 rows beyond the capture-all accepted set/.test(
          finding,
        )
      ),
      report.findings.join("\n"),
    );
  });

  it("a shared manifest term that differs names the term", () => {
    const report = reconcileTwoArms({
      ...twoArms({ gatedManifest: { stepBars: 8 } }),
      maxExamples: 20,
    });
    assert.deepEqual(report.findings, [
      'manifest term "stepBars" differs between the arms — two measurements, not one seen twice',
    ]);
  });

  it("different engine revisions are two engines, whatever the rows say", () => {
    const report = reconcileTwoArms({
      ...twoArms({
        captureAllManifest: {
          source: { dirty: true, revision: "0000000000000000000000000000000000000000" },
        },
      }),
      maxExamples: 20,
    });
    assert.ok(report.findings.some((finding) => /source\.revision differs/.test(finding)));
    assert.ok(report.findings.some((finding) => /capture-all: source\.dirty is true/.test(finding)));
  });

  it("the arms must have walked the same decision instants", () => {
    const report = reconcileTwoArms({
      ...twoArms({
        captureAllManifest: {
          decisions: decisionsFor(captureAllRows(), true).map((entry, index) =>
            index === 0 ? { ...entry, decisionPoints: 41 } : entry
          ),
        },
      }),
      maxExamples: 20,
    });
    assert.ok(
      report.findings.some((finding) =>
        /decisionPoints differ \(gated 40, capture-all 41\)/.test(finding)
      ),
      report.findings.join("\n"),
    );
  });

  it("caps the listed examples and counts the rest", () => {
    const report = reconcileTwoArms({
      ...twoArms({
        gatedRows: (rows) => rows.map((entry) => ({ ...entry, realizedR: 7 })),
      }),
      maxExamples: 3,
    });
    const listed = report.findings.filter((finding) => /^rows differ/.test(finding));
    assert.equal(listed.length, 3);
    assert.ok(
      report.findings.some((finding) =>
        /17 further divergent rows not listed \(20 in all\)/.test(finding)
      ),
      report.findings.join("\n"),
    );
  });
});

describe("every check the instrument makes has a mutation that fails it", () => {
  // The 2026-09-02 refutation ran sixteen mutants of the instrument against
  // this file and eleven survived: the checks below existed and nothing
  // executed them. Each case here is one of those mutants, now killed.
  const KEY = "GBPUSD|runnerProtection=hold|fit";

  it("sees a divergence nested inside legs, and one inside votes", () => {
    const legs = reconcileTwoArms({
      ...twoArms({
        gatedRows: (rows) =>
          rows.map((entry, index) =>
            index === 4
              ? { ...entry, legs: [{ ...(entry.legs as Row[])[0], price: 9.99 }] }
              : entry
          ),
      }),
      maxExamples: 20,
    });
    assert.equal(legs.findings.length, 1, legs.findings.join("\n"));
    assert.match(legs.findings[0], /legs: gated=\[\{"exitAtMs":\d+,"price":9\.99/);
    const votes = reconcileTwoArms({
      ...twoArms({
        gatedRows: (rows) =>
          rows.map((entry, index) =>
            index === 4 ? { ...entry, votes: [{ side: "sell", strategy: "trend", weight: 1 }] } : entry
          ),
      }),
      maxExamples: 20,
    });
    assert.equal(votes.findings.length, 1, votes.findings.join("\n"));
    assert.match(votes.findings[0], /votes: gated=\[\{"side":"sell"/);
  });

  it("checks the capture-all arm's rows against ITS manifest too", () => {
    const report = reconcileTwoArms({
      ...twoArms({ captureAllLines: (lines) => lines.slice(0, -1) }),
      maxExamples: 20,
    });
    assert.ok(
      report.findings.some((finding) =>
        new RegExp(`capture-all: ${KEY.replace(/\|/g, "\\|")} — manifest says 8 rows emitted, the file holds 7`).test(finding)
      ),
      report.findings.join("\n"),
    );
  });

  it("names a row whose key the manifest never counted", () => {
    // The gated file carries a NZDUSD row; the gated manifest's decisions[]
    // was built without it, so the row is an orphan of the run's own account.
    const orphan = row("NZDUSD", "baseline", "fit", 0, true);
    const arms = twoArms({
      gatedManifest: { decisions: decisionsFor(captureAllRows().filter((entry) => entry.accepted === true), false) },
      gatedRows: (rows) => [...rows, orphan],
    });
    const report = reconcileTwoArms({ ...arms, maxExamples: 20 });
    assert.ok(
      report.findings.some((finding) => /gated: NZDUSD\|baseline\|fit — 1 rows in the file with no decisions\[\] entry/.test(finding)),
      report.findings.join("\n"),
    );
  });

  it("names a decisions[] cell one arm has and the other lacks, in both directions", () => {
    const allDecisions = (captureAll: boolean) => decisionsFor(captureAllRows(), captureAll);
    const gatedShort = reconcileTwoArms({
      ...twoArms({ gatedManifest: { decisions: allDecisions(false).slice(1) } }),
      maxExamples: 20,
    });
    assert.ok(
      gatedShort.findings.some((finding) => /capture-all: EURUSD\|baseline\|fit has decisions\[\] with no gated counterpart/.test(finding)),
      gatedShort.findings.join("\n"),
    );
    const captureShort = reconcileTwoArms({
      ...twoArms({ captureAllManifest: { decisions: allDecisions(true).slice(1) } }),
      maxExamples: 20,
    });
    assert.ok(
      captureShort.findings.some((finding) => /gated: EURUSD\|baseline\|fit has decisions\[\] with no capture-all counterpart/.test(finding)),
      captureShort.findings.join("\n"),
    );
  });

  it("refuses to pass an arm whose manifest carries no decisions[] at all", () => {
    const arms = twoArms();
    const manifestPath = `${arms.gatedPath}.manifest.json`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    delete manifest.decisions;
    const { generatedAt: _generatedAt, manifestHash: _hash, ...payload } = manifest;
    manifest.manifestHash = sha256Hex(stableStringify(payload));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    const report = reconcileTwoArms({ ...arms, maxExamples: 20 });
    assert.ok(
      report.findings.some((finding) => /gated: manifest carries no decisions\[\]/.test(finding)),
      report.findings.join("\n"),
    );
  });

  it("treats a differing ignoreLowEdge as two accepted populations", () => {
    const report = reconcileTwoArms({
      ...twoArms({ captureAllManifest: { acceptance: { captureAll: true, ignoreLowEdge: true } } }),
      maxExamples: 20,
    });
    assert.ok(report.findings.some((finding) => /acceptance\.ignoreLowEdge differs/.test(finding)), report.findings.join("\n"));
  });

  it("flags a dirty GATED arm as well as a dirty capture-all one, and says which definition applied", () => {
    const tracked = reconcileTwoArms({
      ...twoArms({ gatedManifest: { source: { dirty: true, revision: "e51e742c6ed50ef7a1a026760af61f39b0f9570f", untracked: 0 } } }),
      maxExamples: 20,
    });
    assert.ok(tracked.findings.some((finding) => /^gated: source\.dirty is true — a tracked file differed/.test(finding)), tracked.findings.join("\n"));
    // A manifest written before `untracked` existed says less than that.
    const legacy = reconcileTwoArms({
      ...twoArms({ gatedManifest: { source: { dirty: true, revision: "e51e742c6ed50ef7a1a026760af61f39b0f9570f" } } }),
      maxExamples: 20,
    });
    assert.ok(legacy.findings.some((finding) => /^gated: source\.dirty is true under the pre-2026-09-02 definition/.test(finding)), legacy.findings.join("\n"));
  });

  it("compares the surviving-symbol facts, and enumerates every shared term", () => {
    const report = reconcileTwoArms({
      ...twoArms({
        gatedManifest: {
          symbols: [{ calibration: {}, providerSymbol: "EURUSD", series: {}, symbol: "EURUSD" }],
        },
      }),
      maxExamples: 20,
    });
    assert.ok(report.findings.some((finding) => /manifest term "symbols" differs/.test(finding)), report.findings.join("\n"));
    // Enumerated, never counted: a term dropped from the list is a check that
    // silently stopped happening. `holdoutSymbols` stays in the list as
    // PROVENANCE — two arms of one sweep carry one stamp — while nothing
    // excludes on it (R4 act 2, one holdout population): the set both arms
    // are read under is the stratified rule over `requestedSymbols`, which
    // the report states below.
    assert.deepEqual([...SHARED_TERMS], [
      "analyzerVersion", "anchor", "barRejections", "calendarCensus", "calibrationByClass", "clock",
      "conditions", "days", "emitColumns", "engineDeclined", "folds", "foldsByClass", "grid",
      "grossCostScale", "holdoutSymbols", "modeledCostScale", "requestedSymbols", "stepBars", "symbols",
      "trainShare", "treasuryCurve", "warmupBars",
    ]);
  });

  it("states the one holdout population both arms are read under — the stratified rule, never the stamp", () => {
    const report = reconcileTwoArms({ ...twoArms(), maxExamples: 20 });
    assert.equal(report.holdout.rule, "stratified-per-class-20pct");
    // A two-market forex class holds nothing out, and the fixture stamps
    // nothing: both facts are stated, not assumed.
    assert.deepEqual(report.holdout.markets, []);
    assert.deepEqual(report.holdout.stamped, []);
    assert.equal(report.holdout.pinned, false);
    assert.match(
      formatReport(report),
      /^holdout: stratified-per-class-20pct — 0 markets named as provenance only \(this reader pools nothing and prints no per-market line\) \(unpinned — no .*holdout-2026-08-26\.json, computed from requestedSymbols\); stamped flag: 0 markets, provenance only$/m,
    );
    // Stamping a market on both arms moves the provenance line and nothing else.
    const stamped = reconcileTwoArms({
      ...twoArms({
        captureAllManifest: { holdoutSymbols: ["EURUSD"] },
        gatedManifest: { holdoutSymbols: ["EURUSD"] },
      }),
      maxExamples: 20,
    });
    assert.deepEqual(stamped.findings, []);
    assert.deepEqual(stamped.holdout.markets, []);
    assert.deepEqual(stamped.holdout.stamped, ["EURUSD"]);
  });

  it("refuses a pin that names another set than the arms compute for the same roster — executed", () => {
    const arms = twoArms();
    mkdirSync(arms.holdoutPinDir, { recursive: true });
    const pinPath = join(arms.holdoutPinDir, "holdout-2026-08-26.json");
    writeFileSync(
      pinPath,
      JSON.stringify({
        manifestHashes: ["0".repeat(64)],
        markets: ["EURUSD"],
        rosterHash: rosterHashOf(["EURUSD", "GBPUSD"]),
        rule: "stratified-per-class-20pct",
      }) + "\n",
    );
    assert.throws(
      () => reconcileTwoArms({ ...arms, maxExamples: 20 }),
      /heldOutSetDrift: .*pinned but not computed: EURUSD; computed but not pinned: none/,
    );
    // The same pin for ANOTHER requested roster is unpinned for this one.
    writeFileSync(
      pinPath,
      JSON.stringify({
        manifestHashes: ["0".repeat(64)],
        markets: ["EURUSD"],
        rosterHash: rosterHashOf(["EURUSD", "GBPUSD", "USDJPY"]),
        rule: "stratified-per-class-20pct",
      }) + "\n",
    );
    const report = reconcileTwoArms({ ...arms, maxExamples: 20 });
    assert.equal(report.holdout.pinState, "other-roster");
    assert.deepEqual(report.findings, []);
  });

  it("accepts only the boolean true — a string \"true\" is not an accepted row", () => {
    // The capture-all row is skipped as not accepted, so the gated arm is left
    // holding a row the capture-all accepted set never matched.
    const report = reconcileTwoArms({
      ...twoArms({
        captureAllLines: (lines) =>
          lines.map((line, index) => index === 0 ? line.replace('"accepted":true', '"accepted":"true"') : line),
      }),
      maxExamples: 20,
    });
    assert.equal(report.captureAll.acceptedRows, 19);
    assert.ok(report.findings.some((finding) => /gated corpus holds 1 rows beyond the capture-all accepted set/.test(finding)), report.findings.join("\n"));
  });
});

describe("the doors", () => {
  it("refuses two arms swept in the same acceptance mode", () => {
    const arms = twoArms({ gatedManifest: { acceptance: { captureAll: true, ignoreLowEdge: false } } });
    assert.throws(
      () => reconcileTwoArms({ ...arms, maxExamples: 20 }),
      /requires captureAll=false and the corpus was swept with captureAll=true/,
    );
  });

  it("refuses a manifest that cannot state its acceptance mode", () => {
    // A pre-#481 manifest, reproduced exactly: the field removed and the hash
    // recomputed over what remains, so the door admits it and only the
    // acceptance check can refuse.
    const arms = twoArms();
    const manifestPath = `${arms.captureAllPath}.manifest.json`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    delete manifest.acceptance;
    const { generatedAt: _generatedAt, manifestHash: _hash, ...payload } = manifest;
    manifest.manifestHash = sha256Hex(stableStringify(payload));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    // The corpus door itself refuses it first (#481): the instrument's own
    // "predates the acceptance field" branch stands behind that door for a
    // manifest that somehow passes it, and either way the arm is not read.
    assert.throws(
      () => reconcileTwoArms({ ...arms, maxExamples: 20 }),
      /manifest carries no acceptance block|predates the acceptance field/,
    );
  });

  it("refuses an emit with no manifest beside it", () => {
    const arms = twoArms();
    const dir = mkdtempSync(join(tmpdir(), "two-arm-nomanifest-"));
    const bare = join(dir, "bare.jsonl");
    writeFileSync(bare, readFileSync(arms.gatedPath, "utf8"));
    assert.throws(
      () => reconcileTwoArms({ ...arms, gatedPath: bare, maxExamples: 20 }),
      /no manifest beside the emit/,
    );
  });
});

describe("the line iterator", () => {
  it("yields every line across chunk boundaries, multi-byte characters intact", () => {
    const dir = mkdtempSync(join(tmpdir(), "two-arm-lines-"));
    const path = join(dir, "lines.txt");
    // Long enough to cross several 64 KB reads, with a multi-byte character
    // on every line so at least one straddles a chunk edge.
    const lines = Array.from({ length: 5_000 }, (_, index) => `${"x".repeat(37)}·${index}`);
    writeFileSync(path, lines.join("\n") + "\n");
    assert.deepEqual([...linesOf(path)], lines);
  });
});

describe("as a binary", () => {
  function run(args: string[], cwd?: string): { code: number; stderr: string; stdout: string } {
    const env = { ...process.env };
    delete env.TSX_TSCONFIG_PATH;
    try {
      const stdout = execFileSync(TSX, [READER, ...args], {
        cwd: cwd ?? mkdtempSync(join(tmpdir(), "two-arm-run-")),
        encoding: "utf8",
        env,
        stdio: "pipe",
      });
      return { code: 0, stderr: "", stdout };
    } catch (error) {
      const failed = error as { status?: number; stderr?: string; stdout?: string };
      const stderr = String(failed.stderr ?? "");
      assert.doesNotMatch(
        stderr,
        /npm error|npx canceled|command not found|Cannot find module 'tsx'|tsx\/dist\/register/,
        `the reader was never executed — a harness failure must never read as the subject refusing: ${stderr.slice(0, 300)}`,
      );
      return { code: failed.status ?? -1, stderr, stdout: String(failed.stdout ?? "") };
    }
  }

  it("exits 0 on the identical case and prints the verdict", () => {
    const arms = twoArms();
    const result = run(["--gated", arms.gatedPath, "--capture-all", arms.captureAllPath]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /VERDICT: the capture-all arm filtered to accepted:true IS the gated corpus/);
  });

  it("exits 1 on a divergent case and lists the finding", () => {
    const arms = twoArms({
      gatedRows: (rows) => rows.map((entry, index) => index === 0 ? { ...entry, outcome: "ambiguous" } : entry),
    });
    const result = run(["--gated", arms.gatedPath, "--capture-all", arms.captureAllPath]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /VERDICT: DIVERGENT — 1 finding/);
    assert.match(result.stdout, /outcome: gated="ambiguous"/);
  });

  it("refuses with no corpus named, and says what to pass", () => {
    const result = run([]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /no corpus paths given — pass --gated <emit\.jsonl> --capture-all <emit\.jsonl>/);
  });
});

describe("a divergence on a confirm-fold row is named without its values", () => {
  // The reconciliation must read every row of both arms — its whole purpose
  // is row equality, and blinding it to the confirm fold would leave that
  // third unverified on the arm the gate reads. So it reads the fold and
  // PRINTS NOTHING from it: a differing confirm row is reported by key,
  // instant and field NAMES only. (R4 act 1; the design review's lens A.)
  it("prints field names but not values for a confirm row", () => {
    const report = reconcileTwoArms({
      ...twoArms({
        captureAllRows: (rows) =>
          rows.map((entry, index) => index === 2 ? { ...entry, split: "confirm" } : entry),
        gatedRows: (rows) =>
          rows.map((entry, index) =>
            index === 2 ? { ...entry, split: "confirm", realizedR: 4.2 } : entry
          ),
      }),
      maxExamples: 20,
    });
    const confirmFindings = report.findings.filter((finding) => /confirm/.test(finding));
    assert.ok(confirmFindings.length >= 1, report.findings.join("\n"));
    for (const finding of confirmFindings) {
      assert.match(finding, /realizedR/);
      assert.doesNotMatch(finding, /4\.2|0\.9|-1\b/);
      assert.match(finding, /values withheld: sealed fold/);
    }
  });
});
