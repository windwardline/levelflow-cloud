-- Clean slate for the binary measured menu (2026.07.30.binary-menu).
-- Owner directive, round 16: every user restarts with the current engine's
-- record only. History accumulated under earlier calibrations (through
-- 2026.07.30.measured-menu) mixes verdicts from retired geometry and a
-- wider menu, so setups, outcomes, and learned weightings all reset here.
-- Sessions are revoked in the same breath: refresh stops immediately and
-- access tokens age out within the hour, so everyone re-enters through a
-- fresh sign-in on the new slate. Nothing else (profiles, preferences,
-- auth identities) is touched.

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

  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens';
  end if;

  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions';
  end if;
end $$;
