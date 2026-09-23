import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
  anchoredAt,
  atrAt,
  censoredExcursion,
  clusteredBound,
  drawNull,
  judgeFamilyControl,
  MIN_DAY_CLUSTERS,
  nullPools,
  signedExcursion,
  verdictOf,
  windowExcursion,
} from "../scripts/entry-excursion-screen.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { tMultiplier95 } from "../scripts/sweepStats.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { averageTrueRange } from "../supabase/functions/trade-analyzer/indicators.ts";
import { evaluateSetupOutcome, getSetupExpiryTime } from "../supabase/functions/trade-analyzer/replay.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";
import { noKeychainEnv } from "./support/noKeychain.ts";
import { writePinnedStore } from "./support/pinnedStore.ts";
import { scratchDir } from "./support/scratchDir.ts";

/**
 * The random-entry excursion screen (design: docs/research/designs/
 * random-entry-screen-2026-09-14.md, the REFUTED section's smallest
 * defensible design). Controls only: amendment 46 registers a family before
 * any fold is read, and the registry does not exist yet.
 *
 * The screen reimplements two pieces of production — the uncensored window
 * and the resolver's censoring — so each is ANCHORED to production rather
 * than trusted: the censoring reproduction is checked against the resolver
 * itself (`evaluateSetupOutcome`), and the executed fixture's rows are
 * RESOLVED BY THAT RESOLVER over the same bars the screen reads.
 *
 * Nothing here can reach a provider: every series the script reads is a
 * pinned store written below, its fetchers throw, and the spawned process runs
 * with the keychain shadowed and no FMP key in its environment.
 */

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const SCRIPT = join(process.cwd(), "scripts", "entry-excursion-screen.ts");
const execFileAsync = promisify(execFile);

const MIN5 = 5 * 60_000;
const MIN15 = 15 * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ANCHOR = "2026-08-26";
const DEPTH = 7000;

function bar(time: number, open: number, high: number, low: number, close: number): Bar {
  return { close, high, low, open, time, volume: 1 };
}

describe("the uncensored window", () => {
  const t = Date.UTC(2024, 0, 2, 8);
  // The decision bar is [t, t+15m); its interior is decision-time
  // information, so the stream opens at t+15m (FR-5), and a bar counts only
  // when it closes by expiry — the resolver's own admission rule.
  const bars = [
    bar(t, 1, 9, -9, 1), // inside the decision bar: never read
    bar(t + 5 * 60_000, 1, 9, -9, 1), // inside the decision bar: never read
    bar(t + 10 * 60_000, 1, 9, -9, 1), // inside the decision bar: never read
    bar(t + MIN15, 1.0, 1.4, 0.9, 1.1),
    bar(t + MIN15 + MIN5, 1.1, 1.2, 0.7, 0.8),
    bar(t + MIN15 + 2 * MIN5, 0.8, 1.3, 0.8, 1.25),
    bar(t + MIN15 + 3 * MIN5, 1.25, 9, -9, 1.25), // closes after expiry: never read
  ];
  const expiryMs = t + MIN15 + 3 * MIN5 + MIN5 - 1;

  it("reads from the bar after the decision bar to the last bar that closes by expiry", () => {
    const got = windowExcursion({ bars, decisionMs: t, expiryMs, reference: 1 });
    assert.ok(got);
    assert.equal(got.bars, 3);
    assert.ok(Math.abs(got.up - 0.4) < 1e-12, `up ${got.up}`);
    assert.ok(Math.abs(got.down - 0.3) < 1e-12, `down ${got.down}`);
    assert.equal(got.last, 1.25);
  });

  it("clamps an excursion that never went its way at zero, and answers null on an empty window", () => {
    const got = windowExcursion({ bars, decisionMs: t, expiryMs, reference: 2 });
    assert.ok(got);
    assert.equal(got.up, 0);
    assert.ok(Math.abs(got.down - 1.3) < 1e-12);
    assert.equal(windowExcursion({ bars, decisionMs: t, expiryMs: t + MIN15 + MIN5 - 1, reference: 1 }), null);
  });

  it("signs the excursion by the family's side", () => {
    assert.equal(signedExcursion("buy", { down: 0.3, up: 0.5 }), 0.5 - 0.3);
    assert.equal(signedExcursion("sell", { down: 0.3, up: 0.5 }), 0.3 - 0.5);
  });

  it("measures ATR as the engine does, from the fifteen bars ending at the decision bar", () => {
    const series: Bar[] = [];
    for (let index = 0; index < 30; index += 1) {
      const close = 1 + Math.sin(index) * 0.01;
      series.push(bar(index * MIN15, close - 0.001, close + 0.002 * (1 + (index % 3)), close - 0.003, close));
    }
    assert.equal(atrAt(series, 13), null, "fourteen true ranges need fifteen bars");
    for (const index of [14, 20, 29]) {
      assert.equal(atrAt(series, index), averageTrueRange(series.slice(0, index + 1), 14));
    }
  });
});

describe("the resolver's censoring, re-applied", () => {
  // The anchor is the resolver itself: its feedback is the corpus's field.
  const created = Date.UTC(2024, 0, 3, 12);
  const makeBars = (seed: number): Bar[] => {
    const out: Bar[] = [];
    let price = 100;
    let state = seed;
    for (let index = 0; index < 120; index += 1) {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      const step = ((state / 2_147_483_648) - 0.5) * 0.8;
      const open = price;
      price += step;
      out.push(bar(created + MIN15 + index * MIN5, open, Math.max(open, price) + 0.15, Math.min(open, price) - 0.15, price));
    }
    return out;
  };

  for (const [side, seed] of [["buy", 7], ["sell", 11], ["buy", 23], ["sell", 41]] as const) {
    it(`reproduces maxFavorableMove and maxAdverseMove on a ${side} the resolver filled (seed ${seed})`, () => {
      const bars = makeBars(seed);
      const entry = side === "buy" ? 99.6 : 100.4;
      const outcome = evaluateSetupOutcome(
        {
          created_at: new Date(created).toISOString(),
          limit_entry: entry,
          side,
          stop_loss: side === "buy" ? entry - 1.5 : entry + 1.5,
          symbol: "EURUSD",
          take_profit: side === "buy" ? entry + 2 : entry - 2,
          take_profit_1: side === "buy" ? entry + 0.6 : entry - 0.6,
        },
        bars,
        Date.UTC(2030, 0, 1),
        { barIntervalMs: MIN5, reviewHours: 8, runnerProtection: "breakeven", sameBarProtectionArming: true, streamStartsAtMs: created + MIN15 },
      );
      assert.equal(outcome.state, "resolved");
      if (outcome.state !== "resolved") return;
      assert.ok(outcome.filledAt, `seed ${seed} never filled — pick another seed`);
      const exit = outcome.legs.find((leg) => leg.leg === "exit");
      assert.ok(exit);
      const got = censoredExcursion({
        bars,
        entry,
        exitMs: exit.time,
        filledMs: Date.parse(outcome.filledAt!),
        side,
      });
      assert.ok(got, "the series holds the fill bar, so the reproduction must start");
      assert.equal(got.favourable, outcome.feedback.maxFavorableMove);
      assert.equal(got.adverse, outcome.feedback.maxAdverseMove);
    });
  }
});

describe("the day-clustered bound", () => {
  it("clusters by the key it is given, with the CR1 factor, at tMultiplier95(clusters − 1)", () => {
    const values = [
      { cluster: 1, value: 1 },
      { cluster: 1, value: 3 },
      { cluster: 2, value: -1 },
      { cluster: 3, value: 2 },
      { cluster: 3, value: 2 },
      { cluster: 3, value: -1 },
    ];
    const mean = 6 / 6;
    // Residual sums per cluster: (1−1)+(3−1)=2, (−1−1)=−2, (2−1)+(2−1)+(−1−1)=0.
    const se = Math.sqrt((3 / 2) * (4 + 4 + 0)) / 6;
    const got = clusteredBound(values);
    assert.equal(got.n, 6);
    assert.equal(got.clusters, 3);
    assert.equal(got.mean, mean);
    assert.ok(Math.abs(got.se! - se) < 1e-12, `se ${got.se} vs ${se}`);
    assert.ok(Math.abs(got.lower! - (mean - tMultiplier95(2) * se)) < 1e-12);
    assert.ok(Math.abs(got.upper! - (mean + tMultiplier95(2) * se)) < 1e-12);
  });

  it("is wider clustered by day than by row when decisions inside a day move together", () => {
    const values: Array<{ cluster: number; value: number }> = [];
    for (let day = 0; day < 40; day += 1) {
      const shared = day % 2 === 0 ? 1 : -0.8;
      for (let row = 0; row < 6; row += 1) values.push({ cluster: day, value: shared + (row - 2.5) * 0.01 });
    }
    const byDay = clusteredBound(values);
    const byRow = clusteredBound(values.map((entry, index) => ({ cluster: index, value: entry.value })));
    assert.equal(byDay.clusters, 40);
    assert.equal(byRow.clusters, 240);
    assert.ok(byDay.se! > 2 * byRow.se!, `day ${byDay.se} row ${byRow.se}`);
  });

  it("answers no interval below two clusters", () => {
    const got = clusteredBound([{ cluster: 5, value: 1 }, { cluster: 5, value: 2 }]);
    assert.equal(got.clusters, 1);
    assert.equal(got.se, null);
    assert.equal(got.lower, null);
  });

  it("gives no verdict below 30 day clusters, and passes only above the floor", () => {
    assert.equal(MIN_DAY_CLUSTERS, 30);
    const at = (clusters: number, lower: number) => ({ clusters, lower, mean: lower + 1, n: clusters, se: 1, t: 1, upper: lower + 2 });
    assert.equal(verdictOf(at(29, 5), 0.1), "NO VERDICT");
    assert.equal(verdictOf(at(30, 0.11), 0.1), "PASS");
    assert.equal(verdictOf(at(30, 0.1), 0.1), "FAIL");
    assert.equal(verdictOf(at(30, -1), 0.1), "FAIL");
  });
});

describe("the controls are judged, never assumed", () => {
  it("look-ahead holds only when it passes everywhere it was judged", () => {
    assert.equal(judgeFamilyControl("look-ahead", ["PASS", "PASS", "NO VERDICT"]), "HOLDS");
    assert.equal(judgeFamilyControl("look-ahead", ["PASS", "FAIL"]), "FAILS");
    assert.equal(judgeFamilyControl("look-ahead", ["NO VERDICT", "NO VERDICT"]), "NO VERDICT");
    assert.equal(judgeFamilyControl("look-ahead", []), "NO VERDICT");
  });

  it("coin-flip and the shipped entry hold only when they pass nowhere", () => {
    for (const family of ["coin-flip", "shipped"] as const) {
      assert.equal(judgeFamilyControl(family, ["FAIL", "FAIL", "NO VERDICT"]), "HOLDS");
      assert.equal(judgeFamilyControl(family, ["FAIL", "PASS"]), "FAILS");
      assert.equal(judgeFamilyControl(family, ["NO VERDICT"]), "NO VERDICT");
    }
  });
});

describe("the null draw", () => {
  it("keeps the clock, refuses any day within W of the decision, and draws exactly K", () => {
    const decisionMs = Date.UTC(2024, 0, 10, 8);
    const windowMs = 30 * HOUR;
    const pool = [-3, -2, -1, 1, 2, 3].map((days) => decisionMs + days * DAY);
    let calls = 0;
    const random = () => {
      calls += 1;
      return ((calls * 0.37) % 1);
    };
    const drawn: number[] = [];
    const got = drawNull({
      attempts: 400,
      decisionMs,
      k: 20,
      pool,
      random,
      usable: (time) => {
        drawn.push(time);
        return time / DAY;
      },
      windowMs,
    });
    assert.ok(got);
    assert.equal(got.length, 20);
    for (const time of drawn) {
      assert.ok(Math.abs(time - decisionMs) > windowMs, `drew ${new Date(time).toISOString()} inside W`);
    }
  });

  it("answers null when the pool cannot supply K usable days", () => {
    const decisionMs = Date.UTC(2024, 0, 10, 8);
    const got = drawNull({
      attempts: 400,
      decisionMs,
      k: 20,
      pool: [decisionMs + DAY, decisionMs + 2 * DAY],
      random: () => 0.5,
      usable: () => null,
      windowMs: 8 * HOUR,
    });
    assert.equal(got, null);
  });
});

describe("where a null may land", () => {
  // Hourly bars from 2023-12-20 to 2024-04-20. Each case moves ONE bound and
  // leaves the others wide, so each bound is the only reason for its misses.
  const bars: Bar[] = [];
  for (let time = Date.UTC(2023, 11, 20); time < Date.UTC(2024, 3, 20); time += HOUR) {
    bars.push(bar(time, 1, 1.01, 0.99, 1));
  }
  const wide = { decisionEndMs: Date.UTC(2024, 3, 1), startMs: Date.UTC(2023, 11, 21) };
  const times = (pools: Map<number, number[]>) => [...pools.values()].flat().sort((a, b) => a - b);
  const iso = (time: number) => new Date(time).toISOString();

  it("stays inside the fit fold's decision span", () => {
    const fold = { decisionEndMs: Date.UTC(2024, 1, 10), startMs: Date.UTC(2024, 0, 1) };
    const got = times(nullPools({ bars, excluded: () => false, fiveStart: 0, fold }));
    assert.equal(iso(got[0]), iso(fold.startMs));
    assert.equal(iso(got.at(-1)!), iso(fold.decisionEndMs));
  });

  it("stays inside the 5-minute series", () => {
    const fiveStart = Date.UTC(2024, 1, 5, 7);
    const got = times(nullPools({ bars, excluded: () => false, fiveStart, fold: wide }));
    assert.equal(iso(got[0]), iso(fiveStart));
  });

  it("stays out of every month the witness refuses", () => {
    const february = (time: number) => new Date(time).getUTCMonth() === 1;
    const got = times(nullPools({ bars, excluded: february, fiveStart: 0, fold: wide }));
    assert.ok(got.some((time) => new Date(time).getUTCMonth() === 0), "January is contained and must be in the pool");
    assert.ok(got.some((time) => new Date(time).getUTCMonth() === 2), "March is contained and must be in the pool");
    for (const time of got) assert.ok(!february(time), `${iso(time)} lies in a refused month`);
  });

  it("groups by UTC clock", () => {
    const pools = nullPools({ bars, excluded: () => false, fiveStart: 0, fold: wide });
    assert.equal(pools.size, 24);
    for (const [clock, members] of pools) {
      for (const time of members) assert.equal(time % DAY, clock);
    }
  });

  it("never lands on a bar without fourteen true ranges behind it", () => {
    const early = bars.slice(0, 20);
    const got = nullPools({
      bars: early,
      excluded: () => false,
      fiveStart: 0,
      fold: { decisionEndMs: early.at(-1)!.time, startMs: early[0].time },
    });
    assert.deepEqual(times(got), early.slice(14).map((entry) => entry.time));
  });
});

describe("a row is screened only on the bars it was decided on", () => {
  const series: Bar[] = [];
  for (let index = 0; index < 30; index += 1) {
    const close = 1 + Math.cos(index) * 0.01;
    series.push(bar(index * MIN15, close, close + 0.002, close - 0.002, close));
  }
  const atr = atrAt(series, 20)!;

  it("anchors when the close and the engine's ATR are the row's", () => {
    assert.equal(anchoredAt(series, 20, { atr, latestClose: series[20].close }), true);
  });

  it("refuses a different ATR, a different close, a missing bar and a bar without fourteen ranges", () => {
    assert.equal(anchoredAt(series, 20, { atr: atr * (1 + 1e-6), latestClose: series[20].close }), false);
    assert.equal(anchoredAt(series, 20, { atr, latestClose: series[20].close + 1e-9 }), false);
    assert.equal(anchoredAt(series, undefined, { atr, latestClose: series[20].close }), false);
    assert.equal(anchoredAt(series, 10, { atr: atrAt(series, 14)!, latestClose: series[10].close }), false);
  });
});

// ---------------------------------------------------------------------------
// Executed: a hand-built corpus and cache, the rows resolved by production.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2024, 4, 1);
const CONFIRM_START = Date.UTC(2024, 6, 1);
const END = Date.UTC(2024, 8, 1);
const EMBARGO = 5 * DAY;
const CACHE_START = Date.UTC(2023, 11, 27);
const CACHE_END = SELECT_START + 7 * DAY;
const REVIEW_HOURS = 8;
const SYMBOLS = [
  { price: 1.1, symbol: "EURUSD", volatility: 0.0005 },
  { price: 1.27, symbol: "GBPUSD", volatility: 0.0006 },
];

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const isWeekday = (time: number) => {
  const day = new Date(time).getUTCDay();
  return day !== 0 && day !== 6;
};

/** A weekday random walk on the 5-minute grid, and the 15-minute series built from it. */
function marketBars(seed: number, start: number, volatility: number): { five: Bar[]; fifteen: Bar[] } {
  const random = mulberry(seed);
  const five: Bar[] = [];
  let price = start;
  for (let time = CACHE_START; time < CACHE_END; time += MIN5) {
    if (!isWeekday(time)) continue;
    const u = Math.max(random(), 1e-12);
    const v = random();
    const step = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * volatility * start;
    const open = price;
    price = open + step;
    const wick = random() * volatility * start;
    five.push(bar(time, open, Math.max(open, price) + wick, Math.min(open, price) - wick, price));
  }
  const fifteen: Bar[] = [];
  for (let index = 0; index + 2 < five.length; index += 3) {
    const [a, b, c] = [five[index], five[index + 1], five[index + 2]];
    if (a.time % MIN15 !== 0 || c.time !== a.time + 2 * MIN5) throw new Error("fixture grid broke");
    fifteen.push(bar(a.time, a.open, Math.max(a.high, b.high, c.high), Math.min(a.low, b.low, c.low), c.close));
  }
  return { five, fifteen };
}

function splitOf(time: number): string {
  return time < SELECT_START ? "fit" : time < CONFIRM_START ? "select" : "confirm";
}

/**
 * The side an engine that could see the future would call: the sign of the
 * last close inside the screen's own window against the decision close.
 */
function lookAheadSide(symbol: string, five: Bar[], decision: Bar): "buy" | "sell" {
  const expiry = getSetupExpiryTime(symbol, decision.time, REVIEW_HOURS);
  const window = five.filter((entry) => entry.time >= decision.time + MIN15 && entry.time + MIN5 <= expiry);
  return (window.at(-1)?.close ?? decision.close) >= decision.close ? "buy" : "sell";
}

/**
 * Every decision the fixture's "engine" makes, resolved by the production
 * resolver. The shipped side knows nothing about the future unless the
 * fixture asks for an engine that does.
 */
function marketRows(
  symbol: string,
  symbolIndex: number,
  five: Bar[],
  fifteen: Bar[],
  shippedSide: "blind" | "look-ahead" = "blind",
): Row[] {
  const rows: Row[] = [];
  for (let index = 14; index < fifteen.length; index += 16) {
    const decision = fifteen[index];
    const time = decision.time;
    const side = shippedSide === "look-ahead"
      ? lookAheadSide(symbol, five, decision)
      : ((index * 7_919 + symbolIndex * 104_729) >> 3) % 2 === 0 ? "buy" : "sell";
    const atr = averageTrueRange(fifteen.slice(0, index + 1), 14);
    const latestClose = decision.close;
    const entryPrice = side === "buy" ? latestClose - 0.25 * atr : latestClose + 0.25 * atr;
    const riskDistance = 1.5 * atr;
    const stopLoss = side === "buy" ? entryPrice - riskDistance : entryPrice + riskDistance;
    const takeProfit1 = side === "buy" ? entryPrice + 0.4 * riskDistance : entryPrice - 0.4 * riskDistance;
    const takeProfit = side === "buy" ? entryPrice + 1.2 * riskDistance : entryPrice - 1.2 * riskDistance;
    const stream = five.filter((entry) => entry.time >= time + MIN15 && entry.time <= time + (REVIEW_HOURS + 24) * HOUR);
    const evaluation = evaluateSetupOutcome(
      {
        created_at: new Date(time).toISOString(),
        limit_entry: entryPrice,
        side,
        stop_loss: stopLoss,
        symbol,
        take_profit: takeProfit,
        take_profit_1: takeProfit1,
      },
      stream,
      Date.UTC(2030, 0, 1),
      {
        barIntervalMs: MIN5,
        reviewHours: REVIEW_HOURS,
        runnerProtection: "breakeven",
        sameBarProtectionArming: true,
        streamStartsAtMs: time + MIN15,
      },
    );
    if (evaluation.state !== "resolved") throw new Error("fixture decision did not resolve");
    const feedback = evaluation.feedback;
    const base: Row = {
      accepted: index % 5 !== 0,
      atr,
      entryPrice,
      estimatedRoundTripCost: 0.05 * atr,
      exitAtMs: Date.parse(evaluation.exitAt),
      filledAtMs: evaluation.filledAt ? Date.parse(evaluation.filledAt) : null,
      latestClose,
      legs: evaluation.legs,
      maxAdverseMove: typeof feedback.maxAdverseMove === "number" ? feedback.maxAdverseMove : null,
      maxFavorableMove: typeof feedback.maxFavorableMove === "number" ? feedback.maxFavorableMove : null,
      outcome: evaluation.outcome,
      realizedR: typeof feedback.realizedR === "number" ? feedback.realizedR : 0,
      resolutionIntervalMs: MIN5,
      riskDistance,
      side,
      split: splitOf(time),
      stopLoss,
      symbol,
      takeProfit,
      takeProfit1,
      time,
      variant: "baseline",
    };
    rows.push(base);
    // A second grid cell the shipped family must not read.
    rows.push({ ...base, side: side === "buy" ? "sell" : "buy", variant: "runnerProtection=hold" });
  }
  return rows;
}

/**
 * Select and confirm rows the reader must never read, on days the cache does
 * not hold: a reader that took them would find no decision bar and report the
 * row unanchored.
 */
function outOfFitRows(symbol: string): Row[] {
  const rows: Row[] = [];
  for (let time = SELECT_START + 8 * DAY; time < END - EMBARGO; time += 6 * HOUR) {
    rows.push({
      accepted: true,
      atr: 0.001,
      entryPrice: 1,
      estimatedRoundTripCost: 0.00005,
      exitAtMs: time + 8 * HOUR,
      filledAtMs: null,
      latestClose: 1,
      legs: [],
      maxAdverseMove: 0,
      maxFavorableMove: 0,
      outcome: "unfilled",
      realizedR: 0,
      resolutionIntervalMs: MIN5,
      riskDistance: 0.0015,
      side: "buy",
      split: splitOf(time),
      stopLoss: 0.9985,
      symbol,
      takeProfit: 1.002,
      takeProfit1: 1.0006,
      time,
      variant: "baseline",
    });
  }
  return rows;
}

type Fixture = { cache: string; corpus: string; dir: string; fitDecisions: Map<string, number>; fitDays: Map<string, number>; witness: string };

function buildFixture(shippedSide: "blind" | "look-ahead" = "blind"): Fixture {
  const dir = scratchDir("entry-screen-");
  const cache = join(dir, "cache");
  mkdirSync(cache);
  const rows: Row[] = [];
  const fitDecisions = new Map<string, number>();
  const fitDays = new Map<string, number>();
  SYMBOLS.forEach(({ price, symbol, volatility }, symbolIndex) => {
    const { five, fifteen } = marketBars(101 + symbolIndex, price, volatility);
    writePinnedStore(cache, `${symbol}-5min-${DEPTH}`, ANCHOR, five);
    writePinnedStore(cache, `${symbol}-15min-${DEPTH}`, ANCHOR, fifteen);
    const market = marketRows(symbol, symbolIndex, five, fifteen, shippedSide)
      .filter((row) => (row.time as number) <= SELECT_START - EMBARGO);
    rows.push(...market, ...outOfFitRows(symbol));
    const shipped = market.filter((row) => row.variant === "baseline" && row.accepted === true);
    fitDecisions.set(symbol, shipped.length);
    fitDays.set(symbol, new Set(shipped.map((row) => Math.floor((row.time as number) / DAY))).size);
  });
  const corpus = join(dir, "capture-all.jsonl");
  writeFileSync(corpus, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const manifest = buildSweepManifest({
    acceptance: { captureAll: true, ignoreLowEdge: false },
    analyzerVersion: "2026.09.22.entry-screen-test",
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
    days: DEPTH,
    emitColumns: Object.keys(rows[0]).sort(),
    folds: [
      { decisionEndMs: SELECT_START - EMBARGO, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - EMBARGO, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - EMBARGO, endMs: END, name: "confirm", startMs: CONFIRM_START },
    ],
    generatedAt: "2026-09-22T12:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    requestedSymbols: SYMBOLS.map(({ symbol }) => symbol),
    stepBars: 16,
    symbols: SYMBOLS.map(({ symbol }) => ({
      calibration: {},
      providerSymbol: symbol,
      series: { "15min": seriesFacts(rows.filter((row) => row.symbol === symbol).map((row) => ({ time: row.time as number })), "intraday") },
      symbol,
    })),
    trainShare: 0.5,
    treasuryCurve: { count: 3_000, firstTime: Date.UTC(2013, 0, 2), largestGapMs: 4 * DAY, lastTime: Date.UTC(2027, 0, 1) },
    warmupBars: 240,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${corpus}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  const witness = join(dir, "feed-character.txt");
  writeFileSync(witness, SYMBOLS.map(({ symbol }) => `${symbol} 5min contained`).join("\n") + "\n");
  return { cache, corpus, dir, fitDecisions, fitDays, witness };
}

type Run = { code: number; stderr: string; stdout: string };

async function runScreen(args: readonly string[], cwd: string): Promise<Run> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...noKeychainEnv() };
  delete env.FMP_API_KEY;
  delete env.TSX_TSCONFIG_PATH;
  try {
    const { stderr, stdout } = await execFileAsync(TSX, [SCRIPT, ...args], {
      cwd,
      encoding: "utf8",
      env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 240_000,
    });
    return { code: 0, stderr, stdout };
  } catch (error) {
    const failed = error as { code?: number; signal?: string; stderr?: string; stdout?: string };
    assert.equal(failed.signal ?? null, null, `the screen was killed (${failed.signal}) — a timeout is not a verdict`);
    assert.equal(typeof failed.code, "number", "the spawn itself failed");
    return { code: failed.code as number, stderr: String(failed.stderr ?? ""), stdout: String(failed.stdout ?? "") };
  }
}

type TableLine = {
  clusters: number;
  decisions: number;
  family: string;
  floorAtr: number;
  floorR: number;
  lower: number;
  market: string;
  mean: number;
  verdict: string;
};

function tableLines(stdout: string): TableLine[] {
  return stdout.split("\n")
    .filter((line) => /^(look-ahead|coin-flip|shipped) +[A-Z0-9^]+ /.test(line))
    .map((line) => {
      const cells = line.trim().split(/ +/);
      return {
        clusters: Number(cells[4]),
        decisions: Number(cells[3]),
        family: cells[0],
        floorAtr: Number(cells[9]),
        floorR: Number(cells[10]),
        lower: Number(cells[6]),
        market: cells[1],
        mean: Number(cells[5]),
        verdict: cells.slice(11).join(" "),
      };
    });
}

function controlState(stdout: string, name: string): string | undefined {
  return new RegExp(`^control ${name} +(HOLDS|FAILS|NO VERDICT)`, "m").exec(stdout)?.[1];
}

describe("the screen, executed on a hand-built corpus and cache", { concurrency: 1 }, () => {
  const fixture = buildFixture();
  const cwd = scratchDir("entry-screen-cwd-");
  const base = ["--corpus", fixture.corpus, "--cache-dir", fixture.cache, "--witness", fixture.witness];
  let run: Run | undefined;
  const once = async () => (run ??= await runScreen([...base, "--window-hours", String(REVIEW_HOURS)], cwd));

  it("fixture premise: every market has at least 30 fit day clusters", () => {
    for (const { symbol } of SYMBOLS) {
      assert.ok(fixture.fitDays.get(symbol)! >= 30, `${symbol}: ${fixture.fitDays.get(symbol)} days`);
    }
  });

  it("exits 0 and every control holds", async () => {
    const got = await once();
    assert.equal(got.code, 0, `stdout:\n${got.stdout}\nstderr:\n${got.stderr}`);
    assert.equal(controlState(got.stdout, "look-ahead"), "HOLDS", got.stdout);
    assert.equal(controlState(got.stdout, "coin-flip"), "HOLDS", got.stdout);
    assert.equal(controlState(got.stdout, "shipped"), "HOLDS", got.stdout);
    assert.equal(controlState(got.stdout, "censoring"), "HOLDS", got.stdout);
  });

  it("the look-ahead family passes wide and the coin flip fails, market by market", async () => {
    const lines = tableLines((await once()).stdout);
    for (const { symbol } of SYMBOLS) {
      const ahead = lines.find((line) => line.family === "look-ahead" && line.market === symbol);
      const coin = lines.find((line) => line.family === "coin-flip" && line.market === symbol);
      const shipped = lines.find((line) => line.family === "shipped" && line.market === symbol);
      assert.ok(ahead && coin && shipped, `${symbol} is missing a family line`);
      assert.equal(ahead.verdict, "PASS");
      assert.ok(ahead.lower > ahead.floorAtr + 0.5, `${symbol} look-ahead lower ${ahead.lower} is not wide of floor ${ahead.floorAtr}`);
      assert.equal(coin.verdict, "FAIL");
      assert.equal(shipped.verdict, "FAIL");
      assert.ok(Math.abs(shipped.mean) < 0.5, `${symbol} shipped reads ${shipped.mean}, not about zero`);
    }
  });

  it("reads the fit fold's shipped decisions and nothing else, clustered by day", async () => {
    const lines = tableLines((await once()).stdout);
    for (const { symbol } of SYMBOLS) {
      const shipped = lines.find((line) => line.family === "shipped" && line.market === symbol)!;
      assert.equal(shipped.decisions, fixture.fitDecisions.get(symbol), `${symbol} decisions`);
      assert.equal(shipped.clusters, fixture.fitDays.get(symbol), `${symbol} day clusters`);
    }
  });

  it("prints the floor in both units", async () => {
    const lines = tableLines((await once()).stdout);
    for (const line of lines) {
      // cost 0.05 ATR by construction; risk 1.5 ATR, so the R floor is a third of it.
      assert.ok(Math.abs(line.floorAtr - 0.05) < 1e-4, `floor ATR ${line.floorAtr}`);
      assert.ok(Math.abs(line.floorR - 0.05 / 1.5) < 1e-4, `floor R ${line.floorR}`);
    }
  });

  it("reproduces the corpus's censored excursions on its row sample", async () => {
    const stdout = (await once()).stdout;
    const censoring = /^control censoring +HOLDS — (\d+) of (\d+) attempted/m.exec(stdout);
    assert.ok(censoring, stdout);
    assert.equal(censoring[1], censoring[2]);
    assert.ok(Number(censoring[2]) >= 100, `sampled ${censoring[2]}`);
  });

  it("names what it withheld and what it screens", async () => {
    const stdout = (await once()).stdout;
    assert.match(stdout, /controls only/);
    assert.match(stdout, /no family is screened/i);
    assert.match(stdout, /K = 20/);
    assert.match(stdout, /W = 8h/);
  });

  it("drops a market's escaping months from its decisions and from its null", async () => {
    const witness = join(fixture.dir, "feed-character-escaping.txt");
    writeFileSync(
      witness,
      "EURUSD 5min contained\nGBPUSD 5min contained\n  2024 days 1\n    HIDDEN INSIDE A CONTAINED YEAR — months 202402: 202402 range 1 bar 1 (x)\n",
    );
    const got = await runScreen(["--corpus", fixture.corpus, "--cache-dir", fixture.cache, "--witness", witness, "--window-hours", "8"], cwd);
    assert.equal(got.code, 0, got.stderr);
    const shipped = tableLines(got.stdout).find((line) => line.family === "shipped" && line.market === "GBPUSD")!;
    assert.ok(shipped.decisions < fixture.fitDecisions.get("GBPUSD")!, `GBPUSD kept ${shipped.decisions}`);
    const euro = tableLines(got.stdout).find((line) => line.family === "shipped" && line.market === "EURUSD")!;
    assert.equal(euro.decisions, fixture.fitDecisions.get("EURUSD"));
  });

  it("refuses a window longer than the fold's embargo, and a missing or non-positive window", async () => {
    const tooLong = await runScreen([...base, "--window-hours", String(5 * 24 + 1)], cwd);
    assert.notEqual(tooLong.code, 0);
    assert.match(tooLong.stderr, /embargo/);
    const missing = await runScreen(base, cwd);
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr, /--window-hours/);
    const zero = await runScreen([...base, "--window-hours", "0"], cwd);
    assert.notEqual(zero.code, 0);
    assert.match(zero.stderr, /--window-hours must be a positive number of wall-clock hours and got 0/);
  });

  it("refuses to screen a row the cache does not reproduce, and exits 4 saying so", async () => {
    const dir = join(fixture.dir, "unanchored");
    mkdirSync(dir);
    const corpus = join(dir, "capture-all.jsonl");
    let moved = false;
    const lines = readFileSync(fixture.corpus, "utf8").trim().split("\n").map((line) => {
      const row = JSON.parse(line) as Row;
      if (!moved && row.symbol === "EURUSD" && row.split === "fit" && row.variant === "baseline" && row.accepted === true) {
        moved = true;
        return JSON.stringify({ ...row, atr: (row.atr as number) * 1.001 });
      }
      return line;
    });
    writeFileSync(corpus, lines.join("\n") + "\n");
    copyFileSync(`${fixture.corpus}.manifest.json`, `${corpus}.manifest.json`);
    const got = await runScreen(["--corpus", corpus, "--cache-dir", fixture.cache, "--witness", fixture.witness, "--window-hours", "8"], cwd);
    assert.equal(got.code, 4, `stdout:\n${got.stdout}\nstderr:\n${got.stderr}`);
    assert.match(got.stderr, /1 shipped rows did not anchor/);
    const euro = got.stdout.split("\n").find((line) => /^EURUSD +forex +\d/.test(line));
    assert.ok(euro, got.stdout);
    const cells = euro.trim().split(/ +/);
    assert.equal(Number(cells[5]), 1, `unanchored column: ${euro}`);
    const shipped = tableLines(got.stdout).find((line) => line.family === "shipped" && line.market === "EURUSD")!;
    assert.equal(shipped.decisions, fixture.fitDecisions.get("EURUSD")! - 1);
  });

  it("refuses an unpinned market by name and buys nothing", async () => {
    const bare = join(fixture.dir, "bare-cache");
    mkdirSync(bare);
    for (const name of readdirSync(fixture.cache).filter((file) => file.startsWith("EURUSD"))) {
      copyFileSync(join(fixture.cache, name), join(bare, name));
    }
    const got = await runScreen(["--corpus", fixture.corpus, "--cache-dir", bare, "--witness", fixture.witness, "--window-hours", "8"], cwd);
    assert.equal(got.code, 4, `stdout:\n${got.stdout}\nstderr:\n${got.stderr}`);
    assert.match(got.stderr, /GBPUSD/);
    assert.match(got.stderr, /not pinned/);
    assert.deepEqual(readdirSync(bare).sort(), readdirSync(fixture.cache).filter((file) => file.startsWith("EURUSD")).sort());
    assert.match(got.stdout, /^not screened: 1 not pinned, 0 the witness cannot place/m);
  });

  /**
   * A copy of the fixture's corpus with each row passed through `edit`, the
   * manifest beside it unchanged. The fixture manifest records no emit digest,
   * so the door verifies the manifest and reads the edited rows.
   */
  const editedCorpus = (name: string, edit: (row: Row) => Row): string => {
    const dir = join(fixture.dir, name);
    mkdirSync(dir);
    const corpus = join(dir, "capture-all.jsonl");
    const lines = readFileSync(fixture.corpus, "utf8").trim().split("\n").map((line) => JSON.stringify(edit(JSON.parse(line) as Row)));
    writeFileSync(corpus, lines.join("\n") + "\n");
    copyFileSync(`${fixture.corpus}.manifest.json`, `${corpus}.manifest.json`);
    return corpus;
  };
  const isShippedFit = (row: Row) => row.split === "fit" && row.variant === "baseline" && row.accepted === true;

  it("exits 3 and says so when the censoring control fails on an attempted row", async () => {
    let tampered = false;
    const corpus = editedCorpus("censoring-fails", (row) => {
      if (tampered || !isShippedFit(row) || row.filledAtMs === null || row.symbol !== "GBPUSD") return row;
      tampered = true;
      return { ...row, maxFavorableMove: (row.maxFavorableMove as number) + 0.001 };
    });
    assert.ok(tampered, "the fixture holds no filled GBPUSD row to tamper");
    const got = await runScreen(["--corpus", corpus, "--cache-dir", fixture.cache, "--witness", fixture.witness, "--window-hours", "8"], cwd);
    assert.equal(got.code, 3, `stdout:\n${got.stdout}\nstderr:\n${got.stderr}`);
    assert.equal(controlState(got.stdout, "censoring"), "FAILS", got.stdout);
    const counts = /^control censoring +FAILS — (\d+) of (\d+) attempted/m.exec(got.stdout);
    assert.ok(counts, got.stdout);
    assert.equal(Number(counts[1]), Number(counts[2]) - 1, "exactly the one tampered row mismatches");
    assert.match(got.stdout, /^ {2}mismatch: GBPUSD /m);
    assert.match(got.stdout, /^controls established: NO — a control FAILED; the instrument is not trusted$/m);
    for (const family of ["look-ahead", "coin-flip", "shipped"]) {
      assert.equal(controlState(got.stdout, family), "HOLDS", `${family} moved with a censoring field`);
    }
  });

  it("exits 3 and says so when a family control fails: an engine that sees the future passes", async () => {
    const seeing = buildFixture("look-ahead");
    const got = await runScreen(
      ["--corpus", seeing.corpus, "--cache-dir", seeing.cache, "--witness", seeing.witness, "--window-hours", "8"],
      cwd,
    );
    assert.equal(got.code, 3, `stdout:\n${got.stdout}\nstderr:\n${got.stderr}`);
    assert.equal(controlState(got.stdout, "shipped"), "FAILS", got.stdout);
    assert.equal(controlState(got.stdout, "look-ahead"), "HOLDS", got.stdout);
    assert.equal(controlState(got.stdout, "coin-flip"), "HOLDS", got.stdout);
    assert.equal(controlState(got.stdout, "censoring"), "HOLDS", got.stdout);
    assert.match(got.stdout, /^controls established: NO — a control FAILED; the instrument is not trusted$/m);
    for (const { symbol } of SYMBOLS) {
      const shipped = tableLines(got.stdout).find((line) => line.family === "shipped" && line.market === symbol)!;
      assert.equal(shipped.verdict, "PASS", `${symbol}: the seeing engine did not pass`);
    }
  });

  it("keeps the rows it could not re-resolve apart from mismatches, and still holds", async () => {
    const edits = new Map<string, (row: Row) => Row>([
      ["tier", (row) => ({ ...row, resolutionIntervalMs: 60_000 })],
      ["noExitLeg", (row) => ({ ...row, legs: (row.legs as Array<{ leg: string }>).filter((leg) => leg.leg !== "exit") })],
      ["noFillBar", (row) => ({ ...row, filledAtMs: (row.filledAtMs as number) + 60_000 })],
      ["noExcursion", (row) => ({ ...row, maxAdverseMove: null })],
    ]);
    const pending = [...edits.keys()];
    const corpus = editedCorpus("not-attempted", (row) => {
      if (pending.length === 0 || !isShippedFit(row) || row.filledAtMs === null) return row;
      return edits.get(pending.shift()!)!(row);
    });
    assert.deepEqual(pending, [], "the fixture ran out of filled rows to edit");
    const got = await runScreen(["--corpus", corpus, "--cache-dir", fixture.cache, "--witness", fixture.witness, "--window-hours", "8"], cwd);
    assert.equal(got.code, 0, `stdout:\n${got.stdout}\nstderr:\n${got.stderr}`);
    const line = /^control censoring +HOLDS — (\d+) of (\d+) attempted .*; (\d+) drawn, (\d+) in screened markets; not attempted: (\d+) on another tier, (\d+) with no exit leg, (\d+) whose fill bar the series lacks, (\d+) with no excursion to compare\)$/m
      .exec(got.stdout);
    assert.ok(line, got.stdout);
    const [, matched, attempted, , sampled, tier, noExit, noFill, noExcursion] = line.map(Number);
    assert.equal(matched, attempted);
    assert.deepEqual([tier, noExit, noFill, noExcursion], [1, 1, 1, 1]);
    assert.equal(attempted, sampled - 4, "a row not attempted was counted as attempted");
  });

  it("exits 2 with nothing to screen and prints no table", async () => {
    const corpus = editedCorpus("nothing", (row) => (isShippedFit(row) ? { ...row, accepted: false } : row));
    const got = await runScreen(["--corpus", corpus, "--cache-dir", fixture.cache, "--witness", fixture.witness, "--window-hours", "8"], cwd);
    assert.equal(got.code, 2, `stdout:\n${got.stdout}\nstderr:\n${got.stderr}`);
    assert.match(got.stderr, /holds no shipped fit decision .* nothing to screen/);
    assert.equal(got.stdout.trim(), "");
  });

  it("refuses a run with no --cache-dir, or one naming a directory that does not exist, and creates nothing", async () => {
    const empty = scratchDir("entry-screen-nocache-");
    const unnamed = await runScreen(["--corpus", fixture.corpus, "--witness", fixture.witness, "--window-hours", "8"], empty);
    assert.notEqual(unnamed.code, 0);
    assert.match(unnamed.stderr, /--cache-dir is required/);
    assert.deepEqual(readdirSync(empty), [], "a run with no --cache-dir wrote into its working directory");
    const absent = join(empty, "no-such-cache");
    const missing = await runScreen(
      ["--corpus", fixture.corpus, "--cache-dir", absent, "--witness", fixture.witness, "--window-hours", "8"],
      empty,
    );
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr, /--cache-dir .*no-such-cache does not exist — this reader creates nothing/);
    assert.deepEqual(readdirSync(empty), [], "a refused --cache-dir was created");
  });

  it("exits 4 when the witness cannot place a market, and names it on stderr", async () => {
    const witness = join(fixture.dir, "feed-character-no-gbp.txt");
    writeFileSync(witness, "EURUSD 5min contained\n");
    const got = await runScreen(["--corpus", fixture.corpus, "--cache-dir", fixture.cache, "--witness", witness, "--window-hours", "8"], cwd);
    assert.equal(got.code, 4, `stdout:\n${got.stdout}\nstderr:\n${got.stderr}`);
    assert.match(got.stdout, /^not screened: 0 not pinned, 1 the witness cannot place — named on stderr$/m);
    assert.match(got.stderr, /1 of 2 markets have no month map the witness will vouch for and were NOT screened/);
    assert.match(got.stderr, /^ {2}GBPUSD: /m);
    assert.equal(tableLines(got.stdout).filter((line) => line.market === "GBPUSD").length, 0);
    assert.equal(controlState(got.stdout, "censoring"), "HOLDS", got.stdout);
  });
});
