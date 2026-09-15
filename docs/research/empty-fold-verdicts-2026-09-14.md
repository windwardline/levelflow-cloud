# The gate called an unmeasured fold a measured loss, in three recorded verdicts (2026-09-14)

`grid-totalr`'s acceptance conjunction requires `fitTotalDelta > 0`. `totalOf`
returns 0 for an absent cell, so a market with **no fit-fold rows at all**
differences to 0 − 0 = 0, fails that conjunct, and — because no leg of the
no-verdict ladder tested for fold emptiness — fell through to the bare word
`fails`. A fold that was never measured was reported as a measured loss.

The confirm fold has carried exactly this guard since #364 round 43, and its
comment states the principle: *"a delta needs evidence on BOTH sides. Without
the filled guards this read 0 − 0 = 0."* The fit fold never got one.

## Who it bit

Derived from the corpus manifest's own per-symbol, per-fold emitted counts, not
inferred: **22 roster symbols carry no `fit` split at all**, because they were
listed after their class's fit fold ended. **Sixteen of them are among the 91
markets the gate grades**; the other six (ARWUSD, BNBUSD, CAKEUSD, THETAUSD,
TRUMPUSD, XAGUSD) have every row inside the confirm fold and never reach the
gate. For contrast, EURUSD carries 10,776 fit rows and BTCUSD 4,752.

The sixteen are eleven crypto — AAVEUSD, AVAXUSD, DOTUSD, DYDXUSD, EGLDUSD,
GRTUSD, HBARUSD, IMXUSD, NEARUSD, SOLUSD, UNIUSD — and five that are not:
**ASX, DAX, DOW, FILUSD and NIKKEI**. An earlier draft of this note said twelve
markets and named only the crypto. Twelve was the count whose IN-SPAN verdict
moved; sixteen is the count with no fit fold. They are different populations and
the first draft printed one number for both.

## What it changes, and what it does not

**The headline does not move.** An empty fold cannot produce an acceptance, so
no accept is created or destroyed. Re-run on all three reads, the accepted count
is 0 of 91 before and after, and the money-leg failures — the markets that beat
every comparison and still show no profit — are unchanged at 13, 11 and 20.

What moves is the composition, identically in all three:

| in-span rule, 91 markets | before | after |
|---|---:|---:|
| accepted | 0 | 0 |
| failed on a comparison | 67 / 69 / 60 | 56 / 58 / 49 |
| failed on the money leg | 13 / 11 / 20 | 13 / 11 / 20 |
| no verdict | 11 | 22 |
| **total failed** | **80** | **69** |

(The three columns are the 2026-09-12 read, then the net and bound columns of
2026-09-14.) Across every variant, not only the in-span rule, **79
(market, variant) pairs on 15 markets** moved out of `fails` into the
fold-emptiness reason, identically in all three artifacts.

## Why it matters even though the verdict stands

"80 judged and failed" told a reader that 80 markets were measured against the
hour rule and lost. Eleven of them had no fit fold to measure. The gate's own
vocabulary draws this distinction everywhere else — its underpowered message
ends *"too few fills to judge, which is not the same as a measured loss"* — and
the one place it did not draw it is the place a market can have no data at all.

## The change

One guard in `groupVerdicts`, which both grains share, so the class and market
units are fixed together:

```ts
const fitEvidenceAbsent = aggregate.variant.fit.filled === 0 ||
  aggregate.base.fit.filled === 0;
```

It enters in two places, and the second was missing from the first draft of this
fix until a review found it:

1. **The disposition**, as a leg of the no-verdict ladder — placed BELOW the
   pairing floor. A pair that would otherwise reach `fails` has already cleared
   that floor, so this still catches every mislabelled one, while a variant that
   changed nothing on a market keeps the message saying so, which is a fact
   about the rule rather than about the data. Placed above the floor, as the
   first draft had it, 29 pairs lost that more specific reason.
2. **The acceptance conjunction.** The guard fires when EITHER side is empty,
   but the delta is forced to zero only when BOTH are. With the variant's fit
   fold empty and the baseline's fit R negative, `0 − (−X)` is positive and the
   conjunct passed — so the gate could return `accepted` **and** `noVerdict`
   together, on a fold the variant never traded. Every other no-verdict leg is
   mutually exclusive with acceptance by construction; this one is not. The
   artifact carries no `noVerdict` field, so a consumer reading `accepted` would
   have seen an accept and could have burned the confirm fold on it. This note's
   first draft asserted the case was impossible without testing it.

The reason names which side is empty, because on the one-sided case "both sides"
and "0 − 0" are both false.

Tests: a one-sided empty fold, a both-sides empty fold (the case all 79 real
pairs carry), the market grain where the 30-fill floor could shadow the leg, a
market that fails pairing and keeps its own message, an empty fold whose absent
side flatters the delta and must still not be accepted, and a populated fold
that is still judged. Five mutations, each caught: requiring both sides empty
rather than either, dropping the guard from the disposition, dropping the reason
branch, dropping it from the acceptance conjunction, and moving the leg back
above the pairing floor.

## What is NOT fixed here

**Eight other tracked market-grain gradings carry the same defect, on 416
(market, variant) pairs**, and are not regraded in this change set:
`admission-derived-grading.json` (120), `stop-cap-grading.json` (88),
`per-market-grading-classfolds.json` (68), `review-window-grading.json` (45),
`stop-cap-8-grading.json` (32), `class-default-gate-off-grading.json` (25),
`class-default-grading.json` (23) and `review-window-96-grading.json` (15).
Their corpora are on disk, so regrading costs no provider bytes — but some of
them feed amendment 36's removal test through `register-verdict`, which reads
only `parsed.markets` and would consume a changed disposition with no signal. A
batch re-run could therefore move a recorded register decision, which needs its
own analysis rather than a loop. **Recorded as owed.**

The seven class-grain gradings beside them are NOT the same defect: their rows
repeat one class verdict per member market, so an empty per-market fold is not
what was graded there.

## The artifacts

The three tracked hour-gate artifacts are regenerated in place by re-running
their own recorded commands against their own corpora, at zero provider bytes,
so the command in each record reproduces the file beside it. Git history holds
what they said before, and the table above is the difference. Note that the
2026-09-12 note's command block omits `--out`, and its stdout now carries an
`R column: net arm` header line that the `--r-arm` flag introduced two days
after that read; the default is `net`, so no figure moved.
