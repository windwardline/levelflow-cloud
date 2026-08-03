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

**Standing after F1–F7 (2026-08-02 evening, all E8 Pro Forex ·
TradeLocker · demo).** Forex: confirmed exact-minute (EURNZD 0.035 pip off
mid; GBPUSD equal to the point) and 28/28 pairs at quote level. Gold:
confirmed three times over. Crypto: tracks within venue-composite
dispersion (≤0.1%). Indices: E8 quotes **synthetic cash** (futures minus
fair-value basis) — the cash wiring tracks during each index's own cash
session and is structurally stale on US weekends. **Three instruments carry
a real, stable level basis above FMP** — XAGUSD ~+0.17 (≈30 bp), WTI ~+0.24
(≈30 bp), BRENT ~+1.67 (≈196 bp) — each measured twice, 14–75 minutes
apart, with the offset holding while price moved; the handling decision
(re-key the chart source or record per-instrument offsets) belongs to the
§19 retrofit. The owner's Appendix-A order tickets (F6/F7) verified every
per-lot value from the platform's own arithmetic. A FAIL row is a
stop-the-line event for §19/§20 features on that instrument until
explained.

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

### F2 — 2026-08-02 22:39:09 EDT · Indices.c watchlist (NSDQ.C chart)

Clock corroborated by the 1h countdown (20:50 to the 23:00 close). US cash
markets closed (weekend); Tokyo and Sydney in Monday session. All leverage
15 (catalog ✓); spreads in 0.01 ticks (NSDQ 40 = 0.40 … NIKKEI 645 = 6.45).

**Against the current cash-index wiring:**

| Instrument | E8 bid / ask | FMP cash source | Δ vs mid | Session state | Verdict |
| --- | --- | --- | --- | --- | --- |
| NIKKEI | 63,329.77 / 63,336.22 | ^N225 63,307.58 @22:25:30 | +25.4 (0.04%) at 14-min skew | Tokyo OPEN | **TRACKS (cash hours)** |
| ASX | 8,954.53 / 8,955.47 | ^AXJO 8,960.7 @22:20:15 | −5.7 (0.06%) at 19-min skew | Sydney OPEN | **TRACKS (cash hours)** — first live evidence on the hidden symbol |
| DAX | 25,846.33 / 25,847.16 | ^GDAXI 25,844 @22:40:15 | +2.75 (0.011%) near-simultaneous | Frankfurt closed; FMP's DAX feed quoting anyway | **TRACKS (this sample)** |
| SP | 7,531.35 / 7,531.95 | ^GSPC 7,489.72 (Friday close) | +41.9 (+0.56%) | US cash closed | **STALE-WEEKEND** (structural) |
| NSDQ | 28,537.00 / 28,537.40 | ^NDX 28,274.20 (Friday close) | +263 (+0.93%) | US cash closed | **STALE-WEEKEND** (structural) |
| DOW | 52,742.91 / 52,743.38 | ^DJI 52,485.03 (Friday close) | +258 (+0.49%) | US cash closed | **STALE-WEEKEND** (structural) |

**Futures-twin reconciliation (live Sunday):** subtracting each future's
Friday fair-value basis from its live Sunday quote reproduces E8's book —
ES 7,557.25 − 29.5 = 7,527.7 vs SP.C mid 7,531.65 (0.05%); NQ 28,645 −
130.1 = 28,514.9 vs NSDQ.C 28,537.2 (0.08%); YM 52,866 − 150 = 52,716 vs
DOW.C 52,743.1 (0.05%). **E8 index CFDs quote synthetic cash: the live
futures price minus the fair-value basis.** That is why the cash wiring
tracks whenever the cash index actually prints (N225/AXJO live tonight,
US three on weekdays) and goes stale when it does not. Indices remain
non-scannable (round 12 no-edge); this finding binds any future index
enablement: either session-gated display honesty or a futures-derived
synthetic source.

### F3 — 2026-08-02 22:39:51 EDT · Cryptos.c watchlist (BCHUSD.C chart)

Countdown corroboration 20:08 ✓. Leverage 1 on every row — the
forex-market account's crypto leverage, re-confirming the account-scope
resolution in the observations record. FMP quotes pulled at ~90 s skew;
BTC additionally checked at the exact minute.

| Instrument | E8 bid / ask | FMP | Δ vs mid | Verdict |
| --- | --- | --- | --- | --- |
| BCHUSD | 211.18 / 212.54 | 211.89 | +0.03 (0.014%) | **PASS** (inside the book; streaming chart symbol) |
| ETHUSD | 1,865.72 / 1,868.30 | 1,866.00 | −1.0 (0.05%) | **PASS** (inside) |
| LTCUSD | 44.41 / 44.78 | 44.56 | −0.035 | **PASS** (inside) |
| SOLUSD | 72.83 / 73.30 | 73.03 | −0.035 | **PASS** (inside) |
| XRPUSD | 1.07484 / 1.07606 | 1.0749 | −0.0006 | **PASS** (inside) |
| ADAUSD | 0.18554 / 0.18716 | 0.1859 | −0.0005 | **PASS** (inside) |
| BNBUSD | 585.73 / 586.50 | 585.18 | −0.94 (0.16%) | TRACKS (skew-range; exact-minute pin pending) |
| BTCUSD | 63,151.34 / 63,202.60 | 63,111.66 (exact 22:39 bar close; range 63,102.9–63,119.6) | +65 on mid; book ~+32 above the bar (0.05%) | **TRACKS (composite basis ≤0.1%)** |

Crypto verdict: one price stream to within normal cross-venue composite
dispersion. BTC is the one instrument where E8's LP composite sits
measurably (≈0.05–0.1%) above FMP's — the same order as its own 51-point
spread, and far inside any stop geometry — recorded as a standing basis,
not a defect.

### F4 — 2026-08-02 22:40:22 EDT · Energies.c watchlist (WTI.C chart)

Countdown corroboration 19:37 ✓. Leverage 15 ✓. A ~7% weekend gap-down in
crude made this a fast market; both books were streaming (the WTI chart was
the active symbol).

| Instrument | E8 bid / ask | FMP front-month | Result | Verdict |
| --- | --- | --- | --- | --- |
| WTI | 80.414 / 80.534 | CLUSD 22:40 bar 80.22–80.26 (exact minute) | book disjoint **above** the bar by 0.15–0.31; mid Δ ≈ +0.23 (0.29%) | **DIVERGENT (level)** |
| BRENT | 85.499 / 85.620 | BZUSD 83.95 @22:41:47 (85 s skew) | mid Δ ≈ **+1.61 (1.9%)** | **DIVERGENT (level)** |

Both offsets carry the same sign — E8's energy CFDs price **above** FMP's
front-month futures symbols, WTI slightly, BRENT by a full contract-roll's
width. The frames land on the August Brent roll boundary (September Brent
expired ~Jul 31), so the leading hypothesis is a delivery-month offset:
E8's CFD references a later month (or a spot assessment) than the contract
FMP's continuous front symbol is currently keyed to, amplified by the 7%
gap. What this means for Levelflow: relative geometry — ATR, structure,
stops-as-distances, R multiples — is invariant to a constant level offset,
so scans and records stay internally coherent; **absolute level transfer to
the E8 book is off by the basis on energies** until resolved. Resolution
path, in order: (1) a mid-month frame after the rolls settle, same
protocol; (2) the owner's standing Appendix-A offer — one small manual
WTI and BRENT ticket on the live platform, whose stated fill price pins
E8's reference contract exactly; (3) re-key the chart source if E8's
reference proves to be a different month than FMP's front. Until then,
energies are excluded from the identity-confirmed set.

### F5 — 2026-08-02 22:40:55 / 22:41:02 / 22:41:08 EDT · Forex.c complete (three scrolls, GBPUSD.C chart)

All 28 pairs captured ("these 3 give you all of Forex" — owner). Countdown
corroborations 19:04 / 18:57 / 18:51 ✓. Leverage 30 on every pair ✓
(catalog). Spreads quoted in points (fifth decimal; third on JPY): 0–14
observed, AUDCAD momentarily locked at 0 (bid = ask 0.98659).

**Exact-minute anchor:** FMP's GBPUSD 22:40 bar closes **1.34745** — equal
to the point with E8's bid at 22:40:55 (1.34745 / 1.34746), and the chart
plots the bid, both again. **Day-high corroboration:** E8's GBPUSD day high
1.35060 vs FMP's 1.35063 (0.3 pip) — the forex day boundary aligned
tonight, though the Day High/Low exclusion stands as a rule.

Quote-level sweep at ~2.5–3 min skew (FMP 22:43:2x–22:43:38): every
non-JPY pair within ±2.6 pips of the frame mid, five essentially exact
(EURCAD 0.15 · NZDCHF 0.2 · GBPCAD 0.25 · EURGBP 0.45 · AUDCAD 0.1). All
seven JPY crosses read +3.9 to +12.6 pips in the same direction — one
coherent yen-weakening move inside the skew window on a day the yen
complex traveled ~200 pips, not a per-pair offset; an exact-minute JPY
spot-check is queued as a completeness item. Forex verdict: **CONFIRMED**
— anchored exact-minute by F1's EURNZD (0.035 pip) and F5's GBPUSD
(to the point), with the full book consistent at quote level.

### F6 — 2026-08-02 22:54:20 / 22:54:37 EDT · The energies order tickets (Appendix A)

The owner's standing offer, executed: draft BUY tickets on both energy
CFDs, 1.00 lot, symmetric 200-tick SL/TP — the platform's own risk
arithmetic on screen.

| Ticket | E8 book | SL / TP (200 ticks) | Platform P&L | Per-lot value confirmed | Margin |
| --- | --- | --- | --- | --- | --- |
| WTI.C BUY 1.00 @ 80.223 | 80.093 / 80.223 | 80.023 / 80.423 | $200.00 = 0.83% | $1/tick (0.001) ⇒ **1,000 bbl** | $5,347.67 = 22.32% |
| BRENT.C BUY 1.00 @ 85.345 | 85.224 / 85.345 | 85.145 / 85.545 | $200.00 = 0.83% | $1/tick (0.001) ⇒ **1,000 bbl** | $5,689.10 = 23.75% |

Ticket facts, all platform-arithmetic-verified: contract sizes match the
observations record to the cent; **P&L percentages and margin percentages
key to account balance** ($200 / $23,958.70 = 0.83%; margin ≈ mark ×
contract / 15, and its percent = margin / balance exactly). Spreads are
dynamic (WTI 120 → 130 → 121 ticks across tonight's frames).

**Second offset samples, same minutes:** WTI mid 80.158 vs CL 22:54 close
79.92 → **+0.238** (F4: +0.234, fourteen minutes earlier). BRENT mid
85.2845 vs BZ 22:54 close 83.61 → **+1.675** (F4: +1.61). The offsets held
while price moved — a constant-basis signature, not noise. The handling
decision (re-key the chart source or record per-instrument offsets) moves
to the §19 retrofit; a post-roll mid-month frame remains queued for BRENT.

### F7 — 2026-08-02 22:55:47 / 22:56:01 EDT · The metals order tickets — and the silver re-adjudication

| Ticket | E8 book | SL / TP (200 ticks) | Platform P&L | Per-lot value confirmed | Margin |
| --- | --- | --- | --- | --- | --- |
| XAGUSD.C BUY 1.00 @ 58.126 | 58.070 / 58.126 | 57.926 / 58.326 | $1,000.00 = 4.17% | $5/tick (0.001) ⇒ **5,000 oz** | $19,373.40 = 80.86% |
| XAUUSD.C BUY 1.00 @ 4,061.83 | 4,061.44 / 4,061.83 | 4,059.83 / 4,063.83 | $200.00 = 0.83% | $1/tick (0.01) ⇒ **100 oz** | **$27,076.16 = 113.01% — refused** |

The gold ticket is a §20 observation in its own right: initial margin above
the account's free margin renders red with the BUY button disabled — **the
platform refuses the order outright**, so on this balance 1.00 lot of gold
is unopenable (max ≈ 0.88 lots at 15:1). Both contract sizes confirm the
observations record from the ticket's own arithmetic.

**The silver re-adjudication.** This book was indisputably live — active
chart, open order ticket — at 58.070 / 58.126 (mid 58.098), and FMP's
22:55 bar ran 57.924–57.981: the book sits **+0.15 to +0.17 above** FMP.
F1's book (58.174 / 58.245) sat the same ~+0.17 above FMP's contemporaneous
prints at 21:40. Two samples, 75 minutes apart, offset unchanged while
silver fell ~$0.11: **F1's PENDING RE-SAMPLE verdict is corrected — that
row was not stale.** XAGUSD carries a real, stable ~+0.17 (≈30 bp) basis
above FMP silver; the 19:00 tick-match that suggested staleness was
coincidence. Gold, sampled the next minute, passes inside its path again
(mid 4,061.635 vs 22:55 close 4,061.905, −0.27): the basis is silver's,
not the metals feed's.

**The divergence set after F6/F7** — each measured twice, offset stable:
XAGUSD **+0.17 (≈30 bp)** · WTI **+0.24 (≈30 bp)** · BRENT **+1.67
(≈196 bp)**. Silver and WTI sit at the same ~30 bp, consistent with a
uniform reference markup; Brent's width is a contract-roll's, consistent
with a different delivery month. Everything else on the account — 28 forex
pairs, gold, crypto within composite dispersion — is one price stream.

### F8 — 2026-08-03 14:59:26–14:59:43 EDT · ADAUSD·1h, four frames — the first Crypto-classification sample

**Program line: E8 One Crypto, $5,000, default "4-6" tier (live account,
purchased 2026-08-03 — the first sample NOT on Pro Forex).** Full account
record: `docs/research/e8-crypto-account-2026-08-03.md`.

Clock corroboration: four frames at 2:59:26 / :32 / :38 / :43 PM UTC-4
with 1h-candle countdowns 00:33 / 00:27 / 00:20 / 00:16 — every pair sums
to 3:00:00, so the platform clock is internally exact.

| Check | E8 (TradeLocker, bid-plotted) | FMP | Verdict |
| --- | --- | --- | --- |
| Path containment | bids 0.19399 → 0.19409 across the frames | 14:59 ET 1-min bar [0.1938, 0.1941] | inside the bar |
| Spread proximity | ask 0.19421, spread 22 pts | 14:59 close 0.1941 | Δ 0.00011 ≈ half spread |
| Live quote bracket | frames' bids, minutes earlier | 0.19400 @ 19:03:06 UTC | brackets |
| Day high (corroboration only, never a criterion) | 0.19619 | 0.1961 (11:59 ET bar) | 0.005% — far inside crypto's ≤0.1% |

**PASS — exact-class.** FMP's crypto path is the same market the Crypto
account's TradeLocker plots (FMP prints 4dp against E8's 5dp; containment
and half-spread proximity carry the verdict). The crypto verdict measured
on the Forex-carried side now holds on the actual Crypto classification,
same platform, different account class — consistent with ruling 8's
per-platform feed identity.

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
  BRENT → BZUSD — whose basis F4 has now **measured** (WTI ~+0.23,
  BRENT ~+1.61, E8 above FMP front-month): open item 2 carries the
  resolution path, and energies sit outside the identity-confirmed set
  until it closes. Indices (all non-scannable today) source cash indices
  (`^GSPC` family); F2 established that E8 quotes synthetic cash (futures
  minus fair-value basis), so the cash wiring tracks during each index's
  own cash session and is stale outside it. ASX stays hidden
  (`symbolMap.ts` — "Hidden until the chart feed is verified against the
  matching traded CFD"); F2 recorded its first live tracking evidence
  (−5.7 pts at 19-min skew, Sydney session), and its unhide path remains
  this protocol plus the session-honesty question above.
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

1. ~~XAGUSD re-sample~~ — **RESOLVED by F7**: not a stale row but a real,
   stable ~+0.17 basis; silver joins the divergence set.
2. **The basis-handling decision** (XAG +0.17 · WTI +0.24 · BRENT +1.67,
   each stable across two samples): re-key the chart source or record
   per-instrument offsets — a §19-retrofit decision, since relative
   geometry is offset-invariant and only absolute level transfer is
   affected. The Appendix-A tickets (F6/F7) are consumed; a post-roll
   mid-month frame remains queued to test whether BRENT's width narrows to
   the others' ~30 bp after the roll.
3. Crypto-market account frame — tonight's F3 was the forex-market
   account's view (leverage 1); the crypto-account per-symbol leverage
   values remain unobserved. BNBUSD exact-minute pin also pending.
4. MatchTrader — any One Forex frame, since feed identity is per-platform.
5. US cash indices during a weekday NY session — the same-second test F2
   could not run with cash closed; one weekday frame completes the
   synthetic-cash finding.
6. JPY-cross exact-minute spot-check — F5's quote-level JPY deltas were one
   coherent yen move inside the skew window; a single same-minute bar
   comparison (USDJPY or GBPJPY on the chart) closes it.
