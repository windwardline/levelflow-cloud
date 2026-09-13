# The forex commission is converted in the wrong currency (2026-09-13)

Every forex net R figure in the record charges E8's published commission
through `venueCommissionRoundTripPrice`, which computes it as
`referencePrice × 5e-5`. That is exact on three pairs and wrong on twenty-five,
and the error runs both ways. The docblock beside it has said since 2026-08-11
that the error is small and one-sided. It is neither.

Output: `r3/forex-commission-conversion-2026-09-13.txt`. Every figure below is
the driver's own pass; the open-scope round's cost lens found the same defect
independently and its figures agree to within 2 R.

## The defect, by units

E8 charges **$5 round-turn per lot of 100,000 base units**, identical on all 28
pairs (PRIMARY, `e8-markets-dossier.md:358`). That is a fixed dollar amount:
`5e-5` USD per unit of the **base** currency.

The R accountant needs the commission as a price distance in the **quote**
currency, because it subtracts it from a price difference
(`realizedRFromLegs`, `replay.ts:234-255`). The correct distance is therefore

    true = 5e-5 USD × (quote per USD) = 5e-5 / (USD per quote)

The code computes `referencePrice × 5e-5`, and `referencePrice` is
`latestClose` (`executionQuality.ts:260-261`), which is quote-per-base. So

    model / true = (quote per base) / (quote per USD) = USD per BASE

- **USD is the base** (USDJPY, USDCAD, USDCHF): USD-per-base is 1. **Exact.**
- **USD is the quote** (EURUSD, GBPUSD, AUDUSD, NZDUSD): the model charges
  `latestClose × 5e-5` where the truth is a constant `5e-5`. GBPUSD at 1.27
  is overcharged 27 %; NZDUSD at 0.61 is undercharged 39 %.
- **Crosses** (21 pairs): off by the base currency's dollar rate, in whichever
  direction that rate sits from one.

The docblock at `venueCosts.ts:16-19` said the true figure depends on "the
quote currency's dollar rate" and that "rounding up is deliberate". The first is
the wrong currency; the second is false for every base worth under a dollar. It
was written in #310 on 2026-08-11 with engine v2 and has stood since.

## Verified on the corpus

Population: forex, baseline, accepted, filled, contained years, both pools,
fit and select. Confirm sealed at the door. 291,377 fills.

**The emitted `estimatedCommission` equals `latestClose × 5e-5` on 291,377 of
291,377 rows** — so the formula above is what was actually charged, not a
reading of the code.

**The assumption-free subset first.** On the four USD-quote pairs the correct
commission is exactly `5e-5` per base unit and needs no cross rate:

| pair | fills | ΔR (corrected − emitted) | per fill |
|---|---:|---:|---:|
| GBPUSD | 10,336 | **+122.7 R** | +0.0119 |
| EURUSD | 10,840 | +74.3 R | +0.0069 |
| AUDUSD | 11,137 | −71.9 R | −0.0065 |
| NZDUSD | 10,646 | **−107.8 R** | −0.0101 |

Sign and size are exactly what USD-per-base predicts.

**Per base currency**, using the corpus's own per-year mean prices for the USD
pairs as the cross rate (a proxy, stated as one; the subset above is exact):

| base | fills | charged R | true R | charged / true | ΔR |
|---|---:|---:|---:|---:|---:|
| GBP | 62,215 | 1,979.9 | 1,364.9 | **1.451** | +615.0 |
| EUR | 73,058 | 2,847.7 | 2,342.5 | 1.216 | +505.2 |
| CHF | 10,697 | 354.2 | 341.0 | 1.039 | +13.2 |
| USD | 30,790 | 1,207.3 | 1,209.5 | **0.998** | −2.2 |
| CAD | 21,029 | 633.7 | 754.7 | 0.840 | −121.0 |
| AUD | 52,062 | 1,664.0 | 2,038.2 | 0.816 | −374.2 |
| NZD | 41,526 | 1,140.2 | 1,566.8 | **0.728** | −426.6 |

USD-base reads 0.998 — the control the unit analysis predicts. Corpus-wide the
corrections nearly net: **+209.4 R across 291,377 fills.** Per market they do
not, and per market is the grain every verdict is decided at.

## What it does to the in-span finding

| fold | pool | span | fills | E net | lo95 | E corrected | lo95 corrected | ΔE |
|---|---|---|---:|---:|---:|---:|---:|---:|
| fit | in-pool | in | 39,065 | +0.0361 | +0.0304 | +0.0387 | +0.0330 | +0.0026 |
| fit | held-out | in | 10,457 | +0.0321 | +0.0208 | +0.0306 | +0.0192 | −0.0015 |
| select | in-pool | in | 12,471 | +0.0324 | +0.0222 | +0.0307 | +0.0205 | −0.0017 |
| **select** | **held-out** | **in** | **3,624** | **+0.0137** | **−0.0056** | **+0.0036** | **−0.0157** | **−0.0101** |
| fit | in-pool | out | 135,438 | −0.0111 | −0.0146 | −0.0083 | −0.0118 | +0.0028 |
| fit | held-out | out | 35,713 | +0.0030 | −0.0037 | +0.0023 | −0.0043 | −0.0007 |
| select | in-pool | out | 42,948 | −0.0402 | −0.0464 | −0.0417 | −0.0479 | −0.0016 |
| select | held-out | out | 11,661 | −0.0254 | −0.0373 | −0.0343 | −0.0462 | −0.0089 |

Three of the four in-span cells barely move. The fourth is the one that
matters: **select held-out, the only out-of-sample-in-both-senses evidence for
the finding, loses 0.0101 R per fill.** Its lower bound goes from just under
zero to nowhere near it. Four of that cell's six markets are AUD- or NZD-base —
the undercharged side.

The in-span finding is not gone: fit in-pool actually strengthens, and three
cells still clear. But its strongest out-of-sample claim was resting partly on a
commission the engine forgot to charge.

## A second finding on the same subject

The live analyzer banks `{bid, ask, spread}` into `analyzer_events` on every
successful quote (`marketLoader.ts:293-308`). Queried on 2026-09-13:

    action = 'quote_fetch': 37,790 rows · status = 'error': 37,790 · with a bid: 0
    2026-08-03 → 2026-09-01

**The path has never produced one real quote.** Not since the park — ever,
including the weeks the desk was live. The previous round's "the spread bank
accrues the day the desk unparks" was wrong on the premise; it did not accrue
when the desk was open either.

## What this change set does, and does not

**Does:** records the defect with its unit derivation and corpus verification;
corrects the docblock so the rationale states the two-sided truth; relabels the
test that pinned "0.5bp of price" as a correct figure so it now documents a
known approximation and fails the moment the formula changes, forcing the
record to move with it.

**Does not:** change the formula. The exact figure needs the **quote
currency's USD rate at cost-estimation time**, and neither path has it — the
sweep processes one symbol at a time from cache and the live loader fetches one
symbol's quote. R1's one-physics law forbids fixing one path and not the other,
and a refusal beats a wrong number (§19e), so the honest live behaviour without
a rate would be to decline every cross. That is a design with FMP-byte
consequences, not a constant edit, and it goes through refuters first. What
this note settles is that it must happen: every forex artifact in the record is
mis-charged two-sidedly, and the correction is computable from emitted fields
without a re-sweep.
