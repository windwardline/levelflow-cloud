# The 21-cross commission, priced in the right currency on one physics (2026-09-14)

Engine `2026.09.14.forex-commission-cross-rate`. E8 bills forex CFDs $5
round-turn per 100,000 BASE units — 5e-5 USD per base unit — and the R
accountant needs that as a distance in QUOTE units: 5e-5 / (USD per quote
unit). The four USD-quote pairs pay the constant (2026-09-13); the three
USD-base pairs pay price × 5e-5, exact. The 21 crosses paid price × 5e-5 too,
which is the true figure multiplied by USD-per-BASE — two-sided, +45 % on
GBP-base against −27 % on NZD-base
([`forex-commission-conversion-2026-09-13.md`](/docs/research/forex-commission-conversion-2026-09-13.md)).
This is the fix, on both paths at once.

## 1. What shipped

- **One rate, one source.** `symbols.ts` names each cross's USD leg from the
  currency table (`quoteCurrencyUsdLeg`: the roster pair quoting the quote
  currency in USD, or based in USD and inverted — six legs, all on the
  roster). The rate is the leg's **last completed daily close**: the live
  loader reads it from the bar store beside the market's own load
  (`quoteCurrencyRate.ts`, memoised by leg per scan request), the sweep from
  the pinned cache through the same daily-completion gate with a moving
  pointer (`sweep.ts`, `replay-sweep.ts`; the Q4 reader the same way). Both
  paths read the same bar.
- **No approximation branch remains.** `venueCommissionRoundTripPrice` takes
  the rate and answers null on a cross without one. `buildPricePlan` refuses
  that case by name — `commission_rate_unavailable`, the eleventh
  `PlanRefusalReason`, ledgered as `planRejected:commission_rate_unavailable`
  in the sweep — and `estimateExecutionQuality` throws if a forex symbol ever
  reaches it unpriced. Live blocks the market with the fact, and only when
  the leg's daily bars did not load: the same failure class as the market's
  own bars. Nothing charges zero; the `?? 0` stays only for symbols the venue
  tables cannot bill (unknown to the roster), as pinned.
- **The corpus says what it charged.** Every emitted row carries
  `usdPerQuote` (null off the crosses), so a reader can re-derive E8's figure
  from the row and the currency table.
- **Readers.** `forex-commission-admission.ts --pairs crosses` gates the
  crosses at the exact figure with per-decision leg rates read from the
  pinned cache behind fetchers that throw (zero provider bytes), and prints
  the moved rows' money both as emitted and corrected. The conversion reader's
  leg table now delegates to the engine's derivation.

## 2. Why one physics, not the live half alone

The round's memo scoped "the live half" (one rate fetch per cross). Three
refuters on that design (physics, operations, the law of the specs) returned
before code, and the law refuter overturned the split: "one physics" is
Phase 1 of the remediation program, closed as `2026.08.18.one-physics`; the
four-pair fix kept ONE implementation shared by both paths, so its precedent
covered stale corpora, not a code-level divergence; and readers can re-price R
offline but cannot re-derive a corpus's ADMISSION. The operations refuter
showed the client splits a scan into ten-symbol requests, so a per-request memo
alone dedupes nothing across them — the bar store does — and that a failed quote
fetch would block six markets per leg, the outage class the calendar block's
own comment refuses. The physics refuter confirmed the derivation on both leg
orientations against E8's own ticket arithmetic and measured a stale rate
immaterial (elasticity −1; a 2σ day flips ~0.1 % of near-cap rows), which is
what makes the previous day's close the right source. The revision reads the
leg's daily bars — no new endpoint, no new parser, no dependence on the quote
path that has 37,790 errors and no success on record.

The commission BASIS — $5 per lot of BASE units rather than per $100,000 of
notional — is an inference from E8's symbols table beside its 100,000
contract size; no observed ticket shows a commission line. One E8 fill
statement on any cross settles it (owner item).

## 3. Measured before shipping: admission at the cap

`r3/forex-commission-admission-crosses-2026-09-14.txt` — the corpus of
record (`021821537f28`, all 21 crosses charged price × 5e-5 on every row:
279,180 accepted baseline tuning-fold rows), the forex class row's
`maxCostShare: 0.15`, the leg's completed close at each decision from the
pinned cache (unrated: 0), years by the feed witness.

| population | rows | over cap now → corrected | newly DECLINED (filled, R emitted → corrected) | newly ADMITTED (filled, R emitted → corrected) | kept filled (R emitted → corrected) | mean share |
|---|---:|---|---|---|---|---|
| all pairs, all years | 279,180 | 11,794 → 12,047 | 2,789 (2,435, −103.5 → −158.4) | 2,536 (2,261, −60.8 → −22.8) | 228,546 (+5,386.5 → +5,546.2) | 0.0760 → 0.0752 |
| all pairs, contained | 251,517 | 11,562 → 11,946 | 2,785 (2,431, −100.6 → −155.5) | 2,401 (2,139, −82.4 → −46.1) | 204,969 (+1,772.6 → +1,931.0) | 0.0769 → 0.0760 |
| all pairs, escaping | 27,663 | 232 → 101 | 4 (4, −2.8 → −2.9) | 135 (122, +21.6 → +23.3) | 23,577 (+3,613.9 → +3,615.2) | 0.0679 → 0.0678 |

The direction is the physics, pair by pair (contained years): the eleven
EUR- and GBP-base crosses were over-charged and only ADMIT (EURCHF 536,
EURGBP 405, GBPCHF 313 the largest); AUDJPY, CADJPY, NZDCAD, NZDCHF and NZDJPY
were under-charged and only DECLINE; AUDCAD, AUDCHF, AUDNZD and CADCHF decline
with a handful of admits (517/19, 188/2, 704/16, 314/1); CHFJPY, whose base
currency sits near parity with the dollar, barely moves (3 declined, 35 admitted).

Read on contained years under amendment 39: the rows the exact figure
declines carried −155.5 R corrected and the rows it admits carry −46.1 R, so
the swap at the cap is worth about +109 R corrected on 4,570 filled rows over
the tuning folds — and **+54.5 R against the money the record booked**
(+100.6 − 46.1; the −155.5 holds −54.9 R of commission those rows never
paid). Two pairs carry three quarters of it, AUDCAD +43.8 and AUDNZD +38.0,
on 454 and 619 declined fills at −0.099 and −0.065 R/fill; EURCHF −14.8,
GBPCHF −14.3 and EURGBP −9.6 pull the other way. It is in-sample on the folds
that set the cap and decides nothing: the fix ships on physics at either
sign, no cell is tuned on it. The repricing itself moves the kept rows' money
by +158.4 R (+1,772.6 → +1,931.0), two-sided across the pairs (+800 on the
EUR/GBP-base crosses, −642 on AUD/NZD/CAD-base; GBPNZD +226.2 → +314.8,
NZDCAD +192.5 → +87.2). Rows over the cap both before and after the
correction (9,161 contained) sit in none of the three money columns. No
calibration cell was tuned and no target or stop moved (amendment 39).

**What the reader does not measure, and why it is inert.** The commission
also enters `plan.rewardRisk`, the cost-net payoff the `belowPayoff` gate
reads — a second admission channel. It cannot fire here by a calibration
inequality: the runner is floored at 1.6 × risk or refused (`pricePlan.ts`),
so the effective reward:risk is at least 1.6 minus the cost share, and
falling under the 1.2 floor needs a share above 0.4 — already declined by the
0.15 cap on both sides of the correction. The confidence channel is inert too
(threshold 0 on all 28 forex markets at capture). And "last completed daily
close" means the most recent completed session, not yesterday's date: 22.7 %
of cross rows price at the leg bar stamped the decision's own New York date,
because the decision fell after that session's 17:00 close — the same bar the
sweep's own daily pointer reads. The leg stores' depth margin is thin on the
CAD crosses: USDCAD's first completed bar sits nineteen days before the first
CAD-cross decision, so a corpus starting a month earlier would have unrated
every one of them.

An independent refuter reproduced all 66 cells of the tracked table from a
one-pass re-implementation (its own completion rule, its own leg lookup):
zero differences.

## 4. What it does not do

- The corpus of record and the 2026-09-14 re-simulate predate this version
  and carry price × 5e-5 on the 21 crosses; the readers re-price them per
  row, exactly as for the four pairs after 2026-09-13.
- The ledgered confirm read's money on the crosses is frozen under the
  approximation: it can be neither re-priced (the fold is sealed at the door)
  nor re-read (one burn per program). This record says so rather than
  inheriting "decides nothing".
- Global learning reads `strategy_weightings_global` by version, so every
  setup key reads adjustment 0 under the new version until outcomes accrue —
  as at every bump; the desk is parked and the prior version never served a
  request.
- The quote bank is untouched (FMP carries no usable forex bid/ask —
  `docs/fmp-entitlements.md`).

## 5. Provenance

Tests: `tests/venueCosts.test.ts` (exact on both orientations, null without a
rate, USD pairs ignore it, the 21-leg census), `tests/crossCommissionRate.test.ts`
(execution estimate, plan refusal, the sweep's pointer and ledger, the live
wiring pinned by source), `tests/quoteCurrencyRate.test.ts` (the memo by
promise, unavailable-by-name with the failure text scrubbed at birth),
`tests/forexCommissionReaders.test.ts` (the cross mode, hand-computed). Six
mutations, each caught and reverted: multiply by the rate, drop the plan
refusal, forget the memo, freeze the leg pointer, price the crosses at the
constant, charge zero instead of throwing. The Edge modules type-check under
`deno check` (they sit outside the Node config by law). The measurement
command:

```
npx tsx scripts/forex-commission-admission.ts docs/research/r3/capture-all-classfolds.jsonl \
  --pairs crosses --witness docs/research/r3/feed-character.txt
```
