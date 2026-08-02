import { CHART_TIMEFRAME_OPTIONS } from "../../lib/marketData";

export const TIMEFRAMES = [...CHART_TIMEFRAME_OPTIONS];

// Precision ceiling for the app's price formatting (fix round 2).
// ZNUSD (10-year Treasury note futures) ticks in 1/64 = 0.015625 — six
// decimal places (supabase/functions/trade-analyzer/futures.ts,
// FUTURES_CONTRACT_SPECS/alignFuturesLevel) — so a real tick-aligned price
// like 109.515625 (7009 ticks) needs all six to stay on the exchange's own
// tick grid. The old cap of 5 rounded it to 109.51563, a price that isn't
// a multiple of 0.015625 at all. 8 gives that grid headroom to spare and
// also covers sub-cent crypto pricing, stays well inside double-precision
// safety at these magnitudes, and toLocaleString never switches to
// scientific notation in this range (it only would under an explicit
// `notation: "scientific"`, never implicitly).
export const MAX_PRICE_DECIMALS = 8;

export function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: MAX_PRICE_DECIMALS,
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
// locale-formatted value on screen. Same precision cap as formatNumber so
// the two never disagree on rounding, only on shape.
export function formatCopyValue(value: number) {
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: MAX_PRICE_DECIMALS,
  });
}
