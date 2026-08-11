-- Item 0.5's residual, closed (audit 2026-08-11).
--
-- 20260807010000 closed the client write surface on the engine-owned
-- tables for `authenticated` and stopped there. `anon` was never
-- revoked. The grants are INERT today — RLS is enabled on both tables
-- and every policy on them is `to authenticated`, so an unauthenticated
-- caller is refused by policy before a grant is ever consulted — which
-- is exactly why this is worth doing now rather than after someone adds
-- a permissive policy and discovers the grant underneath it.
--
-- AGENTS.md's law: trade_setups and trade_outcomes are engine-written,
-- client-read; every write runs on the service role. `anon` is a client
-- role, so it holds nothing here. Revoking a grant that may not exist
-- is a no-op in Postgres, so this is safe on any prior state.
revoke insert, update, delete on public.trade_setups from anon;
revoke insert, update, delete on public.trade_outcomes from anon;
revoke insert, update, delete on public.system_notices from anon;

-- anon has no reason to read them either: the app authenticates before
-- any setup is fetched, and the parking page reads nothing.
revoke select on public.trade_setups from anon;
revoke select on public.trade_outcomes from anon;
