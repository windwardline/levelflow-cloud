# E8 feed verification — FMP against the live platform

Started 2026-08-02. The owner's lock-in ruling, verbatim:

> "Good! Confirm we are using the right source, and lock it in for E8. Right
> safeguards so we cannot possibly regress. Once we have the workflow down, I
> will send other screenshots for the same treatment."

> "Remember, this is E8 Pro Forex. That is important to keep track of."

Recorded as §20i ruling 8 in
`docs/superpowers/specs/2026-08-02-broker-sizing-governor-design.md`. The
regression guard is `tests/feedSource.test.ts`.

**The claim under test.** Levelflow charts and the analyzer both compute on
FMP bars; E8 fills orders on its own liquidity feed (TradeLocker, `.C`
tickers). Every FMP-derived level — entry, stop, targets, ATR — lands on the
broker's feed, so the two must be the same price stream to within the quoted
spread. This document is the running proof, one frame at a time.

**Standing so far.** Confirmed on the sampled instruments (EURNZD, XAUUSD) at
the same second; XAGUSD pending re-sample (stale-row signature, sample F1).
A future FAIL row is a stop-the-line event for §19/§20 features on that
instrument until explained.

## Account context law

Every sample row names the account it was observed on. Feed identity is
established per platform and program line, never assumed across them.

- Verified so far: **E8 Pro Forex (TradeLocker, demo)** only.
- Unverified: MatchTrader (E8 One Forex's second platform), crypto-market
  accounts, and the futures lines — futures are exchange data through
  Tradovate, a different comparison entirely, and Levelflow's futures symbols
  are already exchange-rooted FMP futures.

## Protocol — the treatment every frame receives

1. **Frame requirements.** Instrument rows with Bid and Ask visible (or the
   order ticket's SELL/BUY prices), and the platform clock (bottom bar,
   UTC-4) — or the screenshot filename's timestamp. The active chart symbol
   streams even when watchlist rows sit quiet, so the instrument under test
   belongs ON the chart.
2. **Read.** Symbol, bid, ask, timestamp to the second. Corroborate the clock
   against the candle countdown when visible (F1: the 1h bar closing at
   22:00 showed 19:41 remaining at 21:40:18 — consistent).
3. **Pull.** FMP `historical-chart/1min` for the same symbol and minute. FMP
   intraday timestamps are US Eastern; a summer frame's UTC-4 clock reads
   wall-clock equal.
4. **Pass tests, in order:**
   - a. The FMP price at the frame's minute (open for seconds ≤ :30, close
     after) falls inside `[bid, ask]`; or
   - b. the E8 mid lies on that bar's open→close path (intraminute drift);
     and
   - c. |FMP − E8 mid| ≤ one spread width.
5. **Record** the row with account context and one verdict: **PASS** (a or b,
   plus c) · **PENDING RE-SAMPLE** (the stale-row signature: the E8 book
   matches *earlier* FMP prints to the tick — evidence of a quiet quote row,
   not of divergence) · **FAIL** (none of the above — escalate).
6. **Excluded columns.** The platform's Day High/Low are never compared: E8's
   day boundary and bid/ask basis for that column are unpublished, and FMP's
   is the current FX day (F1 showed both metals' platform day-highs above
   FMP's — Friday-inclusive windows explain it; same-moment books did not
   diverge). TradeLocker charts plot **bid** — F1's chart price equals the
   bid exactly, so chart-to-chart comparisons carry a half-spread skew by
   construction.

## Samples

### F1 — 2026-08-02 21:40:18 EDT · E8 Pro Forex (TradeLocker, demo)

Frame: EURNZD.C 1h chart + order ticket, Metals.c watchlist. Clock 09:40:18
PM UTC-4, corroborated by the menu-bar clock and the candle countdown.

| Instrument | E8 bid / ask | E8 mid (spread) | FMP 21:40 bar O/H/L/C | Result | Verdict |
| --- | --- | --- | --- | --- | --- |
| EURNZD | 1.95758 / 1.95769 | 1.957635 (1.1 pip) | 1.95760 / 1.95763 / 1.95699 / 1.95760 | open inside the book, 0.2 pip off bid; \|open − mid\| = 0.035 pip | **PASS** |
| XAUUSD | 4,052.98 / 4,053.38 | 4,053.18 (0.40) | 4,053.41 / 4,053.95 / 4,052.375 / 4,052.69 | entire book inside the bar range; mid on the open→close path; \|open − mid\| = 0.23 < one spread | **PASS** |
| XAGUSD | 58.174 / 58.245 | 58.2095 (0.071) | 58.062 / 58.068 / 57.995 / 57.999 | book disjoint from the bar (gap 0.106) — but the E8 bid equals FMP's 19:00 open **to the tick** (58.174), and the ask sits in FMP's 18:52–18:58 prints: a watchlist row last ticked ~19:00 ET on a quiet Sunday-evening silver book | **PENDING RE-SAMPLE** |

Notes. The two rows that were streaming matched FMP at the same second; the
quiet row matched FMP at the moment it last ticked — all three observations
are consistent with one underlying price stream. Next silver frame should
carry XAGUSD.C as the active chart during live hours. Spread structure
observed: XAG 71 ticks (12 bp) versus XAU 40 ticks (1 bp) — per-instrument
spreads differ by an order of magnitude, as the observations record
(`docs/research/e8-observations-2026-08-02.md`) already established.

## Wiring of record — what the guard pins

- Both price paths — `supabase/functions/market-data/index.ts` (the chart the
  user sees) and `supabase/functions/trade-analyzer/marketLoader.ts` (the
  bars the engine computes on) — default to base
  `https://financialmodelingprep.com/stable`, endpoint
  `/historical-chart/{timeframe}` intraday and `/historical-price-eod/full`
  daily, symbol passed as a query parameter.
- The symbol map (`src/lib/symbolMap.ts`): Forex, Metals, Crypto, and
  Futures groups pass `fmpSymbol === symbol` verbatim. The only scannable
  divergences are the energy CFDs — WTI → CLUSD (fallback USO) and
  BRENT → BZUSD — which chart from front-month futures symbols and therefore
  carry a **basis question** this protocol has not yet closed: an E8
  WTI/BRENT frame is required before treating them as feed-identical.
  Indices (all non-scannable today) source cash indices (`^GSPC` family);
  ASX stays hidden pending exactly this verification
  (`symbolMap.ts` — "Hidden until the chart feed is verified against the
  matching traded CFD"), and its unhide path is this protocol.
- E8 tickers append `.C` to the same root (EURNZD.C ↔ EURNZD), per the
  catalog record (`docs/research/e8-purchase-screen-2026-08-02.md`).
- One recorded non-price exception: Finnhub is the economic calendar's
  env-gated alternate provider (`supabase/functions/news-calendar/index.ts`,
  `ECONOMIC_CALENDAR_PROVIDER === "finnhub"`) — news events only, pinned to
  `/api/v1/calendar/economic`, never price bars. FMP is the **sole price
  provider** in the codebase; the guard surfaced this exception on its first
  run, which is the guard working.
- The guard, `tests/feedSource.test.ts`, fails on any change to provider,
  base URL, endpoint family, or symbol mapping, and on any second
  market-data provider appearing outside its recorded allowance. A red there
  routes here: re-verify against a live frame before updating any pin.

## Open items

1. XAGUSD re-sample — active-chart frame, live silver hours.
2. WTI and BRENT basis check — one frame each with the instrument on the
   chart (CFD quote vs front-month futures bar).
3. Crypto instruments — a crypto-market account frame (also resolves the
   account-level 1:5 leverage observation's per-symbol values).
4. MatchTrader — any One Forex frame, since feed identity is per-platform.
5. More forex pairs and sessions as frames arrive — each strengthens the
   inside-spread bound the sizing math inherits.
