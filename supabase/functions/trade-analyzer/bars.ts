/**
 * FMP bar-payload normalization, lifted out of marketLoader.ts so the harness
 * can reach it — marketLoader reads Deno.env at module load, so no test can
 * import it, and this is the analyzer's hottest loop.
 *
 * An open-market all-markets scan decodes ~50 symbols x 6 timeframes, roughly
 * 580,000 bars and 67 MiB of JSON, inside one 2s CPU budget. On 2026-08-02 that
 * budget was crossed on half of the scans: eleven completed, eleven died with
 * `CPU Time exceeded` behind HTTP 546. The chained filter/map/sort/slice built
 * four arrays per timeframe and a fifth defensive copy on return; this builds
 * one and keeps the same output, bar for bar.
 *
 * Bars are read-only for every consumer (indicators, strategies, pricePlan,
 * sweep all read or build fresh arrays), so the caller may share the array the
 * candle cache holds. tests/barDecode.test.ts pins both halves of that: the
 * output equals the old pipeline's, and nothing downstream mutates a bar.
 */
import type { Bar } from "./types.ts";

export type FmpBar = {
  close?: number;
  date?: string;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
};

/**
 * 2h: a rejection at the boundary, counted, never silent. The reasons are the
 * validator's whole vocabulary: a malformed row, an unparseable stamp, an
 * impossible candle, a reverting bad tick.
 */
export type BarRejection = {
  date?: string;
  reason: "shape" | "timestamp" | "incoherent_ohlc" | "spike";
};

export function normalizeFmpBars(
  payload: FmpBar[],
  maxBars: number,
  onReject?: (rejection: BarRejection) => void,
): Bar[] {
  const bars: Bar[] = [];
  for (const point of payload) {
    if (
      typeof point.date !== "string" || typeof point.open !== "number" ||
      typeof point.high !== "number" || typeof point.low !== "number" ||
      typeof point.close !== "number"
    ) {
      onReject?.({ date: point.date, reason: "shape" });
      continue;
    }
    const time = toTimestamp(point.date);
    if (Number.isNaN(time)) {
      onReject?.({ date: point.date, reason: "timestamp" });
      continue;
    }
    // 2h: an impossible candle never enters. high >= low, both extremes
    // containing open and close, every price positive — violations were
    // previously accepted verbatim and cemented into the corpus by the
    // calibration cache, where nothing ever refetches them.
    if (
      point.high < point.low ||
      point.high < Math.max(point.open, point.close) ||
      point.low > Math.min(point.open, point.close) ||
      point.low <= 0
    ) {
      onReject?.({ date: point.date, reason: "incoherent_ohlc" });
      continue;
    }
    bars.push({
      close: point.close,
      high: point.high,
      low: point.low,
      open: point.open,
      time,
      volume: point.volume ?? 0,
    });
  }
  bars.sort((first, second) => first.time - second.time);
  // 2h's second pass: the reverting bad tick. MGCUSD once printed a single
  // bar 135,533% above its neighbors and the evaluator resolved every open
  // buy on it as take_profit. The guard is deliberately narrow: it arms only
  // when both neighbors' closes agree within 25% (a REAL crash has
  // follow-through, so its neighbors disagree and the guard stands down),
  // and it fires only past 5x that consensus in either direction — no real
  // instrument travels 400% intrabar and closes back inside a agreeing
  // bracket. Rejections are counted like every other kind.
  const spiked = new Set<number>();
  for (let index = 1; index < bars.length - 1; index += 1) {
    const previous = bars[index - 1].close;
    const next = bars[index + 1].close;
    const agree = Math.abs(previous - next) <= 0.25 * Math.max(previous, next);
    if (!agree) {
      continue;
    }
    const consensus = (previous + next) / 2;
    const bar = bars[index];
    if (bar.high > consensus * 5 || bar.low < consensus / 5) {
      spiked.add(index);
      onReject?.({ reason: "spike" });
    }
  }
  const clean = spiked.size === 0
    ? bars
    : bars.filter((_, index) => !spiked.has(index));
  return clean.length > maxBars ? clean.slice(-maxBars) : clean;
}

/**
 * 2b: the provider clock, measured rather than assumed. FMP stamps BARS in
 * America/New_York wall time — proof: the banked S&P cash session reads
 * 09:30-15:45 in July AND January (true UTC would move it an hour between
 * them); banked EURUSD dies at Friday 17:00 wall and reopens Sunday 17:05;
 * banked ES is missing exactly the 17:00-18:00 wall maintenance hour. The
 * ECONOMIC CALENDAR is true UTC (NFP Jul-2026 stamps 12:30:00 = 08:30 ET) —
 * one provider, two conventions, and this function owns only the bar side.
 * A date-only stamp is the trading day's label and lands at New York
 * midnight of that day, so every bar in the system shares one clock.
 *
 * NaN for garbage — the old fallback stamped unparseable input as
 * Date.now(), turning corrupt payloads into bars at the present moment.
 */
export function toTimestamp(value: string): number {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    return Number.NaN;
  }
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  return newYorkWallClockToUtcMs(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

// One hoisted formatter: Intl.DateTimeFormat construction dominates the
// cost of a parts read, and the sweep reads parts for every unique bar time.
const NEW_YORK_CLOCK_FORMAT = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
});

const WEEKDAY_NUMBER: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/**
 * The New York wall-clock reading of a UTC instant — the shared other half
 * of toTimestamp's conversion, for callers that need to reason about the
 * stamp date a bar carries (the daily completion gate) or the wall-clock
 * bucket an intraday bar belongs to (the sweep's resampler). Weekday is
 * ISO-numbered, Monday 1 through Sunday 7.
 */
export function newYorkClockParts(utcMs: number): {
  day: number;
  hour: number;
  minute: number;
  month: number;
  weekday: number;
  year: number;
} {
  const lookup = Object.fromEntries(
    NEW_YORK_CLOCK_FORMAT.formatToParts(new Date(utcMs))
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(lookup.hour ?? "0");
  return {
    day: Number(lookup.day ?? "1"),
    hour: hour === 24 ? 0 : hour,
    minute: Number(lookup.minute ?? "0"),
    month: Number(lookup.month ?? "1"),
    weekday: WEEKDAY_NUMBER[lookup.weekday ?? ""] ?? 0,
    year: Number(lookup.year ?? "1970"),
  };
}

// Hoisted like NEW_YORK_CLOCK_FORMAT above, and for the same production
// reason: Intl.DateTimeFormat CONSTRUCTION is ~50µs while a formatToParts
// read is a few µs, and this converter runs per decoded bar and per gated
// daily row. Built per call, the two formatters below cost ~595ms per
// 11-symbol scan chunk — which is how #288's deploy died 546 inside the
// 2s Edge CPU budget.
const NEW_YORK_GUESS_FORMAT = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: "America/New_York",
  year: "numeric",
});

const NEW_YORK_VERIFY_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hour12: false,
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: "America/New_York",
});

// The DST-safe guess-correct conversion replay.ts and marketHours.ts already
// use: guess the UTC instant with the wanted digits, read the guess back in
// New York, correct by the difference. Exported for the daily completion
// gate and the resampler, which both need "this wall-clock moment, in UTC".
export function newYorkWallClockToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = NEW_YORK_GUESS_FORMAT.formatToParts(new Date(utcGuess));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const guessHour = Number(lookup.hour ?? "0");
  const guessReadAsUtc = Date.UTC(
    Number(lookup.year ?? year),
    Number(lookup.month ?? month) - 1,
    Number(lookup.day ?? day),
    guessHour === 24 ? 0 : guessHour,
    Number(lookup.minute ?? minute),
    Number(lookup.second ?? second),
  );
  const corrected = utcGuess - (guessReadAsUtc - utcGuess);
  // Second pass: when the first guess lands on the far side of a DST
  // boundary from the target wall time, one correction lands an hour off
  // (the spring-forward morning is the pinned case). Re-reading the
  // corrected instant converges; wall times inside the nonexistent
  // spring-forward hour resolve to their post-jump reading.
  const verify = NEW_YORK_VERIFY_FORMAT.formatToParts(new Date(corrected));
  const verifyLookup = Object.fromEntries(
    verify.map((part) => [part.type, part.value]),
  );
  const verifyHour = Number(verifyLookup.hour ?? "0");
  const wantedMinutes = hour * 60 + minute;
  const readMinutes = (verifyHour === 24 ? 0 : verifyHour) * 60 +
    Number(verifyLookup.minute ?? "0");
  const drift = ((readMinutes - wantedMinutes) + 1440) % 1440;
  const driftSigned = drift > 720 ? drift - 1440 : drift;
  return corrected - driftSigned * 60_000;
}
