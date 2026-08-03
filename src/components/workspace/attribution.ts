import { CONFIDENCE_TIERS, getConfidenceTier } from "../../lib/confidenceTiers";
import { classifyWinLoss } from "../../lib/outcomes";
import { getSecurityOption, SECURITY_GROUPS } from "../../lib/symbolMap";
import type { LifetimeSetupRow } from "../../lib/tradeAnalyzer";
import {
  buildConfidenceBands,
  extractRealizedR,
  getSetupOutcome,
} from "./historyUtils";

// Attribution (spec §18, hedge-mind pillar 1): the user's OWN resolved history
// sliced four ways, computed over the LIFETIME record — every resolved setup on
// the account, not the page the ledger happens to have loaded (amendment 2,
// owner 2026-08-02: "Can we let it involve the engine? If so, do it. I want
// accuracy."). No new columns: the input is fetchLifetimeSetups' walk of the
// caller's own rows, and realizedR is read where it already lives, in
// trade_outcomes.feedback.
//
// A sibling of historyUtils rather than more of it: the ledger module already
// spans grouping, sorting, price formatting, filtering, the record band and the
// result vocabulary, and this is one aggregation with its own law. It reuses that
// module's shared helpers (buildConfidenceBands, getSetupOutcome,
// extractRealizedR) instead of re-deriving any of them.

export type AttributionRow = {
  key: string;
  label: string;
  resolved: number;
} & (
  // One gate, both numbers (§18, amendment 3 — owner 2026-08-02: "Yes. I want
  // fidelity across the board"). Below ATTRIBUTION_LEARNING_MIN_RESOLVED
  // resolved rows the slice publishes neither figure and the surface reads both
  // cells as "Learning"; at or above it the rate is always a number, which is
  // why the two states are a union rather than two independently nullable
  // fields. netR stays nullable above the gate: null there is the em dash, and
  // it means something else entirely — enough history, one row without an R.
  | { learning: true; moneyPositivePercent: null; netR: null }
  | { learning: false; moneyPositivePercent: number; netR: number | null }
);

export type AttributionGroup = {
  key: string;
  label: string;
  rows: AttributionRow[];
};

// Spec §18, stated there as law: below 3 resolved, BOTH the percentage and net R
// read "Learning". Exported so the guard reads the same number the code does.
export const ATTRIBUTION_LEARNING_MIN_RESOLVED = 3;

// Spec §18, stated there as law: three blocks by the setup's creation hour in
// UTC. Each boundary belongs to the block that STARTS there — half-open
// [start, end) — the one reading that partitions all 24 hours with no gap and
// no overlap, so 07:00 is Europe, 13:00 is US and 22:00 is Asia. Asia wraps
// midnight, which is why the resolver handles start > end rather than assuming
// an ascending pair.
//
// These are the spec's own three names. The Guide's deck names the concept
// ("the trading session") but no individual block, so there was no deck
// vocabulary to defer to; volatilityWindows.ts's four exchange-local session
// labels answer a different question (which exchanges are open right now, in
// their own local hours) and are not these three UTC blocks.
const SESSION_BLOCKS = [
  { endHourUtc: 7, key: "asia", label: "Asia", startHourUtc: 22 },
  { endHourUtc: 13, key: "europe", label: "Europe", startHourUtc: 7 },
  { endHourUtc: 22, key: "us", label: "US", startHourUtc: 13 },
];

const SIDE_SLICES: Array<{ key: LifetimeSetupRow["side"]; label: string }> = [
  // The ledger's own chip words for the same fact.
  { key: "buy", label: "Buy" },
  { key: "sell", label: "Sell" },
];

export type SliceTally = {
  realizedRSum: number;
  resolved: number;
  resolvedWithRealizedR: number;
  wins: number;
};

export function buildAttribution(
  setups: LifetimeSetupRow[],
): AttributionGroup[] {
  const byClass = new Map<string, SliceTally>();
  const bySide = new Map<string, SliceTally>();
  const bySession = new Map<string, SliceTally>();
  const byConfidenceTier = new Map<string, SliceTally>();

  for (const setup of setups) {
    // classifyWinLoss (lib/outcomes.ts) is the single source of truth for
    // money-positive vs. money-negative — tests/outcomes.test.ts's drift guard
    // counts every call site so an inline copy cannot creep back in on a
    // future outcome-taxonomy change. §18 counts resolved rows only, and
    // "neither" is exactly the unresolved set (pending, open, unfilled,
    // unclear, manually closed), so this one check is also the resolved gate.
    const winLoss = classifyWinLoss(getSetupOutcome(setup));
    if (winLoss === "neither") {
      continue;
    }

    // Deliberately narrower than buildRecordBand's net R, which sums every
    // row's figure and publishes a total if ANY row had one. §18 asks for the
    // resolved slice's own settled result, all-or-nothing, so an open row's
    // running R never reaches these sums.
    const realizedR = extractRealizedR(setup);

    recordResolved(byClass, assetClassOf(setup), winLoss, realizedR);
    recordResolved(bySide, setup.side, winLoss, realizedR);
    recordResolved(bySession, sessionBlockKeyOf(setup), winLoss, realizedR);
    recordResolved(
      byConfidenceTier,
      getConfidenceTier(setup.confidence_score)?.id ?? null,
      winLoss,
      realizedR,
    );
  }

  // buildConfidenceBands maps CONFIDENCE_TIERS in order, so band[i] is
  // tier[i] — pinned by tests/attribution.test.ts, which compares the whole
  // label/resolved sequence against the shared builder's own output. Resolved
  // counts and the rate come from that builder untouched; only net R, which it
  // does not compute, comes from the pass above.
  const bands = buildConfidenceBands(setups);

  return [
    {
      key: "class",
      label: "Asset class",
      // The six, in the app's canonical category order (SECURITY_GROUPS is
      // already sorted by compareAssetCategories). Unfiltered on purpose: a
      // class hidden from the scan menu can still own resolved history.
      rows: SECURITY_GROUPS.map((group) =>
        tallyRow(group.label, group.label, byClass.get(group.label))
      ),
    },
    {
      key: "side",
      label: "Side",
      rows: SIDE_SLICES.map((slice) =>
        tallyRow(slice.key, slice.label, bySide.get(slice.key))
      ),
    },
    {
      key: "confidence",
      label: "Confidence",
      // One resolved count for both cells (§18, amendment 3's last line): the
      // band builder's, which is also the count this row publishes. Gating the
      // rate on the builder's number and net R on the local tally's would let
      // the two cells disagree about the same slice.
      rows: CONFIDENCE_TIERS.map((tier, index) => {
        const band = bands[index];
        return toRow(
          tier.id,
          band.label,
          band.resolved,
          band.winRate,
          byConfidenceTier.get(tier.id),
        );
      }),
    },
    {
      key: "session",
      label: "Session",
      rows: SESSION_BLOCKS.map((block) =>
        tallyRow(block.key, block.label, bySession.get(block.key))
      ),
    },
  ];
}

function recordResolved(
  bucket: Map<string, SliceTally>,
  key: string | null,
  winLoss: "loss" | "win",
  realizedR: number | null,
) {
  if (key === null) {
    // The row belongs to no slice of this group — an unreadable creation
    // timestamp, or a confidence score below the tiers' own floor. Guessing a
    // bucket would invent a fact, so the row simply does not count here; every
    // other group still counts it.
    return;
  }
  const tally = bucket.get(key) ??
    { realizedRSum: 0, resolved: 0, resolvedWithRealizedR: 0, wins: 0 };
  tally.resolved += 1;
  if (winLoss === "win") {
    tally.wins += 1;
  }
  if (realizedR !== null) {
    tally.realizedRSum += realizedR;
    tally.resolvedWithRealizedR += 1;
  }
  bucket.set(key, tally);
}

function tallyRow(
  key: string,
  label: string,
  tally: SliceTally | undefined,
): AttributionRow {
  const resolved = tally?.resolved ?? 0;
  return toRow(
    key,
    label,
    resolved,
    resolved > 0 ? Math.round(((tally?.wins ?? 0) / resolved) * 100) : null,
    tally,
  );
}

/**
 * The one place §18's gate is applied, for all four slice groups.
 *
 * `winPercent` is the slice's ungated rate — computed from the tally for three
 * groups, taken from buildConfidenceBands for the fourth. It is null only when
 * the slice has no resolved rows at all, which is already below the gate, so the
 * check below reads as one rule rather than two: no publishable rate, nothing
 * published.
 */
function toRow(
  key: string,
  label: string,
  resolved: number,
  winPercent: number | null,
  tally: SliceTally | undefined,
): AttributionRow {
  if (resolved < ATTRIBUTION_LEARNING_MIN_RESOLVED || winPercent === null) {
    return {
      key,
      label,
      learning: true,
      moneyPositivePercent: null,
      netR: null,
      resolved,
    };
  }

  return {
    key,
    label,
    learning: false,
    moneyPositivePercent: winPercent,
    netR: netRForSlice(tally, resolved),
    resolved,
  };
}

/**
 * Spec §18: net R "where every resolved row in the slice recorded a realizedR,
 * the em dash otherwise" — the all-or-nothing rule, which now sits behind the
 * gate rather than beside it. A partial sum would read as the slice's result while
 * silently omitting rows, so a single missing figure withholds the whole total.
 *
 * `resolved` is the count the row publishes, and the sum is withheld unless the
 * tally accounts for exactly those rows: the confidence slice counts its rows twice
 * over (buildConfidenceBands for the count, the local pass for the sum), and the
 * day those two readings of one taxonomy diverge, this withholds a total rather
 * than publishing one computed over a different set of rows than the count beside
 * it.
 *
 * Exported for that last clause alone. Both readings agree today by construction —
 * identical tier bounds, identical resolved definition — so buildAttribution cannot
 * reach the mismatch from any input, and a guard no test can exercise is a guard
 * nobody can trust. tests/attribution.test.ts drives it directly.
 */
export function netRForSlice(
  tally: SliceTally | undefined,
  resolved: number,
): number | null {
  if (!tally || tally.resolved !== resolved) {
    return null;
  }
  return tally.resolvedWithRealizedR === tally.resolved
    ? tally.realizedRSum
    : null;
}

// getSecurityOption resolves an unknown ticker to a Forex-shaped fallback,
// which is the app's standing behaviour everywhere a symbol's class is read
// (groupHistorySetups, matchesMarketFilter, formatSetupConfidence) — so this
// reads the class exactly the way the ledger's own grouping reads it.
function assetClassOf(setup: LifetimeSetupRow): string {
  return getSecurityOption(setup.symbol).assetType;
}

function sessionBlockKeyOf(setup: LifetimeSetupRow): string | null {
  const hourUtc = new Date(setup.created_at).getUTCHours();
  if (!Number.isFinite(hourUtc)) {
    return null;
  }
  return SESSION_BLOCKS.find((block) =>
    block.startHourUtc < block.endHourUtc
      ? hourUtc >= block.startHourUtc && hourUtc < block.endHourUtc
      : hourUtc >= block.startHourUtc || hourUtc < block.endHourUtc
  )?.key ?? null;
}
