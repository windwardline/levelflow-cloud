import { CONFIDENCE_THRESHOLD_BY_ASSET_TYPE } from "../../lib/advisorReview";
import type { SecurityType } from "../../lib/symbolMap";

// "Within 5 points of the bar" reads as inclusive: a margin of exactly 5
// still gets the softened note, only 6+ earns "room to spare" (pinned at
// both boundaries in tests/confidenceUnit.test.tsx).
const THIN_MARGIN_POINTS = 5;

export function formatConfidenceValue(score: number): string {
  return `${Math.round(score)} of 100`;
}

export function clampConfidencePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

// ConfidenceUnit only ever renders for a setup that already exists, and the
// engine never returns one scoring below its own class's threshold
// (trade-analyzer/index.ts blocks setup creation outright when
// confidenceScore < calibration.confidenceThreshold) — so `margin` is
// guaranteed non-negative everywhere this actually renders today. Clamped
// at zero anyway so a future caller outside that guarantee degrades to
// "just clears it" instead of printing a negative-points claim.
export function buildConfidenceNote(
  assetType: SecurityType,
  score: number,
  threshold: number,
): string {
  const margin = Math.max(0, Math.round(score) - threshold);
  const clears = margin <= THIN_MARGIN_POINTS
    ? "this one clears it"
    : "this one clears it with room to spare";
  return `${assetType} setups must score ${threshold} to qualify — ${clears}`;
}

// The canonical confidence unit (design spec §6): a labeled "N of 100"
// value, a slim meter with a tick at the class's own qualifying threshold,
// and a one-line note anchoring the number to that bar. Replaces every
// bare-number confidence display on the Desk stage — never render a raw
// score without this context.
export function ConfidenceUnit(
  { assetType, score }: { assetType: SecurityType; score: number },
) {
  const threshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE[assetType];
  const fillPercent = clampConfidencePercent(score);
  const tickPercent = clampConfidencePercent(threshold);

  return (
    <div className="grid gap-2 rounded-lg border border-hairline bg-paper px-3 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          Confidence
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-ink">
          {formatConfidenceValue(score)}
        </span>
      </div>
      <div
        className="relative h-[5px] w-[150px] max-w-full"
        aria-hidden="true"
      >
        <div className="absolute inset-0 overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <div
          className="absolute inset-y-0 w-px bg-ink"
          style={{ left: `${tickPercent}%` }}
        />
      </div>
      <p className="text-xs leading-5 text-ink-muted">
        {buildConfidenceNote(assetType, score, threshold)}
      </p>
    </div>
  );
}
