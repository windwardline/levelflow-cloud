/**
 * R2b question 4: targets see daily structure and stops do not. Does it matter?
 *
 * `buildPricePlan` builds two pivot sets — `findSwingPivots(bars, 3)` on the
 * 15-minute series and `findSwingPivots(daily, 2)` on the daily one — and
 * spends them asymmetrically. All four arrays reach `buildLadderTargets`
 * (`pricePlan.ts:368-373`), so the runner may sit on a daily level. The stop's
 * search (`:259-263`) reads the INTRADAY arrays alone. Nothing measured what
 * the stop is not looking at.
 *
 * ZERO PROVIDER BYTES, BY CONSTRUCTION RATHER THAN BY INTENT. Every series is
 * read from a PINNED anchor in `.calibration-cache`, and both fetchers passed
 * to `loadRollingSeries` THROW. A pin miss is therefore a crash naming the
 * market, never a quiet purchase — which matters because the account is over
 * its trailing-30 ceiling and 2026-08-26 is pinned in all 290 stores while
 * 08-27 is pinned in 13.
 *
 * WHY NOW rather than from R3's corpus. The counterfactual stop is not in any
 * emit and cannot be: it is what the engine would have chosen under a pivot
 * set it never used. If daily structure moves stops materially, that is a grid
 * axis, and R3 is the ONE re-sweep — the axis has to be decided before it runs,
 * not discovered in its output.
 *
 * WHAT IT MEASURES: whether a daily pivot sits where the stop is looking, and
 * whether it would BIND after the 1.25-ATR floor and the ATR cap.
 *
 * WHAT IT DOES NOT MEASURE: realized R. A moved stop moves `riskDistance`,
 * which moves TP1, the payoff gate and admission itself, so the corpus of
 * accepted setups would differ. That is a grid arm, not an arithmetic. Nothing
 * here reports an R consequence, and amendment 39 forbids reading one in.
 *
 *   npx tsx scripts/q4-daily-structure-stop.ts --anchor 2026-08-26
 *   npx tsx scripts/q4-daily-structure-stop.ts --anchor 2026-08-26 \
 *     --symbols EURUSD,GBPUSD --json docs/research/q4-daily-structure.json
 */
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { DEFAULT_CACHE_DIR, loadRollingSeries } from "./calibrationCache.ts";
import { flagReader } from "./flagReader.ts";
import { seriesFacts } from "./sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import {
  getAssetType,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { completedDailySeries } from "../supabase/functions/trade-analyzer/dailyCompletion.ts";
import {
  averageTrueRange,
  findSwingPivots,
  nearestLevelBeyond,
} from "../supabase/functions/trade-analyzer/indicators.ts";
import { buildPricePlan } from "../supabase/functions/trade-analyzer/pricePlan.ts";
import { getSessionContext } from "../supabase/functions/trade-analyzer/sessions.ts";
import {
  classifyRegime,
  runStrategyCommittee,
  scoreConsensus,
} from "../supabase/functions/trade-analyzer/strategies.ts";
import { buildDecisionMarketContext } from "../supabase/functions/trade-analyzer/sweep.ts";
import {
  defaultScanSymbols,
  resolveProviderSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/** The sweep's own walk parameters, so the population is the sweep's. */
const WARMUP_BARS = 120;
const STEP_BARS = 8;

/**
 * The `days` term in every cache key, DERIVED from the cache rather than
 * declared here.
 *
 * `replay-sweep.ts` keys its stores `<provider>-15min-<days>`, and the value
 * is whatever that run passed. A constant here would be right for one rebuild
 * and silently wrong for the next — and because this reader's fetchers refuse,
 * "silently wrong" presents as a pin miss on every market at once, which reads
 * like an empty cache rather than a stale constant.
 *
 * Exactly one value or the caller names it: two rebuild depths in one
 * directory are two populations, and picking either without being told is the
 * curated-population defect in miniature.
 */
export function cacheDays(files: readonly string[]): number[] {
  const found = new Set<number>();
  for (const name of files) {
    const match = /-15min-(\d+)\.rolling\.json$/.exec(name);
    if (match) found.add(Number(match[1]));
  }
  return [...found].sort((a, b) => a - b);
}

export type Q4Row = {
  /** Decisions that produced a plan. Every share below is over this. */
  planned: number;
  /** Plans whose reproduced pivot did not match the plan's own field. */
  unanchored: number;
  /** A daily pivot exists in the stop's own direction. */
  dailyPresent: number;
  /** A daily pivot exists and the intraday search found none. */
  dailyOnly: number;
  /** The daily pivot sits nearer to the entry than the intraday one. */
  dailyNearer: number;
  /** The shipped stop actually moves once daily pivots join the search. */
  stopMoves: number;
  /** Of those, the ones that also change which rule placed the stop. */
  provenanceFlips: number;
  /** Tightening in ATR units on the rows that move, for a median and a p90. */
  moveAtr: number[];
};

export function emptyRow(): Q4Row {
  return {
    planned: 0,
    unanchored: 0,
    dailyPresent: 0,
    dailyOnly: 0,
    dailyNearer: 0,
    stopMoves: 0,
    provenanceFlips: 0,
    moveAtr: [],
  };
}

/**
 * The stop chain from `pricePlan.ts:259-297`, over whatever pivot set it is
 * given.
 *
 * A REIMPLEMENTATION, AND IT IS ANCHORED RATHER THAN TRUSTED. Production
 * cannot be asked for a stop under a pivot set it does not build, so the
 * counterfactual has to be computed here. The caller therefore runs this
 * function TWICE — once on the intraday-only set production really used, once
 * on the union — and requires the first to reproduce the plan's own
 * `stopPivotDistance`. A market whose reproduction disagrees is REFUSED and
 * counted, never averaged over: a shadow of production inherits nothing from
 * production unless something outside it says the two agree.
 */
export function stopUnder(input: {
  atr: number;
  entryPrice: number;
  maxStopAtrMultiplier: number;
  /** Lows for a buy, highs for a sell — the protective side. */
  protectiveLevels: number[];
  side: "buy" | "sell";
  stopBuffer: number;
}): { pivot: number | null; provenance: string; stop: number } {
  const { atr, entryPrice, protectiveLevels, side, stopBuffer } = input;
  const pivot = nearestLevelBeyond(
    side === "buy" ? "sell" : "buy",
    entryPrice,
    protectiveLevels,
  );
  const pivotBufferedStop = pivot === null
    ? null
    : (side === "buy" ? pivot - stopBuffer : pivot + stopBuffer);
  const structuralStop = side === "buy"
    ? Math.min(pivotBufferedStop ?? entryPrice - stopBuffer, entryPrice - atr * 1.25)
    : Math.max(pivotBufferedStop ?? entryPrice + stopBuffer, entryPrice + atr * 1.25);
  const maxStopDistance = atr * input.maxStopAtrMultiplier;
  const capStop = side === "buy"
    ? entryPrice - maxStopDistance
    : entryPrice + maxStopDistance;
  const capBinds = side === "buy"
    ? structuralStop < capStop
    : structuralStop > capStop;
  return {
    pivot,
    provenance: capBinds
      ? "cap"
      : pivotBufferedStop !== null && structuralStop === pivotBufferedStop
      ? "pivot"
      : "volatility_floor",
    stop: side === "buy"
      ? Math.max(structuralStop, capStop)
      : Math.min(structuralStop, capStop),
  };
}

/** The cache read that refuses to buy anything. */
export async function pinnedSeries(input: {
  anchor: string;
  cacheDir: string;
  key: string;
}): Promise<Bar[]> {
  const refuse = () => {
    throw new Error(
      `q4PinMissing: ${input.key} is not pinned at ${input.anchor}. This ` +
        `reader spends ZERO provider bytes by construction and will not buy ` +
        `the series — re-run against an anchor the store holds, or drop the ` +
        `market from --symbols. Pin populations are measured in ` +
        `docs/HANDOFF.md and change with every top-up.`,
    );
  };
  return await loadRollingSeries<Bar>({
    anchor: input.anchor,
    cacheDir: input.cacheDir,
    clock: BAR_CLOCK,
    fetchFull: refuse,
    fetchSince: refuse,
    key: input.key,
    timeOf: (bar) => bar.time,
  });
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index];
}

function share(part: number, whole: number): string {
  return whole === 0 ? "  -  " : `${((100 * part) / whole).toFixed(1)}%`;
}

/**
 * The flags that own the token after them, declared literally.
 *
 * The directory's law (#364 round 50): every value flag is declared here and
 * read through `flagReader`, which refuses a repeat, refuses a blank or
 * flag-shaped value, and refuses reading a flag nothing declared. A hand-rolled
 * `indexOf` walk is how `--days --json x` silently measures a depth of NaN.
 * `tests/sweepManifest.test.ts` derives the files this binds by globbing the
 * directory rather than curating a list, so a new reader is bound the moment it
 * lands.
 */
const VALUE_FLAGS = new Set([
  "--anchor",
  "--cache-dir",
  "--days",
  "--json",
  "--symbols",
]);

export function parseQ4Args(argv: string[]): {
  anchor: string;
  cacheDir: string;
  days: number | null;
  json: string | null;
  symbols: string[];
} {
  // An unknown flag is refused rather than ignored. `flagReader` guards what a
  // DECLARED flag reads; it has no opinion on a token nobody declared, and a
  // silently ignored `--steps 4` is a run that measured something else.
  for (const token of argv) {
    if (token.startsWith("--") && !VALUE_FLAGS.has(token)) {
      throw new Error(
        `q4UnknownFlag: ${token}. Known: ${[...VALUE_FLAGS].join(" ")}`,
      );
    }
  }
  const { num, str } = flagReader(argv, VALUE_FLAGS);
  const anchor = str("--anchor") ?? null;
  const cacheDir = str("--cache-dir") ?? DEFAULT_CACHE_DIR;
  const json = str("--json") ?? null;
  // The sentinel is outside the domain, so an operator who passes --days at
  // all gets the domain check; omitting it leaves the cache to answer.
  const days = str("--days") === undefined
    ? null
    : num("--days", 0, {
      basis: "a cache depth is a whole number of days of history",
      integer: true,
      min: 1,
    });
  const symbols = str("--symbols") === undefined
    ? [...defaultScanSymbols]
    : str("--symbols")!.split(",").map((entry) => entry.trim()).filter(Boolean);

  // NO DEFAULT ANCHOR, deliberately. Every distance this prints is relative to
  // one day's bars, and a reader that silently picked today would answer a
  // different question than the one the caller believed they asked — and would
  // do it by BUYING, since today is not pinned.
  if (anchor === null || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    throw new Error(
      "q4AnchorRequired: pass --anchor YYYY-MM-DD. There is no default: " +
        "every distance printed is relative to one day's bars, and an " +
        "unpinned anchor would spend provider bytes this reader refuses.",
    );
  }
  if (symbols.length === 0) {
    throw new Error("q4EmptyPopulation: --symbols selected no markets.");
  }
  return { anchor, cacheDir, days, json, symbols };
}

/** The one depth the cache holds, or an error naming the choice. */
export function resolveDays(
  requested: number | null,
  available: number[],
): number {
  if (requested !== null) {
    if (!available.includes(requested)) {
      throw new Error(
        `q4DepthAbsent: --days ${requested} is not in the cache, which holds ` +
          `${available.join(", ") || "no 15-minute stores at all"}.`,
      );
    }
    return requested;
  }
  if (available.length === 0) {
    throw new Error(
      "q4EmptyCache: no <provider>-15min-<days>.rolling.json stores found. " +
        "This reader never fetches, so an empty cache is a refusal.",
    );
  }
  if (available.length > 1) {
    throw new Error(
      `q4AmbiguousDepth: the cache holds ${available.join(", ")}. Two ` +
        `rebuild depths are two populations — pass --days to name one.`,
    );
  }
  return available[0];
}

export async function runQ4(argv: string[]): Promise<number> {
  const args = parseQ4Args(argv);
  const days = resolveDays(args.days, cacheDays(await readdir(args.cacheDir)));
  const byMarket = new Map<string, Q4Row>();
  const skipped: Array<{ symbol: string; why: string }> = [];
  const unpinned: Array<{ symbol: string; why: string }> = [];

  for (const symbol of args.symbols) {
    const providerSymbol = resolveProviderSymbols(symbol)[0];
    if (!providerSymbol) {
      skipped.push({ symbol, why: "no provider symbol" });
      continue;
    }
    // A PIN MISS SKIPS THE MARKET AND FAILS THE RUN, rather than throwing on
    // the spot. The refusal itself is unchanged — the fetchers still refuse,
    // so nothing is ever bought — but a roster walk is tens of minutes of CPU
    // and losing all of it to the 91st market's missing pin means the answer
    // never arrives. The misses are named below and the exit code is
    // non-zero, so a partial roster can never read as the roster.
    let primaryBars: Bar[];
    let dailyBars: Bar[];
    let fiveMinuteBars: Bar[];
    try {
      [primaryBars, dailyBars, fiveMinuteBars] = await Promise.all([
        pinnedSeries({
          anchor: args.anchor,
          cacheDir: args.cacheDir,
          key: `${providerSymbol}-15min-${days}`,
        }),
        pinnedSeries({
          anchor: args.anchor,
          cacheDir: args.cacheDir,
          key: `${providerSymbol}-daily-${days}`,
        }),
        pinnedSeries({
          anchor: args.anchor,
          cacheDir: args.cacheDir,
          key: `${providerSymbol}-5min-${days}`,
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // ONLY the pin miss. A clock mismatch, an unreadable store or anything
      // else is a condition about the cache itself and must stop the run.
      if (!message.startsWith("q4PinMissing:")) throw error;
      unpinned.push({ symbol, why: message.split(". ")[0] });
      continue;
    }

    // The same one-clock invariant the sweep enforces, for the same reason:
    // a mixed or naive series is the 2026-08-11 corpus defect, and a reading
    // taken over one is worse than no reading. Corpus-global, so it stops the
    // RUN rather than dropping the market — a reader that quietly skips a
    // poisoned market reports a whole roster it did not measure.
    for (
      const [timeframe, bars] of [
        ["15min", primaryBars],
        ["1day", dailyBars],
        ["5min", fiveMinuteBars],
      ] as const
    ) {
      const facts = seriesFacts(
        bars,
        timeframe === "1day" ? "daily" : "intraday",
      );
      if (facts.clock.verdict === "naive" || facts.clock.verdict === "mixed") {
        throw new Error(
          `q4ClockWitnessRefused: ${symbol} ${timeframe} witnesses a ` +
            `"${facts.clock.verdict}" clock on a stamped store — ` +
            `investigate before reading anything from this cache.`,
        );
      }
    }

    if (primaryBars.length < WARMUP_BARS * 2) {
      skipped.push({
        symbol,
        why: `only ${primaryBars.length} intraday bars`,
      });
      continue;
    }

    const calibration = getCategoryCalibration(symbol);
    const dailySeries = completedDailySeries(symbol, dailyBars);
    const row = emptyRow();
    let dailyVisible = 0;
    let fiveMinVisible = 0;

    for (
      let index = WARMUP_BARS;
      index < primaryBars.length - 1;
      index += STEP_BARS
    ) {
      const history = primaryBars.slice(0, index + 1);
      const latest = history.at(-1)!;
      while (
        dailyVisible < dailySeries.length &&
        dailySeries[dailyVisible].completeAtMs <= latest.time
      ) {
        dailyVisible += 1;
      }
      if (dailyVisible < 40) continue;
      const daily = dailySeries.slice(0, dailyVisible).map((e) => e.bar);
      while (
        fiveMinVisible < fiveMinuteBars.length &&
        fiveMinuteBars[fiveMinVisible].time <= latest.time
      ) {
        fiveMinVisible += 1;
      }
      const market = buildDecisionMarketContext({
        daily,
        fiveMin: fiveMinuteBars.slice(
          Math.max(0, fiveMinVisible - 240),
          fiveMinVisible,
        ),
        history,
      });
      if (getSessionContext(symbol, new Date(latest.time)).block) continue;
      const regime = classifyRegime(market);
      if (!regime) continue;
      const consensus = scoreConsensus(
        runStrategyCommittee(symbol, market, regime),
        regime,
      );
      if (!consensus.side) continue;
      const plan = buildPricePlan(
        consensus.side,
        symbol,
        market,
        regime,
        calibration,
      );
      if (!plan) continue;
      row.planned += 1;

      const side = consensus.side;
      const bars = market.primary;
      const atr = averageTrueRange(bars, 14);
      const dailyAtr = averageTrueRange(daily, 14);
      const pivots = findSwingPivots(bars, 3);
      const dailyPivots = findSwingPivots(daily, 2);
      const entryOffset = atr *
        (regime.name === "trend"
          ? calibration.entryOffsetTrend
          : calibration.entryOffsetDefault);
      const plannedEntry = side === "buy"
        ? latest.close - entryOffset
        : latest.close + entryOffset;
      const stopBuffer = Math.max(
        atr * calibration.stopAtrMultiplier,
        dailyAtr * calibration.dailyStopAtrMultiplier,
      );
      const intradayLevels = side === "buy" ? pivots.lows : pivots.highs;
      const dailyLevels = side === "buy" ? dailyPivots.lows : dailyPivots.highs;

      const shipped = stopUnder({
        atr,
        entryPrice: plannedEntry,
        maxStopAtrMultiplier: calibration.maxStopAtrMultiplier,
        protectiveLevels: intradayLevels,
        side,
        stopBuffer,
      });
      // THE ANCHOR. `stopPivotDistance` is measured against the planned entry
      // (`pricePlan.ts:479-499`), so reproducing it exactly proves the
      // reconstruction of the entry, the pivot arrays, the direction
      // convention and the buffer all at once. Anything else here is a shadow
      // asserting its own arithmetic.
      const reproduced = shipped.pivot === null
        ? null
        : Math.abs(shipped.pivot - plannedEntry);
      const anchored = reproduced === null
        ? plan.stopPivotDistance === null
        : plan.stopPivotDistance !== null &&
          Math.abs(reproduced - plan.stopPivotDistance) <= 1e-9;
      if (!anchored) {
        row.unanchored += 1;
        continue;
      }

      const withDaily = stopUnder({
        atr,
        entryPrice: plannedEntry,
        maxStopAtrMultiplier: calibration.maxStopAtrMultiplier,
        // Union, not replacement: the question is what the stop is BLIND to,
        // not what it would look like on a different series.
        protectiveLevels: [...intradayLevels, ...dailyLevels],
        side,
        stopBuffer,
      });

      const nearestDaily = nearestLevelBeyond(
        side === "buy" ? "sell" : "buy",
        plannedEntry,
        dailyLevels,
      );
      if (nearestDaily !== null) {
        row.dailyPresent += 1;
        if (shipped.pivot === null) {
          row.dailyOnly += 1;
        } else if (Math.abs(nearestDaily - plannedEntry) < Math.abs(shipped.pivot - plannedEntry)) {
          row.dailyNearer += 1;
        }
      }
      if (withDaily.stop !== shipped.stop) {
        row.stopMoves += 1;
        // Adding levels to a nearest-beyond search can only find a NEARER
        // level, so the stop tightens or holds and never widens. Recorded as
        // a magnitude with that direction stated rather than signed, so a
        // negative here would be a bug rather than a finding.
        row.moveAtr.push(Math.abs(withDaily.stop - shipped.stop) / atr);
        if (withDaily.provenance !== shipped.provenance) {
          row.provenanceFlips += 1;
        }
      }
    }
    byMarket.set(symbol, row);
    // Progress to STDERR, so a roster walk is distinguishable from a hang and
    // the table on stdout stays pipeable. Tens of minutes of silence is what
    // makes an operator kill a run that was working.
    process.stderr.write(
      `${String(byMarket.size).padStart(3)}/${args.symbols.length} ` +
        `${symbol.padEnd(10)} ${String(row.planned).padStart(6)} plans, ` +
        `${share(row.stopMoves, row.planned)} move\n`,
    );
  }

  const measured = [...byMarket.entries()].filter(([, r]) => r.planned > 0);
  if (measured.length === 0) {
    console.error(
      "q4NoDecisions: every market produced zero plans, so there is no " +
        "reading. This is a refusal, not a result of zero.",
    );
    return 2;
  }

  const byClass = new Map<string, Q4Row>();
  for (const [symbol, row] of measured) {
    const key = getAssetType(symbol);
    const into = byClass.get(key) ?? emptyRow();
    into.planned += row.planned;
    into.unanchored += row.unanchored;
    into.dailyPresent += row.dailyPresent;
    into.dailyOnly += row.dailyOnly;
    into.dailyNearer += row.dailyNearer;
    into.stopMoves += row.stopMoves;
    into.provenanceFlips += row.provenanceFlips;
    into.moveAtr.push(...row.moveAtr);
    byClass.set(key, into);
  }

  console.log(
    `\nR2b question 4 — what the stop's structural search cannot see.\n` +
      `Anchor ${args.anchor}, depth ${days}d; ${measured.length} markets; ` +
      `zero provider bytes (pinned reads, refusing fetchers).\n`,
  );
  console.log(
    "class          plans  unanchd  dailyPresent  dailyOnly  dailyNearer  " +
      "stopMoves  provFlip  medATR  p90ATR",
  );
  for (const [name, row] of [...byClass].sort()) {
    const moved = row.moveAtr;
    console.log(
      `${name.padEnd(13)} ${String(row.planned).padStart(6)} ` +
        `${String(row.unanchored).padStart(8)} ` +
        `${share(row.dailyPresent, row.planned).padStart(13)} ` +
        `${share(row.dailyOnly, row.planned).padStart(10)} ` +
        `${share(row.dailyNearer, row.planned).padStart(12)} ` +
        `${share(row.stopMoves, row.planned).padStart(10)} ` +
        `${share(row.provenanceFlips, row.planned).padStart(9)} ` +
        `${(moved.length ? quantile(moved, 0.5).toFixed(3) : "  -  ").padStart(7)} ` +
        `${(moved.length ? quantile(moved, 0.9).toFixed(3) : "  -  ").padStart(7)}`,
    );
  }

  const unanchored = [...byClass.values()].reduce((s, r) => s + r.unanchored, 0);
  const planned = [...byClass.values()].reduce((s, r) => s + r.planned, 0);
  if (unanchored > 0) {
    console.error(
      `\nq4Unanchored: ${unanchored} of ${planned} plans could not be ` +
        `reproduced against the plan's own stopPivotDistance, so the ` +
        `counterfactual arm is not known to differ from production by the ` +
        `pivot set alone. Those decisions are excluded from every share ` +
        `above; investigate before quoting any of it.`,
    );
  }
  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const entry of skipped) console.log(`  ${entry.symbol}: ${entry.why}`);
  }
  if (unpinned.length > 0) {
    console.error(
      `\nq4Unpinned: ${unpinned.length} of ${args.symbols.length} markets ` +
        `are not pinned at ${args.anchor} and were NOT measured. The table ` +
        `above describes the markets that were, which is not the roster:`,
    );
    for (const entry of unpinned) {
      console.error(`  ${entry.symbol}: ${entry.why}`);
    }
  }
  console.log(
    "\nThis measures STOP PLACEMENT ONLY. A moved stop moves riskDistance, " +
      "which moves TP1, the payoff gate and admission, so the accepted " +
      "population would differ — that is a grid arm, not an arithmetic. No " +
      "R consequence is derivable from this table (amendment 39).",
  );

  if (args.json) {
    await writeFile(
      args.json,
      JSON.stringify(
        {
          anchor: args.anchor,
          days,
          byClass: Object.fromEntries(
            [...byClass].map(([name, row]) => [name, {
              ...row,
              moveAtrMedian: row.moveAtr.length ? quantile(row.moveAtr, 0.5) : null,
              moveAtrP90: row.moveAtr.length ? quantile(row.moveAtr, 0.9) : null,
              moveAtr: undefined,
            }]),
          ),
          byMarket: Object.fromEntries(
            measured.map(([symbol, row]) => [symbol, {
              ...row,
              moveAtrMedian: row.moveAtr.length ? quantile(row.moveAtr, 0.5) : null,
              moveAtr: undefined,
            }]),
          ),
          skipped,
          unpinned,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`\nWrote ${args.json}`);
  }
  // Distinct codes: 3 says the counterfactual arm is not known to differ by
  // the pivot set alone, 4 says the population is short of the one asked for.
  if (unanchored > 0) return 3;
  return unpinned.length > 0 ? 4 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runQ4(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
