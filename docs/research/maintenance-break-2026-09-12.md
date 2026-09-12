# The maintenance break: a real exposure, and a lever that is not one (2026-09-12)

The FMP entitlement round surfaced this as the free finding that displaced an
entitlement: review windows crossing a class's own nightly maintenance break,
which `src/lib/marketHours.ts` models and `getSetupExpiryTime`
(`replay.ts:827-844`) never consults — it clamps to the weekly close and
nothing else.

The mechanism was verified then. The exposure and the money were not. Both are
measured here, and the second answer is a refusal.

Output: `r3/maintenance-break-2026-09-12.txt`.

## The control comes first

The analyzer refuses to decide inside its own maintenance window. So if the
break windows transcribed for this pass are right, **zero** accepted decisions
may fall inside one. Any class showing otherwise means the transcription is
wrong and no crossing number is earned.

Across **417,854** accepted baseline rows in seven classes, confirm byte-skipped
before parse: **zero decisions inside a break**, every class. The transcription
holds.

## The exposure is larger than reported, because forex has a break too

The round scoped this to "exchange-traded decisions" at 20.3 %. Forex carries a
nightly 16:59–17:05 ET rollover pause of its own
(`marketHours.ts:41-46`), and forex is 89 % of the corpus.

| class | rows | windows crossing a break | share |
|---|---:|---:|---:|
| livestock | 1,056 | 1,056 | 100.0 % |
| indices | 1,450 | 982 | 67.7 % |
| agriculture | 6,840 | 2,952 | 43.2 % |
| metals | 10,131 | 3,361 | 33.2 % |
| **forex** | **373,510** | **123,321** | **33.0 %** |
| futures | 23,819 | 4,371 | 18.4 % |
| energies | 1,048 | 154 | 14.7 % |
| **total** | **417,854** | **136,197** | **32.6 %** |

**A third of every decision this engine has ever made holds a review window
running through hours the market is shut.** `defaultReviewHours` is specified in
wall-clock hours, so the same "8 hours" buys different amounts of live market
time depending on when the decision lands. On livestock — a 24-hour window
against a 5h40m break — every single window crosses.

That is a real specification defect and it is free to fix.

## The money looked like a lever, in every class

Realized R per fill, split by whether the window crosses:

| class | clear | crosses | delta (clear − crosses) |
|---|---:|---:|---:|
| forex | −0.0012 | **+0.0328** | −0.0340 [−0.0386, −0.0295] |
| futures | −0.1045 | −0.0303 | −0.0742 [−0.1023, −0.0461] |
| indices | −0.1894 | −0.0607 | −0.1287 [−0.2101, −0.0474] |
| metals | −0.0947 | −0.0347 | −0.0600 [−0.0901, −0.0299] |
| agriculture | −0.1543 | −0.0825 | −0.0719 [−0.1220, −0.0217] |
| energies | −0.2052 | −0.1682 | −0.0369 [−0.1979, +0.1241] |

Crossing beats not-crossing in **all six**, significantly in five. Forex's
crossing cell is +3,296.8 R over 100,422 fills.

## It is not a lever. It is the hour finding wearing different clothes

Forex's break sits at 16:59–17:05 ET — 21:59–22:05 UTC in summer. With an
eight-hour review window, "crosses the break" selects decisions from roughly
14:00 to 22:00 UTC, which substantially **is** the 16:00–21:59 UTC span the
alpha review already found.

Conditioning on the span collapses it:

| span | window | fills | E | 95 % interval |
|---|---|---:|---:|---|
| in | clear | 6,620 | +0.0380 | [+0.0237, +0.0523] |
| in | crosses | 66,447 | +0.0466 | [+0.0423, +0.0510] |
| | **delta** | | **+0.0086** | **[−0.0064, +0.0236]** |
| out | clear | 215,413 | −0.0024 | [−0.0052, +0.0003] |
| out | crosses | 33,975 | +0.0059 | [−0.0007, +0.0125] |
| | **delta** | | **+0.0083** | **[+0.0012, +0.0154]** |

The unconditional delta is **+0.0340**. Within span it is **+0.0086** with an
interval spanning zero; out of span **+0.0083**, barely clearing. Four fifths of
the apparent effect is the hour of decision.

**Do not build a break-aware admission rule.** It would be the hour gate under
another name, and the hour gate was graded at the market grain on 2026-09-12 and
refused on all 91 markets.

## What the test gives back

A control the alpha review did not have. The span effect survives conditioning
on break-crossing, at almost identical size in both groups:

- within crossing windows: +0.0466 − 0.0059 = **+0.041**
- within clear windows: +0.0380 − (−0.0024) = **+0.040**

So the hour effect is not itself an artifact of windows running into closed
hours. That was a live alternative explanation and it is now closed.

## What is still owed, and it is not a money claim

The exposure stands on its own as a **specification** defect, separate from any
edge: `getSetupExpiryTime` consults `getUpcomingWeeklyCloseTime` and never the
daily break, so a review window's live market time varies with the clock while
its calibration assumes it does not. Livestock loses 24 % of every window.

Fixing it means deciding what `defaultReviewHours` *means* — wall-clock hours or
open-market hours — and re-deriving every class's value under the answer. That
is a calibration change, it moves every cell, and it cannot be confirmed while
the provider key is suspended. It is recorded here, not built.
