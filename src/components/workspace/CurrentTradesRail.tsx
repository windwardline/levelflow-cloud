import { useEffect, useState } from "react";
import { deriveTradeState, type TradeState } from "../../lib/tradeState";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";
import { formatNumber } from "./advisorFormat";

export type CurrentTradesRailProps = {
  // True exactly when this rail is the active mobile sub-view (spec §3's
  // "Trades" tab, i.e. AdvisorWorkspace's mobileView === "trades").
  // Irrelevant at >=lg, where the rail is always visible regardless of
  // mobileView. Used solely to re-stamp lastRefreshedAt the moment this
  // surface is newly shown on mobile (I2) — App.tsx's own force-refresh
  // effect is what actually re-fetches the data this rail renders; this
  // only keeps the "as of" display honest about when that last happened.
  isActiveOnMobile: boolean;
  // The rail's own clock for computing state/age at render time — passed in
  // (AdvisorWorkspace's existing 60s clockNow tick) rather than started
  // here, so this component adds no timer of its own.
  now: Date;
  // Bound to the existing useTradeSetups forceOutcomeRefresh path
  // (App.tsx), never new fetch machinery of this component's own.
  onRefresh: () => void;
  setups: TradeSetupRow[];
};

type TradeCard = {
  setup: TradeSetupRow;
  state: TradeState;
};

// Exported for direct unit testing (no jsdom in this repo's stack — see
// tests/confidenceUnit.test.tsx's header comment for the established
// approach of exercising pure logic directly rather than rendering).
export function buildTradeCards(
  setups: TradeSetupRow[],
  now: Date,
): TradeCard[] {
  const cards: TradeCard[] = [];
  for (const setup of setups) {
    const state = deriveTradeState(setup, now);
    if (state) {
      cards.push({ setup, state });
    }
  }
  return cards;
}

// The mobile tab bar's Trades badge (spec §3: "badge = current-trade
// count", App.tsx) — the exact same live/pending filter this rail itself
// renders, so the badge can never disagree with what the Trades tab
// actually shows. Lives here rather than in App.tsx so it stays importable
// in this repo's jsdom-free unit-test stack: App.tsx's own module-level
// TABS array embeds JSX that evaluates eagerly on import (unlike a
// component function's JSX, which only runs once called), and several of
// its other imports reach Vite-only globals (import.meta.env) with no
// meaning under plain `tsx --test` — importing App.tsx directly always
// throws in this harness, whereas this file already proves safe to import
// (see tests/currentTradesRail.test.tsx). `now` only affects the age/
// progress text inside each derived state, never whether a setup counts at
// all, so this needs no ticking clock of its own.
export function currentTradeBadgeCount(
  setups: TradeSetupRow[],
  now: Date,
): number {
  return buildTradeCards(setups, now).length;
}

export function formatProgressR(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}R`;
}

export function formatAsOf(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

// The remaining ladder levels still relevant to watch, mono in the card
// (spec §8). A level drops off once it's behind the trade: Entry once
// filled, Target 1 once its bank-half instruction has already fired
// (state.tp1Banked — see tradeState.ts's TP1-hit branch).
export function buildRemainingLevels(
  setup: TradeSetupRow,
  state: TradeState,
): Array<{ label: string; value: string }> {
  const levels: Array<{ label: string; value: string }> = [];

  if (state.status === "pending") {
    levels.push({ label: "Entry", value: formatLevel(setup.limit_entry) });
  }

  levels.push({ label: "Stop", value: formatLevel(setup.stop_loss) });

  const hasLadder = Number.isFinite(Number(setup.take_profit_1)) &&
    Number(setup.take_profit_1) > 0;
  if (hasLadder && !state.tp1Banked) {
    levels.push({
      label: "Target 1",
      value: formatLevel(setup.take_profit_1),
    });
  }

  levels.push({
    label: hasLadder ? "Target 2" : "Target",
    value: formatLevel(setup.take_profit),
  });

  return levels;
}

function formatLevel(value: number | string | null | undefined): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatNumber(numeric) : "—";
}

export function CurrentTradesRail(
  { isActiveOnMobile, now, onRefresh, setups }: CurrentTradesRailProps,
) {
  // Captured once per mount, not re-derived from the ticking `now` prop:
  // AdvisorWorkspace (and this rail with it) fully unmounts and remounts on
  // every Desk tab switch, so this naturally re-baselines on every surface
  // show without a mount effect of its own duplicating the force-refresh
  // App.tsx already triggers on tab activation.
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => now);
  const cards = buildTradeCards(setups, now);

  // I2: on mobile, switching the bottom tab bar to Trades never remounts
  // this component (deskColumnClassName's whole point is a CSS-only toggle
  // that preserves AdvisorWorkspace's state across Review/Scan/Trades), so
  // the mount-time baseline above never re-fires for that transition on its
  // own. App.tsx pairs this with its own effect that actually re-fetches
  // outcome data the moment mobileView becomes "trades" — this only keeps
  // the "as of" stamp from silently going stale relative to that real
  // refresh. Guarded to the true (became-visible) transition only: flipping
  // away sets nothing, so leaving and returning still reads as a fresh show
  // rather than a stale one.
  useEffect(() => {
    if (isActiveOnMobile) {
      setLastRefreshedAt(new Date());
    }
  }, [isActiveOnMobile]);

  function handleRefresh() {
    setLastRefreshedAt(new Date());
    onRefresh();
  }

  return (
    <section className="terminal-panel p-4" data-testid="current-trades-rail">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-normal text-ink">
          Current trades
        </h3>
        <p className="text-xs text-ink-muted">
          as of {formatAsOf(lastRefreshedAt)} ·{" "}
          <button
            className="tertiary-link"
            type="button"
            onClick={handleRefresh}
          >
            refresh
          </button>
        </p>
      </div>

      {cards.length === 0
        ? <p className="text-sm leading-6 text-ink-muted">No current trades.</p>
        : (
          <div className="grid gap-2.5">
            {cards.map(({ setup, state }) => (
              <TradeStateCard key={setup.id} setup={setup} state={state} />
            ))}
          </div>
        )}
    </section>
  );
}

function TradeStateCard({
  setup,
  state,
}: {
  setup: TradeSetupRow;
  state: TradeState;
}) {
  const isBuy = setup.side === "buy";
  const isPending = state.status === "pending";
  const levels = buildRemainingLevels(setup, state);

  return (
    <article className="min-w-0 rounded-lg border border-hairline bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h4 className="truncate text-base font-semibold text-ink">
            {setup.symbol}
          </h4>
          <span className={`chip ${isBuy ? "text-buy" : "text-sell"}`}>
            {isBuy ? "Buy" : "Sell"}
          </span>
          <span className={`chip ${isPending ? "text-caution" : "text-buy"}`}>
            {isPending ? "Pending" : "Open"}
          </span>
        </div>
        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">
          {formatProgressR(state.progressR)}
        </p>
      </div>

      <p className="mt-2 text-sm leading-5 text-ink-muted">
        {state.instruction}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
        {levels.map((level) => (
          <div
            key={level.label}
            className="flex items-center justify-between gap-2 rounded-md bg-sheet px-2 py-1.5"
          >
            <span className="text-ink-muted">{level.label}</span>
            <span className="font-mono font-semibold tabular-nums text-ink">
              {level.value}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
