import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  addOutcome,
  assertManifestedCorpus,
  clusteredStandardError,
  emptyStats,
  expectancy,
  rStandardError,
  rStdDev,
  type SweepEmitRow,
  VOCABULARY_ROW_KEYS,
  vocabularyRow,
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

  it("holds data-absence rows out of every denominator (#364 round 4, finding 2)", () => {
    const stats = emptyStats();
    addOutcome(stats, row("take_profit", 1));
    addOutcome(stats, row("unfilled", 0));
    addOutcome(stats, { ...row("unfilled", 0), noBarsInReviewWindow: true });
    // The marked row is counted where a reader can see it and nowhere
    // else: n and filled are exactly what the two market-evidence rows
    // made them, so fill rate does not move with provider coverage.
    assert.equal(stats.dataAbsent, 1);
    assert.equal(stats.n, 2);
    assert.equal(stats.filled, 1);
    assert.equal(expectancy(stats), 1);
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

describe("the partition reaches every reader (#364 round 5, finding 1)", () => {
  // The vocabulary partitions on the raw row's marker, so a reader that
  // REBUILDS the row anywhere between the manifest door and addOutcome
  // silently strips it. Round 5 pinned the addOutcome call's shape and
  // round 6 (finding 1) showed why that was not enough: sweep-analysis's
  // spread was over a row that was itself a closed sixteen-field rebuild
  // one layer up, so the pin passed while dataAbsent stayed structurally
  // zero. The projection now rides through the vocabulary's OWN helper,
  // and the property is EXECUTED here — a marked raw row survives the
  // projection into the partition — plus wiring pins that each reader
  // either spreads the raw row or spreads vocabularyRow at its
  // projection site.
  it("a marked row survives a memory projection into the partition — executed, not source-matched", () => {
    const stats = emptyStats();
    addOutcome(
      stats,
      vocabularyRow({
        confidenceScore: 55,
        noBarsInReviewWindow: true,
        outcome: "unfilled",
        realizedR: 0,
        symbol: "EURUSD",
      } as unknown as SweepEmitRow),
    );
    addOutcome(
      stats,
      vocabularyRow({
        outcome: "take_profit",
        realizedR: 1.2,
        symbol: "EURUSD",
      } as unknown as SweepEmitRow),
    );
    assert.equal(stats.dataAbsent, 1);
    assert.equal(stats.n, 1);
    assert.equal(stats.filled, 1);
  });

  // The input-side twin of the rollup pin (#364 round 7, finding 2):
  // addOutcome's own source is scanned for `row.<field>` reads, and each
  // one must be in VOCABULARY_ROW_KEYS — so a new partition fact wired
  // into addOutcome without joining the projection list breaks here,
  // instead of arriving as undefined on every projected row with the
  // marker-specific executed test above still green. Boundary (#364
  // round 8, smaller): the scan sees DOT ACCESS only — a destructured or
  // row["field"]-indexed read would slip past it. That is acceptable
  // because addOutcome is uniformly dot-access today (the size floor
  // below fails if that ever drops toward zero) and the executed
  // marked-row test above still catches a dropped field's behaviour.
  it("every field addOutcome reads survives vocabularyRow — self-updating on the input side", () => {
    const source = readFileSync("scripts/sweepStats.ts", "utf8");
    const bodyStart = source.indexOf("export function addOutcome");
    const bodyEnd = source.indexOf("export function", bodyStart + 1);
    assert.ok(bodyStart >= 0 && bodyEnd > bodyStart);
    const body = source.slice(bodyStart, bodyEnd);
    const reads = new Set(
      [...body.matchAll(/row\.([A-Za-z]+)/g)].map((match) => match[1]),
    );
    assert.ok(reads.size >= 3, "addOutcome must read row fields directly");
    for (const field of reads) {
      assert.ok(
        (VOCABULARY_ROW_KEYS as readonly string[]).includes(field),
        `addOutcome reads row.${field}, which VOCABULARY_ROW_KEYS does not carry — projecting readers would drop it`,
      );
    }
  });

  it("readers project through vocabularyRow or spread the raw row — the stripping layer is pinned where it lived", () => {
    assert.match(
      readFileSync("scripts/sweep-analysis.ts", "utf8"),
      /rows\.push\(\{\s*\n\s*\.\.\.vocabularyRow\(raw\),/,
    );
    assert.match(
      readFileSync("scripts/account-type-report.ts", "utf8"),
      /addOutcome\(stats, \{\s*\n\s*\.\.\.raw,/,
    );
  });

  // Self-updating against SweepStats growth: every key the vocabulary
  // carries must survive the two field-by-field rollups, so the next
  // added field breaks here instead of silently reading 0 in every
  // rollup cell.
  it("every SweepStats key survives the field-by-field rollups", () => {
    const gridTotalr = readFileSync("scripts/grid-totalr.ts", "utf8");
    const accountReport = readFileSync("scripts/account-type-report.ts", "utf8");
    for (const key of Object.keys(emptyStats())) {
      assert.match(
        gridTotalr,
        new RegExp(`target\\.${key} \\+= source\\.${key};`),
        `grid-totalr mergeInto must carry ${key}`,
      );
      assert.match(
        accountReport,
        new RegExp(`rollup\\.${key} \\+= stats\\.${key};`),
        `account-type-report rollup must carry ${key}`,
      );
    }
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

  it("excludes holdout markets — the report informs inclusion decisions (3e)", () => {
    assert.match(source, /raw\.holdout === true/);
  });

  it("keeps no private stats arithmetic to drift", () => {
    assert.doesNotMatch(source, /function add\(/);
    assert.doesNotMatch(source, /type Stats = \{/);
  });
});

describe("sweep-analysis adopts the shared vocabulary too", () => {
  const source = readFileSync("scripts/sweep-analysis.ts", "utf8");

  it("keeps no private stats arithmetic and enters through the streaming door", () => {
    assert.doesNotMatch(source, /function emptyStats\(/);
    assert.match(source, /assertManifestedCorpusStreaming\(/);
    assert.match(source, /from "\.\/sweepStats\.ts"/);
  });

  it("derives its threshold banner from calibration at runtime — the hardcoded copy is gone", () => {
    assert.doesNotMatch(source, /LIVE_THRESHOLDS/);
    assert.match(source, /getCategoryCalibration\(/);
  });

  it("excludes holdout markets from tuning tables (3e)", () => {
    assert.match(source, /parsed\.holdout === true/);
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
      clock: { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK },
      conditions: {
        macroAdjustment: "historical-treasury-curve",
        providerWarningCount: "zero-by-construction",
        weightAdjustment: "raw-engine-zero",
      },
      days: 365,
      generatedAt: "2026-08-10T04:00:00.000Z",
      grid: [{}],
      stepBars: 16,
      symbols: [{
        calibration: { tp1RiskShare: 0.8 },
        providerSymbol: "EURUSD",
        series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
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

// R0 one clock: the door refuses a corpus that cannot state its
// normalization, or whose own witnesses contradict it. A pre-R0 manifest
// hashes cleanly — its conditions were honestly recorded — but it is the
// mixed-clock population by definition, and the refusal must name that
// rather than read it.
describe("assertManifestedCorpus — the one-clock refusals (R0)", () => {
  const writeWithManifest = (manifest: Record<string, unknown>) => {
    const dir = mkdtempSync(join(tmpdir(), "sweepstats-clock-"));
    const emitPath = join(dir, "run.jsonl");
    writeFileSync(emitPath, JSON.stringify(row("take_profit", 1)) + "\n");
    const { generatedAt: _generatedAt, ...hashedPayload } = manifest;
    writeFileSync(
      `${emitPath}.manifest.json`,
      JSON.stringify(
        {
          ...manifest,
          manifestHash: sha256Hex(stableStringify(hashedPayload)),
        },
        null,
        2,
      ) + "\n",
    );
    return emitPath;
  };

  const legacyManifest = () => ({
    analyzerVersion: "2026.08.09.test",
    anchor: "2026-08-10",
    barRejections: {},
    days: 365,
    generatedAt: "2026-08-10T04:00:00.000Z",
    grid: [{}],
    stepBars: 16,
    symbols: [{
      calibration: {},
      calibrationHash: sha256Hex(stableStringify({})),
      providerSymbol: "EURUSD",
      series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
      symbol: "EURUSD",
    }],
    trainShare: 0.6,
    warmupBars: 240,
  });

  it("refuses a pre-R0 manifest with no clock block, even though its hash verifies", () => {
    assert.throws(
      () => assertManifestedCorpus(writeWithManifest(legacyManifest())),
      /no clock block.*mixed-clock/s,
    );
  });

  it("refuses a corpus swept under a SUPERSEDED clock — a stated clock must be this build's (#358 round 4)", () => {
    const manifest = legacyManifest() as Record<string, unknown>;
    manifest.clock = { calendar: CALENDAR_CLOCK, normalizer: "ny-wall-utc-v1-superseded" };
    assert.throws(
      () => assertManifestedCorpus(writeWithManifest(manifest)),
      /superseded-clock corpus is re-swept, not/,
    );
    // A deliberate historical read is an explicit act — and a LOUD one
    // (#358 round 4b): the override must warn on every read, or a
    // superseded-clock figure becomes indistinguishable from one that
    // passed the door.
    process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK = "1";
    const warned: string[] = [];
    const realWarn = console.warn;
    console.warn = (message: unknown) => {
      warned.push(String(message));
    };
    try {
      const { rows } = assertManifestedCorpus(writeWithManifest(manifest));
      assert.equal(rows.length, 1);
      assert.equal(warned.length, 1);
      assert.match(warned[0], /SUPERSEDED-CLOCK READ/);
      assert.match(warned[0], /ny-wall-utc-v1-superseded/);
    } finally {
      console.warn = realWarn;
      delete process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK;
    }
  });

  it("refuses a corpus whose series witnesses a naive clock", () => {
    const manifest = legacyManifest() as ReturnType<typeof legacyManifest> & {
      clock?: unknown;
    };
    manifest.clock = { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK };
    manifest.symbols[0].series["15min"] = {
      ...seriesFacts([{ time: 0 }], "intraday"),
      clock: { verdict: "naive" },
    };
    assert.throws(
      () => assertManifestedCorpus(writeWithManifest(manifest)),
      /EURUSD 15min.*"naive" clock/s,
    );
  });

  it("refuses a corpus whose 5min series registers at a shift against the primary", () => {
    const manifest = legacyManifest() as Record<string, unknown>;
    manifest.clock = { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK };
    (manifest.symbols as Array<Record<string, unknown>>)[0].crossSeriesClock = {
      bestShiftHours: 4,
      matchRateAtBest: 0.8,
      matchRateAtZero: 0,
      sampledDays: 400,
      verdict: "shifted",
    };
    assert.throws(
      () => assertManifestedCorpus(writeWithManifest(manifest)),
      /registers against.*4h\s+shift.*mixed-clock signature/s,
    );
  });
});

// R1b: the stated-conditions door (E6) and the per-symbol 5-minute
// density door (E2's corpus half — the assertion that carries
// verify-cache-clock's blind band; constants measured 2026-08-11..17,
// provenance in sweepStats.ts).
describe("verifyManifest — stated conditions and 5-minute density (R1b)", () => {
  const facts = (count: number, spanDays: number) => ({
    clock: { verdict: "indeterminate" },
    count,
    firstTime: 0,
    largestGapMs: 0,
    lastTime: spanDays * 86_400_000,
    spanDays,
  });

  const goodConditions = {
    macroAdjustment: "historical-treasury-curve",
    providerWarningCount: "zero-by-construction",
    weightAdjustment: "raw-engine-zero",
  };

  const writeCorpus = (input: {
    clock?: { calendar: string; normalizer: string };
    conditions?: Record<string, unknown>;
    crossSeriesDensity?: Record<string, unknown>;
    series: Record<string, unknown>;
    symbol: string;
    treasuryCurve?: Record<string, unknown> | null;
  }) => {
    // Default curve evidence coheres with any fixture series (facts()
    // stamps lastTime = spanDays in epoch-adjacent ms, far below this
    // lastTime); null drops the block to exercise the evidence door.
    const treasuryCurve = input.treasuryCurve === null
      ? {}
      : {
        treasuryCurve: input.treasuryCurve ?? {
          count: 3_000,
          firstTime: Date.UTC(2013, 0, 2),
          largestGapMs: 4 * 86_400_000,
          lastTime: Date.UTC(2027, 0, 1),
        },
      };
    const manifest: Record<string, unknown> = {
      analyzerVersion: "2026.08.18.test",
      anchor: "2026-08-18",
      barRejections: {},
      clock: input.clock ?? { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK },
      ...(input.conditions && { conditions: input.conditions }),
      days: 365,
      generatedAt: "2026-08-18T04:00:00.000Z",
      grid: [{}],
      stepBars: 16,
      symbols: [{
        calibration: {},
        calibrationHash: sha256Hex(stableStringify({})),
        ...(input.crossSeriesDensity &&
          { crossSeriesDensity: input.crossSeriesDensity }),
        providerSymbol: input.symbol,
        series: input.series,
        symbol: input.symbol,
      }],
      trainShare: 0.6,
      ...treasuryCurve,
      warmupBars: 240,
    };
    const dir = mkdtempSync(join(tmpdir(), "sweepstats-r1b-"));
    const emitPath = join(dir, "run.jsonl");
    writeFileSync(emitPath, JSON.stringify(row("take_profit", 1)) + "\n");
    const { generatedAt: _generatedAt, ...hashedPayload } = manifest;
    writeFileSync(
      `${emitPath}.manifest.json`,
      JSON.stringify({
        ...manifest,
        manifestHash: sha256Hex(stableStringify(hashedPayload)),
      }) + "\n",
    );
    return emitPath;
  };

  it("refuses a current-clock corpus with no conditions block", () => {
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          series: { "15min": facts(960, 10) },
          symbol: "EURUSD",
        })),
      /no conditions block.*re-swept, not aggregated/s,
    );
  });

  it("refuses a corpus stating terms this build's readers do not understand", () => {
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: {
            ...goodConditions,
            weightAdjustment: "learning-simulated",
          },
          series: { "15min": facts(960, 10) },
          symbol: "EURUSD",
        })),
      /conditions\.weightAdjustment is "learning-simulated"/,
    );
  });

  it("refuses a structurally dense class under its absolute 5-minute floor", () => {
    // Crypto measured 287.9-288.0 rows/day across the class; 200/day is a
    // clipped, holed, or wrong-symbol series, whatever the ratio says.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: { "15min": facts(670, 10), "5min": facts(2_000, 10) },
          symbol: "BTCUSD",
        })),
      /BTCUSD 5-minute series runs 200\.0 rows\/day.*under the crypto floor of 260/s,
    );
  });

  it("refuses a clipped 15-minute primary through the tight ratio — the cache instrument's blind band", () => {
    // 340/96 = 3.54: a healthy 5-minute series against a primary clipped
    // ~15% — inside verify-cache-clock's [2.5, 3.5]-with-min-rows
    // tolerance on arbitrary stores, outside the corpus door's band.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: { "15min": facts(960, 10), "5min": facts(3_400, 10) },
          symbol: "EURUSD",
        })),
      /EURUSD 5min\/15min density 3\.54.*outside \[2\.7, 3\.25\]/s,
    );
  });

  // Deep 15-minute store (13 years, era-mixed at 74/day) beside a
  // shallow 5-minute store (recent year at 288/day) — the normal FMP
  // depth shape, whose own-window ratio 288/74 = 3.89 sits outside the
  // band with no clipping anywhere (#364 rounds 9-10).
  const DAY = 86_400_000;
  const depthShapeSeries = {
    "15min": {
      clock: { verdict: "indeterminate" },
      count: 351_130,
      firstTime: 0,
      largestGapMs: 0,
      lastTime: 4_745 * DAY,
      spanDays: 4_745,
    },
    "5min": {
      clock: { verdict: "indeterminate" },
      count: 105_120,
      firstTime: 4_380 * DAY,
      largestGapMs: 0,
      lastTime: 4_745 * DAY,
      spanDays: 365,
    },
  };

  it("judges the ratio at depth through the manifested shared-window counts (#364 round 10, finding 1)", () => {
    // Healthy at depth: inside the one-year shared window the counts
    // run 288/96 per day — ratio 3.0, in band — so the fact admits the
    // exact shape whose own-span rates would have false-refused.
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      crossSeriesDensity: {
        fifteenCount: 35_040,
        fiveCount: 105_120,
        spanDays: 365,
      },
      series: depthShapeSeries,
      symbol: "BTCUSD",
    }));
    // Clipped at depth: same stores, but the shared window holds only
    // 29_712 15-minute rows (~15% clip) — ratio 3.54. Round 9's span
    // heuristic would have abstained here, silently un-judging exactly
    // the population the band exists for; the fact refuses.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          crossSeriesDensity: {
            fifteenCount: 29_712,
            fiveCount: 105_120,
            spanDays: 365,
          },
          series: depthShapeSeries,
          symbol: "BTCUSD",
        })),
      /BTCUSD 5min\/15min density 3\.54.*shared window.*outside \[2\.7, 3\.25\]/s,
    );
  });

  it("falls back to the near-identical-window heuristic on HISTORICAL reads without the fact (#364 rounds 9 and 11)", () => {
    // Manifests predating crossSeriesDensity are exactly the
    // historical-read population — on the current path their absence
    // refuses at the evidence block (executed above). Under the
    // override, the own-window ratio 3.89 would refuse, but the windows
    // diverge, so the fallback self-excludes rather than comparing
    // across eras; the crypto absolute floor still binds the 5-minute
    // series over its own span (288 >= 260) and admits.
    process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK = "1";
    const realWarn = console.warn;
    console.warn = () => {};
    try {
      assertManifestedCorpus(writeCorpus({
        clock: {
          calendar: CALENDAR_CLOCK,
          normalizer: "ny-wall-utc-v1-superseded",
        },
        series: depthShapeSeries,
        symbol: "BTCUSD",
        treasuryCurve: null,
      }));
    } finally {
      console.warn = realWarn;
      delete process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK;
    }
  });

  it("admits honest shapes: dense-and-coherent, trade-sparse, absent 5-minute, sub-week span", () => {
    // Dense and coherent: 288/96 = 3.0 at full crypto density.
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      crossSeriesDensity: { fifteenCount: 960, fiveCount: 2_880, spanDays: 10 },
      series: { "15min": facts(960, 10), "5min": facts(2_880, 10) },
      symbol: "BTCUSD",
    }));
    // Trade-sparse (XC prints ~8.6 rows/day where trades occurred): the
    // ratio gate self-excludes it and futures carries no absolute floor.
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      crossSeriesDensity: { fifteenCount: 30, fiveCount: 90, spanDays: 10 },
      series: { "15min": facts(30, 10), "5min": facts(90, 10) },
      symbol: "XC",
    }));
    // Absent 5-minute series is honest degradation, not a density lie.
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      series: { "15min": facts(960, 10) },
      symbol: "BTCUSD",
    }));
    // A sub-week span cannot separate holiday from hole; the door is
    // silent rather than guessing.
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      crossSeriesDensity: { fifteenCount: 192, fiveCount: 400, spanDays: 2 },
      series: { "15min": facts(192, 2), "5min": facts(400, 2) },
      symbol: "BTCUSD",
    }));
  });

  it("keeps a clipped ES-class primary in the ratio's population — the filter is clip-invariant (#364 round 11, finding 1)", () => {
    // ESUSD is asset-type futures: no absolute floor, BY DESIGN judged
    // by the ratio. A ~12% 15-minute clip (65.9 -> 57.9/day) used to
    // drag the symbol below the 60/day population filter — the clip
    // removed it from the instrument that detects clipping, leaving it
    // judged by nothing. max(fifteen, five/3) keeps it in (the healthy
    // 5-minute side testifies 197.3/3 = 65.8/day) and the ratio fires.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          crossSeriesDensity: {
            fifteenCount: 21_120,
            fiveCount: 72_000,
            spanDays: 365,
          },
          series: {
            "15min": facts(21_120, 365),
            "5min": facts(72_000, 365),
          },
          symbol: "ESUSD",
        })),
      /ESUSD 5min\/15min density 3\.41.*shared window.*outside \[2\.7, 3\.25\]/s,
    );
  });

  it("refuses a current-path manifest whose symbol has both series but no crossSeriesDensity — a claim without its evidence (#364 round 11, finding 2)", () => {
    // The driver writes the fact whenever both series have bars and
    // their windows meet, so on the current path absence means the
    // manifest predates the fact; missing evidence buys a refusal,
    // never the weaker own-span fallback. This shape passes the
    // density loop (fallback ratio 3.0, in band) and refuses at the
    // evidence block.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: { "15min": facts(960, 10), "5min": facts(2_880, 10) },
          symbol: "BTCUSD",
        })),
      /BTCUSD carries both 5-minute and 15-minute series but no crossSeriesDensity/,
    );
  });

  it("refuses two mature stores that share no time window — shape poison on every read path", () => {
    // A 5-minute series covering a period its own primary never touches
    // cannot be one symbol's feed at two resolutions. Binds like the
    // clock witnesses, before any evidence-block reasoning.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: {
            "15min": {
              clock: { verdict: "indeterminate" },
              count: 960,
              firstTime: 0,
              largestGapMs: 0,
              lastTime: 10 * DAY,
              spanDays: 10,
            },
            "5min": {
              clock: { verdict: "indeterminate" },
              count: 2_880,
              firstTime: 20 * DAY,
              largestGapMs: 0,
              lastTime: 30 * DAY,
              spanDays: 10,
            },
          },
          symbol: "BTCUSD",
        })),
      /BTCUSD 5-minute and 15-minute series share no time window/,
    );
  });

  it("refuses a macro claim without curve evidence, a holed curve, and a stale-tailed curve (#364 round 2, finding 1)", () => {
    // The literal alone is not enough: conditions.macroAdjustment claims
    // reconstruction, and the door reads the curve facts behind it.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: { "15min": facts(960, 10) },
          symbol: "EURUSD",
          treasuryCurve: null,
        })),
      /no treasuryCurve facts.*claim without evidence/s,
    );
    // An interior hole means decisions inside it scored months-stale
    // rows as fresh — worse than the zero the claim abolished.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: { "15min": facts(960, 10) },
          symbol: "EURUSD",
          treasuryCurve: {
            count: 3_000,
            firstTime: Date.UTC(2013, 0, 2),
            largestGapMs: 90 * 86_400_000,
            lastTime: Date.UTC(2027, 0, 1),
          },
        })),
      /90-day interior hole/,
    );
    // A curve ending before the corpus does is the same staleness at the
    // tail: the visibility pointer stalls and every later decision reads
    // the last rows as current.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: {
            "15min": {
              clock: { verdict: "indeterminate" },
              count: 960,
              firstTime: Date.UTC(2026, 6, 1),
              largestGapMs: 0,
              lastTime: Date.UTC(2026, 7, 18),
              spanDays: 10,
            },
          },
          symbol: "EURUSD",
          treasuryCurve: {
            count: 3_000,
            firstTime: Date.UTC(2013, 0, 2),
            largestGapMs: 4 * 86_400_000,
            lastTime: Date.UTC(2026, 5, 1),
          },
        })),
      /Treasury curve ends 2026-06-01 but the corpus runs to 2026-08-18/,
    );
    // #364 round 3, finding 2: the LEADING edge. A curve starting after
    // BOTH the provider's 2013 floor and the corpus start is a shallow
    // rebuild — E6's zero restored under the claim — and refuses; the
    // same shallow curve over a corpus it fully covers passes, and a
    // floor-deep curve passes any corpus depth.
    const modern15min = (firstTime: number) => ({
      clock: { verdict: "indeterminate" },
      count: 960,
      firstTime,
      largestGapMs: 0,
      lastTime: Date.UTC(2026, 7, 18),
      spanDays: 10,
    });
    const shallowCurve = {
      count: 1_500,
      firstTime: Date.UTC(2020, 0, 6),
      largestGapMs: 4 * 86_400_000,
      lastTime: Date.UTC(2027, 0, 1),
    };
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: { "15min": modern15min(Date.UTC(2015, 0, 5)) },
          symbol: "EURUSD",
          treasuryCurve: shallowCurve,
        })),
      /Treasury curve starts 2020-01-06.*shallow rebuilt store/s,
    );
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      series: { "15min": modern15min(Date.UTC(2021, 0, 4)) },
      symbol: "EURUSD",
      treasuryCurve: shallowCurve,
    }));
  });

  it("binds the density door on deliberate historical reads, while conditions and curve evidence stay exempt (#364 round 2, finding 3)", () => {
    // The stated asymmetry, executed: the superseded-clock override
    // accepts superseded measurement TERMS (no conditions block, no
    // curve facts — both pre-R1b by definition), but never poisoned
    // DATA — a density violation refuses the historical read exactly as
    // the clock witnesses beside it would.
    process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK = "1";
    const realWarn = console.warn;
    console.warn = () => {};
    try {
      const superseded = {
        calendar: CALENDAR_CLOCK,
        normalizer: "ny-wall-utc-v1-superseded",
      };
      assert.throws(
        () =>
          assertManifestedCorpus(writeCorpus({
            clock: superseded,
            series: { "15min": facts(670, 10), "5min": facts(2_000, 10) },
            symbol: "BTCUSD",
            treasuryCurve: null,
          })),
        /under the crypto floor/,
      );
      const { rows } = assertManifestedCorpus(writeCorpus({
        clock: superseded,
        series: { "15min": facts(960, 10), "5min": facts(2_880, 10) },
        symbol: "BTCUSD",
        treasuryCurve: null,
      }));
      assert.equal(rows.length, 1);
    } finally {
      console.warn = realWarn;
      delete process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK;
    }
  });
});

// #358 findings (round 1 #4 and round 3 #1): bare emit readers kept
// aggregating pre-R0 corpora, and dooring an ENUMERATED list twice
// proved the enumeration was the mistake — round 1 named five, round 3
// found four more, and the sweep below found the tenth candidate
// (starvation-audit) reading a third idiom. So the pin is the
// POPULATION, not a list: every script that line-reads files must
// either pass the one-clock door or sit on the exemption list with a
// stated reason. A new reader idiom extends the pattern; a new reader
// without a door fails here.
describe("every emit reader passes the one-clock door (R0) — the population, not a list", () => {
  const readerPattern =
    /createInterface\(|readLinesSync\(|split\("\\n"\)|split\(\/\\r\?\\n\/\)|split\('\\n'\)/;
  // The door must be CALLED, not merely imported (#358 round 6 minor):
  // the bare identifier also matched its own import line, so a reader
  // that imported assertManifestedCorpus and never invoked it would have
  // passed. \w* keeps the streaming variant's call matched.
  const doorPattern = /assertManifest\(|assertManifestedCorpus\w*\(/;
  // Keyed by path relative to scripts/, not basename (#358 round 4b): a
  // future scripts/<subdir>/starvation-audit.ts must not inherit an
  // exemption written for a different file.
  const exempt: Record<string, string> = {
    "starvation-audit.ts":
      "reads the sweep's printed stdout TABLE, not the emit — an artifact " +
      "that cannot carry a manifest; the gap (rejection tallies live only " +
      "in stdout) is carried on HANDOFF's small list for the instrument " +
      "phase",
    "sweepStats.ts": "is the door module itself",
  };

  it("every line-reading script under scripts/ has the door or a named exemption", () => {
    const undoored: string[] = [];
    for (
      const entry of readdirSync("scripts", {
        recursive: true,
        withFileTypes: true,
      })
    ) {
      const name = entry.name;
      if (!entry.isFile() || !/\.(ts|mjs)$/.test(name)) {
        continue;
      }
      const fullPath = join(entry.parentPath, name);
      const relPath = fullPath.replace(/^scripts\//, "");
      const source = readFileSync(fullPath, "utf8");
      if (!readerPattern.test(source)) {
        continue;
      }
      if (doorPattern.test(source) || exempt[relPath]) {
        continue;
      }
      undoored.push(relPath);
    }
    assert.deepEqual(
      undoored,
      [],
      `line-reading scripts with no one-clock door: ${undoored.join(", ")}`,
    );
  });

  for (
    const script of [
      "scripts/market-dossier.ts",
      "scripts/roster-expectancy-audit.ts",
      "scripts/threshold-rescue.ts",
      "scripts/cost-sensitivity-verdict.ts",
      "scripts/feasibility-4d.ts",
      "scripts/confidence-bands.ts",
      "scripts/ag-class-derivation.ts",
      "scripts/exclusion-suspects.ts",
      "scripts/stop-provenance.ts",
    ]
  ) {
    it(`${script} asserts the manifest before reading a line`, () => {
      const source = readFileSync(script, "utf8");
      assert.match(source, /assertManifest\((path|file)\);/);
      assert.match(
        source,
        /import \{ assertManifest[^}]*\} from "\.\/sweepStats\.ts";/,
      );
    });
  }
});
