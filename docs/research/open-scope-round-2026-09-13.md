# The open-scope round: nothing on disk adds realized R, and three conventions were found holding money up (2026-09-13)

**Question.** With FMP suspended, what can be built — any approach to
evaluating markets, shifting focus, or setting stops and targets — that moves
net realized R before the key returns? Owner-commissioned, open scope,
amendment 39 governing.

**Method.** Ten lenses deliberately unlike each other (the entry signal, the
exits, the cost, the portfolio, the unfilled limits, the regime fields, the
horizon, outside practice, the measurement apparatus, the universe), each
measuring on the corpus of record with a control it had to reproduce first; a
screen to eight candidates; three adversaries per candidate — measurement,
money, survivorship — each told to hunt look-ahead first; a ranking memo. 36
agents. The refuters byte-skipped the confirm fold before parsing; the
driver's own passes and the census-registered readers reach the corpus through
the sealed door, which parses and withholds — 2,141,527 rows either way. Two agents' work landed as change sets during the
round (#629–#632: the forex commission is converted in the wrong currency;
the four USD-quote pairs fixed; the measurements promoted to readers).

**Result.** 24 of 24 refuter verdicts returned. **No candidate survives as a
program.** One verdict of twenty-four says "survives", and narrows its
candidate to a pre-registrable design whose precondition the other two
refuters consumed. Eighteen dead ends were measured, not argued. Three of the
kills are findings about the instrument rather than the market, and those are
the round's yield.

The verdicts below are distilled; the refuters' full texts, with their
scripts and populations, are in the round's journal, not in this tree.
Figures marked **verified** I reproduced or read from the refuter's own
output myself; the rest are read.

## 1. The eight candidates and why each fell

### 1. Reprice execution: per-symbol spread, an hour term, the commission fix — killed 3/3

The headline kill (forex in-span select +0.0282 → −0.0002 R/fill) is an
accounting-method swap, not a repricing: deducting the engine's OWN flat
0.67 bps modelled half per fill, instead of letting it act through bid/ask
triggers as the resolver does, reproduces the candidate's two figures with no
table, no hour term and no commission change (−0.0007 [−0.0094] and
+0.0122). The deduction costs 2.0–2.4× the engine's print effect on every one
of ten cells. Two "measured" corpus sums (16,186.7 R commission, 16,014.9 R
spread/slippage) reproduce on none of three populations; the 1.013 bps
break-even reproduces as 1.097. The decisive input does not exist: E8
publishes no spread table, the live quote bank holds 0 real quotes in 37,790
rows, and the IC Markets whole-day averages decide the verdict by which table
and multiplier is chosen (linear substitution: pooled select +0.0100
[+0.0010]; a 2× thin-hours stress: −0.0316 [−0.0406]). The measurement
refuter measured that the span is not uniformly thin — hours 16–19 alone hold
the finding at tick densities above the out-of-span hours 00–06.

**What survived and shipped**: the commission defect, real and two-sided,
reproduced by all three — +221.6 R net on contained fills (money), +223.7 R
on the 291,377 contained fills with per-fill previous-day rates
(survivorship), +226.8 R over all 322,455 fills (measurement) — against the
record's +209.4 R on contained fills by per-year-mean rates. The defect and
the +209.4 R are **verified** (my own instrument, now the tracked reader);
the three refuter sums are read. The four USD-quote pairs pay the
constant since `2026.09.13.forex-commission-usd-quote` (#631); the 21 crosses
wait on a quote-currency rate on both paths (the daily cache holds every USD
leg for the sweep half; the live half is one fetch per cross).

### 2. Span-aware re-grading of the seven arms on disk — killed 3/3

The decomposition reproduces to the decimal (forex 48h select contained
+77.9 R, escaping +386.4 — 83 % of the arm's +464.3 R sits on the excluded
years). But under D4 on contained years nothing re-decides: forex 48h fails
paired p (0.385) and the level (E −0.0204 [−0.0257, −0.0151]); crypto 4h
fails three terms, its "+956.1 R" being 7,871 fewer fills of a −0.13 R/fill
stream — losing less by trading less. Neither cell is live (forex ships 8 h;
the 48 h confirm read was indistinguishable). The classifier that partitions
the years had its thresholds set on 2026-09-06 with the money in view. Under
amendment 39 it moves labels on printed deltas and no operator's R.

### 3. Gate repair: declare the family from the run, split the two bars — killed 3/3

The one accept the repaired ruler produces (USDCAD, "1 of 88") is a
post-search p on a favourable day subset: over all 920 USDCAD select days
p = 0.17; under the 24-window family that produced the predicate p = 0.21;
USDCAD's own best window is 15:00–20:59, not the pre-registered one. USDCAD
loses −46.5 R on the fit fold (E −0.031 [−0.061, −0.001]) and is net −4.6 R
over the whole tuning calendar. The accepting market changes with every
defensible window (PLUSD under 16–22; EURUSD under a per-market fit window),
and one accept sits below the gate's own printed 4.5 expected false families.
The false discovery the candidate's own objection predicted.

### 4. Sweep the lock level — killed 3/3, and the instrument finding of the round

The lock's "+0.0537 R/fill, the largest exit-geometry effect ever measured
here" reproduces exactly — and **89.3 % / 97.2 % / 94.0 % / 90.4 %** of its
summed value on the four fit/select × in-pool/held-out cells sits on rows
where the runner exited at the lock **inside the TP1 touch bar**, printed at
exactly `roundPrice(armedStop)` with no adverse print, no half-spread and no
slippage (`replay.ts:722-757`, FR-3's zero-latency arming). Priced against
the bar cache on identical fills — every one of the 61,238 fit in-pool and 18,799
select in-pool same-bar rows found, 0 contradicting the close-through trigger — the
counterfactual "the protective stop arms one 5-minute bar later" removes
+4,342.1 R on fit and +1,340.8 R on select (in-pool): the next bar opens
through the lock on 97.8 % of these rows. Net of that the lock is worth **+0.0020 R/fill
on fit and −0.0005 on select** over hold, and the fold the gate reads sits at
−0.0238/fill with 0 of 22 in-pool markets clearing zero. There is no level
effect to sweep. What this says about the shipped ladder is in §3.

### 5. Rank the scan on cost share, repair four scoring defects — killed 3/3

Cost share IS relative stop width: in forex the round trip is 1.17 bps of
price on 99.63 % of contained fills, so Spearman(relative stop width, cost
share) = **−1.0000** — an axis the record has swept as a cap, a floor, a
placebo, per market and as the out-of-span width curve. The +0.0298 R/fill
headline is a population artifact: the pooled cell carries 18,158 fills
(18.6 %) from the 21 engine-declined markets — 59 % of its loss — that the
live scan never shows, plus the 9.4 % of forex select fills above the shipped
0.15 cap. On a HEAD-faithful population the select in-pool gain shrinks to
+0.0108 [+0.0020, +0.0196], and inside the live collapse group — the
(correlationGroup, hour) choice `scanCollapse.ts` actually makes — the
cost-share pick beats the confidence pick in 0 of 4 HEAD cells; the held-out
cell never clears zero (z 0.11–0.90). The four "scoring defects" are code
facts the refuters call true but inert.

### 6. Withdraw eleven markets under "the pre-registered decline rule" — killed 3/3

Not the pre-registered rule. `DECLINE_RULE` (`scripts/ledgeredRead.ts:196-199`,
hashed into every read) is select fold, all years, net AND gross upper bound
below zero at ≥ 30 fills; the candidate pooled the fit fold in and cut the
escaping years. 78 % of its −2,385.7 R "saving" is fit-fold money; six of the
eleven exist only through the pooling (two have zero contained select rows);
the one sealed read that ran declined none of them and CLEARED four (EURUSD,
USDCAD, ZNUSD, ZSUSX); and the shipped commission fix already flips EURUSD's
gross upper bound (−0.0031 → +0.0038). Re-nominating markets on the tuning
folds after the held-out test failed them is selection.

### 7. A daily-frame, multi-day-horizon arm on the 19-year daily cache — killed 2/3, one narrowed survival

The cache claims hold (96 daily stores, 0.037 GiB, 408,956 bars; the
15-minute primary pinned in five harness places on one sentence of
rationale). The family offered for it does not: 12-month time-series momentum
replayed on the roster's own daily cache, exits before each class's confirm
start, earns ≈ 0 gross R/trade on the 37 CFD markets E8 can hold overnight at
every hold from 5 to 63 days — **0 of 28 forex pairs clear a positive lower
bound at any hold**; forex −0.036 R/trade at 21 days — and is positive only on
crypto and the CME complex, where an always-long control of the same size sits
beside it (drift, not signal; the JFE 2020 finding). A second independent
replay agrees: MOP's own sign regression on 17,372 instrument-months gives
month-clustered t = 0.81 at h = 1 and −0.17 at h = 12; TSMOM(12,1) is positive
on 55 of 95 instruments and significant on 10 (MOP: 58/58, 52); forex 9 of 28,
0 significant — **verified** from the refuters' outputs. The CME complex (26
or 27 roster markets, by the two refuters' counts) cannot be held overnight on any E8 futures product, the cost
model carries no financing term (measured forex sensitivity 0.085–0.18 R per
bp/day of swap, larger than any gross the frame produced), and the engine's
own ladder transposed to daily bars touches TP1 on the fill day on 90 % of
fills — the bar the evaluator cannot grade. The candidate's "+0.512 in-span
Spearman" exists in no tracked artifact.

The survivorship verdict: it is the one corpus-independent, pre-registrable
candidate on the list — buildable only on the CFD classes, with the arm's
whole design space frozen as ONE cell and a seal on the daily cache's years
BEFORE any daily-frame P&L is printed by anyone. Two refuters had already
printed it for that family. Any revival is a different family, pre-registered
first.

### 8. The prop-firm risk governor — killed 3/3

The one measured outcome change (challenge pass rate 2.5 % → 20.1 % E8 One,
5.1 % → 34.4 % Pro, from one-per-hour thinning at 0.25 % risk) does not exist
on the population it names: rebuilt on select in-pool, every thinning rule
LOWERS the pass rate (the money refuter's rebuild: Pro 2.5 % → 0.4 %, One
1.1 % → 0.1 %; the survivorship refuter's: One 1.4 % → 0.0 %, Pro 1.4 % →
0.3 % — two rebuilds, different unthinned baselines, one direction); the 15–31 %
figures appear only with the 2009–2018 fit fold in the population and a
non-causal pick that sees the whole hour before choosing. Thinning cuts
variance under negative drift and the account dies by static drawdown
instead of reaching the target. The daily-loss half is a booking-clock
look-ahead: with outcomes known at decision an in-day cap cuts take-all
breaches 95.0 % → 2.6 %; booked at exit, 94.8 % → 94.4 % — and E8's Daily
Drawdown counts floating equity, which no closed-P&L cap can see. The 1,861-
line spec pre-registered the opposite (§20a excludes open positions and trade
counts from the governor's scope; §20h declares daily-budget tracking
unbuildable without telemetry; "concurren" occurs zero times). And a
server-day loss stop moves forex money the wrong way — see §3. What is real:
same-hour realized-R dependence (+0.095 same-group, +0.19 same-side; day-total
variance 2.1× independence), a SIZING fact for §20, not a governor; at 0.25 %
per fill the unthinned take risks a mean 14.2 % of the account per day against
E8's 2.5–5.3 % daily lines.

## 2. Eighteen dead ends, measured

1. **Meta-labelling** (a take-skip rule learned from decision-time features):
   built and tested; within a span the incremental is +0.0001, −0.0004 and
   +0.0004; the
   corpus can only evaluate rules that REMOVE rows, because each row holds
   only the side taken.
2. **`confidenceScore` as a quality gate**: a pure volume dial; Pearson r with
   realized R ≤ 0.027 anywhere in forex; margin, agreement and winning score
   show no gradient.
3. **Target 1's level**: flat within 0.001 R/fill from 0.4 R to 1.5 R once
   intrabar touches are denied credit; the apparent 0.7–0.8 R optimum is the
   resolver crediting intrabar touches.
4. **The banked fraction**: round-1 figures reproduced (−1,321.1 → −271.6 R at
   f = 0 against −274 recorded); under `trail_tp1` the exit can never print
   below the bank level, so f is inert on 90.6 % of armed rows.
5. **Protection mode / removing the lock**: every hold-surface cell is worse
   than the shipped ladder on 12 of 12 cells and 28 of 28 forex markets on fit
   — **but see §3: this comparison rests on the same-bar convention**.
6. **Adverse selection on unfilled limits**: refuted — rescued through three
   longer windows those setups are significant losers (−1,306.7 R at 48 h,
   E −0.0340 [−0.0416, −0.0263]).
7. **Tightening the entry offset**: unmeasurable — the field is a constant
   (both offsets 0.55, `calibration.ts:674-675` at `2886f4c`, **verified**); the axis is a
   registered grid key never swept; every proxy points at a null.
8. **Ranking as an edge**: no selection rule reaches a positive lower bound on
   absolute expectancy in any clean cell.
9. **Stop provenance** (structure vs ATR multiple): unanswerable in R — Target
   1 is 0.4000 R regardless of width, so the payoff moves with the stop.
10. **Voter-contrast filters**: raise per-fill E and LOWER total R on both
    folds (in-span fit in-pool +1,412.1 → +1,069.3 R) — amendment 39 fails it.
11. **Local-hours FX seasonality**: the USD-weak side is the worse side on 3
    of 4 cells; what the split shows is that the crosses carry the in-span
    money (candidate 1 from another angle).
12. **News, macro, COT conditioning**: every one collapses under the span
    conditioning or reverses sign between folds.
13. **`executionScore`**: relative stop width re-expressed (8 values; zero
    overlap with width within any quintile).
14. **Purged CV, embargo, triple-barrier labelling**: already implemented and
    stronger than the textbook (`assertEmbargoCoversReview`, `sweepFolds.ts:704`,
    **verified**); the ladder IS a triple barrier.
15. **CPCV without PBO**: reachable at ~0.5 % of the forex calendar and would
    raise the median D4 level floor 1.69×, but its paths are not independent
    tests and it multiplies published figures 15-fold — dead unless it ships
    with the Probability of Backtest Overfitting in the same change set.
16. **Carry / rate-differential families**: no swap or financing term exists
    in `executionQuality.ts`, `venueCosts.ts` or `replay.ts` (**verified**;
    the only "financ" match is a product comment) while ~31 % of in-span
    fills sit through the 22:00 UTC
    rollover; needs policy rates or forward points, i.e. the key.
17. **Cross-sectional / pairs / stat-arb on the 97-market panel**: doubles the
    cost per unit of signal with no two-leg accounting.
18. **Adding E8 instruments**: the FX roster is the closed 8-currency matrix
    (28 = C(8,2), **verified** against the account record); crypto 33/33; the
    identifiable futures gaps are all in families measured as losses; the
    Softs and Stocks tabs were never captured — an owner action.

## 3. What the round found about the instrument

Three kills are about how money is counted, not where it is.

**The lock's value is mostly a convention — and so is the in-span finding.**
FR-3 arms the protective stop with zero latency and, when the runner exits
at the lock inside the very bar that touched TP1, prints the exit at the
lock's level: no adverse print, no half-spread, no slippage. **Verified** on
the corpus of record, pairing every baseline (`trail_tp1`) decision with its
`runnerProtection=hold` twin on forex contained years
(`r3/lock-same-bar-2026-09-14.txt`; the trail-R column reproduces the tracked
contained controls — fit in-pool 174,503 / −94.7 R, select in-pool 55,419 /
−1,321.1 R — matched against the record, not asserted by the instrument):

| fold | pool | pairs | lock − hold | lock exits | of which inside the TP1 touch bar | Δ on those rows | share |
|---|---|---:|---:|---:|---:|---:|---:|
| fit | in-pool | 174,503 | +4,688.9 R | 111,671 | 61,238 (54.8 %) | +4,187.8 R | 89.3 % |
| fit | held-out | 46,170 | +1,112.9 R | 29,860 | 16,491 (55.2 %) | +1,082.2 R | 97.2 % |
| select | in-pool | 55,419 | +1,311.8 R | 34,884 | 18,799 (53.9 %) | +1,232.5 R | 94.0 % |
| select | held-out | 15,285 | +399.7 R | 9,643 | 5,270 (54.7 %) | +361.2 R | 90.4 % |

Per pair the lock is worth +0.024 to +0.027 R; without the same-bar credit,
+0.0007 to +0.0029. The refuters' bar-cache counterfactual (the stop arms one
5-minute bar later; the next bar opens through the lock on 97.8 % of these
rows) removes +4,342 R of the +4,689 R on fit in-pool — the same answer by a
different route. Dead end 5 ("every hold-mode variant is worse than the
shipped ladder") is priced under this convention.

So is every forex in-span cell. Pricing the same-bar lock exits at the hold
arm's R — the infinite-latency bound — moves the eight cells thus
(**verified**, same pass):

| fold | pool | span | fills | same-bar lock exits | E emitted [lo95] | E bounded [lo95] |
|---|---|---|---:|---:|---:|---:|
| fit | in-pool | in | 39,065 | 13,633 (34.9 %) | +0.0361 [+0.0304] | **+0.0102 [+0.0040]** |
| fit | held-out | in | 10,457 | 3,656 (35.0 %) | +0.0321 [+0.0208] | +0.0003 [−0.0121] |
| select | in-pool | in | 12,471 | 4,305 (34.5 %) | +0.0324 [+0.0222] | +0.0079 [−0.0031] |
| select | held-out | in | 3,624 | 1,289 (35.6 %) | +0.0137 [−0.0056] | −0.0120 [−0.0331] |
| fit | in-pool | out | 135,438 | 47,605 (35.1 %) | −0.0111 [−0.0146] | −0.0346 [−0.0385] |
| fit | held-out | out | 35,713 | 12,835 (35.9 %) | +0.0030 [−0.0037] | −0.0180 [−0.0255] |
| select | in-pool | out | 42,948 | 14,494 (33.7 %) | −0.0402 [−0.0464] | −0.0618 [−0.0687] |
| select | held-out | out | 11,661 | 3,981 (34.1 %) | −0.0254 [−0.0373] | −0.0484 [−0.0616] |

Three in-span cells clear zero as emitted; **one does under the bound**. The
same-bar share is ~35 % of fills in every cell, in and out of span, so this is
not a span property — it is ~0.02–0.03 R/fill of every forex cell's money
that exists only if the protective stop moves within the bar that banked TP1.
The truth lies between the two columns: an automated stop move inside the bar
is plausible; a print at exactly the lock level with no spread or slippage is
not. The record currently carries only the emitted column. **This is the one
finding of the round that must be settled on the record's own cells before
anything else is built on them** (§4).

**The 16:00–21:59 UTC span is the last fifth of the E8 server day.** Any
daily-loss stop keyed to the server day (00:00 server = 21:00/22:00 UTC,
spec §20e) removes the profitable span preferentially, because the loss that
trips the cap accrues before it: on forex fit+select contained in-pool
(229,922 fills, −1,415.8 R) a closed-only 10 R stop removes 4,954 in-span
fills worth +180.7 R and net R falls −79.5 R; at 5 R, −376.5 R. Any future
governor must be told this.

**Cost share is relative stop width, exactly.** Spearman −1.0000 in forex.
The record already said the cap is a minimum stop width; it is now exact, and
"cheapest first" is "widest stop first".

## 4. The memo's program, and where this record departs from it

The round's ranking memo (its full text is in the round's journal) put the
engine in one sentence: *"an edge smaller than the instruments can resolve,
if it exists."* Gross clears zero on every fit cell and every in-span cell;
net on three in-span cells; clean-data net is negative in every configuration
swept. It ranked six items. Recorded here with the one change §3 forces.

1. **The lock's arming convention, priced on the record's own cells — first.**
   The memo ranked the hour-shaped cost table first (item 2 below) because
   the in-span cells' fate turned on E8's unobserved in-span spread: select
   held-out needed ~67 % of its priced spread-and-slippage effect absent to
   clear zero. §3 shows the same cells lose 0.024–0.032 R/fill to the FR-3
   same-bar credit alone, and only fit in-pool survives that bound. The cost
   question cannot be answered on cells whose money is convention-dependent,
   so the arming latency is prior. Build: the arming latency as a stated
   resolver parameter (zero bars, one bar), re-resolved from the pinned bar
   cache as a paired third R column on identical fills — never a re-swept
   arm — and the eight cells and the hour gate re-graded under both. If no
   in-span cell clears zero under the one-bar column, the hour finding is
   filed as convention-dependent and the cost table is moot. Zero provider
   bytes; the 2026-09-05 rebuild proved a full sweep runs from the cache.
2. **The hour-shaped cost table, then the frozen re-grade.** E8 bid/ask by
   hour for 28 pairs (the quote bank when the key returns, or an owner-run
   TradeLocker capture now — four weeks at scan cadence fills a 24 × 28 hourly
   table); re-resolve with an hour-shaped `halfSpread` and gap slippage;
   re-run the pre-registered market-grain gate untouched. Falsifier: in-span
   spread + slippage ≥ 0.45 bps leaves the held-out cell under zero. The
   memo's own caveat stands: "print-charged is not conservative on every
   axis" — item 1 is that axis.
3. **The 21-cross commission fix in the readers, from the daily cache**
   (previous trading day's close of each quote currency's USD leg, the
   survivorship refuter's method, which found every leg on disk — read; the
   readers derive the seven legs from the currency table and price at
   per-year means today — **verified**). Flips no
   cell; corrects every per-market figure the re-grade will read. The live
   path waits on one rate fetch per cross; a missing rate must decline the
   setup (§19e) — the caller's `?? 0` would charge zero. **Closed
   2026-09-14 on one physics, not the split this item described**: both
   paths price the crosses from the USD leg's last completed daily close
   (`2026.09.14.forex-commission-cross-rate`, record
   `forex-commission-cross-rate-2026-09-14.md`); a cross without a rate is
   refused by name.
4. **A signal screen that spends no fold**: any new entry family is tested on
   the fit fold against the random-entry excursion null the alpha review used
   (the shipped entry: t = −0.01) before it earns a sweep. The memo is right
   that this is the only place "outperform profitable traders" can come from:
   no exit, size, ranking or admission rule measured here rescues an entry
   with no direction.
5. **The maintenance-break expiry defect as a specification** — dead as a
   money lever (+0.0086 [−0.0064, +0.0236] conditioned on span); needs the
   review-hour ruling below before a line is written.
6. **The daily-frame arm, parked as a pre-registered null** — one frozen cell
   on the CFD-executable universe, a financing term modelled first, expected
   R about zero. Do not build a daily resolution tier for it.
7. **Amendment 33's grain against the effect size.** Forex in-span realized R
   has sd 0.58; at the class-grain effect of +0.03 R/fill a per-market 95 %
   lower bound above zero needs ~1,440 in-span fills per market against ~200
   per market-year — seven clean years per market. The hour gate cannot
   satisfy the market grain on any calendar the key will bring in this
   decade — the memo's arithmetic; it also offers a class-grain path with
   per-market sign concordance (22 of 22 markets on select in-pool). Under
   item 1's bound the effect is +0.01 and the same arithmetic worsens
   ninefold — mine, not the memo's.

A sizing line for §20 — per-fill risk against a daily budget, with the
server-day finding written in — is the one product change the round
justifies, and it changes no expectancy.

## 5. Owner items

Only the FMP escalation and the two E8 tab captures are unconditionally the
owner's. The memo names three rulings and one authorisation; under the
standing directive each must come with a recommendation that has survived
refuters, and none has yet — so they are recorded as OWED RECOMMENDATIONS,
not as questions put to the owner:

- **E8 bid/ask by hour** — a TradeLocker capture on the Pro Forex account,
  28 pairs, four weeks, at scan cadence. Running it is the owner's; building
  the capture tool is the driver's. Its priority is set by item 1's outcome.
- **What a review hour means** — wall-clock or open-market (HANDOFF already
  carries this as owed since 2026-09-12). Recommendation owed.
- **The market grain against the seven-year arithmetic** (item 7).
  Recommendation owed; the arithmetic is the memo's, not yet refuted.
- **Whether a genuinely new entry family is a new program.** The record
  already rules fold reuse: one burn per program, and a second read whose
  windows overlap a recorded read's on any shared symbol — any corpus, any
  engine version, any fold shape — refuses without acknowledgement (HANDOFF,
  the ledgered-read rules). The open question is only whether a different
  entry family is a different program under that rule. Recommendation owed.

## 6. Provenance

Every figure marked verified was either reproduced by the driver on the
corpus of record through the sealed door (`assertManifestedCorpusStreaming`)
or read by the driver directly from code, the account record or the
refuter's own output file, as each mark says; the lock pass is a session instrument (`lock-samebar.mts`, scratchpad)
whose output is tracked as `r3/lock-same-bar-2026-09-14.txt` — promoting it to
a census-registered reader is named work, as the commission readers were.
Everything else is read from the refuters' verdicts, whose scripts and
populations are stated in the round's journal. The commission figures are
the tracked readers' (`scripts/forex-commission-*.ts`).
