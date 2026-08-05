# Levelflow — Broker sizing and the program governor (§19–§20)

Hedge-mind pillars 2 and 3, continuing the numbering §18 Attribution opened
(`docs/superpowers/specs/2026-07-30-levelflow-desk-design.md` §18, pillar 1,
owner-ordered 2026-08-01, shipped 2026-08-02). Controller-ruled 2026-08-02;
the rulings of record are at the foot of this document.

**Authority.** The design inputs are `docs/research/e8-fmp-crossmap.md` §5
(binding on the schema), `docs/research/e8-markets-dossier.md` and
`docs/research/e8-futures-dossier.md` (their "Primary-article pass
(2026-08-02)" sections supersede older text in the same file), and the
per-article extractions in `docs/research/e8-markets-articles.md` and
`docs/research/e8-futures-articles.md`. Rules cite the E8 article ID that
publishes them. Where two E8 pages disagree, this spec names the reading it
takes and why.

All of §16 and §17 binds: flat rows, hairlines, mono numerals, the copy law
(§17f — text says only what the surface cannot show), both platforms inside
the existing frames, no new chrome, and the two-direction review discipline.

**The boundary, and it governs every number in both sections.** A number
enters this feature by exactly three routes: E8 publishes it; Levelflow
derives it by a method E8 publishes from data Levelflow already holds; or
**the owner observes it directly on the broker's live platform and it is
recorded dated and attributed** (owner ruling, 2026-08-02). There is no
fourth. Not an exchange specification, not an industry convention, not a
figure from a third-party aggregator, not a plausible default. Where the
three run out, the feature renders a word instead of a number (§19e, §20f)
— and that refusal is the feature working, not the feature failing.

**The third route is narrow by construction.** It admits what the broker's
own platform shows the account holder — a minimum lot increment, an order
ticket's computed risk, an instrument's presence in the tradable list, an
account option on the purchase screen. It carries `tag: "verified"` with
the observation's date, the platform it was made on, and the live program
it was made under. It is not a channel for inference: an observation
establishes the value observed, on the instrument and account it was
observed on, and nothing adjacent to it. Appendix A is the standing
program that produces these observations.

**Waves.** §19 ships first and completely. §20 ships second. The migration
in §19g lands once, in wave 1, carrying the columns §20 consumes so wave 2
needs no second migration.

---

## §19. The broker-aware position-sizing engine

Levelflow tells a user where to enter, where to stop, and where to take
profit. It does not tell them how much to buy. §19 closes that gap for one
broker, from published data only, and refuses to answer where the broker
has not published enough to answer honestly.

### §19a. Broker reference data — the row and its states

Broker reference data ships as **TypeScript data modules**, not database
rows. It is versioned, reviewable, diffable, and pinned by test in the same
change set that edits it — the properties `tests/calibrationState.test.ts`
already buys for the calibration constants. A table would move the numbers
out of code review and out of CI.

Location: `src/lib/broker/` — as shipped in wave 1: `types.ts`,
`programs.ts` (program lines and ladders), `instruments.ts` (the instrument
rows), `bridging.ts` (§19c's bridge), `quotes.ts`, `sizing.ts` (the formula
and its gates); `rulebook.ts` joins them with §20. The trade-analyzer edge
function does not read them; sizing is a client computation over data the
client already holds (§19c).

**The row is keyed on `(broker, program_line, levelflow_symbol)`.** Never on
the FMP symbol — `WTI`/`CLUSD` and `BRENT`/`BZUSD` share one FMP symbol
each, so it is not unique across the roster. Never on broker alone — the
same Levelflow symbol is tradable on E8 Signature Futures and untradable on
E8 One, and `GCUSD`/`MGCUSD`/`XAUUSD` reach one exposure through three
instruments at three contract sizes depending on the program bought
(crossmap §5.1).

```ts
type Observation = {
  date: string;        // ISO date the owner made it
  platform: string;    // "TradeLocker" | "E8X dashboard" | "E8 purchase screen"
  program: string;     // the live account it was made on: "E8 Pro Forex"
  note: string | null; // what was seen, in the owner's own terms
};

type Provenance = {
  article: string | null;   // "9453488" | "13004287" | null for dossier-only and verified
  tag: "primary" | "derived" | "verified" | "secondary" | "dossier";
  method: string | null;    // required when tag is "derived": the article publishing the method
  url: string | null;       // null only when tag is "verified"
  observation: Observation | null; // required when tag is "verified", null otherwise
};

type Valued<T> = { source: Provenance; value: T | null };

type QuoteUnit =
  | { contractSize: Valued<number>; kind: "forex_contract" }
  | { kind: "index_points"; pointsPerLot: Valued<number> }
  | { kind: "futures_tick"; tickSize: Valued<number>; valuePerTick: Valued<number> };

type Tradability = "confirmed" | "not_offered" | "not_published" | "unconfirmed";

type BrokerInstrument = {
  broker: "e8";
  programLine: ProgramLine;
  levelflowSymbol: string;         // the row key's third element

  tradability: Tradability;
  tradabilitySource: Provenance;

  brokerSymbol: string | null;     // "ES", "USD/JPY", null when unpublished
  brokerSymbolAlt: string | null;  // the second observed spelling: E7, NQ-for-NG
  brokerSymbolSource: Provenance | null;

  unit: QuoteUnit;
  inverted: boolean;               // a long broker instrument is a short Levelflow row
  priceScaleFactor: Valued<number>; // FMP price axis -> broker quote axis

  marginPerContract: Valued<number>;  // futures only; null blocks the cap
  maxTicketLots: Valued<number>;      // CFD only; 50, or 20 for gold
  relatedExposure: string | null;     // the instrument that reaches this exposure elsewhere
};
```

**Four rules govern the fields.**

1. **Only admissible-tagged values may enter as `confirmed`.** A row whose
   tradability rests on a `[SECONDARY]` or dossier-only tag is at best
   `unconfirmed`. CI asserts the implication in one direction: every
   `confirmed` row carries `primary` or `verified` on its tradability, and
   `primary`, `derived` or `verified` on every non-null value its unit
   requires.

   `derived` is the fourth tag and the only one this feature adds to the
   dossiers' three. It marks a value E8 does not print but instructs the
   reader to compute — a per-pip dollar figure, a bridge price for a cross
   E8's own bridging table does not enumerate. It is never a synonym for
   `primary`: it carries the article that publishes the **method**, its
   inputs are Levelflow's own in-roster quotes, and CI keeps the two tags
   distinguishable so a later reviewer can see at a glance which numbers E8
   wrote down and which ones its arithmetic produced. A `derived` value may
   support a `confirmed` row; a `secondary` or `dossier` value may not.

   `verified` is the fifth tag and the third admissible one (owner ruling,
   2026-08-02). It marks a value the owner observed on the broker's live
   platform: it carries no article and no url, it carries a non-null
   `observation` with a date, a platform and the live program, and CI keeps
   it distinguishable from `primary` so a later reviewer can see at a glance
   which numbers E8 wrote down, which ones its arithmetic produced, and
   which ones the owner watched the platform do. A `verified` value may
   support a `confirmed` row, and a `verified` observation may establish
   tradability itself — the owner seeing an instrument tradable on the live
   account is the same class of fact as E8 publishing that it is.
   `secondary` and `dossier` remain inadmissible for either. The CI
   implication widens accordingly: every `confirmed` row's tradability
   carries `primary` or `verified`, and every value its unit requires
   carries `primary`, `derived` or `verified`.

2. **Null blocks. Null never defaults.** Contract size is NOT PUBLISHED for
   every crypto symbol, for silver on the Markets side, for every index but
   three, and for the whole energies class (9453488 renders three rows —
   XAUUSD 100, US30/NAS100 5, SP500 20 — and defers the rest to an
   instrument list that does not exist as a page). Tick size is NOT
   PUBLISHED for `ZB`/`ZN`. Margin is NOT PUBLISHED for `PA`, `7E`, `MCD`,
   `EMD` (10155917). A schema with NOT NULL sizing columns can only be
   satisfied by inventing numbers, and a governor that invents a number
   takes a position it cannot size.

3. **The unit is tagged because it is genuinely polymorphic.** Forex
   publishes a contract size in units (100,000, every one of the 28 pairs,
   e8x trading-symbols). Index CFDs publish a per-point multiplier (SP500 =
   20, US30 = 5, NAS100 = 5; 9453488). Futures publish tick size plus
   dollars per tick (ES 0.25/$12.50; 13004287). SP500's `20` and MGC's
   `$1.00` are not the same kind of number and one numeric column cannot
   hold both.

4. **Two spellings, no silent winner.** `brokerSymbolAlt` exists because
   E8's own pages disagree: E-mini Euro FX is `7E` on the fee table
   (13001922), the tick table (13004287) and the live symbol tool, and `E7`
   on the canonical instrument list (13390461); Natural Gas prints as `NG`
   on 13001922 and as `NQ` on 13004287 — colliding with E-mini NASDAQ 100
   in the same taxonomy. Both spellings are recorded. The canonical field
   takes the 2-of-3 spelling; the alt carries the outlier.

**Nothing renders `brokerSymbol` in wave 1.** The in-platform order-entry
ticker string is NOT PUBLISHED for every asset class — the slash format
(`EUR/USD`) is the E8X dashboard's display convention, and the dossier calls
this "the single most consequential gap." Futures roots are [PRIMARY] but
Levelflow carries no contract month at all, so a rendered root would be an
incomplete order-entry symbol. The field exists for provenance and for the
join; a guard asserts no JSX reads it.

**Inversion and price scale.** `inverted` marks the rows where a long broker
instrument is a short Levelflow row: E8 names `6C` "Canadian $", `6S`
"Swiss Franc", `6J` "Japanese Yen" — all foreign-currency-base — against
Levelflow's USD-base `USDCAD`, `USDCHF`, `USDJPY`. A row that maps
`USDJPY → 6J` without the flag places the trade backwards while passing
every arithmetic check. `priceScaleFactor` is the second half of the same
defect: `6J`'s published tick is 0.0000001 against an FMP `USDJPY` price at
three decimals.

**The `6J` row ships `unconfirmed`, and the reason is arithmetic on E8's own
table.** 6E and 6S publish tick 0.0001 with $12.50 per tick, so their
derived value per 1.0 price unit is $125,000. `6J` publishes tick 0.0000001
with the same $12.50, so its derived value per 1.0 unit is $125,000,000 —
one thousand times its siblings', on the reciprocal axis. The pair cannot be
reconciled against anything E8 publishes. `6M` (0.00005/$5.00) carries the
same defect at a smaller factor and has no Levelflow counterpart. Neither
enters as `confirmed`, and the inversion transform is therefore built and
property-tested in wave 1 with **zero confirmed inverted rows** (§19f).

An exchange contract notional would resolve `6J` arithmetically, and it is
ruled out: it is neither E8-published nor derivable by an E8-published
method, and the third route admits an observation of the broker's own
platform, not a figure from the exchange — so it fails the boundary at the
head of this document. The row stays `unconfirmed` until E8 publishes a
reconcilable pair **or the owner observes the live ticket's own tick value**
(Appendix A, item 6), and the machinery waits for data rather than the data
being manufactured to fit the machinery.

**Row population, wave 1.** Every one of the 50 scannable markets gets a row
on every shipped program line (§19b) — 500 rows, generated from the
crossmap's per-market tables, not hand-typed. The nine code-present
non-scannable markets (crossmap §1.6) get rows too: they stay in the symbol
map and the replay universe, and the governor must be able to answer "is
this tradable on this program" for them if the evidence ever flips. They are
never sizeable while they are no-trade or hidden.

Consequential population facts, each pinned by test:

- **Futures program lines**: 39 of the 50 markets are `not_offered` — every
  Forex (28), Metals (2), Energies (2) and Crypto (7) row. Of the 11 Futures
  rows, 8 are `confirmed` (`CL`, `ES`, `GC`, `MGC`, `NQ`, `RTY`, `SI`,
  `YM`), 2 are `unconfirmed` (`ZB`, `ZN` — margin published, tick and value
  NOT PUBLISHED, and both absent from the fee table, the tick table, the
  canonical 45-instrument list, and the live symbol browser), 1 is
  `not_offered` (`BZUSD` — E8 carries no Brent contract).
- **CFD program lines**: all 11 Futures rows are `not_offered` (`RTYUSD`,
  `ZBUSD`, `ZNUSD`, `BZUSD`, `SIUSD` among them — the Futures roster's own
  scope, never a documentation gap). Five have a same-exposure CFD at a
  different contract size and a different P&L per point (`ESUSD`→`SP500`,
  `NQUSD`→`NAS100`, `YMUSD`→`US30`, `GCUSD`/`MGCUSD`→`XAUUSD`, and since
  2026-08-04 `BZUSD`→`BRENT`) — recorded in `relatedExposure`, never
  substituted. **Appendix A's fold (amendment 12, 2026-08-04)** closed the
  CFD side's last `not_published` row: `XAGUSD`'s silver contract size, once
  a documentation gap E8 never filled, is `confirmed` on the four
  Forex-classification lines (`one`, `pro_forex`, `signature_forex`, `zero`)
  by direct observation (docs/research/e8-observations-2026-08-02.md, batch
  2). No CFD-line row is `not_published` on those four lines any longer; the
  two states still get different words (§19e) for the rows that remain
  `not_offered`.
- **Three markets have no confirmed E8 route on any program line, down from
  eight (Appendix A, amendment 12, 2026-08-04)**: `BZUSD`, `ZBUSD`, `ZNUSD`.
  `BRENT`, `ADAUSD`, `BCHUSD`, `LTCUSD` and `XRPUSD` left the list when the
  owner's own order tickets gave each a confirmed CFD route on the four
  Forex-classification lines — `BRENT` corroborated twice, by batch 2 and by
  the F6 order ticket. §20c carries that fact; §19 does not, because on one
  program line the honest word is the same either way.
- **`XAUUSD`'s ticket cap is 20 lots, not 50** (9453396). A shared
  max-ticket value would over-permit gold by 2.5×, so the cap is per row.

### §19b. The program ladder and the profile

**The configuration is a catalog, not a form** (§20i ruling 7): every
selectable option is one E8 actually sells, transcribed from the verified
purchase-screen record, and no free-form numeric entry exists. A selection
the checkout does not sell must be impossible to express.

**Ten program lines ship** — the researched set, less two. The bar is a
[PRIMARY] account-size ladder and a [PRIMARY] rule set. `E8 Classic` fails
it: its article 404'd on re-fetch and its drawdown is described two ways
(fixed 4%/8% against a customizable 3–7%/6–14%). `E8 Track` and `E8 Track
1:1` fail it: never found on either help subdomain, secondary-only, absent
from every current collection listing, possibly legacy. **Neither is offered
by E8 any longer** (owner, 2026-08-02: "Classic and Track are no longer
offered by E8."), which retires the evidence question rather than answering
it: the 404'd Classic article and Track's secondary-only citations are what a
withdrawn product's documentation looks like. Neither appears in the
selector, and **neither has a re-entry path** — there is no research pass to
run against a product that is not sold. The ten lines are E8's current
catalogue. If E8 ever reintroduces either name, it enters as a new product on
its own primary research, dated and committed to `docs/research/` like the
rest — a restoration of a 2026 row is never the mechanism.

| `program_line` | Selector label | Account sizes | Source |
|---|---|---|---|
| `one` | E8 One | 5K/10K/25K/50K/100K/200K/400K/500K | 8880316 |
| `one_crypto` | E8 One Crypto | same 8 tiers | 8880316, 13429922 |
| `pro_forex` | E8 Pro Forex | 5K/10K/25K/50K/100K/**150K**/200K/400K/500K | 8880316 |
| `pro_crypto` | E8 Pro Crypto | same 9 tiers | 8880316, 15323777 |
| `signature_forex` | E8 Signature Forex | 25K/50K/100K/150K | 8880316, 11755943 |
| `signature_crypto` | E8 Signature Crypto | 25K/50K/100K/150K | 8880316, 11864571 |
| `signature_futures` | E8 Signature Futures | 25K/50K/100K/150K | 8880316, 11864618 |
| `zero` | E8 Zero | 50K/100K/200K | 8880316, 15655062 |
| `zero_futures_starter` | E8 Zero Futures Starter | 50K/100K/200K | 8880316, 15935817 |
| `zero_futures_max` | E8 Zero Futures Max | 50K/100K/200K | 8880316, 15935817 |

Pro's ladder carries a $150,000 tier that E8 One's eight do not — the two
products' ladders are not identical, and a shared ladder constant would be
wrong for one of them. The word "Futures" in the two Zero labels is
Levelflow's: E8's own pages call the forex-side product "E8 Zero" and the
futures products "E8 Zero Starter and Max" without disambiguating them, and
one selector cannot carry two products named the same thing.

**Per-line class universe** comes from the two dedicated cross-product
tables — 5514977 (instruments by product) and 5514982 (leverage by product)
— which agree with each other. Individual product pages publish narrower
leverage lists (15274219 gives E8 Pro Forex no crypto row); 2-of-3 takes the
wider reading. The disagreement is immaterial in wave 1: every Energies and
Crypto row is blocked on its own unpublished contract size regardless of
which class list is right.

**Leverage** is per program line and per class, and it does not change
between stages — "Leverage will differ between each product, but not between
stages" (5514982), which retires the secondary claim of an eval-stage
step-down. Forex 1:30, Indices 1:15, Metals 1:15, Energies 1:15, Crypto 1:1
on the forex lines; Bitcoin 1:5, Ethereum 1:5, other crypto 1:2 on the
crypto lines. E8 Zero is absent from 5514982 but publishes the same figures
on its own product page (15655062) — the value's `source.url` is the product
article, not the leverage article.

**The profile.** Default is **None**: the feature is fully dormant and adds
zero surface anywhere. No Size row, no compliance line, no program-facts
block, no new copy. Selecting a program is what brings the feature into
existence.

The controls live inside ProfilePanel's existing **Broker** row, beneath the
BrokerChip, as `ProfileDetailRow`-shaped label/control pairs. No card, no
new chrome, no second Broker section. The row's approved description
("Markets, costs, and record follow the broker.") is unchanged — it already
says what the row cannot show, and the selector below it is self-evident.

Five controls, in this order, each a `select`:

1. **Program** — `None` plus the ten labels above.
2. **Account size** — the selected program's real ladder only, formatted
   `$100,000` (comma-grouped, no cents). Changing program resets it.
3. **Stage** — `Challenge` · `Performance`. E8's own words are "SimFi™
   Challenge" and "SimFi™ Performance"; the app's voice drops the mark.
4. **Risk per trade** — `0.10%` to `1.50%` in `0.05%` steps, default
   `0.50%`.
5. **Drawdown** — the purchased tier, on the four customizable lines only
   (`one`, `one_crypto`, `pro_forex`, `pro_crypto`); absent on the six preset
   lines. E8's own tiers (8880316), rendered verbatim as
   `{daily}% daily · {max}% max`. On One and One Crypto, five options:
   `3% daily · 4% max` · `4% daily · 6% max` · `5.3% daily · 8% max` ·
   `6.6% daily · 10% max` · `9.2% daily · 14% max`. On Pro Forex and Pro
   Crypto, three: `2.5% daily · 6% max` · `2.5% daily · 8% max` ·
   `2.5% daily · 10% max`.

Stage and Drawdown are controller-approved additions to the original
three-control brief. Stage is required by §20's own rules: the consistency
rule and the news restriction are stage-scoped, Daily Pause is
Performance-only, and Zero's contract cap and its drawdown lock both differ
by stage. Drawdown is required because a customizable line's loss limits are
a purchase-time choice Levelflow cannot otherwise know — without it, §20's
facts block would render `Not published` for both drawdown rows on the four
customizable program lines. Their column domains are in §19g.

**Risk-per-trade bounds, justified.** The ceiling is 1.50% because it is the
top of the band E8 itself observes — "The most successful traders on E8 risk
between 1–1.5% per trade idea. This is not a rule but a clear pattern"
(9453413) — and because at 1.50% a single stop consumes three quarters of
the tightest published daily line, the Signature 2% Daily Pause (11969807),
which is the shape 6929927 prohibits outright as "All-or-nothing Trading:
risking the entire daily drawdown on a single trade is not permitted." The
default is 0.50% because four full stops fit inside that 2% pause line and
five inside Pro's 2.5% Daily Drawdown (15274219), and because it sits below
the 1% per-trade-idea cap E8 reserves the right to impose on a flagged
account (6929927) — a Levelflow-sized trade is never itself the flag. The
floor is 0.10% so the smallest ladder tier still produces a placeable size.

Levelflow does not know how many trades the user has open, so this is a
per-setup percentage and never a daily budget. That boundary is §20h.

**The saved-account walk.** The §19 retrofit's multi-account model
(`broker_accounts`) walks broker → market → program line → platform →
balance tier → drawdown token, in that order, wherever E8 sells a choice at
that step — the futures lines' single EOD option is auto-set, never asked
(§20i ruling 7). `src/lib/broker/catalog.ts` owns the two layers the five
controls above do not: `CLASSIFICATIONS` (`Forex` · `Crypto` · `Futures`)
partitions the ten program lines by the market that sells each one, and
`PLATFORM_LABELS` (`TradeLocker` · `MatchTrader` · `Tradovate`) names the
platform each line offers — both in the checkout's own words.

### §19c. The sizing math

One formula, four gates, one rounding rule. Every step either produces a
number or produces a state word (§19e) — there is no third outcome and no
default.

**Step 1 — the risk budget.**

```
riskBudget = accountSize × (riskPercent / 100)
```

`accountSize` is the profile's tier, not an equity Levelflow cannot see.
Every **breach** drawdown basis E8 publishes is the **initial balance** —
"its value is based on the initial balance" (11769446), "Initial Balance − %
of Initial Balance = Loss Level" (13653031) — so the tier is the right
denominator for the budget, not a stale guess at one. The scope of that
claim is exactly the account-ending limits: the Signature **Daily Pause** is
not among them, its basis being the day's starting balance (§20b's owner
canon), which is why §20d renders that rule as a percent and never as a
tier-derived dollar.

**Step 2 — the stop distance, on the Levelflow price axis.**

```
stopDistance = abs(setup.entryPrice − setup.stopLoss)
```

**Step 3 — the value of one price unit, at the correct scale.** By tagged
unit:

- `futures_tick`: `perUnit = valuePerTick / tickSize`. ES → 12.50/0.25 =
  $50 per index point. GC → 10/0.1 = $100 per dollar. SI → 25/0.005 =
  $5,000 per dollar. YM → 5/1 = $5 per point. All eight confirmed futures
  rows reconcile; the two unconfirmed ones have no tick to divide by.
- `index_points`: `perUnit = pointsPerLot`. SP500 → $20 per 1.0 index point
  per 1.0 lot. E8's SP500 multiplier is non-standard — most retail CFD
  desks quote $1–$10 — and it is the single largest scale trap in the map,
  because the same S&P exposure costs $12.50 per 0.25 point as `ES` on a
  futures program and $20.00 per 1.0 point as `SP500` CFD on a Markets
  program.
- `forex_contract`: `perUnit = contractSize × usdPerQuote`.

`usdPerQuote` is the USD value of one unit of the pair's quote currency. It
is 1 for the four USD-quoted pairs (AUDUSD, EURUSD, GBPUSD, NZDUSD), giving
the textbook $100,000 per 1.0 price unit and $10 per pip. For the other 24 it
is derived from Levelflow's own live quote for the quote currency's USD
pair — `1 / USDJPY` for every JPY-quoted pair, `1 / USDCHF` for CHF-quoted,
`1 / USDCAD` for CAD-quoted, `GBPUSD` for EURGBP, `NZDUSD` for AUDNZD, and
so on. All six required pairs are already in the roster, so no market has to
be added to make this work.

**Deriving `usdPerQuote` is sanctioned, not invented.** E8 publishes contract
size and leverage and states plainly that "pip value must be derived" — it
declines to publish a per-pip dollar figure anywhere. The derivation has
exactly one arithmetic answer and E8 instructs the reader to perform it. It
carries `tag: "derived"` with `method: "9453488"`, its inputs are Levelflow's
own in-roster quotes and nothing else, and where the required quote is missing
or stale the value is null and the row renders `Rate unavailable` (§19e).

**Step 4 — inversion.** When `inverted` is set, the stop distance must cross
to the broker's quote axis before meeting `perUnit`:

```
brokerStopDistance = stopDistance × priceScaleFactor
                   = stopDistance / (referencePrice ²)   // reciprocal axis
```

The transform is built, property-tested, and unused by any confirmed row in
wave 1 (§19a). Nothing sizes an inverted instrument until a `confirmed`
inverted row exists.

**Step 5 — the raw size.**

```
rawUnits = riskBudget / (stopDistance × perUnit)
```

**Step 6 — the caps, all of them, as a minimum.** Every cap that applies
must be computable, or there is no number.

*CFD lines.* Two caps.

The **flat ticket cap** is 50 lots for most symbols and 20 for XAUUSD/Gold
(9453396). The article states these as rules without product qualification —
its own scope note attaches to the *worked examples* of the margin formula,
which are E8 One only — so the flat caps are `confirmed` on every CFD line.
Splitting size across tickets to exceed the cap is permitted by E8 and is
not something Levelflow will suggest; the cap is the cap.

The **margin cap** is E8's own formula, verbatim: "Leverage × account equity
/ (Instrument price × contract size) = Max. positions you can open"
(9453396). It is also, algebraically, the margin-feasibility test: E8's only
enforced margin line is the stop-out at Margin Level ≤ 100% — "Once Margin
Level drops below 100%, all positions are automatically closed" (14964234,
14722843, both stating the same threshold) — and Margin Level ≥ 100% at
entry is exactly `usedMargin ≤ equity`, which rearranges to this formula.
**The margin cap and the feasibility check are one computation, not two.**
E8's coaching bands (Margin Level 250–400% strong, below 150% danger;
utilization 10–20% conservative, above 80% committed) are explicitly
advisory and produce no clamp and no copy.

"Instrument price" in that formula follows E8's bridging rule (9453396),
which publishes four cases: a USD-quoted pair uses its own price; a USD-first
pair uses **1**; `GBP/NZD`, `GBP/JPY`, `GBP/CHF` bridge via `GBP/USD`;
`NZD/JPY`, `NZD/CAD`, `NZD/CHF` bridge via `NZD/USD`. That enumerates 13 of
the 28 pairs.

**The method generalizes to the remaining 15 crosses.** E8's enumerated
cases state one rule: bridge via the base currency's USD pair. Its own worked
example performs it — `GBP/NZD`'s max lots computed as 30 × 100,000 /
(1.351 × 100,000), where 1.351 is the `GBP/USD` price. Applying the broker's
published method to the pairs its table did not list is derivation, not
invention: the same standing E8 grants when it declines to print a per-pip
figure and instructs that "pip value must be derived." So `AUDCAD`, `AUDCHF`,
`AUDJPY`, `AUDNZD`, `EURAUD`, `EURCAD`, `EURCHF`, `EURGBP`, `EURJPY`,
`EURNZD`, `GBPAUD` and `GBPCAD` bridge via `AUDUSD`, `EURUSD` and `GBPUSD`;
the three CAD-base and CHF-base crosses — `CADCHF`, `CADJPY`, `CHFJPY` —
bridge via `1 / USDCAD` and `1 / USDCHF`, since E8's roster and Levelflow's
both quote those legs USD-first.

**The boundary, stated where it bites: the method is E8's, and only
Levelflow's own in-roster quotes feed it.** No bridge price comes from
anywhere else — not a third-party rate, not a cross-rate computed from a
provider Levelflow does not already read for its own scanning. Every value
the generalization produces carries `tag: "derived"` with
`method: "9453396"`, distinct from `[PRIMARY]` in the data and in CI, so the
13 pairs E8 enumerated and the 15 it did not are never conflated. Where the
required bridge quote is missing or stale, the value is null and the row
renders `Rate unavailable` (§19e) — the derivation has a published method, but
it still has no answer without live data.

All 28 forex pairs therefore have a computable margin cap, and the bridging
derivation alone carries **29 sizeable markets** — 28 pairs plus `XAUUSD`.
Appendix A's fold (2026-08-04) adds ten more on the four Forex-classification
lines; "What is sizeable in wave 1" below carries the current count.

*Futures lines.* One cap, and it is not a contract count.

10155917 publishes the rule verbatim — "Allowed margin / Margin per contract
= size of the position" — alongside an allowed-margin figure for every
program and size. **The cap is a margin allowance:**

```
contractCap = floor(allowedMargin(program, size, stage) / marginPerContract)
```

| Program · stage | $25K | $50K | $100K | $150K | $200K |
|---|---|---|---|---|---|
| Signature Futures, both stages | $20,000 | $40,000 | $80,000 | $120,000 | — |
| Zero Futures, Challenge | — | $40,000 | $80,000 | — | $100,000 |
| Zero Futures, Performance (start) | — | $20,000 | $30,000 | — | $40,000 |

The published "Maximum Contract Size" column (2/4/8/12 for Signature;
4/8/10 Zero Challenge; 2/3/4 Zero Performance start) is that formula
evaluated at the $10,000 standard margin, and CI pins the identity. Reading
it as a contract count instead of a margin allowance would cap `MGC` at 2
contracts on a $25K Signature account when its $1,000 margin permits 20 —
and it explains the mini/micro allowance table (2/20, 4/40, 8/80, 12/120)
that circulated as `[SECONDARY]`: it is the same allowance divided by micro
margin.

Zero Performance scales the allowance with locked profit — 1.5% locked and
3% locked triggers, "the account scales automatically at the start of each
new trading day" (10155917). Levelflow cannot see locked profit, so it
clamps to the **starting** allowance, the conservative floor, and §20d
publishes the scaling table rather than guessing where the user sits. Zero's
own $50K Performance ceiling (5 contracts) exceeds its $50K Challenge flat
cap (4) — recorded as published, unreconciled by E8, and immaterial because
each stage reads its own row.

`marginPerContract` null blocks the cap and therefore the number: `PA`,
`7E`, `MCD`, `EMD` have no margin row on the one page that publishes margin.
None is in Levelflow's roster today.

**Step 7 — round DOWN to the broker's step.** Always down, never nearest:
rounding up spends more than the risk budget authorizes.

```
units = floorToStep(min(rawUnits, ...caps), step)
```

Futures step is **1 contract**, exact and confirmed. CFD step is **0.01
lots**, and it is **verified, not assumed**: the owner confirmed it on their
live E8 Pro Forex account in TradeLocker on 2026-08-02 — "On forex accounts,
I can confirm the smallest is 0.01." The value carries `tag: "verified"` with
that observation (§19a); E8 still publishes no minimum lot increment on any
page, and it no longer needs to. The print record that forced the old
assumption is kept for the reader: the smallest lot E8 names in print is 0.1
(9453425, "even a 0.1-lot micro-trade counts") and its worked examples use
0.3 and 5 lots (14722843), which distinguished nothing — which is why the
value came in unconfirmed before the owner watched the platform. The reason
0.1 would have been wrong stands as corroboration rather than as
justification: a $5,000 account at 0.50% risk with a 30-pip EURUSD stop
sizes to 0.083 lots, which a 0.1 step floors to zero, so the tightest ladder
tier would have produced no size at all.

**The observation's scope is the account, not the instrument list.** It was
made on a forex-line account, which is where every CFD program line's forex
pairs trade, so the 28 pairs carry the verified step. `XAUUSD` — the 29th
sizeable CFD market — trades on that same account, and whether it carries an
instrument-specific minimum is not something the observation says: it keeps
0.01 as the working step and sits first in Appendix A's queue. The index CFDs
raise the same question and it stays academic in wave 1, since Levelflow's
index rows are the futures symbols and are `not_offered` on every CFD line.
A sub-0.1-lot size no longer carries a "may be refused" hedge on the verified
instruments — the step is the platform's own.

**The invariants CI enforces** (§19f): the rounded size's worst-case loss
never exceeds the risk budget; the size never exceeds any cap; the size is
monotone non-increasing in stop distance and monotone non-decreasing in risk
percent; and every null input produces a state word rather than a number.

**What is sizeable in wave 1 (updated 2026-08-04 — Appendix A's fold,
amendment 12).** On three CFD program lines (`one`, `pro_forex`,
`signature_forex`): 39 markets — the 28 forex pairs, `XAUUSD`, and Appendix
A's fold of `XAGUSD`, `WTI`, `BRENT` and seven scannable crypto rows
(`ADAUSD`, `BCHUSD`, `BTCUSD`, `ETHUSD`, `LTCUSD`, `SOLUSD`, `XRPUSD`). On
`E8 Zero`: 37 — the same set less `WTI` and `BRENT`, since E8 Zero's own
product page (15655062) publishes no energies leverage row and neither has a
computable margin cap there. On the three futures lines: 8 markets,
unchanged. What stays blocked is blocked on E8's silence, not on
Levelflow's, and it has narrowed to three symbols: `ZBUSD` and `ZNUSD` on an
unpublished tick, `BZUSD` on a contract E8 does not carry. The Crypto and
Futures classifications remain queued for their own accounts (amendment 15):
every crypto, metals and energies row on `one_crypto`, `pro_crypto`,
`signature_crypto` and the futures lines stays exactly where it was, because
an observation upgrades the row it names and no other (amendment 4) — the
owner's E8 Pro Forex evidence licenses every account of the FOREX
classification and nothing adjacent to it. Not one of the three remaining
blocks is unblockable by derivation — E8 publishes no method that produces a
contract size or tick it never printed. Each is unblockable by
**observation**, and Appendix A remains the standing program that collects
it. The sizeable counts in this section are therefore a floor dated
2026-08-04, not a ceiling — each verified observation moves a row from a
word to a number, in a change set that names the observation.

### §19d. The surfaces

One new row, on one component, on both platforms.

**The Size row joins the ladder as its last row**, in
`AdvisorRecommendationPanel`'s `CopyableMetricRow` grid, after Target 2.
Last, for three reasons: the four price rows are one ladder and the
canonical §7 instruction narrates them in order, so a non-price row inside
them breaks the taught sequence; a conditional row at the end never reflows
the rows above it when a program is set or cleared; and it inherits the
existing flush-hairline rhythm without touching a single row above it. Both
platforms get it from the same component — the desk stage ladder and the
mobile Scan ladder are one render path.

The row is a `CopyableMetricRow`, unmodified: eyebrow label, mono
tabular-nums value, 44px copy target, hairline separation, no border of its
own. The unit lives in the label, not the value, so the numeral column stays
clean — the same idiom as `Target 1 · bank half`.

- Label: **`Size · lots`** on CFD lines, **`Size · contracts`** on futures
  lines.
- Value: the bare number — `0.42`, `3`. Copy payload is the same bare
  number via `formatCopyValue`, so a paste into a quantity field is clean.
- Blocked: the value slot renders the state word (§19e) in the muted
  non-mono treatment and **the copy affordance is absent** — there is
  nothing to copy, and an affordance that copies a word is a lie.

**No program selected: the row does not exist.** Not a dash, not an empty
value, not a prompt to go set one. The ladder is exactly what it is today.

On mobile the fifth row grows the merged Scan surface's single scrolling
region, which is what §17g's fixed-viewport frame is for — chrome stays
pinned, the ladder scrolls inside it, and no new frame appears. The row is
measured against the built CSS at 375×812 before ship, the way ProfilePanel's
own row budget was; if it pushes the qualified list off the first screen, the
list scrolls, because that region already does.

**Nowhere else, in wave 1.** Not on the Current trades rail — a placed
trade's size is whatever the user typed, and Levelflow cannot know it, so a
computed size there would be a claim about the user's order. Not on the
Insights ledger — sizing a historical setup against today's program and
today's risk percentage is retroactive fiction. Both are explicit non-goals,
not oversights.

### §19e. States and the rendered vocabulary

Four words. Each names a different fact, and no two of them can be true at
once. §17f's test applied to a state word: the shortest string that is
honest, and none that repeats what a neighbouring surface already shows.

| Rendered string | Trigger |
|---|---|
| **`Not offered`** | `tradability: "not_offered"` — E8 does not carry this market on this program |
| **`Not confirmed`** | `tradability: "not_published"` or `"unconfirmed"` — E8 has not confirmed this market on this program |
| **`Not published`** | Tradability is `confirmed` and a value the size needs is null |
| **`Rate unavailable`** | Every published value is present; a live quote the derivation needs is missing or stale |

`not_published` and `unconfirmed` share one word deliberately. The states
differ in the data — one is E8's silence, the other is E8 contradicting
itself — but from the user's seat both are the identical fact: E8 has not
said. Four tradability states in the schema, two words for the three that
carry no number, and the schema keeps the distinction a later reviewer needs.

`Not offered` and `Not confirmed` must never be swapped. "Not tradable on
this broker program" is a claim E8 supports for the 39 rows a futures
program excludes; it is a claim E8 does not support for `BTCUSD` on a
Crypto-classification line (`one_crypto`, `pro_crypto`, `signature_crypto`),
where silence about a crypto contract size remains a documentation gap.
(Updated 2026-08-04: this example was `XAGUSD` until Appendix A's fold
closed silver's gap on the Forex-classification lines by direct observation
— amendment 12 licenses that evidence for the FOREX classification alone,
so the Crypto classification's own contract sizes stay `not_published`
until its own account is observed, amendment 15. This scoping is not an
open question: amendment 19 clause 3 already rules it — "the narrow
reading of contract-size adjacency stands" (owner, 2026-08-03) — forex-
carried crypto evidence never crosses onto Crypto-classification lines.)
The crossmap is explicit that this distinction is load-bearing, and CI
pins each row's word to its state.

Nothing is rendered in a fifth voice. No `N/A`, no `unknown`, no
`approximately`, no `estimated`, no `TBD`, no parenthetical hedge — those five
join the languageGuard ban list (§19f). The em dash is a separate case: the
app renders it legitimately elsewhere (§18 Attribution's missing net R,
Profile's unresolved member-since), so it cannot be banned by language guard —
instead the composition guard asserts that neither the Size row nor any
program-facts value ever renders it. A dash in a value slot means "there is
nothing here," and there is always something here: a number or one of these
four words.

### §19f. Testing law

Guards red-first, in the change set that makes them pass.

**`tests/brokerReference.test.ts` — the tables, pinned by article ID.** The
`tests/calibrationState.test.ts` precedent: a literal expectation table in
the test file, so changing a broker number without changing a test is
impossible. Pins every tick size, tick value, contract size, points-per-lot,
margin, leverage and ticket cap against the article that publishes it —
13004287 for tick/value, 10155917 for margin and allowances, 9453488 for
contract sizes, 5514982 for leverage, 9453396 for ticket caps, 13001922 for
the instrument roster. Structural assertions on top:

- Every `confirmed` row's tradability carries `primary` or `verified`, and
  every value its unit requires carries `primary`, `derived` or `verified`. No
  `secondary` or `dossier` tag reaches `confirmed`.
- Every `derived` value carries a non-null `method` naming a real article,
  and no `derived` value is also tagged `primary`. The 13 pairs E8's bridging
  table enumerates carry `primary` on their bridge; the 15 it does not carry
  `derived` with `method: "9453396"`. Pinning the 13/15 split by name is what
  stops a later edit from quietly promoting a derived bridge to published.
- Every `verified` value carries a non-null `observation` with a date and a
  platform, and no `verified` value is also tagged `primary` — the §19a
  third-route discipline as CI, so an owner observation can never be
  laundered into something E8 published. The 0.01 CFD lot step is asserted
  `verified` **by name**, with its date and platform, the way E8 Zero's null
  drawdown percentage is asserted null by name (§20g).
- The bridge resolves for all 28 pairs, and every bridge leg it names is in
  `AVAILABLE_ASSET_SYMBOLS` — the boundary as CI, so no bridge can start
  reading a market Levelflow does not already scan.
- The population tallies: 39 `not_offered` per futures line; 8 `confirmed`,
  2 `unconfirmed`, 1 `not_offered` among the 11 futures rows; 11
  `not_offered` per CFD line; the 8 no-route markets.
- The contract-cap identity: `floor(allowedMargin / 10000)` equals E8's own
  published "Maximum Contract Size" column for all ten program/size rows.
- The derived per-unit value of every confirmed futures row is finite and
  positive, and `6J`'s is 1,000× its 6E/6S siblings' — the assertion that
  documents why it ships `unconfirmed`.
- Both observed spellings present where E8 disagrees with itself: `7E`/`E7`,
  `NG`/`NQ`.

**`tests/brokerSizing.test.ts` — property tests.** Over generated inputs,
not example rows:

- **Budget invariant**: `units × stopDistance × perUnit ≤ riskBudget`, for
  every unit kind, every rounding, every cap combination. The one property
  that makes the whole feature safe.
- **Cap invariant**: `units ≤` every applicable cap.
- **Monotonicity**: size never increases as the stop widens; never
  decreases as risk percent rises.
- **The 6J inversion**: on a synthetic inverted row, sizing on the broker
  axis and sizing on the Levelflow axis with `priceScaleFactor` applied
  agree to within one step — and the real `6J` row is asserted to block,
  with `Not confirmed`.
- **The SP500 $20/point scale**: a 10-point stop on a $50,000 account at
  0.50% risk sizes to 1.25 lots at $20/point and would size to 25 lots at
  the $1/point a generic CFD assumption produces. The test pins the former
  and asserts the latter is unreachable.
- **Null blocks, exhaustively**: for each required value, nulling it alone
  yields no number and the correct word. Contract size, points-per-lot, tick
  size, value per tick, margin per contract and leverage produce
  `Not published`; a missing bridge price or `usdPerQuote` produces
  `Rate unavailable`. The two words are asserted separately, because a
  published gap and a stale quote are different facts (§19e).
- **Round-down**: never up, never nearest, at both steps.

**`tests/languageGuard.test.ts` — additions.** Ban `N/A`, `unknown`,
`approximately`, `estimated` and the standalone label `TBD` in the scanned
component roots — the five §19e names. Ban `brokerSymbol` and
`brokerSymbolAlt` in JSX, which is the §19a ruling as CI. The em dash is
handled by the composition guard, not here (§19e).

**`tests/deskComposition.test.ts` — both directions per §16.** Present: the
Size row inside the ladder grid, last; the two labels verbatim; mono
tabular-nums on the value; the copy affordance when a number exists. Absent:
the row when the program is `None`; any border, radius or fill on the row;
any copy affordance in a blocked state; an em dash in the Size row's value
slot (§19e); any second Broker section in ProfilePanel. One further assertion
covers the whole feature's copy: **every string this feature renders appears
in §20j, and §20j names nothing the feature does not render** — the pinning
surface is checked in both directions, like every other composition claim.

**`tests/profilePanel.test.tsx`** pins the five control labels, the `None`
default, the ladder rendered per program, the `0.50%` default, and that
selecting a program never mutates a sizing constant.

**`tests/e2e/authenticated-workspace.spec.ts`** gains one presence check per
new surface, at 375px and 1280px: with `None`, the ladder has four rows and
no Size row; with a program set, five rows and a number or a state word. Exact
locators — the substring twin lives page-wide (PR #147).

**Migration verification** is a live check against the deployed schema, not
a claim: the six columns exist with their constraints, the null-coherence
constraint rejects a partial write, and an off-ladder account size is
rejected by the write path.

### §19g. Migration

One migration, wave 1, carrying every column both sections need.
`supabase/migrations/20260803000000_broker_program_profile.sql`, and the same
columns added to `supabase/init.sql`'s `profiles` block so a fresh
provision matches a migrated one.

```sql
alter table public.profiles
  add column if not exists broker_id text,
  add column if not exists broker_program_line text,
  add column if not exists broker_account_size numeric(14,2),
  add column if not exists broker_stage text,
  add column if not exists broker_risk_percent numeric(4,2),
  add column if not exists broker_drawdown_tier text;

alter table public.profiles
  add constraint profiles_broker_id_valid
    check (broker_id is null or broker_id in ('e8')),
  add constraint profiles_broker_program_line_valid
    check (broker_program_line is null or broker_program_line in (
      'one', 'one_crypto', 'pro_forex', 'pro_crypto',
      'signature_forex', 'signature_crypto', 'signature_futures',
      'zero', 'zero_futures_starter', 'zero_futures_max')),
  add constraint profiles_broker_stage_valid
    check (broker_stage is null or broker_stage in ('challenge', 'performance')),
  add constraint profiles_broker_account_size_positive
    check (broker_account_size is null or broker_account_size > 0),
  add constraint profiles_broker_risk_percent_range
    check (broker_risk_percent is null
           or (broker_risk_percent >= 0.10 and broker_risk_percent <= 1.50)),
  add constraint profiles_broker_selection_coherent
    check (
      (broker_id is null and broker_program_line is null
        and broker_account_size is null and broker_stage is null
        and broker_risk_percent is null and broker_drawdown_tier is null)
      or (broker_id is not null and broker_program_line is not null
        and broker_account_size is not null and broker_stage is not null
        and broker_risk_percent is not null)
    );
```

Every column is nullable and every default is null, so **the migration is a
no-op for every existing profile** — None is the absence of a selection, not
a stored value, and no backfill runs.

**The two approved columns, and their domains per program line.**

`broker_stage` is `'challenge' | 'performance'`, required on every program
line, and never null while a program is selected — every one of the ten lines
has both stages and four §20 rules read it. Its rendered labels are
`Challenge` and `Performance` (§19b).

`broker_drawdown_tier` is exempt from the coherence constraint's non-null
half: it is meaningful only on the four customizable lines and **must be null
on the other six**, whose parameters are preset and published per size. Its
domain is E8's own tier list, encoded as the paired string the selector
renders (8880316):

| Program line | `broker_drawdown_tier` domain |
|---|---|
| `one`, `one_crypto` | `3-4` · `4-6` · `5.3-8` · `6.6-10` · `9.2-14` — daily % and dynamic %, paired as E8 pairs them |
| `pro_forex`, `pro_crypto` | `2.5-6` · `2.5-8` · `2.5-10` — the fixed 2.5% daily against selectable 6/8/10% static |
| `signature_forex`, `signature_crypto`, `signature_futures`, `zero`, `zero_futures_starter`, `zero_futures_max` | must be null |

Daily and dynamic move together on One — "Profit Target adjusts
automatically with drawdown changes", so they are paired tiers and not
independently selectable — which is why the column holds one paired token
rather than two numbers that could be combined into a configuration E8 does
not sell. Pro's daily drawdown is a fixed 2.5% on every tier (15274219) and
only the static leg moves; the token still carries both so one column shape
serves all four lines.

Tier membership, and the account size's membership in the selected program's
ladder, are enforced by the TypeScript data module and the write path, not by
SQL — duplicating the ladders and tier lists in check constraints would let
them drift from the modules CI pins. The write path rejects an off-ladder
size and an off-domain tier; it never accepts and silently ignores either.

RLS needs nothing new: `profiles` already carries own-row select, insert and
update policies, and these are columns on a row the user already owns.

`src/lib/profile.ts`'s `UserProfile` gains the six fields, and
`ProfilePanel`'s `onSave` widens from its five-field `Pick<>`. The existing
save path already writes every field on every save so a theme-only save
cannot reset a program selection — the same property the panel documents
today.

### §19h. Out of scope for §19

A second broker; per-broker calibration or per-broker history (§12's
declared future, still future); a size on the Trades rail or in Insights;
anything E8 does not publish. Program-aware market availability (§20e
names it) is **no longer out of scope**: it shipped in the §19 retrofit
Phase 4 (amendment 13), 2026-08-04 — classification visibility only; the
session-hours calendar §20e and §20h carve out stays V2.

### §19i. The account switcher's label (owner ruling, TASK 6 VERDICT, 2026-08-03 22:07)

The chip that names the broker becomes an account switcher once a profile
holds one or more saved accounts (amendment 18). Its label is a formula over
already-registered tokens, not new copy: the broker token (`E8`) piped with
the account's classification label (§20j: `Forex` / `Crypto` / `Futures`)
and the account size's K-form (`$100,000` → `100K`) — `E8 | FOREX | 100K`.
ALL CAPS is a render-time CSS transform over this byte-intact string (the
`ReloadNotice`/`.phosphor-pulse` technique, App.tsx), never a stored or
computed uppercase value, so a rename still displays exactly what the
reader typed, under the same transform. The rename itself **shipped in
the owner-findings wave of 2026-08-04** (it had been the verdict's
deferred "later task"): `broker_accounts.display_name`, capped at the
measured 14 by both the client and a DB check constraint, overrides the
formula wherever labels render, stands outside the collision-suffix
machinery entirely (renaming one of a colliding pair shrinks the group,
so the twin's suffix vanishes — the mockup's SWING BOOK demonstration),
and clears back to the formula on an empty commit.

The formula carries only classification and size — never program line,
platform, stage, or drawdown tier — so two accounts can formulate
identically (an E8 One $100,000 account and an E8 Pro Forex $100,000
account both read `E8 | FOREX | 100K`). Where they do, every account past
the first in that colliding group appends a single space then its 1-based
ordinal in parentheses — `E8 | FOREX | 100K (1)`, `(2)`, … — assigned by
sorting the colliding group by its accounts' `id`, so the assignment is a
pure function of the account set rather than of whatever order a caller's
array happens to arrive in (Supabase's own `.select()` carries no `ORDER
BY`). A group of one never carries a suffix. This is the owner's revision of
the mockup's own `-1` sketch (`docs/design/mockups/s-switcher-v1.html`,
`s-switcher-mobile-v1.html`): the space-then-parens form, measured at 375px
with 22px of clearance against the worst live case (`E8 | FUTURES | 50K
(1)`, 189px of a 211px chip budget).

A user-set rename is a later task: it will be the formula's override once it
ships, capped at 14 characters (measured: the worst-glyph 16-character
stress case exactly filled the 211px budget; 14 puts the worst rename at
parity with the worst suffixed formula label), and the suffix dissolves once
a rename resolves its collision. Task 7 builds the formula and the suffix
machinery only — `BrokerAccount` carries no name field yet.

---

## §20. The prop-firm risk governor — V1, advisory and plan-scoped

### §20a. What the governor is, and what it is not

**Levelflow cannot see the user's E8 account.** No fills, no balance, no
intraday P&L, no open positions, no payout history, no locked profit, no
selected drawdown tier beyond what the user tells it. E8 publishes no API
and Levelflow holds no credentials.

So the governor reasons about **the setup** against **the program's rules**.
It never pretends otherwise: no "you have $1,340 left today", no "2 of 5
profitable days", no drawdown headroom, no trade count. Every one of those
needs telemetry, and inventing them is worse than omitting them — a governor
that guesses a headroom number is a governor that says "you have room" when
the user does not.

V1 surfaces exactly two things: a compliance line on the setup card, and a
program-facts block on Profile. Both render only when a program is selected.

### §20b. The rulebook model

`src/lib/broker/rulebook.ts`, keyed on `(broker, program_line)` and resolved
by stage. Same `Valued<T>` and `Provenance` types as §19a — the same
discipline, the same null-blocks rule, the same [PRIMARY]-only bar for a
confirmed fact.

```ts
type Severity = "terminates" | "pauses" | "claws_back" | "gates_payout" | "none";

type ProgramRule = {
  basis: "initial_balance" | "day_start_balance" | "highest_closed_balance"
       | "highest_eod_balance" | "profit_target" | "period_profit";
  kind: "daily_drawdown" | "daily_pause" | "dynamic_drawdown"
      | "eod_dynamic_drawdown" | "static_drawdown" | "daily_profit_cap"
      | "consistency" | "news_window" | "forced_flatten" | "contract_month";
  percent: Valued<number>;
  amountBySize: Valued<Record<string, number>>;
  severity: Severity;
  stages: ("challenge" | "performance")[];
  updateClock: "server_midnight" | "trade_close" | "market_close" | "none";
};
```

`severity` exists because a single risk-of-ruin weighting would be wrong.
E8's consequences differ sharply and it says so: a Daily or Dynamic or
Static or EOD Dynamic Drawdown breach means the account is "permanently
closed" and "closing your balance above the loss level after you breach…
won't prevent" it (11769446, 11782996, 13653031, 11864596); a Daily Pause is
"not a hard breach; you can still continue trading the next day" (11969807);
exceeding the Daily Profit Cap is never framed as a violation, only as
automatic removal of the excess between 00:00 and 01:00 server time
(15319043); a news-rule violation is a profit clawback "after your request
payout" plus an email (9185497); a Best Day breach costs no account at all,
only a delayed payout (11865587, 15936479).

**The rulebook of record.** Every cell cites the article that publishes it.
Unresolved cells carry no value and render as §20f's word.

| Program line | Daily loss | Max drawdown | Consistency: Challenge / Performance | News | Forced flatten |
|---|---|---|---|---|---|
| `one` | Daily Drawdown, tier %, initial balance, terminates [11769446] | Dynamic Drawdown, tier %, highest closed balance, locks at initial, terminates [11782996] | none / 40% Best Day [9453418, 11775980] | Challenge free; Performance ±5 min blackout, clawback [9185497] | none; overnight and weekend allowed [5514966] |
| `one_crypto` | Daily Drawdown 3% [13429922] | Dynamic Drawdown 4% [13429922] | none / 40% [13429922] | same as `one` [9185497] | none [5514966] |
| `pro_forex` | Daily Drawdown 2.5% [15274219] + Daily Profit Cap 2% clawed back 00:00–01:00 server [15319043] | Static Drawdown 8%, fixed until first payout then moves to initial forever, terminates [13653031] | none / none [9453418, 15274219] | unrestricted, both stages [9185497] | none [5514966] |
| `pro_crypto` | identical, confirmed on its own page [15323777] | identical [15323777] | none / none [15323777] | unrestricted [9185497] | none [5514966] |
| `signature_forex` | none in Challenge; Daily Pause 2% of the day's starting balance, pauses to 00:00 server, not a breach, Performance only [11969807; owner canon 2026-08-02] | EOD Dynamic Drawdown, $1,000/$2,000/$3,000/$4,500 by size, updates once at market close, locks at initial, terminates [11755943, 11864596] | none / 35% Best Day [11755943] | unrestricted [9185497] | nightly: all positions closed 23:00 server, reopen 00:15 [11755943] |
| `signature_crypto` | identical [11864571, 11969807; owner canon 2026-08-02] | identical [11864571] | none / 35% [11864571] | unrestricted [9185497] | nightly 23:00 server [11864571] |
| `signature_futures` | none in Challenge; Daily Pause 2% of the day's starting balance, $500/$1,000/$2,000/$3,000, Performance only [11864618, 11969807; owner canon 2026-08-02] | EOD Dynamic, $1,000/$2,000/$3,000/$4,500, both stages [11864618] | none / 35% Best Day [11865587] | unrestricted, both stages [10209321] | daily: all positions force-closed 15:10 CT [13001922, 10149596] |
| `zero` | **none** — the comparison table's Daily-limit cell reads "No" [13106558] | EOD Dynamic Drawdown, **% NOT PUBLISHED**, terminates [11864596, 8880316] | none / none [9453418] | unrestricted [9185497] | none; overnight and weekend allowed [5514966] |
| `zero_futures_starter` | **none** [13106558] | EOD Dynamic 3%; Challenge does not lock at initial and keeps trailing [15935817, 11864596] | 40% of the profit target / none [15936479, 15935817] | unrestricted [10209321] | daily 15:10 CT [13001922, 10149596] |
| `zero_futures_max` | identical to Starter — "Both versions have identical rules" [15935817] | identical [15935817] | identical [15936479] | unrestricted [10209321] | daily 15:10 CT [13001922] |

**The two definitions, owner-canonical (2026-08-02).** The owner supplied
these verbatim as the rulebook's definitional inputs. Where a later re-read
of E8's pages phrases either mechanism differently, these govern the model's
`basis`, `updateClock` and `severity`. The article citations stay where they
are — the canon does not replace them, it states which reading of them is law.

> 2% Daily pause - A soft daily loss limit based on your starting balance of
> the day. If your floating or closed loss reaches 2%, trading stops until
> the next day. Your account is not breached. It simply pauses and resets at
> midnight

> EOD Dynamic drawdown – A moving loss limit based on your highest
> end-of-day balance. It only updates once per day at market close (intraday
> equity swings do not move it). It locks permanently at the initial balance
> level.

Source of record for the EOD definition, owner-supplied:
`https://intercom.help/e8/en/articles/11864596-eod-dynamic-drawdown` —
article 11864596, already this spec's citation for the mechanism. The Daily
Pause definition's article of record remains 11969807 unless the owner names
another.

**What each canon pins in the model.**

- Daily Pause: `basis: "day_start_balance"` — *not* `initial_balance`.
  `severity: "pauses"`, and the canon says why in words the app must never
  soften: "Your account is not breached." `updateClock: "server_midnight"`
  ("resets at midnight"). The trigger is **floating or closed** loss, so it
  can fire on an open position — recorded here because V2's headroom math
  turns on it and V1 must not imply a closed-only line.
- EOD Dynamic: `basis: "highest_eod_balance"`,
  `updateClock: "market_close"`, `severity: "terminates"`, and it locks
  permanently at the initial balance level — the lock is a floor that stops
  trailing, not a reset. "Intraday equity swings do not move it" is the
  operative half for a governor with no telemetry: nothing a user does inside
  a day changes this number, which is why the facts block can render it at
  all.

Both were already the model's shape. The canon's force is that they are now
owner-stated law rather than a reading of two help pages, and §20i ruling 3
is decided by the first of them.

**The EOD Dynamic amounts, and why they are a table and not a percentage.**
Owner-supplied with the definition, 2026-08-02:

| Account size | EOD Dynamic drawdown | Implied % |
|---|---|---|
| $25,000 | $1,000 | 4% |
| $50,000 | $2,000 | 4% |
| $100,000 | $3,000 | 3% |
| $150,000 | $4,500 | 3% |

**The ratio is tiered — 4% / 4% / 3% / 3% — not flat**, and stating that is
the point of the table. The four amounts confirm the figures already in the
rulebook row for the Signature lines; what they add is the shape. Any single
percentage fitted to them is wrong on two of the four tiers, so on the
Signature lines the EOD Dynamic rule carries `percent: null` and
`amountBySize` holds all four values. `zero_futures_starter` and
`zero_futures_max` are unaffected: 3% is published flat on their own page
(15935817). CI asserts the shape, not just the numbers: no flat `percent` on
a Signature EOD rule, the amount table complete for all four tiers per
§20g's no-partial-map rule, and the 4/4/3/3 ratio pinned so a later editor
who "simplifies" the table to one percentage fails the suite.

**The input contract — owner-supplied purchase-screen data.** The four
customizable lines (`one`, `one_crypto`, `pro_forex`, `pro_crypto`) sell
their loss limits as a purchase-time choice, and the definitive statement of
what E8 offers is the purchase screen itself. The owner has offered to supply
it (2026-08-02: "We should account for the customizable options and calculate
things for the user based on the parameters E8 offers. I can provide them
from the purchase screen, if necessary."). This block states what happens
when they do, and what happens until then, so neither state is improvised.

**When the tier matrix arrives**, it enters as `verified` provenance (§19a):
one observation per program line, carrying the date, the platform ("E8
purchase screen") and the tiers exactly as the screen lists them. The
purchase screen is authoritative over a price-table reading where the two
differ, because it is what the user actually buys from — which also settles
§20f's open E8 One preset conflict (11775980's 3%/4% against 8880316's
4%/6%). Landing it is one change set that touches four places together, or it
is not landed: §19b item 5's selector option list, §19g's
`broker_drawdown_tier` domain table, §20j's Drawdown option tokens, and the
`programs.ts` module with its pinning test. Tier membership is enforced by
the data module and the write path, not by SQL (§19g), so a tier that reaches
the selector without reaching the domain table is a write the write path
rejects — and a domain widened without the module is a tier CI does not know
about.

**Until it arrives**, the customizable lines compute from the tiers already
primary-published — §19b item 5's five One/One Crypto pairs and three Pro
pairs (8880316) — and nothing is invented to fill a suspected gap. Where a
selected tier is unknown or a rulebook fact behind it is unpublished, the
rows render §20f's word. The feature does not wait for the purchase screen to
ship; it ships on published tiers and gets more accurate when the screen
lands.

**What this block does not authorize.** Neither Levelflow nor the owner
composes a drawdown pair E8 does not sell. Daily and dynamic move together
on One ("Profit Target adjusts automatically with drawdown changes"), Pro's
daily leg is fixed at 2.5% and only its static leg moves, and the column
holds one paired token for exactly that reason (§19g). A purchase screen
showing a combination this spec does not list widens the domain; it never
licenses interpolation between two listed tiers.

**Two dossier-level disagreements, resolved here.**

*Signature Futures' Challenge-stage consistency rule.* The markets dossier
records a contradiction — `helpfutures` appearing to impose a 40% Best Day
cap during the futures Challenge while `help` states there is none in
Challenge "for all account types" — and its own primary-article pass says
the item was not addressed. The futures articles resolve it: 15936479 scopes
itself in its first line to "E8 Zero Max and Starter in the challenge stage
(or E8 One, E8 One Crypto in the Performance stage)". The 40% Challenge rule
is **E8 Zero's**, not Signature Futures'. Signature Futures is none in
Challenge, 35% in Performance. This spec takes the futures articles' own
scope statement; the markets dossier's Contradiction #5 is closed by it.

*The Best Day denominator is not one number.* Zero's Challenge version
measures the best day against the **fixed profit target** — "profit should
not exceed 40% of the total profit target in a single day", and a breach
raises the effective target to best-day ÷ 0.40 (15936479). Signature's
Performance version measures against the **running total profit for the
current payout period** (11865587). Same shape, different denominator, and
the rulebook's `basis` field carries which.

**Facts the rulebook holds and V1 does not render**, because they need
telemetry: payout minimums and thresholds, profitable-day counters, payout
caps by sequence number, the allocation caps (5515039), the account-reset
discount (11640147). They are recorded so wave 2 needs no second research
pass.

### §20c. The compliance line

One line, under the ladder, inside the ladder column — after the canonical
§7 instruction and before the correlation line, both of which already live
there. It renders only when a program is selected **and at least one clause
is active**; an empty line leaves no element and no margin, the same
discipline `notice` already follows in that component.

Clauses join with ` · `, the app's established separator. **At most three**,
severity-ordered, excess dropped — a line that wraps to three rows on
desktop is a paragraph, and this is not a paragraph.

The closed clause set. Nothing else may appear on this line.

| Order | Rendered string | Trigger | Source |
|---|---|---|---|
| 1 | **`No E8 route on any program`** | the market is one of the eight with no confirmed route on any program line | crossmap §3.5 |
| 2 | **`Front month only`** | any futures program line, every setup, always | 13390461 |
| 3 | **`Size capped at the program limit`** | a cap bound — the rounded size came from a cap, not from the risk budget | 9453396, 10155917 |
| 4 | **`Flatten 15:10 CT`** | futures program line and now is within 60 minutes of 15:10 CT | 13001922, 10149596 |
| 5 | **`Flatten 23:00 server`** | `signature_forex` or `signature_crypto` and now is within 60 minutes of 23:00 server time | 11755943, 11864571 |
| 6 | **`News window`** | `one` or `one_crypto` at Performance stage, and a high-impact event sits inside ±5 minutes of now | 9185497 |

**Tradability is not on this line.** The Size row already renders it in one
word, and §17f forbids saying it twice. The single tradability fact the Size
row cannot carry is clause 1 — that changing program will not help — and
that is why clause 1 exists and nothing else about tradability does.

**`Front month only` is the one always-on clause, and it earns that.** E8
requires the front month and warns that trading another month "may also
result in termination of your account or deduction of profit", publishes no
roll calendar, offers only "trade whichever has the highest Volume", and
performs no forced flatten or roll — there is no automated safety net, as
the futures dossier states plainly. Levelflow's symbol is `ESUSD`: it names
no month at all, and FMP's continuous series is not a tradable contract. The
surface actively hides the fact, the consequence is account-ending, and E8
provides no protection. This is a warning, not a caption.

**`News window` is a timing fact and must not become a claim about E8's
list.** E8 publishes a "List of targeted instruments T1 News Events" as an
embedded image that no fetch method recovered as text, so Levelflow cannot
know whether this market is on E8's list. The clause fires on Levelflow's own
high-impact classification (the existing `news_context` the analyzer already
attaches) and says only that a window is open — never that E8 restricts this
market. `Restricted` and `Prohibited` are banned on this line for exactly
that reason.

The line's treatment is the ladder's existing quiet-note treatment — the same
`text-xs text-ink-muted` rhythm the §7 instruction and the correlation line
use, no icon, no color, no box. Severity is carried by ordering, not by
decoration; a red line on a setup card would read as an error the setup does
not have.

### §20d. The program-facts block

Inside ProfilePanel's existing **Broker** row, below the five §19b
selectors, as `ProfileDetailRow` pairs — label left, value right, capped at
the mock's 520px, no card, no hairlines of its own. The Broker row already
exists and already has its approved description; this is content inside it,
not a new section.

Rendered only when a program is selected. With `None`, the Broker row is
exactly the chip it is today.

Rows, in this order, for the selected `(program_line, size, stage, tier)`.
The value column is the row's **complete domain**, not an example — every
literal this block can render is here.

| Label | Value domain | Source |
|---|---|---|
| `Daily loss` | `${amount} · Daily Drawdown` · `2% · Daily Pause` · `None` | 11769446, 11969807, 13106558 |
| `Max drawdown` | `${amount} · Dynamic Drawdown` · `${amount} · EOD Dynamic Drawdown` · `${amount} · Static Drawdown` · `Not published` | 11782996, 11864596, 13653031 |
| `Profit target` | `${amount}` | product page per line |
| `Position cap` | `{n} contracts` · `{n} lots` | 10155917, 9453396 |
| `Scaling` | `1.5% locked → {n} · 3% locked → {n}` | 10155917 |
| `Consistency` | `None` · `35% best day` · `40% best day` · `40% of profit target` | 9453418, 11755943, 11865587, 15936479 |
| `News` | `Unrestricted` · `±5 min blackout` | 9185497, 10209321 |
| `Flatten` | `None` · `15:10 CT daily` · `23:00 server nightly` | 13001922, 11755943, 5514966 |

Value grammar, pinned: a dollar amount is comma-grouped without cents; a rule
name follows the value after ` · ` (whether that value is an amount or a
percent — `Daily loss` on the Signature lines is the percent case); a
percentage carries its `%`; a count carries its unit. **The rule names are E8's own product names, reproduced
exactly** — `Daily Drawdown`, `Daily Pause`, `Dynamic Drawdown`,
`EOD Dynamic Drawdown`, `Static Drawdown` — even where the label already
carries a word of them. Shortening `EOD Dynamic Drawdown` to `EOD Dynamic`
would save a word and cost the user the search term that finds E8's own
article; these are terms of art, not prose.

`Profit target` is always a dollar amount, never a percentage: size and tier
are both known, so the percentage is arithmetic the block can do for the
reader rather than make them do. `Consistency`'s two 40% forms are different
mechanics with different denominators and must not be collapsed — Zero's
Challenge rule measures against the fixed profit target, One's Performance
rule against total generated profit (§20b). `Scaling` renders only on
`zero_futures_*` at Performance, where the cap Levelflow asserts is the
starting one — publishing the table is how the block stays honest about a cap
that moves with locked profit it cannot see.

Rows whose fact does not exist for the selected program are absent, not
empty. `zero` has no daily loss limit, so `Daily loss` reads **`None`** —
E8's comparison table says "No", and that is a published fact, materially
different from an unpublished one. Rows whose fact is unpublished render
§20f's word.

**One value was pinned to a conflict; the owner's canon closed it.** On
`signature_forex`, `signature_crypto` and `signature_futures`, **at
Performance stage only**, `Daily loss` renders **`2% · Daily Pause`** — the
rule's own invariant, not a conditional dollar. The canon (§20b) states the
basis: "A soft daily loss limit based on your starting balance of the day."
The limit recalculates every day, so the two pages that appeared to disagree
do not: 11969807's "never changes during the account's life" describes the 2%
rule, not a frozen dollar figure, and the payout FAQ's "calculated from your
new balance" (15272556) is that same daily recalculation observed after a
payout. There is no branch left to pick.

**The percent form, and why this row alone carries one.** The dollar amount
depends on the day's starting balance, which Levelflow cannot see; a
tier-derived dollar is exact only on a day the account starts at its tier and
**overstates the real pause line on every day below it** — the direction §20a
forbids, because a user reads a loss limit as headroom. The percent is exactly
true on every day of the account's life. `signature_futures`' published
amounts — $500 / $1,000 / $2,000 / $3,000 at the four tiers (11864618), which
are 2% of 25K/50K/100K/150K exactly — stay in the rulebook data as the
arithmetic corroborating itself, and CI pins that identity; they are not
rendered.

At Challenge stage the row is absent, because Daily Pause does not apply
there at all (11969807's own scope line). That is unchanged.

Provenance is carried in the data on every value and is not rendered.
Article IDs on a settings sheet would be furniture; CI is where provenance
is checked.

### §20e. The two-clock model

**Two clocks govern an E8 account and they do not share a DST calendar.**
Getting this wrong is how a governor tells a user they have hours left while
E8 is flattening.

*Server time* is E8's own broker clock: "Currently, the server time is set
to UTC + 3", "changed to UTC + 2 at the beginning of November and to UTC + 3
at the end of March" (10305202, identical on both help subdomains). It
governs the Signature nightly flatten at 23:00 with reopen at 00:15, the
Daily Pause reset at 00:00, the Daily Drawdown reset at 00:00 "based on the
balance at market rollover" (11769446), and the Daily Profit Cap clawback
between 00:00 and 01:00 (15319043).

*CT* governs the futures session: 17:00–15:10 with all open positions
force-closed daily at 15:10, and 19:00–13:20 for the CBOT commodity group
(13001922).

Server time switches at the beginning of November and the end of March. CT
switches on the US calendar — second Sunday of March, first Sunday of
November. The offset between them drifts, and the drift is not one day.

**The implementation.** Two independent clock functions, neither derived
from the other, neither derived from the browser's timezone.
`serverTime(instant)` is UTC+3 from the end of March through October 31 and
UTC+2 from November 1 through the end of March, taking E8's words literally
because E8's words are all there is — the exact day of month is NOT
PUBLISHED, and the EU calendar's last-Sunday-of-October contradicts E8's own
"beginning of November" by a week.

**During the two ambiguous windows — March 25–31 and October 25 through
November 1 — every server-clock-derived clause is suppressed rather than
guessed.** Clause 5 goes quiet for roughly eight days a year. That is the
same refusal §20f applies to an unpublished number, applied to an
unpublished date: a flatten warning that is an hour wrong is worse than no
flatten warning, because the user acts on it.

CT needs no such hedge — the US DST calendar is fixed and public, and
`marketHours` already models the CME complex.

**Levelflow's own calendar is not changed in wave 1.** `marketHours`
continues to show a futures market open through 16:00 CT while E8 Signature
and E8 Zero are flat from 15:10 CT, and to show crypto always open while
Signature Crypto flattens nightly at 23:00 server. The divergence is
surfaced by clauses 4 and 5 only. Account-scoped market visibility by
classification **shipped** in the §19 retrofit Phase 4 (amendment 13),
2026-08-04 (§19h, §20h). The piece that remains V2: a calendar that greys
the scope menu by the selected program's *session*, not the asset class's
— a distinct dimension amendment 13 does not touch.

### §20f. Unconfirmed discipline

**The governor visibly refuses to compute what the sources do not publish.**
One word, everywhere a rulebook fact is missing:

> **`Not published`**

Same string as §19e's, same meaning — E8 does not publish it — and one word
across both sections is one thing for a reader to learn. It never appears as
a dash, never as an empty row, never as a plausible number with a footnote.

**The genuinely open items, and what each one costs.** Two entries below are
marked CLOSED and kept rather than deleted — the post-payout Daily Pause
question (owner canon, 2026-08-02) and the CFD lot step (verified on the live
platform, 2026-08-02). A reader who arrives with either question should find
the answer where the question used to live.

- **E8 Zero's drawdown percentage.** The *type* is now corrected and
  confirmed — E8 Zero is named in the EOD Dynamic Drawdown article's own
  applicability list (11864596), not the Static Drawdown article's, which
  makes the dossier's earlier "Static drawdown applies" characterization
  wrong about the mechanism and not merely the number. The number itself is
  NOT PUBLISHED. *Consequence:* on `zero`, `Max drawdown` renders
  `Not published`; the program's only loss guardrail is therefore
  unquantified for the one line that has no daily limit either, so a `zero`
  user sees a facts block with no loss number in it at all. This does not
  block §19 sizing — the drawdown is not a sizing input. Zero **Futures** is
  unaffected: 3% is published on its own page (15935817).
- **Payout-cap amounts, Signature Forex and Signature Crypto.** The
  articles state that caps exist and defer the figures elsewhere (11755943,
  11864571). Signature Futures' caps by payout number and Zero Futures'
  caps by size are both published in full. *Consequence:* the payout facts
  those two lines would show are unavailable; V1 renders no payout rows at
  all (they need telemetry), so the cost is deferred to V2, where those two
  lines will show `Not published` where the other eight show a table.
- **Post-payout Daily Pause behaviour — CLOSED, owner canon 2026-08-02.**
  The apparent contradiction between 11969807 ("never changes during the
  account's life") and the payout FAQ (15272556, "calculated from your new
  balance") dissolves once the basis is stated: the limit is 2% of the day's
  starting balance and recalculates daily, so both pages describe the same
  mechanism. *Consequence:* on the three Signature lines at Performance
  stage, `Daily loss` renders **`2% · Daily Pause`** (§20d) — the percent,
  because the dollar depends on a balance Levelflow cannot see. This was the
  one place where a fully published number was withheld because a second page
  disputed the condition under which it holds, and that case is now closed.
  `6J` stays withheld, but on arithmetic E8's own table cannot reconcile
  rather than on a disputed condition (§19a) — a different kind of silence,
  and Appendix A's queue is where it gets resolved.
- **Which condition unlocks the higher payout split** — 100% on Zero and
  Pro, 90%/100% on One — is NOT PUBLISHED on any page, and the futures
  dossier confirms the gap is systemic across every multi-tier product
  rather than a Zero-specific omission. *Consequence:* V1 renders no payout
  split. It is not a sizing or compliance input.
- **E8's T1 targeted-instrument list** is an embedded image, NOT RECOVERED
  as text. *Consequence:* §20c's news clause is a timing fact, never a claim
  about E8's list.
- **E8 One's preset drawdown pair.** 11775980 states the Challenge preset as
  3% daily / 4% dynamic; 8880316's price table states the priced preset as
  4% daily / 6% dynamic. Both [PRIMARY], not previously logged as a
  contradiction. *Consequence:* Levelflow assumes neither — this is what the
  §19b Drawdown selector is for, and with no tier selected the two drawdown
  rows render `Not published`.
- **The CFD minimum lot step** is NOT PUBLISHED by E8 and is **no longer
  open**: verified at 0.01 on the owner's live E8 Pro Forex TradeLocker
  account, 2026-08-02 (§19c, Appendix A). *Consequence:* none on the 28 forex
  pairs. `XAUUSD`'s per-instrument minimum is the residual, and it is queued,
  not guessed.
- **In-platform order-entry ticker strings** are NOT PUBLISHED for every
  asset class. *Consequence:* no surface renders an E8 symbol (§19a).

Two more E8-internal inconsistencies are recorded and cost nothing in V1,
because V1 has no telemetry to apply them to: 11782996's own worked
progression shows a closed profit not moving the loss level in one row while
its definition says it does, and Zero's $50K Performance contract ceiling
exceeds its $50K Challenge cap.

### §20g. Testing law

**`tests/programRulebook.test.ts`** pins the §20b table cell by cell against
its article ID, in the `calibrationState` shape — a literal expectation
object, one `it` per program line. Structural assertions:

- Every rule's `severity` matches the consequence its article publishes:
  the four drawdown kinds `terminates`, Daily Pause `pauses`, Daily Profit
  Cap and the news window `claws_back`, consistency `gates_payout`.
- Every rule's `stages` matches its article's scope line — Daily Pause
  Performance-only on the three Signature lines; Zero's 40% Challenge-only;
  Signature's 35% Performance-only; the news restriction Performance-only on
  `one` and `one_crypto` and absent everywhere else.
- Every unresolved cell is null and resolves to `Not published`. E8 Zero's
  drawdown percentage is asserted null **by name** — a future change that
  fills it in must be a deliberate one with a source.
- `zero`'s daily loss is `None`, not null: a published absence is not a gap.
- The three Signature lines resolve `Daily loss` to **`2% · Daily Pause`** at
  Performance and to absent at Challenge, asserted per line. Two assertions
  ride with it: no tier-derived dollar reaches that row on any line or size
  (the §20d percent ruling as CI), and `signature_futures`' published
  $500/$1,000/$2,000/$3,000 equals 2% of each of its four tiers — data, pinned
  and unrendered — so no later edit can introduce an amount that is not 2% of
  the tier, and none can restore `Not confirmed` without deleting an owner
  canon.
- Per-size amount tables are complete for every size in the program's
  ladder, or null for the whole table. No partial map.

**`tests/complianceLine.test.ts`** pins the six clause strings verbatim, the
severity ordering, the three-clause maximum, that no clause renders without
a program, and that an all-inactive evaluation produces no element. Trigger
tests use injected instants, never `Date.now()`.

**`tests/brokerClocks.test.ts`** pins both clocks at boundary instants: server
time UTC+3 in July and UTC+2 in December; the 23:00-server flatten proximity
computed correctly on both sides of each switch; the 15:10 CT flatten across
the US DST changeover; and — the assertion that matters — **every
server-derived clause suppressed inside March 25–31 and October 25–November
1**. Plus one test that the two clocks' offset genuinely differs between
the two changeover dates, which is the whole reason there are two.

**Composition guards** per §16/§17, both directions: the compliance line
present under the ladder with the ladder's own quiet treatment and absent
with `None`; the program-facts block inside the existing Broker row and
absent with `None`; no card, border or icon on either; no second Broker
section. languageGuard gains `Restricted` and `Prohibited` as banned on the
compliance line, and the §19f additions already cover the hedge words.

**e2e**, 375px and 1280px, authed: with a program selected, the compliance
line is present and the Broker row shows the facts block; with `None`,
neither element exists. Exact locators.

### §20h. V2, and the data it requires

**Daily-budget tracking against live account state is out of scope for V1.**
"You have $1,340 of today's $2,000 pause line left", "3 of 5 profitable
days", "your EOD floor sits at $98,000", "you are 2 contracts under your
scaled cap" — every one of those needs data Levelflow does not have.

**The data requirement, stated precisely.** V2 needs, per funded account, at
minimum: the account's initial balance and current balance; current equity;
today's realized and floating P&L against the server-time day boundary; the
open-position set with sizes; the highest closed balance and the highest
end-of-day balance; the payout count and the date of the first payout; and,
on Zero Futures Performance, the locked-profit figure that drives contract
scaling. E8 publishes no API and Levelflow holds no credentials, so the only
routes are a user-supplied read-only export, a manual entry surface, or an
E8 integration that does not exist. Until one of those is real, V2 is not
buildable and no amount of engineering makes it so.

Program-aware market availability in the scope menu **shipped** in the §19
retrofit Phase 4 (amendment 13), 2026-08-04 — no longer V2 (a
session-hours calendar per §20e is the distinct piece still open). Also
V2: payout-readiness facts; the Best Day denominators evaluated against a
real profit history; and the account-reset economics (11640147 — a 10%
discount, same size and settings only, valid for 7 days after failure) as a
bankroll-continuity input.

---

## §20i. Rulings of record (controller, 2026-08-02)

Six questions were raised at draft and answered before promotion; later
rulings append as they land. Recorded here so a later reader sees what was
decided rather than re-deciding it.

1. **The bridging method generalizes.** Applying E8's published bridging
   method to the 15 crosses its table does not enumerate is derivation, not
   invention — the article states the method and instructs that pip value be
   derived. Method-derived values carry `derived (method: 9453396)`, distinct
   from `[PRIMARY]`; the method is E8's and only Levelflow's own in-roster
   quotes feed it. 29 sizeable CFD markets, not 14. (§19a rule 1, §19c.)
2. **The CFD step is 0.01 lots — verified, superseding the UNCONFIRMED mark
   this ruling originally carried.** The draft reasoned to 0.01 and marked it
   unconfirmed, with the consequence stated: a sub-0.1-lot size may fall under
   the platform's own minimum and be refused at order entry — a rejected
   order, never an account breach. The owner then confirmed the step on the
   live platform (E8 Pro Forex, TradeLocker, 2026-08-02): "On forex accounts,
   I can confirm the smallest is 0.01." It carries `tag: "verified"`, and the
   refused-at-order-entry hedge is retired on the forex pairs. (§19a, §19c,
   Appendix A.)
3. **SUPERSEDED by owner canon, 2026-08-02.** As drafted, this ruling
   withheld Signature's `Daily loss` at Performance as `Not confirmed`, on the
   reasoning that the 11969807-vs-15272556 conflict is what the unconfirmed
   discipline is for and that Levelflow cannot know whether a payout occurred.
   The owner's canonical definition names the basis — "based on your starting
   balance of the day" — which recalculates daily and reconciles both pages.
   The row renders **`2% · Daily Pause`**: the percent, since the dollar
   depends on a balance Levelflow cannot see (controller, 2026-08-02).
   (§20b, §20d, §20f.)
4. **Both profile columns approved** — `broker_stage` and
   `broker_drawdown_tier`, domains per program line in §19g.
5. **No external contract notional.** The boundary at the head of this
   document is the ruling: no number that is not E8-published, derived by
   E8's published method from Levelflow's own data, or observed on E8's own
   live platform (the third route, added 2026-08-02 — it admits the broker's
   platform, never the exchange's spec sheet). `6J` stays `unconfirmed` on the
   $125,000-against-$125,000,000 arithmetic; the inversion machinery ships
   property-tested awaiting confirmed data, and Appendix A item 6 is its
   route. (§19a.)
6. **Ten program lines** — the researched set less E8 Classic and E8 Track.
   Ground UPDATED by the owner, 2026-08-02: "Classic and Track are no longer
   offered by E8." Discontinued, not under-evidenced — so the draft's
   "re-enter only behind fresh primary research" path does not exist; a future
   reappearance is a new product. (§19b.)
7. **The catalog is static and predefined** (owner, 2026-08-02, verbatim):
   "Now you should be able to properly configure the different E8 account
   setups. These should be presented as static, predefined options for the
   user when the pillar build plan gets to a point that requires it as a
   feature." The Profile's broker configuration therefore presents E8's REAL
   catalog and nothing else: market → program line → balance tier →
   drawdown-pair token where E8 sells a choice (the futures lines' single
   EOD option is auto-set, never asked). The option sets are transcribed
   from the verified purchase-screen record
   (`docs/research/e8-purchase-screen-2026-08-02.md`) — all three market
   walks, twenty-nine frames. No free-form numeric entry exists anywhere in
   the configuration, and no selectable combination may exist that the
   checkout does not sell. Binds the §19 retrofit and the §20 build. (§19b,
   §20b.)
8. **The feed is verified and locked** (owner, 2026-08-02, verbatim): "Good!
   Confirm we are using the right source, and lock it in for E8. Right
   safeguards so we cannot possibly regress. Once we have the workflow down,
   I will send other screenshots for the same treatment." And: "Remember,
   this is E8 Pro Forex. That is important to keep track of." FMP is the
   codebase's sole price provider, and its correspondence to E8's live feed
   is established frame-by-frame against the platform's own book — same
   second, inside the quoted spread — per the protocol and running sample
   table in `docs/research/e8-feed-verification-2026-08-02.md` (F1:
   EURNZD and XAUUSD confirmed sub-spread on E8 Pro Forex, TradeLocker).
   Every sample carries its platform and program line; identity is never
   assumed across platforms. The wiring — provider, base URL, endpoint
   family, symbol map, and the calendar-only Finnhub allowance — is pinned
   by `tests/feedSource.test.ts`, so no source change ships without a fresh
   verified frame. (§19a's quote roster, §19c's price inputs.)

## §20j. Every rendered string

The §17f pinning surface, in one place, so a guard author can check
completeness without reading the spec. Every string below is rendered
verbatim; nothing else this feature draws is text.

**§19 — the ladder Size row.** `Size · lots` · `Size · contracts` ·
`Not offered` · `Not confirmed` · `Not published` · `Rate unavailable`.

**§19 — the Profile Broker controls.** Labels: `Market` · `Program` ·
`Platform` · `Account size` · `Stage` · `Risk per trade` · `Drawdown`.
Program options: `E8 One` · `E8 One Crypto` · `E8 Pro Forex` ·
`E8 Pro Crypto` · `E8 Signature Forex` ·
`E8 Signature Crypto` · `E8 Signature Futures` · `E8 Zero` ·
`E8 Zero Futures Starter` · `E8 Zero Futures Max`. Stage options:
`Challenge` · `Performance`. Account-size options: the selected program's
ladder as `$5,000` … `$500,000`. Risk options: `0.10%` … `1.50%` in `0.05%`
steps. Drawdown options: the eight paired tokens in §19b item 5. Market
options: `Forex` · `Crypto` · `Futures`. Platform options: `TradeLocker` ·
`MatchTrader` · `Tradovate`. `None` retired with the single-selection walk it
was the sentinel for (§19 retrofit, Task 4): the catalog walk that replaced
it always names a complete account, so nothing renders the word any more.

**§19 retrofit — the confirmed-accounts list (owner copy of 2026-08-03;
owner-APPROVED 2026-08-04).** Each saved account's row carries, on the
active row only, `Active`, and every row carries a `Remove` control. The
walk's own submit control is `Add account`. `Manage accounts` is
registered here ahead of task 7's own chip menu, which has not shipped
yet. The owner reviewed all of this section's pending vocabulary on
2026-08-04 ("Everything in 1. is fine") — the pending caveats below are
resolved approvals now.

**Owner findings wave (2026-08-04) — the rename control.** Every saved
account's row also carries `Rename` (the owner's explicit choice between
a labeled control and click-to-edit): it swaps the row's label for an
inline field capped at the TASK 6 VERDICT's measured 14, Enter/blur
commit, Escape leaves, an empty commit clears the rename and the piped
formula labels the account again. The same word is the field's
`aria-label`, so one registry entry covers the surface. Owner-APPROVED
at ruling time — never pending.

**§19 retrofit — the switcher sheet's pinned head (owner copy of
2026-08-04, Task 7's fix round).** The <lg sheet's header renders
`Accounts` as its visible, `aria-labelledby`-linked title — every other
§17g/dialog sheet in this codebase already names itself in its pinned head
(ScopeMenu's own `label` prop, `ExpandedChartOverlay`'s title), and the
switcher's first ship had been the one exception, carrying a hard-coded
`aria-label` instead. Ships as written — this task's proposal — pending
the owner's ruling on the wording, the same caveat the four words above
carry.

**§20 — the compliance line.** `No E8 route on any program` ·
`Front month only` · `Size capped at the program limit` · `Flatten 15:10 CT` ·
`Flatten 23:00 server` · `News window`. Separator ` · `, three clauses
maximum.

**§20 — the program-facts block.** Labels: `Daily loss` · `Max drawdown` ·
`Profit target` · `Position cap` · `Scaling` · `Consistency` · `News` ·
`Flatten`. Value literals, complete: `None` · `Not published` ·
`Unrestricted` · `±5 min blackout` · `35% best day` · `40% best day` ·
`40% of profit target` · `15:10 CT daily` · `23:00 server nightly` · the five
E8 rule names (`Daily Drawdown` · `Daily Pause` · `Dynamic Drawdown` ·
`EOD Dynamic Drawdown` · `Static Drawdown`) · and the five numeric forms
`${amount}` · `2% · Daily Pause` · `{n} contracts` · `{n} lots` ·
`1.5% locked → {n} · 3% locked → {n}`.

**`Not confirmed` is a §19 string only.** It renders in the Size row, where
tradability still produces it, and it is **not** in the facts block's domain:
the one row that reached it — Signature `Daily loss` at Performance — renders
`2% · Daily Pause` since the owner canon closed that conflict (§20d, §20i
ruling 3). §20j is checked in both directions, so the string's absence here is
as load-bearing as its presence there; restoring it to the facts block
requires a named, reachable trigger.

**Nothing else.** No heading, no eyebrow, no description, no caption, no
tooltip, no empty state, no error string. The Broker row's existing approved
description ("Markets, costs, and record follow the broker.") is unchanged and
the ladder's existing copy is untouched — this feature adds rows and words to
surfaces that already have their sentences.

---

## Appendix A. The standing empirical program (owner offer of record, 2026-08-02)

Wave 1 refuses to answer wherever E8's pages stop. This appendix is how that
silence gets resolved without loosening the boundary: the owner holds live E8
accounts, and what the platform shows the account holder is admissible as
`verified` provenance (§19a, and the preamble's third route).

**What the owner offers.**

- **Per-asset manual trades on TradeLocker, live E8 Pro Forex** — a small
  trade on a named instrument, reporting the platform's own risk and reward
  per lot. That single figure is the thing §19c Step 3 derives, so an
  observation either confirms the derivation or falsifies it.
- **An E8 futures account, to be purchased** — verifying account options (the
  ladder and the drawdown tiers as sold), tradable assets (the instrument list
  as the platform lists it), and trade calculations (tick value per contract as
  the ticket computes it).

**How an observation becomes data.** It is recorded as an `Observation` (§19a)
with its date, platform and live program, attached to the specific
`(broker, program_line, levelflow_symbol)` value it establishes, and pinned in
`tests/brokerReference.test.ts` in the same change set — the same discipline
every other broker number already lives under. An observation upgrades the row
it names and no other. It never generalises across instruments, across program
lines, or from one asset class to another. Where an observation contradicts an
E8-published value, both are recorded, the contradiction is stated in the row's
comment, and the spec names the reading it takes — the §20b habit, applied to a
new kind of source.

**The queue, highest value first.** Ordered by what each observation unblocks,
and every item names the section it closes.

1. **`XAUUSD`'s minimum lot** — the residual scope of the verified 0.01 step on
   the one non-forex market wave 1 can size (§19c Step 7). One glance at the
   order ticket. **Still open, 2026-08-04.** Batch 1 confirmed a different,
   adjacent fact — gold's own contract size, 100 oz, tick 0.01 = $1 — not the
   minimum lot increment below 1.00 this item asks for; a reader should not
   strike this item on the strength of that observation.
2. **Risk per lot on one USD-quoted pair, one JPY-quoted pair and one cross** —
   verifies `perUnit = contractSize × usdPerQuote` at all three shapes: the
   textbook $10/pip case, the `1 / USDJPY` derivation, and a bridged cross.
   Three observations validate the derivation behind all 28 forex pairs, which
   with item 1 is the whole sizeable CFD set (§19c Step 3, §20i ruling 1).
   **CLOSED, 2026-08-04.** Batches 3 and 4 observed all 28 pairs, and the
   class formulas agree to the cent: USD-quoted $1.00/tick flat; CHF-quoted
   10 CHF ÷ USDCHF 0.80725 = $12.388/pip; CAD-quoted 10 CAD ÷ USDCAD 1.40152 =
   $7.135/pip; JPY-quoted ¥1,000 ÷ USDJPY 157.822 = $6.336/pip. Margin =
   base-currency notional ÷ 30 on all twenty of batch 3.
3. **`SP500`'s per-point value on a live ticket** — the map's single largest
   scale trap ($20/point where retail desks quote $1–$10; §19a rule 3, §19f's
   SP500 property test). A published number, worth watching once. **CLOSED,
   2026-08-04.** Batch 1: `SP.C` tick 0.01 = $0.20, so $20 per 1.00 point —
   the scale trap is verified, not merely assumed.
4. **The unpublished contract sizes** — every crypto symbol, silver on the
   Markets side, the energies class. These are the rows blocked purely on E8's
   silence (§19c, "What is sizeable in wave 1"), and each one an observation
   resolves is a market that moves from `Not published` to a number.
   **CLOSED for the CFD universe, 2026-08-04** (amendment 12, batches 1–2 of
   `docs/research/e8-observations-2026-08-02.md`). All eight crypto, silver,
   and both energies now carry observed contract sizes. Silver on the Markets
   side (`XAGUSD`) is done; the Futures-side `SIUSD` row is not touched by
   this fold — it was already `confirmed` from E8's own published tick table
   and was never this item's concern, so it stays exactly as it was. On the
   CFD lines' scannable tally this closes `not_published` 10 → 0: `XAGUSD`,
   `WTI`, `BRENT` and the seven scannable crypto rows (`ADAUSD`, `BCHUSD`,
   `BTCUSD`, `ETHUSD`, `LTCUSD`, `SOLUSD`, `XRPUSD`), pinned in
   `tests/brokerReference.test.ts`; the eighth crypto symbol, `BNBUSD`, is
   confirmed the same way but stays outside every tally as one of the nine
   non-scannable addendum rows, never sizeable regardless of tradability.
   **Correction of record:** `RTYUSD`, `ZBUSD`, `ZNUSD`, `BZUSD` and the
   CFD-side `SIUSD` row were never part of this item's count — all five are
   `not_offered` (Futures-classified, outside the CFD universe this item
   scopes, never a documentation gap), not `not_published`. This is a
   pre-existing spec mislabel that this same fold corrected (Task 13), not a
   row this item ever queued. The fold also stays narrow by amendment 19
   clause 3 ("the narrow reading of contract-size adjacency stands" — owner,
   2026-08-03, settled and not an open question): these same eight crypto
   symbols' contract sizes remain `not_published` on the Crypto-classification
   lines (`one_crypto`, `pro_crypto`, `signature_crypto`), untouched by this
   item, pending their own account (amendment 15).
5. **On the futures account: `ZB` and `ZN`** — tick size and value, absent from
   the fee table, the tick table, the canonical 45-instrument list and the live
   symbol browser. Their absence is why both rows ship `unconfirmed` (§19a).
6. **On the futures account: `6J`'s tick and value as the platform computes
   them** — the one number the boundary explicitly refused to fix with an
   exchange notional (§20i ruling 5). E8's own table gives `6J` a derived
   $125,000,000 per price unit against its siblings' $125,000, and no published
   source reconciles it. A live ticket does. This is the item that turns the
   inversion machinery from property-tested-and-unused into shipped — and it is
   the clearest case in either section for why the third route exists.
7. **The purchase screen's drawdown tier matrix** — §20b's input contract, on
   both the forex and futures sides. **CLOSED on all three markets,
   2026-08-04** by `docs/research/e8-purchase-screen-2026-08-02.md` (thirteen
   Forex frames, eleven Crypto frames, five Futures frames, read in full);
   landed in code by Task 12's `Valued<string[]>` `drawdownTiers` on every
   program line. `one`/`pro_forex` carry the observed tier array; Signature,
   Zero and the futures lines carry `null` because their own walks show no
   customization to select among, not because the question went unanswered.
8. **The futures-account purchase itself** — the ladder and drawdown tiers as
   sold, the tradable-asset list as the platform lists it, and tick value per
   contract as the ticket computes it (amendment 15's Futures-second
   sequence). The owner's second offer above, made concrete as a queue entry:
   items 5 and 6 are two of its instrument-level blockers, already queued;
   this item is the account-level walk neither one alone covers.

**What the program does not change.** The refusal stays the default: a row
without a published or verified value renders its word (§19e, §20f), and no row
is promoted in anticipation of an observation. Nothing is ever inferred from an
observation's neighbourhood. And the program is the owner's to run — the spec
records the offer and the queue; it does not schedule the owner.
