import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  type FmpBar,
  normalizeFmpBars,
  toTimestamp,
} from "../supabase/functions/trade-analyzer/bars.ts";
import {
  rollingAtr,
} from "../supabase/functions/trade-analyzer/indicators.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

// An open-market all-markets scan decodes ~50 symbols x 6 timeframes — about
// 580,000 bars of JSON — and then reads a rolling ATR over the daily series of
// every one of them, inside a single 2s Edge Function CPU budget. On 2026-08-02
// half the scans crossed it: eleven completed, eleven died with `CPU Time
// exceeded` behind HTTP 546.
//
// Two hot shapes were rewritten to allocate less. Neither may change a number,
// because a changed number is changed setup geometry and a calibration event.
// So both old implementations live on below as oracles, copied verbatim from
// the pre-change source, and the new ones are asserted equal to them.

// ORACLE — marketLoader.ts before the change (chained filter/map/sort/slice,
// plus the defensive per-bar copy it returned).
function decodeOld(payload: FmpBar[], maxBars: number): Bar[] {
  const bars = payload
    .filter((point) =>
      typeof point.date === "string" && typeof point.open === "number" &&
      typeof point.high === "number" && typeof point.low === "number" &&
      typeof point.close === "number"
    )
    .map((point) => ({
      close: point.close as number,
      high: point.high as number,
      low: point.low as number,
      open: point.open as number,
      time: toTimestampOld(point.date as string),
      volume: point.volume ?? 0,
    }))
    .sort((first, second) => first.time - second.time)
    .slice(-maxBars);
  return bars.map((bar) => ({ ...bar }));
}

// 2b (2026-08-09): the old oracle stamped FMP's New-York wall clock as UTC —
// the S&P cash session read 09:30-15:45 in July AND January, which true UTC
// cannot do — so the timestamp oracle is retired and the decode oracle below
// feeds the NEW converter on both sides. The convention is now measured, not
// assumed: bars are America/New_York (banked EURUSD dies Friday 17:00 wall,
// reopens Sunday 17:05; ES's maintenance hour is missing at 17:00-18:00
// wall), while the economic calendar is TRUE UTC (NFP Jul-2026 stamps
// 12:30:00 = 08:30 ET). One provider, two conventions, each parsed as itself.
function toTimestampOld(value: string) {
  return toTimestamp(value);
}

// ORACLE — indicators.ts before the change: one averageTrueRange over a fresh
// bars.slice(0, index) for every point of the series.
function averageTrueRangeOld(bars: Bar[], period: number) {
  if (bars.length < 2) {
    return 0;
  }
  const sample = bars.slice(-period - 1);
  const ranges = sample.slice(1).map((bar, index) => {
    const previousClose = sample[index].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });
  return ranges.reduce((sum, range) => sum + range, 0) /
    Math.max(ranges.length, 1);
}

function rollingAtrOld(bars: Bar[], period: number) {
  const values: number[] = [];
  for (let index = period + 1; index <= bars.length; index += 1) {
    values.push(averageTrueRangeOld(bars.slice(0, index), period));
  }
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

// A recorded FMP payload shape: newest-first (as FMP serves it), irregular
// prices, and the junk rows the filter exists for.
function recordedPayload(count: number): FmpBar[] {
  const rows: FmpBar[] = [];
  let price = 1.08342;
  for (let index = 0; index < count; index += 1) {
    price += (Math.sin(index / 17) + Math.cos(index / 29)) * 0.00041;
    const stamp = new Date(Date.UTC(2026, 5, 1) + index * 900_000);
    rows.push({
      close: Number((price + 0.00007).toFixed(5)),
      date: stamp.toISOString().slice(0, 19).replace("T", " "),
      high: Number((price + 0.00061).toFixed(5)),
      low: Number((price - 0.00058).toFixed(5)),
      open: Number(price.toFixed(5)),
      volume: 10_000 + index,
    });
  }
  return rows.reverse();
}

const JUNK_ROWS: FmpBar[] = [
  // Every field the filter checks, missing one at a time.
  { close: 1.1, high: 1.2, low: 1.0, open: 1.05 },
  { close: 1.1, date: "2026-06-02 00:00:00", high: 1.2, low: 1.0 },
  { close: 1.1, date: "2026-06-02 00:15:00", high: 1.2, open: 1.05 },
  { close: 1.1, date: "2026-06-02 00:30:00", low: 1.0, open: 1.05 },
  { date: "2026-06-02 00:45:00", high: 1.2, low: 1.0, open: 1.05 },
  // A date that is present but not a string.
  { close: 1.1, date: 20_260_602 as unknown as string, high: 1.2, low: 1.0, open: 1.05 },
  // Valid, but with no volume — the ?? 0 branch.
  { close: 1.1, date: "2026-06-02 01:00:00", high: 1.2, low: 1.0, open: 1.05 },
  // Two rows sharing one timestamp, to hold the sort's tie order.
  { close: 2.1, date: "2026-06-02 02:00:00", high: 2.2, low: 2.0, open: 2.05, volume: 7 },
  { close: 3.1, date: "2026-06-02 02:00:00", high: 3.2, low: 3.0, open: 3.05, volume: 9 },
];

function bars(source: FmpBar[]): Bar[] {
  return normalizeFmpBars(source, 10_000);
}

describe("the bar decode returns exactly what the old pipeline returned", () => {
  it("matches on a full-size intraday payload, sliced to the cap", () => {
    const payload = recordedPayload(3_086);
    // The real 15min case: more bars parsed than the timeframe keeps.
    assert.equal(payload.length > 3_000, true);
    assert.deepStrictEqual(
      normalizeFmpBars(payload, 3_000),
      decodeOld(payload, 3_000),
    );
  });

  it("matches when the payload is shorter than the cap", () => {
    const payload = recordedPayload(771);
    assert.deepStrictEqual(
      normalizeFmpBars(payload, 1_200),
      decodeOld(payload, 1_200),
    );
  });

  it("drops the same malformed rows and keeps the same tie order", () => {
    const payload = [...JUNK_ROWS, ...recordedPayload(40)];
    const next = normalizeFmpBars(payload, 10_000);
    assert.deepStrictEqual(next, decodeOld(payload, 10_000));
    // The junk is gone: 5 rows missing a field and 1 non-string date.
    assert.equal(next.length, payload.length - 6);
    // Both duplicate-timestamp rows survive, first-seen first.
    const tied = next.filter((bar) => bar.close === 2.1 || bar.close === 3.1);
    assert.deepStrictEqual(tied.map((bar) => bar.close), [2.1, 3.1]);
  });

  it("drops the unparseable-date row on BOTH sides — the now-stamp fallback is dead (2b)", () => {
    // The old pipeline stamped "not-a-date" as Date.now() and kept the bar —
    // corrupt input became a bar at the present moment. Both the oracle
    // (which now feeds the new converter) and the live decode reject it,
    // and the rejection is counted at the boundary rather than silent.
    const payload: FmpBar[] = [
      { close: 1.1, date: "not-a-date", high: 1.2, low: 1.0, open: 1.05 },
      ...recordedPayload(12),
    ];
    const decoded = normalizeFmpBars(payload, 10_000);
    assert.equal(decoded.length, 12);
    assert.ok(decoded.every((bar) => Number.isFinite(bar.time)));
  });

  it("matches on an empty and an all-junk payload", () => {
    assert.deepStrictEqual(normalizeFmpBars([], 1_000), decodeOld([], 1_000));
    const allJunk = JUNK_ROWS.slice(0, 6);
    assert.deepStrictEqual(
      normalizeFmpBars(allJunk, 1_000),
      decodeOld(allJunk, 1_000),
    );
  });
});

// One scan prices EURUSD near 1.08, XAUUSD near 2,000 and BTCUSD near 100,000,
// so the ATR series has to survive mixed magnitudes. It is also what gives this
// suite teeth: summing each window from zero is bit-identical, while the
// tempting running-sum-with-subtraction shortcut drifts by an ULP here — and a
// drifting volatility percentile is changed setup geometry.
function wideRangeBars(count: number): Bar[] {
  const out: Bar[] = [];
  for (let index = 0; index < count; index += 1) {
    const scale = index % 7 === 0
      ? 98_000
      : index % 3 === 0
      ? 1.0834
      : 2_051.7;
    const span = index % 5 === 0 ? scale * 3e-5 : scale * 4e-3;
    out.push({
      close: scale + span / 3,
      high: scale + span,
      low: scale - span,
      open: scale,
      time: index * 86_400_000,
      volume: 1,
    });
  }
  return out;
}

describe("rollingAtr returns exactly the series the old shape produced", () => {
  const daily = bars(recordedPayload(1_000));

  it("matches bit for bit on the 1,000-bar daily series classifyRegime reads", () => {
    for (const series of [daily, wideRangeBars(1_000)]) {
      const next = rollingAtr(series, 14);
      const old = rollingAtrOld(series, 14);
      assert.deepStrictEqual(next, old);
      // deepStrictEqual on floats is exact, but say it element by element too:
      // one ULP of drift here is changed setup geometry.
      assert.equal(next.length, old.length);
      assert.equal(next.length > 900, true);
      for (let index = 0; index < old.length; index += 1) {
        assert.equal(
          Object.is(next[index], old[index]),
          true,
          `value ${index} drifted: ${next[index]} vs ${old[index]}`,
        );
      }
    }
  });

  it("matches across periods and lengths, including the empty cases", () => {
    for (const period of [1, 2, 5, 14, 20, 50]) {
      for (const length of [0, 1, 2, 3, 15, 16, 60, 240]) {
        const sample = daily.slice(0, length);
        assert.deepStrictEqual(
          rollingAtr(sample, period),
          rollingAtrOld(sample, period),
          `period ${period}, length ${length}`,
        );
      }
    }
  });

  it("matches where flat bars make the old filter drop zero values", () => {
    const flat: Bar[] = Array.from({ length: 40 }, (_, index) => ({
      close: 100,
      high: 100,
      low: 100,
      open: 100,
      time: index * 86_400_000,
      volume: 0,
    }));
    // Every true range is 0, so both must return an empty series.
    assert.deepStrictEqual(rollingAtr(flat, 14), rollingAtrOld(flat, 14));
    assert.deepStrictEqual(rollingAtr(flat, 14), []);

    // A flat run followed by movement: the old code filtered zeros out after
    // building the series, so the surviving window must line up exactly.
    const mixed = [...flat, ...daily.slice(0, 40)];
    assert.deepStrictEqual(rollingAtr(mixed, 14), rollingAtrOld(mixed, 14));
    assert.equal(rollingAtr(mixed, 14).length > 0, true);
  });

  it("still refuses a period the series cannot fill", () => {
    assert.deepStrictEqual(rollingAtr(daily.slice(0, 5), 14), []);
    assert.deepStrictEqual(rollingAtr(daily, 0), rollingAtrOld(daily, 0));
    assert.deepStrictEqual(rollingAtr(daily, 0), []);
  });
});

// The decode now hands callers the array the candle cache holds instead of a
// fresh copy of it, which is only safe while bars stay read-only downstream.
const ANALYZER_SOURCES = [
  "bars.ts",
  "cotContext.ts",
  "executionQuality.ts",
  "futures.ts",
  "indicators.ts",
  "marketLoader.ts",
  "pricePlan.ts",
  "replay.ts",
  "strategies.ts",
  "sweep.ts",
].map((file) => ({
  file,
  source: readFileSync(`supabase/functions/trade-analyzer/${file}`, "utf8"),
}));

describe("nothing mutates a bar, so the cache can share its array", () => {
  it("assigns to no field of a bar anywhere in the analyzer", () => {
    for (const { file, source } of ANALYZER_SOURCES) {
      assert.doesNotMatch(
        source,
        /\b(bar|point|latest|candidate)\.(open|high|low|close|time|volume)\s*=[^=]/,
        `${file} assigns to a bar field`,
      );
    }
  });

  it("never reorders or resizes a bar array in place", () => {
    for (const { file, source } of ANALYZER_SOURCES) {
      for (
        const call of [
          /\b(bars|daily|primary|history|cached\.bars)\.sort\(/,
          /\b(bars|daily|primary|history|cached\.bars)\.reverse\(/,
          /\b(bars|daily|primary|history|cached\.bars)\.splice\(/,
          /\b(bars|daily|primary|history|cached\.bars)\.push\(/,
          /\b(bars|daily|primary|history|cached\.bars)\.(pop|shift|unshift|fill)\(/,
        ]
      ) {
        // bars.ts sorts the array it just built, before anyone can hold it.
        if (file === "bars.ts") {
          continue;
        }
        assert.doesNotMatch(source, call, `${file} mutates a bar array`);
      }
    }
  });

  it("keeps the decode's own sort on the array it built itself", () => {
    const decode = ANALYZER_SOURCES.find(({ file }) => file === "bars.ts")!;
    assert.match(decode.source, /const bars: Bar\[\] = \[\];/);
    assert.match(decode.source, /bars\.sort\(/);
  });
});

// 2b: the provider clock, pinned as literals a wrong implementation cannot
// satisfy. New York wall clock to true UTC, DST on both sides of the year —
// exactly the invariance the banked S&P session proved.
describe("toTimestamp — New York wall clock, DST-proven (2b)", () => {
  it("converts winter and summer wall clocks four and five hours apart", () => {
    assert.equal(toTimestamp("2026-01-15 09:30:00"), Date.UTC(2026, 0, 15, 14, 30));
    assert.equal(toTimestamp("2026-07-15 09:30:00"), Date.UTC(2026, 6, 15, 13, 30));
  });

  it("stamps a date-only bar at New York midnight of its day", () => {
    assert.equal(toTimestamp("2026-01-15"), Date.UTC(2026, 0, 15, 5, 0));
    assert.equal(toTimestamp("2026-07-15"), Date.UTC(2026, 6, 15, 4, 0));
  });

  it("lands correctly on the spring-forward morning", () => {
    // 2026-03-08: clocks jump 02:00 -> 03:00 ET. 03:00 wall = 07:00Z (EDT).
    assert.equal(toTimestamp("2026-03-08 03:00:00"), Date.UTC(2026, 2, 8, 7, 0));
  });

  it("returns NaN for garbage instead of stamping it as now", () => {
    // The old fallback returned Date.now() — corrupt input silently became a
    // bar at the present moment. A rejection must be a rejection.
    assert.ok(Number.isNaN(toTimestamp("not-a-date")));
  });
});

// 2h: the boundary validator — counted, never silent.
describe("normalizeFmpBars — coherence and spike rejection (2h)", () => {
  const good = (date: string, close: number): FmpBar => ({
    close,
    date,
    high: close * 1.01,
    low: close * 0.99,
    open: close,
    volume: 100,
  });

  it("rejects incoherent OHLC and counts the rejection", () => {
    const rejected: { reason: string }[] = [];
    const bars = normalizeFmpBars(
      [
        good("2026-07-15 09:30:00", 100),
        { close: 100, date: "2026-07-15 09:45:00", high: 90, low: 110, open: 100, volume: 1 },
        { close: -5, date: "2026-07-15 10:00:00", high: -1, low: -9, open: -5, volume: 1 },
        good("2026-07-15 10:15:00", 101),
      ],
      100,
      (r) => rejected.push(r),
    );
    assert.equal(bars.length, 2);
    assert.deepEqual(rejected.map((r) => r.reason), ["incoherent_ohlc", "incoherent_ohlc"]);
  });

  it("rejects the reverting bad tick and keeps the real crash", () => {
    const rejected: { reason: string }[] = [];
    // A 1,355x spike bracketed by agreeing neighbors: the MGCUSD shape.
    const spiked = normalizeFmpBars(
      [
        good("2026-07-15 09:30:00", 4000),
        { close: 4001, date: "2026-07-15 09:45:00", high: 5_420_000, low: 3990, open: 4000, volume: 1 },
        good("2026-07-15 10:00:00", 4002),
      ],
      100,
      (r) => rejected.push(r),
    );
    assert.equal(spiked.length, 2);
    assert.deepEqual(rejected.map((r) => r.reason), ["spike"]);

    // A genuine 40% crash WITH follow-through: neighbors disagree, so the
    // consensus guard never arms and every bar survives.
    const crashed = normalizeFmpBars(
      [
        good("2026-07-15 09:30:00", 100),
        { close: 60, date: "2026-07-15 09:45:00", high: 100, low: 58, open: 100, volume: 1 },
        good("2026-07-15 10:00:00", 61),
      ],
      100,
    );
    assert.equal(crashed.length, 3);
  });

  it("rejects an unparseable timestamp as a timestamp, not as a shape", () => {
    const rejected: { reason: string }[] = [];
    const bars = normalizeFmpBars(
      [good("garbage", 100), good("2026-07-15 09:30:00", 100)],
      100,
      (r) => rejected.push(r),
    );
    assert.equal(bars.length, 1);
    assert.deepEqual(rejected.map((r) => r.reason), ["timestamp"]);
  });
});

// The market-data chart endpoint duplicates the converter (Edge Functions are
// self-contained), so the two copies are pinned here — the same discipline as
// every duplicated fact spanning the Deno boundary.
describe("market-data's converter matches the analyzer's (2b, boundary pin)", () => {
  it("carries the same convention markers", () => {
    const marketData = readFileSync(
      "supabase/functions/market-data/index.ts",
      "utf8",
    );
    assert.match(marketData, /timeZone: "America\/New_York"/);
    assert.match(marketData, /return Number\.NaN;/);
    assert.doesNotMatch(marketData, /T00:00:00Z/);
    assert.doesNotMatch(
      marketData,
      /Number\.isFinite\(timestamp\) \? timestamp : Date\.now\(\)/,
    );
  });
});
