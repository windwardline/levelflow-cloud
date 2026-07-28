import type { ReactNode } from "react";
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

type GuidePanelProps = {
  supportEmail: string;
};

export function GuidePanel({ supportEmail }: GuidePanelProps) {
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
      body: "Click Review market. LevelFlow clears stale results, refreshes the market, and either shows a current setup or explains why this market is standing aside.",
      icon: <Radar className="h-5 w-5" aria-hidden="true" />,
      number: "03",
      title: "Run the review",
    },
    {
      body: "Review the side, entry, stop, TP1 (bank half, stop to entry), runner target, confidence, and reason before taking any action outside LevelFlow.",
      icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
      number: "04",
      title: "Review the setup",
    },
    {
      body: "Use Insights to review past setups, final results, and score ranges without changing your current chart.",
      icon: <History className="h-5 w-5" aria-hidden="true" />,
      number: "05",
      title: "Review insights",
    },
  ];
  const timeframeItems = [
    {
      body: "Your selected interval controls the visible chart. It does not limit LevelFlow to that single view.",
      label: "Chart view",
      value: "Your choice",
    },
    {
      body: "LevelFlow compares these intervals for direction, location, and quality.",
      label: "Setup review",
      value: advisorSignalIntervalLabel(),
    },
    {
      body: `${advisorExecutionIntervalLabel()} help validate the latest price when available. Refresh after the Valid until time before using levels.`,
      label: "Current price",
      value: "Valid until",
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
      body: "The price where the setup becomes active. LevelFlow does not generate market or stop entries.",
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
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
                  Guide
                </p>
                <h2 className="mt-1 text-3xl font-semibold tracking-normal text-navy">
                  How to use LevelFlow
                </h2>
              </div>
            </div>
            <p className="max-w-3xl text-base leading-7 text-slate">
              Start with the chart, run the review, then inspect the levels and
              reason. Market Scan helps decide what to look at next by showing
              the strongest setup when closely linked markets qualify together.
              Insights tracks how setups finish over time.
            </p>
          </div>

          <GuidePreviewCard />
        </div>
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Workflow
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              Five-step workflow
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate">
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

      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Timeframes
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              Chart view versus setup review
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate">
            The chart view is for inspection. The setup review uses a fixed,
            broader set of intervals.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {timeframeItems.map((item) => (
            <GuideScopeCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.5fr)]">
        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Review
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              What LevelFlow checks
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
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Output
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
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

      <section className="terminal-panel p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(280px,0.4fr)] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Confidence
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              How to read the score
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
              Confidence is a 0-100 quality score. It reflects market agreement,
              payoff, timing, news, rates, data quality, and past results.
              A setup only appears after it passes the required review for that
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
            <p className="rounded-lg border border-slate/15 bg-canvas px-4 py-3 text-sm leading-6 text-slate">
              If the current market does not pass review, LevelFlow clears the
              previous setup instead of showing a stale one. When closely
              linked markets qualify together, LevelFlow keeps the stronger
              setup in view. This is not a whole-category filter.
            </p>
          </div>
        </div>
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Help
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              Questions or data issues
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate">
              Send the market, timeframe, and a short description of what looked
              off.
            </p>
          </div>
          <a className="secondary-button shrink-0" href={`mailto:${supportEmail}?subject=${encodeURIComponent("[LevelFlow] Help")}`}>
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
    <div className="grid content-between gap-4 rounded-lg border border-slate/15 bg-canvas p-4">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-bold uppercase text-danger">
            Sell limit
          </span>
          <span className="text-sm font-semibold text-navy">
            Best, 87%
          </span>
        </div>
        <div className="grid gap-2 text-sm">
          <GuidePreviewMetric label="Entry" value="1.15780" tone="danger" />
          <GuidePreviewMetric label="Stop" value="1.16120" />
          <GuidePreviewMetric label="Target" value="1.15040" />
          <GuidePreviewMetric
            label="Reason"
            value="Direction + location + timing"
          />
        </div>
      </div>
      <div className="rounded-lg border border-bullish/25 bg-bullish/10 px-3 py-2 text-xs font-semibold leading-5 text-bullish">
        Example only. Live setups refresh from the selected market and only
        appear when the current setup passes review.
      </div>
    </div>
  );
}

function GuidePreviewMetric({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "danger" | "neutral";
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-normal text-slate">
        {label}
      </span>
      <span
        className={`text-right font-semibold ${tone === "danger" ? "text-danger" : "text-navy"}`}
      >
        {value}
      </span>
    </div>
  );
}

function GuideProcessStep({
  body,
  icon,
  isLast,
  number,
  title,
}: {
  body: string;
  icon: ReactNode;
  isLast: boolean;
  number: string;
  title: string;
}) {
  return (
    <div className="relative min-w-0 rounded-lg border border-slate/15 bg-canvas p-4">
      {!isLast ? (
        <div className="pointer-events-none absolute -right-4 top-8 hidden h-px w-5 bg-slate/25 lg:block">
          <ArrowRight
            className="absolute -right-2 -top-2 h-4 w-4 text-slate"
            aria-hidden="true"
          />
        </div>
      ) : null}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-white">
          {icon}
        </div>
        <span className="text-xs font-bold uppercase tracking-normal text-bullish">
          {number}
        </span>
      </div>
      <h3 className="font-semibold text-navy">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate">{body}</p>
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
    <div className="min-w-0 rounded-lg border border-slate/15 bg-canvas p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bullish/10 text-bullish">
          {icon}
        </div>
        <h3 className="font-semibold text-navy">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-slate">{body}</p>
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
    <div className="grid min-w-0 gap-2 rounded-lg border border-slate/15 bg-canvas p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate">
        {label}
      </p>
      <p className="text-lg font-semibold text-navy">{value}</p>
      <p className="text-sm leading-6 text-slate">{body}</p>
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
    <div className="grid min-w-0 gap-2 rounded-lg border border-slate/15 bg-canvas p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate">
          {label}
        </p>
        <p className="text-sm font-semibold text-navy">{value}</p>
      </div>
      <p className="text-sm leading-6 text-slate">{body}</p>
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
    <div className="grid min-w-0 gap-3 rounded-lg border border-slate/15 bg-canvas p-4 sm:grid-cols-[88px_minmax(0,1fr)]">
      <div className="flex h-14 w-full items-center justify-center rounded-lg bg-white text-lg font-semibold text-navy">
        {range}
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-navy">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate">{body}</p>
      </div>
    </div>
  );
}
