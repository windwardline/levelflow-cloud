import { useEffect, useState } from "react";
import { isDisplayExcluded } from "../../lib/broker/offsets";
import { formatClockTime } from "../../lib/marketHours";
import { deriveTradeState, type TradeState } from "../../lib/tradeState";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../mobileFrame";
import { formatNumber } from "./advisorFormat";
import {
  compareSetupsByConfidence,
  HISTORY_LOAD_FAILED_COPY,
  formatSignedR,
} from "./historyUtils";
import { useWorkspaceNav } from "./WorkspaceNav";

type CurrentTradesRailProps = {
  // True when this rail is the mobile Trades surface rather than the ≥lg Desk's
  // right column (spec §17g): the head pins, the cards list scrolls inside the
  // fixed frame, and the surface owns its own gutters. Off at ≥lg, where the
  // column itself scrolls and the rail is one flat run of content in it.
  fixedFrame?: boolean;
  // True exactly when this rail is the active mobile sub-view (spec §3's
  // "Trades" tab, i.e. AdvisorWorkspace's mobileView === "trades").
  // Irrelevant at >=lg, where the rail is always visible regardless of
  // mobileView. Used solely to re-stamp lastRefreshedAt the moment this
  // surface is newly shown on mobile (I2) — App.tsx's own force-refresh
  // effect is what actually re-fetches the data this rail renders; this
  // only keeps the "as of" display honest about when that last happened.
  isActiveOnMobile: boolean;
  // Q2-C2: the history fetch failed, so no cards means unknown rather than none.
  loadFailed: boolean;
  // The rail's own clock for computing state/age at render time — passed in
  // (AdvisorWorkspace's existing 60s clockNow tick) rather than started
  // here, so this component adds no timer of its own.
  now: Date;
  // Bound to the existing useTradeSetups forceOutcomeRefresh path
  // (App.tsx), never new fetch machinery of this component's own.
  onRefresh: () => void;
  // The market the stage is showing, so the matching card reads as selected —
  // the same presentation-only contract MarketScanPanel's own rows have. The
  // rail never drives selection from this; it reflects it.
  selectedSymbol: string;
  setups: TradeSetupRow[];
};

type TradeCard = {
  setup: TradeSetupRow;
  state: TradeState;
  // Amendment 23's offset ruling (owner, 2026-08-05), fix round 1: the card
  // is a record and renders unconditionally — this only ever governs whether
  // it renders AS THE AFFORDANCE (a clickable <button>) or as a plain,
  // non-interactive read of the same fields. false for a display-excluded
  // symbol (BRENT today), which "leaves every user-visible surface...
  // chart selection" per the ruling — reopening one would defeat that.
  reopenable: boolean;
};

// Which state group a card belongs to, and the order the groups read in.
//
// Adjudication (owner finding 1, 2026-08-02): spec §8 names the two statuses
// that live on this surface — Pending and Open — but rules nothing about their
// order, and the durable sort law (spec §4) governs sorting, not grouping. So
// this rail takes the same shape the Insights ledger has: groups, with the
// durable sort inside each one. Open leads, because a filled position is the one
// that can move against the reader while they read it; a pending order cannot.
// A weak Open therefore still sits above a strong Pending.
const STATE_GROUP_ORDER: Record<TradeState["status"], number> = {
  open: 0,
  pending: 1,
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
      cards.push({ reopenable: !isDisplayExcluded(setup.symbol), setup, state });
    }
  }
  // The durable sort law (spec §4: "results are sorted by confidence for
  // deciding"), applied to this surface for the first time — it rendered the
  // fetch's own created_at-descending order until the owner's 2026-08-02
  // finding. `cards` is this function's own array, so sorting it in place
  // reorders nothing the caller handed over.
  return cards.sort((first, second) =>
    STATE_GROUP_ORDER[first.state.status] -
      STATE_GROUP_ORDER[second.state.status] ||
    compareSetupsByConfidence(first.setup, second.setup)
  );
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
  {
    fixedFrame = false,
    isActiveOnMobile,
    loadFailed,
    now,
    onRefresh,
    selectedSymbol,
    setups,
  }: CurrentTradesRailProps,
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

  // I2: on mobile, switching the bottom tab bar to Trades never remounts this
  // component — AdvisorWorkspace keeps both of its <lg surfaces mounted and
  // toggles them by display, deliberately, so the Scan surface's chart canvas and
  // state survive the trip (DeskMobileView is "scan" | "trades"; the Review
  // sub-view §17m.1 deleted is not a third). So the mount-time baseline above
  // never re-fires for that transition on its own. App.tsx pairs this with its own effect that actually re-fetches
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

  // The rail's two pieces, built once and placed by whichever composition is
  // rendering: at ≥lg one after the other in a flat column, below lg the first
  // pinned and the second scrolling (spec §17g). Held as values rather than
  // duplicated per branch so the head's own class list — which carries §17c's
  // ≥lg baseline rhythm and fix wave 2C's mobile page-head treatment — exists
  // exactly once.
  const head = (
    <>
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
        <h3 className="eyebrow max-lg:font-display max-lg:text-[19px] max-lg:font-bold max-lg:normal-case max-lg:tracking-[-0.02em] max-lg:text-ink">
          Current trades
        </h3>
        <p className="text-xs text-ink-muted">
          as of {formatClockTime(lastRefreshedAt)} ·{" "}
          <button
            className="tertiary-link"
            type="button"
            onClick={handleRefresh}
          >
            refresh
          </button>
        </p>
      </div>
    </>
  );

  const body = (
    <>
      {cards.length === 0
        ? (
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {loadFailed ? HISTORY_LOAD_FAILED_COPY : "No current trades."}
          </p>
        )
        : (
          <div className="mt-2.5 grid gap-2.5">
            {cards.map(({ reopenable, setup, state }) => (
              <TradeStateCard
                key={setup.id}
                reopenable={reopenable}
                selected={setup.symbol === selectedSymbol}
                setup={setup}
                state={state}
              />
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
    </>
  );

  if (fixedFrame) {
    // Spec §17g, the mobile Trades surface: the head pins, the cards list is the
    // scroll region, and the closing link travels with the cards it closes —
    // pinning it would put an exit above content the reader has not reached yet.
    // The testid stays on the outer element, where every e2e locator and the
    // visual-proof capture already look for it.
    return (
      <section className={MOBILE_FRAME} data-testid="current-trades-rail">
        <div className={MOBILE_FRAME_PINNED}>{head}</div>
        <div className={MOBILE_FRAME_SCROLL} data-testid="mobile-trades-scroll">
          {body}
        </div>
      </section>
    );
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
      {head}
      {body}
    </section>
  );
}

// One card per current trade — and, since the owner's 2026-08-02 ruling, the
// affordance that reopens it: "The whole point of the Current Trades section is
// to serve as a reliable reference for the trades we generate, so we need to be
// able to come back to the expanded detail view if we click on it — regardless
// of if we click on it in the scan results or in the current trades."
//
// So the card IS the button, the same way MarketScanRow's whole row is: one
// element, the reader's whole target, and the accessible name comes from what the
// card shows (symbol, side, status, progress, instruction, levels). No aria-label
// — one would REPLACE all of that with a single sentence, which is less reference
// rather than more. Nothing textual is added at all (§17f): the reader already
// knew this was their trade, and the affordance is the pointer and the focus ring.
//
// The children are spans, not the h4/p/div they were: a <button>'s content model
// is phrasing content, so block elements inside one are invalid markup. The type
// scale and rhythm are unchanged — every class the elements carried, they still
// carry.
function TradeStateCard({
  reopenable,
  selected,
  setup,
  state,
}: {
  reopenable: boolean;
  selected: boolean;
  setup: TradeSetupRow;
  state: TradeState;
}) {
  // The same consume-once cross-link Insights' rows use, carrying the whole
  // stored row: the stage restores it through the one adoption path a scan row
  // goes through (§17m.1's single door), so the chart, the ladder, the why rows
  // and the receipt all come back exactly as the scan drew them.
  const nav = useWorkspaceNav();
  const isBuy = setup.side === "buy";
  const isPending = state.status === "pending";
  const levels = buildRemainingLevels(setup, state);

  // Amendment 23's offset ruling (owner, 2026-08-05), fix round 1: a stored
  // row for a display-excluded symbol (BRENT today) is a record and stays on
  // this surface in full — every field below renders exactly as it would
  // for any other card — but the reopen affordance is what the ruling's own
  // "leaves every user-visible surface... chart selection" closes. §17c: an
  // inert control is a lie, so this is an ABSENT affordance (a plain,
  // non-interactive wrapper — no <button>, no onClick, no focus ring), never
  // a disabled one. The two branches' inner markup is identical by
  // construction; tests/currentTradesRail.test.tsx and tests/deskComposition.test.ts pin
  // the two-branch shape from both sides.
  if (!reopenable) {
    return (
      <div className="w-full min-w-0 rounded-lg border border-hairline bg-sheet px-3.5 py-3 text-left">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold text-ink">
              {setup.symbol}
            </span>
            <span className={`chip ${isBuy ? "text-buy" : "text-sell"}`}>
              {isBuy ? "Buy" : "Sell"}
            </span>
            <span className={`chip ${isPending ? "text-caution" : "text-buy"}`}>
              {isPending ? "Pending" : "Open"}
            </span>
          </span>
          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">
            {formatSignedR(state.progressR)}
          </span>
        </span>

        <span className="mt-2 block text-sm leading-5 text-ink-muted">
          {state.instruction}
        </span>

        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-xs">
          {levels.map((level) => (
            <span key={level.label} className="text-ink-muted">
              {level.label}
              <b className="block text-[13px] font-semibold tabular-nums text-ink">
                {level.value}
              </b>
            </span>
          ))}
        </span>
      </div>
    );
  }

  return (
    // `.pos` (a-desk-v3.html:60, m-trades-v1.html:12): hairline border on
    // sheet at 12/14 padding — the one card treatment the mocks draw on this
    // surface, kept now that the rail around it is flat. The selected state is
    // the scan rail's own (a-desk-v3.html:153 `.mkt.sel`): a 3px inset accent
    // edge, inset rather than a real border so the card's text never shifts by
    // 3px when selection moves — and so this surface still draws exactly one
    // box. Hover takes that row's tint for the same reason.
    <button
      className={`w-full min-w-0 rounded-lg border border-hairline bg-sheet px-3.5 py-3 text-left transition ${
        selected
          ? "shadow-[inset_3px_0_0_var(--color-accent)]"
          : "hover:bg-accent/10"
      }`}
      type="button"
      aria-current={selected}
      onClick={() => nav.openAdvisor(setup)}
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-base font-semibold text-ink">
            {setup.symbol}
          </span>
          <span className={`chip ${isBuy ? "text-buy" : "text-sell"}`}>
            {isBuy ? "Buy" : "Sell"}
          </span>
          <span className={`chip ${isPending ? "text-caution" : "text-buy"}`}>
            {isPending ? "Pending" : "Open"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">
          {formatSignedR(state.progressR)}
        </span>
      </span>

      <span className="mt-2 block text-sm leading-5 text-ink-muted">
        {state.instruction}
      </span>

      {/* `.lvls` (a-desk-v3.html:65): plain mono pairs, caption over value, no
          fill and no frame — the pills that used to sit here were a third box
          inside a card inside a panel. */}
      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-xs">
        {levels.map((level) => (
          <span key={level.label} className="text-ink-muted">
            {level.label}
            <b className="block text-[13px] font-semibold tabular-nums text-ink">
              {level.value}
            </b>
          </span>
        ))}
      </span>
    </button>
  );
}
