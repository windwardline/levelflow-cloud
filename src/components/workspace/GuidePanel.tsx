import type { ReactNode } from "react";
import { useEffect } from "react";
import type { GuideAnchor } from "./WorkspaceNav";

// The Guide renders docs/superpowers/specs/2026-07-30-levelflow-guide-content.md
// verbatim — that deck is owner-approved copy, and every paragraph/list/
// callout below is transcribed word-for-word from it. The only liberties
// taken are mechanical: markdown bullets become styled <li> cards, the
// "N. Title" heading prefix becomes a separate numeral badge, and §10's
// "Term — definition" bullets split into real <dt>/<dd> pairs (dropping the
// now-redundant connecting dash; all six definitions get their leading word
// capitalized, since the deck writes every one lowercase to continue the
// "Term —" sentence, and each now opens a standalone <dd> instead). No word
// is added, removed, or reworded. The deck's own front matter (title,
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
type GuideSectionMeta = { id: string; number: string; title: string };

const GUIDE_SECTIONS: GuideSectionMeta[] = [
  { id: "how-review-works", number: "01", title: "What Levelflow does" },
  { id: "the-setup", number: "02", title: "The setup, level by level" },
  {
    id: "targets-and-stops",
    number: "03",
    title: "Taking and managing the trade",
  },
  {
    id: "following-your-trades",
    number: "04",
    title: "Following your trades",
  },
  { id: "confidence-tiers", number: "05", title: "Confidence" },
  { id: "cost-ratings", number: "06", title: "Costs" },
  { id: "replay-record", number: "07", title: "The record" },
  { id: "timeframes", number: "08", title: "Timeframes" },
  { id: "market-hours", number: "09", title: "When a market is closed" },
  { id: "vocabulary", number: "10", title: "What the words mean here" },
];

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

  return (
    <div className="mx-auto grid max-w-[1020px] gap-9 lg:grid-cols-[230px_1fr] lg:items-start">
      <GuideToc sections={GUIDE_SECTIONS} />

      <article className="min-w-0">
        {/* Fix wave 2B, FIX 7 (A5-C1): the un-approved subtitle that used to
            sit here narrated the page's own shape and section count in
            prose — the visible TOC already shows that, and the count was
            hardcoded against GUIDE_SECTIONS.length with nothing to keep
            them in sync. Deleted outright, no replacement copy; the h1
            needs no wrapper once it's the article's only intro element. */}
        <h1 className="border-b-2 border-ink pb-3.5 text-3xl font-semibold tracking-normal text-ink">
          How to use Levelflow
        </h1>

        <GuideSection
          id="how-review-works"
          number="01"
          title="What Levelflow does"
        >
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

        <GuideSection
          id="the-setup"
          number="02"
          title="The setup, level by level"
        >
          <p>A setup is four prices, named the way your platform names them:</p>
          <ul className="grid list-disc gap-2 ps-5">
            <GuideBullet>
              <strong className="text-ink">Entry</strong> — where your limit
              order waits. A buy limit waits below the current price; a
              sell limit waits above it. Levelflow only ever suggests limit
              orders — never market or stop entries.
            </GuideBullet>
            <GuideBullet>
              <strong className="text-ink">Stop loss</strong> — the price
              that says the setup was wrong. Levelflow places it past the
              surrounding price structure with a volatility buffer, never
              at a round number.
            </GuideBullet>
            <GuideBullet>
              <strong className="text-ink">Target 1 · bank half</strong> —
              the first profit level. When price reaches it, you act (see
              §3).
            </GuideBullet>
            <GuideBullet>
              <strong className="text-ink">Target 2 · take-profit</strong>
              {" "}— the level your take-profit order sits at. It is chosen
              from price structure and what this market can actually reach
              in the setup's window.
            </GuideBullet>
          </ul>
          <p>
            Each value on the Desk copies individually — tap it, paste it
            into the matching field on your platform.
          </p>
        </GuideSection>

        <GuideSection
          id="targets-and-stops"
          number="03"
          title="Taking and managing the trade"
        >
          <blockquote className="border-l-[3px] border-accent bg-accent/5 py-3 pl-4 pr-4 text-base font-semibold leading-7 text-ink sm:text-lg">
            {CANONICAL_LADDER_INSTRUCTION}
          </blockquote>
          <p>In platform terms, that is three moments:</p>
          <ol className="grid list-decimal gap-2 ps-5">
            <GuideBullet>
              <strong className="text-ink">Place the trade.</strong> Open a
              buy or sell limit at the Entry price. Set the stop loss and
              set the take-profit at Target 2. Until price reaches your
              entry, the order shows as{" "}
              <strong className="text-ink">pending</strong> — nothing to do.
            </GuideBullet>
            <GuideBullet>
              <strong className="text-ink">Target 1 hits.</strong> Close
              half the position (a partial close), and modify the stop
              loss to your entry price. Half your profit is real money
              now, and the rest of the trade can no longer cost you
              anything.
            </GuideBullet>
            <GuideBullet>
              <strong className="text-ink">The finish.</strong> The
              remaining half either reaches Target 2 — your take-profit
              closes it — or comes back to your entry and closes flat.
              Profit either way. That is the whole design.
            </GuideBullet>
          </ol>
          <p>
            Your platform will not do step 2 for you. Levelflow keeps the
            levels on screen in Current trades so the two moves take
            seconds.
          </p>
        </GuideSection>

        <GuideSection
          id="following-your-trades"
          number="04"
          title="Following your trades"
        >
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

        <GuideSection id="confidence-tiers" number="05" title="Confidence">
          <p>
            Every setup carries a score out of 100. It is not a mood — it
            is the engine's estimate of setup strength, and each market
            type must clear its own qualifying bar before a setup is shown
            at all. The bar differs by market because the evidence differs
            by market: where history proves the score separates strong
            setups from weak ones, the bar is high and the number means
            more; where history shows setups succeed at similar rates
            across scores, the bar is set to let the record speak instead.
            The meter under the score shows the bar, so you always know
            how much room a setup cleared it by.
          </p>
        </GuideSection>

        <GuideSection id="cost-ratings" number="06" title="Costs">
          <p>
            Spread is the gap between buying and selling price on your
            platform, and it is paid out of your profit. Levelflow sizes
            it against the setup before showing anything:
          </p>
          <ul className="grid list-disc gap-2 ps-5">
            <GuideBullet>
              <strong className="text-ink">Clean</strong> — costs are
              small next to the distance between entry and stop. The
              payoff survives intact.
            </GuideBullet>
            <GuideBullet>
              <strong className="text-ink">Acceptable</strong> — costs
              take a visible bite. The payoff still holds up.
            </GuideBullet>
            <GuideBullet>
              <strong className="text-ink">Thin</strong> — costs take a
              meaningful share. Usually worth waiting for a better spread.
            </GuideBullet>
          </ul>
          <p>
            When costs eat too much of the payoff, the setup is not shown
            at all.
          </p>
        </GuideSection>

        <GuideSection id="replay-record" number="07" title="The record">
          <p>
            Levelflow's history claims are measured, not promised. Every
            market type's record comes from replaying its full available
            price history — for the major currency pairs, more than a
            decade — and counting setups the way a trade actually pays:
            take-profit reached, half banked at Target 1, or a finish that
            closed in profit. Any finish that ended in profit counts as
            {" "}<strong className="text-ink">money-positive</strong>; every
            other finish counts against the record.
          </p>
          <p>
            Below 55% money-positive, Levelflow treats a market's record
            as weak: scans stop offering it, and if you review it
            directly, the setup says so plainly. You can still trade it —
            the history just is not on your side.
          </p>
          <p>
            Finished setups across all of Levelflow feed back into future
            reviews, so the product learns from the whole record, not one
            person at a time.
          </p>
        </GuideSection>

        <GuideSection id="timeframes" number="08" title="Timeframes">
          <p>
            The chart view you pick — 15 minutes, 1 hour, 4 hours, 1 day,
            the same intervals you know from TradingView — controls what
            you see, not what Levelflow checks. Every review reads the
            4-hour, 1-hour, and 15-minute charts together for direction,
            location, and quality, then validates the latest price on the
            5-minute and 1-minute charts when they are available. The
            1-hour default is a balanced place to read a setup.
          </p>
        </GuideSection>

        <GuideSection
          id="market-hours"
          number="09"
          title="When a market is closed"
        >
          <p>
            Grey in the scan menu means closed. The label on the row tells
            you exactly when it opens next — "OPENS 5:00P SUN" — in your
            own local time. Most markets close for the weekend and reopen
            Sunday afternoon or evening; crypto never closes. Scans skip
            closed markets automatically, and the scanned count only ever
            counts markets that were actually checked.
          </p>
        </GuideSection>

        <GuideSection
          id="vocabulary"
          number="10"
          title="What the words mean here"
        >
          <dl className="grid gap-3">
            {VOCABULARY.map((item) => (
              <div key={item.term}>
                <dt className="font-semibold text-ink">{item.term}</dt>
                <dd className="mt-1">{item.body}</dd>
              </div>
            ))}
          </dl>
        </GuideSection>
      </article>
    </div>
  );
}

// Spec §16: the TOC is composition chrome, not part of the deck's own copy —
// it exists below lg not at all (mobile reads the article straight through)
// and above lg as a sticky index down the left rail. "Contents" (not the
// mock's literal "Guide" eyebrow text) avoids repeating the masthead's own
// already-active "Guide" nav label immediately beside it.
function GuideToc({ sections }: { sections: GuideSectionMeta[] }) {
  return (
    <nav
      aria-label="Guide sections"
      className="hidden lg:block sticky top-20 self-start border-r border-hairline pr-5"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-ink-muted">
        Contents
      </p>
      <div className="grid gap-1">
        {sections.map((section) => (
          <a
            key={section.id}
            className="flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-ink-muted transition hover:bg-accent/10 hover:text-ink"
            href={`#${section.id}`}
          >
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
  number,
  title,
}: {
  children: ReactNode;
  id: string;
  number: string;
  title: string;
}) {
  return (
    <section className="mt-6 scroll-mt-28 border-t border-hairline pt-6" id={id}>
      <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
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

// Shared wrapper for every "term — definition" bullet in §2/§3/§6 (§10 uses
// a real <dl> instead — see the definition-list block above). Fix round 1:
// the controller ruled that spec §16's authority clause ("where this
// spec's prose and a mockup's composition disagree, the mockup governs
// composition") overrides the kill-list's narrower "per-section" wording —
// g-guide-v1.html draws no boxes at any level, so these list items lose
// their card treatment too, flattening to plain flowing list content. §3's
// three ordered moments now number the native way (list-decimal on the
// parent <ol>, restoring exactly the marker Tailwind's preflight strips
// app-wide) instead of a custom numeral badge, so this component no longer
// needs a `marker` prop at all.
function GuideBullet({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}
