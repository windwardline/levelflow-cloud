# The ladder mirror control: the shipped entry has no direction, and the one positive window is a lock at TP1 (2026-09-27)

**The question** (from the [converge](/docs/research/converge-route-to-profit-2026-09-27.md)). On
contained years forex's shipped ladder earns a positive pre-cost expectancy under every exit, while
the random-entry excursion screen finds the entry carries no direction. Is the pre-cost edge
direction, or the ladder meeting the feed?

**The answer.** It is not direction. A mirrored plan on the opposite side, with the same geometry,
earns 81–92 % of what the shipped side earns before costs. The one window where the edge survives full cost, 16–21 UTC, is worth almost
nothing unless the runner's stop moves to TP1 inside the bar that fills TP1. Whether the desk can
instruct that is an execution question for the owner.

## Method

Every forex fit and select row that is baseline and accepted was used, unfilled included: 355,722
decisions. For each, the shipped plan S was rebuilt from the row's own fields. The mirror M reflects
entry, stop, TP1 and target about the decision bar's close and takes the opposite side, with the same
risk distance and review window. Both were resolved through the engine's own `evaluateSetupOutcome`,
with the sweep's bar slice and options, on the pinned 5-minute series at the corpus anchor. Zero
provider bytes; the confirm fold withheld at the door and the split checked before any other field
([extract](/docs/research/r3/mirror-2026-09-27/extract.mts.txt),
[resolve](/docs/research/r3/mirror-2026-09-27/resolve.mts.txt)).

Under a symmetric random walk S and M have one distribution. So the paired S − M isolates direction,
and (S + M)/2 isolates what any side would earn.

**The anchor held on every row.** S reproduced the row's outcome, realizedR, arming-bound and gross
fields, legs and exit times: 15 fields to 1e-9 and one identity check to 1e-4, on 355,722 rows, with 0
mismatches. The tables below exclude the 278 rows with no bars in their window
([anchor](/docs/research/r3/mirror-2026-09-27/anchor.json.txt)). Four deliberate code mutations each
broke it and stopped the run before any mirror figure printed
([A](/docs/research/r3/mirror-2026-09-27/mutation-mA.log.txt),
[B](/docs/research/r3/mirror-2026-09-27/mutation-mB.log.txt),
[C](/docs/research/r3/mirror-2026-09-27/mutation-mC.log.txt),
[D](/docs/research/r3/mirror-2026-09-27/mutation-mD.log.txt)). The corpus's analyzer version equals
the engine at `main`.

## Results

In-pool, contained years, R per decision (unfilled counts 0), with 95 % intervals clustered by UTC
decision day ([table](/docs/research/r3/mirror-2026-09-27/table.txt)). "Late lock" is the arming-bound
arm, where the runner's protection arms one bar after TP1 banks.

| fold | hours | cost | lock | S | M | S − M | (S + M)/2 |
|---|---|---|---|---:|---:|---:|---:|
| fit | all | none | late | +0.0263 | +0.0230 | +0.0032 [−0.0016, +0.0080] | +0.0247 |
| select | all | none | late | +0.0195 | +0.0159 | +0.0036 [−0.0055, +0.0128] | +0.0177 |
| fit | 16–21 UTC | full | late | +0.0097 | +0.0213 | −0.0116 | +0.0155 [+0.0114, +0.0197] |
| select | 16–21 UTC | full | late | +0.0061 | +0.0027 | +0.0034 | +0.0044 [−0.0028, +0.0116] |
| fit | 16–21 UTC | full | in TP1 bar | +0.0282 | +0.0387 | −0.0105 | +0.0335 [+0.0292, +0.0378] |
| select | 16–21 UTC | full | in TP1 bar | +0.0242 | +0.0205 | +0.0037 | +0.0224 [+0.0149, +0.0299] |

- **No direction.** Across all hours, S − M spans zero on both folds and under both lock timings.
  Across markets, fit's S − M correlates with select's at −0.012 (late lock) and −0.005 (lock in the
  TP1 bar). Per market, S − M excludes zero in 4 of 28 on fit (AUDJPY, EURAUD, EURJPY, USDJPY, all
  positive) and 2 of 28 on select (GBPAUD negative, GBPJPY positive), under either lock timing, against
  1.4 by chance. None of fit's four recurs on select
  ([per market](/docs/research/r3/mirror-2026-09-27/per-market.txt)).
- **Inside and outside the window, fit shows direction with opposite signs, and select does not repeat
  it.** At full cost with the late lock, S − M on fit is −0.0116 [−0.0199, −0.0032] at 16–21 UTC, where the
  mirror wins, and +0.0069 [+0.0012, +0.0126] outside it. On select neither excludes zero
  ([table](/docs/research/r3/mirror-2026-09-27/table.txt)).
- **The escaping years are symmetric too.** In 2021–22 select, frictionless with the lock in the TP1
  bar, S reads +0.153 and (S + M)/2 +0.156 per decision, with S − M −0.005 [−0.014, +0.004]. That fits
  the feed defect those years carry.
- **The lock timing is a property of the ladder, not of the side.** Moving the lock one bar later
  takes about 0.02 R per decision from S and M alike.

## What the 16–21 UTC window is made of

The runner protection decides it. On the same decisions, contained years, in-pool, 16–21 UTC, pooled
per UTC day ([variants](/docs/research/r3/mirror-2026-09-27/span-variants-power.out.txt),
[two-sided](/docs/research/r3/mirror-2026-09-27/twosided-power.out.txt)):

| runner | lock | fit R | select R | select lo95 per day | years to confirm, pooled, at select's effect |
|---|---|---:|---:|---:|---:|
| trail_tp1 (shipped) | in TP1 bar | +1,305.2 | +339.2 | +0.2148 | 1.3 |
| trail_tp1 | late | +450.1 | +85.7 | −0.0639 | 18.8 |
| hold (no move) | — | +142.9 | +75.0 | −0.1102 | 36.4 |
| breakeven | in TP1 bar | −213.2 | −125.3 | below zero | never |
| breakeven | late | −264.3 | −143.8 | below zero | never |
| both sides, S + M | in TP1 bar | — | — | +0.4572 | 0.8 |

Hold needs no stop move, and it is worth almost nothing: held-out markets lose on both folds. The
window's money is the runner stopped at TP1 when the TP1 bar closes back through it. The engine credits
that exit only when the bar's close, which follows the TP1 touch, is back through TP1
(`replay.ts:740-786`). That is what a stop re-armed automatically at the TP1 fill would do. A
hand-moved stop about one bar late gets the late-lock row. Because the effect is symmetric, it is
short-horizon reversion in the US afternoon: price reaches TP1 and comes back.

Held-out markets are the nearest out-of-sample check, and they do not settle it. With the lock in the
TP1 bar, fit reads +0.115 R per day (lo95 +0.060) and select +0.019 (lo95 −0.072), over six pairs and
744 select days.

## What it means for the route

- **Every route that relied on the shipped entry's direction is closed,** because there is none.
- **The one candidate is the 16–21 UTC ladder with an automatic lock at TP1.** It was found by reading
  both tuning folds (the hour finding of 2026-09-12). So it would register as a family designed from a
  printed result, disclosed, and only the post-frontier confirm calendar can test it.
- **Pooled (Q7),** one side confirms in about 1.3 years at select's effect, and both sides in about
  0.8 years. Years are the days needed over the traded days a year inside the window where every
  pool member is contained ([script](/docs/research/r3/mirror-2026-09-27/power-years.py.txt)).
- **Per market,** it is 0 of 91 (amendment 45).
- **It needs an execution the desk does not instruct today.** Amendment 42 has the operator move the
  stop by hand, which is the late-lock row. Two facts would open it:
  1. The owner confirms E8's platform can move the stop to TP1 the moment TP1 fills, server-side or by
     a permitted expert advisor.
  2. The owner rules that the arm of record is the one the instruction achieves.
- **Both sides of one instrument at once** may meet E8's hedging rules; one side is enough, since the
  side does not matter.
- **Its in-sample strength is itself a warning.** Pooled, with the lock in the TP1 bar, the window's
  annual Sharpe is about 2.6 on select and 3.3 on fit (from the per-day mean ÷ SD and the traded days
  a year, in the same script). The best published intraday FX effects run 0.6–1.0 after costs, and
  one session effect 1.3 in-sample
  ([screen](/docs/research/designs/published-effects-screen-2026-09-27.md)). A figure 2.6 to 5.5 times
  that 0.6–1.0 post-cost range, found on the folds that grade it, is more often an artifact than an edge.
- **The vintage question applies.** The bank's first copies read about 0.01 R per bracket worse on
  forex than the history this corpus graded.
