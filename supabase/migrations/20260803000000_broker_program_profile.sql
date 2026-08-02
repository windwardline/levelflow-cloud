-- Spec §19g. One migration, wave 1, carrying every column §19 and §20 need so
-- wave 2 needs no second migration. Every column is nullable and every default is
-- null, so this is a no-op for every existing profile — None is the absence of a
-- selection, not a stored value, and no backfill runs.
--
-- Tier membership, and the account size's membership in the selected program's
-- ladder, are enforced by src/lib/broker/programs.ts and the write path, not by
-- SQL: duplicating the ladders and tier lists in check constraints would let them
-- drift from the modules CI pins.
--
-- RLS needs nothing new. profiles already carries own-row select, insert and
-- update policies, and these are columns on a row the user already owns.

alter table public.profiles
  add column if not exists broker_id text,
  add column if not exists broker_program_line text,
  add column if not exists broker_account_size numeric(14,2),
  add column if not exists broker_stage text,
  add column if not exists broker_risk_percent numeric(4,2),
  add column if not exists broker_drawdown_tier text;

alter table public.profiles
  drop constraint if exists profiles_broker_id_valid,
  drop constraint if exists profiles_broker_program_line_valid,
  drop constraint if exists profiles_broker_stage_valid,
  drop constraint if exists profiles_broker_account_size_positive,
  drop constraint if exists profiles_broker_risk_percent_range,
  drop constraint if exists profiles_broker_selection_coherent;

alter table public.profiles
  add constraint profiles_broker_id_valid
    check (broker_id is null or broker_id in ('e8')),
  add constraint profiles_broker_program_line_valid
    check (broker_program_line is null or broker_program_line in (
      'one', 'one_crypto', 'pro_forex', 'pro_crypto',
      'signature_forex', 'signature_crypto', 'signature_futures',
      'zero', 'zero_futures_starter', 'zero_futures_max')),
  add constraint profiles_broker_stage_valid
    check (broker_stage is null or broker_stage in ('challenge', 'performance')),
  add constraint profiles_broker_account_size_positive
    check (broker_account_size is null or broker_account_size > 0),
  add constraint profiles_broker_risk_percent_range
    check (broker_risk_percent is null
           or (broker_risk_percent >= 0.10 and broker_risk_percent <= 1.50)),
  -- broker_drawdown_tier is exempt from the non-null half: it is meaningful only
  -- on the four customizable lines and must be null on the other six, whose
  -- parameters are preset and published per size.
  add constraint profiles_broker_selection_coherent
    check (
      (broker_id is null and broker_program_line is null
        and broker_account_size is null and broker_stage is null
        and broker_risk_percent is null and broker_drawdown_tier is null)
      or (broker_id is not null and broker_program_line is not null
        and broker_account_size is not null and broker_stage is not null
        and broker_risk_percent is not null)
    );
