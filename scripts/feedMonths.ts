/**
 * feedMonths — the feed witness at MONTH grain, for span exclusion.
 *
 * `feedYears.ts` reads the witness's YEAR verdict and buckets a row contained
 * or escaping. That grain is too coarse for the exclusion round 2 decided on
 * 2026-09-07: 651 months escape INSIDE contained years across 305 store-years,
 * and every one of forex's 62 hidden-2024 months falls January to July. A year
 * bucket either throws away five clean months to drop two dirty ones, or keeps
 * the dirty ones. Neither is the decision that was taken.
 *
 * So this reads both statements the witness makes and unions them:
 *
 *   EURUSD 5min ESCAPES: 2021, 2022, 2023          <- whole years
 *     HIDDEN INSIDE A CONTAINED YEAR — months 202401, 202402, ...
 *
 * A symbol may carry SEVERAL hidden lines (EURUSD carries two), so they
 * accumulate rather than conflict — unlike the verdict line, where two would be
 * a contradiction this refuses to choose between.
 *
 * WHAT THIS IS NOT. It does not decide what an excluded month means for a
 * verdict. It states which months the witness will not vouch for, exactly, and
 * refuses a symbol it cannot place. An absent verdict is not a clean one.
 */
import { readFileSync } from "node:fs";
import { MAP_TIER } from "./feedYears.ts";
import { OperatorInputError } from "./flagReader.ts";

/** YYYYMM, the same integer key `feedCharacter.ts` emits. */
export type MonthKey = number;

export type WitnessMonths = {
  /** Whole years the witness named on the verdict line. */
  escapeYears: Set<number>;
  /** Months it named inside years it otherwise called contained. */
  hiddenMonths: Set<MonthKey>;
  /** "contained" | "unjudgeable" | "escapes" — the verdict line's own word. */
  verdict: "contained" | "escapes" | "unjudgeable";
};

export function monthOf(timeMs: number): MonthKey {
  const date = new Date(timeMs);
  return date.getUTCFullYear() * 100 + (date.getUTCMonth() + 1);
}

export function yearOfMonth(month: MonthKey): number {
  return Math.floor(month / 100);
}

/** First millisecond of a YYYYMM, UTC. */
export function monthStartMs(month: MonthKey): number {
  return Date.UTC(yearOfMonth(month), (month % 100) - 1, 1);
}

/** First millisecond of the month AFTER this one, UTC. */
export function monthEndMs(month: MonthKey): number {
  const year = yearOfMonth(month);
  const index = month % 100;
  return index === 12 ? Date.UTC(year + 1, 0, 1) : Date.UTC(year, index, 1);
}

/** Operator input, not a defect: one clean line, no stack — as feedYears does. */
function refuse(message: string): never {
  throw new OperatorInputError(message);
}

/**
 * Parse the tracked witness table at month grain.
 *
 * Only `MAP_TIER` blocks count, matching `feedYears.parseWitnessTable`. A
 * hidden line is attributed to the block it sits in, so the walk tracks the
 * current symbol rather than matching the line in isolation.
 */
export function parseWitnessMonths(text: string): Map<string, WitnessMonths> {
  const out = new Map<string, WitnessMonths>();
  let current: string | null = null;
  // `current` is null both BEFORE the first block and INSIDE a block for
  // another tier. Those are not the same condition: the table carries 133
  // HIDDEN lines under 15min blocks that must be skipped, and a hidden line
  // before any block at all is a malformed table. This separates them.
  let sawBlock = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;

    if (!line.startsWith(" ")) {
      const match =
        /^([A-Z0-9^]+) (\S+) (ESCAPES: (.*)|contained|unjudgeable)$/.exec(line);
      if (!match) {
        // An UNINDENTED hidden line would otherwise fall through here and be
        // dropped in silence — months read as clean, which is the whole
        // failure this parser refuses elsewhere. Indentation is a formatting
        // detail; the announcement is not.
        if (/HIDDEN INSIDE A CONTAINED YEAR/.test(line)) {
          refuse(
            `witness table: a HIDDEN months line is not indented under a verdict block — ${JSON.stringify(line.trim().slice(0, 120))}`,
          );
        }
        continue;
      }
      sawBlock = true;
      if (match[2] !== MAP_TIER) {
        // A block for another tier. Stop attributing hidden lines to the last
        // MAP_TIER symbol, or one tier's months land on another's verdict.
        current = null;
        continue;
      }
      if (out.has(match[1])) {
        refuse(
          `witness table: ${match[1]} ${MAP_TIER} has two verdict lines — this reader will not choose between them`,
        );
      }
      const years = match[4]
        ? match[4].split(",").map((value) => {
          const token = value.trim();
          if (!/^\d{4}$/.test(token)) {
            refuse(
              `witness table: ${match[1]} ${MAP_TIER} names a year that is not one — "${token}" — a dropped token would read as a contained year`,
            );
          }
          return Number(token);
        })
        : [];
      current = match[1];
      out.set(current, {
        escapeYears: new Set(years),
        hiddenMonths: new Set(),
        verdict: match[4]
          ? "escapes"
          : line.endsWith("unjudgeable")
          ? "unjudgeable"
          : "contained",
      });
      continue;
    }

    // TIER FIRST, then form. A well-formed 15min hidden line is skipped, so a
    // MALFORMED one must be skipped too — refusing on it would let a bad
    // regeneration of the tier this reader ignores block the tier it serves.
    // The table carries 133 hidden lines under 15min blocks.
    if (current === null) {
      if (sawBlock) continue; // another tier's months; not this map's business
      refuse(
        `witness table: a HIDDEN months line appears before any verdict line — it cannot be attributed to a market`,
      );
    }
    // Within THIS tier, a line that announces hidden months and then does not
    // parse is a malformed table, not an unrelated line. Skipping it silently
    // would drop months and read them as clean — the failure the token checks
    // below exist to prevent, arriving one level up.
    const hidden = /HIDDEN INSIDE A CONTAINED YEAR — months ([^:]+):/.exec(line);
    if (!hidden) {
      if (/HIDDEN INSIDE A CONTAINED YEAR/.test(line)) {
        refuse(
          `witness table: ${current} carries a HIDDEN months line with no parseable month list — ${JSON.stringify(line.trim().slice(0, 120))}`,
        );
      }
      continue;
    }
    const entry = out.get(current)!;
    for (const value of hidden[1].split(",")) {
      const token = value.trim();
      if (!/^\d{6}$/.test(token)) {
        refuse(
          `witness table: ${current} names a hidden month that is not one — "${token}" — a dropped token would read as a clean month`,
        );
      }
      const index = Number(token) % 100;
      if (index < 1 || index > 12) {
        refuse(
          `witness table: ${current} names hidden month "${token}", whose month part is ${index} — not a month`,
        );
      }
      entry.hiddenMonths.add(Number(token));
    }
  }
  return out;
}

export function readWitnessMonths(path: string): Map<string, WitnessMonths> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const code = error instanceof Error && "code" in error
      ? String((error as { code: unknown }).code)
      : "unreadable";
    refuse(
      `--witness ${path}: cannot read the witness table (${code}) — name the tracked table, e.g. docs/research/r3/feed-character.txt`,
    );
  }
  return parseWitnessMonths(text);
}

export type MonthMap = {
  /** True when the witness will not vouch for this market at this instant. */
  excludedAt(symbol: string, timeMs: number): boolean;
  /** Every excluded month for a market, ascending. */
  excludedMonths(symbol: string): MonthKey[];
  /** Merged [startMs, endMs) runs of excluded time inside a span. */
  excludedIntervals(
    symbol: string,
    spanStartMs: number,
    spanEndMs: number,
  ): Array<{ endMs: number; startMs: number }>;
  source: string;
  symbols: ReadonlySet<string>;
};

/**
 * A market the witness never judged is REFUSED, not assumed clean. That is the
 * same rule `feedYears` applies to an unplaceable symbol, and it exists because
 * silence read as "contained" is how a dirty market gets into a clean fold.
 */
export function monthMapOf(
  witness: Map<string, WitnessMonths>,
  source: string,
): MonthMap {
  const cache = new Map<string, MonthKey[]>();
  // `excludedAt` is called once per corpus ROW. A linear scan of up to ~40
  // months per call is the difference between a pass and a long one, so the
  // membership test gets its own set beside the ordered list.
  const setCache = new Map<string, Set<MonthKey>>();

  const monthsFor = (symbol: string): MonthKey[] => {
    const cached = cache.get(symbol);
    if (cached) return cached;
    const entry = witness.get(symbol);
    if (!entry) {
      refuse(
        `feedMonths: ${symbol} has no ${MAP_TIER} verdict in ${source} — an absent verdict is not a contained one`,
      );
    }
    // AND NEITHER IS AN UNJUDGEABLE ONE. The witness saying "I could not judge
    // this market" carries no escaping years and no hidden months, so it would
    // otherwise read as fully clean — the loudest possible statement of doubt
    // producing the most permissive possible answer. It refuses for the same
    // reason absence does.
    if (entry.verdict === "unjudgeable") {
      refuse(
        `feedMonths: ${symbol} is ${MAP_TIER} UNJUDGEABLE in ${source} — the witness could not judge it, which is not a finding that its months are clean`,
      );
    }
    const months = new Set<MonthKey>(entry.hiddenMonths);
    for (const year of entry.escapeYears) {
      for (let index = 1; index <= 12; index += 1) {
        months.add(year * 100 + index);
      }
    }
    const sorted = [...months].sort((a, b) => a - b);
    cache.set(symbol, sorted);
    return sorted;
  };

  return {
    excludedAt(symbol, timeMs) {
      let set = setCache.get(symbol);
      if (!set) {
        set = new Set(monthsFor(symbol));
        setCache.set(symbol, set);
      }
      return set.has(monthOf(timeMs));
    },
    excludedMonths: monthsFor,
    excludedIntervals(symbol, spanStartMs, spanEndMs) {
      const out: Array<{ endMs: number; startMs: number }> = [];
      for (const month of monthsFor(symbol)) {
        const startMs = Math.max(monthStartMs(month), spanStartMs);
        const endMs = Math.min(monthEndMs(month), spanEndMs);
        if (endMs <= startMs) continue;
        const last = out.at(-1);
        // Consecutive months merge into one run: January through May is one
        // hole, not five, so a fold allocator walks five fewer boundaries.
        if (last && last.endMs === startMs) last.endMs = endMs;
        else out.push({ endMs, startMs });
      }
      return out;
    },
    source,
    symbols: new Set(witness.keys()),
  };
}
