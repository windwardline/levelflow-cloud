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
  still_tracking: {
    description: "The setup is still inside its review window or does not have a final result yet.",
    filterLabel: "Still tracking",
    label: "Still tracking",
    shortLabel: "Tracking",
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

export function isResolvedOutcome(outcome: SetupOutcome) {
  return outcome === "target_reached" || outcome === "partial_target" ||
    outcome === "stopped_out" || outcome === "expired_in_profit" ||
    outcome === "expired_in_loss";
}
