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

# Observation batch 4 — 2026-08-02 (owner, TradeLocker, same account) — THE SET CLOSES

Six final tickets: AUDCHF ($123.90 ✓ CHF class), EURAUD ($70.42 ✓ AUD class),
AUDCAD ($71.35 ✓ CAD class), GBPJPY ($63.39 ✓ JPY class), CADJPY ($63.38 ✓ JPY
class), EURNZD ($58.97 ✓ NZD class).

**All 28 forex pairs are now directly observed** — batch 3's "22 of 28, rest by
class formula" is superseded: there is no unobserved pair. Across batches 1–4:
28 forex + 2 metals + 2 energies (incl. the Brent discovery) + 6 indices (three
FX-denominated) + 8 crypto = **46 instruments — the complete CFD universe —
empirically verified on the broker's live platform**, every value agreeing with
its derivation. Remaining empirical queue: the futures line (owner's planned
futures-account purchase) and crypto-line leverage variance.
