# E8 live-platform observations — 2026-08-02 (owner, TradeLocker, E8 Pro Forex account)

Provenance class: `verified` (direct observation on the broker's live platform, per the
2026-08-02 amendments). Account: E8 Pro Forex, balance ≈ $23,960 at capture. All P&L
figures read from TradeLocker's own order ticket at 1.00 lot; tick counts are the
ticket's own Ticks field. Four batches, 46 tickets, every derivation auditable from the
recorded numbers alone. "Blocked" = the platform disabled the order button at capture
(margin block or closed-market validation); the P&L calculator still prices the tick
math, which is what these observations read.

## The in-platform ticker format — the cross-map's biggest gap, closed
Order tickets name instruments `{E8 name}.C`: the CFD universe is E8's published names
plus a `.C` suffix, with the short roots `SP.C`, `NSDQ.C`, `DOW.C`, `DAX.C`, `NIKKEI.C`,
`ASX.C`, `WTI.C`, `BRENT.C` for indices and energies.

---

# Observation batch 1 — six tickets

| Instrument | SL | Entry | TP | Ticks | P&L | P&L % | Margin | Margin % | Note |
|---|---|---|---|---|---|---|---|---|---|
| EURUSD.C | 1.15242 | 1.15442 | 1.15642 | 200/200 | $200.00 | 0.83 | $3,847.68 | 16.06 | |
| GBPNZD.C | 2.28528 | 2.28728 | 2.28928 | 200/200 | $117.98 | 0.49 | $4,497.07 | 18.77 | |
| SP.C | 7,524.25 | 7,526.25 | 7,528.25 | 200/200 | $40.00 | 0.17 | $10,034.00 | 41.88 | |
| WTI.C | 80.784 | 80.984 | 81.184 | 200/200 | $200.00 | 0.83 | $5,398.39 | 22.53 | |
| XAUUSD.C | 4,071.26 | 4,072.26 | 4,073.26 | 100/100 | $100.00 | 0.42 | $27,145.69 | 113.30 | blocked (margin) |
| SOLUSD.C | 71.69 | 73.69 | 74.69 | 200 SL / 100 TP | $1,000 SL / $500 TP | 4.17 / 2.09 | $36,845.00 | 153.79 | blocked (margin) |

Derived: EURUSD tick 0.00001 = $1/lot → pip $10 → **contract 100,000** (forex confirmed
exactly as built). GBPNZD $0.5899/tick = 10 NZD × NZDUSD ≈ 0.5899 — **the bridging
derivation confirmed to the cent**. SP tick 0.01 = $0.20 → **$20 per 1.00 point**
(the non-standard multiplier confirmed). WTI tick 0.001 = $1 → **contract 1,000 bbl**
(fills a NOT PUBLISHED class). XAUUSD tick 0.01 = $1 → **contract 100** (confirmed);
the 113.3% margin block shows stop-out enforcement live. SOLUSD tick 0.01 = $5 →
**contract 500** (fills the crypto gap). Margin lines: forex 30:1, energies 15:1,
metals 15:1 — and SOL margin = full notional (see the leverage contradiction, batch 2).

---

# Observation batch 2 — fourteen tickets

| Instrument | SL | Entry | TP | Ticks | P&L | P&L % | Margin | Margin % | Note |
|---|---|---|---|---|---|---|---|---|---|
| XAGUSD.C | 58.317 | 58.419 | 58.517 | 100/100 | $500.00 | 2.09 | $19,471.05 | 81.27 | |
| BRENT.C | 85.785 | 85.885 | 85.985 | 100/100 | $100.00 | 0.42 | $5,725.09 | 23.90 | blocked (closed-market validation) |
| NSDQ.C | 28,447.50 | 28,448.50 | 28,449.50 | 100/100 | $5.00 | 0.02 | $9,481.89 | 39.58 | |
| NIKKEI.C | 63,173.22 | 63,174.22 | 63,175.22 | 100/100 | $3.17 | 0.01 | $13,357.17 | 55.75 | blocked (validation) |
| ASX.C | 8,942.57 | 8,943.57 | 8,944.57 | 100/100 | $14.08 | 0.06 | $8,396.58 | 35.05 | blocked (validation) |
| DOW.C | 52,652.88 | 52,653.88 | 52,654.88 | 100/100 | $5.00 | 0.02 | $17,549.54 | 73.25 | |
| DAX.C | 25,810.06 | 25,811.06 | 25,812.06 | 100/100 | $5.77 | 0.02 | $9,926.07 | 41.43 | blocked (validation) |
| BCHUSD.C | 211.95 | 212.95 | 213.95 | 100/100 | $200.00 | 0.83 | $42,590.00 | 177.76 | blocked (margin) |
| BNBUSD.C | 586.47 | 587.47 | 588.47 | 100/100 | $200.00 | 0.83 | $117,494.00 | 490.40 | blocked (margin) |
| LTCUSD.C | 43.78 | 44.78 | 45.78 | 100/100 | $500.00 | 2.09 | $22,390.00 | 93.45 | warning (yellow), order enabled |
| XRPUSD.C (sell) | 1.08504 | 1.08404 | 1.08304 | 100/100 | $100.00 | 0.42 | $108,404.00 | 452.46 | blocked (margin) |
| ADAUSD.C | 0.18876 | 0.18976 | 0.19076 | 100/100 | $100.00 | 0.42 | $18,976.00 | 79.20 | blocked (validation) |
| BTCUSD.C | 63,431.98 | 63,432.98 | 63,433.98 | 100/100 | $2.00 | 0.01 | $126,865.96 | 529.52 | blocked (margin) |
| ETHUSD.C (sell) | 1,877.89 | 1,876.89 | 1,875.89 | 100/100 | $20.00 | 0.08 | $37,537.80 | 156.68 | blocked (margin) |

Derived, metals/energies: XAGUSD tick 0.001 = $5 → **contract 5,000 oz** (fills silver;
margin ≈ 58.419×5,000/15 → metals 15:1). **BRENT exists on E8** — tick 0.001 = $1 →
contract 1,000 bbl, margin ≈ 85.885×1,000/15; this corrects the cross-map's "no E8
route on any program" verdict for BRENT/BZUSD by direct observation.

Derived, indices: NSDQ **$5/point** and DOW **$5/point** (both confirm the published
combined row). NIKKEI **¥500/point** (500 × USDJPY⁻¹ ≈ 500 × 0.00634 = $3.17). DAX
**€5/point** (5 × EURUSD 1.1544 = $5.77 — the same EURUSD batch 1's own ticket shows).
ASX **AUD 20/point** (20 × AUDUSD ≈ 0.704 = $14.08). Three of six indices are
foreign-currency-denominated: their per-point USD value is `contract ×
{USDJPY⁻¹ | EURUSD | AUDUSD}` — the bridging machinery applies to indices exactly as
to forex crosses. All index margins corroborate 15:1.

Derived, crypto — contract sizes for the whole set: BTC tick 0.01 = $0.02 →
**contract 2**; ETH $0.20/tick → **contract 20**; BCH and BNB $2/tick → **contract
200** (BNB is a non-scannable roster row); LTC $5/tick → **contract 500**; XRP and
ADA tick 0.00001 = $1 → **contract 100,000**. **Leverage contradiction**: observed
margin is FULL NOTIONAL (1:1) on every crypto ticket including BTC and ETH, where E8
publishes 1:5 (5514982; others 1:2). Scoped: this is an E8 Pro **Forex** account —
the crypto-line accounts (One Crypto, Pro Crypto, Signature Crypto) may carry the
published leverage while a forex-line account gets none. Until a crypto-line account
is observed or E8 confirms, the rulebook records both values with their scopes;
sizing on a forex-line account uses the observed 1:1.

---

# Observation batch 3 — twenty tickets

Each at 1.00 lot with 100 ticks per side (0.00100 on 5-dp pairs, 0.100 on JPY pairs):

| Pair | SL | Entry | TP | 100-tick P&L | P&L % | Margin | Margin % |
|---|---|---|---|---|---|---|---|
| GBPUSD.C | 1.34744 | 1.34844 | 1.34944 | $100.00 | 0.42 | $4,494.35 | 18.76 |
| EURCHF.C | 0.93043 | 0.93143 | 0.93243 | $123.86 | 0.52 | $3,845.03 | 16.05 |
| EURCAD.C | 1.61589 | 1.61689 | 1.61789 | $71.35 | 0.30 | $3,845.14 | 16.05 |
| EURJPY.C | 181.978 | 182.078 | 182.178 | $63.36 | 0.26 | $3,845.19 | 16.05 |
| NZDCHF.C | 0.47509 | 0.47609 | 0.47709 | $123.87 | 0.52 | $1,965.51 | 8.20 |
| USDCAD.C | 1.40052 | 1.40152 | 1.40252 | $71.35 | 0.30 | $3,333.06 | 13.91 |
| GBPCAD.C | 1.88899 | 1.88999 | 1.89099 | $71.35 | 0.30 | $4,494.71 | 18.76 |
| NZDUSD.C | 0.58874 | 0.58974 | 0.59074 | $100.00 | 0.42 | $1,965.60 | 8.20 |
| GBPCHF.C | 1.08760 | 1.08860 | 1.08960 | $123.88 | 0.52 | $4,494.76 | 18.76 |
| USDCHF.C | 0.80625 | 0.80725 | 0.80825 | $123.88 | 0.52 | $3,332.98 | 13.91 |
| NZDCAD.C | 0.82542 | 0.82642 | 0.82742 | $71.35 | 0.30 | $1,965.36 | 8.20 |
| AUDJPY.C | 110.996 | 111.096 | 111.196 | $63.38 | 0.26 | $2,346.95 | 9.80 |
| CADCHF.C | 0.57496 | 0.57596 | 0.57696 | $123.89 | 0.52 | $2,378.20 | 9.93 |
| AUDNZD.C | 1.19322 | 1.19422 | 1.19522 | $58.96 | 0.25 | $2,346.87 | 9.80 |
| EURGBP.C | 0.85454 | 0.85554 | 0.85654 | $134.84 | 0.56 | $3,845.13 | 16.05 |
| USDJPY.C | 157.722 | 157.822 | 157.922 | $63.36 | 0.26 | $3,332.97 | 13.91 |
| CHFJPY.C | 195.404 | 195.504 | 195.604 | $63.37 | 0.26 | $4,129.02 | 17.23 |
| GBPAUD.C | 1.91434 | 1.91534 | 1.91634 | $70.42 | 0.29 | $4,495.24 | 18.76 |
| AUDUSD.C | 0.70312 | 0.70412 | 0.70512 | $100.00 | 0.42 | $2,346.83 | 9.80 |
| NZDJPY.C | 92.947 | 93.047 | 93.147 | $63.37 | 0.26 | $1,965.35 | 8.20 |

Class-formula verification (each against the same session's own USD legs):
USD-quoted $1.00/tick flat · CHF-quoted 10 CHF ÷ USDCHF 0.80725 = $12.388/pip ·
CAD-quoted 10 CAD ÷ USDCAD 1.40152 = $7.135/pip · JPY-quoted ¥1,000 ÷ USDJPY
157.822 = $6.336/pip · GBP-quoted £10 × GBPUSD 1.34844 · AUD-quoted A$10 ×
AUDUSD 0.70412 · NZD-quoted NZ$10 × NZDUSD 0.58974. Every ticket agrees to the
cent. Margin = base-currency notional ÷ 30 on all twenty (e.g. CHFJPY $4,129.02
= 100,000 × (1/0.80725) ÷ 30) — 30:1 confirmed per ticket, not just per class.
Running tally after this batch: 22 of 28 pairs directly observed.

---

# Observation batch 4 — six tickets — THE SET CLOSES

| Pair | SL | Entry | TP | 100-tick P&L | P&L % | Margin | Margin % |
|---|---|---|---|---|---|---|---|
| AUDCHF.C | 0.56734 | 0.56834 | 0.56934 | $123.90 | 0.52 | $2,346.94 | 9.80 |
| EURAUD.C | 1.63773 | 1.63873 | 1.63973 | $70.42 | 0.29 | $3,846.18 | 16.05 |
| AUDCAD.C | 0.98582 | 0.98682 | 0.98782 | $71.35 | 0.30 | $2,346.88 | 9.80 |
| GBPJPY.C | 212.678 | 212.778 | 212.878 | $63.39 | 0.26 | $4,495.24 | 18.76 |
| CADJPY.C | 112.480 | 112.580 | 112.680 | $63.38 | 0.26 | $2,378.16 | 9.93 |
| EURNZD.C | 1.95583 | 1.95683 | 1.95783 | $58.97 | 0.25 | $3,845.93 | 16.05 |

**All 28 forex pairs are now directly observed.** Across batches 1–4: 28 forex
+ 2 metals + 2 energies (incl. the Brent discovery) + 6 indices (three
FX-denominated) + 8 crypto = **46 instruments — the complete CFD universe —
empirically verified on the broker's live platform**, every value agreeing with
its derivation and every margin line consistent with its class leverage.
Remaining empirical queue: the futures line (owner's planned futures-account
purchase) and crypto-line leverage variance.

## Consequences for the §19 retrofit (Wave C)
1. Every CFD row gains a `verified` observation; the bridging family is confirmed
   ticket by ticket, and WTI, BRENT, XAGUSD and all eight crypto move from
   not_published/not_offered toward sizeable (contract size is an instrument
   property; leverage stays program-scoped).
2. The cross-map correction: BRENT/BZUSD have an E8 route.
3. Alt-spelling machinery gains the `.C` ticket suffix and the index/energy roots.
4. Crypto leverage enters dual-valued: published (1:5 / 1:2) per line, observed
   1:1 on the forex line — the row's scope decides which applies.
5. **Item 1 landed, 2026-08-04 (Task 13)** — narrower than item 1's own phrasing.
   "Contract size is an instrument property" would carry a crypto contract size
   onto a Crypto-classification line; amendment 12 licenses this evidence
   classification-wide instead — every E8 account of the FOREX classification
   (`one`, `pro_forex`, `signature_forex`, `zero`) and no other. Those four lines'
   CFD rows for XAGUSD, WTI, BRENT and all eight crypto symbols are now
   `confirmed` with a `verified` contract size or per-point value; `one_crypto`,
   `pro_crypto`, `signature_crypto` and the futures lines are untouched pending
   their own accounts (amendment 15). Flagged to the owner as an open question in
   the Task 13 PR body rather than assumed.
