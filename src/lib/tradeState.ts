import { formatNumber } from "../components/workspace/advisorFormat";
import type { TradeSetupRow } from "./tradeAnalyzer";

export type TradeStatus = "pending" | "open";

export type TradeState = {
  instruction: string;
  progressR: number | null;
  status: TradeStatus;
  // Structural flag CurrentTradesRail's buildRemainingLevels uses to know
  // whether Target 1 has already fired (and should drop off the remaining-
  // levels list) — not a display value itself. Deliberately its own field
  // rather than piggybacked on a display string (I6 fixed exactly that
  // fragile coupling: this used to ride on `eventAge !== undefined`, which
  // broke the moment eventAge's age display was removed).
  tp1Banked: boolean;
};

// Spec §7, verbatim — the same pinned sentence AdvisorRecommendationPanel.tsx
// renders on the ladder card (and languageGuard.test.ts pins there). The
// "open, pre-Target-1" trade state reuses it exactly rather than a second,
// driftable paraphrase of the same rule.
const CANONICAL_LADDER_INSTRUCTION =
  "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — profit locked either way.";

// setup_status enum values (supabase/init.sql) once a setup is no longer
// live: the position closed one way or another (filled + resolved, or
// never filled and the window ran out) — Insights is their home, not this
// rail (spec §8: "Closed trades leave the rail; Insights holds them").
const CLOSED_SETUP_STATUSES = new Set([
  "filled",
  "invalidated",
  "cancelled",
  "expired",
]);

// trade_outcomes.outcome enum values (supabase/init.sql) other than
// "pending" — every one of them means the engine has already resolved this
// setup to a final result. Checked defensively even when setup.status
// hasn't (or couldn't) catch up in lockstep, since the rail must never show
// a done trade as actionable.
const RESOLVED_OUTCOMES = new Set([
  "unfilled",
  "take_profit",
  "stop_loss",
  "breakeven",
  "manual_close",
  "expired",
  "ambiguous",
  "tp1_partial",
  "expired_in_profit",
  "expired_at_loss",
]);

/**
 * Derives the Current trades rail's live state for one setup (spec §8).
 *
 * DB-naming surprises this function has to reconcile (traced through
 * supabase/functions/trade-analyzer/replay.ts and outcome-sync/index.ts):
 * - setup.status "placed" does not mean "order placed, awaiting fill" — the
 *   engine only sets it once price has actually crossed the limit entry, so
 *   it means the position is filled and live. The still-unfilled case is
 *   setup.status "generated", which is what the rail calls "Pending".
 * - A live position that has already banked Target 1 but is still running
 *   toward Target 2 is stored as outcome "pending" with
 *   feedback.tp1Hit === true, NOT as the literal outcome "tp1_partial".
 *   That literal string is only ever written once the runner itself has
 *   fully resolved (stopped at breakeven or expired) — a closed trade, not
 *   an open one, hence its place in RESOLVED_OUTCOMES above.
 * - There is no genuine "Target 1 hit at" timestamp anywhere in the schema:
 *   outcomeRow.filled_at is the ENTRY fill, not Target 1's. The instruction
 *   below used to (wrongly) report an age computed from it, e.g. "Target 1
 *   hit 14 min ago" — removed (I6) rather than shown from the wrong clock.
 * - Every generated setup earns Pending regardless of origin: since §17m
 *   made Scan the only door, a scan's qualifying setups ARE the user's
 *   orders-in-waiting. (The I1-era scan-origin exclusion predated that
 *   ruling — with it in place the rail could never show a pending trade
 *   at all, because every setup is scan-origin now.)
 *
 * Returns null for anything closed/resolved: Insights holds those.
 */
export function deriveTradeState(
  setup: TradeSetupRow,
  // Unused since I6 dropped Target 1's age display (no genuine TP1
  // timestamp exists to compute one from). Kept, not removed, so
  // buildTradeCards/currentTradeBadgeCount don't need a signature change
  // for what could be a real per-setup clock again the moment the engine
  // writes an actual TP1 timestamp — same convention as marketHours.ts's
  // `_symbol` parameter.
  _now: Date,
): TradeState | null {
  if (setup.status === "generated") {
    return {
      instruction: `Order pending at ${formatEntry(setup)} — nothing to do yet`,
      progressR: null,
      status: "pending",
      tp1Banked: false,
    };
  }

  if (CLOSED_SETUP_STATUSES.has(setup.status)) {
    return null;
  }

  // By elimination against the six-value setup_status enum, only "placed"
  // (i.e. filled and live) remains here.
  const outcomeRow = setup.trade_outcomes?.[0];
  if (outcomeRow && RESOLVED_OUTCOMES.has(outcomeRow.outcome)) {
    return null;
  }

  const feedback = asRecord(outcomeRow?.feedback);
  const progressR = asFiniteNumber(feedback.realizedR);

  if (feedback.tp1Hit === true) {
    return {
      instruction:
        `Target 1 hit — bank half, move stop to ${formatEntry(setup)}`,
      progressR,
      status: "open",
      tp1Banked: true,
    };
  }

  return {
    instruction: CANONICAL_LADDER_INSTRUCTION,
    progressR,
    status: "open",
    tp1Banked: false,
  };
}

/**
 * Whether this setup's limit entry has actually filled — the one piece of
 * evidence that separates §17b's "Pending" from its "Open".
 *
 * Lives here, beside deriveTradeState, because the status semantics it reads
 * are the surprising ones documented above: "placed" means filled and live,
 * "filled" means filled and resolved, and "generated" means the order is
 * still waiting. Insights' Result column (historyUtils' formatInsightsResult)
 * reads this for the rows deriveTradeState hands back as closed-but-
 * unresolved, so the two surfaces can never disagree about which of the two
 * unresolved words a row deserves.
 */
export function entryHasFilled(setup: TradeSetupRow): boolean {
  return setup.status === "placed" || setup.status === "filled" ||
    Boolean(setup.trade_outcomes?.[0]?.filled_at);
}

function formatEntry(setup: TradeSetupRow): string {
  const entry = Number(setup.limit_entry);
  return Number.isFinite(entry) ? formatNumber(entry) : "—";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
