> **Status: designed, refuted, judged — NOT registered, NOT hashed, NOT screened.** One candidate
> survives, and it is a long shot. No family from this round can reopen the desk within a year.
> The candidate is not screened because amendment 46 requires a family to be "registered and hashed
> before any fold is read". A registration hashes its exit geometry
> ([amendment 48's draft](/docs/research/designs/amendment-48-draft-2026-09-24.md), rule 3), and this
> candidate's geometry needs three owner answers first (OQ-1 to OQ-3 below). Screening it before those
> answers would spend the only candidate the round produced.

# The first entry-family design round (2026-09-24)

**What was asked.** HANDOFF sequence item 2: an entry family with direction the shipped entry lacks,
with its exit geometry named, for the random-entry screen on the fit fold at zero bytes.

**How it ran.** Five designers each built one family from a different published source. Two
independent refuters then attacked each design, one on law, leakage and feasibility and one on power
and economics, and a judge ranked the results. The designers were barred from basing any choice on a
direction or profit figure measured in this repository, including the shipped entry's per-market
screen and the JPY-cross lean, and from running anything against a corpus, the cache, the minute bank
or FMP. They read code for feasibility only. Nothing was screened. The journal is outside the
repository, in
`~/Library/Application Support/WindwardLineToolchain/levelflow/session-artifacts-2026-09-24/`
(`entry-family-design-journal.jsonl`, sha256 prefix 478097b66bb45a6f, with the extracted result and
the judge's recompute script).

## The five designs

| Rank | Family | Source | Verdict |
|---:|---|---|---|
| 1 | **US index-futures momentum into the close**: the day's move from the prior close, taken at 15:30 ET, held to 16:00 ET | Baltussen, Da, Lammers & Martens (2021), JFE 142(1) | Survives with fixes; long shot |
| 2 | FOMC-day dollar short, 16:00 to 16:00 ET | Mueller, Tahbaz-Salehi & Vedolin (2017), JF 72(3) | Survives the law lens. At 8 events a year its first read falls about June 2030, with power 0.08–0.27 |
| 3 | One-month time-series momentum, decided weekly, held 96 h | Moskowitz, Ooi & Pedersen (2012) | Can pass, but 80 % power takes about 70 to 1,600 years |
| — | NYSE turn-of-month and pre-holiday long | Lakonishok & Smidt (1988) | **Refused.** Its designer counted the family's decision days on the fit and confirm calendars and chose the cluster rule from them before registering. Three of its four markets are held out |
| — | Weekly crypto time-series momentum | Liu & Tsyvinski (2021), RFS 34(6) | **Refused.** The contained fit months of BTC, ETH and LTC lie inside the paper's own estimation sample, so the screen cannot refuse the family. Its one out-of-sample coin, ALGOUSD, is engine-declined |

Every power refuter found the same thing. At the effect sizes the sources support after publication,
a per-market confirm read needs hundreds of traded clusters. That takes years on any clock that
decides at most once a day.

## The candidate: `imom-close-hedging-v1` (draft; not hashed)

- **Hypothesis.** Short-gamma and leveraged-ETF hedging pushes US index futures in the direction of
  the day's move during the last half hour before the cash close. The effect does not persist past
  16:00 ET.
- **Roster.** ESUSD and NQUSD, one market per underlying. NSDQ, RTYUSD and YMUSD are held out by the
  pin (`docs/research/r4/holdout-2026-08-26.json`). DOW has no intraday bars in its fit fold. SP is
  the costlier S&P member.
- **Side and clock.** At 15:30 ET, the close of the 15:15 ET 15-minute bar, r = the move from the
  prior session's 15:45 ET bar (12:45 ET after an early close). The family trades only when the
  paper's Table B1 beta (ES 0.0618, NQ 0.0636) × price × |r| is at least the modelled round trip
  from `estimateExecutionQuality`. It takes the side of r.
- **Eligibility.** An NYSE full session outside a CME quarterly-roll window (F3 − 10 to F3 + 3
  calendar days), with the decision bar and the six 5-minute bars to 16:00 ET present. Both calendars
  are tracked static tables, and the NYSE one carries each closure's announcement date.
- **W.** 0.75 h from the decision bar's open, which is the window (15:30, 16:00] ET. Reference: the
  decision bar's close. Unit: the primary 15-minute ATR(14).
- **Exit geometry.**
  - Entry: a marketable limit at the reference ± 0.25 ATR, paying the modelled slippage.
  - Stop: a catastrophe stop-market at 3 ATR.
  - Exit: no target, no TP1, and a timed market close at 16:00 ET.
  - The R unit is about 3.25 ATR.
  - The payoff floors (`minRewardRisk`, `minimumTargetRewardRisk`, `window_cannot_carry_payoff`) are
    not applied, which is OQ-1. `maxCostShare` 0.15 applies, at about 0.04.
- **Screen.** The futures fit fold of the 2026-09-14 corpus. Null: same symbol, side and New York wall
  clock on eligible random fit days, K = 20. Clusters follow the B ladder over the side label. The
  floor is the mean c ÷ ATR.
- **Freeze.** One cell. The candidate opens only if the fit screen passed, the select fold replays to
  a positive mean net R per cluster over at least 30 clusters, and the confirm span meets the floor.
- **Readiness floor.** 560 traded confirm clusters per market, ESUSD's 80 %-power size at the full
  published effect.

**Power**, from external and cost-model inputs only, orders of magnitude. The three figures in each
cell assume the full, three-quarters and half published effect.

| | NQUSD | ESUSD |
|---|---|---|
| fit floor | 0.083 ATR | 0.130 ATR |
| admitted fit clusters | about 230 | about 190 |
| P(pass the screen) | 0.33 / 0.15 / 0.055 | 0.22 / 0.09 / 0.03 |
| trades a month | about 13.4 | about 11.4 |
| power at 560 clusters | 0.86 / 0.49 / 0.13 | 0.79 / 0.35 / 0.05 |
| months to the 560 floor | about 42 | about 49 |
| net realized R a year, if real | +9.5 / +6.1 / +2.7 | +7.4 / +4.3 / +1.2 |

At 0.3 of the effect, net R is about zero on NQUSD and negative on ESUSD. The judge's weighted chance
that either market confirms at its first read, around 2031, is about 7 %. The power refuter adds two
cautions. First, the paper's beta is a variance-weighted in-sample fit, so the effect on an average
admitted day is smaller than its headline. Second, the two markets are closer to one test than two.

**What it needs before it can be registered.** Amendment 48 as law, or Q6 answered yes, and:

- **Engine:**
  - a plan with no target resolved by stop or review end only (`replay.ts` returns `pending` for
    any non-finite take-profit today);
  - modelled slippage on a marketable entry print;
  - an absolute 16:00 ET expiry (today expiry is createdAt plus review hours);
  - a new `ANALYZER_VERSION`, placed in `PLACED_ENGINE_VERSIONS`.
- **Screen:**
  - a null keyed to the New York wall clock (it keys the UTC clock today);
  - calendar eligibility applied to the null pool;
  - the six-bar coverage rule on candidate and null alike;
  - a seeded RNG;
  - B-ladder clusters;
  - a per-decision cost from `estimateExecutionQuality` (the screen reads cost from corpus rows today);
  - refusing a UTC-clock null where the registration names another.
- **Calendars:** the NYSE closure and early-close table for 2023–2032, with announcement dates, and CME
  roll dates, each tested against committed fixtures, never the cache.
- **Desk:**
  - a scheduled 15:30 ET emission (the analyzer runs only on request);
  - Tradovate accepting a marketable limit on ES and NQ;
  - reconciling the Guide's "never market or stop entries" with this family;
  - sizing that treats the ES and NQ pair as one `us_equity_indices` exposure.

## For the owner

- **OQ-1.** Under amendment 39, may a registered conditional-drift family trade a timed 16:00 ET exit
  with a catastrophe stop and no target, outside the payoff floors? The stop and the window come from
  the effect's own horizon, and no ratio is printed. If not, do not register it: every bracket that
  meets the floors cuts its Sharpe 1.6 to 5 times.
- **OQ-2.** May the desk instruct a marketable limit that crosses the book? The Guide promises limit
  orders only.
- **OQ-3.** May the desk instruct a timed close at 16:00 ET?

*Recommendation:* register it only if alpha is charged at the freeze (Q3). It is a long shot, and an
unread registration should not draw. The judge also made a point that bears on every family:
amendment 39 already names a faster route to money. That route closes the gap between the 1.6:1 gate
and the roughly 1:1 the ladder ships. No entry family here reaches money sooner.
