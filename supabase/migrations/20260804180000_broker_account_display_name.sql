-- The rename the TASK 6 VERDICT ruled (formula as the always-valid default,
-- rename as the override) but no retrofit task built: the column the override
-- lives in. Additive and expand-only — absent stays null, and null means the
-- formula labels the account. The cap is the verdict's measured 14 (a 16-char
-- worst-glyph rename rendered the full 211px chip budget with zero clearance),
-- enforced here with the same check idiom the table's enums use so a second
-- client cannot write a name the header cannot afford.
alter table public.broker_accounts
  add column if not exists display_name text;

alter table public.broker_accounts
  drop constraint if exists broker_accounts_display_name_cap;

alter table public.broker_accounts
  add constraint broker_accounts_display_name_cap
    check (
      display_name is null
      or char_length(display_name) between 1 and 14
    );
