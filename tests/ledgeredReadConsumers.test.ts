import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ACCEPT_RULE,
  artifactHashOf,
  DECLINE_RULE,
  DECLINE_RULE_HASH,
  declineCandidateOf,
  type Figure,
  type LedgeredReadArtifact,
  m3Of,
  ADMISSIBILITY_RULE,
} from "../scripts/ledgeredRead.ts";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import { SEALED_FOLD, type SweepEmitRow } from "../scripts/sweepStats.ts";

/**
 * The two consumers of the ledgered read (R4 act 2): roster-expectancy-audit
 * and cost-sensitivity-verdict. Given `--ledgered-read <path>` they open the
 * artifact through the one door, bound to the manifest hash of the corpus
 * they read for select, and PRINT the shipped cell's confirm figures
 * verbatim — never recomputing a rule, never deciding on the figure. Without
 * the flag they judge on select and say so.
 *
 * Executed, because what a process prints and refuses is a fact about the
 * process: a sound artifact's figures come out equal to the artifact's; a
 * condemned, foreign or tampered artifact is refused by name and nothing is
 * written; and the without-flag run says "select only".
 */

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const DAY = 86_400_000;
const SYMBOL = "EURUSD";
const FIT_START = Date.UTC(2025, 0, 1);
const SELECT_START = Date.UTC(2025, 3, 1);
const CONFIRM_START = Date.UTC(2025, 6, 1);
const END = Date.UTC(2025, 9, 1);
const CURVE: TreasuryCurveFacts = {
  count: 3_000,
  firstTime: Date.UTC(2013, 0, 2),
  largestGapMs: 4 * DAY,
  lastTime: Date.UTC(2027, 0, 1),
};

function rowsIn(split: string, count: number, realizedR: number): SweepEmitRow[] {
  const start = split === "fit" ? FIT_START : split === "select" ? SELECT_START : CONFIRM_START;
  return Array.from({ length: count }, (_, day) => ({
    accepted: true,
    confidenceScore: 100,
    // The paired gross twin, a little richer than net, so the two arms of
    // cost-sensitivity-verdict differ and its INERT door stays shut.
    grossRealizedR: realizedR + 0.02,
    outcome: realizedR < 0 ? "stop_loss" : "take_profit",
    realizedR,
    split,
    symbol: SYMBOL,
    time: start + day * DAY + 12 * 3_600_000,
    variant: "baseline",
  } as SweepEmitRow));
}

/** A folded R3-shaped corpus (grid [{}]) beside its manifest; returns the path and the manifest's hash. */
function corpus(): { manifestHash: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "ledgered-consumers-"));
  const emitPath = join(dir, "shard.jsonl");
  const rows = [
    ...rowsIn("fit", 40, -1),
    ...rowsIn("select", 40, 0.5),
    ...rowsIn(SEALED_FOLD, 40, -3),
  ];
  writeFileSync(emitPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const manifest = buildSweepManifest({
    acceptance: { captureAll: true, ignoreLowEdge: false },
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
    days: 365,
    folds: [
      { decisionEndMs: SELECT_START - 5 * DAY, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - 5 * DAY, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - 5 * DAY, endMs: END, name: SEALED_FOLD, startMs: CONFIRM_START },
    ],
    generatedAt: "2026-09-02T05:00:00.000Z",
    grid: [{}],
    stepBars: 16,
    symbols: [{
      calibration: {},
      providerSymbol: SYMBOL,
      series: { "15min": seriesFacts(rows.map((row) => ({ time: Number(row.time) })), "intraday") },
      symbol: SYMBOL,
    }],
    trainShare: 0.6,
    treasuryCurve: CURVE,
    warmupBars: 240,
  });
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return { manifestHash: manifest.manifestHash, path: emitPath };
}

const figure = (n: number, expectancy: number, halfWidth: number): Figure => ({
  n,
  expectancy,
  lower: expectancy - halfWidth,
  upper: expectancy + halfWidth,
});

/** The figures the fixture's ledgered read carries for EURUSD — what the consumers must print back. */
const SHIPPED = {
  confirmGross: figure(40, 0.05, 0.02),
  confirmNet: figure(40, 0.02, 0.02),
  selectGross: figure(60, 0.03, 0.01),
  selectNet: figure(60, 0.01, 0.01),
};

/** A sound ledgered read for the given shards, built with the contract's hash and rules. */
function ledgeredArtifact(shard: { manifestHash: string; path?: string }): LedgeredReadArtifact {
  const shardHashes = [shard.manifestHash];
  // The read binds the emit BYTES under the shard's manifest hash; the
  // consumers verify them, so a fixture artifact carries the true digest.
  const emitSha256: Record<string, string> = shard.path
    ? { [shard.manifestHash]: createHash("sha256").update(readFileSync(shard.path)).digest("hex") }
    : {};
  const select = { gross: SHIPPED.selectGross, net: SHIPPED.selectNet };
  const base: Omit<LedgeredReadArtifact, "artifactHash"> = {
    analyzerVersion: "2026.09.02.test",
    anchor: "2026-08-26",
    baselineVariant: "baseline",
    calendarKey: "c".repeat(64),
    corpusId: "d".repeat(64),
    emitSha256,
    foldSource: "emitted",
    holdout: { markets: [], rule: "stratified-per-class-20pct" },
    includeHoldout: true,
    ledgerPath: "docs/research/confirm-reads/confirm-log-test.jsonl",
    markets: {
      [SYMBOL]: {
        accepted: [],
        heldOut: false,
        shipped: {
          confirm: { gross: SHIPPED.confirmGross, net: SHIPPED.confirmNet },
          declineCandidate: declineCandidateOf(select),
          m3: m3Of(SHIPPED.confirmNet, true),
          provenance: {
            derived: false,
            heldBack: true,
            known: true,
            overlapWithConfirmDays: 0,
            selectionWindow: null,
            tranche: null,
          },
          select,
          variant: "baseline",
        },
      },
    },
    readAt: "2026-09-02T22:00:00.000Z",
    readId: "read-1",
    rules: { accept: ACCEPT_RULE, admissibility: ADMISSIBILITY_RULE, decline: DECLINE_RULE, declineHash: DECLINE_RULE_HASH },
    shardHashes,
    symbolFilter: null,
    symbolsRead: [SYMBOL],
    verdictUnit: "market",
  };
  return { ...base, artifactHash: artifactHashOf(base) };
}

function written(value: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "ledgered-artifact-")), "ledgered-read.json");
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  return path;
}

type Run = { out: string; stderr: string; stdout: string; threw: boolean };

function run(script: string, args: string[]): Run {
  const out = join(mkdtempSync(join(tmpdir(), "ledgered-out-")), "out.json");
  const argv = args.map((token) => (token === "O" ? out : token));
  try {
    const stdout = execFileSync(TSX, [script, ...argv], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
      timeout: 120_000,
    });
    return { out, stderr: "", stdout, threw: false };
  } catch (error) {
    const shell = error as { stderr?: string; stdout?: string };
    return { out, stderr: String(shell.stderr ?? ""), stdout: String(shell.stdout ?? ""), threw: true };
  }
}

const INTERVAL = "(gate's t-interval, from the ledgered read read-1)";

/** The four artifacts every consumer must refuse, each by name. */
function refusals(shard: { manifestHash: string; path: string }) {
  const sound = ledgeredArtifact(shard);
  const tampered = ledgeredArtifact(shard);
  tampered.markets[SYMBOL].shipped.confirm.net = figure(40, 0.9, 0.02);
  return [
    {
      label: "condemned",
      path: written({ ...sound, INVALID: "clock defect — do not use" }),
      pattern: /condemned — "clock defect/,
    },
    {
      label: "foreign corpus",
      path: written(ledgeredArtifact({ manifestHash: "f".repeat(64) })),
      pattern: /written from a different corpus/,
    },
    {
      label: "tampered",
      path: written(tampered),
      pattern: /does not match its content/,
    },
  ];
}

describe("roster-expectancy-audit prints the ledgered read's NET figure verbatim, or says select only", () => {
  const shard = corpus();
  const SCRIPT = "scripts/roster-expectancy-audit.ts";

  it("with a sound artifact, prints and writes the artifact's own figures under a key that names the source", () => {
    const result = run(SCRIPT, [shard.path, "--out", "O", "--ledgered-read", written(ledgeredArtifact(shard))]);
    assert.ok(!result.threw, result.stderr);
    assert.match(result.stdout, /EURUSD\s+baseline\s+confirm net E \+0\.0200 \[\+0\.0000, \+0\.0400\] n=40\s+heldBack=true\s+M3=indistinguishable/);
    assert.ok(result.stdout.includes(INTERVAL), `the interval's provenance is not printed:\n${result.stdout}`);
    assert.doesNotMatch(result.stdout, /select only/);
    const artifact = JSON.parse(readFileSync(result.out, "utf8")) as {
      confirmSource: string;
      ledgeredRead: {
        interval: string;
        readId: string;
        shipped: Record<string, Record<string, unknown>>;
      };
    };
    assert.equal(artifact.ledgeredRead.readId, "read-1");
    assert.equal(artifact.ledgeredRead.interval, "gate's t-interval, from the ledgered read read-1");
    assert.match(artifact.confirmSource, /^ledgered read read-1 at \//);
    assert.deepEqual(artifact.ledgeredRead.shipped[SYMBOL], {
      confirmNetExpectancy: SHIPPED.confirmNet.expectancy,
      confirmNetLower: SHIPPED.confirmNet.lower,
      confirmNetN: SHIPPED.confirmNet.n,
      confirmNetUpper: SHIPPED.confirmNet.upper,
      heldBack: true,
      m3: "indistinguishable",
      variant: "baseline",
    });
  });

  for (const { label, path, pattern } of refusals(shard)) {
    it(`refuses a ${label} artifact by name and writes nothing`, () => {
      const result = run(SCRIPT, [shard.path, "--out", "O", "--ledgered-read", path]);
      assert.ok(result.threw, `a ${label} artifact was accepted:\n${result.stdout}`);
      assert.match(result.stderr, pattern);
      assert.equal(existsSync(result.out), false, "a refused run left an artifact behind");
    });
  }

  it("without the flag, judges on select and says so", () => {
    const result = run(SCRIPT, [shard.path, "--out", "O"]);
    assert.ok(!result.threw, result.stderr);
    assert.match(result.stdout, /no ledgered read given — select only/);
    assert.doesNotMatch(result.stdout, /confirm net E/);
    const artifact = JSON.parse(readFileSync(result.out, "utf8")) as { confirmSource: string; ledgeredRead: unknown };
    assert.equal(artifact.ledgeredRead, null);
    assert.equal(artifact.confirmSource, "no ledgered read given — select only");
  });
});

describe("cost-sensitivity-verdict prints the ledgered read's GROSS figure beside net, verbatim, or says select only", () => {
  const shard = corpus();
  const SCRIPT = "scripts/cost-sensitivity-verdict.ts";
  const BASE = ["--paired", shard.path, "--cells", `${SYMBOL}|baseline`, "--out", "O"];

  it("with a sound artifact, prints and writes gross beside net, M3 and the pre-registered declineCandidate", () => {
    const result = run(SCRIPT, [...BASE, "--ledgered-read", written(ledgeredArtifact(shard))]);
    assert.ok(!result.threw, result.stderr);
    assert.match(
      result.stdout,
      /EURUSD\s+baseline\s+confirm gross E \+0\.0500 \[\+0\.0300, \+0\.0700\] n=40 \| net E \+0\.0200 \[\+0\.0000, \+0\.0400\] n=40\s+M3=indistinguishable\s+declineCandidate=false\s+heldBack=true/,
    );
    assert.ok(result.stdout.includes(INTERVAL), `the interval's provenance is not printed:\n${result.stdout}`);
    const artifact = JSON.parse(readFileSync(result.out, "utf8")) as {
      confirmSource: string;
      ledgeredRead: { notInRead: string[]; readId: string; shipped: Record<string, Record<string, unknown>> };
      verdicts: Record<string, Record<string, unknown>>;
    };
    assert.equal(artifact.ledgeredRead.readId, "read-1");
    assert.deepEqual(artifact.ledgeredRead.notInRead, []);
    assert.deepEqual(artifact.ledgeredRead.shipped[SYMBOL], {
      confirmGrossExpectancy: SHIPPED.confirmGross.expectancy,
      confirmGrossLower: SHIPPED.confirmGross.lower,
      confirmGrossN: SHIPPED.confirmGross.n,
      confirmGrossUpper: SHIPPED.confirmGross.upper,
      confirmNetExpectancy: SHIPPED.confirmNet.expectancy,
      confirmNetLower: SHIPPED.confirmNet.lower,
      confirmNetN: SHIPPED.confirmNet.n,
      confirmNetUpper: SHIPPED.confirmNet.upper,
      declineCandidate: false,
      heldBack: true,
      m3: "indistinguishable",
      variant: "baseline",
    });
    // The select verdict is unchanged by the read: still decided here, on
    // select, and no verdict key wears the sealed fold's name.
    assert.match(String(artifact.verdicts[SYMBOL].verdict), /COST-DEPENDENT/);
    assert.deepEqual(Object.keys(artifact.verdicts[SYMBOL]).filter((key) => /confirm/i.test(key)), []);
  });

  for (const { label, path, pattern } of refusals(shard)) {
    it(`refuses a ${label} artifact by name and writes nothing`, () => {
      const result = run(SCRIPT, [...BASE, "--ledgered-read", path]);
      assert.ok(result.threw, `a ${label} artifact was accepted:\n${result.stdout}`);
      assert.match(result.stderr, pattern);
      assert.equal(existsSync(result.out), false, "a refused run left an artifact behind");
    });
  }

  it("without the flag, judges on select and says so", () => {
    const result = run(SCRIPT, BASE);
    assert.ok(!result.threw, result.stderr);
    assert.match(result.stdout, /no ledgered read given — select only/);
    assert.doesNotMatch(result.stdout, /confirm gross E/);
    const artifact = JSON.parse(readFileSync(result.out, "utf8")) as { confirmSource: string; ledgeredRead: unknown };
    assert.equal(artifact.ledgeredRead, null);
    assert.equal(artifact.confirmSource, "no ledgered read given — select only");
  });
});
