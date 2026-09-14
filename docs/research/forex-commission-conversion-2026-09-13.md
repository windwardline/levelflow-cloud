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

E8 charges **$5 round-turn per lot of 100,000 units**, identical on all 28
pairs (PRIMARY, `e8-markets-dossier.md:358`). That the units are **base**
currency is an inference from FX convention — marked as one, because the whole
derivation turns on it — and it is confirmed by E8's own sizing arithmetic: its
worked example values a GBP/NZD lot as `30 × 100,000 / (1.351 × 100,000)` using
the **GBP/USD** price, i.e. the 100,000 is in GBP (help article 9453396, via the
dossier). So: a fixed `5e-5` USD per unit of the base currency.

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

**Does not (as of #629/#630; superseded for four pairs the same day — see the
last section):** change the formula — and the reason is narrower than this note
first said. For the four **USD-quote** pairs the true figure is the constant
`5e-5`: no rate is needed, both paths compute the same constant, one physics is
satisfied trivially. Ranked by total mis-charge across all 28 pairs (the
reproduction output's per-pair table, ranked by |ΔR total|): GBPUSD 1st (+122.7 R over 10,336 fills), NZDUSD
4th (−107.8 R), EURUSD 14th (+74.3 R), AUDUSD 15th (−71.9 R). EURCHF is 2nd
(+122.1 R) and NZDCAD 3rd (−118.1 R) — the crosses are not the small half of
the defect. That fix shipped later the same day as
`2026.09.13.forex-commission-usd-quote` (last section), with an
`ANALYZER_VERSION` bump because it moves `costShare` and therefore admission on
those four. What needs a design is the **21 crosses**: their exact figure needs
the quote currency's USD rate at cost time, and neither path has it — the sweep
processes one symbol at a time from cache and the live loader fetches one
symbol's quote. A refusal beats a wrong number (§19e), so the honest live
behaviour without a rate would be to decline every cross; that has FMP-byte
consequences and goes through refuters first. What this note settles is that it
must happen: every forex artifact in the record is mis-charged two-sidedly, and
the correction is computable from emitted fields without a re-sweep.

**The suite was green throughout the quote-bank failure.** The only pin on that
path (the `assert.match(loader, /action: "quote_fetch"…/)` pin in
`tests/executionQuality.test.ts`) regex-matches the source text of the banking call — it asserts the code is written, not that it ever ran. Thirty-
seven thousand consecutive failures passed every test. The honest guard is an
operational one — a cadence check on `analyzer_events` quote_fetch success —
and it is recorded as owed, not built here.

## The four USD-quote pairs, fixed the same day

Engine `2026.09.13.forex-commission-usd-quote`. Where the currency table says the quote is USD
(`symbolCurrencyPair` in `symbols.ts`; the table is the authority, the ticker's
shape is never consulted), `venueCommissionRoundTripPrice` returns the constant
`5e-5`. USD-base pairs were already exact and are unchanged; the 21 crosses keep
the price-scaled approximation, pinned as one.

Three independent refuters (the open-scope round, 2026-09-13) reproduced the
defect before this shipped — net corrections of +221.6 R, +223.7 R and +226.8 R
across all 28 pairs, a 5 R spread among them, against this note's +209.4 R on
contained fills; the 12–17 R between them and this note is population (all
years vs contained) and rate method (per-fill previous-day legs vs per-year
means). Each said the same thing: real, verified, changes no cell's
zero-clearing status, ship it as a correctness change with a version bump.
Their verdicts are in the round's journal; the round's memo will carry them
into the record.

Tests moved with the physics: `tests/venueCosts.test.ts` (the three cases, a
`symbolCurrencyPair` contract pin, a roster census requiring every forex
symbol a pair and exactly four USD-quote) and `tests/executionQuality.test.ts`
(the CO-3 fixture is USDCHF now, a USD-quote sibling pins the constant, and
the roster-wide scale test splits on the currency table). Mutation-tested at
six sites; the one first-pass survivor — nothing pinned the helper's
"pair or null" contract — was pinned and killed.

**Admission moves, and was measured first.** The cost share on the four pairs
changes, so their admission under the forex class row's `maxCostShare: 0.15`
changes. On R3's 55,554 accepted four-pair baseline rows (fit + select;
`r3/forex-commission-admission-2026-09-13.txt`):

| | rows | over cap, emitted | over cap, corrected | newly declined | newly admitted |
|---|---:|---:|---:|---|---|
| EURUSD | 14,077 | 1,394 | 1,013 | 0 | 381 (339 filled, −33.3 R as emitted) |
| GBPUSD | 13,588 | 784 | 369 | 0 | 415 (373 filled, −26.3 R) |
| AUDUSD | 14,171 | 212 | 492 | 286 (238 filled, −7.8 R) | 6 (5 filled, −1.1 R) |
| NZDUSD | 13,718 | 52 | 267 | 215 (186 filled, −8.0 R) | 0 |
| all pairs, all years | 55,554 | 2,442 | 2,141 | 501 (424, −15.8 R) | 802 (717, −60.7 R) |
| all pairs, contained years | 49,908 | 2,171 | 1,971 | 501 (424, −15.8 R) | 701 (627, −64.6 R) |

The per-pair rows are all years. The over-charged pairs (EURUSD, GBPUSD)
admit more, the under-charged pairs (AUDUSD, NZDUSD) admit less, and the mean
cost share on the four is unchanged to the third decimal (0.0769 → 0.0766).
On contained years, at the emitted accounting, the swap costs about 49 R
(admits −64.6, declines −15.8); the repricing of the four pairs' 42,959
contained fills gives back +17.3 R net — the same population, not the same
rows. Under amendment 39 that is a wash — which is the point: this is a
published figure charged wrongly, corrected, and the correction was priced
before it shipped rather than after.

**The producers are tracked readers (2026-09-14).** Both outputs in `r3/`
are printed by census-registered readers under `scripts/` —
`forex-commission-conversion.ts` (`--years contained --witness
docs/research/r3/feed-character.txt`) and `forex-commission-admission.ts`
(`--witness docs/research/r3/feed-character.txt`) — which open the corpus
only through the sealed door (`tests/confirmFoldSealed.test.ts` runs both on
its fixtures and proves no line moves with the confirm fold), refuse a run
that names no corpus, filter to the shipped population, and derive the four
pairs and the cap from the currency table and the forex class row. Before
they were tracked, the same figures came from two session instruments;
the readers reproduced every cell, base and pair of those outputs to the
digit on the corpus of record before replacing them, and
`tests/forexCommissionReaders.test.ts` pins the arithmetic on a hand-computed
corpus.

**Not fixed here: the 21 crosses.** Their exact figure needs the quote
currency's USD rate at cost time, which neither path supplies today. The
refuters added a fact this note lacked:
the daily cache holds every USD leg, so the sweep half is buildable from disk
using the previous trading day's close (knowable at decision time); only the
live half waits on a rate fetch, i.e. on the key. One physics forbids shipping
the sweep half alone.

**Fixed 2026-09-14, both halves at once — `2026.09.14.forex-commission-cross-rate`.**
The rate on both paths is the USD leg's last completed daily close: the
live loader reads it from the bar store beside the market's own load, the
sweep from the pinned cache through the same completion gate, and
`symbols.ts` names the leg from the currency table. `venueCosts.ts` prices a
cross at 5e-5 / USD-per-quote and answers null without a rate — the plan is
refused by name (`commission_rate_unavailable`), and live blocks the market
with the fact when the leg's bars do not load; nothing charges zero or the
price-scaled figure any more. The corpus emits `usdPerQuote` so a reader can
re-derive the charge. Measured first, as the four pairs were:
`r3/forex-commission-admission-crosses-2026-09-14.txt` (this reader's
`--pairs crosses`, the leg's completed close at each decision from the pinned
cache, contained years by the feed witness). Record of the change:
`forex-commission-cross-rate-2026-09-14.md`. The basis itself — $5 per lot
of BASE units rather than per $100,000 of notional — remains an inference
from E8's symbols table beside its 100,000 contract size; no observed ticket
shows a commission line, and one E8 fill statement on any cross would settle
it (owner item).
