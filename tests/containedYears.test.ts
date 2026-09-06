import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import { containedYears, formatContainedYears, SEALED_FOLD } from "../scripts/contained-years.ts";

/**
 * The money split the feed-window round needs, as a tracked number: per
 * class and tuning fold, fills and net R in the years the witness names
 * against the years it does not. The year map comes from the manifest's
 * feedCharacter or from the tracked witness table — never from this reader.
 * Every figure below is hand-computed; the confirm fold is sealed.
 */

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "contained-years.ts");
const HOUR = 3_600_000;
const FIT_START = Date.UTC(2017, 0, 1);
const SELECT_START = Date.UTC(2020, 0, 1);
const CONFIRM_START = Date.UTC(2023, 0, 1);
const END = Date.UTC(2026, 8, 1);

type Row = Record<string, unknown>;

function row(input: { realizedR: number; split: string; symbol: string; time: number; variant?: string; gross?: number; accepted?: boolean }): Row {
  const outcome = input.realizedR > 0 ? "take_profit" : input.realizedR === 0 ? "unfilled" : "stop_loss";
  return {
    accepted: input.accepted ?? true,
    grossOutcome: outcome,
    grossRealizedR: input.gross ?? input.realizedR,
    holdout: false,
    outcome,
    realizedR: input.realizedR,
    split: input.split,
    symbol: input.symbol,
    time: input.time,
    variant: input.variant ?? "baseline",
  };
}

/**
 * EURUSD: fit rows in 2017 (clean) and 2018 (escaping); select rows in 2020 (clean)
 * and 2021 (escaping). GBPUSD and NZDCHF make forex a class of three so the
 * stratified rule holds NZDCHF out. XAUUSD is metals, all clean.
 *
 *   EURUSD fit 2017: +1, +1, −1  → 3 fills, +1.0     (contained)
 *   EURUSD fit 2018: +2, −1      → 2 fills, +1.0     (escaping)
 *   EURUSD select 2020: +0.5, −1 → 2 fills, −0.5     (contained)
 *   EURUSD select 2021: +2, +2   → 2 fills, +4.0     (escaping)
 *   GBPUSD select 2020: +1        → 1 fill, +1.0      (contained)
 *   XAUUSD fit 2017: −1, select 2020: +0.8            (contained)
 */
function fixtureRows(): Row[] {
  const t = (y: number, m: number, i: number) => Date.UTC(y, m, 1) + i * HOUR;
  const rows: Row[] = [
    row({ realizedR: 1, split: "fit", symbol: "EURUSD", time: t(2017, 2, 0) }),
    row({ realizedR: 1, split: "fit", symbol: "EURUSD", time: t(2017, 5, 1) }),
    row({ realizedR: -1, split: "fit", symbol: "EURUSD", time: t(2017, 8, 2) }),
    row({ realizedR: 2, split: "fit", symbol: "EURUSD", time: t(2018, 2, 3) }),
    row({ realizedR: -1, split: "fit", symbol: "EURUSD", time: t(2018, 6, 4) }),
    row({ realizedR: 0.5, split: "select", symbol: "EURUSD", time: t(2020, 3, 5) }),
    row({ realizedR: -1, split: "select", symbol: "EURUSD", time: t(2020, 7, 6) }),
    row({ realizedR: 2, split: "select", symbol: "EURUSD", time: t(2021, 1, 7) }),
    row({ realizedR: 2, split: "select", symbol: "EURUSD", time: t(2021, 9, 8) }),
    row({ realizedR: 0, split: "select", symbol: "EURUSD", time: t(2021, 10, 9) }),
    row({ accepted: false, realizedR: -1, split: "select", symbol: "EURUSD", time: t(2021, 10, 10) }),
    row({ realizedR: 3, split: "select", symbol: "EURUSD", time: t(2021, 10, 11), variant: "runnerProtection=hold" }),
    row({ realizedR: 1, split: "select", symbol: "GBPUSD", time: t(2020, 4, 12) }),
    row({ realizedR: 1, split: "select", symbol: "NZDCHF", time: t(2020, 4, 13) }),
    row({ realizedR: -1, split: "fit", symbol: "XAUUSD", time: t(2017, 4, 14) }),
    row({ realizedR: 0.8, split: "select", symbol: "XAUUSD", time: t(2020, 4, 15) }),
  ];
  for (let i = 0; i < 10; i += 1) rows.push(row({ realizedR: 5, split: SEALED_FOLD, symbol: "EURUSD", time: t(2024, 2, i) }));
  return rows;
}

function writeCorpus(rows: Row[], feedCharacter?: Record<string, number[]>): string {
  const dir = mkdtempSync(join(tmpdir(), "contained-years-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(emitPath, rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const symbols = [...new Set(rows.map((entry) => String(entry.symbol)))];
  const manifest = buildSweepManifest({
    acceptance: { captureAll: true, ignoreLowEdge: false },
    analyzerVersion: "2026.09.06.test",
    anchor: "2026-08-26",
    barRejections: {},
    clock: { calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK },
    conditions: { availableTimeframeCount: "min-four-by-construction", macroAdjustment: "historical-treasury-curve", providerWarningCount: "zero-by-construction", spreadSource: "modeled-by-construction", weightAdjustment: "raw-engine-zero" },
    days: 7000,
    emitColumns: Object.keys(rows[0]).sort(),
    folds: [
      { decisionEndMs: SELECT_START - 5 * 86_400_000, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - 5 * 86_400_000, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - 5 * 86_400_000, endMs: END, name: SEALED_FOLD, startMs: CONFIRM_START },
    ],
    generatedAt: "2026-09-06T02:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    grossCostScale: 0,
    holdoutSymbols: ["GBPUSD"],
    modeledCostScale: 1,
    requestedSymbols: symbols,
    source: { dirty: false, revision: "46d45450000000000000000000000000000000000" },
    stepBars: 16,
    symbols: symbols.map((symbol) => ({
      calibration: {},
      providerSymbol: symbol,
      series: { "15min": seriesFacts(rows.filter((entry) => entry.symbol === symbol).map((entry) => ({ time: Number(entry.time) })), "intraday") },
      symbol,
      ...(feedCharacter && {
        feedCharacter: {
          "5min": { baseline: { barRangeRatio: 0.05, rangeRatio: 1 }, escapeYears: feedCharacter[symbol] ?? [], judgedDays: 100, verdict: (feedCharacter[symbol] ?? []).length ? "escapes" : "contained", years: {} },
        },
      }),
    })),
    trainShare: 0.6,
    treasuryCurve: { count: 3_000, firstTime: Date.UTC(2013, 0, 2), largestGapMs: 4 * 86_400_000, lastTime: Date.UTC(2027, 0, 1) },
    warmupBars: 240,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return emitPath;
}

const NO_PIN_DIR = join(mkdtempSync(join(tmpdir(), "contained-years-pins-")), "none");
const YEAR_MAP = { EURUSD: [2018, 2021], GBPUSD: [], NZDCHF: [], XAUUSD: [] };

function read(paths: string[], overrides: Partial<Parameters<typeof containedYears>[0]> = {}) {
  return containedYears({ folds: ["fit", "select"], holdoutPinDir: NO_PIN_DIR, paths, variant: "baseline", ...overrides });
}

describe("the split, from the manifest's own year map", () => {
  it("counts fills and net R per class, fold and bucket, hand-computed, with the sealed fold withheld", async () => {
    const summary = await read([writeCorpus(fixtureRows(), YEAR_MAP)]);
    assert.equal(summary.yearMapSource, "manifest");
    assert.equal(summary.rows.sealed, 10);
    const cell = (k: string) => summary.cells.get(k)!;
    assert.equal(cell("forex|fit|contained").filled, 3);
    assert.equal(cell("forex|fit|contained").rSum, 1);
    assert.equal(cell("forex|fit|escaping").filled, 2);
    assert.equal(cell("forex|fit|escaping").rSum, 1);
    // Select: EURUSD 2020 (−0.5 over 2) + GBPUSD 2020 (+1) contained; EURUSD 2021 (+4 over 2) escaping; NZDCHF held out.
    assert.equal(cell("forex|select|contained").filled, 3);
    assert.equal(cell("forex|select|contained").rSum, 0.5);
    assert.equal(cell("forex|select|escaping").filled, 2);
    assert.equal(cell("forex|select|escaping").rSum, 4);
    assert.equal(cell("metals|fit|contained").rSum, -1);
    assert.equal(cell("metals|select|contained").rSum, 0.8);
    assert.equal(summary.cells.has("metals|select|escaping"), false);
    assert.equal(cell("pooled|select|contained").filled, 4);
    assert.equal(Number(cell("pooled|select|contained").rSum.toFixed(6)), 1.3);
    assert.equal(cell("pooled|select|escaping").rSum, 4);
    assert.equal(summary.rows.heldOut, 1);
    assert.equal(summary.rows.unfilled, 1);
    assert.equal(summary.rows.notAccepted, 1);
    assert.equal(summary.rows.otherVariants, 1);
  });

  it("refuses a corpus it cannot place: no manifest field and no witness table", async () => {
    await assert.rejects(read([writeCorpus(fixtureRows())]), /no year map/);
  });

  it("takes the tracked witness table for a corpus that predates the field, and refuses a symbol the table cannot place", async () => {
    const dir = mkdtempSync(join(tmpdir(), "contained-years-witness-"));
    const table = join(dir, "feed-character.txt");
    writeFileSync(table, "EURUSD 5min ESCAPES: 2018, 2021\nGBPUSD 5min contained\nNZDCHF 5min contained\nXAUUSD 5min contained\n");
    const summary = await read([writeCorpus(fixtureRows())], { witnessTablePath: table });
    assert.equal(summary.yearMapSource, "witness");
    assert.equal(summary.cells.get("forex|select|escaping")!.rSum, 4);
    writeFileSync(table, "EURUSD 5min ESCAPES: 2018, 2021\n");
    await assert.rejects(read([writeCorpus(fixtureRows())], { witnessTablePath: table }), /cannot place/);
  });

  it("does not refuse on a held-out market the map cannot place — its rows reach no cell", async () => {
    const dir = mkdtempSync(join(tmpdir(), "contained-years-heldout-"));
    const table = join(dir, "feed-character.txt");
    writeFileSync(table, "EURUSD 5min ESCAPES: 2018, 2021\nGBPUSD 5min contained\nXAUUSD 5min contained\n");
    const summary = await read([writeCorpus(fixtureRows())], { witnessTablePath: table });
    assert.deepEqual(summary.holdout.markets, ["NZDCHF"]);
    assert.equal(summary.rows.heldOut, 1);
    assert.equal(summary.cells.get("forex|select|escaping")!.rSum, 4);
  });

  it("prints the split with the source of its year map on the first lines", async () => {
    const text = formatContainedYears(await read([writeCorpus(fixtureRows(), YEAR_MAP)]));
    assert.match(text, /year map: manifest feedCharacter/);
    assert.match(text, /confirm: SEALED, not read \(10 rows withheld at the door\)/);
    assert.match(text, /placed by the UTC year of its decision time/);
    // Gross R prints beside its own denominator: the rows that carried a gross figure.
    assert.match(text, /\| gross R \| gross n \| E \(net\) \|/);
    assert.match(text, /\| forex \| select \| escaping \| 2 \| 4\.0 \| 4\.0 \| 2 \|/);
  });

  it("the CLI refuses the sealed fold by name and runs the split otherwise", () => {
    const path = writeCorpus(fixtureRows(), YEAR_MAP);
    assert.throws(
      () => execFileSync(TSX, [READER, path, "--folds", "fit,confirm"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      /held-back fold/,
    );
    const out = execFileSync(TSX, [READER, path], { encoding: "utf8" });
    assert.match(out, /year map: manifest feedCharacter/);
  });
});
