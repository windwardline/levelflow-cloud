import type { TradeSetupRow } from "./tradeAnalyzer";
import { entryHasFilled } from "./tradeState";

export type SetupOutcome =
  | "closed_manually"
  | "entry_not_filled"
  | "expired_in_loss"
  | "expired_in_profit"
  | "partial_target"
  | "stopped_out"
  | "still_tracking"
  | "target_reached"
  | "unclear_path";

// §17d (owner-approved verbatim, 2026-07-31) fixes the seven words every
// result renders, and supersedes §17b's table: Pending / Open · ±R /
// Unfilled / Banked half · +R / Banked full · +R / Stopped · −R /
// Expired · ±R. Every label below re-derives from that set, so this record and
// the ledger's own formatter (historyUtils' formatInsightsResult) speak one
// vocabulary instead of two phrasings of the same fact. Both expiry buckets
// carry the same one word: the R value beside it is what says where price
// stood, which is also why one "Expired" filter option covers them both.
//
// Two words complete the table beyond §17d's seven (controller rulings, wave 4,
// disclosed at re-present). §17d's own constraint holds for both: this is label
// copy, and classifyWinLoss is untouched.
//   Unclear — the ambiguous bucket. It read "Needs review" until wave 4, which
//     was a result phrased as an instruction and collided with the stage's own
//     Review action. One word for one fact: the chart cannot say which level
//     came first.
//   Closed — the manual_close enum value. Unreachable (the engine writes none)
//     but a result column must have a word for every value the enum can hand
//     it, and inventing a direction for a manual close is the one thing it must
//     not do.
export const OUTCOME_COPY: Record<
  SetupOutcome,
  {
    description: string;
    filterLabel: string;
    label: string;
    shortLabel: string;
  }
> = {
  // §17b (owner ruling, 2026-07-31): the tracking phrase this bucket used to
  // carry was an extra word for two states that already had names, and its
  // short form was a label of the same shape; both are now banned outright
  // (tests/languageGuard.test.ts — which scans quoted text wherever it
  // appears, so neither may be quoted even here). This bucket is not one
  // state — it spans both unresolved ones — so every one of its labels names
  // exactly those two, which is also what makes it correct as the filter
  // option that selects them together. No surface renders the label or
  // shortLabel today: historyUtils' formatInsightsResult routes an unresolved
  // row through the state machine's own word (Pending / Open · ±R) instead,
  // and the only remaining reader is the group-by-status heading, where a
  // bucket spanning both states is exactly what the heading describes.
  still_tracking: {
    description: "The setup is still pending or open — it does not have a final result yet.",
    filterLabel: "Pending & open",
    label: "Pending & open",
    shortLabel: "Pending & open",
  },
  target_reached: {
    description: "The limit entry filled and price later reached the target before the stop.",
    filterLabel: "Banked full",
    label: "Banked full",
    shortLabel: "Banked full",
  },
  // Also the bucket the engine's `breakeven` outcome normalizes into: a stop
  // sitting at the entry price is only ever a stop that was MOVED there, which
  // the ladder does at Target 1 and nowhere else — so a breakeven close is the
  // banked-half case seen from its ending rather than a result of its own. The
  // description says so plainly instead of leaving "breakeven" to be read as a
  // flat trade.
  partial_target: {
    description: "The first target was reached and half was banked; the rest closed at the entry price, or when the review window ended, without reaching the second target.",
    filterLabel: "Banked half",
    label: "Banked half",
    shortLabel: "Banked half",
  },
  expired_in_profit: {
    description: "The entry filled and the review window ended with price in profit, without reaching target or stop.",
    filterLabel: "Expired",
    label: "Expired",
    shortLabel: "Expired",
  },
  expired_in_loss: {
    description: "The entry filled and the review window ended with price at a loss, without reaching target or stop.",
    filterLabel: "Expired",
    label: "Expired",
    shortLabel: "Expired",
  },
  stopped_out: {
    description: "The limit entry filled and price later reached the stop before the target.",
    filterLabel: "Stopped",
    label: "Stopped",
    shortLabel: "Stopped",
  },
  unclear_path: {
    description: "The entry filled, but the available chart cannot confirm whether stop or target came first.",
    filterLabel: "Unclear",
    label: "Unclear",
    shortLabel: "Unclear",
  },
  entry_not_filled: {
    description: "The limit entry did not fill before the review window ended or the setup was no longer valid.",
    filterLabel: "Unfilled",
    label: "Unfilled",
    shortLabel: "Unfilled",
  },
  closed_manually: {
    description: "The position was closed by hand, before the stop or either target was reached.",
    filterLabel: "Closed",
    label: "Closed",
    shortLabel: "Closed",
  },
};

export function normalizeSetupOutcome(setup: Pick<TradeSetupRow, "status" | "trade_outcomes">): SetupOutcome {
  const outcome = setup.trade_outcomes?.[0]?.outcome;

  if (outcome === "take_profit") {
    return "target_reached";
  }
  if (outcome === "tp1_partial") {
    return "partial_target";
  }
  if (outcome === "expired_in_profit") {
    return "expired_in_profit";
  }
  if (outcome === "expired_at_loss") {
    return "expired_in_loss";
  }
  if (outcome === "stop_loss") {
    return "stopped_out";
  }
  // Both of these are unreachable today — the engine writes neither, they exist
  // only in supabase/init.sql's enum — and both used to fall through to the
  // unresolved bucket, where a resolved row would have read as still open. They
  // now land on the buckets whose words are actually true of them (see
  // OUTCOME_COPY's header).
  if (outcome === "breakeven") {
    return "partial_target";
  }
  if (outcome === "manual_close") {
    return "closed_manually";
  }
  if (outcome === "ambiguous") {
    return "unclear_path";
  }
  // The bare "expired" outcome is the third unreachable enum value, and the one
  // this header used to skip (Q2-M3). It is legacy-only — the engine's
  // ResolvedOutcome union omits it — and it says the window closed without saying
  // whether the entry ever filled. "Unfilled" asserts that it did not, so a
  // filled row carrying it would have read a market fact that never happened.
  // Routed by the same fill evidence the rail uses, and where the position was
  // live, "Unclear" is the honest word: the row ended and nothing recorded says
  // where price stood. classifyWinLoss scores it neither way, which is the only
  // safe answer on no evidence.
  if (outcome === "expired" && entryHasFilled(setup)) {
    return "unclear_path";
  }
  if (outcome === "unfilled" || outcome === "expired" || setup.status === "expired" || setup.status === "invalidated") {
    return "entry_not_filled";
  }

  return "still_tracking";
}

export type WinLossClass = "loss" | "neither" | "win";

// Single source of truth for the ladder's money-positive/negative split —
// previously duplicated between useTradeSetups.ts's buildStats and
// historyUtils.ts's buildRecordBand, which could silently drift apart on a
// future outcome-taxonomy change. A win is any money-positive resolution
// (full target, banked TP1, or a profitable expiry); a loss is any
// money-negative one. Every other outcome affects neither side of a win/loss
// ratio: unresolved, entry not filled, an unclear path, and a manual close —
// which records where a position ended but not which level it was heading for.
export function classifyWinLoss(outcome: SetupOutcome): WinLossClass {
  if (
    outcome === "target_reached" || outcome === "partial_target" ||
    outcome === "expired_in_profit"
  ) {
    return "win";
  }
  if (outcome === "stopped_out" || outcome === "expired_in_loss") {
    return "loss";
  }
  return "neither";
}
