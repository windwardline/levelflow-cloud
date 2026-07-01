import type { ChartTimeframe } from "../../lib/marketData";

export const TIMEFRAMES: Array<{ label: string; value: ChartTimeframe }> = [
  { label: "15 minutes", value: "15min" },
  { label: "1 hour", value: "1hour" },
  { label: "4 hours", value: "4hour" },
  { label: "Daily", value: "1day" },
];

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
  return TIMEFRAMES.find((option) => option.value === timeframe)?.label
    .toLowerCase() ?? timeframe;
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
