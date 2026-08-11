# Guide copy review — round-8 batch 6 (owner-gated, one pass)

The round-8 product-honesty lens (PH findings, converge ledger
2026-08-10) found the Guide still telling the pre-repair story. This doc
walks every Guide claim against the measured record as of engine v2
(`2026.08.11.engine-v2`) and proposes replacement copy for the owner to
rule on in a single pass, per §17 discipline: **nothing here ships until
ruled.** The desk is parked, so no reader sees the current copy today —
this is the pre-reopen bar.

Two of the seven PH finding IDs (the batch names PH-2/3/4/5/8/10/14)
lost their detail at a session-compaction boundary; rather than
reconstruct stale text, every section below was re-walked fresh against
the corpus and the v2 engine. Coverage is by section, not by finding ID,
and is complete.

Source of the rendered copy: `src/components/workspace/GuidePanel.tsx`,
which transcribes the owner-approved deck verbatim. A ruling here means
amending the deck spec and the component together.

---

## 1 — §5 Confidence: the score-separation story (PH-3, CRITICAL)

**The copy:** "It is not a mood — it is the engine's estimate of setup
strength… where history proves the score separates strong setups from
weak ones, the bar is high and the number means more…"

**The measurement:** on the repaired corpus (1,017,734 records), the
confidence score's correlation with realized R is ρ ≤ 0.06 in every
class — the score ranks nothing, anywhere. No class today has "history
proving the score separates." The owner-approved 4b verdict retired the
threshold as a 4c axis (confidenceThreshold=0 in the grid) for exactly
this reason.

**Proposed replacement (draft for ruling):**

> Every setup carries a score out of 100 — the engine's weighing of the
> evidence it checked: direction agreement, location, volatility,
> session, news, positioning. Each market type must clear its own
> qualifying bar before a setup is shown at all. What the score has
> *earned* is measured, not assumed: where the record shows setups
> succeed at similar rates across scores, the bar is set low so the
> record speaks; where a market's sample is thin, the bar holds until
> the evidence arrives. The meter under the score shows the bar.

This keeps the mechanism honest (it IS an evidence composite) while
dropping the unearned claim that history has proven separation anywhere.

## 2 — §2 Stop loss: the structure story (PH-4)

**The copy:** "Levelflow places it past the surrounding price structure
with a volatility buffer, never at a round number."

**The measurement:** the stop cap (`maxStopAtrMultiplier`) binds on
essentially every accepted setup (~100% in the baseline decomposition)
— the shipped stop is the ATR cap, not the structural level; the
structural candidate sits beyond it and is overridden. The copy
describes the intent of the placement algorithm, not what the operator
actually receives. (The cap itself is an owner-approved 4c axis — this
sentence may become true again after 4d, but it is not true today.)

**Proposed replacement (draft):**

> **Stop loss** — the price that says the setup was wrong. Levelflow
> starts from the surrounding price structure and caps the distance
> against the market's own volatility, so risk stays on the setup's
> timescale.

## 3 — §7 The record: the dead replay description (PH-2, CRITICAL)

**The copy:** "The replay fills an order whenever price touches the
level and deducts no spread, so every figure is before costs — a
ceiling, not a forecast."

**The measurement:** this describes the retired evaluator. Since the
evaluator repair and engine v2, the replay: refuses fill-bar phantom
wins (only adverse facts are knowable on the fill bar), prices exits
gap-aware on the executable side of the book, triggers on bid/ask
rather than mid, resolves on 5-minute bars where they exist, and
charges the full round trip — spread, slippage, and the venue's
published commission. The figures are now after-cost by construction.
The sentence is not merely stale; it disclaims exactly the rigor the
engine now has, and understates the record's honesty.

**Proposed replacement (draft):**

> The replay fills orders the way a venue fills them — a limit needs
> the far side of the book at its level, a stop triggers when the near
> side touches it, and a gap fills at the open, not at the level — and
> every figure is net of spread, slippage, and commission. What you see
> is what the trade would have paid, not a ceiling.

**Adjacent (same section):** "Levelflow's history claims are measured,
not promised" and the money-positive framing stand. Note for the owner:
the six Record rows themselves carry the superseded pre-repair figures
until the v2 corpus re-measures them — the flags are batch-4 work
(PH-1), separate from this copy pass.

## 4 — §3 "Profit either way" and the breakeven arithmetic (PH-5 class)

**The copy:** step 3 — "or comes back to your entry and closes flat.
Profit either way on the second half." Step 2 — "the rest risks only
the spread." Plus the canonical instruction's "profit locked either
way" (spec §7/§3 LAW, pinned by languageGuard.test.ts in three
surfaces).

**The measurement:** a runner stopped at entry does not close flat —
it pays the spread and the commission on that half, and the banked
half's profit is net of its own costs. The baseline measured 44% of
forex fills scratching at breakeven after reaching +0.92R of favorable
excursion — the breakeven tax is the single largest drain the
decomposition found, and the accepted forex stream measured NET
NEGATIVE. "Risks only the spread" is nearly right (spread + commission)
but "closes flat / profit either way" overstates.

**Proposed replacement (draft, steps 2–3):**

> 2. **Target 1 hits.** Close half (a partial close) and move the stop
>    to your entry. Half the profit is real money now; what remains
>    risks only the round-trip cost.
> 3. **The finish.** The remaining half either reaches Target 2 — your
>    take-profit closes it — or returns to your entry and closes for
>    the cost of the trip. The banked half keeps the trade ahead.

**Owner decision needed:** the canonical instruction sentence itself
("profit locked either way") is owner law and languageGuard-pinned in
three places. If it changes, it changes in all three surfaces plus the
spec in one change set. Recommendation: keep the imperative ("close
half and move your stop to your entry") and re-cut the promise clause
to "the banked half is yours either way."

## 5 — §6 Costs: the commission is missing (CO-3's product face)

**The copy:** §6 names spread as the only cost ("Spread is the gap…
and it is paid out of your profit").

**The measurement:** the venue bills a commission on every line E8
publishes — $5/lot round-turn on forex (≈75% of the modeled spread+
slippage round trip on the flagship pair), the three-fee futures bill,
the $6/$12 index split. Engine v2 charges it; the Guide's cost story
should name it.

**Proposed replacement (draft, first paragraph):**

> Two costs come out of every trade: the spread — the gap between
> buying and selling price — and your platform's commission. Levelflow
> sizes both against the setup before showing anything:

(The Clean/Acceptable/Thin definitions stand; they are about
proportion, not itemization. Note: under the honest bill, fewer setups
grade Clean — that is the model telling the truth, not a regression.)

## 6 — §10 Glossary: "Banked half" names one path of two (PH-10 class)

**The copy:** "Banked half — First target hit, half banked, window
ended before Target 2."

**The measurement:** the resolver's `tp1_partial` also — and more
commonly — ends by the moved stop closing the runner at entry, not by
the window ending. The definition teaches the rarer path and omits the
one the instruction itself creates.

**Proposed replacement (draft):**

> **Banked half** — first target hit and half banked; the rest closed
> at your moved stop or when the window ended, without reaching
> Target 2.

## 7 — Claims that were checked and STAND (for the record)

- §1 whole section — review-not-execution framing, "nothing is the
  honest result," the linked-markets keep-the-stronger rule: all
  accurate.
- §2 Entry ("only ever limit orders") and Target 2 window-reachability
  sentence: accurate (runnerWindowShare is live).
- §4 Following your trades: accurate, including per-broker records.
- §7 "more than a decade" for majors: the forex fold calendar runs
  2009→2026 — seventeen years; understatement is fine.
- §8 Timeframes: all six views pickable, three-frame committee + 5m/1m
  validation: matches `marketData.ts` and the committee.
- §9 Market hours: grey/OPENS labels, crypto never closes, scanned
  count honesty: accurate.
- Glossary "Unclear" ("cannot say whether stop or target came first"):
  exactly the 2e ambiguity semantics. "Payoff", "R", "Money-positive":
  accurate.

## The ask

One pass: rule on drafts 1–6 (approve, amend, or reject each). Items
1 and 3 are the critical pair — the score story and the replay story
are the two places the Guide contradicts the measured record rather
than merely lagging it. All edits land as one change set amending the
deck spec + GuidePanel + languageGuard pins together, before any
reopen.
