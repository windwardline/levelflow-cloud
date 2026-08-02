# E8 Futures — Primary Article Extraction (owner-supplied URL list)

Fetched 2026-08-02 via direct browser navigation to `helpfutures.e8markets.com` (WebFetch via the r.jina.ai reader proxy was tested on article 1 and dropped several on-page tables to a summarization pass — abandoned in favor of reading each page's raw rendered text directly, tab by tab, for full numeric fidelity). All facts below are transcribed from the live page text as rendered on that date. Quotes are verbatim and kept ≤15 words except where a rule definition requires more; numeric tables are reproduced in full (every row). Anything the page does not state is marked **NOT STATED** — nothing here is inferred from outside knowledge.

**Note on scope**: the task specified "27 articles" but enumerated 24 distinct URLs (verified by counting the `·`-separated list twice). All 24 enumerated articles were fetched successfully by browser navigation; none failed. No jina/WebFetch fallback was needed after article 1.

---

## 1. E8 Signature Futures
**URL**: https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures
**Freshness**: "Updated over 2 weeks ago"

**FACTS**:
- "This is our 1-Step challenge - designed exclusively for Futures traders who value speed, clarity, and control."
- Two stages: **SimFi™ Challenge** → **SimFi™ Performance**.

**SimFi™ Challenge rules**:
| Account size | Profit Target | EOD Dynamic Drawdown |
|---|---|---|
| $25,000 | $1,500 | $1,000 |
| $50,000 | $3,000 | $2,000 |
| $100,000 | $6,000 | $3,000 |
| $150,000 | $9,000 | $4,500 |

- Inactivity rule: "no time limit, however, after 7 days of inactivity, the account is disabled."
- EOD Dynamic Drawdown definition (verbatim, ≤15 words): "It only updates once per day at market close." "It locks permanently at the initial balance level."

**SimFi™ Performance rules**:
- Reach Performance stage by completing the Challenge (all rules + profit target). "Users who follow the guardrails... are eligible to receive 80% of their trading performance."
- Inactivity rule: same 7-day disable.
- Daily Pause definition (verbatim): "A soft daily loss limit based on your starting balance of the day. If your floating or closed loss reaches 2%, trading stops until the next day. Your account is not breached."

| Account size | Daily Pause $ | EOD Dynamic Drawdown $ |
|---|---|---|
| $25,000 | $500 | $1,000 |
| $50,000 | $1,000 | $2,000 |
| $100,000 | $2,000 | $3,000 |
| $150,000 | $3,000 | $4,500 |

**Payout criteria**:
- 35% Best Day rule (quote, ≤15 words): "no single trading day exceeds more than 35% of your total generated profits."
- Minimum payout: $100 net ("with 80% payout, you need to request at least $125").
- Minimum profitable days between payouts: 5 ("does not apply for first payout"). A profitable day = "realized closed PnL equals to 0.3% or more." Profitable-day counter "reset to 0" after each payout request.
- Profitable-day $ threshold (0.3% of size) shown explicitly: $75 ($25K) / $150 ($50K) / $300 ($100K) / $450 ($150K).
- Payout buffer (quote): "leave a buffer in your account in the same size as your EOD Dynamic Drawdown. The buffer can not be requested." Worked example given: "$100,000... EOD is 3%... buffer is $3000" (illustrative — Signature's actual $100K EOD is 3%/$3,000, consistent).
- Max payouts per account: 5, then "the cycle is closed, the account is deactivated, and you move on with the free Challenge of the same size." Applies "only to the Signature Futures account purchased after 14.07.2026 20:00 UTC+2."
- Payout mechanism: "only profit earned during the current cycle is eligible... Unused profits from previous cycles don't carry over" — same 14.07.2026 20:00 UTC+2 cutoff.

**Payout caps** (max $ per single request):
| Payout # | $25,000 | $50,000 | $100,000 | $150,000 |
|---|---|---|---|---|
| 1st | $1,000 | $1,250 | $2,250 | $3,250 |
| 2nd | $1,000 | $1,250 | $2,250 | $3,250 |
| 3rd | $1,250 | $2,250 | $3,250 | $4,250 |
| 4th | $1,250 | $2,250 | $3,250 | $4,250 |
| 5th+ | $1,500 | $3,250 | $4,250 | $5,250 |
(Site prints the $50K/4th cell as "$2250" without a comma — same value, formatting artifact only.)

**Trading hours**: "permitted trading hours are between 17:00 to 15:10 CT." "All open positions are being forced to close every day at 15:10 CT."
- **Copy-paste artifact**: this sentence appears on the *Signature* page verbatim as "It is not possible to hold positions overnight on **the E8 Zero Futures model**" — wrong product name embedded in the Signature article (see companion dossier note; related to, but a distinct sentence from, the previously-flagged "Forex" news-trading typo).

**News trading**: "You can trade news on E8 Signature **Forex** without any restrictions" — the product-name/market-name typo the dossier already flagged (Contradiction #1) is reconfirmed live, verbatim, unchanged.

**Copy trading**: "E8 Markets allows copy trading across all accounts... as long as these accounts belong to you."

**Max contract sizes**:
| Account Balance | Maximum Contract Size |
|---|---|
| $150,000 | 12 Contracts ($120,000 margin) |
| $100,000 | 8 Contracts ($80,000 margin) |
| $50,000 | 4 Contracts ($40,000 margin) |
| $25,000 | 2 contracts ($20,000 margin) |

- NOT STATED on this page: precise definition of "high-impact news releases"; hedging-policy detail (deferred to another article).

---

## 2. E8 Zero (Starter and Max)
**URL**: https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max
**Freshness**: "Updated over a week ago"

**FACTS**:
- "Built for Futures traders who want minimal payout restrictions." Consistency rule "only in the challenge stage" — Performance stage has "no consistency rules, no daily profit cap, and no minimum profit requirements." "The only limitations are payout caps and a maximum of 5 payouts per account."
- Starter vs Max: "Both versions have identical rules; the only difference is... Starter version is cheaper with smaller payout caps, and Zero Max... offers bigger payout caps."

**SimFi™ Challenge rules**:
| Account size | Profit Target |
|---|---|
| $50,000 | $3,000 |
| $100,000 | $6,500 |
| $200,000 | $13,500 |

- "No minimum Trading days." "There is no time limit, but you need to place and close at least one trade every 7 days."
- 40% Best Day rule (quote): "no single trading day exceeds more than 40% of your total generated profits."
- "The earliest you can pass phase-1 on E8 Zero is 3 days from the start of your trading period... 3 days is the fastest the math can work in your favour."
- "3% EOD-Dynamic Drawdown."

**SimFi™ Performance rules**:
- "Users who follow the guardrails... are eligible to receive **80% or 100%** of their trading performance" — no criterion stated for which applies (reconfirms dossier Contradiction #2, unresolved, still live).
- 3% EOD-Dynamic Drawdown, same lock-at-initial-balance language as Signature.

**Payout criteria**: "No consistency rules / No minimum trading days / No minimum profitable days / No Daily profit cap." "You can request it every day!" Minimum payout $100. "Free reset every time after achieving 5 payouts on a single account."

**Payout caps** (based on account size, not payout sequence):
| Size | Zero Starter | Zero Max |
|---|---|---|
| $50,000 | $1,000 | $3,000 |
| $100,000 | $1,600 | $5,000 |
| $200,000 | $2,100 | $7,000 (printed "$7.000") |

- Max 5 payouts per account → cycle closes → account deactivated → "move on with the free Challenge of the same size."

**News trading**: "You can trade news on E8 Zero without any restrictions" (correct product name here, unlike the Signature page).

**Trading hours**: same 17:00–15:10 CT window; force-close at 15:10 CT. (This page does *not* contain the "E8 Zero Futures model" overnight sentence at all — it appears only on the Signature page and the dedicated overnight article.)

- NOT STATED: which condition (tier/size/milestone) unlocks the 100% payout split.

---

## 3. All product overviews (E8 One vs E8 Zero vs E8 Pro vs E8 Signature)
**URL**: https://helpfutures.e8markets.com/en/articles/13106558-all-product-overviews-e8-one-vs-e8-zero-vs-e8-pro-vs-e8-signature
**Freshness**: "Updated over 2 weeks ago"

**FACTS**: "All of our currently offered products are Single-Phase challenge models."
- E8 Zero: "most flexible... built for Futures traders." Consistency rule only in Challenge stage.
- E8 One: "designed for experienced traders comfortable with tighter Drawdowns... no payout caps, but a Daily Drawdown (hard breach) and a Dynamic Drawdown apply. Available on Forex and Crypto."
- E8 Signature: "more structured and cheaper... includes payout caps and a Daily Pause (soft breach) on SimFi Performance Accounts... Available across Forex, Crypto, and Futures."
- E8 Pro: "built for traders who prioritize daily payouts. With no payout caps and a static drawdown... Available on Forex and Crypto."

**Key differences table**:
| | E8 Zero | E8 One | E8 Signature | E8 Pro |
|---|---|---|---|---|
| Markets | Futures | Forex, Crypto | Forex, Crypto, Futures | Forex, Crypto |
| Daily limit | No | Daily Drawdown (Hard breach) — Challenge and Performance | Daily Pause (soft Breach) — Performance only | Daily Drawdown (Hard breach) — Challenge and Performance |
| Max. limits | EOD Dynamic Drawdown; moves on closed EOD profit only; "became static once you reach the starting balance amount" | Dynamic Drawdown; moves only on closed profit; static once at starting balance | EOD Dynamic Drawdown; same static-at-starting-balance behavior | Static Drawdown — "Fixed. Only moves when you request the first payout" |
| Payout Caps | Yes, max 5 payouts/account | No | Payout caps table (yes) | No |
| Consistency | Challenge: 40% best day; Performance: No | Challenge: No; Performance: 40% best day | Challenge: No; Performance: 35% best day | No best day — "requirement is 1% profit and 2% Daily profit cap" |
| Best for | "easiest product out there" | "full potential tied to verified performance" | "more forgiving drawdown rules... focusing on consistency" | "controlled account with daily payouts" |

**Other Parameters table**:
| | E8 Zero | E8 One | E8 Signature | E8 Pro |
|---|---|---|---|---|
| News Trading | Yes | Challenge: Yes; Performance: No | Yes | Yes |
| Weekend Holding | Futures - No | Yes | No | Yes |
| Expert Advisors | Futures - No | Yes | Forex,Crypto - Yes; Futures - No | Yes |
| Trade Copier | Yes | Yes | Yes | Yes |
| Overnight holding | No | Yes | No | Yes |
| Leverage | Futures - (link) | (link) | Forex,Crypto - (link); Futures - (link) | (link) |
| Payout | 80%, 100% | 80%, 90%, 100% | 80% | 80%, 100% |

- NOT STATED (again): which tier unlocks Zero's 100% (or Pro's 100%, or One's 90%/100%) split — no product row in this comparison names the unlocking condition.

---

## 4. Daily Pause
**URL**: https://helpfutures.e8markets.com/en/articles/11969807-daily-pause
**Freshness**: "June 18, 2026" (absolute date shown, not a relative "Updated X ago" marker)

**FACTS**:
- Scope (verbatim): "Available on SimFi™ Performance stage (only) for: E8 Signature Forex, E8 Signature Crypto, E8 Signature Futures."
- Mechanic: "We take 2% of your initial Balance and convert it to a fixed $." "Every new day, we set your pause line = Balance of the new day − that fixed $." "If equity or balance falls below that line, we pause trading until 00:00 (server time)." "Daily Pause is not a hard breach; you can still continue trading the next day."
- Execution-lag caveat (verbatim, ≤15 words): "we don't rebalance if it takes you past −2%."

**Worked example A ($100,000 initial, fixed $ = $2,000)**:
| Day | Starting balance | Pause line (Loss Level) | Result if exceeded |
|---|---|---|---|
| 1 | $100,000 | $98,000 | Trading paused to 00:00 |
| 2 | $102,500 | $100,500 | Trading paused to 00:00 |
| 3 | $99,200 | $97,200 | Trading paused to 00:00 |

**Worked example B ($50,000 initial, fixed $ = $1,000)**:
| Day | Starting balance | Pause line (Loss Level) | Result if exceeded |
|---|---|---|---|
| 1 | $50,000 | $49,000 | Trading paused to 00:00 |
| 2 | $51,250 | $50,250 | Trading paused to 00:00 |
| 3 | $49,000 | $48,000 | Trading paused to 00:00 |

- Explicit note: "The fixed $ never changes during the account's life; only the starting balance of the day changes the pause line."
- "Coach Play": suggests planning stop-losses at $1,600–$1,800 if the fixed $ is $2,000, to buffer against slippage.
- Reset clock: "00:00 Server time" (not CT).
- No rebalance/reprieve if slippage causes overshoot past −2%: "we bear no risk and you are not entitled to any rebalance."
- This page is **silent** on what happens to the fixed-$ figure after a payout is processed — no mention of recalculation. (The dossier's Contradiction #3 — a *different* article, 15272556, states Daily Pause recalculates off the new post-payout balance — is not addressed or referenced here at all.)

---

## 5. EOD Dynamic Drawdown
**URL**: https://helpfutures.e8markets.com/en/articles/11864596-eod-dynamic-drawdown
**Freshness**: "Updated over 2 weeks ago"

**FACTS**:
- Scope: "Available for: E8 Signature Forex, E8 Signature Crypto, E8 Signature Futurex [sic], E8 Zero." (Site typo: "Futurex.")
- Mechanic (verbatim): "Your Loss Level rises (at the EOD) only when you close a profit, NOT when your equity increases." "Once your account reaches a closed profit in the amount of EOD Dynamic Drawdown or you request your first payout, the Drawdown locks on the initial balance level, becomes fully static... (this does not apply in challenge of E8 Zero)."
- "It updates at the end of the day (not tick-by-tick), so intraday swings can breathe."
- Formula: "Highest End-of-the-day balance − Drawdown amount (3%) = Loss level."

**Starting-state example**:
| Starting Balance | EOD Dynamic Drawdown (3%) | Loss level |
|---|---|---|
| $100,000 | $3,000 | $97,000 |

**Worked ratchet table** (proves the floor never falls on a losing day):
| Day | Scenario | End-of-day balance | Tomorrow's Loss Level |
|---|---|---|---|
| 1 | Start $100,000, loss level $97,000, close $1,000 profit | $101,000 | $98,000 |
| 2 | Close $1,000 profit | $102,000 | $99,000 |
| 3 | Close -$1,000 loss | $101,000 | $99,000 (unchanged) |
| 4 | Close $3,000 profit | $104,000 | $100,000 (locked) |
| 5+ | EOD DD locked, static, no further movement | — | $100,000 (Locked) |

- Breach consequence (verbatim): "your account will be permanently closed for breaching the EOD Dynamic Drawdown rule." No overshoot reprieve: "closing your balance above the loss level after you breach the drawdown level won't prevent the account from being violated and permanently closed."
- Zero-Challenge exception (verbatim): "the loss level is not being locked at the initial balance and can go further."

---

## 6. 40% best day rule (challenge)
**URL**: https://helpfutures.e8markets.com/en/articles/15936479-40-best-day-rule-challenge
**Freshness**: "Updated over 2 weeks ago"

**FACTS**:
- Scope: "available for E8 Zero Max and Starter in the challenge stage (or E8 One, E8 One Crypto in the Performance stage, which has a different article...)" — E8 One is Forex/Crypto-only, out of Futures scope, noted only for completeness.
- Rule (verbatim, ≤15 words): "Your profit should not exceed 40% of the total profit target in a single day."
- If breached: "your profit target increases by the amount you made over that limit."

**Worked example ($6,000 profit target; 40% cap = $2,400)**:

*Scenario A — valid:*
| Day | Profit |
|---|---|
| 1 | +$2,000 |
| 2 | +$2,000 |
| 3 | +$2,000 |
Total $6,000; Best Day $2,000 → Valid (below $2,400 cap).

*Scenario A2 — valid, at the exact limit:*
| Day | Profit |
|---|---|
| 1 | +$2,400 |
| 2 | +$2,400 |
| 3 | +$1,200 |
Total $6,000; Best Day $2,400 → Valid (exactly at the 40% cap).

*Scenario B — invalid:*
| Day | Profit |
|---|---|
| 1 | +$2,500 (Best Day) |
| 2 | +$2,000 |
| 3 | +$1,500 |
Total $6,000 nominal; Best Day $2,500 → Invalid (exceeds $2,400 cap). "The new effective target becomes $2,500 ÷ 0.40 = $6,250."

- Anti-circumvention (verbatim): "Intentionally attempting to bypass the Best Day Rule by splitting a large winning position through hedging or partial closures is not allowed and may result in all profit from that position being consolidated into a single day." Three named example patterns given: (1) partial closes of one large position across days, (2) multiple same-day opens closed across different days treated as "a single trade idea," (3) immediate close-and-reopen across days treated as "a single trade idea with identical market exposure."

---

## 7. Can I hold positions overnight?
**URL**: https://helpfutures.e8markets.com/en/articles/10149596-can-i-hold-positions-overnight
**Freshness**: "Updated over 3 weeks ago"

**FACTS**:
- "It is not possible to hold positions overnight on the E8 Zero Futures model." (Same product-name artifact discussed under article 1 — this dedicated article names only "E8 Zero," even though the rule is confirmed product-wide via article 3's comparison table.)
- "All open positions are being forced closed each day at 15:10 CT."

---

## 8. Can I trade news?
**URL**: https://helpfutures.e8markets.com/en/articles/10209321-can-i-trade-news
**Freshness**: "Updated over 2 weeks ago"

**FACTS**:
- Canonical, correctly-worded statement: "You can trade news on E8 Zero or E8 Signature accounts without any restrictions (This includes SimFi™ challenge account (phase-1) and SimFi™ performance Account)."
- "E8 Markets cannot protect users from positions closing beyond their expected level."
- T1 News Events definition (verbatim, new): "economic or geopolitical announcements that have the potential to significantly influence financial markets. This includes, but is not limited to, central bank decisions, economic indicators, and major political events."
- References "our economic calendar" and a "List of targeted instruments T1 News Events" — **NOT STATED**: the actual link target/content of that instrument list was not present as retrievable text on the page (matches dossier's existing gap).

---

## 9. Trading Policies and Prohibited Trading Strategies
**URL**: https://helpfutures.e8markets.com/en/articles/10209270-trading-policies-and-prohibited-trading-strategies
**Freshness**: "May 22, 2026"

**FACTS** — List of Prohibited Practices (Futures):
- Exploiting simulated-market imperfections (gapped/illiquid market trading, slow data feeds).
- Exploiting service errors (mispriced displays, delayed updates).
- "Semi-Automated or Fully-Automated Trading, such as trading bots, AI tools, HFT trading (**more than 300 trades per day**)."
- "Holding a position within 2% of a product's lock limit." **NOT STATED**: what "lock limit" metric means precisely — still undefined.
- Trading in conflict with E8's T&Cs.
- "Irresponsible Trading and All-or-Nothing Trading."
- "Hedging across multiple users or accounts, even those belonging to the same trader, is strictly prohibited."
- "Compliance with CME Group Rules" required.
- Tick Scalping (verbatim, ≤15 words): "A minimum of 50% of all profits must come from trades with a holding period of no less than 10 seconds."
- Catch-all: strategies must be "demonstrably replicable under both simulated and real market conditions," explicitly naming as disallowed: "micro-scalping during illiquid market hours, trading illiquid instruments, excessive or disproportionate risk-taking, **account rolling**" — "account rolling" appears here as a named prohibited concept; **NOT STATED** what it means precisely (distinct from "contract rolling," which is covered in article 22 and is not prohibited — it is mandatory).
- Front-month mandatory (verbatim): "All users are required to always trade the Front Month Contract on every instrument... the contract with the highest Volume (liquidity)." "Trading in the incorrect Month Contract may also result in termination of your account or deduction of profit made from trades on the incorrect contract."
- Account/capital-allocation rules: "Each SimFi Challenge and Performance Account must be traded independently. Cooperation with other traders — in any form — is not permitted." Copy trading across a trader's own accounts remains allowed.
- Penalty (verbatim): "termination from our program and a refund of the fee paid from the account where this rule was broken." Pre-funding compliance review stated; "E8 Markets reserves the right to de-risk your trading strategy."
- Discretionary review: "If a trader's approach shows signs of extreme behavior, their trading may be subject to review by our risk team who may require consistency over a longer period of time." Failure to demonstrate consistency → "impose restrictions... terminate the agreement, or withhold payouts."
- Interview policy: "not part of every challenge completion or payout request... not standard practice, and it is a random procedure." Purpose: understand trading background, risk-management approach, strategy behind performance data. "It is not an interrogation."

---

## 10. Can I copy trades or trade as a team?
**URL**: https://helpfutures.e8markets.com/en/articles/9453469-can-i-copy-trades-or-trade-as-a-team
**Freshness**: "May 14, 2026"

**FACTS**:
- "E8 Markets allows copy trading across all accounts, including SimFi™ Challenge account and SimFi™ Performance account or personal accounts, as long as these accounts belong to you."
- Named tool: "For MatchTrader (MTR), https://danetrades.com/ is available" (MatchTrader is E8's Forex/Crypto platform per other E8 docs — not the Futures/Tradovate platform; noted for completeness, not directly Futures-applicable).
- "We do not allow teams to make the same trades or copy trades... and we also do NOT permit signal services."
- "It is a violation of our rules for users to make multiple E8X Profiles and exceed the maximum capital allocation rule."

---

## 11. How many accounts can I apply for at once?
**URL**: https://helpfutures.e8markets.com/en/articles/5515039-how-many-accounts-can-i-apply-for-at-once
**Freshness**: "Updated over 2 weeks ago"

**FACTS**:
- Challenge stage (Phase 1), all products: "UNLIMITED."
- Performance-stage maximum allocation:
  - E8 One = $500,000
  - E8 One Crypto = $500,000
  - E8 Pro Forex = $500,000
  - E8 Pro Crypto = $500,000
  - **E8 Zero = 3 performance accounts** (count-based, not $-based)
  - **E8 Signature Forex = 5 performance accounts**
  - **E8 Signature Crypto = 5 performance accounts**
  - **E8 Signature Futures = 5 performance accounts**
- "This means that in the SimFi™ Performance accounts, you can manage up to $4,850,000 in Simulated capital at the same time!" (aggregate across all products combined, not Futures-specific.)
- **Household/IP pooling rule (new)**: "These allocation limits apply per household. Multiple users within the same residence/same IP must not exceed this collective maximum."
- Worked example given for E8 One reserve-account mechanic (buy 3 Challenge accounts of different sizes; only accounts up to the $500K cap become active in Performance; excess "kept as a reserve until your allocation on the Performance stage drops below the limit"). Same reserve logic stated for Signature: "you can only actively manage 5 performance accounts for each market in the Performance stage at any given time; any additional accounts will be kept in reserve."
- Single User (E8X) Profile policy: one registered profile per person; multiple profiles under different emails = T&C violation, "temporary or permanent suspension." Accidental duplicate profiles: contact support@e8markets.com for deletion.

---

## 12. Is there any inactivity rule?
**URL**: https://helpfutures.e8markets.com/en/articles/9453425-is-there-any-inactivity-rule
**Freshness**: "June 22, 2026"

**FACTS**:
- "After 60 or 7 days of inactivity (Depending on the market), the account will be closed." "You need to place and close at least one trade within this 7 or 60-day period." Applies "also... to newly purchased accounts without any trading history."
- "60 Day inactivity applies to all Forex/Crypto accounts." **"7 Day inactivity applies to all Futures accounts"** — matches the 7-day figure used throughout the product articles.
- "There is no minimum lot size requirement to maintain your account. Even a micro-trade of 0.1 lots counts as a qualifying trade to prevent deactivation." (Note: "lots"/"0.1 lots" is Forex-flavored phrasing; the page does not restate this in Futures contract-count terms — presented as general policy language, not confirmed to map literally onto a "0.1 contract" for Futures, since Futures contracts aren't fractionable the way this sentence implies. Recorded verbatim; **NOT STATED** how this literally applies to a whole-contract Futures product.)
- Travel accommodation: contact Support@E8markets.com before an planned absence to avoid deactivation.

---

## 13. What broker do I trade with?
**URL**: https://helpfutures.e8markets.com/en/articles/5515412-what-broker-do-i-trade-with
**Freshness**: "May 20, 2026"

**FACTS**:
- "E8 Markets is not a broker and does not accept users' deposits. E8 Markets provides a structured simulation environment..."
- "E8's simulated environment is powered by real market data from third-party institutional data providers. Market data for Futures products is sourced directly from **CME** (Chicago Mercantile Exchange)."

---

## 14. Account reset
**URL**: https://helpfutures.e8markets.com/en/articles/11640147-account-reset
**Freshness**: "May 22, 2026"

**FACTS** (new territory — full mechanics):
- "If you have failed an account at any stage, you are eligible for a **10% discount** to restart your journey from the Challenge phase."
- Trigger: option "will appear in your dashboard once you fail one of your accounts." Trader clicks "retry" on the failed account → "generate[s] a new order with the applied discount code" → pay immediately → "start your journey from the challenge phase again."
- "This 10% discount will be set for the same settings of the account you failed" — i.e., same size/configuration as the failed account, not a free choice of new parameters.
- How to redeem: log in to dashboard → Account overview → scroll to "Closed accounts" section → click retry.
- **Availability window: "only valid for 7 days following the account failure."**
- "Consistency: The discount applies to the same account size and settings as the failed account."
- "Existing Orders: If you already clicked the button, your discounted invoice is waiting in your Order List."
- **NOT STATED**: whether this reset offer is available more than once per failure, whether it differs by product (Signature vs Zero), or any cap on total resets.

---

## 15. Do you offer certificates for passing?
**URL**: https://helpfutures.e8markets.com/en/articles/14595232-do-you-offer-certificates-for-passing
**Freshness**: "April 13, 2026"

**FACTS**:
- **Challenge-passing certificate**: downloadable from account-overview dashboard section. "The certificate is not immediately accessible after completing the profit target. You can access it only if your SimFi™ Performance account is created, which usually takes **30–120 minutes** after finishing the Challenge stage."
- **Payout certificate** and **Total Payout certificate**: available per-payout and cumulative, from the Payout History dashboard section.
- "Each certificate comes with a unique QR code and number" for third-party validation of authenticity.

---

## 16. Server time
**URL**: https://helpfutures.e8markets.com/en/articles/10305202-server-time
**Freshness**: "March 13, 2026"

**FACTS** (resolves/sharpens dossier Surprise #1 — precise DST calendar):
- "Due to Daylight Saving Time, at the beginning of spring and at the end of autumn, the Server time is being changed."
- **"The Server time is being changed to UTC + 2 at the beginning of November and to UTC + 3 at the end of March."**
- "Currently, the server time is set to UTC + 3" (as observed on this fetch/page).
- This is a EU-style DST calendar (spring-forward end of March, fall-back start of November) — distinct from the US CT/CDT DST calendar (second Sunday of March / first Sunday of November) governing the 17:00–15:10 CT trading-hours window. The two clocks' offset from each other therefore drifts for the days each year when one region has already switched and the other hasn't.

---

## 17. How to properly secure my account?
**URL**: https://helpfutures.e8markets.com/en/articles/6075730-how-to-properly-secure-my-account
**Freshness**: "May 28, 2026"

**FACTS**:
- Account-security guidance only, not risk-rule content: users "responsible for ensuring that no one gets into their accounts"; must not share login credentials; late-reported account-compromise complaints "will not be accepted."
- 2FA setup flow: dashboard → account settings → User settings → enable 2FA → scan QR with an authenticator app (e.g. Google Authenticator) → enter generated code.
- Changing the Trading Platform password requires 2FA to be enabled first; done via a "regenerate" button next to the relevant platform key in account overview.
- No numeric/rule facts relevant to position sizing or risk governance.

---

## 18. Available Trading platforms
**URL**: https://helpfutures.e8markets.com/en/articles/10207237-available-trading-platforms
**Freshness**: "Updated over 3 weeks ago"

**FACTS**:
- "At this moment, Tradovate is the only available trading platform for Futures SimFi trading **(E8 Zero Futures is currently the only available product for this market)**." — **This stale parenthetical is still live on the page verbatim as of 2026-08-02** (dossier Contradiction #5 is not a one-time-observed artifact from a prior pass; it persists unresolved today, notwithstanding the current, actively-sold Signature+Zero(Starter/MAX) lineup).
- Hedging vs netting (verbatim): "all Forex and Crypto Challenges and Performance accounts are using a hedging system, while Futures products are using a netting system." Netting definition: "if you hold a position and open a new position in the opposite direction with the same volume, the new position will effectively cancel out the original position."
- Cross-account hedging clarification (verbatim, refines dossier's existing extraction): "opening equal Long and Short trades on the same instrument across multiple accounts is strictly prohibited. You are only permitted to hedge positions within the same single Challenge or Performance account."

---

## 19. Instrument list and trading hours
**URL**: https://helpfutures.e8markets.com/en/articles/13001922-instrument-list-and-trading-hours
**Freshness**: "Updated over 3 weeks ago"

**FACTS**: "the permitted trading hours on Futures are between 17:00 to 15:10 CT... all open positions are being forced to close every day at 15:10 CT." All times below are CT. This is the **complete, full reproduction** of the fee/hours table (45 instruments across 7 exchange-group headers, exactly as the page groups them) — cross-checked cell-by-cell against the dossier's existing master table: **zero numeric drift found; every commission/exchange/clearing figure below is identical to the prior pass.**

**CME Equity Futures** (hours 17:00–16:00 CT for all rows in this group):
| Symbol | Product | Commission (RT) | Exchange and NFA (RT) | Clearing (RT) |
|---|---|---|---|---|
| EMD | E-mini S&P MidCap 400 | $2.58 | $0.52 | $0.38 |
| ES | E-mini S&P 500 | $2.58 | $2.80 | $0.38 |
| MES | Micro E-mini S&P | $0.78 | $0.74 | $0.38 |
| NKD | Nikkei | $2.58 | $2.80 | $0.38 |
| NQ | E-mini NASDAQ 100 | $2.58 | $2.80 | $0.38 |
| MNQ | Micro E-mini NASDAQ 100 | $0.78 | $0.74 | $0.38 |
| RTY | E-mini Russell 2000 | $2.58 | $2.80 | $0.38 |
| M2K | Micro E-mini Russell 2000 | $0.78 | $0.74 | $0.38 |
| MBT | Micro E-mini Bitcoin | $0.78 | $2.04 | $0.38 |
| MET | Micro E-mini Ether | $0.78 | $2.04 | $0.38 |

**CME Foreign Exchange Futures** (hours 17:00–16:00 CT for all rows):
| Symbol | Product | Commission (RT) | Exchange and NFA (RT) | Clearing (RT) |
|---|---|---|---|---|
| 6A | Australian $ | $2.58 | $3.24 | $0.38 |
| M6A | Micro AUD/USD | $0.78 | $0.52 | $0.38 |
| 6B | British Pound | $2.58 | $3.24 | $0.38 |
| M6B | Micro British Pound | $0.78 | $0.52 | $0.38 |
| 6C | Canadian $ | $2.58 | $3.24 | $0.38 |
| 6E | Euro FX | $2.58 | $3.24 | $0.38 |
| 7E | E-mini Euro FX | $2.58 | $1.74 | $0.38 |
| M6E | Micro Euro | $0.78 | $0.52 | $0.38 |
| MCD | Micro CAD/USD | $0.78 | $0.52 | $0.38 |
| 6J | Japanese Yen | $2.58 | $3.24 | $0.38 |
| 6S | Swiss Franc | $2.58 | $3.24 | $0.38 |
| 6M | Mexican Peso | $2.58 | $3.24 | $0.38 |
| 6N | New Zealand $ | $2.58 | $3.24 | $0.38 |

**CME Agricultural Futures** (hours 17:00–16:00 CT; page header says "Monday to Friday" for this group only, vs "Sunday to Friday" elsewhere):
| Symbol | Product | Commission (RT) | Exchange and NFA (RT) | Clearing (RT) |
|---|---|---|---|---|
| LE | Live Cattle | $2.58 | $4.24 | $0.38 |
| HE | Lean Hogs | $2.58 | $4.24 | $0.38 |

**NYMEX Futures** (hours 17:00–16:00 CT):
| Symbol | Product | Commission (RT) | Exchange and NFA (RT) | Clearing (RT) |
|---|---|---|---|---|
| CL | Crude Oil | $2.58 | $3.04 | $0.38 |
| MCL | Micro Crude Oil | $0.78 | $1.04 | $0.38 |
| QM | E-mini Crude Oil | $2.58 | $2.44 | $0.38 |
| NG | Natural Gas | $2.58 | $3.24 | $0.38 |
| QG | E-mini Natural Gas | $2.58 | $1.04 | $0.38 |
| RB | RBOB Gasoline | $2.58 | $3.04 | $0.38 |
| HO | Heating Oil | $2.58 | $4.24 | $0.38 |

**CBOT Commodity Futures** (hours **19:00–13:20 CT** — the one group that differs from the standard window):
| Symbol | Product | Commission (RT) | Exchange and NFA (RT) | Clearing (RT) |
|---|---|---|---|---|
| ZC | Corn | $2.58 | $4.24 | $0.38 |
| ZW | Wheat | $2.58 | $4.24 | $0.38 |
| ZS | Soybeans | $2.58 | $4.24 | $0.38 |
| ZM | Soybean Meal | $2.58 | $4.24 | $0.38 |
| ZL | Soybean Oil | $2.58 | $4.24 | $0.38 |

**CME CBOT Equity Futures** (hours 17:00–16:00 CT):
| Symbol | Product | Commission (RT) | Exchange and NFA (RT) | Clearing (RT) |
|---|---|---|---|---|
| YM | Mini-DOW | $2.58 | $2.80 | $0.38 |
| MYM | Micro Mini-DOW | $0.78 | $0.74 | $0.38 |

**COMEX Futures** (hours 17:00–16:00 CT):
| Symbol | Product | Commission (RT) | Exchange and NFA (RT) | Clearing (RT) |
|---|---|---|---|---|
| GC | Gold | $2.58 | $3.24 | $0.38 |
| MGC | Micro Gold | $0.78 | $1.24 | $0.38 |
| SI | Silver | $2.58 | $3.24 | $0.38 |
| HG | Copper | $2.58 | $3.24 | $0.38 |
| PL | Platinum | $2.58 | $3.24 | $0.38 |
| PA | Palladium | $2.58 | $3.24 | $0.38 |

**Total: 45 instruments**, confirming the dossier's headline count. This fee table's "NG" row is spelled correctly here (unlike article 21 below).

---

## 20. Max. available Contract Sizes
**URL**: https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes
**Freshness**: "Updated over 2 weeks ago"

**FACTS**: This is the **complete reproduction** of both the per-account contract-cap tables and the full per-instrument margin table. Cross-checked cell-by-cell against the dossier's existing tables: **zero numeric drift.**

**E8 Zero Futures SimFi Challenge**:
| Account Balance | Maximum Contract Size |
|---|---|
| $200,000 | 10 Contracts ($100,000 margin) |
| $100,000 | 8 Contracts ($80,000 margin) |
| $50,000 | 4 contracts ($40,000 margin) |

**E8 Zero Futures SimFi Performance** (profit-triggered scaling):
| Account Balance | Starting Maximum Contract | Trigger 1 (1.5% profit locked) | Trigger 2 (3% profit locked) |
|---|---|---|---|
| $200,000 | 4 Contracts ($40,000 margin) | 7 ($70,000 margin) | 10 ($100,000 margin) |
| $100,000 | 3 Contracts ($30,000 margin) | 5 ($50,000 margin) | 8 ($80,000 margin) |
| $50,000 | 2 contracts ($20,000 margin) | 3 ($30,000 margin) | 5 ($50,000 margin) |

- "The account scales automatically at the start of each new trading day." "In E8 Zero challenge, the contract sizes remain the same based on the numbers in the table above" (i.e., no scaling in Challenge — flat cap only).

**E8 Signature** (single flat table — **no Challenge/Performance split and no scaling mechanic is presented for Signature anywhere on this page**, structurally confirming the dossier's existing assumption that Signature's cap is stage-invariant):
| Account Balance | Maximum Contract Size |
|---|---|
| $150,000 | 12 Contracts ($120,000 margin) |
| $100,000 | 8 Contracts ($80,000 margin) |
| $50,000 | 4 Contracts ($40,000 margin) |
| $25,000 | 2 contracts ($20,000 margin) |

- Calculation rule (verbatim): "Allowed margin / Margin per contract = size of the position." Two worked examples given for 12-contract and 8-contract allowances translating margin into position size across ES, MES, and Silver as sample instruments.

**Required Margin per 1 contract — full table, by E8's own category headers**:

*CME Equity Futures* (note: **EMD absent from this table** — margin NOT STATED):
| Symbol | Product | Margin/contract |
|---|---|---|
| ES | E-mini S&P 500 | $10,000 |
| MES | Micro E-mini S&P | $1,000 |
| NKD | Nikkei | $10,000 |
| NQ | E-mini NASDAQ 100 | $10,000 |
| MNQ | Micro E-mini NASDAQ 100 | $1,000 |
| RTY | E-mini Russell 2000 | $10,000 |
| M2K | Micro E-mini Russell 2000 | $1,000 |
| MBT | Micro E-mini Bitcoin | $1,000 |
| MET | Micro E-mini Ether | $1,000 |

*CME Foreign Exchange Futures* (note: **7E and MCD absent** — margin NOT STATED for both; figures printed with a period, e.g. "$10.000," transcribed here as $10,000):
| Symbol | Product | Margin/contract |
|---|---|---|
| 6A | Australian $ | $10,000 |
| M6A | Micro AUD/USD | $1,000 |
| 6B | British Pound | $10,000 |
| M6B | Micro British Pound | $1,000 |
| 6C | Canadian $ | $10,000 |
| 6E | Euro FX | $10,000 |
| M6E | Micro Euro | $1,000 |
| 6J | Japanese Yen | $10,000 |
| 6S | Swiss Franc | $10,000 |
| 6M | Mexican Peso | $10,000 |
| 6N | New Zealand $ | $10,000 |

*CME Agricultural Futures* (note: **GF/Feeder Cattle is grouped here, in the same category table as LE/HE**, despite being absent from the fee table and canonical instrument list — see dossier update):
| Symbol | Product | Margin/contract |
|---|---|---|
| LE | Live Cattle | $10,000 |
| HE | Lean Hogs | $10,000 |
| GF | Feeder Cattle | $10,000 |

*NYMEX Futures* (note: **MNG/Micro Natural Gas is grouped here**, same situation as GF above):
| Symbol | Product | Margin/contract |
|---|---|---|
| CL | Crude Oil | $10,000 |
| MCL | Micro Crude Oil | $1,000 |
| QM | E-mini Crude Oil | $10,000 |
| NG | Natural Gas | $10,000 |
| QG | E-mini Natural Gas | $10,000 |
| MNG | Micro Natural Gas | $1,000 |
| RB | RBOB Gasoline | $10,000 |
| HO | Heating Oil | $10,000 |

*CBOT Commodity Futures*:
| Symbol | Product | Margin/contract |
|---|---|---|
| ZC | Corn | $10,000 |
| ZW | Wheat | $10,000 |
| ZS | Soybeans | $10,000 |
| ZM | Soybean Meal | $10,000 |
| ZL | Soybean Oil | $10,000 |

*CBOT Equity Futures* (page labels this group "CBOT Equity Futures," vs. "CME CBOT Equity Futures" in article 19 — cosmetic naming variance only):
| Symbol | Product | Margin/contract |
|---|---|---|
| YM | Mini-DOW | $10,000 |
| MYM | Micro Mini-DOW | $1,000 |

*CBOT Financial/Interest Rate Futures* — **an entire category that exists ONLY in this margin table**, absent from the fee table, the canonical wrong-month instrument list, the homepage grid, and the live symbol browser (per dossier's prior cross-check):
| Symbol | Product | Margin/contract |
|---|---|---|
| ZT | 2-Year Note | $10,000 |
| ZF | 5-Year Note | $10,000 |
| ZN | 10-Year Note | $10,000 |
| ZB | 30-Year Bond | $10,000 |
| UB | Ultra-Bond | $10,000 |
| TN | Ultra-Note | $10,000 |
| ZQ | 30 Day Fed | $10,000 |

*COMEX Futures* (note: **PA/Palladium absent from this table** — margin NOT STATED; blank-symbol "Micro Silver" row and the MHG anomaly both reconfirmed verbatim):
| Symbol | Product | Margin/contract |
|---|---|---|
| GC | Gold | $10,000 |
| MGC | Micro Gold | $1,000 |
| SI | Silver | $2,000 |
| *(blank)* | Micro Silver | $1,000 |
| HG | Copper | $10,000 |
| MHG | Micro Copper | $10,000 |
| PL | Platinum | $10,000 |

- **New structural finding on MHG**: Micro Copper (MHG) is absent from article 19's fee table, absent from article 21's tick table, and absent from article 22's canonical 45-instrument list — exactly the same absentee pattern as GF, MNG, the 7 Treasury symbols, and blank/"Micro Silver." MHG should be grouped with that "margin-table-only, tradability unconfirmed" cluster, not treated as a standalone pricing-pattern anomaly (see dossier update).
- Margin-table total: 52 rows (41 that also appear in the 45-instrument canonical list, plus 11 that appear only here: GF, MNG, ZT, ZF, ZN, ZB, UB, TN, ZQ, blank/Micro Silver, MHG). 45 canonical − 4 missing-margin (EMD, 7E, MCD, PA) = 41. Arithmetic is internally consistent.

---

## 21. Tick size and profit per tick Calculation
**URL**: https://helpfutures.e8markets.com/en/articles/13004287-tick-size-and-profit-per-tick-calculation
**Freshness**: "May 24, 2026"

**FACTS**: "The following calculations are intended for Futures products on the Tradovate platform." Worked example: 3 contracts of GC (Gold), tick size 0.1, $10.00/tick, entry 2,667.7 → exit 2,668.9 = 12 ticks → "12 × $10 × 3 = $360 PnL." This is the **complete reproduction** of the tick-size/tick-value table — cross-checked cell-by-cell against the dossier's master table: **zero numeric drift; the previously-flagged site error is still live verbatim.**

**CME Equity Futures**:
| Symbol | Product | Tick Size | Profit Per Tick |
|---|---|---|---|
| EMD | E-mini S&P MidCap 400 | 0.1 | $10.00 |
| ES | E-mini S&P 500 | 0.25 | $12.50 |
| MES | Micro E-mini S&P | 0.25 | $1.25 |
| NKD | Nikkei | 5 | $25.00 |
| NQ | E-mini NASDAQ 100 | 0.25 | $5.00 |
| MNQ | Micro E-mini NASDAQ 100 | 0.25 | $0.50 |
| RTY | E-mini Russell 2000 | 0.1 | $5.00 |
| M2K | Micro E-mini Russell 2000 | 0.1 | $0.50 |
| MBT | Micro E-mini Bitcoin | 5 | $0.50 |
| MET | Micro E-mini Ether | 0.05 | $0.50 |

**CME Foreign Exchange Futures**:
| Symbol | Product | Tick Size | Profit Per Tick |
|---|---|---|---|
| 6A | Australian $ | 0.0001 | $10.00 |
| M6A | Micro AUD/USD | 0.0001 | $1.00 |
| 6B | British Pound | 0.0001 | $6.25 |
| M6B | Micro British Pound | 0.0001 | $0.63 |
| 6C | Canadian $ | 0.0001 | $10.00 |
| 6E | Euro FX | 0.0001 | $12.50 |
| 7E | E-mini Euro FX | 0.0001 | $6.25 |
| M6E | Micro Euro | 0.0001 | $1.25 |
| MCD | (Product column literally repeats "MCD") | 0.0001 | $1.00 |
| 6J | Japanese Yen | 0.0000001 | $12.50 |
| 6S | Swiss Franc | 0.0001 | $12.50 |
| 6M | Mexican Peso | 0.00005 | $5.00 |
| 6N | New Zealand $ | 0.0001 | $10.00 |

**CME Agricultural Futures**:
| Symbol | Product | Tick Size | Profit Per Tick |
|---|---|---|---|
| LE | Live Cattle | 0.025 | $10.00 |
| HE | Lean Hogs | 0.025 | $10.00 |

**NYMEX Futures** (site error reconfirmed live, verbatim — the page's own column header for this section literally reads "symbolsa," a typo):
| Symbol | Product | Tick Size | Profit Per Tick |
|---|---|---|---|
| CL | Crude Oil | 0.01 | $10.00 |
| MCL | Micro Crude Oil | 0.01 | $1.00 |
| QM | E-mini Crude Oil | 0.025 | $12.50 |
| **NQ** | **"Natural Gas"** | 0.001 | $10.00 |
| QG | E-mini Natural Gas | 0.005 | $12.50 |
| RB | RBOB Gasoline | 0.0001 | $4.20 |
| HO | Heating Oil | 0.0001 | $4.20 |

**Site error, still live**: the row above literally reads "NQ | Natural Gas | 0.001 | $10.00" — but NQ is already used for E-mini NASDAQ 100 earlier in the same table (CME Equity section, tick 0.25/$5.00). The correct symbol for Natural Gas (confirmed via article 19 and 20) is **NG**. Recorded verbatim here per the "never infer" instruction; the corrected symbol (NG) is used everywhere else in this file and in the dossier's master table.

**CBOT Commodity Futures**:
| Symbol | Product | Tick Size | Profit Per Tick |
|---|---|---|---|
| ZC | Corn | 0.25 | $12.50 |
| ZW | Wheat | 0.25 | $12.50 |
| ZS | Soybeans | 0.25 | $12.50 |
| ZM | Soybean Meal | 0.1 | $10.00 |
| ZL | Soybean Oil | 0.01 | $6.00 |

**CME CBOT Equity Futures**:
| Symbol | Product | Tick Size | Profit Per Tick |
|---|---|---|---|
| YM | Mini-DOW | 1 | $5.00 |
| MYM | Micro Mini-DOW | 1 | $0.50 |

**COMEX Futures**:
| Symbol | Product | Tick Size | Profit Per Tick |
|---|---|---|---|
| GC | Gold | 0.1 | $10.00 |
| MGC | Micro Gold | 0.1 | $1.00 |
| SI | Silver | 0.005 | $25.00 |
| HG | Copper | 0.0005 | $12.50 |
| PL | Platinum | 0.1 | $10.00 |
| PA | Palladium | 0.1 | $10.00 |

---

## 22. Stop Trading the Wrong Contract Month
**URL**: https://helpfutures.e8markets.com/en/articles/13390461-stop-trading-the-wrong-contract-month
**Freshness**: "April 7, 2026"

**FACTS**:
- Symbol anatomy (verbatim, ≤15 words): "the third letter indicates the contract month, and the number indicates the year."
- "The contract closest to expiration has the highest trading volume and liquidity." "Pricing can differ between contracts" (basis risk between contract months, stated explicitly).
- Rule (verbatim): "Make sure you are always trading the Front Month Contract, which is the one with the highest Volume. We are not responsible if you fail account due to trading the wrong contract month. Trading in the incorrect Month Contract may also result in termination of your account or deduction of profit made from trades on the incorrect contract."
- No fixed roll calendar published — only: "This might change in the future, once the contract is heading to expiration date and the volume starts to decrease." Worked example: "the Front Month Contract is MBTG6" (Micro Bitcoin, February, 2026 per the G/6 code).

**Canonical instrument list (45 symbols total, matching article 19's count exactly)** — reproduced in E8's own 3-column layout:
| Col. 1 | Col. 2 | Col. 3 |
|---|---|---|
| EMD / E-mini S&P MidCap 400 | 6A / Australian $ | CL / Crude Oil |
| ES / E-mini S&P 500 | M6A / Micro AUD/USD | MCL / Micro Crude Oil |
| MES / Micro E-mini S&P | 6B / British Pound | QM / E-mini Crude Oil |
| NKD / Nikkei | M6B / Micro British Pound | NG / Natural Gas |
| NQ / E-mini NASDAQ 100 | 6C / Canadian $ | QG / E-mini Natural Gas |
| MNQ / Micro E-mini NASDAQ 100 | 6E / Euro FX | RB / RBOB Gasoline |
| RTY / E-mini Russell 2000 | **E7** / E-mini Euro FX | HO / Heating Oil |
| M2K / Micro E-mini Russell 2000 | M6E / Micro Euro | ZC / Corn |
| MBT / Micro E-mini Bitcoin | MCD / Micro CAD/USD | ZW / Wheat |
| MET / Micro E-mini Ether | 6J / Japanese Yen | ZS / Soybeans |
| GC / Gold | 6S / Swiss Franc | ZM / Soybean Meal |
| MGC / Micro Gold | 6M / Mexican Peso | ZL / Soybean Oil |
| SI / Silver | 6N / New Zealand $ | LE / Live Cattle |
| HG / Copper | YM / Mini-DOW | HE / Lean Hogs |
| PL / Platinum | MYM / Micro Mini-DOW | |
| PA / Palladium | | |

- **Naming variant reconfirmed live**: this canonical list spells E-mini Euro FX as "**E7**," while articles 19 and 21 (and the live e8x symbol tool, per the dossier's prior cross-check) spell it "**7E**." Both forms are attested; treat 7E as canonical per the dossier's existing convention (2-of-3 sources).
- **Confirms exclusion**: GF, MNG, the 7 Treasury symbols, blank/"Micro Silver," and MHG are absent from this canonical list too — reconfirms they sit outside E8's own headline 45-instrument roster.

**Futures contract month codes** (reproduced in E8's 2-column table layout; identical mapping to standard CME codes):
| Code | Month | Code | Month |
|---|---|---|---|
| H | March | X | November |
| M | June | J | April |
| U | September | K | May |
| Z | December | N | July |
| F | January | Q | August |
| G | February | V | October |

---

## 23. How can I change my trading platform?
**URL**: https://helpfutures.e8markets.com/en/articles/14595962-how-can-i-change-my-trading-platform
**Freshness**: "Updated over 3 weeks ago"

**FACTS**:
- "At this moment, we offer only one trading platform for the E8 Zero Futures product" (same recurring "E8 Zero Futures"-as-generic-product-name pattern seen elsewhere — this article is general/platform-level, not Zero-specific, yet again names only Zero).
- "If you are not satisfied with the Tradovate platform, we are unfortunately unable to change your trading platform or offer a different solution."
- **New fact**: "You can still connect your Tradovate account to the **Tradingview** option for trading" — TradingView can be used as an alternative front-end/charting-and-execution UI connected to the same underlying Tradovate account; Tradovate itself remains the only execution backend.
- Alternative if dissatisfied: "you can request a refund if you're eligible for it."

---

## 24. How to use the Tradovate Trading Platform
**URL**: https://helpfutures.e8markets.com/en/articles/12996601-how-to-use-the-tradovate-trading-platform
**Freshness**: "May 22, 2026"

**FACTS** (UI/workflow mechanics, not account-rule content):
- Placing a trade: select an instrument (new or previously added) → select contract size → execute per chosen order type.
- Closing a trade: "Exit at Mkt & CXL" closes all pending orders and open positions on the selected instrument in one action; alternatively, close individual pending orders/open positions per-instrument via the Positions or Orders tab, or right-click a position to close it.
- Order-type explanations as printed (one appears to contain a page error — recorded verbatim, not corrected):
  - "When you Buy Bid, you are opening an order limit for buy at the current bid price."
  - "When you use a regular market buy, you will open a buy position at the current ask price."
  - "When you Buy Ask, you are opening an order limit for **sell** at the current ask price." — **Likely site error**: this labels a sell-side limit order "Buy Ask"; probably intended to read "Sell Ask." Recorded as published; not corrected, since the actual intended semantics are not confirmed.
  - "When you use a regular market sell, you will open a sell position at the current bid price."
- A "Troubleshooting Common Issues" section is present in the table of contents but rendered no body text in the fetched page.

---

## Cross-article consistency check (summary)

All three sizing-engine "ground truth" articles (19, 20, 21) were fetched fresh and compared cell-by-cell against the existing dossier tables compiled in the prior pass: **no numeric values have changed.** Every commission, exchange/NFA fee, clearing fee, tick size, tick value, margin figure, and contract-count cap matches exactly, including the previously-flagged site errors (the NQ/Natural Gas mislabel in article 21, the 7E/E7 naming split between articles 19/21 vs. article 22, the missing EMD/7E/MCD/PA margin rows, the blank-symbol "Micro Silver" row, and the MHG=$10,000 pattern-break). The one new structural finding — that GF, MNG, and now also MHG sit inside otherwise-legitimate category groupings in the margin table (not orphaned) — is carried into the dossier update below.
