# The vintage bound: the minute bank's first copies against FMP's later history (2026-09-24)

**What it answers.** HANDOFF sequence item 3: how far the choice of vintage moves a trade outcome,
where the minute bank holds FMP's first copies and FMP later revises about a quarter of them
([record](/docs/research/minute-bank-parity-2026-09-23.md); HANDOFF 2026-09-22). Which vintage
research reads is the owner's question. This record prices it.

**A reconstruction.** The item's full definition ("synthetic brackets", "the 25 construction-clean
symbols") lived only in the 2026-09-23 session, which was deleted with its journals on 2026-09-24.
The method below is rebuilt from the item's own words. Its construction rule yields 28 symbols at
the threshold chosen, and exactly 25 only between 51.1 % and 51.5 %, so the prior membership cannot
be reproduced.

**Method.** Zero provider bytes; every file opened read-only; standard-library Python. Window: UTC
minutes in [2026-08-04, 2026-08-26), before the frontier, where both stores hold data.

1. *Construction.* Per symbol, the bank's 1-minute first copies (first line per key, sorted by
   time, labels decoded in the venue's clock as `labelZoneFor` names it) are aggregated into
   5-minute buckets holding all five minutes, and compared with the calibration cache's 5-minute bar
   of the same open time. The cache's August bars were fetched later, by the rebuild around
   2026-08-24 and the top-ups since, so they are FMP's later history. A symbol is construction-clean
   when its best label offset is 0 and at least 50 % (JUDGED) of compared buckets match on all four
   prices to 1e-9 relative, with at least 100 compared.
2. *Synthetic brackets.* Decisions at 00, 04, 08, 12, 16 and 20 UTC, where both vintages hold the
   decision bucket and at least 90 of the next 96. For each side, a bracket with stop and target at
   k × ATR from each vintage's own decision close, ATR the mean range of the last 14 cache buckets
   (one unit for both). Resolved bucket by bucket over 8 hours: +1 R at the target, −1 R at the stop,
   a bucket touching both counts as the stop (as the engine does), else the close at 8 hours in R.
   d = outcome on the bank − outcome on the cache, for k = 0.5, 1 and 2. A second variant reads the
   bank's path from the cache's reference, so only the path differs.

The script, its output, an independent cross-check and the offsets measurement below sit beside
this file, stored as `.txt` so the citation guard covers them:
[`vintage_bound.py.txt`](/docs/research/vintage-bound-2026-09-24/vintage_bound.py.txt) and
[`vintage_bound.out.txt`](/docs/research/vintage-bound-2026-09-24/vintage_bound.out.txt),
[`crosscheck.py.txt`](/docs/research/vintage-bound-2026-09-24/crosscheck.py.txt),
[`offsets.py.txt`](/docs/research/vintage-bound-2026-09-24/offsets.py.txt) and
[`offsets.out.txt`](/docs/research/vintage-bound-2026-09-24/offsets.out.txt), and
[`forex.py.txt`](/docs/research/vintage-bound-2026-09-24/forex.py.txt) and
[`forex.out.txt`](/docs/research/vintage-bound-2026-09-24/forex.out.txt), and
[`classes.py.txt`](/docs/research/vintage-bound-2026-09-24/classes.py.txt) and
[`classes.out.txt`](/docs/research/vintage-bound-2026-09-24/classes.out.txt). Each resolves the
checkout from its own location:

```
python3 docs/research/vintage-bound-2026-09-24/vintage_bound.py.txt
python3 docs/research/vintage-bound-2026-09-24/crosscheck.py.txt EURUSD NGUSD ETHUSD
python3 docs/research/vintage-bound-2026-09-24/offsets.py.txt
python3 docs/research/vintage-bound-2026-09-24/forex.py.txt
python3 docs/research/vintage-bound-2026-09-24/classes.py.txt
```

The script reproduced byte-identical except its run stamp on 2026-09-24. The cross-check
re-implements the brackets without sharing code, refuses a venue-clock index it cannot decode, and
matches the script's counts and sums for EURUSD, NGUSD and ETHUSD at all three k.

## Results

**Construction.** The best offset is 0 for all 91 symbols compared, and 73 of the 91 reproduce the
cache at 90 % or more on at least one UTC day, so the bucket construction is right for most of the
roster. How often a symbol matches exactly depends on how many of its minutes FMP revised, and on how
late the bank captured them:

| bank's capture lag after the bucket | buckets | exact match |
|---|---:|---:|
| before the run log begins (lag unknown) | 62,350 | 64.9 % |
| under 6 h | 125,790 | 27.0 % |
| 6–12 h | 88,278 | 37.2 % |
| 12–24 h | 43,531 | 50.6 % |
| 24–48 h | 32,486 | 74.4 % |
| 48 h or more | 3,076 | 76.8 % |

The six rows hold all 355,511 compared buckets. The run log (`~/Library/Logs/levelflow-minute-bank.log`)
begins at 2026-08-06T23:28Z, after the bank already held earlier runs, so a bucket before that has no
measured lag. A first copy taken a day late has mostly been revised already. August 14, 16–17 and 21
were first banked a day or more late, so "first copy" is a mix of live and already-revised values.

**The band, all 91 symbols (77 with brackets, 11,368 brackets per k).**

| k (5-minute ATRs) | brackets that differ | pooled mean d | per 100 brackets, Σ\|d\| |
|---|---:|---:|---:|
| 0.5 | 5.8 % | −0.024 R | 11.7 R |
| 1 | 5.6 % | −0.011 R | 11.2 R |
| 2 | 6.0 % | −0.005 R | 10.9 R |

Every difference is a flip of about ±2 R, so the pooled p1..p99 of d is [−2, +2]. The mean is negative
at every k: on the bank's copies the stop is hit more often. One source is measured: a bucket touching
both levels, which counts as the stop, occurs on the bank 1,144 times against the cache's 874 at
k = 0.5, and 240 against 120 at k = 1. The rest is unexplained.

**By class.**

| class | symbols | differ, k = 0.5 / 1 / 2 | mean d, k = 0.5 / 1 / 2 |
|---|---:|---|---|
| forex | 28 | 9.8 % / 10.3 % / 11.7 % | −0.057 / −0.026 / −0.010 R |
| futures | 18 | 10.0 % / 7.2 % / 6.5 % | −0.039 / −0.008 / −0.006 R |
| crypto | 28 | 1.8 % / 1.6 % / 1.5 % | +0.005 / 0.000 / 0.000 R |
| metals | 2 | 2.3 % / 1.8 % / 0.9 % | +0.027 / 0 / 0 R |
| agriculture | 1 | 10.0 % / 0 % / 0 % | −0.200 / 0 / 0 R |

Agriculture is one symbol and ten brackets, so its −0.200 R is one flipped bracket. Indices and
livestock hold no 8-hour span inside the window's sessions. The manifest's eighth asset type,
energies, holds one market, WTI, whose provider series is CLUSD's; it is measured once, under futures.

**A shift or a revision?** If one series were the other shifted (bid against mid, say), the bank's
close would sit off the cache's by a constant. It does not. Across all 28 forex pairs
([forex](/docs/research/vintage-bound-2026-09-24/forex.out.txt)) the close differs on 22–60 % of
buckets, by a median of 1–8 ticks where it does, except three USD-quoted majors: EURUSD 27, AUDUSD 24
and NZDUSD 15 ticks. The extremes do shift. In 23 of the 28 pairs the bank's bucket sits lower than the
cache's at both ends: for those 23, the bank's high is below the cache's on 25–52 % of buckets and
above it on 4–23 %, and its low below on 26–63 % and above on 3–28 %. EURUSD, AUDUSD and NZDUSD run the
other way (EURUSD's bank high is above the cache's on 56 % of buckets), GBPUSD is contained, and CADJPY
is mixed. Two pairs have a side that never passes: EURUSD's and GBPUSD's bank lows are below the
cache's on 0.0 % of buckets, the signature metals shows at both ends.
At the class grain the bank's high is below the cache's on 33.7 % of 114,076 buckets and above on
15.3 %, and its low below on 36.3 % and above on 18.1 %. Strict containment, the bank's five minutes
inside the cache's 5-minute bar, runs 4–45 % across forex (GBPUSD highest) and 37–65 % on the metals,
crypto and ES symbols measured
([offsets](/docs/research/vintage-bound-2026-09-24/offsets.out.txt); XAUUSD's range narrower by $0.32,
BTCUSD's by $6.48). Where containment passes a third of buckets (JUDGED), or one side of the bank's
range never passes the cache's, the cache's bars reach extremes the minutes do not hold: metals,
crypto and ES among those measured, and in forex GBPUSD (45 %) and EURUSD (a low that never passes).
None of this can separate FMP revising the minutes from FMP building its 5-minute bars from a finer
feed; for those symbols the comparison may be of two constructions rather than two vintages.

**The construction-clean set** (28 symbols at the 50 % threshold, 26 with brackets, no forex and no
metals) reads almost nothing: 1.1–1.8 % of brackets differ and the pooled mean d is +0.001 to +0.004
R. The filter selects the symbols FMP revised least, so it is not the band.

## What it means

- **For forex, the vintage moves outcomes against the bank's copies at every width, and at the shipped
  stop width by about 0.01 R per bracket.** The direction needs no model of the magnitudes, but at
  k = 2 it needs aggregating: per bracket, 267 of 511 differing brackets are negative (two-sided sign
  test p = 0.33). Every aggregated unit agrees at every width. The last column below counts, for the
  decisions, pairs and days with a nonzero net, how many are negative, with each count's two-sided sign
  test; the one positive day at k = 1 is 08-07, at +2 R. A decision whose brackets cancel drops out of
  its count without biasing the sign of those left, so the deflation that caveats the decision SE does
  not reach its sign test. The size needs a model. The standard error of the forex net under a
  sign-flip null, four ways ([forex](/docs/research/vintage-bound-2026-09-24/forex.out.txt)):

  | k | net | SE per bracket (net/SE) | by decision, 2,178 | by pair, 28 | by UTC day, 14 | negative of nonzero: decisions · pairs · days (p) |
  |---|---:|---:|---:|---:|---:|---:|
  | 0.5 | −250 R | 41.4 (−6.0) | 27.8 (−9.0) | 63.3 (−4.0) | 74.1 (−3.4) | 159/193 · 25/27 · 14/14 (< 0.0001, < 0.0001, 0.0001) |
  | 1 | −112 R | 42.3 (−2.6) | 16.2 (−6.9) | 32.7 (−3.4) | 38.3 (−2.9) | 61/66 · 17/19 · 12/13 (< 0.0001, 0.0007, 0.003) |
  | 2 | −44 R | 42.8 (−1.0) | 12.6 (−3.5) | 14.4 (−3.1) | 17.4 (−2.5) | 31/40 · 14/16 · 9/9 (0.0007, 0.004, 0.004) |

  The decision column is not a tighter estimate, only a deflated one: a decision's long and short
  brackets flip in opposite directions, so their cluster sum cancels. That is why it is a third of the
  per-bracket figure at k = 2 on a cluster of two, and why it is exactly zero on metals at k = 1 and 2.

  Which error sizes it is JUDGED: whether a revision is a random event per bracket, or hits a decision's
  long and short brackets together, or a whole day, or a whole pair. The record takes the day because it
  nests the decision: every decision that day reads the same revised bars, so the day allows each
  dependence the decision does and the one across decisions too. It does not nest the pair (the symbol,
  in the other classes), the unit a revision or a capture acts on. On forex the day is the wider of the
  two at every k. That ordering is measured on forex only
  ([classes](/docs/research/vintage-bound-2026-09-24/classes.out.txt)). On crypto the day's SE is below
  the symbol's at k = 0.5 and 2 and equal at k = 1 (13.4, 5.3 and 4.0 R against 15.6, 5.3 and 6.3), and
  its half-width is narrower even than the decision's at k = 1 and 2 (0.0020 against 0.0021, 0.0015
  against 0.0023) though it carries the larger multiplier (t = 2.101 at 18 degrees of freedom against
  1.96). On metals at k = 0.5 the symbol is the widest unit and the day ties the decision as the
  narrowest (6.0 R against 3.5 each, and 4.5 per bracket), because one of its two symbols carries all +6 R; two clusters are a
  degenerate count. No unit here covers day and pair dependence at once, and that limit falls on the
  direction as much as on the size: a sign test over days is the day-clustered null, and one over pairs
  the pair-clustered null. The sign tests are free of a model of the magnitudes, not of the dependence.
  What the direction rests on is that it rejects under every aggregated clustering tried, decisions, pairs and days
  each at p below 0.005 at k = 2 (0.0007, 0.0042 and 0.0039), so it does not turn on which one a reader picks.

  At k = 2, the width nearest the shipped forex `stopAtrMultiplier` of
  1.2 (2 five-minute mean ranges are 1.10 to 1.13 fifteen-minute ones on EURUSD, GBPUSD and USDJPY,
  1.44 on AUDCAD), the mean is −0.010 R per bracket, 95 % about −0.019 to −0.001 R clustered by day
  (t = 2.160 at 13 degrees of freedom; counting only the 9 days with a nonzero net, t = 2.306 at 8, the
  near end is −0.0009). Per bracket, at 1.96, it would be −0.029 to +0.009. That is the size of forex's
  measured edge on the tuning folds (+0.006 R per fill, R3) and of the exit-slippage correction of
  2026-09-23 (0.006 to 0.011 R per fill). **A forex figure that moves by less than about 0.02 R per
  bracket, the far end of the day-clustered interval, is a vintage question, not a finding;** read per
  bracket, the line would be 0.03. It does not come from EURUSD, whose large one-sided gaps net +2 R
  over its 156 brackets at k = 2; it is spread across the crosses (14 pairs negative, 12 zero, 2
  positive, the largest AUDCHF, CHFJPY and EURCHF at −6 R each). GBPUSD and EURUSD carry the
  two-constructions caveat above, and so does the class: in 23 of the 28 pairs the bank's bucket sits
  lower than the cache's at both ends, a shift the record prints and cannot explain, so for forex it
  cannot separate revision from construction either.
- **Futures is not established. At the tightest width it moves against the bank's copies under three
  of the four units, but not under the symbol, its widest**
  ([classes](/docs/research/vintage-bound-2026-09-24/classes.out.txt)). 18 series in the manifest's futures
  entries (WTI, its one energies market, shares CLUSD's series and is measured with it), all 18
  evaluated and with brackets, 1,292 brackets. At k = 0.5 the net is −50 R, −0.0387 R per bracket, and zero lies outside the 95 %
  interval with brackets independent (±0.0345), by decision (±0.0204, the deflated estimator) and by day (±0.0308); the sign
  tests agree on brackets (77 of 129 negative, p = 0.03), decisions (35 of 45, p = 0.0002) and days
  (10 of 11, p = 0.01). Clustered by symbol it does not reject (±0.0468 at t = 2.110 on 17
  degrees of freedom; counting only the 12 symbols with a nonzero net, t = 2.201 at 11, ±0.049; 8 of
  the 12 negative, p = 0.39). The symbol is futures' widest unit (28.6 R, against 18.4 by day and 22.7 per
  bracket), so the record's own rule of taking the wider unit picks the one that does not reject: unlike
  forex, futures does not meet the standard of rejecting under every aggregated clustering. One symbol
  carries much of it: HOUSD nets −24 R of the −50, and HOUSD and RBUSD all of the −8 at k = 2. ESUSD,
  whose comparison may be of two constructions, nets +2 R and does not drive it, but HOUSD has no
  containment measurement, and at the class grain futures' extremes lean the way two constructions
  would: over 58,451 buckets the bank's high sits below the cache's on 25.3 % and above on 17.5 %, and
  its low above on 24.4 % and below on 19.4 %, the bank's bucket inside the cache's rather than shifted
  as forex's is. For futures, as for forex, the record cannot separate revision from construction. Futures has no
  established width, and its widest interval at k = 0.5 is about ±0.047 R per bracket, by symbol: a
  futures figure that moves by less than that cannot be told from the vintage. At k = 1 and 2 the
  nets, −0.0077 and −0.0062 R per bracket, sit inside every interval but the deflated decision one at
  k = 2 (±0.0061), whose sign test does not reject (4 of 4 decisions, p = 0.13). Agriculture (6 series
  in the manifest, all 6 evaluated, 1 with brackets, 10 brackets) bounds nothing: one flipped bracket at k = 0.5, none at the
  other widths.
- **Neither crypto nor metals is measurably moved at any width**
  ([classes](/docs/research/vintage-bound-2026-09-24/classes.out.txt)). Crypto's net (33 series in the
  manifest, 31 evaluated after the DYDXUSD and FILUSD skips, 28 with brackets, 5,490 brackets) is
  +0.0047 R per bracket at k = 0.5, inside ±0.0071 with brackets independent, ±0.0051 clustered by
  day, ±0.0058 by symbol and ±0.0048 by decision, the last only just (the point is +0.00474); at k = 1 and 2 it sits within ±0.0067 and ±0.0061 R per bracket at 95 % with brackets
  independent, ±0.0021 and ±0.0023 by decision, ±0.0020 and ±0.0015 by day, and ±0.0020 and ±0.0024
  by symbol. At k = 1 and 2 metals (2 series in the manifest,
  both evaluated and with brackets) is bounded only to ±0.036 and ±0.025 R per bracket (220 brackets); its few flips cancel inside their
  decisions, so the clustered errors there are exactly zero and bound nothing. Metals' +0.027 R at
  k = 0.5 is five differing brackets netting +6 R, inside ±0.040 with brackets independent, ±0.031 by
  decision, ±0.034 by day and ±0.35 by symbol (t = 12.706 on its 1 degree of freedom). There the comparison may be of two constructions rather than two vintages.
  Of the 18 sign tests crypto and metals can run (the rest have no nonzero cluster), one rejects at
  0.05: at k = 0.5, 15 of the 20 crypto symbols with a nonzero net favour the bank (p = 0.04), against
  forex's direction, with the decision test at p = 0.07 and the day test at 0.30. One in 18 at that
  level is about what chance delivers.
- **The later history is not a fixed vintage either.** The cache records no fetch time for its August
  bars, and the top-ups may have replaced 2026-08-23..25 with a later copy.

## Limits

- The brackets are tight. With a 5-minute ATR the median bracket resolves in its first, second and
  fifth bucket for k = 0.5, 1 and 2, and 2 of the 4,028 construction-clean brackets reached the 8-hour
  close. The band covers first touch a few 5-minute ATRs from entry, not a full ladder, TP1 or runner.
- No gaps, slippage or spread: only the path differs.
- Skipped: ^N225, ^GDAXI and ^AXJO (the bank starts 2026-08-05); DYDXUSD and FILUSD (days missing
  in a vintage); MGCUSD, USDMXN, ^MID and ^STOXX50E (not in the manifest). Two bank outages
  (2026-08-04 00:00–04:00Z and 2026-08-13 05:47Z to 08-16 04:00Z) are read by no bracket.
