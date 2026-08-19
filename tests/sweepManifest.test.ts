import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  crossSeriesDensityFacts,
  seriesFacts,
  sha256Hex,
  stableStringify,
  type SweepConditions,
  TREASURY_FETCH_START_MS,
  treasuryChunkRefusal,
  treasuryCurveFacts,
  type TreasuryCurveFacts,
  treasuryGapTouching,
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

describe("crossSeriesDensityFacts — the ratio's shared window (#364 round 10)", () => {
  const bar = (time: number) => ({ time });
  const DAY = 86_400_000;

  it("counts both series inside the intersection window only", () => {
    // 15-minute covers days 0..20, 5-minute only days 10..20: the
    // shared window is [10d, 20d], so the 15-minute bars at 0d and 5d
    // fall outside it and the 5-minute count is untouched.
    const facts = crossSeriesDensityFacts(
      [bar(10 * DAY), bar(12 * DAY), bar(15 * DAY), bar(20 * DAY)],
      [bar(0), bar(5 * DAY), bar(10 * DAY), bar(14 * DAY), bar(20 * DAY)],
    );
    assert.deepEqual(facts, {
      fifteenCount: 3,
      fiveCount: 4,
      spanDays: 10,
    });
  });

  it("is undefined when either series is empty or the windows never meet", () => {
    assert.equal(crossSeriesDensityFacts([], [bar(0)]), undefined);
    assert.equal(crossSeriesDensityFacts([bar(0)], []), undefined);
    assert.equal(
      crossSeriesDensityFacts(
        [bar(0), bar(DAY)],
        [bar(10 * DAY), bar(11 * DAY)],
      ),
      undefined,
    );
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

  it("records count, ends, the largest inter-row gap, and week-plus gap POSITIONS", () => {
    // #364 round 14, finding 2: largestGapMs alone is positionless, so
    // the door could only refuse a holed curve absolutely. Week-plus
    // gaps carry their positions for the corpus-relative refusal.
    const facts = treasuryCurveFacts([
      { dateMs: 0 },
      { dateMs: 3 * day },
      { dateMs: 4 * day },
      { dateMs: 40 * day },
    ]);
    assert.deepEqual(facts, {
      count: 4,
      firstTime: 0,
      gapsOverWeekMs: [{ endMs: 40 * day, startMs: 4 * day }],
      largestGapMs: 36 * day,
      lastTime: 40 * day,
    });
    // A healthy curve hashes exactly as it did before the field existed.
    assert.deepEqual(
      treasuryCurveFacts([{ dateMs: 0 }, { dateMs: 3 * day }]),
      { count: 2, firstTime: 0, largestGapMs: 3 * day, lastTime: 3 * day },
    );
  });

  it("states an empty curve as zero rows, never a fabricated span", () => {
    assert.deepEqual(treasuryCurveFacts([]), {
      count: 0,
      firstTime: null,
      largestGapMs: 0,
      lastTime: null,
    });
  });

  it("treasuryGapTouching sees the hole that STRADDLES a span's edge — the shape filtering rows could not (#364 round 15, finding 1)", () => {
    // Rows end at day 100 and resume at day 150; a span starting at day
    // 133 (the --days-60-plus-lead shape) is touched by that gap even
    // though the gap's left anchor sits outside the span — filtering
    // rows to the span first deleted that anchor and measured ~nothing.
    const gaps = [{ endMs: 150 * day, startMs: 100 * day }];
    assert.deepEqual(
      treasuryGapTouching(gaps, 133 * day, 200 * day),
      gaps[0],
    );
    // A span the gap never reaches stays untouched, and no gaps at all
    // is never a touch.
    assert.equal(treasuryGapTouching(gaps, 160 * day, 200 * day), undefined);
    assert.equal(treasuryGapTouching(undefined, 0, 200 * day), undefined);
  });

  // #364 round 20, finding 1: the zero-row chunk law splits by POSITION.
  // Round 19 put the "provider coverage is shallower than the constant"
  // remedy on the store-head pre-flight — a branch guarded by a store
  // that LOADED, which the deepening runbook's own delete-store step
  // guarantees never runs: with the store gone, the refetch's first
  // chunk throws before a single row is stored. So the chunk refusal
  // itself distinguishes the requested start (coverage — name the
  // constant and the re-probe remedy; deleting the store cannot clear
  // it) from an interior chunk (a genuine hole), and both branches
  // execute here rather than riding as source pins.
  it("treasuryChunkRefusal names coverage at the requested start, a hole in the interior, and stays silent on healthy or sub-week chunks (#364 round 20, finding 1)", () => {
    const year = 365 * day;
    const interior = treasuryChunkRefusal({
      chunkRows: 0,
      fromMs: TREASURY_FETCH_START_MS + 2 * year,
      parserRefusals: 0,
      windowToMs: TREASURY_FETCH_START_MS + 3 * year,
    });
    assert.ok(interior, "an interior zero-row year must refuse");
    assert.match(interior, /a holed curve is refused, never merged and pinned/);
    assert.doesNotMatch(interior, /TREASURY_FETCH_START_MS/);
    // #364 round 21, finding 1: each branch carries its must-stay-red
    // token — the driver's --warm-only tolerance re-throws on both, so
    // a deterministic refusal can never ride the transport warn path.
    assert.match(interior, /^treasuryChunkHole: /);
    assert.doesNotMatch(interior, /treasuryCoverageRefused/);
    const atStart = treasuryChunkRefusal({
      chunkRows: 0,
      fromMs: TREASURY_FETCH_START_MS,
      parserRefusals: 0,
      windowToMs: TREASURY_FETCH_START_MS + year,
    });
    assert.ok(atStart, "a zero-row chunk at the requested start must refuse");
    assert.match(atStart, /^treasuryCoverageRefused: /);
    assert.doesNotMatch(atStart, /treasuryChunkHole/);
    assert.match(atStart, /starts at the requested fetch start/);
    assert.match(atStart, /coverage, not a hole/);
    assert.match(
      atStart,
      /re-probe the endpoint's earliest served date and move TREASURY_FETCH_START_MS with the recorded evidence/,
    );
    assert.doesNotMatch(atStart, /holed curve/);
    // Rows present, or a sub-week window (top-ups, the truncated final
    // chunk — legitimately empty over a weekend): no refusal.
    assert.equal(
      treasuryChunkRefusal({
        chunkRows: 1,
        fromMs: TREASURY_FETCH_START_MS,
        parserRefusals: 0,
        windowToMs: TREASURY_FETCH_START_MS + year,
      }),
      null,
    );
    assert.equal(
      treasuryChunkRefusal({
        chunkRows: 0,
        fromMs: TREASURY_FETCH_START_MS + 2 * year,
        parserRefusals: 0,
        windowToMs: TREASURY_FETCH_START_MS + 2 * year + 3 * day,
      }),
      null,
    );
  });

  it("treasuryChunkRefusal carries the chunk's parser-refusal count on both branches (#364 round 14, finding 2)", () => {
    // Refused rows are deterministic on refetch — without the count,
    // "the provider serves nothing" is unverifiable from the message
    // alone, and the coverage branch would steer an operator into
    // moving the constant on false evidence.
    const year = 365 * day;
    for (const fromMs of [
      TREASURY_FETCH_START_MS,
      TREASURY_FETCH_START_MS + 2 * year,
    ]) {
      const refusal = treasuryChunkRefusal({
        chunkRows: 0,
        fromMs,
        parserRefusals: 3,
        windowToMs: fromMs + year,
      });
      assert.ok(refusal);
      assert.match(
        refusal,
        /3 provider rows in this chunk were refused by the parser/,
      );
    }
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
    // Scoped to the FETCH body (#364 round 13): the no-warn-continue law
    // is about the join — a warned-over chunk would pin a hole as the
    // anchor day's truth. The load SITE's warm-only tolerance is a
    // different law (the survey must not die on this endpoint), pinned
    // separately below.
    const fetchStart = script.indexOf("async function fetchTreasuryRates");
    const fetchEnd = script.indexOf("async function", fetchStart + 1);
    assert.ok(fetchStart >= 0 && fetchEnd > fetchStart);
    assert.doesNotMatch(
      script.slice(fetchStart, fetchEnd),
      /console\.warn/,
      "a failed Treasury chunk must stop the run, never hole the join",
    );
    // #364 round 2, finding 1 (split round 20, finding 1): the claim
    // carries evidence. A 200 with an empty or unparseable body over a
    // week-or-wider window throws via the shared chunk predicate —
    // whose interior-hole and coverage-at-the-requested-start branches
    // are EXECUTED in the treasuryCurveFacts suite; this pin holds the
    // driver's side: every chunk runs the law, wired with the chunk's
    // OWN parser-refusal count so "the provider served nothing" stays
    // distinguishable from "we refused what it served". The driver
    // refuses an empty or stale-tailed curve before simulating; and the
    // manifest carries the curve's facts for the door to assert.
    assert.match(
      script.slice(fetchStart, fetchEnd),
      /const refusal = treasuryChunkRefusal\(\{\s*\n\s*chunkRows,\s*\n\s*fromMs: from,\s*\n\s*parserRefusals: treasuryParserRefusals - parserRefusalsBefore,/,
      "the fetch must run the shared zero-row chunk law on every chunk",
    );
    assert.match(script, /Treasury curve is empty/);
    assert.match(script, /more than 7 days stale/);
    // #364 round 17, finding 2: the manifest records the fetch start
    // this corpus was REQUESTED under, so the door's leading-edge check
    // judges archived corpora by their own request, not the current
    // build's constant.
    assert.match(
      script,
      /treasuryCurve: \{\s*\n\s*\.\.\.treasuryCurveFacts\(treasuryRates\),\s*\n\s*requestedStartMs: TREASURY_FETCH_START_MS,/,
    );
    // #364 round 13, finding 1 (scoped rounds 14-15): the STORED
    // curve's continuity is asserted at pre-flight from its facts —
    // the chunk guard fires only on the run that fetches and only on
    // zero rows, and the rolling store never revisits a pinned
    // interior — via the SAME overlap predicate as the door, over
    // whole-store gap positions (filtering rows first deletes the left
    // anchor of a hole straddling the window's edge), against the
    // requested --days window.
    assert.match(
      script,
      /\) touching the requested \$\{args\.days\}-day window/,
    );
    assert.match(
      script,
      /const holeTouching = treasuryGapTouching\(\s*\n?\s*treasuryCurveFacts\(treasuryRates\)\.gapsOverWeekMs,/,
      "the driver measures gaps over the WHOLE store and tests overlap",
    );
    assert.match(
      readFileSync("scripts/sweepStats.ts", "utf8"),
      /treasuryGapTouching\(/,
      "the door runs the same predicate — one mechanism for one law",
    );
    // #364 round 13, finding 3: fetchFull requests from the SHARED
    // constant the door's leading-edge tolerance derives from.
    assert.match(
      script,
      /fetchTreasuryRates\(TREASURY_FETCH_START_MS\)/,
      "the driver and the door must share one requested start",
    );
    // #364 round 13, smaller + round 14, finding 1: the survey path
    // tolerates a Treasury PROVIDER failure, but the tolerance is
    // scoped by CAUSE — store-integrity refusals re-throw so the
    // top-up script's must-stay-red conditions can go red (both of its
    // branches run only on a nonzero exit). #364 round 21, finding 1:
    // the round-20 chunk refusals join the must-stay-red set — both
    // are deterministic (a constant deeper than provider coverage, a
    // zero-row week inside served coverage), so swallowing them would
    // leave the nightly survey green while the store never warms and
    // every night re-attempts the full multi-decade fetch.
    assert.match(
      script,
      /\/cacheStoreUnreadable\|cacheClockMismatch\|treasuryCoverageRefused\|treasuryChunkHole\/\s*\n?\s*\.test\(message\)/,
      "store-integrity AND deterministic chunk refusals must re-throw under --warm-only",
    );
    assert.match(
      script,
      /bar survey continues without it/,
      "--warm-only must survive a Treasury PROVIDER outage",
    );
    // #364 round 14, finding 2: the fetch counts parser-refused rows so
    // a hole refusal can distinguish "provider served nothing" from
    // "we refused what it served".
    assert.match(script, /treasuryParserRefusals \+= 1;/);
    // #364 round 18, finding 2: an existing store never deepens on its
    // own, so the pre-flight refuses a store head later than this
    // build's requested start — which is also what keeps the manifested
    // requestedStartMs an honest term rather than a build artifact.
    assert.match(
      script,
      /headRow\.dateMs > TREASURY_FETCH_START_MS \+ 7 \* 86_400_000/,
      "the store-head refusal keeps requestedStartMs true by construction",
    );
  });

  // #364 round 9, finding 1: the density pre-flight binds only the
  // corpus path. Its PLACEMENT is the law — above the thin-symbol skip
  // or outside the warm-only guard it kills the nightly launchd top-up
  // and the R0 rebuild mid-roster, on floors those runs' outputs are
  // never measured against — so the order and the guard are pinned as
  // source shapes, like the rest of this driver's wiring.
  it("asserts density only for manifested symbols on sweep runs — never under --warm-only, never on thin symbols", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    const thinSkip = script.indexOf("primaryBars.length < WARMUP_BARS * 2");
    const densityCall = script.indexOf("assertFiveMinuteDensity(`preflight:");
    assert.ok(thinSkip >= 0, "the thin-symbol skip must exist");
    assert.ok(
      densityCall > thinSkip,
      "density asserts BELOW the thin-symbol skip — a symbol that never " +
        "reaches the manifest is never judged by the door's floors",
    );
    assert.match(
      script,
      /if \(!args\.warmOnly\) \{\s*\n\s*try \{\s*\n\s*assertFiveMinuteDensity\(`preflight:/,
      "the assertion sits inside the !warmOnly guard — the top-up and " +
        "the rebuild produce no corpus and must survey, not die",
    );
    assert.match(
      script,
      /Full-roster density survey/,
      "a sweep refusal names the survey instrument",
    );
    // #364 round 10: the survey line prints for EVERY symbol — an empty
    // 5-minute store prints "0 rows" (the survey is the only layer that
    // can surface a total feed loss), and the shared-window counts are
    // computed from the raw arrays and carried to both the pre-flight
    // assertion and the manifest.
    assert.match(
      script,
      /`density 5min \$\{series\["5min"\]\.count\} rows`/,
      "an empty 5-minute store still prints its survey line",
    );
    // #364 round 11, finding 3: the print's POSITION is load-bearing
    // too — the thin-symbol exemption is justified by "its store still
    // shows in the survey line above", and both docs promise the
    // nightly log is a full-roster survey, so the print must stay
    // ABOVE the thin-symbol skip.
    const printIdx = script.indexOf("density 5min");
    assert.ok(
      printIdx >= 0 && printIdx < thinSkip,
      "the survey line prints ABOVE the thin-symbol skip — thin " +
        "symbols belong to the full-roster survey even though the " +
        "floors never judge them",
    );
    assert.match(
      script,
      /const crossSeriesDensity = crossSeriesDensityFacts\(\s*\n?\s*fiveMinuteBars,\s*\n?\s*primaryBars,?\s*\n?\s*\)/,
      "the shared-window counts come from the raw arrays the driver holds",
    );
    assert.match(
      script,
      /crossSeriesDensity,\s*\n\s*series,\s*\n\s*symbol,/,
      "the pre-flight assertion receives the shared-window fact",
    );
    assert.match(
      script,
      /crossSeriesClock: registration,\s*\n\s*crossSeriesDensity,/,
      "the manifest symbol entry carries the shared-window fact",
    );
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

  // #364 rounds 14 and 18: unresolv (the resolver's defect bucket) and
  // dataAbsent (R1b's no-bars data fact — pre-R1b these decisions
  // landed in planRejected) BOTH leave both sides of the survival
  // arithmetic — counting either as a survivor biases survival up and
  // the amendment-25 gate under-flags. Executed against a synthetic
  // table, since source pins cannot run arithmetic — and against TWO
  // split rows (#364 round 20, finding 3): a real table carries one
  // row per (symbol, split), so this fixture takes the cross-split
  // rollup branch, which summed a hand-maintained key list nothing
  // executed (single-row fixtures never entered the merge) until it
  // was rewritten to iterate the parsed row's own keys. Totals:
  // decisions 100, pre-geometry blocks 30, unresolv 8, dataAbsent 12
  // → reached 50; kills 45 → survival 10% and STARVED. Every column
  // the survival arithmetic or the printout consumes carries a
  // NONZERO second-split value, so freezing it at the first split's
  // value moves the printed totals and fails the match; belowConf and
  // setups are the two no printed figure consumes (#364 round 21,
  // smaller — their freeze is unobservable to this regex and made
  // impossible by the own-keys mechanism instead).
  it("the audit's survival excludes unresolv AND dataAbsent from both sides, summed across splits — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-"));
    const log = join(dir, "sweep.log");
    writeFileSync(
      log,
      [
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        // Each split row is a table a real run could emit: setups =
        // decisions − Σ rejections and dataAbsent ⊆ setups (#364
        // round 19, smaller) hold per row (train 50−43=7 with 6 ⊆ 7,
        // test 50−44=6 with 6 ⊆ 6).
        "EURUSD baseline train 50 5 3 1 2 4 22 3 1 2 6 7",
        "EURUSD baseline test 50 3 4 3 3 2 18 5 3 3 6 6",
        "",
      ].join("\n"),
    );
    // --no-install fails fast instead of reaching the network if the
    // local tsx bin is missing; the timeout turns a resolution stall
    // into a failure rather than a suite hang (#364 round 15, smaller).
    const out = execFileSync(
      "npx",
      ["--no-install", "tsx", "scripts/starvation-audit.ts", log, "--report"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    assert.match(out, /EURUSD\s+100\s+50\s+40\s+5\s+10%\s+STARVED/);
  });

  // #364 round 19, finding 1: the capture-all refusal is a GUARD, not
  // advice — the driver stamps "# capture-all" above such a table
  // (acceptance gates untallied, belowConf/belowPayoff print 0, so
  // survival computed from it is a false green on a gate that exits 1)
  // and the audit refuses the marker like a missing required column.
  it("the audit refuses a capture-all table by its stamped marker — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-ca-"));
    const log = join(dir, "sweep.log");
    writeFileSync(
      log,
      [
        "# capture-all — acceptance gates untallied; starvation-audit " +
        "refuses this table",
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        "EURUSD baseline test 100 10 10 0 5 5 40 10 0 0 10 20",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/starvation-audit.ts",
            log,
            "--report",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /--capture-all table/.test(String((error as { stderr?: string }).stderr ?? "")),
    );
    // The driver's stamp exists at source, so the marker the audit
    // trusts is one the sweep actually writes.
    assert.match(
      readFileSync("scripts/replay-sweep.ts", "utf8"),
      /# capture-all — acceptance gates untallied/,
    );
  });

  // #364 round 20, finding 2: parse() returning zero rows used to fall
  // through to "0 of 0 markets flagged" and exit 0 — the amendment-25
  // gate reporting a clean pass having measured nothing. Both reachable
  // shapes execute here: a survey log (--warm-only and --discover print
  // the driver's full header and no data rows — the nightly launchd
  // log's exact shape) and a --grid table with no baseline variant
  // (parse keeps baseline rows only). --report is passed to prove this
  // is a refusal, not a verdict: it cannot be acknowledged away.
  it("the audit refuses a table it parsed zero rows from — executed (header-only and grid-only)", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-zero-"));
    const header =
      "symbol variant split decisions sessionBlk newsBlk notWarm " +
      "regimeBlk noConsensus planRejected unresolv belowConf " +
      "belowPayoff dataAbsent setups";
    const headerOnly = join(dir, "warm-only.log");
    writeFileSync(headerOnly, [header, ""].join("\n"));
    const gridOnly = join(dir, "grid.log");
    writeFileSync(
      gridOnly,
      [
        header,
        "EURUSD tp1AtrMultiplier=0.5 test 100 10 10 0 5 5 40 10 0 5 10 15",
        "",
      ].join("\n"),
    );
    for (const log of [headerOnly, gridOnly]) {
      assert.throws(
        () =>
          execFileSync(
            "npx",
            [
              "--no-install",
              "tsx",
              "scripts/starvation-audit.ts",
              log,
              "--report",
            ],
            { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
          ),
        (error: unknown) =>
          /parsed zero baseline rows/.test(
            String((error as { stderr?: string }).stderr ?? ""),
          ),
        `${log} must refuse rather than report 0 of 0 markets flagged`,
      );
    }
    // #364 round 21, finding 2: the refusal is per FILE, not per
    // invocation — a zero-row shard log refuses BY NAME even when a
    // healthy table rides beside it (the dead-shard shape: checked on
    // the flattened result, its markets simply vanished from the
    // roster and the gate returned a verdict over a partial roster).
    const realTable = join(dir, "real.log");
    writeFileSync(
      realTable,
      [
        header,
        "EURUSD baseline test 100 10 10 0 5 5 40 10 0 5 10 15",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/starvation-audit.ts",
            realTable,
            headerOnly,
            "--report",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /warm-only\.log: parsed zero baseline rows/.test(
          String((error as { stderr?: string }).stderr ?? ""),
        ),
      "a zero-row file must refuse even beside a healthy table",
    );
  });

  // #364 round 21, smaller: an absent optional column reads 0, which
  // means "unknown", not "none" — summing a pre-R1b table (no
  // notWarm/unresolv/dataAbsent columns) with a post-R1b one
  // subtracts less than the runs produced and biases survival UP, the
  // round-18 direction. Headers that disagree on an optional name
  // refuse rather than blend.
  it("the audit refuses to blend tables whose headers disagree on optional columns — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-mixed-"));
    const oldLog = join(dir, "pre-r1b.log");
    writeFileSync(
      oldLog,
      [
        "symbol variant split decisions sessionBlk newsBlk regimeBlk " +
        "noConsensus planRejected belowConf belowPayoff setups",
        "EURUSD baseline test 100 10 10 5 5 40 0 5 25",
        "",
      ].join("\n"),
    );
    const newLog = join(dir, "post-r1b.log");
    writeFileSync(
      newLog,
      [
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        "EURUSD baseline test 100 10 10 0 5 5 40 10 0 5 10 15",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/starvation-audit.ts",
            oldLog,
            newLog,
            "--report",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /audited separately, never blended/.test(
          String((error as { stderr?: string }).stderr ?? ""),
        ),
    );
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
