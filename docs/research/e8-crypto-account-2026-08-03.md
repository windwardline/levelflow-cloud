# E8 One Crypto — the live account record (2026-08-03)

Owner-supplied primary evidence: five screenshots taken 2026-08-03,
2:58–2:59 PM ET, minutes after purchasing a live E8 Crypto account (the
cheapest configuration on offer; the checkout sells many). One frame of the
E8X dashboard (e8x.e8markets.com, Account Overview), four frames of the
TradeLocker instrument list scrolled top to bottom. Under amendment 19
these screenshots are the single source of truth for what this account
class offers; this file is their transcription of record.

## 1. The account, identified

**E8 One Crypto · $5,000 · default modifiers — the catalog's `one_crypto`
line, "4-6" drawdown tier.** Every dashboard figure matches the purchase
record's C1 default (6% dynamic / 4% daily / 9% target) applied to the
$5K rung of `ONE_LADDER`:

| Dashboard fact | Value | Catalog expectation | Verdict |
|---|---|---|---|
| Initial balance | $5,000 | `ONE_LADDER[0]` = 5,000 | match |
| Profit target | $450 | 9% (C1 default) | match |
| Dynamic Drawdown | $300, loss level $4,700 | 6% (C1 default) | match |
| Daily Drawdown | $200, loss level $4,800, entry $5,000 | 4% (C1 default) | match |
| Dynamic mechanism | trails **Highest Closed Balance** ($5,000 → $4,700) | E8 One = closed-profit trailing (§20i ruling of record) | match |
| Minimum trading days | 1 | One-line minimum | match |
| Daily reset | "2h:1m" at 2:58 PM ET → ~5:00 PM ET | — | recorded |

No divergence anywhere. The purchased structure confirms the recorded
catalog rather than amending it.

## 2. The tradeable markets — 33 instruments, one list

TradeLocker presents the eight majors pinned first, then the remainder
alphabetically. Union of the four frames (frames 4 and 5 overlap by seven
rows; deduplicated by symbol):

**Majors block (as listed):**

| Symbol | Bid | Ask | Spread | Leverage |
|---|---|---|---|---|
| ADAUSD | 0.19399 | 0.19421 | 22 | 2 |
| BCHUSD | 212.82 | 213.43 | 61 | 2 |
| BNBUSD | 591.95 | 591.98 | 3 | 2 |
| BTCUSD | 63,839.50 | 63,841.74 | 224 | **5** |
| ETHUSD | 1,868.10 | 1,868.68 | 58 | **5** |
| LTCUSD | 44.12 | 44.27 | 15 | 2 |
| SOLUSD | 73.93 | 73.96 | 3 | 2 |
| XRPUSD | 1.08159 | 1.08171 | 12 | 2 |

**Alphabetical remainder:**

| Symbol | Bid | Ask | Spread | Leverage |
|---|---|---|---|---|
| AAVEUSD | 92.91 | 92.92 | 1 | 2 |
| ALGOUSD | 0.0923 | 0.0926 | 3 | 2 |
| ARWUSD | 1.836 | 1.838 | 2 | 2 |
| ATOMUSD | 1.339 | 1.352 | 13 | 2 |
| AVAXUSD | 6.560 | 6.580 | 20 | 2 |
| CAKEUSD | 1.4380 | 1.4386 | 6 | 2 |
| DASHUSD | 31.419 | 31.431 | 12 | 2 |
| DOGEUSD | 0.07041 | 0.07045 | 4 | 2 |
| DOTUSD | 0.829 | 0.833 | 4 | 2 |
| DYDXUSD | 0.112 | 0.113 | 1 | 2 |
| EGLDUSD | 2.720 | 2.730 | 10 | 2 |
| ETCUSD | 6.614 | 6.619 | 5 | 2 |
| FILUSD | 0.716 | 0.736 | 20 | 2 |
| GRTUSD | 0.01471 | 0.01472 | 1 | 2 |
| HBARUSD | 0.07060 | 0.07063 | 3 | 2 |
| IMXUSD | 0.1116 | 0.1117 | 1 | 2 |
| LINKUSD | 8.232 | 8.234 | 2 | 2 |
| NEARUSD | 1.743 | 1.750 | 7 | 2 |
| THETAUSD | 0.127 | 0.128 | 1 | 2 |
| TRUMPUSD | 1.50 | 1.50 | 0 | 2 |
| TRXUSD | 0.32843 | 0.32921 | 78 | 2 |
| UNIUSD | 3.897 | 3.898 | 1 | 2 |
| XLMUSD | 0.17159 | 0.17162 | 3 | 2 |
| XMRUSD | 363.151 | 363.171 | 20 | 2 |
| XTZUSD | 0.205 | 0.207 | 2 | 2 |

**Leverage map, live-confirmed.** BTC and ETH carry 1:5; all 31 others
carry 1:2 — exactly `CRYPTO_LINE_LEVERAGE` (bitcoin 5, ethereum 5,
other_crypto 2), which until this record rested on the leverage article
alone. This is the first observation from an actual Crypto-classification
account.

**Notables for the source-resolution work (recorded, not resolved here):**

- **RESOLVED 2026-08-05**: every instrument in this table beyond
  Levelflow's existing 8 has been matched against FMP with per-symbol
  name-and-price evidence (zero excluded under amendment 20) — see
  `docs/research/e8-crypto-source-resolution-2026-08-05.md`.
- `ARWUSD` is TradeLocker's ticker for what most venues call AR (Arweave).
- `TRUMPUSD` and `CAKEUSD`, `DYDXUSD`, `IMXUSD`, `GRTUSD`, `EGLDUSD`,
  `XMRUSD` are outside Levelflow's current crypto universe; whether FMP
  carries each is a per-symbol best-match resolution question for the
  crypto onboarding, under the A16 pattern (source match → fresh sweep →
  inclusion verdict).
- `BNBUSD` is definitively SOLD on the Crypto account. The A16 BNB
  question for FOREX-carried crypto remains its own question; this record
  answers the Crypto-classification side only.
- Spreads are a point-in-time sample (2:59 PM ET, Monday), not a cost
  model.

## 3. Feed identity — the F8 frame (PASS)

Recorded in full in `docs/research/e8-feed-verification-2026-08-02.md`
(F8). Summary: four TradeLocker frames of ADAUSD·1h at 2:59:26–2:59:43 PM
UTC-4, candle countdowns 00:33/00:27/00:20/00:16 — each pair sums to the
top of the hour, so the platform clock corroborates. E8 bids
0.19399→0.19409 sit inside FMP's 14:59 ET 1-min bar [0.1938, 0.1941];
FMP's close 0.1941 lands within half the displayed 22-point spread of E8's
ask 0.19421; FMP's live quote 0.19400 (19:03:06 UTC) brackets the frames'
bids. Day high, as corroboration only (never a pass criterion): E8
0.19619 vs FMP 0.1961 — 0.005%, well inside the crypto class's ≤0.1% bar.
**FMP's crypto path is the same market E8's Crypto account plots.**

## 4. What this record feeds

- The §19 retrofit's catalog build: `one_crypto`'s purchasable structure
  is now live-confirmed end to end (ladder rung, default tier, target,
  both drawdowns, the closed-profit trailing mechanic).
- The crypto onboarding (post-retrofit, per the sequence): the 33-symbol
  visibility set for active Crypto accounts, pending per-symbol FMP
  best-match resolution and the fresh replay sweep A16 requires before
  any inclusion verdict.
- §20 governor inputs: daily reset ~5:00 PM ET observed; loss levels
  render exactly as the dashboard states them.
