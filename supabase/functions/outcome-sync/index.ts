// Scheduled outcome resolution across all users.
//
// pg_cron calls this hourly with the shared sync token (the news-calendar
// pattern), so pending setups resolve on a clock instead of on traffic.
// This closes the correctness edge where a setup left pending longer than
// the bar-fetch lookback could misresolve, and keeps the learning cohort
// accumulating at full fidelity whether or not anyone visits.
import {
  evaluateSetupOutcome,
  type ResolvedOutcome,
} from "../trade-analyzer/replay.ts";
import { fetchFmpBars } from "../trade-analyzer/marketLoader.ts";
import { resolveProviderSymbols } from "../trade-analyzer/symbols.ts";
import { recordAnalyzerEvent } from "../trade-analyzer/telemetry.ts";
import {
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

type PendingSetup = {
  analyzer_version: string | null;
  breakeven_trigger_price: number | string;
  confidence_score: number | string;
  created_at: string;
  id: string;
  limit_entry: number | string;
  provider_symbol: string | null;
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
        "limit_entry,stop_loss,take_profit,take_profit_1," +
        "breakeven_trigger_price,confidence_score,analyzer_version,status," +
        `created_at&status=in.(generated,placed)&order=created_at.asc&limit=${MAX_SETUPS_PER_RUN}`,
    );

    const summary = {
      failed: 0,
      pending: 0,
      placed: 0,
      resolved: 0,
      reviewed: 0,
    };
    const barsByProviderSymbol = new Map<string, Promise<Bar[]>>();

    for (const setup of setups) {
      summary.reviewed += 1;
      try {
        const providerSymbol = setup.provider_symbol ||
          resolveProviderSymbols(setup.symbol)[0];
        if (!providerSymbol) {
          summary.failed += 1;
          continue;
        }
        if (!barsByProviderSymbol.has(providerSymbol)) {
          barsByProviderSymbol.set(
            providerSymbol,
            fetchFmpBars(
              providerSymbol,
              "15min",
              recordAnalyzerEvent,
              fetchWithTimeout,
            ),
          );
        }
        const bars = await barsByProviderSymbol.get(providerSymbol)!;
        const evaluation = evaluateSetupOutcome(setup, bars);

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

    await recordAnalyzerEvent({
      action: "outcome_sync",
      metadata: summary,
      status: summary.failed > 0 && summary.resolved === 0
        ? "error"
        : "success",
    });

    return jsonResponse({ ...summary, scheduled: true });
  } catch (error) {
    console.error("outcome sync failed", error);
    return jsonResponse({ error: "Outcome sync failed." }, 500);
  }
});

function isAuthorized(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(NEWS_SYNC_TOKEN && token === NEWS_SYNC_TOKEN);
}

async function markStatus(
  setup: PendingSetup,
  status: "expired" | "filled" | "placed",
) {
  await adminUpdateRows(
    `trade_setups?id=eq.${encodeURIComponent(setup.id)}`,
    { status },
  );
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
