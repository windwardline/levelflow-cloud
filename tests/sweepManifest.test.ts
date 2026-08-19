import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  sha256Hex,
  stableStringify,
  type SweepConditions,
  treasuryCurveFacts,
  type TreasuryCurveFacts,
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
    ], "intraday");
    assert.equal(facts.count, 4);
    assert.equal(facts.firstTime, 0);
    assert.equal(facts.lastTime, 50 * hour);
    assert.equal(facts.largestGapMs, 48 * hour);
    assert.equal(facts.spanDays, 2.08);
  });

  it("reads an empty or single-bar series without inventing ends", () => {
    assert.deepEqual(seriesFacts([], "intraday"), {
      clock: { verdict: "indeterminate" },
      count: 0,
      firstTime: null,
      largestGapMs: 0,
      lastTime: null,
      spanDays: 0,
    });
    assert.deepEqual(seriesFacts([bar(5)], "intraday"), {
      clock: { verdict: "indeterminate" },
      count: 1,
      firstTime: 5,
      largestGapMs: 0,
      lastTime: 5,
      spanDays: 0,
    });
  });

  it("carries the series' clock witness (R0) — tiny fixtures stay indeterminate", () => {
    assert.equal(seriesFacts([bar(0)], "daily").clock.verdict, "indeterminate");
    assert.equal(seriesFacts([bar(0)], "intraday").clock.verdict, "indeterminate");
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
      "15min": seriesFacts([{ time: 0 }, { time: 900_000 }], "intraday"),
      "1day": seriesFacts([{ time: 0 }], "daily"),
      "5min": seriesFacts([], "intraday"),
    },
    symbol: "ESUSD",
  });

  const build = (overrides: {
    calibration?: Record<string, unknown>;
    clock?: { calendar: string; normalizer: string };
    conditions?: SweepConditions;
    generatedAt?: string;
    grid?: unknown[];
    treasuryCurve?: TreasuryCurveFacts;
  } = {}) =>
    buildSweepManifest({
      analyzerVersion: "2026.08.09.test",
      anchor: "2026-08-09",
      barRejections: { spike: 2 },
      clock: overrides.clock ??
        { calendar: "test-calendar-v1", normalizer: "test-clock-v1" },
      conditions: overrides.conditions ?? {
        macroAdjustment: "historical-treasury-curve",
        providerWarningCount: "zero-by-construction",
        weightAdjustment: "raw-engine-zero",
      },
      days: 365,
      generatedAt: overrides.generatedAt ?? "2026-08-09T22:00:00.000Z",
      grid: overrides.grid ?? [{}],
      stepBars: 16,
      symbols: [
        symbolInput(overrides.calibration ?? { tp1RiskShare: 0.8 }),
      ],
      trainShare: 0.6,
      treasuryCurve: overrides.treasuryCurve ?? {
        count: 3_000,
        firstTime: Date.UTC(2013, 0, 2),
        largestGapMs: 4 * 86_400_000,
        lastTime: Date.UTC(2027, 0, 1),
      },
      warmupBars: 240,
    });

  it("records what produced the corpus", () => {
    const manifest = build();
    assert.equal(manifest.analyzerVersion, "2026.08.09.test");
    assert.equal(manifest.anchor, "2026-08-09");
    assert.equal(manifest.clock.normalizer, "test-clock-v1");
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

  it("moves its hash when the clock moves — one corpus, one normalization (R0)", () => {
    assert.notEqual(
      build().manifestHash,
      build({
        clock: { calendar: "test-calendar-v1", normalizer: "other-clock" },
      }).manifestHash,
    );
  });

  it("hashes the Treasury-curve facts — the evidence behind the macro claim moves the hash (#364 round 2)", () => {
    assert.notEqual(
      build().manifestHash,
      build({
        treasuryCurve: {
          count: 3_000,
          firstTime: Date.UTC(2013, 0, 2),
          largestGapMs: 40 * 86_400_000,
          lastTime: Date.UTC(2027, 0, 1),
        },
      }).manifestHash,
    );
  });

  it("hashes the E6 conditions — stated terms are part of corpus identity (R1b)", () => {
    const baseline = build();
    assert.equal(baseline.conditions.macroAdjustment, "historical-treasury-curve");
    assert.notEqual(
      baseline.manifestHash,
      build({
        // Only these literals typecheck today; a future variant term joins
        // SweepConditions AND the reader door together. Casting simulates
        // that future corpus without widening the current contract.
        conditions: {
          macroAdjustment: "live-fetch",
        } as unknown as SweepConditions,
      }).manifestHash,
    );
  });

  it("does not move its hash for the write timestamp", () => {
    assert.equal(
      build().manifestHash,
      build({ generatedAt: "2027-01-01T00:00:00.000Z" }).manifestHash,
    );
  });
});

describe("treasuryCurveFacts — the curve's own continuity record", () => {
  const day = 86_400_000;

  it("records count, ends and the largest inter-row gap", () => {
    const facts = treasuryCurveFacts([
      { dateMs: 0 },
      { dateMs: 3 * day },
      { dateMs: 4 * day },
      { dateMs: 40 * day },
    ]);
    assert.deepEqual(facts, {
      count: 4,
      firstTime: 0,
      largestGapMs: 36 * day,
      lastTime: 40 * day,
    });
  });

  it("states an empty curve as zero rows, never a fabricated span", () => {
    assert.deepEqual(treasuryCurveFacts([]), {
      count: 0,
      firstTime: null,
      largestGapMs: 0,
      lastTime: null,
    });
  });
});

describe("the driver writes the manifest beside the emit", () => {
  it("builds and writes <emit>.manifest.json with the rejection tally", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(script, /buildSweepManifest\(/);
    assert.match(script, /\.manifest\.json/);
    assert.match(script, /barRejections: barRejectionTally/);
  });

  // E6 (R1b) driver wiring — replay-sweep runs main() on import, so its
  // half of the macro reconstruction is pinned at source the way the
  // manifest write above is; the arithmetic itself is executed in
  // tests/sweep.test.ts and tests/macroRates.test.ts.
  it("loads the Treasury rolling store, hands it to every simulation, and states the conditions it measured under", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(
      script,
      /key: "treasury-rates",/,
      "the curve must live in the same rolling-store discipline as bars and the calendar",
    );
    assert.match(script, /treasuryRates,\s*\n\s*warmupBars: split\.warmupBars,/);
    assert.match(script, /conditions,\s*\n\s*days: args\.days,/);
    assert.match(
      script,
      /macroAdjustment: "historical-treasury-curve",/,
    );
    // I3's lesson holds for the curve exactly as for the calendar: a
    // warned-and-continued hole would be pinned as the anchor day's truth
    // and never refetched.
    assert.match(script, /Treasury-rate fetch failed \(\$\{response\.status\}\)/);
    assert.doesNotMatch(
      script,
      /Treasury[\s\S]{0,200}?console\.warn[\s\S]{0,80}?continue/,
      "a failed Treasury chunk must stop the run, never hole the join",
    );
    // #364 round 2, finding 1: the claim carries evidence. A 200 with an
    // empty or unparseable body over a week-or-wider window throws (a
    // holed curve is refused, never merged and pinned); the driver
    // refuses an empty or stale-tailed curve before simulating; and the
    // manifest carries the curve's facts for the door to assert.
    assert.match(script, /returned zero parseable rows/);
    assert.match(script, /Treasury curve is empty/);
    assert.match(script, /more than 7 days stale/);
    assert.match(script, /treasuryCurve: treasuryCurveFacts\(treasuryRates\),/);
  });

  // #364 round 1, finding 1: starvation-audit read the driver's stdout
  // table by POSITION and had already drifted once silently (notWarm's
  // insertion left geometryKill summing noConsensus + belowConf — the
  // amendment-25 gate deciding starvation from the wrong columns);
  // R1b's unresolv column would have drifted it again. The audit now
  // resolves columns by name from the header and refuses a table
  // missing a required name; this pin holds the two sources together —
  // every name the audit consumes must exist in the driver's header —
  // so a future column insert breaks HERE, never silently there. Both
  // files run main() on import, hence source pins.
  it("the starvation audit's required columns all exist in the driver's header, resolved by name", () => {
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    const audit = readFileSync("scripts/starvation-audit.ts", "utf8");
    const headerBlock = driver.match(
      /const rows: string\[\]\[\] = \[\[([\s\S]*?)\]\];/,
    );
    assert.ok(headerBlock, "driver must declare its stdout header literally");
    const headerNames = [...headerBlock![1].matchAll(/"(\w+)"/g)]
      .map((m) => m[1]);
    const auditNames = (label: string) => {
      const block = audit.match(
        new RegExp(`const ${label} = \\[([\\s\\S]*?)\\] as const;`),
      );
      assert.ok(block, `audit must declare ${label} literally`);
      return [...block![1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    };
    for (const name of [
      ...auditNames("NEED_COLUMNS"),
      ...auditNames("OPTIONAL_COLUMNS"),
    ]) {
      assert.ok(
        headerNames.includes(name),
        `audit consumes column "${name}" which the driver's header does not carry`,
      );
    }
    // The positional accessor shape is gone for good.
    assert.doesNotMatch(audit, /const n = \(i: number\)/);
    assert.match(audit, /index\.has\(name\)/);
  });

  // #364 round 3, finding 4: by-name reading is only as safe as the
  // header being in the DATA ROW's order — insert a header column
  // without its row expression (or the reverse) and every by-name
  // lookup past the insertion reads the neighbour. This holds the two
  // literals together position by position; a new column must be added
  // to the header, the push, AND this mapping in the same change.
  it("the driver's data row is in its own header's order, field by field", () => {
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    const headerNames = [
      ...driver.match(
        /const rows: string\[\]\[\] = \[\[([\s\S]*?)\]\];/,
      )![1].matchAll(/"(\w+)"/g),
    ].map((m) => m[1]);
    const pushBlock = driver.match(/rows\.push\(\[\s*\n([\s\S]*?)\]\);/);
    assert.ok(pushBlock, "driver must push its data row as one literal");
    const fields = pushBlock![1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));
    const rowExpression: Record<string, RegExp> = {
      belowConf: /belowConfidence/,
      belowPayoff: /belowPayoff/,
      dataAbsent: /summary\.dataAbsent/,
      decisions: /decisionPoints/,
      expectancyR: /expectancyR/,
      newsBlk: /newsBlocked/,
      noConsensus: /noConsensus/,
      notWarm: /notWarm/,
      planRejected: /planRejected/,
      regimeBlk: /regimeBlocked \+ result\.rejections\.regimeGated/,
      sessionBlk: /sessionBlocked/,
      setups: /summary\.total/,
      split: /split\.name/,
      stopRate: /stopRate/,
      symbol: /^symbol,$/,
      tp1HitRate: /tp1HitRate/,
      unfilled: /summary\.unfilled/,
      unresolv: /unresolvable/,
      variant: /^variant,$/,
    };
    assert.equal(
      fields.length,
      headerNames.length,
      "header and data row must carry the same number of columns",
    );
    headerNames.forEach((name, position) => {
      const pattern = rowExpression[name];
      assert.ok(
        pattern,
        `header column "${name}" has no row-expression mapping — extend this pin with the new column`,
      );
      assert.match(
        fields[position],
        pattern,
        `row position ${position} must carry ${name}`,
      );
    });
  });
});
