# The alpha review: the entry has no direction, and the hours do (2026-09-07)

The owner commissioned an adversarial review of which pillars — named before
or not — could find alpha in data already on disk. Eight lenses proposed, a
screen cut to a shortlist, one agent measured each candidate on the corpus
against a control it had to reproduce first, and two independent refuters
attacked everything that measured positive. Twenty-six agents, none failed.

Two findings came out, and the driver re-measured both independently before
writing this. Figures below are the driver's own unless marked *(round)*;
outputs are tracked beside this note as `entry-edge-2026-09-07.txt` and
`hour-mechanism-2026-09-07.txt`. Both passes reproduced the tracked
contained-years control (forex fit 174,503 fills −94.7 R; select 55,419 fills
−1,321.1 R) before reporting anything.

## 1. The entry's direction call is worth nothing

Every row carries the excursion the trade actually made. In units of the
trade's own risk, forex contained years:

| fold | pool | fills | mean favourable | mean adverse | difference | 95 % interval |
|---|---|---:|---:|---:|---:|---|
| fit | in-pool | 174,503 | +0.5132 | +0.5432 | **−0.0300** | [−0.0332, −0.0269] |
| fit | held-out | 46,170 | +0.5168 | +0.5381 | −0.0213 | [−0.0273, −0.0153] |
| select | in-pool | 55,419 | +0.5069 | +0.5531 | **−0.0462** | [−0.0517, −0.0406] |
| select | held-out | 15,285 | +0.5098 | +0.5503 | −0.0405 | [−0.0514, −0.0297] |

Target 1 sits at exactly 0.4000 R on every row measured, so this asymmetry is
not an artifact of an uneven ladder: the favourable side is truncated at the
same distance for every trade.

Price moves against these entries slightly more than for them, on both folds,
in and out of sample, with every interval excluding zero. The round reached
the same place by a different route: against a matched random-entry null the
signed excursion difference was −0.0001 at t = −0.01 *(round)*.

**Caveat, stated plainly.** These excursions are life-of-trade and therefore
censored by the ladder itself — the stop truncates the adverse side and Target 1
truncates the favourable one. The measurement is not a clean unconditional
test of direction. What it does establish is that nothing in the excursion
data suggests a positive directional edge, and the round's uncensored null
agrees.

**So no exit geometry can rescue this engine by itself.** A ladder can only
divide a move that exists.

## 2. But the geometry is demonstrably wrong, and it is worth about a tenth of a risk unit

Forex contained years, split by the UTC hour the decision was made — inside
16:00–21:59 against everything else:

| fold | pool | span | fills | net R | E | 95 % lower | stop rate | Target 1 rate |
|---|---|---|---:|---:|---:|---:|---:|---:|
| fit | in-pool | in | 39,065 | +1,412.1 | +0.0361 | **+0.0304** | 0.177 | 0.630 |
| fit | in-pool | out | 135,438 | −1,506.8 | −0.0111 | −0.0146 | 0.266 | 0.652 |
| fit | held-out | in | 10,457 | +335.7 | +0.0321 | **+0.0208** | 0.190 | 0.628 |
| fit | held-out | out | 35,713 | **+107.1** | +0.0030 | −0.0037 | 0.255 | 0.661 |
| select | in-pool | in | 12,471 | +403.5 | +0.0324 | **+0.0222** | 0.178 | 0.627 |
| select | in-pool | out | 42,948 | −1,724.7 | −0.0402 | −0.0464 | 0.278 | 0.637 |
| select | held-out | in | 3,624 | +49.8 | +0.0137 | −0.0056 | 0.197 | 0.618 |
| select | held-out | out | 11,661 | −296.6 | −0.0254 | −0.0373 | 0.271 | 0.643 |

Three of the four in-span cells clear zero, including both fit cells and the
in-pool select fold. The one that does not is the smallest, 3,624 held-out
select fills, and it is still point-positive.

**The out-of-span side is not uniformly negative, and the exception matters.**
Three of the four out-of-span cells lose. The fourth, fit held-out, is **net
positive at +107.1 R over 35,713 fills**, though its 95 % lower bound (−0.0037)
does not clear zero. This is the only out-of-sample evidence on the fit fold,
and on it the population a gate would discard *makes money*. An earlier version
of this note omitted this row from the table, which understated the cost of
gating on precisely the fold where that cost is best measured.

**It is not concentrated — measured in-pool.** In-span is positive in 9 of 10
fit years and 4 of 4 select years; in-span net R is positive on 20 of 22
markets, and in-span expectancy beats out-of-span on **22 of 22**. Every one of
those counts is computed in-pool, and the per-market pair is narrower still —
`hour-mechanism-2026-09-07.txt:17` is headed **PER MARKET, select in-pool**, so
the 20 of 22 and 22 of 22 are one fold, not both. The year counts span the two
folds (`:13`). Out-of-sample concentration was not measured, and nothing here
should be read as if it were. This matters two paragraphs into section 3,
where the gating candidate is said to fail the market grain amendment 33
requires: that argument rests on the narrower of these counts.

**And the mechanism is visible in the outcome mix.** The Target 1 rate barely
moves on any fold — 0.630/0.652 fit in-pool, 0.628/0.661 fit held-out,
0.627/0.637 select in-pool, 0.618/0.643 select held-out, the widest being 3.3
points — and the Target 2 rate is actually *higher* out of span. What changes is the stop rate, on every fold:

| fold | pool | stop rate in span | out of span | gap |
|---|---|---:|---:|---:|
| fit | in-pool | 0.177 | 0.266 | 8.9 pts |
| fit | held-out | 0.190 | 0.255 | 6.5 pts |
| select | in-pool | 0.178 | 0.278 | **10.0 pts** |
| select | held-out | 0.197 | 0.271 | 7.4 pts |

The gap is present on all four and is **widest on select in-pool**, the fold
this note quotes when it needs one number. The excursion shape says the same
thing: on that fold, out of span the trade travels further relative to its stop
in *both* directions (+0.5128/−0.5710) than in span (+0.4867/−0.4914). Do not
read the ten-point figure as the effect's size; read the 6.5-to-10-point range.

**What the gap is not.** Multiplying a ten-point stop-rate gap by a one-unit
stop gives ~0.10 R per fill, and an earlier version of this note printed that
as the prize. It is a mediator's gross arithmetic, not a measured delta. The
measured in-minus-out expectancy differences are +0.0472, +0.0291, +0.0726 and
+0.0391 R per fill on the four folds above, so the 0.10 figure is between
**1.4× and 3.4×** the money it stood for. (An earlier version of this sentence
said "well under half", and a later one said two of the four defeated that on a
criterion it did not apply evenly. No count is needed. As fractions of half —
0.05 — the four deltas are 94.4 %, 58.2 %, 145.2 % and 78.2 %, in the fold
order used everywhere else. Only fit held-out (+0.0291, 58.2 %) is comfortably
well under half.) Amendment 39 puts realized R in charge
wherever it exists, and here it exists on all four folds, so those four
numbers are the effect.

**A tempting explanation, and why this note rejects it.** The obvious reading
of a ten-point stop-rate gap is that the stop is built with no hour-of-day
term. Traced through the code, that is not what the engine does, and the
measurement refutes the reading regardless of which formula it points at.

`expectedWindowMove = dailyAtr × sqrt(reviewHours × sizingHoursFactor / 24)`
(`pricePlan.ts:651-654`) genuinely carries no hour-of-day term. An earlier
draft of this note said it sized the stop. It does not. Its only consumers are
the Target 1 cap (`:660`), the runner ceiling (`:675`) and the
`window_cannot_carry_payoff` refusal it gates (`:683-686`) — the same three the
r2b geometry review isolated in section 2 of
`r2b-geometry-fresh-eyes-2026-08-31.md`, under that file's older line
numbering. Causality also runs the wrong way for the claim: `riskDistance` is
an *input* to `buildLadderTargets` (`:396`), fixed at `:319`, before
`expectedWindowMove` exists.

**On the population this note measures, the stop is mostly structural.** Two
earlier versions of this passage got this wrong and both are withdrawn; the
measured account is `forex-stop-provenance-2026-09-12.txt`, beside this note.

The stop is the *farther* of a pivot cushioned by `stopBuffer` and a 1.25 ATR
minimum, then clipped by a cap (`pricePlan.ts:288-309`). Executing
`getCategoryCalibration` over the 28 forex markets in the corpus manifest, all
28 resolve `maxStopAtrMultiplier` **4**, not the 1.0 the forex class row shows
at `calibration.ts:704` — a per-symbol override decides it. (`calibration.ts:442`,
cited by an earlier draft as forex, is inside the **livestock** block.) A cap of
4 ATR against a 1.25 ATR floor cannot bind unconditionally, and it does not:
measured over **373,510** forex baseline accepted rows with the confirm fold
byte-skipped, the stop is set by **pivot on 82.64 %**, cap on 9.77 % and the
volatility floor on 7.59 %, with `riskDistance / atr` running median 2.054
between a floor of 1.250 and a cap of 4.000 — and sitting at exactly 1.000 on
**0.000 %** of rows.

`stopBuffer` (`:256-259`) is therefore not discarded either: it is the cushion
subtracted from the pivot (`:293-295`), so on five rows in six it sets the
stop's distance from a real level. For forex it resolves to
`max(atr × 1.2, dailyAtr × 0.12)` — a fourteen-bar intraday ATR against a
fourteen-**day** one.

This agrees with a roster-level count the record already carried:
`docs/HANDOFF.md:873` and `:1253` measure the live calibration at 26 markets ×
1.0, 6 × 2.5 and 65 × 4, with the cap binding by arithmetic only on the 26
below the floor. Forex sits in the 65. `docs/trade-model.md:1641` reads forex
at 100 % cap, and it is **not** cited here as agreement — but not because it is
wrong. It measured a **superseded calibration era**: that table annotates its own
rows `metals (1.6 cap)` and `indices (3.0 cap)`, and nothing in `calibration.ts`
carries 3.0 today (the indices class row is 1.0 at `:820`; SP, NSDQ and DAX all
resolve 4). It predates the per-symbol layer, when forex's effective cap really
was the class row's 1.0 and 100 % cap was the correct reading. That is the
sharper warning, and the reason the invalidity banner alone stopped nobody: the
cell was not false, it was **stale**, so it read as corroboration.

None of this rescues the stop-clock fix — the headroom test refutes that
independently, and a stop anchored to market structure is even further from
something an hour-aware *window* clock would reach.

That makes the honest complaint *weaker*, not stronger — but only partly, and
the part is now measured rather than asserted. `stopBuffer` is a `max`, so its
daily leg binds whenever `dailyAtr > 10 × atr`; over the same 373,510 rows that
is **53.15 %** of them, against 46.85 % on the intraday leg, with the
`dailyAtr / atr` median at 10.31 — almost exactly the threshold. So the cushion
is a fourteen-day quantity on a slim majority of rows and the stop is only
partly a function of the hours before the decision. What is always intraday is
the pivot's *location* (`pricePlan.ts:236`, `:272-278`) and the floor and cap,
which both scale on `atr`. It is backward-looking about the clock at that
resolution, not as a whole. A decision at 21:45 UTC prices its stop off the liquid overlap and then
lives into the illiquid window, which is a real defect and a much smaller one
than "sized for an average day".

**And the driver's own headroom test refutes the reading anyway**
(`clock-fix-headroom-2026-09-07.txt`).

Split each span into quintiles of relative stop width (risk distance over
price, in basis points) computed within that span, forex contained years:

| fold | span | widest quintile, median width | E | in-span overall E |
|---|---|---:|---:|---:|
| fit | out | 34.18 bps | **+0.0050** | +0.0361 |
| select | out | 25.69 bps | **−0.0119** | +0.0324 |

Out of span, expectancy does improve monotonically with stop width — and the
widest quintile still does not reach what the span earns at a *much narrower*
13–18 bps. Out-of-span trades are worse at every stop width. So the stop rate
is a mediator, not the cause, and **re-sizing the stop would largely
re-denominate rather than recover.**

Two further measurements make that concrete. Target 1 sits at exactly
**0.4000 R on every row, standard deviation zero** — the ladder's payoff is
invariant to stop width by construction, so widening a stop moves Target 1
further away in price while leaving it in the same place in R. And **on the two
in-span curves only**, the width curve has an interior optimum at the third
quintile (fit in-span +0.0440 at 18 bps, select in-span +0.0558 at 14 bps),
falling away on both sides. The two out-of-span curves have no interior
optimum — they rise monotonically to Q5, as stated two paragraphs above. A
global stop-multiplier sweep cannot see an in-span interior optimum, which is
consistent with the arm's own finding that both tails lose; but the interior
optimum is a property of the span, not of the width axis everywhere.

## 3. What follows

**The round's candidate is the better-founded one, and this note now says so.**
Gating the hours — a per-market forex `lowEdge` window, using the machinery
`sessions.ts` already carries for four other asset types across three code sites (crypto, energies, and futures with indices sharing a block) — addresses an effect
that survives conditioning on the geometry, in the strongest available form:
out of span is worse at every stop width. An earlier draft of this note
recommended fixing the stop clock instead; the driver's own headroom test
refuted that, and the recommendation is withdrawn.

**What gating still has to answer**, and it is not small: it discards roughly
77.5 % of forex volume (135,438 of 174,503 fit rows and 42,948 of 55,419
select rows fall outside a 16:00–21:59 UTC span, counted from the span table in
section 2 and the full quintile table in `clock-fix-headroom-2026-09-07.txt`; the round reported 81 % for its narrower 16:00–21:00 window);
its held-out select bound does not clear zero (+0.0137, lower bound −0.0056);
it fails the market grain amendment 33 requires on a power argument rather
than an absence; and the gate cannot presently return a verdict on it at all
(section 4). It is a candidate for the next calendar's pre-registration, not a
ship.

**What the real world would add.** Forex spreads are widest overnight and
tightest through the London–New York overlap, and this engine charges a flat
1.17 basis points regardless. The cost model therefore *understates* the
out-of-span disadvantage; correcting it widens the gap rather than narrowing
it. That also means part of what looks like edge inside the span may simply be
the model over-charging there — which the cost work of the same day already
found in one direction, and which nothing here settles.

**And the in-span interior optimum in relative stop width is its own
candidate**, at the market grain: within the span the engine's shipped geometry
is not at the measured peak, on both folds (fit Q3 +0.0440 at 18 bps, select Q3
+0.0558 at 14 bps). The candidate is confined to the span. Out of span there is
no peak to move toward — those curves rise monotonically to the widest
quintile — so this is a refinement available only if the hours are gated
first, not an independent second lever.

## 4. A structural finding about the gate itself

`grid-totalr.ts` computes `beatsBaseline = !thin && …` (`:973`), and
`earnsMoney` (`:918-919`) is never consulted once `thin` fires. Any selective
admission rule — and every candidate in this review that showed promise is
selective — is refused before its money is ever consulted. The gate as written
cannot express a verdict on the class of rule most likely to help. That is not
a reason to weaken it; it is a reason to give selective rules a verdict path
of their own, judged on per-fill expectancy with proper bounds rather than on
a total delta against a fold they deliberately do not cover.

Two details matter to whoever builds that path, because both would silently
defeat a partial repair:

- **`thin` is a disjunction** (`:920-922`): it fires when the variant keeps
  under half the select fold's fills **or** when it keeps fewer than
  `minFilled`. A repair that addresses only the half-fold leg leaves the
  second gate standing in front of exactly the same rules.
- **A thin variant is not recorded as having no verdict.** `noVerdict` is
  itself `!thin && (…)` (`:999-1001`), and `reason` becomes
  `THIN (n filled)`. So a selective rule is filed as a *measured failure*,
  under the disposition round 39's own rule reserves for losses — the rule
  quoted three lines above that code, which says an unresolvable pairing is no
  verdict and never the same "fails" as a measured loss. The gate does not
  merely lack a path for selective rules; it mis-files them.

## 5. Everything else the review measured

The full ranking, the candidates that measured nothing, the ones refuted, and
the literature the lenses surveyed are in the round's own output. The summary
worth carrying: no candidate produced a directional edge, the composition of
several admission levers together was never measured and remains the one
untested avenue with plausible upside *(round)*, and the prop-firm risk
governor remains designed and unbuilt — it moves an operator's outcome without
touching entry edge.
