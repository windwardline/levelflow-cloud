import type { TradeSetupRow } from "./tradeAnalyzer";

export type SetupOutcome =
  | "entry_not_filled"
  | "expired_in_loss"
  | "expired_in_profit"
  | "partial_target"
  | "stopped_out"
  | "still_tracking"
  | "target_reached"
  | "unclear_path";

export const OUTCOME_COPY: Record<
  SetupOutcome,
  {
    description: string;
    filterLabel: string;
    label: string;
    shortLabel: string;
  }
> = {
  // §17b (owner ruling, 2026-07-31): one lifecycle vocabulary —
  // Pending -> Open (· ±R) -> Unfilled / Banked half / Target 2 / Stopped /
  // Expired in profit / Expired at loss. The tracking phrase this bucket used
  // to carry was a seventh word for two states that already had names, and
  // its short form was a label of the same shape; both are now banned
  // outright (tests/languageGuard.test.ts — which scans quoted text wherever
  // it appears, so neither may be quoted even here). This bucket is not one
  // state — it spans both unresolved ones — so every one of its labels names
  // exactly those two, which is also what makes it correct as the filter
  // option that selects them together. No surface renders the label or
  // shortLabel today: historyUtils' formatInsightsResult routes an unresolved
  // row through the state machine's own word (Pending / Open · ±R) instead,
  // and the only remaining reader is the group-by-status heading, where a
  // bucket spanning both states is exactly what the heading describes.
  still_tracking: {
    description: "The setup is still pending or open — it does not have a final result yet.",
    filterLabel: "Pending & open",
    label: "Pending & open",
    shortLabel: "Pending & open",
  },
  target_reached: {
    description: "The limit entry filled and price later reached the target before the stop.",
    filterLabel: "Reached target",
    label: "Reached target",
    shortLabel: "Target",
  },
  partial_target: {
    description: "The first target was reached; the second target was not reached before breakeven or the review window.",
    filterLabel: "First target reached",
    label: "First target reached",
    shortLabel: "Target 1",
  },
  expired_in_profit: {
    description: "The entry filled and the review window ended with price in profit, without reaching target or stop.",
    filterLabel: "Expired in profit",
    label: "Expired in profit",
    shortLabel: "Expired +",
  },
  expired_in_loss: {
    description: "The entry filled and the review window ended with price at a loss, without reaching target or stop.",
    filterLabel: "Expired at loss",
    label: "Expired at loss",
    shortLabel: "Expired −",
  },
  stopped_out: {
    description: "The limit entry filled and price later reached the stop before the target.",
    filterLabel: "Hit stop",
    label: "Hit stop",
    shortLabel: "Stop",
  },
  unclear_path: {
    description: "The entry filled, but the available chart cannot confirm whether stop or target came first.",
    filterLabel: "Needs review",
    label: "Needs review",
    shortLabel: "Review",
  },
  entry_not_filled: {
    description: "The limit entry did not fill before the review window ended or the setup was no longer valid.",
    filterLabel: "Entry not filled",
    label: "Entry not filled",
    shortLabel: "No fill",
  },
};

export function normalizeSetupOutcome(setup: Pick<TradeSetupRow, "status" | "trade_outcomes">): SetupOutcome {
  const outcome = setup.trade_outcomes?.[0]?.outcome;

  if (outcome === "take_profit") {
    return "target_reached";
  }
  if (outcome === "tp1_partial") {
    return "partial_target";
  }
  if (outcome === "expired_in_profit") {
    return "expired_in_profit";
  }
  if (outcome === "expired_at_loss") {
    return "expired_in_loss";
  }
  if (outcome === "stop_loss") {
    return "stopped_out";
  }
  if (outcome === "ambiguous") {
    return "unclear_path";
  }
  if (outcome === "unfilled" || outcome === "expired" || setup.status === "expired" || setup.status === "invalidated") {
    return "entry_not_filled";
  }

  return "still_tracking";
}

export type WinLossClass = "loss" | "neither" | "win";

// Single source of truth for the ladder's money-positive/negative split —
// previously duplicated between useTradeSetups.ts's buildStats and
// historyUtils.ts's buildRecordBand, which could silently drift apart on a
// future outcome-taxonomy change. A win is any money-positive resolution
// (full target, banked TP1, or a profitable expiry); a loss is any
// money-negative one. Every other outcome (unresolved, entry not filled,
// needs review) affects neither side of a win/loss ratio.
export function classifyWinLoss(outcome: SetupOutcome): WinLossClass {
  if (
    outcome === "target_reached" || outcome === "partial_target" ||
    outcome === "expired_in_profit"
  ) {
    return "win";
  }
  if (outcome === "stopped_out" || outcome === "expired_in_loss") {
    return "loss";
  }
  return "neither";
}
