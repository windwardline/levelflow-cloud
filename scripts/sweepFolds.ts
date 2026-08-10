// 3c/3d/3e (2026-08-10): the corpus partition, as calendar facts.
//
// The five-line split this replaces cut each symbol at a FRACTION of its
// own bar count — folds landed in different calendar years per symbol and
// the gate summed "test R" across disjoint history; one fixed cut made
// selection and confirmation the same fold; and boundary setups either
// truncated unresolved or quietly consumed the next fold's price action.
//
// Folds are common-origin CALENDAR windows shared by every symbol: fit
// (50% of the span), select (25%), confirm (25%) — selection and
// confirmation are different data, which is the whole point of a third
// fold. Each fold's decisions END an embargo before the fold closes, so
// every setup a fold decides RESOLVES inside that fold; the embargo is
// sized by the caller at warm-up plus the longest review window. The
// market holdout (3e) is a deterministic hash of the symbol itself — a
// property of the corpus that travels in the emit and manifest, not an
// invocation flag someone forgets.

import { createHash } from "node:crypto";

export type FoldName = "confirm" | "fit" | "select";

export type CalendarFold = {
  decisionEndMs: number;
  endMs: number;
  name: FoldName;
  startMs: number;
};

const FOLD_SHARES: Array<{ name: FoldName; share: number }> = [
  { name: "fit", share: 0.5 },
  { name: "select", share: 0.25 },
  { name: "confirm", share: 0.25 },
];

export function calendarFolds(input: {
  corpusEndMs: number;
  corpusStartMs: number;
  embargoMs: number;
}): CalendarFold[] {
  const span = input.corpusEndMs - input.corpusStartMs;
  const smallestFoldMs = span * Math.min(
    ...FOLD_SHARES.map((fold) => fold.share),
  );
  if (input.embargoMs >= smallestFoldMs) {
    throw new Error(
      `calendarFolds: the ${input.embargoMs}ms embargo consumes the smallest ` +
        `${smallestFoldMs}ms fold — the span cannot support this partition`,
    );
  }
  const folds: CalendarFold[] = [];
  let cursor = input.corpusStartMs;
  for (const { name, share } of FOLD_SHARES) {
    const endMs = name === "confirm"
      ? input.corpusEndMs
      : cursor + Math.round(span * share);
    folds.push({
      decisionEndMs: endMs - input.embargoMs,
      endMs,
      name,
      startMs: cursor,
    });
    cursor = endMs;
  }
  return folds;
}

/**
 * Deterministic ~20% market holdout: the first byte of the symbol's
 * SHA-256 modulo five. No seed, no flag, no drift — the same symbol is
 * held out in every corpus ever built, so nothing tuned on the other
 * eighty percent has ever seen it.
 */
export function isHoldoutSymbol(symbol: string): boolean {
  const digest = createHash("sha256").update(symbol).digest();
  return digest[0] % 5 === 0;
}

export type FoldSplit = {
  bars: Array<{ time: number }>;
  decisionEndMs: number;
  name: FoldName;
  warmupBars: number;
};

/**
 * Slice one symbol's primary bars into per-fold simulation inputs. Each
 * fold's bars run from WARMUP_BARS before the fold boundary (known history
 * at decision time — never leakage) to the fold close; decisions begin
 * after the warm-up AND never before `warmupBars` bars of whatever data
 * the slice actually has — a symbol whose history starts mid-fold warms
 * up inside the fold instead of deciding on a one-bar market (the
 * committee reads bars.at(-2); warmup 0 crashed the first baseline
 * relaunch on exactly this). Folds too thin to hold a single decision
 * past their warm-up are dropped.
 */
export function foldSplits<T extends { time: number }>(
  primaryBars: T[],
  folds: CalendarFold[],
  warmupBars: number,
): Array<{ bars: T[]; decisionEndMs: number; name: FoldName; warmupBars: number }> {
  const firstIndexAtOrAfter = (targetMs: number) => {
    let low = 0;
    let high = primaryBars.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (primaryBars[mid].time < targetMs) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return folds.map((fold) => {
    const startIndex = firstIndexAtOrAfter(fold.startMs);
    const endIndex = firstIndexAtOrAfter(fold.endMs);
    const sliceStart = Math.max(0, startIndex - warmupBars);
    return {
      bars: primaryBars.slice(sliceStart, endIndex),
      decisionEndMs: fold.decisionEndMs,
      name: fold.name,
      warmupBars: Math.max(startIndex - sliceStart, warmupBars),
    };
  }).filter((split) => split.bars.length > split.warmupBars + 1);
}
