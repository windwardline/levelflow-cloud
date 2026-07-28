-- Reset LevelFlow trade history for all users ahead of the
-- window-feasible ladder model (2026.07.28.window-feasible-ladder).
-- The prior geometry produced targets the review window could not reach,
-- so its setups, outcomes, and learned weightings are not trustworthy
-- calibration data. Tracking restarts clean from this migration forward.

do $$
begin
  if to_regclass('public.trade_outcomes') is not null then
    execute 'delete from public.trade_outcomes';
  end if;

  if to_regclass('public.trade_setups') is not null then
    execute 'delete from public.trade_setups';
  end if;

  if to_regclass('public.strategy_weightings_global') is not null then
    execute 'delete from public.strategy_weightings_global';
  end if;
end $$;
