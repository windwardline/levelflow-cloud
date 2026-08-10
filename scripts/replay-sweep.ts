// Replay-sweep calibration harness.
//
// Regenerates historical setups with the live analyzer pipeline across a
// calibration grid, walk-forward split, and reports TP1 hit rate, stop rate,
// and expectancy per symbol and variant. No parameter should reach
// calibration.ts without a positive out-of-sample expectancy here.
//
// Usage:
//   FMP_API_KEY=... npx tsx scripts/replay-sweep.ts \
//     --symbols EURUSD,XAUUSD,SP --days 60 \
//     --grid tp1AtrMultiplier=0.5,0.7,0.9 [--step 16]
//     [--cache-dir path]   pin bars to disk so later runs reuse identical data
//     [--capture-all]      evaluate below-threshold setups too (calibration)
//     [--emit path.jsonl]  write one JSON line per evaluated setup
//     [--days max]         discover each symbol's full history (rolling from
//                          the run date) instead of a fixed lookback
//     [--discover]         report discovered depth per symbol and exit

import {
  ANALYZER_VERSION,
  type CategoryCalibration,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { buildSweepManifest, seriesFacts, type SeriesFacts } from "./sweepManifest.ts";
import { calendarFolds, foldSplits, isHoldoutSymbol } from "./sweepFolds.ts";
import { parseGridSpec } from "./sweepGrid.ts";
import {
  DEFAULT_CACHE_DIR,
  loadRollingSeries,
} from "./calibrationCache.ts";
import {
  combineCotSeries,
  type CotReportRow,
  getCotContractMapping,
  netPctFromReport,
} from "../supabase/functions/trade-analyzer/cotContext.ts";
import type { SweepNewsEvent } from "../supabase/functions/trade-analyzer/sweep.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import { resolveProviderSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  type FmpBar,
  normalizeFmpBars,
} from "../supabase/functions/trade-analyzer/bars.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

const FMP_API_BASE_URL = "https://financialmodelingprep.com/stable";
const API_KEY = process.env.FMP_API_KEY;
const WARMUP_BARS = 240;
// Legacy two-split share, retired by the calendar folds below; still
// recorded in the manifest so legacy-corpus readers can state what they
// read.
const TRAIN_SHARE = 0.6;
// 3c: every fold's decisions end this long before the fold closes, so
// every setup a fold decides resolves inside it. Sized at indicator
// warm-up (240 x 15min = 2.5 days) + the longest review window (24h,
// ZOUSX) + weekend slack.
const FOLD_EMBARGO_MS = 5 * 86_400_000;

type SweepArgs = {
  cacheDir: string | undefined;
  captureAll: boolean;
  ignoreLowEdge: boolean;
  warmOnly: boolean;
  days: number;
  discover: boolean;
  emit: string | undefined;
  grid: Array<Partial<CategoryCalibration>>;
  step: number;
  symbols: string[];
};

async function main() {
  if (!API_KEY) {
    console.error("FMP_API_KEY is required.");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  // Durable by default (r17 hardening): mornings reuse the rolling store
  // and top up incrementally instead of refetching whole windows.
  args.cacheDir = args.cacheDir ?? DEFAULT_CACHE_DIR;
  const rows: string[][] = [[
    "symbol",
    "variant",
    "split",
    "decisions",
    "sessionBlk",
    "newsBlk",
    "notWarm",
    "regimeBlk",
    "noConsensus",
    "planRejected",
    "belowConf",
    "belowPayoff",
    "setups",
    "unfilled",
    "tp1HitRate",
    "stopRate",
    "expectancyR",
  ]];

  // Emit rows stream to disk as they are produced, and the manifest holds
  // FACTS per series, never the bars: the first baseline attempt kept every
  // symbol's full arrays (and every emit line) alive to the end of the run
  // and died at the 4GB default heap ~48 minutes in.
  const { createWriteStream } = await import("node:fs");
  const emitStream = args.emit ? createWriteStream(args.emit) : null;
  let emittedRecords = 0;
  const manifestSymbols: Array<{
    calibration: Record<string, unknown>;
    providerSymbol: string;
    series: Record<string, SeriesFacts>;
    symbol: string;
  }> = [];
  const newsEvents = args.discover
    ? []
    : await loadEconomicCalendar(args.cacheDir);

  // 3c/3d: folds are COMMON-ORIGIN calendar windows over the corpus's own
  // measured span — every symbol shares the same three boundaries, so
  // "select R" is one calendar period, never a sum across disjoint years.
  // The pre-pass reads the same rolling caches the main loop reads (disk
  // hits after first load), so its cost is one warm pass.
  let folds: ReturnType<typeof calendarFolds> = [];
  const holdoutSymbols: string[] = [];
  if (!args.discover && !args.warmOnly) {
    let spanStart = Number.POSITIVE_INFINITY;
    let spanEnd = Number.NEGATIVE_INFINITY;
    const anchor = isoDate(new Date());
    for (const symbol of args.symbols) {
      const providerSymbol = resolveProviderSymbols(symbol)[0];
      if (!providerSymbol) continue;
      const bars = await loadRollingSeries<Bar>({
        anchor,
        cacheDir: args.cacheDir!,
        fetchFull: () => fetchIntradayBars(providerSymbol, args.days),
        fetchSince: (sinceMs) =>
          fetchIntradayBars(providerSymbol, args.days, sinceMs),
        key: `${providerSymbol}-15min-${args.days}`,
        legacyPrefix: `${providerSymbol}-15min-${args.days}-`,
        timeOf: (bar) => bar.time,
      });
      if (bars.length > 0) {
        spanStart = Math.min(spanStart, bars[0].time);
        spanEnd = Math.max(spanEnd, bars.at(-1)!.time);
      }
    }
    if (!Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) {
      console.error("No bars in any symbol's cache — nothing to fold.");
      process.exit(1);
    }
    folds = calendarFolds({
      corpusEndMs: spanEnd,
      corpusStartMs: spanStart,
      embargoMs: FOLD_EMBARGO_MS,
    });
    console.log(
      folds.map((fold) =>
        `${fold.name}: ${isoDate(new Date(fold.startMs))} .. ${
          isoDate(new Date(fold.endMs))
        } (decisions to ${isoDate(new Date(fold.decisionEndMs))})`
      ).join("\n"),
    );
  }

  for (const symbol of args.symbols) {
    const providerSymbol = resolveProviderSymbols(symbol)[0];
    if (!providerSymbol) {
      console.warn(`Skipping ${symbol}: no provider symbol.`);
      continue;
    }
    // Cache keys carry the run-day anchor: the replay window is always
    // relative to now, so a later day's run refetches the rolled-forward
    // window while same-day runs stay pinned for drift-free A/B.
    const anchor = isoDate(new Date());
    const [primaryBars, dailyBars, fiveMinuteBars] = await Promise.all([
      loadRollingSeries<Bar>({
        anchor,
        cacheDir: args.cacheDir!,
        fetchFull: () => fetchIntradayBars(providerSymbol, args.days),
        fetchSince: (sinceMs) =>
          fetchIntradayBars(providerSymbol, args.days, sinceMs),
        key: `${providerSymbol}-15min-${args.days}`,
        legacyPrefix: `${providerSymbol}-15min-${args.days}-`,
        timeOf: (bar) => bar.time,
      }),
      loadRollingSeries<Bar>({
        anchor,
        cacheDir: args.cacheDir!,
        fetchFull: () => fetchDailyBars(providerSymbol, args.days + 240),
        fetchSince: (sinceMs) =>
          fetchDailyBars(providerSymbol, args.days + 240, sinceMs),
        key: `${providerSymbol}-daily-${args.days}`,
        legacyPrefix: `${providerSymbol}-daily-${args.days}-`,
        timeOf: (bar) => bar.time,
      }),
      // 2l: the committee's real 5min series. FMP's 5min depth is shallower
      // than 15min for most symbols; early decision points simply fall below
      // the 40-bar floor and vote four-frame, the same degradation a thin
      // live fetch produces. The corpus manifest records the measured depth.
      loadRollingSeries<Bar>({
        anchor,
        cacheDir: args.cacheDir!,
        fetchFull: () =>
          fetchIntradayBars(providerSymbol, args.days, undefined, "5min"),
        fetchSince: (sinceMs) =>
          fetchIntradayBars(providerSymbol, args.days, sinceMs, "5min"),
        key: `${providerSymbol}-5min-${args.days}`,
        legacyPrefix: `${providerSymbol}-5min-${args.days}-`,
        timeOf: (bar) => bar.time,
      }),
    ]);
    if (args.discover) {
      const first = primaryBars[0];
      const last = primaryBars.at(-1);
      const span = first && last
        ? Math.round((last.time - first.time) / 86_400_000)
        : 0;
      console.log(
        `${symbol}\t${providerSymbol}\t${primaryBars.length}\t${
          first ? isoDate(new Date(first.time)) : "-"
        }\t${span}`,
      );
      continue;
    }

    if (primaryBars.length < WARMUP_BARS * 2) {
      console.warn(
        `Skipping ${symbol}: only ${primaryBars.length} intraday bars.`,
      );
      continue;
    }

    const cotReports = await loadCotReports(args.cacheDir, symbol);

    manifestSymbols.push({
      calibration: {
        ...getCategoryCalibration(symbol),
      } as unknown as Record<string, unknown>,
      providerSymbol,
      series: {
        "15min": seriesFacts(primaryBars),
        "1day": seriesFacts(dailyBars),
        "5min": seriesFacts(fiveMinuteBars),
      },
      symbol,
    });

    // --warm-only: the daily top-up path. Caches are now loaded (and
    // therefore topped up and pinned for today) — no simulation.
    if (args.warmOnly) {
      console.log(
        `${symbol}\twarm\t${primaryBars.length} intraday bars through ${
          isoDate(new Date(primaryBars.at(-1)?.time ?? 0))
        }`,
      );
      continue;
    }

    const holdout = isHoldoutSymbol(symbol);
    if (holdout) holdoutSymbols.push(symbol);
    // Shared fold slicing (sweepFolds.foldSplits): warm-up floors inside
    // the fold when history starts mid-fold, thin folds dropped.
    const splits = foldSplits(primaryBars, folds, WARMUP_BARS);

    for (const override of args.grid) {
      const variant = describeOverride(override);
      for (const split of splits) {
        const result = simulateSymbol({
          calibrationOverride: override,
          captureAll: args.captureAll,
          ignoreLowEdge: args.ignoreLowEdge,
          cotReports,
          dailyBars,
          decisionEndMs: split.decisionEndMs,
          fiveMinuteBars,
          newsEvents,
          primaryBars: split.bars,
          stepBars: args.step,
          symbol,
          warmupBars: split.warmupBars,
        });
        if (emitStream) {
          for (const record of result.outcomes) {
            emitStream.write(JSON.stringify({
              holdout,
              split: split.name,
              symbol,
              variant,
              ...record,
            }) + "\n");
            emittedRecords += 1;
          }
        }
        rows.push([
          symbol,
          variant,
          split.name,
          String(result.decisionPoints),
          String(result.rejections.sessionBlocked),
          String(result.rejections.newsBlocked),
          String(result.rejections.notWarm),
          String(result.rejections.regimeBlocked + result.rejections.regimeGated),
          String(result.rejections.noConsensus),
          String(result.rejections.planRejected),
          String(result.rejections.belowConfidence),
          String(result.rejections.belowPayoff),
          String(result.summary.total),
          String(result.summary.unfilled),
          formatRate(result.summary.tp1HitRate),
          formatRate(result.summary.stopRate),
          result.summary.expectancyR.toFixed(3),
        ]);
      }
    }
  }

  printTable(rows);
  if (args.emit && emitStream) {
    await new Promise<void>((resolve, reject) => {
      emitStream.end((error: unknown) => error ? reject(error) : resolve());
    });
    const { writeFile } = await import("node:fs/promises");
    // 2i: the corpus describes itself, or item 3's readers refuse it.
    const manifest = buildSweepManifest({
      analyzerVersion: ANALYZER_VERSION,
      anchor: isoDate(new Date()),
      barRejections: barRejectionTally,
      days: args.days,
      folds,
      generatedAt: new Date().toISOString(),
      grid: args.grid,
      holdoutSymbols: [...holdoutSymbols].sort(),
      stepBars: args.step,
      symbols: manifestSymbols,
      trainShare: TRAIN_SHARE,
      warmupBars: WARMUP_BARS,
    });
    await writeFile(
      `${args.emit}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    console.log(
      `Emitted ${emittedRecords} setup records to ${args.emit} (manifest ${
        manifest.manifestHash.slice(0, 12)
      })`,
    );
  }
}

// Scheduled macro calendar for the replay news join. FMP coverage begins in
// 2013; earlier decision points simply see no events, matching the live
// system's behavior when no events exist. Cached per run day like bars.
async function loadEconomicCalendar(
  cacheDir: string | undefined,
): Promise<SweepNewsEvent[]> {
  const anchor = isoDate(new Date());
  return loadRollingSeries<SweepNewsEvent>({
    anchor,
    cacheDir: cacheDir ?? DEFAULT_CACHE_DIR,
    fetchFull: () => fetchCalendarEvents(Date.parse("2013-01-01T00:00:00Z")),
    fetchSince: (sinceMs) => fetchCalendarEvents(sinceMs),
    key: "econ-calendar",
    legacyPrefix: "econ-calendar-",
    timeOf: (event) => event.time,
  });
}

async function fetchCalendarEvents(
  startMs: number,
): Promise<SweepNewsEvent[]> {
  const events: SweepNewsEvent[] = [];
  const start = startMs;
  const chunkMs = 90 * 86_400_000;
  for (let from = start; from < Date.now(); from += chunkMs) {
    const endpoint = new URL(`${FMP_API_BASE_URL}/economic-calendar`);
    endpoint.searchParams.set("from", isoDate(new Date(from)));
    endpoint.searchParams.set(
      "to",
      isoDate(new Date(Math.min(from + chunkMs, Date.now()))),
    );
    endpoint.searchParams.set("apikey", API_KEY!);
    const response = await fetch(endpoint);
    if (!response.ok) {
      // I3: this used to warn and `continue`. loadRollingSeries then merged the
      // holed result and pinned it as the anchor day's truth, and because later
      // runs only top up from the last stored time, the dropped 90-day window
      // was never refetched — one transient provider failure permanently holed
      // the news join under every future walk-forward measurement, with no
      // coverage signal anywhere in the output. fetchBars has always thrown for
      // exactly this reason: a run that cannot see the whole calendar has to
      // stop rather than quietly measure against part of it.
      throw new Error(
        `Calendar fetch failed (${response.status}) for ${
          endpoint.searchParams.get("from")
        }..${endpoint.searchParams.get("to")}`,
      );
    }
    const payload = await response.json();
    if (Array.isArray(payload)) {
      for (const raw of payload as Array<Record<string, unknown>>) {
        const impact = String(raw.impact ?? "").toLowerCase();
        if (impact !== "high" && impact !== "medium") {
          continue;
        }
        const time = Date.parse(
          String(raw.date ?? "").replace(" ", "T") + "Z",
        );
        const currency = String(raw.currency ?? "").toUpperCase();
        if (Number.isFinite(time) && currency) {
          events.push({ currency, impact, time });
        }
      }
    }
    await sleep(150);
  }
  events.sort((first, second) => first.time - second.time);
  console.log(`Fetched ${events.length} medium/high scheduled events.`);
  return events;
}

// Positioning history is weekly and slow-moving, so it caches by contract
// (not by run day) and is shared across every symbol that maps to it.
async function loadCotReports(
  cacheDir: string | undefined,
  symbol: string,
): Promise<CotReportRow[]> {
  const mapping = getCotContractMapping(symbol);
  if (!mapping) {
    return [];
  }
  const [primary, secondary] = await Promise.all([
    fetchCotContract(cacheDir, mapping.primary),
    mapping.secondary
      ? fetchCotContract(cacheDir, mapping.secondary)
      : Promise.resolve([]),
  ]);
  if (primary.length === 0) {
    return [];
  }
  return combineCotSeries(
    primary,
    mapping.secondary ? secondary : undefined,
    mapping.invert,
  );
}

async function fetchCotContract(
  cacheDir: string | undefined,
  contract: string,
): Promise<CotReportRow[]> {
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const path = cacheDir ? `${cacheDir}/cot-${contract}.json` : null;
  if (path) {
    try {
      const cached = JSON.parse(await readFile(path, "utf8")) as CotReportRow[];
      if (Array.isArray(cached)) {
        return cached;
      }
    } catch {
      // Cache miss: fetch below.
    }
  }

  const endpoint = new URL(`${FMP_API_BASE_URL}/commitment-of-traders-report`);
  endpoint.searchParams.set("symbol", contract);
  endpoint.searchParams.set("from", "2009-01-01");
  endpoint.searchParams.set("to", isoDate(new Date()));
  endpoint.searchParams.set("apikey", API_KEY!);
  const response = await fetch(endpoint);
  if (!response.ok) {
    console.warn(`COT fetch failed for ${contract}: ${response.status}`);
    return [];
  }
  const payload = await response.json();
  const rows: CotReportRow[] = [];
  if (Array.isArray(payload)) {
    for (const raw of payload as Array<Record<string, unknown>>) {
      const netPct = netPctFromReport(raw);
      const date = Date.parse(String(raw.date ?? "").replace(" ", "T") + "Z");
      if (netPct !== null && Number.isFinite(date)) {
        rows.push({ date, netPct });
      }
    }
  }
  rows.sort((first, second) => first.date - second.date);
  if (path && rows.length > 0) {
    await mkdir(cacheDir!, { recursive: true });
    await writeFile(path, JSON.stringify(rows));
  }
  await sleep(250);
  return rows;
}


// Grid parsing lives in scripts/sweepGrid.ts (4c: numeric axes plus the
// validated runnerProtection string axis), importable without running
// this script's main.

function parseArgs(argv: string[]): SweepArgs {
  const get = (flag: string) => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const symbols = (get("symbols") ?? "EURUSD").split(",").map((value) =>
    value.trim().toUpperCase()
  ).filter(Boolean);
  const daysArg = get("days") ?? "60";
  // "max" discovers each symbol's full available history from the run date.
  const days = daysArg === "max" ? MAX_DEPTH_DAYS : Number(daysArg);
  const step = Number(get("step") ?? 16);
  const gridSpec = get("grid");
  const grid: Array<Partial<CategoryCalibration>> = [{}];
  if (gridSpec) {
    // Semicolon-separated axes, crossed (2026-08-06). One axis stays exactly as
    // before — `key=a,b,c` — so every prior invocation means what it always did.
    //
    // Why the cross product had to exist. Levers downstream of risk are not
    // separable: the runner's minimum distance derives from risk, and the stop
    // cap sets risk, so a one-axis-at-a-time search finds the best value of B at
    // A's OLD setting. Round 26 hit this from the measurement side — the runner
    // grid had to be re-run after the caps moved, and the answer changed. Round
    // 28 hits it from the other side: the cash indices are starved by a
    // COMBINATION (a wide cap puts the pivot far out, a 5-hour window caps the
    // runner near, and no plan can satisfy minimumTargetRewardRisk between
    // them), and no single axis can show that, because each axis alone is
    // starved at every value it tries.
    // Crossed separately from the baseline: seeding the cross with `{}` and then
    // re-crossing `grid` itself would keep re-seeding partial assignments, so a
    // three-axis spec would emit single- and double-axis "variants" alongside the
    // real ones. Every combination here is a full assignment across the named
    // axes, and the baseline is added once at the end.
    grid.push(...parseGridSpec(gridSpec));
  }
  return {
    cacheDir: get("cache-dir"),
    captureAll: argv.includes("--capture-all"),
    ignoreLowEdge: argv.includes("--ignore-low-edge"),
    warmOnly: argv.includes("--warm-only"),
    days,
    discover: argv.includes("--discover"),
    emit: get("emit"),
    grid,
    step,
    symbols,
  };
}

// FMP caps a single intraday response near 3,000 rows. A 30-day window stays
// complete for every supported market (~2,040 forex bars) and cuts request
// count ~4x versus 8-day chunks, which is what makes multi-year depth
// practical.
const INTRADAY_CHUNK_DAYS = 30;
// Walking back stops after this many consecutive empty windows, which is how
// the end of a symbol's history is detected rather than assumed. Three
// windows (90 days) clears any plausible holiday or provider gap.
const EMPTY_WINDOW_STREAK_LIMIT = 3;
// Safety ceiling only — it must never be the binding constraint, so it sits
// above every confirmed provider floor. Measured 2026-07-29 by walking back
// until history ended: forex begins 2010-01 (~6,050 days), XAUUSD 2013-07
// (~4,760), ^GSPC 2020-02 (~2,350), ^NDX 2020-08 (~2,175), crypto and XAGUSD
// ~1,060-1,200, and CME futures 2023-09/10 (~1,031-1,038). Depth is
// discovered per symbol at run time, never assumed.
const MAX_DEPTH_DAYS = 7_000;

// Walks backward from now until history genuinely ends, so every symbol
// contributes its full available depth and the window rolls forward with the
// run date. Depth is discovered per symbol, never hardcoded. The timeframe
// parameter exists for 2l: the committee's 5min series must be a real
// provider series, fetched the same chunked way as the 15min primary.
async function fetchIntradayBars(
  providerSymbol: string,
  days: number,
  sinceMs?: number,
  timeframe: "15min" | "5min" = "15min",
): Promise<Bar[]> {
  const bars: Bar[] = [];
  const ceiling = days >= MAX_DEPTH_DAYS ? MAX_DEPTH_DAYS : days;
  const now = Date.now();
  let emptyStreak = 0;

  for (
    let offset = INTRADAY_CHUNK_DAYS;
    offset <= ceiling + INTRADAY_CHUNK_DAYS;
    offset += INTRADAY_CHUNK_DAYS
  ) {
    const from = new Date(now - offset * 86_400_000);
    const to = new Date(now - (offset - INTRADAY_CHUNK_DAYS) * 86_400_000);
    // Top-up mode: chunks walk backward, so the first chunk that ends
    // before the floor means everything older is already stored.
    if (sinceMs !== undefined && to.getTime() < sinceMs) {
      break;
    }
    const endpoint = new URL(
      `${FMP_API_BASE_URL}/historical-chart/${timeframe}`,
    );
    endpoint.searchParams.set("symbol", providerSymbol);
    endpoint.searchParams.set("from", isoDate(from));
    endpoint.searchParams.set("to", isoDate(to));
    endpoint.searchParams.set("apikey", API_KEY!);
    const chunk = await fetchBars(endpoint);
    if (chunk.length === 0) {
      emptyStreak += 1;
      if (emptyStreak >= EMPTY_WINDOW_STREAK_LIMIT) {
        break;
      }
    } else {
      emptyStreak = 0;
      bars.push(...chunk);
    }
    await sleep(250);
  }
  return dedupeSort(bars);
}

async function fetchDailyBars(
  providerSymbol: string,
  days: number,
  sinceMs?: number,
): Promise<Bar[]> {
  const endpoint = new URL(`${FMP_API_BASE_URL}/historical-price-eod/full`);
  endpoint.searchParams.set("symbol", providerSymbol);
  const floor = Math.max(Date.now() - days * 86_400_000, sinceMs ?? 0);
  endpoint.searchParams.set("from", isoDate(new Date(floor)));
  endpoint.searchParams.set("to", isoDate(new Date()));
  endpoint.searchParams.set("apikey", API_KEY!);
  return dedupeSort(await fetchBars(endpoint));
}

async function fetchBars(endpoint: URL): Promise<Bar[]> {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(
      `FMP request failed (${response.status}) for ${endpoint.pathname}`,
    );
  }
  const payload = await response.json();
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { historical?: unknown[] }).historical)
    ? (payload as { historical: unknown[] }).historical
    : [];
  // 2b + 2h (2026-08-09): this file's own duplicated parse and bare typeof
  // filter are gone — the corpus now enters through the SAME boundary the
  // live analyzer uses (bars.ts: New-York-aware stamps, coherence and spike
  // rejection), and every rejection lands in the tally the manifest carries.
  // A corpus with silent holes was how a 135,533% bar got cemented into the
  // calibration cache with nothing ever refetching it.
  return normalizeFmpBars(
    rows as FmpBar[],
    Number.MAX_SAFE_INTEGER,
    (rejection) => {
      barRejectionTally[rejection.reason] =
        (barRejectionTally[rejection.reason] ?? 0) + 1;
    },
  );
}

/** 2h: every boundary rejection this run, by reason — printed at the end of
 * the run and carried into the corpus manifest (2i). */
export const barRejectionTally: Record<string, number> = {};

function dedupeSort(bars: Bar[]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const bar of bars) {
    byTime.set(bar.time, bar);
  }
  return Array.from(byTime.values()).sort((first, second) =>
    first.time - second.time
  );
}

function describeOverride(override: Partial<CategoryCalibration>) {
  const entries = Object.entries(override);
  return entries.length === 0
    ? "baseline"
    : entries.map(([key, value]) => `${key}=${value}`).join(",");
}

function formatRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

function printTable(rows: string[][]) {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length))
  );
  for (const row of rows) {
    console.log(
      row.map((cell, column) => cell.padEnd(widths[column])).join("  "),
    );
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
