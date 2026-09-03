/**
 * R3 register item H, executed: the gated arm and the capture-all arm of one
 * sweep are ONE measurement seen through two acceptance modes, and this either
 * proves it on the whole corpus or names exactly where it stops being true.
 *
 * WHY TWO ARMS EXIST. Without `--capture-all`, `sweep.ts` drops every
 * gate-failing decision, so the below-threshold population is absent forever
 * and `confidence-bands` and `threshold-rescue` refuse the corpus outright.
 * With it, four rejection counters read zero in the manifest's `decisions[]`
 * (the regime block and the acceptance-gate attribution are skipped), so
 * `starvation-audit` refuses that table instead. Neither arm alone carries
 * both halves. Together they cost CPU and disk and not one provider byte,
 * because pins do not deplete — and they are only usable together if the
 * accepted subset of the capture-all arm IS the gated corpus.
 *
 * WHAT IS CHECKED, in order, and each is a named finding rather than a
 * refusal so the whole picture prints before the exit code:
 *
 * 1. Both manifests pass the corpus door, and the acceptance modes are the
 *    two this instrument exists for (gated=false, capture-all=true). A
 *    manifest predating the acceptance field is refused as UNVERIFIABLE rather
 *    than assumed — the two modes hash identically without it.
 * 2. Every shared manifest term agrees: engine version, anchor, depth, step,
 *    grid, folds, clock, conditions, both cost scales, the requested and
 *    surviving symbol sets, the emitted columns, the engine revision. The
 *    ONLY terms allowed to differ are `acceptance.captureAll` and the
 *    rejection counters inside `decisions[]`; `decisionPoints` per
 *    (symbol, variant, split) must still agree, because the two arms walk
 *    the same decision instants.
 * 3. Streamed in lockstep — never loaded — every capture-all row carrying
 *    `accepted: true` equals the next gated row field for field, and the
 *    gated corpus carries no `accepted: false` row. Byte-identical lines are
 *    counted apart from field-identical ones, so a serialization change that
 *    preserved every value is visible without being a finding.
 * 4. Each arm's row count per (symbol, variant, split) equals what its own
 *    manifest says it emitted, so a truncated corpus is a finding here and
 *    not a smaller result downstream.
 *
 * Exit 0 only when every check passes. Divergence is a finding to chase
 * before any conclusion is drawn from either corpus.
 *
 * STATED LIMITS (found by the 2026-09-02 refutation, both unreachable on a
 * corpus whose accepted rows are byte-identical): the field comparison uses
 * `stableStringify`, which renders an absent key and a key present as `null`
 * alike and cannot tell `-0` from `0`. Both are visible only through the
 * byte comparison, which runs first and counts such rows as
 * field-identical rather than byte-identical.
 *
 *   npx tsx scripts/two-arm-reconcile.ts \
 *     --gated docs/research/r3/gated.jsonl \
 *     --capture-all docs/research/r3/capture-all.jsonl [--max-examples 20]
 */
import { closeSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import {
  describeHeldOut,
  type ResolvedHeldOut,
  resolveHeldOut,
} from "./sweepFolds.ts";
import { type SweepManifest, stableStringify } from "./sweepManifest.ts";
import { assertAcceptanceMode, assertManifest, SEALED_FOLD } from "./sweepStats.ts";

const VALUE_FLAGS = new Set(["--capture-all", "--gated", "--max-examples"]);

/**
 * Synchronous line iterator over a file of any size: 64 KB reads, lines
 * yielded as they complete, multi-byte characters carried across chunk edges
 * by a decoder rather than split by them. A generator rather than
 * `readLinesSync`'s callback, because two corpora have to advance in lockstep
 * and a callback can only walk one.
 */
export function* linesOf(path: string): Generator<string, void, undefined> {
  const fd = openSync(path, "r");
  try {
    const chunk = Buffer.alloc(65_536);
    const decoder = new StringDecoder("utf8");
    let carry = "";
    for (;;) {
      const bytes = readSync(fd, chunk, 0, chunk.length, null);
      if (bytes === 0) break;
      carry += decoder.write(chunk.subarray(0, bytes));
      let newlineIndex = carry.indexOf("\n");
      while (newlineIndex !== -1) {
        yield carry.slice(0, newlineIndex);
        carry = carry.slice(newlineIndex + 1);
        newlineIndex = carry.indexOf("\n");
      }
    }
    carry += decoder.end();
    if (carry.trim()) yield carry;
  } finally {
    closeSync(fd);
  }
}

/**
 * The manifest terms both arms must share. Everything not listed here is
 * either allowed to differ (`acceptance.captureAll`, the rejection counters,
 * `manifestHash`, `generatedAt`, `rejectionLedgerRows` — the capture-all arm
 * walks further before recording a rejection) or is checked structurally
 * below (`decisions[]`). `holdoutSymbols` stays a shared term as PROVENANCE
 * — two arms of one sweep carry one stamp — while nothing excludes on it:
 * the held-out set both arms are read under is the stratified rule over
 * `requestedSymbols`, resolved once for the pair and stated in the report
 * (R4 act 2, one holdout population).
 */
export const SHARED_TERMS = [
  "analyzerVersion",
  "anchor",
  "barRejections",
  "calendarCensus",
  "calibrationByClass",
  "clock",
  "conditions",
  "days",
  "emitColumns",
  "engineDeclined",
  "folds",
  "foldsByClass",
  "grid",
  "grossCostScale",
  "holdoutSymbols",
  "modeledCostScale",
  "requestedSymbols",
  "stepBars",
  "symbols",
  "trainShare",
  "treasuryCurve",
  "warmupBars",
] as const;

/** The counters the capture-all arm zeroes by construction (item H). */
export const CAPTURE_ALL_ZEROED = [
  "belowConfidence",
  "belowPayoff",
  "belowThreshold",
  "regimeBlocked",
] as const;

type RowKey = string;

type ArmTally = {
  acceptedRows: number;
  rejectedRows: number;
  rows: number;
  perKey: Map<RowKey, number>;
};

export type ReconcileReport = {
  captureAll: ArmTally & { zeroedCounters: Record<string, number> };
  findings: string[];
  gated: ArmTally & { zeroedCounters: Record<string, number> };
  /** The one holdout population both arms are read under, and its pin state. */
  holdout: ResolvedHeldOut;
  identicalByBytes: number;
  identicalByFields: number;
  sharedTermsChecked: number;
};

function emptyTally(): ArmTally {
  return { acceptedRows: 0, perKey: new Map(), rejectedRows: 0, rows: 0 };
}

function keyOf(row: Record<string, unknown>): RowKey {
  return `${String(row.symbol)}|${String(row.variant)}|${String(row.split)}`;
}

function describeRow(row: Record<string, unknown>): string {
  const time = typeof row.time === "number"
    ? new Date(row.time).toISOString()
    : String(row.time);
  return `${keyOf(row)} @ ${time}`;
}

/** Deep equality on parsed JSON, key order ignored, arrays ordered. */
function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * The differing fields of two rows. This instrument reads every row of both
 * arms because row equality is its purpose — blinding it to the confirm fold
 * would leave that third unverified on the arm the gate reads — but it PRINTS
 * nothing from that fold: a differing confirm row is reported by field name
 * only, its values withheld (R4 act 1).
 */
function fieldDiff(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const sealed = a.split === SEALED_FOLD || b.split === SEALED_FOLD;
  const differing: string[] = [];
  for (const key of [...keys].sort()) {
    if (!sameValue(a[key], b[key])) {
      differing.push(
        sealed
          ? `${key} (values withheld: sealed fold)`
          : `${key}: gated=${JSON.stringify(a[key])} capture-all=${
            JSON.stringify(b[key])
          }`,
      );
    }
  }
  return differing;
}

function zeroedCounters(manifest: SweepManifest): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const counter of CAPTURE_ALL_ZEROED) sums[counter] = 0;
  for (const entry of manifest.decisions ?? []) {
    for (const counter of CAPTURE_ALL_ZEROED) {
      sums[counter] += entry.rejections[counter] ?? 0;
    }
  }
  return sums;
}

function tallyRow(tally: ArmTally, row: Record<string, unknown>): void {
  tally.rows += 1;
  if (row.accepted === true) tally.acceptedRows += 1;
  else tally.rejectedRows += 1;
  const key = keyOf(row);
  tally.perKey.set(key, (tally.perKey.get(key) ?? 0) + 1);
}

function checkEmittedAgainstManifest(
  arm: string,
  manifest: SweepManifest,
  tally: ArmTally,
  findings: string[],
): void {
  if (!manifest.decisions) {
    findings.push(
      `${arm}: manifest carries no decisions[] — the per-(symbol, variant, ` +
        `split) row counts cannot be checked against what the run emitted`,
    );
    return;
  }
  const seen = new Set<RowKey>();
  for (const entry of manifest.decisions) {
    const key = `${entry.symbol}|${entry.variant}|${entry.split}`;
    seen.add(key);
    const actual = tally.perKey.get(key) ?? 0;
    if (actual !== entry.emitted) {
      findings.push(
        `${arm}: ${key} — manifest says ${entry.emitted} rows emitted, the ` +
          `file holds ${actual}`,
      );
    }
  }
  for (const [key, count] of tally.perKey) {
    if (!seen.has(key)) {
      findings.push(
        `${arm}: ${key} — ${count} rows in the file with no decisions[] entry`,
      );
    }
  }
}

export function reconcileTwoArms(input: {
  captureAllPath: string;
  gatedPath: string;
  /** Where the anchor's pinned set is looked for; the tracked default when absent. */
  holdoutPinDir?: string;
  maxExamples: number;
}): ReconcileReport {
  const gatedManifest = assertManifest(input.gatedPath);
  const captureAllManifest = assertManifest(input.captureAllPath);
  // The acceptance mode is the whole reason two arms exist, so a manifest
  // that cannot state it is refused rather than read: absent the field the
  // two arms hash identically, which is the defect #481 closed.
  for (
    const [path, manifest, captureAll] of [
      [input.gatedPath, gatedManifest, false],
      [input.captureAllPath, captureAllManifest, true],
    ] as const
  ) {
    const { unverifiable } = assertAcceptanceMode(path, manifest, {
      captureAll,
    });
    if (unverifiable) {
      throw new Error(
        `${path}: manifest predates the acceptance field, so its arm cannot ` +
          `be verified — a gated and a capture-all corpus hash identically ` +
          `without it`,
      );
    }
  }

  const findings: string[] = [];
  const gatedRecord = gatedManifest as unknown as Record<string, unknown>;
  const captureRecord = captureAllManifest as unknown as Record<
    string,
    unknown
  >;
  let sharedTermsChecked = 0;
  for (const term of SHARED_TERMS) {
    sharedTermsChecked += 1;
    if (!sameValue(gatedRecord[term], captureRecord[term])) {
      findings.push(
        `manifest term "${term}" differs between the arms — two ` +
          `measurements, not one seen twice`,
      );
    }
  }
  // The one holdout population, resolved for the pair before a row is read:
  // requestedSymbols is a shared term above, so on agreeing arms this is one
  // set; on disagreeing arms the finding above already names the divergence.
  const holdout = resolveHeldOut(
    [gatedManifest, captureAllManifest],
    input.holdoutPinDir,
  );
  sharedTermsChecked += 1;
  if (
    gatedManifest.acceptance?.ignoreLowEdge !==
      captureAllManifest.acceptance?.ignoreLowEdge
  ) {
    findings.push(
      `acceptance.ignoreLowEdge differs between the arms — the accepted ` +
        `population moves with it`,
    );
  }
  sharedTermsChecked += 1;
  if (gatedManifest.source?.revision !== captureAllManifest.source?.revision) {
    findings.push(
      `source.revision differs — the arms ran different engines (gated ${
        gatedManifest.source?.revision ?? "unrecorded"
      }, capture-all ${captureAllManifest.source?.revision ?? "unrecorded"})`,
    );
  }
  for (
    const [arm, manifest] of [
      ["gated", gatedManifest],
      ["capture-all", captureAllManifest],
    ] as const
  ) {
    if (manifest.source?.dirty) {
      // `untracked` arrived with the tracked-only definition of `dirty`
      // (2026-09-02). A manifest without it was written when any porcelain
      // line, an untracked output file included, set the flag — so the flag
      // says less than the sentence below would claim of it.
      findings.push(
        manifest.source.untracked === undefined
          ? `${arm}: source.dirty is true under the pre-2026-09-02 ` +
            `definition (git status --porcelain non-empty, untracked files ` +
            `included) — the engine MAY differ from the recorded revision; ` +
            `establish which from the run's own record`
          : `${arm}: source.dirty is true — a tracked file differed from the ` +
            `recorded revision when the sweep resolved its source, so the ` +
            `engine that ran is not that revision`,
      );
    }
  }
  // Same decision instants: decisionPoints per key must agree even though
  // the rejection counters inside the same entries legitimately do not.
  if (gatedManifest.decisions && captureAllManifest.decisions) {
    const gatedPoints = new Map<RowKey, number>();
    for (const entry of gatedManifest.decisions) {
      gatedPoints.set(
        `${entry.symbol}|${entry.variant}|${entry.split}`,
        entry.decisionPoints,
      );
    }
    for (const entry of captureAllManifest.decisions) {
      const key = `${entry.symbol}|${entry.variant}|${entry.split}`;
      const expected = gatedPoints.get(key);
      if (expected === undefined) {
        findings.push(
          `capture-all: ${key} has decisions[] with no gated counterpart`,
        );
      } else if (expected !== entry.decisionPoints) {
        findings.push(
          `${key}: decisionPoints differ (gated ${expected}, capture-all ${
            entry.decisionPoints
          }) — the arms did not walk the same decision instants`,
        );
      }
      gatedPoints.delete(key);
    }
    for (const key of gatedPoints.keys()) {
      findings.push(`gated: ${key} has decisions[] with no capture-all counterpart`);
    }
  }

  // THE ROWS, in lockstep. The gated iterator advances only when the
  // capture-all row is accepted; a mismatch is recorded with the row named
  // and the differing fields listed, up to the example cap, and counted past
  // it.
  const gated = emptyTally();
  const captureAll = emptyTally();
  let identicalByBytes = 0;
  let identicalByFields = 0;
  let divergentRows = 0;
  let gatedExhausted = false;
  const gatedLines = linesOf(input.gatedPath);
  const note = (finding: string) => {
    divergentRows += 1;
    if (divergentRows <= input.maxExamples) findings.push(finding);
  };
  for (const line of linesOf(input.captureAllPath)) {
    const captureRow = JSON.parse(line) as Record<string, unknown>;
    tallyRow(captureAll, captureRow);
    if (captureRow.accepted !== true) continue;
    const next = gatedLines.next();
    if (next.done) {
      if (!gatedExhausted) {
        gatedExhausted = true;
        findings.push(
          `gated corpus ended before the capture-all accepted set did — ` +
            `first unmatched: ${describeRow(captureRow)}`,
        );
      }
      continue;
    }
    if (next.value === line) {
      identicalByBytes += 1;
      tallyRow(gated, captureRow);
      continue;
    }
    const gatedRow = JSON.parse(next.value) as Record<string, unknown>;
    tallyRow(gated, gatedRow);
    if (gatedRow.accepted !== true) {
      note(
        `gated corpus carries an accepted:false row at ${
          describeRow(gatedRow)
        } — a gated sweep emits only rows that passed every gate`,
      );
      continue;
    }
    const differing = fieldDiff(gatedRow, captureRow);
    if (differing.length === 0) {
      identicalByFields += 1;
      continue;
    }
    note(
      `rows differ at ${describeRow(captureRow)} (gated ${
        describeRow(gatedRow)
      }): ${differing.join("; ")}`,
    );
  }
  let trailing = 0;
  for (const line of gatedLines) {
    trailing += 1;
    tallyRow(gated, JSON.parse(line) as Record<string, unknown>);
  }
  if (trailing > 0) {
    findings.push(
      `gated corpus holds ${trailing} rows beyond the capture-all accepted ` +
        `set — decisions the capture-all arm never accepted`,
    );
  }
  if (divergentRows > input.maxExamples) {
    findings.push(
      `... ${divergentRows - input.maxExamples} further divergent rows not ` +
        `listed (${divergentRows} in all)`,
    );
  }
  if (gated.rejectedRows > 0) {
    findings.push(
      `gated corpus carries ${gated.rejectedRows} accepted:false rows in all`,
    );
  }

  checkEmittedAgainstManifest("gated", gatedManifest, gated, findings);
  checkEmittedAgainstManifest(
    "capture-all",
    captureAllManifest,
    captureAll,
    findings,
  );

  return {
    captureAll: {
      ...captureAll,
      zeroedCounters: zeroedCounters(captureAllManifest),
    },
    findings,
    gated: { ...gated, zeroedCounters: zeroedCounters(gatedManifest) },
    holdout,
    identicalByBytes,
    identicalByFields,
    sharedTermsChecked,
  };
}

export function formatReport(report: ReconcileReport): string {
  const lines: string[] = [];
  lines.push(
    `shared manifest terms checked: ${report.sharedTermsChecked}`,
    `gated: ${report.gated.rows} rows (${report.gated.acceptedRows} accepted, ${
      report.gated.rejectedRows
    } not)`,
    `capture-all: ${report.captureAll.rows} rows (${
      report.captureAll.acceptedRows
    } accepted, ${report.captureAll.rejectedRows} not)`,
    `accepted rows identical: ${report.identicalByBytes} byte-for-byte, ${
      report.identicalByFields
    } field-for-field after re-serialization`,
    `counters the capture-all arm zeroes by construction — gated: ${
      JSON.stringify(report.gated.zeroedCounters)
    } · capture-all: ${JSON.stringify(report.captureAll.zeroedCounters)}`,
    describeHeldOut(report.holdout, { labels: false, pools: false }),
  );
  if (report.findings.length === 0) {
    lines.push(
      "VERDICT: the capture-all arm filtered to accepted:true IS the gated " +
        "corpus — one measurement, two acceptance modes",
    );
  } else {
    lines.push(`VERDICT: DIVERGENT — ${report.findings.length} finding(s):`);
    for (const finding of report.findings) lines.push(`  - ${finding}`);
  }
  return lines.join("\n");
}

function main(): void {
  const { num, str } = flagReader(process.argv.slice(2), VALUE_FLAGS);
  const gatedPath = str("--gated");
  const captureAllPath = str("--capture-all");
  if (!gatedPath || !captureAllPath) {
    throw new OperatorInputError(
      "two-arm-reconcile: no corpus paths given — pass --gated <emit.jsonl> " +
        "--capture-all <emit.jsonl>, each with its .manifest.json beside it",
    );
  }
  const maxExamples = num("--max-examples", 20, {
    basis: "a cap of zero would list no divergent row at all, so a divergent " +
      "corpus would print a count with nothing to chase",
    integer: true,
    min: 1,
  });
  const report = reconcileTwoArms({ captureAllPath, gatedPath, maxExamples });
  console.log(formatReport(report));
  process.exit(report.findings.length === 0 ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    if (error instanceof OperatorInputError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  }
}
