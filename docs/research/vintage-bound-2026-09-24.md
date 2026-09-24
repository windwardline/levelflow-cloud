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

Script, output and an independent cross-check are beside this file in
[`vintage-bound-2026-09-24/`](/docs/research/vintage-bound-2026-09-24/vintage_bound.out). Run from
the checkout root: `python3 docs/research/vintage-bound-2026-09-24/vintage_bound.py`. Reproduced
byte-identical except its run stamp on 2026-09-24; the cross-check re-implements the brackets without
sharing code and matches the script's counts and sums for EURUSD, NGUSD and ETHUSD at all three k.

## Results

**Construction.** The best offset is 0 for all 91 symbols compared, and 73 of the 91 reproduce the
cache at 90 % or more on at least one UTC day, so the bucket construction is right for most of the
roster. How often a symbol matches exactly depends on how many of its minutes FMP revised, and on how
late the bank captured them:

| bank's capture lag after the bucket | buckets | exact match |
|---|---:|---:|
| under 6 h | 125,790 | 27.0 % |
| 6–12 h | 88,278 | 37.2 % |
| 12–24 h | 43,531 | 50.6 % |
| 24–48 h | 32,486 | 74.4 % |
| 48 h or more | 3,076 | 76.8 % |

A first copy taken a day late has mostly been revised already. August 4–5, 14, 16–17 and 21 were first
banked a day or more late (lag from `~/Library/Logs/levelflow-minute-bank.log`), so "first copy" is
a mix of live and already-revised values.

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

Indices and livestock hold no 8-hour span inside the window's sessions. Forex bank buckets sit lower
than the cache's at both extremes (high below the cache's in 33.7 % of buckets, low below in 36.3 %).

**The construction-clean set** (28 symbols at the 50 % threshold, 26 with brackets, no forex and no
metals) reads almost nothing: 1.1–1.8 % of brackets differ and the pooled mean d is +0.001 to +0.004
R. The filter selects the symbols FMP revised least, so it is not the band.

## What it means

- **For forex, the vintage is not moot.** On the band's widest bracket, k = 2 five-minute ATRs, the
  bank's copies read 0.010 R worse per bracket than FMP's later history. Measured over the window, 2
  five-minute mean ranges are 1.10 to 1.13 fifteen-minute mean ranges on EURUSD, GBPUSD and USDJPY
  (1.44 on AUDCAD), near the shipped forex `stopAtrMultiplier` of 1.2. That is the same size as forex's measured edge on the tuning
  folds (+0.006 R per fill, R3) and as the exit-slippage correction of 2026-09-23 (0.006 to 0.011 R
  per fill). A forex figure that changes sign by less than that is a vintage question, not a finding.
- **For crypto and metals it is below 0.005 R per bracket** on the few symbols measured.
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
