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
[`forex.out.txt`](/docs/research/vintage-bound-2026-09-24/forex.out.txt). Each resolves the
checkout from its own location:

```
python3 docs/research/vintage-bound-2026-09-24/vintage_bound.py.txt
python3 docs/research/vintage-bound-2026-09-24/crosscheck.py.txt EURUSD NGUSD ETHUSD
python3 docs/research/vintage-bound-2026-09-24/offsets.py.txt
python3 docs/research/vintage-bound-2026-09-24/forex.py.txt
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
livestock hold no 8-hour span inside the window's sessions.

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

- **For forex, the vintage moves tight brackets against the bank; at the shipped stop width its size
  is not established.** Two standard errors of the forex net, both under the null that a difference is
  as likely to favour either vintage
  ([forex](/docs/research/vintage-bound-2026-09-24/forex.out.txt)):

  | k | net | per-bracket SE | net/SE | day-clustered SE (14 days) | net/SE |
  |---|---:|---:|---:|---:|---:|
  | 0.5 | −250 R | 41.4 | −6.0 | 74.1 | −3.4 |
  | 1 | −112 R | 42.3 | −2.6 | 38.3 | −2.9 |
  | 2 | −44 R | 42.8 | −1.0 | 17.4 | −2.5 |

  At k = 0.5 and 1 both exclude zero. At k = 2, the width nearest the shipped forex `stopAtrMultiplier`
  of 1.2 (2 five-minute mean ranges are 1.10 to 1.13 fifteen-minute ones on EURUSD, GBPUSD and USDJPY,
  1.44 on AUDCAD), the mean is −0.010 R per bracket: its 95 % interval is about −0.019 to −0.001 R
  clustered, and about −0.029 to +0.009 R per bracket, which contains zero and forex's measured edge of
  +0.006 R per fill (R3). Clustering is the defensible model, because brackets inside a day are not
  independent, but 14 clusters estimate it poorly, and the dependence runs both ways: the two sides of
  one decision flip together and cancel, which narrows the error at k = 2, while same-direction flips
  across a day's decisions widen it at k = 0.5. So the price at the shipped width lies somewhere from
  zero to about 0.03 R per bracket, a range that holds the forex edge and the exit-slippage correction
  of 2026-09-23 (0.006 to 0.011 R per fill). It does not come from EURUSD, whose large one-sided gaps net
  +2 R over its 156 brackets at k = 2; it is spread across the crosses (14 pairs negative, 12 zero, 2
  positive, the largest AUDCHF, CHFJPY and EURCHF at −6 R each). GBPUSD and EURUSD carry the
  two-constructions caveat above.
- **For crypto and metals it is below 0.005 R per bracket at k = 1 and 2**; metals' +0.027 R at
  k = 0.5 is five differing brackets of 220, netting +6 R. There the comparison may be of two
  constructions rather than two vintages.
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
