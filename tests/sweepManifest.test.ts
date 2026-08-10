import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  sha256Hex,
  stableStringify,
} from "../scripts/sweepManifest.ts";

// 2i (2026-08-09): the corpus describes itself. Nothing used to persist a
// sweep's conditions except stdout and an operator-pathed JSONL with NO
// record of the calibration that produced it — variant:"baseline" is
// byte-identical across engine edits, the exact hazard calibration.ts
// documents for NGUSD. The manifest carries the analyzer version, the
// resolved per-symbol calibration (hashed), the grid, warmup/split params,
// the anchor, per-(symbol, timeframe) bar facts including the largest gap,
// and the bar-rejection tally — and item 3's readers assert its hash before
// aggregating anything.

describe("seriesFacts — continuity as a recorded fact", () => {
  const bar = (time: number) => ({ time });

  it("reports count, ends, largest gap and span", () => {
    const hour = 3_600_000;
    const facts = seriesFacts([
      bar(0),
      bar(hour),
      bar(2 * hour),
      bar(50 * hour),
    ]);
    assert.equal(facts.count, 4);
    assert.equal(facts.firstTime, 0);
    assert.equal(facts.lastTime, 50 * hour);
    assert.equal(facts.largestGapMs, 48 * hour);
    assert.equal(facts.spanDays, 2.08);
  });

  it("reads an empty or single-bar series without inventing ends", () => {
    assert.deepEqual(seriesFacts([]), {
      count: 0,
      firstTime: null,
      largestGapMs: 0,
      lastTime: null,
      spanDays: 0,
    });
    assert.deepEqual(seriesFacts([bar(5)]), {
      count: 1,
      firstTime: 5,
      largestGapMs: 0,
      lastTime: 5,
      spanDays: 0,
    });
  });
});

describe("stableStringify — hashes cannot depend on key order", () => {
  it("serializes identical objects identically regardless of key order", () => {
    assert.equal(
      stableStringify({ b: 1, a: { d: 2, c: [3, 1] } }),
      stableStringify({ a: { c: [3, 1], d: 2 }, b: 1 }),
    );
  });

  it("keeps array order significant", () => {
    assert.notEqual(stableStringify([1, 2]), stableStringify([2, 1]));
  });
});

describe("buildSweepManifest — the NGUSD hazard closed", () => {
  const symbolInput = (calibration: Record<string, unknown>) => ({
    calibration,
    providerSymbol: "ESUSD",
    series: {
      "15min": seriesFacts([{ time: 0 }, { time: 900_000 }]),
      "1day": seriesFacts([{ time: 0 }]),
      "5min": seriesFacts([]),
    },
    symbol: "ESUSD",
  });

  const build = (overrides: {
    calibration?: Record<string, unknown>;
    generatedAt?: string;
    grid?: unknown[];
  } = {}) =>
    buildSweepManifest({
      analyzerVersion: "2026.08.09.test",
      anchor: "2026-08-09",
      barRejections: { spike: 2 },
      days: 365,
      generatedAt: overrides.generatedAt ?? "2026-08-09T22:00:00.000Z",
      grid: overrides.grid ?? [{}],
      stepBars: 16,
      symbols: [
        symbolInput(overrides.calibration ?? { tp1RiskShare: 0.8 }),
      ],
      trainShare: 0.6,
      warmupBars: 240,
    });

  it("records what produced the corpus", () => {
    const manifest = build();
    assert.equal(manifest.analyzerVersion, "2026.08.09.test");
    assert.equal(manifest.anchor, "2026-08-09");
    assert.equal(manifest.warmupBars, 240);
    assert.equal(manifest.trainShare, 0.6);
    assert.deepEqual(manifest.barRejections, { spike: 2 });
    assert.equal(manifest.symbols[0].symbol, "ESUSD");
    assert.equal(manifest.symbols[0].series["15min"].count, 2);
    assert.equal(manifest.symbols[0].series["5min"].count, 0);
    assert.equal(
      manifest.symbols[0].calibrationHash,
      sha256Hex(stableStringify({ tp1RiskShare: 0.8 })),
    );
  });

  it("moves its hash when the calibration moves — same label, different engine, different corpus", () => {
    const baseline = build();
    const edited = build({ calibration: { tp1RiskShare: 0.9 } });
    assert.notEqual(baseline.manifestHash, edited.manifestHash);
    assert.notEqual(
      baseline.symbols[0].calibrationHash,
      edited.symbols[0].calibrationHash,
    );
  });

  it("moves its hash when the grid moves", () => {
    assert.notEqual(
      build().manifestHash,
      build({ grid: [{ stopAtrMultiplier: 2 }] }).manifestHash,
    );
  });

  it("does not move its hash for the write timestamp", () => {
    assert.equal(
      build().manifestHash,
      build({ generatedAt: "2027-01-01T00:00:00.000Z" }).manifestHash,
    );
  });
});

describe("the driver writes the manifest beside the emit", () => {
  it("builds and writes <emit>.manifest.json with the rejection tally", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(script, /buildSweepManifest\(/);
    assert.match(script, /\.manifest\.json/);
    assert.match(script, /barRejections: barRejectionTally/);
  });
});
