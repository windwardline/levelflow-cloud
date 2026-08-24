// Derives the per-symbol baseline artifact from the calibration cache.
//
// DELIBERATELY NOT AUTOMATIC. The artifact is tracked and reviewed in a PR
// diff, because its reference era is a FIXED fact and a script that quietly
// refreshed it every run would re-baseline a decaying feed into looking
// healthy — the exact failure the fixed era exists to prevent.
//
//   npx tsx scripts/derive-baselines.ts            # refuse if the era would move
//   npx tsx scripts/derive-baselines.ts --new-era  # cut a new generation
//
// Run it against a cache that has PASSED verify-cache-clock. A baseline
// derived from stores whose clock is unproven records the defect as the norm.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASELINE_ARTIFACT_VERSION,
  BASELINE_MIN_ROWS,
  type BaselineArtifact,
  type MarketBaseline,
  type TimeframeBaseline,
} from "./marketBaselines.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import {
  defaultScanSymbols,
  resolveProviderSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
// Through the SHARED writer, never writeFileSync: a raw rewrite would
// silently retire any INVALID banner standing on this artifact, and the
// standing-claims rule says a caveat is retired by a human who revalidated,
// with the reason recorded — never as a side effect of re-running something.
import { writeResearchArtifact } from "./researchArtifact.ts";
import { soleFlagIndex } from "./flagReader.ts";

// This script takes no flag VALUES: `--new-era` is a presence check, so
// nothing here can swallow the token after it. It still resolves through
// `soleFlagIndex` rather than `argv.includes`, which is not decoration — that
// helper REFUSES a repeated flag, and a run given `--new-era` twice should
// stop rather than pick one.
export const VALUE_FLAGS = new Set<string>([]);

const CACHE_DIR = ".calibration-cache";
const ARTIFACT = "docs/research/market-baselines.json";
const TIMEFRAMES = ["5min", "15min", "daily"] as const;
const DAY_MS = 86_400_000;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function readStore(providerSymbol: string, timeframe: string) {
  const path = join(CACHE_DIR, `${providerSymbol}-${timeframe}-7000.rolling.json`);
  if (!existsSync(path)) return null;
  try {
    const store = JSON.parse(readFileSync(path, "utf8")) as {
      clock?: string;
      items?: Array<{ time: number }>;
    };
    if (store.clock !== BAR_CLOCK) {
      throw new Error(
        `${providerSymbol}-${timeframe}: store carries clock ${
          JSON.stringify(store.clock)
        } but this build reads ${BAR_CLOCK} — a baseline derived across ` +
          `clocks records one normalisation's artifacts as another's norm`,
      );
    }
    return store.items ?? [];
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function timeframeBaseline(
  items: Array<{ time: number }>,
  fromMs: number,
  toMs: number,
): TimeframeBaseline | null {
  const inEra = items.filter((bar) => bar.time >= fromMs && bar.time <= toMs);
  if (inEra.length === 0) return null;
  const first = inEra[0].time;
  const last = inEra[inEra.length - 1].time;
  const spanDays = Math.max(1, (last - first) / DAY_MS);
  return {
    firstIso: isoDay(first),
    lastIso: isoDay(last),
    rows: inEra.length,
    rowsPerDay: Number((inEra.length / spanDays).toFixed(2)),
    spanDays: Number(spanDays.toFixed(2)),
    // Amendment 25: recorded as starved rather than omitted, so a later
    // reader can tell a thin market from an unmeasured one.
    starved: inEra.length < BASELINE_MIN_ROWS,
  };
}

function main() {
  const wantNewEra = soleFlagIndex(process.argv.slice(2), "--new-era") !== -1;
  const existing: BaselineArtifact | null = existsSync(ARTIFACT)
    ? JSON.parse(readFileSync(ARTIFACT, "utf8"))
    : null;

  // The source -> markets map, derived rather than listed: 97 engine markets
  // resolve to 96 sources because WTI and CLUSD share one.
  const marketsBySource = new Map<string, string[]>();
  for (const market of defaultScanSymbols) {
    const source = resolveProviderSymbols(market)[0] ?? market;
    marketsBySource.set(source, [...(marketsBySource.get(source) ?? []), market]);
  }

  const nowIso = new Date().toISOString();
  const baselines: MarketBaseline[] = [];
  for (const [source, markets] of [...marketsBySource.entries()].sort()) {
    const stores = TIMEFRAMES.map((tf) => [tf, readStore(source, tf)] as const);
    if (stores.every(([, items]) => items === null || items.length === 0)) {
      continue;
    }
    // The era is the source's OWN measurable span, and once cut it is fixed.
    const priorEra = existing?.baselines.find((b) => b.providerSymbol === source)
      ?.referenceEra;
    const allTimes = stores.flatMap(([, items]) => items ?? []).map((b) => b.time);
    const fromMs = priorEra && !wantNewEra
      ? Date.parse(`${priorEra.fromIso}T00:00:00Z`)
      : Math.min(...allTimes);
    const toMs = priorEra && !wantNewEra
      ? Date.parse(`${priorEra.toIso}T23:59:59Z`)
      : Math.max(...allTimes);
    const timeframes: Record<string, TimeframeBaseline | null> = {};
    for (const [tf, items] of stores) {
      timeframes[tf] = items ? timeframeBaseline(items, fromMs, toMs) : null;
    }
    baselines.push({
      assetType: getAssetType(markets[0]),
      derivedAt: priorEra && !wantNewEra
        ? existing!.baselines.find((b) => b.providerSymbol === source)!.derivedAt
        : nowIso,
      markets: markets.sort(),
      providerSymbol: source,
      referenceEra: { fromIso: isoDay(fromMs), toIso: isoDay(toMs) },
      timeframes,
    });
  }

  // THE ERA MAY NOT MOVE SILENTLY. Without --new-era, a shifted era is a
  // refusal: it means the cache no longer covers what the baseline was cut
  // against, which is a fact to look at rather than to overwrite.
  if (existing && !wantNewEra) {
    const moved = baselines.filter((next) => {
      const prior = existing.baselines.find(
        (b) => b.providerSymbol === next.providerSymbol,
      );
      return prior !== undefined &&
        (prior.referenceEra.fromIso !== next.referenceEra.fromIso ||
          prior.referenceEra.toIso !== next.referenceEra.toIso);
    });
    if (moved.length > 0) {
      throw new Error(
        `reference era moved for ${moved.length} source(s) — ` +
          `${moved.slice(0, 5).map((m) => m.providerSymbol).join(", ")}` +
          `${moved.length > 5 ? ", ..." : ""}. A baseline recomputed over a ` +
          `moving window re-baselines a decaying feed into looking healthy. ` +
          `Pass --new-era to cut a new generation deliberately.`,
      );
    }
  }

  const artifact: BaselineArtifact = {
    barClock: BAR_CLOCK,
    baselines,
    derivedAt: nowIso,
    version: BASELINE_ARTIFACT_VERSION,
  };
  writeResearchArtifact(ARTIFACT, artifact as unknown as Record<string, unknown>);
  const starved = baselines.filter((b) =>
    Object.values(b.timeframes).some((t) => t?.starved)
  );
  console.log(
    `${ARTIFACT}: ${baselines.length} sources, clock ${BAR_CLOCK}` +
      `${wantNewEra ? " (NEW ERA)" : ""}`,
  );
  if (starved.length > 0) {
    console.log(
      `starved (amendment 25, recorded not omitted): ${
        starved.map((b) => b.providerSymbol).join(", ")
      }`,
    );
  }
}

main();
