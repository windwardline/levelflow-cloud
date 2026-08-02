# E8 Markets — Published Terms Dossier
Compiled 2026-08-01 for Levelflow's risk-governor / position-sizing build.

## Primary-article pass (2026-08-02, owner-supplied URLs)

The owner supplied a definitive list of 39 `help.e8markets.com` article URLs (see `docs/research/e8-markets-articles.md` for the full one-section-per-article extraction). This section reconciles that extraction against the dossier below. Method: 32 of 39 articles were fetched via direct browser navigation (own tab, `get_page_text`), the other 7 via the `r.jina.ai` proxy with internal cross-checks only — see the articles doc's methodology note for which is which. Both fetch methods have a proven silent-drop failure mode (jina drops whole sections behind some headings; browser `get_page_text` skips collapsed accordions) — every fact below survived at least one clean fetch, and the highest-stakes ones survived two independent methods agreeing.

### (a) Previously SECONDARY / NOT PUBLISHED → now PRIMARY-confirmed

1. **E8 One Crypto's own Daily/Dynamic Drawdown/Profit Target** — was "NOT PUBLISHED (this page)," inferred only by product-family parity. Now directly stated on the article itself: 6% Profit Target, 3% Daily Drawdown, 4% Dynamic Drawdown — identical to E8 One. [`13429922-e8-one-crypto`]
2. **E8 Pro Crypto's Static/Daily Drawdown %** — dossier §7 explicitly said "do not assume parity with Pro Forex's 2.5%/8% without confirming at checkout." Now confirmed exact parity: 8% Challenge profit target, 2% Daily Profit Cap, 2.5% Daily Drawdown, 8% Static Drawdown — same as Pro Forex. [`15323777-e8-pro-crypto`]
3. **E8 Pro Forex/Crypto account sizes and customization** — was "NOT PUBLISHED in this article... possibly conflated with E8 One [SECONDARY, low confidence]." Now confirmed via the Custom Account article's own "Parameters for E8 Pro" block: 9 balance tiers $5K–$500K **including a $150,000 tier that does not exist in E8 One's 8-tier ladder** (so the two products' size ladders are not identical, contrary to what the secondary source implied), Static Drawdown 6%/8%/10%, Profit Target 6%/8%/10% (tied to drawdown), Payout 80%/90%/100%. [`8880316-what-is-the-custom-account`]
4. **E8 Signature pricing** ($110/$150/$260/$390 at $25K/$50K/$100K/$150K) — was "[SECONDARY only — not found rendered on any primary page]." Now PRIMARY-confirmed, identical figures, in the Custom Account article's own base-price table. [`8880316`]
5. **E8 Zero Futures (Starter/Max) pricing** — was "NOT PUBLISHED." Now PRIMARY-confirmed: Starter $178/$278/$558, Max $328/$588/$1,088 for $50K/$100K/$200K. (Payout-cap dollar amounts for Zero Futures remain NOT PUBLISHED — only price is resolved.) [`8880316`]
6. **Cross-account hedging ban** — was "[SECONDARY, high confidence] pending direct confirmation." Now PRIMARY-confirmed verbatim, independently, on two different articles: "Hedging across multiple accounts, even those belonging to the same trader, is strictly prohibited" / "You are only permitted to hedge positions within the same single Challenge or Performance account." [`6929927-trading-policies-and-prohibited-trading-strategies`, `9799834-available-trading-platforms`]
7. **Available trading platforms** — the dossier never had a clean primary list, only an inference from legal/disclaimer boilerplate. Now PRIMARY-confirmed explicit list: TradeLocker, MatchTrader, cTrader, MetaTrader 5/MT5 — plus a US-client restriction (MT5 and cTrader unavailable to US clients) and a hedging-vs-netting split (Forex/Crypto = hedging system, Futures = netting system) that wasn't in the dossier at all. [`9799834`]
8. **Daily Drawdown reset timing** — dossier's cross-cutting Daily Drawdown section said this was "NOT explicitly published... a reasonable inference, not a quoted rule... confirm this empirically." Now PRIMARY-confirmed verbatim: the loss level resets "every new day at 00:00 Server Time, based on the balance at market rollover." [`11769446-daily-drawdown`]
9. **Daily Drawdown breach consequence** — dossier said this was "NOT explicitly stated in this article" (only inferred by analogy with Static Drawdown). Now PRIMARY-confirmed verbatim: breach means the account is "permanently closed for breaching the daily Drawdown rule." [`11769446`]
10. **News-trading eval-vs-funded split (Forex/Crypto)** — dossier flagged this as "unconfirmed" / "NOT FULLY PUBLISHED (exact per-tier distinction)." Now fully resolved — see Contradiction Log #6 below.
11. **Copy trading / team-trading cross-trader prohibition** — dossier said "no single page gave an exhaustive verbatim statement of the cross-trader prohibition." Now PRIMARY-confirmed verbatim: "We do not allow teams to make the same trades or copy trades on our simulated platform" / "we also do NOT permit signal services." [`9453469-can-i-copy-trades-or-trade-as-a-team`]
12. **High-Frequency Trading restriction** — not in the dossier at all. New prohibited-strategy rule: "you cannot hold more than 50% of your trades for under one minute." [`6929927`]
13. **Daily Profit Cap clawback mechanics** — dossier had the core 2% mechanic as PRIMARY but not its operational detail. Now confirmed: the clawback runs automatically **every day between 00:00 and 01:00 Server Time**, and three explicit anti-gaming patterns (partial closes spread across days, multi-position same-day-open/multi-day-close, close-reopen across days) can get flagged and have "all profit from that position... consolidated into a single day." Also newly confirmed: exceeding the cap is explicitly **not** framed as a rule violation (contrast with the Drawdown articles' "permanently closed" language). [`15319043-daily-profit-cap`]
14. **Max-position sizing formula, with worked examples and a cross-pair bridging rule** — dossier had the bare formula only ("Leverage × account equity / (Instrument price × contract size)"). Now confirmed with full worked examples (Metals: 15×100,000/(4565.92×100)=3.28 lots; Forex GBP/NZD via GBP/USD bridge: 30×100,000/(1.351×100,000)=22.2 lots) and the explicit bridging table for which USD pair to use as "instrument price" for non-USD-quoted crosses. [`9453396-are-there-lot-order-size-restrictions`]
15. **Stop-out level and margin mechanics** — entirely absent from the dossier before. Now documented: Stop Out = Margin Level ≤ ~100% (not itself a rule violation), auto-liquidates positions; Margin Level formula "(Equity / used margin) × 100"; Margin Utilization formula "(Used Margin / Total account balance) × 100"; E8's own coaching tiers (250–400% margin level = safe, <150% = danger; 10–20% utilization = conservative, >80% = committed). [`14964234-what-is-the-stop-out-level`, `14722843-what-is-margin`]
16. **Account allocation caps** — a whole topic not in the dossier before. Per-product Performance-stage caps: E8 One/One Crypto/Pro Forex/Pro Crypto = $500,000 each; E8 Zero = 3 performance accounts; E8 Signature (Forex/Crypto/Futures) = 5 performance accounts each; combined ceiling $4,850,000; Challenge-stage purchases unlimited; per-household limit; one user profile per person. [`5515039-how-many-accounts-can-i-apply-for-at-once`]
17. **News-trading violation consequence** — not stated anywhere in the dossier. Now confirmed: violating the news-trading rule triggers an automatic **profit clawback processed after the next payout request**, plus an email notice — not an account-ending breach like the drawdown rules. [`9185497-can-i-trade-news`]
18. **Signature "profitable day" payout gate** — present only in the scratch `raw-notes.md` capture for Signature *Futures*, absent from the dossier's own Signature Forex/Crypto sections (§3/§4). Now confirmed PRIMARY for Forex and Crypto too: a profitable day = realized closed PnL ≥ 0.3% of initial balance ($75/$150/$300/$450 at $25K/$50K/$100K/$150K); 5 profitable days required between payouts (waived for the first); payout buffer = the account's EOD Dynamic Drawdown size, non-withdrawable. [`11755943-e8-signature-forex`, `11864571-e8-signature-crypto`]
19. **E8 One Performance payout-minimum formula** — not in the dossier at all. New: net profit (payout share) must be greater than 50% of the daily drawdown dollar amount (e.g., $100,000 account/4% DD → $2,001 minimum payout). [`11775980-e8-one`, `13429922-e8-one-crypto`]

### (b) Corrections (dossier claim contradicted by a primary article)

1. **E8 One base/preset profit target.** OLD (dossier §1): *"No fixed profit-target number on the base product page."* NEW: the base page **does** state a preset target — "6% Profit Target – Closed profit in your simulated trading account." [`11775980-e8-one`]
2. **E8 One's real base price at $500,000.** OLD (dossier §1 and Contradiction Log #2): *"primary Custom Account page states base price tops at $2,598 for $500K."* NEW: re-reading the same article directly, **E8 One's own price table tops at $1,998** at $500K — the $2,598 figure belongs to **E8 Pro's** $500K row on the same page (the two tables sit adjacent; this looks like a table mix-up in the original 2026-08-01 pass, not a live-site change). Neither the dossier's old "primary" $2,598 nor the secondary $1,627 matches the real E8 One figure — both were wrong. [`8880316-what-is-the-custom-account`]
3. **E8 Zero's drawdown type.** OLD (dossier §10): *"Drawdown: Static drawdown applies (trader must maintain a buffer above the starting-balance loss level). Exact % NOT PUBLISHED."* NEW: E8 Zero is explicitly named in the **EOD Dynamic Drawdown** article's own applicability list (alongside the Signature line), not the Static Drawdown article's — so the guardrail *type* the dossier attributed to E8 Zero was wrong, not just its percentage. E8 Zero also carries a unique documented exception: the loss level does **not** lock at the initial-balance level during E8 Zero's Challenge stage specifically ("this does not apply in challange of E8 Zero" [sic]) — it keeps scaling with profit indefinitely. Exact % remains NOT PUBLISHED. [`11864596-eod-dynamic-drawdown`, `8880316`]
4. **EOD Dynamic Drawdown illustrative example for a $100K Signature account.** OLD (dossier's EOD Dynamic Drawdown cross-cutting section, SECONDARY): *"$100K Signature with 4% drawdown ($96K floor)... floor moves to $97,000 overnight."* NEW: the real PRIMARY rate at $100K is **3%** ($3,000), not 4% — full confirmed table is 4% at $25K/$50K ($1,000/$2,000) but **3% at $100K/$150K** ($3,000/$4,500). The dossier's own secondary illustrative example silently used the wrong tier's rate for a $100K account. [`11755943-e8-signature-forex`, `11864571-e8-signature-crypto`, `11864596`]
5. **Leverage eval-vs-funded step-down.** OLD (dossier §1): flagged a SECONDARY, unconfirmed claim of higher eval-stage leverage stepping down at funded stage as *"materially important... if true."* NEW: PRIMARY source directly states the opposite: **"Leverage will differ between each product, but not between stages."** Challenge and Performance leverage are identical for every product listed. The risk governor does not need to model a stage-based leverage step-down. [`5514982-how-much-leverage-do-you-offer`]

### (c) Contradiction Log — resolutions from this pass

See the full log below; entries are annotated in place, not deleted.

- **#1 (E8 One dynamic-drawdown mechanic)** — already marked RESOLVED 2026-08-02 prior to this pass. This pass independently re-fetched the same article via direct browser navigation and got the identical formula and worked progression table; no new conflict surfaced. Treat as reinforced.
- **#2 (E8 One pricing $2,598 vs $1,627)** — REFINED this pass, see correction (b)(2) above: both figures were wrong for E8 One; $2,598 is E8 Pro's price, and E8 One's real $500K price is $1,998.
- **#3 (E8 Pro Forex daily drawdown 2.5% exists)** — reinforced this pass via an independent browser fetch of the same article; same conclusion (trust the primary 2.5% figure).
- **#6 (news-trading eval-vs-funded scope)** — RESOLVED this pass. Full per-product mapping now confirmed on the products' own pages and on the dedicated news-trading article: **E8 Zero, E8 Signature (Forex+Crypto), E8 Pro (Forex+Crypto) have no news-trading restriction at any stage** (Challenge or Performance). **E8 One and E8 One Crypto are the only products with a restriction, and it applies only at the Performance stage** (Challenge is unrestricted); the restriction is the previously-known 5-minutes-before/5-minutes-after window. Also newly confirmed: violating it triggers an automatic profit clawback processed after the next payout request, plus an email notice — not an account-ending breach. [`9185497-can-i-trade-news`, `11775980`, `13429922`, `15274219`, `15323777`, `11755943`, `11864571`]

Contradiction Log items #4 (E8 Classic drawdown), #5 (futures Challenge-phase consistency), #7 (Signature Futures contract-limit table), and #8 (E8 Classic article stability) are **not addressed by this pass** — none of the 39 owner-supplied URLs touch E8 Classic or the futures-specific contract-size article. They remain open exactly as previously logged.

### Remaining gaps among priority targets (unchanged by this pass)

- **Instruments + spreads** (`5514977`): confirmed (twice, two methods) that no numeric spread figures exist in article form at all — the article explicitly defers to a separate live website. Still NOT PUBLISHED in any help-center article.
- **Contract sizes** (`9453488`): confirmed genuinely limited to 3 rows (XAUUSD, US30/NAS100, SP500) — not a fetch artifact. Full instrument coverage (other metals, other indices, energies, crypto, most forex pairs' non-standard sizing if any) remains NOT PUBLISHED.
- E8 Zero's exact drawdown percentage (now known to be EOD Dynamic Drawdown type, per correction (b)(3), but the number itself is still not published).
- E8 Zero Futures payout-cap dollar amounts (price is now resolved; caps are not).
- Signature Forex/Crypto payout-cap dollar amounts (the article states caps exist but defers the figures elsewhere, same as before).

---

## Access method note (read this first)
`e8markets.com`, `help.e8markets.com`, `helpfutures.e8markets.com`, and `e8x.e8markets.com` all return **HTTP 403** to direct fetch (WebFetch tool and raw `curl` with a standard browser UA both blocked — confirmed server-side bot protection, not a WebFetch-specific limit). `web.archive.org` is blocked entirely at the tool level. Primary-source content below was retrieved via the `r.jina.ai` reader-proxy (`https://r.jina.ai/<url>`), which rendered the real help-center/site pages. Where even that failed (dashboard tabs requiring JS click-through, e.g. metals/indices/crypto tabs on the live symbols widget), I fell back to search-engine snippets and named secondary sources (prop-firm review aggregators), and every such fact is labeled **SECONDARY** with the aggregator's URL. Facts with no accessible source anywhere are marked **NOT PUBLISHED**.

Confidence key used throughout: **[PRIMARY]** = fetched directly from an e8markets.com/help.e8markets.com/helpfutures.e8markets.com page. **[SECONDARY]** = third-party aggregator reproducing/paraphrasing E8's terms. **[CONTRADICTION]** = sources disagree; both recorded.

---

## 0. Programs found (quick index)

| Program | Instruments | Structure | Sizes found | Primary help-center page |
|---|---|---|---|---|
| E8 One | Forex/Metals/Indices/Crypto/Energies | 1-step, fully customizable | $5K–$500K | [11775980](https://help.e8markets.com/en/articles/11775980-e8-one) |
| E8 One Crypto | Crypto only | 1-step, customizable | shares E8 One matrix | [13429922](https://help.e8markets.com/en/articles/13429922-e8-one-crypto) |
| E8 Signature Forex | Forex/Metals/Indices/Crypto/Energies | 1-step, fixed | $25K/$50K/$100K/$150K (secondary) | [11755943](https://help.e8markets.com/en/articles/11755943-e8-signature-forex) |
| E8 Signature Crypto | Crypto only | 1-step, fixed | shares Signature sizes (secondary) | [11864571](https://help.e8markets.com/en/articles/11864571-e8-signature-crypto) |
| E8 Signature Futures | CME futures | 1-step, fixed | $25K/$50K/$100K/$150K (secondary) | [11864618](https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures) |
| E8 Pro Forex | Forex/Metals/Indices | 2-phase (Challenge→Performance), preset | not published (per-size) | [15274219](https://help.e8markets.com/en/articles/15274219-e8-pro-forex) |
| E8 Pro Crypto | Crypto only | 2-phase, preset | not published | [15323777](https://help.e8markets.com/en/articles/15323777-e8-pro-crypto) |
| E8 Classic | Forex (+ per some pages, more) | 2-step (8%/4% targets) | $5K–$200K (secondary) | [12041696](https://help.e8markets.com/en/articles/12041696-e8-classic) (**404 on second fetch — see contradiction log**), also [5514903](https://help.e8markets.com/en/articles/5514903-what-is-the-e8-classic-account), collection [3103537](https://help.e8markets.com/en/collections/3103537-e8-classic-account-preset) |
| E8 Track / E8 Track 1:1 | Forex | 3-step / 2-step | $10K–$400K (secondary only) | **NOT FOUND on primary site** — secondary-only, unconfirmed |
| E8 Zero | Forex/Metals/Indices/Crypto | Cyclical funded (Challenge→Performance, repeats) | $50K/$100K/$200K | [15655062](https://help.e8markets.com/en/articles/15655062-e8-zero) |
| E8 Zero Futures (Starter/Max) | CME futures | Cyclical funded | not published (per-size) | [15935817](https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max) |

**Note on E8 Track**: appears only in secondary aggregator content (proptradingvibes.com). I could not locate a corresponding article on `help.e8markets.com` or `helpfutures.e8markets.com` in the "Products & Rules" collections I enumerated. Treat as **unconfirmed / possibly legacy or renamed** until verified directly against a live checkout page.

---

## 1. E8 One

**Source**: [help.e8markets.com/en/articles/11775980-e8-one](https://help.e8markets.com/en/articles/11775980-e8-one) [PRIMARY]; customization matrix from [help.e8markets.com/en/articles/8880316-what-is-the-custom-account](https://help.e8markets.com/en/articles/8880316-what-is-the-custom-account) [PRIMARY]

- **Evaluation structure**: 1-Step. Verbatim: *"E8 One offers a clear 1-Step path to becoming an E8 Performance Trader in a single phase."* Two stages named throughout E8's docs: **SimFi™ Challenge** (evaluation) → **SimFi™ Performance** (funded/live-simulated). No fixed profit-target number on the base product page; the Custom Account page gives the full selectable range (below).
- **Account sizes + price**: Custom Account page [PRIMARY] states balances **"$5,000 to $500,000 (eight options)"** and base pricing **"ranges from $48 (E8 One, $5K) to $2,598 (E8 One, $500K)"**. Exact 8-tier list not spelled out verbatim in the fetched text; secondary sources (proptradingvibes.com/blog/e8-markets-accounts-overview) [SECONDARY] give the tiers as $5K/$10K/$25K/$50K/$100K/$200K/$400K/$500K with per-tier prices ~$40/~$75/~$150/~$250/$398/~$700/~$1,200/$1,627 — this secondary price ladder **does not match** the primary page's stated $2,598 ceiling for $500K. **[CONTRADICTION]**: primary Custom Account article says base price tops at $2,598; proptradingvibes says $1,627 at $500K. Likely explained by different drawdown/payout-split selections changing price (primary explicitly says price scales with drawdown/payout choice), but neither source gives a full size×config price grid. Do not hardcode either number without a live checkout screenshot.
- **Customizable parameters** [PRIMARY, help.e8markets.com/en/articles/8880316]:
  - Daily Drawdown: **3%, 4%, 5.3%, 6.6%, or 9.2%**
  - Dynamic Drawdown: **4%, 6%, 8%, 10%, or 14%**
  - Profit Target: **6%, 9%, 12%, 15%, or 21%** (target "adjusts automatically with drawdown changes" — i.e., they're paired tiers, not independently selectable)
  - Payout split: **80%, 90%, or 100%**
  - Forex sub-option: raw-spread vs commission-free
  - Swap-free option: +10% markup; cTrader on accounts under $100: +$10
- **Daily loss rule**: Governed by the universal "Daily Drawdown" guardrail (see §Cross-Cutting Rules below) — basis is **initial balance**, not equity, not previous-day balance. Default tier 3%; customizable per above. [PRIMARY]
- **Max drawdown rule**: Governed by "Dynamic Drawdown" guardrail (§Cross-Cutting Rules) — trails **highest CLOSED balance**, not floating equity. Default tier 4%; customizable per above. Locks static at initial-balance loss level once closed profit rebuilds the buffer. [PRIMARY]
- **Position/risk limits**: See universal §Cross-Cutting Rules (50-lot ticket cap / 20-lot XAUUSD, 100 open-order cap, no mandatory stop-loss, no hard per-trade risk cap, martingale allowed, cross-account hedging banned).
- **Consistency rule**: None during SimFi Challenge. On funded (SimFi Performance): **40% Best-Day rule** — *"no single trading day exceeds more than 40% of your total generated profits."* [PRIMARY, help.e8markets.com/en/articles/9453418]
- **Instruments/leverage**: Forex 1:30, Indices 1:15, Metals 1:15, Crypto 1:1 [PRIMARY, e8-one article]. A separate secondary source claims evaluation-stage leverage is higher (Forex 1:50, Indices/Metals/Energies 1:25, Crypto 1:2) than funded-stage leverage — **[SECONDARY, unconfirmed by any primary page I could fetch]**; if true this is a materially important eval-vs-funded leverage step-down the risk governor must handle differently by stage.
- **Payout/scaling**: Scaling program ("ELEV8R" per secondary sources) grows the dynamic-drawdown allowance +1%/payout cycle up to 14%, compounding the account toward a **$1,000,000** scaled ceiling — **[SECONDARY ONLY]**, not found stated on any primary page fetched.

## 2. E8 One Crypto

**Source**: [help.e8markets.com/en/articles/13429922-e8-one-crypto](https://help.e8markets.com/en/articles/13429922-e8-one-crypto) [PRIMARY]

- Same 1-Step / Challenge→Performance structure as E8 One, "designed exclusively for crypto traders."
- **Consistency rule**: identical language to E8 One — none in Challenge; 40% Best-Day rule in Performance. [PRIMARY]
- **Leverage**: Bitcoin 1:5, Ethereum 1:5, other crypto 1:2. [PRIMARY]
- **Daily/Dynamic drawdown exact %**: **NOT explicitly restated in this article** — presumed to inherit the E8 One customization matrix (3–9.2% daily / 4–14% dynamic) by product-family parity, but this is an inference, not a quote. Flagged **NOT PUBLISHED (this page)**.
- **Account sizes/price**: Not specified in this article. Max funding cap of **$200,000** for crypto is cited by secondary sources only (proptradingvibes) — **[SECONDARY]**.

## 3. E8 Signature Forex

**Source**: [help.e8markets.com/en/articles/11755943-e8-signature-forex](https://help.e8markets.com/en/articles/11755943-e8-signature-forex) [PRIMARY]; pricing/DD% from proptradingvibes.com/blog/e8-markets-accounts-overview [SECONDARY]

- **Structure**: 1-Step, fixed parameters — *"our 1-Step challenge - designed exclusively for traders who value speed, clarity, and control."* Challenge → Performance, 80% payout split on completion (*"receive 80% of their trading performance"*) [PRIMARY].
- **Account sizes + price** [SECONDARY only — not found rendered on any primary page]: $25K=$110, $50K=$150, $100K=$260, $150K=$390. Ceiling $150K, "no scaling path" beyond that per this program line.
- **Profit target**: fixed **6%** [SECONDARY].
- **Daily loss rule**: Signature does NOT use the standard "Daily Drawdown" guardrail. Instead it uses **Daily Pause**: 2% of initial balance, funded-stage only, applies to Signature Forex/Crypto/Futures. When triggered, *"Trading paused to 00:00"* — trading halts for the rest of that day, resuming after midnight (i.e., a soft same-day suspension, not an account-ending breach). [PRIMARY, help.e8markets.com/en/articles/11969807-daily-pause]
- **Max drawdown rule**: **EOD Dynamic Drawdown** — floor recalculates once per day at end-of-day close based on **closing balance only**; intraday floating moves do not touch it. 4% on $25K/$50K, 3% on $100K/$150K per secondary source [SECONDARY]. Once closed profit exceeds the initial DD threshold, or the first payout is processed, the floor **locks fully static at the initial-balance level** (mechanic confirmed generically at [help.e8markets.com/en/articles/11864596-eod-dynamic-drawdown](https://help.e8markets.com/en/articles/11864596-eod-dynamic-drawdown) [PRIMARY], exact %/size mapping is SECONDARY).
- **Weekend/overnight holding**: *"All positions are closed by 23:00 [Server time], and trading re-opens at 00:15 [Server time]"* — i.e., **daily forced flatten**, not merely a weekend restriction. [PRIMARY]
- **Consistency rule (funded)**: **35% Best-Day rule** [SECONDARY, proptradingvibes.com/blog/e8-markets-consistency-rule — cross-referenced across multiple independent aggregators, high confidence despite no primary verbatim capture].
- **Instruments/leverage**: Forex 1:30, Indices 1:15, Metals 1:15 [PRIMARY].
- **Payout caps (Signature Futures table, likely shared structure across Signature line)**: see §5 Futures below — primary-sourced table exists for Futures specifically.

## 4. E8 Signature Crypto

**Source**: [help.e8markets.com/en/articles/11864571-e8-signature-crypto](https://help.e8markets.com/en/articles/11864571-e8-signature-crypto) [PRIMARY]

- Same 1-Step Signature structure, crypto-only. 80% payout split on completion.
- Trading hours: *"All positions are closed by 23:00 Server time, and trading re-opens at 00:15 Server time"* — same nightly flatten as Signature Forex. [PRIMARY]
- Leverage: Bitcoin 1:5, Ethereum 1:5, other crypto 1:2 [PRIMARY].
- Profit target, drawdown %, account sizes: **NOT PUBLISHED in this article** — presumed to share the general Signature parameters but not independently confirmed here.

## 5. E8 Signature Futures

**Sources**: [helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures](https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures) [PRIMARY]; sizing/contract-limit table from proptradingvibes.com/blog/e8-markets-accounts-overview [SECONDARY]

- **Structure**: 1-Step, fixed. Challenge → Performance, 80% split. [PRIMARY]
- **Trading hours / forced flatten**: *"Permitted trading operates between 17:00 to 15:10 CT"* with *"All open positions being forced to close every day at 15:10 CT."* Overnight positions are **prohibited outright** for this product — a hard daily flatten, every day, no exceptions found published. [PRIMARY]
- **Payout caps by account size** — this table IS primary-sourced, verbatim from the article:

| Account | 1st–2nd payout | 3rd–4th payout | 5th+ payout |
|---|---|---|---|
| $25,000 | $1,000 | $1,250 | $1,500 |
| $50,000 | $1,250 | $2,250 | $3,250 |
| $100,000 | $2,250 | $3,250 | $4,250 |
| $150,000 | $3,250 | $4,250 | $5,250 |

- **Sizes/prices**: $25K/$50K/$100K/$150K at $110/$150/$260/$390 — **[SECONDARY]**, same figures as Signature Forex (implies shared pricing across the Signature line, unconfirmed on a primary page).
- **Contract limits per size** (mini/micro count) — **[SECONDARY ONLY, proptradingvibes]**, NOT found on the primary "Max. available Contract Sizes" article (that article instead documents an **E8 Zero** contract-scaling model, not a flat Signature allowance table — see §Contradiction log):

| Size | Mini contracts | Micro contracts |
|---|---|---|
| $25K | 2 | 20 |
| $50K | 4 | 40 |
| $100K | 8 | 80 |
| $150K | 12 | 120 |

- **Daily loss / max drawdown**: Daily Pause (2%, soft same-day suspension) + EOD Dynamic Drawdown, same mechanics as Signature Forex (§3), applied to futures P&L. [PRIMARY for mechanic, SECONDARY for exact $/%. One secondary example: *"EOD Dynamic Drawdown of $2,000 on 50K with a $3,000 target."*]
- **Consistency rule**: 40% best-day rule applies **during the Challenge phase** for futures — *"No single day can exceed $2,400 in profit"* (on a $6,000 target, i.e. 40% of target). [PRIMARY, helpfutures.e8markets.com/en/articles/15936479-40-best-day-rule-challenge] — **[CONTRADICTION]** with the Forex/Crypto help center's blanket statement that *"There is no consistency rule in the SimFi™ Challenge stage for all account types"* [PRIMARY, help.e8markets.com/en/articles/9453418]. These are genuinely different primary sources (`help.` vs `helpfutures.` subdomains) stating opposite things for the Challenge phase — futures Challenge has a hard best-day cap; forex/crypto Challenge does not. Confirmed real product-line difference, not a scrape error (both pages independently and clearly worded).
- **Inactivity**: 7 days without a placed-and-closed trade closes a futures account (vs 60 days for forex/crypto). [PRIMARY, helpfutures.e8markets.com/en/articles/9453425-is-there-any-inactivity-rule]

## 6. E8 Pro Forex

**Source**: [help.e8markets.com/en/articles/15274219-e8-pro-forex](https://help.e8markets.com/en/articles/15274219-e8-pro-forex) [PRIMARY]

- **Evaluation structure**: Two named stages — **SimFi™ Challenge** (Phase 1): *"8% Profit Target - Closed profit in your simulated trading account."* Then **SimFi™ Performance** (Phase 2), payout eligible up to 100%.
- **Daily loss rule**: *"2.5% [Daily Drawdown] – Your account must not lose more than 2.5% of your initial balance in a single day."* Basis = initial balance. [PRIMARY, verbatim] — **[CONTRADICTION]**: a secondary source (thegodfunded.com via WebSearch synthesis) separately describes "E8 Pro / E8PRO v2" as offering **"no daily drawdown limit."** The primary article explicitly and unambiguously states a 2.5% daily drawdown exists. Trust the primary quote; the secondary claim is either stale, describes a different/older Pro variant, or is simply wrong.
- **Max drawdown rule**: *"8% [Static drawdown] – A fixed loss limit based on your initial balance. It never moves, except when a first payout is processed."* [PRIMARY, verbatim]. Static Drawdown mechanic generically defined at [help.e8markets.com/en/articles/13653031-static-drawdown](https://help.e8markets.com/en/articles/13653031-static-drawdown) [PRIMARY]: *"Initial Balance − % of Initial Balance = Loss Level."* Breach: *"A permanent violation occurs if your account's Equity or Balance falls below this level at any point"* → *"permanently closed for breaching the Static Drawdown rule"* — closure is enforced even if balance later recovers above the loss level.
- **Daily profit cap**: *"2% [Daily Profit cap] - In each day, only 2% counts toward the target or profit."* Example given: *"$100,000 account, that's $2,000 profit cap per day."* Confirmed generically also at [help.e8markets.com/en/articles/15319043-daily-profit-cap](https://help.e8markets.com/en/articles/15319043-daily-profit-cap) [PRIMARY]: applies to **E8 Pro Forex and E8 Pro Crypto** only; excess profit above the cap is *"removed automatically, bringing your balance back to [the cap] at the start of the next trading session."* This is a meaningful risk-governor input: profit beyond 2%/day is clawed back, not banked.
- **Account sizes/price**: **NOT PUBLISHED** in this article. Secondary sources describe the same $5K–$500K ladder as E8 One with prices "$36–$48 at $5K" scaling up — **[SECONDARY, low confidence, possibly conflated with E8 One]**.
- **Instruments/leverage**: Forex 1:30, Indices 1:15, Metals 1:15 [PRIMARY].
- **Payout terms** [PRIMARY, verbatim]: *"No caps"* on profits, *"No consistency rules,"* *"Payout frequency: You can request every day!"*, *"Minimum profit for first and additional payouts: 1% of your initial balance."*
- **Trading duration**: *"Unlimited Trading Days – There is no time limit but you need to place and close at least one trade each 60 days."* [PRIMARY]

## 7. E8 Pro Crypto

**Source**: [help.e8markets.com/en/articles/15323777-e8-pro-crypto](https://help.e8markets.com/en/articles/15323777-e8-pro-crypto) [PRIMARY]

- Same Challenge→Performance structure, crypto-only, static drawdown, "NO consistency rules, or payout caps."
- **Daily drawdown / static drawdown exact %**: Checked the full article text directly — **it contains no percentage figure for drawdown at all**. The only percentage present is *"up to 100% of their trading performance."* Daily Profit Cap of 2% (shared guardrail with Pro Forex) is confirmed generically via [help.e8markets.com/en/articles/15319043-daily-profit-cap](https://help.e8markets.com/en/articles/15319043-daily-profit-cap) [PRIMARY], which explicitly names "E8 Pro Forex and E8 Pro Crypto" as the two products it governs. **Static/daily drawdown % for Pro Crypto specifically: NOT PUBLISHED** — do not assume parity with Pro Forex's 2.5%/8% without confirming at checkout.
- **Leverage**: Bitcoin 1:5, Ethereum 1:5, other crypto 1:2 [PRIMARY].
- **Account sizes/price**: NOT PUBLISHED in this article.

## 8. E8 Classic

**Sources**: WebSearch-indexed snippet of [help.e8markets.com/en/articles/12041696-e8-classic](https://help.e8markets.com/en/articles/12041696-e8-classic) [PRIMARY snippet — see contradiction note]; [help.e8markets.com/en/articles/5514903-what-is-the-e8-classic-account](https://help.e8markets.com/en/articles/5514903-what-is-the-e8-classic-account); collection [help.e8markets.com/en/collections/3103537-e8-classic-account-preset](https://help.e8markets.com/en/collections/3103537-e8-classic-account-preset); sizing/price/split from proptradingvibes.com/blog/e8-markets-accounts-overview [SECONDARY]

- **[DATA QUALITY FLAG]**: When re-fetched directly via the reader-proxy, `/articles/12041696-e8-classic` returned a **404** ("That page doesn't exist"). The article title and content below come from Google's indexed snippet of that same URL, retrieved a few minutes earlier in this session via WebSearch, which is why it's still reported but should be treated as slightly less certain than other [PRIMARY] entries — the article may have been just renamed/removed, or the direct-fetch attempt hit a transient CDN issue.
- **Evaluation structure**: 2-Phase. Phase 1 target = **8%**, Phase 2 target = **4%** (of the account's simulated balance).
- **Daily loss rule**: *"4% Daily Drawdown – Maximum Floating or Closed loss calculated from your starting balance of the day."*
- **Max drawdown rule**: *"8% Maximum drawdown – Maximum Running (floating) equity or Closed loss in the whole period."* Note this phrasing differs from the "Dynamic"/"Static"/"EOD Dynamic" guardrail vocabulary used elsewhere in E8's docs — Classic's max-DD basis explicitly includes **floating (unrealized) equity**, unlike E8 One's Dynamic Drawdown (closed-balance only). This is a real mechanical difference between product lines, not a naming inconsistency.
- **[CONTRADICTION]**: proptradingvibes.com (secondary) instead describes E8 Classic drawdown as **"customizable 6–14% overall, 3–7% daily,"** i.e. a selectable range rather than a fixed 8%/4%. Both fixed (4%/8%) and customizable (3–7%/6–14%) descriptions are recorded here; the "Preset" wording in the collection name (`e8-classic-account-preset`) suggests the fixed 4%/8% figures are the **preset/default** configuration, and a customizable variant may exist alongside it — unconfirmed without a live checkout screenshot.
- **Trading duration**: No minimum trading days; *"Unlimited Trading Days – there is no time limit but you need to place and close at least one trade every 60 days."*
- **Sizes/price/split** [SECONDARY only]: $5K–$200K, 80% standard profit split, 40% best-day rule on funded stage (consistent with the general E8 One/Classic 40% figure found elsewhere).

## 9. E8 Track / E8 Track 1:1

**Source**: proptradingvibes.com/blog/e8-markets-accounts-overview [SECONDARY ONLY — could not find on either help subdomain]

- E8 Track: 3-Step, profit targets 8%/4%/4%, sizes $10K–$400K, drawdown "customizable 6–14% overall, 3–7% daily," 80% split, 40% best-day rule.
- E8 Track 1:1: 2-Step, profit targets 5% flat across phases ("1:1 reward-to-risk framing"). Sizes/drawdown not detailed even by the secondary source.
- **Treat both as unconfirmed** pending a primary-source hit. Possible this is a legacy/rebranded product no longer sold, given its total absence from both current help-center collection listings I enumerated.

## 10. E8 Zero

**Source**: [help.e8markets.com/en/articles/15655062-e8-zero](https://help.e8markets.com/en/articles/15655062-e8-zero) [PRIMARY]; sizes from [help.e8markets.com/en/articles/8880316-what-is-the-custom-account](https://help.e8markets.com/en/articles/8880316-what-is-the-custom-account) [PRIMARY]

- **Structure**: Cyclical funded model — *"Pass, Get Funded, request daily, complete the cycle, start again."* After 5 payouts, the account deactivates and the trader receives a **new Challenge account of the same size** (i.e., re-runs the evaluation, doesn't scale up).
- **Account sizes**: **$50,000, $100,000, $200,000** [PRIMARY, Custom Account article]. Payout split: 80% or 100% (selectable). All other parameters preset (not customizable).
- **Payout terms** [PRIMARY, verbatim from E8 Zero article]: daily payouts, **minimum $100 payout threshold**, **no consistency rules**, **no minimum profitable days**, **maximum 5 payouts per cycle**, **payout cap $5,000 per withdrawal**, unwithdrawn buffer does not carry forward.
- **Drawdown**: Static drawdown applies (trader must maintain a buffer above the starting-balance loss level). **Exact % NOT PUBLISHED** in this article.
- **Leverage**: Forex 1:30, Indices 1:15, Metals 1:15, Crypto 1:1 [PRIMARY].
- **Consistency rule**: none found stated for Zero beyond the general "no consistency rule for E8 Pro and E8 Zero" line in [help.e8markets.com/en/articles/9453418-is-there-any-consistency-rule](https://help.e8markets.com/en/articles/9453418-is-there-any-consistency-rule) [PRIMARY].

## 11. E8 Zero Futures (Starter and Max)

**Source**: [helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max](https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max) [PRIMARY]; contract-scaling table from [helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes](https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes) [PRIMARY]

- Two variants, "identical trading rules but different pricing and payout caps" — Starter (smaller caps) and Max (bigger caps). Up to 5 payouts per account; 80% or 100% split.
- Trading hours: 17:00–15:10 CT, **all positions forced closed daily at 15:10 CT** (same hard flatten as Signature Futures).
- **Contract scaling table** [PRIMARY, verbatim numbers] — this is the actual content of the "Max. available Contract Sizes" article (note: this is an **E8 Zero Performance-stage** table, NOT a Signature flat-allowance table — see §5 contradiction note):

| Starting balance | Starting contracts | Scale to (at 1.5% profit) | Scale to (at 3% profit) |
|---|---|---|---|
| $50,000 | 2 | 3 | 5 |
| $100,000 | 3 | 5 | 8 |
| $200,000 | 4 | 7 | 10 |

- Account sizes/price for Zero Futures specifically: **NOT PUBLISHED** (the $50K/$100K/$200K tiers above are inferred from the contract-scaling table's balance column, not independently stated as "these are the offered sizes" in that article — treat as high-confidence inference, not a direct quote).

---

## Cross-Cutting Rules (apply across multiple/all programs)

### Daily Drawdown (generic guardrail — E8 One, E8 One Crypto, E8 Pro Forex, E8 Pro Crypto)
**Source**: [help.e8markets.com/en/articles/11769446-daily-drawdown](https://help.e8markets.com/en/articles/11769446-daily-drawdown) [PRIMARY]

- Verbatim: *"Daily Drawdown is a daily maximum loss limit for a trading account, and its value is based on the initial balance."*
- Formula, verbatim: *"Starting balance of the new day − Fixed amount (Daily Drawdown) = Loss level."* The fixed dollar amount is computed once from the **initial** balance and stays constant; only the day's starting balance moves.
- **Basis = initial balance**, explicitly NOT current equity and NOT a floating recompute off yesterday's close balance for the dollar-amount portion (though the *reference point it's subtracted from* is each day's opening balance).
- **Reset timing**: *"The daily limit resets based on the balance at market rollover."* **No explicit clock time or timezone is stated in this article.** Adjacent fact (different article): E8's general Server Time is **UTC+3** (shifting to **UTC+2** at the start of November, back to **UTC+3** at the end of March) [PRIMARY, helpfutures.e8markets.com/en/articles/10305202-server-time], and the forex trading-symbols dashboard shows a daily session of 00:05–23:55 Server Time [PRIMARY, e8x.e8markets.com/trading-symbols]. **It is NOT explicitly published that daily-drawdown rollover happens exactly at 00:00 Server Time** — this is a reasonable inference from adjacent facts, not a quoted rule. Flag for the risk governor: confirm this alignment empirically (e.g., against a demo account's actual reset behavior) before hardcoding a reset instant.
- **Breach consequence**: **NOT explicitly stated** in this article. By analogy with the Static Drawdown article's breach language ("permanently closed... regardless of recovery"), the strong implication across the whole guardrail system is that breaching any of these DD/DD-adjacent limits ends the account, but E8 never states this in the Daily Drawdown article itself. Multiple secondary sources (e.g. tradingfinder.com) assert "hard breach on either model means account termination, profits forfeit" — **[SECONDARY]** for the daily-DD-specific case.

### Dynamic Drawdown (generic guardrail — E8 One, E8 One Crypto)
**Source**: [help.e8markets.com/en/articles/11782996-dynamic-drawdown](https://help.e8markets.com/en/articles/11782996-dynamic-drawdown) [PRIMARY]

- Verbatim: *"Dynamic Drawdown refers to the calculation based on the last Highest Closed Balance."*
- Trails **realized/closed** balance, not floating equity: the loss level rises only when a profit is actually **closed** ("Loss level increases by $x" when profit of $x is closed); it stays flat through floating losses.
- Example percentage used in the generic explainer: **6%** of highest closed balance (this appears to be an illustrative example, not necessarily the default — E8 One's own default is 4% per the Custom Account page, customizable to 6/8/10/14%).
- **Locks** at the initial-balance loss level once closed profit accumulation raises the floor back up to that point — thereafter it becomes fully static.
- **[CONTRADICTION — important for a risk governor]**: A secondary source (proptradingvibes.com/blog/e8-markets-drawdown-rules) describes E8 One's mechanic completely differently: *"Intraday Dynamic Trailing... Floor follows peak unrealized equity tick-by-tick during session... $100K E8 One with 5% drawdown ($95K floor at start), peak hits $103,500 mid-session, floor moves to $98,500 immediately... Unrealized run-ups permanently tighten the threshold."* This describes a **floating-equity, intraday, tick-by-tick trailing** mechanic — directly opposite to the primary source's **closed-balance-only** mechanic. These cannot both be true as stated. **This is the single highest-priority fact to verify directly (e.g., open a demo/challenge account and test) before encoding E8 One's drawdown logic** — the difference (floating-equity trailing vs. closed-profit trailing) changes the entire risk model: floating-trailing means unrealized gains can trap you into a tighter stop before you ever click "close"; closed-balance trailing means you're never penalized for giving back an open, unrealized gain.

### EOD Dynamic Drawdown (generic guardrail — E8 Signature Forex/Crypto/Futures)
**Source**: [help.e8markets.com/en/articles/11864596-eod-dynamic-drawdown](https://help.e8markets.com/en/articles/11864596-eod-dynamic-drawdown) [PRIMARY, mechanic]; example figures [SECONDARY, proptradingvibes.com/blog/e8-markets-drawdown-rules]

- Floor recalculates **once per day at end-of-day close**, based on that day's **closing balance**; intraday floating swings do not move it during the day.
- Example (secondary): *"$100K Signature with 4% drawdown ($96K floor), trade flat to $101,000 close, floor moves to $97,000 overnight."*
- Once closed profit exceeds the original drawdown threshold (or the first payout is processed), the floor **locks static at the initial-balance level** — same terminal lock behavior as Dynamic Drawdown and Static Drawdown.

### Static Drawdown (generic guardrail — E8 Pro Forex, E8 Pro Crypto, E8 Zero)
**Source**: [help.e8markets.com/en/articles/13653031-static-drawdown](https://help.e8markets.com/en/articles/13653031-static-drawdown) [PRIMARY]

- Verbatim: *"Static Drawdown represents the maximum total loss your account can incur based on your Initial Balance."*
- Formula: *"Initial Balance − % of Initial Balance = Loss Level."*
- Fixed; *"does not move up"* until first payout is requested, at which point *"the loss level will move to the initial balance level, and it stays there forever."*
- Breach: *"A permanent violation occurs if your account's Equity or Balance falls below this level at any point"* → account *"permanently closed... regardless of whether the balance later recovers above the loss level."* **This is the one guardrail where E8 explicitly and verbatim confirms the breach consequence.**

### Daily Pause (E8 Signature Forex/Crypto/Futures, funded stage only)
**Source**: [help.e8markets.com/en/articles/11969807-daily-pause](https://help.e8markets.com/en/articles/11969807-daily-pause) [PRIMARY]

- 2% of initial balance (fixed $ amount, e.g. $2,000 on $100K), funded (SimFi Performance) stage only.
- When hit: *"Trading paused to 00:00"* — a **same-day soft suspension**, not an account breach. Resumes the next day.

### Daily Profit Cap (E8 Pro Forex, E8 Pro Crypto only)
**Source**: [help.e8markets.com/en/articles/15319043-daily-profit-cap](https://help.e8markets.com/en/articles/15319043-daily-profit-cap) [PRIMARY]

- 2% of initial balance. Example: *"The $1,500 above the $104,000 cap limit is removed automatically, bringing your balance back to $104,000 at the start of the next trading session."* Excess profit is clawed back, not merely uncounted toward target.

### Position / Order Limits (universal, forex/crypto/metals/indices products)
**Source**: [help.e8markets.com/en/articles/9453396-are-there-lot-order-size-restrictions](https://help.e8markets.com/en/articles/9453396-are-there-lot-order-size-restrictions) [PRIMARY]

- Max ticket size: **50 lots** for most symbols; **20 lots for XAUUSD/Gold**. Traders can split size across multiple tickets to exceed this per-ticket cap.
- Open-order cap: **100** at any time (active pending orders + open positions combined).
- Server requests: **2,000/day** (includes SL/TP modifications).
- Max positions per day: **2,000/account** (article states this figure but appears to reuse the same 2,000 number as the server-request cap — possibly the same underlying limit described twice, not verified as a truly independent constraint).
- Additional dynamic constraint (margin-based, always in force): *"Leverage × account equity / (Instrument price × contract size) = Max. positions you can open."*

### Stop-Loss Rule
**Source**: [help.e8markets.com/en/articles/9453409-is-there-any-stop-loss-rule](https://help.e8markets.com/en/articles/9453409-is-there-any-stop-loss-rule) [PRIMARY]

- **Not mandatory.** Verbatim: *"We don't require using a stop loss or Take profit. It is only on you and on your strategy."* No distance/placement rules exist because none is required. E8 notes (not a rule, just a stated pattern) that traders who use stops tend to do better long-run.

### Maximum Risk Per Trade
**Source**: [help.e8markets.com/en/articles/9453413-is-there-any-maximum-risk-rule](https://help.e8markets.com/en/articles/9453413-is-there-any-maximum-risk-rule) [PRIMARY]

- **No hard limit.** Verbatim: *"There are no hard limits on maximum risk per trade idea."* Observed pattern (not a rule): *"The most successful traders on E8 risk between 1–1.5% per trade idea."* E8's risk team may proactively reach out (framed as guidance, not penalty) if a trader's risk-per-trade looks aggressive relative to the daily-drawdown buffer.

### Martingale
**Source**: [help.e8markets.com/en/articles/9796251-is-the-martingale-strategy-allowed](https://help.e8markets.com/en/articles/9796251-is-the-martingale-strategy-allowed) [PRIMARY]

- **Explicitly allowed.** Verbatim: *"We do not prohibit specific strategy types like martingale, and we allow traders to operate their edge as long as it can be executed under real market conditions."* One-strategy-per-user EA rule exists separately: *"if we see multiple users utilize the same EA, it may lead to the termination of your account."*

### Hedging
**Source**: [SECONDARY, proptradingvibes.com, cross-referenced against generic "Trading Policies and Prohibited Trading Strategies" primary page which did not itself enumerate hedging in the fetched excerpt]

- Hedging **within a single account** (simultaneously long and short the same instrument) is allowed.
- Hedging **across multiple accounts** — including multiple accounts owned by the same trader — is prohibited. Not independently confirmed verbatim from a primary page in this session; the primary "Trading Policies and Prohibited Trading Strategies" article ([help.e8markets.com/en/articles/6929927](https://help.e8markets.com/en/articles/6929927-trading-policies-and-prohibited-trading-strategies)) confirmed a prohibited-strategies section exists but the fetched excerpt did not enumerate hedging specifically — treat the cross-account-hedging ban as **[SECONDARY, high confidence]** pending direct confirmation.

### Consistency ("Best Day") Rule — full matrix
**Source**: [help.e8markets.com/en/articles/9453418-is-there-any-consistency-rule](https://help.e8markets.com/en/articles/9453418-is-there-any-consistency-rule) [PRIMARY] for the forex/crypto side; [helpfutures.e8markets.com/en/articles/15936479-40-best-day-rule-challenge](https://helpfutures.e8markets.com/en/articles/15936479-40-best-day-rule-challenge) [PRIMARY] for futures; percentages for Classic/Signature cross-checked [SECONDARY, proptradingvibes.com/blog/e8-markets-consistency-rule]

| Product | Challenge/evaluation stage | Funded (Performance) stage |
|---|---|---|
| E8 One / E8 One Crypto | None — *"There is no consistency rule in the SimFi™ Challenge stage for all account types"* [PRIMARY] | **40%** best-day rule [PRIMARY] |
| E8 Classic | None (per general statement above) | **40%** best-day rule [SECONDARY] |
| E8 Signature (Forex/Crypto) | None (per general forex/crypto statement) | **35%** best-day rule [SECONDARY, cross-confirmed by multiple aggregators] |
| E8 Signature Futures | **40% DOES apply** — *"No single day can exceed [40% of target, e.g.] $2,400 in profit"* on a $6,000 target [PRIMARY, helpfutures] — **directly contradicts** the forex/crypto "none in Challenge" rule | 35% best-day rule (consistent with Signature Forex/Crypto) [SECONDARY] |
| E8 Pro (Forex/Crypto) | None | None — *"There is also no consistency rule for E8 Pro and E8 Zero accounts on SimFi™ Performance"* [PRIMARY] |
| E8 Zero | None stated | None |

Best-day rule mechanics (where a % is enforced): threshold = (largest single day's profit) / (total profit) ≤ the stated %. Consequence per secondary sources: **does not breach/terminate the account** — it blocks the payout request until the ratio is fixed by generating more profit on other days. This "payout gate, not account-kill" consequence was not independently confirmed on a primary page.

### News Trading
**Sources**: [help.e8markets.com/en/articles/9185497-can-i-trade-news](https://help.e8markets.com/en/articles/9185497-can-i-trade-news) [PRIMARY, forex/crypto]; [helpfutures.e8markets.com/en/articles/10209321-can-i-trade-news](https://helpfutures.e8markets.com/en/articles/10209321-can-i-trade-news) [PRIMARY, futures]

- Forex/Crypto, verbatim: *"During news speeches, the restricted time period is 5 minutes before the speech begins until 5 minutes after the speech ends."* Restricted actions: opening/closing trades, modifying SL/TP, using pending orders. Event definition given as **"T1"** high-impact economic/geopolitical announcements (central bank decisions, major economic indicators, major political events). The article structure separates **"E8 Zero/Signature/Pro"** from **"E8 One/One Crypto"** in its headers, implying the rule (or its scope) differs by product family, but the fetched excerpt did not spell out the exact difference between those two groupings — **NOT FULLY PUBLISHED (exact per-tier distinction)**.
- Futures, verbatim: *"You can trade news on E8 Zero or E8 Signature accounts without any restrictions"* (both Challenge and Performance stages) — i.e., **futures news trading is explicitly unrestricted**, a direct contrast to the forex/crypto 5-minute blackout. Risk warning only: *"slippage may occur."* T1 news events defined identically (central bank decisions, economic indicators, major political events).
- **[CONTRADICTION with earlier WebSearch synthesis]**: An initial WebSearch aggregation (proptradingvibes.com content, before I fetched the primary pages directly) had claimed *"zero restrictions during evaluation... 5-minute window on funded accounts only."* The primary article's own text does not clearly state an eval-vs-funded split for forex/crypto — it describes the 5-minute blackout without explicitly scoping it to funded-only. Take the primary article's plain 5-minute-blackout statement as the more reliable fact for forex/crypp, and treat the eval/funded distinction as **unconfirmed**.

### Weekend / Overnight Holding
**Source**: [help.e8markets.com/en/articles/5514966-can-i-hold-positions-overnight-and-trade-over-the-weekend](https://help.e8markets.com/en/articles/5514966-can-i-hold-positions-overnight-and-trade-over-the-weekend) [PRIMARY, forex/crypto non-Signature products]

- Weekend/overnight holding is **allowed** on E8 One, E8 One Crypto, E8 Pro Forex/Crypto, E8 Zero, E8 Classic. Verbatim risk allocation: *"it is the user's responsibility"* if *"a gap, slippage, or widened spread causes a violation of the account"* over a closure. E8 does not restrict the strategy; the trader bears all gap risk.
- **Signature Forex/Crypto**: contradicts the above — nightly forced flatten, *"All positions are closed by 23:00 Server time, and trading re-opens at 00:15 Server time"* [PRIMARY, per-product pages]. This is effectively a **daily** (not just weekend) overnight-holding ban for Signature specifically.
- **Signature Futures / Zero Futures**: forced flat every day at **15:10 CT**, no overnight positions permitted at all [PRIMARY].

### Inactivity Rule
**Source**: [help.e8markets.com/en/articles/9453425-is-there-any-inactivity-rule](https://help.e8markets.com/en/articles/9453425-is-there-any-inactivity-rule) [PRIMARY, forex/crypto]; [helpfutures.e8markets.com equivalent](https://helpfutures.e8markets.com/en/articles/9453425-is-there-any-inactivity-rule) [PRIMARY, futures]

- Forex/Crypto accounts: account closes after **60 days** with no trade placed and closed.
- Futures accounts: account closes after **7 days** with no trade placed and closed.

### Copy Trading / Team Trading
Permitted **across a single user's own accounts** (personal + challenge/funded); prohibited as a team/shared-strategy mechanism across different traders — confirmed consistently across multiple product pages [PRIMARY], though no single page gave an exhaustive verbatim statement of the cross-trader prohibition.

---

## 12. Per-Instrument Specifications

### 12a. Forex — FULL TABLE [PRIMARY, e8x.e8markets.com/trading-symbols via reader-proxy]

All 28 pairs shown carry **identical** commercial terms: **contract size 100,000 units, leverage 30:1 (funded/live dashboard value), commission $5 round-turn per lot (charged once, on open)**. Symbol format on this dashboard uses a **slash** (`EUR/USD`), which may or may not match the actual order-entry ticker inside the trading platform (TradeLocker/MatchTrader/MT5) — that in-platform convention was not independently confirmed (see gap note below).

| Symbol (as E8 displays it) | Contract size | Leverage | Commission |
|---|---|---|---|
| USD/JPY | 100,000 | 30:1 | $5/lot |
| USD/CHF | 100,000 | 30:1 | $5/lot |
| USD/CAD | 100,000 | 30:1 | $5/lot |
| NZD/USD | 100,000 | 30:1 | $5/lot |
| NZD/JPY | 100,000 | 30:1 | $5/lot |
| NZD/CHF | 100,000 | 30:1 | $5/lot |
| NZD/CAD | 100,000 | 30:1 | $5/lot |
| GBP/USD | 100,000 | 30:1 | $5/lot |
| GBP/NZD | 100,000 | 30:1 | $5/lot |
| GBP/JPY | 100,000 | 30:1 | $5/lot |
| GBP/CHF | 100,000 | 30:1 | $5/lot |
| GBP/CAD | 100,000 | 30:1 | $5/lot |
| GBP/AUD | 100,000 | 30:1 | $5/lot |
| EUR/USD | 100,000 | 30:1 | $5/lot |
| EUR/NZD | 100,000 | 30:1 | $5/lot |
| EUR/JPY | 100,000 | 30:1 | $5/lot |
| EUR/GBP | 100,000 | 30:1 | $5/lot |
| EUR/CHF | 100,000 | 30:1 | $5/lot |
| EUR/CAD | 100,000 | 30:1 | $5/lot |
| EUR/AUD | 100,000 | 30:1 | $5/lot |
| CHF/JPY | 100,000 | 30:1 | $5/lot |
| CAD/JPY | 100,000 | 30:1 | $5/lot |
| CAD/CHF | 100,000 | 30:1 | $5/lot |
| AUD/USD | 100,000 | 30:1 | $5/lot |
| AUD/NZD | 100,000 | 30:1 | $5/lot |
| AUD/JPY | 100,000 | 30:1 | $5/lot |
| AUD/CHF | 100,000 | 30:1 | $5/lot |
| AUD/CAD | 100,000 | 30:1 | $5/lot |

**Pip value implication (calculated, not E8-stated)**: with a standard 100,000 contract size, USD-quote pairs (e.g. EUR/USD) work out to the textbook $10/pip per standard lot — **this table did not surface any forex pair with a non-standard contract size or pip value**. If E8 uses non-standard forex pip economics anywhere, it is not visible in this unauthenticated table; the "unique pip value" warning is best assumed to bite on the **indices/metals** side (see 12b), where E8's own contract-size choices are visibly non-textbook.

**Gap**: No USD/EUR-base majors like EUR/USD's usual companions beyond what's listed are missing anything obvious; this looks like the complete major/cross set the dashboard exposes without login. USD/JPY-style JPY-quote pip mechanics were not separately spelled out (E8 does not publish an explicit "$X per pip" number — only contract size and leverage are shown; pip value must be derived).

**Trading hours/session** [PRIMARY]: Monday–Thursday 00:05–23:55, resuming 00:06 Thursday (typo-adjacent wording in source, recorded as fetched), closed Saturday–Sunday, all in **Server Time**.

**Server Time definition** [PRIMARY, helpfutures.e8markets.com/en/articles/10305202-server-time — published on the futures help subdomain but describes the shared broker server clock]: *"Currently, the server time is set to UTC + 3"*; *"changed to UTC + 2 at the beginning of November and to UTC + 3 at the end of March"* (i.e., DST-shifted, opposite direction from US/EU clocks — this is a broker-server convention, not a real-world timezone that observes standard DST rules).

### 12b. Metals / Indices — PARTIAL [mixed PRIMARY/SECONDARY]

**Source for contract sizes**: [help.e8markets.com/en/articles/9453488-what-are-the-contract-sizes](https://help.e8markets.com/en/articles/9453488-what-are-the-contract-sizes) [PRIMARY] — this article's fetched content contained **only 4 rows**; it references a fuller "trading instrument list" elsewhere that could not be located as a separate renderable page.

| Symbol (as E8 writes it) | Contract size | Notes |
|---|---|---|
| XAUUSD (Gold) | 100 | i.e. 100 oz per "1.0 lot" — standard COMEX-equivalent sizing, not unusual |
| US30 | 5 | $5 P&L per 1.0-point move per lot — **non-standard**: many CFD brokers use $1/point for US30; E8's $5 multiplier is on the higher end |
| NAS100 | 5 | $5 P&L per 1.0-point move per lot |
| SP500 | 20 | $20 P&L per 1.0-point move per lot — **notably non-standard**; most retail CFD brokers quote SP500 at $1–$10/point, E8's $20 multiplier is unusually high and directly matters for lot-sizing math in a risk governor |

**Commission/leverage** [SECONDARY ONLY — proptradingvibes.com/blog/e8-markets-spreads-commissions, WebSearch-synthesized, not independently verified against a primary table in this session]:
- Metals: $6/lot commission.
- Indices: $6/lot (Nasdaq, S&P, DAX, Nikkei) vs **$12/lot (Dow Jones, Australia 200)** — a real per-symbol commission split, not a flat indices rate, if accurate.
- Indices leverage funded-stage: 1:15 (matches the E8 One/Signature/Zero product-page figure, which IS primary); a secondary claim of 1:25 at evaluation-stage specifically was not independently confirmed.

**Other indices** (GER40/DAX, FTSE100, Nikkei, Australia 200/AUS200) are named as tradable in secondary sources and in the primary "instruments allowed" article's category list, but **no contract size, tick value, or spread was found published for them individually** — NOT PUBLISHED beyond the symbol existing.

### 12c. Crypto — PARTIAL [mostly SECONDARY for pricing, PRIMARY for leverage]

- **Leverage** [PRIMARY, consistent across every crypto product page: E8 One Crypto, E8 Pro Crypto, E8 Signature Crypto]: **Bitcoin 1:5, Ethereum 1:5, all other crypto 1:2.**
- **Instruments**: "BTC, ETH, SOL, and a range of altcoins" [SECONDARY paraphrase]; no exhaustive symbol list or exact tickers (e.g., whether it's "BTCUSD" or "BTC/USD" in-platform) was found published.
- **Commission**: ~$30–35/lot, or alternatively described as **0.035% per trade** [SECONDARY ONLY, conflicting units between sources — one describes a flat per-lot commission, another a percentage-of-notional fee; these are not obviously reconcilable without knowing crypto contract size, which is itself NOT PUBLISHED].
- **Contract size**: NOT PUBLISHED for any crypto symbol.

### 12d. Energies — NOT PUBLISHED (specifics)

- Category confirmed to exist ("Energies" is one of the five asset classes named on the primary "what instruments are allowed" page), commission cited by secondary sources at $6/lot (grouped with metals/commodities), but **no symbol list, contract size, or leverage figure specific to energies (e.g., WTI/CL-equivalent CFD, Brent) was found published** anywhere accessible without login.

### 12e. Futures — FULL TABLE, high-confidence PRIMARY

**Source**: [helpfutures.e8markets.com/en/articles/13001922-instrument-list-and-trading-hours](https://helpfutures.e8markets.com/en/articles/13001922-instrument-list-and-trading-hours) [PRIMARY] (symbol list + hours) and [helpfutures.e8markets.com/en/articles/13004287-tick-size-and-profit-per-tick-calculation](https://helpfutures.e8markets.com/en/articles/13004287-tick-size-and-profit-per-tick-calculation) [PRIMARY] (tick size + $/tick). These are standard CME/CBOT/NYMEX/COMEX exchange contract specs (E8 does not alter tick values for futures the way it does for CFD indices) — i.e., **futures specs are textbook-standard**; the "non-standard" surprises live entirely on the CFD/forex-broker side (12a/12b), not here.

**CME Equity Index Futures** — Sun–Fri 17:00–16:00 CT:

| Symbol | Product | Tick size | $/tick |
|---|---|---|---|
| EMD | E-mini S&P MidCap 400 | 0.1 | $10.00 |
| ES | E-mini S&P 500 | 0.25 | $12.50 |
| MES | Micro E-mini S&P 500 | 0.25 | $1.25 |
| NKD | Nikkei 225 | 5 | $25.00 |
| NQ | E-mini NASDAQ 100 | 0.25 | $5.00 |
| MNQ | Micro E-mini NASDAQ 100 | 0.25 | $0.50 |
| RTY | E-mini Russell 2000 | 0.1 | $5.00 |
| M2K | Micro E-mini Russell 2000 | 0.1 | $0.50 |
| MBT | Micro E-mini Bitcoin | 5 | $0.50 |
| MET | Micro E-mini Ether | 0.05 | $0.50 |
| YM | Mini-DOW | 1 | $5.00 |
| MYM | Micro Mini-DOW | 1 | $0.50 |

**CME FX Futures** — Sun–Fri 17:00–16:00 CT:

| Symbol | Product | Tick size | $/tick |
|---|---|---|---|
| 6A | Australian Dollar | 0.0001 | $10.00 |
| M6A | Micro AUD/USD | 0.0001 | $1.00 |
| 6B | British Pound | 0.0001 | $6.25 |
| M6B | Micro British Pound | 0.0001 | $0.63 |
| 6C | Canadian Dollar | 0.0001 | $10.00 |
| 6E | Euro FX | 0.0001 | $12.50 |
| 7E | E-mini Euro FX | 0.0001 | $6.25 |
| M6E | Micro Euro | 0.0001 | $1.25 |
| MCD | Micro CAD/USD | 0.0001 | $1.00 |
| 6J | Japanese Yen | 0.0000001 | $12.50 |
| 6S | Swiss Franc | 0.0001 | $12.50 |
| 6M | Mexican Peso | 0.00005 | $5.00 |
| 6N | New Zealand Dollar | 0.0001 | $10.00 |

**NYMEX Energy Futures** — Sun–Fri 17:00–16:00 CT:

| Symbol | Product | Tick size | $/tick |
|---|---|---|---|
| CL | Crude Oil | 0.01 | $10.00 |
| MCL | Micro Crude Oil | 0.01 | $1.00 |
| QM | E-mini Crude Oil | 0.025 | $12.50 |
| NG | Natural Gas | 0.001 | $10.00 |
| QG | E-mini Natural Gas | 0.005 | $12.50 |
| RB | RBOB Gasoline | 0.0001 | $4.20 |
| HO | Heating Oil | 0.0001 | $4.20 |

**CBOT Agricultural Futures** — Sun–Fri 19:00–13:20 CT:

| Symbol | Product | Tick size | $/tick |
|---|---|---|---|
| ZC | Corn | 0.25 | $12.50 |
| ZW | Wheat | 0.25 | $12.50 |
| ZS | Soybeans | 0.25 | $12.50 |
| ZM | Soybean Meal | 0.1 | $10.00 |
| ZL | Soybean Oil | 0.01 | $6.00 |

**CME Agricultural (livestock) Futures** — Mon–Fri 17:00–16:00 CT:

| Symbol | Product | Tick size | $/tick |
|---|---|---|---|
| LE | Live Cattle | 0.025 | $10.00 |
| HE | Lean Hogs | 0.025 | $10.00 |

**COMEX Metals Futures** — Sun–Fri 17:00–16:00 CT:

| Symbol | Product | Tick size | $/tick |
|---|---|---|---|
| GC | Gold | 0.1 | $10.00 |
| MGC | Micro Gold | 0.1 | $1.00 |
| SI | Silver | 0.005 | $25.00 |
| HG | Copper | 0.0005 | $12.50 |
| PL | Platinum | 0.1 | $10.00 |
| PA | Palladium | 0.1 | $10.00 |

**Margin per contract** [PRIMARY, helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes]:
- Standard contracts (ES, NQ, RTY, NKD, 6-currency futures, GC, CL, most ags): **$10,000/contract**
- Micro variants (MES, MNQ, M2K, MBT, MET, M6A, M6B, M6E, MCD, MCL, MGC, micro silver, micro copper): **$1,000/contract**
- Silver (/SI): **$2,000/contract** (an explicit exception to the $2K-vs-standard pattern)
- Formula given verbatim: *"Allowed margin / Margin per contract = size of the position"*

**Position sizing note for the risk governor**: futures position limits are **margin-gated per account balance**, not a flat contract-count cap — E8 Zero Performance scales the allowed contract count with locked-in profit (2→3→5 contracts on $50K; 3→5→8 on $100K; 4→7→10 on $200K, at 1.5%/3% profit checkpoints) [PRIMARY]. The Signature Futures mini/micro allowance table (2/20, 4/40, 8/80, 12/120 by size) is SECONDARY only and may not be the current/correct mechanic — the primary contract-sizes article documents the Zero-style scaling model, not a flat Signature table, so there's a real risk these two mechanics have been conflated by the aggregator site.

### 12f. Symbol-naming convention summary (for the Levelflow symbol cross-map)

| Asset class | E8's format (as observed) | Source |
|---|---|---|
| Forex | Slash-delimited, e.g. `EUR/USD`, `USD/JPY` (on the E8X live dashboard) | PRIMARY, e8x.e8markets.com/trading-symbols |
| Metals | No slash, e.g. `XAUUSD` | PRIMARY, help.e8markets.com/en/articles/9453488 |
| Indices | No slash, short index codes, e.g. `US30`, `NAS100`, `SP500` | PRIMARY, help.e8markets.com/en/articles/9453488 |
| Crypto | Generic asset names only (`BTC`, `ETH`, `SOL`) — exact paired ticker (e.g. `BTCUSD` vs `BTC/USD`) NOT PUBLISHED | SECONDARY (names only) |
| Futures | Standard CME/CBOT/NYMEX/COMEX root symbols, micro-prefixed with `M`/`M2`/`MNQ`-style conventions exactly as the exchanges define them (`ES`, `MES`, `NQ`, `MNQ`, `GC`, `MGC`, `CL`, `MCL`, `SI`, `6E`, `7E`, `M6E`, etc.) | PRIMARY, helpfutures.e8markets.com/en/articles/13001922 |

**Important caveat**: the forex table's slash-delimited display format comes from the E8X *dashboard* (a marketing/monitoring surface), not confirmed as the literal order-entry symbol string inside TradeLocker/MatchTrader/MT5 (E8 uses different platforms per product — TradeLocker/cTrader/MatchTrader for E8 Funding LLC products, MT5 for E8 Markets Ltd products, per the site's legal/disclaimer text). The in-platform ticker convention actually used for order placement is **NOT PUBLISHED** on any page accessible without a login — this is the single most consequential gap for building an automated symbol cross-map, since FMP's convention (typically no slash, e.g. `EURUSD`) will need a translation layer regardless, but the exact E8-side string it must translate to/from could not be confirmed here.

---

## Contradiction Log (consolidated)

1. **E8 One dynamic-drawdown mechanic**: primary help-center article says it trails **closed/realized balance only** ([11782996](https://help.e8markets.com/en/articles/11782996-dynamic-drawdown)); secondary aggregator (proptradingvibes.com) describes **intraday floating-equity tick-by-tick trailing**. Mutually exclusive mechanics.
   **RESOLVED 2026-08-02** (owner-supplied source, read live in browser): the all-product overview ([13106558](https://help.e8markets.com/en/articles/13106558-all-product-overviews-e8-one-vs-e8-zero-vs-e8-pro-vs-e8-signature)) states for E8 One, verbatim: *"Dynamic Drawdown — Moves only when you close a profit"*, becoming *"static once you reach the starting balance amount"*. Two independent primary sources now agree: **closed-profit trailing, locking at breakeven — never floating equity**. The secondary aggregator was wrong; discard its mechanic. Nuance the overview adds: E8 One's floor updates **at trade close** (intraday), while E8 Zero/Signature use **EOD Dynamic Drawdown** (floor updates only at end-of-day) — same basis (closed profit), different update clock. Encode the two variants separately in the governor. A one-time demo-account sanity check at build time remains cheap insurance, but this is no longer a build blocker.
   **REINFORCED 2026-08-02 (owner-supplied primary-article pass)**: independently re-fetched `11782996-dynamic-drawdown` via direct browser navigation (not the reader-proxy) and got the identical formula ("Highest Closed Balance − Drawdown amount = Loss level") and worked progression table. No new conflict; treat as settled.
2. **E8 One pricing**: primary Custom Account page states base price tops at **$2,598** for $500K; secondary source states **$1,627** for $500K. Neither source gives a full price grid by drawdown/split combination, and price is confirmed to vary by exactly those selections.
   **REFINED 2026-08-02 (owner-supplied primary-article pass)**: re-read `8880316-what-is-the-custom-account` directly (browser). **E8 One's own base-price table tops at $1,998 at $500K, not $2,598** — the $2,598 figure is actually **E8 Pro's** $500K row on the same page (the two tables sit adjacent; this reads as a table mix-up in the 2026-08-01 pass, not a live-site change). Both the old "primary" $2,598 and the secondary $1,627 were wrong for E8 One. Full base-price tables for One/Pro/Signature/Zero are now reproduced in `docs/research/e8-markets-articles.md` §28.
3. **E8 Pro Forex daily drawdown**: primary product page states a clear **2.5% daily drawdown** exists; a separate secondary source claims Pro has **"no daily drawdown limit."** Trust the primary verbatim quote.
   **REINFORCED 2026-08-02 (owner-supplied primary-article pass)**: independently re-fetched `15274219-e8-pro-forex` via direct browser navigation; same 2.5% Daily Drawdown / 8% Static Drawdown figures. Settled.
4. **E8 Classic drawdown**: primary (indexed) snippet gives fixed **4% daily / 8% max**; secondary source gives **customizable 3–7% daily / 6–14% max**. Possibly a "preset" vs. "custom" Classic variant; unresolved.
5. **Futures Challenge-phase consistency rule**: `helpfutures.e8markets.com` explicitly states a **40% best-day cap applies during the Challenge phase** for futures; `help.e8markets.com` (forex/crypto) explicitly states **no consistency rule applies during Challenge for any account type**. Both are clear, unambiguous primary statements — this is a real cross-product-line difference, not a scraping artifact.
6. **News trading eval-vs-funded scope**: an initial WebSearch synthesis claimed the 5-minute forex/crypto blackout applies to **funded accounts only** (unrestricted in evaluation); the primary article's own text states the 5-minute rule without clearly scoping it to funded-only. Treat the eval/funded split as unconfirmed.
   **RESOLVED 2026-08-02 (owner-supplied primary-article pass)**: `9185497-can-i-trade-news` (browser) confirms the WebSearch synthesis was directionally right but incomplete. Full per-product mapping: **E8 Zero, E8 Signature (Forex+Crypto), E8 Pro (Forex+Crypto) have no news-trading restriction at any stage** — Challenge or Performance. **E8 One and E8 One Crypto are the only products with a restriction, and it applies only at Performance** (Challenge is unrestricted); the restriction is the known 5-minutes-before/5-minutes-after window. Newly confirmed alongside this: violating it triggers an automatic profit clawback processed after the next payout request, plus an email notice — not an account-ending breach like the drawdown rules. Cross-verified on the products' own pages (`11775980`, `13429922`, `15274219`, `15323777`, `11755943`, `11864571`) as well as the dedicated news article.
7. **Signature Futures contract-limit table**: only found in a secondary source (proptradingvibes); the primary "Max. available Contract Sizes" article instead documents an E8 Zero-style profit-triggered contract-scaling model. These may be two genuinely different mechanics for two different products that the aggregator conflated — do not assume the mini/micro table applies to Signature without direct confirmation.
8. **E8 Classic article stability**: the article URL `help.e8markets.com/en/articles/12041696-e8-classic` returned live content when indexed by search but a **404** on direct reader-proxy fetch minutes later in the same session — possible page move/removal in progress, or transient CDN flake. Re-verify before relying on its specifics.

## NOT PUBLISHED — consolidated gap list

*(Several items below were resolved by the 2026-08-02 primary-article pass — see the "Primary-article pass" section at the top of this document for what changed. Preserved here as originally written, dated 2026-08-01, rather than silently edited.)*

- ~~Exact per-size price tables (any program) beyond the E8 One $48–$2,598 range-statement and the secondary-only Signature $110/$150/$260/$390 figures.~~ **RESOLVED 2026-08-02** — full base-price tables for E8 One, E8 Pro, E8 Signature, and E8 Zero (Starter/Max) now PRIMARY-confirmed; see top section (a)(3)–(5) and `e8-markets-articles.md` §28. (Note the corrected E8 One $500K figure is $1,998, not $2,598 — see top section (b)(2).)
- ~~E8 One Crypto's own daily/dynamic drawdown percentages (only inferred from E8 One parity).~~ **RESOLVED 2026-08-02** — see top section (a)(1).
- ~~E8 Pro Crypto's static/daily drawdown percentage (confirmed absent from its own article).~~ **RESOLVED 2026-08-02** — see top section (a)(2).
- E8 Zero's exact static-drawdown percentage. **STILL NOT PUBLISHED as of 2026-08-02** — though the guardrail *type* is now corrected from Static Drawdown to EOD Dynamic Drawdown; see top section (b)(3).
- E8 Zero Futures / Starter vs Max exact prices and payout-cap dollar amounts.
- E8 Track / E8 Track 1:1 — entire product line unconfirmed on primary site.
- Exact breach consequence for Daily Drawdown and Daily Pause overruns stated in the primary articles themselves (Daily Pause's consequence is described — same-day suspension — but Daily Drawdown's is not).
- Full commission/spread table for metals beyond gold, for indices beyond US30/NAS100/SP500, for crypto (any symbol), and for energies (any symbol) — the live E8X symbols dashboard only exposed the forex tab to an unauthenticated fetch; metals/indices/crypto/energies tabs require in-browser JS tab-clicking or login that could not be replicated here.
- Exact in-platform order-entry ticker strings (vs. the E8X dashboard's display format) for every asset class.
- Exact daily-drawdown reset clock time (inferred as likely 00:00 Server Time / UTC+3 or UTC+2 seasonally, never explicitly stated).
- Whether the 5-minute news-trading blackout differs between evaluation and funded stages for forex/crypto products.
