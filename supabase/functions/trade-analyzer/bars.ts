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
import type { Bar, Timeframe } from "./types.ts";

// E3 (R1a slice 2; #362 review, finding 1): a bar is decision-grade only
// once its span has closed — LA-2's own principle applied at load. The
// newest fetched intraday bar is usually still forming, and the sweep's
// decision context contains completed bars only, so ANY reader of an
// untrimmed series — the entry anchor, the ATR, the pivots, the strategy
// committee — diverges from the corpus by exactly that bar. Trailing trim
// rather than a filter: interior bars are closed by construction (their
// successors exist), so only the tail can be forming, though under
// provider clock skew several trailing spans may still be open and all of
// them go. "1day" has no entry because completeDaily owns the daily gate —
// a completed daily bar's span extends past `now` for most of the session,
// so a span test must never run on it. Lives here rather than in
// marketLoader so the harness can execute it (finding 2): marketLoader
// reads Deno.env at module load and no test can import it.
const INTRADAY_SPAN_MS: Partial<Record<Timeframe, number>> = {
  "1min": 60_000,
  "5min": 5 * 60_000,
  "15min": 15 * 60_000,
  "1hour": 60 * 60_000,
  "4hour": 4 * 60 * 60_000,
};

export function completedIntradaySeries(
  bars: Bar[],
  timeframe: Timeframe,
  nowMs: number = Date.now(),
): Bar[] {
  const spanMs = INTRADAY_SPAN_MS[timeframe];
  if (spanMs === undefined) {
    return bars;
  }
  let end = bars.length;
  while (end > 0 && bars[end - 1].time + spanMs > nowMs) {
    end -= 1;
  }
  // The untouched case returns the caller's array unsliced — consumers
  // treat bar arrays as read-only (tests/barDecode.test.ts pins that), so
  // the candle cache's copy may be shared exactly as fetchFmpBars shares it.
  return end === bars.length ? bars : bars.slice(0, end);
}

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
  zone: string,
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
    const time = toTimestamp(point.date, zone);
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
 * R0 "one clock": the identity of toTimestamp's stamp interpretation. The
 * rolling calibration cache persists NORMALIZED bars, so a normalizer
 * change silently strands every previously cached bar on the old clock —
 * which is exactly how the 2026-08-11 mixed-clock corpus happened: the 2b
 * fix below corrected new fetches while the cache kept serving naive-era
 * stamps it never refetched. Every rolling store now records the clock
 * that wrote it (scripts/calibrationCache.ts) and refuses to load under a
 * different one.
 *
 * The contract: any change to WHAT INSTANT toTimestamp assigns a given
 * stamp — timezone, convention, date-only anchoring — MUST bump this
 * string, which forces a deliberate cache rebuild instead of a silent
 * mixed-clock store. Pure parser hardening that maps the same input to
 * the same instant does not bump it. The naive pre-2026-08-09 era is the
 * implicit v1 and deliberately has no identifier: nothing may ever match
 * it. Pinned in tests/cacheClock.test.ts.
 *
 * v3 -> v4 (2026-08-24, same day): v3 passed the venue zone to DATE-ONLY
 * labels as well as intraday ones. A venue zone places a time of day, and a
 * bare date has none — so ^GDAXI, ^N225 and ^AXJO's daily bars anchored at
 * their venue's midnight (22-23Z, 15Z and 13-14Z) instead of New York's
 * 04-05Z. computeCompletionMs recovers a daily bar's DATE through
 * newYorkClockParts, so those bars read back as the previous day and
 * completed a full day early: a look-ahead, introduced by the fix for a
 * look-ahead. The daily-stamp witness RED'd all three at depth, which is the
 * guard doing precisely its job. Only those three daily stores differ between
 * v3 and v4; every other store is byte-identical under both, and the bump is
 * the contract's price for that being provable rather than argued.
 *
 * v2 -> v3 (R0f, 2026-08-24), and the name changed with it because the
 * clock is no longer New York's. FMP labels intraday bars in the VENUE'S
 * own local wall time; reading every label as New York wall left ^GDAXI,
 * ^N225 and ^AXJO displaced by exactly their venue's local-to-New-York
 * difference — 6, 13 and 14 hours — for their entire history, invisible to
 * every relative instrument because both of a symbol's series shift
 * together. venues.ts carries the four independent confirmations. The 93
 * other sources are unchanged by this: their venue IS New York, so v3
 * assigns them the same instants v2 did, and the bump exists to force the
 * three that move rather than because the majority did.
 */
export const BAR_CLOCK = "venue-wall-utc-v4";

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
/**
 * A provider bar label to a true instant. THE ZONE IS REQUIRED, deliberately:
 * a default would be a silent assumption about a venue, and reading every
 * label as New York wall is exactly the defect that left three indices 6, 13
 * and 14 hours out of register for their whole history. Callers get the zone
 * from `labelZoneFor(providerSymbol)` in venues.ts.
 */
export function toTimestamp(value: string, zone: string): number {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    return Number.NaN;
  }
  const [, year, month, day, hour, minute, second] = match;
  // A VENUE ZONE PLACES A TIME OF DAY. A date-only label has none, so it
  // anchors at New York midnight regardless of the venue — the convention the
  // daily-completion gate, the daily-stamp witness and the sweep's ordering
  // all read.
  //
  // Passing the venue zone here too was a look-ahead, caught by the daily
  // witness on the R0f rebuild (2026-08-24). computeCompletionMs recovers a
  // daily bar's DATE with newYorkClockParts — its own comment says "the
  // stamp's NY date and UTC date agree for a NY-midnight stamp" — so anchoring
  // ^N225's 2026-08-17 label at Tokyo midnight put it at 15:00Z on 2026-08-16,
  // which reads back as the 16th and completes the bar a full day early.
  // ^GDAXI landed at 22-23Z and ^AXJO at 13-14Z with the same effect.
  //
  // The distinction is not a special case: an intraday label names an instant
  // in the venue's clock, and a date names a trading day whose anchor is a
  // convention shared across every market so their bars order against each
  // other.
  const dateOnly = hour === undefined;
  return wallClockToUtcMs(
    dateOnly ? "America/New_York" : zone,
    Number(year),
    Number(month),
    Number(day),
    Number(hour ?? "0"),
    Number(minute ?? "0"),
    Number(second ?? "0"),
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
// R0f (2026-08-24): the conversion is now per VENUE ZONE, because FMP labels
// intraday bars in the venue's own local wall time. Reading every label as New
// York wall left ^GDAXI, ^N225 and ^AXJO displaced by 6, 13 and 14 hours for
// their whole history — see venues.ts for the four independent confirmations.
//
// Formatters stay hoisted for the reason stated above: construction costs
// ~50us against a few us to read, and this runs per decoded bar. They are
// built once per zone and the roster uses four.
type ZoneFormats = { guess: Intl.DateTimeFormat; verify: Intl.DateTimeFormat };
const ZONE_FORMATS = new Map<string, ZoneFormats>();

function formatsFor(zone: string): ZoneFormats {
  let formats = ZONE_FORMATS.get(zone);
  if (!formats) {
    formats = {
      guess: new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        second: "2-digit",
        timeZone: zone,
        year: "numeric",
      }),
      verify: new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        hourCycle: "h23",
        minute: "2-digit",
        timeZone: zone,
      }),
    };
    ZONE_FORMATS.set(zone, formats);
  }
  return formats;
}

// The DST-safe guess-correct conversion replay.ts and marketHours.ts already
// use: guess the UTC instant with the wanted digits, read the guess back in
// New York, correct by the difference. Exported for the daily completion
// gate and the resampler, which both need "this wall-clock moment, in UTC".
// Memoized per wall-clock stamp: the same stamps recur across every symbol
// on a timeframe grid (11 scan-chunk symbols share one 15min clock), and
// the two Intl reads below at ~19ms per 3,000-bar series were the second
// half of the 546 CPU deaths (#289) — a cold chunk decodes ~66 series.
// Growth is bounded by unique stamps an instance ever sees.
// KEYED PER ZONE. It was a flat Map<number, number> when only New York
// existed; leaving it flat while adding zones would return a New York answer
// for a Tokyo stamp, silently, for every bar whose wall digits happened to
// have been converted already. Nested rather than a composed string key
// because this is on the per-bar path.
const wallClockCache = new Map<string, Map<number, number>>();

export function wallClockToUtcMs(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let perZone = wallClockCache.get(zone);
  if (!perZone) {
    perZone = new Map<number, number>();
    wallClockCache.set(zone, perZone);
  }
  const cached = perZone.get(utcGuess);
  if (cached !== undefined) {
    return cached;
  }
  const converted = convertWallClock(
    zone,
    utcGuess,
    year,
    month,
    day,
    hour,
    minute,
    second,
  );
  perZone.set(utcGuess, converted);
  return converted;
}

/**
 * The New York case, kept as its own name because most callers reason about
 * New York specifically — the daily completion gate, the resampler and the
 * clock witnesses all ask "this New York moment, in UTC" rather than "this
 * venue's moment". Bar decoding is the caller that needs the venue.
 */
export function newYorkWallClockToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  return wallClockToUtcMs("America/New_York", year, month, day, hour, minute, second);
}

function convertWallClock(
  zone: string,
  utcGuess: number,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  const { guess: guessFormat, verify: verifyFormat } = formatsFor(zone);
  const parts = guessFormat.formatToParts(new Date(utcGuess));
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
  const verify = verifyFormat.formatToParts(new Date(corrected));
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
