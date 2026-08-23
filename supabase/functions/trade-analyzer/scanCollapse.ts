// The per-scan correlation collapse, extracted so ONE implementation serves
// both runtimes (R1c / E4). It lived in index.ts, which is Deno-global and
// deliberately off tsconfig.tests.json's explicit file list — so an offline
// instrument could only have reimplemented it, and nothing would have pinned
// the copy equal to the original. Two implementations of one live rule with no
// equality pin is the class this project already ruled against when
// scripts/intradayChunks.ts was extracted; the E4 reader replays these exact
// functions instead of a transcription of them.
//
// Structural parameter types, on the scanRanking.ts precedent: the live caller
// passes a MarketScanCandidate and the reader passes a corpus row, and neither
// needs the other's shape.

export type CollapseCandidate = {
  confidenceScore?: number;
  correlationGroup?: string;
  executionScore?: number;
  rewardRisk?: number;
  symbol: string;
};

// The grouping key is the PRIMARY group alone — never the RM-5 symbol union
// that findStrongerActiveCorrelatedSetup screens against. The two mechanisms
// deliberately read different populations: primary membership is single by
// guarded invariant (batching needs unambiguous clusters), while the
// cross-scan screen unions across both structures. A replay that uses one
// grouping for both measures something that never ran.
//
// The `??` arm is unreachable on the live path — getCorrelationGroup already
// falls back to the normalized symbol — and is kept because it yields the
// identical string either way, and because the reader's rows are not
// guaranteed to carry the field at all.
export function collapseGroupKey(candidate: CollapseCandidate): string {
  return candidate.correlationGroup ?? candidate.symbol;
}

// Live's scan candidate carries `confluence.rewardRisk`, which analyzeSetup
// writes as `Number(pricePlan.rewardRisk.toFixed(2))` — so the comparator's
// second tier compares a TWO-DECIMAL quantization, while the sweep emits
// `plan.rewardRisk` at full precision. Any replay must quantize before the
// tier-2 test or it resolves as distinct exactly the pairs that tie live, and
// silently skips the tier-3 test those pairs actually fall through to.
//
// Only the comparator and the display are quantized: both gates test the
// unrounded value against minRewardRisk (index.ts, sweep.ts), so this must
// never be applied to an acceptance decision.
// `tests/scanCollapse.test.ts` pins the live write site in both directions.
export function comparatorRewardRisk(value: number): number {
  return Number(value.toFixed(2));
}

// Confidence, then payoff, then execution quality, then the symbol.
//
// Read the direction off the CALL, not off this function: the sole caller
// sorts with the arguments swapped, which makes the three numeric tiers
// descending — the winner is the highest — while the symbol tier's own
// reversal cancels the swap and leaves it ASCENDING. So a total tie is won by
// the lexicographically SMALLEST symbol. That asymmetry is the easiest thing
// here to read backwards; `tests/scanCollapse.test.ts` pins every tier and the
// tie winner by execution rather than by argument.
//
// localeCompare is retained exactly as the live path has always had it. Its
// two sibling comparators (scanRanking.ts, src/lib/scanBatching.ts) use code
// units instead, deliberately, because locale collation is not guaranteed
// equal across runtimes — and this function now runs in Node as well as Deno,
// which makes that divergence reachable rather than theoretical. Changing it
// would change live tie-breaking, which is out of R1c's scope; instead the
// test asserts that over the live roster the two orderings agree, so a symbol
// that ever breaks the equivalence fails CI rather than silently picking a
// different winner in one runtime.
export function compareScanCandidates(
  first: CollapseCandidate,
  second: CollapseCandidate,
) {
  const confidenceDifference = (first.confidenceScore ?? 0) -
    (second.confidenceScore ?? 0);
  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }

  const rewardDifference = (first.rewardRisk ?? 0) - (second.rewardRisk ?? 0);
  if (rewardDifference !== 0) {
    return rewardDifference;
  }

  const executionDifference = (first.executionScore ?? 0) -
    (second.executionScore ?? 0);
  if (executionDifference !== 0) {
    return executionDifference;
  }

  return second.symbol.localeCompare(first.symbol);
}

// Winner first, then every loser in the order the collapse blocked them.
// Returned rather than mutated so the live path can build its blocked-candidate
// rows and the reader can score the losers it suppressed, from one ordering.
export function rankCollapseGroup<T extends CollapseCandidate>(
  candidates: T[],
): T[] {
  return [...candidates].sort((first, second) =>
    compareScanCandidates(second, first)
  );
}

// Group by primary correlation group, preserving first-seen group order and
// within-group input order — the live scan's candidate order is index-addressed
// by mapWithConcurrency, so the collapse is deterministic and the reader must
// not reintroduce an ordering of its own.
export function groupCollapseCandidates<T extends CollapseCandidate>(
  candidates: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const candidate of candidates) {
    const group = collapseGroupKey(candidate);
    grouped.set(group, [...(grouped.get(group) ?? []), candidate]);
  }
  return grouped;
}
