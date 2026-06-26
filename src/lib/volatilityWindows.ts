import type { MarketDataPoint } from "./marketData";

export type VolatilityWindow = {
  averageMovePct: number;
  baselineMovePct: number;
  confidence: "High" | "Developing";
  edgePct: number;
  endHourUtc: number;
  localWindowLabel: string;
  sampleCount: number;
  sessionLabel: string;
  startHourUtc: number;
  utcWindowLabel: string;
};

type HourBucket = {
  movePctSum: number;
  samples: number;
  sessionCounts: Map<string, number>;
};

const MIN_SAMPLES_PER_HOUR = 4;

export function findBestVolatilityWindow(
  points: MarketDataPoint[],
  userTimeZone: string,
  referenceDate = new Date(),
): VolatilityWindow | null {
  const hourly = new Map<number, HourBucket>();
  const moves: number[] = [];

  for (const point of points) {
    const date = parsePointDate(point.time);
    const high = Number(point.high);
    const low = Number(point.low);
    const close = Number(point.close ?? point.value);
    if (!date || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || close <= 0 || high <= low) {
      continue;
    }

    const movePct = ((high - low) / close) * 100;
    if (!Number.isFinite(movePct) || movePct <= 0) {
      continue;
    }

    const hour = date.getUTCHours();
    const bucket = hourly.get(hour) ?? {
      movePctSum: 0,
      samples: 0,
      sessionCounts: new Map<string, number>(),
    };
    bucket.movePctSum += movePct;
    bucket.samples += 1;
    moves.push(movePct);

    for (const session of getOpenSessions(date)) {
      bucket.sessionCounts.set(
        session,
        (bucket.sessionCounts.get(session) ?? 0) + 1,
      );
    }
    hourly.set(hour, bucket);
  }

  if (moves.length < 24 || hourly.size < 8) {
    return null;
  }

  const baselineMovePct = average(moves);
  let best: {
    averageMovePct: number;
    endHourUtc: number;
    sampleCount: number;
    sessionLabel: string;
    startHourUtc: number;
  } | null = null;

  for (let startHour = 0; startHour < 24; startHour += 1) {
    const nextHour = (startHour + 1) % 24;
    const first = hourly.get(startHour);
    const second = hourly.get(nextHour);
    if (!first || !second || first.samples < MIN_SAMPLES_PER_HOUR || second.samples < MIN_SAMPLES_PER_HOUR) {
      continue;
    }

    const sampleCount = first.samples + second.samples;
    const averageMovePct = (first.movePctSum + second.movePctSum) / sampleCount;
    const sessionLabel = mostCommonSession(first, second);

    if (!best || averageMovePct > best.averageMovePct) {
      best = {
        averageMovePct,
        endHourUtc: (startHour + 2) % 24,
        sampleCount,
        sessionLabel,
        startHourUtc: startHour,
      };
    }
  }

  if (!best) {
    return null;
  }

  const edgePct = baselineMovePct > 0
    ? ((best.averageMovePct - baselineMovePct) / baselineMovePct) * 100
    : 0;
  const anchor = buildDisplayAnchor(referenceDate, best.startHourUtc);
  const end = new Date(anchor.getTime() + 2 * 60 * 60 * 1000);

  return {
    averageMovePct: round(best.averageMovePct),
    baselineMovePct: round(baselineMovePct),
    confidence: best.sampleCount >= 20 ? "High" : "Developing",
    edgePct: round(edgePct),
    endHourUtc: best.endHourUtc,
    localWindowLabel: `${formatHour(anchor, userTimeZone)}-${formatHour(end, userTimeZone)}`,
    sampleCount: best.sampleCount,
    sessionLabel: best.sessionLabel,
    startHourUtc: best.startHourUtc,
    utcWindowLabel: `${formatHour(anchor, "UTC")}-${formatHour(end, "UTC")}`,
  };
}

function buildDisplayAnchor(referenceDate: Date, hourUtc: number) {
  return new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
    hourUtc,
    0,
    0,
  ));
}

function parsePointDate(value: MarketDataPoint["time"]) {
  if (typeof value === "number") {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getOpenSessions(date: Date) {
  const sessions = [
    isSessionOpen(date, "Asia/Tokyo", 9, 18) ? "Asia" : "",
    isSessionOpen(date, "Europe/London", 8, 17) ? "Europe" : "",
    isSessionOpen(date, "America/New_York", 8, 17) ? "North America" : "",
    isSessionOpen(date, "Australia/Sydney", 8, 17) ? "Australia" : "",
  ].filter(Boolean);

  return sessions.length > 0 ? sessions : ["Off-session"];
}

function isSessionOpen(
  date: Date,
  timeZone: string,
  startHour: number,
  endHour: number,
) {
  const parts = getZonedParts(date, timeZone);
  if (parts.weekday < 1 || parts.weekday > 5) {
    return false;
  }
  return parts.hour >= startHour && parts.hour < endHour;
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone,
    weekday: "short",
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

  return {
    hour: Number(lookup.hour ?? 0),
    weekday: weekdayMap[lookup.weekday ?? "Sun"] ?? 0,
  };
}

function mostCommonSession(first: HourBucket, second: HourBucket) {
  const counts = new Map<string, number>();
  for (const bucket of [first, second]) {
    for (const [session, count] of bucket.sessionCounts) {
      counts.set(session, (counts.get(session) ?? 0) + count);
    }
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "Global";
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) /
    Math.max(values.length, 1);
}

function formatHour(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

function round(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}
