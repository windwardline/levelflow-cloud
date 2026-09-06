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
import type { FeedCharacterRecord } from "./feedCharacter.ts";
import { OperatorInputError } from "./flagReader.ts";

export const YEAR_BUCKETS = ["contained", "escaping"] as const;
export type YearBucket = (typeof YEAR_BUCKETS)[number];
export type YearsFilter = "all" | YearBucket;

/** The tier the map reads; the engine resolves setups on it. */
export const MAP_TIER = "5min";

/**
 * What the map reads off a manifest — typed against the manifest's own record
 * so a renamed field breaks the build here instead of reading every symbol as
 * contained.
 */
type ManifestLike = {
  readonly symbols: ReadonlyArray<{
    readonly symbol: string;
    readonly feedCharacter?: Readonly<Record<string, Pick<FeedCharacterRecord, "escapeYears">>>;
  }>;
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
 * that is not a four-digit year refuses the whole table (a blank token — a
 * trailing comma — coerces to 0 and would pass an integer check): dropping it
 * would turn an escaping year into a contained one. A symbol whose MAP_TIER
 * line appears twice — two witness runs concatenated — is refused too: this
 * reader will not choose between them.
 */
export function parseWitnessTable(text: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith(" ") || line.length === 0) continue;
    const match = /^([A-Z0-9^]+) (\S+) (ESCAPES: (.*)|contained|unjudgeable)$/.exec(line);
    if (!match || match[2] !== MAP_TIER) continue;
    if (out.has(match[1])) {
      throw new Error(`witness table: ${match[1]} ${MAP_TIER} has two verdict lines — this reader will not choose between them`);
    }
    const years = match[4]
      ? match[4].split(",").map((value) => {
          const token = value.trim();
          if (!/^\d{4}$/.test(token)) {
            throw new Error(`witness table: ${match[1]} ${MAP_TIER} names a year that is not one — "${token}" — a dropped token would read as a contained year`);
          }
          return Number(token);
        })
      : [];
    out.set(match[1], new Set(years));
  }
  return out;
}

/** A table that cannot be read is operator input, not a defect: one clean line, no stack. */
function readWitnessTable(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "unreadable";
    throw new OperatorInputError(`--witness ${path}: cannot read the witness table (${code}) — name the tracked table, e.g. docs/research/r3/feed-character.txt`);
  }
}

export function resolveYearMap(input: { manifests: ManifestLike[]; witnessTablePath?: string }): YearMap {
  // Per symbol, never per entry: two shards naming the same market must not
  // count as two symbols carrying the field, nor hide one shard without it.
  const symbols = new Set<string>();
  const withoutField = new Set<string>();
  const fromManifest = new Map<string, Set<number>>();
  for (const manifest of input.manifests) {
    for (const entry of manifest.symbols) {
      symbols.add(entry.symbol);
      const tier = entry.feedCharacter?.[MAP_TIER];
      if (tier) fromManifest.set(entry.symbol, new Set(tier.escapeYears));
      else withoutField.add(entry.symbol);
    }
  }
  if (fromManifest.size > 0 && withoutField.size > 0) {
    const missing = [...withoutField].sort();
    throw new Error(
      `the manifest carries feedCharacter on ${fromManifest.size} of ${symbols.size} symbols — a mixed map is refused; ` +
        `missing: ${missing.join(", ")}`,
    );
  }
  let map: Map<string, Set<number>>;
  let source: YearMap["source"];
  if (fromManifest.size === symbols.size && symbols.size > 0) {
    map = fromManifest;
    source = "manifest";
  } else if (input.witnessTablePath) {
    map = parseWitnessTable(readWitnessTable(input.witnessTablePath));
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
