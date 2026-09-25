# The 2026-09-24 re-simulate: the engine prints what the repricer priced, nothing is accepted on net, and the low-edge refusals hold

HANDOFF sequence item 4: one re-simulate at the current engine, zero bytes from the anchor-pinned
2026-08-26 slice, capture-all plus an `--ignore-low-edge` arm. Then re-grade on fit and select only:
the eight arming-bound cells, `grid-totalr` per market, `banked-fraction`, and the low-edge windows at
market grain on net R. Every grader here seals confirm at the door, and so do the three session
instruments (`attribute.py.txt`, `lowedge.py.txt` and the control's producer, `hour-mechanism.py.txt`).
Each skips a confirm row on its split before reading any other field and prints how many it withheld:
2,141,527 on the capture-all arm, the graders' own count. No figure below reads the confirm fold.

## 1. The run

The recipe is the 2026-09-14 re-simulate's (`armed-corpus.sh`), launched as
[`launch.sh.txt`](/docs/research/r3/re-simulate-2026-09-24/launch.sh.txt) from a clean detached
worktree at main `d919615`, engine `2026.09.23.expiry-exit-slippage`, both arms concurrently,
2026-09-24 22:11Z to 2026-09-25 02:05Z. The pinned cache ("313 cache artifacts all carry the pin, so
this run cannot reach the provider") spent zero provider bytes.

| arm | rows | bytes | emit sha256 | manifest |
|---|---:|---:|---|---|
| capture-all | 6,634,732 | 17,761,066,550 | `c66222eef192…` | [`21738a0a48a5`](/docs/research/r3/capture-all-classfolds-2026-09-24.jsonl.manifest.json) |
| `--ignore-low-edge` | 7,427,390 | 19,853,140,899 | `0591a14e6fb9…` | [`3e8dc92feda2`](/docs/research/r3/capture-all-ignore-low-edge-classfolds-2026-09-24.jsonl.manifest.json) |

Both manifests record `dirty: false`, `untracked: 0`. The capture-all arm's row count equals the
2026-09-14 corpus's, and its rejection ledger (2,523,837 rows) is byte-identical to that corpus's
(`5c4270e78e0c…`). No cross was refused for a missing USD-leg rate. The corpora stay local and
gitignored.

## 2. Every difference from 2026-09-14 is attributed

The engine bumps between the two corpora and what each should move were written before the run
([expected differences](/docs/research/r3/re-simulate-2026-09-24/expected-differences.md)). The
attribution ([record](/docs/research/r3/re-simulate-attribution-2026-09-24.txt)) walks both files in
lockstep:

- 4,493,205 fit and select rows compared; 2,141,527 confirm rows withheld; no row in only one file.
  644,008 are identical.
- Every differing row is checked on two counts. Its differing fields must lie inside a named set:
  exit slippage's on every row, and on a cross also #641's commission and what follows from it (cost,
  the cost-derived scores, the reward ratios, acceptance). Where its legs moved, only exit legs may
  move, each by the modelled slippage (to the corpus's 8-decimal rounding) against the position, at a stop kind or the review-end
  close (#689, #692).
- 1,505,368 rows differ off the crosses. Every one moved its exit legs by the slippage, and
  none moved `grossRealizedR`, as predicted.
- 2,343,829 differ on the 21 crosses. 1,803,198 of them moved legs, every leg by the slippage;
  no cross moved a field outside its set. The commission's own value is not recomputed: on a cross the
  check is which fields moved, not by how much.
- 22,151 rows left acceptance and 19,057 entered it, all on crosses.
- **Violations: 0 off the crosses and 0 on them.** Two mutations of the instrument prove each check
  fires, run by [`mutations.sh.txt`](/docs/research/r3/re-simulate-2026-09-24/mutations.sh.txt) on the
  100,000 rows from the first cross row (line 1,025,913 of each corpus): disallowing `grossRealizedR`
  on a cross flags 68,712 rows, and requiring twice the slippage flags 58,894
  ([output](/docs/research/r3/re-simulate-2026-09-24/mutations.out.txt)). The figures first recorded
  here, 68,887 and 59,060, came from a slice starting at AUDCAD's first row (line 3,992,617), which
  this bullet called the first cross; it is not.

**The repricer is the engine.** `banked-fraction --exit-slippage` has priced every figure since
2026-09-23 without a re-simulate. On every market whose only change is exit slippage (every non-forex
market and the seven USD majors), its repriced R at ½ on the 2026-09-14 corpus
([table](/docs/research/r3/banked-fraction-capture-all-classfolds-2026-09-14-market-exit-slippage.txt))
equals this corpus's emitted R at ½: 43 markets on fit and 58 on select, with a largest difference of 0.00 R at the printed
precision and identical filled counts
([check](/docs/research/r3/repricer-vs-engine-2026-09-24.txt),
[instrument](/docs/research/r3/re-simulate-2026-09-24/repricer-vs-engine.py.txt)). Every figure
priced that way stands.

## 3. The re-grades, fit and select only

**The eight arming-bound cells** ([table](/docs/research/r3/arming-bound-cells-2026-09-24.txt)). The
net column reproduces all eight cells of an independent control, re-derived on this corpus by the
record's own producer ([table](/docs/research/r3/hour-mechanism-2026-09-24.txt),
[producer](/docs/research/r3/re-simulate-2026-09-24/hour-mechanism.py.txt), the session copy of
2026-09-14 with its two paths as arguments). In-span cells clearing zero at lo95: net 3 of 4 as on
2026-09-14, bound 1 of 4 where it was 2. The cell that fell is select in-pool in-span: net E +0.0300
(lo95 +0.0195), against +0.0365 (+0.0261); bound +0.0076 (−0.0027), against +0.0121 (+0.0019). Fit
in-pool in-span still clears under the bound, at +0.0119 (+0.0062).

**`grid-totalr` per market** ([net](/docs/research/r4/per-market-grading-net-2026-09-24.stdout.txt),
[bound](/docs/research/r4/per-market-grading-bound-2026-09-24.stdout.txt)). No (market, variant) pair
is accepted on net. On the bound arm one is: AUDCHF, a held-out market, `hold` with
`intraday_and_daily`, select E +0.052 R (lo95 +0.028, paired p 0.011). About 4.5 false acceptances
are expected across 91 per-market families at FWER 0.05, so one is not evidence. The shipped cell's
select net E clears zero at lo95 in 15 markets, all forex crosses, and sits below zero at hi95 in 46.
Under the bound, 6 clear. Twenty-two markets are decline candidates on each arm.

**The hour gate**, re-read as on 2026-09-14
([net](/docs/research/r4/hour-gate-market-net-2026-09-24.stdout.txt),
[bound](/docs/research/r4/hour-gate-market-bound-2026-09-24.stdout.txt)): 0 of 91 on both arms, 69
judged and failed, 22 without a verdict. On 2026-09-14 the split was the same.

**`banked-fraction`**, the shipped ladder at ½, net realized R
([class](/docs/research/r3/banked-fraction-capture-all-classfolds-2026-09-24.txt),
[market](/docs/research/r3/banked-fraction-capture-all-classfolds-2026-09-24-market.txt),
[contained](/docs/research/r3/banked-fraction-capture-all-classfolds-2026-09-24-contained.txt),
[escaping](/docs/research/r3/banked-fraction-capture-all-classfolds-2026-09-24-escaping.txt)):

| fold | pooled | forex | forex, contained years | forex, escaping years |
|---|---:|---:|---:|---:|
| fit | −2,758.5 R (208,075 fills) | −235.2 R (168,240) | −235.2 R | none |
| select | −6,627.3 R (125,655) | +1,452.7 R (72,699) | −1,336.0 R (49,515) | +2,788.7 R (23,184) |

Repriced on the 2026-09-14 corpus, forex read −565.9 R on fit and +1,360.1 R on select
([record](/docs/research/r3/exit-slippage-2026-09-23.txt)). The difference is the crosses' commission
and the cap flips above; this record does not split it further. Forex's positive select figure comes
from the escaping years, those whose 5-minute bar ranges escape their baseline (2021 on all 28 pairs,
2022 and 2023 on 27, 2024 on 15, by the manifest's feed character). On contained years forex loses
on both folds. Banking nothing (f = 0) beats ½ in all 22 forex
markets on both folds, and it still leaves contained select forex at −606.1 R. That is the
2026-09-06 verdict again: the lever does not make the cell earn.

**The low-edge windows at market grain on net R**
([record](/docs/research/r3/low-edge-regrade-2026-09-24.txt),
[instrument](/docs/research/r3/re-simulate-2026-09-24/lowedge.py.txt)). The rows the
`--ignore-low-edge` arm adds are the window population: 419,321 on fit and select (373,337 confirm
rows withheld). Every shared fit and select row is identical (4,493,205 of 4,493,205), and the
capture-all arm has no row the other lacks. Crypto, futures and indices windows sit at 12–17 UTC;
energies at six scattered hours. Of 51 markets with accepted baseline fills inside a window:

- On select, 33 lose (their day-clustered 95 % interval lies below zero), 18 are unresolved, and
  none earns.
- On fit, nine earn: BTCUSD, DASHUSD, ETCUSD, ETHUSD, LTCUSD, XLMUSD, XMRUSD, XRPUSD and NQUSD. Each
  of them loses or is unresolved on select.
- Pooled, crypto's windows make +445.2 R on fit and −2,621.9 R on select; energies, futures and
  indices lose on both folds.

**The refusals stand on net R.** No window earns on both folds, and none earns on select.

## 4. What it means

- Every market-order exit now carries its slippage in the engine, the crosses carry their USD-leg
  commission, and the corpus that carries both reproduces the repricer, at the printed precision, where it should. This
  corpus supersedes 2026-09-14 as the current-engine corpus for fit and select reads.
- Nothing is accepted on net at market grain, the hour gate is 0 of 91, and the shipped ladder loses
  on both tuning folds pooled. Forex's one positive fold lives in years whose feed is suspect. The
  desk stays parked, and the route to reopening is still a registered entry family (amendments 46 and
  48).
- The low-edge hours were set on the pre-repair clock. Measured now on net R, every window they
  refuse loses or is unresolved on select, so they stay as they are.

The instruments are committed beside the record, since the scratchpad is reaped:
[`attribute.py.txt`](/docs/research/r3/re-simulate-2026-09-24/attribute.py.txt),
[`lowedge.py.txt`](/docs/research/r3/re-simulate-2026-09-24/lowedge.py.txt), the producer and the
repricer check above, and the three launch scripts
([`launch.sh.txt`](/docs/research/r3/re-simulate-2026-09-24/launch.sh.txt),
[`analyze.sh.txt`](/docs/research/r3/re-simulate-2026-09-24/analyze.sh.txt),
[`graders.sh.txt`](/docs/research/r3/re-simulate-2026-09-24/graders.sh.txt)), and the review re-run
that produced the attribution and control as committed
([`rerun.sh.txt`](/docs/research/r3/re-simulate-2026-09-24/rerun.sh.txt)). The JSON artifacts
beside each `grid-totalr` read are the reader's own `--out`.
