import { AGRICULTURE_SYMBOLS, LIVESTOCK_SYMBOLS } from "./advisorReview";
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

// Forex: Sunday 17:05 ET open through the Friday 17:00 ET close, with the
// nightly 16:59-17:05 rollover pause Monday-Thursday (1e, 2026-08-09).
// These are the analyzer's own boundaries (trade-analyzer/sessions.ts) —
// this calendar used to show a plain 17:00/17:00 week while the engine
// blocked the rollover minutes and opened five minutes later on Sunday, so
// a row could read open while every review was refused. Parity is pinned
// across the Deno boundary by tests/sessionCalendarParity.test.ts.
const FOREX_LIKE_CALENDAR: ClassCalendar = {
  alwaysOpen: false,
  closeMinuteOfDay: 17 * 60,
  dailyBreak: { endMinuteOfDay: 17 * 60 + 5, startMinuteOfDay: 16 * 60 + 59 },
  openMinuteOfDay: 17 * 60 + 5,
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

// Grains (the agriculture class): E8's own hours table publishes the CBOT
// commodity session as 19:00-13:20 CT — 20:00 ET open to a 14:20 ET close —
// its own overnight session, not the equity complex's
// (docs/research/e8-futures-dossier.md §5.2, row for row). Expressed in this
// model as a Sunday 20:00 weekly open, Friday 14:20 weekly close, and a
// Monday-Thursday 14:20-20:00 daily closure. ZO and ZR carry no published
// hours row (watchlist-only instruments) and adopt the group calendar their
// grain siblings publish.
const GRAINS_CALENDAR: ClassCalendar = {
  alwaysOpen: false,
  closeMinuteOfDay: 14 * 60 + 20,
  dailyBreak: { endMinuteOfDay: 20 * 60, startMinuteOfDay: 14 * 60 + 20 },
  openMinuteOfDay: 20 * 60,
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
  // 1f-c (2026-08-09): the premise here used to be "Indices are no-trade in
  // the product today" — stale since amendment 31 made all six cash index
  // CFDs live. The CALENDAR stays the complex's, on its merits: E8's index
  // CFDs price and trade on the futures session, not each exchange's local
  // cash hours.
  Indices: CME_COMPLEX_CALENDAR,
  // 1e (2026-08-09): metals moved from forex-like to the CME complex. The
  // analyzer has always put spot metals inside the 17:00-18:00 ET
  // maintenance closure (trade-analyzer/sessions.ts routes metals through
  // the complex branch), and spot XAU/XAG liquidity does halt with the
  // futures complex — the old no-break display disagreed with the engine
  // for one hour every weekday night. tests/marketHours.test.ts's old pin
  // asserting the absence of the break inverted with this, reasons inline.
  Metals: CME_COMPLEX_CALENDAR,
};

/**
 * 1e: the per-symbol slot the signature always carried, now live. The
 * engine's calibration class is not the display SecurityType — agriculture
 * and livestock both display as Futures while trading different sessions —
 * so the calendar resolves symbol-first exactly the way the confidence and
 * review-window mirrors do (advisorReview.ts). Livestock keeps the complex
 * calendar E8's own hours table publishes for it (17:00-16:00 CT, LE/HE
 * rows); grains get their published overnight session.
 */
function calendarFor(assetType: SecurityType, symbol: string): ClassCalendar {
  const normalized = symbol.toUpperCase().trim();
  if (AGRICULTURE_SYMBOLS.has(normalized)) {
    return GRAINS_CALENDAR;
  }
  if (LIVESTOCK_SYMBOLS.has(normalized)) {
    return CME_COMPLEX_CALENDAR;
  }
  return CALENDAR_BY_ASSET_TYPE[assetType];
}

export function marketAvailability(
  assetType: SecurityType,
  symbol: string,
  now: Date,
): MarketAvailability {
  const calendar = calendarFor(assetType, symbol);
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

/**
 * The scope menu's availability grammar extended with the date, for a stamp
 * that names an absolute moment rather than the next reopen (spec §17):
 * `{MMM} {D} {h}:{mm}{A|P}` — three-letter month in caps, 1-2 digit day,
 * two-digit minutes, a single capital meridiem letter with no space before it.
 * "JUL 31 2:05P".
 *
 * Assembled from the same two private formatters formatReopen reads above —
 * that is the whole point of it living here rather than beside its one caller
 * (ConfidenceUnit's meta line). The menu's OPENS lines and the Desk's Reviewed
 * / valid until stamp are one grammar by construction, so they cannot drift:
 * change the time piece and both move together. The caller does not uppercase
 * this itself, and neither does either piece — the menu rows apply their caps
 * in CSS (they are also uppercasing the word OPENS), while a stamp sitting in
 * running text has no such wrapper, so the caps belong to the assembled string
 * here.
 */
export function formatCompactDateTime(date: Date): string {
  return `${formatMonthDay(date)} ${formatCompactTime(date)}`.toUpperCase();
}

// One declaration of what a wall-clock time reads as, shared by the §17 stamp's
// time piece and by the two lines that print a bare clock time — so the three
// cannot drift into three grammars (Q1-I12).
//
// "en-US" is pinned for the reason advisorFormat.ts pins it on formatCopyValue:
// §17 fixes these grammars, and the runtime's locale rewrote them. `undefined`
// held only on an en-US browser — en-GB reverses the stamp's day and month,
// fr-FR prints a four-letter month with a trailing period where §17 wants three
// characters, and ja-JP's dayPeriod is 午後, whose first character is not a
// meridiem letter at all (Q2-C1). The zone stays the reader's own (no timeZone
// option): §10b's reopen line is deliberately local, and only the LANGUAGE is
// what the spec fixes.
const CLOCK_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const MONTH_DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

/**
 * A bare local clock time, "5:12 PM" — the trades rail's "as of" stamp
 * (a-desk-v3.html:219) and the scan rail's count line (:150), each of which used
 * to build its own unpinned formatter for the same datum. Same reading as the
 * §17 stamp's time piece above, printed in the long form those two lines have
 * always shown rather than the stamp's compact one.
 */
export function formatClockTime(date: Date): string {
  return CLOCK_TIME_FORMAT.format(date);
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
  const parts = CLOCK_TIME_FORMAT.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const meridiem = (lookup.dayPeriod ?? "").charAt(0).toLowerCase();

  return `${lookup.hour}:${lookup.minute}${meridiem}`;
}

function formatWeekday(date: Date): string {
  return WEEKDAY_FORMAT.format(date);
}

function formatMonthDay(date: Date): string {
  return MONTH_DAY_FORMAT.format(date);
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
// the same DST-safe trick used by supabase/functions/trade-analyzer/replay.ts.
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
