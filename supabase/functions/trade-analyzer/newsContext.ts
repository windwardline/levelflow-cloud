import {
  calculateNewsPenaltyUnits,
  isBlockingNewsEvent,
  NEWS_ACTIVE_AFTER_MS,
  NEWS_ACTIVE_BEFORE_MS,
  NEWS_UPCOMING_HORIZON_MS,
} from "./newsRules.ts";
import {
  isCurrencyRelevantForSymbol,
  isEquityCalendarSensitiveSymbol,
  isHeadlineNewsRelevantForSymbol,
} from "./symbols.ts";

/**
 * The calendar half of a review, separated from the fetch so it can be run.
 *
 * WHY IT MOVED. `fetchRelevantNews` lived inside index.ts, which is deliberately
 * outside the typecheck graph (Deno globals) and has no executing test. The only
 * coverage of the news path was a source-string match, so the behaviour below
 * — including the one that matters most — had never been exercised.
 *
 * THE BEHAVIOUR THAT MATTERS MOST is telling "the calendar is clear" apart from
 * "the calendar is empty". One window query returning zero rows produces
 * `blocking: []` and `penaltyUnits: 0`, which is byte-identical to a genuinely
 * quiet market — so a dead ingest silently disabled the news refusal on every
 * market and handed back a full all-clear.
 *
 * That is not hypothetical. Migration 20260729040000's own header records it
 * happening in production: "the economic-calendar job failed authentication
 * silently for weeks: cron fired on time, pg_net recorded 401s nobody read, and
 * the analyzer quietly lost news awareness once its event window ran dry."
 */

export type NewsEventRow = {
  currency?: string;
  event_type?: "scheduled" | "earnings" | "headline";
  event_name?: string;
  impact?: string;
  provider?: string;
  scheduled_at?: string;
  symbol?: string | null;
  url?: string | null;
};

/**
 * Where the calendar reading came from.
 *
 * `read` means the table answered and its coverage is live. `stale` means it
 * answered and holds NO future events at all, so a zero-row window says nothing
 * about the market. `unavailable` means the read itself failed.
 *
 * Named rather than boolean because the three carry different instructions, and
 * because `macroRateContext.unavailableReason` eleven lines away in index.ts
 * already set this shape for exactly the same problem.
 */
export type CalendarSource = "read" | "stale" | "unavailable";

export type NewsContextResult = {
  active: NewsEventRow[];
  blocking: NewsEventRow[];
  calendarSource: CalendarSource;
  headlineCount: number;
  penaltyUnits: number;
  unavailableReason: string | null;
  upcoming: NewsEventRow[];
};

export function isNewsRelevant(symbol: string, event: NewsEventRow): boolean {
  if (event.symbol) {
    return isHeadlineNewsRelevantForSymbol(symbol, event.symbol);
  }
  if (event.provider === "fmp_earnings") {
    return isEquityCalendarSensitiveSymbol(symbol);
  }
  const currency = event.currency?.toUpperCase();
  if (!currency) {
    return true;
  }
  return isCurrencyRelevantForSymbol(symbol, currency);
}

/**
 * The window boundaries a review reads the calendar through. Exported so the
 * caller builds its query from the same instants this partitions on — two
 * expressions of one window is how a row lands in the fetch and outside every
 * bucket.
 */
export function newsWindow(nowMs: number) {
  return {
    activeEnd: new Date(nowMs + NEWS_ACTIVE_AFTER_MS).toISOString(),
    activeStart: new Date(nowMs - NEWS_ACTIVE_BEFORE_MS).toISOString(),
    headlineStart: new Date(nowMs - NEWS_UPCOMING_HORIZON_MS).toISOString(),
    now: new Date(nowMs).toISOString(),
    upcomingEnd: new Date(nowMs + NEWS_UPCOMING_HORIZON_MS).toISOString(),
  };
}

export function buildNewsContext(input: {
  /**
   * Whether the table holds ANY event scheduled after now. The same predicate
   * the sync watchdog uses — `count(*) filter (where scheduled_at > now())`
   * (migration 20260729040000) — so the analyzer and the watchdog cannot drift
   * on what "stale" means.
   *
   * Deliberately NOT `max(created_at)`: created_at is an INSERT default and the
   * ingest upserts, so a healthy calendar whose rows were all first seen days
   * ago would read stale and refuse every market.
   */
  hasFutureEvents: boolean;
  nowMs: number;
  /** Null when the read itself failed, as opposed to returning nothing. */
  rows: NewsEventRow[] | null;
  symbol: string;
}): NewsContextResult {
  const window = newsWindow(input.nowMs);

  if (input.rows === null) {
    return {
      active: [],
      blocking: [],
      calendarSource: "unavailable",
      headlineCount: 0,
      penaltyUnits: 0,
      unavailableReason: "The economic calendar could not be read.",
      upcoming: [],
    };
  }

  const relevant = input.rows.filter((event) => isNewsRelevant(input.symbol, event));
  const active = relevant.filter((event) =>
    event.event_type !== "headline" &&
    typeof event.scheduled_at === "string" &&
    event.scheduled_at >= window.activeStart &&
    event.scheduled_at <= window.activeEnd
  );
  const upcoming = relevant.filter((event) =>
    typeof event.scheduled_at === "string" &&
    (event.event_type === "headline"
      ? event.scheduled_at >= window.headlineStart &&
        event.scheduled_at <= window.now
      : event.scheduled_at > window.activeEnd &&
        event.scheduled_at <= window.upcomingEnd)
  );

  // Coverage is judged on the TABLE, not on this symbol's slice. A market with
  // no events of its own is an ordinary quiet market; a table with no future
  // events at all is an ingest that stopped, and only the second one makes a
  // zero-row window meaningless.
  const calendarSource: CalendarSource = input.hasFutureEvents ? "read" : "stale";

  return {
    active,
    blocking: active.filter(isBlockingNewsEvent),
    calendarSource,
    headlineCount: upcoming.filter((event) => event.event_type === "headline").length,
    penaltyUnits: calculateNewsPenaltyUnits(active, upcoming),
    unavailableReason: calendarSource === "read"
      ? null
      : "The economic calendar holds no upcoming events, so this review could not check news.",
    upcoming,
  };
}
