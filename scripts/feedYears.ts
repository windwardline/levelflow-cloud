/**
 * The year map — which symbol-years the feed-character witness names.
 *
 * One helper, so every reader that stratifies by feed character does it the
 * same way: from the corpus manifest's `feedCharacter` (corpora built after
 * #589 carry it per market, both intraday tiers, per year) or, for a corpus
 * that predates the field, from the tracked witness table
 * (`docs/research/r3/feed-character.txt`, the 5-minute tier). The 5-minute
 * tier is the one the engine's setups are resolved on, so it is the tier the
 * map reads on both sources.
 *
 * A symbol neither source names is `unknown`, and a reader asked to stratify
 * on it refuses rather than counting it as clean — an absent verdict is not a
 * contained one. A manifest that carries the field on some symbols and not
 * others is refused as mixed: one source per read, never a guess per symbol.
 */
import { readFileSync } from "node:fs";

export const YEAR_BUCKETS = ["contained", "escaping"] as const;
export type YearBucket = (typeof YEAR_BUCKETS)[number];
export type YearsFilter = "all" | YearBucket;

/** The tier the map reads; the engine resolves setups on it. */
export const MAP_TIER = "5min";

type ManifestLike = {
  symbols: Array<{ symbol: string; feedCharacter?: Record<string, { escapeYears?: number[] }> }>;
};

export type YearMap = {
  source: "manifest" | "witness";
  /** Symbols the caller's manifests carry that the source could not place. */
  symbolsWithoutMap: string[];
  bucketOf(symbol: string, year: number): YearBucket | "unknown";
};

export function yearOf(timeMs: number): number {
  return new Date(timeMs).getUTCFullYear();
}

/**
 * The witness table as the reader writes it: a verdict line per store —
 * `SYMBOL 5min ESCAPES: 2021, 2022` or `SYMBOL 5min contained` or
 * `SYMBOL 5min unjudgeable` — followed by indented year lines. Only the
 * MAP_TIER's verdict line is read; an unjudgeable or contained store maps to
 * no escaping years; an ABSENT store is not in the map at all. A year token
 * that is not an integer refuses the whole table: dropping it would turn an
 * escaping year into a contained one.
 */
export function parseWitnessTable(text: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith(" ") || line.length === 0) continue;
    const match = /^([A-Z0-9^]+) (\S+) (ESCAPES: (.*)|contained|unjudgeable)$/.exec(line);
    if (!match || match[2] !== MAP_TIER) continue;
    const years = match[4]
      ? match[4].split(",").map((value) => {
          const year = Number(value.trim());
          if (!Number.isInteger(year)) {
            throw new Error(`witness table: ${match[1]} ${MAP_TIER} names a year that is not one — "${value.trim()}" — a dropped token would read as a contained year`);
          }
          return year;
        })
      : [];
    out.set(match[1], new Set(years));
  }
  return out;
}

export function resolveYearMap(input: { manifests: ManifestLike[]; witnessTablePath?: string }): YearMap {
  const symbols = new Set<string>();
  const fromManifest = new Map<string, Set<number>>();
  let carried = 0;
  for (const manifest of input.manifests) {
    for (const entry of manifest.symbols) {
      symbols.add(entry.symbol);
      const tier = entry.feedCharacter?.[MAP_TIER];
      if (tier) {
        carried += 1;
        fromManifest.set(entry.symbol, new Set(tier.escapeYears ?? []));
      }
    }
  }
  if (carried > 0 && carried < symbols.size) {
    const missing = [...symbols].filter((symbol) => !fromManifest.has(symbol)).sort();
    throw new Error(
      `the manifest carries feedCharacter on ${carried} of ${symbols.size} symbols — a mixed map is refused; ` +
        `missing: ${missing.join(", ")}`,
    );
  }
  let map: Map<string, Set<number>>;
  let source: YearMap["source"];
  if (carried === symbols.size && symbols.size > 0) {
    map = fromManifest;
    source = "manifest";
  } else if (input.witnessTablePath) {
    map = parseWitnessTable(readFileSync(input.witnessTablePath, "utf8"));
    source = "witness";
  } else {
    throw new Error(
      "no year map: the manifest carries no feedCharacter and no --witness table was given — a reader cannot stratify by feed character on a guess",
    );
  }
  const symbolsWithoutMap = [...symbols].filter((symbol) => !map.has(symbol)).sort();
  return {
    bucketOf(symbol, year) {
      const years = map.get(symbol);
      if (!years) return "unknown";
      return years.has(year) ? "escaping" : "contained";
    },
    source,
    symbolsWithoutMap,
  };
}

/**
 * The header fragment a reader prints so its stratification is legible. A
 * reader that stratified carries a source; asked to describe none, this
 * refuses rather than printing a map that was never resolved.
 */
export function describeYearMap(source: YearMap["source"] | null, witnessTablePath?: string): string {
  if (source === null) throw new Error("describeYearMap: no year map was resolved for this read — a stratified summary must carry its source");
  return source === "manifest"
    ? "year map: manifest feedCharacter (5min tier)"
    : `year map: witness table ${witnessTablePath ?? "(unnamed)"} (5min tier)`;
}
