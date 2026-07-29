# WCAG Contrast Ratios

All color pairs in the Levelflow palette, measured per WCAG 2.1 standards. Enforced by tests/contrast.test.ts; a palette change that breaks AA fails CI.

Dark theme uses paper-colored text on accent fills — no single accent can satisfy both text-on-sheet and white-fill contrast in dark.

## Light Theme

| Text Color | Background | Ratio | Threshold | Status |
|---|---|---|---|---|
| ink (#1B1B1B) | paper (#F4F1EA) | 12.37 | 7.0 AAA | ✓ |
| ink (#1B1B1B) | sheet (#FDFCF9) | 12.58 | 7.0 AAA | ✓ |
| muted (#6B675E) | paper (#F4F1EA) | 5.67 | 4.5 AA | ✓ |
| muted (#6B675E) | sheet (#FDFCF9) | 5.75 | 4.5 AA | ✓ |
| accent (#2244FF) | paper (#F4F1EA) | 6.88 | 4.5 AA | ✓ |
| accent (#2244FF) | sheet (#FDFCF9) | 7.00 | 4.5 AA | ✓ |
| buy (#177245) | paper (#F4F1EA) | 5.89 | 4.5 AA | ✓ |
| buy (#177245) | sheet (#FDFCF9) | 5.98 | 4.5 AA | ✓ |
| sell (#B3261E) | paper (#F4F1EA) | 5.00 | 4.5 AA | ✓ |
| sell (#B3261E) | sheet (#FDFCF9) | 5.07 | 4.5 AA | ✓ |
| caution (#8A5B00) | paper (#F4F1EA) | 4.68 | 4.5 AA | ✓ |
| caution (#8A5B00) | sheet (#FDFCF9) | 4.76 | 4.5 AA | ✓ |
| white (#FFFFFF) | accent (#2244FF) | 6.74 | 4.5 AA | ✓ |
| white (#FFFFFF) | pressed (#1A35CC) | 8.32 | 4.5 AA | ✓ |

## Dark Theme

| Text Color | Background | Ratio | Threshold | Status |
|---|---|---|---|---|
| ink (#EDE7DA) | paper (#161411) | 12.30 | 7.0 AAA | ✓ |
| ink (#EDE7DA) | sheet (#1E1B16) | 12.08 | 7.0 AAA | ✓ |
| muted (#969082) | paper (#161411) | 5.85 | 4.5 AA | ✓ |
| muted (#969082) | sheet (#1E1B16) | 5.72 | 4.5 AA | ✓ |
| accent (#6B86FF) | paper (#161411) | 7.11 | 4.5 AA | ✓ |
| accent (#6B86FF) | sheet (#1E1B16) | 4.71 | 4.5 AA | ✓ |
| buy (#4CC38A) | paper (#161411) | 6.18 | 4.5 AA | ✓ |
| buy (#4CC38A) | sheet (#1E1B16) | 6.05 | 4.5 AA | ✓ |
| sell (#E5766E) | paper (#161411) | 5.08 | 4.5 AA | ✓ |
| sell (#E5766E) | sheet (#1E1B16) | 4.97 | 4.5 AA | ✓ |
| caution (#D9A441) | paper (#161411) | 5.53 | 4.5 AA | ✓ |
| caution (#D9A441) | sheet (#1E1B16) | 5.41 | 4.5 AA | ✓ |
| paper (#161411) | accent (#6B86FF) | 7.11 | 4.5 AA | ✓ |
| paper (#161411) | pressed (#7D95FF) | 8.07 | 4.5 AA | ✓ |
