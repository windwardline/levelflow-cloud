import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { type DailyContainment, formatFeedCharacter } from "../scripts/feedCharacter.ts";
import { OperatorInputError } from "../scripts/flagReader.ts";
import {
  describeYearMap,
  parseWitnessTable,
  resolveYearMap,
  YEAR_BUCKETS,
  yearOf,
} from "../scripts/feedYears.ts";

/**
 * One helper resolves every symbol-year to `contained` or `escaping`, so the
 * readers stratify the same way: from the corpus manifest's `feedCharacter`
 * (corpora built after #589) or, for a corpus that predates the field, from
 * the tracked witness table — never from a reader's own guess. A symbol
 * neither source names is `unknown`, and a reader asked to stratify on it
 * refuses rather than counting it as clean.
 */

const WITNESS_TABLE = `EURUSD 5min ESCAPES: 2021, 2022, 2023
  baseline range 1.000 bar 0.0540 over 4426 days
  2020 days 258 range 1.000 bar 0.0534 escape 11.0% under 12.0%
  2021 days 257 range 1.019 bar 0.0818 escape 28.8% under 10.1% ESCAPES (bar-range-drift)
EURUSD 15min ESCAPES: 2021, 2023
  baseline range 1.000 bar 0.0957 over 4400 days
XAUUSD 5min contained
  baseline range 0.998 bar 0.0530 over 3000 days
XAUUSD 15min contained
GFUSX 5min ESCAPES: 2023
GFUSX 15min unjudgeable
NOSUCH daily ABSENT — nothing to contain the intraday series in

3 store(s) escape their daily bars: EURUSD 5min (2021, 2022, 2023); EURUSD 15min (2021, 2023); GFUSX 5min (2023)
`;

function manifestWith(symbols: Array<{ symbol: string; escapeYears?: number[] }>) {
  return {
    symbols: symbols.map((entry) => ({
      symbol: entry.symbol,
      ...(entry.escapeYears && {
        feedCharacter: {
          "5min": { baseline: { barRangeRatio: 0.05, rangeRatio: 1 }, escapeYears: entry.escapeYears, escapeMonths: [], judgedDays: 100, judgedMonths: 12, months: {}, verdict: entry.escapeYears.length ? "escapes" : "contained", years: {} },
          "15min": { baseline: { barRangeRatio: 0.09, rangeRatio: 1 }, escapeYears: [], escapeMonths: [], judgedDays: 100, judgedMonths: 12, months: {}, verdict: "contained", years: {} },
        },
      }),
    })),
  };
}

describe("the year map", () => {
  it("describes its source on the header line, and refuses to describe a map that was never resolved", () => {
    assert.equal(describeYearMap("manifest"), "year map: manifest feedCharacter (5min tier)");
    assert.equal(describeYearMap("witness", "docs/research/r3/feed-character.txt"), "year map: witness table docs/research/r3/feed-character.txt (5min tier)");
    assert.throws(() => describeYearMap(null), /no year map was resolved/);
  });

  it("names the buckets", () => {
    assert.deepEqual([...YEAR_BUCKETS], ["contained", "escaping"]);
    assert.equal(yearOf(Date.UTC(2021, 0, 1)), 2021);
    assert.equal(yearOf(Date.UTC(2020, 11, 31, 23, 59)), 2020);
  });

  it("parses the tracked witness table on the 5-minute tier only", () => {
    const parsed = parseWitnessTable(WITNESS_TABLE);
    assert.deepEqual([...parsed.get("EURUSD")!].sort(), [2021, 2022, 2023]);
    assert.deepEqual([...parsed.get("XAUUSD")!], []);
    assert.deepEqual([...parsed.get("GFUSX")!], [2023]);
    // An absent store names nothing: the symbol is not in the map at all.
    assert.equal(parsed.has("NOSUCH"), false);
    // A year token that is not one refuses the table: dropped, it would read as contained.
    assert.throws(() => parseWitnessTable("EURUSD 5min ESCAPES: 2021, twenty-two\n"), /names a year that is not one/);
    // A blank token — a trailing comma from a hand edit — coerces to 0 and must not pass as a year.
    assert.throws(() => parseWitnessTable("EURUSD 5min ESCAPES: 2021,\n"), /names a year that is not one — ""/);
    assert.throws(() => parseWitnessTable("EURUSD 5min ESCAPES: 2021, 22\n"), /names a year that is not one — "22"/);
    // Two verdict lines for one store — two witness runs concatenated — are refused, never last-write-wins.
    assert.throws(() => parseWitnessTable("EURUSD 5min ESCAPES: 2021\nEURUSD 5min contained\n"), /two verdict lines/);
  });

  it("reads back exactly what the witness writes — the writer and the parser are one format", () => {
    const witness = (verdict: DailyContainment["verdict"], escapeYears: number[]): DailyContainment => ({
      baseline: verdict === "unjudgeable" ? null : { barRangeRatio: 0.05, rangeRatio: 1 },
      escapeMonths: [],
      escapeYears,
      judgedDays: verdict === "unjudgeable" ? 0 : 100,
      judgedMonths: verdict === "unjudgeable" ? 0 : 12,
      months: new Map(),
      verdict,
      years: new Map(),
    });
    const text = [
      formatFeedCharacter("EURUSD", "5min", witness("escapes", [2021, 2022])),
      formatFeedCharacter("EURUSD", "15min", witness("escapes", [2021])),
      formatFeedCharacter("XAUUSD", "5min", witness("contained", [])),
      formatFeedCharacter("GFUSX", "5min", witness("unjudgeable", [])),
    ].join("\n");
    const parsed = parseWitnessTable(text);
    assert.deepEqual([...parsed.get("EURUSD")!], [2021, 2022]);
    assert.deepEqual([...parsed.get("XAUUSD")!], []);
    assert.deepEqual([...parsed.get("GFUSX")!], []);
    assert.equal(parsed.size, 3);
  });

  it("names a table it cannot read as operator input, not a defect", () => {
    assert.throws(
      () => resolveYearMap({ manifests: [manifestWith([{ symbol: "EURUSD" }])], witnessTablePath: "/nonexistent/feed-character.txt" }),
      (error: unknown) => error instanceof OperatorInputError && /cannot read the witness table \(ENOENT\)/.test(error.message),
    );
  });

  it("counts symbols, not entries: two shards naming one market both carrying the field read as one manifest map, and a shard without it is mixed", () => {
    const both = resolveYearMap({
      manifests: [manifestWith([{ symbol: "EURUSD", escapeYears: [2021] }]), manifestWith([{ symbol: "EURUSD", escapeYears: [2021] }, { symbol: "XAUUSD", escapeYears: [] }])],
    });
    assert.equal(both.source, "manifest");
    assert.equal(both.bucketOf("EURUSD", 2021), "escaping");
    assert.throws(
      () => resolveYearMap({ manifests: [manifestWith([{ symbol: "EURUSD", escapeYears: [2021] }]), manifestWith([{ symbol: "EURUSD" }])] }),
      /mixed map is refused; missing: EURUSD/,
    );
  });

  it("reads a manifest that carries the field, and says so", () => {
    const map = resolveYearMap({ manifests: [manifestWith([{ symbol: "EURUSD", escapeYears: [2021, 2022] }, { symbol: "XAUUSD", escapeYears: [] }])] });
    assert.equal(map.source, "manifest");
    assert.equal(map.bucketOf("EURUSD", 2021), "escaping");
    assert.equal(map.bucketOf("EURUSD", 2020), "contained");
    assert.equal(map.bucketOf("XAUUSD", 2021), "contained");
    assert.equal(map.bucketOf("BTCUSD", 2021), "unknown");
    assert.deepEqual(map.symbolsWithoutMap, []);
  });

  it("falls back to the witness table for a corpus that predates the field, and names the symbols it cannot place", () => {
    const dir = mkdtempSync(join(tmpdir(), "feed-years-"));
    const table = join(dir, "feed-character.txt");
    writeFileSync(table, WITNESS_TABLE);
    const map = resolveYearMap({ manifests: [manifestWith([{ symbol: "EURUSD" }, { symbol: "XAUUSD" }, { symbol: "BTCUSD" }])], witnessTablePath: table });
    assert.equal(map.source, "witness");
    assert.equal(map.bucketOf("EURUSD", 2022), "escaping");
    assert.equal(map.bucketOf("EURUSD", 2019), "contained");
    assert.equal(map.bucketOf("XAUUSD", 2022), "contained");
    assert.equal(map.bucketOf("BTCUSD", 2022), "unknown");
    assert.deepEqual(map.symbolsWithoutMap, ["BTCUSD"]);
  });

  it("prefers the manifest when both are given, and refuses when neither can place a symbol the caller needs", () => {
    const dir = mkdtempSync(join(tmpdir(), "feed-years-"));
    const table = join(dir, "feed-character.txt");
    writeFileSync(table, WITNESS_TABLE);
    const map = resolveYearMap({ manifests: [manifestWith([{ symbol: "EURUSD", escapeYears: [2019] }])], witnessTablePath: table });
    assert.equal(map.source, "manifest");
    assert.equal(map.bucketOf("EURUSD", 2019), "escaping");
    assert.equal(map.bucketOf("EURUSD", 2021), "contained");
    assert.throws(() => resolveYearMap({ manifests: [manifestWith([{ symbol: "EURUSD" }])] }), /no year map/);
  });

  it("a manifest with the field on some symbols and not others is refused as mixed — one source per read", () => {
    assert.throws(
      () => resolveYearMap({ manifests: [manifestWith([{ symbol: "EURUSD", escapeYears: [2021] }, { symbol: "XAUUSD" }])] }),
      /mixed/,
    );
  });
});
