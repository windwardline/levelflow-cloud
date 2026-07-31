-- Every generated setup is now persisted, scan path included (design doc
-- levelflow-desk-design.md §9). `origin` records which entry point wrote
-- the row so global learning can train on setups a human actually
-- reviewed and treat scan sweeps as record, not signal.

alter table public.trade_setups
  add column if not exists origin text not null default 'review'
    check (origin in ('review', 'scan'));
