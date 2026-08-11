# 4d — per-market derivation of record (2026-08-11)

Amendment 33 executed at the market grain: every market graded on its
own rows by gate v2 (singleton groups, the same paired family-wise
permutation, a 30-filled absolute floor), joined against the §19 sizing
engine's own arithmetic, choice FROZEN, then the confirm fold's one
authorized read — burned into the corpus's read log, first and only
read.

Corpus `3c47e2036e1b` · engine `2026.08.11.engine-v2` · pipeline:
`scripts/derive-4d.ts` → `scripts/feasibility-4d.ts` →
`scripts/confirm-4d.ts` · artifacts beside this doc
(`4d-candidates.json`, `4d-feasibility.json`, `4d-final-picks.json`,
`4d-confirm-read.json`).

## The result

**41 picks frozen before the confirm fold was opened; 39 confirmed
positive on data no tuning step ever saw; 2 failed and revert.**

| population | n | disposition |
|---|---|---|
| Confirmed picks | **39** | ship per-market (runnerProtection, cap) |
| Confirm-negative | 2 (HOUSD, RBUSD) | revert to measure-only, stated below |
| Capacity-gated (RM-1) | 11 | keep shipped calibration; the gate is the venue's own arithmetic |
| Measure-only (no cell accepted) | 7 | keep shipped calibration (incl. all three livestock) |
| Starved (fit fold under the floor) | 18 | late-listed markets; measure until history accrues |
| Held out (read-time stratified) | ~20 | never tuned; keep class defaults this cycle — they are the NEXT cycle's unseen validation |

The dominant confirmed cell is `trail_tp1 · cap 4` (with the inert
hours factor riding along), consistent with the 4c class verdicts —
but the per-market grain is the point: SP confirmed on `hold · cap 4`
(its own rows disagree with its class), and 43 of the 52 gate-accepted
markets, not all, survived feasibility and confirm.

## The exceptions, named

- **HOUSD and RBUSD** (heating oil, gasoline — the two refined
  products) accepted on select and failed confirm (Δ −4.3R and −7.4R).
  The fold did its job; both revert to measure-only. Worth recording:
  these are also the two markets the RM-5 work placed in the crude
  union for crack-spread correlation.
- **The 11 capacity-gated**: ZBUSD/ZNUSD (treasuries — RM-1's named
  prediction: 1-contract steps cannot fit the widened stop inside the
  3% default daily line at the smallest account), PAUSD, ZOUSX/ZRUSD,
  and six sub-dollar coins (ALGO, DOGE, ETC, LINK, TRX, XTZ) where
  crypto's 1:1–1:2 leverage caps the step. Their gate-accepted cells
  are recorded, not deleted — a larger account tier affords them, and
  the governor states the gate per line.

## The discipline trail

1. Candidates derived fit+select only (confirm sealed).
2. Feasibility joined from published venue arithmetic only (line
   ladders, 3% default tier, §19 steps) — zero invented thresholds.
3. Picks written to `4d-final-picks.json` BEFORE the confirm read.
4. One `--confirm-final` read, logged in the corpus's burned log; a
   second read now requires `--acknowledge-prior-reads` and is itself
   logged.

## What ships (next change set)

The 39 confirmed (protection, cap) pairs enter per-market calibration
with an ANALYZER_VERSION bump; every other market keeps its shipped
values with its state named (capacity-gated / measure-only / starved /
holdout). The reopen decision remains the owner's, separate from this
derivation.
