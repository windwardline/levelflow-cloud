import type { TradeSetupRow } from "./tradeAnalyzer";

export type SetupOutcome = "entry_not_filled" | "stopped_out" | "still_tracking" | "target_reached" | "unclear_path";

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
  stopped_out: {
    description: "The limit entry filled and price later reached the stop before the target.",
    filterLabel: "Hit stop",
    label: "Hit stop",
    shortLabel: "Stop",
  },
  unclear_path: {
    description: "The entry filled, but the available candle shows stop and target traded in the same bar, so sequence cannot be confirmed.",
    filterLabel: "Unclear result",
    label: "Unclear result",
    shortLabel: "Unclear",
  },
  entry_not_filled: {
    description: "The limit entry did not fill before the setup window ended or the idea was invalidated.",
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
  return outcome === "target_reached" || outcome === "stopped_out";
}
