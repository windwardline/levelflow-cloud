# WCAG Contrast Ratios — Text Pairs

All **text-on-background** color pairs in the Levelflow palette, measured per WCAG 2.1 standards. Enforced by tests/contrast.test.ts; a palette change that breaks AA fails CI. Non-text UI boundaries (hairlines, sheet/paper surface separation) are governed by the separate WCAG 1.4.11 threshold and are covered in their own section below, not this table.

Dark theme uses paper-colored text on accent fills — no single accent can satisfy both text-on-sheet and white-fill contrast in dark.

## Light Theme

| Text Color | Background | Ratio | Threshold | Status |
|---|---|---|---|---|
| ink (#1B1B1B) | paper (#F4F1EA) | 15.27 | 7 AAA | ✓ |
| muted (#6B675E) | paper (#F4F1EA) | 5.00 | 4.5 AA | ✓ |
| accent (#2244FF) | paper (#F4F1EA) | 5.58 | 4.5 AA | ✓ |
| buy (#177245) | paper (#F4F1EA) | 5.27 | 4.5 AA | ✓ |
| sell (#B3261E) | paper (#F4F1EA) | 5.79 | 4.5 AA | ✓ |
| caution (#8A5B00) | paper (#F4F1EA) | 5.20 | 4.5 AA | ✓ |
| ink (#1B1B1B) | sheet (#FDFCF9) | 16.79 | 7 AAA | ✓ |
| muted (#6B675E) | sheet (#FDFCF9) | 5.49 | 4.5 AA | ✓ |
| accent (#2244FF) | sheet (#FDFCF9) | 6.13 | 4.5 AA | ✓ |
| buy (#177245) | sheet (#FDFCF9) | 5.80 | 4.5 AA | ✓ |
| sell (#B3261E) | sheet (#FDFCF9) | 6.37 | 4.5 AA | ✓ |
| caution (#8A5B00) | sheet (#FDFCF9) | 5.72 | 4.5 AA | ✓ |
| white (#FFFFFF) | accent (#2244FF) | 6.29 | 4.5 AA | ✓ |
| white (#FFFFFF) | pressed (#1A35CC) | 8.66 | 4.5 AA | ✓ |

## Dark Theme

| Text Color | Background | Ratio | Threshold | Status |
|---|---|---|---|---|
| ink (#EDE7DA) | paper (#161411) | 14.92 | 7 AAA | ✓ |
| muted (#969082) | paper (#161411) | 5.79 | 4.5 AA | ✓ |
| accent (#6B86FF) | paper (#161411) | 5.67 | 4.5 AA | ✓ |
| buy (#4CC38A) | paper (#161411) | 8.30 | 4.5 AA | ✓ |
| sell (#E5766E) | paper (#161411) | 6.26 | 4.5 AA | ✓ |
| caution (#D9A441) | paper (#161411) | 8.17 | 4.5 AA | ✓ |
| ink (#EDE7DA) | sheet (#1E1B16) | 13.93 | 7 AAA | ✓ |
| muted (#969082) | sheet (#1E1B16) | 5.40 | 4.5 AA | ✓ |
| accent (#6B86FF) | sheet (#1E1B16) | 5.30 | 4.5 AA | ✓ |
| buy (#4CC38A) | sheet (#1E1B16) | 7.75 | 4.5 AA | ✓ |
| sell (#E5766E) | sheet (#1E1B16) | 5.84 | 4.5 AA | ✓ |
| caution (#D9A441) | sheet (#1E1B16) | 7.63 | 4.5 AA | ✓ |
| paper (#161411) | accent (#6B86FF) | 5.67 | 4.5 AA | ✓ |
| paper (#161411) | pressed (#7D95FF) | 6.67 | 4.5 AA | ✓ |

## Non-text boundaries (accepted deviation)

These are UI *component boundaries* under WCAG 1.4.11 (Non-text Contrast), not text — hairline borders and the sheet/paper surface separation. Measured values:

| Boundary | Ratio |
|---|---|
| Light hairline (#D8D2C4) on paper (#F4F1EA) | 1.34 |
| Light hairline (#D8D2C4) on sheet (#FDFCF9) | 1.47 |
| Dark hairline (#35322B) on paper (#161411) | 1.44 |
| Dark hairline (#35322B) on sheet (#1E1B16) | 1.34 |
| Light sheet (#FDFCF9) vs. paper (#F4F1EA) | 1.10 |
| Dark sheet (#1E1B16) vs. paper (#161411) | 1.07 |

Hairline boundaries are a deliberate editorial choice below WCAG 1.4.11's 3:1 threshold for UI component boundaries; fields and sheets also separate via spacing and shadow, and this deviation is accepted at spec level.
