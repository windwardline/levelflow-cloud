/**
 * Derive the per-class fold spec for a shard fleet — ONCE, globally, from
 * the warm cache — so every shard folds on identical class calendars. A
 * per-shard pre-pass sees only its own symbols and re-creates the drift
 * the fold-span pin exists to prevent; this runs over the WHOLE universe
 * and writes the spec the fleet loads via --fold-spec.
 *
 *   npx tsx scripts/derive-fold-spec.ts --symbols A,B,... --days 7000 \
 *     --out sweeps/4c/fold-spec.json
 */
import { writeFileSync } from "node:fs";
import {
  getAssetType,
  hasKnownAssetType,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { resolveProviderSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";
import {
  DEFAULT_CACHE_DIR,
  loadRollingSeries,
} from "./calibrationCache.ts";
import type { ClassFoldSpec } from "./sweepFolds.ts";

const get = (flag: string) => {
  const index = process.argv.indexOf(`--${flag}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main(): Promise<void> {
  const symbols = (get("symbols") ?? "").split(",").map((value) =>
    value.trim().toUpperCase()
  ).filter(Boolean);
  const days = Number(get("days") ?? "7000");
  const out = get("out");
  if (symbols.length === 0 || !out) {
    console.error("usage: derive-fold-spec.ts --symbols A,B --days N --out spec.json");
    process.exit(1);
  }
  const anchor = new Date().toISOString().slice(0, 10);
  const spec: ClassFoldSpec = {};
  for (const symbol of symbols) {
    const providerSymbol = resolveProviderSymbols(symbol)[0];
    if (!providerSymbol) continue;
    const bars = await loadRollingSeries<Bar>({
      anchor,
      cacheDir: DEFAULT_CACHE_DIR,
      fetchFull: () => {
        throw new Error(`${symbol}: cache cold — warm it with the sweep first`);
      },
      fetchSince: () => Promise.resolve([]),
      key: `${providerSymbol}-15min-${days}`,
      legacyPrefix: `${providerSymbol}-15min-${days}-`,
      timeOf: (bar) => bar.time,
    });
    if (bars.length === 0) continue;
    if (!hasKnownAssetType(symbol)) {
      throw new Error(
        `${symbol} is not in any asset-class roster — fold-spec symbols ` +
          `must be Levelflow roster names, never provider tickers (CV-1)`,
      );
    }
    const className = getAssetType(symbol);
    const entry = spec[className] ?? {
      endMs: Number.NEGATIVE_INFINITY,
      startMs: Number.POSITIVE_INFINITY,
    };
    entry.startMs = Math.min(entry.startMs, bars[0].time);
    entry.endMs = Math.max(entry.endMs, bars.at(-1)!.time);
    spec[className] = entry;
  }
  writeFileSync(out, JSON.stringify(spec, null, 2) + "\n");
  for (const [className, span] of Object.entries(spec)) {
    console.log(
      `${className}: ${new Date(span.startMs).toISOString().slice(0, 10)} .. ${
        new Date(span.endMs).toISOString().slice(0, 10)
      }`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
