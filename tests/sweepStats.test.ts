import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSweepManifest } from "../scripts/sweepManifest.ts";
import {
  addOutcome,
  assertManifestedCorpus,
  clusteredStandardError,
  emptyStats,
  expectancy,
  rStandardError,
  rStdDev,
} from "../scripts/sweepStats.ts";

// Item 3, first commit (the map's govern-all finding): seven emit-readers
// shared ZERO code — five private add/expectancy implementations, one of
// which had already drifted into regex-classified wins and all-rows
// denominators before sweep-analysis.ts recorded the repair. This module is
// the one vocabulary, the missing dispersion term (3a: nothing carried
// rSumSq, so no reader could state a standard error), and the manifest door
// (2i): no reader aggregates a corpus it cannot verify.

const row = (outcome: string, realizedR: number) => ({
  outcome,
  realizedR,
  symbol: "EURUSD",
});

describe("sweepStats — the engine's vocabulary, once", () => {
  it("counts with summarizeSweepOutcomes' definitions", () => {
    const stats = emptyStats();
    addOutcome(stats, row("take_profit", 2));
    addOutcome(stats, row("tp1_partial", 0.4));
    addOutcome(stats, row("stop_loss", -1.05));
    addOutcome(stats, row("expired_in_profit", 0.3));
    addOutcome(stats, row("ambiguous", -1.05));
    addOutcome(stats, row("unfilled", 0));
    assert.equal(stats.n, 6);
    assert.equal(stats.filled, 5);
    assert.equal(stats.wins, 2);
    assert.equal(stats.stops, 1);
    assert.equal(stats.ambiguous, 1);
    assert.equal(Number(stats.rSum.toFixed(2)), 0.6);
  });

  it("computes expectancy over filled, refusing an empty denominator", () => {
    const stats = emptyStats();
    assert.equal(expectancy(stats), null);
    addOutcome(stats, row("unfilled", 0));
    assert.equal(expectancy(stats), null);
    addOutcome(stats, row("take_profit", 1.5));
    addOutcome(stats, row("stop_loss", -1));
    assert.equal(expectancy(stats), 0.25);
  });

  it("carries the dispersion 3a needs — sample deviation and standard error from the corpus itself", () => {
    const stats = emptyStats();
    addOutcome(stats, row("take_profit", 2));
    addOutcome(stats, row("stop_loss", -1));
    addOutcome(stats, row("stop_loss", -1));
    // mean 0, sample variance (4+1+1)/2 = 3.
    assert.equal(rStdDev(stats), Math.sqrt(3));
    assert.equal(rStandardError(stats), Math.sqrt(3) / Math.sqrt(3));
    const thin = emptyStats();
    addOutcome(thin, row("take_profit", 1));
    assert.equal(rStdDev(thin), null);
    assert.equal(rStandardError(thin), null);
  });
});

describe("clusteredStandardError — 3a's dispersion, clustered by market", () => {
  const cluster = (rows: Array<[string, number]>) => {
    const stats = emptyStats();
    for (const [outcome, realizedR] of rows) {
      addOutcome(stats, row(outcome, realizedR));
    }
    return stats;
  };

  it("measures the pooled mean's error from between-market spread", () => {
    // Two markets, four filled each: means +0.5 and -0.1, pooled mean 0.2.
    // Cluster residuals: 4x(0.5-0.2)=1.2 and 4x(-0.1-0.2)=-1.2;
    // SE = sqrt(1.44+1.44)/8 = 0.2121...
    const clusters = [
      cluster([["take_profit", 0.5], ["take_profit", 0.5], [
        "take_profit",
        0.5,
      ], ["take_profit", 0.5]]),
      cluster([["stop_loss", -0.1], ["stop_loss", -0.1], ["stop_loss", -0.1], [
        "stop_loss",
        -0.1,
      ]]),
    ];
    assert.equal(
      Number(clusteredStandardError(clusters)!.toFixed(4)),
      0.2121,
    );
  });

  it("reads identical markets as zero between-cluster error", () => {
    const clusters = [
      cluster([["take_profit", 0.3], ["stop_loss", -0.3]]),
      cluster([["take_profit", 0.3], ["stop_loss", -0.3]]),
    ];
    assert.equal(clusteredStandardError(clusters), 0);
  });

  it("refuses to state an error from fewer than two filled clusters", () => {
    assert.equal(clusteredStandardError([]), null);
    assert.equal(
      clusteredStandardError([cluster([["take_profit", 1]])]),
      null,
    );
    assert.equal(
      clusteredStandardError([
        cluster([["take_profit", 1]]),
        cluster([["unfilled", 0]]),
      ]),
      null,
    );
  });
});

describe("account-type-report adopts the shared vocabulary (3a)", () => {
  const source = readFileSync("scripts/account-type-report.ts", "utf8");

  it("measures deviation from the corpus instead of assuming --r-sd", () => {
    assert.doesNotMatch(source, /--r-sd/);
    assert.doesNotMatch(source, /rSd = num\(/);
    assert.match(source, /from "\.\/sweepStats\.ts"/);
    assert.match(source, /rStandardError\(/);
    assert.match(source, /clusteredStandardError\(/);
  });

  it("reads only manifested corpora — the 2i door applies to reports too", () => {
    assert.match(source, /assertManifestedCorpus\(/);
  });

  it("keeps no private stats arithmetic to drift", () => {
    assert.doesNotMatch(source, /function add\(/);
    assert.doesNotMatch(source, /type Stats = \{/);
  });
});

describe("assertManifestedCorpus — no unverified corpus is aggregated (2i's door)", () => {
  const writeCorpus = (
    tamper?: (manifest: Record<string, unknown>) => void,
  ) => {
    const dir = mkdtempSync(join(tmpdir(), "sweepstats-"));
    const emitPath = join(dir, "run.jsonl");
    const rows = [
      { outcome: "take_profit", realizedR: 1.5, symbol: "EURUSD" },
      { outcome: "stop_loss", realizedR: -1, symbol: "EURUSD" },
    ];
    writeFileSync(
      emitPath,
      rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    );
    const manifest = buildSweepManifest({
      analyzerVersion: "2026.08.09.test",
      anchor: "2026-08-10",
      barRejections: {},
      days: 365,
      generatedAt: "2026-08-10T04:00:00.000Z",
      grid: [{}],
      stepBars: 16,
      symbols: [{
        calibration: { tp1RiskShare: 0.8 },
        providerSymbol: "EURUSD",
        series: { "15min": [{ time: 0 }] },
        symbol: "EURUSD",
      }],
      trainShare: 0.6,
      warmupBars: 240,
    }) as unknown as Record<string, unknown>;
    tamper?.(manifest);
    writeFileSync(
      `${emitPath}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    return emitPath;
  };

  it("returns rows and manifest when the hash verifies", () => {
    const { manifest, rows } = assertManifestedCorpus(writeCorpus());
    assert.equal(rows.length, 2);
    assert.equal(manifest.analyzerVersion, "2026.08.09.test");
  });

  it("refuses a corpus whose conditions were edited after the fact", () => {
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus((manifest) => {
          manifest.warmupBars = 120;
        })),
      /manifest hash/,
    );
  });

  it("refuses a corpus with no manifest at all", () => {
    const dir = mkdtempSync(join(tmpdir(), "sweepstats-"));
    const emitPath = join(dir, "bare.jsonl");
    writeFileSync(emitPath, JSON.stringify(row("take_profit", 1)) + "\n");
    assert.throws(() => assertManifestedCorpus(emitPath), /manifest/);
  });

  it("refuses a corpus with an unparseable row instead of aggregating around it", () => {
    const emitPath = writeCorpus();
    writeFileSync(emitPath, '{"outcome":"take_profit"\nnot json\n');
    assert.throws(() => assertManifestedCorpus(emitPath), /line 1|parse/i);
  });
});
