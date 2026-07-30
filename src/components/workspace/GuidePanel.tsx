import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Crosshair,
  History,
  Layers3,
  LineChart,
  Mail,
  Radar,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  advisorExecutionIntervalLabel,
  advisorSignalIntervalLabel,
} from "../../lib/advisorReview";
import {
  CONFIDENCE_TIERS,
  formatConfidenceTierRange,
} from "../../lib/confidenceTiers";
import type { GuideAnchor } from "./WorkspaceNav";
import { useWorkspaceNav } from "./WorkspaceNav";

type GuidePanelProps = {
  // A How this works link elsewhere in the app asked for one section of the
  // Guide. Applied once per request, then handed back: the panel unmounts
  // whenever its tab isn't active, so an unconsumed anchor would still be
  // sitting here on the next mount and would yank a reader who opened the
  // Guide from the tab bar down to a section they never asked for — the same
  // stale-remount shape openRequest and initialSymbol both had.
  anchor?: GuideAnchor | null;
  onAnchorHandled?: () => void;
  supportEmail: string;
};

export function GuidePanel(
  { anchor, onAnchorHandled, supportEmail }: GuidePanelProps,
) {
  const nav = useWorkspaceNav();

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

  const workflow = [
    {
      body: "Choose the market and chart view. The 1 hour default gives a balanced starting point.",
      icon: <Crosshair className="h-5 w-5" aria-hidden="true" />,
      number: "01",
      title: "Select the market",
    },
    {
      body: "Use the chart first. Look for direction, range, and whether price is near a useful entry area.",
      icon: <LineChart className="h-5 w-5" aria-hidden="true" />,
      number: "02",
      title: "Read the chart",
    },
    {
      body: "Click Review market. Levelflow clears stale results, refreshes the market, and either shows a current setup or explains why this market is standing aside.",
      icon: <Radar className="h-5 w-5" aria-hidden="true" />,
      number: "03",
      title: "Run the review",
    },
    {
      body: "Review the side, entry, stop, both profit targets, confidence, and reason before taking any action outside Levelflow.",
      icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
      number: "04",
      title: "Review the setup",
    },
    {
      action: (
        <button
          className="tertiary-link"
          type="button"
          onClick={() => nav.openInsights()}
        >
          Open Insights
        </button>
      ),
      body: "Use Insights to review past setups, final results, and score ranges without changing your current chart.",
      icon: <History className="h-5 w-5" aria-hidden="true" />,
      number: "05",
      title: "Review insights",
    },
  ];

  // The one place in the app that names the precise vocabulary, so a reader
  // can map Levelflow's plain labels onto the terms every other tool uses.
  const targetTerms = [
    {
      body: "Sell half the position here and move your stop to your entry price. From that point the setup can no longer cost you money. Elsewhere this level is called TP1.",
      label: "First target",
      value: "Bank half, stop to entry",
    },
    {
      body: "The half still open aims here — the runner, in the vocabulary you will meet outside Levelflow. It is what lets a setup pay more than it risked.",
      label: "Second target",
      value: "The rest of the position",
    },
    {
      body: "The price that says the setup was wrong. Levelflow places it past the surrounding price structure with a volatility buffer, never at a round number.",
      label: "Stop",
      value: "Where the setup is wrong",
    },
  ];

  const replayRecordItems = [
    {
      body: "Levelflow replayed its rules across all the price history it can reach for each market, using only the span held back from tuning. The record is the share of those setups that filled and then ended in profit.",
      label: "What it is",
      value: "Measured history, not a forecast",
    },
    {
      body: "Counted the way a trade actually pays: the second target reached, half banked at the first target, or an expiry that closed in profit.",
      label: "Money-positive",
      value: "Any finish that ended in profit",
    },
    {
      body: "Below 55%, Levelflow treats the record as weak. Market Scan stops offering that market and the setup receipt says so. You can still review it, but the history is not on your side.",
      label: "A weak record",
      value: "Reviewed with care, never scanned",
    },
  ];

  const costRatings = [
    {
      body: "Costs are small next to the distance between entry and stop. The payoff survives them intact.",
      label: "Clean",
      toneClassName: "text-buy",
    },
    {
      body: "Costs take a visible bite. The payoff still holds up.",
      label: "Acceptable",
      toneClassName: "text-ink-muted",
    },
    {
      body: "Costs take a meaningful share of the payoff. Usually worth waiting for a better spread.",
      label: "Thin",
      toneClassName: "text-caution",
    },
    {
      body: "Costs eat too much of the payoff for the setup to be worth taking as shown.",
      label: "Poor",
      toneClassName: "text-sell",
    },
  ];

  const timeframeItems = [
    {
      body: "Your selected interval controls the visible chart. It does not limit Levelflow to that single view.",
      label: "Chart view",
      value: "Your choice",
    },
    {
      body: "Levelflow compares these intervals for direction, location, and quality.",
      label: "Setup review",
      value: advisorSignalIntervalLabel(),
    },
    {
      body: "These intervals validate the latest price when the data is available.",
      label: "Current price",
      value: advisorExecutionIntervalLabel(),
    },
  ];

  const decisionLenses = [
    {
      body: "Direction checks whether buyers or sellers have control.",
      icon: <TrendingUp className="h-5 w-5" aria-hidden="true" />,
      title: "Direction",
    },
    {
      body: "Location checks whether the entry is worth waiting for.",
      icon: <Layers3 className="h-5 w-5" aria-hidden="true" />,
      title: "Location",
    },
    {
      body: "Timing checks sessions, news, rates, chart coverage, and closely linked markets.",
      icon: <Activity className="h-5 w-5" aria-hidden="true" />,
      title: "Timing",
    },
    {
      body: "Risk checks the stop, target, and payoff before a setup can appear.",
      icon: <Target className="h-5 w-5" aria-hidden="true" />,
      title: "Risk",
    },
  ];

  const outputItems = [
    {
      body: "The direction of the setup. Buy limits wait below market; sell limits wait above market.",
      label: "Order",
      value: "Buy / sell limit",
    },
    {
      body: "The price where the setup becomes active. Levelflow does not generate market or stop entries.",
      label: "Entry",
      value: "Limit price",
    },
    {
      body: "The price area where the setup is no longer valid.",
      label: "Stop",
      value: "Risk price",
    },
    {
      body: "The primary objective selected from price structure, volatility, and payoff.",
      label: "Target",
      value: "Take profit",
    },
    {
      body: "A reference level after the setup has moved in favor.",
      label: "Reference",
      value: "Break-even",
    },
  ];

  return (
    <div className="grid gap-5">
      <section className="terminal-panel overflow-hidden">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:items-stretch">
          <div className="min-w-0">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ink text-paper">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-accent">
                  Guide
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-normal text-ink">
                  How to use Levelflow
                </h1>
              </div>
            </div>
            <p className="max-w-3xl text-base leading-7 text-ink-muted">
              Start with the chart, run the review, then inspect the levels and
              reason. Market Scan helps decide what to look at next by showing
              the strongest setup when closely linked markets qualify together.
              Insights tracks how setups finish over time.
            </p>
          </div>

          <GuidePreviewCard />
        </div>
      </section>

      <section
        className="terminal-panel scroll-mt-28 p-5 sm:p-6"
        id="how-review-works"
      >
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Workflow
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              Five-step workflow
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-ink-muted">
            Chart first, review second, reason before action.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-5">
          {workflow.map((step, index) => (
            <GuideProcessStep
              key={step.number}
              {...step}
              isLast={index === workflow.length - 1}
            />
          ))}
        </div>
      </section>

      <section
        className="terminal-panel scroll-mt-28 p-5 sm:p-6"
        id="targets-and-stops"
      >
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Levels
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              Targets and stops
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-ink-muted">
            One stop, two targets. The first takes risk off the table; the
            second is what the rest of the position is for.
          </p>
        </div>
        <div className="grid gap-3">
          {targetTerms.map((item) => (
            <GuideOutputRow key={item.label} {...item} />
          ))}
        </div>
        <p className="mt-3 rounded-lg border border-hairline bg-paper px-4 py-3 text-sm leading-6 text-ink-muted">
          Some setups show a single target. When the surrounding price
          structure leaves no room to bank half on the way, Levelflow shows
          the one objective it can defend instead of inventing a second.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.5fr)]">
        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Review
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              What Levelflow checks
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {decisionLenses.map((item) => (
              <GuideLensCard key={item.title} {...item} />
            ))}
          </div>
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Output
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              What the setup includes
            </h2>
          </div>
          <div className="grid gap-3">
            {outputItems.map((item) => (
              <GuideOutputRow key={item.label} {...item} />
            ))}
          </div>
        </section>
      </div>

      <section
        className="terminal-panel scroll-mt-28 p-5 sm:p-6"
        id="confidence-tiers"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(280px,0.4fr)] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Confidence
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              How to read the score
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
              Confidence is a 0-100 quality score. It reflects market agreement,
              payoff, timing, news, rates, data quality, and past results. A
              setup only appears after it passes the required review for that
              market.
            </p>
          </div>
          <div className="grid gap-3">
            {CONFIDENCE_TIERS.map((tier) => (
              <GuideConfidenceBand
                key={tier.id}
                body={tier.body}
                range={formatConfidenceTierRange(tier)}
                title={tier.label}
              />
            ))}
            <p className="rounded-lg border border-hairline bg-paper px-4 py-3 text-sm leading-6 text-ink-muted">
              If the current market does not pass review, Levelflow clears the
              previous setup instead of showing a stale one. When closely
              linked markets qualify together, Levelflow keeps the stronger
              setup in view. This is not a whole-category filter.
            </p>
          </div>
        </div>
      </section>

      <section
        className="terminal-panel scroll-mt-28 p-5 sm:p-6"
        id="replay-record"
      >
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Evidence
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              Replay record
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-ink-muted">
            Confidence describes today's setup. The replay record describes how
            a market has behaved when Levelflow said the same thing before.
          </p>
        </div>
        <div className="grid gap-3">
          {replayRecordItems.map((item) => (
            <GuideOutputRow key={item.label} {...item} />
          ))}
        </div>
        <p className="mt-3 rounded-lg border border-hairline bg-paper px-4 py-3 text-sm leading-6 text-ink-muted">
          Every rate on the setup receipt is a historical frequency, not a
          promise. A market that behaved one way for years can stop without
          warning.
        </p>
      </section>

      <section
        className="terminal-panel scroll-mt-28 p-5 sm:p-6"
        id="cost-ratings"
      >
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Trading costs
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              Cost ratings
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-ink-muted">
            Every market charges a spread, and orders can fill away from their
            price. Levelflow prices that in before it shows a payoff, then
            rates what is left.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {costRatings.map((item) => (
            <GuideCostRow key={item.label} {...item} />
          ))}
        </div>
        <p className="mt-3 rounded-lg border border-hairline bg-paper px-4 py-3 text-sm leading-6 text-ink-muted">
          The payoff on a setup is already measured after these costs, so a
          Thin or Poor rating is a warning about how little of that payoff
          survives them.
        </p>
      </section>

      <section
        className="terminal-panel scroll-mt-28 p-5 sm:p-6"
        id="timeframes"
      >
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Timeframes
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              Chart view versus setup review
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-ink-muted">
            The chart view is for inspection. The setup review uses a fixed,
            broader set of intervals.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {timeframeItems.map((item) => (
            <GuideScopeCard key={item.label} {...item} />
          ))}
        </div>
        <div className="mt-3">
          <GuideOutputRow
            body="Refresh the review after that time before using any level."
            label="Valid until"
            value="The time the setup expires if price has not reached the entry."
          />
        </div>
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-accent">
              Help
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
              Questions or data issues
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Send the market, timeframe, and a short description of what looked
              off.
            </p>
          </div>
          <a
            className="secondary-button shrink-0"
            href={`mailto:${supportEmail}?subject=${encodeURIComponent("[Levelflow] Help")}`}
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {supportEmail}
          </a>
        </div>
      </section>
    </div>
  );
}

function GuidePreviewCard() {
  return (
    <div className="grid content-between gap-4 rounded-lg border border-hairline bg-paper p-4">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="chip text-sell">Sell limit</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-ink">
            Best, 87%
          </span>
        </div>
        <div className="grid gap-2 text-sm">
          <GuidePreviewMetric label="Entry" value="1.15780" tone="sell" />
          <GuidePreviewMetric label="Stop" value="1.16120" />
          <GuidePreviewMetric label="Target" value="1.15040" />
          <GuidePreviewMetric
            label="Reason"
            value="Direction + location + timing"
          />
        </div>
      </div>
      <p className="rounded-lg border border-hairline bg-sheet px-3 py-2 text-xs leading-5 text-ink-muted">
        Example only. Live setups refresh from the selected market and only
        appear when the current setup passes review.
      </p>
    </div>
  );
}

function GuidePreviewMetric({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "sell";
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-sheet px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
        {label}
      </span>
      <span
        className={`text-right font-mono font-semibold tabular-nums ${tone === "sell" ? "text-sell" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}

function GuideProcessStep({
  action,
  body,
  icon,
  isLast,
  number,
  title,
}: {
  action?: ReactNode;
  body: string;
  icon: ReactNode;
  isLast: boolean;
  number: string;
  title: string;
}) {
  return (
    <div className="relative min-w-0 rounded-lg border border-hairline bg-paper p-4">
      {!isLast
        ? (
          <div className="pointer-events-none absolute -right-4 top-8 hidden h-px w-5 bg-hairline lg:block">
            <ArrowRight
              className="absolute -right-2 -top-2 h-4 w-4 text-ink-muted"
              aria-hidden="true"
            />
          </div>
        )
        : null}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-paper">
          {icon}
        </div>
        <span className="font-mono text-xs font-bold uppercase tabular-nums tracking-normal text-accent">
          {number}
        </span>
      </div>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

function GuideLensCard({
  body,
  icon,
  title,
}: {
  body: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-paper p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {icon}
        </div>
        <h3 className="font-semibold text-ink">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-ink-muted">{body}</p>
    </div>
  );
}

function GuideScopeCard({
  body,
  label,
  value,
}: {
  body: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-hairline bg-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
        {label}
      </p>
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-sm leading-6 text-ink-muted">{body}</p>
    </div>
  );
}

function GuideOutputRow({
  body,
  label,
  value,
}: {
  body: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-hairline bg-paper p-3">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          {label}
        </p>
        <p className="text-sm font-semibold text-ink">{value}</p>
      </div>
      <p className="text-sm leading-6 text-ink-muted">{body}</p>
    </div>
  );
}

function GuideCostRow({
  body,
  label,
  toneClassName,
}: {
  body: string;
  label: string;
  toneClassName: string;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2 rounded-lg border border-hairline bg-paper p-3">
      <span className={`chip w-fit ${toneClassName}`}>{label}</span>
      <p className="text-sm leading-6 text-ink-muted">{body}</p>
    </div>
  );
}

function GuideConfidenceBand({
  body,
  range,
  title,
}: {
  body: string;
  range: string;
  title: string;
}) {
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-hairline bg-paper p-4 sm:grid-cols-[88px_minmax(0,1fr)]">
      <div className="flex h-14 w-full items-center justify-center rounded-lg bg-sheet font-mono text-lg font-semibold tabular-nums text-ink">
        {range}
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-ink-muted">{body}</p>
      </div>
    </div>
  );
}
