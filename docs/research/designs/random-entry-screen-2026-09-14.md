> **Status (recorded 2026-09-16): designed, refuted, NOT BUILT.** The draft below was
> refuted on 2026-09-14; the section headed REFUTED carries the verdicts and the
> smallest defensible design, which governs over the draft above it. Amendments 45 and
> 46 have since settled two of the rulings the draft left open.
>
> **Why this file is in the repository.** It lived only in a session scratchpad under
> `/private/tmp`, which the operating system reaped between 2026-09-14 and 2026-09-16.
> It was restored from the session record. A design that survived refutation is a
> record, not a working file.

# Design draft: the random-entry excursion screen (2026-09-14, refuted the same day)

## What it is for
Item 4 of the open-scope round's program: "any new entry family is tested on the fit fold
against the random-entry excursion null the alpha review used (the shipped entry: t = −0.01)
before it earns a sweep." A screen that spends no fold and no provider byte: it asks whether a
candidate family's direction calls carry information at all, before a ladder, a size, a
ranking or an admission rule is built on them (alpha review §1: "no exit geometry can rescue
this engine by itself").

## The null, stated so it can be refuted
For each candidate decision (symbol, decision bar t, side), the UNCENSORED excursion over the
family's own review window W: from the pinned 5-minute cache (the sweep's resolution stream),
favourable = max signed move in the side's direction over (t, t+W], adverse = max move against,
both in units of the candidate's own risk distance (or ATR when the family names no stop yet —
stated on the record). Signed excursion difference d = favourable − adverse.
The matched null: the same symbol, the same window length, a decision bar drawn at random from
the same fold's decision bars (uniform over the family's own decision times, with side drawn
by a fair coin), excursions computed the same way. Repeat K draws per candidate decision
(K = 20) so the null's variance is the null's, not the sampling's.
Statistic: mean(d_candidate) − mean(d_null), a paired t over decisions, and the 95 % interval;
per fold (fit only — the screen spends no other fold), per class, and per market.
Pass: the lower 95 % bound of the difference is above zero on fit for the class the family
targets; a family that fails is not swept. The shipped entry's figure (t = −0.01 in the round;
the driver's censored measurement −0.030 [−0.033, −0.027] on fit in-pool) is the control the
screen must reproduce first, from the record corpus's rows as candidates.

## Inputs and what they cost
- A candidate emit (`--capture-all`) or a decision list (symbol, time, side, riskDistance,
  reviewHours) — the family's own sweep arm, run to the DECISION only (no resolution needed).
- The pinned 5-minute and 15-minute cache at the record's anchor; zero provider bytes (throwing
  fetchers, like the Q4 reader).
- Folds from the record's fold spec; the confirm fold refused at the door.

## What it must NOT do
- Use realized R, the ladder, TP1 or any stop truncation: the screen is uncensored by design.
- Read the select or confirm fold.
- Rescue a family with a window search: W is the family's stated window, one value.

## Build shape (after refutation)
`scripts/entry-excursion-screen.ts` (census-registered reader): reads a decision emit + the
pinned cache, prints the control (shipped entry on the record) then the candidate table; tests
on a hand-built cache with a family whose direction is known (a synthetic trend) and one whose
direction is a coin flip; mutation: drop the side from the excursion (must fail), read the
select fold (must refuse).

# REFUTED (2026-09-14 ~17:25 ET) — verdicts and the design that survives

- **Null FAILS.** A fair-coin side makes favourable and adverse swap exactly for the same bar
  and window, so E[d_null] = 0 identically — the draft's K = 20 draws estimate a known constant.
  The round's own construction is unrecoverable (its scripts lived in the journal, not the tree);
  the round's figure was select-fold FILLS (−0.0039 R [−0.0245, +0.0166] against a null of
  −0.0038, paired −0.0001, t = −0.01), so the draft's "control to reproduce" has no anchor: the
  driver's −0.030 is censored, an uncensored screen cannot reproduce it by construction.
  Defensible null: keep the family's side AND clock, randomize the DATE within the fold's usable
  months for the same symbol (|shift| > W, K draws), ATR-normalized at each time; day-clustered
  standard errors (decisions sit on a 16-bar grid across 28 correlated symbols).
- **Censoring NARROWED.** The corpus's favourable excludes the fill bar and adverse includes it
  (replay.ts:602-626), so the driver's figure is not a direction statistic. The uncensored
  screen must state its reference price (decision close, stream from the next bar — a
  pullback-limit family sees adverse first by construction), keep W inside the fold embargo
  (fit's decisionEndMs sits 5 days before endMs), and print in/out-of-span beside the pool.
- **Pass rule FAILS as written.** Amendment 33 is per market; at the uncensored sd (~2.47 R) a
  class pass at +0.012 R can be three markets at +0.08 and sixteen at zero, and +0.012 R sits
  below the round trip (0.034–0.090 R per fill at the tabulated stop widths). Floor: the
  family's own round-trip cost in R, per market, ≥ 30 fills; the market grain IS reachable here
  for effects ≥ 0.05 R.
- **One burn HOLDS on the ledger, NARROWED on families.** A fit read is not ledgered and the
  door withholds only confirm (select must be the reader's own filter); nothing counts repeated
  family proposals (one family in ~40 passes on noise at se 0.006) — a family registry hashed
  before the read, with a bar that rises with the count. "Pre-fold" is wrong: fit is a fold; the
  screen is pre-confirm. If a new family is NOT a new program, every roster symbol's confirm
  window is already burned and no screened family can be confirmed on this calendar.
- **Practicality NARROWED.** No decision-only sweep arm exists (adding one touches the
  both-arms-or-neither rule); the shipped entry's decision list IS the capture-all emit;
  `pinnedSeries` (Q4) is the refusing cache reader; 400–600 lines + ~300 of tests, one to two
  sessions.

Smallest defensible design: (1) a decision list per family (symbol, time, side) with W,
reference price and unit stated once and hashed into a registry before the read; (2) uncensored
MFE − MAE over (t, t+W] from the pinned 5-minute cache, ATR units, contained months, W ≤ the
embargo, refusing fetchers; (3) null = same symbol, side and clock, random day in the fit fold's
usable months, K = 20; (4) per-market verdict on a day-clustered 95 % interval, pass = lower
bound above the market's round-trip cost in R, class pool printed beside; (5) controls first: a
look-ahead family passes wide, a coin-flip family fails, the shipped entry reads ≈ 0, and the
reader reproduces the corpus's censored fields on a row sample by re-applying the resolver's
censoring.

Owner rulings the screen needs — SETTLED 2026-09-14 by amendments 45 and 46: the market grain
holds (no class-grain exception for a screened family); a new family is NOT a new program
(families registered and hashed before any fold is read, charged against one capped total alpha
shared by every family claiming the post-2026-08-26 calendar). Still open and owed with
recommendations: the effect floor (recommended: the family's round-trip cost in R per market),
the reference price (recommended: decision close), and whether a rising registered-family count
raises the bar.
