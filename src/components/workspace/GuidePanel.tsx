import type { ReactNode } from "react";
import { useEffect } from "react";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../mobileFrame";
import type { GuideAnchor } from "./WorkspaceNav";

// The Guide renders docs/superpowers/specs/2026-07-30-levelflow-guide-content.md
// verbatim — that deck is owner-approved copy, and every paragraph/list/
// callout below is transcribed word-for-word from it. The only liberties
// taken are mechanical: markdown bullets become styled <li> cards, the
// "N. Title" heading prefix becomes a separate numeral badge, and §10's
// "Term — definition" bullets split into real <dt>/<dd> pairs (dropping the
// now-redundant connecting dash; every definition gets its leading word
// capitalized, since the deck writes them lowercase to continue the
// "Term —" sentence, and each now opens a standalone <dd> instead). No word
// is added, removed, or reworded. Spec §17d adds its result vocabulary to §10
// with owner-approved verbatim definition lines — see the VOCABULARY list below;
// that is the one sanctioned addition to the deck's own copy.
// The deck's own front matter (title,
// "authoritative copy" preamble, absorption map) is explicitly meta —
// instructions to the builder, not reader-facing copy — and is not
// rendered; only its numbered §1–§10 sections are.
//
// Anchor ids: the six GuideAnchor values (WorkspaceNav.tsx) are unchanged
// so every existing HowThisWorksLink call site (MarketScanPanel,
// AdvisorRecommendationPanel, SetupQualityReceipt) keeps working with zero
// changes there — only which deck section each id now decorates has moved,
// remapped onto its closest match in the new ten-section deck:
//   how-review-works  -> §1 What Levelflow does (the review process itself)
//   targets-and-stops -> §3 Taking and managing the trade (the link sits
//                         directly under this same canonical instruction on
//                         the ladder card)
//   confidence-tiers  -> §5 Confidence
//   cost-ratings      -> §6 Costs
//   replay-record     -> §7 The record
//   timeframes        -> §8 Timeframes
// The remaining four sections (the-setup, following-your-trades,
// market-hours, vocabulary) aren't linked from outside the Guide today, so
// they carry their own descriptive ids for the in-page table of contents
// only, without joining the GuideAnchor union.
//
// ONE source for all three facts about a section, keyed by the anchor id — the
// only one of the three a call site still names. <GuideSection id="…"> reads its
// own number and title back out of this map, and the index below maps the same
// entries, so each fact exists in exactly one place and the two cannot disagree.
// They used to be two independent literal lists that merely happened to agree: a
// probe showed a drifted call-site number rendering "06 Costs" in the index over
// a "09" heading with the whole suite green.
type GuideSectionMeta = { number: string; title: string };

const GUIDE_SECTIONS = {
  "how-review-works": { number: "01", title: "What Levelflow does" },
  "the-setup": { number: "02", title: "The setup, level by level" },
  "targets-and-stops": {
    number: "03",
    title: "Taking and managing the trade",
  },
  "following-your-trades": { number: "04", title: "Following your trades" },
  "confidence-tiers": { number: "05", title: "Confidence" },
  "cost-ratings": { number: "06", title: "Costs" },
  "replay-record": { number: "07", title: "The record" },
  "timeframes": { number: "08", title: "Timeframes" },
  "market-hours": { number: "09", title: "When a market is closed" },
  "vocabulary": { number: "10", title: "Glossary" },
} satisfies Record<string, GuideSectionMeta>;

// The id prop's own type, so a section id that is not in the map above is a
// compile error rather than a lookup that has to answer for a miss at runtime.
type GuideSectionId = keyof typeof GUIDE_SECTIONS;

// The result words §17d adds to this section, owner-approved verbatim: the
// ruling's own definition lines, carried here under the same mechanical
// liberties the rest of the deck already takes (leading word capitalized,
// the connecting dash dropped, a terminal period so each reads as the standalone
// sentence its siblings are). "Pending" was already the canonical teaching and
// is untouched; "Bank half" stays as the instruction it is, with the result
// word that reports it sitting directly beside it.
//
// §17d instructs this section to teach "these exact definitions … replacing/
// adding entries as needed", so the run below is §17d's own seven results in
// §17d's own order, followed by the two words the controller's wave-4 rulings
// added to complete the table (Unclear, Closed — the same two lib/outcomes.ts
// documents beyond the seven). Every word the ledger can render is taught, and
// the deck guard derives that list from the formatter itself, so a tenth word
// cannot ship untaught.
//
// "Open · ±R" and "Stopped · −R" keep §17d's R suffix in the term because that
// is how §17d writes them and how the ledger prints them; R itself is defined
// further down this same list. Unclear and Closed have no §17d line, so their
// definitions are the ones those rulings settled (lib/outcomes.ts), cut to this
// list's register — and, per §17f, each says only what the surface cannot show:
// the ledger prints one word and never why the chart was ambiguous or who closed
// the position.
const VOCABULARY: Array<{ body: string; term: string }> = [
  {
    body: "Close half your position and take that profit now.",
    term: "Bank half",
  },
  {
    body:
      "Edit the stop-loss order to the price you entered at. From there, the worst case for what remains is breaking even.",
    term: "Move your stop to your entry",
  },
  {
    body: "Your order is placed but has not filled. Nothing to do.",
    term: "Pending",
  },
  {
    body: "Filled and live inside the window (R only when the engine has one).",
    term: "Open · ±R",
  },
  {
    body: "Window closed, never triggered.",
    term: "Unfilled",
  },
  {
    body: "First target hit, half banked, window ended before Target 2.",
    term: "Banked half",
  },
  {
    body: "Target 2 reached.",
    term: "Banked full",
  },
  {
    body: "Stop hit.",
    term: "Stopped · −R",
  },
  {
    body: "Filled, window ended, neither level hit.",
    term: "Expired",
  },
  {
    body:
      "Filled, but the price history cannot say whether stop or target came first.",
    term: "Unclear",
  },
  {
    body: "Closed by hand before the stop or either target was reached.",
    term: "Closed",
  },
  {
    body:
      "What the setup pays at Target 2 measured against what it risks at the stop. A payoff of 2:1 risks one to make two.",
    term: "Payoff",
  },
  {
    body:
      "Any finished setup that ended in profit, whichever level it reached.",
    term: "Money-positive",
  },
  {
    body:
      "Profit or loss measured against what you risked. +1R means you made exactly what you were risking; −1R means the stop loss did its job.",
    term: "R",
  },
];

// Spec §7/§3, verbatim, load-bearing — the same pinned sentence
// AdvisorRecommendationPanel.tsx's ladder card and tradeState.ts's open
// pre-Target-1 state both render (and languageGuard.test.ts pins in all
// three places). Kept as one single-line constant, like those two, so a
// direct source-text `.includes()` check never has to fight JSX's
// line-wrapping whitespace collapse.
const CANONICAL_LADDER_INSTRUCTION =
  "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — profit locked either way.";

type GuidePanelProps = {
  // A How this works link elsewhere in the app asked for one section of the
  // Guide. Applied once per request, then handed back: the panel unmounts
  // whenever its tab isn't active, so an unconsumed anchor would still be
  // sitting here on the next mount and would yank a reader who opened the
  // Guide from the tab bar down to a section they never asked for — the same
  // stale-remount shape openRequest and initialSymbol both had.
  anchor?: GuideAnchor | null;
  onAnchorHandled?: () => void;
};

export function GuidePanel({ anchor, onAnchorHandled }: GuidePanelProps) {
  useEffect(() => {
    if (!anchor) {
      return;
    }

    // The section exists as soon as this effect runs, but its offset does
    // not settle until the browser has laid the panel out; scrolling on the
    // next frame lands on the real position instead of a pre-layout one.
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
      onAnchorHandled?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchor, onAnchorHandled]);

  // Which composition this surface is (spec §17g): below lg a fixed-viewport
  // frame — the title pinned, the article scrolling inside it — and at ≥lg the
  // two-column editorial page g-guide-v1.html draws, unchanged. The deck is a
  // component rather than a second copy of itself, so the words exist once no
  // matter which branch renders them.
  const isMobile = useIsMobileViewport();

  // Fix wave 2B, FIX 7 (A5-C1): the un-approved subtitle that used to sit under
  // this h1 narrated the page's own shape and section count in prose — the
  // visible TOC already shows that, and the count was hardcoded against
  // GUIDE_SECTIONS.length with nothing to keep them in sync. Deleted outright,
  // no replacement copy.
  //
  // §17n: below lg the title takes the mobile page head every <lg surface draws —
  // 19px on a 24px line, 8px of pad under the rule — which is m-trades-v1.html's
  // own head, already shipping in CurrentTradesRail. Measured at 375x812: 64px of
  // pinned chrome becomes 46px, and the article, this surface's whole reason,
  // gains all 18px. The ≥lg page keeps the mock's 30px.
  const title = (
    <h1 className="border-b-2 border-ink pb-3.5 text-3xl font-semibold tracking-normal text-ink max-lg:pb-2 max-lg:text-[19px] max-lg:leading-6">
      How to use Levelflow
    </h1>
  );

  if (isMobile) {
    // Spec §17g: "Guide and Donate (avatar-menu surfaces): pinned title, body
    // scrolls internally." No TOC below lg — §16 already had mobile reading the
    // article straight through, so the frame's pinned block is the title alone.
    return (
      <div className={MOBILE_FRAME}>
        <div className={MOBILE_FRAME_PINNED}>{title}</div>
        <div className={MOBILE_FRAME_SCROLL} data-testid="mobile-guide-scroll">
          <article className="min-w-0">
            <GuideDeck />
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1020px] gap-9 lg:grid-cols-[230px_1fr] lg:items-start">
      <GuideToc />

      {/* Spec §17i: the numbered article is the whole page now. The closing
          Support block §17 placement (b) put here is DELETED — with the footer in
          the frame on every surface, an email-and-donate block at the end of the
          article was a second home for two links that already sit, always visible,
          twenty pixels below it. The ten numbered sections are what the Guide is,
          which is also what the TOC has always indexed. */}
      <div className="min-w-0">
        <article className="min-w-0">
          {title}

          <GuideDeck />
        </article>
      </div>
    </div>
  );
}

// The owner-approved deck, verbatim: ten numbered sections and nothing else.
// Prop-free by nature — every word here is fixed copy — so it is a component
// rather than a value built inside GuidePanel, and both compositions render the
// same one (spec §17g).
function GuideDeck() {
  return (
    <>
      <GuideSection id="how-review-works">
        <p>
          Levelflow reviews a market and gives you one answer: the
          strongest current setup, or nothing. When the evidence is not
          there, "nothing" is the honest result — a stale setup is
          cleared, not left on screen.
        </p>
        <p>
          Every review checks the same things: direction, where price
          sits, how much the market is moving, the trading session,
          scheduled news, interest rates, closely linked markets, and how
          setups like this one actually ended in the past. If two linked
          markets qualify at the same moment, Levelflow keeps the
          stronger one.
        </p>
        <p>
          When a setup qualifies, everything you need sits together
          before you act: the side, all four prices, the confidence
          score, and the reason in plain words.
        </p>
        <p>
          Levelflow reviews markets. It does not place trades. You take
          every trade yourself, on your own platform, and everything
          here is built around making those few clicks precise.
        </p>
      </GuideSection>

      <GuideSection id="the-setup">
        <p>A setup is four prices, named the way your platform names them:</p>
        <ul className="grid list-disc gap-2 ps-5">
          <li>
            <strong className="text-ink">Entry</strong> — where your limit
            order waits. A buy limit waits below the current price; a
            sell limit waits above it. Levelflow only ever suggests limit
            orders — never market or stop entries.
          </li>
          <li>
            <strong className="text-ink">Stop loss</strong> — the price
            that says the setup was wrong. Levelflow places it past the
            surrounding price structure with a volatility buffer, never
            at a round number.
          </li>
          <li>
            <strong className="text-ink">Target 1 · bank half</strong> —
            the first profit level. When price reaches it, you act (see
            §3).
          </li>
          <li>
            <strong className="text-ink">Target 2 · take-profit</strong>
            {" "}— the level your take-profit order sits at. It is chosen
            from price structure and what this market can actually reach
            in the setup's window.
          </li>
        </ul>
        <p>
          Each value on the Desk copies individually — tap it, paste it
          into the matching field on your platform.
        </p>
      </GuideSection>

      <GuideSection id="targets-and-stops">
        <blockquote className="border-l-[3px] border-accent bg-accent/5 py-3 pl-4 pr-4 text-base font-semibold leading-7 text-ink sm:text-lg">
          {CANONICAL_LADDER_INSTRUCTION}
        </blockquote>
        <p>In platform terms, that is four moments:</p>
        <ol className="grid list-decimal gap-2 ps-5">
          <li>
            <strong className="text-ink">Place the trade.</strong> Open a
            buy or sell limit at the Entry price. Set the stop loss and
            set the take-profit at Target 2. Until price reaches your
            entry, the order shows as{" "}
            <strong className="text-ink">pending</strong> — nothing to do.
          </li>
          <li>
            <strong className="text-ink">Target 1 hits.</strong> Close
            half the position (a partial close), and modify the stop
            loss to your entry price. Half your profit is real money
            now, and the rest risks only the spread.
          </li>
          <li>
            <strong className="text-ink">The finish.</strong> The
            remaining half either reaches Target 2 — your take-profit
            closes it — or comes back to your entry and closes flat.
            Profit either way on the second half.
          </li>
          <li>
            <strong className="text-ink">The stop hits first.</strong>{" "}
            The trade closes for a full loss of what you risked. This is
            the common case the payoff is built to outweigh, not a
            failure of the setup.
          </li>
        </ol>
        <p>
          Your platform will not do step 2 for you. Levelflow keeps the
          levels on screen in Current trades so the two moves take
          seconds.
        </p>
      </GuideSection>

      <GuideSection id="following-your-trades">
        <p>
          Current trades shows every trade that still needs you —{" "}
          <strong className="text-ink">pending</strong> (order placed,
          not filled) or <strong className="text-ink">open</strong>{" "}
          (filled, live) — with the step to take right now, computed from
          where the trade actually is when you look. When a trade
          finishes, it leaves Current trades; Insights keeps the
          complete record, including setups you never took. That record
          is yours, per broker, and it is how you judge Levelflow on
          results rather than promises.
        </p>
      </GuideSection>

      <GuideSection id="confidence-tiers">
        <p>
          Every setup carries a score out of 100. It is not a mood — it
          is the engine's estimate of setup strength, and each market
          type must clear its own qualifying bar before a setup is shown
          at all. The bar differs by market because the evidence differs
          by market: where history proves the score separates strong
          setups from weak ones, the bar is high and the number means
          more; where history shows setups succeed at similar rates
          across scores, the bar is set to let the record speak instead.
          And where a market&apos;s sample is still too thin to prove
          either, the bar simply holds where it stands until the
          evidence arrives. The meter under the score shows the bar, so
          you always know how much room a setup cleared it by.
        </p>
      </GuideSection>

      <GuideSection id="cost-ratings">
        <p>
          Spread is the gap between buying and selling price on your
          platform, and it is paid out of your profit. Levelflow sizes
          it against the setup before showing anything:
        </p>
        <ul className="grid list-disc gap-2 ps-5">
          <li>
            <strong className="text-ink">Clean</strong> — costs are
            small next to the distance between entry and stop. The
            payoff survives intact.
          </li>
          <li>
            <strong className="text-ink">Acceptable</strong> — costs
            take a visible bite. The payoff still holds up.
          </li>
          <li>
            <strong className="text-ink">Thin</strong> — costs take a
            meaningful share. Usually worth waiting for a better spread.
          </li>
        </ul>
        <p>
          When costs eat too much of the payoff, the setup is not shown
          at all.
        </p>
      </GuideSection>

      <GuideSection id="replay-record">
        <p>
          Levelflow's history claims are measured, not promised. Every
          market type's record comes from replaying its full available
          price history — for the major currency pairs, more than a
          decade — and counting setups the way a trade actually pays:
          take-profit reached, half banked at Target 1, or a finish that
          closed in profit. Any finish that ended in profit counts as
          {" "}<strong className="text-ink">money-positive</strong>; every
          other finish counts against the record. The replay fills an
          order whenever price touches the level and deducts no spread,
          so every figure is before costs — a ceiling, not a forecast.
        </p>
        <p>
          A market's record does not gate the scan. Read it and size
          accordingly.
        </p>
        <p>
          Finished setups across all of Levelflow feed back into future
          reviews, so the product learns from the whole record, not one
          person at a time.
        </p>
      </GuideSection>

      <GuideSection id="timeframes">
        <p>
          {/* Q1-#27: all six, because the chart-view select offers all six
              (marketData.ts's CHART_TIMEFRAME_OPTIONS). The deck named four and
              described 1M/5M as engine-only validation intervals, which they are
              — and they are also pickable views, so a reader who picked one found
              the Guide describing a menu the app does not have. */}
          The chart view you pick — 1 minute, 5 minutes, 15 minutes, 1
          hour, 4 hours, 1 day, the same intervals you know from
          TradingView — controls what you see, not what Levelflow checks. Every review reads the
          4-hour, 1-hour, and 15-minute charts together for direction,
          location, and quality, then validates the latest price on the
          5-minute and 1-minute charts when they are available. The
          1-hour default is a balanced place to read a setup.
        </p>
      </GuideSection>

      <GuideSection id="market-hours">
        <p>
          Grey in the scan menu means closed. The label on the row tells
          you exactly when it opens next — "OPENS 5:00P SUN" — in your
          own local time. Most markets close for the weekend and reopen
          Sunday afternoon or evening; crypto never closes. Scans skip
          closed markets automatically, and the scanned count only ever
          counts markets that were actually checked.
        </p>
      </GuideSection>

      <GuideSection id="vocabulary">
        <dl className="grid gap-3">
          {VOCABULARY.map((item) => (
            <div key={item.term}>
              <dt className="font-semibold text-ink">{item.term}</dt>
              <dd className="mt-1">{item.body}</dd>
            </div>
          ))}
        </dl>
      </GuideSection>
    </>
  );
}


// Spec §16: the TOC is composition chrome, not part of the deck's own copy —
// it exists below lg not at all (mobile reads the article straight through)
// and above lg as a sticky index down the left rail. "Contents" (not the
// mock's literal "Guide" eyebrow text) avoids repeating the masthead's own
// already-active "Guide" nav label immediately beside it.
//
// Spec §17c, two rulings:
//
// 1. Every entry carries its section's own two-digit number, so the index and
//    the article read as one numbered document. The numbers come from
//    GUIDE_SECTIONS, and so do the article's: each <GuideSection> names only its
//    id and reads its number and title back out of that same map, so there is
//    one literal per fact and nothing left for the two to disagree about.
//
// 2. `top-0` is the TOC's own natural resting offset, not a chosen value — and
//    §17i re-measured it. While the document scrolled, the rail rested 89px down
//    the viewport (a 69px masthead plus the page wrapper's sm:pt-5) and had to
//    pin at 89 or it hopped. The frame moved the scroll out of the document and
//    into App.tsx's content region, and a sticky offset is measured against that
//    region rather than the viewport — against its CONTENT box, measured in
//    Chromium against the built CSS at 1280 and 1440: the region's own 20px top
//    padding is already outside the rect the offset is applied to. So the rail's
//    resting offset inside that rect is zero, and any positive offset is a gap.
//    At `top-5` the rail measured y=109 against an h1 at y=89 — no hop, but 20px
//    of unfinished margin above it, which is the same misalignment §17c's own
//    ruling is about; at `top-0` both sit at 89 and it neither moves nor
//    misaligns. tests/surfaceComposition.test.ts pins the pairing (a zero offset
//    beside a region that carries the padding), so restoring either half alone
//    fails there.
// Q1-#25: no props. `sections: typeof GUIDE_SECTIONS` admitted exactly one value,
// and the module constant is in scope — a parameter that can only ever be handed
// the thing it is already standing next to.
function GuideToc() {
  return (
    <nav
      aria-label="Guide sections"
      className="hidden lg:block sticky top-0 self-start border-r border-hairline pr-5"
    >
      <p className="eyebrow mb-2">
        Contents
      </p>
      <div className="grid gap-1">
        {Object.entries(GUIDE_SECTIONS).map(([id, section]) => (
          <a
            key={id}
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-ink-muted transition hover:bg-accent/10 hover:text-ink"
            href={`#${id}`}
          >
            {/* The number at the article's own eyebrow size, so the index reads
                as an index rather than as two competing labels. */}
            <span className="shrink-0 text-xs tabular-nums">
              {section.number}
            </span>
            {section.title}
          </a>
        ))}
      </div>
    </nav>
  );
}

function GuideSection({
  children,
  id,
}: {
  children: ReactNode;
  id: GuideSectionId;
}) {
  const { number, title } = GUIDE_SECTIONS[id];
  return (
    // The scroll margin is behind lg: because it is a ≥lg number. It reserves the
    // ≥lg region's own top padding (App.tsx's sm:pt-5) so an anchor lands where the
    // article rests there. Below lg the scrollport is this surface's own region
    // (§17g, mobileFrame.ts), which carries no top padding at all — a margin there
    // would land every anchor that far below the region's top edge for no reason,
    // which is what the un-prefixed class did at both widths.
    <section className="mt-6 border-t border-hairline pt-6 lg:scroll-mt-5" id={id}>
      <p className="eyebrow">
        {number}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-normal text-ink sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 grid max-w-[62ch] gap-3 text-sm leading-6 text-ink-muted sm:text-base sm:leading-7">
        {children}
      </div>
    </section>
  );
}

