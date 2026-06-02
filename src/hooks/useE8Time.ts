import { useEffect, useMemo, useState } from "react";

const E8_TIME_ZONE = "Europe/Prague";

type CountdownTarget = {
  label: string;
  serverTime: Date;
  localTime: Date;
  remainingMs: number;
  remainingLabel: string;
};

type E8TimeState = {
  serverNowLabel: string;
  localNowLabel: string;
  dailyReset: CountdownTarget;
  signatureClosure: CountdownTarget;
  inSpreadProtection: boolean;
  spreadProtectionLabel: string;
  isWeekendProtectionWindow: boolean;
};

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

function zonedDateToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const firstOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const corrected = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(corrected, timeZone);
  return new Date(utcGuess.getTime() - secondOffset);
}

function addDays(parts: ReturnType<typeof getZonedParts>, days: number) {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return getZonedParts(utc, E8_TIME_ZONE);
}

function nextServerTarget(now: Date, hour: number, minute: number) {
  const parts = getZonedParts(now, E8_TIME_ZONE);
  let target = zonedDateToUtc(E8_TIME_ZONE, parts.year, parts.month, parts.day, hour, minute);

  if (target.getTime() <= now.getTime()) {
    const nextDay = addDays(parts, 1);
    target = zonedDateToUtc(E8_TIME_ZONE, nextDay.year, nextDay.month, nextDay.day, hour, minute);
  }

  return target;
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatLocal(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatServer(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: E8_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function buildTarget(label: string, now: Date, target: Date): CountdownTarget {
  return {
    label,
    serverTime: target,
    localTime: target,
    remainingMs: target.getTime() - now.getTime(),
    remainingLabel: formatDuration(target.getTime() - now.getTime()),
  };
}

function isSpreadProtectionWindow(now: Date) {
  const parts = getZonedParts(now, E8_TIME_ZONE);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 23 * 60 + 55 || minutes <= 15;
}

function isFridayClosureWindow(now: Date) {
  const parts = getZonedParts(now, E8_TIME_ZONE);
  const minutes = parts.hour * 60 + parts.minute;
  return parts.weekday === "Fri" && minutes >= 22 * 60;
}

export function useE8Time(): E8TimeState {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return useMemo(() => {
    const reset = nextServerTarget(now, 0, 0);
    const closure = nextServerTarget(now, 22, 45);
    const inSpreadProtection = isSpreadProtectionWindow(now);

    return {
      serverNowLabel: formatServer(now),
      localNowLabel: formatLocal(now),
      dailyReset: buildTarget("Daily reset", now, reset),
      signatureClosure: buildTarget("Signature closure", now, closure),
      inSpreadProtection,
      spreadProtectionLabel: inSpreadProtection ? "23:55-00:15 CE(S)T active" : "23:55-00:15 CE(S)T clear",
      isWeekendProtectionWindow: isFridayClosureWindow(now),
    };
  }, [now]);
}
