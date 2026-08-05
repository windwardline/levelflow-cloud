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

**The "E8 DEMO" badge (owner attestation, 2026-08-04, on F11's frame):**
TradeLocker renders an "E8 DEMO" corner badge on the owner's live Pro
Forex account at all times — "It is my live pro forex account… it is
always like that." Every "(demo)" annotation in F1–F7 records that
badge as observed, not a separate demo environment; the frames were the
live account throughout. The annotations stay as written (they record
what the frames showed), with this attestation as their standing
explanation.

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

### F9 — 2026-08-03 15:08:59–15:09:49 EDT · The Tradovate watchlists, eight tabs — the first Futures-classification samples

**Program line: E8 Signature Futures, $25,000, Phase 1 (live account,
purchased 2026-08-03; Tradovate).** Full account record:
`docs/research/e8-futures-account-2026-08-03.md`.

Sampled per class against FMP ~3–4 minutes after the frames:

| Class | E8 (Tradovate LAST) | FMP | Verdict |
| --- | --- | --- | --- |
| Index | ESU6 7633.75 · NQU6 28915.25 · YMU6 53290 | ESUSD 7637 · NQUSD 28938 · YMUSD 53313 | PASS — the three deltas equal each other's 4-min lag exactly |
| Energy | CLU6 80.46 · RBU6 2.9686 · HOU6 3.8846 · QGU6 2.775 | CLUSD 80.54 · RBUSD 2.9714 · HOUSD 3.889 · NGUSD 2.771 | PASS ≈10–15 bp |
| Rates | ZFU6 106'070 · ZBU6 109'02 · ZNU6 108'125 | ZFUSD 106.21875 · ZBUSD 109.0625 · ZNUSD 108.40625 | **PASS — ZF and ZB EXACT to the 32nd; ZN within half a tick.** The strongest identity evidence in the program |
| Metal | SICU6 (active month) 58.18 | SIUSD 58.195 | PASS 3 bp |
| Grain | ZRU6 14.205 | ZRUSD 14.175 | PASS 21 bp |
| Month-offset | GCQ6 4029.6 · ZCU6 449'6 · HEQ6 97.65 | GCUSD 4103.6 · ZCUSX 472.5 · HEUSX 83.675 | **Calendar spread, not feed** — FMP continuous tracks the ACTIVE month; expiring/nearby watchlist rows differ by the roll. The plan's BZUSD tradeMonth hypothesis, measured general |
| FX futures | 6EU6 1.15330 | EURUSD spot 1.15135 | +17 pips carry — expected spot-vs-futures basis |
| Crypto futures | BTCQ6 64,070 · ETHQ6 1873.00 | BTCUSD 63,864 · ETH ≈1868 | ≈ +0.3% contango over the same spot the Crypto account trades |

**PASS where a same-month comparison exists; every large gap is a
month artifact, a carry basis, or a missing FMP source — never a
different market.** One quiet resolution inside the sweep: **BZV6 84.05
vs BZUSD 84.11 — 7 bp.** The futures-side Brent matches FMP's active
contract, which empirically settles the CFD side's +1.67 as the contract
month, never the feed — the §19 plan's pre-registered hypothesis,
confirmed from the other classification. Resolutions found: grains/meats/softs live under
FMP's USX-suffixed roots (LEUSX/HEUSX/GFUSX/ZCUSX/…); the -USD meat
spellings collide with crypto tokens (HEUSD printed 0.00011) — a guard
class for the futures onboarding. No FMP source found for the Eurex
family, NKD, EMD, UB, TN, or ZW Chicago wheat. **Futures feed checks
must be month-aware from here on.**

### F10 — 2026-08-04 · Best-match FMP source resolution (§19 retrofit, Task 15) — the divergence set adjudicated, instrument by instrument

Per amendment 16's E8-Forex-done gate, the three stable-offset instruments
named by the controller note — XAGUSD, WTI, BRENT — are tested against
every FMP candidate that could plausibly serve each, live-enumerated
rather than assumed. No new E8 platform frame was captured for this task:
the existing frames (F1, F4, F6, F7 for the CFD side; F9 for a
cross-classification corroboration) already carry clock-corroborated E8
book readings. What F10 adds is a live, same-minute FMP pull for every
FMP candidate symbol against those same already-recorded books, per
amendment 20's rule that resolution means choosing among FMP's own
candidate symbols, never a third source.

**Step 1 — the live candidate enumeration** (`GET
.../stable/commodities-list`, re-pulled 2026-08-04, superseding the plan's
snapshot): SIUSD Silver Futures (USD, Dec) · SILUSD Micro Silver Futures
(USD, Dec) · CLUSD Crude Oil (USD, Oct) · BZUSD Brent Crude Oil (USD,
**still Sep** — unchanged from plan time, two days and one
cross-classification sample later; see BRENT below) · HOUSD Heating Oil
(Oct) · RBUSD Gasoline RBOB (Oct). Confirmed again: no spot silver and no
spot WTI symbol exist on this list.

**XAGUSD — candidates SIUSD, SILUSD.** Re-pulled at F1's and F7's exact
frame minutes, same open/close-by-seconds rule applied to every symbol
including the incumbent's own re-check:

| Instrument | F1 21:40:18 EDT (E8 mid 58.2095) | F7 22:55:47 EDT (E8 mid 58.098) | Sign |
|---|---|---|---|
| XAGUSD (incumbent) | FMP open 58.070 → **+0.140** | FMP close 57.926 → **+0.172** | stable, positive |
| SIUSD (Dec futures) | FMP open 58.440 → **−0.231** | FMP close 58.280 → **−0.182** | stable, negative |
| SILUSD (Dec micro futures) | FMP open 58.400 → **−0.191** | FMP close 58.290 → **−0.192** | stable, negative |

(The incumbent's own F1 bar has revised about a cent since the original
transcription — 58.070/57.999 open/close here vs 58.062/57.999 as first
read — an ordinary intraday-bar revision, immaterial to the offset.)
Neither futures candidate beats the incumbent at either anchor, and a
live re-check today shows why: spot XAGUSD 59.519 against SIUSD 59.845
and SILUSD 59.835 — a +0.32/+0.33 (~55 bp) December-delivery contango
premium, present again two days later. SIUSD/SILUSD price a four-month
forward delivery, not spot; stacking that premium on E8's own
book-to-spot gap moves further from the book, not closer. **Verdict:
RECORD-OFFSET, source unchanged.** The ~+0.17 (≈30 bp) basis stands as
previously measured; F10 adds that it is the best FMP has to offer, not
merely the incumbent by default.

**WTI — candidates CLUSD (re-confirmed), USO.**

| Instrument | F4 22:40:22 EDT (E8 mid 80.474) | F6 22:54:20 EDT (E8 mid 80.158) | Verdict |
|---|---|---|---|
| CLUSD (incumbent, front-month, live tradeMonth Oct) | FMP open 80.230 → **+0.244** | FMP open/close 79.920 → **+0.238** | reproduces F4/F6's own +0.234/+0.238 to the point |
| USO (ETF) | disqualified on scale before reaching the minute-level test | — | **FAIL (scale)** |

USO's live quote today: $115.78, against CLUSD's live $75.41 the same
pull — +$40.37, +53.5%. A fund share price is not a per-barrel number; no
minute-level pull changes that. The pre-registered expectation ("expected
to fail on scale") is confirmed outright. **Verdict: RECORD-OFFSET,
source unchanged.** The ~+0.24 (≈30 bp) basis stands as previously
measured. (USO's continued role as the code's emergency fallback — used
only if CLUSD itself fails — is a separate question from its fitness as a
primary source; flagged for Task 16 given the fallback would now silently
substitute a series roughly 50% off scale rather than fail loudly.)

**BRENT — one candidate.** BZUSD is FMP's only Brent-root symbol,
live-reconfirmed via the same commodities-list pull: there is nothing
else in FMP to re-key to under amendment 20's own candidates-must-be-FMP
rule.

| Instrument | F4 22:41:47 EDT, 85s skew (E8 mid 85.5595) | F4 tightened to the exact minute, 22:40, no skew | F6 22:54:20 EDT (E8 mid 85.2845) |
|---|---|---|---|
| BZUSD (incumbent, only candidate) | FMP close 83.930 → **+1.630** | FMP close 83.880 → **+1.680** | FMP close 83.610 → **+1.675** |

All three reproduce F4/F6's own +1.61/+1.675 to the cent. The
pre-registered hypothesis — expired tradeMonth explains the gap; a
post-roll frame would show BZUSD tracking — does not hold up: BZUSD's
tradeMonth label still reads Sep on this same live pull, two days after
F4/F6 and a day after F9. Yet F9 (2026-08-03, E8 Signature
Futures/Tradovate — a different classification, cited here only as
corroboration per amendment 19 clause 3's narrow-reading discipline)
already found BZV6 (the actually-traded October contract) at 84.05
against FMP BZUSD at 84.11 — 7 bp apart. BZUSD's own price ran a smooth
83.6–84.0 on Aug 2 (F4/F6) to 84.11 on Aug 3 (F9) with no discontinuity,
which is inconsistent with a symbol frozen on an expired September
settlement suddenly catching up to October pricing overnight. The more
consistent reading, and the one F9's own text already draws: BZUSD's
price — whatever its label says — was already on the active contract's
track during F4/F6, and the CFD's own +1.67 is a contract-month/reference
difference between E8's Brent CFD and FMP's continuously-active
front-month root, a structural fact about the CFD product, not a defect
in FMP's feed, and not fixable by any FMP symbol choice. **Verdict:
RECORD-OFFSET, source unchanged (no alternative exists).** The ~+1.67
(≈196 bp) basis stands as previously measured. BZUSD's tradeMonth
metadata field is now flagged as unreliable for freshness inference — it
never moved across this entire window — where the price series,
cross-checked against F9's independent futures-side sample, is what
actually settles the question.

**Open item 2 — resolved.** All three prime candidates return
RECORD-OFFSET: the incumbent FMP symbol is kept in every case (no FMP
alternative ever produces a smaller, stable offset — two of the three
have no viable alternative candidate at all), and each basis is logged as
a documented per-instrument constant rather than corrected toward the E8
book. **No RE-KEY occurs.** Per amendment 16/A16, a source change is what
forces Task 17's fresh replay sweep; since `src/lib/symbolMap.ts` needs
no edit, this task does not itself trigger that sweep, and Task 16 has
nothing to re-key. Energies (WTI, BRENT) re-enter the identity-confirmed
set with their bases logged, joining XAGUSD; none is a missing match
under amendment 20 clause 3's exclusion rule — a stable basis against an
existing FMP match is the standing ruling, now evidenced
candidate-by-candidate rather than by absence of a search.

**Step 4 — the two remaining confirmation gaps.**

*BNBUSD's exact-minute pin.* F3's frame (22:39:51 EDT, seconds > 30 → the
22:39 bar's close) pulled live: FMP BNBUSD closed that minute at 584.960,
against E8's book 585.73/586.50 (mid 586.115, spread 0.77) — outside the
book and outside one spread width at the strict minute (fails pass tests
a–c as stated). The immediately surrounding minutes (22:35–22:44, closes
ranging 584.80–585.84, trending up across the window) bracket much closer
to, and briefly cross, E8's book by 22:43–22:44; the ~90s-skew figure the
original F3 write-up used (585.18) is reproduced exactly by this pull's
22:41 close, cross-validating the record. BNBUSD was a **watchlist row,
not the active chart symbol**, in F3 (BCHUSD.C was charted) — precisely
the condition this protocol's own F1 precedent flags as unreliable for a
clean minute-level read. Net: TRACKS is reconfirmed (order-of-magnitude
~15 bp across the window, smaller than any of the three confirmed
metals/energy bases), but the exact-minute figure alone should not be
over-read given the watchlist-row caveat. A clean pin still wants one
frame with BNBUSD as the active chart symbol; this record now gives
Task 18 a live-measured number either way.

*The JPY-cross exact-minute spot-check.* Not closeable from the existing
record. F5's committed text is a prose summary of a live three-scroll
sweep (quote-level deltas only: "seven JPY crosses read +3.9 to +12.6
pips"); no raw per-pair E8 bid/ask with clock corroboration for any JPY
pair survives anywhere in the repository — checked this document,
`e8-observations-2026-08-02.md` (whose JPY rows are order-ticket entries
from a separately-captured, non-clock-corroborated batch),
`e8-fmp-crossmap.md`, the markets dossier/articles, the purchase-screen
record, and the commit history for the section that introduced F5
(`8072233`), which shows the prose was written directly from the
screenshots without a raw table ever entering git. Closing this item
needs a fresh frame with a JPY pair as the active chart symbol (USDJPY.C
or GBPJPY.C), per this protocol's own frame requirement — a
data-collection step, not an analysis one, and outside what an FMP-only
tool session can produce. **Left open**, named explicitly rather than
silently closed.

## Wiring of record — what the guard pins

- Both price paths — `supabase/functions/market-data/index.ts` (the chart the
  user sees) and `supabase/functions/trade-analyzer/marketLoader.ts` (the
  bars the engine computes on) — default to base
  `https://financialmodelingprep.com/stable`, endpoint
  `/historical-chart/{timeframe}` intraday and `/historical-price-eod/full`
  daily, symbol passed as a query parameter.
- The symbol map (`src/lib/symbolMap.ts`): Forex, Metals, Crypto, and
  Futures groups pass `fmpSymbol === symbol` verbatim. The only scannable
  divergences are the energy CFDs — WTI → CLUSD and BRENT → BZUSD — whose
  basis F4 **measured** (WTI ~+0.23, BRENT ~+1.61, E8 above FMP
  front-month) and **F10 resolved**: RECORD-OFFSET on both, no better FMP
  candidate exists for either, no source edit. WTI and BRENT re-enter the
  identity-confirmed set with their bases logged, not zeroed. WTI's code
  fallback to `USO` — a distinct question from its source identity, per
  F10's own closing note — was **removed in Task 16b** (2026-08-04): USO
  priced $115.78 against CLUSD's live $75.87 the same pull (+52.6%,
  reconfirming F10's own +53.5%), so it fails the "tracks the primary at
  scale" bar outright — a fund share price is not a per-barrel number, at
  any tolerance. The honest behavior when CLUSD has no bars is now the
  existing no-data path, not a silent substitute that would corrupt every
  level, stop and target computed from it while still looking like real
  data. Task 16b's own audit of the three fallbacks WTI's removal left
  behind found all three failing the identical bar, more severely
  (`ASX`→`EWA` ~304x, `NSDQ`→`QQQ` ~41x, `DAX`→`DAX` ~560x off their index
  primaries); **Task 16c removed all three** (2026-08-04, see Open Item 7),
  so no symbol in the catalog carries a fallback source anymore — the field
  itself (`fallbackFmpSymbol` client-side, `{primary, fallback}` in both edge
  functions' own hardcoded maps) was retired rather than left at zero
  entries. `market-data/index.ts` also gained its own `noTradeSymbols` gate
  in the same task, closing the defense-in-depth gap this document had
  flagged (that function previously enforced no no-trade list of its own).
  Indices (all non-scannable today) source cash indices
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

### F11 — 2026-08-04 23:56:32 EDT · USDJPY·1h with the JPY quote board — the family's exact-minute close

One owner-supplied frame from the live Pro Forex account (TradeLocker
3.94.8/3.19.35). The frame shows an **"E8 DEMO" badge** in the lower
corner; the owner attests (2026-08-04, same night) that this is the
live account and TradeLocker always renders that badge there — recorded
as an owner-supplied platform fact beside the observation, per the
narrow-observation rule. The Forex.c watchlist and `.C` suffixes match
every prior live frame. Time base is the strongest of any frame yet: the macOS menu-bar clock (11:56 PM) and the platform footer
(**11:56:32 PM UTC-4**) agree in-frame, and the 1h candle countdown
(**03:28**) independently lands the same second — 23:56:32 + 3:28 =
04:00:00 exactly, the next hourly close.

USDJPY.C charted at 1h, last 157.473, with a momentary zero-spread lock
(bid = ask 157.473 — F5's AUDCAD phenomenon, second sighting). Three
more JPY crosses legible on the board at the same second: CHFJPY.C
194.914/194.914 (also locked), NZDJPY.C 92.475/92.477, GBPJPY.C
211.892/211.895. Controls: AUDUSD.C 0.70488/0.70489, AUDCAD.C
0.99176/0.99176.

**FMP same-minute bars (stable `historical-chart/1min`, the production
endpoint family, pulled 2026-08-05 ~00:00 EDT), frame quote vs the
23:56 bar:** the frame instant sits mid-bar (:32 of :00–:59), and the
yen complex was easing through the minute, so the honest comparison is
the bar's range, with the close (27 s after the frame) as drift
context —

- USDJPY: frame 157.473 vs bar 157.447–157.471 (close 157.447) — at
  the bar high +0.2 pips; close −2.6 pips of within-minute drift.
- CHFJPY: frame 194.914 vs bar 194.878–194.915 — **inside the range**
  (0.1 pip under the high); close −1.1.
- NZDJPY: bid 92.475 vs bar high 92.474 — +0.1 pip; close −1.1.
- GBPJPY: bid 211.892 vs bar high 211.891 — +0.1 pip; close −2.25.
- Controls at the same second: AUDUSD +0.15 pips vs close, AUDCAD
  −0.10 — the non-JPY anchor re-confirmed simultaneously.

**Verdict: TRACKS — the JPY family closes.** F5's +3.9-to-+12.6-pip
one-direction residue re-measures at −1.1 to −2.6 pips when the clock
skew shrinks from ~3 minutes to 27 seconds — deltas that scale down
with skew are one market observed at two moments, never a per-pair
offset — and at the range level every frame quote coincides with its
bar extreme to 0.1–0.2 pips on a moving yen minute. The frame's non-JPY
controls land on the same feed identity F1/F5/F7 anchored, tying this
closure into the family's existing live record.

### F12 — 2026-08-05 · `6J` and `6M`'s FMP mates, resolved retrospectively against F9's own anchor window

**Program line: E8 Signature Futures** (the same F9 account and frame; no
new screenshot). The §19 retrofit's re-grounding of `6J`/`6M`/`ZB`/`ZN`
(offered per amendment 19, unsizeable per amendment 22) left one question
distinct from tradability: does FMP carry a market for either CME currency
future at all, and does it track? `6J` and `6M` do not appear in FMP's
`stable/commodities-list` (40 symbols, checked live 2026-08-05 — no JPY, no
MXN, no currency-futures root of any kind; the list is metals, energies,
grains, meats, softs, financials and equity-index only), so — as F9's own
text already implied for `6E` ("6EU6 1.15330 vs EURUSD spot 1.15135") — the
FMP mate for a CME currency future is its spot pair, inverted to match the
future's quote convention, not a distinct futures symbol.

**Method, retrospective.** F9's own protocol (pull within minutes of the
frame) does not apply two days later; instead, the production
`stable/historical-chart/1min` endpoint was pulled for `USDJPY` and
`USDMXN` on `2026-08-03`, the exact date, and read at F9's own anchor
window, 15:08–15:09 EDT (FMP intraday timestamps are US Eastern, per this
document's own protocol) — both the 15:08 and 15:09 bars, open/high/low/close
all read, since no single-second timestamp survives for which of the eight
Tradovate tabs was on screen at which instant inside the 15:08:59–15:09:49
span.

| Instrument | E8 (F9, Tradovate) | FMP anchor window, both bars (15:08–15:09 EDT) | Inverted to match FMP | Basis |
|---|---|---|---|---|
| `6J` (Sep contract, 6JU6) | 0.0063985 | USDJPY 156.79–156.818 | 1/USDJPY 0.0063768–0.0063780, mid 0.0063774 | **+0.0000211, +33 bp**, E8 above spot-implied |
| `6M` (Aug contract, 6MQ6) | 0.057600 | USDMXN 17.32229–17.32384 | 1/USDMXN 0.0577239–0.0577291, mid 0.0577265 | **−0.0001265, −22 bp**, E8 below spot-implied |

**Cross-checked against FMP's own direct-quote symbols** (`JPYUSD`,
`MXNUSD` — both exist on FMP's forex list independent of the inverted
majors): `JPYUSD` prints a flat 0.006375–0.006376 across the whole window
(volume 1 per bar — a thin, apparently-derived mirror of `USDJPY`, not an
independently-ticking source), consistent with the `1/USDJPY` figure to the
fourth decimal. `MXNUSD` prints 0.05769–0.05775 (volume up to 21 per bar),
consistent with `1/USDMXN` to within ~0.00002 — ordinary cross-quote noise,
not a different market. Both direct symbols corroborate rather than replace
the major-pair inversion, which stays primary per this document's own
established `USDJPY` precedent (F9, F11) over a thinner cross.

**Reading the sign.** `6J`'s futures print sits ABOVE its spot-implied
value, the same direction and a comparable order of magnitude as `6E`'s own
+17-pip (+0.17%) futures-vs-spot basis (F9) — consistent with JPY, like
EUR, carrying a lower policy rate than USD (the low-rate currency trades at
a forward premium, quoted direct, under covered interest-rate parity).
`6M`'s futures print sits BELOW its spot-implied value — the opposite sign
— consistent with MXN's much higher policy rate producing a forward
discount rather than a premium. Both directions are the textbook
interest-rate-parity result for their respective currencies: corroborating
evidence that the inverted spot pair is the right market, not a coincidence
needing further explanation.

**This basis is a decaying, drifting snapshot — not a constant, unlike
Brent/XAG/WTI's (fix round 1, coordinator review, 2026-08-05).** A
futures-vs-spot basis driven by interest-rate carry is structurally
different from the CFD-side offsets recorded elsewhere in this document: it
decays toward zero as the contract approaches expiry (the rate
differential's time value shrinks to nothing at settlement) and it drifts
whenever the underlying rate differential itself moves — a Fed, Banxico or
BOJ rate change re-prices the whole curve. Brent's ~2% and XAGUSD's/WTI's
~30 bp are genuinely documented per-instrument constants: each was measured
and re-measured across separate sessions and days (F1, F4, F6, F7, F9, F10)
and found stable every time, which is why the §19 retrofit treats them as a
fixed, reusable basis. `6J`'s +33 bp and `6M`'s −22 bp above are a
**single 2-minute sample, taken once, on one date, and never re-verified at
a second time or session.** They answer this entry's own question — does a
reasonable FMP mate exist, and does it track — and they do not establish
that either figure is stable over time the way Brent/XAG/WTI's bases are.
**Any future use of either number — for sizing, for offset handling, or for
a display decision — must re-measure at time of use; this entry's own
figures are not to be read off and reused as a constant.**

**Verdict: MATCHED, with evidence, both legs.** `6J` ↔ `USDJPY` (inverted)
and `6M` ↔ `USDMXN` (inverted) are FMP's mates for these two CME currency
futures — no FMP currency-futures symbol exists for either, so the spot
pair is FMP's only candidate, exactly as already established for `6E`.
Amendment 20's matching question is answered for both: neither is
FMP-excluded, and the master-list record (amendment 23) can carry both
matches durably regardless of display state. At this one-time snapshot,
`6J`'s ~33 bp is order-of-magnitude comparable to XAG/WTI's ~30 bp
*constant* and `6M`'s ~22 bp is smaller still — but a decaying, drifting
single sample is not evidence of the same character as a multi-sample-verified
constant, and neither figure is offered here as grounds for a
display-exclusion decision. Neither `6J` nor `6M` is wired to a Levelflow
row or shown to any user today (no Levelflow symbol maps to either —
`docs/superpowers/specs/2026-08-02-broker-sizing-governor-design.md` §19a),
so no display decision is actually pending on either; this is recorded for
the master list and for whenever the futures onboarding gives either symbol
a Levelflow row of its own — at which point the basis must be re-measured,
not read off this entry.

**What this does NOT resolve.** Appendix A item 6's own ask — `6J`'s tick
and value "as the platform computes them," from a live order ticket — is a
different fact from a same-minute FMP price comparison, and stays open.
This entry answers "does a reliable FMP market exist for this instrument,"
not "does E8's own tick table reconcile with itself." The two questions
close independently; only the owner's own live ticket closes the second.

## Open items

1. ~~XAGUSD re-sample~~ — **RESOLVED by F7**: not a stale row but a real,
   stable ~+0.17 basis; silver joins the divergence set.
2. ~~The basis-handling decision~~ (XAG +0.17 · WTI +0.24 · BRENT +1.67,
   each stable across two samples) — **RESOLVED by F10** (Task 15,
   2026-08-04): all three return RECORD-OFFSET. SIUSD/SILUSD carry their
   own ~55 bp Dec-futures contango and lose to incumbent XAGUSD at both
   anchors; USO fails on scale outright (+53.5% vs CLUSD); BZUSD is FMP's
   only Brent symbol, and F9's cross-classification match (BZV6 vs BZUSD,
   7 bp) shows its price was never stuck on an expired month. No RE-KEY;
   `src/lib/symbolMap.ts` is unchanged; amendment 16/A16's replay-sweep
   trigger does not fire from this item. The queued post-roll mid-month
   frame is superseded by F9's own cross-classification evidence and is
   no longer needed to close this item.
3. ~~Crypto-market account frame~~ — **RESOLVED**. Per-symbol leverage:
   closed by F8 and `e8-crypto-account-2026-08-03.md` (BTC/ETH 1:5, all
   31 others 1:2, live-confirmed on the actual Crypto-classification
   account). BNBUSD's exact-minute pin: **measured by F10** (Task 15,
   2026-08-04) — TRACKS reconfirmed (~15 bp across the F3 window), with
   the watchlist-row caveat named rather than papered over; a fully clean
   pin still wants BNBUSD as the active chart symbol on a future frame.
4. MatchTrader — any One Forex frame, since feed identity is per-platform.
5. US cash indices during a weekday NY session — the same-second test F2
   could not run with cash closed; one weekday frame completes the
   synthetic-cash finding.
6. JPY-cross exact-minute spot-check — **attempted by F10** (Task 15,
   2026-08-04) and found not closeable from the existing record: no raw
   per-pair E8 quote with clock corroboration survives for any JPY pair
   (F5's own commit history shows only the prose summary was ever
   recorded). Still open — needs one fresh frame with a JPY pair
   (USDJPY.C or GBPJPY.C) as the active chart symbol.
7. ~~The three remaining code fallbacks all fail the same scale test
   WTI → USO just failed.~~ — **RESOLVED by Task 16c** (2026-08-04,
   controller-authored insertion from the owner-accepted follow-up chip
   Task 16b raised). Task 16b (2026-08-04) had audited every
   `fallbackFmpSymbol` left in `src/lib/symbolMap.ts` against live FMP
   quotes: `ASX` → `EWA` (iShares MSCI Australia ETF) $30.12 vs `^AXJO`
   9,154.6 (≈304x off) · `NSDQ` → `QQQ` (Invesco QQQ Trust) $723.85 vs
   `^NDX` 29,733.16 (≈41x off) · `DAX` → the FMP ticker literally named
   `DAX` (Global X - DAX Germany ETF) $47.08 vs `^GDAXI` 26,367.5 (≈560x
   off) — full quotes in task-16b-report.md's adjudication table. None was
   removed in Task 16b, whose brief scoped the code change to WTI alone;
   Task 16c's ruling of record was that all three fail on the identical
   ground as WTI's USO removal (scale-broken stand-ins, zero legitimate
   consumers) and removed them too. The field itself is retired, not left
   at zero entries: `fallbackFmpSymbol` is gone from
   `src/lib/symbolMap.ts`'s `SecurityOption` type, and both edge functions'
   own independently hardcoded symbol maps (`market-data/index.ts`,
   `trade-analyzer/symbols.ts`) lost the matching `{primary, fallback}`
   entries, the now-dead `fallback`-carrying `SymbolConfig` type, and the
   string/object normalization step each needed only for that shape.
   `resolveProviderSymbols` in both files now resolves every symbol to its
   primary alone, unconditionally.

   This item's other finding — `market-data/index.ts` enforcing no
   no-trade list of its own, unlike the analyzer's `noTradeSymbols` gate on
   `reviewCurrentMarket` — is closed too: that function now carries its own
   `noTradeSymbols` set, byte-identical to `trade-analyzer/symbols.ts`'s
   (copied, never re-membered — the SET stays the analyzer's law), refused
   before any provider fetch with the same `blocked`/`reason` shape
   `reviewCurrentMarket`'s own no-trade block uses.

   **Fix round 1** (2026-08-04, controller review): the `noTradeSymbols`
   check alone compared the request's *string*, not its *resolved
   identity* — `normalizeSymbol("^NDX")` is `"NDX"`, not `NSDQ`'s own
   canonical key, so NSDQ's FMP alias (or any of `^GSPC`/`^DJI`/`^N225`/
   `^GDAXI`, or `ASX`'s pre-existing `^AXJO` variant of the same gap) read
   as an unrecognized-but-otherwise-fine symbol and reached a real provider
   fetch. The fix resolves identity first: `market-data/index.ts` gained
   its own `isKnownSymbol`, mirroring `trade-analyzer/symbols.ts`'s
   function of the same name and the same precondition
   `trade-analyzer`'s own `scanOpportunities` applies to every requested
   symbol before any of it — including `reviewCurrentMarket`'s own
   `noTradeSymbols` check — ever runs. Refusing anything that isn't a
   canonical `symbolMap` key closes the alias hole and the `ASX` variant in
   the same gate, ahead of the no-trade and temporarily-unavailable checks.
   With that in place, the claim is exactly true as written: a direct
   authenticated call — canonical name, FMP alias, or garbage — can no
   longer reach a no-trade symbol's provider fetch at all, fallback or
   not, regardless of what the shipped client's UI already kept
   unreachable.

   `tests/feedSource.test.ts` pins all three layers: an exhaustive,
   now-permanently-empty match for any fallback-shaped entry across both
   edge functions' source text (the mechanism this item's fallbacks used to
   populate); a source-text pin confirming `market-data/index.ts` carries
   the no-trade gate's `noTradeSymbols` set, its `isKnownSymbol`
   resolved-identity check, their relative order (identity, then no-trade
   and temporarily-unavailable, then `resolveProviderSymbols`), and the
   refusal copy; and an import-based pin against
   `trade-analyzer/symbols.ts`'s real `isKnownSymbol` proving none of the
   six no-trade/hidden Indices' own FMP aliases collides with a canonical
   Levelflow symbol name — the data-level property the gate depends on.
   `docs/research/e8-fmp-crossmap.md:350` named the general shape of the
   fallback-scale problem ("ETF fallbacks are a fourth price scale... any
   sizing number derived from the primary symbol's scale is wrong") on
   2026-08-02, before F10 existed; that file is unchanged by this
   resolution (out of this task's scope, same as Task 16b's precedent) and
   remains stale on that point.
