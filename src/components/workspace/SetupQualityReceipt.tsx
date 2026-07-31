import { describeReplayRecord } from "../../lib/replayReliability";
import { getSecurityOption } from "../../lib/symbolMap";
import type { AnalyzerResponse, AnalyzerSetup } from "../../lib/tradeAnalyzer";
import { formatNumber } from "./advisorFormat";
import { HowThisWorksLink } from "./HowThisWorksLink";
import { cleanReviewMessage, formatStrategyName } from "./reviewCopy";
import type { GuideAnchor } from "./WorkspaceNav";

type QualityReceiptItem = {
  anchor?: GuideAnchor;
  detail: string;
  label: string;
  tone?: "bullish" | "danger" | "neutral";
  value: string;
};

type QualityReceiptData = {
  blockers: string[];
  items: QualityReceiptItem[];
  strategyVotes: Array<{ direction: string; name: string; score: number }>;
};

type SetupQualityReceiptProps = {
  result: AnalyzerResponse | null;
  setup: AnalyzerSetup;
};

// Spec §16 / a-desk-v3.html:205-212: the right half of the stage's setup
// sheet. Flat label/value rows on the sheet's own paper — the per-item cards
// this used to draw were exactly the box-on-box the owner rejected. The sheet
// (AdvisorWorkspace) is the only frame; nothing here has a border or a fill.
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
      {receipt.items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 py-1 text-sm leading-5"
        >
          <span className="min-w-[74px] shrink-0 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            {item.label}
          </span>
          <span className="min-w-0 flex-1">
            <span className={valueToneClassName(item.tone)}>{item.value}</span>
            {item.detail
              ? <span className="text-ink-muted">{` — ${item.detail}`}</span>
              : null}
            {item.anchor
              ? (
                <>
                  {" "}
                  <HowThisWorksLink anchor={item.anchor} />
                </>
              )
              : null}
          </span>
        </div>
      ))}
      {receipt.strategyVotes.length > 0
        ? (
          <div className="mt-2 border-t border-hairline pt-2">
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-normal text-ink-muted">
              Strongest checks
            </p>
            {receipt.strategyVotes.slice(0, 3).map((vote) => (
              <p
                key={`${vote.name}:${vote.direction}`}
                className="flex min-w-0 items-baseline justify-between gap-3 py-0.5 text-sm"
              >
                <span className="min-w-0 truncate font-semibold text-ink">
                  {formatStrategyName(vote.name)}
                </span>
                <span
                  className={vote.direction === "buy"
                    ? "shrink-0 text-buy"
                    : vote.direction === "sell"
                    ? "shrink-0 text-sell"
                    : "shrink-0 text-ink-muted"}
                >
                  {formatVoteSupport(vote.direction)}
                </span>
              </p>
            ))}
          </div>
        )
        : null}
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

function valueToneClassName(tone: QualityReceiptItem["tone"]): string {
  if (tone === "bullish") {
    return "font-semibold text-accent";
  }
  if (tone === "danger") {
    return "font-semibold text-sell";
  }
  return "font-semibold text-ink";
}

function buildQualityReceipt(
  setup: AnalyzerSetup,
  result: AnalyzerResponse | null,
): QualityReceiptData {
  const confluence = setup.confluence ?? {};
  const riskModel = setup.riskModel ?? {};
  const consensus = asRecord(confluence.consensus);
  const marketRegime = asRecord(confluence.marketRegime);
  const orderConstruction = asRecord(confluence.orderConstruction);
  const sessionContext = asRecord(confluence.sessionContext);
  const newsContext = asRecord(confluence.newsContext);
  const macroRateContext = asRecord(confluence.macroRateContext);
  const executionQuality = asRecord(riskModel.executionQuality);
  const rewardRisk = asNumber(confluence.rewardRisk);
  const grossRewardRisk = asNumber(confluence.grossRewardRisk);
  const weightAdjustment = asNumber(confluence.strategyWeightAdjustment);
  const sampleSize = asNumber(confluence.strategyWeightSampleSize);
  const providerWarnings = asStringArray(confluence.providerWarnings).concat(
    result?.providerWarnings ?? [],
  );
  const upcomingNewsEvents = Array.isArray(confluence.upcomingNewsEvents)
    ? confluence.upcomingNewsEvents.length
    : asNumber(newsContext.upcomingEvents) ?? 0;
  const headlineNewsEvents = asNumber(newsContext.headlineEvents) ?? 0;
  const timingRiskCount = upcomingNewsEvents + headlineNewsEvents;
  const strategyVotes = normalizeStrategyVotes(confluence.strategyVotes);
  const tickValidation = typeof orderConstruction.tickValidation === "string"
    ? orderConstruction.tickValidation
    : "";

  const items: QualityReceiptItem[] = [
    {
      detail: String(
        marketRegime.rationale ??
          "Market condition was included in the review.",
      ),
      label: "Market condition",
      value: formatStrategyName(String(marketRegime.name ?? "current")),
    },
    {
      detail: `Buy case ${
        formatMaybeNumber(consensus.buyScore)
      }/100, sell case ${formatMaybeNumber(consensus.sellScore)}/100, caution ${
        formatMaybeNumber(consensus.blockScore)
      }/100.`,
      label: "Direction",
      tone: setup.side === "buy" ? "bullish" : "danger",
      value: setup.side === "buy" ? "Buy view" : "Sell view",
    },
    {
      detail: [
        String(
          orderConstruction.validation ??
            "Entry is built as a limit order away from the latest close.",
        ),
        tickValidation,
      ].filter(Boolean).join(" "),
      label: "Order type",
      value: "Limit only",
    },
    {
      detail: String(
        riskModel.stopLogic ??
          "Stop uses price structure and a volatility buffer.",
      ),
      label: "Risk",
      value: "Stop checked",
    },
    {
      detail: String(
        riskModel.targetLogic ??
          "Target uses price structure, volatility, and payoff checks.",
      ),
      label: "Target",
      value: formatPayoff(rewardRisk),
    },
    {
      // Spec §16 deletes the scan rail's legend box, which carried the only
      // "cost-ratings" disclosure link in the app. The Costs row is where a
      // cost rating is actually explained, so the link lands here instead —
      // same treatment the Replay record row already uses.
      anchor: "cost-ratings",
      detail: buildExecutionDetail(
        executionQuality,
        grossRewardRisk,
        rewardRisk,
      ),
      label: "Trading costs",
      tone: asNumber(executionQuality.confidencePenalty) ? "danger" : "neutral",
      value: String(executionQuality.label ?? "Checked"),
    },
    {
      detail: `${String(sessionContext.label ?? "Session context")} ${
        timingRiskCount > 0
          ? `with ${timingRiskCount} event or headline ${
            timingRiskCount === 1 ? "factor" : "factors"
          } affecting timing.`
          : "with no event or headline penalty."
      }`,
      label: "Timing",
      tone: asNumber(sessionContext.penalty) ? "danger" : "neutral",
      value: asNumber(sessionContext.penalty) ? "Event risk" : "Clean",
    },
    ...buildReplayRecordItems(setup),
    {
      detail: sampleSize && sampleSize > 0
        ? `${sampleSize} finished setups included.`
        : "More finished setups are needed.",
      label: "Past results",
      tone: weightAdjustment && weightAdjustment > 0
        ? "bullish"
        : weightAdjustment && weightAdjustment < 0
        ? "danger"
        : "neutral",
      value: formatScoreAdjustment(weightAdjustment),
    },
  ];

  if (typeof macroRateContext.source === "string") {
    const rateAdjustment = asNumber(macroRateContext.adjustment);
    items.splice(7, 0, {
      detail: String(
        macroRateContext.detail ?? "Treasury-rate context was checked.",
      ),
      label: "Rates",
      tone: rateAdjustment && rateAdjustment < 0
        ? "danger"
        : rateAdjustment && rateAdjustment > 0
        ? "bullish"
        : "neutral",
      value: formatRateAdjustment(rateAdjustment),
    });
  }

  return {
    blockers: Array.from(new Set(providerWarnings)).slice(0, 3),
    items,
    strategyVotes,
  };
}

function buildReplayRecordItems(setup: AnalyzerSetup): QualityReceiptItem[] {
  const record = describeReplayRecord(
    getSecurityOption(setup.symbol).assetType,
  );
  if (!record) {
    return [];
  }
  return [{
    anchor: "replay-record",
    detail: record.detail,
    label: "Replay record",
    value: record.value,
  }];
}

function buildExecutionDetail(
  executionQuality: Record<string, unknown>,
  grossRewardRisk: number | null,
  rewardRisk: number | null,
) {
  const penalty = asNumber(executionQuality.confidencePenalty) ?? 0;
  const roundTripCost = asNumber(executionQuality.estimatedRoundTripCost);
  const spreadSource = String(executionQuality.spreadSource ?? "modeled");
  const gross = grossRewardRisk
    ? `${grossRewardRisk.toFixed(2)}x`
    : "gross payoff";
  const effective = rewardRisk
    ? `${rewardRisk.toFixed(2)}x`
    : "effective payoff";
  const costBasis = spreadSource === "quoted"
    ? "Current spread and estimated order cost"
    : "Estimated spread and order cost";
  const cost = roundTripCost
    ? `${costBasis} ${formatNumber(roundTripCost)}.`
    : `${costBasis} checked.`;

  return `${cost} Payoff after costs is ${effective}${
    grossRewardRisk && rewardRisk && gross !== effective
      ? ` instead of ${gross}`
      : ""
  }${penalty > 0 ? `, reducing confidence by ${penalty}.` : "."}`;
}

function normalizeStrategyVotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const vote = asRecord(item);
      return {
        direction: String(vote.direction ?? "neutral"),
        name: String(vote.name ?? "strategy"),
        score: asNumber(vote.score) ?? 0,
      };
    })
    .filter((vote) => vote.score > 0)
    .sort((first, second) => second.score - first.score);
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

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    )
    : [];
}

function formatMaybeNumber(value: unknown) {
  const number = asNumber(value);
  return number === null
    ? "Pending"
    : Number.isInteger(number)
    ? String(number)
    : number.toFixed(2);
}

function formatPayoff(value: number | null | undefined) {
  return value ? `${value.toFixed(2)}x payoff` : "Target pending";
}

function formatScoreAdjustment(value: number | null) {
  if (value === null) {
    return "Building";
  }
  if (value > 0) {
    return "Improving";
  }
  if (value < 0) {
    return "Cooling";
  }
  return "Neutral";
}

function formatRateAdjustment(value: number | null) {
  if (value === null || value === 0) {
    return "Checked";
  }
  return value > 0 ? "Supports" : "Caution";
}

function formatVoteSupport(direction: string) {
  if (direction === "buy") {
    return "Buy support";
  }
  if (direction === "sell") {
    return "Sell support";
  }
  if (direction === "block") {
    return "Caution";
  }
  return "Neutral";
}
