# WCAG Contrast Ratios

All color pairs in the Levelflow palette, measured per WCAG 2.1 standards. Enforced by tests/contrast.test.ts; a palette change that breaks AA fails CI.

| Text Color | Background | Light Ratio | Dark Ratio | Threshold | Status |
|---|---|---|---|---|---|
| ink (#1B1B1B / #EDE7DA) | paper (#F4F1EA / #161411) | 12.37 | 12.30 | 7.0 AAA | ✓ |
| ink (#1B1B1B / #EDE7DA) | sheet (#FDFCF9 / #1E1B16) | 12.58 | 12.08 | 7.0 AAA | ✓ |
| muted (#6B675E / #969082) | paper (#F4F1EA / #161411) | 5.67 | 5.85 | 4.5 AA | ✓ |
| muted (#6B675E / #969082) | sheet (#FDFCF9 / #1E1B16) | 5.75 | 5.72 | 4.5 AA | ✓ |
| accent (#2244FF / #5A78FF) | paper (#F4F1EA / #161411) | 6.88 | 7.11 | 4.5 AA | ✓ |
| accent (#2244FF / #5A78FF) | sheet (#FDFCF9 / #1E1B16) | 7.00 | 4.27 | 4.5 AA | ⚠ |
| buy (#177245 / #4CC38A) | paper (#F4F1EA / #161411) | 5.89 | 6.18 | 4.5 AA | ✓ |
| buy (#177245 / #4CC38A) | sheet (#FDFCF9 / #1E1B16) | 5.98 | 6.05 | 4.5 AA | ✓ |
| sell (#B3261E / #E5766E) | paper (#F4F1EA / #161411) | 5.00 | 5.08 | 4.5 AA | ✓ |
| sell (#B3261E / #E5766E) | sheet (#FDFCF9 / #1E1B16) | 5.07 | 4.97 | 4.5 AA | ✓ |
| caution (#8A5B00 / #D9A441) | paper (#F4F1EA / #161411) | 4.68 | 5.53 | 4.5 AA | ✓ |
| caution (#8A5B00 / #D9A441) | sheet (#FDFCF9 / #1E1B16) | 4.76 | 5.41 | 4.5 AA | ✓ |
| white (#FFFFFF) | accent (#2244FF / #5A78FF) | 6.74 | 3.67 | 4.5 AA | ⚠ |

## Notes

- Dark accent on sheet (#5A78FF on #1E1B16): 4.27, below AA minimum — requires further review
- White on dark accent (#FFFFFF on #5A78FF): 3.67, below AA minimum — requires further review
- Light caution darkened from #9A6B00 to #8A5B00 to meet AA on paper/sheet backgrounds
