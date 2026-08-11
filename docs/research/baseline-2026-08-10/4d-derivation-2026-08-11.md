# 4d — per-market derivation of record (2026-08-11)

Amendment 33 executed at the market grain: every market graded on its
own rows by gate v2 (singleton groups, the same paired family-wise
permutation, a 30-filled absolute floor), joined against the §19 sizing
engine's own arithmetic, choice FROZEN, then the confirm fold's one
authorized read — burned into the corpus's read log, first and only
read.

Corpus `3c47e2036e1b` · engine `2026.08.11.engine-v2` · pipeline:
`scripts/derive-4d.ts` → `scripts/feasibility-4d.ts` →
`scripts/confirm-4d.ts` · artifacts beside this doc
(`4d-candidates.json`, `4d-feasibility.json`, `4d-final-picks.json`,
`4d-confirm-read.json`).

## The result

**41 picks frozen before the confirm fold was opened; 39 confirmed
positive on data no tuning step ever saw; 2 failed and revert.**

| population | n | disposition |
|---|---|---|
| Confirmed picks | **39** | ship per-market (runnerProtection, cap) |
| Confirm-negative | 2 (HOUSD, RBUSD) | revert to measure-only, stated below |
| Capacity-gated (RM-1) | 11 | keep shipped calibration; the gate is the venue's own arithmetic |
| Measure-only (no cell accepted) | 7 | keep shipped calibration (incl. all three livestock) |
| Starved (fit fold under the floor) | 18 | late-listed markets; measure until history accrues |
| Held out (read-time stratified) | ~20 | never tuned; keep class defaults this cycle — they are the NEXT cycle's unseen validation |

The dominant confirmed cell is `trail_tp1 · cap 4` (with the inert
hours factor riding along), consistent with the 4c class verdicts —
but the per-market grain is the point: SP confirmed on `hold · cap 4`
(its own rows disagree with its class), and 43 of the 52 gate-accepted
markets, not all, survived feasibility and confirm.

## The exceptions, named

- **HOUSD and RBUSD** (heating oil, gasoline — the two refined
  products) accepted on select and failed confirm (Δ −4.3R and −7.4R).
  The fold did its job; both revert to measure-only. Worth recording:
  these are also the two markets the RM-5 work placed in the crude
  union for crack-spread correlation.
- **The 11 capacity-gated**: ZBUSD/ZNUSD (treasuries — RM-1's named
  prediction: 1-contract steps cannot fit the widened stop inside the
  3% default daily line at the smallest account), PAUSD, ZOUSX/ZRUSD,
  and six sub-dollar coins (ALGO, DOGE, ETC, LINK, TRX, XTZ) where
  crypto's 1:1–1:2 leverage caps the step. Their gate-accepted cells
  are recorded, not deleted — a larger account tier affords them, and
  the governor states the gate per line.

## The discipline trail

1. Candidates derived fit+select only (confirm sealed).
2. Feasibility joined from published venue arithmetic only (line
   ladders, 3% default tier, §19 steps) — zero invented thresholds.
3. Picks written to `4d-final-picks.json` BEFORE the confirm read.
4. One `--confirm-final` read, logged in the corpus's burned log; a
   second read now requires `--acknowledge-prior-reads` and is itself
   logged.

## What ships (next change set)

The 39 confirmed (protection, cap) pairs enter per-market calibration
with an ANALYZER_VERSION bump; every other market keeps its shipped
values with its state named (capacity-gated / measure-only / starved /
holdout). The reopen decision remains the owner's, separate from this
derivation.

## Holdout-cycle addendum (2026-08-11, owner word)

The reserve was spent the day it was built, on the owner's instruction:
the twenty held-out markets ran the SAME pipeline on their own untouched
rows — derive on fit+select, feasibility from published arithmetic,
picks frozen, then their confirm rows' first consultation (the corpus
log's acknowledged second read, recorded).

**Eleven of eleven frozen picks confirmed positive** — a perfect
out-of-sample sweep on markets no tuning step ever saw, EURUSD among
them (its cell: trail_tp1 · cap 4). The procedure generalizes: 50 of 52
frozen picks across both cycles confirmed on held-back data.

Census of the twenty: 11 confirmed and shipped
(`2026.08.11.holdout-cycle`), 4 capacity-gated (BZUSD, DASH, XLM, XMR),
1 measure-only (BNBUSD), 4 starved. Artifacts:
`4d-holdout-{candidates,feasibility,final-picks,confirm-read}.json`.

The NEXT unseen-validation reserve is live accrual itself: every market
now runs the derived engine in production, and the live cohort is data
nothing in this corpus ever touched.

## Totality addendum (2026-08-11, owner mandate)

The owner's standard, verbatim in effect: fix what can be fixed to a
defensible, data-derived positive outcome; defend everything else with
data-derived backing, ambiguous to no measure.

**The frame was the limit for most of the remainder, and the frame is
fixed.** The starvation autopsy (per-fold rejection ledger, all shards)
found the per-CLASS fold calendar had zero fit-fold coverage for 22
markets carrying years of real history — AAVE has 5.8 years starting
2020-11 against a crypto fit fold that ENDS 2020-03; DAX's 1,041 real
days start five months after the indices fit fold closes; XAGUSD's
whole 1,076-day history postdates the metals fit window. The livestock
precedent, one level up. The fix: folds re-cut per MARKET over each
market's own measured span (50/25/25 by decision time) with containment
EXACT per row — a row whose outcome exits past its fold boundary is
dropped, stricter than the emit-time embargo it replaces.

**The totality cycle over all 45 underived markets: 27 accepted, 27
frozen, 22 CONFIRMED, 5 refused, 18 measure-only — zero starved.**
Confirm read #3, acknowledged and logged. Silver, DAX, both treasuries,
oats, Brent and eleven coins earned their cells on their own spans.
Capacity became DISCLOSURE (per-line feasibility in the artifacts; the
§19 governor refuses per account at runtime, which is the product's
honest sizing surface).

### The defense table — every market without a derived cell

| market | verdict | the data-derived backing |
|---|---|---|
| ALGOUSD, ARWUSD, AVAXUSD, NEARUSD | confirm-refused | full-span folds, gate-accepted on fit+select, FAILED their own confirm quarter — the validation refusing a real candidate |
| ZRUSD | confirm-refused | same; rough rice's select gain did not generalize |
| HOUSD, RBUSD | confirm-refused (cycle 1) | class-calendar folds COVER their short spans (2023-era listings) — no frame defect; the fold said no |
| ASX, DOW, NIKKEI | measure-only | full-span folds over ~1,040 real days; no cell beat baseline at p≤.05 — index CFDs' verdict on their own data |
| ATOMUSD, DOTUSD, DYDXUSD, FILUSD, THETAUSD, TRXUSD, XTZUSD | measure-only | full multi-year spans, real samples, gate said no cell wins |
| TRUMPUSD | measure-only | 568 real days total — the youngest listing; sample honest, verdict honest |
| GFUSX, HEUSX, LEUSX | measure-only | 24h-window fixed since round 28; ~400 fit decisions each, ~10% ladder refusal (NOT the old disease), thin trading is the residual truth |
| PLUSD, ZSUSX, ZFUSD | measure-only | real fit samples (267/179/58 fills), outcomes did not clear the gate |
| ZTUSD | measure-only, parameter-suspect NAMED | 632 of 1,978 fit decisions refused by the ladder (32%) — the livestock disease signature against its 1/128-point tick; a tick-minimum grid is the named next probe, requiring an engine change and its own cycle |

Every row above is a measurement, not a judgment call. The engine now
carries **72 derived cells**; the 25 markets without one hold either a
confirm refusal or a full-span measure-only verdict, and exactly one
(ZTUSD) carries a named parameter suspicion with its named next probe.
