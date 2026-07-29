// Shared news-risk rules used by the live analyzer and the replay harness,
// so scheduled-event blocking and penalties behave identically in both.

export type NewsRiskEvent = {
  event_type?: "scheduled" | "earnings" | "headline";
  impact?: string;
};

// The active window brackets a scheduled release: entries are unsafe from
// shortly before the print through the immediate reaction.
export const NEWS_ACTIVE_BEFORE_MS = 10 * 60 * 1000;
export const NEWS_ACTIVE_AFTER_MS = 20 * 60 * 1000;
export const NEWS_UPCOMING_HORIZON_MS = 6 * 60 * 60 * 1000;

export function isBlockingNewsEvent(event: NewsRiskEvent) {
  return event.event_type !== "headline" && event.impact === "high";
}

export function calculateNewsPenaltyUnits(
  active: NewsRiskEvent[],
  upcoming: NewsRiskEvent[],
) {
  const nonBlockingActive = active.filter((event) =>
    !isBlockingNewsEvent(event)
  );
  const weightedEvents = [...nonBlockingActive, ...upcoming];

  return weightedEvents.reduce((sum, event) => {
    if (event.event_type === "headline") {
      return sum + (event.impact === "high" ? 0.5 : 0.25);
    }
    return sum + (event.impact === "high" ? 1 : 0.5);
  }, 0);
}
