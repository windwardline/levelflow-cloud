# Published-effect screen against the confirm power bar (2026-09-27)

Input to Q7 and design round 2. Nothing here designs a family or registers anything. The route it serves is in the [converge](/docs/research/converge-route-to-profit-2026-09-27.md) and the [mirror control](/docs/research/ladder-mirror-control-2026-09-27.md).

**Rules kept.** Only published or widely circulated working-paper figures. No corpus, cache, minute
bank, result file or repo-measured figure was read or used to choose or size a candidate. Zero
provider bytes. Two repo files were read for context only: the 2026-09-27 converge and the
2026-09-24 design round. Where a published window overlaps the repo's measured 16–21 UTC forex span
it is disclosed, and the repo number is not used. The converge's measured pooling gain was also
left unused. Every pooling assumption below is JUDGED.

**Labels.** SOURCE means read at the cited place. JUDGED means my conversion or assumption.
ABSTRACT means only the abstract or a search-indexed excerpt was readable, and the full text was
blocked.

## The bar in Sharpe terms (JUDGED conversion)

A confirm read is one-sided at 0.02 with 80 % power: z = 2.0537 + 0.8416 = 2.895. For an
effect with annualised Sharpe S that trades d days a year, mean ÷ SD per traded day is S/√d. The
clusters needed are N = (2.895 · √d / S)², so **years = 2.895² / S² = 8.38 / S²**, whatever d is.

| Target | Annual Sharpe needed, post-cost and post-publication |
|---|---|
| 1-year read (≈ 0.18 per traded day at 250 days) | 2.90 |
| 2-year read, per market or pooled | 2.05 |
| 5-year read, pooled | 1.29 |

Pooled uses the family's summed daily money, so the published *portfolio* Sharpe is the pooled S.
Every years figure assumes the published effect is the true effect, clusters are independent and
nothing decays. Halving the effect multiplies the years by 4.

**Cost frame (JUDGED unless marked).** E8 FX round trip is ≈ 1–1.5 bps on USD majors (the brief's
figure) and ≈ 2–4 bps on crosses. Spreads widen around the 17:00 ET rollover. An ES round trip is
≈ 0.5–0.7 bps: one tick is 0.25 point, about 0.4–0.5 bps at index 5,000–6,500, plus commission. A
ZN tick is ≈ 1.4 bps. Crypto CFDs cost several bps a side.

## Summary table

"Per-mkt" is the best single roster market. "Pooled" is the family across its roster markets.
Years assume the published effect at full size.

| # | Candidate (source) | Roster markets | Clock (days/yr/mkt) | Best credible post-cost S (sample; IS/OOS) | Gross effect per trade vs cost | Per-mkt: mean/SD per day; years | Pooled: mean/SD per day; years | Decay after sample | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | FX fixing W (Krohn, Mueller & Whelan 2024, JF) | 7 USD majors (NOK, SEK not on roster) | 250; 2 legs/day | EUR: 0.70 at half spread (1999–2018); CME full cost 0.65, pre-ECB leg 0.99 (2009–18). IS | EUR ≈ 2.7–2.8 bps/leg gross vs 1–1.5 bps: cost takes ~35–55 % | 0.044–0.063; **9–17 y** | JUDGED 0.8–1.6 → **3.4–13 y** (≈ 5 y only if every major nets 0.99 and ρ ≤ 0.5) | Tokyo leg negative/flat after costs since ~2013; no post-2019 test found | FAILS per-mkt; pooled-5 only at the optimistic end |
| 2 | FX session effect (Breedon & Ranaldo 2013, JMCB) | EURUSD only (other pairs lose after costs) | 250; 2 legs | 1.3 morning, 0.9 afternoon, net of EBS spread (1997–2007). IS | ≈ 2.4–2.8 bps/day net at interdealer cost | 0.082 (morning); **5.0 y** IS, ≈ 17 y on #1's OOS extension | n/a (one market) | Krohn's 1999–2018 extension halves it | FAILS (IS reads ≈ 5 y as one market) |
| 3 | Market intraday momentum (Gao, Han, Li & Zhou 2018, JFE) | ES; NQ, YM, RTY by analogy | 250 | 1.00 net of spread (SPY 2005–2013). IS | ≈ 2.6 bps/day vs ES ≈ 0.5–0.7 | 0.063; **8.4 y** | ES/NQ/YM/RTY at ρ 0.85–0.9: ≈ 1.05 → **7–8 y** | Rosa (2022): "predictability disappears" out of sample (2014–) apart from Mar–Dec 2020 | FAILS both |
| 4 | Hedging-demand intraday momentum, 60+ futures (Baltussen, Da, Lammers & Martens 2021, JFE) | ES, NQ, YM, RTY; Treasuries; GC, CL, NG; ags; livestock; FX futures | 250 | No net table. Gross 1/N: equity 1.73, bonds 1.62, commodities 1.42, FX 0.87 (1974–2020). IS | Bonds ≈ 0.9 bps/day < one ZN tick; commodities ≈ 1.7 bps/day < CFD cost; equity ≈ 2.7 bps/day | US index ≈ 0.063–0.07 (via #3); **7–8 y** | Global 4-class gross ≈ 2.9 → 1.0 y, but not this roster and not net. Roster net ≈ equity leg → **7–8 y** | FX leg insignificant 2000–2020; equity strong through May 2020 | FAILS both on roster, post-cost |
| 5 | SPY noise-band intraday momentum (Zarattini, Aziz & Barbon 2024, SFI RP 24-97; not peer reviewed) | ES (by analogy) | 250 | 1.33 net (2007–early 2024). IS, tuned on full sample. ABSTRACT | "net of costs" per abstract | 0.084; **4.7 y** | n/a | none published | FAILS (leakage: sample spans every ES fold) |
| 6 | Pre-FOMC drift (Lucca & Moench 2015, JF) | ES, NQ | 8 | 1.14 (1994–2011). IS | 49 bps/event vs < 1 bp | 0.40 per event; **6.5 y** | ≈ same | Kurov, Wolfe & Gilbert (2021): ≈ 9 bps and insignificant in 2016–2019, "essentially disappeared" | FAILS |
| 7 | FOMC-day dollar (Mueller, Tahbaz-Salehi & Vedolin 2017, JF) | 7 USD majors | 8 | Enhanced 0.93 gross, "up to 0.8" net; dollar basket 0.51 (1994–2013). IS | 10.8–20.5 bps/event vs 1–1.5: cost 5–15 % | n/a (it is a portfolio) | 0.28–0.33 per event; **10–13 y** (32 y for the plain basket) | No post-2013 test found; its equity twin (#6) vanished | FAILS |
| 8 | FOMC-cycle even weeks (Cieslak, Morse & Vissing-Jorgensen 2019, JF) | ES | ≈ 125 | 0.92 vs 0.45 buy-and-hold (1994–2016; own OOS 2014–16) | ≈ 11–14 bps/day excess on even-week days | 0.082; **9.9 y** | ≈ same | A replication reportedly finds it gone (not read; not relied on) | FAILS |
| 9 | Overnight drift, buy-the-dip (Boyarchenko, Larsen & Whelan 2023, RFS) | ES | ≈ 125 | BtD net 1.10; OD+ net 0.26 (2004–2020). IS | BtD ≈ 4.9 bps/trade gross, 3.2 net | 0.098; **6.9 y** | ≈ same | Same authors (NY Fed, 2026-07-01): 2–3 a.m. ET window "close to zero since 2021" | FAILS (decayed) |
| 10 | European-open ES return (Bondarenko & Muravyev 2023, JFQA) | ES | 250 | Gross 1.6, "high after transaction costs" (2004–2018). ABSTRACT | net not readable | 0.10 gross; **3.3 y** gross | ≈ same | The 2–3 a.m. hour inside its window is ≈ 0 since 2021 (#9's follow-up) | FAILS (decayed) |
| 11 | Time-series momentum (Moskowitz, Ooi & Pedersen 2012; Hurst, Ooi & Pedersen 2017; Huang, Li, Wang & Zhou 2020) | most of roster | monthly decisions | Portfolio 0.77 net of cost, gross of fee (2010–2016); per market ≈ 0.4 (1880–2016) | cost minor | 0.4 → **52 y** | 0.77 → **14 y** (57 y at half) | Huang et al.: little evidence asset by asset | FAILS (as round 1) |
| 12 | FX carry (Daniel, Hodrick & Lu 2017, CFR; Fan, Paseka, Qi & Zhang 2022, JIFMIM) | 28 FX pairs | monthly | 0.78 gross (1976–2013); post-GFC 0.25 (ABSTRACT-level excerpt) | paid through swap, which carries a broker markup (JUDGED) | n/a | 0.78 → 14 y; 0.25 → **134 y** | Collapsed after 2008 | FAILS |
| 13 | Macro-announcement days (Savor & Wilson 2013, JFQA) | ES | ≈ 35 | 11.4 vs 1.1 bps/day (1958–2009). ABSTRACT | cost minor | ≈ 0.11 per event (JUDGED); **≈ 20 y** | ≈ same | not checked | FAILS |
| 14 | Month-end 4 pm fix hedging flow (Melvin & Prins 2015, JFM) | USD majors | 12 | 14 bps per 10 % equity month; R² 0.03 (2004–2012). IS | small vs cost | ≈ 0.14 per event (JUDGED); **≈ 36 y** | ≈ same | 2015 fix-window reform not checked | FAILS |
| 15 | Treasury auction cycle (Lou, Yan & Zhang 2013, RFS) | Treasuries | monthly cycle | 0.84 (to 2008), cash notes. IS | 8.6 bps/month vs ≈ 1.4 bps/tick | n/a; **12 y** | ≈ same | not checked | FAILS |
| 16 | Bitcoin intraday momentum (Shen, Urquhart & Wang 2022, Fin. Rev.) | BTC, ETH… | 365 | Gross 1.72 (2013–2020); break-even 7–10 bps/trade. IS | break-even below CFD cost (JUDGED) | ≈ 0 net | n/a | none | FAILS (cost; sample overlaps crypto fit months) |

**Result.**
- **Per-market bar within 2 years (S ≥ 2.05 net):** none.
- **Pooled bar within 2 years:** none on post-cost, post-publication evidence. Only gross figures
  clear it: the dollar basket's pre-Tokyo leg (t ≈ 12 over 20 years, S ≈ 2.7 gross) and
  Baltussen's four-class global book (≈ 2.9 gross, JUDGED). The first dies in rollover-hour costs,
  and its own full-cost JPY line is −1.12. The second is not this roster.
- **Pooled bar within 5 years (S ≥ 1.29):** none unconditionally. Three routes reach it only on
  in-sample or optimistic inputs:
  - #1 pooled over the 7 majors, if every major nets CME-EUR's 0.99 at ρ ≤ 0.5 (3.4–4.9 y, JUDGED).
    Its own GBP and JPY lines contradict that.
  - #2 as a single market: 1.3 in-sample gives 5.0 y.
  - #5: 1.33 in-sample gives 4.7 y, but #5 is barred by leakage.
- The strongest single-instrument post-cost figures (1.3–1.33) all imply ≈ 5 years, and all are
  in-sample.

---

## Candidate detail

### 1. FX fixing W: dollar up into the fixes, down after
- **Source.** Krohn, Mueller & Whelan, "Foreign Exchange Fixings and Returns around the Clock," *JF*
  79(1), 541–578 (2024).
  - Read: June 2020 working version, full text (INSEAD-hosted PDF), Table 8 and pp. 1–5, 23–25.
  - Published abstract read via RePEc. It says a "21-year period"; the working version covers
    1999–2018 and 5,009 days.
- **Instruments.** G9 against the USD. The roster holds EUR, GBP, JPY, CHF, CAD, AUD and NZD
  against the USD; NOK and SEK are absent.
- **Clock and windows (SOURCE, ET).**
  - Tokyo: long USD 17:00–20:55, short 20:55–02:00.
  - ECB: long 02:00–08:15, short 08:15–17:00.
  - London: long 02:00–11:00, short 11:00–17:00.
  - Daily, with two legs per fix.
- **Published effect (SOURCE).**
  - Dollar basket (p. 2), gross at mid:
    - pre-Tokyo +2.1 bps/day (5.3 % p.a., t ≈ 12.0); post-Tokyo −2.2 bps/day (t ≈ 9.2);
    - pre-London +1.7 bps/day (t ≈ 4.1); post-London −1.9 bps/day (t ≈ 5.5).
  - Table 8, annualised Sharpe:

    | Trade | Gross | Half spread | Full indicative spread | CME firm quotes, full cost, 2009–18 |
    |---|---|---|---|---|
    | EUR W around the ECB fix | 1.47 (13.75 % p.a.) | 0.70 (6.60 %) | −0.06 | 0.65; pre-ECB leg alone 0.99 |
    | GBP W around the London fix | 1.32 | 0.50 | −0.33 | −0.51 |
    | JPY W around the Tokyo fix | 2.33 | 0.60 | −1.12 | −1.27 |

  - Text (p. 4): EUR around the London fix, "conservative" costs, realised Sharpe 0.65.
  - Text (p. 25): the Tokyo reversal at half spread has been negative for EUR and GBP and flat for
    JPY since about 2013.
  - The pattern is present in every year of the sample. All of this is in-sample.
- **Cost vs effect (JUDGED).** EUR gross ≈ 5.5 bps/day over two legs, ≈ 2.7–2.8 bps per round trip.
  E8's 1–1.5 bps takes 35–55 %, which puts E8 near the paper's half-spread line.
- **Per market (JUDGED).** EURUSD at 0.70: 0.044 per day, 17 y. On the best leg, 0.99: 0.063,
  8.6 y. Gross 1.47 would be 3.9 y.
- **Pooled (JUDGED).** No published post-cost pooled figure exists.
  - Seven majors at 0.70 each and pairwise ρ 0.3–0.7 give S 0.81–1.11, or 7–13 y.
  - At 0.99 each they give 1.15–1.57, or 3.4–6.4 y.
  - The effect is a dollar factor. The majors share it, so pooling gains little. On crosses the
    dollar cancels.
- **E8 feasibility.**
  - Needs timed entries and exits at fixed clock times: a scheduled emission, plus a timed market
    close or marketable limit (analogues of OQ-2 and OQ-3), with no target (OQ-1).
  - The Tokyo leg straddles the 17:00 ET rollover. Drop it.
  - The ECB and London legs fall in liquid hours.
- **Leakage disclosure.** The post-London leg, 11:00–17:00 ET, is 15:00–21:00 UTC in summer and
  16:00–22:00 UTC in winter. It overlaps the repo's measured 16–21 UTC forex span. The repo figure
  was not used. The source sample (1999–2018/19) overlaps every forex fold in those years.
- **Verdict.** FAILS per market. Pooled within 5 years only at the optimistic end.

### 2. FX session effect: currencies weaken in their own hours
- **Source.** Breedon & Ranaldo, "Intraday Patterns in FX Returns and Order Flow," *JMCB* 45(5),
  953–965 (2013). Read: SNB Working Paper 2011-04 (Nov 2010), Tables 1–2, §2.2–2.3.
- **Sample.** EBS firm quotes, Jan 1997 to Jun 2007. Pairs: EUR/USD, USD/JPY, GBP/USD, EUR/JPY,
  USD/CHF, AUD/USD.
- **Effect (SOURCE, EUR/USD).**
  - At mid, annualised: the EUR session (European open to US open, ≈ 02:00–08:00 ET) returns
    −8.4 %, ≈ −3.4 bps/day (JUDGED ÷ 250). The USD session (08:00–16:00 ET) returns +10.0 %,
    ≈ +4.0 bps/day.
  - Net of EBS bid–ask: +6 % p.a. short EUR in the morning (Sharpe 1.3) and +7 % long in the
    afternoon (Sharpe 0.9).
  - Every other pair is negative after costs, from −0.02 to −0.51.
  - The session gap is significant in every year except 2004. In-sample.
- **Decay.** #1's 1999–2018 EUR trade covers nearly the same windows and nets 0.6–1.0.
- **Per market (JUDGED).** Morning leg at 1.3: 0.082 per day, 5.0 y. Both legs at ≈ 1.44: 4.1 y. At
  the OOS ≈ 0.7: 17 y.
- **Leakage disclosure.** The USD session, 12:00–20:00 UTC in summer and 13:00–21:00 in winter,
  overlaps the 16–21 UTC span.
- **Verdict.** FAILS. It is the in-sample origin of #1.

### 3. Market intraday momentum
- **Source.** Gao, Han, Li & Zhou, "Market Intraday Momentum," *JFE* 129(2), 394–414 (2018). Read:
  June 2017 SSRN version, Tables 6, 10–12, §6.
- **Effect (SOURCE, SPY 1993–2013).** The first half-hour's sign times the 15:30–16:00 return:
  6.67 % p.a., SD 6.19 %, Sharpe 1.08, success 54.4 %.
  - Net of the 15:30 spread: 0.73 (2001–13) and 1.00 (2005–13, 6.52 % p.a.).
  - Other ETFs, gross, inception to 2013: QQQ 7.75/7.89 (≈ 0.98), IWM 11.72/7.70 (≈ 1.52),
    DIA 3.46/5.69 (≈ 0.61).
- **Out of sample (SOURCE).**
  - Rosa, "Understanding Intraday Momentum Strategies," *J. Futures Markets* (2022), abstract read
    via vLex: "The predictability disappears in the out-of-sample period." Its high-predictability
    regime appears only in Mar–Dec 2020.
  - Li, Sakkas & Urquhart, *J. Financial Markets* 57 (2022), 2005–2017: US cash index 6.57 %/5.89 %,
    Sharpe 1.115 gross, mostly overlapping Gao.
- **Cost (JUDGED).** ≈ 2.6 bps/day against an ES round trip of ≈ 0.5–0.7 bps.
- **Per market (JUDGED).** ES at 1.00: 0.063 per day, 8.4 y. After 2013, about zero.
- **Pooled (JUDGED).** The four US indices at ρ 0.85–0.9 give ≈ 1.05, or 7–8 y.
- **Verdict.** FAILS both.

### 4. Hedging-demand intraday momentum across futures
- **Source.** Baltussen, Da, Lammers & Martens, "Hedging Demand and Market Intraday Momentum," *JFE*
  142(1), 377–403 (2021). Read: published PDF, Tables 5, 6, B1–B4, p. 386.
- **Effect (SOURCE).** Table 6, the rest-of-day signal held over the last 30 minutes, 1974 to
  May 2020, 1/N within each class, gross:

  | Class | Mean p.a. | SD p.a. | Sharpe |
  |---|---|---|---|
  | Equity | 6.86 % | 3.96 % | 1.73 |
  | Bonds | 2.16 % | 1.33 % | 1.62 |
  | Commodities | 4.34 % | 3.05 % | 1.42 |
  | Currencies | 0.85 % | 0.98 % | 0.87 |

  - No cost table. The text says ES shows a positive net Sharpe at one tick.
  - 2000–2020 slopes (Table 5): equity 3.98 (t 6.65), bonds 1.53 (t 3.61), commodities 1.04
    (t 2.86), currencies 0.33 (t 1.45, not significant).
  - Per market (Table B): ES 6.18, NQ 6.36, RTY 6.00, YM 5.02, EC −0.04, JY 0.39, GC 1.09, CL 0.67
    (not significant), LC and LH ≈ 0.
- **Cost (JUDGED).** Bond gross ≈ 0.9 bps/day, below one ZN tick (≈ 1.4 bps). Commodity gross
  ≈ 1.7 bps/day, below CFD cost. After costs only the equity leg survives.
- **Per market and pooled (JUDGED).** On this roster the family reduces to the four US indices: ≈ 1.0
  net, 7–8 y. The global four-class book, at ≈ 2.9 gross if the classes are independent, would read
  in about a year, but it is neither this roster nor net.
- **Leakage flag.** The sample ends in May 2020. Any ES or NQ fold month before then lies inside the
  paper's estimation sample, the ground on which round 1 refused crypto TSMOM. Check the fold dates.
  The FX futures' last half-hour (13:30–14:00 CT) sits inside 16–21 UTC. It is disclosed, and that
  leg has decayed in any case.
- **Verdict.** FAILS both on the roster, post-cost.

### 5. SPY noise-band intraday momentum
- **Source.** Zarattini, Aziz & Barbon, "Beat the Market: An Effective Intraday Momentum Strategy
  for S&P500 ETF (SPY)," Swiss Finance Institute Research Paper 24-97 (2024). Working paper, not
  peer reviewed. Read: the SFI abstract page only; the SSRN PDF was blocked.
- **Effect (ABSTRACT).** 2007 to early 2024: 1,985 % total return net of costs, 19.6 % p.a.,
  Sharpe 1.33. In-sample.
- **Per market (JUDGED).** 0.084 per day, 4.7 y; 19 y at half the effect.
- **Leakage.** Its rules were chosen on 2007–2024, which spans every ES fold. A screen on those folds
  cannot refuse it.
- **Feasibility.** Stop-and-reverse market orders through the session conflict with a limit-only desk.
- **Verdict.** FAILS on leakage. Keep only as context for #3 and #4.

### 6. Pre-FOMC announcement drift
- **Source.** Lucca & Moench, *JF* 70(1), 329–371 (2015). Read: 2013 NBER-conference version.
- **Effect (SOURCE).** The SPX rises 49 bps in the 24 h (2 pm to 2 pm ET) before scheduled FOMC
  announcements, Sep 1994 to Mar 2011. The FOMC-only strategy's annualised Sharpe is 1.14.
- **Decay (SOURCE).** Kurov, Wolfe & Gilbert, *FRL* 40 (2021), read in full: ≈ 44.5 bps in
  Apr 2011–Dec 2015; ≈ 9.2 bps and insignificant in Jan 2016–Dec 2019; "essentially disappeared
  after 2015."
- **Per market (JUDGED).** 0.40 per event and 52 events at the published size, 6.5 y. At the post-2015
  size, ≈ 0.075 per event, about 180 y.
- **Verdict.** FAILS.

### 7. FOMC-day dollar short
- **Source.** Mueller, Tahbaz-Salehi & Vedolin, *JF* 72(3), 1213–1252 (2017). Read: published PDF,
  Table II, pp. 1215–1216 and 1242. It was round 1's second-ranked design.
- **Effect (SOURCE).** 1994–2013, 160 announcement days, 4 pm to 4 pm ET:
  - Short USD against the nine-currency basket: 10.77 bps per event, Sharpe 0.51, annualised on
    8/252.
  - High-rate portfolio: 14.47 bps, Sharpe 0.56.
  - Enhanced version (reverse after tightenings; only positive-differential currencies): 20.54 bps
    (t 4.17), Sharpe 0.93.
  - Net of bid–ask: "Sharpe ratios of up to 0.8."
  - No post-2013 test was found.
- **Pooled (JUDGED).** The strategy is already a portfolio: 0.28–0.33 per event, 10–13 y; the plain
  basket takes 32 y. Cost is 5–15 % of the effect and does not bind.
- **Leakage disclosure.** The 14:00 ET announcement (18:00 or 19:00 UTC) and the window after it lie
  inside 16–21 UTC. The 4 pm-to-4 pm hold spans the rollover.
- **Verdict.** FAILS.

### 8. FOMC-cycle even weeks
- **Source.** Cieslak, Morse & Vissing-Jorgensen, *JF* 74(5), 2201–2248 (2019). Read: Feb 2018 draft.
- **Effect (SOURCE).** 1994–2016: days in even weeks of the FOMC cycle earn 10.9–14.1 bps more than
  odd-week days. Holding stocks in even weeks only has Sharpe 0.92, against 0.45 for buy-and-hold.
  The effect held in the authors' own 2014–16 extension.
- A replication (Uppal, working paper) reportedly finds the effect gone. It could not be fetched and
  is not relied on.
- **Per market (JUDGED).** 9.9 y.
- **Verdict.** FAILS.

### 9. Overnight drift, buy-the-dip
- **Source.** Boyarchenko, Larsen & Whelan, "The Overnight Drift," *RFS* 36(9), 3502–3547 (2023).
  Read: NY Fed Staff Report 917 (rev. Aug 2022), Table IX.
- **Effect (SOURCE).** ES 2004–2020:

  | Strategy | Gross Sharpe | Net Sharpe |
  |---|---|---|
  | 2–3 a.m. ET | 1.10 | −0.54 |
  | 1:30–3:30 | 1.30 | 0.26 |
  | 1:30–3:30, only after a negative closing imbalance (≈ half of days) | 1.78 | 1.10 (4.04 % p.a.) |

- **Decay (SOURCE).** Liberty Street Economics, "The Disappearing Overnight Drift," 2026-07-01, by the
  same authors: over 1,245 days in 2021–2025 the 2–3 a.m. window "has averaged close to zero since
  2021."
- **Feasibility.** The desk has no closing order-imbalance data.
- **Verdict.** FAILS.

### 10. European-open ES return
- **Source.** Bondarenko & Muravyev, "Market Return Around the Clock: A Puzzle," *JFQA* 58(3),
  939–967 (2023). ABSTRACT only; SSRN and Cambridge returned 403.
- **Effect.** ES 2004–2018: 4 hours around the European open earn the whole average return, at
  Sharpe 1.6, "remaining high after transaction costs." The net figure was not read.
- **Decay.** The 2–3 a.m. ET hour inside this window has been ≈ 0 since 2021 (#9's follow-up).
- **Verdict.** FAILS.

### 11. Time-series momentum
- **Sources.** Read in full:
  - Moskowitz, Ooi & Pedersen, *JFE* (2012), 1985–2009: all 58 contracts positive. The diversified
    alpha is 1.26 %/month at 9.3 % ex-ante vol; JUDGED gross Sharpe ≈ 1.5.
  - Hurst, Ooi & Pedersen, *JPM* 44(1) (2017), Exhibit 1: 1880–2016, 11.0 % net of cost gross of
    fee on 9.7 % vol, and Sharpe 0.76 net of 2/20. In 2010–2016, 6.2 % on 8.1 % vol (JUDGED
    ≈ 0.77), and 0.41 net of fees. The average single-market Sharpe is ≈ 0.4.
  - Huang, Li, Wang & Zhou, *JFE* 135(3) (2020), abstract via search: little evidence asset by
    asset, in or out of sample.
- **Per market (JUDGED).** 52 y.
- **Pooled (JUDGED).** 14 y at 0.77, 50 y net of fees.
- **Verdict.** FAILS, as round 1 found.

### 12. FX carry
- **Sources.**
  - Daniel, Hodrick & Lu, *CFR* 6 (2017), read: G10 carry Sharpe 0.78, 1976–2013, gross, monthly.
  - Fan, Paseka, Qi & Zhang, *JIFMIM* 76 (2022), abstract read: the decline after the GFC comes from
    lost downside-risk compensation. The figures of 1.08 before the GFC and 0.25 after come from
    search-indexed text of the ScienceDirect page; the full text was blocked.
- **Pooled (JUDGED).** 14 y at 0.78, 134 y at 0.25.
- **Feasibility.** Carry arrives through E8 swaps, which carry a markup (JUDGED).
- **Verdict.** FAILS.

### 13–16, briefly
- **13. Savor & Wilson, *JFQA* 2013 (ABSTRACT).** Announcement days earned 11.4 bps against 1.1 bps
  (1958–2009), with a Sharpe ten times higher. JUDGED ≈ 0.11 per event, ≈ 690 events, ≈ 20 y.
  FAILS.
- **14. Melvin & Prins, *JFM* 22 (2015).** Read: 2013 ECB-workshop version. A 10 % equity month
  moves the currency 14 bps in the hour before the month-end fix, with R² 0.03 (2004–2012). JUDGED
  ≈ 0.14 per event, ≈ 36 y. FAILS.
- **15. Lou, Yan & Zhang, *RFS* 26(8) (2013).** Read in full. The auction-cycle long–short in cash
  notes earns 8.62 bps/month (t 3.65), Sharpe 0.84. JUDGED 12 y. FAILS.
- **16. Shen, Urquhart & Wang, *Financial Review* 57(2) (2022).** Read: accepted version. Bitcoin
  first and second-last half-hour momentum: gross Sharpe 1.72 (2013–2020), break-even 3–10 bps per
  trade. Nets ≈ 0 at CFD cost. The sample overlaps the crypto fit months, round 1's refusal ground.
  FAILS.

## Three leads for design round 2

1. **FX fix and session reversal on the USD majors (#1 with #2).**
   - **Strengths.** Two decades of evidence (1997–2018) and a daily clock. The mechanism is dealer
     inventory against benchmark-fix dollar demand, which lasts as long as the fixes do. EUR's best
     post-cost figure is 0.65–0.99 on CME firm quotes, 2009–2018.
   - **Caveats.**
     - Cost-dominated: E8 costs take ≈ 35–55 % of the gross.
     - GBP is weak and JPY is negative after costs. The Tokyo leg is dead: rollover spreads, and
       decay since ≈ 2013.
     - No published test after 2018/19. The 2015 WM/R window reform was not checked.
     - Per market: 9–17 y. Pooled: ≈ 5 y only if every major matches EUR's best leg, otherwise
       7–13 y.
     - Needs timed legs (OQ-1 to OQ-3 analogues).
     - The post-London leg overlaps the repo's 16–21 UTC span. Fit and select are not
       out-of-sample for that clock, so a registration should fix the windows from the paper
       alone.
2. **US index futures momentum into the close (#3 with #4, round 1's `imom`).**
   - **Strengths.** The cleanest cost margin: gross ≈ 4× an ES round trip. Baltussen's 2000–2020
     equity slope is still strong.
   - **Caveats.**
     - Rosa (2022) finds the first-half-hour version gone out of sample after 2013, except in 2020.
     - Per market ≈ 8 y at the published net. Pooling the four US indices adds almost nothing.
     - Baltussen's sample runs to May 2020, so check the fold dates for leakage.
3. **FOMC-day dollar short (#7).**
   - **Strengths.** Cost does not bind (≈ 11–21 bps per event), the strategy is pooled by
     construction, and no post-publication decay has been published.
   - **Caveats.**
     - At 8 events a year, even the enhanced 0.93 needs ≈ 10–13 y.
     - Its equity twin, the pre-FOMC drift, vanished after 2015.
     - The announcement window overlaps 16–21 UTC.
     - It holds through the rollover.
   - It is third only because every alternative is dead or slower.

**For Q7.** Ruled per market, no published effect on this roster confirms within a decade. Ruled
pooled, none confirms within two years on post-cost, post-publication evidence. Within five years
only #1 does, and only at the optimistic end of its own figures. The published literature supports
effects of roughly S ≈ 0.6–1.0 after costs. The bar needs 2.05 for a two-year read and 1.29 for
five.

## Read status

| Source | Read |
|---|---|
| Krohn et al.; Breedon & Ranaldo; Gao et al.; Baltussen et al.; Li, Sakkas & Urquhart; Lucca & Moench; Kurov et al.; Mueller et al.; Cieslak et al.; Boyarchenko et al. (SR 917, and the 2026 Liberty Street Economics post); Moskowitz et al.; Hurst et al.; Daniel et al.; Melvin & Prins; Lou et al.; Shen et al. | Full text (the versions named above) |
| Rosa (2022) | vLex abstract |
| Zarattini et al. | SFI abstract |
| Krohn JF 2024 | RePEc abstract |
| Fan et al. | RePEc abstract; the 1.08/0.25 figures are search-indexed only |
| Bondarenko & Muravyev; Savor & Wilson; Huang et al. | Abstracts via search results; full text blocked (403) |
| Uppal (FOMC-cycle replication) | Not read; not relied on |
| arXiv 2605.04004 (Mesfin, MNQ intraday-momentum falsification, 2021–2025, not peer reviewed) | Abstract only. It finds no OHLCV momentum signal clears costs. Not relied on |

The source PDFs and their extracted text are kept outside the repository, in `session-artifacts-2026-09-27/source-screen/pdf/`; they are the publishers' copyright and are not committed.
