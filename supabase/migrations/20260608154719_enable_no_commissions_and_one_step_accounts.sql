alter table public.e8_programs
  drop constraint if exists e8_programs_raw_spreads_required,
  drop constraint if exists e8_programs_no_commissions_disabled;

alter table public.e8_account_sizes
  drop constraint if exists e8_account_sizes_raw_spreads_required,
  drop constraint if exists e8_account_sizes_no_commissions_disabled;

alter table public.user_accounts
  drop constraint if exists user_accounts_raw_spreads_required,
  drop constraint if exists user_accounts_no_commissions_disabled;

update public.e8_programs
set
  raw_spreads_enabled = true,
  no_commissions_enabled = true,
  no_commissions_selectable = true;

update public.e8_account_sizes
set
  raw_spreads_enabled = true,
  no_commissions_enabled = true,
  no_commissions_selectable = true,
  phase_two_required = false;

update public.user_accounts
set
  stage = case
    when stage in ('phase_1'::public.account_stage, 'phase_2'::public.account_stage) then 'evaluation'::public.account_stage
    else stage
  end,
  raw_spreads_enabled = case
    when no_commissions_enabled then false
    else true
  end;

create or replace function private.validate_user_account_config()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cfg public.e8_account_sizes%rowtype;
begin
  select *
  into cfg
  from public.e8_account_sizes
  where id = new.account_size_id;

  if not found then
    raise exception 'Unknown E8 account_size_id: %', new.account_size_id;
  end if;

  if new.program_code is null then
    new.program_code = cfg.program_code;
  end if;

  if new.program_code <> cfg.program_code then
    raise exception 'Program code % does not match account size %', new.program_code, new.account_size_id;
  end if;

  if new.initial_balance is null then
    new.initial_balance = cfg.balance;
  end if;

  if new.initial_balance <> cfg.balance then
    raise exception 'Initial balance % does not match configured account balance %', new.initial_balance, cfg.balance;
  end if;

  if new.current_balance is null then
    new.current_balance = new.initial_balance;
  end if;

  if new.current_equity is null then
    new.current_equity = new.current_balance;
  end if;

  if new.current_balance <= 0 or new.current_equity <= 0 then
    raise exception 'Current balance and current equity must be greater than zero';
  end if;

  if new.payout_pct is null then
    new.payout_pct = cfg.default_payout_pct;
  end if;

  if not (new.payout_pct = any(cfg.payout_options)) then
    raise exception 'Payout % is not available for account size %', new.payout_pct, new.account_size_id;
  end if;

  new.no_commissions_enabled = coalesce(new.no_commissions_enabled, false);
  if new.no_commissions_enabled and not cfg.no_commissions_selectable then
    raise exception 'No Commissions is not available for account size %', new.account_size_id;
  end if;

  new.raw_spreads_enabled = not new.no_commissions_enabled;

  if new.stage in ('phase_1'::public.account_stage, 'phase_2'::public.account_stage) then
    new.stage = 'evaluation'::public.account_stage;
  end if;

  new.daily_drawdown_limit = round(new.initial_balance * (cfg.daily_drawdown_pct / 100), 2);
  new.max_drawdown_limit = round(new.initial_balance * (coalesce(cfg.static_drawdown_pct, cfg.dynamic_drawdown_pct) / 100), 2);

  return new;
end;
$$;
