import { useEffect, useState } from "react";
import { deriveTradeState, type TradeState } from "../../lib/tradeState";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";
import { formatNumber } from "./advisorFormat";
import { useWorkspaceNav } from "./WorkspaceNav";

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
// filled, the bank-half target once its instruction has already fired
// (state.tp1Banked — see tradeState.ts's first-target branch).
//
// Captions are the mock's own (a-desk-v3.html:220,:226 `.lvls`, m-trades-v1
// :50,:56): SL / T1 / T2, short enough to sit as mono pairs in a 300px rail.
// Spec §16 gives copy rulings to the spec and composition to the mock; §8
// specifies only "the remaining levels in mono" for this surface, so nothing
// overrides the mock here — the ladder's own Entry / Stop / Target 1 /
// Target 2 wording (spec §7) is unchanged where it belongs, in the setup
// sheet. The two levels the mock never draws keep the words they already
// had rather than inventing an abbreviation for them.
export function buildRemainingLevels(
  setup: TradeSetupRow,
  state: TradeState,
): Array<{ label: string; value: string }> {
  const levels: Array<{ label: string; value: string }> = [];

  if (state.status === "pending") {
    levels.push({ label: "Entry", value: formatLevel(setup.limit_entry) });
  }

  levels.push({ label: "SL", value: formatLevel(setup.stop_loss) });

  const hasLadder = Number.isFinite(Number(setup.take_profit_1)) &&
    Number(setup.take_profit_1) > 0;
  if (hasLadder && !state.tp1Banked) {
    levels.push({
      label: "T1",
      value: formatLevel(setup.take_profit_1),
    });
  }

  levels.push({
    label: hasLadder ? "T2" : "Target",
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
  // The mock's closing cross-link (a-desk-v3.html:231) rides the nav context
  // that already exists — openInsights was declared on WorkspaceNav and
  // supplied by App.tsx from the start; this is simply its first call site,
  // the same consume-once flow HistoryPanel's rows use for openAdvisor.
  const nav = useWorkspaceNav();
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
    // Spec §16 / a-desk-v3.html:216-232: the column IS this surface's frame
    // (AdvisorWorkspace's aside carries the mock's left hairline and railR
    // tint), so the rail itself is plain paper — no panel of its own. Only
    // the position cards below are framed, which is the one box both mocks
    // draw here. The heading takes the same eyebrow treatment the scan rail
    // uses (:218), with the freshness stamp opposite it on one baseline row
    // (`.rrhead`, :217).
    <section className="min-w-0" data-testid="current-trades-rail">
      {/* Below lg this rail is not a rail — it is the Trades tab's whole page,
          and m-trades-v1.html:11-12,40 heads it as one: 19px display type in
          ink, sentence case (`.phead .t`). At ≥lg the heading stays the 12px
          muted eyebrow the scan rail beside it uses (a-desk-v3.html:218). The
          row itself and the stamp opposite it are the same shape in both
          mocks, so neither is platform-specific.

          Spec §17c: at ≥lg this row also takes the scan rail's own first-line
          height and centres in it, so the two eyebrows sit on one baseline and
          the column no longer opens hard against its top edge. The 44px is not
          a new measurement — it is what .primary-button already makes the scan
          rail's first line, and every Desk column starts at the same y. Below
          lg the row keeps baseline alignment: there the heading is 19px display
          type against a 12px stamp, which is exactly what baseline alignment is
          for. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 lg:min-h-11 lg:items-center">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-ink-muted max-lg:font-display max-lg:text-[19px] max-lg:font-bold max-lg:normal-case max-lg:tracking-[-0.02em] max-lg:text-ink">
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
        ? <p className="mt-2 text-sm leading-6 text-ink-muted">No current trades.</p>
        : (
          <div className="mt-2.5 grid gap-2.5">
            {cards.map(({ setup, state }) => (
              <TradeStateCard key={setup.id} setup={setup} state={state} />
            ))}
          </div>
        )}

      {/* The mock's one closing link (:231). Insights is where closed trades
          live, so this is the surface's own exit rather than a new feature. */}
      <p className="mt-4">
        <button
          className="tertiary-link"
          type="button"
          onClick={() => nav.openInsights()}
        >
          All results → Insights
        </button>
      </p>
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
    // `.pos` (a-desk-v3.html:60, m-trades-v1.html:12): hairline border on
    // sheet at 12/14 padding — the one card treatment the mocks draw on this
    // surface, kept now that the rail around it is flat.
    <article className="min-w-0 rounded-lg border border-hairline bg-sheet px-3.5 py-3">
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

      {/* `.lvls` (a-desk-v3.html:65): plain mono pairs, caption over value, no
          fill and no frame — the pills that used to sit here were a third box
          inside a card inside a panel. */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-xs">
        {levels.map((level) => (
          <span key={level.label} className="text-ink-muted">
            {level.label}
            <b className="block text-[13px] font-semibold tabular-nums text-ink">
              {level.value}
            </b>
          </span>
        ))}
      </div>
    </article>
  );
}
