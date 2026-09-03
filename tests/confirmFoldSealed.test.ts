import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { after, describe, it } from "node:test";
import { promisify } from "node:util";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { SEALED_FOLD } from "../scripts/sweepStats.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
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

/**
 * THE CONFIRM FOLD IS SEALED — proven by execution, reader by reader.
 *
 * R4 act 1 (2026-09-02). The held-back fold's one authorized read is
 * grid-totalr's gradeCorpus under --confirm-final (and confirm-4d, which
 * calls it that way), recorded in the LA-6 ledger. Every other reader must
 * be blind to that fold: its output may not change when the confirm rows'
 * outcomes change. That is a fact about what each PROCESS prints, so this
 * test runs each one rather than reading its source.
 *
 * The population is derived — anything that opens the corpus door — and
 * the argument table below must cover it exactly: a reader without an
 * entry fails here, and so does an entry without a reader.
 *
 * Three fixture corpora share every row, every count, every decision-time
 * field, and differ ONLY in the confirm rows' outcome-bearing fields:
 *   A  — a realistic mix of outcomes and signs;
 *   B  — every confirm row a +9R full win;
 *   C  — every confirm row unfilled (fill counts differ from A too, so a
 *        reader that pooled confirm FILLS would show it).
 * Data-absent rows are held constant because their count is a printable
 * denominator, not an outcome. A is run twice; the lines that differ
 * between those two runs (timestamps, durations) form the volatility
 * mask, and the lines that differ between A and B, or A and C, must lie
 * inside it — on stdout, on stderr, and in every artifact written.
 *
 * Residue, stated: the confirm fold's row COUNT and data-absent count are
 * visible (readers state what they withheld); that is not an outcome.
 *
 * THE LEDGERED READ, IN THE FIXTURE (R4 act 2). The two purpose-confirm
 * readers — roster-expectancy-audit and cost-sensitivity-verdict — take a
 * `--ledgered-read <path>` and print the shipped cell's confirm figures
 * from that artifact, verbatim. Every fixture directory carries ONE such
 * artifact, `ledgered-read.json`, built at fixture time from the contract
 * (`artifactHashOf`, the pre-registered rules) with CONSTANT figures that
 * are not derived from the fixture's rows, and carrying the fixture
 * manifests' hashes in `shardHashes`. The four fixtures share those hashes
 * — `buildSweepManifest` hashes the manifest payload, never the emit bytes,
 * and A, B and C differ only in confirm-row outcomes — so one artifact
 * matches all four and the printed figures are constant across them BY
 * CONSTRUCTION. That is not a leak: the ledger vouches for the figure, this
 * guard vouches for the reader — that nothing it prints moves with the fold
 * it reads through the door. The with-flag runs live in EXTRA_RUNS beside
 * the without-flag ones, and the fixture test below checks the four
 * artifacts are the same bytes rather than assuming it.
 */

const execFileAsync = promisify(execFile);
const REPO = process.cwd();
const TSX = join(REPO, "node_modules/.bin/tsx");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const EMBARGO = 5 * DAY;
const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2025, 0, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 8, 1);
const ANCHOR = "2026-08-26";

// The door, in its three forms (mirrors tests/emptyCorpusRefusals.test.ts
// and the door's own derived scan in tests/sweepStats.test.ts) — OR a raw
// line read, so a reader that bypasses the door is still in the population
// and must still be blind to the fold.
const DOOR = /assertManifest(?:edCorpus(?:Streaming|Sync)?)?\(|createInterface\(|readLinesSync\(|JSON\.parse\(line\)/;
const DEFINES_THE_DOOR = "sweepStats.ts";

type Row = Record<string, unknown>;
type Shape = "A" | "B" | "C";

// Two correlated pairs (EURUSD/GBPUSD, BTCUSD/ETHUSD) so the correlation
// collapse has groups to collapse in every bucket — without them its run is
// vacuous and could not show a leak.
const SYMBOLS: Array<{ symbol: string; price: number }> = [
  { symbol: "EURUSD", price: 1.1 },
  { symbol: "GBPUSD", price: 1.27 },
  { symbol: "BTCUSD", price: 60_000 },
  { symbol: "ETHUSD", price: 3_000 },
  { symbol: "NGUSD", price: 3.0 },
  { symbol: "ZCUSX", price: 450 },
  { symbol: "LEUSX", price: 180 },
];
// The empty grid cell is the baseline every positional reader looks for by
// name; the one grid variant is what every table names. The two readers
// bound to the recorded 4d picks (roster-expectancy-audit, market-dossier)
// run from the fixture directory, which carries its own picks files, so
// nothing here depends on the tracked, invalidated 4d-era artifacts.
const BASELINE = "baseline";
const VARIANT = "runnerProtection=hold";
const VARIANTS = [BASELINE, VARIANT];
const SPLITS = ["fit", "select", SEALED_FOLD];
const ROWS_PER_CELL = 40;
const OUTCOME_CYCLE = [
  "take_profit",
  "stop_loss",
  "tp1_partial",
  "unfilled",
  "take_profit",
  "stop_loss",
  "tp1_partial",
  "take_profit",
];
const R_OF: Record<string, number> = {
  data_absent: 0,
  stop_loss: -1,
  take_profit: 1.05,
  tp1_partial: 0.35,
  unfilled: 0,
};

function splitStart(split: string): number {
  return split === "fit" ? FIT_START : split === "select" ? SELECT_START : CONFIRM_START;
}

function legsFor(outcome: string, entry: number, tp1: number, target: number, stop: number, time: number): Row[] {
  if (outcome === "unfilled" || outcome === "data_absent") return [];
  const filled = time + 15 * 60_000;
  const exitPrice = outcome === "take_profit" ? target : outcome === "stop_loss" ? stop : tp1;
  const legs: Row[] = [{ leg: "entry", price: entry, time: filled }];
  if (outcome !== "stop_loss") legs.push({ leg: "tp1", price: tp1, time: filled + 2 * HOUR });
  legs.push({ kind: outcome === "tp1_partial" ? "tp1_lock" : outcome, leg: "exit", price: exitPrice, time: filled + 4 * HOUR });
  return legs;
}

/** One decision row, every column a real emit carries, deterministic in its coordinates. */
function decisionRow(symbol: string, price: number, variant: string, split: string, index: number): Row {
  const time = splitStart(split) + index * 6 * HOUR;
  // The outcome cycle is offset per symbol, so two correlated symbols in the
  // same bucket carry DIFFERENT outcomes: a paired within-group statistic
  // over identical members is zero whatever the rows hold, and that made the
  // collapse instrument's run vacuous in the first version of this guard.
  const offset = SYMBOLS.findIndex((entry) => entry.symbol === symbol);
  const outcome = index < 2 ? "data_absent" : OUTCOME_CYCLE[(index + offset) % OUTCOME_CYCLE.length];
  const accepted = index >= 2 && index < 8 ? false : true;
  const risk = price * 0.005;
  const entry = price * (1 + ((index % 7) - 3) * 0.0004);
  const stop = entry - risk;
  const tp1 = entry + 0.35 * risk;
  const target = entry + 1.5 * risk;
  return withOutcome({
    accepted,
    atr: risk * 0.3,
    availableTimeframeCount: 5,
    confidenceScore: 55 + (index % 30),
    cotPercentile: null,
    cotSampleSize: 38,
    cotStance: "unavailable",
    dailyAtr: risk * 4,
    dailyTailCompleteAtMs: time - DAY,
    dailyVisibleCount: 500 + index,
    entryPrice: entry,
    entryProvenance: "trend_offset",
    estimatedCommission: risk * 0.02,
    estimatedRoundTripCost: risk * 0.06,
    estimatedSlippage: risk * 0.01,
    estimatedSpread: risk * 0.02,
    executionScore: 40 + (index % 50),
    frameTailMs: {},
    grossEntryPrice: entry,
    grossRewardRisk: 1.6,
    grossTp1Price: tp1,
    holdout: false,
    ladderRewardRisk: 0.94,
    latestClose: entry * 1.0003,
    macroAdjustment: 0,
    macroStance: "unavailable",
    nearestStructureDistance: risk * 0.05,
    newsActiveCount: 0,
    newsPenalty: 0,
    newsUpcomingCount: 0,
    nextHighImpactMs: null,
    regime: ["trend", "range", "transition"][index % 3],
    resolutionIntervalMs: 300_000,
    rewardRisk: 1.5,
    riskDistance: risk,
    runnerNearestBeyondMinimum: risk * 1.6,
    runnerProtection: variant === BASELINE ? "trail_tp1" : "hold",
    runnerProvenance: "structural_level",
    sessionLabel: "Normal session",
    sessionPenalty: 0,
    side: "buy",
    split,
    stopLoss: stop,
    stopPivotDistance: risk * 0.45,
    stopProvenance: "pivot",
    symbol,
    takeProfit: target,
    takeProfit1: tp1,
    tenYearChangeBps: null,
    tenYearYield: null,
    time,
    tp1Provenance: "risk_share",
    treasuryLabelMs: null,
    trendStrength: 1.2 + (index % 5) * 0.1,
    twoYearYield: null,
    variant,
    volatilityPercentile: (index % 20) / 20,
    votes: [{ d: "buy", n: "multi_timeframe_bias", s: 28 }],
  }, outcome, { entry, stop, target, time, tp1 });
}

/** The outcome-bearing fields, and only those, for a given outcome. */
function withOutcome(
  row: Row,
  outcome: string,
  geometry: { entry: number; stop: number; target: number; time: number; tp1: number },
  realizedR: number = R_OF[outcome],
): Row {
  const filled = outcome !== "unfilled" && outcome !== "data_absent";
  const risk = geometry.entry - geometry.stop;
  const legs = legsFor(outcome, geometry.entry, geometry.tp1, geometry.target, geometry.stop, geometry.time);
  const exitLeg = legs.find((leg) => leg.leg === "exit");
  return {
    ...row,
    exitAtMs: exitLeg ? (exitLeg.time as number) : null,
    filledAtMs: filled ? geometry.time + 15 * 60_000 : null,
    forgoneRunnerR: filled && outcome !== "stop_loss" ? 0.05 : 0,
    grossExitPrice: exitLeg ? (exitLeg.price as number) : null,
    grossOutcome: outcome,
    grossRealizedR: filled ? Number((realizedR + 0.02).toFixed(4)) : realizedR,
    legs,
    maxAdverseMove: filled ? risk * (outcome === "stop_loss" ? 1 : 0.3) : 0,
    maxFavorableMove: filled ? risk * (outcome === "take_profit" ? 1.5 : outcome === "tp1_partial" ? 0.5 : 0.2) : 0,
    outcome,
    realizedR,
    tp1Hit: outcome === "take_profit" || outcome === "tp1_partial",
    // Set by the emitter on the unfilled path only — outcome-conditioned,
    // so it must move with the outcome here or a reader of it on confirm
    // rows would be invisible to this guard (review finding, 2026-09-02).
    unfilledApproachDistance: filled ? null : risk * 0.2,
  };
}

function rowsFor(shape: Shape): Row[] {
  const rows: Row[] = [];
  for (const { symbol, price } of SYMBOLS) {
    for (const variant of VARIANTS) {
      for (const split of SPLITS) {
        for (let index = 0; index < ROWS_PER_CELL; index += 1) {
          const row = decisionRow(symbol, price, variant, split, index);
          if (split !== SEALED_FOLD || shape === "A" || row.outcome === "data_absent") {
            rows.push(row);
            continue;
          }
          const geometry = {
            entry: row.entryPrice as number,
            stop: row.stopLoss as number,
            target: row.takeProfit as number,
            time: row.time as number,
            tp1: row.takeProfit1 as number,
          };
          rows.push(
            shape === "B"
              ? withOutcome(row, "take_profit", geometry, 9)
              : withOutcome(row, "unfilled", geometry, 0),
          );
        }
      }
    }
  }
  return rows;
}

const TREASURY = {
  count: 3_000,
  firstTime: Date.UTC(2013, 0, 2),
  largestGapMs: 4 * DAY,
  lastTime: Date.UTC(2027, 0, 1),
};

function writeCorpus(
  dir: string,
  name: string,
  rows: Row[],
  captureAll: boolean,
  allRows: Row[],
): { manifestHash: string; path: string } {
  const emitPath = join(dir, name);
  writeFileSync(emitPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const manifest = buildSweepManifest({
    acceptance: { captureAll, ignoreLowEdge: false },
    analyzerVersion: "2026.09.02.sealed-guard",
    anchor: ANCHOR,
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
    // One decision cell per (symbol, variant, split): every decision point
    // emitted a row in the capture-all arm; the gated arm emitted the
    // accepted ones. The reconciliation checks row counts against this.
    decisions: SYMBOLS.flatMap(({ symbol }) =>
      VARIANTS.flatMap((variant) =>
        SPLITS.map((split) => ({
          decisionPoints: ROWS_PER_CELL,
          emitted: rows.filter((row) => row.symbol === symbol && row.variant === variant && row.split === split).length,
          rejections: {
            belowConfidence: 0,
            belowPayoff: 0,
            newsBlocked: 0,
            noConsensus: 0,
            notWarm: 0,
            planRejected: 0,
            regimeBlocked: 0,
            regimeGated: 0,
            sessionBlocked: 0,
            unresolvable: 0,
          },
          split,
          symbol,
          variant,
        }))
      )
    ),
    emitColumns: Object.keys(rows[0]).sort(),
    folds: [
      { decisionEndMs: SELECT_START - EMBARGO, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - EMBARGO, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - EMBARGO, endMs: END, name: SEALED_FOLD, startMs: CONFIRM_START },
    ],
    generatedAt: "2026-09-02T20:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    // The roster the sweep was ASKED for — every symbol here survived, so it
    // equals `symbols`. The held-out helper (R4 act 2, deliverable 4) draws
    // its set from this field and refuses a manifest without it.
    requestedSymbols: SYMBOLS.map(({ symbol }) => symbol),
    stepBars: 16,
    symbols: SYMBOLS.map(({ symbol }) => ({
      calibration: {},
      providerSymbol: symbol,
      series: {
        "15min": seriesFacts(
          allRows.filter((row) => row.symbol === symbol).map((row) => ({ time: Number(row.time) })),
          "intraday",
        ),
      },
      symbol,
    })),
    trainShare: 0.6,
    treasuryCurve: TREASURY,
    warmupBars: 240,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return { manifestHash: manifest.manifestHash, path: emitPath };
}

/**
 * The fixture's ledgered read: CONSTANT figures per market, chosen here and
 * never derived from the fixture's rows, under the contract's own hash and
 * pre-registered rules. Every consumer that prints from it prints the same
 * thing on A, A′, B and C by construction (see the header).
 */
function ledgeredReadFor(shardHashes: string[], emitSha256: Record<string, string>): LedgeredReadArtifact {
  const figure = (n: number, expectancy: number, halfWidth: number): Figure => ({
    n,
    expectancy,
    lower: expectancy - halfWidth,
    upper: expectancy + halfWidth,
  });
  const markets: LedgeredReadArtifact["markets"] = {};
  SYMBOLS.forEach(({ symbol }, index) => {
    const heldBack = index % 2 === 0;
    const select = {
      gross: figure(60, 0.03 - index * 0.02, 0.01),
      net: figure(60, 0.01 - index * 0.02, 0.01),
    };
    const confirmNet = figure(40, 0.04 - index * 0.03, 0.02);
    markets[symbol] = {
      accepted: [],
      heldOut: index === 1,
      shipped: {
        confirm: { gross: figure(40, 0.06 - index * 0.03, 0.02), net: confirmNet },
        declineCandidate: declineCandidateOf(select),
        m3: m3Of(confirmNet, heldBack),
        provenance: {
          derived: false,
          heldBack,
          known: true,
          overlapWithConfirmDays: heldBack ? 0 : 30,
          selectionWindow: null,
          tranche: null,
        },
        select,
        variant: BASELINE,
      },
    };
  });
  const base: Omit<LedgeredReadArtifact, "artifactHash"> = {
    analyzerVersion: "2026.09.02.sealed-guard",
    anchor: ANCHOR,
    baselineVariant: BASELINE,
    calendarHash: createHash("sha256").update("sealed-guard-calendar").digest("hex"),
    corpusId: createHash("sha256").update("sealed-guard-corpus").digest("hex"),
    emitSha256,
    foldSource: "emitted",
    holdout: { markets: ["GBPUSD"], rule: "stratified-per-class-20pct" },
    includeHoldout: true,
    ledgerPath: "docs/research/confirm-reads/confirm-log-sealed-guard.jsonl",
    markets,
    readAt: "2026-08-30T12:00:00.000Z",
    readId: "sealed-guard-read",
    rules: { accept: ACCEPT_RULE, admissibility: ADMISSIBILITY_RULE, decline: DECLINE_RULE, declineHash: DECLINE_RULE_HASH },
    shardHashes,
    symbolFilter: null,
    symbolsRead: SYMBOLS.map(({ symbol }) => symbol),
    verdictUnit: "market",
  };
  return { ...base, artifactHash: artifactHashOf(base) };
}

type Fixture = {
  captureAll: string;
  dir: string;
  gated: string;
  hashes: string[];
  ledgeredRead: string;
  out: string;
  sizes: string[];
};

function fixture(shape: Shape, label: string): Fixture {
  const dir = mkdtempSync(join(tmpdir(), `sealed-${label}-`));
  const rows = rowsFor(shape);
  const { manifestHash, path: captureAll } = writeCorpus(dir, "capture-all.jsonl", rows, true, rows);
  const { manifestHash: gatedHash, path: gated } = writeCorpus(
    dir,
    "gated.jsonl",
    rows.filter((row) => row.accepted === true),
    false,
    rows,
  );
  // The ledgered read the two purpose-confirm readers open with
  // --ledgered-read: constant figures, both manifests' hashes in
  // shardHashes (see the header).
  const ledgeredRead = join(dir, "ledgered-read.json");
  const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(
    ledgeredRead,
    JSON.stringify(
      ledgeredReadFor([manifestHash, gatedHash], { [manifestHash]: digest(captureAll), [gatedHash]: digest(gated) }),
      null,
      2,
    ) + "\n",
  );
  const out = join(dir, "out");
  mkdirSync(out);
  // A candidate file for the sizing pass: one accepted variant per market,
  // hand-written so the pass does not depend on another reader's run.
  writeFileSync(
    join(dir, "candidates.json"),
    JSON.stringify({
      baselineVariant: BASELINE,
      markets: Object.fromEntries(
        SYMBOLS.map(({ symbol }) => [symbol, { accepted: [{ variant: VARIANT }] }]),
      ),
    }),
  );
  // The recorded-read artifacts the two picks-bound readers consult, in
  // the fixture's own tree: every market owns a derived cell (a recorded
  // confirm read above zero). market-dossier reads each at the grid
  // variant; the audit (R4 act 2) names the shipped cell from the
  // manifest's grid — this fixture's grid is [{}, {runnerProtection:
  // "hold"}], the R3 shape, so every market is read at the EMPTY cell and
  // the derived map is an annotation beside it, never a row filter.
  const picksDir = join(dir, "docs/research/baseline-2026-08-10");
  mkdirSync(picksDir, { recursive: true });
  for (const cycle of ["4d", "4d-holdout", "4d-totality"]) {
    const derived = cycle === "4d"
      ? Object.fromEntries(SYMBOLS.map(({ symbol }) => [symbol, { feasibleLines: [], variant: VARIANT }]))
      : {};
    const confirmed = cycle === "4d"
      ? Object.fromEntries(SYMBOLS.map(({ symbol }) => [symbol, { confirmTotalDelta: 0.4 }]))
      : {};
    writeFileSync(join(picksDir, `${cycle}-final-picks.json`), JSON.stringify({ finalPicks: derived }));
    writeFileSync(join(picksDir, `${cycle}-confirm-read.json`), JSON.stringify({ confirmReport: confirmed }));
  }
  const files = [captureAll, gated];
  return {
    captureAll,
    dir,
    gated,
    hashes: [
      ...files.map((file) => createHash("sha256").update(readFileSync(file)).digest("hex")),
      // The ledgered read's own hash binds the emit digests and so differs per fixture: masked like a corpus hash.
      (JSON.parse(readFileSync(ledgeredRead, "utf8")) as { artifactHash: string }).artifactHash,
    ],
    ledgeredRead,
    out,
    sizes: files.map((file) => String(statSync(file).size)),
  };
}

/**
 * The per-reader argument table. Tokens: F the capture-all corpus, G its
 * gated twin, O the fixture's artifact directory, C the candidate file, L
 * the fixture's ledgered-read artifact.
 * Every reader runs from the repo root (some read tracked side inputs by
 * relative path) and every artifact writer is pointed at O.
 */
const READERS: Record<string, { args: string[]; cwd?: "fixture"; note?: string }> = {
  "account-type-report": { args: ["F", "--min-filled", "1"] },
  "ag-class-derivation": { args: ["F"] },
  "confidence-bands": { args: ["F"] },
  "cost-sensitivity-verdict": {
    args: ["--paired", "F", "--cells", `EURUSD|${BASELINE};ZCUSX|${VARIANT}`, "--out", "O/cost.json"],
  },
  "data-limits": { args: ["F"] },
  "derive-4d": { args: ["F", "--baseline", BASELINE, "--out", "O/candidates.json", "--permutations", "20"] },
  "e4-collapse": { args: ["F", "--bucket-minutes", "60", "--variant", BASELINE, "--min-groups", "1"] },
  "exclusion-suspects": { args: ["F"] },
  "feasibility-4d": {
    args: ["F", "--candidates", "C", "--out", "O/feasibility.json"],
    note: "reads confirm rows' PRICES by stated premise; no outcome field — this run proves it",
  },
  "geometry-evidence": { args: ["F"] },
  "grid-totalr": { args: ["F", "--permutations", "20"], note: "without --confirm-final: the sealed path" },
  "holdout-set": {
    args: ["M", "--out", "O/holdout.json"],
    note: "manifest-derived: pins the fixture's requested roster, identical across A/B/C by construction",
  },
  "market-dossier": { args: ["--net", "F", "--out", "O/dossier.json"], cwd: "fixture" },
  "roster-expectancy-audit": { args: ["F", "--out", "O/audit.json"], cwd: "fixture" },
  "stop-provenance": { args: ["F"] },
  "sweep-analysis": { args: ["--emit", "F"] },
  "threshold-rescue": { args: ["F", "--markets", `EURUSD|${BASELINE};ZCUSX|${VARIANT}`, "--out", "O/rescue.json"] },
  "tuning-folds-summary": { args: ["F"] },
  "two-arm-reconcile": { args: ["--gated", "G", "--capture-all", "F"] },
};

// A second argv for a reader whose sealed path has a second shape. The
// coverage check above is by reader NAME, so a second shape lives here.
// The two ledgered-read consumers run WITH the flag as well as without:
// their printed confirm figures come from the fixture's artifact, constant
// across A, A′, B and C by construction (header), and the guard proves the
// reader itself still moves with nothing on the fold.
const EXTRA_RUNS: Array<{ args: string[]; cwd?: "fixture"; label: string; reader: string }> = [
  {
    args: ["F", "--out", "O/audit.json", "--ledgered-read", "L"],
    cwd: "fixture",
    label: "roster-expectancy-audit --ledgered-read",
    reader: "roster-expectancy-audit",
  },
  {
    args: ["--paired", "F", "--cells", `EURUSD|${BASELINE};ZCUSX|${VARIANT}`, "--out", "O/cost.json", "--ledgered-read", "L"],
    label: "cost-sensitivity-verdict --ledgered-read",
    reader: "cost-sensitivity-verdict",
  },
];

// The one reader allowed to read the fold: the burner. Its ledger and its
// refusal to run twice are pinned by tests/confirmEarnsItsVerdict.test.ts
// and tests/acceptanceGate.test.ts; running it here would BE a confirm read.
const EXCLUDED: Record<string, string> = {
  "confirm-4d": "the burner — the authorized read, ledgered; running it here would be a confirm read",
};

// Comments stripped before any source scan, so prose about a door or the
// fold is never read as code (the driver's comment quoting `JSON.parse(line)`
// put it in the population once).
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function population(): string[] {
  return readdirSync(join(REPO, "scripts"))
    .filter((name) => name.endsWith(".ts") && name !== DEFINES_THE_DOOR)
    .filter((name) => DOOR.test(codeOf(readFileSync(join(REPO, "scripts", name), "utf8"))))
    .map((name) => name.replace(/\.ts$/, ""))
    .sort();
}

type Surface = { lines: string[]; name: string };

// Two masks, belt and braces: the empirical one (whatever differs between
// two runs of the same fixture) and a static one for the one volatile shape
// that can coincide across two runs by luck — two artifacts derived in the
// same millisecond carry the same `derivedAt`, and then a third run's
// timestamp reads as a leak. The static mask erases ONLY instants within a
// day of now: a corpus instant printed as ISO (a review found `max(exitAtMs)`
// slipping through a blanket ISO mask) stays visible, and nothing masks a
// bare number.
const ISO_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const NEAR_NOW_MS = DAY;

function mask(text: string, fixtures: Fixture[]): string {
  const now = Date.now();
  let masked = text.replace(ISO_INSTANT, (instant) =>
    Math.abs(Date.parse(instant) - now) < NEAR_NOW_MS ? "<now>" : instant
  );
  for (const entry of fixtures) {
    masked = masked.split(entry.dir).join("<dir>");
    for (const hash of entry.hashes) {
      masked = masked.split(hash).join("<sha256>");
      // Readers name a hash by its first twelve characters.
      masked = masked.split(hash.slice(0, 12)).join("<sha256:12>");
    }
    for (const size of entry.sizes) masked = masked.replace(new RegExp(`\\b${size}\\b`, "g"), "<bytes>");
  }
  return masked;
}

/** The fixture's inputs, by relative path: everything else on disk after a run is an artifact. */
function isInput(entry: Fixture, full: string): boolean {
  const rel = relative(entry.dir, full);
  return rel === "capture-all.jsonl" || rel === "capture-all.jsonl.manifest.json" ||
    rel === "gated.jsonl" || rel === "gated.jsonl.manifest.json" ||
    rel === "candidates.json" || rel === "ledgered-read.json" || rel.startsWith("docs/");
}

/**
 * Every file under the FIXTURE directory that is not an input — the run's own
 * artifact directory and anything a reader wrote beside the corpus (a
 * `<corpus>.something.json` sidecar would surface here too). Other runs'
 * artifact directories are excluded by name.
 */
function artifactSurfaces(entry: Fixture, out: string, fixtures: Fixture[]): Surface[] {
  const surfaces: Surface[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (dir === entry.out && full !== out) continue;
        walk(full);
      } else if (!isInput(entry, full)) {
        surfaces.push({
          lines: mask(readFileSync(full, "utf8"), fixtures).split("\n"),
          name: `artifact:${relative(entry.dir, full)}`,
        });
      }
    }
  };
  walk(entry.dir);
  return surfaces;
}

async function run(
  label: string,
  reader: string,
  args: string[],
  entry: Fixture,
  all: Fixture[],
  cwd: "fixture" | undefined,
): Promise<Surface[]> {
  // Each run writes into its own directory, so the surfaces compared are
  // this reader's artifacts and nothing another reader wrote earlier.
  const out = join(entry.out, label.replace(/[^a-z0-9]+/gi, "_"));
  rmSync(out, { force: true, recursive: true });
  mkdirSync(out, { recursive: true });
  const argv = args.map((token) =>
    token === "F" ? entry.captureAll
    : token === "G" ? entry.gated
    : token === "C" ? join(entry.dir, "candidates.json")
    : token === "L" ? entry.ledgeredRead
    : token === "M" ? `${entry.captureAll}.manifest.json`
    : token.startsWith("O/") ? join(out, token.slice(2))
    : token
  );
  const result = await execFileAsync(TSX, ["--tsconfig", join(REPO, "tsconfig.json"), join(REPO, "scripts", `${reader}.ts`), ...argv], {
    cwd: cwd === "fixture" ? entry.dir : REPO,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180_000,
  }).catch((error: { code?: number | string; stderr?: string; stdout?: string; message: string }) => {
    throw new Error(
      `${reader} ${argv.join(" ")} did not exit 0 (${String(error.code)}) — a harness failure must ` +
        `not read as sealed.\nstdout:\n${error.stdout ?? ""}\nstderr:\n${error.stderr ?? error.message}`,
    );
  });
  assert.ok(
    (result.stdout + result.stderr).trim().length > 0,
    `${reader} printed nothing — a silent run proves nothing`,
  );
  return [
    { lines: mask(result.stdout, all).split("\n"), name: "stdout" },
    { lines: mask(result.stderr, all).split("\n"), name: "stderr" },
    ...artifactSurfaces(entry, out, all),
  ];
}

/** (surface, line) pairs that differ between two runs; a surface present in one only is wholly different. */
function differing(left: Surface[], right: Surface[]): Set<string> {
  const keys = new Set<string>();
  const byName = (list: Surface[]) => new Map(list.map((surface) => [surface.name, surface]));
  const l = byName(left);
  const r = byName(right);
  for (const name of new Set([...l.keys(), ...r.keys()])) {
    const a = l.get(name)?.lines ?? [];
    const b = r.get(name)?.lines ?? [];
    if (!l.has(name) || !r.has(name)) {
      keys.add(`${name}:<absent>`);
      continue;
    }
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      if (a[index] !== b[index]) keys.add(`${name}:${index}`);
    }
  }
  return keys;
}

function describeLeak(reader: string, shape: string, keys: string[], a: Surface[], other: Surface[]): string {
  const sample = keys.slice(0, 8).map((key) => {
    const [name, index] = key.split(/:(?=[^:]*$)/);
    const pick = (list: Surface[]) => list.find((surface) => surface.name === name)?.lines[Number(index)] ?? "<absent>";
    return `  ${key}\n    A: ${pick(a)}\n    ${shape}: ${pick(other)}`;
  });
  return `${reader}: ${keys.length} line(s) changed when only the confirm fold's outcomes changed (A vs ${shape}):\n${sample.join("\n")}`;
}

describe("the confirm fold is sealed: no reader's output moves with it", () => {
  const readers = population();
  const table = new Set(Object.keys(READERS));

  it("the argument table covers the derived population exactly", () => {
    const uncovered = readers.filter((reader) => !table.has(reader) && !(reader in EXCLUDED));
    const stale = [...table, ...Object.keys(EXCLUDED)].filter((reader) => !readers.includes(reader));
    assert.deepEqual(uncovered, [], `readers without an entry: ${uncovered.join(", ")}`);
    assert.deepEqual(stale, [], `entries without a reader: ${stale.join(", ")}`);
    assert.ok(readers.length >= 16, `population ${readers.length} — the door scan found too few readers`);
  });

  it("no reader outside the burner declares a flag or a door option that names the fold", () => {
    for (const reader of readers) {
      if (reader in EXCLUDED) continue;
      const source = codeOf(readFileSync(join(REPO, "scripts", `${reader}.ts`), "utf8"));
      // Either quote style: there is no `quotes` lint rule to lean on.
      const flags = [...source.matchAll(/["'](--[a-z0-9-]+)["']/g)].map((m) => m[1]);
      const confirmFlags = flags.filter((flag) => /confirm/.test(flag));
      const allowed = reader === "grid-totalr" ? ["--confirm-final", "--confirm-log-dir"] : [];
      assert.deepEqual(
        [...new Set(confirmFlags)].filter((flag) => !allowed.includes(flag)),
        [],
        `${reader} declares a confirm-naming flag`,
      );
      const mayOpen = reader === "grid-totalr" || reader === "feasibility-4d";
      if (!mayOpen) {
        // The door's option may appear only as the explicit seal. An aliased
        // value (`confirm: MODE`) or a typed gate object is how a reader
        // would open the fold without writing "read" beside "confirm" — a
        // review evasion (2026-09-02), refused here by shape.
        const options = [...source.matchAll(/\bconfirm\s*:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
        assert.deepEqual(
          options.filter((value) => value !== '"sealed"'),
          [],
          `${reader} passes a confirm option to the door that is not the explicit seal`,
        );
        assert.doesNotMatch(source, /\bFoldGate\b/, `${reader} handles the door's gate type`);
      }
      if (reader === "grid-totalr") {
        assert.match(source, /confirm:\s*options\.confirmFinal \? "read" : "sealed"/);
      }
      if (reader === "feasibility-4d") {
        assert.match(source, /confirm:\s*"read"/);
        for (
          const field of [
            "outcome", "grossOutcome", "realizedR", "grossRealizedR", "tp1Hit", "filledAtMs", "exitAtMs",
            "legs", "unfilledApproachDistance", "maxFavorableMove", "maxAdverseMove", "forgoneRunnerR",
          ]
        ) {
          assert.ok(!new RegExp(`\\.${field}\\b`).test(source), `feasibility-4d reads .${field}`);
        }
      }
    }
  });

  // Nothing a reader does during the guard may write into the repo's docs
  // tree, where every artifact writer's DEFAULT path lives. A filesystem
  // snapshot rather than `git status`, so this file does not join the set
  // of tests that need `.git` (tests/scratchClone.test.ts pins that set).
  const docsState = () => {
    const entries: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else entries.push(`${relative(REPO, full)} ${stat.size} ${stat.mtimeMs}`);
      }
    };
    walk(join(REPO, "docs"));
    return entries.join("\n");
  };
  const docsBefore = docsState();
  after(() => {
    assert.equal(docsState(), docsBefore, "a reader wrote into docs/ during the guard");
  });

  const fixtures = {
    a: fixture("A", "a"),
    a2: fixture("A", "a2"),
    b: fixture("B", "b"),
    c: fixture("C", "c"),
  };
  const all = Object.values(fixtures);
  // SEALED_GUARD_KEEP=1 keeps the fixtures on disk and names them, for
  // running a reader by hand against them.
  const cleanup = () => {
    if (process.env.SEALED_GUARD_KEEP === "1") {
      console.error(`sealed-guard fixtures kept: ${all.map((entry) => entry.dir).join(" ")}`);
      return;
    }
    for (const entry of all) rmSync(entry.dir, { force: true, recursive: true });
  };
  process.on("exit", cleanup);
  // A killed run (SIGTERM from a harness timeout, Ctrl-C) skips "exit"
  // handlers; clean up and leave with the signal's conventional code.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      cleanup();
      process.exit(signal === "SIGTERM" ? 143 : 130);
    });
  }

  it("fixtures A and A′ are byte-identical corpora, and B and C differ from A only in confirm rows", () => {
    assert.deepEqual(fixtures.a.hashes, fixtures.a2.hashes);
    // The ledgered read is the same bytes in every fixture — the construction
    // the header claims, checked rather than assumed. If it ever differs, a
    // with-flag run's constancy would be proving nothing about the reader.
    // …modulo the two fields that BIND it to its corpus's bytes (the emit
    // digests and, through them, the artifact's own hash): those differ by
    // construction between A and B/C, and the guard masks the hashes.
    const modulo = (path: string) => {
      const { artifactHash: _hash, emitSha256: _bytes, ...rest } = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      return rest;
    };
    const ledgered = modulo(fixtures.a.ledgeredRead);
    for (const [shape, other] of [["A′", fixtures.a2], ["B", fixtures.b], ["C", fixtures.c]] as const) {
      assert.deepEqual(modulo(other.ledgeredRead), ledgered, `${shape}'s ledgered read differs from A's`);
    }
    const parse = (path: string) => readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Row);
    const a = parse(fixtures.a.captureAll);
    for (const [shape, other] of [["B", fixtures.b], ["C", fixtures.c]] as const) {
      const rows = parse(other.captureAll);
      assert.equal(rows.length, a.length, `${shape} row count`);
      let confirmChanged = 0;
      rows.forEach((row, index) => {
        const base = a[index];
        if (row.split !== SEALED_FOLD) {
          assert.deepEqual(row, base, `${shape} tuning row ${index} differs`);
          return;
        }
        if (JSON.stringify(row) !== JSON.stringify(base)) confirmChanged += 1;
        for (const field of ["accepted", "symbol", "variant", "time", "entryPrice", "riskDistance", "confidenceScore", "stopProvenance"]) {
          assert.deepEqual(row[field], base[field], `${shape} confirm row ${index} changed decision-time field ${field}`);
        }
      });
      assert.ok(confirmChanged > 0, `${shape} changed no confirm row`);
    }
  });

  const runs: Array<{ args: string[]; cwd?: "fixture"; label: string; reader: string }> = [
    ...Object.entries(READERS).map(([reader, { args, cwd }]) => ({ args, cwd, label: reader, reader })),
    ...EXTRA_RUNS,
  ];
  for (const { args, cwd, label, reader } of runs) {
    it(`${label} prints and writes the same thing whatever the confirm fold holds`, async () => {
      const [a, a2, b, c] = await Promise.all([
        run(label, reader, args, fixtures.a, all, cwd),
        run(label, reader, args, fixtures.a2, all, cwd),
        run(label, reader, args, fixtures.b, all, cwd),
        run(label, reader, args, fixtures.c, all, cwd),
      ]);
      const volatile = differing(a, a2);
      for (const [shape, other] of [["B", b], ["C", c]] as const) {
        const moved = [...differing(a, other)].filter((key) => !volatile.has(key));
        assert.deepEqual(moved, [], describeLeak(label, shape, moved, a, other));
      }
    });
  }
});
