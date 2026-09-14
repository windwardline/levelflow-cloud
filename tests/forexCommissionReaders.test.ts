import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  conversion,
  formatConversion,
  ROUND_TRIP_USD_PER_BASE_UNIT,
  usdLegsFromTable,
} from "../scripts/forex-commission-conversion.ts";
import {
  admission,
  formatAdmission,
  usdQuoteForexSymbols,
} from "../scripts/forex-commission-admission.ts";
import { SEALED_FOLD } from "../scripts/tuning-folds-summary.ts";

/**
 * The two commission readers, on a corpus whose every figure is hand-computed.
 *
 * E8's $5 per 100,000 base units is 5e-5 USD per base unit; the true round
 * trip in quote units is 5e-5 × (quote per USD). The legacy engine charged
 * price × 5e-5. So on a USD-quote pair the mis-charge is 5e-5 × (price − 1),
 * on a USD-base pair it is 5e-5 × (price − USD leg) — zero where the row IS
 * the leg — and on a cross it is 5e-5 × (price − the quote's USD leg).
 * Every row below carries riskDistance 0.001 unless stated, so ΔR is the
 * price-unit mis-charge × 1,000. The confirm fold is sealed at the door.
 */

const MINUTE = 60_000;
const FIT_START = Date.UTC(2017, 0, 1);
const SELECT_START = Date.UTC(2020, 0, 1);
const CONFIRM_START = Date.UTC(2023, 0, 1);
const END = Date.UTC(2026, 8, 1);
const NO_PIN_DIR = join(mkdtempSync(join(tmpdir(), "commission-readers-pins-")), "none");

type Row = Record<string, unknown>;

function row(input: {
  accepted?: boolean;
  close: number;
  commission?: number;
  realizedR: number;
  risk?: number;
  roundTrip?: number;
  split: string;
  symbol: string;
  time: number;
  unfilled?: boolean;
  variant?: string;
}): Row {
  const risk = input.risk ?? 0.001;
  const commission = input.commission ?? input.close * ROUND_TRIP_USD_PER_BASE_UNIT;
  return {
    accepted: input.accepted ?? true,
    estimatedCommission: commission,
    estimatedRoundTripCost: input.roundTrip ?? commission + 0.00002,
    grossOutcome: input.unfilled ? "unfilled" : "take_profit",
    grossRealizedR: input.realizedR,
    holdout: false,
    latestClose: input.close,
    outcome: input.unfilled ? "unfilled" : input.realizedR < 0 ? "stop_loss" : "take_profit",
    realizedR: input.realizedR,
    riskDistance: risk,
    split: input.split,
    symbol: input.symbol,
    time: input.time,
    variant: input.variant ?? "baseline",
  };
}

// Decision times: in span = 18:xx UTC, out of span = 03:xx UTC; the index adds minutes, never an hour.
const at = (year: number, month: number, hour: number, index: number) => Date.UTC(year, month, 2, hour) + index * MINUTE;

/**
 * Fit 2017, all in span unless stated, riskDistance 0.001:
 *   EURUSD @1.2   legacy 6.0e-5, true 5e-5           → ΔR +0.010, R +1
 *   USDJPY @150   legacy 7.5e-3, true 5e-5×150       → ΔR  0.000, R −1
 *   GBPJPY @190   legacy 9.5e-3, true 5e-5×150       → ΔR +2.000, R +1   (out of span)
 *   NZDUSD @0.7   legacy 3.5e-5, true 5e-5           → ΔR −0.015, R +0.5
 *   EURCHF @0.95  no USDCHF row in the corpus         → unrated
 * Select 2020: EURUSD @1.1 legacy 5.5e-5 → ΔR +0.005, R −1 (in span);
 *   EURUSD 2021 (escaping in the year map) @1.1 → the same, excluded under
 *   --years contained; one unfilled EURUSD row; one accepted:false row; one
 *   runnerProtection=hold row; ten confirm rows the door withholds.
 */
function fixtureRows(): Row[] {
  const rows: Row[] = [
    row({ close: 1.2, realizedR: 1, split: "fit", symbol: "EURUSD", time: at(2017, 2, 18, 0) }),
    row({ close: 150, realizedR: -1, split: "fit", symbol: "USDJPY", time: at(2017, 3, 18, 1) }),
    row({ close: 190, realizedR: 1, split: "fit", symbol: "GBPJPY", time: at(2017, 4, 3, 2) }),
    row({ close: 0.7, realizedR: 0.5, split: "fit", symbol: "NZDUSD", time: at(2017, 5, 18, 3) }),
    row({ close: 0.95, realizedR: 1, split: "fit", symbol: "EURCHF", time: at(2017, 6, 18, 4) }),
    row({ close: 1.1, realizedR: -1, split: "select", symbol: "EURUSD", time: at(2020, 2, 18, 5) }),
    row({ close: 1.1, realizedR: -1, split: "select", symbol: "EURUSD", time: at(2021, 2, 18, 6) }),
    row({ close: 1.1, realizedR: 0, split: "select", symbol: "EURUSD", time: at(2020, 3, 18, 7), unfilled: true }),
    row({ accepted: false, close: 1.1, realizedR: -1, split: "select", symbol: "EURUSD", time: at(2020, 4, 18, 8) }),
    row({ close: 1.1, realizedR: 3, split: "select", symbol: "EURUSD", time: at(2020, 5, 18, 9), variant: "runnerProtection=hold" }),
  ];
  for (let i = 0; i < 10; i += 1) {
    rows.push(row({ close: 1.3, realizedR: 5, split: SEALED_FOLD, symbol: "EURUSD", time: at(2024, 2, 18, i) }));
  }
  return rows;
}

const YEAR_MAP: Record<string, number[]> = { EURCHF: [], EURUSD: [2021], GBPJPY: [], NZDUSD: [], USDJPY: [] };

// `feedCharacter: null` omits the manifest's own year map, so a witness table is the only one on offer.
function writeCorpus(rows: Row[], feedCharacter: Record<string, number[]> | null = YEAR_MAP): string {
  const dir = mkdtempSync(join(tmpdir(), "commission-readers-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(emitPath, rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const symbols = [...new Set(rows.map((entry) => String(entry.symbol)))];
  const manifest = buildSweepManifest({
    acceptance: { captureAll: true, ignoreLowEdge: false },
    analyzerVersion: "2026.09.13.test",
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
    generatedAt: "2026-09-13T02:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    grossCostScale: 0,
    holdoutSymbols: [],
    modeledCostScale: 1,
    requestedSymbols: symbols,
    source: { dirty: false, revision: "46d45450000000000000000000000000000000000" },
    stepBars: 16,
    symbols: symbols.map((symbol) => ({
      calibration: {},
      ...(feedCharacter && {
        feedCharacter: {
          "5min": { baseline: { barRangeRatio: 0.05, rangeRatio: 1 }, escapeYears: feedCharacter[symbol] ?? [], judgedDays: 100, verdict: (feedCharacter[symbol] ?? []).length ? "escapes" : "contained", years: {} },
        },
      }),
      providerSymbol: symbol,
      series: { "15min": seriesFacts(rows.filter((entry) => entry.symbol === symbol).map((entry) => ({ time: Number(entry.time) })), "intraday") },
      symbol,
    })),
    trainShare: 0.6,
    treasuryCurve: { count: 3_000, firstTime: Date.UTC(2013, 0, 2), largestGapMs: 4 * 86_400_000, lastTime: Date.UTC(2027, 0, 1) },
    warmupBars: 240,
  } as unknown as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return emitPath;
}

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${expected}, got ${actual}`);

function readConversion(paths: string[], overrides: Partial<Parameters<typeof conversion>[0]> = {}) {
  return conversion({ folds: ["fit", "select"], holdoutPinDir: NO_PIN_DIR, includeHoldout: true, paths, variant: "baseline", years: "all", ...overrides });
}

describe("forex-commission-conversion — the mis-charge, hand-computed", () => {
  it("prices every fill at 5e-5 × (quote per USD) and accounts for every row it did not price", async () => {
    const summary = await readConversion([writeCorpus(fixtureRows())]);
    assert.equal(summary.rows.total, 20, "ten rows read, ten withheld at the door");
    assert.equal(summary.rows.sealed, 10);
    assert.equal(summary.rows.notAccepted, 1);
    assert.equal(summary.rows.wrongVariant, 1);
    assert.equal(summary.rows.notFilled, 1);
    assert.equal(summary.rows.legacyCharged, 7, "every priced-or-unrated fill carried price × 5e-5");
    assert.equal(summary.rows.constantCharged, 0);
    assert.equal(summary.rows.unrated, 1, "EURCHF has no USDCHF leg in this corpus");
    assert.equal(summary.rows.priced, 6);
    const pair = (symbol: string) => summary.perPair.get(symbol)!;
    near(pair("EURUSD").dR, 0.010 + 0.005 + 0.005); // 1.2, 1.1 (select 2020), 1.1 (select 2021)
    near(pair("USDJPY").dR, 0, 1e-12); // the row is its own leg
    near(pair("GBPJPY").dR, 2.0); // 5e-5 × (190 − 150) / 0.001
    near(pair("NZDUSD").dR, -0.015); // undercharged: 5e-5 × (0.7 − 1) / 0.001
    near(pair("GBPJPY").charged / pair("GBPJPY").truth, 190 / 150);
    near(summary.perBase.get("NZD")!.dR, -0.015);
    near(summary.exact.get("EURUSD")!.dR, 0.020);
    assert.equal(summary.exact.has("GBPJPY"), false, "the exact subset is USD-quote only");
  });

  it("ranks pairs by the mis-charge they carry in total, not per fill", async () => {
    // Per fill the order would be GBPJPY, NZDUSD (0.015 over one fill), EURUSD
    // (0.020 over three); by total it is GBPJPY, EURUSD, NZDUSD.
    const summary = await readConversion([writeCorpus(fixtureRows())]);
    const text = formatConversion(summary);
    const ranked = [...text.matchAll(/^\| (\d+) \| ([A-Z]{6}) \|/gm)].map((m) => `${m[1]}:${m[2]}`);
    assert.deepEqual(ranked, ["1:GBPJPY", "2:EURUSD", "3:NZDUSD", "4:USDJPY"]);
    assert.match(text, /THE EIGHT CELLS/);
    assert.match(text, /rate = per-year mean close of the quote currency's USD leg over the priced rows \(legs from the currency table: AUDUSD, EURUSD, GBPUSD, NZDUSD, USDCAD, USDCHF, USDJPY\)/);
  });

  it("puts each fill in its fold × pool × span cell and corrects the cell's money", async () => {
    const summary = await readConversion([writeCorpus(fixtureRows())]);
    const inSpan = summary.cells.get("fit|in-pool|in")!;
    assert.equal(inSpan.n, 3, "EURUSD, USDJPY, NZDUSD decided at 18:00 UTC; GBPJPY at 03:00");
    near(inSpan.net, 1 - 1 + 0.5);
    near(inSpan.corrected, inSpan.net + 0.010 + 0 - 0.015);
    const outOfSpan = summary.cells.get("fit|in-pool|out")!;
    assert.equal(outOfSpan.n, 1);
    near(outOfSpan.corrected - outOfSpan.net, 2.0);
    assert.equal(summary.cells.get("select|in-pool|in")!.n, 2);
  });

  it("under --years contained the year map excludes the escaping row and counts it", async () => {
    const summary = await readConversion([writeCorpus(fixtureRows())], { years: "contained" });
    assert.equal(summary.rows.otherYears, 1, "EURUSD 2021 escapes in the manifest's year map");
    near(summary.perPair.get("EURUSD")!.dR, 0.010 + 0.005);
    assert.match(formatConversion(summary), /years contained \(year map: manifest feedCharacter/);
  });

  it("refuses before reading a row: a fold the manifest does not declare, a market the year map cannot place, no corpus at all", async () => {
    await assert.rejects(readConversion([writeCorpus(fixtureRows())], { folds: ["fit", "selct"] }), /declares no "selct" fold/);
    const dir = mkdtempSync(join(tmpdir(), "commission-readers-witness-"));
    const table = join(dir, "feed-character.txt");
    writeFileSync(table, "EURUSD 5min ESCAPES: 2021\nUSDJPY 5min contained\nNZDUSD 5min contained\nEURCHF 5min contained\n");
    await assert.rejects(
      readConversion([writeCorpus(fixtureRows(), null)], { witnessTablePath: table, years: "contained" }),
      /cannot place 1 market\(s\) this read would price: GBPJPY/,
    );
    await assert.rejects(readConversion([]), /no corpus shard named/);
  });

  it("states the seal and what it does with held-out fills on the first lines", async () => {
    const text = formatConversion(await readConversion([writeCorpus(fixtureRows())], { includeHoldout: false }));
    assert.match(text, /confirm: SEALED, not read \(10 rows withheld at the door\)/);
    assert.match(text, /labelled HELD OUT per market/);
    assert.doesNotMatch(text, /excluded from every class pool/);
    assert.match(text, /POOLED with in-pool fills in the per-base, per-pair and USD-quote tables; nothing is excluded/);
  });

  it("prices nothing rather than something when no fill can be rated, and says so", async () => {
    const rows = fixtureRows().filter((entry) => entry.symbol === "EURCHF" || entry.split === SEALED_FOLD);
    const summary = await readConversion([writeCorpus(rows, { EURCHF: [] })]);
    assert.equal(summary.rows.priced, 0);
    assert.equal(summary.rows.unrated, 1);
    assert.match(formatConversion(summary), /nothing priced — no forex fill in scope could be rated/);
  });
});

describe("forex-commission-admission — what the constant does at the cap", () => {
  it("names exactly the four USD-quote pairs from the currency table", () => {
    assert.deepEqual(usdQuoteForexSymbols(), ["AUDUSD", "EURUSD", "GBPUSD", "NZDUSD"]);
  });

  it("the conversion reader's USD legs come from the same table: seven, three of them inverted", () => {
    const legs = usdLegsFromTable();
    assert.deepEqual(
      [...legs].sort().map(([currency, leg]) => `${currency}:${leg.symbol}:${leg.usdIsBase ? "inverted" : "direct"}`),
      ["AUD:AUDUSD:direct", "CAD:USDCAD:inverted", "CHF:USDCHF:inverted", "EUR:EURUSD:direct", "GBP:GBPUSD:direct", "JPY:USDJPY:inverted", "NZD:NZDUSD:direct"],
    );
  });

  it("counts crossings in both directions with the R those rows carried, hand-computed", async () => {
    // riskDistance 0.001 throughout. EURUSD @1.2: legacy commission 6e-5,
    // round trip 1.05e-4 → share 0.105; corrected (1.05e-4 − 6e-5 + 5e-5) /
    // 0.001 = 0.095. NZDUSD @0.6: legacy 3e-5, round trip 9.8e-5 → share
    // 0.098; corrected 0.118. GBPUSD @1.25: legacy 6.25e-5, round trip 8e-5
    // → share 0.08; corrected 0.0675 — kept either way. USDJPY is not a
    // USD-quote pair and is counted out of scope.
    const rows: Row[] = [
      row({ close: 1.2, realizedR: 0.7, roundTrip: 0.000105, split: "fit", symbol: "EURUSD", time: at(2017, 2, 18, 0) }),
      row({ close: 0.6, realizedR: -1, roundTrip: 0.000098, split: "fit", symbol: "NZDUSD", time: at(2017, 3, 18, 1) }),
      row({ close: 1.25, realizedR: 2, roundTrip: 0.00008, split: "fit", symbol: "GBPUSD", time: at(2017, 4, 18, 2) }),
      row({ close: 1.25, realizedR: 0, roundTrip: 0.00008, split: "fit", symbol: "GBPUSD", time: at(2017, 4, 18, 3), unfilled: true }),
      row({ close: 150, realizedR: 1, split: "fit", symbol: "USDJPY", time: at(2017, 5, 18, 4) }),
      row({ accepted: false, close: 1.2, realizedR: 1, roundTrip: 0.000105, split: "fit", symbol: "EURUSD", time: at(2017, 6, 18, 5) }),
    ];
    for (let i = 0; i < 4; i += 1) {
      rows.push(row({ close: 1.2, realizedR: 5, roundTrip: 0.000105, split: SEALED_FOLD, symbol: "EURUSD", time: at(2024, 2, 18, i) }));
    }
    const summary = await admission({ cap: 0.1, folds: ["fit", "select"], paths: [writeCorpus(rows, { EURUSD: [], GBPUSD: [], NZDUSD: [], USDJPY: [] })], variant: "baseline" });
    assert.equal(summary.rows.notAccepted, 1);
    assert.equal(summary.rows.otherPair, 1);
    assert.equal(summary.rows.chargedLegacy, 4);
    const all = summary.buckets.get("all pairs|all")!;
    assert.equal(all.rows, 4);
    assert.equal(all.filled, 3);
    assert.equal(all.over, 1, "EURUSD over the cap as emitted");
    assert.equal(all.overCorrected, 1, "NZDUSD over the cap corrected");
    assert.equal(all.newlyAdmitted, 1);
    near(all.admittedR, 0.7);
    assert.equal(all.newlyDeclined, 1);
    near(all.declinedR, -1);
    assert.equal(all.keptFilled, 1);
    near(all.keptR, 2);
    near(summary.buckets.get("EURUSD|all")!.shareCorrectedSum, 0.095);
    near(summary.buckets.get("NZDUSD|all")!.shareCorrectedSum, 0.118);
    const text = formatAdmission(summary);
    assert.match(text, /ADMISSION AT maxCostShare 0\.1 /);
    assert.match(text, /pairs from the currency table \(forex, USD quote\): AUDUSD, EURUSD, GBPUSD, NZDUSD/);
    assert.match(text, /\| all pairs\|all \| 4 \| 3 \| 1 \| 1 \| 1 \(1, -1\.0\) \| 1 \(1, \+0\.7\) \| \(1, \+2\.0\) \|/);
    assert.match(text, /confirm: SEALED, not read \(4 rows withheld at the door\)/);
    assert.equal(summary.rows.sealed, 4);
    assert.equal(summary.rows.total, 10);
  });

  it("refuses a witness that cannot place one of the four pairs, and a corpus it was not given", async () => {
    const rows: Row[] = [row({ close: 1.2, realizedR: 1, roundTrip: 0.0001, split: "fit", symbol: "EURUSD", time: at(2017, 2, 18, 0) })];
    const dir = mkdtempSync(join(tmpdir(), "commission-admission-witness-"));
    const table = join(dir, "feed-character.txt");
    writeFileSync(table, "GBPUSD 5min contained\n");
    await assert.rejects(
      admission({ cap: 0.15, folds: ["fit", "select"], paths: [writeCorpus(rows, null)], variant: "baseline", witnessTablePath: table }),
      /cannot place 1 market\(s\) this read would price: EURUSD/,
    );
    await assert.rejects(admission({ cap: 0.15, folds: ["fit", "select"], paths: [], variant: "baseline" }), /no corpus shard named/);
  });

  it("a corpus that already charges the constant moves no share, and the tables say so", async () => {
    const rows: Row[] = [
      row({ close: 1.2, commission: ROUND_TRIP_USD_PER_BASE_UNIT, realizedR: 1, roundTrip: 0.0001, split: "fit", symbol: "EURUSD", time: at(2017, 2, 18, 0) }),
    ];
    const summary = await admission({ cap: 0.15, folds: ["fit", "select"], paths: [writeCorpus(rows, { EURUSD: [] })], variant: "baseline" });
    assert.equal(summary.rows.chargedConstant, 1);
    assert.equal(summary.rows.chargedLegacy, 0);
    const all = summary.buckets.get("all pairs|all")!;
    near(all.shareSum, all.shareCorrectedSum);
    assert.equal(all.newlyAdmitted + all.newlyDeclined, 0);
    assert.match(formatAdmission(summary), /the constant on 1, neither on 0/);
  });
});
