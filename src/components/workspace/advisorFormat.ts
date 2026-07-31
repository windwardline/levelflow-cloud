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

// Clipboard payload for the per-value ladder copy (spec §7) — deliberately
// NOT formatNumber's output. `toLocaleString(undefined, ...)` defers to
// the runtime's locale: under a de-DE browser a price like 117240.5 both
// gains a grouping separator AND swaps its decimal to a comma
// ("117.240,5"), which corrupts on paste into a broker's price field
// either way. Pinning "en-US" with grouping disabled makes the payload a
// deterministic, round-trippable plain number ("117240.5") regardless of
// the viewer's locale, while formatNumber keeps rendering the readable,
// locale-formatted value on screen. Same 5-digit precision cap as
// formatNumber so the two never disagree on rounding, only on shape.
export function formatCopyValue(value: number) {
  return value.toLocaleString("en-US", {
    useGrouping: false,
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

// Plain-language "how long ago" phrasing for engine legibility (spec §7):
// the workspace always says when data was last refreshed, in words rather
// than a raw timestamp. Falls back to the absolute date once a relative
// phrase would stop being a legible, low-precision summary.
export function formatRelativeTime(value: string, now: Date = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Awaiting refresh";
  }

  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }

  return formatTimestamp(value);
}
