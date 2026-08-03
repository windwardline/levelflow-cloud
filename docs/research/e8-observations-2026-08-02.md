# E8 live-platform observations — 2026-08-02 (owner, TradeLocker, E8 Pro Forex account)

Provenance class: `verified` (direct observation on the broker's live platform, per the
2026-08-02 amendments). Account: E8 Pro Forex, balance ≈ $23,960 at capture. All P&L
figures read from TradeLocker's own order ticket at 1.00 lot. Derivations shown so the
arithmetic is auditable; nothing inferred beyond the shown ticket.

## The in-platform ticker format — the cross-map's biggest gap, now closed
Order tickets name instruments `{E8 name}.C`: `EURUSD.C`, `GBPNZD.C`, `SP.C`, `WTI.C`,
`XAUUSD.C`, `SOLUSD.C`. The CFD universe is E8's published names plus a `.C` suffix.
(Note `SP.C` — the ticket uses the short root, not `SP500`.)

## Per-instrument observations

| Instrument | Ticket evidence | Derived | Verdict vs shipped data |
|---|---|---|---|
| **EURUSD.C** | 200 ticks = $200 @ 1 lot; prices 5-dp (1.15242→1.15442 = 200 ticks) | tick 0.00001 = $1/lot → pip $10/lot → contract 100,000 | **CONFIRMS** shipped `forex_contract` 100,000 exactly |
| **GBPNZD.C** | 200 ticks = $117.98 @ 1 lot | tick $0.5899 → pip 10 NZD × NZDUSD ≈ 0.5899 (live rate ✓) | **CONFIRMS the bridging derivation to the cent** — §20i ruling 1 empirically validated |
| **SP.C** | 200 ticks = $40 @ 1 lot; 7,524.25→7,528.25 span | tick 0.01 = $0.20 → **$20 per 1.00 point** | **CONFIRMS** the non-standard SP500 points_per_lot = 20 |
| **WTI.C** | 200 ticks = $200 @ 1 lot; 3-dp prices (80.784→80.984) | tick 0.001 = $1 → **$1,000 per 1.00 → contract 1,000 bbl** | **FILLS a NOT PUBLISHED gap** — energies gain their first sized row |
| **XAUUSD.C** | 100 ticks = $100 @ 1 lot; 4,071.26→4,073.26 | tick 0.01 = $1 → $100 per 1.00 → contract 100 | **CONFIRMS** shipped gold contract 100 |
| **SOLUSD.C** | SL 200 ticks = $1,000, TP 100 ticks = $500 @ 1 lot; 71.69/73.69/74.69 | tick 0.01 = $5 → **$500 per 1.00 → contract 500** | **FILLS a NOT PUBLISHED gap** — first sized crypto row |

## Margin/leverage corroboration (from the tickets' own margin line)
- EURUSD: $3,847.68 (16.06%) ≈ 115,442 / 30 → **forex leverage 30:1 confirmed live**.
- WTI: $5,398.39 (22.53%) ≈ 80,984 / 15 → **energies leverage 15:1 confirmed live**.
- XAUUSD: $27,145.69 (113.3%, order blocked) ≈ 407,226 / 15 → **metals 15:1 confirmed live**,
  and the platform's margin block at Margin Level < 100% observed working.
- **SOLUSD: $36,845.00 = 500 × 73.69 exactly → leverage 1:1 observed** — E8's published
  "other crypto 1:2" (5514982) does NOT match this account's ticket. CONTRADICTION,
  published-vs-observed; the observation is scoped to E8 Pro Forex and wins there per the
  verified-provenance rule. Whether other program lines differ is unobserved.

## Consequences for the §19 retrofit (Wave C)
1. Six rows gain `verified` observations (EURUSD, GBPNZD, SP500, WTI, XAUUSD, SOLUSD),
   with the GBPNZD row upgrading the whole derived-bridge family's confidence.
2. WTI (contract 1,000) and SOLUSD (contract 500) move from not_published toward sizeable —
   contract size is an instrument property; leverage stays program-scoped, and SOL's
   observed 1:1 enters as the Pro-line value with the published 1:2 contradiction recorded.
3. Alt spelling machinery gains the `.C` ticket suffix per instrument.
4. Remaining unobserved: BZUSD/Brent (no E8 route per the cross-map), the other five crypto,
   silver, indices beyond SP — the Appendix A queue orders them by what each unblocks.

---

# Observation batch 2 — 2026-08-02 (owner, TradeLocker, same E8 Pro Forex account)

Thirteen further tickets. With batch 1 this completes the CFD universe: every
scannable CFD market and every non-scannable roster row now carries an observed
per-lot value. Several tickets show closed-market validation flags on the SL
fields (Sunday); the platform's P&L calculator still prices the tick math, which
is what these observations read. Balance context this batch ≈ $23,960 unchanged.

## Metals and energies

| Instrument | Ticket | Derived | Verdict |
|---|---|---|---|
| **XAGUSD.C** | 100 ticks = $500/lot; tick 0.001 | $5/tick → **contract 5,000 oz** | **FILLS silver** (was not_published); margin $19,471 ≈ 58.419×5000/15 → metals 15:1 again |
| **BRENT.C** | 100 ticks = $100/lot; tick 0.001 | $1/tick → contract 1,000 bbl (same as WTI) | **DISCOVERY: Brent EXISTS on E8** — the cross-map's "no E8 route on any program" verdict for BRENT/BZUSD is corrected by direct observation; margin $5,725 ≈ 85.885×1000/15 |

## Indices — all six, and three are FX-denominated

| Instrument | Ticket | Derived | Verdict |
|---|---|---|---|
| **NSDQ.C** | 100 ticks (1.00 pt) = $5 | **$5/point** | CONFIRMS published NAS100 = 5 |
| **DOW.C** | 100 ticks (1.00 pt) = $5 | **$5/point** | CONFIRMS published US30 = 5 |
| **NIKKEI.C** | 100 ticks (1.00 pt) = $3.17 | **¥500/point** (500 × USDJPY⁻¹ ≈ 500 × 0.00634 = $3.17) | **FILLS + reveals JPY denomination** — USD value floats with USDJPY |
| **DAX.C** | 100 ticks (1.00 pt) = $5.77 | **€5/point** (5 × EURUSD 1.1544 = $5.77 — the same EURUSD their batch-1 ticket showed) | **FILLS + reveals EUR denomination** |
| **ASX.C** | 100 ticks (1.00 pt) = $14.08 | **AUD 20/point** (20 × AUDUSD ≈ 0.704) | **FILLS + reveals AUD denomination** |
| (SP.C batch 1) | — | $20/point | already confirmed |

**Design consequence**: three index contracts are foreign-currency-denominated —
their per-point USD value is `contract × {USDJPY⁻¹ | EURUSD | AUDUSD}`, i.e. the
bridging machinery applies to indices exactly as it does to forex crosses. All
margins corroborate indices 15:1.

## Crypto — the whole set, contract sizes revealed

| Instrument | 100-tick P&L | Tick | Contract | Margin = notional×? |
|---|---|---|---|---|
| BTCUSD.C | $2 | 0.01 | **2** | $126,866 = 63,433×2 → **1:1** |
| ETHUSD.C | $20 | 0.01 | **20** | $37,538 = 1,876.89×20 → **1:1** |
| BCHUSD.C | $200 | 0.01 | **200** | 1:1 |
| BNBUSD.C | $200 | 0.01 | **200** (non-scannable roster row) | 1:1 |
| SOLUSD.C (batch 1) | $500 | 0.01 | **500** | 1:1 |
| LTCUSD.C | $500 | 0.01 | **500** | 1:1 |
| XRPUSD.C | $100 | 0.00001 | **100,000** | 1:1 |
| ADAUSD.C | $100 | 0.00001 | **100,000** | 1:1 |

**Leverage contradiction widens**: observed margin is FULL NOTIONAL (1:1) on
every crypto ticket including BTC and ETH, where E8 publishes 1:5 (5514982;
others 1:2). Scoped: this is an **E8 Pro Forex** account — the crypto-line
accounts (One Crypto, Pro Crypto, Signature Crypto) may carry the published
leverage while a forex-line account gets none. Until a crypto-line account is
observed or E8 confirms, the rulebook records both values with their scopes;
sizing on a forex-line account uses the observed 1:1.

## State of the empirical table after batch 2
- CFD universe: **complete** — 28 forex (method + spot checks), 2 metals, 2
  energies (incl. the Brent discovery), 6 indices, 8 crypto, all observed.
- Remaining unobserved: the futures line (owner's planned E8 futures account
  purchase covers it), and per-line leverage variance for crypto accounts.

---
# Observation batch 3 — 2026-08-02 (owner, TradeLocker, same account)

Twenty forex tickets, each read at 1.00 lot with 100 ticks per side (0.00100 on
5-dp pairs, 0.100 on JPY pairs). Full per-ticket record:

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

# Observation batch 4 — 2026-08-02 (owner, TradeLocker, same account) — THE SET CLOSES

Six final tickets, same protocol:

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
