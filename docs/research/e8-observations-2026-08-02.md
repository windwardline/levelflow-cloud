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
