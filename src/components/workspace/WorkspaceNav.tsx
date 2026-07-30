import { createContext, useContext } from "react";

export type GuideAnchor =
  | "how-review-works"
  | "targets-and-stops"
  | "confidence-tiers"
  | "replay-record"
  | "cost-ratings"
  | "timeframes";

export interface WorkspaceNav {
  openGuide: (anchor: GuideAnchor) => void;
  openAdvisor: (symbol: string) => void;
  openInsights: (symbol?: string) => void;
}

export const WorkspaceNavContext = createContext<WorkspaceNav | null>(null);

export function useWorkspaceNav(): WorkspaceNav {
  const nav = useContext(WorkspaceNavContext);
  if (!nav) throw new Error("useWorkspaceNav requires WorkspaceNavContext");
  return nav;
}
