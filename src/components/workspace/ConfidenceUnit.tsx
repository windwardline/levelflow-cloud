import { CONFIDENCE_THRESHOLD_BY_ASSET_TYPE } from "../../lib/advisorReview";
import { formatCompactDateTime } from "../../lib/marketHours";
import type { SecurityType } from "../../lib/symbolMap";
import { HowThisWorksLink } from "./HowThisWorksLink";

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

// Spec §16 kills the stage's VALID UNTIL metric card; its datum lands here
// instead, as one quiet line under the confidence note rather than a box of
// its own ("Reviewed {time} · valid until {time}"). Either half can be
// missing — a scan-selected candidate carries no review stamp of its own
// until Review runs, and a setup without an expiry has no window to
// print — so the line is assembled from whichever parts actually exist and
// nothing is fabricated to fill a gap. Returns "" when neither exists, and
// the component then renders no line at all.
//
// Spec §17 fixes the stamp's grammar: `{MMM} {D} {h}:{mm}{A|P}`, e.g.
// "Reviewed JUL 31 2:05P · valid until JUL 31 10:05P". It comes from
// marketHours' formatCompactDateTime — the same time-piece logic the scope
// menu's OPENS lines are built from — rather than a second Intl call of its
// own, so the two grammars can never drift apart. An unparseable timestamp
// yields no stamp at all: the half is dropped exactly like an absent one,
// rather than printing a placeholder where a real moment belongs.
function stampMoment(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatCompactDateTime(date);
}

export function buildConfidenceMeta(
  reviewedAt: string | null,
  validUntil: string | null,
): string {
  const reviewed = stampMoment(reviewedAt);
  const expires = stampMoment(validUntil);

  if (reviewed && expires) {
    return `Reviewed ${reviewed} · valid until ${expires}`;
  }
  if (reviewed) {
    return `Reviewed ${reviewed}`;
  }
  if (expires) {
    return `Valid until ${expires}`;
  }
  return "";
}

// The canonical confidence unit (design spec §6): a labeled "N of 100"
// value, a slim meter with a tick at the class's own qualifying threshold,
// and a one-line note anchoring the number to that bar. Replaces every
// bare-number confidence display on the Desk stage — never render a raw
// score without this context.
//
// Spec §16 / a-desk-v3.html:168-173: this sits directly under the stagehead's
// market heading as flat type on paper — no card, no border, no fill. The
// killed VALID UNTIL card's datum rides along on the meta line below the
// note (buildConfidenceMeta above).
export function ConfidenceUnit(
  { assetType, reviewedAt = null, score, validUntil = null }: {
    assetType: SecurityType;
    reviewedAt?: string | null;
    score: number;
    validUntil?: string | null;
  },
) {
  const threshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE[assetType];
  const fillPercent = clampConfidencePercent(score);
  const tickPercent = clampConfidencePercent(threshold);
  const meta = buildConfidenceMeta(reviewedAt, validUntil);

  return (
    <div className="mt-2 grid min-w-0 gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          Confidence
        </span>
        <span className="font-mono text-[15px] font-bold tabular-nums text-ink">
          {formatConfidenceValue(score)}
        </span>
        <span
          className="relative h-[5px] w-[150px] max-w-full"
          aria-hidden="true"
        >
          <span className="absolute inset-0 overflow-hidden rounded-full bg-hairline">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${fillPercent}%` }}
            />
          </span>
          <span
            className="absolute inset-y-0 w-px bg-ink"
            style={{ left: `${tickPercent}%` }}
          />
        </span>
      </div>
      <p className="text-xs leading-5 text-ink-muted">
        {buildConfidenceNote(assetType, score, threshold)}{" "}
        <HowThisWorksLink anchor="confidence-tiers" />
      </p>
      {meta
        ? (
          <p className="font-mono text-xs leading-5 text-ink-muted">
            {meta}
          </p>
        )
        : null}
    </div>
  );
}
