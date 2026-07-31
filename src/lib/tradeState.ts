import { formatNumber } from "../components/workspace/advisorFormat";
import type { TradeSetupRow } from "./tradeAnalyzer";

export type TradeStatus = "pending" | "open";

export type TradeState = {
  eventAge?: string;
  instruction: string;
  progressR: number | null;
  status: TradeStatus;
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
 * Two DB-naming surprises this function has to reconcile (traced through
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
 *
 * Returns null for anything closed/resolved: Insights holds those.
 */
export function deriveTradeState(
  setup: TradeSetupRow,
  now: Date,
): TradeState | null {
  if (setup.status === "generated") {
    return {
      instruction: `Order pending at ${formatEntry(setup)} — nothing to do yet`,
      progressR: null,
      status: "pending",
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
    const age = formatEventAge(
      outcomeRow?.filled_at ?? outcomeRow?.reviewed_at,
      now,
    );
    return {
      eventAge: age,
      instruction:
        `Target 1 hit ${age} — bank half, move stop to ${formatEntry(setup)}`,
      progressR,
      status: "open",
    };
  }

  return {
    instruction: CANONICAL_LADDER_INSTRUCTION,
    progressR,
    status: "open",
  };
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

// Coarse, spec-literal age phrasing (§8: "hit 14 min ago") — deliberately
// not advisorFormat.ts's formatRelativeTime, whose "14 minutes ago" style
// serves other panels but doesn't match the copy authority's own wording
// for this rail.
function formatEventAge(
  value: string | null | undefined,
  now: Date,
): string {
  const eventTime = value ? new Date(value).getTime() : Number.NaN;
  if (Number.isNaN(eventTime)) {
    return "recently";
  }

  const diffMinutes = Math.max(
    0,
    Math.round((now.getTime() - eventTime) / 60_000),
  );
  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d ago`;
}
