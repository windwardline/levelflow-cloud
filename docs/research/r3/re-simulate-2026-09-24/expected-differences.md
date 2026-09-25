# Re-simulate 2026-09-24: expected differences, written BEFORE the run

Recipe: the 2026-09-14 re-simulate's (armed-corpus.sh): --anchor 2026-08-26 --days 7000
--symbols roster --capture-all --fold-spec docs/research/r3/fold-spec-2026-08-26.json
--grid "runnerProtection=breakeven,hold,trail_tp1;stopStructureSource=intraday,intraday_and_daily"
--byte-budget 1MB, pinned cache, zero provider bytes. Code: main d919615 (clean detached worktree),
engine 2026.09.23.expiry-exit-slippage. Baseline for comparison: capture-all-classfolds-2026-09-14
(main 5228332, engine 2026.09.13.forex-commission-usd-quote, manifest 2bd117256d48).

Engine bumps between the two, and what each should move:

1. 2026.09.14.forex-commission-cross-rate (#641). The 21 forex crosses charge commission from
   the USD leg's previous completed daily close. Only cross rows move: commission and every field
   downstream of it (estimatedRoundTripCost, costShare, the R columns), `accepted` flips at the
   0.15 cap in both directions, a new `usdPerQuote` column on every row, and crosses with no rate
   refused as `commission_rate_unavailable` into the rejection sidecar. Non-cross rows: no change
   from this bump beyond the new column.
2. 2026.09.23.stop-exit-slippage (#689). Every filled leg that exits at a stop that did not gap
   prints with the modelled slippage against the position: net and arming-bound R fall; gross R
   (commission only, no modelled spread or slippage) should not move. Outcome labels that follow
   the sign of R may flip.
3. 2026.09.23.expiry-exit-slippage (#692). The review-end close prints with the modelled
   slippage: same columns as (2), on rows that close at review end.

Rows expected byte-identical after stripping `usdPerQuote`: every row of a non-cross market whose
legs exit only at targets or not at all (unfilled). Any other difference is unexplained and blocks
promotion until attributed.

Arm 2 (--ignore-low-edge) has no baseline at this engine; it is compared with arm 1 only, and
must equal arm 1 on every row outside a low-edge window, with extra rows inside those windows.
