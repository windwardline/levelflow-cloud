# The route to a profitable open desk: CONVERGE, 2026-09-27

**The question.** What is the fastest honest route from here to a desk that is open and earns net
realized R (amendment 39)?

**The answer.** No route opens a profitable desk within about a year on current evidence. The binding
constraint is evidence, not law. On the years whose feed is trusted, no market in any class clears zero
at lo95 on both tuning folds, so there is nothing to confirm. The only route whose expected sign is not negative
is new entry information, and at the per-market grain amendments 45 and 46 set, a realistic effect
takes years to confirm. One owner question changes that by an order of magnitude (Q7 below). It should
be ruled before the next design round, because it sets the effect size that round has to find.

## How it ran

Four finders, each with one lens: the forex crosses, the payoff gap, law and the critical path, and a
contrarian lens for routes the handoff does not name. Each finder had a refuter with its own lens, and
a completeness critic read all eight. Zero provider bytes. Fit and select only, from the current-engine
corpus `capture-all-classfolds-2026-09-24.jsonl`. Every reader either streams through the repo door, which
withholds confirm rows, or skips any line whose raw bytes carry no fit or select split before parsing
it; none reads a confirm row's R. The readers and their outputs are
in [`r3/converge-2026-09-27/`](/docs/research/r3/converge-2026-09-27/). The workflow journal is outside
the repository, in `session-artifacts-2026-09-27/converge-journal.jsonl` (sha256 prefix
49cc57bdbf8d03ca).

Verified by hand before anything below was ranked:
- The contained-select figures for each cross, from the repo's own sealed reader:
  `banked-fraction --grain market --years contained --folds select` gives the 11 in-pool crosses
  −398.4 R at ½, ten of them losing and GBPJPY alone at +3.1 R
  ([output](/docs/research/r3/converge-2026-09-27/verify_bf-select-contained-market.txt)). That
  matches the finder and the refuter to the tenth.
- The pooling gain across the 15 crosses, computed from the refuter's per-day sums: 10.1–10.3× on fit
  and 6.5–7.4× on select, all years ([gain](/docs/research/r3/converge-2026-09-27/verify_pooling-gain.out.txt)). The refuter's split gives 10.3–11.0 on contained folds and 6.6–8.4
  on escaping select ([a3](/docs/research/r3/converge-2026-09-27/refute-forex-crosses_a3.out.txt)). The two
  measures differ by construction (the sum of SDs squared over the pooled variance, against the market
  count over the variance ratio) and agree when the markets' SDs are equal, as the crosses' nearly are.
- The feed-character witness quoted below, read at its source.

## What the measurements say

"Contained" means the manifest's year map, which flags the years whose 5-minute feed escapes its
baseline: 2021 on all 28 forex pairs, 2022–23 on 27, 2024 on 15. The select fold ends 2022-05-29, so
select's escaping span is 2021-01 to 2022-05.

**1. The 15 forex crosses are not a route.** They clear zero at lo95 on select only because of
escaping-year money: +2,926.9 R net and +2,014.6 R bound in 2021-01 to 2022-05. On contained select
the 15 lose −560.5 R net and −1,287.9 R bound. Contained select loses on the bound arm on 28 of 28
forex pairs, and no pair is net-positive on both contained tuning folds under both arms
([summary](/docs/research/r3/converge-2026-09-27/forex-crosses_summary.out.txt),
[analyze](/docs/research/r3/converge-2026-09-27/forex-crosses_analyze.out.txt)).

The escaping money is a data defect, not a market. In those years the range built from 5-minute bars
exceeds the daily store's own range for the same day: AUDNZD by 35–120 %, NZDCHF and AUDCHF by 15–20 %
(`feed-character-witness-2026-09-06.md` §1). In the fit fold, which is all contained for in-pool forex,
the months the manifest flags as escaping earn +0.085 R per fill against −0.003 unflagged, and in the
same calendar months flagged pairs earn +0.29 R per cluster more than unflagged pairs
([an4](/docs/research/r3/converge-2026-09-27/refute-contrarian_an4.out.txt),
[a2](/docs/research/r3/converge-2026-09-27/refute-forex-crosses_a2.out.txt)).

Even granting the escaping years, the earliest 80 %-powered forex confirm is AUDNZD's, around 2027-10
on its raw select mean, and later once that mean is shrunk for being the best of 28. The next is in 2031
([a4](/docs/research/r3/converge-2026-09-27/refute-forex-crosses_a4.out.txt)).

**2. The payoff gap is not a route on its own.** The design round's judge rated it the fastest route
with no measurement behind it, and that rating is withdrawn. On identical forex decisions in contained
years, swapping the runner protection between trail_tp1, hold and breakeven moves bound-arm expectancy
by at most 0.008 R per fill
([geometry](/docs/research/r3/converge-2026-09-27/refute-payoff-gap_geometry-variants.out.txt)). Of
214,385 fit forex rows, the stop is a pivot on 177,547 (82.8 %) and the runner a structural level on
205,633 (95.9 %) (the payoff finder's count, in the journal). TP1 is the one leg set by formula
(`pricePlan.ts:675-686`), and placing it at structure is a claim that pivots carry direction. That makes it an entry
family to screen, not a geometry program. The lowest cost-share band loses on the bound arm on both
contained folds: fit −0.0053 and select −0.0211 R per fill
([cost band](/docs/research/r3/converge-2026-09-27/refute-payoff-gap_cost-band-refute.out.txt)). The
payoff geometry belongs among the terms a family registers.

Amendment 39's closing clause has not fired. Runner placement, one of the axes it names, is not
measured on any trusted corpus.

**3. Costs and venue do not make it earn.** Removing every modelled spread and slippage lifts contained
select forex from −1,336.0 R to +322.7 R, which is +0.0065 R per fill. Removing E8's commission instead
still leaves the bound arm at −516.6 R
([cost split](/docs/research/r3/converge-2026-09-27/contrarian_class-costsplit.txt)). Neither swap nor
commission-in-sizing (owner items 1 and 5) moves the earliest date. The verdict does rest on the
modelled spread, which is JUDGED: with modelled spread and slippage off, 7 markets clear lo95 on both
contained folds (EURAUD, EURCAD, EURGBP, GBPCHF, GBPJPY, GBPNZD and SIUSD), the six crosses at +0.026
to +0.032 R per fill on contained select
([an3](/docs/research/r3/converge-2026-09-27/refute-contrarian_an3.out.txt)). That is before the
one-bar arming and the vintage, each worth about 0.01–0.025 R, so measured E8 spreads would be
instrument truth rather than a route.

**4. Nothing outside forex earns either.** Of the 65 markets with contained fills on both tuning folds,
none clears lo95 on both under the net arm, the bound arm or f = 0
([an3](/docs/research/r3/converge-2026-09-27/refute-contrarian_an3.out.txt)); GBPJPY, LEUSX and SIUSD
are positive on both at the point estimate under net. Every class loses on contained
select at ½; pooled, −6,907.3 R
([class](/docs/research/r3/banked-fraction-capture-all-classfolds-2026-09-24-contained.txt)).
Banking nothing at TP1 shrinks contained select forex from −1,336.0 R to −606.1 R and stays a loss.

**5. Reopening on the shipped engine is lawful and fails amendment 39.** No amendment states a reopen
criterion; the park is an owner instruction (2026-08-07). "Reopens when a family confirms" is a framing
derived from amendments 39, 46 and 48. It changes nothing today, because the shipped engine loses on
every trusted-year read.

**6. An entry family is the only route left.** The held family, `imom-close-hedging-v1` (ES and NQ,
with no escaping years in the manifest), reads first around 2030–31, with about a 7 % judged chance of
confirming (the design-round record). Its timed exit has no TP1 lock, so it cannot draw the same-bar
credit that separates the net and bound arms by 0.0199–0.0245 R per fill in all eight forex cells
([arming-bound cells](/docs/research/r3/arming-bound-cells-2026-09-24.txt)).

**7. The one positive at class grain fails on the arm the law requires.** The converge's finders
missed it, and the orchestrator measured it. Forex decisions at 16–21 UTC, in-pool and in contained
years, earn on the net arm on both folds: fit +1,305.2 R, select +339.2 R (lo95 +0.0195 R per fill,
[arming-bound cells](/docs/research/r3/arming-bound-cells-2026-09-24.txt)). Per market this span
accepts 0 of 91 (amendment 45). Pooled into one per-day money test, the numbers are these
([power](/docs/research/r3/converge-2026-09-27/verify_span-power.out.txt), from a reader that
reproduces that table to the fill):
- **Net arm:** select's effect needs about 366 day-clusters for 80 % power, about 1.7 years.
- **Bound arm:** 5,446, about 26 years. Amendment 48's draft grades both arms.
- **Held-out markets**, the nearest thing to out-of-sample: they do not replicate it on select. Net is
  +0.019 R per day (lo95 −0.072) and the bound arm is negative.

The span was found by reading both tuning folds, so neither fold is out-of-sample for it. It becomes a
route only if live execution earns the net arm's same-bar lock, and nothing measures that today.
Amendment 42 has the operator move the stop by hand. What would settle it is the owner's own E8
execution: lock latency, spreads, and whether stops slip.

## The power bar, and the owner question that moves it

A per-market confirm at amendment 48's c = 1 draw (one-sided 0.02) with 80 % power needs mean ÷ SD per
day cluster of at least 2.895 ÷ √N. Forex trades about 0.79 day clusters per weekday, so a one-year read
holds about 206 clusters and needs mean ÷ SD of at least 0.20. At the measured cluster SD of about
1.2–1.3 R, that is about +0.25 R per market per trading day on both arms. The best contained forex cell
today is GBPNZD's fit, at +0.13 R per day cluster net and +0.03 bound, both in-sample. No published daily-frequency
effect the design round found comes close.

Pooling a family's markets into one money test divides the requirement by the square root of the
pooling gain. Across the 15 crosses that gain measures about 6.5 to 11. So a one-year pooled read needs
mean ÷ SD of about 0.06 to 0.08 per market-day, about +0.08 to +0.10 R at the same SD. That is still demanding, but it is within an order of
magnitude of effects that exist.

**Q7 (new): at which grain does a family confirm?** Amendment 46 takes a family's verdict per market,
because amendment 45 admits no exception.
- Ruled per market: the honest date for any realistic family is years, and the next design round should
  say so before it spends effort.
- Ruled pooled: the family confirms on its markets' summed money in one test, drawing one alpha rather
  than one per market. Each market still ships only on its own positive point estimate across fit,
  select and confirm.
- Price of pooled: a confirmed family can carry markets whose true expectation is negative. The
  per-market point floor limits that and does not prevent it. It also departs from 45 and 46 in words,
  though not from 39: pooled money is money, not a count.
- It does not rescue the shipped ladder, whose sign is negative at every grain. It brings one existing
  candidate, the in-span forex cell (§7), to about 1.7 years, and only on the net arm.
- *Recommendation:* rule Q7 before design round 2, pooled with the per-market point floor, if the goal
  is a desk open inside about two years. Kept per market, the goal is a decade.

## What else the converge settled

- **Rule Q1–Q6 as one batch.** No header is hashed until all six are ruled, and each day of waiting
  costs a day of confirm calendar on every market for good; 32 days have gone since the frontier. Only
  Q2 (per market), Q3 (at the freeze), Q5 (yes) and Q6 (yes) move any date. Q1 and Q4 move none,
  because no program has a positive contained expectation to confirm.
- **A confirm window needs its own feed check.** The manifest flags 24 forex pair-months in 2025–26.
  Twenty-two are bar-range drift at an intraday/daily ratio of 1.0017 or below. Two break daily
  containment: NZDCHF 2025-05 (1.048) and AUDCHF 2025-03 (1.033). The 2021–22 median was 1.065. Carried
  into amendment 48's next pass: a read checks its window's feed character before it grades.
- **Live trading will read worse than this corpus.** The corpus reads FMP's later history, and the
  bank's first copies read about 0.01 R per bracket worse on forex (the vintage bound). Every forex
  expectation here is optimistic for a live desk.
- **Measure next, at zero bytes: a same-geometry random-entry control.** Contained forex shows a
  positive pre-cost edge under every exit, +0.013 to +0.050 R per fill, of unexplained origin
  ([geometry](/docs/research/r3/converge-2026-09-27/refute-payoff-gap_geometry-variants.out.txt)).
  Coin-flip entries through the shipped ladder would show whether it is entry information or the
  bracket meeting the feed. The answer points design round 2 toward entry or toward cost.
- **Defer the registry build until Q7 is ruled.** Its read statistic depends on the grain.

## Corrections to the record

- HANDOFF's 2026-09-24 entry says fifteen crosses clear zero on select at lo95. They do, but only in
  pooled years. On contained years 0 of 15 clear lo95 under either arm.
- The design round's rating of the payoff gap as the fastest route is withdrawn (§2 above).
- `imom-close-hedging-v1`'s spec names the futures fit fold of the 2026-09-14 corpus, which #706
  superseded for fit and select reads. Correct it before anything is hashed.
- The payoff finder compared a per-fill difference with the vintage line, which is in bracket R. The
  comparison is withdrawn; the vintage record does not convert between the two units.

## Seal disclosure

One confirm row was exposed. A refuter ran `grep -rn '6627.3' .` inside `docs/research/r3` to find a
figure's source, and it scanned the gitignored corpora. It printed raw rows of `capture-all-ignore-low-edge-classfolds-2026-09-24.jsonl`,
among them line 16862, a confirm row for EURUSD (a held-out market) with its R fields. No figure here
uses it, and nothing was written. It is recorded against the confirm seal. The hazard is that any
recursive text search under `docs/research/r3` opens the corpora, and future briefs must bar it.
