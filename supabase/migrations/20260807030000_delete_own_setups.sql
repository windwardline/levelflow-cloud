-- Deleting your own setups, restored as a narrow capability.
--
-- 20260807010000 revoked insert/update/delete on trade_setups from
-- `authenticated`, because the learning aggregate reads that table with the
-- service role and no user_id predicate — so one account could fabricate the
-- whole corpus and set any setup_key's confidence_adjustment for every user.
-- That reasoning is about WRITES THAT CREATE ROWS, and it stands.
--
-- Deleting your own rows is a different act and not that attack: it can only
-- remove rows the caller created through the analyzer, which is authenticated,
-- rate-limited and version-stamped. It cannot insert a fabricated outcome, and
-- it cannot touch another user's data.
--
-- It is also a capability the product genuinely needs. The E2E teardown deletes
-- its own setups so CI rows never train the model — the exact corpus the revoke
-- was protecting — and CI holds no service-role key. Reaching for one there
-- would put a key that bypasses RLS entirely into the browser-test job to solve
-- a problem that wants the narrowest possible tool.
--
-- SECURITY DEFINER because the grant is gone; `auth.uid()` inside the function
-- is what scopes it, so the caller's identity is the filter and no argument can
-- widen it. There is deliberately no user_id parameter: a function that takes
-- one is a function someone can pass another user's id to.
create or replace function public.delete_own_trade_setups()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted integer;
begin
  if auth.uid() is null then
    raise exception 'delete_own_trade_setups requires an authenticated caller';
  end if;

  -- trade_outcomes carries `on delete cascade` on setup_id, so the outcome rows
  -- leave with their setups and no second grant is needed.
  delete from public.trade_setups where user_id = (select auth.uid());
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.delete_own_trade_setups() from public, anon;
grant execute on function public.delete_own_trade_setups() to authenticated;
