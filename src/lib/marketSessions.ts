import { getSecurityOption, type SupportedSymbol } from "./symbolMap";
import type { PreferredSession } from "./profile";

type MarketKind = "crypto" | "forex" | "futures" | "metals";

type ZonedParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  weekday: number;
  year: number;
};

type CalendarDate = {
  day: number;
  month: number;
  year: number;
};

export type MarketClock = {
  countdownLabel: string;
  isOpen: boolean;
  marketLabel: string;
  marketTime: string;
  nextEventLabel: string;
  nextEventMarketTime: string;
  nextEventUserTime: string;
  statusLabel: string;
  userTime: string;
};

export type GlobalSessionStatus = {
  countdownLabel: string;
  id: PreferredSession;
  isPreferred: boolean;
  isOpen: boolean;
  label: string;
  marketTime: string;
  nextEventLabel: string;
  nextEventUserTime: string;
};

type GlobalSessionDefinition = {
  endLocalMinute: number;
  id: PreferredSession;
  label: string;
  startLocalMinute: number;
  timeZone: string;
};

export function getMarketClock(symbol: SupportedSymbol, userTimeZone: string, now = new Date()): MarketClock {
  const option = getSecurityOption(symbol);
  const kind: MarketKind = option.assetType === "Crypto"
    ? "crypto"
    : option.assetType === "Futures"
    ? "futures"
    : option.assetType === "Metals"
    ? "metals"
    : "forex";

  if (kind === "crypto") {
    return {
      countdownLabel: "Open continuously",
      isOpen: true,
      marketLabel: "Digital asset market",
      marketTime: formatDateTime(now, userTimeZone),
      nextEventLabel: "24/7 market",
      nextEventMarketTime: "No scheduled close",
      nextEventUserTime: "No scheduled close",
      statusLabel: "Open",
      userTime: formatDateTime(now, userTimeZone),
    };
  }

  const marketTimeZone = "America/New_York";
  const marketLabel = kind === "forex"
    ? "Global FX session"
    : kind === "metals"
    ? "Spot metals session"
    : "Primary futures session";
  const isOpen = isMarketOpen(now, marketTimeZone, kind);
  const nextEvent = findNextMarketEvent(now, marketTimeZone, kind);

  return {
    countdownLabel: nextEvent ? formatDuration(nextEvent.date.getTime() - now.getTime()) : "Unavailable",
    isOpen,
    marketLabel,
    marketTime: formatDateTime(now, marketTimeZone),
    nextEventLabel: nextEvent?.label ?? "Next event unavailable",
    nextEventMarketTime: nextEvent ? formatDateTime(nextEvent.date, marketTimeZone) : "Unavailable",
    nextEventUserTime: nextEvent ? formatDateTime(nextEvent.date, userTimeZone) : "Unavailable",
    statusLabel: isOpen ? "Open" : "Closed",
    userTime: formatDateTime(now, userTimeZone),
  };
}

export function getGlobalSessions(userTimeZone: string, preferredSession: PreferredSession, now = new Date()): GlobalSessionStatus[] {
  return GLOBAL_SESSIONS.map((session) => {
    const isOpen = isLocalSessionOpen(now, session);
    const nextEvent = findNextLocalSessionEvent(now, session);

    return {
      countdownLabel: formatDuration(nextEvent.date.getTime() - now.getTime()),
      id: session.id,
      isPreferred: preferredSession === session.id,
      isOpen,
      label: session.label,
      marketTime: formatTime(now, session.timeZone),
      nextEventLabel: nextEvent.label,
      nextEventUserTime: formatTime(nextEvent.date, userTimeZone),
    };
  });
}

function findNextMarketEvent(now: Date, timeZone: string, kind: MarketKind) {
  const currentOpen = isMarketOpen(now, timeZone, kind);
  const candidates = buildMarketCandidates(now, timeZone, kind)
    .filter((candidate) => candidate.getTime() > now.getTime())
    .sort((first, second) => first.getTime() - second.getTime());

  for (const candidate of candidates) {
    const before = new Date(candidate.getTime() - 60_000);
    const afterOpen = isMarketOpen(candidate, timeZone, kind);
    const beforeOpen = isMarketOpen(before, timeZone, kind);
    if (afterOpen !== beforeOpen) {
      return {
        date: candidate,
        label: afterOpen && !currentOpen ? "Opens" : !afterOpen && currentOpen ? "Closes" : afterOpen ? "Opens" : "Closes",
      };
    }
  }

  return null;
}

function isMarketOpen(date: Date, timeZone: string, kind: MarketKind) {
  return kind === "forex"
    ? isForexOpen(date, timeZone)
    : isFuturesStyleMarketOpen(date, timeZone);
}

function buildMarketCandidates(now: Date, timeZone: string, kind: MarketKind) {
  const today = getZonedParts(now, timeZone);
  const localTimes = kind === "forex" ? [[16, 59], [17, 5]] : [[17, 0], [18, 0]];
  const candidates: Date[] = [];

  for (let offset = -1; offset <= 9; offset += 1) {
    const parts = addCalendarDays(today, offset);
    for (const [hour, minute] of localTimes) {
      candidates.push(zonedTimeToUtc(parts.year, parts.month, parts.day, hour, minute, timeZone));
    }
  }

  return candidates;
}

function isForexOpen(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  const dailyClose = 16 * 60 + 59;
  const dailyOpen = 17 * 60 + 5;

  if (parts.weekday === 0) {
    return minutes >= dailyOpen;
  }
  if (parts.weekday >= 1 && parts.weekday <= 4) {
    return minutes < dailyClose || minutes >= dailyOpen;
  }
  if (parts.weekday === 5) {
    return minutes < dailyClose;
  }
  return false;
}

function isFuturesStyleMarketOpen(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const minutes = parts.hour * 60 + parts.minute;

  if (parts.weekday === 0) {
    return minutes >= 18 * 60;
  }
  if (parts.weekday >= 1 && parts.weekday <= 4) {
    return minutes < 17 * 60 || minutes >= 18 * 60;
  }
  if (parts.weekday === 5) {
    return minutes < 17 * 60;
  }
  return false;
}

const GLOBAL_SESSIONS = [
  { endLocalMinute: 18 * 60, id: "asia", label: "Asia", startLocalMinute: 9 * 60, timeZone: "Asia/Tokyo" },
  { endLocalMinute: 17 * 60, id: "europe", label: "Europe", startLocalMinute: 8 * 60, timeZone: "Europe/London" },
  { endLocalMinute: 17 * 60, id: "north_america", label: "North America", startLocalMinute: 8 * 60, timeZone: "America/New_York" },
  { endLocalMinute: 17 * 60, id: "australia", label: "Australia", startLocalMinute: 8 * 60, timeZone: "Australia/Sydney" },
] satisfies GlobalSessionDefinition[];

function findNextLocalSessionEvent(now: Date, session: GlobalSessionDefinition) {
  const isOpen = isLocalSessionOpen(now, session);
  const today = getZonedParts(now, session.timeZone);
  const candidates: Date[] = [];

  for (let offset = 0; offset <= 8; offset += 1) {
    const parts = addCalendarDays(today, offset);
    const weekday = getCalendarWeekday(parts);
    if (weekday < 1 || weekday > 5) {
      continue;
    }
    candidates.push(
      zonedTimeToUtc(
        parts.year,
        parts.month,
        parts.day,
        Math.floor(session.startLocalMinute / 60),
        session.startLocalMinute % 60,
        session.timeZone,
      ),
    );
    candidates.push(
      zonedTimeToUtc(
        parts.year,
        parts.month,
        parts.day,
        Math.floor(session.endLocalMinute / 60),
        session.endLocalMinute % 60,
        session.timeZone,
      ),
    );
  }

  const next = candidates.filter((candidate) => candidate.getTime() > now.getTime()).sort((first, second) => first.getTime() - second.getTime())[0] ?? now;
  return {
    date: next,
    label: isOpen ? "Closes" : "Opens",
  };
}

function isLocalSessionOpen(date: Date, session: GlobalSessionDefinition) {
  const parts = getZonedParts(date, session.timeZone);
  if (parts.weekday < 1 || parts.weekday > 5) {
    return false;
  }
  const minute = parts.hour * 60 + parts.minute;
  return minute >= session.startLocalMinute && minute < session.endLocalMinute;
}

function addCalendarDays(parts: Pick<ZonedParts, "day" | "month" | "year">, offset: number): CalendarDate {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function getCalendarWeekday(parts: CalendarDate) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = getZonedParts(utcGuess, timeZone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(utcGuess.getTime() - (zonedAsUtc - wantedAsUtc));
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    weekday: "short",
    year: "numeric",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(lookup.hour ?? 0);

  return {
    day: Number(lookup.day ?? 1),
    hour: hour === 24 ? 0 : hour,
    minute: Number(lookup.minute ?? 0),
    month: Number(lookup.month ?? 1),
    second: Number(lookup.second ?? 0),
    weekday: weekdayMap[lookup.weekday ?? "Sun"] ?? 0,
    year: Number(lookup.year ?? 1970),
  };
}

function formatDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone,
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
