import { Layers3, ShieldCheck, Target } from "lucide-react";
import {
  advisorExecutionIntervalLabel,
  advisorSignalIntervalLabel,
} from "../../lib/advisorReview";

export function OverviewPanel() {
  const valueCards = [
    {
      body: "LevelFlow reviews the selected market and shows one current limit setup only when the chart, timing, risk, and closely linked market check are strong enough.",
      icon: <Target className="h-5 w-5" aria-hidden="true" />,
      title: "One focused answer",
    },
    {
      body: "The review checks direction, price location, volatility, session timing, news, rates, and past results.",
      icon: <Layers3 className="h-5 w-5" aria-hidden="true" />,
      title: "Market context in one pass",
    },
    {
      body: "Entry, stop, TP1 and runner targets, confidence, and the reason for the setup are shown together before you decide what to do next.",
      icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
      title: "Review support, not trade placement",
    },
  ];

  const proofItems = [
    { label: "Order type", value: "Limit only" },
    { label: "Default chart", value: "1 hour view" },
    { label: "Setup review", value: advisorSignalIntervalLabel() },
    { label: "Price check", value: advisorExecutionIntervalLabel() },
    { label: "Data", value: "Charts, news, rates" },
    { label: "Learning", value: "Shared across LevelFlow" },
  ];

  return (
    <div className="grid gap-5">
      <section className="terminal-panel overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(300px,0.42fr)] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              What LevelFlow is
            </p>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-normal text-navy sm:text-4xl">
              A premium market review workspace for disciplined traders
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate">
              LevelFlow refreshes the chart, checks the market from several
              angles, accounts for timing risk, and presents the strongest
              current limit setup when the evidence is strong enough.
            </p>
          </div>
          <div className="grid gap-2 rounded-lg border border-slate/15 bg-canvas p-4">
            {proofItems.map((item) => (
              <div
                key={item.label}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm"
              >
                <span className="min-w-0 text-slate">{item.label}</span>
                <span className="shrink-0 font-semibold text-navy">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {valueCards.map((card) => (
          <article key={card.title} className="terminal-panel p-5 sm:p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-white">
              {card.icon}
            </div>
            <h3 className="text-xl font-semibold tracking-normal text-navy">
              {card.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="terminal-panel p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(300px,0.42fr)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Why it matters
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              Cleaner decisions, less noise
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate">
              Most trading tools add more noise. LevelFlow narrows the decision:
              if the quality, timing, and reward are not there, it clears the
              prior setup and shows no trade setup. If closely linked markets
              qualify at the same time, it keeps the stronger setup in view. If
              the setup passes, it shows the side, entry, stop, target,
              confidence, and reason in one place. Finished setups across
              LevelFlow also improve future reviews, so the product learns from
              the full setup history rather than one user at a time.
            </p>
          </div>
          <div className="rounded-lg border border-bullish/25 bg-bullish/10 p-4">
            <p className="text-sm font-semibold uppercase tracking-normal text-bullish">
              Important boundary
            </p>
            <p className="mt-2 text-sm leading-6 text-navy">
              LevelFlow does not place trades. It helps traders review the
              market, compare evidence, and decide with more discipline.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
