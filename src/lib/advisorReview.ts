import {
  chartTimeframeLabel,
  type ChartTimeframe,
} from "./marketData";
import type { SecurityType } from "./symbolMap";

export const ADVISOR_SIGNAL_INTERVALS = ["4H", "1H", "15M"] as const;
export const ADVISOR_EXECUTION_INTERVALS = ["5M", "1M"] as const;

// Working surfaces never show a raw interval code (spec §7); every code is
// translated to a plain word before it reaches a string the user can read.
const INTERVAL_LABELS: Record<string, string> = {
  "1D": "daily",
  "1H": "1-hour",
  "1M": "1-minute",
  "4H": "4-hour",
  "5M": "5-minute",
  "15M": "15-minute",
};

function intervalLabel(code: string) {
  return INTERVAL_LABELS[code] ?? code;
}

export const REVIEW_WINDOW_HOURS_BY_ASSET_TYPE: Record<SecurityType, number> = {
  Crypto: 12,
  Energies: 6,
  Forex: 8,
  Futures: 6,
  Indices: 5,
  Metals: 8,
};

export function advisorChartViewLabel(timeframe: ChartTimeframe) {
  return chartTimeframeLabel(timeframe);
}

export function advisorSignalIntervalLabel() {
  return ADVISOR_SIGNAL_INTERVALS.map(intervalLabel).join(", ");
}

export function advisorExecutionIntervalLabel() {
  return ADVISOR_EXECUTION_INTERVALS.map(intervalLabel).join(", ");
}

export function reviewWindowLabel(assetType: SecurityType) {
  const hours = REVIEW_WINDOW_HOURS_BY_ASSET_TYPE[assetType];
  return `Up to ${hours} ${hours === 1 ? "hour" : "hours"}`;
}
