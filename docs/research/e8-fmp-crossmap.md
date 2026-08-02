# E8 ↔ FMP Instrument Cross-Map
Design input for Levelflow's broker module (E8 first; other brokers selectable later). Compiled 2026-08-02.

## Scope

Levelflow side is read from code, not from memory:

- `src/lib/symbolMap.ts` — `SECURITY_GROUPS` (59 code-present markets), `NO_TRADE_SYMBOLS` (8), `TEMPORARILY_HIDDEN_ASSET_SYMBOLS` (1), `AVAILABLE_ASSET_SYMBOLS` (50).
- `supabase/functions/trade-analyzer/symbols.ts` — the server mirror (`symbolMap`, `noTradeSymbols`, `defaultScanSymbols`). The server enforces the no-trade list regardless of what any client shows.
- `supabase/functions/trade-analyzer/futures.ts` — `FUTURES_CONTRACT_SPECS`, Levelflow's own tick grid for the 13 Futures rows.
- `supabase/functions/trade-analyzer/calibration.ts` — `ASSET_TYPE_BY_SYMBOL`, which decides whether tick alignment runs at all.
- `src/lib/marketHours.ts` — `marketAvailability`, the per-class session calendar.

The roster is the engine's **50-market scannable menu**: Crypto 7, Energies 2, Forex 28, Futures 11, Metals 2. Indices are a retired no-edge class (r12 dedicated round, r15 re-check) — all six index rows are in `NO_TRADE_SYMBOLS` or hidden, so the Indices group resolves to zero options and disappears from `AVAILABLE_ASSET_GROUPS` entirely (pinned by `tests/core.test.ts`). Those six, plus `NGUSD`/`HGUSD` (r14) and `BNBUSD` (r16), are mapped in the §1.6 addendum because they remain full members of the symbol map and the replay universe, and because the governor still has to answer "is this tradable on this program" for them if the evidence ever flips.

E8 side is read only from `docs/research/e8-markets-dossier.md` and `docs/research/e8-futures-dossier.md`. Nothing here was fetched live.

## Vocabulary (used strictly)

| Term | Meaning |
|---|---|
| **[PRIMARY]** | Dossier fetched it from an e8markets.com / help.e8markets.com / helpfutures.e8markets.com / e8x / e8futures.com page. |
| **[SECONDARY]** | Third-party aggregator reproducing E8's terms. Never laundered into a confident claim below. |
| **NOT OFFERED** | Instrument absent from an E8 list the dossier characterizes as canonical or cross-checked complete. Only used for E8 Futures, whose 45-instrument roster was cross-checked against three independent listings. |
| **NOT PUBLISHED** | The relevant E8 list or spec is itself incomplete or inaccessible, so absence proves nothing. Used for every E8 Markets class except Forex, and for all E8 crypto/energies/metals-beyond-gold detail. |
| **UNCONFIRMED** | Symbol appears on an E8 page but the dossier flags its tradability as unconfirmed or contradictory. |

The distinction between the last two is load-bearing for the governor: NOT OFFERED gates a market off; NOT PUBLISHED means "ask E8 before gating."

## The one shared caveat over every row

E8's in-platform order-entry ticker string is **NOT PUBLISHED** for every asset class. The forex slash format (`EUR/USD`) is the E8X dashboard's *display* convention [PRIMARY, e8x.e8markets.com/trading-symbols], and the dossier states plainly that it is "not confirmed as the literal order-entry symbol string inside TradeLocker/MatchTrader/MT5," calling this "the single most consequential gap for building an automated symbol cross-map." Every E8 Markets string in the tables below is therefore a *display* spelling, not a verified order-entry symbol. The E8 Futures roots are on firmer ground (standard exchange roots + month code + year digit, e.g. `MBTG6` = Micro Bitcoin Feb 2026 [PRIMARY]), but Levelflow's rows carry no contract month at all — see §5.

---

## 1. Per-market cross-map (all 50 scannable markets)

### 1.1 Forex — 28 markets

Every one of the 28 pairs carries identical E8 Markets terms: **contract size 100,000 units, leverage 30:1, commission $5 round-turn per lot charged once on open** [PRIMARY, e8x.e8markets.com/trading-symbols]. E8 publishes no explicit per-pip dollar figure anywhere — the dossier is explicit that "pip value must be derived."

**Levelflow's 28-pair forex roster is a 1:1 set match with E8's published 28-pair table** — and the `forex` source array in `symbolMap.ts` lists them in E8's exact table order, element for element (the rendered menu re-sorts by base then quote). Zero gaps in either direction. The only forex mismatches are notation and the unpublished order-entry string.

E8 Futures column: CME FX contracts exist for the 7 USD-leg pairs only. The 21 crosses have no CME cross-rate contract in E8's roster.

| Levelflow | FMP source | E8 Markets | E8 Futures | E8 size / tick value | MISMATCH |
|---|---|---|---|---|---|
| AUDCAD | AUDCAD | `AUD/CAD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| AUDCHF | AUDCHF | `AUD/CHF` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| AUDJPY | AUDJPY | `AUD/JPY` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter; JPY-quote pip mechanics not published |
| AUDNZD | AUDNZD | `AUD/NZD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| AUDUSD | AUDUSD | `AUD/USD` | `6A` · `M6A` | CFD 100,000 · $5/lot [PRIMARY]; 6A 0.0001/$10.00, M6A 0.0001/$1.00 [PRIMARY] | Class: spot CFD vs CME future. Same direction (AUD base) |
| CADCHF | CADCHF | `CAD/CHF` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| CADJPY | CADJPY | `CAD/JPY` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter; JPY-quote pip mechanics not published |
| CHFJPY | CHFJPY | `CHF/JPY` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter; JPY-quote pip mechanics not published |
| EURAUD | EURAUD | `EUR/AUD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| EURCAD | EURCAD | `EUR/CAD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| EURCHF | EURCHF | `EUR/CHF` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| EURGBP | EURGBP | `EUR/GBP` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| EURJPY | EURJPY | `EUR/JPY` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter; JPY-quote pip mechanics not published |
| EURNZD | EURNZD | `EUR/NZD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| EURUSD | EURUSD | `EUR/USD` | `6E` · `7E` · `M6E` | CFD 100,000 · $5/lot [PRIMARY]; 6E 0.0001/$12.50, 7E 0.0001/$6.25, M6E 0.0001/$1.25 [PRIMARY] | Class: spot CFD vs three future sizes. **7E is spelled `E7` on one E8 page** — 7E canonical [PRIMARY] |
| GBPAUD | GBPAUD | `GBP/AUD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| GBPCAD | GBPCAD | `GBP/CAD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| GBPCHF | GBPCHF | `GBP/CHF` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| GBPJPY | GBPJPY | `GBP/JPY` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter; JPY-quote pip mechanics not published |
| GBPNZD | GBPNZD | `GBP/NZD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| GBPUSD | GBPUSD | `GBP/USD` | `6B` · `M6B` | CFD 100,000 · $5/lot [PRIMARY]; 6B 0.0001/$6.25, M6B 0.0001/$0.63 [PRIMARY] | Class: spot CFD vs CME future. Same direction (GBP base) |
| NZDCAD | NZDCAD | `NZD/CAD` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| NZDCHF | NZDCHF | `NZD/CHF` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter only |
| NZDJPY | NZDJPY | `NZD/JPY` | NOT OFFERED | 100,000 · $5/lot [PRIMARY] | Delimiter; JPY-quote pip mechanics not published |
| NZDUSD | NZDUSD | `NZD/USD` | `6N` | CFD 100,000 · $5/lot [PRIMARY]; 6N 0.0001/$10.00 [PRIMARY] | Class: spot CFD vs CME future. No micro NZD in E8's roster |
| USDCAD | USDCAD | `USD/CAD` | `6C` · `MCD` | CFD 100,000 · $5/lot [PRIMARY]; 6C 0.0001/$10.00, MCD 0.0001/$1.00 [PRIMARY] | **DIRECTION INVERTED** — E8 names these "Canadian $" / "Micro CAD/USD", i.e. CAD-base. Long 6C ≈ short USDCAD. MCD margin NOT PUBLISHED |
| USDCHF | USDCHF | `USD/CHF` | `6S` | CFD 100,000 · $5/lot [PRIMARY]; 6S 0.0001/$12.50 [PRIMARY] | **DIRECTION INVERTED** — E8 names it "Swiss Franc", CHF-base. No micro CHF |
| USDJPY | USDJPY | `USD/JPY` | `6J` | CFD 100,000 · $5/lot [PRIMARY]; 6J **0.0000001**/$12.50 [PRIMARY] | **DIRECTION INVERTED + QUOTE SCALE** — E8 names it "Japanese Yen", JPY-base, tick published at 7 decimals against FMP's ~3-decimal USDJPY price. See §4 |

### 1.2 Metals — 2 markets

| Levelflow | FMP source | E8 Markets | E8 Futures | E8 size / tick value | MISMATCH |
|---|---|---|---|---|---|
| XAGUSD | XAGUSD | NOT PUBLISHED — the contract-size article renders only 4 rows (XAUUSD, US30, NAS100, SP500) and silver is not among them; "Metals" is a confirmed class [PRIMARY] but gold is its only symbol with a published spec | `SI` (Silver, COMEX) | SI 0.005 / $25.00 per tick [PRIMARY]; margin $2,000/contract — an explicit exception to the $10,000 standard [PRIMARY]. E8 Markets silver contract size NOT PUBLISHED | **Class**: Levelflow trades spot silver via FMP; E8 Futures offers the COMEX contract. Also an unnamed **"Micro Silver"** row exists in E8's margin table with the symbol cell left blank and every other spec NOT PUBLISHED [PRIMARY] |
| XAUUSD | XAUUSD | `XAUUSD` | `GC` (Gold) · `MGC` (Micro Gold) | E8 Markets XAUUSD contract size **100** oz per 1.0 lot [PRIMARY]; commission $6/lot [SECONDARY]. GC 0.1/$10.00, MGC 0.1/$1.00 [PRIMARY] | Only exact same-class metals match in the roster. **Ticket cap is symbol-specific: 20 lots for XAUUSD/Gold vs 50 lots elsewhere** [PRIMARY]. GC/MGC are the same exposure through a different instrument |

### 1.3 Energies — 2 markets

E8 Markets confirms "Energies" as one of five asset classes [PRIMARY] but publishes **no symbol list, no contract size, and no energies-specific leverage figure** anywhere accessible without login. Commission $6/lot is [SECONDARY] only, grouped with metals/commodities. So both rows are NOT PUBLISHED on the Markets side by definition, not by absence.

| Levelflow | FMP source | E8 Markets | E8 Futures | E8 size / tick value | MISMATCH |
|---|---|---|---|---|---|
| BRENT | BZUSD | NOT PUBLISHED (Energies class confirmed, symbol list absent) | NOT OFFERED — Brent is absent from the 45-instrument canonical roster; E8's crude is WTI only (`CL`/`MCL`/`QM`) [PRIMARY] | — | **No confirmed E8 route on any program line.** Also: FMP source `BZUSD` is shared with Levelflow's `BZUSD` Futures row (see §5) |
| WTI | CLUSD (fallback `USO`) | NOT PUBLISHED (Energies class confirmed, symbol list absent) | `CL` (Crude Oil) · `MCL` (Micro) · `QM` (E-mini) | CL 0.01/$10.00, MCL 0.01/$1.00, QM 0.025/$12.50 [PRIMARY] | **Class + duplicate**: FMP source `CLUSD` is shared with Levelflow's `CLUSD` Futures row, but `WTI` classifies as `energies` in `ASSET_TYPE_BY_SYMBOL` so it **never gets tick alignment** while `CLUSD` does. ETF fallback `USO` is a third quote convention again |

### 1.4 Futures — 11 markets

E8's futures specs are textbook exchange specs — the dossier states E8 "does not alter tick values for futures the way it does for CFD indices." The mismatches here are about *which* contracts exist and which have publishable specs, not about tick arithmetic.

| Levelflow | FMP source | E8 Markets | E8 Futures | E8 size / tick value | MISMATCH |
|---|---|---|---|---|---|
| BZUSD | BZUSD | NOT PUBLISHED (Energies) | NOT OFFERED — no Brent contract in E8's roster [PRIMARY] | — | **No confirmed E8 route on any program line.** Levelflow encodes tickSize 0.01 for a contract E8 does not carry |
| CLUSD | CLUSD | NOT PUBLISHED (Energies) | `CL` · `MCL` · `QM` | CL 0.01/$10.00 · margin $10,000; MCL 0.01/$1.00 · margin $1,000; QM 0.025/$12.50 [PRIMARY] | Levelflow tickSize 0.01 matches CL exactly. Levelflow has no micro/mini variant row, so `MCL`/`QM` are unreachable |
| ESUSD | ESUSD | `SP500` (CFD, cross-class) | `ES` · `MES` | ES 0.25/$12.50 · margin $10,000; MES 0.25/$1.25 · margin $1,000 [PRIMARY]. E8 Markets SP500 CFD contract size **20** ($20 per 1.0-point move per lot) [PRIMARY] | Levelflow tickSize 0.25 matches ES. **Cross-program exposure trap**: the same S&P exposure costs $12.50/0.25pt as `ES` on a Futures program and $20.00/1.0pt as `SP500` CFD on a Markets program — the dossier calls E8's $20 multiplier "notably non-standard" and "unusually high" |
| GCUSD | GCUSD | `XAUUSD` (spot CFD, cross-class) | `GC` · `MGC` | GC 0.1/$10.00 · margin $10,000; MGC 0.1/$1.00 · margin $1,000 [PRIMARY]. XAUUSD CFD contract size 100 [PRIMARY] | Levelflow tickSize 0.1 matches GC. Three Levelflow rows (`XAUUSD`, `GCUSD`, `MGCUSD`) resolve to the same exposure through three different E8 instruments across two program families |
| MGCUSD | MGCUSD | `XAUUSD` (spot CFD, cross-class) | `MGC` | MGC 0.1 / $1.00 · margin $1,000 [PRIMARY] | Levelflow tickSize 0.1 matches MGC. Levelflow's only micro-contract row |
| NQUSD | NQUSD | `NAS100` (CFD, cross-class) | `NQ` · `MNQ` | NQ 0.25/$5.00 · margin $10,000; MNQ 0.25/$0.50 · margin $1,000 [PRIMARY]. E8 Markets NAS100 CFD contract size **5** [PRIMARY] | Levelflow tickSize 0.25 matches NQ. Cross-program: $5.00/0.25pt future vs $5/1.0pt CFD |
| RTYUSD | RTYUSD | NOT PUBLISHED — no Russell index appears on any E8 Markets list found; the published indices set is US30, NAS100, SP500, GER40/DAX, FTSE100, Nikkei, Australia 200/AUS200, and no source asserts that set is exhaustive | `RTY` · `M2K` | RTY 0.1/$5.00 · margin $10,000; M2K 0.1/$0.50 · margin $1,000 [PRIMARY] | Levelflow tickSize 0.1 matches RTY. Futures-only exposure — no CFD equivalent published |
| SIUSD | SIUSD | NOT PUBLISHED (silver CFD not individually listed) | `SI` | SI 0.005 / $25.00 · margin **$2,000** [PRIMARY] | Levelflow tickSize 0.005 matches SI. Margin is the one documented exception to E8's $10,000-standard / $1,000-micro pattern |
| YMUSD | YMUSD | `US30` (CFD, cross-class) | `YM` (Mini-DOW) · `MYM` (Micro Mini-DOW) | YM 1/$5.00 · margin $10,000; MYM 1/$0.50 · margin $1,000 [PRIMARY]. E8 Markets US30 CFD contract size **5** [PRIMARY] | Levelflow tickSize 1 matches YM. **Naming**: E8 calls YM "Mini-DOW", Levelflow calls it "E-Mini Dow Futures". Indices commission splits per symbol — $12/lot for Dow Jones vs $6/lot for Nasdaq/S&P [SECONDARY] |
| ZBUSD | ZBUSD | NOT PUBLISHED — rates are not a named E8 Markets asset class at all | `ZB` — **UNCONFIRMED** | Margin $10,000/contract [PRIMARY]. **Tick size, tick value, and all three commission components: NOT PUBLISHED** | **Highest-severity row.** `ZB` appears *only* in E8's margin table — absent from the fee table, the tick table, the canonical product list, the e8futures.com homepage grid, and the live e8x symbol browser. Dossier verdict: "treat as NOT reliably tradable pending direct confirmation from E8 support." Levelflow encodes tickSize 0.03125 (1/32) which cannot be reconciled against anything E8 publishes |
| ZNUSD | ZNUSD | NOT PUBLISHED — rates are not a named E8 Markets asset class | `ZN` — **UNCONFIRMED** | Margin $10,000/contract [PRIMARY]. **Tick size, tick value, commissions: NOT PUBLISHED** | Same as ZBUSD. Levelflow encodes tickSize 0.015625 (1/64), unverifiable against E8. Both Treasury rows share correlation group `treasury_futures` — the governor would gate the whole group at once |

### 1.5 Crypto — 7 markets

Leverage is the only PRIMARY crypto fact: **Bitcoin 1:5, Ethereum 1:5, all other crypto 1:2**, stated identically on E8 One Crypto, E8 Pro Crypto and E8 Signature Crypto pages [PRIMARY]. Everything else is unpublished: **contract size NOT PUBLISHED for every crypto symbol**, the exhaustive symbol list NOT PUBLISHED, the paired ticker format NOT PUBLISHED (`BTCUSD` vs `BTC/USD` unknown), and commission is [SECONDARY] with irreconcilable units — one source says ~$30–35/lot, another says 0.035% of notional, and the dossier notes these "are not obviously reconcilable without knowing crypto contract size, which is itself NOT PUBLISHED."

| Levelflow | FMP source | E8 Markets | E8 Futures | E8 size / tick value | MISMATCH |
|---|---|---|---|---|---|
| ADAUSD | ADAUSD | NOT PUBLISHED — "a range of altcoins" [SECONDARY], never enumerated | NOT OFFERED | Contract size NOT PUBLISHED; leverage 1:2 (other crypto) [PRIMARY] | **No confirmed E8 route on any program line.** Cannot even establish whether E8 lists Cardano |
| BCHUSD | BCHUSD | NOT PUBLISHED (unenumerated altcoin) | NOT OFFERED | Contract size NOT PUBLISHED; leverage 1:2 [PRIMARY] | No confirmed E8 route on any program line |
| BTCUSD | BTCUSD | `BTC` — asset name only [SECONDARY]; paired ticker NOT PUBLISHED | `MBT` (Micro E-mini Bitcoin) | E8 Markets contract size NOT PUBLISHED; leverage **1:5** [PRIMARY]. MBT tick 5 / $0.50 · margin $1,000 [PRIMARY] | **Class + convention**: Levelflow trades spot BTC/USD via FMP; E8 Futures offers only the *micro* CME contract, no full-size. E8's crypto-CFD ticker string is unknown |
| ETHUSD | ETHUSD | `ETH` — asset name only [SECONDARY] | `MET` (Micro E-mini Ether) | Contract size NOT PUBLISHED; leverage **1:5** [PRIMARY]. MET tick 0.05 / $0.50 · margin $1,000 [PRIMARY] | Same as BTCUSD — micro-only on the futures side |
| LTCUSD | LTCUSD | NOT PUBLISHED (unenumerated altcoin) | NOT OFFERED | Contract size NOT PUBLISHED; leverage 1:2 [PRIMARY] | No confirmed E8 route on any program line |
| SOLUSD | SOLUSD | `SOL` — asset name only [SECONDARY] | NOT OFFERED | Contract size NOT PUBLISHED; leverage 1:2 [PRIMARY] | Named on the Markets side, absent from futures. Ticker string unknown |
| XRPUSD | XRPUSD | NOT PUBLISHED (unenumerated altcoin) | NOT OFFERED | Contract size NOT PUBLISHED; leverage 1:2 [PRIMARY] | No confirmed E8 route on any program line |

### 1.6 Addendum — the 9 code-present, non-scannable markets

Mapped for completeness because they stay in the symbol map and the replay universe, and the no-trade list "shrinks the round the evidence flips." The governor must not treat any of these as tradable today regardless of what E8 offers.

| Levelflow | Levelflow status | FMP source | E8 Markets | E8 Futures | E8 size / tick value | MISMATCH |
|---|---|---|---|---|---|---|
| SP | no-trade (r12/r15) | `^GSPC` | `SP500` | `ES` · `MES` · `EMD` | SP500 CFD contract size **20** [PRIMARY]; ES 0.25/$12.50, MES 0.25/$1.25 [PRIMARY] | **Class**: FMP `^GSPC` is a cash index level; E8 sells a CFD with a $20/point multiplier the dossier flags as "notably non-standard." No FMP↔E8 price parity |
| NSDQ | no-trade (r12/r15) | `^NDX` (fb `QQQ`) | `NAS100` | `NQ` · `MNQ` | NAS100 CFD contract size 5 [PRIMARY]; NQ 0.25/$5.00 [PRIMARY] | Class: cash index vs CFD vs future — three price scales. ETF fallback `QQQ` is a fourth |
| DOW | no-trade (r12/r15) | `^DJI` | `US30` | `YM` · `MYM` | US30 CFD contract size 5 [PRIMARY]; YM 1/$5.00 [PRIMARY] | Class as above. Dow indices commission $12/lot vs $6/lot elsewhere [SECONDARY] |
| NIKKEI | no-trade (r12/r15) | `^N225` | `Nikkei` — named only, **contract size NOT PUBLISHED** | `NKD` (Nikkei 225) | NKD tick 5 / $25.00 · margin $10,000 [PRIMARY]. CFD size NOT PUBLISHED | Class as above. E8's CFD spelling for Nikkei is not published in symbol form, only as a product name |
| DAX | no-trade (r12/r15) | `^GDAXI` (fb `DAX`) | `GER40/DAX` — named only, **contract size NOT PUBLISHED** | NOT OFFERED — no DAX contract in E8's futures roster [PRIMARY] | Indices commission $6/lot [SECONDARY] | E8 writes it as `GER40/DAX`, i.e. two candidate spellings in one string. No futures route |
| ASX | hidden (chart feed unverified) | `^AXJO` (fb `EWA`) | `Australia 200/AUS200` — named only, **contract size NOT PUBLISHED** | NOT OFFERED | Australia 200 commission **$12/lot** vs $6 for other indices [SECONDARY] | Two candidate spellings again. Hidden on Levelflow's side for an unrelated reason (feed verification) |
| NGUSD | no-trade (r14) | `NGUSD` | NOT PUBLISHED (Energies) | `NG` · `QG` · (`MNG` UNCONFIRMED) | NG 0.001/$10.00 · margin $10,000; QG 0.005/$12.50 [PRIMARY] | Levelflow tickSize 0.001 matches NG. **E8's tick table prints this row's symbol as `NQ`** — colliding with E-mini NASDAQ 100 in the same taxonomy; the fee table uses `NG` [PRIMARY, recorded as a site error by the dossier, not resolved]. `MNG` is margin-table-only, tradability unconfirmed |
| HGUSD | no-trade (r14) | `HGUSD` | NOT PUBLISHED (metals beyond gold) | `HG` (Copper) | HG 0.0005 / $12.50 · margin $10,000 [PRIMARY] | Levelflow tickSize 0.0005 matches HG. E8's margin table lists **`/MHG` Micro Copper at $10,000** — the same as full-size HG, breaking the 1/10th micro pattern every other micro follows; dossier records it verbatim as a likely page error, unconfirmed |
| BNBUSD | no-trade (r16) | `BNBUSD` | NOT PUBLISHED (unenumerated altcoin) | NOT OFFERED | Contract size NOT PUBLISHED; leverage 1:2 [PRIMARY] | No confirmed E8 route on any program line |

### 1.7 Levelflow's own tick grid vs E8's published tick size

`FUTURES_CONTRACT_SPECS` in `supabase/functions/trade-analyzer/futures.ts` already encodes a tick grid. Nine of thirteen reconcile exactly with E8's published tick size; two cannot be checked; two have no E8 contract.

| Levelflow row | Levelflow `tickSize` | E8 published tick size | Verdict |
|---|---|---|---|
| CLUSD | 0.01 | 0.01 (`CL`) [PRIMARY] | Match |
| ESUSD | 0.25 | 0.25 (`ES`) [PRIMARY] | Match |
| GCUSD | 0.1 | 0.1 (`GC`) [PRIMARY] | Match |
| HGUSD | 0.0005 | 0.0005 (`HG`) [PRIMARY] | Match (row is no-trade) |
| MGCUSD | 0.1 | 0.1 (`MGC`) [PRIMARY] | Match |
| NGUSD | 0.001 | 0.001 (`NG`) [PRIMARY, symbol printed as `NQ` on E8's tick page] | Match (row is no-trade) |
| NQUSD | 0.25 | 0.25 (`NQ`) [PRIMARY] | Match |
| RTYUSD | 0.1 | 0.1 (`RTY`) [PRIMARY] | Match |
| SIUSD | 0.005 | 0.005 (`SI`) [PRIMARY] | Match |
| YMUSD | 1 | 1 (`YM`) [PRIMARY] | Match |
| BZUSD | 0.01 | — | E8 carries no Brent contract |
| ZBUSD | 0.03125 | NOT PUBLISHED | Unverifiable |
| ZNUSD | 0.015625 | NOT PUBLISHED | Unverifiable |

Levelflow carries **no** tick or contract-size spec for Forex, Metals, Energies, Crypto or Indices — `applyFuturesTickRules` runs only when `getAssetType(symbol) === "futures"`. That is the gap the broker module has to fill for 39 of the 50 markets.

---

## 2. E8 instruments Levelflow does not serve — expansion candidates

FMP symbols in this section are **inferred from `symbolMap.ts` conventions**, not from any E8 source. The observed conventions: CME futures roots take a `USD` suffix (`ESUSD`, `MGCUSD`, `ZNUSD`); cash indices take an FMP `^` prefix (`^GSPC`, `^N225`, `^GDAXI`, `^AXJO`) with an ETF fallback (`QQQ`, `DAX`, `EWA`, and `EWG`/`EWJ` in the news-proxy map); spot FX and crypto are unpunctuated 6-char pairs.

### 2.1 E8 Futures — CME Equity Index

| E8 symbol | E8 product | Tick / value [PRIMARY] | Margin [PRIMARY] | Likely FMP symbol |
|---|---|---|---|---|
| `EMD` | E-mini S&P MidCap 400 | 0.1 / $10.00 | NOT PUBLISHED | `EMDUSD` |
| `MES` | Micro E-mini S&P 500 | 0.25 / $1.25 | $1,000 | `MESUSD` |
| `NKD` | Nikkei 225 | 5 / $25.00 | $10,000 | `NKDUSD` |
| `MNQ` | Micro E-mini NASDAQ 100 | 0.25 / $0.50 | $1,000 | `MNQUSD` |
| `M2K` | Micro E-mini Russell 2000 | 0.1 / $0.50 | $1,000 | `M2KUSD` |
| `MYM` | Micro Mini-DOW | 1 / $0.50 | $1,000 | `MYMUSD` |

The five micros are the cheapest expansion in the whole map: Levelflow already carries the full-size parent for four of them (ES, NQ, RTY, YM) with a matching tick grid, and the micro differs only in tick value and margin. `MGCUSD` is the existing precedent for a micro row.

### 2.2 E8 Futures — CME FX

All 13 CME FX contracts are unserved as futures. Seven duplicate exposure Levelflow already has as spot pairs (§1.1); `6M` has no Levelflow counterpart in any class.

| E8 symbol | E8 product | Tick / value [PRIMARY] | Margin [PRIMARY] | Likely FMP symbol | Note |
|---|---|---|---|---|---|
| `6A` | Australian $ | 0.0001 / $10.00 | $10,000 | `6AUSD` | AUDUSD exposure |
| `M6A` | Micro AUD/USD | 0.0001 / $1.00 | $1,000 | `M6AUSD` | " |
| `6B` | British Pound | 0.0001 / $6.25 | $10,000 | `6BUSD` | GBPUSD exposure |
| `M6B` | Micro British Pound | 0.0001 / $0.63 | $1,000 | `M6BUSD` | " |
| `6C` | Canadian $ | 0.0001 / $10.00 | $10,000 | `6CUSD` | Inverse of USDCAD |
| `MCD` | Micro CAD/USD | 0.0001 / $1.00 | **NOT PUBLISHED** | `MCDUSD` | Inverse of USDCAD |
| `6E` | Euro FX | 0.0001 / $12.50 | $10,000 | `6EUSD` | EURUSD exposure |
| `7E` | E-mini Euro FX | 0.0001 / $6.25 | **NOT PUBLISHED** | `7EUSD` | Spelled `E7` on one E8 page |
| `M6E` | Micro Euro | 0.0001 / $1.25 | $1,000 | `M6EUSD` | EURUSD exposure |
| `6J` | Japanese Yen | 0.0000001 / $12.50 | $10,000 | `6JUSD` | Inverse of USDJPY |
| `6S` | Swiss Franc | 0.0001 / $12.50 | $10,000 | `6SUSD` | Inverse of USDCHF |
| `6M` | Mexican Peso | 0.00005 / $5.00 | $10,000 | `6MUSD` | **No Levelflow counterpart in any class** |
| `6N` | New Zealand $ | 0.0001 / $10.00 | $10,000 | `6NUSD` | NZDUSD exposure |

### 2.3 E8 Futures — NYMEX Energy

| E8 symbol | E8 product | Tick / value [PRIMARY] | Margin [PRIMARY] | Likely FMP symbol |
|---|---|---|---|---|
| `MCL` | Micro Crude Oil | 0.01 / $1.00 | $1,000 | `MCLUSD` |
| `QM` | E-mini Crude Oil | 0.025 / $12.50 | $10,000 | `QMUSD` |
| `QG` | E-mini Natural Gas | 0.005 / $12.50 | $10,000 | `QGUSD` |
| `RB` | RBOB Gasoline | 0.0001 / $4.20 | $10,000 | `RBUSD` |
| `HO` | Heating Oil | 0.0001 / $4.20 | $10,000 | `HOUSD` |

`RB` and `HO` are genuinely new exposures — Levelflow has no refined-products market at all.

### 2.4 E8 Futures — COMEX Metals

| E8 symbol | E8 product | Tick / value [PRIMARY] | Margin [PRIMARY] | Likely FMP symbol |
|---|---|---|---|---|
| `PL` | Platinum | 0.1 / $10.00 | $10,000 | `PLUSD` |
| `PA` | Palladium | 0.1 / $10.00 | **NOT PUBLISHED** | `PAUSD` |

### 2.5 E8 Futures — CBOT Agricultural and CME Livestock

Entirely unserved. Note the different session: CBOT ags trade **19:00–13:20 CT**, not 17:00–15:10 CT [PRIMARY], which Levelflow's single `CME_COMPLEX_CALENDAR` does not model.

| E8 symbol | E8 product | Tick / value [PRIMARY] | Margin [PRIMARY] | Hours (CT) | Likely FMP symbol |
|---|---|---|---|---|---|
| `ZC` | Corn | 0.25 / $12.50 | $10,000 | 19:00–13:20 | `ZCUSD` |
| `ZW` | Wheat | 0.25 / $12.50 | $10,000 | 19:00–13:20 | `ZWUSD` |
| `ZS` | Soybeans | 0.25 / $12.50 | $10,000 | 19:00–13:20 | `ZSUSD` |
| `ZM` | Soybean Meal | 0.1 / $10.00 | $10,000 | 19:00–13:20 | `ZMUSD` |
| `ZL` | Soybean Oil | 0.01 / $6.00 | $10,000 | 19:00–13:20 | `ZLUSD` |
| `LE` | Live Cattle | 0.025 / $10.00 | $10,000 | 17:00–16:00 | `LEUSD` |
| `HE` | Lean Hogs | 0.025 / $10.00 | $10,000 | 17:00–16:00 | `HEUSD` |

### 2.6 E8 Futures — margin-table-only symbols, tradability UNCONFIRMED

Do not build against these. The dossier: "Cross-checked against 3 independent listings — none of them include these. Tradability of these is unconfirmed/contradictory; treat as NOT reliably tradable pending direct confirmation from E8 support."

| E8 symbol | E8 product | Margin [PRIMARY] | Everything else | Levelflow status |
|---|---|---|---|---|
| `ZB` | 30-Year Bond | $10,000 | NOT PUBLISHED | **Levelflow already serves this as `ZBUSD`** |
| `ZN` | 10-Year Note | $10,000 | NOT PUBLISHED | **Levelflow already serves this as `ZNUSD`** |
| `ZT` | 2-Year Note | $10,000 | NOT PUBLISHED | Unserved |
| `ZF` | 5-Year Note | $10,000 | NOT PUBLISHED | Unserved |
| `UB` | Ultra-Bond | $10,000 | NOT PUBLISHED | Unserved |
| `TN` | Ultra-Note | $10,000 | NOT PUBLISHED | Unserved |
| `ZQ` | 30 Day Fed | $10,000 | NOT PUBLISHED | Unserved |
| `GF` | Feeder Cattle | $10,000 | NOT PUBLISHED | Unserved |
| `MNG` | Micro Natural Gas | $1,000 | NOT PUBLISHED | Unserved (`NGUSD` is no-trade) |
| *(blank)* | "Micro Silver" | $1,000 | NOT PUBLISHED — **E8 left the symbol cell empty** | Unserved |
| `/MHG` | Micro Copper | $10,000 — same as full-size `HG`, breaking the micro pattern; recorded as a likely page error, unconfirmed | NOT PUBLISHED | Unserved (`HGUSD` is no-trade) |

### 2.7 E8 Markets (CFD side)

| E8 instrument | Class | E8 spec | Likely FMP symbol | Note |
|---|---|---|---|---|
| `FTSE100` | Indices | Contract size NOT PUBLISHED | `^FTSE`, ETF fallback `EWU` by the `EWA`/`EWG`/`EWJ` pattern | **The only E8 Markets instrument with no Levelflow counterpart at all** — not even a code-present row |
| `GER40/DAX` | Indices | Contract size NOT PUBLISHED | `^GDAXI` (fb `DAX`) — already in code | Levelflow row exists but is no-trade (r12/r15) |
| `Nikkei` | Indices | Contract size NOT PUBLISHED | `^N225` — already in code | No-trade (r12/r15) |
| `Australia 200/AUS200` | Indices | Contract size NOT PUBLISHED; $12/lot commission [SECONDARY] | `^AXJO` (fb `EWA`) — already in code | Hidden pending feed verification |
| Energies symbols | Energies | **No symbol list published at all** | — | Cannot be enumerated. E8 confirms the class exists; that is all |
| Altcoins beyond BTC/ETH/SOL | Crypto | **No exhaustive list published** | — | Cannot be enumerated. Levelflow's XRP/LTC/BCH/ADA/BNB may or may not be among them |
| Metals beyond gold | Metals | **Contract-size article renders only 4 rows** | — | Cannot be enumerated. Silver's status is unknown, not negative |

Four of the seven rows above are "cannot enumerate," not "nothing to add." The Markets-side expansion surface is unmeasurable from published sources.

---

## 3. Levelflow markets E8 does not offer — per program line

This is the governor's per-program universe gate. Program→class coverage as published:

| Program line | Published asset classes | Source |
|---|---|---|
| E8 One | Forex / Metals / Indices / Crypto / Energies | [PRIMARY] |
| E8 One Crypto | Crypto only | [PRIMARY] |
| E8 Signature Forex | Forex / Metals / Indices / Crypto / Energies (product index); leverage line names only Forex 1:30, Indices 1:15, Metals 1:15 | [PRIMARY] |
| E8 Signature Crypto | Crypto only | [PRIMARY] |
| E8 Signature Futures | CME futures only | [PRIMARY] |
| E8 Pro Forex | Forex / Metals / Indices — **Energies and Crypto absent from its class list** | [PRIMARY] |
| E8 Pro Crypto | Crypto only | [PRIMARY] |
| E8 Zero (forex side) | Forex / Metals / Indices / Crypto — **Energies absent** | [PRIMARY] |
| E8 Zero Futures (Starter / MAX) | CME futures only | [PRIMARY] |
| E8 Classic | Forex (+ "per some pages, more") | [PRIMARY snippet — article 404'd on re-fetch] |
| E8 Track / Track 1:1 | Forex | [SECONDARY ONLY — never found on either help subdomain; treat as unconfirmed / possibly legacy] |

**Carry forward, unresolved**: the futures dossier's product-comparison table gives the "Markets" row as E8 Signature = "Forex, Crypto, Futures" and E8 One = "Forex, Crypto" [PRIMARY], while the markets dossier's product index gives Signature Forex and E8 One as Forex/Metals/Indices/Crypto/Energies [PRIMARY]. Whether "Forex" in the comparison table denotes the whole CFD family (metals, indices, energies included) or literally FX pairs is **NOT PUBLISHED**. The governor cannot derive metals/indices/energies eligibility from that table alone.

### 3.1 On the Futures program lines (E8 Signature Futures, E8 Zero Starter, E8 Zero MAX)

Tradovate is the only platform [PRIMARY]. Of the 50 scannable markets, **39 are not tradable at all** — every Forex (28), Metals (2), Energies (2) and Crypto (7) row. The app must state "not tradable on this broker program" for all 39. Note that for several of them the *exposure* is reachable through a different Levelflow row (XAUUSD→GCUSD/MGCUSD, XAGUSD→SIUSD, WTI→CLUSD, BTCUSD/ETHUSD→no Levelflow micro-crypto row exists), which is a suggestion the governor can make but not a substitution it can make silently.

Of the 11 Futures rows: 8 confirmed tradable (`CL`, `ES`, `GC`, `MGC`, `NQ`, `RTY`, `SI`, `YM`), 2 UNCONFIRMED (`ZB`, `ZN`), 1 NOT OFFERED (`BZUSD` — no Brent contract).

### 3.2 On E8 One / E8 Signature Forex / E8 Pro Forex / E8 Zero (CFD lines)

All 11 Futures rows are **not tradable** — E8 One and E8 Pro are confirmed "Forex, Crypto"-only [PRIMARY], and the futures roster lives exclusively on Signature Futures and Zero Futures. Five of the 11 have a same-exposure CFD (`ESUSD`→`SP500`, `NQUSD`→`NAS100`, `YMUSD`→`US30`, `GCUSD`/`MGCUSD`→`XAUUSD`) at a **different contract size and a different P&L-per-point**, so this is an instrument substitution with real sizing consequences, not a rename.

Six further rows have no published E8 Markets instrument: `XAGUSD`, `RTYUSD`, `ZBUSD`, `ZNUSD` (rates are not a named E8 Markets class), `BZUSD`, `SIUSD`. Status is NOT PUBLISHED, not NOT OFFERED — the app should say "not confirmed on this broker program," which is a different sentence from "not offered."

### 3.3 On E8 Pro Forex and E8 Zero (forex side) specifically

**Energies is absent from both programs' published class lists** [PRIMARY]. Both `WTI` and `BRENT` are therefore not tradable on Pro or Zero on top of already having no published E8 energies symbol on any program. `WTI`/`BRENT` are the only two Levelflow markets that are simultaneously (a) unmapped to any E8 Markets symbol and (b) excluded by class from two program lines.

### 3.4 On the crypto-only program lines (E8 One Crypto, E8 Signature Crypto, E8 Pro Crypto)

43 of the 50 markets are not tradable (everything except the 7 Crypto rows). Of those 7, only `BTCUSD`, `ETHUSD` and `SOLUSD` are even named by E8 [SECONDARY]; the other four are NOT PUBLISHED.

### 3.5 Markets with no confirmed E8 route on any program line — 8 of 50

`BRENT`, `BZUSD`, `ZBUSD`, `ZNUSD`, `ADAUSD`, `BCHUSD`, `LTCUSD`, `XRPUSD`.

Brent is a firm NOT OFFERED on futures plus NOT PUBLISHED on the CFD side. The two Treasury rows are UNCONFIRMED on futures and rates aren't a Markets class. The four altcoins are NOT PUBLISHED on both sides. These 8 need a distinct UI state from "not on this program" — they are "no known route to this broker at all."

---

## 4. Open items

### 4.1 Dossier gaps, verbatim

Reproduced as the dossiers state them, because these are the facts the broker module cannot be built past.

- **In-platform ticker format**: "the exact E8-side string it must translate to/from could not be confirmed here"; "Exact in-platform order-entry ticker strings (vs. the E8X dashboard's display format) for every asset class" — NOT PUBLISHED. Called out by the dossier as "the single most consequential gap for building an automated symbol cross-map."
- **Energies**: "no symbol list, contract size, or leverage figure specific to energies (e.g., WTI/CL-equivalent CFD, Brent) was found published anywhere accessible without login."
- **Metals / Indices, partial**: the contract-size article "contained only 4 rows"; "Other indices (GER40/DAX, FTSE100, Nikkei, Australia 200/AUS200) are named as tradable ... but no contract size, tick value, or spread was found published for them individually — NOT PUBLISHED beyond the symbol existing."
- **Crypto**: "Contract size: NOT PUBLISHED for any crypto symbol"; "no exhaustive symbol list or exact tickers (e.g., whether it's 'BTCUSD' or 'BTC/USD' in-platform) was found published."
- **Metals/indices/crypto/energies tabs**: "the live E8X symbols dashboard only exposed the forex tab to an unauthenticated fetch; metals/indices/crypto/energies tabs require in-browser JS tab-clicking or login that could not be replicated here."
- **Forex pip value**: "E8 does not publish an explicit '$X per pip' number — only contract size and leverage are shown; pip value must be derived."
- **Margin, four futures symbols**: NOT PUBLISHED for `PA`, `7E`, `MCD`, `EMD`.
- **Full spec set** NOT PUBLISHED for `GF`, `MNG`, `ZT`, `ZF`, `ZN`, `ZB`, `UB`, `TN`, `ZQ`, and the unnamed "Micro Silver" row — "plus whether these are actually tradable at all is itself unconfirmed."

### 4.2 Contradictions carried forward, not resolved

- **`7E` vs `E7`** — three E8 pages say `7E`, one says `E7`. Dossier treats `7E` as canonical; both spellings recorded [PRIMARY both sides].
- **Natural Gas printed as `NQ`** — E8's tick-size article lists the Natural Gas row under symbol `NQ`, which is E-mini NASDAQ 100 in the same taxonomy; the fee article uses `NG` [PRIMARY both sides].
- **`/MHG` Micro Copper margin** — $10,000, identical to full-size `HG`, against a 1/10th pattern every other micro follows. Recorded verbatim as a likely page error, unconfirmed.
- **"Micro Silver" symbol cell is blank** in E8's own margin table.
- **Signature Futures contract limits** — a mini/micro allowance table (2/20, 4/40, 8/80, 12/120) exists [SECONDARY] while the primary contract-sizes article documents a Zero-style profit-triggered scaling model instead. "There's a real risk these two mechanics have been conflated by the aggregator site."
- **Program class coverage** — the Signature/One "Markets" row disagreement described in §3.

### 4.3 Where symbolMap's FMP convention and E8's published convention could disagree in ways that break sizing math

These are the ones that matter for the governor, ordered by how quietly they fail.

1. **Inverted FX futures quotes.** E8 names `6C` "Canadian $", `6S` "Swiss Franc", `6J` "Japanese Yen" — all foreign-currency-base contracts. Levelflow's matching rows are `USDCAD`, `USDCHF`, `USDJPY`, all USD-base. A long future is a short Levelflow pair. Any broker row that maps `USDJPY → 6J` without a direction flag inverts the trade.
2. **`6J` tick scale vs FMP price resolution.** E8 publishes `6J` tick size as **0.0000001** with $12.50 per tick [PRIMARY], a quote on the JPY-per-USD side carried to seven decimals. FMP's `USDJPY` price is the reciprocal at roughly three decimals. Sizing math that reads an FMP price and an E8 tick value without inverting *and* rescaling is wrong by orders of magnitude, silently. `6M` (0.00005) has the same shape against a Mexican peso quote Levelflow does not carry.
3. **Per-point vs per-pip vs per-tick, three different units in one map.** E8 Markets forex publishes contract size only (100,000) and no pip value. E8 Markets indices publish a *per-point multiplier* (US30=5, NAS100=5, SP500=20). E8 Futures publishes *tick size plus dollars per tick*. A single numeric "value" column cannot hold all three — SP500's 20 and MGC's $1.00 are not the same kind of number.
4. **E8's index CFD multipliers are non-standard.** The dossier flags SP500 at $20/point as "notably non-standard ... most retail CFD brokers quote SP500 at $1–$10/point," and US30/NAS100 at $5/point as "on the higher end." Levelflow's index rows source FMP *cash index levels* (`^GSPC`, `^NDX`, `^DJI`) — no contract, no multiplier, no parity with either the CFD or the future. Three price scales for one exposure. (Moot while Indices are no-trade; live again the moment the class reopens.)
5. **Same FMP symbol, two Levelflow rows, divergent tick handling.** `WTI` and `CLUSD` both resolve to FMP `CLUSD`; `BRENT` and `BZUSD` both resolve to `BZUSD`. Because `ASSET_TYPE_BY_SYMBOL` classifies `WTI`/`BRENT` as `energies`, `applyFuturesTickRules` is skipped for them and applied to `CLUSD`/`BZUSD` — the same price series gets tick-aligned under one Levelflow symbol and not under the other. A broker row keyed on the FMP symbol would collide; keyed on the Levelflow symbol it will not.
6. **ETF fallbacks are a fourth price scale.** `WTI` falls back to `USO`, `NSDQ` to `QQQ`, `ASX` to `EWA`, `DAX` to `DAX`. An ETF share price has no relationship to the contract's tick value. If a fallback is live, any sizing number derived from the primary symbol's scale is wrong.
7. **Treasury quote convention, unverifiable.** Levelflow encodes `ZBUSD` at 0.03125 (1/32) and `ZNUSD` at 0.015625 (1/64) — CME's fractional convention. E8 publishes no tick size for either, so the two rows in Levelflow's roster with the most unusual quote convention are exactly the two E8 documents least.
8. **XAUUSD's ticket cap is symbol-specific.** 20 lots for Gold vs 50 lots for everything else [PRIMARY]. A per-broker row carrying only a shared max-ticket value would over-permit gold by 2.5×.
9. **Session model divergence.** Levelflow's `CME_COMPLEX_CALENDAR` runs Sunday 18:00 ET open / Friday 17:00 ET close with a 17:00–18:00 ET daily break. E8 Futures publishes 17:00–15:10 CT with **all positions force-closed daily at 15:10 CT** [PRIMARY] — so Levelflow shows a futures market open through 16:00 CT while E8 is flattening. Levelflow's CBOT ags would need 19:00–13:20 CT, which the single calendar does not model. Levelflow's Crypto calendar is `alwaysOpen: true` while E8 Signature Crypto forces flat at 23:00 Server time nightly [PRIMARY]. And E8's "Server time" is UTC+2/UTC+3 on an EU-style DST calendar that does not shift on the same dates as US CT — the dossier's own gap list has "Exact CT-clock equivalent of the Daily Pause's '00:00 Server time' reset" as NOT PUBLISHED.
10. **Contract month is absent from Levelflow entirely.** E8 requires the front month and warns that trading another month "may also result in termination of your account or deduction of profit" [PRIMARY], with no fixed roll calendar published — only "trade whichever has the highest volume." E8 symbols are root+month+year (`MBTG6`). Levelflow's `ESUSD` names no month, and FMP's continuous series is not a tradable contract.

---

## 5. Three design implications for the broker-module schema

Each is drawn from a mismatch above, not from general principle.

### 5.1 The per-broker instrument row is keyed on `(broker, program_line, levelflow_symbol)` — never on the FMP symbol, and never on broker alone

Three findings force this. `WTI`/`CLUSD` and `BRENT`/`BZUSD` prove the FMP symbol is not unique across the roster, so it cannot be the key. The program lines prove one broker is not one universe: the same Levelflow symbol is tradable on E8 Signature Futures and untradable on E8 One (all 11 Futures rows), and `WTI`/`BRENT` are excluded by *class* from Pro and Zero while being merely unpublished elsewhere. And `GCUSD`/`MGCUSD`/`XAUUSD` prove one exposure maps to different instruments on different program lines at different contract sizes. A single `broker_instrument` table keyed on broker would collapse all three distinctions and produce a universe that is wrong on roughly 39 of 50 rows depending on which program the user bought.

The row therefore carries the program line as part of its identity, and the governor resolves the universe per account, not per broker.

### 5.2 Sizing needs a tagged unit, a direction flag, and a nullable value — not a numeric `pipValue`

The unit is genuinely polymorphic: `contract_size` in units (forex 100,000), `points_per_lot` (SP500=20, US30=5), `tick_size` + `value_per_tick` (ES 0.25/$12.50). One `pipValue: number` column cannot represent all three, and any code that reads it as one thing will be wrong for the other two. The row needs a discriminated `quote_unit` and the value fields that unit implies.

Direction is not optional. `USDJPY → 6J`, `USDCHF → 6S`, `USDCAD → 6C` are all sign-inverted, and `6J`'s tick is published three orders of magnitude finer than FMP's `USDJPY` resolution. A row without `inverted: boolean` and an explicit price-scale factor will place backwards trades that still pass every arithmetic check.

Nullability is a feature. Contract size is NOT PUBLISHED for every crypto symbol, for silver on the Markets side, for every index except three, and for the entire energies class; tick size is NOT PUBLISHED for `ZB`/`ZN`; margin is NOT PUBLISHED for `PA`/`7E`/`MCD`/`EMD`. A schema with `NOT NULL` sizing columns can only be satisfied by inventing numbers. The field must be nullable, and null must block sizing rather than default to a plausible value — the dossiers name 8 markets with no confirmed route and 11 futures symbols with no publishable specs, and silently defaulting any of them is how a governor takes a position it cannot size.

### 5.3 Every row carries provenance and a tradability state richer than a boolean

`ZBUSD` and `ZNUSD` are the proof. They are in Levelflow's roster today, they have an E8 symbol, they have a published margin, and their tradability is explicitly unconfirmed — "treat as NOT reliably tradable pending direct confirmation from E8 support." A boolean `tradable` field has no correct value for those two rows. Neither does it for `XAGUSD` on the Markets side, where E8's silence is a documentation gap rather than a refusal, nor for the four altcoins, nor for the seven unspecced rate contracts.

The state needs at least: `confirmed` · `not_offered` · `not_published` · `unconfirmed`, and the UI copy differs per state — "not tradable on this broker program" is a claim E8 supports for the 39 rows in §3.1; it is a claim E8 does not support for `XAGUSD`, where the honest sentence is "not confirmed on this program."

Provenance travels with the value, not with the table. `ES` at 0.25/$12.50 is [PRIMARY]; the indices $12/lot Dow commission is [SECONDARY]; the Signature mini/micro contract table is [SECONDARY] and may be a conflation of two different mechanics. Same schema, three confidence levels — and a per-value `source_tag` plus `source_url` is what lets a later reviewer re-verify one number without re-deriving the whole map. The `7E`/`E7` and `NG`/`NQ` collisions add the corollary: the row needs room for a second observed spelling, because E8's own pages do not agree with each other and the cross-map has to survive that without picking a winner silently.
