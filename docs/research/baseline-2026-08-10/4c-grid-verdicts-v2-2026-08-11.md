# 4c grid verdicts — engine v2 corpus, gate v2 (2026-08-11)

**These are the verdicts of record for item 4c**, superseding the
directional read of 2026-08-10 (which was demoted by round 8: identity
seam, unenforced p, burned confirm). Everything below is graded by gate
v2 — paired day-delta sign-flip permutation with family-wise max-T
control, p ≤ 0.05 ENFORCED, fit AND select must both hold, expectancy
delta must hold on select, read-time per-class stratified holdout (3
markets), **confirm fold sealed** (no `--confirm-final`; its one
authorized read belongs to 4d's final candidate).

Corpus: `3c47e2036e1b` · engine `2026.08.11.engine-v2` (venue
commissions, bid/ask triggers, 5-minute resolution, net expired labels,
same-bar arming) · 8 shards, 97 roster symbols, 8 per-class fold
calendars · ~21M evaluated records · raw gate output preserved beside
this file's git history.

## The synthesis

**1. The stop cap is the axis that matters — everywhere, monotonically.**
The shipped cap (1.0×ATR) fails its own baseline in every class. Select-
fold expectancy delta rises with the cap in every class that accepts:

| class | best accepted cell | ΔE (select, R/decision) | pairedP |
|---|---|---|---|
| forex | trail_tp1 · cap 4 · hf 3 | **+0.286** | 0.001 |
| metals | trail_tp1 · cap 4 · hf 3 | **+0.369** | 0.001 |
| futures | trail_tp1 · cap 4 · hf 3 | **+0.267** | 0.001 |
| crypto | trail_tp1 · cap 4 · hf 3 | **+0.245** | 0.001 |
| agriculture | trail_tp1 · cap 4 · hf 3 | **+0.250** | 0.001 |
| energies (WTI) | trail_tp1 · cap 4 · hf 1 | **+0.442** | 0.001 |
| indices | trail_tp1 · cap 4 · hf 3 | **+0.217** | 0.001 |
| livestock | — none accepts — | — | — |

4b's decomposition said the cap binds ~100% of stops and the gap tails
run 13–32% beyond −1.1R; this grid turns that association into an
intervention result: loosening the cap is the single largest measured
improvement, and it also SHRINKS worst-day totals (forex worst day
−33.3R at cap 1 vs −4.2R at cap 4 — fewer stop cascades, not more).

**2. Runner protection ranks trail_tp1 > hold > breakeven.** The
breakeven jump — the shipped default — is the WORST of the three modes
in every class that accepts, exactly as the 44%-breakeven-tax
decomposition predicted. Trailing the stop to TP1's level keeps most of
breakeven's protection while cutting its tax.

**3. The window's sizing hat barely matters.** sizingHoursFactor 3 vs 1
moves ΔE by ±0.01R in most cells — the 4b verdict (the window censors
nothing; only the sizing hat differs) confirmed. The axis can rest.

**4. Refusals that are the system working:**
- **Livestock accepts nothing** — every cell fails or goes THIN (19–20
  filled at high caps). The class stays on its shipped calibration,
  measure-only under 4d, exactly what amendment 33 demands when the
  data cannot carry a verdict. NO roster action (amendment 31).
- **Energies' high-cap cells carry a 42–43% expiry share** — the
  acceptance stands (ΔE +0.44 at p .001) but nearly half the accepted
  stream resolves by window end, stated here as the license 4d must
  re-examine per market, not hidden in an average.
- **Indices' baseline is THIN** (109 filled) and its low-cap cells
  fail; only cap ≥ 2.5 (or trail at cap 1) earns acceptance.

## What 4d does with this

Per-market derivation of (runnerProtection, maxStopAtrMultiplier) under
gate v2 — with the two constraints this grid cannot see:
- **Sizing feasibility (RM-1):** a 4×ATR stop that cannot be sized at
  the venue's 1-contract step is not a real cell for that market,
  whatever its ΔE. The governor's arithmetic joins the derivation.
- **Survival:** worst-day and daily-line tables per E8 line join each
  candidate before anything ships.
- Confirm reads strip pre-holdout per-symbol overrides (CV-11/LA-8);
  starved late-listed markets stay measure-only (CV-3).
- The confirm fold's ONE authorized read (`--confirm-final`, burned-log)
  goes to 4d's final per-market candidate set — not to any exploration.

The 2026-08-10 directional doc stays in place, annotated, as the record
of why this file exists.
