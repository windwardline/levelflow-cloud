-- Reset LevelFlow trade setup history for all users.
-- This intentionally clears logged setup ideas, their outcomes, generated
-- pending-order records, and learned weighting summaries so the app starts
-- measuring recommendations from a clean baseline from this migration forward.

do $$
begin
  if to_regclass('public.trade_outcomes') is not null then
    execute 'delete from public.trade_outcomes';
  end if;

  if to_regclass('public.trade_setups') is not null then
    execute 'delete from public.trade_setups';
  end if;

  if to_regclass('public.pending_orders') is not null then
    execute 'delete from public.pending_orders';
  end if;

  if to_regclass('public.strategy_weightings') is not null then
    execute 'delete from public.strategy_weightings';
  end if;

  if to_regclass('public.strategy_weightings_global') is not null then
    execute 'delete from public.strategy_weightings_global';
  end if;
end $$;
