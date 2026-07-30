import { getConfidenceTier } from "../../lib/confidenceTiers";

type ConfidenceGaugeProps = {
  score: number;
  label?: string;
};

export function ConfidenceGauge({ score, label = "Confidence" }: ConfidenceGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const tier = getConfidenceTier(clamped);
  const colors = readGaugeColors();
  const stroke = clamped >= 80 ? colors.buy : clamped >= 65 ? colors.caution : colors.sell;

  return (
    <div className="w-full min-w-0">
      <div className="relative mx-auto aspect-[2/1] w-full max-w-[260px] overflow-hidden">
        <svg viewBox="0 0 200 112" className="h-full w-full" role="img" aria-label={`${label}: ${clamped}`}>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={colors.track}
            strokeLinecap="round"
            strokeWidth="2"
            pathLength={100}
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth="2"
            pathLength={100}
            strokeDasharray={`${clamped} 100`}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="font-display text-5xl text-ink tabular-nums">{clamped}</span>
          <span className="text-xs uppercase tracking-wide text-ink-muted">
            {tier ? `${tier.label} ${label}` : label}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Reads the gauge's arc colors from the Stage-1 design tokens at render
 * time. This is an inline SVG (not a canvas), so a plain per-render
 * getComputedStyle read is enough — the component re-renders whenever
 * `score` changes. Unlike MarketChart, this does not install a
 * MutationObserver for a theme flip with no score change; see the Task 2
 * report for that tradeoff.
 */
function readGaugeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    buy: v("--color-buy"),
    caution: v("--color-caution"),
    sell: v("--color-sell"),
    track: v("--color-hairline"),
  };
}
