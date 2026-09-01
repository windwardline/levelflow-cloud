/**
 * The FMP budget's database wiring, in one place.
 *
 * Separate from `fmpBudget.ts` for the reason `barStoreDb.ts` is separate from
 * `barStore.ts`: that module holds the decision logic and must never reach a
 * Deno global, so every branch of it is testable without a database. This one
 * is the boundary, and it is shared — the analyzer, the chart feed and the
 * calendar call the SAME functions, so none of them can drift into its own
 * idea of what the ledger looks like.
 */
import { adminRpcRows } from "./supabaseRest.ts";
import type { FmpBudgetDeps } from "./fmpBudget.ts";

export function fmpBudgetDeps(): FmpBudgetDeps {
  return {
    claim: (consumerClass, dailyLimitBytes) =>
      adminRpcRows("claim_fmp_bytes", {
        p_consumer_class: consumerClass,
        p_daily_limit_bytes: dailyLimitBytes,
      }),
    record: async (consumerClass, bytes) => {
      await adminRpcRows("record_fmp_usage", {
        p_bytes: bytes,
        p_consumer_class: consumerClass,
      });
    },
  };
}
