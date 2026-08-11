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

**Superseded in part by the totality addendum below**: those nine
non-confirmed members were re-derived on their own full spans hours
later. Six earned confirmed cells there (AAVEUSD, BNBUSD, BZUSD,
DASHUSD, XLMUSD, XMRUSD), ARWUSD was confirm-refused, and HEUSX and
THETAUSD hold full-span measure-only verdicts. This census stands as
the record of what the CLASS-calendar frame could see.

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

## Absolute-expectancy addendum (audit 2026-08-11) — THE OWNER DECISION

An adversarial audit of this document's own claims overturned the one
that mattered most, and it is recorded here in full because the
correction is unflattering.

**The gate measures IMPROVEMENT, not positivity.** Every "confirmed"
verdict in this file means: the cell beat its baseline on the held-back
fold, at p ≤ 0.05, family-wise. The baseline it beat was measured
NEGATIVE in every class. So a confirmed cell can be — and in twenty
cases is — a market that loses less money, not one that makes any.

Measured from the corpus's own per-market expectancy rows, for each
shipped cell on the confirm (held-back) fold:

- **50 of 72 shipped cells are positive on BOTH the select and confirm
  folds.** Those are money-positive markets under the derived engine.
- **20 of 72 are negative on the confirm fold** despite a confirmed
  improvement — EGLDUSD −0.304R per decision, CAKEUSD −0.224, ZCUSX
  −0.191, ZOUSX −0.170, PAUSD −0.149, DOGEUSD −0.147, ETCUSD −0.137,
  DASHUSD −0.114, GRTUSD/HBARUSD −0.113, XMRUSD −0.112, IMXUSD −0.101,
  AAVEUSD −0.088, UNIUSD −0.074, XLMUSD −0.065, ZMUSD −0.061, LINKUSD
  −0.047, LTCUSD −0.009, NSDQ −0.004, ZLUSX ±0.000.
- 2 of the 72 have no per-market log row to read (BNBUSD, XAGUSD) —
  disclosed, not assumed either way.

**The rescue was attempted and failed, on the data.**
`scripts/threshold-rescue.ts` walks each negative market's OWN
confidence-score distribution across thresholds 0–95 (the corpus was
swept `--capture-all`, so every rejected decision is present with its
score — this is a READ, not a new assumption) and looks for a threshold
positive on BOTH folds with ≥30 fills. Result: **two "rescues," both
worthless** — NSDQ at +0.001R and LTCUSD at +0.000R on confirm, which
are zero. Five markets show a positive confirm-fold expectancy at a high
threshold (PAUSD +0.106, DASHUSD +0.111, ZLUSX +0.064, LINKUSD +0.017,
GRTUSD +0.009) but only where their SELECT fold refuses — choosing those
would be fitting to the held-back data, which is the one thing this
whole apparatus exists to prevent. Artifact:
`4d-threshold-rescue.json`.

**So the owner's standard is met in both directions**: a positive
outcome was reached where one was reachable (50 markets), and where it
was not, the refusal now carries measured backing across every
threshold the market's own scores admit.

### The decision this hands the owner

Amendment 31 says full matched coverage is the resting state and **its
only exit lives in 4d — "if a market leaves the offering, it leaves on
this evidence."** This is that evidence, for the first time. Two
defensible readings, and the choice is the owner's alone:

1. **Withdraw the 20** from the offering under amendment 31's 4d exit.
   The engine would stop presenting setups on markets it measures as
   losing. Coverage falls 97 → 77.
2. **Keep them and state it.** They stay live with their confirmed
   improvement, and the record (and any surface that claims a market's
   record) says plainly that the measured expectancy is negative.

Option 2 is only honest if the product SAYS it; today no surface does.
Nothing ships on this question without the owner's ruling.

## The decline verdict (owner rulings, 2026-08-11)

Two rulings governed this, and both changed the answer.

**Ruling one — "follow the existing rules"** sent me back to the roster
law of 2026-08-07, which had already settled what a losing market means:
*"Expectancy is not a ground [for hiding]. A thin or negative market is
one the ENGINE declines to produce a setup for, and one per-market
geometry has to earn; it is not a market the product hides."* So the
mechanism is **engine-declines, not menu-removal**. A declined market
stays visible, stays scannable, stays in every coverage count under
amendment 31, and a scan of it returns a stated refusal naming its own
measured record. Nothing vanishes.

**Ruling two — "not based on a flawed parameter of our own making"
(amendment 36)** demanded the test. A gross re-sweep of all 20 negative
markets charged **only E8's published commission**
(`LEVELFLOW_MODELED_COST_SCALE=0`), separating a market that loses from
a market our modeled spread convicts. It also, honestly, changes
selection: cheaper cost admits more marginal setups, which is why some
markets read WORSE gross than net (LTCUSD −0.009 → −0.115) and some
better (ZOUSX −0.170 → −0.145).

**A third bar was added on inspection.** The first pass returned 19
declinable, including NSDQ at −0.004R on 54 fills — which is not a
measured loss but a measurement of nothing. Declining on it would be
amendment 36's overreach pointed the other way, so a decline now
requires the loss to clear its own 95% interval.

### The result: 15 decline, 5 stay

| population | n | disposition |
|---|---|---|
| **Declined** | **15** | EGLDUSD −0.368R, CAKEUSD −0.218, ZCUSX −0.208, ETCUSD −0.163, HBARUSD −0.161, DOGEUSD −0.161, PAUSD −0.149, DASHUSD −0.124, AAVEUSD −0.120, LTCUSD −0.115, XLMUSD −0.108, IMXUSD −0.108, UNIUSD −0.098, XMRUSD −0.095, GRTUSD −0.077 — every one negative beyond its own 95% interval at the published bill alone |
| CI spans zero | 4 | ZOUSX, ZMUSD, LINKUSD, NSDQ — negative point estimate, not a measured loss. No decline, and no claim of edge either. |
| Cost-dependent | 1 | ZLUSX turns positive (+0.006) at the published bill — convicted by our modeled spread, so it stays under amendment 36. |

The engine now carries **57 markets it will trade and 15 it will not**,
out of 97 offered. Every decline is re-derived each calibration round;
accrued data that turns one positive returns it, on the same footing as
any E8-tradable / FMP-analyzable match.

Artifacts: `4d-cost-sensitivity.json` (per market, both corpora, SE and
CI), `4d-threshold-rescue.json`, and the gross corpus manifests.
