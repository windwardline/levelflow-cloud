import { createContext, useContext } from "react";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";

export type GuideAnchor =
  | "how-review-works"
  | "targets-and-stops"
  | "confidence-tiers"
  | "replay-record"
  | "cost-ratings"
  | "timeframes";

export interface WorkspaceNav {
  openGuide: (anchor: GuideAnchor) => void;
  // Reopen a stored setup on the Desk stage. The whole row, never a bare symbol
  // (owner ruling, 2026-08-02): a symbol alone reselects the market and leaves
  // the stage with no analysis state, so the chart reloads and the ladder, the
  // why rows and the receipt below it stay empty — which was the owner's third
  // finding about the Insights ledger. The stage restores the row through the
  // one adoption path scan rows use (§17m.1's single door).
  openAdvisor: (setup: TradeSetupRow) => void;
  openInsights: () => void;
}

export const WorkspaceNavContext = createContext<WorkspaceNav | null>(null);

export function useWorkspaceNav(): WorkspaceNav {
  const nav = useContext(WorkspaceNavContext);
  if (!nav) throw new Error("useWorkspaceNav requires WorkspaceNavContext");
  return nav;
}
