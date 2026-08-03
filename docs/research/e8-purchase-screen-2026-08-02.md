# E8 purchase-screen parameters — 2026-08-02 (owner, e8x.e8markets.com checkout, live walk)

Provenance: `verified` (owner-supplied purchase-screen observation per amendment 10's
input contract). Market: **Forex**, balance **$100,000**, eleven screenshots walking the
checkout's customization matrix across E8 One, E8 Pro, and E8 Signature. Dollar figures
on the summary are percentages of the selected tier (basis: initial balance), so the
percentages are the invariant; enrollment prices are $100K-tier prices.

## Programs offered in the Forex market flow
E8 One (1 step) · E8 Pro (1 step – Static Drawdown) · E8 Signature (1 step) · E8 Trial.
**No E8 Zero** (futures-only, consistent with the dossiers). Platforms: E8 One offers
**MatchTrader and TradeLocker**; E8 Pro and E8 Signature offer **TradeLocker only**.
Leverage shows **1:30** for Forex on every program. Every line offers the trading-
conditions choice **No Commissions | Raw Spreads** (all observations below taken with
Raw Spreads selected). Swap-free account: +10% on final price, any line.

## E8 One — the coupled customization matrix ($100K, Raw Spreads, payout 80%)
Balances offered: $5K / $10K / $25K / $50K / $100K / $200K / $400K / $500K (8 tiers).
Payout options: 80% / 90% / 100%. Dynamic Drawdown options: 4/6/8/10/14%.
**Choosing the dynamic drawdown moves the daily drawdown AND the profit target
together** — one selection, three coupled values:

| Dynamic DD | Daily DD | Profit Target | Price ($100K) |
|---|---|---|---|
| 4% ($4,000) | 3.0% ($3,000) | 6% ($6,000) | $398 |
| 6% ($6,000) — default | 4.0% ($4,000) | 9% ($9,000) | $488 |
| 8% ($8,000) | 5.3% ($5,300) | 12% ($12,000) | $586 |
| 10% ($10,000) | 6.6% ($6,600) | 15% ($15,000) | $684 |
| 14% ($14,000) | 9.2% ($9,200) | 21% ($21,000) | $879 |

Target = 1.5 × dynamic exactly, every row. Daily is NOT a clean ratio (0.75, 0.667,
0.6625, 0.66, 0.657 × dynamic) — the pairs are literal E8 values, not derivable.
**This empirically validates the `broker_drawdown_tier` one-token schema**: the tier
must be stored as the selected pair, because two independently chosen numbers could
encode a configuration E8 does not sell.

## E8 Pro — static drawdown matrix ($100K, Raw Spreads, payout 80%)
Balances: same 8 tiers as One. Payout options: **80% / 100% only** (no 90%).
Static Drawdown options: 6/8/10%. **Daily drawdown is FIXED at 2.5% ($2,500) and the
Daily Profit Cap is FIXED at 2% ($2,000) regardless of static choice**; the profit
target equals the static drawdown:

| Static DD | Daily DD | Daily Profit Cap | Profit Target | Price ($100K) |
|---|---|---|---|---|
| 6% ($6,000) | 2.5% ($2,500) | 2% ($2,000) | 6% ($6,000) | $468 |
| 8% ($8,000) — default | 2.5% ($2,500) | 2% ($2,000) | 8% ($8,000) | $488 |
| 10% ($10,000) | 2.5% ($2,500) | 2% ($2,000) | 10% ($10,000) | $538 |

The on-screen Daily Profit Cap 2% confirms the claw-back rule's number (15319043) at
the point of sale.

## E8 Signature — no drawdown customization ($100K)
Balances: **$25K / $50K / $100K / $150K** (4 tiers, matches the published ladder).
Modifiers: trading conditions only — no drawdown or payout choices. Summary: **EOD
Drawdown 3% ($3,000)** · Payout 80% · Profit Target 6% ($6,000) · **$260**.
**Cross-check**: $3,000 at $100K matches the owner's canonical EOD Dynamic table
($1,000/25K · $2,000/50K · $3,000/100K · $4,500/150K) exactly — the purchase screen
corroborates the 4/4/3/3 tiering at its third row.

## Consequences
1. Amendment 10's input contract is FULFILLED for the Forex market's three lines:
   the tier matrices above enter the §20 rulebook as `verified`.
2. The One-line coupling (dynamic→daily→target) and the Pro-line constants are the
   rulebook's authoritative shapes; `broker_drawdown_tier` holds the pair token.
3. Platform availability differs per line (One: MatchTrader+TradeLocker; Pro/
   Signature: TradeLocker only) — a program-facts detail.
4. Unobserved remainder: per-tier prices beyond $100K (percentages are the invariant;
   prices matter only to the breach-cost model), the Crypto-market flow's matrices,
   and E8 Trial's shape.
