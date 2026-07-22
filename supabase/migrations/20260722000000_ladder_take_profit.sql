-- Ladder targets: TP1 partial-profit support and honest expiry outcomes.
-- TP1 is the window-scaled first target; the existing take_profit column
-- holds the structural runner target. Filled setups that expire without
-- touching stop or target now resolve to expired_in_profit/expired_at_loss
-- instead of the ambiguous catch-all.

alter type public.trade_outcome_status add value if not exists 'tp1_partial';
alter type public.trade_outcome_status add value if not exists 'expired_in_profit';
alter type public.trade_outcome_status add value if not exists 'expired_at_loss';

alter table public.trade_setups
  add column if not exists take_profit_1 numeric(18,8)
    check (take_profit_1 is null or take_profit_1 > 0);
