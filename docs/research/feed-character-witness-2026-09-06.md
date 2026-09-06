# The feed-character witness — daily containment across the cache (2026-09-06)

**Status: the instrument ships; the finding it mechanises is measured and
NOT yet refuted.** A refuter round on the finding (`feed-window-round-2026-09-06.js`)
follows the banked-share round; until it lands, nothing here condemns a
verdict. What this change set does is make the fact visible on every
store, every year, by a witness that reproduces the decided cases before
it speaks on an open one.

## 1. The finding, as measured

On the act-3 corpus of record and the calibration cache, on 2026-09-06:

- Forex baseline tuning-fold rows step in one month, 2020-12 → 2021-01:
  stop_loss 28.1% → 16.5%, tp1_partial 61.6% → 75.9%, take_profit 4.04% →
  1.53%, median atr/dailyAtr 0.091 → 0.144, median hold 0.83 h → 0.42 h,
  after twelve years at stop 23–26% / take-profit 2.3–3.2%. Metals and crypto
  show no such step (`docs/research/r3/forex-mix-by-month-2026-09-06.log`,
  `metals-mix-by-year-2026-09-06.log`, `crypto-mix-by-year-2026-09-06.log`).
- In the cache, the median over days of (mean 5-minute bar range / the daily
  store's range) is 0.052–0.066 for every forex store 2009–2020 and 2025–26,
  and 0.07–0.30 for 2021–2024; the cross-pair median runs 0.058 → 0.113 /
  0.098 / 0.108 / 0.073 → 0.057. In those years the 5-minute-derived daily
  range EXCEEDS the daily store's own range — AUDNZD by 35–120%, NZDCHF and
  AUDCHF by 15–20%, the USD majors by 1–6% — and in every other year the two
  agree to three decimals. Bar counts per day never change. XAUUSD, ESUSD and
  CLUSD show no window (`docs/research/r3/forex-feed-character-2026-09-06.log`,
  `feed-character-all-2026-09-06.log`).
- The money sits exactly there: forex's select-fold R at the shipped ladder is
  −1,314 R for 2018–2020 and +2,918 R for 2021–2022H1; crosses go from
  −0.019 to +0.136 R per fill, USD majors from −0.037 to +0.085
  (`forex-majors-vs-crosses-2026-09-06.log`). The banked-fraction slope
  R(0) − R(½) collapses in the same months, +0.016–0.021 R per fill every
  year 2009–2020 to +0.002–0.004 in 2021–22 (`forex-slope-by-year-2026-09-06.log`).

A 5-minute series whose range exceeds the same day's daily bar by a third for
three years is not a market; the daily store and the intraday store disagree
about the same days. Whether it is FMP's upstream feed for those years, and
what it does to every forex verdict — act 3's cost-cap confirmation, "forex
the only net-positive class", the class calibration, the banked-share
expectation — is the refuter round's question. The forex per-class folds put
the select fold's last 17 months and about 60% of the confirm fold inside the
window; the live desk trades 2025–26 bars, which are outside it.

## 2. The instrument

`scripts/feedCharacter.ts` — `dailyContainment(intraday, daily)`, the same
principle as `gridRegistration` one tier up: a daily bar is the parent of
every intraday bar on its day, so the intraday series' range over a day
cannot exceed the daily bar's. Per UTC day that both series carry (daily
range > 0, at least 20 intraday bars) it takes the range ratio and the
mean-bar-range ratio; per year it records the days judged, the medians, and
the day-grain escape and under shares at a 3% tolerance.

The day-grain shares are facts, not the verdict: the intraday day is keyed
to the UTC calendar day while a venue's daily bar keeps its own day, so
10–15% of clean forex days escape by a session's edge in every year and the
crypto stores read a systematic offset (`feed-character-all-2026-09-06.log`).
A share cannot separate a feed defect from a keying edge; the medians can.
The verdict is drift of a year's medians against the store's own baseline —
the median across its years, which a three-year window inside a
seventeen-year store cannot move — plus one absolute clause:

| clause | constant | what it names |
|---|---|---|
| range drift | `RANGE_DRIFT_LIMIT` 0.02 | the year's median range ratio at least 2% of the daily range above the baseline |
| bar-range drift | `BAR_RANGE_DRIFT_LIMIT` 0.25 | the year's median bar-range ratio at least 25% above the baseline |
| absolute | `ABSOLUTE_RANGE_RATIO_LIMIT` 1.30 | a child series 30% outside its parent, whatever the baseline — a store contaminated in every year it carries |

`scripts/feed-character.ts` runs it over a cache (`--cache-dir`, `--symbols
roster|A,B`, `--timeframes 5min[,15min]`), names absent stores as ABSENT in
the table and the summary rather than skipping them, and under
`--fail-on-escape` exits non-zero — the form a preflight or a gate calls.
The tracked output over the real cache is `docs/research/r3/feed-character.txt`.

Tests: `tests/feedCharacter.test.ts`, ten cases hand-computed from synthetic
stores, including the decided cases in shape (a contaminated cross year
escapes by range drift and the absolute clause; a clean major year is
contained at exactly 1.000) and the reader's absent-store behaviour. Eleven
guard mutations, each landed by blob hash, killed by the case written for it
and reverted: each of the three limits disabled, thin days judged, the
baseline taken as a mean, the escape share not counted, days keyed off by
one, the unjudgeable guard disabled, absent stores skipped in silence, and
`--fail-on-escape` ignored. A twelfth mutation survived — a second empty-series
guard ahead of the judged-days count — and was removed as the dead code it
was, so the one guard left is the one the tests kill.

## 3. What the witness says about the cache

Over the corpus's 97 markets, both intraday tiers (194 stores;
`docs/research/r3/feed-character.txt`): **104 stores escape, 87 are contained,
3 are unjudgeable** (GFUSX, HEUSX, LEUSX at 15 minutes — livestock's thin
sessions leave no day with twenty parents). By class:

| class | markets | stores escaping | years named |
|---|---|---|---|
| forex | 28 | 54 of 56 (every pair, both tiers except GBPUSD and USDJPY at 15 min) | 2021 ×54, 2022 ×50, 2023 ×51, 2024 ×31; AUDNZD also 2009–2010 |
| crypto | 33 | 42 stores on 23 markets | 2017 ×20, 2018 ×26, 2019 ×26, 2020 ×27 — an older window, BTCUSD/ETHUSD/LTCUSD/BCHUSD/XRPUSD/DASHUSD/TRXUSD/XMRUSD/XTZUSD from 2016–17 through 2020; a few 2021–24 (ALGOUSD, DOTUSD, EGLDUSD, NEARUSD) and 2026 (BNBUSD, CAKEUSD, DYDXUSD) |
| futures | 18 | 4 (HOUSD, RBUSD, both tiers) | 2025, 2026 — the live years, by range drift (HOUSD 5-min range ratio 1.082 → 1.286 against a 1.036 baseline) |
| indices | 6 | 2 (ASX, both tiers) | 2024, 2025 |
| livestock | 3 | 2 (GFUSX, LEUSX at 5 min) | 2023 |
| metals, energies (CLUSD), agriculture | 2 / 1 / 6 | 0 | — |

The forex window reads exactly as measured by hand: EURUSD 5-min baseline
range 1.000 / bar 0.0540 over 4,426 days, then 2021 range 1.019 bar 0.0818,
2022 1.008 / 0.0707, 2023 1.016 / 0.0768, all by bar-range drift; USDJPY
names 2021 alone (bar 0.0710 against 0.0551), its 2022 (+11%) recorded as a
tail and not named — the docblock's threshold paragraph is written from this
table. The crypto window is the witness's own finding: BTCUSD's 2017–2019
5-minute days ran 1.16–1.28× their daily bars with bar ranges three to four
times the baseline's, which is the same disagreement between tiers as
forex's and sits under crypto's FIT fold. HOUSD and RBUSD escaping in 2025–26
is the one result on years the live desk trades, and it goes to the round
with the rest.

## 4. What is NOT done here, and why

- **No gate.** `feed-character --fail-on-escape` would be red on the first
  day it ran, on the very stores the corpus was built from; a gate that
  refuses the present state blocks every merge and decides nothing. It becomes
  a gate when the remedy round says what a refused store means for a sweep.
- **The manifest carries it; nothing refuses on it.** Since the change set
  after #588, every sweep records `feedCharacter` per symbol — the witness
  on both intraday tiers against the daily series the sweep loaded, per
  year, in the manifest's hashed `symbols` (`scripts/replay-sweep.ts` beside
  `gridRegistration`, `scripts/sweepManifest.ts` passthrough,
  `serializeContainment` for the JSON form). A corpus built from here on
  says which of its years escaped. The act-3 corpus of record predates the
  field; `docs/research/r3/feed-character.txt` is its witness, run on the
  same cache.
- **The readers stratify on it; nothing refuses on it.** `scripts/feedYears.ts`
  resolves every symbol-year to `contained` or `escaping` — from the
  manifest's `feedCharacter` when the corpus carries it, else from the
  tracked witness table (`--witness`), always the 5-minute tier the engine
  resolves on. `banked-fraction` and `payoff-decomposition` take
  `--years contained|escaping`; `scripts/contained-years.ts` prints fills and
  net R per class, fold and bucket (tracked:
  `docs/research/r3/contained-years-capture-all-classfolds.txt`). A market
  the map cannot place refuses the read before a row is read — an absent
  verdict is not a contained one — and a manifest with the field on some
  symbols and not others is refused as mixed. Whether readers refuse those
  years outright or the fold calendar avoids them is still the remedy
  question — round 2's, not this change set's.
- **The reader reproduces the hand split, and corrects it by two fills.**
  `contained-years` matches `money-in-escaping-years-2026-09-06.log` exactly
  for forex and every non-crypto class; crypto differs by two fills per
  fold. Measured (`first-time-key-vs-row-time-2026-09-06.log`): the hand
  script's regex took the first `"time"` key on the line, which on a row
  whose `legs` precede `time` is a leg's fill time — 25 New-Year crypto rows
  (12 fit, 13 select) landed in the wrong year. The reader reads the row's
  own `time`; its table is the figure of record.
- **No verdict on any forex figure.** Amendment 36's standard runs both ways:
  a market may not be withdrawn on a flawed input of our own making, and a
  market may not be confirmed on one either. Which forex verdicts stand is
  decided by the round, with the witness as its instrument.
