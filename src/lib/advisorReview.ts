import {
  chartTimeframeLabel,
  type ChartTimeframe,
} from "./marketData";
import type { SecurityType } from "./symbolMap";

export const ADVISOR_SIGNAL_INTERVALS = ["4H", "1H", "15M"] as const;
export const ADVISOR_EXECUTION_INTERVALS = ["5M", "1M"] as const;

export const REVIEW_WINDOW_HOURS_BY_ASSET_TYPE: Record<SecurityType, number> = {
  Crypto: 8,
  Energies: 5,
  Forex: 6,
  Futures: 4,
  Indices: 4,
  Metals: 6,
};

export function advisorChartViewLabel(timeframe: ChartTimeframe) {
  return chartTimeframeLabel(timeframe);
}

export function advisorSignalIntervalLabel() {
  return ADVISOR_SIGNAL_INTERVALS.join(", ");
}

export function advisorExecutionIntervalLabel() {
  return ADVISOR_EXECUTION_INTERVALS.join(", ");
}

export function reviewWindowLabel(assetType: SecurityType) {
  const hours = REVIEW_WINDOW_HOURS_BY_ASSET_TYPE[assetType];
  return `Up to ${hours} ${hours === 1 ? "hour" : "hours"}`;
}
