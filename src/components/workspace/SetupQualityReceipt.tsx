import { describeReplayRecord } from "../../lib/replayReliability";
import { getSecurityOption } from "../../lib/symbolMap";
import type { AnalyzerResponse, AnalyzerSetup } from "../../lib/tradeAnalyzer";
import { formatNumber } from "./advisorFormat";
import { HowThisWorksLink } from "./HowThisWorksLink";
import { cleanReviewMessage, describeExecutionLabel } from "./reviewCopy";
import type { GuideAnchor } from "./WorkspaceNav";

// The mock writes one sentence per row. Where a category has no honest datum
// for this setup, the row says so with the same em dash the rest of the app
// uses for a missing value (historyUtils.formatPriceValue) — never a sentence
// about the review having happened, which is the process narration spec §2
// rules out and which these rows used to carry as their fallbacks.
const ABSENT = "—";

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
export function SetupQualityReceipt(
  { result, setup }: SetupQualityReceiptProps,
) {
  const receipt = buildQualityReceipt(setup, result);

  return (
    <div className="grid min-w-0 gap-0.5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          Why this setup
        </h3>
        <HowThisWorksLink anchor="how-review-works" />
      </div>
      {receipt.rows.map((row) => (
        <div
          key={row.label}
          className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 py-1.5 text-[13px] leading-5"
        >
          <span className="min-w-[74px] shrink-0 text-xs font-semibold uppercase tracking-normal text-ink-muted">
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
