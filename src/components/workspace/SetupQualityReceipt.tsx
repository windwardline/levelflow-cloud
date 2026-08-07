import { useId, useState } from "react";
import { describeReplayRecord } from "../../lib/replayReliability";
import { getSecurityOption } from "../../lib/symbolMap";
import type { AnalyzerResponse, AnalyzerSetup } from "../../lib/tradeAnalyzer";
import { formatNumber } from "./advisorFormat";
// Q1-I8: one definition of each, not a private twin of the exported pair.
import { asNumber, asRecord } from "./historyUtils";
import { HowThisWorksLink } from "./HowThisWorksLink";
import { cleanReviewMessage, describeExecutionLabel } from "./reviewCopy";
import type { GuideAnchor } from "./WorkspaceNav";

// The mock writes one sentence per row. Where a category has no honest datum
// for this setup, the row says so with the same em dash the rest of the app
// uses for a missing value (historyUtils.formatPriceValue) — never a sentence
// about the review having happened, which is the process narration spec §2
// rules out and which these rows used to carry as their fallbacks.
const ABSENT = "—";

// The mock's one mobile line (m-mobile-v3.html:75) reads as the setup's
// character followed by its record — which is exactly the Market row's
// sentence followed by the Record row's. So the summary is assembled from
// rows this panel already builds, in the mock's own order: no sentence is
// written for mobile that the ≥lg panel doesn't already say.
const WHY_SUMMARY_LABELS = ["Market", "Record"];

type QualityReceiptRow = {
  anchor?: GuideAnchor;
  label: string;
  sentence: string;
  // Costs is the one colored row in the mock (a-desk-v3.html:210) — everything
  // else is plain ink.
  tone?: "positive" | "negative";
};

type QualityReceiptData = {
  blockers: string[];
  rows: QualityReceiptRow[];
};

type SetupQualityReceiptProps = {
  result: AnalyzerResponse | null;
  setup: AnalyzerSetup;
};

// Spec §16 / a-desk-v3.html:205-212: the right half of the stage's setup
// sheet. Five quiet label/sentence rows on the sheet's own paper — the
// per-item cards this used to draw were exactly the box-on-box the owner
// rejected. The sheet (AdvisorWorkspace) is the only frame; nothing here has a
// border or a fill.
// "Why this setup" stays a real heading (the mock draws it as an eyebrow, but
// dropping the h3 would strip the section's only landmark and the accessible
// name two e2e specs locate the receipt by) — eyebrow styling, heading
// semantics.
//
// Spec §17m.3 caps this panel at a third of the stage's vertical budget, and
// the five rows stay: the compression is line-height and padding only
// (py-1.5/13px/20px -> py-0.5/12.5px/17px), which is ~30% of the panel's height
// back without dropping a row or shortening a sentence, and still above the 12px
// floor the kit uses for its own metadata. ≥lg ONLY: the budget it serves is the
// Desk stage's, and below lg these rows sit behind the "Why" disclosure inside a
// frame §17e already tuned — so the mobile treatment is byte-identical to what
// it was.
//
// Below lg the mobile mock draws this panel as one sentence and a "Why" link
// (m-mobile-v3.html:75), not five labeled rows: the phone's stage is the chart
// and the copy ladder, and the breakdown is a tap away. The rows themselves are
// unchanged — the disclosure can only ever subtract them below lg, never at the
// ≥lg width where a-desk-v3.html draws all five.
export function SetupQualityReceipt(
  { result, setup }: SetupQualityReceiptProps,
) {
  const receipt = buildQualityReceipt(setup, result);
  const summary = buildWhySummary(receipt.rows);
  const [rowsOpen, setRowsOpen] = useState(false);
  const rowsId = useId();
  // With nothing to condense there is nothing to disclose, so the rows carry
  // themselves at every width rather than hiding behind a toggle whose summary
  // would be blank — the same "the element speaks only when there is something
  // to say" discipline the stage applies to its own notices.
  const rowsShown = rowsOpen || summary.length === 0;

  return (
    <div className="grid min-w-0 gap-0.5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="eyebrow">
          Why this setup
        </h3>
        <HowThisWorksLink anchor="how-review-works" />
      </div>
      {summary
        ? (
          <p className="text-[13px] leading-5 lg:hidden">
            {summary}{" "}
            <button
              aria-controls={rowsId}
              aria-expanded={rowsOpen}
              className="tertiary-link"
              type="button"
              onClick={() => setRowsOpen((open) => !open)}
            >
              Why
            </button>
          </p>
        )
        : null}
      <div
        className={rowsShown
          ? "grid min-w-0 gap-0.5"
          : "grid min-w-0 gap-0.5 max-lg:hidden"}
        id={rowsId}
      >
        {receipt.rows.map((row) => (
          <div
            key={row.label}
            className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 py-1.5 text-[13px] leading-5 lg:py-0.5 lg:text-[12.5px] lg:leading-[17px]"
          >
            <span className="eyebrow min-w-[74px] shrink-0">
              {row.label}
            </span>
            <span className="min-w-0 flex-1">
              <span className={sentenceToneClassName(row.tone)}>
                {row.sentence}
              </span>
              {row.anchor
                ? (
                  <>
                    {" "}
                    <HowThisWorksLink anchor={row.anchor} />
                  </>
                )
                : null}
            </span>
          </div>
        ))}
      </div>
      {receipt.blockers.length > 0
        ? (
          <p className="mt-2 border-t border-hairline pt-2 text-xs font-semibold leading-5 text-caution">
            Note: {receipt.blockers.map(cleanReviewMessage).join(" ")}
          </p>
        )
        : null}
    </div>
  );
}

// A category with no honest datum renders as an em dash in its own row; it
// contributes nothing to the summary rather than dropping a bare dash into the
// middle of a sentence.
function buildWhySummary(rows: QualityReceiptRow[]): string {
  return WHY_SUMMARY_LABELS
    .map((label) => rows.find((row) => row.label === label)?.sentence ?? ABSENT)
    .filter((sentence) => sentence !== ABSENT)
    .join(" ");
}

function sentenceToneClassName(
  tone: QualityReceiptRow["tone"],
): string | undefined {
  if (tone === "positive") {
    return "font-semibold text-buy";
  }
  if (tone === "negative") {
    return "font-semibold text-sell";
  }
  return undefined;
}

function buildQualityReceipt(
  setup: AnalyzerSetup,
  result: AnalyzerResponse | null,
): QualityReceiptData {
  const confluence = setup.confluence ?? {};
  const riskModel = setup.riskModel ?? {};
  const marketRegime = asRecord(confluence.marketRegime);
  const orderConstruction = asRecord(confluence.orderConstruction);
  const sessionContext = asRecord(confluence.sessionContext);
  const newsContext = asRecord(confluence.newsContext);
  const executionQuality = asRecord(riskModel.executionQuality);
  const providerWarnings = asStringArray(confluence.providerWarnings).concat(
    result?.providerWarnings ?? [],
  );
  const upcomingNewsEvents = Array.isArray(confluence.upcomingNewsEvents)
    ? confluence.upcomingNewsEvents.length
    : asNumber(newsContext.upcomingEvents) ?? 0;
  const headlineNewsEvents = asNumber(newsContext.headlineEvents) ?? 0;
  const costRating = asText(executionQuality.label);
  const costPenalty = asNumber(executionQuality.confidencePenalty) ?? 0;
  const record = describeReplayRecord(
    setup.symbol,
    getSecurityOption(setup.symbol).assetType,
  );

  const rows: QualityReceiptRow[] = [
    {
      // The regime check's own one-line reason — "Moving average separation
      // and price location support a trend regime."
      label: "Market",
      sentence: asText(marketRegime.rationale) || ABSENT,
    },
    {
      label: "Location",
      sentence: buildLocationSentence(orderConstruction),
    },
    {
      label: "Timing",
      sentence: buildTimingSentence(
        sessionContext,
        upcomingNewsEvents + headlineNewsEvents,
      ),
    },
    {
      // Spec §16 deletes the scan rail's legend box, which carried the only
      // "cost-ratings" disclosure link in the app. The Costs row is where a
      // cost rating is actually explained, so the link lands here instead —
      // same treatment the Record row already used.
      anchor: "cost-ratings",
      label: "Costs",
      sentence: costRating
        ? `${costRating} — ${describeExecutionLabel(costRating)}`
        : ABSENT,
      tone: costRating
        ? costPenalty > 0 ? "negative" : "positive"
        : undefined,
    },
    {
      anchor: "replay-record",
      label: "Record",
      // Already one sentence with its real numbers in it.
      sentence: record?.detail ?? ABSENT,
    },
  ];

  return {
    blockers: Array.from(new Set(providerWarnings)).slice(0, 3),
    rows,
  };
}

// Where price sits relative to the level is the entry-zone check the analyzer
// already runs: which side of the latest close a limit entry has to sit on,
// and the close it is measured against. Both fields arrive with the setup —
// nothing here is inferred.
function buildLocationSentence(orderConstruction: Record<string, unknown>) {
  const validation = asText(orderConstruction.validation);
  if (!validation) {
    return ABSENT;
  }
  const base = capitalizeFirst(validation.replace(/\.\s*$/, ""));
  const latestClose = asNumber(orderConstruction.latestClose);
  return latestClose === null
    ? `${base}.`
    : `${base} of ${formatNumber(latestClose)}.`;
}

function buildTimingSentence(
  sessionContext: Record<string, unknown>,
  timingRiskCount: number,
) {
  const label = asText(sessionContext.label);
  if (!label) {
    return ABSENT;
  }
  return timingRiskCount > 0
    ? `${label} with ${timingRiskCount} event or headline ${
      timingRiskCount === 1 ? "factor" : "factors"
    } affecting timing.`
    : `${label} with no event or headline penalty.`;
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    )
    : [];
}
