/**
 * Derive the per-class fold spec for a shard fleet — ONCE, globally, from
 * the warm cache — so every shard folds on identical class calendars. A
 * per-shard pre-pass sees only its own symbols and re-creates the drift
 * the fold-span pin exists to prevent; this runs over the WHOLE universe
 * and writes the spec the fleet loads via --fold-spec.
 *
 * WHY PER CLASS AT ALL. One global calendar over the roster's 2009-2026
 * span puts every 2023-era class — futures, energies, agriculture, livestock
 * — entirely inside the confirm fold, so the class-grain gate returns no
 * verdict for four of eight classes. R3's run card, as first written, did
 * exactly that on 2026-09-02; the per-class arm is the class-grain
 * instrument, and it costs nothing at a pinned anchor.
 *
 * READ AT THE ANCHOR, never at the run day. Until 2026-09-02 this pinned
 * itself to `new Date()`, the defect the sweep driver carried at five call
 * sites until `--anchor` landed: at a past anchor the run day is pinned in
 * no store, `fetchFull` fires, and the deriver refuses a cache that is fully
 * warm at the day the sweep will actually read.
 *
 *   npx tsx scripts/derive-fold-spec.ts --symbols roster --days 7000 \
 *     --anchor 2026-08-26 --out docs/research/r3/fold-spec-2026-08-26.json
 */
import { fileURLToPath } from "node:url";
import {
  getAssetType,
  hasKnownAssetType,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import {
  defaultScanSymbols,
  resolveProviderSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";
import {
  DEFAULT_CACHE_DIR,
  loadRollingSeries,
} from "./calibrationCache.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";
import type { ClassFoldSpec } from "./sweepFolds.ts";

const VALUE_FLAGS = new Set(["--anchor", "--days", "--out", "--symbols"]);

export type FoldSpecArgs = {
  anchor: string;
  days: number;
  out: string;
  symbols: string[];
};

export function parseFoldSpecArgs(argv: readonly string[]): FoldSpecArgs {
  const { num, str } = flagReader(argv, VALUE_FLAGS);
  const symbolsArg = str("--symbols") ?? "";
  // "roster" derives the list from the engine's own scan roster, the same
  // spelling the sweep driver takes — one source, no hand-kept copy.
  const symbols = (symbolsArg.trim().toLowerCase() === "roster"
    ? defaultScanSymbols
    : symbolsArg.split(",").map((value) => value.trim().toUpperCase()))
    .filter(Boolean);
  // num(), never a hand coercion of the string accessor (#364 round 51,
  // finding 1): a NaN here makes every rolling-store key
  // `<symbol>-15min-NaN`, so every symbol misses its warmed store and
  // the script writes an EMPTY fold spec — the artifact 3c's
  // across-shards law rests on — and exits 0.
  const days = num("--days", 7000, {
    basis: "a depth of zero or fractional days names no store the sweep " +
      "would read, and the spec must be derived at the sweep's own depth",
    integer: true,
    min: 1,
  });
  const out = str("--out");
  if (symbols.length === 0) {
    throw new OperatorInputError(
      "derive-fold-spec: --symbols names no market — pass a list, or " +
        "\"roster\" for the engine's scan roster",
    );
  }
  if (!out) {
    throw new OperatorInputError(
      "derive-fold-spec: --out names no path — the spec is the artifact " +
        "every shard of one measurement folds on, so it must be written",
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const anchor = str("--anchor") ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    throw new OperatorInputError(
      `--anchor must be YYYY-MM-DD and got "${anchor}" — the anchor selects ` +
        `which cache pin every series is read at, and a token the store ` +
        `cannot match is a full refetch, not a typo`,
    );
  }
  if (anchor > today) {
    throw new OperatorInputError(
      `--anchor ${anchor} is in the future (today is ${today}) — no store ` +
        `can hold that pin`,
    );
  }
  return { anchor, days, out, symbols };
}

/**
 * Each class's union span over its members' 15-minute stores, read at the
 * anchor's pin — truncated there exactly as the sweep will read them.
 */
export async function deriveFoldSpec(input: {
  anchor: string;
  cacheDir?: string;
  days: number;
  symbols: string[];
}): Promise<ClassFoldSpec> {
  const spec: ClassFoldSpec = {};
  for (const symbol of input.symbols) {
    const providerSymbol = resolveProviderSymbols(symbol)[0];
    if (!providerSymbol) continue;
    const bars = await loadRollingSeries<Bar>({
      anchor: input.anchor,
      cacheDir: input.cacheDir ?? DEFAULT_CACHE_DIR,
      clock: BAR_CLOCK,
      fetchFull: () => {
        throw new Error(
          `${symbol}: cache cold at anchor ${input.anchor} — the store holds ` +
            `no pin for that day; warm it with the sweep first, or anchor at ` +
            `a day it holds`,
        );
      },
      fetchSince: () => {
        throw new Error(
          `${symbol}: cache cold at anchor ${input.anchor} — the store holds ` +
            `no pin for that day and this deriver never fetches`,
        );
      },
      key: `${providerSymbol}-15min-${input.days}`,
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
  return spec;
}

async function main(): Promise<void> {
  const args = parseFoldSpecArgs(process.argv.slice(2));
  const spec = await deriveFoldSpec(args);
  // Through the shared writer, like every other research artifact: a spec
  // that has been banned (its cache condemned) keeps its banner across a
  // re-derivation instead of losing it. `foldsByClass` refuses a spec that
  // carries one, so the banner can never be read as a class.
  writeResearchArtifact(args.out, spec);
  console.log(`fold spec at anchor ${args.anchor}, depth ${args.days}:`);
  for (const [className, span] of Object.entries(spec)) {
    console.log(
      `${className}: ${new Date(span.startMs).toISOString().slice(0, 10)} .. ${
        new Date(span.endMs).toISOString().slice(0, 10)
      }`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    if (error instanceof OperatorInputError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  });
}
