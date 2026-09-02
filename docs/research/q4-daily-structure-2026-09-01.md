# R2b question 4 — what the stop's structural search cannot see

**Measured 2026-09-01 against the 2026-08-26 cache anchor. 97 markets,
1,908,189 planned decisions, zero provider bytes.**
Artifact: `docs/research/q4-daily-structure-anchor-2026-08-26.json`.
Instrument: `scripts/q4-daily-structure-stop.ts`, guarded by
`tests/q4Reader.test.ts`.

## The question

`buildPricePlan` builds two pivot sets — `findSwingPivots(bars, 3)` on the
15-minute series and `findSwingPivots(daily, 2)` on the daily one — and spends
them asymmetrically. All four arrays reach `buildLadderTargets`, so the runner
may sit on a daily level. The stop's search reads the intraday arrays alone.
Targets see daily structure; stops do not.

Nothing had measured what the stop is not looking at.

## The answer

| class | plans | daily present | daily only | daily nearer | **stop moves** | prov flip | median | p90 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| agriculture | 24,851 | 100.0% | 3.6% | 57.0% | **34.7%** | 15.1% | 0.694 | 1.975 |
| crypto | 555,310 | 99.7% | 2.6% | 23.6% | **14.4%** | 5.8% | 0.530 | 1.677 |
| energies | 3,625 | 100.0% | 4.7% | 45.9% | **35.2%** | 13.6% | 0.324 | 0.892 |
| forex | 1,187,237 | 99.7% | 3.7% | 33.3% | **35.7%** | 11.3% | 0.616 | 2.022 |
| futures | 86,352 | 98.6% | 3.6% | 41.5% | **20.0%** | 10.6% | 0.788 | 2.010 |
| indices | 8,690 | 96.6% | 3.0% | 20.0% | **9.4%** | 3.9% | 0.853 | 2.335 |
| livestock | 3,855 | 98.1% | 2.9% | 40.3% | **0.0%** | 0.0% | — | — |
| metals | 38,269 | 98.8% | 3.5% | 25.1% | **26.6%** | 9.3% | 0.624 | 1.861 |

Medians and p90 are the tightening in ATR units, over the rows that move.

Read plainly: **daily structure sits in the stop's own direction on 96.6% to
100% of decisions, and on 32.0% of them across the 71 markets that can be
structure-stopped it would move the shipped stop.** The move is not marginal —
a median of roughly 0.6 ATR and a p90 above 2 ATR.

~~Adding levels to a nearest-beyond search can only find a NEARER level, so the
stop always tightens or holds and never widens. That is a property of the
operator, not an observation, and `tests/q4Reader.test.ts` asserts it.~~
**Corrected 2026-09-02 from R3's corpus, which carries both arms' stops per
decision.** The property holds only where an intraday level already stood.
In the `daily only` case below — the shipped stop sits at the volatility
FLOOR because no intraday pivot exists — a daily pivot moves the stop OUT to a
structural level: 49.8% of volatility-floor rows widened under the daily arm
in a 25% sample of R3's paired rows (16,417 of 32,934), and 27.9% of cap rows
tightened. This reader recorded `Math.abs(withDaily.stop − shipped.stop)` and
asserted the sign; the sign was never measured. The question it was built for
is now answered directly by R3's two stop-source arms
(`docs/research/r3-one-resweep-2026-09-02.md` §5), and its magnitude table
stands as a placement fact only.

`daily only` is the narrower case where the intraday search found no pivot at
all and a daily one existed — 2.6% to 4.7% everywhere. On those the stop falls
to the volatility floor while structure was available.

## Livestock's zero is the instrument checking itself

The reader predicted, before the run, that a market whose stop cap sits at or
under the 1.25-ATR structural floor can never be structure-stopped, so no pivot
set can change its stop. Derived over `defaultScanSymbols`: **26 markets carry
`maxStopAtrMultiplier <= 1.25`, and not one of them moved on a single
decision.** The other 71 move on 32.0% of plans. Livestock is 3 of the 26 and
reads 0.0% for that reason and no other.

A falsifiable prediction that could have failed and did not is worth more than
the headline share, because the headline share is what a shadow of production
would produce whether or not it were faithful.

**A count in the R2b packet was right and its enumeration was not.** The packet
records "27 of 98 markets" as never structure-stopped and names "all three
livestock, twelve crypto, seven futures" — which is 22. The missing five are
agriculture 2 and indices 3. Over `defaultScanSymbols` (97) the count is 26; the
difference between 26 and 27 is the one contract-size variant that population
subtracts, so both counts are correct for their own population. A partial
enumeration beside a correct count reads as the whole set.

## What was verified, and what is being claimed

The counterfactual is a shadow of production: production cannot be asked for a
stop under a pivot set it does not build. So the reader runs its own stop chain
TWICE — once on the intraday-only set production really used, once on the union
— and requires the first to reproduce the plan's own `stopPivotDistance`
exactly. That field is measured against the planned entry, so matching it proves
the reconstruction of the entry, the pivot arrays, the buffer and the search
direction at once.

**Zero of 1,908,189 plans failed that anchor.** A market whose reproduction
disagreed would have been excluded and counted, and the run would have exited
non-zero.

**This measures stop placement only.** A moved stop moves `riskDistance`, which
moves TP1, the payoff gate and admission itself, so the accepted population
would differ. That is a grid arm, not an arithmetic. **No R consequence is
derivable from this table** (amendment 39), and none is claimed here. The
counterfactual R of a structure-stopped ladder is not recoverable from any
emitted column, because a different stop changes which setups exist.

## Does the change limit R3 with the data we already have? Measured: no

The bars are the bars. Moving the stop changes which price LEVEL the simulation
tests against the same cached bars; it needs no deeper history, no finer frames
and no fetch. Two limits were worth checking, and both were measured rather than
reasoned about — a two-arm run on EURUSD, BTCUSD and XAUUSD, full history, all
three splits, anchored at 2026-08-26 and spending nothing:

| arm | rows | filled | ambiguous | share of filled | total R |
| --- | --- | --- | --- | --- | --- |
| `baseline` | 44,006 | 36,580 | 75 | 0.21% | −1396.0 |
| `stopStructureSource=intraday` | 44,006 | 36,580 | 75 | 0.21% | −1396.0 |
| `stopStructureSource=intraday_and_daily` | 44,644 | 37,007 | 81 | 0.22% | −1438.1 |

**Same-bar ambiguity does not grow meaningfully.** A nearer stop is touched
sooner, so more resolutions risk having the stop and TP1 touched inside one bar,
which the resolver must call `ambiguous`. Measured: 0.21% to 0.22% of filled
rows — six rows in 37,007. It is not a constraint on R3.

**The arms carry different populations, by construction.** The tighter stop
admits 638 more decisions and loses none *(on the three markets measured here;
at roster scale R3 measured 2,434 intraday decisions lost per mode against
13,506 gained, and six markets with fewer — corrected 2026-09-02)*: a smaller
`riskDistance` shrinks the
payoff floor, so setups the current geometry refuses become admissible. This is
the opposite of the gross/net cost arms, where the decision set was deliberately
held identical so the comparison could not confound cost with selection. Here
admission MUST move, because that is part of what the change does. So the
verdict is total realized R per arm over each arm's own population with
denominators stated, never a per-row delta — which is what `grid-totalr.ts`
already computes, and its acceptance gate is absolute expectancy rather than a
bare delta (D4).

**`baseline` and the explicit `intraday` arm are bit-identical** on all 44,006
rows and to the tenth of an R. The default is untouched.

**And the direction, on three markets, is against adoption.** The daily arm
returns −1438.1R against −1396.0R, and −0.0389R per filled row against
−0.0382R. Both readings agree. Three markets at one anchor are not a verdict and
this corpus is negative everywhere, so the magnitude is not evidence — but the
sign is the opposite of what the placement table alone would suggest, which is
precisely why placement was never allowed to decide it.

## What follows

The decision is the owner's. Two things about its timing are not:

1. ~~**This is not expressible as a grid axis.**~~ **It is now.**
   `stopStructureSource` is a validated string axis alongside
   `runnerProtection`, with `undefined` — every shipped cell — bit-identical to
   the behaviour that has always shipped. R3 prices both arms on all 97 markets
   in one run at zero additional provider bytes, and the decision is taken on
   realized R rather than on placement. Adopting it on the placement table would
   have been manufacturing a ratio: a tighter stop mechanically improves every
   printed reward-to-risk with no structural reason to believe the money
   improves, which amendment 39 names by name.
2. **The 26 capped markets are unaffected either way.** Whatever is decided,
   their stops do not move, so the change's population is 71 markets rather
   than the roster.
