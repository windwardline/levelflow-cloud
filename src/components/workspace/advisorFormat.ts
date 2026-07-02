import {
  CHART_TIMEFRAME_OPTIONS,
  type ChartTimeframe,
  chartTimeframeLabel,
} from "../../lib/marketData";

export const TIMEFRAMES = [...CHART_TIMEFRAME_OPTIONS];

export function formatPrice(symbol: string, value: number) {
  const maximumFractionDigits =
    symbol.includes("USD") && !symbol.startsWith("US") ? 5 : 2;
  return value.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  });
}

export function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
  });
}

export function formatTimeframe(timeframe: ChartTimeframe) {
  return chartTimeframeLabel(timeframe).toLowerCase();
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Awaiting refresh";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
