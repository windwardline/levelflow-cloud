import { getSecurityOption, type SupportedSymbol } from "./symbolMap";
import type { PreferredSession } from "./profile";

type MarketKind = "crypto" | "forex" | "futures";

type ZonedParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  weekday: number;
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

export function getMarketClock(symbol: SupportedSymbol, userTimeZone: string, now = new Date()): MarketClock {
  const option = getSecurityOption(symbol);
  const kind: MarketKind = option.assetType === "Crypto" ? "crypto" : option.assetType === "Forex" ? "forex" : "futures";

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

  const marketTimeZone = kind === "forex" ? "America/New_York" : "America/New_York";
  const marketLabel = kind === "forex" ? "Global FX session" : "Primary futures session";
  const isOpen = kind === "forex" ? isForexOpen(now, marketTimeZone) : isFuturesOpen(now, marketTimeZone);
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
    const isOpen = isUtcWindowOpen(now, session.startUtcMinute, session.endUtcMinute);
    const nextEvent = findNextUtcSessionEvent(now, session.startUtcMinute, session.endUtcMinute);

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
  const currentOpen = kind === "forex" ? isForexOpen(now, timeZone) : isFuturesOpen(now, timeZone);
  const candidates = buildMarketCandidates(now, timeZone, kind)
    .filter((candidate) => candidate.getTime() > now.getTime())
    .sort((first, second) => first.getTime() - second.getTime());

  for (const candidate of candidates) {
    const before = new Date(candidate.getTime() - 60_000);
    const afterOpen = kind === "forex" ? isForexOpen(candidate, timeZone) : isFuturesOpen(candidate, timeZone);
    const beforeOpen = kind === "forex" ? isForexOpen(before, timeZone) : isFuturesOpen(before, timeZone);
    if (afterOpen !== beforeOpen) {
      return {
        date: candidate,
        label: afterOpen && !currentOpen ? "Opens" : !afterOpen && currentOpen ? "Closes" : afterOpen ? "Opens" : "Closes",
      };
    }
  }

  return null;
}

function buildMarketCandidates(now: Date, timeZone: string, kind: MarketKind) {
  const today = getZonedParts(now, timeZone);
  const start = zonedTimeToUtc(today.year, today.month, today.day, 0, 0, timeZone);
  const localTimes = kind === "forex" ? [[17, 0]] : [[17, 0], [18, 0]];
  const candidates: Date[] = [];

  for (let offset = -1; offset <= 9; offset += 1) {
    const base = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
    const parts = getZonedParts(base, timeZone);
    for (const [hour, minute] of localTimes) {
      candidates.push(zonedTimeToUtc(parts.year, parts.month, parts.day, hour, minute, timeZone));
    }
  }

  return candidates;
}

function isForexOpen(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const minutes = parts.hour * 60 + parts.minute;

  if (parts.weekday === 0) {
    return minutes >= 17 * 60;
  }
  if (parts.weekday >= 1 && parts.weekday <= 4) {
    return true;
  }
  if (parts.weekday === 5) {
    return minutes < 17 * 60;
  }
  return false;
}

function isFuturesOpen(date: Date, timeZone: string) {
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
  { endUtcMinute: 9 * 60, id: "asia", label: "Asia", startUtcMinute: 0, timeZone: "Asia/Tokyo" },
  { endUtcMinute: 16 * 60, id: "europe", label: "Europe", startUtcMinute: 7 * 60, timeZone: "Europe/London" },
  { endUtcMinute: 22 * 60, id: "north_america", label: "North America", startUtcMinute: 13 * 60, timeZone: "America/New_York" },
  { endUtcMinute: 6 * 60, id: "australia", label: "Australia", startUtcMinute: 21 * 60, timeZone: "Australia/Sydney" },
] satisfies Array<{ endUtcMinute: number; id: PreferredSession; label: string; startUtcMinute: number; timeZone: string }>;

function findNextUtcSessionEvent(now: Date, startUtcMinute: number, endUtcMinute: number) {
  const isOpen = isUtcWindowOpen(now, startUtcMinute, endUtcMinute);
  const nowUtcStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const candidates: Date[] = [];

  for (let offset = 0; offset <= 2; offset += 1) {
    candidates.push(new Date(nowUtcStart + offset * 24 * 60 * 60 * 1000 + startUtcMinute * 60 * 1000));
    candidates.push(new Date(nowUtcStart + offset * 24 * 60 * 60 * 1000 + endUtcMinute * 60 * 1000));
  }

  const next = candidates.filter((candidate) => candidate.getTime() > now.getTime()).sort((first, second) => first.getTime() - second.getTime())[0] ?? now;
  return {
    date: next,
    label: isOpen ? "Closes" : "Opens",
  };
}

function isUtcWindowOpen(date: Date, startUtcMinute: number, endUtcMinute: number) {
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  if (startUtcMinute < endUtcMinute) {
    return minute >= startUtcMinute && minute < endUtcMinute;
  }
  return minute >= startUtcMinute || minute < endUtcMinute;
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
