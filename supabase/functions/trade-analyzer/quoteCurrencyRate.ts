import { completedDailySeries } from "./dailyCompletion.ts";
import { redactProviderSecrets } from "./redact.ts";
import { visibleQuoteCurrencyUsd } from "./sweep.ts";
import { quoteCurrencyUsdLeg } from "./symbols.ts";
import type { Bar, QuoteCurrencyUsd } from "./types.ts";

/**
 * The live half of the cross commission's rate (2026-09-14): USD per unit
 * of a forex cross's quote currency, from its USD leg's previous COMPLETED
 * daily close — the same bar, behind the same completion gate, the sweep
 * reads from the pinned cache, so what is measured is what trades.
 *
 * Pure: the caller supplies the leg's daily bars through `loadDaily` (the
 * live loader's `fetchFmpBars` through the bar store, which buys only a
 * missing tail) and the clock. Memoised per scan request by leg, holding the
 * PROMISE so concurrent first callers under mapWithConcurrency share one
 * load; the client splits a scan into several requests, and across those the
 * bar store itself is the memo.
 *
 * Three answers, never a fourth: `none` (the currency table says no rate is
 * needed), `rate`, or `unavailable` with the leg named and the failure text
 * scrubbed at birth — it reaches analyzer_events metadata, which the
 * telemetry choke point does not scrub.
 */
export type QuoteCurrencyRateMemo = Map<string, Promise<QuoteCurrencyUsd | null>>;

export type QuoteCurrencyRateResolution =
  | { kind: "none" }
  | { kind: "rate"; rate: QuoteCurrencyUsd }
  | { detail: string; kind: "unavailable"; leg: string };

export async function resolveQuoteCurrencyUsd(input: {
  loadDaily: (legSymbol: string) => Promise<Bar[]>;
  memo: QuoteCurrencyRateMemo;
  nowMs: number;
  symbol: string;
}): Promise<QuoteCurrencyRateResolution> {
  const leg = quoteCurrencyUsdLeg(input.symbol);
  if (leg.kind === "none") return { kind: "none" };
  if (leg.kind === "missing") {
    return {
      detail: `quote currency ${leg.currency} has no USD leg on the roster`,
      kind: "unavailable",
      leg: `none for ${leg.currency}`,
    };
  }
  let pending = input.memo.get(leg.leg);
  if (!pending) {
    pending = (async () => {
      const bars = await input.loadDaily(leg.leg);
      // The sweep's own walk: the completed series, the last entry whose
      // completion instant is at or before now. `legCloseAtMs` is that
      // completion instant on both paths.
      const completed = completedDailySeries(leg.leg, bars).filter((entry) => entry.completeAtMs <= input.nowMs);
      return visibleQuoteCurrencyUsd(leg.leg, leg.usdIsBase, completed, completed.length);
    })();
    input.memo.set(leg.leg, pending);
  }
  try {
    const rate = await pending;
    if (rate === null) {
      return { detail: "no completed daily bar", kind: "unavailable", leg: leg.leg };
    }
    return { kind: "rate", rate };
  } catch (error) {
    return {
      detail: redactProviderSecrets(error instanceof Error ? error.message : String(error)),
      kind: "unavailable",
      leg: leg.leg,
    };
  }
}
