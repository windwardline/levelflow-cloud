# FMP Ultimate Upgrade

Last reviewed: 2026-07-02

## Confirmed Plan Value

FMP's Ultimate plan adds materially more useful data for Levelflow than Premium:

- 3,000 API calls per minute instead of 750.
- Global coverage.
- 1-minute intraday charting.
- Full historical access.
- Bulk and batch delivery.
- Earnings transcripts, ETF and mutual fund holdings, and 13F institutional
  holdings.

For Levelflow's current market-review workflow, the most valuable items are
1-minute intraday charting, deeper intraday lookbacks, full historical daily
context, broader provider coverage, Treasury-rate context, targeted market
headlines, economic calendars, earnings calendars, and higher call capacity for
Market Scan. The holdings, 13F, and transcript datasets are better suited to
future equity/fundamental modules, not the current short-term multi-asset setup
engine.

## Verified New Market Coverage

The upgraded key was checked against the provided instrument screenshots and FMP's
current stable chart endpoints. These feeds returned usable 1-minute,
5-minute, and daily candles:

- Indices: SP (`^GSPC`), NSDQ (`^NDX`), NIKKEI (`^N225`), DOW (`^DJI`), and
  DAX (`^GDAXI`).
- Energies: WTI (`CLUSD`) and BRENT (`BZUSD`).
- Futures: BZ, CL, ES, GC, HG, MGC, NG, NQ, RTY, SI, YM, ZB, and ZN.

FMP did not return usable chart data for the checked micro equity-index futures
symbols MES, MNQ, MYM, or MCL, so those are intentionally not exposed.
ASX remains in the internal catalog but is hidden from the selector, Market Scan,
and direct chart requests until a chart feed is verified against the matching
traded CFD. FMP `^AXJO` returned candles, but it should not be treated as
confirmed E8-aligned chart data.

## Implemented Use

- Added 1-minute and 5-minute chart timeframes to the user-facing chart and
  profile defaults.
- Increased bounded chart history by timeframe so short-term charts stay fast
  while higher timeframes can use more history.
- Added 1-minute and 5-minute candles to analyzer market loading.
- Kept 15-minute as the primary analyzer signal lens to avoid overfitting to
  one-minute noise.
- Uses the freshest available lower-timeframe bar as the current-price reference
  when validating limit entries.
- Added FMP targeted forex, crypto, and stock/proxy headlines as a conservative
  timing-risk input. Headlines can reduce confidence when they are recent and
  market-moving, but they do not create trade direction by themselves.
- Added FMP Treasury-rate context as a conservative macro input. The 10-year
  yield change can make otherwise qualified USD, metal, index, crypto, and
  Treasury-futures setups slightly stronger or weaker when the rate move aligns
  with or works against the setup.
- Upgraded the timing-edge card from 1-hour sampling to 15-minute sampling.
- Enabled verified Indices and Energies in the Advisor selector and Market
  Scan, excluding ASX until an E8-aligned feed is confirmed.
- Added category-specific analyzer calibration, strategy weights, execution
  cost modeling, and session labels for Indices and Energies.
- Expanded verified futures coverage and added contract tick-size handling for
  CL, HG, MGC, NG, NQ, RTY, YM, ZB, and ZN.
- Added authenticated E2E coverage for one-minute chart loading.

## Intentionally Deferred

- Free-form headline sentiment is not used as a directional signal. Levelflow
  uses headlines only as timing risk until a tested sentiment model exists with
  false-positive controls.
- Sector performance is not yet used directly. It is useful for future
  equity-index breadth checks, but it should be validated against index/futures
  behavior before changing setup confidence.
- Economic indicator history is not yet used beyond the live event calendar.
  It is a good candidate for a later macro-regime layer after backtesting
  release-surprise behavior against Levelflow's traded markets.
- Bulk and batch endpoints are still not used because Levelflow's verified
  symbol list is small enough for controlled per-symbol requests. Batch
  endpoints become more valuable if the public market universe expands.
