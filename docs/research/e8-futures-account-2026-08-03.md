# E8 Signature Futures — the live account record (2026-08-03)

Owner-supplied primary evidence: nine screenshots taken 2026-08-03,
3:05–3:09 PM ET, minutes after purchasing a live E8 Futures account
(order 20260852522). One frame of the E8X dashboard, eight frames of
Tradovate's watchlist tabs (Indices · Crypto · Financials · Currencies ·
Energies · Metals · Grains · Meats; the Softs and Stocks tabs exist in the
chrome and were not captured). Under amendment 19 these screenshots are
the single source of truth for what this account class offers; this file
is their transcription of record. Companion to
`e8-crypto-account-2026-08-03.md`, purchased the same afternoon.

## 1. The account, identified

**E8 Signature Futures · $25,000 · Phase 1 — the catalog's
`signature_futures` line, SimFi Challenge stage.** Account E61855833256 on
Tradovate ("Tradovate only," the walk's own platform rule, confirmed live).

| Dashboard fact | Value | Record expectation | Verdict |
|---|---|---|---|
| Initial balance | $25,000 | `SIGNATURE_LADDER[0]` = 25,000 | match |
| Profit target | $1,500 | 6% (walk FU5, dossier) | match |
| EOD Drawdown | $1,000, loss level $24,000, Highest EOD $25,000 | dossier per-size table: **$1,000 at $25K** | match |
| Drawdown mechanism | trails Highest EOD | EOD Dynamic, breakeven-lock (dossier) | match |
| Daily drawdown | none shown | Daily Pause is Performance-stage only, and soft | match |
| Stage | "Phase 1" | SimFi Challenge → SimFi Performance | match |
| Platform controls | Manual Lockout button; Day/Initial margin meters at 0% | §20-relevant: a platform-native lockout exists | recorded |

**One record refinement, not a conflict.** The purchase-screen walk noted
"the EOD Drawdown selector shows a single option, [3%]" — true of its
$100K frames ($3,000/$100K = 3%), and the percentage is not a constant:
the dossier's per-size dollars ($1,000/$25K · $2,000/$50K · $3,000/$100K ·
$4,500/$150K) are the invariant, and this live $25K account renders
exactly 4% ($1,000). The dollars were right all along; the walk's
generalized "[3%]" is size-relative. A clarifying line rides in the walk
record with this change set.

## 2. The tradeable markets — eight tabs, transcribed

Tradovate's default watchlist retains stale contract rows (2024-era month
codes and expired strips) with no data; they are listed as stale and are
not part of the current offering. Priced rows carry contract months
**Q6 = Aug 2026 · U6 = Sep 2026 · V6 = Oct 2026** — the live chain at
capture time. Prices are LAST at 2:08:59–2:09:49 PM CDT.

**Indices** (13 rows, 12 live): ESU6 7633.75 · FESXU6 6467.0 · NQU6
28915.25 · YMU6 53290 · MESU6 7634.00 · MNQU6 28915.50 · MYMU6 53290 ·
MCU6 2712.25 · FDAXU6 26151.0 · EMDU6 3810.40 · NKDU6 63355 · FDXMU6
26154.0 · stale: NIYU4.

**Crypto** (7 rows, 5 live): BITQ6 64180 · MBTQ6 64075 · METQ6 1871.00 ·
BTCQ6 64070 · ETHQ6 1873.00 · placeholders without data: BTC/USD,
ETH/USD (spot display rows, not contracts).

**Financials** (10 rows, all live): ZNU6 108'125 · ZFU6 106'070 · FGBLU6
124.81 · FGBMU6 114.080 · FGBSU6 105.535 · FGBXU6 106.56 · ZTU6 102'278 ·
ZBU6 109'02 · UBU6 110'16 · TNU6 110'065.

**Currencies** (16 rows, 14 live): 6EU6 1.15330 · 6JU6 0.0063985 · 6AU6
0.69940 · 6BU6 1.3432 · 6CU6 0.71335 · 6MQ6 0.057600 · M6EU6 1.1533 ·
6NU6 0.58775 · 6SU6 1.24010 · E7U6 1.1533 · M6AU6 0.6994 · M6BU6 1.3431 ·
J7U6 0.006401 · MCDU6 0.7134 · MSFU6 1.2401 · stale: DXU4.

**Energies** (11 rows, 6 live): CLU6 80.46 · HOU6 3.8846 · RBU6 2.9686 ·
QMU6 80.450 · BZV6 84.05 · QGU6 2.775 · stale: BRNU4, NGQ4, OILF2,
ULSQ4, WBSU4.

**Metals** (9 rows, 7 live): GCQ6 4029.6 · HGQ6 6.5000 · SICU6 58.18 ·
SIQ6 57.800 · PLQ6 1628.0 · PAQ6 1244.50 · MGCQ6 4041.0 · stale: YGZ4,
YIN4.

**Grains** (11 rows, 10 live): ZCU6 449'6 · ZSQ6 1168'0 · ZWU6 651'4 ·
ZLQ6 67.75 · ZMQ6 313.5 · ZOU6 316'3 · XKQ6 1181'3 · XWU6 652'0 · XCU6
450'3 · ZRU6 14.205 · stale: KEU4.

**Meats** (3 rows, all live): LEQ6 231.400 · GFQ6 348.300 · HEQ6 97.650.

Grain and treasury prints use exchange notation (grains in eighths —
449'6 = 449.75¢; treasuries in 32nds — ZNU6 108'125 = 108.390625), which
is itself load-bearing below.

## 3. FMP source resolution — what one sweep of the commodities book settled

Sampled per class against `full-commodities-quotes` and `batch-quote`
at ~19:12–19:13 UTC (3–4 minutes after the frames):

- **Same-month rows: exact-class PASS.** ES +3.25 / NQ +23 / YM +23 over
  the skew — and the three index deltas equal each other's lag exactly.
  CL +0.08 · RB +0.0028 · HO +0.0044 · QG↔NGUSD +0.004 (all ≈10–15 bp).
  **Treasuries are the strongest identity evidence in the whole program:
  ZFU6 106'070 = 106.21875 and ZBU6 109'02 = 109.0625 equal FMP's decimals
  EXACTLY; ZN within half a 32nd.** Silver's ACTIVE month SICU6 58.18 vs
  SIUSD/SILUSD 58.195 (3 bp). ZRU6 vs ZRUSD 21 bp.
- **Month-offset rows — the tradeMonth phenomenon, confirmed general.**
  FMP's continuous series tracks the ACTIVE month; watchlist rows holding
  expiring or nearby months differ by the calendar spread, not by feed:
  GCQ6 (Aug, 112 lots) 4029.6 vs GCUSD (Dec-active) 4103.6; ZCU6 (Sep)
  449.75 vs ZCUSX (Dec-active) 472.5; ZSQ6 1168 vs ZSUSX 1192.25; meats'
  Aug-vs-Oct seasonal spreads (HEQ6 97.65 vs HEUSX 83.675). The §19
  retrofit plan pre-registered exactly this class for BZUSD's stale
  `tradeMonth`; it is now measured across four classes. **Any futures
  feed comparison must be month-aware.**
- **Symbol resolutions found.** Grains, meats, and softs live under FMP's
  **USX-suffixed roots**: ZCUSX · ZSUSX · ZLUSX · ZOUSX · KEUSX (KC
  wheat) · LEUSX · HEUSX · GFUSX · CTUSX · SBUSX · KCUSX · OJUSX. The
  naive -USD spellings are traps: **HEUSD and GFUSD resolve to crypto
  tokens** (HEUSD printed 0.00011), and LEUSD/ZCUSD/ZWUSD/ZSUSD return
  nothing. A future futures-onboarding build needs a guard against the
  -USD/-USX collision class.
- **FX futures vs spot**: 6EU6 1.15330 vs EURUSD spot 1.15135 — +17 pips
  of carry, the expected spot-vs-futures basis (same class as the
  recorded inverted-FX note).
- **Crypto futures vs spot**: BTCQ6 64,070 vs BTCUSD spot 63,864 —
  ≈ +0.32% contango; ETHQ6 1873.00 vs spot 1868 ≈ +0.27%. Real futures
  basis over the same spot market the Crypto account trades.
- **No FMP source found** (this sweep): the Eurex family (FDAXU6, FDXMU6,
  FESXU6, FGBLU6, FGBMU6, FGBSU6, FGBXU6) · NKDU6 · EMDU6 · UBU6 · TNU6 ·
  ZW Chicago wheat (only KC wheat KEUSX appears). Micro variants (MES,
  MNQ, MYM, MCU, MGC, M6E, M6A, M6B, E7, J7, MCD, MSF, MBT, MET, XK, XW,
  XC, QM, QG, BIT) share their parents' sources.

F9's protocol entry rides in `e8-feed-verification-2026-08-02.md`.

**Tradability re-grounding, 2026-08-05 (owner ruling, 00:49).** Every
Financials and Currencies row above prints live — the owner confirmed, after
reviewing the frames again, that `ZB`, `ZN`, `6J` and `6M` are OFFERED: none
joins an exclusion. This settles §19a's `ZB`/`ZN` "margin-only, unconfirmed"
mark and §19a/§20i ruling 5's `6J`/`6M` "unconfirmed on the tick-axis
arithmetic" mark for TRADABILITY only (amendment 19,
`2026-08-02-owner-rulings-amendments.md`) — all four ship `confirmed`,
sourced to this sighting. SIZING is a separate question and stays withheld
on all four (amendment 22, the same ledger): `ZB`/`ZN`'s tick and value are
still absent from every E8 list above, and `6J`/`6M`'s published tick and
value still cannot be reconciled with 6E/6S's (§3's `full-commodities-quotes`
sweep did not touch this — currency futures were never in that sweep's scope,
only commodities/equity-index/rates). `6J` and `6M`'s FMP mates —
`USDJPY` and `USDMXN`, both inverted — are resolved in
`e8-feed-verification-2026-08-02.md`'s F12 entry, added 2026-08-05.

## 4. What this record feeds

- The §19 retrofit's catalog build: `signature_futures`'s purchasable
  structure is live-confirmed (ladder rung, 6% target, per-size EOD
  dollars, Challenge staging, Tradovate).
- The §19 retrofit's `ZB`/`ZN`/`6J`/`6M` re-grounding (2026-08-05): OFFERED
  per amendment 19 on this record's own Financials/Currencies prints,
  unsizeable per amendment 22 — `src/lib/broker/instruments.ts`,
  `tests/brokerReference.test.ts`.
- The futures onboarding (post-retrofit): the per-tab visibility sets,
  the month-aware comparison rule, the USX symbol resolutions, and the
  no-source list above — each Eurex/absent row needs an offer/exclude
  decision under the A16 pattern before anything renders.
- §20 governor inputs: EOD-only guardrail in Challenge (no daily), the
  platform-native Manual Lockout, and the margin meters.
