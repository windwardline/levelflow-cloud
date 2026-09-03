# R4 act 3 — the supplementary arms at the protected anchor (2026-09-03)

Status: IN PROGRESS. Design v2 under adversarial review; pre-registration
measurements complete; no arm has run. Zero provider bytes throughout; the
confirm fold stays sealed; no calibration value changes on act-3 evidence.

## 1. Purpose

Amendment 39 makes net realized R the measure. Act 2 graded every market's
shipped cell on the tuning folds and accepted no grid variant anywhere: 44
shipped cells lose beyond their interval and 22 are decline candidates. Act 3
asks, market by market, which of OUR choices — the stop cap, the review window,
the admission floor, the per-symbol layer — is taking the money, and gives the
22 candidates amendment 36's cap and window removals before any of them is
called negative.

## 2. The money map, verified from the act-2 grading artifact

`docs/research/r4/per-market-grading-classfolds.json`, select fold, shipped
cells, 91 graded markets:

| figure | value |
| --- | ---: |
| net total R | −5,680 |
| gross total R (before the modelled spread and slippage; E8's published commission is charged in both columns) | +2,611 |
| cost taken | 8,291 |
| markets losing net beyond their interval while gross-indistinguishable | 21 (−2,194R) |
| decline candidates (net AND gross upper bounds < 0) | 22: crypto 17, futures 2, indices 1, energies 1, agriculture 1 |
| shipped cells positive beyond their interval | 15, all forex, all derived |
| held-out markets graded | 17 of 20 |

Three corrections to the act-2 record and HANDOFF, applied with dated notes:
seventeen candidates are crypto, not sixteen; the held-out set is labelled 20
and graded 17 (ARWUSD, BNBUSD and THETAUSD are held out AND late-listed, so
they have no tuning row); and 16 graded markets have no fit-fold rows at all
(AAVEUSD, ASX, AVAXUSD, DAX, DOTUSD, DOW, DYDXUSD, EGLDUSD, FILUSD, GRTUSD,
HBARUSD, IMXUSD, NEARUSD, NIKKEI, SOLUSD, UNIUSD; 12 crypto, 4 indices, 9 of
them decline candidates), so acceptance was unreachable for them —
`beatsBaseline` needs fit ΔR > 0 and theirs is 0 by construction. The
late-listed problem is 22 markets on this calendar, not six (found by the
money-and-law review, 2026-09-03).

Where the money sits. Class rows cap the stop at 1.0 ATR (metals 1.6) while
their structural stops are 1.2–1.45 ATR, so every one of the 25 class-row
markets runs clamped; the derived layer chose a cap of 4 on 65 markets and
2.5 on 6. Eleven of the 22 candidates are class-row markets stopping out
44–92% of the time. The other eleven are derived cells; three of them
(XMRUSD, XLMUSD, DASHUSD) are net-positive on the fit fold on the same cell.
All 72 derived layers ship `confidenceThreshold` 0, so the threshold axis is
inert on them. No class's best runner or stop-source variant clears one
clustered standard error, so the runner family is exhausted (R3 §5, act 2).

## 3. The research lens, refuted

A money-map lens ranked three arms. Its figures reproduce; its first arm does
not survive.

| lens claim | verdict | why |
| --- | --- | --- |
| a "cost weight per trade" arm as a modelled-cost scale {0, 0.5, 1} | KILLED | Amendment 39 names the cost weight per trade as an axis whose inputs are the venue's published bills and says it is not a knob on the reported ratio. Scale 0 IS the gross column the grading already carries (both keep E8's commission; the resolver charges it at every scale); 0.5 charges a cost that is neither the venue's bill nor our model, the manufacturing clause exactly; 1 is baseline. The 4b review's cost weight is the cost SHARE of R per trade, moved by geometry and by admission. |
| stop cap × daily structure at {2.5, 3, 4} | survives, re-valued | The clamp is at 1.0; NGUSD's 2.8 cap once doubled its risk distance and starved it under the cost floor. The grid brackets the clamp: {1.5, 2.5, 4}. |
| threshold proposals, 3–4 cells per class | KILLED on the data (§4) | |
| deprioritise the class-default arm | rejected | It is the AXES-6 validity instrument for 72 invalidated cells, costs one cell, and the token is built and tested. |
| deprioritise the TP1 family | accepted | No class clears one SE; amendment 39's worked example forbids moving TP1 for the blend. |
| deprioritise the late-listed fold spec | accepted, out of act 3 | Six markets whose every row sits inside their class's confirm fold; three are held out. The one read measures them. |
| crypto's sign flip is regime, not the derived layer | not relied on | Narration until arm C measures it. |

## 4. Pre-registration measurements (tuning folds only; the confirm fold never read)

**The confidence threshold has no money in it.** `threshold-rescue` over the
per-class capture-all corpus (select only, sealed door; 2,141,527 confirm rows
withheld) finds a select-positive threshold for 46 of 91 shipped cells. For 28
of them the threshold is 0: the cell is already positive. Of the 18 above
zero, 14 keep fewer than half of their fills (1–44%) and would be refused as
THIN by the gate; the four that keep at least half move +6.4R (RTYUSD 35),
+22.9R (GBPAUD 40), +5.6R (ZOUSX 45) and +0.8R (ZRUSD 45) — a combined +36R.
Artifact: `docs/research/r4/threshold-rescue-classfolds.json`.

**The admission floor is where the money is.** A scratch reader over the
same corpus (baseline variant, accepted and filled rows, confirm rows skipped
before any outcome field was read) bucketed every fill by the net
reward-to-risk the engine admitted it at (`rewardRisk`, which is
`effectiveRewardRisk`: the payoff after the modelled round trip; the sweep
declines below `minRewardRisk`, `sweep.ts:1028`). The 1.2–1.5 band loses in
every class, on gross as well as net:

| class | fold | fills | R | keep at 1.5 | ΔR at 1.5 | keep at 1.6 | ΔR at 1.6 | keep at 1.7 | ΔR at 1.7 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| crypto | fit | 28,319 | +1,172 | 93% | +440 | 84% | +560 | 60% | −24 |
| crypto | select | 54,627 | −7,264 | 91% | +1,909 | 78% | +2,941 | 54% | +3,986 |
| forex | fit | 221,766 | +520 | 97% | +305 | 69% | +285 | 44% | −120 |
| forex | select | 100,689 | +2,508 | 94% | +171 | 54% | −1,262 | 28% | −2,143 |
| futures | fit | 12,126 | −1,402 | 91% | +245 | 67% | +507 | 45% | +722 |
| futures | select | 6,644 | −361 | 93% | +115 | 69% | +188 | 45% | +187 |
| agriculture | fit | 3,226 | −428 | 62% | +239 | 32% | +336 | 17% | +361 |
| agriculture | select | 1,655 | −189 | 52% | +120 | 27% | +151 | 10% | +174 |
| metals | fit | 5,497 | −503 | 59% | +237 | 36% | +358 | 22% | +413 |
| metals | select | 2,507 | −118 | 70% | +50 | 42% | +72 | 27% | +92 |
| indices | fit | 475 | −22 | 76% | +6 | 59% | +12 | 46% | +17 |
| indices | select | 761 | −107 | 74% | +28 | 59% | +52 | 50% | +64 |
| energies | fit | 577 | −116 | 28% | +83 | 12% | +99 | 5% | +107 |
| energies | select | 298 | −60 | 29% | +53 | 9% | +57 | 6% | +59 |
| livestock | fit | 517 | −70 | 88% | +8 | 60% | +12 | 40% | +24 |
| livestock | select | 255 | −88 | 94% | −2 | 76% | −5 | 58% | +83 |

Per market on select at a floor of 1.5: 71 of 91 improve, 17 worsen, three
fall below half their fills (WTI, ZMUSD, ZSUSX); the non-THIN total is
+2,312R against a select baseline of −5,680R. The largest movers are the
crypto candidates (LTCUSD +321, BCHUSD +255, ALGOUSD +235, TRXUSD +204); the
largest losses are forex winners giving back a few R (EURGBP −28, GBPAUD −15).
A floor of 1.6 keeps crypto's improvement (fit +560, select +2,941) and
reverses forex's (select −1,262 at 54% kept); 1.7 fails crypto's fit fold.
The band [1.2, 1.5) is the high cost-share band by construction: targets sit
at `minimumTargetRewardRisk` 1.5–1.7 gross, so a net payoff of 1.2–1.5 means
the round trip took 0.1–0.5 of the risk unit.

This is a scratch counterfactual, not a verdict: the arm that measures it is a
sweep whose variant rows the gate grades under its own rule (fit ΔR, select
ΔE at p ≤ 0.05 on day blocks, THIN, D4), one class's choice from its own
folds. The floor is an admission filter: it moves no stop and no target, and
it declines the trades the venue's bill makes structurally worst. It is the
cost weight per trade in amendment 39's sense.

## 5. The arms

Design v4 (`docs/research/r4-act3-design-2026-09-03.md`, with both review
tables). Sweeps, from clean merged main, two at a time: **S**
`maxStopAtrMultiplier=1.5,2.5,4,8;stopStructureSource=intraday,intraday_and_daily`
(9 cells); **W** `defaultReviewHours=24,48,96` (4); **C1**
`symbolOverride=none;runnerProtection=breakeven,trail_tp1` (3); **C2** the
same with `confidenceThreshold=0` (3). **F**, the admission floor, does not
sweep: it is graded as derived variants over R3's rows (both reviews: its
rows already exist; `minRewardRisk` and the threshold are post-hoc filters
with no inter-decision state). Retirement rule, freeze rule and the
multi-corpus read are pre-registered in the design §5.

## 6. Results

Not yet run.

## 7. Storage and the anchor

**Preflight, 2026-09-03 04:2xZ** (`docs/research/r4/preflight-survey-2026-09-03.txt`,
`--warm-only --byte-budget 1` at the anchor): 313 cache artifacts all carry
the 2026-08-26 pin, so no arm can reach the provider. Against R3's survey the
97 warm lines are identical in every symbol's bars-through date; BZUSD
carries one more intraday bar inside the window (65,107 against 65,106) after
the 2026-09-02 18:03Z cache top-up, which was itself stopped by hand (exit
143) once the allowance was back. Within an arm every comparison is against
that arm's own baseline cell, so the one bar changes no verdict; it is
recorded because a later reconciliation of BZUSD's baseline against R3's will
otherwise read the difference as a defect.

The daily cache top-up (`com.windwardline.levelflow-cache-topup`, 07:00
local) warms the same rolling stores the sweeps read, with no lock. It is
unloaded for the run window and reloaded when the last arm exits.

Corpora: not yet run.

## 8. Open items

- The six late-listed markets (ARWUSD, BNBUSD, CAKEUSD, THETAUSD, TRUMPUSD,
  XAGUSD): unmeasurable at tuning grain; the one read measures them. Gate for
  building an emit-time per-market fold spec: the read leaves them unmeasured.
