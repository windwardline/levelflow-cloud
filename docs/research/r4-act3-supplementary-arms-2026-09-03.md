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

### 6a. Arm F — the admission floor, graded as derived variants (no sweep)

The gate gained `--derive-filters` (results PR): a derived variant is the
baseline's rows with `accepted` re-decided by a predicate on a row field, so
a post-hoc admission filter is graded under the gate's own rule without
re-simulating. Reproduce-first, executed: a floor at the baseline's own value
reproduces the baseline cell exactly, and the variants' figures equal an
independent sum over the kept rows. Four derived variants over R3's
per-class corpus, sealed (2,141,527 confirm rows withheld): `payoffFloor=1.5`
and `=1.6` (`rewardRisk` ≥ the value; the runner target's net ratio, not the
ladder's) and `costShareMax=0.15` and `=0.2` (`estimatedRoundTripCost /
riskDistance` ≤ the value — the cost weight per trade, values from the fit
fold's distribution: 0.15 keeps 89% of fills, 0.2 keeps 94%).

**Market unit** (`docs/research/r4/admission-derived-grading.json`): no
variant accepted for any market but one (EURAUD under `costShareMax=0.15`).
The aggregate is large and out-of-sample consistent — `payoffFloor=1.5`
select ΔR +2,444R, fit +1,563R; `costShareMax=0.15` select +7,368R, fit
+4,033R — but per market the filtered stream is still negative beyond its
error (D4, "LOSES MONEY") or the paired-day test has nothing to pair (a
filter that drops rows on fewer than five days).

**Class unit** (`docs/research/r4/admission-derived-grading-class.json`),
the 4c gate's grain and a class's own tuning folds:

| class | variant | fit ΔR | select ΔR | paired p | own select E (lo95) | verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| forex | payoffFloor=1.5 | +280 | +136 | 0.021 | +0.023 (+0.019) | **ACCEPT** |
| forex | costShareMax=0.15 | +564 | +306 | 0.001 | +0.026 (+0.022) | **ACCEPT** |
| forex | costShareMax=0.2 | +279 | +89 | 0.001 | +0.022 (+0.017) | **ACCEPT** |
| forex | payoffFloor=1.6 | +352 | −819 | 1.000 | +0.018 | fails |
| crypto | costShareMax=0.15 | +1,316 | +5,833 | 0.001 | −0.032 (−0.041) | fails D4 |
| crypto | payoffFloor=1.5 | +437 | +1,860 | 0.001 | −0.122 (−0.130) | fails D4 |
| futures | costShareMax=0.15 | +1,000 | +308 | 0.001 | −0.001 (−0.025) | fails D4 |
| futures | payoffFloor=1.5 | +233 | +112 | 0.001 | −0.043 (−0.066) | fails D4 |
| metals, indices, agriculture | all four | positive | positive | mixed | negative | fails D4 or THIN |
| energies, livestock | all four | — | — | — | — | THIN or no verdict |

The first accepted variants in the program, all three in forex: the
admission filters beat the baseline on both folds at the class grain and the
filtered stream earns money on its own. Crypto's cost-share cap moves the
class by +5,833R on select (from −7,264R) and futures' by +308R, but neither
class earns money after it, so the gate refuses both as pre-registered —
the losses shrink, the sign does not change. The cost-share rule has no
engine knob; shipping it is engine work after the read (owner item).

Instrument discipline for §6a, executed on the real corpus after the
fresh-eyes review (2026-09-03): a derived floor of 1.2 — below every class's
shipped `minRewardRisk` — reproduces all 91 shipped cells figure for figure
(identity on the corpus, not a fixture); and the pre-registered external
anchor is met exactly once the population is named: the scratch counterfactual
recomputed over the fit rows of the markets the class gate pools (the
stratified holdout excluded) equals the gate's class-unit fit ΔR to the
decimal — forex payoffFloor=1.5 +279.7, costShareMax=0.15 +563.7; crypto
+437.3 / +1,316.0; futures +233.2 / +999.9; agriculture +185.7 / +346.6;
energies +83.4 / +108.8. The design §2 figures (forex +305 etc.) were the
same counterfactual over every market; the difference is the holdout, not the
instrument. Two facts the review made explicit: the class-unit accepts are
informational — the freeze is per market and the read opens per-market
candidates, so F contributes EURAUD alone to the read; and a derived
predicate may read decision-time fields only (a whitelist), because an
outcome column would let it look ahead. The freeze-driven read and the
retirement rule are built beside the derived path (design §5), each with its
identity test; nine mutations were landed and killed across the three
(predicate inverted; AND-with-baseline dropped; arm check dropped; grid term
relaxed for every read; baseline digest skipped; field whitelist bypassed;
emit bytes unchecked; the retirement rule's gross clause and sample floor
dropped).

### 6b. Arms S, W, C1, C2 — and two supplementary arms the launcher owed

Run from merged main `1a64151` at zero provider bytes: stop-cap and
review-window from 04:46Z, the class-default pair from 05:37Z. **A defect of
the run, caught at grading:** the launcher had been written before the
reviews and still carried design v2's grids — review-window swept
`defaultReviewHours=4,12,24,48` (v4: 24, 48, 96) and stop-cap swept
`maxStopAtrMultiplier=1.5,2.5,4` (v4 adds the uncapped 8). The 24 and 48
cells stand; the 4-hour cell recreates amendment 25's starvation and the
12-hour cell duplicates baseline for the 33 crypto markets, so both are
controls, not arms. The missing cells run as two supplementary arms from
the same revision, launched 07:23Z beside the three still running:
`review-window-96` (`defaultReviewHours=96`) and `stop-cap-8`
(`maxStopAtrMultiplier=8;stopStructureSource=intraday,intraday_and_daily`).
Each is graded as its own arm; the freeze reconciles every arm's baseline
row-for-row, so an arm split across two corpora costs nothing but a second
baseline cell. The lesson is recorded: an arm's grid is verified against the
final design from its manifest in the first minute of the run, never at
grading.

Results follow per arm.

**Arm W — the review window** (`review-window`, manifest `ecb56cdfb557`,
4,709,810 rows, 11.72 GB, exit 0 at 07:21Z; graded
`docs/research/r4/review-window-grading.json` and `-class.json`, emit digest
bound). The first per-market accepts of the program from a swept cell:

| cell | markets accepted (market unit) | fit ΔR, all markets | select ΔR, all markets |
| --- | --- | ---: | ---: |
| 48 h | 8 — AUDCAD, AUDCHF, AUDNZD, CADCHF, CHFJPY, EURNZD, NZDCAD, NZDCHF | +1,847 | −219 |
| 24 h | 7 — AUDCAD, AUDCHF, AUDNZD, CADCHF, CHFJPY, NZDCAD, NZDCHF | +1,139 | −118 |
| 12 h | 5 — AUDCHF, AUDNZD, CADCHF, EURNZD, NZDCHF (baseline for the 33 crypto markets; a real cell for the 6-hour classes) | +11 | +244 |
| 4 h | 0 (amendment 25's starvation, as predicted) | −1,933 | +506 |

At the class grain forex accepts 12, 24 and 48 hours (24 h: fit +374R,
select +377R, p 0.001, own expectancy +0.023R; 48 h: +383R / +464R, p 0.001,
+0.024R) — forex's row ships 8 hours, and every longer window earns more.
Crypto's longer windows improve fit (+771R at 24 h, +1,335R at 48 h) and
worsen select (−501R, −698R): fails. No other class earns money on any
window. Retirement preview under the pre-registered rule (the freeze
applies it): ten W cells fail the decline rule for four candidates — ADAUSD
(24 h, 48 h), NGUSD (12, 24, 48 h), XTZUSD (24, 48 h), ZSUSX (12, 24, 48 h) —
every one through the gross clause with the net upper bound still below
zero: their negative does not survive the removal of our window on gross,
and the read reports their M3 either way.

**Arm C2 — the class default with the gate off** (`class-default-gate-off`,
manifest `d40510960b63`, 2,866,621 rows, 7.20 GB, exit 0 at 07:42Z; graded
`docs/research/r4/class-default-gate-off-grading.json` and `-class.json`).
AXES-6's question — is the invalidated derived layer worth anything against
its absence? — answered in money. Each market on its class row with the
per-symbol layer removed and the confidence gate off, crossed with the runner
mode the token would otherwise silently revert:

| class | derived markets | breakeven: select ΔR / fit ΔR | trail_tp1: select ΔR / fit ΔR |
| --- | ---: | ---: | ---: |
| forex | 28 | −8,782 / −18,669 | −2,544 / −8,070 |
| crypto | 19 | −4,370 / −1,605 | −3,009 / +614 |
| futures | 13 | −336 / −908 | −132 / −608 |
| agriculture | 4 | −221 / −262 | −189 / −228 |
| indices | 3 | −57 / −42 | −43 / −39 |
| metals | 1 | −69 / −228 | −28 / −86 |
| energies | 1 | −6 / −52 | −3 / −43 |

No market accepts either cell; at the class grain every class fails, forex
by −6,939R on select under breakeven and −2,243R under trail_tp1. The
derived layer (its cap of 4 against the class clamp of 1.0, its sizing
factor, its runner mode) is worth thousands of R relative to the class row,
on both folds, in every class that carries it — the layer's cells still lose
money absolutely in crypto, but they lose far less than the class default
would. The lens's reading that crypto's sign flip is regime rather than the
layer stands as narration only; what is measured is that removing the layer
makes crypto worse by 3,000–4,400R on select.

**Arm C1 — the class default with the gate on** (`class-default`, manifest
`8cf24be8ed5b`, 2,866,621 rows, 7.16 GB, exit 0 at 07:46Z; graded
`docs/research/r4/class-default-grading.json` and `-class.json`). The same
picture with the class threshold restored: forex −8,784R / −18,657R
(breakeven) and −2,548R / −8,062R (trail_tp1) on select / fit over its 28
derived markets, crypto −4,361R / −1,609R and −3,000R / +610R, futures
−327R / −886R and −124R / −597R; no market accepts either cell; every class
fails at the class grain. The class threshold moves almost nothing on the
derived markets (their layers ship threshold 0 and the class rows' 20–30
remove few fills) except where it is high: WTI on the energies row
(threshold 85) is THIN at 24 filled, the regression the review named. The
22 graded class-row markets, whose token expands to nothing, return NO
VERDICT (21) or THIN (1): the reproduction control the design counted, and
the reason arm C grades 72 markets, not 97.

**Multiplicity, stated before the freeze.** A dry run of the freeze over the
four arms graded so far (W, C1, C2, F) finds 9 candidates — 8 from the window
arm, EURAUD from the derived cost-share cap — against 1,638 (market, cell)
tests, so the gate's own p ≤ 0.05 would hand out about 82 accepts by chance.
Nine is below that count. Per-market acceptance on the tuning folds is
therefore not evidence at the program level; it is the list the read opens.
The four retirements (ADAUSD, NGUSD, XTZUSD, ZSUSX) each rest on two or more
cells and none is labelled fragile.

**Arm W96 — the 96-hour window** (`review-window-96`, manifest
`256c74eb9032`, 1,919,083 rows, 4.78 GB, exit 0 at 08:33Z; graded
`docs/research/r4/review-window-96-grading.json` and `-class.json`). The
same eight forex markets accept (AUDCAD, AUDCHF, AUDNZD, CADCHF, CHFJPY,
EURNZD, NZDCAD, NZDCHF; fit ΔR over all markets +2,352R, select −282R), and
forex accepts at the class grain with the window family's best figures — fit
+378R, select +511R, p 0.001, own expectancy +0.024R. Across the family
forex's select ΔR rises monotonically with the window: +223R at 12 h, +377R
at 24 h, +464R at 48 h, +511R at 96 h, against a shipped 8 hours. No other
class earns money at 96 h; crypto's fit improves by +1,812R while its select
worsens by −836R, the same shape as at 24 and 48 h. The 96-hour cell would
retire the same four candidates (ADAUSD, NGUSD, XTZUSD, ZSUSX), again on the
gross clause.

**Arm S — the stop cap × structure source** (`stop-cap`, manifest
`50ac1efe16dc`, 6,652,005 rows, 16.76 GB, seven cells, exit 0 at 08:33Z;
graded `docs/research/r4/stop-cap-grading.json` and `-class.json`). No
market accepts any cell, at either grain. The clamp is real money for the
class-row candidates but not the whole of their loss: under cap 4 their
select net upper bounds rise from −0.46 to −0.20 (ALGOUSD), −0.99 to −0.28
(DYDXUSD), −0.40 to −0.16 (ASX), −0.42 to −0.17 (AVAXUSD), −0.64 to −0.32
(DOTUSD), −0.58 to −0.24 (NEARUSD), −0.45 to −0.26 (TRXUSD), −0.62 to −0.39
(XTZUSD), −0.16 to −0.05 (ZSUSX) and stay below zero; HOUSD's reaches +0.04
and it retires. The 1.5 cells tighten the 65 derived cells' stops and lose
(forex fit −2,361R, select −1,014R); the 2.5 cells lose less; cap 4 with the
intraday source is the shipped cell for 65 markets and returns NO VERDICT
for them (the reproduction control), and cap 4 with the daily source is
forex's near-miss at the class grain — fit −1.7R against select +236.1R at
p 0.024, own expectancy +0.023R — the same cell R3 §5 and the research lens
had already priced. Futures' cap 4 improves fit by +394R with the class still
negative. Cap cells retire four candidates under the rule: ADAUSD (five
cells), HOUSD (three), NGUSD (four), ZSUSX (three), on the gross clause.

**Arm S8 — the uncapped stop** (`stop-cap-8`, manifest `ff568263e7e2`,
2,790,378 rows, 7.00 GB, exit 0 at 08:54Z; graded
`docs/research/r4/stop-cap-8-grading.json` and `-class.json`). Cap 8 with
the daily source is the cell that crosses the class gate cap 4 missed: forex
accepts it — fit +2.2R, select +248R, p 0.009, own expectancy +0.023R — the
only swept stop cell accepted anywhere, and at the class grain only; no
market accepts either cell. For the eight derived candidates shipping at cap
4 the removal of the cap moves their select net upper bounds by hundredths
(HBARUSD −0.050 → −0.028, EGLDUSD −0.268 → −0.237, WTI −0.105 → −0.086)
except NGUSD, whose bound turns positive (−0.035 → +0.051) and which retires
on the net clause; ADAUSD and HOUSD retire again. Futures' fit improves by
+591R and crypto's by +368R with both classes still negative. Amendment 36's
cap removal is now complete for every candidate: eight of the eleven
class-row candidates and seven of the eleven derived ones keep a negative
net upper bound under every cap from 1.5 to uncapped.

## 7. Storage and the anchor

**Preflight, 2026-09-03 04:2xZ** (`docs/research/r4/preflight-survey-2026-09-03.txt`,
`--warm-only --byte-budget 1` at the anchor): 313 cache artifacts all carry
the 2026-08-26 pin, so no arm can reach the provider. Against R3's survey the
97 warm lines are identical in every symbol's bars-through date; BZUSD
carries one more intraday bar inside the window (65,107 against 65,106) after
the 2026-09-02 18:03Z cache top-up, which was itself stopped by hand (exit
143) once the allowance was back. Within an arm every comparison is against
that arm's own baseline cell, so the one bar changes no verdict — and,
checked before the read on the tuning folds (baseline rows digested per
market and fold, confirm rows skipped before any outcome field was read),
R3's baseline rows and act 3's are the same rows for all 166 (market, fold)
keys, BZUSD included: the extra bar sits outside every decision. The read's
own digest covers the confirm fold.

The daily cache top-up (`com.windwardline.levelflow-cache-topup`, 07:00
local) warms the same rolling stores the sweeps read, with no lock. It is
unloaded for the run window and reloaded when the last arm exits.

Corpora: not yet run.

## 8. Open items

- The six late-listed markets (ARWUSD, BNBUSD, CAKEUSD, THETAUSD, TRUMPUSD,
  XAGUSD): unmeasurable at tuning grain; the one read measures them. Gate for
  building an emit-time per-market fold spec: the read leaves them unmeasured.
