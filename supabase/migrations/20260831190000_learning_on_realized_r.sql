-- Global learning learns on MONEY, not on how often it arrived.
--
-- Amendment 39 (2026-08-27): profit is the measure, win rate is a result, and
-- nothing may publish, rank, gate or LEARN on a frequency where the underlying
-- money is knowable. It is knowable here — `replay.ts` writes `netRealizedR`
-- into every resolution's feedback — and this table's `confidence_adjustment`
-- was derived from a win rate against a neutral point of 0.5.
--
-- 0.5 is break-even only when a win and a loss are the same size. On the
-- ladder they are not: a `tp1_partial` banks the partial and the runner then
-- exits at entry, while a `take_profit` banks that AND carries the runner half
-- to a target at least `minimumTargetRewardRisk` away. Both increment `wins`.
-- Derived from shipped calibration: a cohort winning 65% of the time, of which
-- 65% are partials, means -0.0055R on forex and -0.049R on indices. It wins
-- two in three, shrinks the account, and the retired curve paid it +3
-- confidence.
--
-- In R the neutral point is 0 — the definition of break-even rather than a
-- constant that happens to fit — which retires the per-market pivot problem
-- instead of solving it.
--
-- NULLABLE, and that is a distinction the column has to carry. A cohort with
-- no resolutions carrying realized R has no mean, and 0 is a real value
-- meaning break-even. Storing the absence as 0 would make an unmeasured cohort
-- indistinguishable from one measured at exactly break-even, which is the same
-- collapse the win rate made between a partial and a full win.
alter table public.strategy_weightings_global
  add column if not exists mean_realized_r numeric(8,4),
  -- The 95% interval bound NEAREST ZERO — what `confidence_adjustment` is
  -- actually computed from, stored so the score can be audited. A +1.8 could
  -- be a strong cohort heavily discounted for thin evidence or a modest one
  -- barely discounted, and a reader owed a reason cannot tell those apart from
  -- the adjustment alone.
  add column if not exists conservative_mean_r numeric(8,4),
  -- Counted separately from `total_setups` on purpose: a resolution can be
  -- counted in the cohort and still carry no usable realized R, and folding
  -- those in as zeroes would drag every cohort toward the neutral point it is
  -- being measured against.
  add column if not exists realized_r_count integer not null default 0
    check (realized_r_count >= 0);

comment on column public.strategy_weightings_global.mean_realized_r is
  'Mean netRealizedR over every FILLED resolution in the cohort, including '
  'expiries. Null when none carried a usable figure. Reported, never scored '
  'directly - conservative_mean_r is what confidence_adjustment derives from.';

comment on column public.strategy_weightings_global.conservative_mean_r is
  'The end of the mean''s 95% interval nearest zero, so a cohort is scored on '
  'the least flattering reading its own data supports, in both directions. '
  'Null below 30 resolutions, where a normal multiplier overstates the '
  'evidence.';

-- Retired weights are left exactly as they are.
--
-- Every existing row sits at a superseded `analyzer_version`, and the read at
-- index.ts filters on the current one, so none of them can reach live scoring.
-- Rewriting history to the new measure would invent figures no corpus
-- produced; the version boundary is the mechanism that makes that unnecessary.
