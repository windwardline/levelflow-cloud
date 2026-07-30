import { useEffect, useState } from "react";
import { CONFIDENCE_TIERS, getConfidenceTier, type ConfidenceTierId } from "../../lib/confidenceTiers";

type ConfidenceGaugeProps = {
  score: number;
  label?: string;
};

// Arc color collapses the three passing tiers into two bands: "Strong" and
// "Best" both read as buy (they're both clearing the bar comfortably), while
// "Qualified" reads as caution and anything below it reads as sell. Derived
// from CONFIDENCE_TIERS rather than duplicated as literals so the arc can
// never drift from the tier *labels* again — see task-2-review.md Minor-1,
// where hardcoded 80/65 thresholds put a caution-colored arc next to a
// "Strong" label for scores 76-79.
const STRONG_MIN = requireTierMin("strong");
const QUALIFIED_MIN = requireTierMin("qualified");

function requireTierMin(id: ConfidenceTierId): number {
  const tier = CONFIDENCE_TIERS.find((candidate) => candidate.id === id);
  if (!tier) {
    throw new Error(`confidenceTiers.ts is missing the "${id}" tier`);
  }
  return tier.min;
}

type GaugeColors = {
  buy: string;
  caution: string;
  sell: string;
  track: string;
};

export function arcColorForScore(score: number, colors: Pick<GaugeColors, "buy" | "caution" | "sell">): string {
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= STRONG_MIN) {
    return colors.buy;
  }
  if (clamped >= QUALIFIED_MIN) {
    return colors.caution;
  }
  return colors.sell;
}

export function ConfidenceGauge({ score, label = "Confidence" }: ConfidenceGaugeProps) {
  // Bumped by the observer below on every data-theme change; the value
  // itself is never read — its only job is forcing a re-render. See
  // readGaugeColors' doc comment for why that re-render is required.
  const [, setThemeVersion] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((version) => version + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const clamped = Math.max(0, Math.min(100, score));
  const tier = getConfidenceTier(clamped);
  const colors = readGaugeColors();
  const stroke = arcColorForScore(clamped, colors);

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
 * Reads the gauge's arc colors from the Stage-1 design tokens. Called
 * during render, which is only safe here because the MutationObserver
 * above forces a re-render on every data-theme change.
 *
 * Without that observer (the original Task 2 shape), the gauge was
 * permanently one theme-flip stale: readGaugeColors runs during React's
 * render phase, which completes and commits before any passive effect
 * fires — including App's own theme-setting effect that sets
 * document.documentElement.dataset.theme. So the very re-render that
 * cascades down from the theme toggle reads the *old* attribute value,
 * every time. And a raw DOM attribute mutation is not itself a React state
 * change, so nothing re-rendered this component afterward — the stale
 * color stuck until an unrelated prop change (a different score) happened
 * to force a fresh read. Confirmed empirically in task-2-review.md
 * Critical-1 with a live minimal repro of the same ordering.
 */
function readGaugeColors(): GaugeColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    buy: v("--color-buy"),
    caution: v("--color-caution"),
    sell: v("--color-sell"),
    track: v("--color-hairline"),
  };
}
