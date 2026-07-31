import type { SecurityType } from "./symbolMap";

export type MarketAvailability =
  | { open: true }
  | { open: false; opensAt: Date };

type ZonedParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  weekday: number;
  year: number;
};

type ClassCalendar = {
  alwaysOpen: boolean;
  closeMinuteOfDay: number;
  dailyBreak?: { endMinuteOfDay: number; startMinuteOfDay: number };
  openMinuteOfDay: number;
};

const MARKET_TIME_ZONE = "America/New_York";
const MINUTES_PER_DAY = 24 * 60;
const SUNDAY = 0;
const FRIDAY = 5;
// Beyond this many ms out, formatReopen shows a month + day instead of a
// weekday - the calendars below never actually produce a gap this wide
// (holidays aren't modeled yet), but the formatter supports it per spec
// #10b so a future holiday calendar can reuse it untouched.
const WEEKDAY_LABEL_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

// Forex and spot Metals trade continuously from the Sunday New York open
// through the Friday New York close - no daily break in this model (spec
// 2026-07-30-levelflow-desk-design.md #10b).
const FOREX_LIKE_CALENDAR: ClassCalendar = {
  alwaysOpen: false,
  closeMinuteOfDay: 17 * 60,
  openMinuteOfDay: 17 * 60,
};

// Futures, Energies, and cash Indices follow the CME complex: Sunday 6pm ET
// open, Friday 5pm ET close, with a daily maintenance break 5-6pm ET Monday
// through Thursday.
const CME_COMPLEX_CALENDAR: ClassCalendar = {
  alwaysOpen: false,
  closeMinuteOfDay: 17 * 60,
  dailyBreak: { endMinuteOfDay: 18 * 60, startMinuteOfDay: 17 * 60 },
  openMinuteOfDay: 18 * 60,
};

const CRYPTO_CALENDAR: ClassCalendar = {
  alwaysOpen: true,
  closeMinuteOfDay: 0,
  openMinuteOfDay: 0,
};

const CALENDAR_BY_ASSET_TYPE: Record<SecurityType, ClassCalendar> = {
  Crypto: CRYPTO_CALENDAR,
  Energies: CME_COMPLEX_CALENDAR,
  Forex: FOREX_LIKE_CALENDAR,
  Futures: CME_COMPLEX_CALENDAR,
  // Indices are no-trade in the product today, but the calendar map stays
  // total over SecurityType; they share the CME complex's hours (spec
  // #10b: "treat as Futures").
  Indices: CME_COMPLEX_CALENDAR,
  Metals: FOREX_LIKE_CALENDAR,
};

// `_symbol` is intentionally unused today - the signature carries it so a
// later per-symbol calendar (holidays, early closes) can slot in without
// changing every call site.
export function marketAvailability(
  assetType: SecurityType,
  _symbol: string,
  now: Date,
): MarketAvailability {
  const calendar = CALENDAR_BY_ASSET_TYPE[assetType];
  if (calendar.alwaysOpen) {
    return { open: true };
  }

  const parts = getEasternParts(now);
  if (isOpenUnderCalendar(calendar, parts)) {
    return { open: true };
  }

  return { open: false, opensAt: nextOpenTime(calendar, parts) };
}

export function formatReopen(opensAt: Date, now: Date): string {
  const time = formatCompactTime(opensAt);
  const isBeyondTheWeek = opensAt.getTime() - now.getTime() >
    WEEKDAY_LABEL_HORIZON_MS;
  const dayLabel = isBeyondTheWeek
    ? formatMonthDay(opensAt)
    : formatWeekday(opensAt);

  return `${time} ${dayLabel}`;
}

function isOpenUnderCalendar(calendar: ClassCalendar, parts: ZonedParts): boolean {
  const minuteOfWeek = parts.weekday * MINUTES_PER_DAY + parts.hour * 60 +
    parts.minute;
  const weeklyOpen = SUNDAY * MINUTES_PER_DAY + calendar.openMinuteOfDay;
  const weeklyClose = FRIDAY * MINUTES_PER_DAY + calendar.closeMinuteOfDay;
  if (minuteOfWeek < weeklyOpen || minuteOfWeek >= weeklyClose) {
    return false;
  }

  return activeDailyBreak(calendar, parts) === null;
}

function nextOpenTime(calendar: ClassCalendar, parts: ZonedParts): Date {
  const dailyBreak = activeDailyBreak(calendar, parts);
  if (dailyBreak) {
    return zonedWallClockToUtc(
      parts.year,
      parts.month,
      parts.day,
      dailyBreak.endMinuteOfDay,
    );
  }

  const daysUntilSunday = (7 - parts.weekday) % 7;
  const sunday = addEasternCalendarDays(parts, daysUntilSunday);
  return zonedWallClockToUtc(
    sunday.year,
    sunday.month,
    sunday.day,
    calendar.openMinuteOfDay,
  );
}

// Returns the calendar's daily-break window when `parts` falls inside it
// (Monday-Thursday only), so the open check and the reopen-time lookup
// share one source of truth instead of re-deriving the same condition.
function activeDailyBreak(
  calendar: ClassCalendar,
  parts: ZonedParts,
): { endMinuteOfDay: number; startMinuteOfDay: number } | null {
  const { dailyBreak } = calendar;
  if (!dailyBreak || parts.weekday < 1 || parts.weekday > 4) {
    return null;
  }

  const minuteOfDay = parts.hour * 60 + parts.minute;
  return minuteOfDay >= dailyBreak.startMinuteOfDay &&
      minuteOfDay < dailyBreak.endMinuteOfDay
    ? dailyBreak
    : null;
}

function formatCompactTime(date: Date): string {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const meridiem = (lookup.dayPeriod ?? "").charAt(0).toLowerCase();

  return `${lookup.hour}:${lookup.minute}${meridiem}`;
}

function formatWeekday(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
}

function formatMonthDay(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })
    .format(date);
}

function getEasternParts(date: Date): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: MARKET_TIME_ZONE,
    weekday: "short",
    year: "numeric",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Fri: 5,
    Mon: 1,
    Sat: 6,
    Sun: 0,
    Thu: 4,
    Tue: 2,
    Wed: 3,
  };
  const hour = Number(lookup.hour ?? "0");

  return {
    day: Number(lookup.day ?? "1"),
    hour: hour === 24 ? 0 : hour,
    minute: Number(lookup.minute ?? "0"),
    month: Number(lookup.month ?? "1"),
    weekday: weekdayMap[lookup.weekday ?? "Sun"] ?? 0,
    year: Number(lookup.year ?? "1970"),
  };
}

function addEasternCalendarDays(
  parts: Pick<ZonedParts, "day" | "month" | "year">,
  offsetDays: number,
): Pick<ZonedParts, "day" | "month" | "year"> {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays),
  );
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

// Converts an America/New_York wall-clock instant to the UTC Date it
// represents. Guess the UTC instant that has the wanted digits, read back
// what that guess actually reads as in ET, then correct by the difference -
// the same DST-safe trick used by src/lib/marketSessions.ts and
// supabase/functions/trade-analyzer/replay.ts.
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): Date {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = getEasternParts(utcGuess);
  const guessReadAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(utcGuess.getTime() - (guessReadAsUtc - wantedAsUtc));
}
