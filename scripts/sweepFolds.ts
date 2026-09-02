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

export type ClassFoldSpec = Record<string, { endMs: number; startMs: number }>;

/**
 * Folds serve CLASS aggregation — the gate's verdicts, the thresholds, the
 * reports all cut per class — so each class folds on its own union span.
 * One 17-year global calendar starved every 2023-era market (the futures,
 * agriculture and livestock complexes) of fit and select entirely: their
 * whole history sat inside the confirm fold and the grid measured zeros.
 * Per-class spans keep the common origin exactly where aggregation needs
 * it and give every class its maximal honest walk-forward. 3c's ban on
 * per-symbol fractions stands untouched.
 */
export function foldsByClass(
  spec: ClassFoldSpec,
  embargoMs: number,
): Record<string, CalendarFold[]> {
  // A fold spec is a research artifact and may carry the INVALID banner the
  // shared writer preserves. Read naively, that banner is a ninth "class"
  // with no span — so it is refused by name before anything folds on it.
  if ("INVALID" in spec) {
    throw new Error(
      `foldSpecInvalid: the fold spec carries an INVALID banner — ${
        String((spec as Record<string, unknown>).INVALID)
      }. Re-derive it from a validated cache before folding on it`,
    );
  }
  const result: Record<string, CalendarFold[]> = {};
  for (const [className, span] of Object.entries(spec)) {
    result[className] = calendarFolds({
      corpusEndMs: span.endMs,
      corpusStartMs: span.startMs,
      embargoMs,
    });
  }
  return result;
}

/**
 * Read-time stratified holdout (round-8 batch 1, CV-4/CV-5): the sha256
 * ranking runs WITHIN each class, taking ~20% with a floor of one for
 * classes of three or more markets; a one-or-two-market class holds
 * nothing out — by stated policy it keeps its markets for tuning and has
 * no unseen-market confirmation read. Deterministic in the symbol set,
 * independent of order and of which corpus stamped what: the gate
 * recomputes this at read time, so holdout policy changes never require
 * a resweep.
 */
export function stratifiedHoldout(
  symbols: string[],
  classOf: (symbol: string) => string,
): Set<string> {
  const byClass = new Map<string, string[]>();
  for (const symbol of new Set(symbols)) {
    const className = classOf(symbol);
    if (!byClass.has(className)) byClass.set(className, []);
    byClass.get(className)!.push(symbol);
  }
  const held = new Set<string>();
  for (const classSymbols of byClass.values()) {
    if (classSymbols.length < 3) continue;
    const ranked = classSymbols
      .map((symbol) => ({
        rank: createHash("sha256").update(symbol).digest("hex"),
        symbol,
      }))
      .sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const take = Math.max(1, Math.round(classSymbols.length * 0.2));
    for (const entry of ranked.slice(0, take)) held.add(entry.symbol);
  }
  return held;
}
