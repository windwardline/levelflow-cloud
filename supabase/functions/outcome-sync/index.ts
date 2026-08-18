// Scheduled outcome resolution across all users.
//
// pg_cron calls this hourly with the shared sync token (the news-calendar
// pattern), so pending setups resolve on a clock instead of on traffic.
// This closes the correctness edge where a setup left pending longer than
// the bar-fetch lookback could misresolve, and keeps the learning cohort
// accumulating at full fidelity whether or not anyone visits.
import {
  evaluateSetupOutcome,
  fillOptionsFromRiskModel,
  resolutionSeriesFor,
  type ResolvedOutcome,
} from "../trade-analyzer/replay.ts";
import { fetchFmpBars } from "../trade-analyzer/marketLoader.ts";
import { resolveProviderSymbols } from "../trade-analyzer/symbols.ts";
import { recordAnalyzerEvent } from "../trade-analyzer/telemetry.ts";
import {
  adminDeleteRows,
  adminFetchRows,
  adminUpdateRows,
  adminUpsertRows,
  fetchWithTimeout,
  hasSupabaseAdminConfig,
} from "../trade-analyzer/supabaseRest.ts";
import type { Bar } from "../trade-analyzer/types.ts";

const NEWS_SYNC_TOKEN = Deno.env.get("NEWS_SYNC_TOKEN");
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
// Bounded per run; the hourly cadence clears any realistic backlog.
const MAX_SETUPS_PER_RUN = 300;
// OP-4: the cron invoker abandons its call at 15 seconds, so a run that
// keeps working past that reports as a timeout it never was — hourly
// false alarms at full roster. The budget keeps the RESPONSE under the
// invoker's ceiling; whatever the loop did not reach is stated in the
// summary and picked up by the next run in created_at order.
const RUN_BUDGET_MS = 12_000;
// OP-1: analyzer_events retention. Sixty days holds every operational
// investigation this repo has ever needed (the longest reached back
// eleven days); the prune is capped per run so it can never own the
// budget, and the count removed is reported, never silent.
const EVENT_RETENTION_DAYS = 60;
const EVENT_PRUNE_LIMIT = 5_000;

type PendingSetup = {
  analyzer_version: string | null;
  breakeven_trigger_price: number | string;
  confidence_score: number | string;
  created_at: string;
  id: string;
  limit_entry: number | string;
  provider_symbol: string | null;
  // The stored decision-time plan; its executionQuality drives the
  // venue-fill replay options (batch 4). Unknown-typed on purpose — the
  // options builder owns the validation.
  risk_model: unknown;
  side: "buy" | "sell";
  status: string;
  stop_loss: number | string;
  symbol: string;
  take_profit: number | string;
  take_profit_1: number | string | null;
  user_id: string;
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }
    if (!isAuthorized(req)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    if (!hasSupabaseAdminConfig() || !FMP_API_KEY) {
      return jsonResponse({
        error: "Outcome sync configuration is incomplete",
      }, 500);
    }

    const setups = await adminFetchRows<PendingSetup>(
      "trade_setups?select=id,user_id,symbol,provider_symbol,side," +
        "limit_entry,stop_loss,take_profit,take_profit_1,risk_model," +
        "breakeven_trigger_price,confidence_score,analyzer_version,status," +
        `created_at&status=in.(generated,placed)&order=created_at.asc&limit=${MAX_SETUPS_PER_RUN}`,
    );

    const summary = {
      failed: 0,
      pending: 0,
      placed: 0,
      resolved: 0,
      reviewed: 0,
      skippedForBudget: 0,
    };
    const startedAtMs = Date.now();
    const barsByProviderSymbol = new Map<string, Promise<Bar[]>>();

    for (const setup of setups) {
      if (Date.now() - startedAtMs > RUN_BUDGET_MS) {
        summary.skippedForBudget = setups.length - summary.reviewed;
        break;
      }
      summary.reviewed += 1;
      try {
        const providerSymbol = setup.provider_symbol ||
          resolveProviderSymbols(setup.symbol)[0];
        if (!providerSymbol) {
          summary.failed += 1;
          continue;
        }
        // E1 (R1a slice 2): both series per symbol, resolved on the
        // finest one that reaches the setup's creation — the sweep's own
        // tiering (FR-5), so live grading and the corpus share one
        // physics. A thrown fetch fails the setup for THIS run (transient
        // — the next hourly run retries with full fidelity) rather than
        // silently degrading the tier.
        for (const timeframe of ["15min", "5min"] as const) {
          const cacheKey = `${providerSymbol}:${timeframe}`;
          if (!barsByProviderSymbol.has(cacheKey)) {
            barsByProviderSymbol.set(
              cacheKey,
              fetchFmpBars(
                providerSymbol,
                timeframe,
                recordAnalyzerEvent,
                fetchWithTimeout,
              ),
            );
          }
        }
        const [fifteenMinute, fiveMinute] = await Promise.all([
          barsByProviderSymbol.get(`${providerSymbol}:15min`)!,
          barsByProviderSymbol.get(`${providerSymbol}:5min`)!,
        ]);
        const resolution = resolutionSeriesFor({
          createdAtMs: new Date(setup.created_at).getTime(),
          fifteenMinute,
          fiveMinute,
        });
        // Batch 4: the row's own decision-time costs drive the venue-fill
        // replay; a row without them resolves v1-style (empty options).
        // The interval override rides AFTER the spread so the tier chosen
        // above governs regardless of the bridge's default.
        const evaluation = evaluateSetupOutcome(
          setup,
          resolution.bars,
          Date.now(),
          {
            ...fillOptionsFromRiskModel(setup.risk_model),
            barIntervalMs: resolution.barIntervalMs,
          },
        );

        if (evaluation.state === "pending") {
          summary.pending += 1;
          continue;
        }

        if (evaluation.state === "placed") {
          summary.placed += 1;
          await markStatus(setup, "placed");
          await writeOutcome(setup, {
            feedback: evaluation.feedback,
            filledAt: evaluation.filledAt,
            outcome: "pending",
          });
          continue;
        }

        summary.resolved += 1;
        await markStatus(
          setup,
          evaluation.outcome === "unfilled" ? "expired" : "filled",
        );
        await writeOutcome(setup, {
          exitAt: evaluation.exitAt,
          feedback: evaluation.feedback,
          filledAt: evaluation.filledAt,
          outcome: evaluation.outcome,
        });
      } catch (error) {
        console.error("outcome sync setup failed", setup.id, error);
        summary.failed += 1;
      }
    }

    // A run that could not resolve part of what it read is not a success, and
    // the count of what it DID resolve does not buy it one: this job feeds the
    // entire learning cohort, on a clock, with nobody watching. The scan path
    // has treated `failed > 0` alone as a failure since spec §17m.2; the same
    // sentence applies here for the same reason.
    //
    // Saturation is stated rather than left to be inferred from
    // `reviewed === 300`: a run that hit its own ceiling has a backlog behind
    // it, and the next hourly run may not clear it either.
    // OP-1: age out events beyond retention, bounded per run, count
    // reported. Runs after the budget broke the loop still prune — the
    // prune is one bounded request, not another loop.
    let prunedEvents = 0;
    let pruneFailed = false;
    try {
      const cutoff = new Date(
        Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const pruned = await adminDeleteRows<{ id: string }>(
        `analyzer_events?created_at=lt.${
          encodeURIComponent(cutoff)
        }&order=created_at.asc&limit=${EVENT_PRUNE_LIMIT}`,
      );
      prunedEvents = pruned.length;
    } catch (error) {
      pruneFailed = true;
      console.error("analyzer_events prune failed", error);
    }

    const saturated = setups.length >= MAX_SETUPS_PER_RUN ||
      summary.skippedForBudget > 0;
    await recordAnalyzerEvent({
      action: "outcome_sync",
      message: summary.failed > 0
        ? `${summary.failed} of ${summary.reviewed} setups could not be resolved.`
        : null,
      metadata: { ...summary, pruneFailed, prunedEvents, saturated },
      status: summary.failed > 0 ? "error" : "success",
    });

    return jsonResponse({ ...summary, saturated, scheduled: true });
  } catch (error) {
    console.error("outcome sync failed", error);
    return jsonResponse({ error: "Outcome sync failed." }, 500);
  }
});

function isAuthorized(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(NEWS_SYNC_TOKEN && token === NEWS_SYNC_TOKEN);
}

// C1: filtered on the status the row carried when this run read it, which makes
// the write a compare-and-set. A user's scan can rewrite the same setup's levels
// and reset its status to `generated` between the read and here; without the
// filter this verdict would land on geometry it was never computed from, and the
// row would then be re-resolved and the verdict overwritten. Zero rows means the
// race was lost, and it is thrown so the run counts the setup as failed — a
// silent partial resolution is exactly what the cohort cannot afford.
async function markStatus(
  setup: PendingSetup,
  status: "expired" | "filled" | "placed",
) {
  const updatedRows = await adminUpdateRows(
    `trade_setups?id=eq.${
      encodeURIComponent(setup.id)
    }&status=eq.${encodeURIComponent(setup.status)}`,
    { status },
  );

  if (updatedRows.length === 0) {
    throw new Error(
      `status flip to ${status} matched no rows for setup ${setup.id} — it changed after it was read`,
    );
  }
}

async function writeOutcome(
  setup: PendingSetup,
  outcome: {
    exitAt?: string;
    feedback: Record<string, unknown>;
    filledAt?: string;
    outcome: ResolvedOutcome;
  },
) {
  await adminUpsertRows(
    "trade_outcomes",
    {
      analyzer_version: setup.analyzer_version ?? "unversioned",
      exit_at: outcome.exitAt ?? null,
      feedback: {
        ...outcome.feedback,
        confidenceScore: setup.confidence_score,
        side: setup.side,
        symbol: setup.symbol,
      },
      filled_at: outcome.filledAt ?? null,
      outcome: outcome.outcome,
      realized_pnl: null,
      reviewed_at: new Date().toISOString(),
      setup_id: setup.id,
      user_id: setup.user_id,
    },
    "setup_id",
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
