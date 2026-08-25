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
  type AssetType,
  type CategoryCalibration,
  getAssetType,
  getClassCalibration,
  getSymbolCalibrationOverride,
  getCategoryCalibration,
  hasKnownAssetType,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { fetchFmpWithRetry } from "./fmpRetry.ts";
import {
  type ByteBudget,
  parseByteBudgetArg,
  createByteBudget,
  readJsonWithBudget,
} from "./fmpByteBudget.ts";
import { execFileSync } from "node:child_process";
import {
  buildSweepManifest,
  resolveSweepSource,
  type CrossSeriesDensity,
  crossSeriesDensityFacts,
  seriesFacts,
  type SeriesFacts,
  type SweepConditions,
  TREASURY_FETCH_START_MS,
  treasuryChunkRefusal,
  treasuryCurveFacts,
  treasuryGapTouching,
} from "./sweepManifest.ts";
import {
  type DatedTreasuryRow,
  parseTreasuryRow,
  treasuryCurveIsStale,
} from "../supabase/functions/trade-analyzer/macroRates.ts";
import { assertFiveMinuteDensity } from "./sweepStats.ts";
import {
  CALENDAR_CLOCK,
  type CrossSeriesClock,
  crossSeriesClock,
  type GridRegistration,
  type SessionAnchorWitness,
  gridRegistration,
  REFERENCE_SESSION_ANCHORS,
  sessionAnchorWitness,
} from "./clockWitness.ts";
import {
  emptyStreakLimitFor,
  intradayChunkWindows,
  type IntradayTimeframe,
  MAX_DEPTH_DAYS,
} from "./intradayChunks.ts";
import {
  calendarFolds,
  type ClassFoldSpec,
  foldsByClass,
  foldSplits,
  isHoldoutSymbol,
} from "./sweepFolds.ts";
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
import { labelZoneFor } from "../supabase/functions/trade-analyzer/venues.ts";
import {
  BAR_CLOCK,
  type FmpBar,
  normalizeFmpBars,
} from "../supabase/functions/trade-analyzer/bars.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";
import { flagReader } from "./flagReader.ts";
import { fileURLToPath } from "node:url";

const FMP_API_BASE_URL = "https://financialmodelingprep.com/stable";
// OP-6: optional inter-request pacing for fleet runs — one env knob,
// applied through the shared retry module so all three fetch sites pace
// against the same clock.
const FMP_PACE_MS = Number(process.env.FMP_PACE_MS ?? 0) || 0;
const API_KEY = process.env.FMP_API_KEY;

// §21j Phase 1. Set once in main() from a REQUIRED --byte-budget. Held at
// module scope because the three provider reads sit in separate functions and
// threading a budget through them would leave the next one free to skip it.
// The accessor throws rather than defaulting: a sweep that reaches FMP without
// a declared ceiling is the exact run that emptied the allowance on
// 2026-08-13, and an unset budget must never read as unlimited.
let sweepBudget: ByteBudget | undefined;

// The SAME base the parser uses: parseByteBudgetArg scales a `gb` suffix by
// 1024**3, so a decimal formatter printed "of 32.21GB" against a declared
// `--byte-budget 30gb`. The declared ceiling and the reported ceiling must read
// as the same number on the one dial that exists because nothing else can
// refuse an ad-hoc run's spend.
export function formatGib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)}GiB`;
}

function budget(): ByteBudget {
  if (!sweepBudget) {
    throw new Error(
      "FMP byte budget was never declared. Pass --byte-budget before any provider read.",
    );
  }
  return sweepBudget;
}
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
  // 3c across SHARDS: every shard of one measurement must fold on the SAME
  // calendar span, or per-shard corpus ends (crypto pinned at different
  // top-up minutes) shift the boundaries by hours and the gate rightly
  // refuses the shards as different measurements. Pinned in ms.
  foldEndMs: number | undefined;
  // Folds serve class aggregation, so a fleet folds PER CLASS on spans
  // derived once globally (scripts/derive-fold-spec.ts) — a global span
  // starved every 2023-era class of fit and select entirely.
  foldSpecPath: string | undefined;
  foldStartMs: number | undefined;
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
  // Declared before anything reaches the provider, so a run without a ceiling
  // dies at the command line rather than partway through a sweep.
  sweepBudget = createByteBudget(parseByteBudgetArg(process.argv.slice(2)));
  const args = parseArgs(process.argv.slice(2));
  // Durable by default (r17 hardening): mornings reuse the rolling store
  // and top up incrementally instead of refetching whole windows.
  args.cacheDir = args.cacheDir ?? DEFAULT_CACHE_DIR;
  // Resolved HERE, not at manifest-write time. A sweep runs for tens of
  // hours; a git failure discovered while writing the manifest would throw
  // away the entire run. Validate before mutating.
  const source = args.emit
    ? resolveSweepSource((gitArgs) =>
      execFileSync("git", gitArgs, { encoding: "utf8" })
    )
    : undefined;
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
    "unresolv",
    "belowConf",
    "belowPayoff",
    "setups",
    "unfilled",
    "dataAbsent",
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
    assetType: AssetType;
    calibration: Record<string, unknown>;
    symbolOverride: Record<string, unknown>;
    crossSeriesClock: CrossSeriesClock;
    crossSeriesDensity?: CrossSeriesDensity;
    // The two ABSOLUTE instruments, named here rather than reaching the
    // manifest through a spread: a spread bypasses excess-property checking,
    // so `sessionAnchor` compiled against a type that never mentioned it and
    // a typo would have been silent.
    gridRegistration?: GridRegistration;
    providerSymbol: string;
    series: Record<string, SeriesFacts>;
    sessionAnchor?: SessionAnchorWitness;
    symbol: string;
  }> = [];
  const newsEvents = args.discover
    ? []
    : await loadEconomicCalendar(args.cacheDir);
  // E6 (R1b): the historical Treasury curve, one rolling store shared by
  // every symbol — each decision instant scores under the two most recent
  // rows visible at that instant (macroRates.ts), the same arithmetic the
  // live analyzer runs on its fetch's two most recent rows. Under
  // --warm-only a load failure WARNS and continues (#364 round 13,
  // smaller): the survey path must not die on the corpus path's second
  // provider endpoint — a Treasury outage would otherwise abort the
  // nightly top-up with the whole roster untouched, one layer earlier
  // than the mid-roster case round 9 removed. Sweep runs keep the throw.
  let treasuryRates: DatedTreasuryRow[] = [];
  // #364 rounds 22-23: any treasury INTEGRITY refusal under --warm-only
  // exits red AFTER the bar survey, not before it — none of the four
  // conditions condemns a bar store.
  let deferredTreasuryRefusal: Error | null = null;
  if (!args.discover) {
    try {
      treasuryRates = await loadTreasuryRates(args.cacheDir);
    } catch (error) {
      const message = (error as Error).message;
      // The sweep path always throws — tolerance exists only for the
      // survey (#364 round 13, smaller).
      if (!args.warmOnly) {
        throw error;
      }
      // #364 round 14, finding 1 (rescoped rounds 21-23): tolerance is
      // scoped by CAUSE, never by call site — and under --warm-only the
      // cause splits INTEGRITY from TRANSPORT. Every integrity refusal
      // this load can raise is must-stay-red: the chunk refusals
      // (treasuryCoverageRefused — the constant asks deeper than the
      // provider serves; treasuryChunkHole — a zero-row week inside
      // served coverage) are DETERMINISTIC and the store never warms
      // past them (the rolling store writes only after a successful
      // fetch), and the cache refusals mark a corrupt file or a
      // condemned clock. Warned over, any of them would leave "top-up
      // complete" printing nightly over a store that never warms — that
      // permanent false green is the whole cost, not the refetch (the
      // chunk guard throws on the FIRST zero-row chunk: one request for
      // a wrong constant, ~13 at most for a cold-store interior hole —
      // #364 round 22, finding 2). But NONE of the four says anything
      // about the BAR stores (#364 round 23, finding 2):
      // cacheStoreUnreadable is per FILE — readStore raises it for
      // treasury-rates.rolling.json alone — and this store rides
      // CALENDAR_CLOCK while every bar store rides BAR_CLOCK, so a
      // calendar-clock bump condemns the curve with the bars correct
      // under the current normalizer. And nothing under --warm-only
      // CONSUMES treasuryRates (every consumer is behind
      // !args.warmOnly). So ALL FOUR DEFER rather than abort: the bar
      // survey completes, then the run exits red after the table — the
      // top-up script's branches run on the nonzero exit and grep
      // THREE of the tokens ahead of its 429 stand-down (#364 round
      // 23, finding 1: with the deferral, a blackout-era roster 429
      // shares the output and would otherwise downgrade the refusal
      // to a stand-down; cacheClockMismatch is the fourth and keeps
      // its own named stand-down there, whose message directs each
      // store to its own remedy — and a calendar-clock bump usually
      // surfaces from loadEconomicCalendar first, so the
      // treasury-origin mismatch needs the calendar store absent or
      // current beside a stale treasury store), while the roster
      // keeps its warm instead of dying at zero of 97 symbols for
      // conditions the bar stores don't have. (Round 9 declined collect-then-throw on the SWEEP path
      // because simulation spends hours on a corpus already known
      // dead; the survey spends nothing after its loop.) Only genuine
      // transport failures reach the warn-and-continue below.
      if (
        /cacheStoreUnreadable|cacheClockMismatch|treasuryCoverageRefused|treasuryChunkHole|treasuryChunkTruncated/
          .test(message)
      ) {
        deferredTreasuryRefusal = error as Error;
        console.warn(
          `treasury refusal deferred to end of survey — bars still warm, ` +
            `run exits red after the table: ${message}`,
        );
      } else {
        // #364 round 24, finding 1: the top-up script's quota stand-down
        // greps \(429\) over the WHOLE captured output, and this warn
        // CONTINUES the run — a tolerated treasury 429 re-printed
        // verbatim would let any later, unrelated failure be reported
        // as a quota stand-down at exit 0. Every other FMP site either
        // throws on a 429 (the token then marks where the run died) or
        // warns unparenthesized (the COT site); this warn re-shapes
        // "(NNN)" to "status NNN" for the same reason, so a quota
        // stand-down still requires a 429 the run actually died on.
        console.warn(
          `treasury top-up failed — bar survey continues without it: ${
            message.replace(/\((\d{3})\)/g, "status $1")
          }`,
        );
      }
    }
  }
  // #364 round 2, finding 1: the conditions block CLAIMS reconstruction,
  // so the curve must be evidence, not hope. Empty means every decision
  // scores the hardwired zero E6 abolished; a stale tail is worse — the
  // visibility pointer stalls and every decision past the curve's end
  // scores against months-old rows as if they were fresh. An interior
  // hole is the same stall mid-corpus (#364 round 13, finding 1): the
  // fetch's per-chunk guard fires only on the run that fetches and only
  // on a ZERO-row chunk, and the rolling store never revisits a pinned
  // interior, so the STORED curve's continuity is asserted here from
  // its facts — before hours of simulation, not at the read door after
  // them. Only the leading-edge check stays door-only: it needs the
  // corpus start, which does not exist until symbols load.
  if (!args.discover && !args.warmOnly) {
    const lastRow = treasuryRates.at(-1);
    if (!lastRow) {
      throw new Error(
        "Treasury curve is empty — the manifest would claim " +
          "historical-treasury-curve over zero rows; refusing to sweep",
      );
    }
    if (treasuryCurveIsStale(lastRow.dateMs, Date.now())) {
      throw new Error(
        `Treasury curve ends ${new Date(lastRow.dateMs).toISOString()} — ` +
          `more than 7 days stale; decisions past its end would score ` +
          `against stale rows as if fresh; refusing to sweep`,
      );
    }
    // #364 round 18, finding 2: deepening TREASURY_FETCH_START_MS does
    // NOT deepen an existing store — fetchFull runs only when the store
    // is empty and fetchSince only tops up the tail — so a store whose
    // head sits later than this build's requested start would stamp
    // requestedStartMs as a term the corpus was never fetched under,
    // hashed into its identity. Refused here, pre-symbols, with the
    // real remedy; this refusal is what keeps the manifested term TRUE
    // by construction.
    const headRow = treasuryRates[0];
    if (
      headRow && headRow.dateMs > TREASURY_FETCH_START_MS + 7 * 86_400_000
    ) {
      throw new Error(
        `Treasury store starts ${
          isoDate(new Date(headRow.dateMs))
        } but this build requests ${
          isoDate(new Date(TREASURY_FETCH_START_MS))
        } — an existing store never deepens on its own (top-ups touch ` +
          `only the tail); delete the treasury-rates rolling store and ` +
          `re-run to fetch full history at the requested depth. If a ` +
          `full refetch STILL cannot reach the requested start, the ` +
          `provider's coverage is shallower than the constant claims — ` +
          `re-probe its earliest served date and move ` +
          `TREASURY_FETCH_START_MS back with the recorded evidence`,
      );
    }
    // Scoped by OVERLAP against the requested window (#364 rounds
    // 14-15): the store always spans the full fetch depth while a
    // corpus spans --days, so a hole outside the requested window must
    // not block the run — but the gaps are measured over the WHOLE
    // store first, because filtering rows to the window deletes the
    // gap's left anchor, and every hole reaching into the window
    // anchors outside it (round 15, finding 1: the filtered version
    // could not see exactly the straddling hole the +7-day visibility
    // lead exists for). Deliberately conservative toward refusal on
    // the corpus side: the request window bounds every possible
    // corpus, so this can only be stricter than the door's exact
    // corpus-span check, never blinder — and a week-plus hole inside
    // the requested window is store damage to repair regardless of
    // where this corpus starts. Same predicate as the door; the two
    // cannot drift.
    const windowStartMs = Date.now() - (args.days + 7) * 86_400_000;
    const holeTouching = treasuryGapTouching(
      treasuryCurveFacts(treasuryRates).gapsOverWeekMs,
      windowStartMs,
      Date.now(),
    );
    if (holeTouching) {
      throw new Error(
        `Treasury curve has a ${
          Math.round(
            (holeTouching.endMs - holeTouching.startMs) / 86_400_000,
          )
        }-day interior hole (${
          isoDate(new Date(holeTouching.startMs))
        }..${
          isoDate(new Date(holeTouching.endMs))
        }) touching the requested ${args.days}-day window — the ` +
          `visibility pointer would stall inside it, scoring ` +
          `months-stale rows as fresh; delete the treasury-rates store, ` +
          `refetch full history, and re-run (the corpus door would ` +
          `refuse this run's output; refusing before simulation ` +
          `instead).` +
          (treasuryParserRefusals > 0
            ? ` NOTE: ${treasuryParserRefusals} provider rows were ` +
              `refused by the parser THIS run — if the hole persists ` +
              `across a full refetch, the rows inside it are being ` +
              `refused (macroRates.ts date/tenor bounds); investigate ` +
              `those rows, not the store`
            : ` If the hole persists across a full refetch, the rows ` +
              `inside it are being refused by the parser (macroRates.ts ` +
              `date/tenor bounds); investigate those rows, not the store`),
      );
    }
  }
  // The three E6 terms this corpus is measured under — hashed into the
  // manifest so readers can refuse a corpus measured under other terms.
  const conditions: SweepConditions = {
    macroAdjustment: "historical-treasury-curve",
    providerWarningCount: "zero-by-construction",
    weightAdjustment: "raw-engine-zero",
  };

  // 3c/3d: folds are COMMON-ORIGIN calendar windows over the corpus's own
  // measured span — every symbol shares the same three boundaries, so
  // "select R" is one calendar period, never a sum across disjoint years.
  // The pre-pass reads the same rolling caches the main loop reads (disk
  // hits after first load), so its cost is one warm pass.
  let folds: ReturnType<typeof calendarFolds> = [];
  let classFolds: Record<string, ReturnType<typeof calendarFolds>> | null =
    null;
  let foldSpec: ClassFoldSpec | null = null;
  const holdoutSymbols: string[] = [];
  if (!args.discover && !args.warmOnly && args.foldSpecPath) {
    const { readFileSync } = await import("node:fs");
    foldSpec = JSON.parse(
      readFileSync(args.foldSpecPath, "utf8"),
    ) as ClassFoldSpec;
    classFolds = foldsByClass(foldSpec, FOLD_EMBARGO_MS);
    for (const [className, classFoldSet] of Object.entries(classFolds)) {
      console.log(
        `${className} folds: ` + classFoldSet.map((fold) =>
          `${fold.name} ${isoDate(new Date(fold.startMs))}..${
            isoDate(new Date(fold.endMs))
          }`
        ).join(" · "),
      );
    }
  } else if (
    !args.discover && !args.warmOnly &&
    Number.isFinite(args.foldStartMs) && Number.isFinite(args.foldEndMs)
  ) {
    folds = calendarFolds({
      corpusEndMs: args.foldEndMs!,
      corpusStartMs: args.foldStartMs!,
      embargoMs: FOLD_EMBARGO_MS,
    });
    console.log(
      "folds pinned: " + folds.map((fold) =>
        `${fold.name}: ${isoDate(new Date(fold.startMs))} .. ${
          isoDate(new Date(fold.endMs))
        }`
      ).join(" · "),
    );
  } else if (!args.discover && !args.warmOnly) {
    let spanStart = Number.POSITIVE_INFINITY;
    let spanEnd = Number.NEGATIVE_INFINITY;
    const anchor = isoDate(new Date());
    for (const symbol of args.symbols) {
      const providerSymbol = resolveProviderSymbols(symbol)[0];
      if (!providerSymbol) continue;
      const bars = await loadRollingSeries<Bar>({
        anchor,
        cacheDir: args.cacheDir!,
        clock: BAR_CLOCK,
        fetchFull: () => fetchIntradayBars(providerSymbol, args.days),
        fetchSince: (sinceMs) =>
          fetchIntradayBars(providerSymbol, args.days, sinceMs),
        key: `${providerSymbol}-15min-${args.days}`,
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
    // Round-8 CV-1/CV-10: a measurement refuses an unclassifiable symbol
    // rather than inheriting the live fallback's forex bucket — the
    // silent fallback mis-classed eight markets across a whole baseline.
    if (!hasKnownAssetType(symbol)) {
      throw new Error(
        `${symbol}: not in any asset-class roster — sweep symbols must be ` +
          `Levelflow roster names, never provider tickers`,
      );
    }
    if (classFolds && !classFolds[getAssetType(symbol)]) {
      throw new Error(
        `${symbol}: class ${getAssetType(symbol)} missing from the fold ` +
          `spec — re-derive it over the full universe`,
      );
    }
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
        clock: BAR_CLOCK,
        fetchFull: () => fetchIntradayBars(providerSymbol, args.days),
        fetchSince: (sinceMs) =>
          fetchIntradayBars(providerSymbol, args.days, sinceMs),
        key: `${providerSymbol}-15min-${args.days}`,
        timeOf: (bar) => bar.time,
      }),
      loadRollingSeries<Bar>({
        anchor,
        cacheDir: args.cacheDir!,
        clock: BAR_CLOCK,
        fetchFull: () => fetchDailyBars(providerSymbol, args.days + 240),
        fetchSince: (sinceMs) =>
          fetchDailyBars(providerSymbol, args.days + 240, sinceMs),
        key: `${providerSymbol}-daily-${args.days}`,
        timeOf: (bar) => bar.time,
      }),
      // 2l: the committee's real 5min series. FMP's 5min depth is shallower
      // than 15min for most symbols; early decision points simply fall below
      // the 40-bar floor and vote four-frame, the same degradation a thin
      // live fetch produces. The corpus manifest records the measured depth.
      loadRollingSeries<Bar>({
        anchor,
        cacheDir: args.cacheDir!,
        clock: BAR_CLOCK,
        fetchFull: () =>
          fetchIntradayBars(providerSymbol, args.days, undefined, "5min"),
        fetchSince: (sinceMs) =>
          fetchIntradayBars(providerSymbol, args.days, sinceMs, "5min"),
        key: `${providerSymbol}-5min-${args.days}`,
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

    // R0 one clock: the series testify about their own stamps, and a
    // condemned witness stops the RUN, not just the symbol — the one-clock
    // invariant is corpus-global, and a sweep that quietly drops a
    // poisoned market ships a corpus that looks whole. That is why this
    // block sits ABOVE the thin-symbol skip below (#358 round 6): a symbol
    // under the depth floor is excluded from the measurement, but its
    // stores are already stamped and cached, and a later, deeper run will
    // read them — so its data is witnessed before it is dropped. The
    // witnesses return "indeterminate" below their own sample floors, so
    // this cannot false-condemn a series that is merely thin. The store
    // guard (calibrationCache) already refuses a wrong-stamp store; this
    // is the independent per-year check on the data itself. Its measured
    // limits (#358 adversarial round): a sessioned pair whose BOTH series
    // are on the same wrong clock reads as aligned here — that case is
    // carried by the store stamp and by the reference session anchor in
    // verify-cache-clock, the only instrument that catches a provider
    // convention flip shifting every series together.
    //
    // The token is deliberately NOT cacheClockMismatch: that name is the
    // nightly top-up's named stand-down for the pre-rebuild store, while a
    // witness refusal on a STAMPED store is a fresh, actionable regression
    // that must go red.
    const series = {
      "15min": seriesFacts(primaryBars, "intraday"),
      "1day": seriesFacts(dailyBars, "daily"),
      "5min": seriesFacts(fiveMinuteBars, "intraday"),
    };
    const registration = crossSeriesClock(primaryBars, fiveMinuteBars);
    for (const [timeframe, facts] of Object.entries(series)) {
      if (facts.clock.verdict === "naive" || facts.clock.verdict === "mixed") {
        throw new Error(
          `cacheClockWitnessRefused: ${symbol} ${timeframe} series ` +
            `witnesses a "${facts.clock.verdict}" clock ` +
            `(${JSON.stringify(facts.clock)}) on a stamped store — ` +
            `investigate before any rebuild; see docs/cache-rebuild-r0.md`,
        );
      }
    }
    if (registration.verdict === "shifted") {
      throw new Error(
        `cacheClockWitnessRefused: ${symbol} 5min series registers against ` +
          `the 15min primary at ${registration.bestShiftHours}h ` +
          `(${JSON.stringify(registration)}) — the mixed-clock signature ` +
          `on a stamped store; investigate before any rebuild; see ` +
          `docs/cache-rebuild-r0.md`,
      );
    }
    // R0f: THE ABSOLUTE WITNESS, ON THE AUTOMATED PATH. Every check above
    // this line is RELATIVE — it compares two series that a provider
    // convention change displaces TOGETHER, which is why all of them
    // reported healthy on three indices standing 6, 13 and 14 hours out of
    // register. The instrument that sees it existed and ran nowhere a sweep
    // could reach: only in `scripts/verify-cache-clock.ts`, which is on no
    // CI path, so R3's one re-sweep could have written a corpus from
    // displaced stores with nothing to object.
    //
    // It judges the 15-minute PRIMARY, the decision timeframe. That plus the
    // registration check above is full coverage: an absolute defect shared by
    // both series shows here, and one confined to the 5-minute series shows
    // as a relative shift there.
    // C3: the absolute registration test. crossSeriesClock above compares DAY
    // EXTREMES on the UTC calendar day, so a one-sided shift is invisible for
    // a market whose session sits inside the day — it reported "aligned" at
    // matchRateAtZero 1.000 against a real +/-4h displacement on the nine
    // session-interior markets. This asks whether a parent brackets its own
    // children, which no timezone can change.
    const grid = gridRegistration(primaryBars, fiveMinuteBars);
    if (grid.verdict !== "registered") {
      throw new Error(
        `cacheClockWitnessRefused: ${symbol} 15min parents do not bracket ` +
          `their own 5min children (${JSON.stringify(grid)}) — the two ` +
          `series are not on one grid; investigate before any rebuild; see ` +
          `docs/cache-rebuild-r0.md`,
      );
    }
    const sessionAnchorSpec = REFERENCE_SESSION_ANCHORS[providerSymbol];
    const sessionAnchor = sessionAnchorSpec
      ? sessionAnchorWitness(primaryBars, sessionAnchorSpec)
      : undefined;
    if (sessionAnchor?.verdict === "displaced") {
      throw new Error(
        `cacheClockWitnessRefused: ${symbol} (${providerSymbol}) intraday ` +
          `bars do not open at its venue's session open ` +
          `(${JSON.stringify(sessionAnchor)}) — the store's stamps are ` +
          `displaced from ${sessionAnchorSpec.zone} ` +
          `${String(sessionAnchorSpec.hour).padStart(2, "0")}:` +
          `${String(sessionAnchorSpec.minute).padStart(2, "0")}; ` +
          `investigate before any rebuild; see docs/cache-rebuild-r0.md`,
      );
    }
    // #364 round 8, finding 2: the density law fails FAST, beside the
    // clock witnesses, where a violation costs minutes — not at read
    // time after a multi-hour sweep has already written a corpus its own
    // door refuses (the Treasury pre-flight above works the same way).
    // The read-time door stays as the backstop. The per-symbol line
    // shows density AT CORPUS DEPTH: the floors were measured over one
    // recent week (2026-08-11..17), and this print is how the first real
    // deep run tells "clipped store" from "the provider's early history
    // is thinner than its 2026 history" before anything is committed.
    // It prints in EVERY mode for EVERY symbol, empty 5-minute stores
    // included (#364 round 10, finding 2): the survey is the only layer
    // that can surface a total 5-minute feed loss — the door is
    // deliberately silent on absence (honest degradation, carried
    // per-row by the emit tier) — so a symbol that lost its feed must
    // be distinguishable from one the loop never reached.
    console.log(
      `${symbol}	` +
        (series["5min"].count > 0 && series["5min"].spanDays >= 1
          ? `density 5min ${
            (series["5min"].count / series["5min"].spanDays).toFixed(1)
          }/day over ${series["5min"].spanDays}d`
          : `density 5min ${series["5min"].count} rows`) +
        (series["15min"].spanDays >= 1
          ? ` (15min ${
            (series["15min"].count / series["15min"].spanDays).toFixed(1)
          }/day)`
          : ""),
    );
    const crossSeriesDensity = crossSeriesDensityFacts(
      fiveMinuteBars,
      primaryBars,
    );

    if (primaryBars.length < WARMUP_BARS * 2) {
      console.warn(
        `Skipping ${symbol}: only ${primaryBars.length} intraday bars.`,
      );
      continue;
    }

    // #364 round 9, finding 1: the density law binds only the corpus
    // path. --warm-only (the nightly launchd top-up and the R0 rebuild's
    // step 2) produces no corpus and has no door to front-run — a
    // refusal there would go red mid-roster and leave every later
    // symbol un-topped-up, the silent-decay failure the top-up script
    // exists to prevent. Warm-only is instead the SURVEY instrument:
    // the print above runs for every symbol, and the door runs in
    // REPORT mode below — verdict logged, never thrown (#364 round
    // 32) — so the one-week floors meet multi-year reality on a run
    // they cannot kill. Thin symbols never reach the manifest, so the skip above
    // exempts them too — which is a DIFFERENT placement than the clock
    // witnesses hold, deliberately (#364 round 10, smaller): witnesses
    // judge the STORE, which outlives this run cached and stamped, so
    // data is witnessed before it is dropped; the density floors judge
    // fitness for THIS measurement's population, which a thin symbol is
    // not in. Its store still shows in the survey line above, and a
    // deeper run that does admit the symbol judges it at this same gate
    // then — deferral with the data intact, not loss. A sweep run still
    // refuses at the FIRST violator — its corpus is dead at the read
    // door regardless, so finishing the roster would only spend
    // simulation on a doomed run; the refusal names the survey mode
    // instead. The refusal lands before THAT symbol simulates, not
    // before all simulation — the loop interleaves load-assert-simulate
    // per symbol, so a late violator costs the roster prefix already
    // walked (#364 round 31 corrected the free-refusal claim in every
    // doc). Hoisting into a dedicated pre-pass was considered and
    // DECLINED there: it would re-load every symbol's two intraday
    // stores before this loop loads them again — doubling store I/O at
    // max depth. Round 31's note here justified the decline by a
    // survey guarantee that did not exist (#364 round 32, finding 1):
    // the survey asserted nothing, its line prints own-span rows/day
    // while the door judges the intersection ratio, and the nightly
    // run's --days max window is not a bounded sweep's window. The
    // else branch below closes the first two gaps — the survey now
    // runs the door itself in REPORT mode — so a max-depth survey
    // with no WOULD-REFUSE line is the door's own green at the
    // deepest window: evidence for launching, while this pre-flight
    // stays the authority for the window a sweep actually requests.
    if (!args.warmOnly) {
      try {
        assertFiveMinuteDensity(`preflight:${symbol}`, {
          crossSeriesDensity,
          series,
          symbol,
        });
      } catch (error) {
        throw new Error(
          `${(error as Error).message}\n` +
            `Full-roster density survey (reports each symbol's ` +
            `would-refuse verdict, asserts nothing): ` +
            `--symbols roster --days max --warm-only`,
        );
      }
    } else {
      // The door itself, in report mode: the catch LOGS and never
      // throws, so round 9's law holds — a violator cannot go red
      // mid-roster and leave every later symbol un-topped-up — while
      // the verdict is the assertion's own, on the same intersection
      // facts the sweep pre-flight judges, at this run's depth. The
      // rows/day line above is the raw material; this line is the
      // door's reading of it.
      try {
        assertFiveMinuteDensity(`survey:${symbol}`, {
          crossSeriesDensity,
          series,
          symbol,
        });
      } catch (error) {
        console.log(
          `${symbol}\tdensity WOULD REFUSE at this depth: ` +
            `${(error as Error).message}`,
        );
      }
    }

    const cotReports = await loadCotReports(args.cacheDir, symbol);

    manifestSymbols.push({
      assetType: getAssetType(symbol),
      calibration: {
        ...getCategoryCalibration(symbol),
      } as unknown as Record<string, unknown>,
      // WAS THIS VALUE CHOSEN FOR THIS MARKET, OR APPLIED TO IT? The merged
      // object above cannot say: getCategoryCalibration folds the class row and
      // the per-symbol override into one flat result, and only that result was
      // recorded. 72 of 97 markets carry an override, and R4 grades all 97
      // individually against their own shipped configuration — so this is the
      // field R4 needs first.
      //
      // Named `symbolOverride`, NOT `calibrationOverride`: that name is
      // already taken by the GRID variant override (sweep.ts), and a reader
      // mistaking shipped config for a grid cell is worse than no field.
      symbolOverride: getSymbolCalibrationOverride(symbol) as Record<
        string,
        unknown
      >,
      crossSeriesClock: registration,
      crossSeriesDensity,
      gridRegistration: grid,
      providerSymbol,
      series,
      ...(sessionAnchor && { sessionAnchor }),
      symbol,
    });

    // --warm-only: the daily top-up path. Caches are now loaded (and
    // therefore topped up and pinned for today) — no simulation.
    if (args.warmOnly) {
      // The spend rides the warm line (§21's founding finding: FMP meters
      // BYTES and publishes no usage endpoint, so the in-process ledger is the
      // only thing that knows). It knew all along and never said — the sole
      // signal was the exception thrown at exhaustion, which on a multi-hour
      // rebuild means the operator learns the budget was short only once the
      // run is dead. Printed per symbol so the trend is visible early enough to
      // act on.
      //
      // Deliberately on the warm-only branch alone, for now: this is the path
      // that fetches the whole roster to depth and is the only one that runs
      // for hours unattended. A bounded sweep spends the same bytes with the
      // same blindness and should get the same line — named here rather than
      // left as an accident of where the fix landed.
      console.log(
        `${symbol}\twarm\t${primaryBars.length} intraday bars through ${
          isoDate(new Date(primaryBars.at(-1)?.time ?? 0))
        }\tspent ${formatGib(budget().spent())} of ${
          formatGib(budget().spent() + budget().remaining())
        }`,
      );
      continue;
    }

    const holdout = isHoldoutSymbol(symbol);
    if (holdout) holdoutSymbols.push(symbol);
    // Shared fold slicing (sweepFolds.foldSplits): warm-up floors inside
    // the fold when history starts mid-fold, thin folds dropped. Under a
    // fold spec, the symbol folds on ITS CLASS's calendar.
    const symbolFolds = classFolds
      ? classFolds[getAssetType(symbol)] ?? []
      : folds;
    const splits = foldSplits(primaryBars, symbolFolds, WARMUP_BARS);

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
          treasuryRates,
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
          String(result.rejections.unresolvable),
          String(result.rejections.belowConfidence),
          String(result.rejections.belowPayoff),
          String(result.summary.total),
          String(result.summary.unfilled),
          String(result.summary.dataAbsent),
          formatRate(result.summary.tp1HitRate),
          formatRate(result.summary.stopRate),
          result.summary.expectancyR.toFixed(3),
        ]);
      }
    }
  }

  // #364 round 19, finding 1: the table STATES its mode, so
  // starvation-audit can refuse a capture-all table instead of reading
  // zeroed acceptance gates as survival — under --capture-all the
  // acceptance tally is skipped by design, so belowConf/belowPayoff
  // print 0 and the amendment-25 gate would go quiet on the wrong
  // table. The marker turns the audit's run-on-normal-tables advice
  // into a guard.
  if (args.captureAll) {
    console.log(
      "# capture-all — acceptance gates untallied; starvation-audit " +
        "refuses this table",
    );
  }
  printTable(rows);
  // #364 round 22, finding 1: the deferred deterministic treasury
  // refusal — set only under --warm-only — exits the run red here,
  // after the roster warmed and the survey table printed, so the
  // top-up script's nonzero-exit branches still see it while the
  // nightly bar top-up and rebuild step 2 keep their work.
  if (deferredTreasuryRefusal) {
    throw deferredTreasuryRefusal;
  }
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
      // Derived from the classes this run actually loaded — never a hand-kept
      // list, which would go stale the day a class joins the roster.
      calibrationByClass: Object.fromEntries(
        [...new Set(manifestSymbols.map((entry) => entry.assetType))]
          .sort()
          .map((assetType) => [
            assetType,
            { ...getClassCalibration(assetType) } as Record<string, unknown>,
          ]),
      ),
      clock: { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK },
      conditions,
      days: args.days,
      folds: classFolds ? undefined : folds,
      ...(classFolds && {
        foldsByClass: Object.fromEntries(
          Object.entries(classFolds).map(([className, classFoldSet]) => [
            className,
            classFoldSet,
          ]),
        ),
      }),
      generatedAt: new Date().toISOString(),
      grid: args.grid,
      holdoutSymbols: [...holdoutSymbols].sort(),
      ...(source && { source }),
      stepBars: args.step,
      symbols: manifestSymbols,
      trainShare: TRAIN_SHARE,
      treasuryCurve: {
        ...treasuryCurveFacts(treasuryRates),
        requestedStartMs: TREASURY_FETCH_START_MS,
      },
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
    // The calendar's own clock, not BAR_CLOCK: FMP stamps calendar events
    // in true UTC and the parse below has always read them that way.
    clock: CALENDAR_CLOCK,
    fetchFull: () => fetchCalendarEvents(Date.parse("2013-01-01T00:00:00Z")),
    fetchSince: (sinceMs) => fetchCalendarEvents(sinceMs),
    key: "econ-calendar",
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
    const response = await fetchFmpWithRetry(() => fetch(endpoint), {
      paceMs: FMP_PACE_MS,
    });
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
    const payload = await readJsonWithBudget(response, budget());
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

// E6 (R1b): the daily 2Y/10Y Treasury curve for the replay macro join.
// FMP's treasury history reaches back past the calendar's 2013 floor;
// decision points before the first visible row score stance "unavailable",
// the live outage semantics. Cached as a rolling store like bars and the
// calendar — CALENDAR_CLOCK because the rows are date labels in true UTC,
// never New-York-normalized bar stamps.
async function loadTreasuryRates(
  cacheDir: string | undefined,
): Promise<DatedTreasuryRow[]> {
  const anchor = isoDate(new Date());
  return loadRollingSeries<DatedTreasuryRow>({
    anchor,
    cacheDir: cacheDir ?? DEFAULT_CACHE_DIR,
    clock: CALENDAR_CLOCK,
    fetchFull: () => fetchTreasuryRates(TREASURY_FETCH_START_MS),
    fetchSince: (sinceMs) => fetchTreasuryRates(sinceMs),
    key: "treasury-rates",
    timeOf: (row) => row.dateMs,
  });
}

// Rows the parser refused across this process's Treasury fetches — only
// the run that fetches can count them (a warm store fetches nothing), so
// hole refusals report the count as this-run evidence, not store truth.
let treasuryParserRefusals = 0;

async function fetchTreasuryRates(
  startMs: number,
): Promise<DatedTreasuryRow[]> {
  const rows: DatedTreasuryRow[] = [];
  // 60 days, NOT 365, and the mechanism is DETERMINED rather than guessed:
  // `/treasury-rates` serves exactly [to − 90 days, to] whatever `from` says.
  // A 365-day chunk therefore discarded 275 of every 365 days server-side.
  //
  // Measured 2026-08-23 on the store the R0 rebuild wrote, and the arithmetic
  // is what settles it: fourteen contiguous blocks, one per chunk, and for
  // ALL FOURTEEN the block's first row is the first business day at or after
  // that chunk's own `to` minus 90 days — including the final chunk, whose
  // `to` is clamped to now. 853 rows where ~3,361 business days exist: 25.4%,
  // with gaps of 275-278 days between blocks. A row cap would not align to
  // the window boundary fourteen times.
  //
  // So this is a WINDOW clamp, not a row cap, and no probe was needed to know
  // it. 60 days sits under the 90-day clamp with margin for it being ≤90
  // rather than exactly 90. The same file's economic-calendar fetch chunks at
  // 90 days and its store IS complete (42,665 rows from 2013-01-02, one gap
  // over 14 days) — the contrast that first identified chunk width as the
  // lever.
  //
  // The rolling store's merge dedupes the inclusive chunk-boundary dates by
  // dateMs, so the narrower window costs requests and not correctness.
  const chunkMs = 60 * 86_400_000;
  for (let from = startMs; from < Date.now(); from += chunkMs) {
    const endpoint = new URL(`${FMP_API_BASE_URL}/treasury-rates`);
    endpoint.searchParams.set("from", isoDate(new Date(from)));
    endpoint.searchParams.set(
      "to",
      isoDate(new Date(Math.min(from + chunkMs, Date.now()))),
    );
    endpoint.searchParams.set("apikey", API_KEY!);
    const response = await fetchFmpWithRetry(() => fetch(endpoint), {
      paceMs: FMP_PACE_MS,
    });
    if (!response.ok) {
      // I3, verbatim from the calendar: a warned-and-continued hole would
      // be merged and pinned as the anchor day's truth, and later top-ups
      // never revisit it — one transient failure would permanently hole
      // the macro join under every future measurement. A run that cannot
      // see the whole curve stops.
      throw new Error(
        `Treasury-rate fetch failed (${response.status}) for ${
          endpoint.searchParams.get("from")
        }..${endpoint.searchParams.get("to")}`,
      );
    }
    const payload = await readJsonWithBudget(response, budget());
    let chunkRows = 0;
    const parserRefusalsBefore = treasuryParserRefusals;
    if (Array.isArray(payload)) {
      for (const raw of payload) {
        const row = parseTreasuryRow(raw);
        if (row) {
          rows.push(row);
          chunkRows += 1;
        } else {
          // #364 round 14, finding 2: a refused provider row (date shape,
          // tenor bounds) is DETERMINISTIC on refetch — a run of them is
          // the one hole "delete the store and refetch" cannot clear, so
          // the count is surfaced beside any hole refusal to tell "the
          // provider served nothing" from "we refused what it served".
          treasuryParserRefusals += 1;
        }
      }
    }
    // #364 round 2, finding 1 (split round 20, finding 1): the zero-row
    // chunk law lives in sweepManifest.ts beside the constant it names,
    // where tests execute both branches — an interior chunk is a hole,
    // but a chunk starting at TREASURY_FETCH_START_MS is the constant
    // asking deeper than the provider serves, and the hole remedies
    // cannot clear that (the deepening runbook has already deleted the
    // store when this fires). The chunk's own parser-refusal count rides
    // along so "the provider served nothing" is distinguishable from
    // "we refused what it served".
    const refusal = treasuryChunkRefusal({
      chunkRows,
      // The oldest row this chunk actually returned. Under the 90-day window
      // clamp a too-wide chunk reaches back nowhere near its own `from`,
      // which is the signature the 365-day chunk left in the store and which
      // a row COUNT cannot see — holidays and the provider's floor make any
      // count threshold guesswork, while "it did not reach back to what we
      // asked for" is exact and needs no tuning.
      earliestRowMs: rows.slice(rows.length - chunkRows).reduce(
        (oldest: number | null, row) =>
          oldest === null || row.dateMs < oldest ? row.dateMs : oldest,
        null as number | null,
      ),
      fromMs: from,
      parserRefusals: treasuryParserRefusals - parserRefusalsBefore,
      windowToMs: Math.min(from + chunkMs, Date.now()),
    });
    if (refusal) {
      throw new Error(refusal);
    }
    await sleep(150);
  }
  rows.sort((first, second) => first.dateMs - second.dateMs);
  console.log(`Fetched ${rows.length} Treasury-curve rows.`);
  return rows;
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
  const response = await fetchFmpWithRetry(() => fetch(endpoint), {
    paceMs: FMP_PACE_MS,
  });
  if (!response.ok) {
    console.warn(`COT fetch failed for ${contract}: ${response.status}`);
    return [];
  }
  const payload = await readJsonWithBudget(response, budget());
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

export function parseArgs(argv: string[]): SweepArgs {
  const VALUE_FLAGS = new Set([
    "--cache-dir",
    "--days",
    "--emit",
    "--fold-end",
    "--fold-spec",
    "--fold-start",
    "--grid",
    "--step",
    "--symbols",
  ]);
  const { num, str } = flagReader(argv, VALUE_FLAGS);
  // OP-9: "--symbols roster" derives the list from the engine's own scan
  // roster instead of a hand-kept copy — the ops top-up ran a 57-name
  // snapshot that had silently lost 40+ onboarded markets (and kept
  // dormant BRENT). One source, no drift.
  const symbolsArg = str("--symbols") ?? "EURUSD";
  const symbols = (symbolsArg.trim().toLowerCase() === "roster"
    ? defaultScanSymbols
    : symbolsArg.split(",").map((value) => value.trim().toUpperCase()))
    .filter(Boolean);
  const daysArg = str("--days");
  // "max" discovers each symbol's full available history from the run date.
  // Numeric dials go through num(), which refuses a token it cannot
  // parse (#364 round 51, finding 1). Reading them with str() and then
  // bare Number() took the half of the law that closes a phantom store
  // and left the half that closes a NaN dial — in the sweep DRIVER:
  // `--step abc` makes `index += NaN` false on the first comparison, so
  // the decision loop runs once per symbol, the manifest records
  // stepBars as null, and the run writes a corpus and exits 0.
  // ONE read, ONE default (#364 round 52, finding 1). The num() port
  // split this into `str("--days") ?? "60"` for the "max" test and
  // `num("--days", 365)` for the value, so the halves carried different
  // defaults and the "60" was dead: every unflagged run walked 365 days
  // where main walks 60. `days` is inside conditionsOf since round 47,
  // so it is hashed into the corpus identity and the LA-6 ledger key; it
  // also sets the provider fetch volume against the §21j ceiling. The
  // manifest records whatever it was, so the drift left no witness.
  const days = daysArg === "max" ? MAX_DEPTH_DAYS : num("--days", 60, {
    basis:
      "a sweep of zero or fractional days fetches nothing and is hashed " +
      "into conditionsOf, so it becomes a corpus identity for a " +
      "measurement that was never taken",
    integer: true,
    min: 1,
  });
  // #364 round 55, finding 2. Round 54 made `--step ""` a refusal; 0 is
  // finite, so it passed. `index += input.stepBars` (sweep.ts:380) never
  // advances at 0 while `primaryBars.slice(0, index + 1)` allocates every
  // pass — a hang with no output, in a driver whose runs take hours — and
  // an operator wanting a decision on EVERY bar types 0 rather than 1.
  const step = num("--step", 16, {
    basis:
      "the stride advances the decision index; 0 never advances it and " +
      "hangs the simulation, and a negative walks it backward until the " +
      "bar slice empties",
    integer: true,
    min: 1,
  });
  const gridSpec = str("--grid");
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
  const foldStartRaw = str("--fold-start");
  const foldEndRaw = str("--fold-end");
  return {
    cacheDir: str("--cache-dir"),
    // The fallback is unreachable — the raw read above already
    // established the flag is present — but num() is what refuses an
    // unparseable fold boundary.
    foldEndMs: foldEndRaw !== undefined ? num("--fold-end", 0) : undefined,
    foldSpecPath: str("--fold-spec"),
    foldStartMs: foldStartRaw !== undefined ? num("--fold-start", 0) : undefined,
    captureAll: argv.includes("--capture-all"),
    ignoreLowEdge: argv.includes("--ignore-low-edge"),
    warmOnly: argv.includes("--warm-only"),
    days,
    discover: argv.includes("--discover"),
    emit: str("--emit"),
    grid,
    step,
    symbols,
  };
}

// Chunk sizing, window tiling and the empty-window clearance live in
// scripts/intradayChunks.ts (R0; #358), extracted pure so the 1b sawtooth
// fix is pinned by behaviour — this file runs main() on import and cannot
// be. Clip detection is NOT per-chunk (measured infeasible without false
// positives — see that file's header): the guard is the measured caps,
// verify-cache-clock's density floor+ceiling, and R1b's E2 density
// assertion — run by this driver's own pre-flight, refusing at the
// first violator before THAT symbol simulates (#364 rounds 8-9; the
// loop interleaves per symbol, so a late violator costs the roster
// prefix already walked — round 31), and again at the read-time corpus
// door, with the nightly --warm-only log running the same door in
// report mode across the whole roster (#364 round 32) — would-refuse
// verdicts logged, never thrown.

// Walks backward from now until history genuinely ends, so every symbol
// contributes its full available depth and the window rolls forward with the
// run date. Depth is discovered per symbol, never hardcoded. The timeframe
// parameter exists for 2l: the committee's 5min series must be a real
// provider series, fetched the same chunked way as the 15min primary.
async function fetchIntradayBars(
  providerSymbol: string,
  days: number,
  sinceMs?: number,
  timeframe: IntradayTimeframe = "15min",
): Promise<Bar[]> {
  const bars: Bar[] = [];
  const emptyStreakLimit = emptyStreakLimitFor(timeframe);
  let emptyStreak = 0;

  const windows = intradayChunkWindows({
    days,
    nowMs: Date.now(),
    sinceMs,
    timeframe,
  });
  for (const window of windows) {
    const endpoint = new URL(
      `${FMP_API_BASE_URL}/historical-chart/${timeframe}`,
    );
    endpoint.searchParams.set("symbol", providerSymbol);
    endpoint.searchParams.set("from", isoDate(new Date(window.fromMs)));
    endpoint.searchParams.set("to", isoDate(new Date(window.toMs)));
    endpoint.searchParams.set("apikey", API_KEY!);
    const chunk = await fetchBars(endpoint, labelZoneFor(providerSymbol));
    if (chunk.length === 0) {
      emptyStreak += 1;
      if (emptyStreak >= emptyStreakLimit) {
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
  return dedupeSort(await fetchBars(endpoint, labelZoneFor(providerSymbol)));
}

async function fetchBars(endpoint: URL, zone: string): Promise<Bar[]> {
  const response = await fetchFmpWithRetry(() => fetch(endpoint), {
    paceMs: FMP_PACE_MS,
  });
  if (!response.ok) {
    throw new Error(
      `FMP request failed (${response.status}) for ${endpoint.pathname}`,
    );
  }
  const payload = await readJsonWithBudget(response, budget());
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
    zone,
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

// Run only as a binary, never on import (the grid-totalr pattern), so
// parseArgs' defaults can be pinned — there was no such pin, which is
// why a 6x depth change landed silently (#364 round 52, finding 1).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
