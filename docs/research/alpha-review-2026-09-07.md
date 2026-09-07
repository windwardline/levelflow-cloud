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
| select | in-pool | in | 12,471 | +403.5 | +0.0324 | **+0.0222** | 0.178 | 0.627 |
| select | in-pool | out | 42,948 | −1,724.7 | −0.0402 | −0.0464 | 0.278 | 0.637 |
| select | held-out | in | 3,624 | +49.8 | +0.0137 | −0.0056 | 0.197 | 0.618 |
| select | held-out | out | 11,661 | −296.6 | −0.0254 | −0.0373 | 0.271 | 0.643 |

Three of the four in-span cells clear zero, including both fit cells and the
in-pool select fold. The one that does not is the smallest, 3,624 held-out
select fills, and it is still point-positive.

**It is not concentrated.** In-span is positive in 9 of 10 fit years and 4 of
4 select years; in-span net R is positive on 20 of 22 markets, and in-span
expectancy beats out-of-span on **22 of 22**.

**And the mechanism is visible in the outcome mix.** The Target 1 rate barely
moves (0.63 in span, 0.65 out) and the Target 2 rate is actually *higher* out
of span. What changes is the stop rate: **17.8 % in span against 27.8 % out**,
a gap of ten points, which at a one-risk-unit stop is worth about 0.10 R per
fill on its own. The excursion shape says the same thing: out of span the
trade travels further relative to its stop in *both* directions
(+0.5128/−0.5710) than in span (+0.4867/−0.4914). The stop is too tight for
the movement those windows actually face.

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
numbering. The stop is a separate construction:
`stopBuffer = max(atr × stopAtrMultiplier, dailyAtr × dailyStopAtrMultiplier)`
(`:256-259`), capped at `atr × maxStopAtrMultiplier` (`:287`), where `atr` is a
fourteen-bar *intraday* ATR (`:230`). That intraday leg already moves with the
hours immediately preceding the decision, so the stop is not blind to the
clock. It is backward-looking about it, which is a far weaker complaint than
the one this note previously printed as fact.

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
further away in price while leaving it in the same place in R. And within each
span the width curve has an **interior optimum at the third quintile**
(fit in-span +0.0440 at 18 bps, select in-span +0.0558 at 14 bps), falling
away on both sides. A global stop-multiplier sweep cannot see that, which is
consistent with the arm's own finding that both tails lose.

## 3. What follows

**The round's candidate is the better-founded one, and this note now says so.**
Gating the hours — a per-market forex `lowEdge` window, using the machinery
`sessions.ts` already carries for three other classes — addresses an effect
that survives conditioning on the geometry, in the strongest available form:
out of span is worse at every stop width. An earlier draft of this note
recommended fixing the stop clock instead; the driver's own headroom test
refuted that, and the recommendation is withdrawn.

**What gating still has to answer**, and it is not small: it discards roughly
77.5 % of forex volume (135,438 of 174,503 fit rows and 42,948 of 55,419
select rows fall outside a 16:00–21:59 UTC span, counted from the quintile
tables above; the round reported 81 % for its narrower 16:00–21:00 window);
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

**And the interior optimum in relative stop width is its own candidate**, at
the market grain: the engine's shipped geometry is not at the measured peak,
and the peak is visible within both spans and both folds.

## 4. A structural finding about the gate itself

`grid-totalr.ts` computes `beatsBaseline = !thin && …`, where `thin` fires
when a variant keeps fewer than half the select fold's fills. Any selective
admission rule — and every candidate in this review that showed promise is
selective — is refused before its money is ever consulted. The gate as written
cannot express a verdict on the class of rule most likely to help. That is not
a reason to weaken it; it is a reason to give selective rules a verdict path
of their own, judged on per-fill expectancy with proper bounds rather than on
a total delta against a fold they deliberately do not cover.

## 5. Everything else the review measured

The full ranking, the candidates that measured nothing, the ones refuted, and
the literature the lenses surveyed are in the round's own output. The summary
worth carrying: no candidate produced a directional edge, the composition of
several admission levers together was never measured and remains the one
untested avenue with plausible upside *(round)*, and the prop-firm risk
governor remains designed and unbuilt — it moves an operator's outcome without
touching entry edge.
