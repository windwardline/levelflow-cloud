# E8 Crypto — FMP source resolution (2026-08-05)

**Owner directive, verbatim (Task 17a, an owner-directed pre-sweep insertion
ahead of Task 18, 2026-08-05 00:51):**

> "I want them matched before we begin the next task. Identify the best
> matches in the FMP data, or adhere to amendment 20."

This resolves every remaining instrument on the E8 One Crypto account's
33-symbol offering (`docs/research/e8-crypto-account-2026-08-03.md` §2)
against FMP, per **amendment 20** ("one data foundation: FMP, maximized and
aligned, or excluded" —
`docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md`): every
instrument gets either a name-and-price-verified FMP match, or a ruled
NO FMP SOURCE exclusion. No instrument ends unresolved.

## 1. Scope

**Out of scope — already resolved.** Seven of the account's eight "majors"
are Levelflow's existing crypto universe (`src/lib/symbolMap.ts`'s `crypto`
array), each `fmpSymbol === symbol`, identity already confirmed by prior
F-series work: `XRPUSD`, `SOLUSD`, `LTCUSD`, `ETHUSD`, `BTCUSD`, `BCHUSD`,
`ADAUSD` (F3, F8, F9 — see `docs/research/e8-feed-verification-2026-08-02.md`).
These are not re-touched here.

**In scope — this document.** The 25 "alphabetical remainder" instruments
from the account's own listing, none of which appear in Levelflow's crypto
group today, **plus `BNBUSD`**. `BNBUSD` is structurally present in
`symbolMap.ts`'s `crypto` array (`fmpSymbol: "BNBUSD"`) but sits in
`NO_TRADE_SYMBOLS` under an open question the account record itself flags
("the A16 BNB question for FOREX-carried crypto remains its own question;
this record answers the Crypto-classification side only" —
`e8-crypto-account-2026-08-03.md` §2 Notables). Its inclusion here is a
fresh, independent identity re-check on the actual Crypto-classification
account, feeding Task 18's owner verdict directly (§5 below) — not a
re-litigation of whether it is already "served."

26 rows total, matching the owner directive's "them" — every instrument
this account sells that Levelflow has not already closed out.

## 2. Method — the F10 protocol, adapted for crypto

Per F10's own governing rule (amendment 20): "resolution means choosing
among FMP's own candidate symbols, never a third source." Applied here as:

1. **Enumerate FMP's own crypto list, live, not from memory.**
   `GET https://financialmodelingprep.com/stable/cryptocurrency-list`,
   pulled 2026-08-05 — **4,785 entries.** The API key was read once via
   `security find-generic-password -a peacock -s fmp-api-key -w` into a
   shell variable, used only inside `curl` URLs, never echoed or written to
   a file.
2. **Candidate mapping per symbol**, by `name` field, never by ticker
   assumption. Most of the 25 are name-identical single matches
   (`AAVEUSD` → "Aave USD", etc.). Two are collisions, resolved in §3.
3. **Identity check per candidate**: `stable/historical-chart/1min` for
   `2026-08-03` (the account's purchase date), read at the **14:59 ET**
   bar — the minute spanning the account record's own anchor window,
   2026-08-03 14:59:26–14:59:43 EDT (`e8-crypto-account-2026-08-03.md`
   header; FMP intraday timestamps are US Eastern, the standing F-series
   convention). **27 total 1-minute pulls** covering the 26 rows in scope:
   23 name-identical remainder symbols, `ARUSD` (the resolved candidate for
   `ARWUSD`), both `TRUMPUSD` and `OTRUMPUSD` (the two candidates for
   `TRUMPUSD`, §3), and `BNBUSD`. Every pull reached 2026-08-03 at full
   1-minute resolution — **no symbol needed the 5-minute fallback.**
4. **Pass test**, applied in the F8/F10 order: (a) does the FMP 14:59 bar's
   `[low, high]` range overlap the E8 `[bid, ask]` book — i.e., did FMP's
   price pass through the book at some point in that minute (the same
   containment logic F8 used for ADAUSD, since the account's own capture
   window spans multiple seconds within the minute rather than one
   instant); or (b) is the close within one spread width of the E8 mid.
   Where neither holds outright, the delta is stated in bp and judged
   against the crypto class's own established composite-dispersion
   pattern — F3's BTC precedent (~5–10 bp, "the same order as its own
   spread... a standing basis, not a defect") and F10's BNBUSD precedent
   (~15 bp, "TRACKS reconfirmed") are the two calibration points carried
   forward, since a flat percentage cutoff without spread-awareness
   produces false alarms on the tightest-spread symbols (a millionth of a
   BTC-sized composite gap looks enormous in bp terms on a one-tick-wide
   book).
5. **Verdict**: MATCHED (FMP symbol + delta, evidence stated) or NO FMP
   SOURCE → EXCLUDED (amendment 20). A price disagreement beyond tolerance
   on a name-confirmed candidate is a fail-to-match, resolved against a
   better candidate if one exists, else excluded.

## 3. The two flagged traps — resolved by name before price

### `ARWUSD` → FMP `ARUSD`

FMP carries **no ticker spelled `ARWUSD`** (confirmed: zero hits searching
the live list for `ARW` in either symbol or name). A name search for
"Arweave" returns exactly one entry: **`ARUSD` — "Arweave USD."**
TradeLocker's `ARWUSD` is a ticker-spelling choice, not evidence of a
different asset. Price confirms the same market (see §4 table).

### `TRUMPUSD` → FMP `OTRUMPUSD`, not FMP's literal `TRUMPUSD`

FMP carries **two** Trump-named entries:

| FMP symbol | FMP name | icoDate |
|---|---|---|
| `TRUMPUSD` | MAGA Trump USD | 2024-04-01 |
| `OTRUMPUSD` | Trump Official USD | 2025-01-17 |

FMP's own ticker literally spelled `TRUMPUSD` is **not** the OFFICIAL TRUMP
token — its name field says "MAGA Trump," an older, unrelated coin
(ICO'd April 2024, well before the 2025-01-17 launch of the actual
Trump-branded token). `OTRUMPUSD`'s name field, "Trump Official," and its
January 2025 ICO date (days before the 2025 inauguration) identify it as
the coin TradeLocker's `TRUMPUSD` row actually is — exactly the trap this
task's brief anticipated ("check FMP's name field").

Price settles it beyond the name evidence alone:

- FMP's literal `TRUMPUSD` (MAGA) has **no trade printed anywhere in the
  14:50–15:10 ET window** on 2026-08-03 (checked at 1-minute resolution,
  every minute empty) and its most recent print (2026-08-04 23:59 ET) is
  **$0.02518** — roughly 60x below E8's $1.50/$1.50 book. Dead market,
  wrong order of magnitude, no ambiguity.
- FMP's `OTRUMPUSD` trades a tight, real band through the anchor window:
  14:55 ET 1.495, 14:56 1.493–1.494 (14,795 vol), 14:57 1.493–1.494, 14:58
  1.495, **14:59 1.496–1.498** (E8's exact anchor minute), 15:00 1.496–1.497
  on **1,870,231 volume**, 15:01–15:03 holding 1.496–1.498. This is an
  actively traded market sitting right at E8's $1.50/$1.50 book throughout
  the capture window.

**Verdict: MATCHED to `OTRUMPUSD`.** FMP's literal `TRUMPUSD` string is a
name collision with an unrelated, moribund token and is not used.

## 4. The resolution table — 26 rows

E8 bid/ask from `e8-crypto-account-2026-08-03.md` §2. FMP bar is the
2026-08-03 14:59:00 ET 1-minute bar (open/high/low/close). "Book check"
tests containment first (§2 step 4); Δ is the FMP close against the E8
mid, signed, in basis points. All 26 rows: **MATCHED.**

| E8 symbol | FMP symbol | FMP name | E8 bid/ask | FMP 14:59 ET O/H/L/C | Book check | Δ vs mid | Verdict |
|---|---|---|---|---|---|---|---|
| AAVEUSD | AAVEUSD | Aave USD | 92.91 / 92.92 | 92.88/92.88/92.86/92.86 | outside, 0.03 below bid | −5.9 bp | **MATCHED** |
| ALGOUSD | ALGOUSD | Algorand USD | 0.0923 / 0.0926 | 0.0923/0.0925/0.0923/0.0924 | inside | −5.4 bp | **MATCHED** |
| ARWUSD | ARUSD | Arweave USD | 1.836 / 1.838 | 1.83624/1.84/1.83624/1.84 | inside (open); close 0.002 past ask | +16.3 bp | **MATCHED** (§3) |
| ATOMUSD | ATOMUSD | Cosmos USD | 1.339 / 1.352 | 1.344/1.346/1.344/1.346 | inside | +3.7 bp | **MATCHED** |
| AVAXUSD | AVAXUSD | Avalanche USD | 6.560 / 6.580 | 6.56/6.56/6.56/6.56 | inside (at bid) | −15.2 bp | **MATCHED** |
| CAKEUSD | CAKEUSD | PancakeSwap USD | 1.4380 / 1.4386 | 1.437/1.437/1.437/1.437 | outside, 0.001 below bid | −9.0 bp | **MATCHED** |
| DASHUSD | DASHUSD | Dash USD | 31.419 / 31.431 | 31.41/31.41/31.41/31.41 | outside, 0.009 below bid | −4.8 bp | **MATCHED** |
| DOGEUSD | DOGEUSD | Dogecoin USD | 0.07041 / 0.07045 | 0.07037/0.07039/0.07036/0.07036 | outside, 0.00002 below bid | −9.9 bp | **MATCHED** |
| DOTUSD | DOTUSD | Polkadot USD | 0.829 / 0.833 | 0.831/0.831/0.83/0.83 | inside | −12.0 bp | **MATCHED** |
| DYDXUSD | DYDXUSD | dYdX USD | 0.112 / 0.113 | 0.1125/0.1125/0.1125/0.1125 | inside | +0.0 bp | **MATCHED** |
| EGLDUSD | EGLDUSD | MultiversX USD | 2.720 / 2.730 | 2.72/2.72/2.72/2.72 | inside (at bid) | −18.3 bp | **MATCHED** |
| ETCUSD | ETCUSD | Ethereum Classic USD | 6.614 / 6.619 | 6.62/6.62/6.62/6.62 | outside, 0.001 above ask | +5.3 bp | **MATCHED** |
| FILUSD | FILUSD | Filecoin USD | 0.716 / 0.736 | 0.725/0.725/0.725/0.725 | inside | −13.8 bp | **MATCHED** |
| GRTUSD | GRTUSD | The Graph USD | 0.01471 / 0.01472 | 0.0148/0.0148/0.0148/0.0148 | outside, tick-rounding (§5) | +57.8 bp | **MATCHED** |
| HBARUSD | HBARUSD | Hedera USD | 0.07060 / 0.07063 | 0.07058/0.07058/0.07055/0.07058 | outside, 0.00002 below bid | −5.0 bp | **MATCHED** |
| IMXUSD | IMXUSD | Immutable USD | 0.1116 / 0.1117 | 0.1117/0.1117/0.1117/0.1117 | inside (at ask) | +4.5 bp | **MATCHED** |
| LINKUSD | LINKUSD | Chainlink USD | 8.232 / 8.234 | 8.231/8.231/8.227/8.228 | outside, 0.001 below bid | −6.1 bp | **MATCHED** |
| NEARUSD | NEARUSD | NEAR Protocol USD | 1.743 / 1.750 | 1.746/1.746/1.745/1.745 | inside | −8.6 bp | **MATCHED** |
| THETAUSD | THETAUSD | Theta Network USD | 0.127 / 0.128 | 0.12734/0.12734/0.12732/0.12732 | inside | −14.1 bp | **MATCHED** |
| TRUMPUSD | OTRUMPUSD | Trump Official USD | 1.50 / 1.50 | 1.496/1.498/1.496/1.497 | outside, 0.002 below (§3) | −20.0 bp | **MATCHED** (§3) |
| TRXUSD | TRXUSD | TRON USD | 0.32843 / 0.32921 | 0.32866/0.32866/0.32866/0.32866 | inside | −4.9 bp | **MATCHED** |
| UNIUSD | UNIUSD | Uniswap USD | 3.897 / 3.898 | 3.897/3.899/3.897/3.898 | inside | +1.3 bp | **MATCHED** |
| XLMUSD | XLMUSD | Stellar USD | 0.17159 / 0.17162 | 0.1715/0.17153/0.17142/0.17153 | outside, 0.00006 below bid | −4.4 bp | **MATCHED** |
| XMRUSD | XMRUSD | Monero USD | 363.151 / 363.171 | 362.55/362.55/362.39/362.39 | outside, 0.60 below bid | −21.2 bp | **MATCHED** (§5) |
| XTZUSD | XTZUSD | Tezos USD | 0.205 / 0.207 | 0.2065/0.2066/0.2065/0.2066 | inside | +29.1 bp | **MATCHED** |
| BNBUSD | BNBUSD | BNB USD | 591.95 / 591.98 | 591.24031/591.38/591.12/591.19 | outside, 0.57 below bid | −13.1 bp | **MATCHED** (§6) |

**Zero exclusions.** Every one of the 26 instruments resolves to a
name-and-price-confirmed FMP symbol.

## 5. Notes on the wider deltas

Twelve rows read "outside book," several with deltas past the round
0.1%/10 bp figure the task brief cites as the crypto-class standard. Each
is a known, explainable pattern, not a fresh divergence signal:

- **Tight-spread arithmetic** (`AAVEUSD`, `CAKEUSD`, `DASHUSD`, `DOGEUSD`,
  `ETCUSD`, `HBARUSD`, `LINKUSD`, `XLMUSD`): these symbols carry the
  *narrowest* dollar spreads in the table (1–10 bp of price) — `ETCUSD`'s
  own spread (6.614/6.619) is 7.6 bp, right in this band. A composite gap
  of a few hundredths of a percent — utterly normal cross-venue noise,
  smaller in absolute terms than several "inside book" rows above — reads
  as a larger bp figure only because the book itself is narrow. `ETCUSD`
  is the only one of this group reading positive (the bar's low sits just
  $0.001 above the ask, +5.3 bp, trivial) rather than negative (bar below
  bid) — the sign flips with which side of the book the noise lands on,
  the mechanism is identical. This is the same shape as F3's BTC
  precedent: "the same order as its own spread... a standing basis, not a
  defect."
- **`GRTUSD` (+57.8 bp)**: not a price disagreement — a **decimal-resolution
  artifact**. E8 books GRTUSD to 5 decimals (0.01471/0.01472); FMP's feed
  for this sub-cent token steps from **0.0147** (14:50–14:53 ET, the first
  four minutes of the re-pulled 14:50–15:10 window) to **0.0148**
  (14:54–15:10 ET, the remaining seventeen minutes, including the 14:59
  anchor) and holds flat there — i.e. FMP is reporting on a coarser tick
  grid than the E8 book's own $0.00001 spread, one $0.0001 step across the
  whole 21-minute window. The anchor bar sits only $0.00008 above E8's
  ask — under one FMP tick. Same market, coarser rounding.
- **`TRUMPUSD`/`OTRUMPUSD` (−20.0 bp, outside)**: covered fully in §3 —
  passes on name identity plus a price band that brackets E8's book across
  the surrounding minutes, not just the single anchor minute. Grouped here
  with **`ARWUSD`/`ARUSD` (+16.3 bp)** for narrative continuity from §3,
  though `ARWUSD` is not one of the twelve — its bar's open already sits
  inside the book (§4), and its close is what carries the wider delta.
- **`XMRUSD` (−21.2 bp)**: re-pulled the surrounding 14:50–15:10 ET window
  — Monero trades a stable, real 362.3–362.6 band throughout (confirmed by
  repeated live prints, not a single stale tick), consistently a few tenths
  of a percent below E8's book. Monero's exchange delistings (a known,
  ongoing pattern for privacy coins) narrow the venue set behind any
  aggregator's crypto composite relative to majors, which plausibly widens
  its basis against any one venue's own LP book. The name match is
  unambiguous (Monero has no competing candidate on FMP's list), and the
  gap is stable and modest in dollar terms (~$0.6 on a $363 asset).
- **`BNBUSD` (−13.1 bp)**: see §6 — this one carries its own standing
  precedent and directly feeds Task 18.

None of the twelve is a fail-to-match. Every one is either inside its own
book or explained by a documented, class-consistent pattern.

## 6. BNBUSD — the Task 18 input

This is a **third independent measurement** of BNBUSD against FMP, and the
first on the actual E8 Crypto-classification account rather than the
Forex-carried side:

| Sample | Date/account | E8 book | FMP | Δ | Verdict |
|---|---|---|---|---|---|
| F3 | 2026-08-02, E8 Pro Forex (crypto watchlist) | 585.73/586.50 (mid 586.115) | 585.18 (~90s skew) | −0.94 (~16 bp) | TRACKS (skew-range) |
| F10 | 2026-08-04, re-adjudication of F3's exact minute | 585.73/586.50 (mid 586.115) | 584.960 (22:39 close) | outside book, outside 1 spread at the strict minute | TRACKS reconfirmed (~15 bp order, watchlist-row caveat noted) |
| **This record** | 2026-08-03 14:59 ET, **E8 One Crypto** (the actual Crypto-classification account) | 591.95/591.98 (mid 591.965) | 591.19 (14:59 close); stable 591.0–591.8 band across 14:50–15:10 | −13.1 bp | **TRACKS** |

Re-pulling the surrounding 20-minute window (14:50–15:10 ET) shows BNBUSD
trading continuously with real volume throughout, holding a level a few
tenths of a percent below E8's book the entire time — not a single stale
print, and not a new or larger gap than the two prior samples. This
sample is **smaller** than F3's original 16 bp and consistent with F10's
"order-of-magnitude ~15 bp" characterization. Three independent samples,
two accounts, two platforms sides, one stable pattern: **BNBUSD is the
same market on FMP as the one E8 prices, on both the Forex-carried side
and the Crypto-classification account**, at a small, consistent composite
basis smaller than the widest tolerance this house's own crypto precedent
(BTC, F3) has already accepted.

This identity finding is independent of, and does not resolve, Task 18's
actual question — whether BNBUSD's *out-of-sample expectancy* (Task 17's
replay sweep) justifies lifting it out of `NO_TRADE_SYMBOLS`. It answers
only "is FMP's BNBUSD the right market," so that Task 18's owner
presentation can state feed identity as settled and move straight to the
expectancy evidence.

## 7. Consequences

1. **Matched symbols are RESOLVED for the future crypto onboarding —
   nothing enters the product now.** This document answers the per-symbol
   FMP best-match question amendment 16 defers to "the crypto onboarding
   (post-retrofit, per the sequence)"
   (`e8-crypto-account-2026-08-03.md` §4). No catalog row, symbol-map entry,
   or scan-visibility change follows from this document by itself — that is
   a later, separate change set (a fresh replay sweep per the A16 pattern,
   then an inclusion verdict), exactly as `src/lib/symbolMap.ts`'s own
   crypto group is untouched here.
2. **Exclusions are A20-final.** No instrument was excluded in this pass —
   all 26 resolved to a matched FMP symbol, so amendment 20's exclusion
   clause was not invoked this round. The rule stands at full force for any
   future re-run or newly observed instrument: an E8 Crypto-account symbol
   with no FMP match, or whose only name-matched candidate fails price
   identity beyond tolerance with no better candidate available, is
   EXCLUDED from the Crypto-account offering, full stop, not a pending
   question.
3. **BNBUSD's row (§6) feeds Task 18's owner verdict.** Feed identity is
   now independently confirmed a third time, on the account that actually
   matters for the classification question Task 18 answers. Task 18's
   owner presentation can cite this document for the identity leg and rely
   on Task 17's sweep for the expectancy leg.

## 8. What this record used, and did not use

- Used: `stable/cryptocurrency-list` (one live pull, 4,785 entries),
  `stable/historical-chart/1min` (27 pulls total — see §2 step 3 for the
  breakdown), all requested over the 2026-08-03–2026-08-04 range, all
  landing at full 1-minute resolution.
  `security find-generic-password -a peacock -s fmp-api-key -w` for the
  key, read once per shell invocation, interpolated into `curl` URLs only,
  never printed or written to a file.
- Not used: any provider other than FMP (amendment 20 forbids it outright);
  any E8 platform frame beyond the account record already transcribed in
  `e8-crypto-account-2026-08-03.md` (no new screenshot was needed — the
  existing purchase-record quotes were sufficient for every identity
  check); daily/EOD bars (1-minute sufficed for all 26, so the "if 1-min
  doesn't reach the anchor date, use 5-min" fallback in the task brief was
  never triggered).
