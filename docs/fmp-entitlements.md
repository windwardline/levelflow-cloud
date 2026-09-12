# FMP entitlements — what the subscription includes, and what Levelflow uses

Plan of record: **Ultimate**. Register compiled 2026-09-12 from the owner's own
dashboard export, so it records **what the dashboard presented**, not what a
live key returned. Nothing here was probed: the account is suspended (below), and
every intraday call returns 402.

This file exists because the entitlement list lived only in a screenshot. The
2026-07-02 upgrade argument is [fmp-ultimate-upgrade.md](/docs/fmp-ultimate-upgrade.md),
kept for provenance; this is the standing register. When the plan changes, or a
deferral's premise changes, edit this file in the same change set.

## Account status, 2026-09-12

The balance is paid and the dashboard shows Ultimate. **The API key still reads
suspended**, and the owner is escalating with FMP. Until that clears, three
things are blocked and one is not:

| | blocked |
|---|---|
| the live analyzer | **yes** — no key, no bars: `trade-analyzer/index.ts:372` returns 500 outright |
| extending the corpus | **yes** |
| a confirm read on fresh dates | **yes** |
| research on the corpus already on disk | **no** — the pinned cache fetches nothing |

## What Levelflow calls today

Seven endpoints, plus COT in the sweep. This is the whole of it.

| endpoint | where | what for |
|---|---|---|
| `/quote` | `trade-analyzer/marketLoader.ts:250` | the decision bar's current-price reference |
| `/historical-price-eod/full` | `marketLoader.ts:347`, `market-data/index.ts:544` | daily bars |
| `/historical-chart/{timeframe}` | `marketLoader.ts:350`, `market-data/index.ts:547` | intraday bars; 15-minute is the primary analyzer lens |
| `/treasury-rates` | `trade-analyzer/macroContext.ts:98` | the macro tilt (10-year change) |
| `/economic-calendar` | `news-calendar/index.ts:285` | timing risk |
| `/earnings-calendar` | `news-calendar/index.ts:347` | timing risk |
| `/news/{category}` | `news-calendar/index.ts:433` | timing risk, never direction |
| Commitment of Traders | `trade-analyzer/sweep.ts`, `scripts/replay-sweep.ts` | `cotPercentile`, `cotStance`, `cotSampleSize` on every corpus row |

Spend is governed, not merely rate-limited: `trade-analyzer/fmpBudget.ts` and
`scripts/fmpGovernor.ts` hold a byte ledger in two classes, background yielding
to live users, with the bulk of each rolling 30-day window deliberately unused.

## What the subscription includes and Levelflow does not use

### No instrument in this universe

The traded roster is 97 markets and **not one is a single equity** — crypto 33,
forex 28, futures 18, indices 6, agriculture 6, livestock 3, metals 2,
energies 1. The following are entitled and have nothing here to act on:

company profiles and reference data · financial statements and growth · DCF and
levered DCF · SEC filings · fundraisers and crowdfunding · earnings call
transcripts · Form 13F and institutional ownership · Senate and House trading
disclosures · insider trades · ETF and mutual-fund holdings and disclosures ·
ESG ratings and benchmarks · the equity analyst suite (price target summary and
consensus, ratings snapshot, historical ratings, stock grades and their history)
· IPO calendars and prospectuses · dividends and splits · stock screener and
directory.

They are not defects. They are the rest of a general-purpose financial API.

### Entitled, unused, and it bears

Listed in the order the evidence supports, not by appetite.

**Bulk and batch delivery** — EOD Bulk, exchange batch quotes, batch aftermarket
quote, batch forex quotes, and the statement bulk family. Unused anywhere in the
repository. The 2026-07-02 deferral reasoned that "Levelflow's verified symbol
list is small enough for controlled per-symbol requests"; the allowance was then
exhausted on **2026-08-13** and again **2026-08-27**, so that premise no longer
holds and the deferral should be reconsidered on its own terms.

**Market hours and holidays** — Global Exchange Market Hours, Holidays By
Exchange, All Exchange Market Hours. Session knowledge today is carried in
`src/lib/marketHours.ts`, `trade-analyzer/venues.ts` and `sessions.ts` rather
than fetched. This bears directly on the open hour-of-day finding: the
16:00–21:59 UTC span is the London–New York overlap, and a *fixed UTC* window
drifts against the real overlap twice a year on daylight saving. Exchange-sourced
hours could sharpen the span — or refute it, if holidays and half-days sit
unevenly across it.

**Full quote endpoints per class** — Full Forex Quote, Full Commodities Quotes,
Full Index Quotes. Richer than the generic `/quote` the loader uses.

**Economic indicators and market risk premium** — deferred on 2026-07-02 pending
"backtesting release-surprise behavior against Levelflow's traded markets". Still
unbuilt. Note the look-ahead trap before anyone starts: a revised macro series is
not what was knowable at the decision bar.

**Index constituents** — S&P 500, Nasdaq and Dow membership, current and
historical. Breadth is the only plausible route from equity data to the eight
US-equity-index instruments (SP, NSDQ, DOW, ESUSD, NQUSD, RTYUSD, YMUSD).

**COT, deeper** — the sweep consumes COT already. COT Analysis By Dates and the
report list are entitled and unused. COT is weekly and published Friday for
Tuesday, so any new use must carry that reporting lag explicitly or it is
look-ahead.

**Forex and crypto news, and their search variants** — headlines are consumed as
timing risk only. The 2026-07-02 ruling stands: no free-form headline sentiment
as a directional signal until a tested model with false-positive controls exists.

**Technical indicators** (SMA, EMA, WMA, DEMA, TEMA, RSI, standard deviation,
Williams, ADX) — entitled, and Levelflow computes its own from bars it already
holds. Fetching them would spend bytes to buy arithmetic. Recorded so the
question is not reopened.

## TipRanks add-on — declined, 2026-09-12

The owner reviewed the add-on and passed. Three reasons, any one sufficient, so
the decision does not need re-litigating unless one of them changes:

1. **No instrument.** Every TipRanks endpoint is US-equity analyst sentiment —
   per-analyst ratings, price targets, firm and analyst rollups, an analyst
   directory. The roster holds no single equities. The only conceivable path is
   aggregating single-stock sentiment for the eight US-equity-index instruments,
   and that is a daily-to-weekly signal clustered on earnings being fed to an
   engine that decides intraday.
2. **It could not be validated.** The add-on's own documentation caps ratings
   history at roughly three years. The clean contained tuning folds cover
   **2009–2018** (fit) and **2018–2022** (select) —
   `docs/research/r3/hour-mechanism-2026-09-07.txt`. There is no overlap, so it
   cannot be tested against the folds this project uses to decide anything,
   before purchase or after.
3. **Ultimate already carries most of it.** Price target summary and consensus,
   ratings snapshot, historical ratings, and stock grades with their history are
   included at no extra cost. The genuine delta is per-analyst granularity and
   analyst rank — which pays only if you are ranking analysts.

**The trigger that would reopen it:** Levelflow admitting single-equity or
equity-CFD markets. E8's Stocks tab has never been captured, so that is not
scoped today.

## Keeping this honest

The register is a dashboard reading, not a probe. When the key is restored, the
first thing that makes it true is a status check, not a fetch — and the
allowance has been exhausted twice, so nothing that warms a cache should run
before the priority order in `fmpBudget.ts` has been re-read.
