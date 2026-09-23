import { getAssetType } from "./calibration.ts";

export type SessionContext = {
  block: boolean;
  label: string;
  // Marks the hour gates that are policy, not market closures. They were set
  // on replay evidence that predates the 2026-08-09 clock repair and has not
  // been re-derived (see isLowEdgeUtcWindow). The sweep's --ignore-low-edge
  // flag sees through these to re-measure the hours; hard closures are never
  // bypassed.
  lowEdge?: boolean;
  marketKind: string;
  penalty: number;
  reason?: string;
};

export function getSessionContext(
  symbol: string,
  now = new Date(),
): SessionContext {
  const assetType = getAssetType(symbol);

  if (assetType === "crypto") {
    // 12:00-18:00 UTC, set by r4 (1,200d) and kept by r22 at full depth as a
    // net-quality filter. Both ran on the pre-repair clock (see
    // isLowEdgeUtcWindow), so the reason states the window and cites no
    // measurement.
    if (isLowEdgeUtcWindow(now)) {
      return {
        block: true,
        label: "Crypto low-edge window",
        lowEdge: true,
        marketKind: "crypto",
        penalty: 100,
        reason:
          "Levelflow does not open new setups on this market from 12:00 to 18:00 UTC.",
      };
    }
    return {
      block: false,
      label: "Continuous digital asset session",
      marketKind: "crypto",
      penalty: 0,
    };
  }

  // 1e (2026-08-09): agriculture — the grains — trades its OWN session, and
  // E8's hours table publishes it per row: 19:00-13:20 CT (20:00 ET open,
  // 14:20 ET close) for ZC/ZW/ZS/ZM/ZL, docs/research/e8-futures-dossier.md
  // §5.2. Before this branch existed, agriculture and livestock fell through
  // to the FX branch below and wore forex weekend hours — a corn setup could
  // open at 16:00 ET into a venue that closed at 14:20. ZO/ZR carry no
  // published row (watchlist-only) and adopt their grain siblings' session.
  if (assetType === "agriculture") {
    const eastern = getZonedParts(now, "America/New_York");
    const minutes = eastern.hour * 60 + eastern.minute;
    const open = 20 * 60;
    const close = 14 * 60 + 20;
    const closed = eastern.weekday === 6 ||
      (eastern.weekday === 5 && minutes >= close) ||
      (eastern.weekday === 7 && minutes < open) ||
      (eastern.weekday >= 1 && eastern.weekday <= 5 && minutes >= close &&
        minutes < open);
    if (closed) {
      return {
        block: true,
        label: "Grain session closure",
        marketKind: "agriculture",
        penalty: 100,
        reason: "This market is outside its published grain session.",
      };
    }
    return {
      block: false,
      label: "Grain session",
      marketKind: "agriculture",
      penalty: 0,
    };
  }

  if (
    assetType === "futures" || assetType === "metals" ||
    assetType === "energies" || assetType === "indices" ||
    assetType === "livestock"
  ) {
    const isMetals = assetType === "metals";
    const isEnergies = assetType === "energies";
    const isIndices = assetType === "indices";
    // 1e: livestock joins the complex branch E8's own hours table puts it on
    // (LE/HE rows, 17:00-16:00 CT) instead of falling through to FX hours.
    const isLivestock = assetType === "livestock";
    const marketKind = isMetals
      ? "metals"
      : isEnergies
      ? "energies"
      : isIndices
      ? "indices"
      : isLivestock
      ? "livestock"
      : "futures";
    const sessionLabel = isMetals
      ? "Spot metals session"
      : isEnergies
      ? "Energy session"
      : isIndices
      ? "Index session"
      : isLivestock
      ? "Livestock session"
      : "Primary futures session";
    const maintenanceLabel = isMetals
      ? "Spot metals maintenance window"
      : isEnergies
      ? "Energy maintenance window"
      : isIndices
      ? "Index maintenance window"
      : isLivestock
      ? "Livestock maintenance window"
      : "Futures maintenance window";
    const weekendLabel = isMetals
      ? "Spot metals weekend closure"
      : isEnergies
      ? "Energy weekend closure"
      : isIndices
      ? "Index weekend closure"
      : isLivestock
      ? "Livestock weekend closure"
      : "Futures weekend closure";
    const eastern = getZonedParts(now, "America/New_York");
    const minutes = eastern.hour * 60 + eastern.minute;
    const maintenanceBreak = eastern.weekday >= 1 && eastern.weekday <= 4 &&
      minutes >= 17 * 60 && minutes < 18 * 60;
    // 1e (2026-08-09): the hard close moved from 16:30 to 17:00 ET. E8's own
    // hours table closes the complex at 16:00 CT — 17:00 ET — and the 16:30
    // literal carried no recorded measurement; a half hour the venue trades
    // was being refused as if closed. The half hour keeps the thin-liquidity
    // PENALTY the FX branch's own late-Friday window earned, non-blocking.
    const fridayClose = eastern.weekday === 5 && minutes >= 17 * 60;
    const fridayThin = eastern.weekday === 5 && minutes >= 16 * 60 + 30 &&
      minutes < 17 * 60;
    const sundayPreopen = eastern.weekday === 7 && minutes < 18 * 60;

    if (maintenanceBreak) {
      return {
        block: true,
        label: maintenanceLabel,
        marketKind,
        penalty: 100,
        reason: "This market is in its daily maintenance window.",
      };
    }

    if (fridayClose || sundayPreopen || eastern.weekday === 6) {
      return {
        block: true,
        label: weekendLabel,
        marketKind,
        penalty: 100,
        reason: "This market is outside its active weekly session.",
      };
    }

    // Energies: six UTC hours set by r15's per-hour curves, on the pre-repair
    // clock (see isLowEdgeUtcWindow). The reason names the whole contiguous
    // closure, so 03:00 and 04:00 read as one window that ends at 05:00.
    if (
      marketKind === "energies" &&
      ENERGIES_LOW_EDGE_UTC_HOURS.has(now.getUTCHours())
    ) {
      return {
        block: true,
        label: "Energy low-edge hour",
        lowEdge: true,
        marketKind,
        penalty: 100,
        reason:
          `Levelflow does not open new setups on this market from ${
            energiesLowEdgeWindow(now.getUTCHours())
          } UTC.`,
      };
    }

    // Futures and cash indices: 12:00-18:00 UTC, set by round 12 (indices)
    // and r22 (futures), both on the pre-repair clock (see
    // isLowEdgeUtcWindow).
    if (
      (marketKind === "futures" || marketKind === "indices") &&
      isLowEdgeUtcWindow(now)
    ) {
      const kindLabel = marketKind === "futures" ? "Futures" : "Index";
      return {
        block: true,
        label: `${kindLabel} low-edge window`,
        lowEdge: true,
        marketKind,
        penalty: 100,
        reason:
          "Levelflow does not open new setups on this market from 12:00 to 18:00 UTC.",
      };
    }

    if (fridayThin) {
      return {
        block: false,
        label: `Late Friday ${sessionLabel.toLowerCase()}`,
        marketKind,
        penalty: 10,
        reason: "Late Friday liquidity conditions reduce setup quality.",
      };
    }

    return {
      block: false,
      label: sessionLabel,
      marketKind,
      penalty: 0,
    };
  }

  const eastern = getZonedParts(now, "America/New_York");
  const london = getZonedParts(now, "Europe/London");
  const easternMinutes = eastern.hour * 60 + eastern.minute;
  const londonMinutes = london.hour * 60 + london.minute;
  const easternWeekday = eastern.weekday >= 1 && eastern.weekday <= 5;
  const londonWeekday = london.weekday >= 1 && london.weekday <= 5;
  const dailyRollover = eastern.weekday >= 1 && eastern.weekday <= 4 &&
    easternMinutes >= 16 * 60 + 59 && easternMinutes < 17 * 60 + 5;
  const londonNyOverlap = easternWeekday && londonWeekday &&
    easternMinutes >= 8 * 60 && easternMinutes < 12 * 60 &&
    londonMinutes >= 13 * 60 && londonMinutes < 17 * 60;
  const londonOpen = londonWeekday && londonMinutes >= 8 * 60 &&
    londonMinutes < 10 * 60;
  const lateSession = easternWeekday && easternMinutes >= 16 * 60 &&
    easternMinutes < 17 * 60;
  // The last half hour before the weekly close: thin, and measured as such, but
  // still tradeable — it keeps the penalty it earned.
  const fridayClose = eastern.weekday === 5 &&
    easternMinutes >= 16 * 60 + 30 && easternMinutes < 17 * 60;
  // I7: spot FX settles for the week at 17:00 ET Friday and reopens Sunday at
  // the same rollover minute the daily pause uses. Before this, `weekend` began
  // on Saturday, so Friday 17:00-24:00 ET generated setups on a closed market —
  // seven hours in which every other class hard-blocks from 16:30 ET, and in
  // which getSetupExpiryTime lands the review window inside the weekend, so
  // every one of those setups was deterministically unfilled. The client's
  // calendar has always closed forex here (src/lib/marketHours.ts); this is the
  // server agreeing with it.
  const weekend = eastern.weekday === 6 ||
    (eastern.weekday === 5 && easternMinutes >= 17 * 60) ||
    (eastern.weekday === 7 && easternMinutes < 17 * 60 + 5);

  return {
    block: weekend || dailyRollover,
    label: weekend
      ? "FX weekend closure"
      : dailyRollover
      ? "FX rollover pause"
      : fridayClose
      ? "Late Friday FX session"
      : londonNyOverlap
      ? "London/New York overlap"
      : londonOpen
      ? "London open"
      : lateSession
      ? "Late-session risk"
      : "Normal session",
    marketKind: "forex",
    penalty: weekend || dailyRollover
      ? 100
      : fridayClose
      ? 10
      : lateSession
      ? 3
      : 0,
    reason: weekend
      ? "The FX market is outside its active weekly session."
      : dailyRollover
      ? "The FX market is in its daily rollover pause."
      : fridayClose
      ? "Late Friday liquidity conditions reduce setup quality."
      : lateSession
      ? "Late-session liquidity can reduce follow-through."
      : undefined,
  };
}

// THE LOW-EDGE HOURS ARE UNVERIFIED. Every one of them was set on the r4, r12,
// r15 and r22 corpora (2026-07-28..30), which read FMP's New York bar stamps as
// UTC. The repair map records every low-edge hour in that corpus as 4-5
// DST-variable hours out of register
// (docs/research/evaluator-repair-map-2026-08-09.md, cluster A;
// docs/research/remediation-program-2026-08-11.md), and nothing has
// re-derived them. No verdict exists to move them, so the hours
// stand as they were, and the refusal reasons state the window without citing
// a measurement. A market-grain re-grade is queued with the next re-simulate.
function isLowEdgeUtcWindow(now: Date) {
  const hour = now.getUTCHours();
  return hour >= 12 && hour < 18;
}

// r15 per-hour curves, full history, pre-repair clock (see isLowEdgeUtcWindow):
// the energy hours read negative on both walk-forward splits. Scattered rather
// than one window — the arbiter was the split agreement, not shape.
const ENERGIES_LOW_EDGE_UTC_HOURS = new Set([3, 4, 12, 15, 19, 21]);

// The contiguous run of gated hours around `hour`, as "03:00 to 05:00". A
// per-hour window would tell an operator at 03:30 that review resumes at 04:00,
// an hour early.
function energiesLowEdgeWindow(hour: number) {
  let start = hour;
  let end = (hour + 1) % 24;
  for (let guard = 0; guard < 24; guard += 1) {
    if (!ENERGIES_LOW_EDGE_UTC_HOURS.has((start + 23) % 24)) break;
    start = (start + 23) % 24;
  }
  for (let guard = 0; guard < 24; guard += 1) {
    if (!ENERGIES_LOW_EDGE_UTC_HOURS.has(end)) break;
    end = (end + 1) % 24;
  }
  const clock = (value: number) => `${String(value).padStart(2, "0")}:00`;
  return `${clock(start)} to ${clock(end)}`;
}

// OP-8: hoisted per zone — construction is ~50us and this runs per scan
// decision. Minute-level output makes value caching pointless; the
// formatter itself is the cost.
const zonedPartsFormatters = new Map<string, Intl.DateTimeFormat>();

function getZonedParts(date: Date, timeZone: string) {
  let formatter = zonedPartsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone,
      weekday: "short",
    });
    zonedPartsFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const weekdayMap: Record<string, number> = {
    Fri: 5,
    Mon: 1,
    Sat: 6,
    Sun: 7,
    Thu: 4,
    Tue: 2,
    Wed: 3,
  };
  return {
    hour: Number(lookup.hour ?? 0),
    minute: Number(lookup.minute ?? 0),
    weekday: weekdayMap[lookup.weekday ?? "Mon"] ?? 1,
  };
}
