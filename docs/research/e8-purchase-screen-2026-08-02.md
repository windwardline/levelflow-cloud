# E8 purchase-screen parameters — 2026-08-02 (owner, e8x.e8markets.com checkout, live walks)

Provenance: `verified` (owner-supplied purchase-screen observation per amendment 10's
input contract). Three walks at balance **$100,000**: the **Forex market (thirteen
frames)**, the **Crypto market (eleven frames)**, and the **Futures market (five
frames)** — twenty-nine frames total. Dollar figures on the order summary are
percentages of the selected tier (basis: initial balance), so the percentages are the
invariant; enrollment prices shown are $100K-tier prices. Frame inventories close each
market's section.

---

## THE FOREX MARKET WALK (thirteen frames)

### Programs and platforms
E8 One (1 step) · E8 Pro (1 step – Static Drawdown) · E8 Signature (1 step) ·
**E8 Trial**. No E8 Zero (futures-only). Platforms: **E8 One offers MatchTrader AND
TradeLocker**; E8 Pro and E8 Signature offer TradeLocker only. **Leverage 1:30** on
every forex program. The forex checkout runs five steps, and the Additional-modifiers
step carries the trading-conditions choice **No Commissions | Raw Spreads** on every
line (all matrix readings below with Raw Spreads). Swap-free account: +10% on final
price, any line. A "Customize account more" button accompanies NEXT STEP on the
Set-account step.

### E8 One — the coupled customization matrix ($100K, Raw Spreads, payout 80%)
Balances: $5K / $10K / $25K / $50K / $100K / $200K / $400K / $500K (8 tiers).
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

### E8 Pro — static drawdown matrix ($100K, Raw Spreads, payout 80%)
Balances: same 8 tiers. Payout options: **80% / 100% only** (no 90%).
Static Drawdown options: 6/8/10%. **Daily drawdown FIXED at 2.5% ($2,500) and Daily
Profit Cap FIXED at 2% ($2,000) regardless of static choice**; profit target equals
the static drawdown:

| Static DD | Daily DD | Daily Profit Cap | Profit Target | Price ($100K) |
|---|---|---|---|---|
| 6% ($6,000) | 2.5% ($2,500) | 2% ($2,000) | 6% ($6,000) | $468 |
| 8% ($8,000) — default | 2.5% ($2,500) | 2% ($2,000) | 8% ($8,000) | $488 |
| 10% ($10,000) | 2.5% ($2,500) | 2% ($2,000) | 10% ($10,000) | $538 |

The on-screen Daily Profit Cap 2% confirms the claw-back rule's number (15319043) at
the point of sale.

### E8 Signature — no drawdown customization ($100K)
Balances: **$25K / $50K / $100K / $150K** (4 tiers). Modifiers: trading conditions
only. Summary: **EOD Drawdown 3% ($3,000)** · Payout 80% · Profit Target 6%
($6,000) · **$260**. **Cross-check**: $3,000 at $100K matches the owner's canonical
EOD table ($1,000/25K · $2,000/50K · $3,000/100K · $4,500/150K) exactly.

### Forex frame inventory (thirteen)
F1 One, Set-account (2 of 5), default → $488 (6%/4%/9%). F2 One, modifiers (3 of 5),
dynamic 4% → $398. F3 One, dynamic 6% → $488. F4 One, dynamic 8% → $586. F5 One,
dynamic 8% → $586 — a second capture of the same state moments later (identical
data; recorded as its own frame). F6 One, dynamic 10% → $684. F7 One, dynamic 14% →
$879. F8 Pro, Set-account, default → $488 (static 8% / daily 2.5% / cap 2%). F9 Pro,
modifiers, static 6% → $468. F10 Pro, static 8% → $488. F11 Pro, static 10% → $538.
F12 Signature, Set-account → $260 (EOD 3%). F13 Signature, modifiers (trading
conditions only; steps 4 Billing and 5 Payment visible, not completed).

---

## THE CRYPTO MARKET WALK (eleven frames)

### Programs and platforms — the deltas from Forex
E8 One (1 step) · E8 Pro (1 step – Static Drawdown) · E8 Signature (1 step) —
**no E8 Trial in the Crypto flow**. Platform: **TradeLocker only on every line,
E8 One included** (MatchTrader is forex-One-only). **Leverage 1:5** on every crypto
program's summary. **No trading-conditions section anywhere in the Crypto flow** —
the modifiers step opens directly at Dynamic Drawdown (No Commissions | Raw Spreads
is forex-only). Swap-free +10% still offered. **Signature-Crypto's checkout is
Step 2 of 4** — with no modifiers step at all: market → account → billing → payment.

### E8 One Crypto ($100K, payout 80%)
Balances: same 8 tiers as forex. Payout options 80/90/100. Dynamic options
4/6/8/10/14. **The matrix — couplings AND prices — is identical to forex One**:
4% → $398 (daily 3%, target 6%) · 6% (default) → $488 (4%, 9%) · 8% → $586 (5.3%,
12%) · 10% → $684 (6.6%, 15%) · 14% → $879 (9.2%, 21%).

### E8 Pro Crypto ($100K, payout 80%)
Same shape and prices as forex Pro: static 6% → $468 · 8% (default) → $488 · 10% →
$538; **daily fixed 2.5% ($2,500), Daily Profit Cap fixed 2% ($2,000)** throughout;
target = static; payout options 80/100.

### E8 Signature Crypto ($100K)
Balances $25K/$50K/$100K/$150K · **EOD Drawdown 3% ($3,000)** · Payout 80% · Target
6% ($6,000) · **$260** · Leverage 1:5. Same numbers as forex Signature.

### Crypto frame inventory (eleven)
C1 One, Set-account (2 of 5), default → $488 (6%/4%/9%, leverage 1:5). C2 One,
modifiers (3 of 5), dynamic 4% → $398. C3 One, dynamic 6% → $488. C4 One, dynamic
8% → $586. C5 One, dynamic 10% → $684. C6 One, dynamic 14% → $879. C7 Pro,
Set-account, default → $488 (static 8%, daily 2.5%, cap 2%). C8 Pro, modifiers,
static 6% → $468. C9 Pro, static 8% → $488. C10 Pro, static 10% → $538.
C11 Signature, Set-account (2 of 4) → $260 (EOD 3%).

---

## THE FUTURES MARKET WALK (five frames)

### Programs and platforms
**E8 Zero MAX (1 step) · E8 Zero Starter (1 step) · E8 Signature (1 step)** — no
One, no Pro, no Trial in the Futures flow. Platform: **Tradovate only**. No leverage
line on the futures summaries (contract margining instead). No trading-conditions
section. The only modifier on any futures line is the payout split — **the EOD
Drawdown selector shows a single option, [3%]** — futures drawdown is not
customizable.

### E8 Zero MAX and Zero Starter ($100K)
Balances: **$50,000 / $100,000 / $200,000** (3 tiers, both Zero lines — matches the
dossier ladder). Payout options: 80% / 100%. Summary, both lines: **EOD Drawdown 3%
($3,000)** · Payout 80% · **Profit Target 6.5% ($6,500)** — the precise Zero target
number, distinct from Signature's 6%. Prices at $100K: **Zero MAX $588 · Zero
Starter $278** (same rules; the dossier records MAX vs Starter differing in payout
caps).

### E8 Signature Futures ($100K)
Balances: **$25K / $50K / $100K / $150K**. Summary: **EOD Drawdown 3% ($3,000)** ·
Payout 80% · **Profit Target 6% ($6,000)** · **$260** — identical numbers to
Signature on the other two markets. The futures 2%-of-tier Daily Pause (11969807,
Performance stage) is not a checkout line; it remains rulebook data.

### Futures frame inventory (five)
FU1 Zero MAX, Set-account (header "Step 2 of 4"), $100K → $588 (EOD 3%, target
6.5%). FU2 Zero MAX, modifiers (header "Step 3 of 5" — E8's own stepper is
inconsistent within this flow; immaterial, recorded for exactness): EOD [3%] single
option, payout 80/100 → $588. FU3 Zero Starter, Set-account (2 of 5) → $278 (EOD
3%, target 6.5%). FU4 Zero Starter, modifiers (3 of 5): EOD [3%], payout 80/100 →
$278. FU5 Signature, Set-account (2 of 4) → $260 (EOD 3%, target 6%).

---

## The crypto-leverage picture, resolved by scope
The checkout shows **account-level leverage 1:5 for every Crypto-market program**,
while the owner's E8 Pro **Forex** account showed crypto tickets margined at full
notional (1:1). These compose instead of contradicting: **leverage follows the
account's selected market** — a forex-market account extends no leverage to crypto
symbols; a crypto-market account carries 1:5. The published per-symbol split
(BTC/ETH 1:5, others 1:2 — 5514982) remains to be observed inside a live
crypto-market account; until then the rulebook records the checkout's account-level
1:5 (`verified`) and the article's per-symbol split (`primary`) with their scopes.

## Consequences
1. Amendment 10's input contract is FULFILLED for all three markets: every program
   line's tier matrix, constants, and prices at $100K enter the §20 rulebook as
   `verified`.
2. The One-line coupling (dynamic→daily→target, 1.5× law) and the Pro-line constants
   hold identically across Forex and Crypto; `broker_drawdown_tier` holds the pair
   token. Futures lines have NO drawdown customization (single EOD 3% option), and
   Zero's profit target is 6.5% against Signature's 6%.
3. Program-facts details per market: Trial forex-only; MatchTrader forex-One-only;
   trading-conditions choice forex-only; Tradovate futures-only; Signature-Crypto
   and the futures lines run 4-step checkouts (with E8's own stepper count wobbling
   between 4 and 5 in the futures flow).
4. Unobserved remainder: per-tier prices beyond $100K, the per-symbol leverage split
   inside a crypto-market account, and E8 Trial's shape.

---

## THE FUTURES MARKETING-SITE WALK (six frames — e8futures.com Challenges page)

A different lens than the checkout: per-size rule cards with Challenge AND
Performance tabs for every futures line, plus full per-size price ladders (base
price struck through; "code E8" first-order discount shown). Six frames: FR1
Signature/Challenge · FR2 Signature/Performance · FR3 Zero MAX/Challenge · FR4
Zero MAX/Performance · FR5 Zero Starter/Challenge · FR6 Zero Starter/Performance.

### E8 Signature Futures — per size, both stages

| Size | Base price (code-E8 first order) | DD chip | Challenge: target / max DD (EOD) / contracts | Performance: max DD / daily DD / consistency |
|---|---|---|---|---|
| $25K | $110 ($83) | 4% Max | $1,500 / $1,000 / 2 | $1,000 / $500 / 35% |
| $50K | $150 ($113) | 4% Max | $3,000 / $2,000 / 4 | $2,000 / $1,000 / 35% |
| $100K | $260 ($195) — Recommended | 3% Max | $6,000 / $3,000 / 8 | $3,000 / $2,000 / 35% |
| $150K | $390 ($293) | 3% Max | $9,000 / $4,500 / 12 | $4,500 / $3,000 / 35% |

- **The canonical EOD table is corroborated per size** ($1,000/$2,000/$3,000/$4,500
  — the 4/4/3/3 tiering shown in the cards' own drawdown chips), at both stages.
- **The Performance daily-drawdown dollars are the 2% Daily Pause per size**
  ($500/$1,000/$2,000/$3,000 — exactly 2% of each tier, matching 11864618).
- **Max contracts 2/4/8/12 confirmed on E8's own site** — this RESOLVES the
  cross-map's contradiction #7: the flat count table (previously secondary-only)
  and §19's margin-allowance reading CONVERGE, since floor(allowedMargin /
  $10,000 margin) = 2/4/8/12 at these tiers. Both readings were right.
- Challenge passes "in as little as 1 Day"; Performance first payout "in as
  little as 3 Days". Profit target 6% of tier at every size. No activation fee.

### E8 Zero MAX and Zero Starter — per size, both stages

| Size | MAX base (code E8) | Starter base (code E8) | Challenge: target / max DD (EOD) / consistency | Performance: max DD / daily / consistency |
|---|---|---|---|---|
| $50K | $328 ($197) | $178 ($107) | $3,000 (6%) / $1,500 / 40% | $1,500 / none / none |
| $100K | $588 ($353) — Recommended | $278 ($167) | $6,500 (6.5%) / $3,000 / 40% | $3,000 / none / none |
| $200K | $1,088 ($653) | $558 ($335) | $13,500 (6.75%) / $6,000 / 40% | $6,000 / none / none |

- **Zero's profit target is size-dependent**: 6% / 6.5% / 6.75% at 50/100/200K —
  the checkout's 6.5% was the $100K row, not a flat rate. Max DD is 3% of tier
  flat, EOD type, both stages.
- **Challenge consistency 40%** on both Zero lines (matching 15936479);
  **Performance shows no consistency rule and no daily drawdown** — corroborating
  "consistency only in the challenge stage" and "Zero has no daily loss rule."
- Challenge passes "in as little as 3 Days" (vs Signature's 1); **Performance
  first payout "in as little as 1 Day"** — the daily-payouts positioning ("E8
  Zero — One Phase, Daily Payouts, 100% Payout" per the page's own tab title).
  No activation fee anywhere. MAX and Starter share every rule; only prices
  (and, per the dossier, payout caps) differ.

### Consequences (additive to the checkout walk)
1. Full per-size futures price ladders enter the rulebook (base + first-order
   discount noted as promotional, not a rule).
2. Cross-map contradiction #7 closes by convergence; the §19 margin-allowance
   formula and the 2/4/8/12 table agree at the published tiers.
3. Zero's per-size target curve (6/6.5/6.75%) supersedes any flat reading.
4. Stage-scoped payout cadence recorded: Signature 3-day first payout;
   Zero 1-day (daily) at Performance.

---

## THE E8 ONE (FOREX) MARKETING-SITE WALK (four frames — e8markets.com Challenges page)

Per-size cards for all eight E8 One tiers at the **6% dynamic default**, Challenge
and Performance tabs. Four frames: M1 Challenge (5K–100K) · M2 Performance
(5K–100K) · M3 Challenge (100K–500K) · M4 Performance (100K–500K). Drawdown chips
read "6% Max"; drawdown type **Dynamic** on every card, both stages.

| Size | Base price (code-E8 first order) | Challenge: target / max DD / daily DD | Performance: max DD / daily DD / consistency |
|---|---|---|---|
| $5K | $48 ($36) | $450 / $300 / $200 | $300 / $200 / 40% |
| $10K | $88 ($66) | $900 / $600 / $400 | $600 / $400 / 40% |
| $25K | $188 ($141) | $2,250 / $1,500 / $1,000 | $1,500 / $1,000 / 40% |
| $50K | $288 ($216) | $4,500 / $3,000 / $2,000 | $3,000 / $2,000 / 40% |
| $100K | $488 ($366) — Recommended | $9,000 / $6,000 / $4,000 | $6,000 / $4,000 / 40% |
| $200K | $798 ($599) | $18,000 / $12,000 / $8,000 | $12,000 / $8,000 / 40% |
| $400K | $1,598 ($1,199) | $36,000 / $24,000 / $16,000 | $24,000 / $16,000 / 40% |
| $500K | $1,998 ($1,499) | $45,000 / $30,000 / $20,000 | $30,000 / $20,000 / 40% |

- **Every size is exactly the checkout's 6%-default row scaled**: max DD 6% of
  tier, daily 4%, target 9% — flat percentages across all eight tiers, both
  stages carrying the same dollar drawdowns.
- **Consistency 40% at Performance only** (Challenge cards show none) —
  per-size confirmation of One's funded-stage best-day rule.
- **Cadence**: Challenge passes "in as little as 1 Day"; Performance first
  payout "in as little as 3 Days". No activation fee at any size.
- **The full One base-price ladder lands**: $48 / $88 / $188 / $288 / $488 /
  $798 / $1,598 / $1,998 (5K→500K, 6% default). This ANCHORS the dossier's
  price contradiction #2: the $500K base at the default configuration is
  **$1,998** (`verified`) — the custom-account article's "$2,598" ceiling
  presumably prices a higher drawdown tier (which tier is unobserved), and the
  secondary's "$1,627" matches nothing observed on any surface.
