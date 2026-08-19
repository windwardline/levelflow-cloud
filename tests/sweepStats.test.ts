import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  sha256Hex,
  stableStringify,
  TREASURY_FETCH_START_MS,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  addOutcome,
  assertManifestedCorpus,
  assertManifestedCorpusStreaming,
  clusteredStandardError,
  emptyStats,
  expectancy,
  fiveMinuteFloorFor,
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

  it("reads only manifested corpora, streamed — the 2i door applies to reports too", () => {
    // #364 round 26, finding 1 (count corrected round 27, finding 3):
    // the non-streaming door returns one array holding every parsed
    // row of the file, and R1b grows every emit by the no-bars
    // decisions that previously emitted nothing. This reader
    // accumulates per symbol in one pass, so it streams with no rows
    // array at all; geometry-evidence — the FOURTH corpus reader,
    // which round 26's "one reader left" premise missed — streams
    // with a projection that spreads vocabularyRow first (round 6's
    // law), then exactly the evidence fields its questions read.
    assert.match(source, /assertManifestedCorpusStreaming\(/);
    assert.doesNotMatch(source, /assertManifestedCorpus\(/);
    const evidence = readFileSync("scripts/geometry-evidence.ts", "utf8");
    assert.match(evidence, /assertManifestedCorpusStreaming\(/);
    assert.doesNotMatch(evidence, /assertManifestedCorpus\(/);
    assert.match(
      evidence,
      /\.\.\.vocabularyRow\(raw\),/,
      "the 4b reader's projection must spread the vocabulary first",
    );
  });

  // #364 round 28, finding 1: the evidence half of the 4b projection
  // was a hand-enumerated list against a hand-written type — and it had
  // already dropped two declared fields (sessionLabel, tp1Hit), which a
  // future question would have read as undefined on every row with the
  // suite green. The projection now derives from EVIDENCE_ROW_KEYS;
  // this test holds the type and the list in lockstep, both read from
  // source since the type is erased at runtime.
  it("every field EvidenceRow declares survives the 4b projection", () => {
    const evidence = readFileSync("scripts/geometry-evidence.ts", "utf8");
    const typeBlock = evidence.match(
      /export type EvidenceRow = SweepEmitRow & \{([\s\S]*?)\};/,
    );
    assert.ok(typeBlock, "EvidenceRow must be declared literally");
    // Reach (#364 round 29, smaller): \??: covers optional AND required
    // declarations in the type's own literal block. Out of reach by
    // construction: fields living only in SweepEmitRow's index
    // signature — those ride the projection solely via
    // VOCABULARY_ROW_KEYS, so a question needing one must first declare
    // it on EvidenceRow, which brings it under this pin.
    const declared = [...typeBlock![1].matchAll(/^\s*(\w+)\??:/gm)]
      .map((m) => m[1]);
    const listBlock = evidence.match(
      /const EVIDENCE_ROW_KEYS = \[([\s\S]*?)\] as const;/,
    );
    assert.ok(listBlock, "EVIDENCE_ROW_KEYS must be declared literally");
    const listed = [...listBlock![1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    assert.ok(
      declared.length >= 13,
      "EvidenceRow must declare the evidence fields",
    );
    for (const key of declared) {
      assert.ok(
        listed.includes(key),
        `EvidenceRow declares ${key} but EVIDENCE_ROW_KEYS does not carry it`,
      );
    }
    assert.match(
      evidence,
      /for \(const key of EVIDENCE_ROW_KEYS\)/,
      "the projection derives from the list, never a parallel enumeration",
    );
  });

  // #364 round 24, finding 3: round 7 made sweep-analysis state its own
  // denominator; this reader took the partition (round 5) but not the
  // statement — `kept` counted every row handed to the vocabulary, so
  // the headline a ruling is quoted from included the data-absence rows
  // every table below held out, and rollup.dataAbsent was accumulated
  // but printed nowhere.
  it("states its own denominator — data-absence leaves the headline and is surfaced per market and per rollup", () => {
    assert.match(
      source,
      /corpus: \$\{kept - dataAbsentTotal\} market-evidence rows/,
      "the headline must subtract the vocabulary's held-out rows",
    );
    assert.match(
      source,
      /data-absence rows held out of every denominator: \$\{dataAbsentTotal\}/,
      "the held-out volume must print on its own line",
    );
    assert.match(
      source,
      /String\(stats\.dataAbsent\)\.padStart\(8\)/,
      "each market line must carry its dataAbs column",
    );
    assert.match(
      source,
      /\$\{rollup\.dataAbsent\} dataAbs/,
      "the category rollup must state its held-out volume",
    );
  });

  // #364 round 25, finding 1: a market whose corpus rows are ALL
  // data-absence rows enters bySymbol with filled 0 — R1b emits those
  // rows (pre-R1b they landed in planRejected and the market hit NOT IN
  // CORPUS) — and the reader's non-null expectancy assertion crashed
  // the whole E8 report on exactly the sparse floorless markets its
  // inclusion decisions turn on. Executed (the reader had only source
  // pins): the report must survive, subtract the held-out rows from its
  // headline, and print the all-marked market with E "—" and its
  // dataAbs volume — with no verdict fabricated from a null.
  it("survives a market whose rows are all data-absence rows — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "acct-report-"));
    const emitPath = join(dir, "run.jsonl");
    const rows = [
      { outcome: "take_profit", realizedR: 1.5, symbol: "EURUSD" },
      { outcome: "stop_loss", realizedR: -1, symbol: "EURUSD" },
      {
        noBarsInReviewWindow: true,
        outcome: "unfilled",
        realizedR: null,
        symbol: "GBPUSD",
      },
      {
        noBarsInReviewWindow: true,
        outcome: "unfilled",
        realizedR: null,
        symbol: "GBPUSD",
      },
      {
        noBarsInReviewWindow: true,
        outcome: "unfilled",
        realizedR: null,
        symbol: "GBPUSD",
      },
      // #364 round 27, finding 2: a held-out market WAS swept — it must
      // print as HELD OUT with its row volume stated, never as "NOT IN
      // CORPUS (never swept)" in the coverage-gap tally.
      { holdout: true, outcome: "take_profit", realizedR: 1, symbol: "USDJPY" },
      { holdout: true, outcome: "stop_loss", realizedR: -1, symbol: "USDJPY" },
      // #364 round 29, finding 2: a NON-baseline holdout row must not
      // count — the holdout volume is baseline-only, like every other
      // figure this report prints.
      {
        holdout: true,
        outcome: "take_profit",
        realizedR: 1,
        symbol: "USDJPY",
        variant: "wide",
      },
      // #364 round 30, finding 2: a market EVERY one of whose rows
      // fails the report's own payoff gate (rewardRisk 0.5 < every
      // class's minRewardRisk) must print as ALL ROWS GATED, never as
      // "NOT IN CORPUS (never swept)" in the coverage-gap tally.
      {
        outcome: "take_profit",
        realizedR: 1,
        rewardRisk: 0.5,
        symbol: "AUDUSD",
      },
      {
        outcome: "stop_loss",
        realizedR: -1,
        rewardRisk: 0.5,
        symbol: "AUDUSD",
      },
      // #364 round 34, finding 3: a THIN negative market — three filled
      // losses of low dispersion (mean −1.0, se ≈ 0.058, σ ≈ 17) clears
      // the σ≥2 test with a sample too small to have seen the tails.
      // Below --min-filled the EXCLUDE verdict is withheld: the row
      // prints with the withhold named, and the EXCLUSION CANDIDATES
      // block the E8 decisions read stays empty.
      { outcome: "stop_loss", realizedR: -1.0, symbol: "USDCAD" },
      { outcome: "stop_loss", realizedR: -1.1, symbol: "USDCAD" },
      { outcome: "stop_loss", realizedR: -0.9, symbol: "USDCAD" },
      // #364 round 35, smaller: a thin negative market whose σ is BELOW
      // 2 (mean −0.025, se ≈ 0.075, σ ≈ 0.33) must not read "within
      // noise" — an untrustworthy σ is untrustworthy in both
      // directions, so below the floor it gets no verdict either way.
      { outcome: "stop_loss", realizedR: -0.1, symbol: "GBPJPY" },
      { outcome: "take_profit", realizedR: 0.05, symbol: "GBPJPY" },
      // #364 round 36, finding 2: a SINGLE-member category (only
      // XAUUSD carries rows in metals) — clusteredStandardError needs
      // two filled markets, so the rollup line must STATE the missing
      // clustered s.e. and carry the THIN floor marker rather than
      // print a bare, unqualified category expectancy.
      { outcome: "take_profit", realizedR: 1.0, symbol: "XAUUSD" },
      { outcome: "stop_loss", realizedR: -1.0, symbol: "XAUUSD" },
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
      symbols: [
        {
          calibration: {},
          providerSymbol: "EURUSD",
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: "EURUSD",
        },
        {
          calibration: {},
          providerSymbol: "GBPUSD",
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: "GBPUSD",
        },
        {
          calibration: {},
          providerSymbol: "USDJPY",
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: "USDJPY",
        },
        {
          calibration: {},
          providerSymbol: "AUDUSD",
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: "AUDUSD",
        },
        {
          calibration: {},
          providerSymbol: "USDCAD",
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: "USDCAD",
        },
        {
          calibration: {},
          providerSymbol: "GBPJPY",
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: "GBPJPY",
        },
        {
          calibration: {},
          providerSymbol: "XAUUSD",
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: "XAUUSD",
        },
      ],
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
    const out = execFileSync(
      "npx",
      ["--no-install", "tsx", "scripts/account-type-report.ts", emitPath],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    assert.match(out, /corpus: 9 market-evidence rows/);
    assert.match(out, /data-absence rows held out of every denominator: 3/);
    // The all-marked market's line: filled 0, dataAbs 3, E "—", ±"—".
    assert.match(out, / 3\s+— ±—/);
    // #364 round 34, finding 3: USDCAD's three low-dispersion losses
    // clear σ≥2, but below --min-filled (default 300) the EXCLUDE
    // verdict is withheld — the flag names the withhold and nothing
    // joins the candidates list.
    assert.match(
      out,
      /THIN <- exclude withheld \(thin sample below --min-filled\)/,
    );
    // #364 round 35, finding 2: the decision block states its own
    // terms — the "none" line names the floor it judged at, and the
    // withheld share prints beside it with its markets, so a clean
    // block over a corpus holding a withheld negative market can no
    // longer read "no market is negative beyond noise".
    assert.match(
      out,
      /none — no market is negative at 2\+ s\.e\. with 300\+ filled/,
    );
    assert.match(
      out,
      /withheld below --min-filled \(\d+ negative at 2\+ s\.e\. on thin samples — no verdict either way\):/,
    );
    assert.match(
      out,
      /USDCAD: E=-1\.000 ±0\.058 over 3 filled \(< 300\) — withheld/,
    );
    // #364 round 35, smaller: GBPJPY is negative with σ < 2 AND thin —
    // it must not receive the reassuring "within noise" label.
    assert.match(out, /negative on a thin sample — no verdict either way/);
    assert.doesNotMatch(out, /negative but within noise/);
    // #364 round 36, finding 2: the category rollup carries the same
    // floor as its market rows — the currency category's 7 filled
    // (EURUSD 2 + USDCAD 3 + GBPJPY 2) are under 300 — and the
    // single-member metals category STATES its missing clustered s.e.
    // instead of printing a bare unqualified E.
    assert.match(out, /THIN \(7 < 300 filled\)/);
    assert.match(
      out,
      /±— \(fewer than two filled markets — no clustered s\.e\.\).*THIN \(2 < 300 filled\)/,
    );
    // #364 round 37, finding 3: the clustered s.e. states its OWN
    // sample — the currency category's roster membership far exceeds
    // its three filled clusters (EURUSD, USDCAD, GBPJPY; GBPUSD is
    // all-marked at filled 0 and USDJPY held out), and k is what
    // bounds the estimate, so it prints beside the term.
    assert.match(out, /clustered over 3 filled markets/);
    // #364 round 27, finding 2: the held-out market prints as policy,
    // with its volume stated — never as a coverage gap. Round 29,
    // finding 2: the volume is BASELINE-only (the fixture's wide-variant
    // holdout row must not move it) and the line states its scope.
    assert.match(out, /holdout markets excluded: 2 rows — baseline variant/);
    assert.match(out, /HELD OUT \(3e confirmation set\)/);
    // #364 round 30, finding 2: the fully-gated market prints as the
    // reader's own doing — swept, gated by the current calibration —
    // never as a coverage gap.
    assert.match(out, /ALL ROWS GATED \(2 rows below payoff/);
    assert.match(out, /fully gated by payoff\+regime under the CURRENT calibration/);
    // At a floor USDCAD's sample clears, the same market DOES verdict —
    // the withhold is the floor's doing, not the σ test's — and the
    // value "2" rides argv as --min-filled's own token, never a corpus
    // path (#364 round 34, smaller: the walker replaced the bare-number
    // pattern-match).
    const floored = execFileSync(
      "npx",
      [
        "--no-install",
        "tsx",
        "scripts/account-type-report.ts",
        emitPath,
        "--min-filled",
        "2",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    assert.match(floored, /over 3 filled — exclude/);
    assert.doesNotMatch(floored, /none — no market is negative/);
    // Nothing is withheld at a floor the sample clears, so the block
    // carries no withheld section either.
    assert.doesNotMatch(floored, /withheld below --min-filled \(/);
    // "--min-filled 1e2" is the walker's proving case: Number("1e2") is
    // 100 but the old bare-number regex rejected it, so it reached the
    // streaming door as a corpus path and the report died on ENOENT.
    // Under the walker the run succeeds with floor 100 and USDCAD (3
    // filled) is withheld again.
    const scientific = execFileSync(
      "npx",
      [
        "--no-install",
        "tsx",
        "scripts/account-type-report.ts",
        emitPath,
        "--min-filled",
        "1e2",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    assert.match(
      scientific,
      /THIN <- exclude withheld \(thin sample below --min-filled\)/,
    );
    assert.match(
      scientific,
      /none — no market is negative at 2\+ s\.e\. with 100\+ filled/,
    );
    // #364 round 35, finding 1: the walker gives --min-filled ownership
    // of the next token unconditionally, so num() must REFUSE a token
    // it cannot parse — the silent fallback used the default floor AND
    // dropped the eaten corpus file from the report, a partial corpus
    // with no diagnosis (the pattern-match the walker replaced could
    // not eat a filename, so the hole was the walker's own).
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/account-type-report.ts",
            "--min-filled",
            emitPath,
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /--min-filled owns the token after it and cannot read ".*run\.jsonl" as a number/
          .test(String((error as { stderr?: string }).stderr ?? "")),
      "a flag typed without its number must refuse, never eat a corpus path",
    );
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

  // #364 round 28, finding 2: the streaming door's try wrapped the
  // READER callback, so any reader defect was reported as "line N
  // failed to parse — a holed corpus is refused" — a re-sweep remedy
  // that cannot clear a code bug, with the real stack discarded — and
  // rounds 26-27 moved two readers' entire per-row logic behind it.
  // The try now wraps only the parse; a reader defect surfaces as
  // itself.
  it("propagates a reader defect from the streaming callback as itself — never as a holed corpus", async () => {
    await assert.rejects(
      () =>
        assertManifestedCorpusStreaming(writeCorpus(), () => {
          throw new Error("reader defect: not a parse problem");
        }),
      /reader defect: not a parse problem/,
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

  it("refuses two stores that share no time window — shape poison on every read path, sub-week spans included", () => {
    // A 5-minute series covering a period its own primary never touches
    // cannot be one symbol's feed at two resolutions. Binds like the
    // clock witnesses, before any evidence-block reasoning.
    const disjoint = (spanDays: number, counts: [number, number]) => ({
      "15min": {
        clock: { verdict: "indeterminate" },
        count: counts[0],
        firstTime: 0,
        largestGapMs: 0,
        lastTime: spanDays * DAY,
        spanDays,
      },
      "5min": {
        clock: { verdict: "indeterminate" },
        count: counts[1],
        firstTime: 20 * DAY,
        largestGapMs: 0,
        lastTime: (20 + spanDays) * DAY,
        spanDays,
      },
    });
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: disjoint(10, [960, 2_880]),
          symbol: "BTCUSD",
        })),
      /BTCUSD 5-minute and 15-minute series share no time window/,
    );
    // Sub-week spans do not excuse disjointness (#364 round 12,
    // smaller): the check sits above the sub-week silence, so this
    // refuses as shape poison rather than falling through to the
    // missing-evidence refusal and its wrong "re-sweep" diagnosis.
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: disjoint(2, [192, 400]),
          symbol: "BTCUSD",
        })),
      /BTCUSD 5-minute and 15-minute series share no time window/,
    );
  });

  it("floors bind only deliberate class attributions — the forex fallback confers none (#364 round 12, findings 1 and 3)", () => {
    // Explicit-list resolutions carry their class floor; WTI resolves
    // energies, whose measurement IS CLUSD's probe (symbols.ts maps WTI
    // to CLUSD), while the roster name CLUSD is futures — floorless,
    // ratio-judged. A roster pair carries the forex floor by currency
    // shape; a futures-shaped name missing from every class list falls
    // through getAssetType to forex and must get NO floor — the class
    // list is incomplete, not the series defective — and a 6-char name
    // whose halves are not currencies gets none either.
    assert.equal(fiveMinuteFloorFor("BTCUSD"), 260);
    assert.equal(fiveMinuteFloorFor("EURUSD"), 150);
    assert.equal(fiveMinuteFloorFor("XAUUSD"), 140);
    assert.equal(fiveMinuteFloorFor("WTI"), 140);
    assert.equal(fiveMinuteFloorFor("ASX"), 34);
    assert.equal(fiveMinuteFloorFor("CLUSD"), undefined);
    assert.equal(fiveMinuteFloorFor("ESUSD"), undefined);
    assert.equal(fiveMinuteFloorFor("XC"), undefined);
    assert.equal(fiveMinuteFloorFor("ZWUSD"), undefined);
    assert.equal(fiveMinuteFloorFor("EMDUSD"), undefined);
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
    // #364 round 14, finding 2: with manifested gap POSITIONS the hole
    // check is corpus-relative like its neighbours — a hole years
    // outside the corpus span (fixture corpus sits at the 1970 epoch,
    // the gap in 2015) admits even though largestGapMs alone would have
    // refused above, and a hole touching the span refuses with its
    // dates named.
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      series: { "15min": facts(960, 10) },
      symbol: "EURUSD",
      treasuryCurve: {
        count: 3_000,
        firstTime: Date.UTC(2013, 0, 2),
        gapsOverWeekMs: [{
          endMs: Date.UTC(2015, 3, 1),
          startMs: Date.UTC(2015, 0, 1),
        }],
        largestGapMs: 90 * 86_400_000,
        lastTime: Date.UTC(2027, 0, 1),
      },
    }));
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: { "15min": facts(960, 10) },
          symbol: "EURUSD",
          treasuryCurve: {
            count: 3_000,
            firstTime: Date.UTC(2013, 0, 2),
            gapsOverWeekMs: [{
              endMs: 20 * 86_400_000,
              startMs: 2 * 86_400_000,
            }],
            largestGapMs: 90 * 86_400_000,
            lastTime: Date.UTC(2027, 0, 1),
          },
        })),
      /18-day interior hole \(1970-01-03\.\.1970-01-21\) inside the corpus span.*investigate those rows, not the store/s,
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
    // #364 round 13, finding 3: the tolerance is the driver's REQUESTED
    // start plus a week, from the shared constant — probed 2026-08-19
    // (provider coverage reaches at least 2005). Against a corpus
    // DEEPER than the requested start, a curve six days past the start
    // is inside the tolerance and admits at any corpus depth; eight
    // days past it is a shallow rebuild and refuses, with the
    // provider-coverage-moved remedy in the message.
    const deeperThanRequested = Date.UTC(2012, 0, 2);
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      series: { "15min": modern15min(deeperThanRequested) },
      symbol: "EURUSD",
      treasuryCurve: {
        ...shallowCurve,
        firstTime: TREASURY_FETCH_START_MS + 6 * 86_400_000,
      },
    }));
    assert.throws(
      () =>
        assertManifestedCorpus(writeCorpus({
          conditions: goodConditions,
          series: { "15min": modern15min(deeperThanRequested) },
          symbol: "EURUSD",
          treasuryCurve: {
            ...shallowCurve,
            firstTime: TREASURY_FETCH_START_MS + 8 * 86_400_000,
          },
        })),
      /shallow rebuilt store.*re-probe its earliest served date/s,
    );
    // #364 round 17, finding 2: the RECORDED request wins over the
    // build constant. A corpus requested at a 2020 start whose curve
    // reaches exactly that start admits against any corpus depth, even
    // though the current build's 2013 constant would call it a shallow
    // rebuild — deepening the constant later must never retroactively
    // condemn an archived corpus that was as deep as it was asked to
    // be.
    assertManifestedCorpus(writeCorpus({
      conditions: goodConditions,
      series: { "15min": modern15min(deeperThanRequested) },
      symbol: "EURUSD",
      treasuryCurve: {
        ...shallowCurve,
        firstTime: Date.UTC(2020, 0, 2),
        requestedStartMs: Date.UTC(2020, 0, 1),
      },
    }));
  });

  it("binds the density door on deliberate historical reads, while conditions and ABSENT curve evidence stay exempt (#364 rounds 2 and 16)", () => {
    // The stated asymmetry, executed: the superseded-clock override
    // accepts superseded measurement TERMS — an absent conditions block
    // and absent curve facts, the pre-R1b population TODAY by
    // scheduling (the R0 rebuild has produced no corpus; the one
    // re-sweep is R3's), and after any future clock bump, whatever
    // corpora genuinely predate the facts — but never poisoned DATA: a
    // density violation refuses the historical read exactly as the
    // clock witnesses beside it would, and PRESENT curve evidence gets
    // its integrity asserted on every read path (round 16 — the
    // evidence-presence gate is what keeps post-R1b corpora's poison
    // checks alive once a clock bump makes them historical reads).
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
      // Round 16, finding 1: the same historical read WITH curve facts
      // showing a corpus-touching hole refuses — present evidence
      // saying the curve was holed is poison, not a superseded term,
      // and unlike an absent curve it scored non-zero stale macro
      // adjustments no per-row field can reveal.
      assert.throws(
        () =>
          assertManifestedCorpus(writeCorpus({
            clock: superseded,
            series: { "15min": facts(960, 10) },
            symbol: "EURUSD",
            treasuryCurve: {
              count: 3_000,
              firstTime: Date.UTC(2013, 0, 2),
              gapsOverWeekMs: [{
                endMs: 20 * 86_400_000,
                startMs: 2 * 86_400_000,
              }],
              largestGapMs: 18 * 86_400_000,
              lastTime: Date.UTC(2027, 0, 1),
            },
          })),
        /interior hole.*inside the corpus span/s,
      );
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
