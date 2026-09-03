import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  decomposeLegs,
  quantile,
  spearman,
} from "../scripts/geometry-evidence.ts";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { SEALED_FOLD } from "../scripts/sweepStats.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";

// 4b's evidence extractor: wrong arithmetic here becomes a wrong owner
// decision at the geometry review, so the three primitives that carry the
// numbers are pinned exactly.

describe("decomposeLegs — the accountant's arithmetic, split for the review", () => {
  it("splits a laddered win into banked, runner half, derived cost, and the single-target counterfactual", () => {
    const parts = decomposeLegs({
      legs: [
        { leg: "entry", price: 100, time: 0 },
        { leg: "tp1", price: 101, time: 1 },
        { kind: "take_profit", leg: "exit", price: 105, time: 2 },
      ],
      outcome: "take_profit",
      realizedR: 1.45,
      riskDistance: 2,
      side: "buy",
      symbol: "EURUSD",
    })!;
    assert.equal(parts.bankedR, 0.25);
    assert.equal(parts.exitR, 1.25);
    // gross 1.5 − realized 1.45 = one round trip of cost.
    assert.equal(parts.costR, 0.05);
    // Full size to the same exit print, same cost: 2×1.25 − 0.05... the
    // counterfactual is (exit−entry)/risk − cost = 2.5 − 0.05.
    assert.equal(parts.singleTargetR, 2.45);
  });

  it("mirrors for a sell and refuses degenerate risk", () => {
    const parts = decomposeLegs({
      legs: [
        { leg: "entry", price: 100, time: 0 },
        { kind: "stop_loss", leg: "exit", price: 102, time: 1 },
      ],
      outcome: "stop_loss",
      realizedR: -1.05,
      riskDistance: 2,
      side: "sell",
      symbol: "EURUSD",
    })!;
    assert.equal(parts.exitR, -1);
    assert.equal(parts.costR, 0.05);
    assert.equal(
      decomposeLegs({
        legs: [{ leg: "entry", price: 100, time: 0 }],
        outcome: "expired_at_loss",
        realizedR: 0,
        riskDistance: 0,
        side: "buy",
        symbol: "EURUSD",
      }),
      null,
    );
  });
});

describe("spearman — rank correlation with ties", () => {
  it("reads a monotone relation as 1 and an inverse as -1", () => {
    assert.equal(spearman([[1, 10], [2, 20], [3, 30]]), 1);
    assert.equal(spearman([[1, 30], [2, 20], [3, 10]]), -1);
  });

  it("handles ties by shared ranks and refuses degenerate inputs", () => {
    const rho = spearman([[1, 5], [1, 5], [2, 10], [3, 15]])!;
    assert.ok(rho > 0.9);
    assert.equal(spearman([[1, 1], [2, 2]]), null);
    assert.equal(spearman([[1, 1], [1, 2], [1, 3]]), null);
  });
});

describe("quantile — interpolated, sorted-input", () => {
  it("interpolates between order statistics", () => {
    assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(quantile([1, 2, 3, 4], 0), 1);
    assert.equal(quantile([1, 2, 3, 4], 1), 4);
    assert.equal(quantile([], 0.5), null);
  });
});

// R4 act 1: the door seals the confirm fold, and this reader must not be able
// to tell the difference. Proven by EXECUTION — the seal lives in sweepStats,
// and a reader that passed `{ confirm: "read" }` would satisfy every source
// pin on this file and still print the held-back fold's money. The runner is
// the repo's own tsx by absolute path from a fresh temp cwd, the shape
// tests/e4Collapse.test.ts settled on (#364 round 55): npx would resolve
// nothing there, and a crashed harness must never read as the subject.
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "geometry-evidence.ts");
const HOUR = 3_600_000;
const FIT_START = Date.UTC(2024, 6, 1);
const SELECT_START = Date.UTC(2025, 6, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const FOLDS_END = Date.UTC(2026, 6, 1);

/**
 * One evidence-enriched baseline row, the shape PR #292/#293 emits: a
 * laddered win (entry 100, tp1 101, exit 105 on risk 2) or a plain stop
 * (exit 98). realizedR is a parameter so a confirm row can carry an absurd
 * one.
 */
function evidenceRow(
  split: string,
  time: number,
  outcome: "take_profit" | "stop_loss",
  realizedR: number,
): Record<string, unknown> {
  const win = outcome === "take_profit";
  return {
    accepted: true,
    confidenceScore: win ? 80 : 60,
    exitAtMs: time + 6 * HOUR,
    filledAtMs: time + HOUR,
    legs: win
      ? [
        { leg: "entry", price: 100, time },
        { leg: "tp1", price: 101, time: time + 2 * HOUR },
        { kind: "take_profit", leg: "exit", price: 105, time: time + 6 * HOUR },
      ]
      : [
        { leg: "entry", price: 100, time },
        { kind: "stop_loss", leg: "exit", price: 98, time: time + 6 * HOUR },
      ],
    maxAdverseMove: win ? 0.5 : 2,
    maxFavorableMove: win ? 5 : 0.5,
    outcome,
    realizedR,
    regime: "trending",
    riskDistance: 2,
    side: "buy",
    split,
    stopProvenance: "structure",
    symbol: "EURUSD",
    time,
    variant: "baseline",
  };
}

/** A FOLDED corpus — the shape that carries a confirm fold to seal. */
function foldedCorpus(rows: Array<Record<string, unknown>>): string {
  const dir = mkdtempSync(join(tmpdir(), "geometry-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(
    emitPath,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  const manifest = buildSweepManifest({
    acceptance: { captureAll: false, ignoreLowEdge: false },
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
    days: 730,
    folds: [
      {
        decisionEndMs: SELECT_START - 5 * 86_400_000,
        endMs: SELECT_START,
        name: "fit",
        startMs: FIT_START,
      },
      {
        decisionEndMs: CONFIRM_START - 5 * 86_400_000,
        endMs: CONFIRM_START,
        name: "select",
        startMs: SELECT_START,
      },
      {
        decisionEndMs: FOLDS_END - 5 * 86_400_000,
        endMs: FOLDS_END,
        name: SEALED_FOLD,
        startMs: CONFIRM_START,
      },
    ],
    generatedAt: "2026-09-02T20:00:00.000Z",
    grid: [{}],
    // The one holdout population is drawn over the REQUESTED roster (R4 act
    // 2); a manifest without one is read over its symbols and says so, and
    // this fixture states its roster the way the driver does.
    requestedSymbols: ["EURUSD"],
    stepBars: 16,
    symbols: [{
      calibration: {},
      providerSymbol: "EURUSD",
      series: {
        "15min": seriesFacts(
          rows.map((row) => ({ time: Number(row.time) })),
          "intraday",
        ),
      },
      symbol: "EURUSD",
    }],
    trainShare: 0.6,
    treasuryCurve: {
      count: 3_000,
      firstTime: Date.UTC(2013, 0, 2),
      largestGapMs: 4 * 86_400_000,
      lastTime: Date.UTC(2027, 0, 1),
    },
    warmupBars: 240,
  });
  writeFileSync(
    `${emitPath}.manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return emitPath;
}

function run(args: string[]): { out: string; code: number } {
  const elsewhere = mkdtempSync(join(tmpdir(), "geometry-run-"));
  // tsx exports TSX_TSCONFIG_PATH as the RELATIVE path npm test passed it;
  // inherited into a temp cwd it resolves to nothing and tsx dies in its own
  // loader. The reader needs no tsconfig.
  const env = { ...process.env };
  delete env.TSX_TSCONFIG_PATH;
  try {
    const out = execFileSync(TSX, [READER, ...args], {
      cwd: elsewhere,
      encoding: "utf8",
      env,
      stdio: "pipe",
      timeout: 120_000,
    });
    return { code: 0, out };
  } catch (error) {
    const failed = error as { status?: number; stderr?: string; stdout?: string };
    const stderr = String(failed.stderr ?? "");
    assert.doesNotMatch(
      stderr,
      /npm error|npx canceled|command not found|Cannot find module 'tsx'|tsx\/dist\/register/,
      `the reader was never executed — a HARNESS failure, never the subject ` +
        `refusing: ${stderr.slice(0, 400)}`,
    );
    return { code: failed.status ?? -1, out: `${failed.stdout ?? ""}${stderr}` };
  }
}

describe("geometry-evidence — the confirm fold is sealed at the door", () => {
  // Two tuning folds, one laddered win and one stop in each: net R is
  // 2 × 1.45 − 2 × 1.05 = 0.8 over four filled rows. The confirm rows carry
  // millions of R either way; read, they would move all five questions.
  const tuning = [
    evidenceRow("fit", FIT_START + 24 * HOUR, "take_profit", 1.45),
    evidenceRow("fit", FIT_START + 48 * HOUR, "stop_loss", -1.05),
    evidenceRow("select", SELECT_START + 24 * HOUR, "take_profit", 1.45),
    evidenceRow("select", SELECT_START + 48 * HOUR, "stop_loss", -1.05),
  ];
  const confirm = [
    evidenceRow(SEALED_FOLD, CONFIRM_START + 24 * HOUR, "take_profit", 1_000_000),
    evidenceRow(SEALED_FOLD, CONFIRM_START + 48 * HOUR, "stop_loss", -3_000_000),
  ];

  it("prints the same five questions with confirm rows present as without them — executed", () => {
    const sealed = run([foldedCorpus([...tuning, ...confirm])]);
    const bare = run([foldedCorpus(tuning)]);
    assert.equal(sealed.code, 0, sealed.out);
    assert.equal(bare.code, 0, bare.out);
    // The headline states the withheld count — the population is never
    // silent — and it is the one figure allowed to differ. It also states the
    // one holdout population (R4 act 2): the rule, the count (a one-market
    // class holds nothing out, so 0), the pin state (the reader runs from a
    // temp cwd, so the anchor's tracked pin is not found — "unpinned" is
    // stated, never skipped) and the stamp as provenance.
    assert.match(
      sealed.out,
      /4 baseline market-evidence rows \(holdout: stratified-per-class-20pct — 0 markets excluded from every class pool \(unpinned — no docs\/research\/r4\/holdout-2026-08-26\.json, computed from requestedSymbols\); stamped flag: 0 markets, provenance only; 0 rows on held-out markets withheld from the five class tables, stamped rows: 0; confirm fold sealed at the door: 2 rows withheld\)/,
    );
    assert.match(
      bare.out,
      /4 baseline market-evidence rows .*confirm fold sealed at the door: 0 rows withheld/,
    );
    // Q1 over the four tuning rows, exactly: filled 4, banked 0.5, runner
    // half 0.5, cost 0.2, net 0.8, single-target 2.8, no breakeven exits.
    // Read, the confirm rows would make it filled 6 and net −2,000,000.
    assert.match(
      sealed.out,
      /\| forex \| 4 \| 0\.5 \| 0\.5 \| 0\.2 \| 0\.8 \| 2\.8 \| 0 \| — \|/,
    );
    assert.doesNotMatch(sealed.out, /1000000|3000000|e\+6/);
    // Everything below the headline is identical, line for line. The
    // headline carries the manifest hash, which differs by construction: the
    // manifest describes a sweep that emitted a confirm period.
    const measurements = (out: string) =>
      out.split("\n").filter((line) => !line.startsWith("corpus "));
    assert.deepEqual(measurements(sealed.out), measurements(bare.out));
  });
});
