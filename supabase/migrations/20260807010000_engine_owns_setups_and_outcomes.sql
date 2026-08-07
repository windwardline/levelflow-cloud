-- The engine is the only legitimate author of a setup or an outcome.
--
-- Until now `authenticated` held insert, update and delete on both
-- `trade_setups` and `trade_outcomes`. RLS scoped those to the caller's own
-- rows — which was the whole problem, because own rows are all that is needed:
--
--   * `refreshGlobalStrategyWeights` reads `trade_outcomes` with the SERVICE
--     ROLE and no `user_id` predicate, ordered by `reviewed_at desc` limit 2500.
--     `reviewed_at` is a plain user-writable timestamptz.
--   * `setup_key` is read straight off `trade_setups.confluence`, a user-writable
--     jsonb column.
--   * The resulting `confidence_adjustment` is applied to scoring at runtime for
--     EVERY user.
--
-- So one account could insert 2,500 fabricated outcomes carrying a chosen
-- `setupKey` and a future-dated `reviewed_at`, evict every genuine row from the
-- aggregation window, and drive that key to +10 or -10 for everyone on the
-- platform. Nothing logged it, and nothing distinguished a fabricated outcome
-- from a replayed one.
--
-- The fix is to stop asking RLS to defend a table the product never writes from
-- the client. Every write in trade-analyzer/index.ts already passes an explicit
-- `user_id` — RLS was defence in depth over a filter the code applies itself,
-- never the thing doing the scoping — so those five writes moved to the service
-- role in the same change set, and the client grant goes away entirely.
--
-- Verified before writing this: all three frontend uses of these tables in
-- src/lib/tradeAnalyzer.ts are `.select()`. Nothing in the app writes them.
-- `outcome-sync` already wrote both through the admin client.
--
-- SELECT is untouched, so the Desk, the rail and Insights read exactly as
-- before, still scoped by the existing own-row policies.

revoke insert, update, delete on public.trade_setups from authenticated;
revoke insert, update, delete on public.trade_outcomes from authenticated;

-- `system_notices` carries the same unnecessary write surface: no code in
-- src/ or supabase/functions/ reads or writes it, while its SELECT policy
-- exposes every `user_id is null` row globally. Nothing can forge a global
-- notice today (the insert policy's `with check` refuses a null user_id), but
-- the next person to build a notices writer would inherit an already-open
-- write grant. When that writer is built it uses the admin client, like every
-- other system writer.
revoke insert, update, delete on public.system_notices from authenticated;
