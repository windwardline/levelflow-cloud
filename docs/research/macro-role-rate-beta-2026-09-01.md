# The criterion §6b-1 A asks for is already in the table — measured

**2026-09-01. Zero provider bytes.** Re-run with
`npx tsx scripts/macro-role-rate-beta.ts` on a machine holding
`.calibration-cache` (the cache is gitignored, so this does not run in CI).

`macroRates.ts:165-166` holds PLUSD and PAUSD at `role: "none"` behind an OPEN
marker and says the criterion separating a monetary metal from an industrial one
is something "nothing in this repo states." That is true of the prose and false
of the behaviour. The four metals the table admits are the four that move inverse
to the ten-year. The one it excludes by name is the one that moves with it.

Daily close-to-close return regressed on the same day's change in the ten-year,
percent per basis point, over every cached day both series cover — 2013-01 to
2026-08, n ≈ 3,410 per market.

| | %/bp | t | 95% CI |
| --- | --- | --- | --- |
| XAUUSD *(declared rate-inverse)* | −0.0605 | −19.04 | [−0.0667, −0.0543] |
| XAGUSD *(declared rate-inverse)* | −0.0581 | −9.21 | [−0.0704, −0.0457] |
| GCUSD *(declared rate-inverse)* | −0.0523 | −15.56 | [−0.0589, −0.0457] |
| SIUSD *(declared rate-inverse)* | −0.0505 | −7.67 | [−0.0634, −0.0376] |
| **PLUSD** *(OPEN)* | **−0.0262** | **−4.40** | **[−0.0379, −0.0146]** |
| **PAUSD** *(OPEN)* | **−0.0182** | **−2.35** | **[−0.0334, −0.0031]** |
| HGUSD *(declared none, "industrial")* | **+0.0165** | **+3.46** | [+0.0071, +0.0258] |

The sign separates the decided cases cleanly, and copper is significantly
positive rather than merely weaker. Both open markets are significantly
negative, so both sit on the monetary side of the only criterion the table
actually applies.

**The magnitude does not separate as cleanly, and that is the honest limit.**
PLUSD and PAUSD run near half the monetary betas, between copper and gold rather
than beside either. The role table has no dial for that: `role` is a membership,
and `magnitude` (`macroRates.ts:265`) keys off the size of the rate move, not the
asset. Reporting which side is a repair. Adding a tier for "half" is a model
change, and amendment 39 governs that.

The three groups are derived from the role table's own stated reasons — `why`
starting `Monetary metal:`, containing `industrial, not monetary`, or starting
`OPEN` — never listed in the script. Rule PLUSD tomorrow and the script
re-partitions itself. `getAssetType` cannot do this job: it files GCUSD, SIUSD,
PLUSD, PAUSD and HGUSD under `futures` and leaves only XAUUSD and XAGUSD in
`metals`. MGCUSD derives into the monetary group and has no cached daily series,
so it is named in the output and omitted from the tables rather than dropped.

## The instrument validates before it speaks

The five decided markets are the controls. Unless all four declared monetary
metals come back significantly negative *and* copper significantly positive, the
criterion has failed to reproduce the answers it is meant to encode, and the
script refuses the open pair and exits 1 rather than reporting a number it has
not earned. Verified by mutation: pointing the validation at R3's window makes
SIUSD and HGUSD fail their control tests and the script refuses.

## Why this is not deferred to R3

R3 cannot answer it, on three counts.

The role is **not a grid axis**. `GRID_OVERRIDE_KEYS` mirrors
`CategoryCalibration`'s numeric fields; the role lives in a symbol-keyed map in
`macroRates.ts`, outside calibration. R3 runs both markets at `role: "none"` on
every variant, so the arm that would settle this is never run and cannot be.

The **window is wrong**. PLUSD and PAUSD 15-minute data begins 2023-10-01. Inside
that window the ten-year spans 3.63%–4.98% and the controls invert:

| in R3's window, n ≈ 724 | %/bp | t |
| --- | --- | --- |
| SIUSD *(monetary)* | −0.0363 | −1.94 — CI crosses zero |
| HGUSD *(industrial)* | −0.0190 | −1.51 — CI crosses zero, sign flipped |
| PAUSD *(open)* | −0.0532 | −2.76 — reads **more** rate-inverse than gold |

A measurement that cannot reproduce its own controls cannot adjudicate a new
case. Palladium outranking gold is the tell.

And **deferral is not free**. `PROTECTED_ANCHORS` is marked "Remove once R3 has
run" (`calibrationCache.ts:146`) and `PINS_KEPT = 5` prunes oldest-first, so the
2026-08-26 anchor that makes this measurement cost nothing today becomes metered
later, against an allowance already over its ceiling.

## What this does not measure

Realized R, and therefore not what the membership is worth. The role adds ±1 or
±2 to a 0–100 confidence score that feeds the acceptance gate, the scan's primary
sort and the correlated-sibling suppressor, so flipping it changes the accepted
population. This says which side of the table these two belong on. It does not
say what being on that side earns, and nothing here should be read as if it did.

PAUSD is engine-declined (`calibration.ts:1515`, −0.149R ±0.072 at n=147) and
builds no setup, so a ruling moves nothing live for it. The live blast radius is
PLUSD alone.
