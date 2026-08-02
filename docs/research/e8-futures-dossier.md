# E8 Futures — Published Terms Dossier
Compiled 2026-08-01 for Levelflow's risk-governor / position-sizing build. All facts below are pulled from live pages (fetched via browser navigation, since `helpfutures.e8markets.com` and `e8x.e8markets.com` return HTTP 403 to non-browser fetchers). Every fact is sourced; verbatim quotes are marked with quotation marks. Where E8's own pages contradict each other, both are recorded. Where data could not be found, it is marked **NOT PUBLISHED**.

**Scope-defining fact up front**: E8 currently sells four branded programs — E8 Zero, E8 One, E8 Signature, E8 Pro — but **only E8 Zero and E8 Signature are offered on Futures**; E8 One and E8 Pro are Forex/Crypto-only. Source: https://helpfutures.e8markets.com/en/articles/13106558-all-product-overviews-e8-one-vs-e8-zero-vs-e8-pro-vs-e8-signature ("Markets" row: E8 Zero = "Futures"; E8 One = "Forex, Crypto"; E8 Signature = "Forex, Crypto, Futures"; E8 Pro = "Forex, Crypto"). This dossier therefore covers, as the complete Futures roster:
1. **E8 Signature Futures** (current)
2. **E8 Zero Futures** — sold as **E8 Zero Starter** and **E8 Zero MAX** (current; identical rules, different price/payout-cap tiers)
3. **E8 Zero Futures (legacy)** — an explicitly deprecated predecessor still live on the help center, banner-flagged "THIS IS AN OLD VERSION"

---

## Primary-article pass (2026-08-02, owner-supplied URLs)

**Method**: 24 owner-specified `helpfutures.e8markets.com` article URLs were fetched (the request text said "27" but enumerated 24 distinct article IDs — flagging the discrepancy rather than fabricating 3 more). Fetched via direct browser navigation, not the r.jina.ai/WebFetch proxy path — a test fetch of article 11864618-e8-signature-futures through that proxy silently dropped three of the page's five data tables during its summarization pass, so all 24 were instead read as raw rendered page text. Full per-article extraction, with every numeric table reproduced in full, lives in the companion file `docs/research/e8-futures-articles.md`. This section records what's new or changed against the dossier below; anything not mentioned here was re-checked and reconfirmed identical.

### (a) Previously-secondary or newly-confirmed facts

- **Server-time DST calendar is now exact**, not "apparently EU-style": "changed to UTC+2 at the beginning of November and to UTC+3 at the end of March" (article 10305202). Surprise §8.1's hedge can now be stated as confirmed-EU-style-calendar with known switch *months* (exact day-of-month still not published).
- **Account Reset mechanics — entirely new territory**: failing an account at any stage unlocks a **10% discount** to restart from the Challenge phase, at the **same account size/settings only**, via a "retry" button in the dashboard's "Closed accounts" section, **valid for 7 days following the failure** only (article 11640147). Not previously in this dossier — relevant to any bankroll-continuity or breach-cost model the governor maintains.
- **Wrong-contract-month rule has no automated safety net**: E8 publishes no roll calendar and performs no forced flatten/roll — the sole signal is "the contract with the highest Volume," entirely self-monitored, and the consequence (termination or profit deduction) is purely after-the-fact (article 13390461). A governor holding into a roll is relying entirely on its own volume-tracking; E8 provides no protective mechanic.
- **"Account rolling" is a named prohibited practice, textually distinct from the mandatory contract-month rolling** (article 10209270) — undefined on the page. Terminology collision risk: a governor's own strategy logic should avoid calling anything "rolling" other than the mandatory front-month switch, to keep audit trails unambiguous.
- **TradingView can front-end a Tradovate account** — "you can still connect your Tradovate account to the Tradingview option for trading" (article 14595962). Tradovate remains the sole execution backend; this is a previously-unrecorded charting/UI option.
- **Household/IP pooling on the Performance-stage allocation cap**: "these allocation limits apply per household. Multiple users within the same residence/same IP must not exceed this collective maximum" (article 5515039) — not previously recorded.
- **T1 News Event definition now on record**: "central bank decisions, economic indicators, and major political events" (article 10209321). The linked "targeted instruments" list itself remains unresolved — still not retrievable as text on the page.
- Certificate-issuance timing: SimFi Performance account creation (hence certificate availability) "usually takes 30-120 minutes after finishing the Challenge stage" (article 14595232) — minor but concrete, previously unrecorded.

### (b) Corrections

- **No numeric corrections.** All three sizing-engine ground-truth tables — instrument list/hours (13001922), tick size/value (13004287), max contract sizes/margin (10155917) — were re-fetched in full and checked cell-by-cell against this dossier's existing tables (§5.2 master table; §5.1/§5.2 contract-cap tables). Every commission, fee, tick, margin, and contract-count figure is unchanged, including the previously-flagged site errors (NQ/Natural Gas mislabel, 7E/E7 naming split, missing EMD/7E/MCD/PA margin, blank "Micro Silver" symbol, MHG=$10,000 anomaly) — all still live verbatim today.
- **One classification correction**: MHG (Micro Copper) was previously recorded (§5.2 "Also flagged" note, below) as an isolated pricing-pattern anomaly — it doesn't get 1/10th margin the way every other micro contract does. Direct re-inspection shows MHG is **also** absent from the fee table (13001922), the tick table (13004287), and the canonical 45-instrument list (13390461) — the identical absentee pattern as GF, MNG, the 7 Treasury symbols, and blank/"Micro Silver." **Old framing**: MHG treated as a one-off pricing footnote, implicitly still in-scope as a tradable instrument. **New framing**: MHG belongs in the same margin-table-only / tradability-unconfirmed bucket as those other 10 symbols (table corrected in §5.2 below).

### (c) §6 contradiction resolutions (summarized here; annotated in place at each numbered entry below)

1. **News-trading "Forex" typo** — RECONFIRMED still live verbatim on the Signature article today, unresolved. New related finding: a second, distinct copy-paste artifact in the same family — the overnight-holding sentence on the Signature page (11864618) and the general overnight article (10149596) both say "the E8 Zero Futures model" instead of naming the correct product.
2. **Zero payout 80%/100% ambiguity** — RECONFIRMED unresolved; both source pages still state the two-tier split with no unlocking condition given anywhere. The same unresolved pattern is now also independently visible on E8 Pro (80%/100%) and E8 One (80%/90%/100%) in the comparison table (13106558) — evidently systemic across E8's product line, not a Zero-specific gap.
3. **Daily Pause fixed-$ post-payout tension** — the primary Daily Pause article (11969807) is completely silent on payout interaction; it neither confirms nor contradicts the "never changes" language against the other article's "recalculated from new balance" claim. Contradiction stands, unresolved by this pass.
4. **35% Best Day Rule arithmetic (Signature)** — article 11865587 was not in this pass's URL list and was not re-fetched; status unchanged. For comparison, this pass did fetch Zero's analogous 40%-rule article (15936479) fresh, and its worked examples are internally consistent with no arithmetic errors — suggesting Signature's page-level arithmetic slip is an isolated typo on that specific page, not a mechanic-wide problem.
5. **"E8 Zero Futures is currently the only available product for this market"** — RECONFIRMED still live verbatim today (10207237), not stale copy that's since been cleaned up.
6. **"Applies to: E8 Signature" banner on the live e8x trading-symbols tool** — that tool is not one of this pass's 24 URLs; status unchanged, not re-verified today.

**Contract-limit question ("contradiction #7" territory) — RESOLVED, not actually a contradiction**: 10155917's own page layout settles this. E8 Signature gets **one flat table** with no Challenge/Performance split and no scaling mechanic anywhere on the page; E8 Zero gets **two explicit tables** (Challenge flat cap vs. Performance profit-triggered scaling). This is a confirmed, intentional product-design difference, not an unreconciled discrepancy. The one genuine wrinkle that *does* persist — Zero's own $50K Performance-stage ceiling (5 contracts at Trigger 2) exceeding its own $50K Challenge-stage flat cap (4 contracts) — is a **Zero-internal** inconsistency, not a Signature-vs-Zero one, and it is reconfirmed unchanged and still unreconciled by E8 as of today.

---

## 1. E8 Signature Futures

**Structure**: Single-Phase (1-Step) challenge. Source: https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures — "This is our 1-Step challenge - designed exclusively for Futures traders who value speed, clarity, and control." Two stages: **SimFi Challenge** (evaluation, unfunded) → **SimFi Performance** (funded/live-payout stage).

### Account sizes, price, profit target
Source: https://e8futures.com/compare-simfi-funded-accounts (interactive configurator) and https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures (identical figures, cross-confirmed).

| Size | Price (promo/regular) | Profit Target | Max Drawdown | Drawdown % | Max Contracts |
|---|---|---|---|---|---|
| $25,000 | $83 / $110 | $1,500 | $1,000 | 4% | 2 |
| $50,000 | $113 / $150 | $3,000 | $2,000 | 4% | 4 |
| $100,000 | $195 / $260 | $6,000 | $3,000 | 3% | 8 |
| $150,000 | $293 / $390 | $9,000 | $4,500 | 3% | 12 |

Promo requires discount code "E8". "Pass in as little as 1 Day." "No Activation Fee." Payout split: **80%** (flat, all sizes). Inactivity: account disabled after 7 days without a placed-and-closed trade (no maximum time limit otherwise).

### Daily loss rule — "Daily Pause"
**Applies to the Performance (funded) stage ONLY — there is no daily loss rule during the Challenge/evaluation stage for Signature.** Source: https://helpfutures.e8markets.com/en/articles/11969807-daily-pause — "Available on SimFi™ Performance stage (only) for: E8 Signature Forex, E8 Signature Crypto, E8 Signature Futures."

- Basis: **"We take 2% of your initial Balance and convert it to a fixed $"** — this dollar amount is set once at account inception and **never recalculated**, even as balance changes. Quote (≤15 words): "The fixed $ never changes during the account's life" — https://helpfutures.e8markets.com/en/articles/11969807-daily-pause
- Day-boundary formula: "Every new day, we set your pause line = Balance of the new day − that fixed $."
- Monitored on: **equity or balance**, whichever hits the line first.
- Reset: **00:00 "Server time"** — NOT the same clock as the CT trading-hours window (see Surprises, below).
- Breach consequence: a **soft pause**, not an account breach. Quote: "Daily Pause is not a hard breach; you can still continue trading the next day" — same URL.
- Per-size $ amounts (Performance stage): $500 ($25K) / $1,000 ($50K) / $2,000 ($100K) / $3,000 ($150K). Source: https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures
- No guaranteed auto-flatten at the line: "we don't rebalance if it takes you past −2%" — realized loss can exceed 2% due to execution lag before positions are force-closed.

### Max drawdown rule — "EOD Dynamic Drawdown"
Canonical mechanics source: https://helpfutures.e8markets.com/en/articles/11864596-eod-dynamic-drawdown (applies to both Signature and Zero).

- **Basis**: high-water-mark of **highest-ever end-of-day balance**, evaluated once per day at market close — not intraday, not tick-by-tick. Quote (≤15 words): "It only updates once per day at market close" — https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures
- **It is a true ratchet**: the loss level only moves up on a day with closed profit; a losing day's lower EOD balance does **not** pull the loss level back down (proved by E8's own worked table — see Surprises §2).
- **Trailing-to-breakeven-and-lock, precisely defined**: once the computed loss level would reach/exceed the account's original starting balance (i.e., breakeven) — OR the trader requests their first payout, whichever comes first — the drawdown **locks permanently at the initial balance level** and stops trailing further. Quote (≤15 words): "It locks permanently at the initial balance level." — https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures. Confirmed independently: "It became static once you reach the starting balance amount" — https://helpfutures.e8markets.com/en/articles/13106558 (product comparison table).
- Per-size $ amounts: $1,000 ($25K) / $2,000 ($50K) / $3,000 ($100K) / $4,500 ($150K) — same figures apply in both Challenge and Performance stages. Source: https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures
- **Breach consequence: full, permanent account termination** (unlike Daily Pause). Quote (≤15 words): "your account will be permanently closed for breaching the EOD Dynamic Drawdown rule" — https://helpfutures.e8markets.com/en/articles/11864596-eod-dynamic-drawdown. Also: "closing your balance above the loss level after you breach... won't prevent the account from being violated and permanently closed" — no reprieve from execution-lag overshoot in the trader's favor either.
- Basis: equity or balance (both monitored).

### Consistency rule — "35% Best Day Rule" (Performance stage only)
Source: https://helpfutures.e8markets.com/en/articles/11865587-35-best-day-rule
- Applies only once funded; failing it blocks payout eligibility but does **not** breach the account: "you don't lose your account; you simply need to continue trading to increase your total profit."
- Mechanic: no single day's profit may exceed 35% of **total generated profit for the current payout period** (a running total, reset at each payout — see gap below). If breached: keep trading (without beating that best day) until total profit ≥ (best-day $) ÷ 0.35.
- Quote (≤15 words): "no single trading day exceeds more than 35% of your total generated profits" — same URL.
- **Two internal arithmetic inconsistencies found on this page** (see Contradictions §4 below).

### Position limits, scaling, prohibited practices — see shared §5 below (applies to both Signature and Zero except where noted).

### Payout terms
Source: https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures and https://helpfutures.e8markets.com/en/articles/11940573-payout-caps-and-buffers-for-e8-signature-explained
- Minimum profitable days between payouts: 5 (waived for first payout); a "profitable day" = realized closed PnL ≥ 0.3% of account size.
- Minimum payout: $100 net (i.e., ≥$125 gross at 80% split).
- **Payout buffer** = must leave account balance ≥ (starting balance + EOD Dynamic Drawdown $ amount) before requesting; buffer itself cannot be withdrawn. Quote (≤15 words): "leave a buffer in your account in the same size as your EOD Dynamic Drawdown" — https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures
- Payout caps (max $ per single request), by payout number and size:

| Payout # | $25K | $50K | $100K | $150K |
|---|---|---|---|---|
| 1st | $1,000 | $1,250 | $2,250 | $3,250 |
| 2nd | $1,000 | $1,250 | $2,250 | $3,250 |
| 3rd | $1,250 | $2,250 | $3,250 | $4,250 |
| 4th | $1,250 | $2,250 | $3,250 | $4,250 |
| 5th+ | $1,500 | $3,250 | $4,250 | $5,250 |

- Max 5 payouts per account, then "the cycle is closed, the account is deactivated, and you move on with the free Challenge of the same size" — applies only to accounts purchased after 14.07.2026 20:00 UTC+2 (both this rule and the "no carryover of unused profit between cycles" rule).
- Max concurrent funded (Performance) accounts: **5** for E8 Signature Futures (count-based cap, no stated $ ceiling). Source: https://helpfutures.e8markets.com/en/articles/5515039-how-many-accounts-can-i-apply-for-at-once

---

## 2. E8 Zero Futures (Starter / MAX) — current

**Structure**: Single-Phase challenge, marketed as the most permissive product. Source: https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max — "The only limitations are payout caps and a maximum of 5 payouts per account." Starter and MAX **share identical rules**; only price and payout caps differ. "E8 Zero comes in 2 versions... the starter version is cheaper with smaller payout caps, and Zero Max has a slightly higher price but offers bigger payout caps."

### Account sizes, price, profit target
Source: https://e8futures.com/compare-simfi-funded-accounts (interactive configurator).

| Size | Zero Starter Price | Zero MAX Price | Profit Target | Max Drawdown (3%) |
|---|---|---|---|---|
| $50,000 | $107 / $178 | $197 / $328 | $3,000 | $1,500 |
| $100,000 | $167 / $278 | $353 / $588 | $6,500 | $3,000 |
| $200,000 | $335 / $558 | $653 / $1,088 | $13,500 | $6,000 |

**Note**: E8's own homepage "MOST POPULAR — $100K CHALLENGE — $353 (was $588)" banner is the **E8 Zero MAX $100K tier**, not Signature (whose $100K price is $195/$260). Easy to conflate. Purchase URL query params confirm: `?a=ZM&b=100&dr=3&p=80&d=E8` (a=ZM → account model "Zero MAX"). Source: https://e8futures.com homepage.

"No minimum Trading days." Inactivity: must place-and-close ≥1 trade every 7 days (same as Signature).

### Daily loss rule
**NOT PUBLISHED as existing.** The product overview comparison table explicitly states Zero's "Daily limit" = **"No"**. Source: https://helpfutures.e8markets.com/en/articles/13106558-all-product-overviews-e8-one-vs-e8-zero-vs-e8-pro-vs-e8-signature. Neither the Zero product article nor the Daily Pause article (which is scoped explicitly to Signature only) mention any daily loss limit for Zero. **This is a material Zero-vs-Signature difference for the risk governor**: Zero has only the overall EOD Dynamic Drawdown as a loss guardrail; Signature layers a daily soft-pause on top, but only once funded.

### Max drawdown rule
Same "EOD Dynamic Drawdown" mechanic and lock-at-breakeven behavior as Signature (see §1 above; same source: https://helpfutures.e8markets.com/en/articles/11864596-eod-dynamic-drawdown), at a flat **3%** for all Zero sizes, **with one documented exception**:

**Challenge-stage exception (verbatim, ≤15 words)**: "the loss level is not being locked at the initial balance and can go further" — https://helpfutures.e8markets.com/en/articles/11864596-eod-dynamic-drawdown. During E8 Zero's Challenge (evaluation) stage only, the trailing floor keeps ratcheting upward indefinitely with new EOD highs — it does NOT lock at breakeven. The lock-at-breakeven behavior applies once in the Performance (funded) stage.

### Consistency rule — "40% Best Day Rule" (Challenge stage only)
Source: https://helpfutures.e8markets.com/en/articles/15936479-40-best-day-rule-challenge
- Applies **only** during the Challenge stage (unlike Signature, where the analogous rule applies only in Performance). Zero's Performance stage explicitly has **"No consistency rules... No Daily profit cap... No minimum profitable days."**
- Mechanic differs from Signature's version: the cap is 40% of the **fixed profit target** (not a running total). Quote (≤15 words): "profit should not exceed 40% of the total profit target in a single day" — same URL. If breached, effective target recalculates to (best-day $) ÷ 0.40.
- "The earliest you can pass phase-1 on E8 Zero is 3 days from the start of your trading period... 3 days is the fastest the math can work in your favour."
- Same anti-circumvention clauses as Signature's version (splitting large wins across days/positions may be re-consolidated into a single day for rule purposes).

### Position limits, scaling — see shared §5 below. **Zero Performance stage has a unique profit-triggered contract-scaling plan not present on Signature** — see §5.2.

### Payout terms
Source: https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max
- "No consistency rules / No minimum trading days / No minimum profitable days / No Daily profit cap" once funded.
- "Payout frequency: You can request it every day!" Minimum payout $100.
- Payout caps (max $ per single request; based on account size only, **not** on payout sequence number, unlike Signature):

| Size | Zero Starter cap | Zero MAX cap |
|---|---|---|
| $50,000 | $1,000 | $3,000 |
| $100,000 | $1,600 | $5,000 |
| $200,000 | $2,100 | $7,000 |

- Max 5 payouts per account, then cycle closes → account deactivated → moved to free Challenge of same size (same mechanic as Signature).
- Payout split shown as **80%** in the live pricing configurator for both Starter and MAX, but help-center product/comparison pages separately state Zero pays "80% or 100%" without specifying which condition unlocks 100% — **see Contradictions §2**.
- Max concurrent funded (Performance) accounts: **3** for E8 Zero (count-based, no stated $ ceiling). Source: https://helpfutures.e8markets.com/en/articles/5515039-how-many-accounts-can-i-apply-for-at-once

---

## 3. E8 Zero Futures — LEGACY (deprecated, still live on help center)
Source: https://helpfutures.e8markets.com/en/articles/15702549-e8-zero-futures — banner: "THIS IS AN OLD VERSION OF ZERO PRODUCT. FOR THE NEWER VERSION, CLICK HERE." Recorded for completeness/contradiction-tracking only; treat current "E8 Zero (Starter and Max)" as authoritative.

- Account sizes (DIFFERENT from current Zero): $50,000 / $100,000 / $250,000 / $500,000.
- Profit target: flat **6%** (not broken out per size on the page).
- Drawdown: **"3% Static Drawdown – A fixed loss limit based on your initial balance. It never moves, except when a first payout is processed."** — STATIC, not EOD-trailing. This is a fundamentally different mechanic from the current Zero product.
- Payout split: **100%** (flat) — vs. current Zero's 80%/100% ambiguity.
- Payout caps: $3,000 ($50K) / $5,000 ($100K) / $6,000 ($250K) / $7,000 ($500K).
- This legacy article is also the explanation for a stray, stale claim found on https://helpfutures.e8markets.com/en/articles/10207237-available-trading-platforms — "(E8 Zero Futures is currently the only available product for this market)" — which is outdated relative to the current Signature+Zero(Starter/MAX) lineup.

---

## 4. Shared rules — position limits, scaling, prohibited practices, sessions (Signature + Zero, current products)

### 5.1 Flat max-contract limits (Challenge stage / Signature both stages)
Source: https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes

| Product | Size | Max Contracts | Margin locked |
|---|---|---|---|
| E8 Signature | $25,000 | 2 | $20,000 |
| E8 Signature | $50,000 | 4 | $40,000 |
| E8 Signature | $100,000 | 8 | $80,000 |
| E8 Signature | $150,000 | 12 | $120,000 |
| E8 Zero (Challenge) | $50,000 | 4 | $40,000 |
| E8 Zero (Challenge) | $100,000 | 8 | $80,000 |
| E8 Zero (Challenge) | $200,000 | 10 | $100,000 |

### 5.2 E8 Zero Performance-stage contract SCALING plan (unique to Zero; Signature has no scaling — its Performance-stage cap equals its Challenge-stage cap)
Same source. Quote (≤15 words): "you start with smaller contract sizes and increase them based on locked profit" — https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes

| Size | Starting Max | Trigger 1 (1.5% profit locked) | Trigger 2 (3% profit locked) |
|---|---|---|---|
| $50,000 | 2 contracts | 3 contracts | 5 contracts |
| $100,000 | 3 contracts | 5 contracts | 8 contracts |
| $200,000 | 4 contracts | 7 contracts | 10 contracts |

"The account scales automatically at the start of each new trading day." Note the $50K Performance-stage ceiling (5 contracts at Trigger 2) is *higher* than the $50K Challenge-stage flat cap (4 contracts) — recorded as published, not reconciled by E8.

### 5.3 Consistency / prohibited-practices / mandatory-stop rules (Futures-wide)
Source: https://helpfutures.e8markets.com/en/articles/10209270-trading-policies-and-prohibited-trading-strategies

- **Mandatory stop-losses: NOT REQUIRED.** E8 only *recommends* stop-losses to avoid overshooting the Daily Pause / drawdown line — never mandates a stop order. No rule found anywhere requiring a resting stop-loss on every position.
- **HFT threshold**: "trading bots, AI tools, HFT trading (**more than 300 trades per day**)" are listed as a prohibited/semi-automated practice. Directly relevant — an automated risk-governor placing orders on an E8 account must stay under this to avoid a "prohibited practice" flag.
- **Scalping floor**: "A minimum of 50% of all profits must come from trades with a holding period of no less than 10 seconds" (the "Tick Scalping" rule) — caps how much of total profit can come from sub-10-second trades.
- **"Holding a position within 2% of a product's lock limit"** is itself listed as a prohibited practice — exact metric ("lock limit") not further defined on this page.
- **Cross-account hedging strictly prohibited**, even across a trader's own multiple accounts: "opening equal Long and Short trades on the same instrument across multiple accounts is strictly prohibited." Within a single account, Futures use a **netting** system (not hedging) — an opposite-direction order of equal size closes/offsets the existing position rather than coexisting with it. Source (netting): https://helpfutures.e8markets.com/en/articles/10207237-available-trading-platforms
- Compliance with CME Group rules is an explicit condition of use.
- Front-month-contract requirement is mandatory: trading anything but the highest-volume (front-month) contract month "may also result in termination of your account or deduction of profit." Source: https://helpfutures.e8markets.com/en/articles/13390461-stop-trading-the-wrong-contract-month
- Penalty for any prohibited practice: program termination + refund of the fee from the violating account only (not a payout of profits); pre-funding compliance review; possible loss of accrued profit; E8 reserves right to "de-risk your trading strategy." Risk-team interviews possible at random ("not standard practice").

### 5.4 Sessions, overnight, weekend (Futures-wide — identical for Signature and Zero)
Source: https://helpfutures.e8markets.com/en/articles/13001922-instrument-list-and-trading-hours and https://helpfutures.e8markets.com/en/articles/10149596-can-i-hold-positions-overnight
- Permitted trading window: **17:00 to 15:10 CT** (Sunday session open at 17:00 CT through the week; grains/CBOT-commodity products trade 19:00–13:20 CT instead — see instrument table).
- **All open positions are force-closed every day at 15:10 CT.** No overnight holding, ever, on either product. No weekend holding (moot, since flat every day before the weekend gap).
- Confirmed via the product-comparison table: "Overnight holding" = No for both Zero and Signature; "Weekend Holding" = No for both. Source: https://helpfutures.e8markets.com/en/articles/13106558
- Expert Advisors / algo platforms: **not allowed on Futures** for either product ("Futures - No" for both Zero and Signature) — only Trade Copier (same-owner copy trading) is explicitly permitted.
- **News trading: unrestricted** on both current products. Canonical statement: "You can trade news on E8 Zero or E8 Signature accounts without any restrictions" — https://helpfutures.e8markets.com/en/articles/10209321-can-i-trade-news. (Two individual product pages contain a copy-paste typo saying "Forex" instead of the product name — resolved by this canonical general-rules page; see Contradictions §1.) E8 warns simulated slippage during high-impact news is real and unprotected.

---

## 5. Instruments and per-contract specifications

### 5.1 Product coverage vs. gaps (headline answer for the coordinator)
- **Full specs (tick size + tick value + all three fee components + margin + hours) are published for 40 of the 45 canonically-listed instruments.**
- **5 instruments have a published tradability + fee/tick/hours row but a missing/NOT PUBLISHED margin figure**: Palladium (PA), E-mini Euro FX (7E), Micro CAD/USD (MCD), and E-mini S&P MidCap 400 (EMD) — none of these four have ANY margin-per-contract row on the one page that lists margin (Max Contract Sizes article), despite appearing in both the fee table and the tick-size table.
- **A separate handful of symbols appear ONLY in the margin table and nowhere else** (not in the fee table, tick table, the canonical "Stop Trading Wrong Month" product list, the e8futures.com homepage instrument grid, or the live e8x.e8markets.com/trading-symbols tool): Feeder Cattle (GF), Micro Natural Gas (MNG), an entire "CBOT Financial/Interest Rate Futures" category (ZT/ZF/ZN/ZB/UB/TN/ZQ — 2yr/5yr/10yr Notes, 30yr Bond, Ultra-Bond, Ultra-Note, 30-Day Fed), and an unnamed "Micro Silver" row (symbol left blank in source). Cross-checked against 3 independent listings (help-center canonical list, e8futures.com homepage grid, live e8x symbol browser) — none of them include these. **Tradability of these is unconfirmed/contradictory**; treat as NOT reliably tradable pending direct confirmation from E8 support.
  **REFINED 2026-08-02**: direct re-fetch of 10155917 shows GF and MNG are not orphaned rows — they sit inside otherwise-fully-tradable category tables (GF alongside LE/HE under "CME Agricultural Futures"; MNG alongside CL/MCL/QM/NG/QG/RB/HO under "NYMEX Futures"), which raises confidence they are real, intended instruments even though tick/fee/canonical-list confirmation is still missing. A new instrument, **MHG (Micro Copper)**, is now also confirmed to belong in this same unconfirmed cluster rather than being a standalone pricing anomaly — see the corrected table below. Still NOT reliably tradable pending E8 confirmation; still excluded from any sizing-engine instrument allowlist. See `docs/research/e8-futures-articles.md` article 20.
- Source for all of the above: https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes (margin table), https://helpfutures.e8markets.com/en/articles/13001922-instrument-list-and-trading-hours (fee table), https://helpfutures.e8markets.com/en/articles/13004287-tick-size-and-profit-per-tick-calculation (tick table), https://helpfutures.e8markets.com/en/articles/13390461-stop-trading-the-wrong-contract-month (canonical list), https://e8futures.com (homepage grid), https://e8x.e8markets.com/trading-symbols (live tool, browser-verified — WebFetch gets HTTP 403 here).

### 5.2 Master per-contract table (all figures as E8 publishes them; margin is E8's own internal/simulated figure, explicitly not claimed to be real exchange margin)

**Symbol** is exactly as E8 spells it. **RT** = Round Turn (all fee columns are per-contract, USD). Tick Value = E8's "Profit Per Tick." Hours are in CT.

| Symbol | Product | Exchange group | Tick Size | Tick Value | Commission RT | Exch+NFA RT | Clearing RT | Margin/contract | Hours (CT) |
|---|---|---|---|---|---|---|---|---|---|
| EMD | E-mini S&P MidCap 400 | CME Equity | 0.1 | $10.00 | $2.58 | $0.52 | $0.38 | **NOT PUBLISHED** | 17:00-16:00 |
| ES | E-mini S&P 500 | CME Equity | 0.25 | $12.50 | $2.58 | $2.80 | $0.38 | $10,000 | 17:00-16:00 |
| MES | Micro E-mini S&P | CME Equity | 0.25 | $1.25 | $0.78 | $0.74 | $0.38 | $1,000 | 17:00-16:00 |
| NKD | Nikkei | CME Equity | 5 | $25.00 | $2.58 | $2.80 | $0.38 | $10,000 | 17:00-16:00 |
| NQ | E-mini NASDAQ 100 | CME Equity | 0.25 | $5.00 | $2.58 | $2.80 | $0.38 | $10,000 | 17:00-16:00 |
| MNQ | Micro E-mini NASDAQ 100 | CME Equity | 0.25 | $0.50 | $0.78 | $0.74 | $0.38 | $1,000 | 17:00-16:00 |
| RTY | E-mini Russell 2000 | CME Equity | 0.1 | $5.00 | $2.58 | $2.80 | $0.38 | $10,000 | 17:00-16:00 |
| M2K | Micro E-mini Russell 2000 | CME Equity | 0.1 | $0.50 | $0.78 | $0.74 | $0.38 | $1,000 | 17:00-16:00 |
| MBT | Micro E-mini Bitcoin | CME Equity | 5 | $0.50 | $0.78 | $2.04 | $0.38 | $1,000 | 17:00-16:00 |
| MET | Micro E-mini Ether | CME Equity | 0.05 | $0.50 | $0.78 | $2.04 | $0.38 | $1,000 | 17:00-16:00 |
| 6A | Australian $ | CME FX | 0.0001 | $10.00 | $2.58 | $3.24 | $0.38 | $10,000* | 17:00-16:00 |
| M6A | Micro AUD/USD | CME FX | 0.0001 | $1.00 | $0.78 | $0.52 | $0.38 | $1,000 | 17:00-16:00 |
| 6B | British Pound | CME FX | 0.0001 | $6.25 | $2.58 | $3.24 | $0.38 | $10,000* | 17:00-16:00 |
| M6B | Micro British Pound | CME FX | 0.0001 | $0.63 | $0.78 | $0.52 | $0.38 | $1,000 | 17:00-16:00 |
| 6C | Canadian $ | CME FX | 0.0001 | $10.00 | $2.58 | $3.24 | $0.38 | $10,000* | 17:00-16:00 |
| 6E | Euro FX | CME FX | 0.0001 | $12.50 | $2.58 | $3.24 | $0.38 | $10,000* | 17:00-16:00 |
| 7E | E-mini Euro FX | CME FX | 0.0001 | $6.25 | $2.58 | $1.74 | $0.38 | **NOT PUBLISHED** | 17:00-16:00 |
| M6E | Micro Euro | CME FX | 0.0001 | $1.25 | $0.78 | $0.52 | $0.38 | $1,000 | 17:00-16:00 |
| MCD | Micro CAD/USD | CME FX | 0.0001 | $1.00 | $0.78 | $0.52 | $0.38 | **NOT PUBLISHED** | 17:00-16:00 |
| 6J | Japanese Yen | CME FX | 0.0000001 | $12.50 | $2.58 | $3.24 | $0.38 | $10,000* | 17:00-16:00 |
| 6S | Swiss Franc | CME FX | 0.0001 | $12.50 | $2.58 | $3.24 | $0.38 | $10,000* | 17:00-16:00 |
| 6M | Mexican Peso | CME FX | 0.00005 | $5.00 | $2.58 | $3.24 | $0.38 | $10,000* | 17:00-16:00 |
| 6N | New Zealand $ | CME FX | 0.0001 | $10.00 | $2.58 | $3.24 | $0.38 | $10,000* | 17:00-16:00 |
| LE | Live Cattle | CME Agro | 0.025 | $10.00 | $2.58 | $4.24 | $0.38 | $10,000 | 17:00-16:00 |
| HE | Lean Hogs | CME Agro | 0.025 | $10.00 | $2.58 | $4.24 | $0.38 | $10,000 | 17:00-16:00 |
| CL | Crude Oil | NYMEX | 0.01 | $10.00 | $2.58 | $3.04 | $0.38 | $10,000 | 17:00-16:00 |
| MCL | Micro Crude Oil | NYMEX | 0.01 | $1.00 | $0.78 | $1.04 | $0.38 | $1,000 | 17:00-16:00 |
| QM | E-mini Crude Oil | NYMEX | 0.025 | $12.50 | $2.58 | $2.44 | $0.38 | $10,000 | 17:00-16:00 |
| NG | Natural Gas | NYMEX | 0.001† | $10.00† | $2.58 | $3.24 | $0.38 | $10,000 | 17:00-16:00 |
| QG | E-mini Natural Gas | NYMEX | 0.005 | $12.50 | $2.58 | $1.04 | $0.38 | $10,000 | 17:00-16:00 |
| RB | RBOB Gasoline | NYMEX | 0.0001 | $4.20 | $2.58 | $3.04 | $0.38 | $10,000 | 17:00-16:00 |
| HO | Heating Oil | NYMEX | 0.0001 | $4.20 | $2.58 | $4.24 | $0.38 | $10,000 | 17:00-16:00 |
| ZC | Corn | CBOT Commodity | 0.25 | $12.50 | $2.58 | $4.24 | $0.38 | $10,000 | 19:00-13:20 |
| ZW | Wheat | CBOT Commodity | 0.25 | $12.50 | $2.58 | $4.24 | $0.38 | $10,000 | 19:00-13:20 |
| ZS | Soybeans | CBOT Commodity | 0.25 | $12.50 | $2.58 | $4.24 | $0.38 | $10,000 | 19:00-13:20 |
| ZM | Soybean Meal | CBOT Commodity | 0.1 | $10.00 | $2.58 | $4.24 | $0.38 | $10,000 | 19:00-13:20 |
| ZL | Soybean Oil | CBOT Commodity | 0.01 | $6.00 | $2.58 | $4.24 | $0.38 | $10,000 | 19:00-13:20 |
| YM | Mini-DOW | CME CBOT Equity | 1 | $5.00 | $2.58 | $2.80 | $0.38 | $10,000 | 17:00-16:00 |
| MYM | Micro Mini-DOW | CME CBOT Equity | 1 | $0.50 | $0.78 | $0.74 | $0.38 | $1,000 | 17:00-16:00 |
| GC | Gold | COMEX | 0.1 | $10.00 | $2.58 | $3.24 | $0.38 | $10,000 | 17:00-16:00 |
| MGC | Micro Gold | COMEX | 0.1 | $1.00 | $0.78 | $1.24 | $0.38 | $1,000 | 17:00-16:00 |
| SI | Silver | COMEX | 0.005 | $25.00 | $2.58 | $3.24 | $0.38 | $2,000 | 17:00-16:00 |
| HG | Copper | COMEX | 0.0005 | $12.50 | $2.58 | $3.24 | $0.38 | $10,000 | 17:00-16:00 |
| PL | Platinum | COMEX | 0.1 | $10.00 | $2.58 | $3.24 | $0.38 | $10,000 | 17:00-16:00 |
| PA | Palladium | COMEX | 0.1 | $10.00 | $2.58 | $3.24 | $0.38 | **NOT PUBLISHED** | 17:00-16:00 |

\* These CME FX margin figures are printed on E8's page with a period, e.g. "$10.000" — recorded here as $10,000, treating the period as a European-style thousands separator artifact, not a literal $10.00. Verbatim source: https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes

† **Site error, recorded verbatim then corrected by cross-reference**: the tick-size article lists this row as "NQ | Natural Gas | 0.001 | $10.00" — but NQ is already E-mini NASDAQ 100 in the same E8 taxonomy (see CME Equity section, tick 0.25/$5.00). The companion fee-table article correctly uses "NG" for Natural Gas. Table above uses the corrected symbol NG; the $0.001 tick / $10.00 tick-value figures are recorded as published (unverified against a second source). Source: https://helpfutures.e8markets.com/en/articles/13004287-tick-size-and-profit-per-tick-calculation

**Instruments appearing ONLY in the margin table, absent from every other list (fee table, tick table, canonical product list, homepage grid, live symbol browser) — tradability unconfirmed:**

| Symbol | Product | Margin/contract | Tick size | Tick value | Commission | Source |
|---|---|---|---|---|---|---|
| GF | Feeder Cattle | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes |
| MNG | Micro Natural Gas | $1,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same |
| ZT | 2-Year Note | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same |
| ZF | 5-Year Note | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same |
| ZN | 10-Year Note | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same |
| ZB | 30-Year Bond | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same |
| UB | Ultra-Bond | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same |
| TN | Ultra-Note | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same |
| ZQ | 30 Day Fed | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same |
| (blank) | "Micro Silver" | $1,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same (symbol left blank in E8's own table) |
| MHG | Micro Copper | $10,000 | NOT PUBLISHED | NOT PUBLISHED | NOT PUBLISHED | same — **RECLASSIFIED 2026-08-02** (was previously only a pricing-anomaly footnote; confirmed 2026-08-02 to be absent from the fee table, tick table, and canonical 45-instrument list, same as the other rows in this table) |

**RESOLVED/REFINED 2026-08-02**: MHG was previously flagged only as a pricing-pattern anomaly (below) and implicitly treated as an in-scope tradable instrument. Re-verification against the fresh fee table (13001922), tick table (13004287), and canonical instrument list (13390461) confirms MHG is absent from all three, exactly like GF/MNG/the Treasury cluster/blank-"Micro Silver" above — it has now been moved into this table as a row rather than left as a standalone footnote. The underlying pricing-pattern observation still stands and is retained below for context.

Also flagged: "/MHG Micro Copper $10,000" in the same margin table breaks the pattern every other micro contract follows (micros consistently get 1/10th the margin of their full-size counterpart — e.g. MES=$1,000 vs ES=$10,000); MHG is shown at the SAME $10,000 as full-size HG. Recorded verbatim as a likely page error; reconfirmed live 2026-08-02, still unconfirmed/unexplained by E8.

### 5.3 Symbol-naming inconsistencies across E8's own pages (Levelflow's symbol-mapping layer should normalize to the live-tool spelling)
- **E-mini Euro FX**: called "7E" on the fee table, tick table, and the live e8x.e8markets.com/trading-symbols tool (all three agree) — but called **"E7"** on the "Stop Trading the Wrong Contract Month" article. Treat **7E** as canonical.
- **Micro CAD/USD**: symbol "MCD" but its own "Product" column literally repeats "MCD" instead of a name on the tick-size page (vs. "Micro CAD/USD" elsewhere) — cosmetic only.

### 5.4 Spreads / markup / data-fee facts beyond commissions
- The live e8x.e8markets.com/trading-symbols tool shows a "Spread" and "Avg. spread" field for **Forex** instruments, but the **Futures** tab shows NO spread field at all for any instrument — only Commissions, Exchange+NFA, and Clearing. This indicates E8 is not publishing (and, by omission, may not be applying) any separate spread/markup on top of exchange-native futures pricing beyond the three itemized per-contract fees above. Source: https://e8x.e8markets.com/trading-symbols (Futures tab, browser-verified).
- No routing fee, data-fee, or platform-fee line item was found anywhere for Futures beyond Commission / Exchange+NFA / Clearing (all three already itemized per contract above) and the one-time account purchase price. **Data-feed/routing costs beyond these three RT components: NOT PUBLISHED** (i.e., not found as a separate disclosed line item — may be bundled into "Exchange and NFA").
- Trading platform: **Tradovate is the only platform for Futures.** Source: https://helpfutures.e8markets.com/en/articles/10207237-available-trading-platforms. The tick-size article explicitly caveats its own figures: "The following calculations are intended for Futures products on the Tradovate platform" — implying these tick-value dollar figures are not guaranteed identical if E8 ever offers Futures on a different platform.

### 5.5 Contract-month identification (for Levelflow's FMP symbol cross-map)
Source: https://helpfutures.e8markets.com/en/articles/13390461-stop-trading-the-wrong-contract-month
- E8 symbols are root + month code + year digit (e.g., "MBTG6" = Micro Bitcoin, February, 2026).
- Standard CME month codes as published by E8: F=Jan, G=Feb, H=Mar, J=Apr, K=May, M=Jun, N=Jul, Q=Aug, U=Sep, V=Oct, X=Nov, Z=Dec.
- Traders must always hold the **front month** (highest-volume) contract; the correct contract "changes... once the contract is heading to expiration date and the volume starts to decrease" — no fixed roll calendar is published, only "trade whichever has the highest volume."

---

## 6. Contradictions found across E8's own pages (both sides recorded per instructions)

1. **News-trading wording**: Individual product pages (Signature, Zero, legacy Zero) all contain the sentence "You can trade news on E8 Signature Forex / E8 Zero Forex without any restrictions" — literally saying "Forex" inside Futures-specific articles (copy-paste artifact). URLs: https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures ; https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max ; https://helpfutures.e8markets.com/en/articles/15702549-e8-zero-futures. The canonical, correctly-worded general-rules page resolves this: "You can trade news on E8 Zero or E8 Signature accounts without any restrictions" — https://helpfutures.e8markets.com/en/articles/10209321-can-i-trade-news.
   **RESOLVED/REFINED 2026-08-02**: reconfirmed still live verbatim on the Signature page today — not a since-fixed artifact. Related second instance newly found: the *overnight-holding* sentence on the Signature page (11864618) and on the dedicated overnight article (10149596) both read "It is not possible to hold positions overnight on the E8 Zero Futures model" — again the wrong product name, same copy-paste root cause, different sentence. Zero's own product page (15935817) does not contain this sentence at all (it wouldn't need correcting there). See `docs/research/e8-futures-articles.md` articles 1 and 7.

2. **Zero payout percentage**: Product/comparison pages state Zero pays "80% or 100%" / "80%, 100%" (https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max ; https://helpfutures.e8markets.com/en/articles/13106558), but the live pricing configurator shows a flat "Payout: 80%" for both Zero Starter and Zero MAX at every size (https://e8futures.com/compare-simfi-funded-accounts). Which condition unlocks 100% is NOT PUBLISHED anywhere found.
   **RESOLVED/REFINED 2026-08-02**: reconfirmed unresolved — both source pages still show the two-tier split with zero stated unlocking condition. Newly observed to be systemic, not Zero-specific: the same comparison table shows E8 Pro at "80%, 100%" and E8 One at "80%, 90%, 100%," each with the identical no-condition-stated gap. Treat as a platform-wide documentation gap across every multi-tier-payout product, not an isolated Zero omission. See `docs/research/e8-futures-articles.md` article 3.

3. **Daily Pause fixed-dollar base after a payout**: The Daily Pause article states the fixed $ threshold "never changes during the account's life" (i.e., pinned to the ORIGINAL initial balance forever) — https://helpfutures.e8markets.com/en/articles/11969807-daily-pause. But the payout-FAQ page states "Daily Drawdown or Daily Pause is never affected by payout requests. Once the payout is requested, those limits are calculated from your new balance." — https://helpfutures.e8markets.com/en/articles/15272556-everything-about-payouts-when-how-how-fast. These two statements are in tension (never-changes vs. recalculated-from-new-balance-post-payout) and are not reconciled anywhere found. **A risk governor should treat the post-payout Daily Pause recalculation behavior as unconfirmed** pending direct E8 clarification.
   **RESOLVED/REFINED 2026-08-02**: not resolved — the primary Daily Pause article (11969807), re-read in full today, is completely silent on payout interaction; it contains no language either confirming or contradicting either side. The contradiction stands exactly as before; 15272556 was not in this pass's URL list. Governor should keep treating this as an open question pending direct E8 support confirmation. See `docs/research/e8-futures-articles.md` article 4.

4. **35% Best Day Rule arithmetic**: on https://helpfutures.e8markets.com/en/articles/11865587-35-best-day-rule, Scenario A labels its multiplier "× 0.40" while computing a result ($665 on $1,900) that only reconciles with × 0.35 (the rule's own stated percentage) — an apparent typo. Separately, Scenario B computes "35% of Total profit ($3,100 × 0.35)" = "$1,085" one line, then cites a different, unreconciled threshold "$1,240" in the very next line's eligibility check on the same page. Both recorded verbatim; neither resolved.
   **RESOLVED/REFINED 2026-08-02**: not re-fetched — 11865587 was not in this pass's owner-supplied URL list, so status is unchanged. As a data point, this pass did fetch Zero's analogous 40%-Best-Day-Rule article (15936479) fresh and verified every worked example arithmetically clean (target $6,000, cap $2,400, all three scenarios check out exactly, including the recalculated-target case $2,500 ÷ 0.40 = $6,250). That suggests Signature's 35% page has an isolated page-level typo rather than the underlying mechanic being unreliable across products. See `docs/research/e8-futures-articles.md` article 6.

5. **"E8 Zero Futures is currently the only available product for this market"** — stated on https://helpfutures.e8markets.com/en/articles/10207237-available-trading-platforms — contradicts the current, actively-listed product catalog (both "E8 Signature Futures" and "E8 Zero (Starter and Max)" are current per https://helpfutures.e8markets.com/en/collections/10983843-products-rules). Resolved as stale copy referencing the now-legacy Zero Futures product.
   **RESOLVED/REFINED 2026-08-02**: reconfirmed still live verbatim today, word-for-word. This is not a one-time-observed artifact from the prior pass — E8 has not cleaned it up since. Treat as a persistent, not historical, stale-copy issue. See `docs/research/e8-futures-articles.md` article 18.

6. **"Applies to: E8 Signature" banner** on the live Futures trading-symbols tool (https://e8x.e8markets.com/trading-symbols) does not mention E8 Zero, even though the Instrument List help article states the same fee table explicitly covers "E8 Signature and E8 Zero Futures" (https://helpfutures.e8markets.com/en/articles/13001922-instrument-list-and-trading-hours). Likely just a default-context label, not a rules difference — but recorded as published, unreconciled text.
   **RESOLVED/REFINED 2026-08-02**: not re-verified — the live e8x.e8markets.com tool is not a help-center article and was not in this pass's owner-supplied URL list. Status unchanged. The Instrument List article side of this (13001922) was re-fetched and its fee table is confirmed to still apply identically to both products (no per-product fee differences found in the re-fetch). See `docs/research/e8-futures-articles.md` article 19.

**New, non-contradiction clarification (2026-08-02) — Signature-vs-Zero contract-limit question**: re-fetching 10155917 in full settles this: E8 Signature's page presents **one flat contract-cap table** with no Challenge/Performance split and no scaling mechanic; E8 Zero's page presents **two explicit tables** (a flat Challenge cap, and a profit-triggered scaling table for Performance). This is confirmed intentional product design, not an unreconciled discrepancy. The one wrinkle that does persist unchanged is internal to Zero alone: its own $50K Performance-stage ceiling (5 contracts at the 3%-profit-locked trigger) exceeds its own $50K Challenge-stage flat cap (4 contracts) — still published as-is, still not reconciled by E8. See `docs/research/e8-futures-articles.md` article 20.

---

## 7. NOT PUBLISHED (explicit gaps — never inferred)

- Margin per contract: Palladium (PA), E-mini Euro FX (7E), Micro CAD/USD (MCD), E-mini S&P MidCap 400 (EMD). **RECONFIRMED 2026-08-02**: all four still absent from the margin table on live re-fetch of 10155917 — not a stale or fixed gap.
- Full spec set (tick/value/fees/margin) for: Feeder Cattle (GF), Micro Natural Gas (MNG), the 7 CBOT rate/Treasury symbols (ZT/ZF/ZN/ZB/UB/TN/ZQ), the unnamed "Micro Silver" row, **and now also Micro Copper (MHG) — added 2026-08-02**, — plus whether any of these are actually tradable at all is itself unconfirmed.
- Which specific condition (account tier, size, or milestone) unlocks the 100% profit split mentioned for E8 Zero vs. its otherwise-uniform 80%.
- Exact CT-clock equivalent of the Daily Pause's "00:00 Server time" reset. **REFINED 2026-08-02**: server time is confirmed EU-style DST, switching "to UTC+2 at the beginning of November and to UTC+3 at the end of March" (article 10305202) — but the exact day-of-month of each switch, and therefore the precise CT-equivalent on any given date, is still NOT PUBLISHED. This calendar does not track the US CT/CDT DST calendar used for the trading-session hours, so the offset between the two clocks drifts through the year.
- Precise definition of "holding a position within 2% of a product's lock limit" (listed as a prohibited practice, mechanism/metric not further specified).
- The "List of targeted instruments T1 News Events" referenced in the news-trading article — link target not found/not live on that page.
- What happens to Best-Day/consistency-rule tracking across a payout boundary for Signature's 35% rule (page has a dangling "Best day after payout" heading with no body text under it).
- Any minimum trade size / minimum holding period beyond the ≥10-second component of the 50%-of-profit Tick Scalping rule.
- Data-feed or routing fee as a separate disclosed line item beyond the three itemized RT fee components.

---

## 8. Surprises relevant to a risk governor (Levelflow-specific implications)

1. **Two different clocks govern the account, and they don't share a DST calendar.** The Daily Pause's day boundary is "00:00 Server time" (UTC+2/UTC+3, **confirmed EU-style DST as of 2026-08-02**: switches "to UTC+2 at the beginning of November and to UTC+3 at the end of March," exact day-of-month still not published), while the trading session and forced-flatten happen at CT session boundaries (15:10 CT). A governor computing "has today's daily-loss limit reset yet" cannot just watch the CT session close — it must track server time independently, and the CT-to-server-time offset itself shifts on different calendar dates than the US DST changeover. Source: https://helpfutures.e8markets.com/en/articles/10305202-server-time + https://helpfutures.e8markets.com/en/articles/11969807-daily-pause.

2. **Daily Pause is not simply "2% of current balance."** It's 2% of the account's ORIGINAL initial balance, converted to a fixed dollar figure once, then subtracted fresh from each day's starting balance forever — meaning the effective daily-loss percentage of that day's actual balance silently drifts (tightens as the account grows, loosens as it shrinks) even though the underlying dollar amount is constant. A governor sizing positions off "2% of today's balance" would be subtly wrong.

3. **The EOD Dynamic Drawdown is a high-water-mark trailing stop that only ratchets on CLOSED profit, evaluated once daily — and it hard-locks at breakeven.** A losing day does not pull the floor back down (proven by E8's own worked table: Day 3's loss did not lower Day 2's already-ratcheted floor). Once the floor would reach the original starting balance, it freezes there permanently (or freezes at first payout, whichever is first) — except during E8 Zero's Challenge stage specifically, where it is explicitly stated to keep trailing past breakeven with no cap. A governor needs stage-aware (Challenge vs. Performance) and product-aware (Zero vs. Signature) logic, not one universal trailing formula.
4. **Zero has no daily loss limit at all — only Signature does, and only once funded.** A pure Zero-account governor only needs to defend the single EOD Dynamic Drawdown line; a Signature governor must defend two independent, differently-timed lines (Daily Pause + EOD Dynamic Drawdown) but only after the account is funded.

5. **Breach consequences differ sharply by rule** — Daily Pause = soft, resumes next day; EOD Dynamic Drawdown = permanent termination; Best Day Rule = no account risk at all, just a delayed/raised payout bar; wrong-contract-month or hedging-across-accounts = possible termination AND profit clawback. A single "risk of ruin" model is wrong; the governor needs per-rule severity weighting.

6. **The "Best Day" consistency rule is a target-recalculation mechanic, not a simple percentage cap** — and it uses two different bases depending on product/stage: Zero's Challenge-stage version measures against the *fixed profit target*; Signature's Performance-stage version measures against the *running total profit for the current payout period*. Position-sizing logic that tries to "stay under X% of profit in one day" needs to know which denominator applies.

7. **The HFT (>300 trades/day) and Tick-Scalping (≥50% of profit from trades held ≥10 seconds) rules are hard constraints on any automated strategy** — directly relevant since Levelflow's own automated risk-governor is itself the kind of tool these rules are aimed at. Any auto-trading logic built for E8 accounts must self-limit trade frequency and average holding period or risk a "prohibited practice" termination, independent of whether it stays inside the loss limits.

8. **E8 explicitly reserves subjective discretion**: "if a trader's approach shows signs of extreme behavior," E8's risk team can require an extended consistency-demonstration period, request a "random" interview, or unilaterally "de-risk your trading strategy," terminate, or withhold payouts — a rules-perfect governor is not a complete guarantee against account action. Source: https://helpfutures.e8markets.com/en/articles/10209270-trading-policies-and-prohibited-trading-strategies.

9. **No E8-side markup/spread appears to be published (or asserted to exist) for Futures**, unlike Forex on the same platform (which explicitly lists bid/ask spread data). Futures cost-of-trading for a governor's simulation is fully captured by the three RT fee components + exchange-native tick pricing, with no separate "E8 markup" line found.

---

## Programs found — quick index
- **E8 Signature Futures** — sizes $25K/$50K/$100K/$150K — https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures
- **E8 Zero MAX (Futures)** — sizes $50K/$100K/$200K — https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max
- **E8 Zero Starter (Futures)** — sizes $50K/$100K/$200K — same URL as above (shared article)
- **E8 Zero Futures (legacy/deprecated)** — sizes $50K/$100K/$250K/$500K — https://helpfutures.e8markets.com/en/articles/15702549-e8-zero-futures
- (Out of scope, confirmed Forex/Crypto-only, not offered on Futures: E8 One, E8 Pro, E8 Trial)
