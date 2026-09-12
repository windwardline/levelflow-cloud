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
| the live analyzer | **yes** — a *suspended* key is present, so the absent-key guard at `trade-analyzer/index.ts:372` passes and the failure lands downstream as per-request 402s (`marketLoader.ts:280`, `:395`) |
| extending the corpus | **yes** |
| a confirm read on fresh dates | **yes** |
| research on the corpus already on disk | **no** — the pinned cache fetches nothing |

## What Levelflow calls today

Nine endpoints, across the Edge functions and the research scripts. This is
the whole of it.

| endpoint | where | what for |
|---|---|---|
| `/quote` | `trade-analyzer/marketLoader.ts:250` | the decision bar's current-price reference |
| `/historical-price-eod/full` | `marketLoader.ts:347`, `market-data/index.ts:544` | daily bars |
| `/historical-chart/{timeframe}` | `marketLoader.ts:350`, `market-data/index.ts:547` | intraday bars; 15-minute is the primary analyzer lens |
| `/treasury-rates` | `trade-analyzer/macroContext.ts:98` | the macro tilt (10-year change) |
| `/economic-calendar` | `news-calendar/index.ts:285` | timing risk |
| `/earnings-calendar` | `news-calendar/index.ts:347` | timing risk |
| `/news/{category}` | `news-calendar/index.ts:433` | timing risk, never direction |
| `/commitment-of-traders-report` | `scripts/replay-sweep.ts:1835` | `cotPercentile`, `cotStance`, `cotSampleSize` on every corpus row; `trade-analyzer/sweep.ts` only consumes it, via `cotContext.ts` |
| `/commodities-list`, `/index-list` | `scripts/verify-fmp-matches.ts:173` | the two authoritative enumerations, for re-probing the unmatched register |

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
· IPO calendars and prospectuses · dividends and splits · the stock screener
and the equity directory. (The commodity and index directories ARE used — see
the table above.)

They are not defects. They are the rest of a general-purpose financial API.

### Entitled, unused, and REFUTED as levers

Both entitlements this register first named as bearing were measured and neither
survives. They are kept here, refuted, so the case is not rebuilt from the
dashboard.

**Bulk and batch delivery — not a lever against the allowance.** MEASURED on
`.calibration-cache`, 96 symbols per timeframe: **5-minute 5.70 GB, 15-minute
1.93 GB, daily 0.04 GB.** Daily bars are **0.48 %** of the cached bar volume. The
2026-08-13 and 2026-08-27 exhaustions were bought by intraday history, and the
bulk family is EOD and statements — the entitlement list carries no bulk or batch
form of intraday charts. So the 2026-07-02 deferral's premise is indeed falsified
and the conclusion is unchanged for a better reason. Batch quotes and batch forex
quotes are real and cheap, but `/quote` is one small response per symbol per
scan; adopt them opportunistically when the live path is next touched, and stop
citing bulk delivery as an answer to the allowance.

**Exchange hours and holidays — the defect it would fix does not exist.** The
endpoint is keyed by exchange, and **61 of 97 markets have no exchange at all**:
all 28 forex and all 33 crypto. The hour-of-day finding is *entirely* forex, so
exchange-sourced hours cannot reach it. Worse, on dates a venue is actually shut
the corpus already carries zero decisions — the provider prints no bars and
`replay.ts:375-377` resolves bar by bar rather than by clock, so absence of data
is already the closure model and it already works. Holiday-decided rows are 796
of 44,344 exchange-traded fills, a difference from other days of −0.0317 R/fill
with a 95 % interval spanning zero *(round)*.

**What the refuters found instead, and it is free.** 20.3 % of exchange-traded
decisions carry review windows crossing their own class's nightly maintenance
break *(round — not re-measured by the driver)*. The mechanism IS verified:
`src/lib/marketHours.ts:51-55` defines `CME_COMPLEX_CALENDAR` with a
`dailyBreak` of 17:00–18:00 ET, and `getSetupExpiryTime`
(`replay.ts:827-844`) consults only `getUpcomingWeeklyCloseTime` — the nightly
break is modelled and never applied to an expiry. No calendar, no provider and
no new data are needed to fix it, which is why it outranks the entitlement it
replaces.

### Entitled, unused, and still open

**Full quote endpoints per class** — Full Forex Quote, Full Commodities Quotes,
Full Index Quotes. Richer than the generic `/quote` the loader uses.

**Economic indicators and market risk premium** — deferred on 2026-07-02 pending
"backtesting release-surprise behavior against Levelflow's traded markets". Still
unbuilt. Note the look-ahead trap before anyone starts: a revised macro series is
not what was knowable at the decision bar.

**Index constituents** — S&P 500, Nasdaq and Dow membership, current and
historical. Breadth is the only plausible route from equity data to the seven
US-equity-index instruments (SP, NSDQ, DOW, ESUSD, NQUSD, RTYUSD, YMUSD —
`symbols.ts:310`).

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
   aggregating single-stock sentiment for the seven US-equity-index instruments,
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
