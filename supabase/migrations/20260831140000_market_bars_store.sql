-- The shared bar store: stop re-buying history that cannot change.
--
-- Every scan re-fetched the entire window from FMP. Measured 2026-08-31:
-- 11,470 bars per market per scan across the five decision frames, ~1.72 MB,
-- and ~167 MB for a full 97-market scan. Those bars are IMMUTABLE — a
-- 15-minute bar from last Tuesday never changes — so the account was paying
-- for the same four years of daily history on every scan, forever, and FMP
-- bills bytes over a trailing 30 days.
--
-- The in-memory `candleCache` in marketLoader.ts cannot fix this. It is a
-- module-level Map inside an ephemeral Edge instance, so it is cold on every
-- cold start and never shared between instances or between the analyzer, the
-- chart feed and outcome-sync.
--
-- RAW PROVIDER ROWS, NEVER NORMALIZED BARS. `.minute-bank` already holds this
-- line ("the provider's own string, unparsed and unconverted") and it is
-- load-bearing three ways:
--
--   1. BAR_CLOCK is on its fourth revision. Normalized bars are stamped under
--      one, and a top-up-only store of normalized items is named in
--      calibrationCache.ts as the exact mechanism of the 2026-08-11
--      mixed-clock corpus. Raw rows carry the provider's own string, so a
--      future clock re-derives from them with zero FMP bytes.
--   2. `normalizeFmpBars`' spike guard reads each bar's NEIGHBOURS, so a
--      short chunk normalized alone gets no spike check at all. Persisting
--      that is how a 135,533% bar gets cemented — this time into live stop
--      placement rather than a research corpus. Storing raw and normalizing
--      over the merged window means the guard always sees both neighbours.
--   3. A revision to a settled bar supersedes on `provider_date`, because the
--      fresher row wins the merge. Normalized storage would have to detect
--      and rewrite it.
--
-- `provider_date` is FMP's own fixed-width string, so it sorts
-- lexicographically in chronological order within a timeframe and needs no
-- derived timestamp column to page from.
create table public.market_bars (
  provider_symbol text not null,
  timeframe text not null,
  provider_date text not null,
  open double precision not null,
  high double precision not null,
  low double precision not null,
  close double precision not null,
  volume double precision not null default 0,
  -- Provenance only. Nothing branches on it; it exists so a human can see when
  -- a row was bought without inferring it from the data.
  fetched_at timestamptz not null default now(),
  primary key (provider_symbol, timeframe, provider_date)
);

-- NOTHING FOR ANY CLIENT ROLE — not even select.
--
-- Stronger than the case that closed `trade_setups` in 20260807010000 and
-- `anon` in 20260811190000. A client write here rewrites the price history
-- from which every operator's entry, stop and ladder are computed AT
-- GENERATION TIME, not a `confidence_adjustment` consumed downstream. Both
-- roles are named in one statement so neither can be missed the way `anon`
-- was the first time.
alter table public.market_bars enable row level security;
revoke all on public.market_bars from anon, authenticated;

-- Retention: the store holds what the decode caps read, plus headroom.
-- `maxBarsForTimeframe` decodes up to 3,000 (15min) and `findSwingPivots`
-- reads the WHOLE array into the stop and the ladder, so retention is a
-- money-path input rather than an operational detail — pruning below the cap
-- would change which pivots exist and therefore which stops are chosen.
create index market_bars_prune_idx
  on public.market_bars (provider_symbol, timeframe, provider_date desc);

comment on table public.market_bars is
  'Raw FMP bar rows, verbatim. Engine-written via the service role, readable '
  'by no client role. Normalization happens at read time over the merged '
  'window so the spike guard sees every bar''s neighbours; storing normalized '
  'bars would strand them on one BAR_CLOCK revision.';
