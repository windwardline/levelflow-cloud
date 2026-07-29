# WCAG Contrast Ratios

All color pairs in the Levelflow palette, measured per WCAG 2.1 standards. Enforced by tests/contrast.test.ts; a palette change that breaks AA fails CI.

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
