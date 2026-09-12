# The hour gate, graded at the market grain: refused (2026-09-12)

The alpha review of 2026-09-07 left one candidate standing — decline forex
setups outside a 16:00–21:59 UTC span. It could not be graded then, for two
reasons that are now gone: `grid-totalr` refused every selective rule before
reading its money, and the predicate grammar could not express a two-sided
window at all.

Both were repaired. This is the grading.

**The verdict is a refusal. Zero of 91 markets accept.**

## What was run

```
npx tsx scripts/grid-totalr.ts docs/research/r3/capture-all-classfolds.jsonl \
  --derive-filters "inSpan:decisionHourDistance<=2.5" \
  --verdict-unit market
```

Corpus `021821537f28`, engine `2026.09.01.platinum-group-rate-inverse`, anchor
2026-08-26. Fit and select only — the confirm fold was not read and no flag
that could read it was passed. Outputs are tracked beside this note as
`r4/hour-gate-market-2026-09-12.stdout.txt` and `.json`.

`decisionHourDistance<=2.5` is exactly the hours 16 through 21 UTC: both 16 and
21 sit 2.5 from the 18.5 midpoint, while 15 and 22 sit 3.5.

## The result

Of 91 markets: **80 judged and failed, 11 no verdict, 0 accepted.**

**88 were actually tested.** On DOW, NSDQ and SP every decision already falls
inside 16:00–21:59 UTC, so the predicate retains 100 % of their fills and cannot
differ from the baseline at all: `ΔR fit 0.0`, `ΔR select 0.0`, and 0 of 43, 0
of 148 and 0 of 146 nonzero pairs. The gate disposes of them correctly — they
land in the no-verdict bucket, not among the 80 — but "0 of 91" should not be
read as 91 rules tested.

Thirteen markets beat the baseline on *both* folds, at paired p ≤ 0.05, with a
non-negative expectancy delta — every comparison the gate makes. **None of the
thirteen demonstrates a profit.**

| market | ΔR fit | ΔR select | paired p | ΔE select | E select | **E 95% lower** |
|---|---:|---:|---:|---:|---:|---:|
| USDJPY | +257.2 | +129.5 | 0.003 | +0.066 | +0.038 | **−0.002** |
| XAUUSD | +475.1 | +137.0 | 0.003 | +0.087 | +0.040 | **−0.010** |
| PLUSD | +106.7 | +47.1 | 0.001 | +0.290 | +0.227 | −0.017 |
| EURUSD *(held out)* | +236.1 | +130.9 | 0.012 | +0.037 | +0.003 | −0.032 |
| ADAUSD | +71.8 | +291.0 | 0.001 | +0.044 | −0.053 | −0.101 |
| HOUSD | +279.0 | +75.3 | 0.007 | +0.224 | −0.003 | −0.227 |
| ZSUSX | +109.5 | +51.6 | 0.004 | +0.281 | +0.003 | −0.237 |
| ZBUSD | +79.8 | +67.6 | 0.002 | +0.007 | −0.189 | −0.312 |
| ZNUSD | +99.4 | +60.3 | 0.011 | +0.010 | −0.173 | −0.312 |
| ALGOUSD | +137.3 | +592.1 | 0.001 | +0.094 | −0.408 | −0.496 |
| TRXUSD | +265.7 | +393.6 | 0.001 | +0.045 | −0.456 | −0.563 |
| XTZUSD | +223.0 | +173.1 | 0.001 | +0.099 | −0.605 | −0.813 |
| ATOMUSD | +17.1 | +311.8 | 0.001 | +0.113 | −0.796 | −0.957 |

Twenty-three markets *do* carry a positive lower bound. None of them is in the
thirteen — they fail a comparison term instead. **No market both beats the
baseline and demonstrates a profit.** That conjunction is what acceptance is.

USDJPY misses by 0.002 R and XAUUSD by 0.010 R. They are named because they are
the nearest misses and because a later reader will want to know the margin was
small, not because a near miss is a pass.

## Why this is a real verdict and not the old refusal

**Eighty-five of these 91 rows** would previously have read
`THIN (n filled) — refuse`, with no money read at all. Seventy-eight carry the
`[selective]` note — the variant declines roughly three-quarters of their fills,
tripping a guard that sat first in the acceptance conjunction — and seven more
fall under the market grain's 30-fill floor.

Six clear **both** legs and would have been judged even before the repair: DOW,
NSDQ and SP (100 % retained), LEUSX (52.1 %), HEUSX (50.6 %) and ZRUSD (50.0 %).
Naming them matters because the repair's value is measured by what it newly
made sayable, and six of these rows were already sayable.

The stdout now reads `fails [selective — 866 filled]`: selectivity is recorded
as a description and the verdict is decided on money. That is the whole point of
the repair, and this grading is the first thing it made sayable.

## What it means for the candidate

The alpha review's figures were at the **class** grain, where forex in-span
select expectancy was +0.0324 with a 95% lower bound of +0.0222. That result is
not contradicted here; it is not reproduced per market either. Amendment 33
requires the market grain precisely because a class figure can be carried by a
few markets, and this is what it looks like when the check bites: thirteen
markets beat the baseline, none of them individually clears its own error bar.

**The hour gate does not ship.** No amendment-33 verdict supports it.

It is also not dead. What the grading establishes is that the effect is not
per-market-provable *on the tuning folds as they stand*, which is a narrower
statement than "the hours carry nothing".

## Pre-registration, frozen here

If this candidate is ever re-read, these are its terms, fixed before any new
data exists rather than after:

1. **The predicate is `decisionHourDistance<=2.5`.** Not a re-searched window.
   The span was chosen once, on 2026-09-07, and re-fitting it on a new calendar
   would be a new search wearing an old result's clothes.
2. **The grain is the market**, per amendment 33, and this grading is the prior.
   A class-grain figure is not an acceptance.
3. **The acceptance rule is D4 unchanged**: beat the baseline on both folds at
   paired p ≤ 0.05 with a non-negative expectancy delta, *and* carry a positive
   95% lower bound on the variant's own select expectancy.
4. **Per-market span exclusion applies** (`scripts/feedMonths.ts`,
   `calendarFoldsExcluding`). A calendar pre-registered without it is not
   pre-registered: 47.3% of the forex confirm fold lies in escaping-feed years
   *(round — not re-measured by the driver)*.
5. **The costs are stated in advance, not discovered afterwards**: the rule
   declines roughly 77.5% of forex volume; its held-out select bound did not
   clear zero at the class grain; and on the fit held-out fold the population it
   discards is net +107.1 R.
6. **The confirm fold is not the next step.** Every roster symbol is burned. A
   second read spends the last door on a candidate that no market grain
   supports, which is the wrong order.

## What would change the answer

Not a re-search of the window. The honest routes are a calendar that does not
yet exist, or a mechanism that explains why in-span differs — and the cost model
is the known-weak input there, a flat 1.17 basis points with no hour term, whose
error runs toward the finding rather than away from it. Neither is reachable
while the provider key is suspended.
