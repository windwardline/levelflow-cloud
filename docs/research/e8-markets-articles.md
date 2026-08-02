# E8 Markets — Primary Article Extraction (Owner-Supplied URL List)

Compiled 2026-08-02 for Levelflow's risk-governor / position-sizing build. This is a from-scratch, fact-only extraction of the 39 `help.e8markets.com` articles the owner supplied as the definitive source list. It does not consult or defer to `e8-markets-dossier.md` — cross-referencing against that dossier (corrections, promotions, new facts) is done separately in that file's new "Primary-article pass" section.

## Methodology note

**Two fetch methods were used, and both have a proven, distinct silent-failure mode. Neither method is "safe by default" — every article below states which method backed it.**

1. **`r.jina.ai` reader-proxy** (`https://r.jina.ai/<url>`, via WebFetch). Fast, and required when browser tabs are unavailable (this help center returns HTTP 403 to direct, non-browser `WebFetch`/`curl`). **Failure mode, proven repeatedly this session**: jina can return HTTP success with plausible-looking markdown while silently dropping entire sections — headings render with zero body text beneath them, with no error. Confirmed on articles covering program overviews (bulleted rule lists), an instrument table, and two-heading account-group breakdowns. It also frequently (not always) drops the page's freshness-marker date even when the live page clearly shows one.
2. **Direct browser navigation** (`tabs_create` → `navigate` → `get_page_text`, own tab per worker). More complete for jina's failure cases, and not blocked by the site's bot protection. **Failure mode, also proven this session**: `get_page_text`/`innerText`-style extraction respects CSS/JS collapsed state, so content inside collapsed accordions ("Click here for more") or JS-rendered expandables can read as empty even though the browser fetch "succeeded" — this was caught on the lot-size-restriction article (recovered via direct DOM `textContent`) and is suspected (not fully chased down) on one "Click here for more" formula box on the Margin article, whose formulas were instead confirmed via a cross-checked jina pass. Content embedded as an image (2FA screenshots, one restricted-instruments table) is invisible to both methods.

**Practical rule applied below**: every table-bearing or list-bearing article was fetched via browser where possible; jina-only articles were cross-checked with 2–3 independently-prompted passes by the fetching agent, and several were additionally spot-verified by a live browser re-fetch afterward (noted per-article as "browser-confirmed" or "jina, re-verified via browser this session"). Where a fact could not be recovered by any method (embedded images, genuinely-collapsed content nobody expanded), it is marked **NOT STATED / NOT RECOVERED** rather than inferred.

**Freshness markers**: this help center shows either a literal date ("June 29, 2026") or a relative string ("Updated over 2 weeks ago") next to the article title — inconsistently, with no evident pattern by article age or topic. Browser fetches reliably surface this; jina fetches surfaced it on some articles and silently omitted it on others (confirmed by re-fetching several "none shown" jina results via browser and finding a real date present). Every freshness marker below was either directly browser-observed, or — for the handful of articles not re-checked via browser — is flagged as jina-sourced and possibly incomplete.

**Scope note**: all 39 articles below are hosted on `help.e8markets.com` (the Forex/Crypto/CFD help center), per the owner-supplied list. None are on `helpfutures.e8markets.com`, except that article 27's canonical owner-supplied URL was cross-checked against its `helpfutures` counterpart as an explicit side-check (both identical).

---

## 1. 11775980-e8-one

URL: https://help.e8markets.com/en/articles/11775980-e8-one
Method: browser (direct navigation)
Freshness marker: "June 29, 2026"

FACTS:
- Product framing: "a clear 1-Step path to becoming an E8 Performance Trader in a single phase," described as E8's fastest challenge process.
- **SimFi™ Challenge (preset) rules**: Profit Target 6% (closed profit); no minimum trading days; Unlimited Trading Days but must place-and-close ≥1 trade every 60 days; Daily Drawdown 3% (basis: initial/starting balance); Dynamic Drawdown 4% (basis: highest closed balance; rises on closed profit; locks permanently once it reaches the initial-balance level). Explicitly labeled "preset account" — parameters are customizable at checkout (see article 28 for the full customization matrix).
- **SimFI™ Performance rules**: same Daily Drawdown 3% / Dynamic Drawdown 4% as Challenge. Eligible for up to 100% of trading performance.
- **Payout criteria**: 40% Best Day rule (no single day > 40% of total generated profit). Payout minimum formula: net profit (payout share) must be **greater than 50% of the daily drawdown dollar amount**. Worked example: $100,000 account, 4% daily drawdown → minimum payout = $2,001. A buffer may need to be left "at certain scenarios" (not further specified — NOT STATED).
- **News trading**: Challenge (phase 1) = no restrictions. Performance = strictly prohibited during high-impact news; window = 5 minutes before the release to 5 minutes after. Prohibited actions in that window: opening trades, closing trades, SL/TP edits, Buy Stop/Sell Stop. Platform does not technically block it, but profits made during the window may be removed (see article 24 for the confirmed removal mechanism).
- **Consistency rule**: none in Challenge; 40% Best Day rule in Performance (same as payout criteria above).
- **Copy trading**: allowed across all of a trader's own accounts (Challenge, Performance, personal), same-owner only.
- **Leverage**: Forex 1:30, Indices 1:15, Metals 1:15, Crypto 1:1.
- Other rules referenced but not detailed on this page: Hedging policy, "all-or-nothing Trading," "Irresponsible Trading in Simulated Accounts" — NOT STATED here (see article 14/6929927).
Load-bearing quotes: "must not lose more than x% of your initial balance in a single day"; "locks permanently at the initial balance level"; "strictly prohibited during high-impact news events."

---

## 2. 13429922-e8-one-crypto

URL: https://help.e8markets.com/en/articles/13429922-e8-one-crypto
Method: browser (direct navigation)
Freshness marker: "June 29, 2026"

FACTS:
- Same 1-Step Challenge→Performance structure as E8 One, "designed exclusively for crypto traders."
- **Daily/Dynamic Drawdown and Profit Target are explicitly restated here (this resolves an old NOT-PUBLISHED gap)**: 6% Profit Target, 3% Daily Drawdown, 4% Dynamic Drawdown — identical figures and definitions to E8 One, stated directly on this page (not inferred from product-family parity).
- Payout criteria: identical to E8 One — 40% Best Day rule; payout minimum = net profit > 50% of daily drawdown; same $100,000/4%/$2,001 worked example.
- News trading: identical structure to E8 One (Challenge unrestricted; Performance 5-min blackout around high-impact news; same 4 prohibited actions).
- Consistency rule: same as E8 One (none Challenge, 40% Performance).
- Copy trading: same policy language as E8 One.
- **Leverage (crypto-specific)**: Bitcoin 1:5, Ethereum 1:5, other crypto 1:2. No forex/indices/metals rows (crypto-only product).
- Other rules: same generic reference, no detail (NOT STATED here).
Load-bearing quotes: none beyond article 1 — wording is identical or a direct paraphrase.

---

## 3. 15274219-e8-pro-forex

URL: https://help.e8markets.com/en/articles/15274219-e8-pro-forex
Method: browser (direct navigation)
Freshness marker: "Updated this week" (relative phrasing — differs from E8 One's literal-date format; both are genuine site formats, not a fetch artifact)

FACTS:
- Product framing: "1-Step challenge designed exclusively for traders looking for freedom in daily payouts, static drawdown with NO consistency rules, or payout caps."
- **Challenge rules**: Profit Target 8% (closed profit); Unlimited Trading Days (60-day rule; no separate "no minimum days" bullet on this page); Daily Profit Cap 2% (of initial balance — example: $100,000 account → $2,000/day cap; excess doesn't count toward target, see article 9 for the full clawback mechanism); Daily Drawdown 2.5% (basis: initial/starting balance); Static Drawdown 8% (fixed loss limit on initial balance; "never moves, except when a first payout is processed").
- **Performance rules**: identical Daily Profit Cap / Daily Drawdown / Static Drawdown figures as Challenge. Eligible for up to 100% of trading performance.
- **Payout criteria**: No caps; No consistency rules; No minimum trading days; payout frequency = daily ("You can request every day!"); minimum profit for first AND additional payouts = 1% of initial balance (e.g. $1,000 on $100,000). Payout mechanism: 50% of total profit is set aside as the "requestable amount"; trader receives up to 100% of that requestable amount depending on plan; the remainder stays in the account as a buffer against the Static Drawdown level moving to breakeven. Full mechanism deferred to a separate linked article — NOT STATED further here.
- **News trading**: explicitly **no restrictions** at either stage (Challenge or Performance) — this differs from E8 One/One Crypto, which restrict Performance-stage news trading. General (non-binding) advisory to avoid high-impact news due to simulated slippage.
- Consistency rule: no dedicated heading on this page; addressed only via the "No consistency rules" payout-criteria bullet.
- Leverage: Forex 1:30, Indices 1:15, Metals 1:15. No crypto row (forex-only product).
Load-bearing quotes: "only 2% counts toward the target or profit"; "never moves, except when a first payout is processed"; "trade news on E8 pro Forex without any restrictions."

---

## 4. 15323777-e8-pro-crypto

URL: https://help.e8markets.com/en/articles/15323777-e8-pro-crypto
Method: browser (direct navigation)
Freshness marker: "Updated this week"

FACTS:
- Crypto mirror of E8 Pro Forex, same framing ("...designed exclusively for crypto traders looking for freedom in daily payouts, static drawdown with NO consistency rules, or payout caps").
- **Challenge and Performance rules are numerically identical to E8 Pro Forex — confirmed directly on this page, not inferred**: 8% Profit Target, Unlimited Trading Days (60-day rule), 2% Daily Profit Cap ($2,000/day on $100k example), 2.5% Daily Drawdown, 8% Static Drawdown (never moves except at first payout).
- Payout criteria: identical to Pro Forex — no caps/consistency rules/minimum trading days; daily payout frequency; 1% of initial balance minimum payout; same 50%-set-aside two-step payout mechanism.
- News trading: explicitly **no restrictions** at either stage (page correctly names "E8 pro Crypto," unlike a copy-paste slip found elsewhere — see article 6).
- Leverage: Bitcoin 1:5, Ethereum 1:5, other crypto 1:2 (matches E8 One Crypto).
Load-bearing quotes: "trade news on E8 pro Crypto without any restrictions."

---

## 5. 11755943-e8-signature-forex

URL: https://help.e8markets.com/en/articles/11755943-e8-signature-forex
Method: browser (direct navigation)
Freshness marker: "June 29, 2026"

FACTS:
- Product framing: "1-Step challenge designed exclusively for traders who value speed, clarity, and control."
- **Challenge rules**: Profit Target 6%; Unlimited Trading Days (60-day rule). **No separate flat "Daily Drawdown %" rule appears anywhere on this page** — the only loss-limit rule at Challenge stage is EOD Dynamic Drawdown (moving loss limit based on highest end-of-day balance; updates once/day at market close; intraday swings don't move it; locks permanently at the initial-balance level once reached). EOD Dynamic Drawdown $ table (full):

| Account size | EOD Dynamic Drawdown |
|---|---|
| $25,000 | $1,000 |
| $50,000 | $2,000 |
| $100,000 | $3,000 |
| $150,000 | $4,500 |

- **Performance rules**: payout eligibility is a **flat 80%** of trading performance (not "up to 100%" like E8 One/Pro). Unlimited Trading Days. New rule: **2% Daily Pause** — soft daily loss limit on the day's starting balance; if floating-or-closed loss reaches 2%, trading stops until next day; explicitly **not a breach**. Same EOD Dynamic Drawdown table as Challenge.
- **Payout criteria**: 35% Best Day rule (lower than the 40% used by One/Pro). Minimum payout $100 flat (at 80% payout share, minimum gross request ≥ $125). Minimum 5 "profitable days" required between payouts (waived for the first payout); a profitable day = realized closed PnL ≥ 0.3% of initial balance; profitable-day counter resets to 0 after each payout request. Profitable-day $ threshold table (full):

| Account size | Profitable-day $ threshold (0.3%) |
|---|---|
| $25,000 | $75 |
| $50,000 | $150 |
| $100,000 | $300 |
| $150,000 | $450 |

  Payout buffer = an amount equal to the account's EOD Dynamic Drawdown size must remain un-requested in the account before any payout (example: EOD 3%, $100,000 balance → $3,000 buffer). Payout caps ("the maximum you can request in a single payout") are stated to exist but exact figures are **NOT STATED** in this article (deferred elsewhere).
- **Trading Hours**: all positions closed by 23:00 Server Time, reopening 00:15 Server Time — stated to apply to "E8 Signature Forex and E8 Signature Crypto" both.
- **News trading**: explicitly **no restrictions** at either stage.
- Leverage: Forex 1:30, Indices 1:15, Metals 1:15. No crypto row.
Load-bearing quotes: "updates once per day at market close"; "trading stops until the next day. Your account is not breached"; "receive 80% of their trading performance"; "no single trading day exceeds more than 35%."

---

## 6. 11864571-e8-signature-crypto

URL: https://help.e8markets.com/en/articles/11864571-e8-signature-crypto
Method: browser (direct navigation)
Freshness marker: "June 29, 2026"

FACTS:
- Crypto mirror of E8 Signature Forex; identical Challenge/Performance rule numbers, identical EOD Dynamic Drawdown table ($1,000/$2,000/$3,000/$4,500 for $25K/$50K/$100K/$150K), identical 2% Daily Pause definition, identical 35% Best Day rule, identical profitable-day table ($75/$150/$300/$450) and 5-profitable-days gate, identical payout buffer mechanic, identical 23:00–00:15 Server Time trading-hours rule (article explicitly names "E8 Signature Forex and E8 Signature Crypto" both again).
- **Source quirk, reproduced verbatim rather than corrected**: this article's News Trading section literally states *"You can trade news on E8 Signature Forex without any restrictions"* — naming "Forex," not "Crypto," inside the Signature **Crypto** article. Surrounding content (title, leverage table) is correctly Crypto-specific, so this reads as a copy-paste artifact in E8's own source, not a fetch error. Treat the policy as presumptively identical for Signature Crypto, but the article does not correctly name the product in this one sentence.
- Leverage: Bitcoin 1:5, Ethereum 1:5, other crypto 1:2.
Load-bearing quotes: "You can trade news on E8 Signature Forex without any restrictions" (verbatim source quirk, quoted exactly for auditability).

---

## 7. 11769446-daily-drawdown

URL: https://help.e8markets.com/en/articles/11769446-daily-drawdown
Method: browser (direct navigation)
Freshness marker: "June 30, 2026"

FACTS:
- Applies to: E8 One, E8 One Crypto, E8 Pro Forex, E8 Pro Crypto.
- Definition: "a daily maximum loss limit for a trading account, and its value is based on the initial balance."
- Formula (verbatim): "Starting balance of the new day − Fixed amount (Daily Drawdown) = Loss level." The fixed $ amount is computed once from initial balance and never changes; the day's starting balance (at rollover) is what moves.
- **Reset timing, now confirmed (previously an unconfirmed inference)**: every new day at **00:00 Server Time**, based on the balance at market rollover.
- Worked table (example uses $100,000 initial balance, 4% → $4,000 fixed amount):

| Day | Starting balance | Daily Drawdown | Loss level |
|---|---|---|---|
| 1 | $100,000 | $4,000 | $96,000 |
| 2 | $102,500 | $4,000 | $98,500 |
| 3 | $99,200 | $4,000 | $95,200 |

- **Breach consequence, now confirmed (previously not explicitly stated in this article)**: equity or balance at/below the loss level at any point = "permanent violation" → account **"permanently closed for breaching the daily Drawdown rule."** Auto-closure of positions may "take a while"; closing back above the loss level after breach does not undo the violation.
- Customizable at checkout (the % shown, e.g. 4%, is an example — see article 28 for the actual selectable tiers).
- Non-binding coaching note: suggests a personal 1–2%/day mental stop; explicitly advisory, not enforced.
Load-bearing quotes: "Starting balance of the new day − Fixed amount (Daily Drawdown) = Loss level"; "permanently closed for breaching the daily Drawdown rule."

---

## 8. 11782996-dynamic-drawdown

URL: https://help.e8markets.com/en/articles/11782996-dynamic-drawdown
Method: browser (direct navigation)
Freshness marker: "June 4, 2026"

FACTS:
- Applies to: E8 One, E8 One Crypto.
- Definition: based on "the last Highest Closed Balance" — rises only when profit is **closed**, explicitly not when floating equity increases.
- Formula (verbatim, example uses 6%): "Highest Closed Balance − Drawdown amount (6%) = Loss level."
- Mechanic: closing a $x profit raises the loss level by $x, until the loss level reaches the initial-balance level, at which point it "locks, becomes fully static, and won't move further anymore." Locking is event-driven (on closed profit), not calendar-based.
- Worked progression table (starting balance $100,000, 6% → $94,000 initial floor):

| Event | Balance after | Loss Level after |
|---|---|---|
| Start | $100,000 | $94,000 |
| Close +$2k profit | $102,000 | $96,000 (rises by $2k) |
| Close −$3k loss | $99,000 | $96,000 (unchanged) |
| Close +$1k profit | $100,000 | $96,000 (unchanged — note below) |
| Close +$7k profit | $107,000 | $100,000 (locks forever at initial balance) |

  (Note: the source's own table shows the 3rd row's profit not moving the loss level even though the definition says "rises when profit is closed" — read literally as written; not reconciled further, reproduced as shown.)
- Breach: equity/balance at/below loss level → "permanently closed for breaching the Dynamic Drawdown rule."
- Caution note: "you should leave a buffer when you are requesting a payout" in "certain scenarios" — mechanism not further specified (NOT STATED).
- Customizable at checkout (6% is illustrative; see article 28 for real tiers: 4/6/8/10/14%).
Load-bearing quotes: "Highest Closed Balance − Drawdown amount (6%) = Loss level"; "the Drawdown locks, becomes fully static, and won't move further."

---

## 9. 15319043-daily-profit-cap

URL: https://help.e8markets.com/en/articles/15319043-daily-profit-cap
Method: browser (direct navigation)
Freshness marker: "June 1, 2026"

FACTS:
- Applies to: E8 Pro Forex, E8 Pro Crypto only.
- Purpose stated: caps how much daily profit "counts toward your targets," within a trading day defined as 00:00–23:59 Server Time.
- Formula (verbatim): "Starting balance of the new day + profit cap amount (2% from the initial balance of the account) = Profit cap limit for that day." Cap size is fixed from initial balance; the cap limit threshold recalculates daily from that day's opening balance.
- Worked table (full):

| Day | Initial balance | Opening balance | Daily profit cap (2%) | Profit cap limit |
|---|---|---|---|---|
| 1 | $100,000 | $102,500 | $2,000 | $104,500 |
| 2 | $50,000 | $55,000 | $1,000 | $56,000 |
| 3 | $25,000 | $24,200 | $500 | $24,700 |

- **Clawback mechanic (exact)**: "Every day between **00:00 and 01:00 Server Time**, any profits earned above the daily cap are automatically removed from your account balance." Profit above the cap temporarily inflates balance but never counts toward the profit target/performance metric before being removed.
- Second worked example ("How it works"):

| Field | Value |
|---|---|
| Opening balance | $102,000 |
| Daily profit cap (2%) | $2,000 |
| Cap limit | $104,000 |
| Closing balance | $105,500 |
| Amount removed at rollover | $1,500 |

- Dashboard shows a "goals overview" of profit-vs-cap status and excess above cap.
- **Anti-gaming provisions**: attempting to bypass the cap via hedging or partial closures "is not allowed and may result in all profit from that position being consolidated into a single day." Three explicit example patterns: (1) partially closing a large winning position across multiple days; (2) opening several same-instrument positions in one day, closing across multiple days; (3) immediately open/close/re-open a position held across multiple days with identical exposure.
- **Breach consequence for the cap itself: NOT STATED as a violation.** Unlike Daily/Dynamic/Static/EOD Drawdown articles (which explicitly say "permanent violation"/"permanently closed"), this article never frames exceeding the cap as an account-ending breach — only automatic removal of the excess, or (if bypass behavior is suspected) profit consolidation into a single day.
Load-bearing quotes: "any profits earned above the daily cap are automatically removed"; "may result in all profit from that position being consolidated into a single day."

---

## 10. 13653031-static-drawdown

URL: https://help.e8markets.com/en/articles/13653031-static-drawdown
Method: browser (direct navigation)
Freshness marker: "Updated over 2 weeks ago"

FACTS:
- Applies to: E8 Pro Forex, E8 Pro Crypto.
- Definition: "the maximum total loss your account can incur based on your Initial Balance" — a fixed floor that "does not move up" and "stays anchored to your starting point, until you make a payout."
- Formula (verbatim): "Initial Balance − % of Initial Balance = Loss Level."
- Worked table (8% example):

| Initial Balance | Static Drawdown (8%) | Loss Level |
|---|---|---|
| $100,000 | $8,000 | $92,000 |
| $50,000 | $4,000 | $46,000 |
| $5,000 | $400 | $4,600 |

- **Recalculation timing**: not periodic/day-based. The only stated recalculation event is a **first payout request**, at which point "the loss level will move to the initial balance level, and it stays there forever." Before/after example ($100,000, 8%): loss level $92,000 before first payout → $100,000 after.
- Breach: equity/balance at/below loss level → "permanently closed for breaching the Static Drawdown rule."
- **NOT STATED on this page**: whether the % itself is customizable (contrast with Daily/Dynamic Drawdown articles, which explicitly say their % is customizable) — see article 28, which does show Static Drawdown as customizable to 6/8/10% for E8 Pro.
Load-bearing quotes: "Initial Balance − % of Initial Balance = Loss Level"; "the loss level will move to the initial balance level."

---

## 11. 11864596-eod-dynamic-drawdown

URL: https://help.e8markets.com/en/articles/11864596-eod-dynamic-drawdown
Method: browser (direct navigation)
Freshness marker: "Updated over 2 weeks ago"

FACTS:
- **Applies to (verbatim as shown on page): E8 Signature Forex, E8 Signature Crypto, "E8 Signature Futurex" [sic — source typo; a sibling article spells the same product "E8 Signature Futures"], and E8 Zero.** This confirms E8 Zero uses this same guardrail type (see dossier correction — the dossier had previously characterized E8 Zero's drawdown as "Static Drawdown").
- Definition: based on "highest achieved balance at the end of the trading day" — explicitly not tick-by-tick/floating ("It updates at the end of the day... so intraday swings can breathe").
- Formula (verbatim, 3% example): "Highest End-of-the-day balance − Drawdown amount (3%) = Loss level."
- Lock condition: once closed profit reaches the EOD Dynamic Drawdown amount, OR a first payout is requested, the floor "locks on the initial balance level, becomes fully static, and won't move further anymore."
- **Stated exception (verbatim, includes source typo)**: "this does not apply in challange of E8 Zero" — i.e., during E8 Zero's Challenge stage specifically, the loss level does **not** lock at initial balance and keeps scaling with profit indefinitely ("no matter what amount you make").
- Worked progression table (starting balance $100,000, 3% → $97,000 initial floor):

| Day | Scenario | EOD Balance | Next day's Loss Level |
|---|---|---|---|
| 1 | Close +$1,000 | $101,000 | $98,000 |
| 2 | Close +$1,000 | $102,000 | $99,000 |
| 3 | Close −$1,000 | $101,000 | $99,000 (unchanged) |
| 4 | Close +$3,000 | $104,000 | $100,000 (locked) |
| 5+ | — | — | $100,000 (locked, static) |

- Breach: equity/balance at/below loss level → "permanently closed for breaching the EOD Dynamic Drawdown rule."
Load-bearing quotes: "Highest End-of-the-day balance − Drawdown amount (3%) = Loss level"; "this does not apply in challange of E8 Zero" [sic].

---

## 12. 11969807-daily-pause

URL: https://help.e8markets.com/en/articles/11969807-daily-pause
Method: browser (direct navigation)
Freshness marker: "June 18, 2026"

FACTS:
- **Applies to (verbatim): SimFi™ Performance stage only, for E8 Signature Forex, E8 Signature Crypto, E8 Signature Futures.** Not applicable to the Challenge stage of these products.
- Framed as protective, not punitive ("Day Seatbelt"). Basis: 2% of initial balance, fixed $ amount that "never changes during the account's life"; only the day's starting balance moves the pause line.
- **Consequence: explicitly not a hard/permanent breach.** "Daily Pause is not a hard breach; you can still continue trading the next day." Trading pauses until 00:00 Server Time if equity/balance falls below the pause line.
- Worked tables (full):

| Day ($100,000 initial, $2,000 fixed) | Starting balance | Pause line |
|---|---|---|
| 1 | $100,000 | $98,000 |
| 2 | $102,500 | $100,500 |
| 3 | $99,200 | $97,200 |

| Day ($50,000 initial, $1,000 fixed) | Starting balance | Pause line |
|---|---|---|
| 1 | $50,000 | $49,000 |
| 2 | $51,250 | $50,250 |
| 3 | $49,000 | $48,000 |

- Execution-delay caveat: closing exactly at the limit isn't instant; firm advises using stop-losses; "we bear no risk and you are not entitled to any rebalance" if no SL is used or loss exceeds 2% due to execution delay.
- NOT STATED: whether the 2% figure is customizable (no statement either way on this page).
Load-bearing quotes: "Daily Pause is not a hard breach; you can still continue trading the next day"; "we bear no risk and you are not entitled to any rebalance."

---

## 13. 5515039-how-many-accounts-can-i-apply-for-at-once

URL: https://help.e8markets.com/en/articles/5515039-how-many-accounts-can-i-apply-for-at-once
Method: browser (direct navigation)
Freshness marker: "Updated over 2 weeks ago" (paired exact `<time>` value: "July 14, 2026")

FACTS:
- SimFi Challenge stage: **unlimited** allocation for all products (no cap on count or size of Challenge accounts).
- **Performance-stage maximum active allocation, by product** (full):

| Product | Performance-stage cap |
|---|---|
| E8 One | $500,000 total |
| E8 One Crypto | $500,000 total |
| E8 Pro Forex | $500,000 total |
| E8 Pro Crypto | $500,000 total |
| E8 Zero | 3 performance accounts (count cap) |
| E8 Signature Forex | 5 performance accounts |
| E8 Signature Crypto | 5 performance accounts |
| E8 Signature Futures | 5 performance accounts |

- Combined maximum simulated capital manageable at once across all Performance products, stated directly: **$4,850,000**.
- Allocation limits apply **per household** — multiple users at the same residence/IP must not collectively exceed the max.
- Worked example: during Challenge, a trader could buy $400K + $100K + $200K E8 One accounts simultaneously (unlimited). If all three pass, only $400K + $100K can go live on Performance (cap = $500,000); the $200K account is held in reserve until active allocation drops below the cap.
- Single-user-profile policy: one profile per person; creating multiple profiles is a ToS violation risking suspension of active accounts/profile. Accidental duplicates: contact support@e8markets.com for deletion.
- NOT STATED: E8 Classic is not mentioned anywhere in this article — no allocation figure given for it.
Load-bearing quotes: "These allocation limits apply per household"; "Users are only allowed to have a single user profile."

---

## 14. 6929927-trading-policies-and-prohibited-trading-strategies

URL: https://help.e8markets.com/en/articles/6929927-trading-policies-and-prohibited-trading-strategies
Method: browser (direct navigation)
Freshness marker: "May 22, 2026" (paired relative form: "Updated over 3 months ago")

FACTS — scoped in-article to "Forex + Crypto":

**Prohibited Trading Strategies** (full enumerated list):
1. All-or-nothing Trading: risking the entire daily drawdown on a single trade is not permitted.
2. Hedging Policy: hedging **across multiple accounts, including multiple accounts belonging to the same trader, is strictly prohibited** — defined as "opening opposing positions on the same asset." (This directly confirms, as a primary source, a rule the dossier had previously carried only as secondary.)
3. Expert Advisors: third-party EA use allowed generally, restricted to "one strategy per user" — E8 detecting multiple users on the same EA/strategy "may lead to the termination of your account."
4. Irresponsible Trading in Simulated Accounts: large-volume trades without coherent strategy, or ignoring fundamental risk management, counts as "abuse of the simulated environment."
5. **High-Frequency Trading restriction (new — not previously documented)**: "you cannot hold more than 50% of your trades for under one minute."

**Account management**: each account traded independently; "Cooperation with other traders - in any form - is not permitted," except copy trading across a trader's own accounts (explicitly allowed).

**Protective Risk Measures (new — not previously documented)**:
- Penalty for prohibited practices: termination from the program + refund of the fee paid (taken from the account on which the rule was broken).
- E8 reviews trading activity before granting a Performance account; failing review can mean no Performance account, or closure of an existing one with forfeiture of accrued profits.
- E8 reserves the right to cap risk at **no more than 1% per trade idea** if prohibited practices are detected.
- "Signs of extreme behavior" can trigger a requirement for a longer consistency track record.
- An **interview** is not standard/mandatory, but the risk team may request one at any stage ("not an interrogation") covering trading background, risk approach, and strategy behind performance data.
- NOT STATED: specific dollar amount of the "refund of the fee" penalty beyond "the account's own fee"; length of the "extended" history period for flagged traders; any Classic/Signature-specific carve-outs (rules stated generally).
Load-bearing quotes: "Hedging across multiple accounts, even those belonging to the same trader, is strictly prohibited"; "you cannot hold more than 50% of your trades for under one minute"; "Cooperation with other traders - in any form - is not permitted."

---

## 15. 9453418-is-there-any-consistency-rule

URL: https://help.e8markets.com/en/articles/9453418-is-there-any-consistency-rule
Method: browser (direct navigation, double-verified against a full-page screenshot — confirmed genuinely this short, no hidden content)
Freshness marker: "Updated over 3 weeks ago" (paired exact date: "July 6, 2026")

FACTS (complete per-product breakdown as stated — nothing added):
- SimFi Challenge stage: **no consistency rule, "for all account types."**
- SimFi Performance, E8 Pro: no consistency rule.
- SimFi Performance, E8 Zero: no consistency rule.
- SimFi Performance, E8 One: governed indirectly — must follow "Payout on Demand rules" (this article does not restate the numeric content of those rules).
- **NOT STATED**: E8 Classic and E8 Signature are not mentioned anywhere in this article at either stage (E8 Signature's own consistency figure — 35% Best Day — is instead published on its own product pages, articles 5/6 above, not here).
Load-bearing quotes: "There is no consistency rule in the SimFi™ Challenge stage for all account types."

---

## 16. 9453469-can-i-copy-trades-or-trade-as-a-team

URL: https://help.e8markets.com/en/articles/9453469-can-i-copy-trades-or-trade-as-a-team
Method: browser (direct navigation)
Freshness marker: "May 14, 2026" (paired relative form: "Updated over 3 months ago")

FACTS:
- Copy trading allowed across all of a user's own accounts (Challenge, Performance, personal), same-owner only. Users may use any copy-trading tool they choose; MatchTrader (MTR) users are pointed to danetrades.com as one named third-party tool (not an E8 product).
- **Team trading explicitly prohibited**: "We do not allow teams to make the same trades or copy trades on our simulated platform." Signal services explicitly not permitted either.
- Strategy development is subject to a maximum simulation-capital allocation (figure not restated here — see article 13).
- Creating multiple E8X profiles to exceed the max allocation is a violation.
- NOT STATED: no numeric/technical definition of what triggers "same trades" detection (no timing tolerance, lot-size tolerance, or correlation threshold given).
Load-bearing quotes: "We do not allow teams to make the same trades or copy trades"; "we also do NOT permit signal services."

---

## 17. 9453396-are-there-lot-order-size-restrictions

URL: https://help.e8markets.com/en/articles/9453396-are-there-lot-order-size-restrictions
Method: browser (direct navigation; two sub-sections were collapsed accordions not rendered by standard text extraction — recovered via direct DOM `textContent`, with one figure cross-checked after the accessibility-tree version had truncated a leading digit)
Freshness marker: "May 14, 2026" (paired relative form: "Updated over 3 months ago")

FACTS:

**Flat numeric caps** (headline rules): max ticket size **50 lots** most symbols, **20 lots** XAUUSD/gold (split across multiple tickets to exceed); open-order cap **100** at any time (pending + open combined); server requests **2,000/day** (all order actions incl. SL/TP edits); max positions **2,000/day** per account.

**Max-position FORMULA (previously only the bare formula was known; full worked examples are new)**:
- Formula (verbatim): "Leverage × account equity / (Instrument price × contract size) = Max. positions you can open." Independent of the flat lot caps — an order can still be blocked by insufficient margin regardless of the 50/20-lot ceiling. MTR and TradeLocker calculate this automatically.
- Worked example 1 (Metals, fresh E8 One, $100,000 equity): 15 (leverage) × 100,000 / (4,565.92 × 100 [gold contract size]) = **3.28 lots** max.
- Worked example 2 (Forex, GBP/NZD, same $100,000 account): 30 (leverage) × 100,000 / (1.351 [GBP/USD bridge price] × 100,000 [contract size]) = **22.2 lots** max.
- **Cross-pair bridging rule (new)** for computing "instrument price" on non-USD-quoted crosses: GBP/NZD, GBP/JPY, GBP/CHF → bridge via GBP/USD; NZD/JPY, NZD/CAD, NZD/CHF → bridge via NZD/USD; pairs quoted USD-first (e.g. USD/CHF) → use 1 as the instrument price; pairs already USD-quoted (e.g. AUD/USD) → use the quoted price directly.
- Explicit scope limit: "These calculations are only applicable within our Forex/Crypto SimFi environment" — Futures (Tradovate) uses a separate, out-of-scope article.

**Tips**: MTR/TradeLocker can auto-display max position based on margin utilization (MTR: "Advanced Order"; TradeLocker: yellow/red triangle warning).

- NOT STATED: leverage/lot-cap figures for E8 Classic, E8 Signature, E8 Pro, E8 Zero — every worked example on this page is explicitly E8 One only. Whether the 50/20-lot, 100-order, or 2,000/day caps differ by product or by Challenge-vs-Performance stage — presented as flat/universal with no breakdown. What happens procedurally if a ticket exceeds 50/20 lots (reject vs. auto-clip) — not stated.
Load-bearing quotes: "Leverage × account equity / (Instrument price × contract size) = Max. positions you can open"; "If a trade exceeds your available margin, the system will prevent the order."

---

## 18. 9453409-is-there-any-stop-loss-rule

URL: https://help.e8markets.com/en/articles/9453409-is-there-any-stop-loss-rule
Method: browser (direct navigation, DOM-verified as complete)
Freshness marker: "June 11, 2024" (paired relative form: "Updated over 2 years ago" — by a wide margin the oldest-dated article encountered in this pass)

FACTS:
- No mandatory stop-loss or take-profit — "We don't require using a stop loss or Take profit. It is only on you and on your strategy."
- E8 states data shows SL-using traders are more successful long-term; use is "highly recommended," not required.
- NOT STATED: no numeric guidance of any kind (no minimum/maximum distance, %, or $ risk figure); no product/stage scoping — reads as a blanket, product-agnostic policy.
Load-bearing quotes: "We don't require using a stop loss or Take profit"; "the use of stop losses is highly recommended."

---

## 19. 5514966-can-i-hold-positions-overnight-and-trade-over-the-weekend

URL: https://help.e8markets.com/en/articles/5514966-can-i-hold-positions-overnight-and-trade-over-the-weekend
Method: browser (direct navigation — this article was initially jina-fetched with two empty headings; re-fetched via browser this session and fully resolved)
Freshness marker: "Updated over 3 weeks ago"

FACTS:
- Framing: E8 provides flexibility to hold positions overnight/weekend "without unnecessary restrictions."
- **Overnight Trading**: allowed on **all stages** for E8 One, E8 Crypto (One Crypto), E8 Pro Forex, E8 Pro Crypto, E8 Zero Forex, E8 Zero Crypto. (E8 Signature is not on this list — it has its own nightly forced-flatten rule instead; see articles 5/6.)
- **Weekend Holding and Trading**: same product list, allowed on all stages.
- Risk allocation: "holding positions during market closures carries inherent risks." Named gap-risk instruments: Forex pairs, Indices, Commodities. "It is your job to determine the risks and rewards of holding a position overnight." If a gap, slippage, or widened spread "causes a violation of the account, it is the user's responsibility" — E8 does not further define "violation" numerically on this page.
Load-bearing quotes: "it is your job to determine the risks and rewards of holding a position overnight"; "holding positions during market closures carries inherent risks."

---

## 20. 9453413-is-there-any-maximum-risk-rule

URL: https://help.e8markets.com/en/articles/9453413-is-there-any-maximum-risk-rule
Method: browser (direct navigation, confirmed byte-identical to an earlier jina pass)
Freshness marker: "May 21, 2026"

FACTS:
- **No hard limit on maximum risk per trade idea** — "There are no hard limits on maximum risk per trade idea. We know that every trader has a different edge."
- Named discouraged pattern: "All-or-nothing behaviour" — risking the majority of one's daily drawdown on a single trade idea (this article does not restate the numeric daily-drawdown limit it references).
- **Guidance, explicitly not a rule**: "The most successful traders on E8 risk between 1–1.5% per trade idea. This is not a rule but a clear pattern."
- Consequence/review trigger: if an approach is "flagged as overly aggressive," E8's risk team "may reach out to discuss adjusting it" — framed as support, not penalty. No automatic enforcement action is stated.
- NOT STATED: the exact threshold that triggers "overly aggressive" flagging.
Load-bearing quotes: "There are no hard limits on maximum risk per trade idea"; "The most successful traders on E8 risk between 1–1.5% per trade idea."

---

## 21. 5515409-can-i-use-indicators-or-expert-advisors-when-trading-the-e8-account

URL: https://help.e8markets.com/en/articles/5515409-can-i-use-indicators-or-expert-advisors-when-trading-the-e8-account
Method: jina (2 independent prompts agreed; not independently re-verified via browser this session — content is short, prose-plus-table, and matches the same limits table confirmed by browser on articles 17 and 23, so cross-corroborated across 3 separate pages)
Freshness marker: "May 14, 2026" (per jina — not browser-confirmed on this specific article, though jina dates proved reliable elsewhere when present)

FACTS:
- Allowed tools named explicitly: Algo, EA (Expert Advisor), Bots, Indicators.
- Third-party EA use allowed, conditioned on E8 not detecting multiple users on the same trades/strategy. "We limit one strategy per user" — violation "may lead to the termination of your account." Recommendation (not a rule): run your own programmed EA.
- Numeric limits restated (matches articles 17 and 23 exactly): 50-lot/20-lot (gold) ticket caps, 100 open-order cap, 2,000/day server requests, 2,000/day max positions.
- General condition: no restriction on trading style/strategy provided it stays within SimFi rules and could be executed in a real market.
Load-bearing quotes: "We limit one strategy per user"; "does not limit or restrict a user's trading style or strategy."

---

## 22. 9453425-is-there-any-inactivity-rule

URL: https://help.e8markets.com/en/articles/9453425-is-there-any-inactivity-rule
Method: jina (agent reported no empty headings/gaps; not independently re-verified via browser this session)
Freshness marker: "June 22, 2026" (per jina)

FACTS:
- No overall min/max account lifetime, but a named "Inactivity Rule": account closes after 60 **or** 7 days without a placed-and-closed trade, depending on product.
- **Product mapping**: 60-day window applies to all Forex/Crypto accounts; 7-day window applies to all Futures accounts.
- Applies to newly purchased accounts with no trading history yet, too.
- No minimum trade size to stay active — even a 0.1-lot micro-trade counts.
- Travel/advance-notice exception: allowed if the trader emails Support@E8markets.com **before** the inactivity period begins.
Load-bearing quotes: "60 Day inactivity applies to all Forex/Crypto accounts"; "7 Day inactivity applies to all Futures accounts."

---

## 23. 9796251-is-the-martingale-strategy-allowed

URL: https://help.e8markets.com/en/articles/9796251-is-the-martingale-strategy-allowed
Method: browser (direct navigation — initially jina-fetched with two dropped bullet lists; re-fetched via browser this session and fully resolved)
Freshness marker: "May 14, 2026"

FACTS:
- **Martingale explicitly allowed**: "we allow our traders to utilize the martingale strategy... We do not prohibit specific strategy types like martingale."
- **Prohibited-strategies list (recovered — previously unrenderable), verbatim as three short bullets**: "Abuse of feed"; "Freezing, High frequency"; "straddling." Article points to the Terms & Conditions (e8markets.com/e8-markets-terms-and-conditions) for the full list.
- EA/one-strategy-per-user rule restated identically to articles 14/21: third-party EA allowed unless E8 detects multiple users on the same trade/strategy; violation "may lead to the termination of your account."
- **"Other limits" list (recovered — previously unrenderable)**: Open-order cap 100 (pending + open); Server requests 2,000/day; Max positions 2,000/day (per account) — matches articles 14/17/21 exactly.
Load-bearing quotes: "We do not prohibit specific strategy types like martingale"; "just be aware of prohibited strategies such as."

---

## 24. 9185497-can-i-trade-news

URL: https://help.e8markets.com/en/articles/9185497-can-i-trade-news
Method: browser (direct navigation — initially jina-fetched with two empty account-group headings; re-fetched via browser this session and fully resolved)
Freshness marker: "Updated over 2 weeks ago"

FACTS:
- **E8 Zero, E8 Signature, E8 Pro (all, both stages)**: "You can trade news on E8 Zero, E8 Signature and E8 Pro without any restrictions (This includes SimFi™ challenge account (phase-1) and SimFi™ performance Account)." Only a non-binding advisory to avoid high-impact news due to simulated slippage.
- **E8 One, E8 One Crypto**: Challenge stage unrestricted; **Performance stage strictly prohibited during high-impact news**, window = 5 minutes before the scheduled release to 5 minutes after. Platform does not technically block trading in the window, but it is against the rules.
- High-impact news defined as economic/geopolitical announcements that could significantly move markets — non-exhaustive examples: central bank decisions, economic indicators, major political events.
- **Prohibited actions during the window**: opening new trades, closing trades, SL/TP edits, Buy Stop/Sell Stop.
- News **speeches** specifically: restricted window is the same 5-minutes-before/5-minutes-after.
- **Violation consequence (new — not previously documented anywhere)**: "If you violate this rule, profits are automatically deducted from your account balance after your request payout, and you will be notified via email." This is a profit-clawback tied to the payout request, distinct from — and less severe than — the account-termination consequence used for drawdown breaches.
- Explicitly prohibited approaches: directional trading around news, straddles, strangles, capitalizing on the initial post-release surge, trading just before/after news to benefit from the move. "Trading based on news is NOT permitted."
- "List of targeted instruments and Restricted Macroeconomic News Events" is presented as an **embedded image** on the live page — **NOT RECOVERED as text by any method tried** (browser text extraction and a screenshot attempt both failed to surface readable content in the time budgeted; this is a genuine content-format gap, not a fetch failure).
- All non-targeted instruments trade with no restriction; an economic calendar is referenced for news timing.
Load-bearing quotes: "5 minutes before the speech begins until 5 minutes after the speech ends"; "Trading based on news is NOT permitted"; "profits are automatically deducted from your account balance after your request payout."

---

## 25. 5515412-what-broker-do-i-trade-with

URL: https://help.e8markets.com/en/articles/5515412-what-broker-do-i-trade-with
Method: browser (direct navigation, confirmed byte-identical to an earlier jina pass)
Freshness marker: "May 20, 2026"

FACTS:
- "E8 Markets is not a broker and does not accept users' deposits." Describes itself as a structured simulation environment for developing/demonstrating trading skill.
- Simulated environment uses real market data from third-party institutional data providers; Futures market data specifically comes directly from **CME** (Chicago Mercantile Exchange).
- NOT STATED: no execution venue/broker/liquidity-provider name given for non-futures instruments (forex, indices, metals, crypto) — the article's substantive answer is "there is no broker, this is a simulation."
Load-bearing quotes: "E8 Markets is not a broker and does not accept users' deposits."

---

## 26. 9453488-what-are-the-contract-sizes

URL: https://help.e8markets.com/en/articles/9453488-what-are-the-contract-sizes
Method: browser (direct navigation, confirmed byte-identical to two earlier independent jina passes — the article is genuinely this short, not a jina drop)
Freshness marker: "May 5, 2026" (jina had reported "none shown" on this article — a confirmed jina omission, corrected here)

FACTS:
- Contract size = "the number of units bought or sold in a single nominal lot," varies by instrument type. General ranges given (not exhaustive): Forex ≈ 100,000 units; indices ≈ 5–500 units.
- **Only three specific instrument rows are published on this page** (full):

| Symbol | Contract size | P&L per $1/1.0-point move (1 lot) |
|---|---|---|
| XAUUSD (Gold) | 100 | $100 |
| US30 / NAS100 | 5 | $5 |
| SP500 | 20 | $20 |

- Worked example: 5 lots XAUUSD, open 4324.00 → close 4326.40 (2.4 move) = 2.4 × 100 × 5 = **$1,200 profit**.
- Article refers to "our trading instrument list" (external/elsewhere) for the full specs — this article's own body does not contain a complete instrument table.
- **NOT STATED**: contract sizes for any other individual forex pair, other indices (GER40/DAX, FTSE100, Nikkei, AUS200), energies, other crypto, or other metals (e.g. silver). This gap is confirmed genuine (not a fetch artifact) via two independent methods.
Load-bearing quotes: none needed — figures reproduced directly above.

---

## 27. 10305202-server-time

URL (owner-supplied, primary): https://help.e8markets.com/en/articles/10305202-server-time
URL (side-check): https://helpfutures.e8markets.com/en/articles/10305202-server-time
Method: browser (direct navigation on the help.e8markets.com URL; the helpfutures URL was cross-checked via jina and found identical)
Freshness marker: "March 13, 2026" (identical on both URLs)

FACTS:
- Server time shifts for Daylight Saving Time "at the beginning of spring and at the end of autumn."
- Changes to **UTC+2** at the beginning of November; changes to **UTC+3** at the end of March.
- "Currently, the server time is set to UTC + 3."
- No divergence found between the help.e8markets.com and helpfutures.e8markets.com copies of this article — same content, same date.
- NOT STATED: which platform(s) this specifically governs; which region's DST calendar sets the "beginning of November"/"end of March" transition dates; exact calendar dates (only seasonal phrasing given).
Load-bearing quotes: "Currently, the server time is set to UTC + 3."

---

## 28. 8880316-what-is-the-custom-account

URL: https://help.e8markets.com/en/articles/8880316-what-is-the-custom-account
Method: browser (direct navigation — this article was initially jina-fetched with the E8 Pro parameter block missing and the E8 Signature section reported empty; re-fetched via browser this session, resolving both)
Freshness marker: "Updated over 2 weeks ago"

FACTS:

**General**: "the ultimate E8 tailor-made product" — customizable: platform, account size, drawdown size, profit target, payout. Forex accounts can additionally choose raw-spread vs. no-commission. Price rises with size, payout %, and drawdown %. Bigger drawdown pairs with a bigger profit target at each step/phase (they move together, not independently). Dashboard has a "Repeat Previous Order" one-click recreate feature.

**E8 One — customizable parameters** (full): Balance $5,000 / $10,000 / $25,000 / $50,000 / $100,000 / $200,000 / $400,000 / $500,000 (8 tiers). Daily Drawdown 3% / 4% / 5.3% / 6.6% / 9.2%. Dynamic Drawdown 4% / 6% / 8% / 10% / 14%. Profit Target 6% / 9% / 12% / 15% / 21% (tied to drawdown choice, not independently settable). Payout 80% / 90% / 100%.

**E8 Pro — customizable parameters (recovered — this fully resolves a previous NOT-PUBLISHED gap)**: Balance $5,000 / $10,000 / $25,000 / $50,000 / $100,000 / **$150,000** / $200,000 / $400,000 / $500,000 (**9 tiers — note the $150,000 tier does not exist in E8 One's own 8-tier ladder; the two products' size ladders are NOT identical**). Static Drawdown 6% / 8% / 10%. Profit Target 6% / 8% / 10% (tied to drawdown choice). Payout 80% / 90% / 100%.

**E8 Zero — customizable parameters**: Balance $50,000 / $100,000 / $200,000. Payout 80% / 100%. EOD Dynamic Drawdown and Profit Target are pre-set (not customizable); only platform, size, and Starter-vs-Max version are selectable.

**E8 Signature — customizable parameters (partially recovered)**: "Balance: $25,000, $50,000, $100,000, $150,000," — the source's own paragraph ends abruptly on a trailing comma right before the next section begins, with no drawdown/profit-target/payout breakdown given (unlike One/Pro/Zero). This reads as a genuinely incomplete paragraph on E8's own live page, not a fetch failure — confirmed by direct browser render.

**Base price tables** (all four, full, no discount applied):

E8 One (Forex/Crypto), preset = 80% payout / 6% Dynamic DD / 4% Daily DD:

| Balance | $5,000 | $10,000 | $25,000 | $50,000 | $100,000 | $200,000 | $400,000 | $500,000 |
|---|---|---|---|---|---|---|---|---|
| Price | $48 | $88 | $188 | $288 | $488 | $798 | $1,598 | $1,998 |

E8 Pro (Forex/Crypto), preset = 80% payout / 8% Static DD / 2.5% Daily DD:

| Balance | $5,000 | $10,000 | $25,000 | $50,000 | $100,000 | $200,000 | $400,000 | $500,000 |
|---|---|---|---|---|---|---|---|---|
| Price | $32 | $68 | $148 | $228 | $488 | $998 | $2,098 | $2,598 |

E8 Signature (Forex/Crypto/Futures), preset = 80% payout **(this table now PRIMARY-confirms figures the dossier previously carried only as secondary)**:

| Balance | $25,000 | $50,000 | $100,000 | $150,000 |
|---|---|---|---|---|
| Price | $110 | $150 | $260 | $390 |

E8 Zero (Futures), preset = 80% payout:

| Balance | $50,000 | $100,000 | $200,000 (source shows "$100,000" twice — sic, reproduced as published) |
|---|---|---|---|
| Zero Starter price | $178 | $278 | $558 |
| Zero Max price | $328 | $588 | $1,088 |

**Fees**: all one-time; no activation/subscription fee. Swap-free option (not available for futures) adds 10% to final price. Raising payout % or drawdown raises price. cTrader adds $10 if account price < $100. Full per-configuration pricing available at checkout or on the main site (not reproduced further here).

**Support**: misconfigured accounts (wrong platform/commission type/parameters) can be corrected by contacting support@E8markets.com, provided trading hasn't started.
Load-bearing quotes: "bigger drawdown = bigger profit target in each step/phase."

---

## 29. 9796097-can-i-merge-multiple-accounts

URL: https://help.e8markets.com/en/articles/9796097-can-i-merge-multiple-accounts
Method: jina (single pass, no red flags surfaced; not independently re-verified via browser this session)
Freshness marker: "Updated over 3 weeks ago"

FACTS:
- Two or more SimFi™ Performance accounts can be merged, provided they share "the same product setup," and merging happens **before** trading starts on the accounts involved.
- **E8 Zero and E8 Pro products explicitly cannot be merged.**
- NOT STATED: whether E8 One or E8 Signature accounts can be merged (article only states what cannot be merged); max number of accounts mergeable; the request process; any fee.
Load-bearing quotes: "E8 Zero and E8 pro products can not be merged."

---

## 30. 14595232-do-you-offer-certificates-for-passing

URL: https://help.e8markets.com/en/articles/14595232-do-you-offer-certificates-for-passing
Method: browser (direct navigation, confirmed matching an earlier jina pass, and corrected its freshness marker)
Freshness marker: "April 13, 2026" (jina had reported "none shown" — a confirmed jina omission, corrected here)

FACTS:
- Three certificate types: (1) Challenge-passing certificate, (2) Payout certificate, (3) Total Payout certificate.
- Challenge-passing certificate downloads from the account-overview dashboard section, but **is not available immediately** on hitting the profit target — it unlocks only once the SimFi™ Performance account is created, "which usually takes 30-120 minutes after finishing the Challenge stage."
- Payout/Total Payout certificates download from the "Payout History" dashboard section, one per payout milestone.
- Every certificate carries a unique QR code and number for third-party verification.
- NOT STATED: fee, expiration, file format, or whether availability differs by product line.
Load-bearing quotes: "usually takes 30-120 minutes after finishing the Challenge stage."

---

## 31. 6075730-how-to-properly-secure-my-account

URL: https://help.e8markets.com/en/articles/6075730-how-to-properly-secure-my-account
Method: jina (single pass; not independently re-verified via browser this session)
Freshness marker: "May 28, 2026"

FACTS:
- Covers two topics: 2FA setup, and changing the trading-platform password. Users are responsible for account security and not sharing credentials.
- 2FA framed as "an extra layer of protection." Users should report suspected unauthorized access ASAP; late complaints "will not be accepted."
- A 2FA-removal support contact is referenced but its exact address could not be reliably extracted (rendered as an obfuscated placeholder) — treat as **NOT STATED/unreliable** rather than reporting a guessed address.
- The actual step-by-step instructions for both 2FA setup and platform-password change rely on **embedded images** — **NOT RECOVERED as text** by this method.
- No percentages, dollar amounts, or numeric thresholds anywhere in this article. No product/account-type distinctions — content is generic.
Load-bearing quotes: none needed.

---

## 32. 14964234-what-is-the-stop-out-level

URL: https://help.e8markets.com/en/articles/14964234-what-is-the-stop-out-level
Method: browser (direct navigation, confirmed consistent with an earlier cross-validated jina pass)
Freshness marker: "May 6, 2026"

FACTS:
- **Definition**: Stop Out = the point where Margin Level drops to a specific threshold ("commonly 100% or lower" — the article's own hedged wording), triggering automatic liquidation of open positions because remaining equity can no longer support them.
- **Hitting stop-out is explicitly NOT a rule violation by itself** (contrasted directly with hitting a drawdown limit).
- Opening trade(s) using 100% of simulated margin is allowed, but may result in stop-out closure.
- "E8 Markets replicates real-market conditions... the mechanics of margin logic and stop-out also apply to our Challenge and Performance accounts. **Once Margin Level drops below 100%, all positions are automatically closed.**"
- Margin call: only cTrader sends a "Margin call" warning email ahead of a possible stop-out — no separate numeric margin-call level is stated for any platform; confirmed via exhaustive scan that only the 100% figure appears anywhere on the page.
- Platform-specific ways to identify a stop-out closure after the fact: MT5 (History tab → switch "Positions" to "Orders & deals" view); MTR (Closed Positions tab → hover the "(i)" icon); cTrader (proactive email warning); TradeLocker (Closed Positions tab → "Type" column).
- Illustrative advisory example: "leverage allows you to open 25 lots on EURUSD" doesn't mean you should.
- NOT STATED: no account-type/product-specific numeric variants of the stop-out threshold — one generic figure is given for all.
Load-bearing quotes: "Margin Level drops to a specific threshold (commonly 100% or lower)"; "Once Margin Level drops below 100%, all positions are automatically closed."

---

## 33. 14781682-what-is-slippage

URL: https://help.e8markets.com/en/articles/14781682-what-is-slippage
Method: jina (single pass, no red flags surfaced; not independently re-verified via browser this session)
Freshness marker: "May 20, 2026"

FACTS:
- Definition: the difference between expected price and actual close price — explicitly not a technical bug. Occurs when there's insufficient volume at the chosen price; the order fills at the next best level. More common in high volatility or low liquidity.
- Deliberately present in the simulated environment ("SimFi™") "to replicate real-market conditions as closely as possible."
- Causes: volatility (e.g. CPI/FOMC), low liquidity (e.g. market open/rollovers), gaps (weekend or major-news opens), large order volumes.
- Mitigations suggested: avoid high-volatility events; reconsider maximum position sizing; favor the London/New York session overlap; use limit orders (caveat: may not always execute).
- **Explicit no-reimbursement policy**: "E8 does not reimburse, rebalance, or adjust positions affected by slippage" — stated to apply "across all SimFi accounts."
- Does not distinguish positive vs. negative slippage — discussed only as something unfavorable to minimize.
Load-bearing quotes: "the difference between the price you expect and the price at which your trade actually closes"; "E8 does not reimburse, rebalance, or adjust positions."

---

## 34. 14722843-what-is-margin

URL: https://help.e8markets.com/en/articles/14722843-what-is-margin
Method: browser (direct navigation) for surrounding context; the two exact calculation formulas came from a jina pass cross-validated twice (browser's `get_page_text` did not expand the "Click here for more" formula boxes — a suspected collapsed-content gap, not chased further via DOM since the jina figures reproduced an identical source typo across independent fetches, strong evidence of authenticity)
Freshness marker: "May 6, 2026" (browser-confirmed)

FACTS:
- Definition: "Margin essentially acts as collateral that is held against open positions." Leverage lets a trader control larger positions than balance alone allows; overleveraging makes it "likely" to hit guardrails or stop-out.
- No specific leverage ratio is stated on this particular page (leverage figures live on article 38).
- "SimFi™" framing: balance, margin requirements, stop-out, and leverage "behave identically to a live environment" — only the capital is simulated.
- **Formula — Margin Level**: "(Equity / used margin) × 100 = Margin level %."
- **Formula — Margin Utilization**: "(Used Margin / Total account balance) × 100 = Margin utiliization (%)" [sic — source's own typo, reproduced identically across independent fetches].
- Margin Level described as a "health status"/survival score, "a countdown to the Stop Out." **Trigger level for E8 Challenge and Performance accounts specifically is 100%**, and "differs based on the provider" in general. "Once Margin Level drops below 100%, all positions are automatically closed" (same statement as article 32).
- Coaching tiers (advisory, not enforced): Margin Level 250%–400% = "strong buffer"; below 150% = "danger zone." Margin Utilization 10%–20% = conservative; above 80% = "majority of your balance is committed," raising stop-out risk.
- Worked examples: 0.3 lot XAU/USD on a $10,000 account described as "very close to failing below 100% of the margin level"; 5 lots XAU/USD on a $200,596 balance yields 75% margin utilization.
Load-bearing quotes: "(Equity / used margin) x 100 = Margin level %"; "(Used Margin / Total account balance) x 100 = Margin utiliization (%)"; "Margin essentially acts as collateral held against open positions."

---

## 35. 15121279-why-are-my-sls-and-tps-not-working

URL: https://help.e8markets.com/en/articles/15121279-why-are-my-sls-and-tps-not-working
Method: browser (direct navigation, confirmed matching and extending an earlier jina pass; corrected its freshness marker)
Freshness marker: "May 22, 2026" (jina had reported "none shown" — a confirmed jina omission, corrected here)

FACTS:
- An apparently-misbehaving SL/TP usually does not indicate a platform bug. Four named causes: (1) Slippage — closing price differs from expected; (2) Spread — SL triggered unexpectedly; (3) Spread — TP did not trigger; (4) Spread — Buy Limit order not activated.
- **Slippage**: SL/TP triggers but at a different price than set (illustrative: "You risk $200, but the position closes at $300"). Worked chart example: SL triggered 45 ticks away from the set level due to a sudden price move, filling at "the next best available price level."
- **Spread / SL triggered unexpectedly**: a widened spread (not only during news/rollovers) can trigger an SL even though the visible chart price never reached the SL level, because the chart plots bid price only. Worked example: EURUSD sell, SL at 1.17380; chart shows price reaching only 1.17360, but spread widened past 2 pips and the ask price triggered the SL.
- **Spread / TP did not trigger**: bid price passed the TP level, but ask price (the execution price for sell closes) did not. Worked example: gold sell position, price exceeded TP by "more than 20 ticks," but spread was ~30 ticks, so only bid — not ask — passed the TP.
- **Spread / Buy Limit not activated**: a buy limit executes at the ask price; if bid passes the order level but ask does not, the order never activates.
- **Execution table (new, not previously captured)**:

| Position | Opens at | Closes at |
|---|---|---|
| Short/Sell | Bid | Ask |
| Long/Buy | Ask | Bid |

Load-bearing quotes: "closing price differs from your set level"; "the difference is the spread."

---

## 36. 9799834-available-trading-platforms

URL: https://help.e8markets.com/en/articles/9799834-available-trading-platforms
Method: browser (direct navigation — this article was initially jina-fetched with the platform list itself unrenderable; re-fetched via browser this session and fully resolved)
Freshness marker: "June 10, 2026"

FACTS:
- **For Forex and Crypto accounts, four platforms are offered (full, explicit list — previously only inferable)**: TradeLocker, MatchTrader, cTrader, MetaTrader 5 / MT5. Availability depends on region and account type.
- **US-client restriction**: "Clients from the US are unable to use and purchase accounts on the MT5 and cTrader trading platforms." US clients can use only TradeLocker and MatchTrader.
- If an eligible (non-US) client doesn't see a platform (e.g. MT5) at checkout, it's attributed to the account profile not yet being verified.
- Login guides referenced for each platform (TradeLocker, MetaTrader 5, cTrader — noting cTrader's $10 surcharge under $100 accounts, matching article 28 — and MatchTrader, incl. a mobile guide).
- **Hedging account vs. netting account (new, primary-confirms a previously secondary-only rule)**: all Forex and Crypto Challenge/Performance accounts use a **hedging system**; Futures products use a **netting system**. Netting: an opposite same-volume position cancels the original. Hedging: opposite positions on the same instrument both stay open (locking exposure); a further same-direction position appears as a new order at the new price/volume.
- **Hedging strategy scope (now primary, previously secondary-only)**: "opening equal Long and Short trades on the same instrument **across multiple accounts is strictly prohibited**. You are only permitted to hedge positions within the same single Challenge or Performance account."
- NOT STATED: no platform name given for Futures accounts in this article (Futures has its own separate help center).
Load-bearing quotes: "Clients from the US are unable to use...MT5 and cTrader"; "opening equal Long and Short trades on the same instrument across multiple accounts is strictly prohibited."

---

## 37. 5514977-what-instruments-are-allowed-to-be-traded-spreads

URL: https://help.e8markets.com/en/articles/5514977-what-instruments-are-allowed-to-be-traded-spreads
Method: browser (direct navigation, confirmed byte-identical to an earlier cross-validated jina pass)
Freshness marker: "Updated over 2 weeks ago"

FACTS:
- Breadcrumb title: "What instruments are allowed to be traded? (spreads)"; on-page H1 differs: "What pairs and crosses can I trade?"
- Intro names five categories: Forex, Energies, Commodities, "Indexes," Cryptocurrencies. The two comparison tables instead use: Forex, Metals, Energies, "Indices," Crypto (article's own spelling inconsistency between intro and tables, reproduced as published).
- **Product/instrument/commission-model tables (full)**:

| Product | Instruments | No-commission/Raw-spread option | Swap-free option |
|---|---|---|---|
| E8 Signature Forex | Forex, Metals, Energies, Indices, Crypto | Yes | No |
| E8 Signature Crypto | Crypto only | Commission only | No |
| E8 One (Forex) / E8 Pro Forex | Forex, Metals, Energies, Indices, Crypto | Yes | Yes |
| E8 One Crypto / E8 Pro Crypto | Crypto only | Commission only | Yes |

- **No numeric spread figures of any kind appear in this article** — "spread" only appears inside the "No commissions or Raw spreads option" column header (a Yes/No/Commission-only flag describing pricing model, not a pip value). The article instead refers readers to a separate live website for actual spread numbers, and to a separate page for futures instruments. **This gap is confirmed genuine, not a fetch artifact** (identical result across two independent methods).
- "Can I trade spot or CFD?": all accounts are demo; no CFD/spot/futures execution occurs anywhere — "The market data is real. The capital is not."
Load-bearing quotes: "The market data is real. The capital is not."

---

## 38. 5514982-how-much-leverage-do-you-offer

URL: https://help.e8markets.com/en/articles/5514982-how-much-leverage-do-you-offer
Method: browser (direct navigation, confirmed byte-identical to an earlier cross-validated jina pass, including the source's own "Indicies" typo)
Freshness marker: "Updated over 2 weeks ago"

FACTS:
- **"Leverage will differ between each product, but not between stages."** Explicitly: completing the Challenge and moving to Performance does **not** change leverage for any product. (This directly contradicts a leverage eval-vs-funded step-down claim that had circulated as an unconfirmed secondary source.)
- **Table 1 — Leverage for Forex Products** (full, columns: Forex / Indices ["Indicies," sic] / Metals / Energies / Crypto):

| Product | Forex | Indices | Metals | Energies | Crypto |
|---|---|---|---|---|---|
| E8 One | 1:30 | 1:15 | 1:15 | 1:15 | 1:1 |
| E8 Pro Forex | 1:30 | 1:15 | 1:15 | 1:15 | 1:1 |
| E8 Signature Forex | 1:30 | 1:15 | 1:15 | 1:15 | 1:1 |

- **Table 2 — Leverage for Crypto Products** (full, columns: Bitcoin / Ethereum / Other Crypto):

| Product | Bitcoin | Ethereum | Other Crypto |
|---|---|---|---|
| E8 Signature Crypto | 1:5 | 1:5 | 1:2 |
| E8 One Crypto | 1:5 | 1:5 | 1:2 |
| E8 Pro Crypto | 1:5 | 1:5 | 1:2 |

- **NOT STATED**: E8 Zero and E8 Classic are not named anywhere in this article — no leverage figures published for them here. No indices/metals/energies leverage given for crypto-line products (Table 2 has no such columns).
- Qualitative guidance: prioritize risk allocation/drawdown rules over maximum leverage; overleveraging + large volume risks a stop-out call closing active positions.
Load-bearing quotes: "Leverage will differ between each product, but not between stages"; "focusing on your risk allocation rather than on your leverage."

---

## 39. 14497820-how-can-i-change-my-trading-platform

URL: https://help.e8markets.com/en/articles/14497820-how-can-i-change-my-trading-platform
Method: browser (direct navigation, confirmed matching and extending an earlier cross-validated jina pass; corrected its freshness marker)
Freshness marker: "May 1, 2026" (jina had reported "none shown" after two independent checks — a confirmed jina omission, corrected here)

FACTS:
- **Eligibility conditions (verbatim numbered list)**: (1) you are in the challenge stage; (2) there is no trading activity on the account; (3) the trading platform is supported in your country.
- Frequency restriction: platform can be changed **only once per paid order**.
- US-specific restriction: cannot change to MT5 or cTrader (matches article 36).
- Forex/Crypto products cannot switch to Futures-based platforms.
- Process: email support@e8markets.com with the account number and desired platform; no self-service dashboard toggle is described.
- Unverified technical note (reported by, not confirmed independently of, the fetching method): the underlying mailto link target may differ from the displayed address ("support@e8funding.com" vs. the visible "support@e8markets.com") — flagged as reported-but-unverified since it rests on the extraction pipeline reading a raw href, which could not be independently confirmed via DOM inspection in this session.
Load-bearing quotes: "the trading platform can be changed only once per 1 paid order"; "Clients from the USA are unable to change platforms to MT5 and cTrader."

---

## Summary: fetch outcomes

All **39/39 articles fetched successfully** — zero outright failures (no 404s, no permanently blocked pages). Method breakdown:

- **34 articles browser-confirmed** (direct navigation, `tabs_create` → `navigate` → `get_page_text`, with DOM `textContent` fallback where accordions were collapsed): 1–20, 23, 24, 25, 26, 27, 28, 30, 32, 34 (surrounding context; its two formulas specifically are jina-sourced, see below), 35, 36, 37, 38, 39.
- **5 articles jina-only** (browser tab pool was at capacity when these were fetched; each was cross-checked internally with 2–3 independently-prompted jina passes rather than a live browser re-fetch): 21, 22, 29, 31, 33 — plus article 34's two exact margin/margin-utilization formulas specifically (the rest of that article is browser-confirmed).

The 5 jina-only articles (21, 22, 29, 31, 33) carry a residual, if low, risk of an undetected jina silent-drop, since they were not independently re-verified against a live browser render in this session. Everything else — including every article the task flagged as a priority target — is browser-confirmed.
