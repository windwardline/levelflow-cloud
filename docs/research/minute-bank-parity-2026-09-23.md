# Minute-bank parity on the EUR/GBP/USD triangle (2026-09-23)

**What it measures.** EURUSD − EURGBP × GBPUSD on the closes of minutes all three
files hold, in pips (× 1e4), from the minute bank's own files. The bank keeps the
first copy of each minute, so each key's first line is read. Zero bytes; read-only.

**Every window bound below is a raw provider stamp, not UTC.** The bank stores FMP's
intraday strings verbatim, and FMP returns them in `America/New_York` (`docs/minute-bank.md`,
"Raw provider strings are stored verbatim"; the sidecar's `sourceTimezone` has not yet
stamped it by measurement): EDT, UTC−4, in September. The calendar dates of the
suspension and the recovery are dates, not stamps. The off block,
2026-09-07 22:00 to 09-08 16:00 in provider stamps, is **2026-09-08 02:00Z to 20:00Z**.
A reader exclusion built from these bounds converts them first.

**Which windows hold which vintage.** The bank's 2026-09-04 → 09-14 suspension left
09-04..09-10 missing and 09-03 and 09-11 partial; #676/#681 recovered them from FMP's
dated history on 2026-09-22. So 09-07 and 09-08 are recovered minutes, and 09-01..09-02
and 09-15..09-16 are first copies.

**Output**, run from the checkout root with `python3` on 2026-09-23:

```
recovered 09-07 22:00..09-08 16:00     n= 1080 median=+3.26 p10=+0.31 p90=+4.12 pips
recovered 09-08 16:00..09-09 16:00     n= 1440 median=+0.30 p10=+0.11 p90=+0.56 pips
first copy 09-01..09-03                n= 2880 median=+0.39 p10=+0.15 p90=+3.94 pips
first copy 09-15..09-17                n= 2870 median=+0.58 p10=+0.09 p90=+4.10 pips
```

**Reading.** One recovered block, 2026-09-07 22:00 to 09-08 16:00 New York (09-08 02:00Z to 20:00Z), sits a median +3.26
pips off parity; the recovered day after it sits +0.30, and the first-copy windows +0.39
and +0.58. The first copies also reach about +4 pips at their 90th percentile, so large
residuals are not a property of the recovered history alone. **Neither vintage is clean.**
One triangle cannot say which leg moved; the cross-rate parity instrument (HANDOFF
sequence) is the tool that attributes it.

**Method, exactly as run:**

```python
import json, statistics
def load(sym):
    closes = {}
    for line in open(f".minute-bank/{sym}.jsonl"):
        if line.strip():
            row = json.loads(line)
            closes.setdefault(row["date"], row["close"])  # the bank keeps the first copy
    return closes
E, EG, G = load("EURUSD"), load("EURGBP"), load("GBPUSD")
def residual(lo, hi):
    return sorted((E[t] - EG[t] * G[t]) * 1e4 for t in E if lo <= t < hi and t in EG and t in G)
for label, lo, hi in [
    ("recovered 09-07 22:00..09-08 16:00", "2026-09-07 22:00:00", "2026-09-08 16:00:00"),
    ("recovered 09-08 16:00..09-09 16:00", "2026-09-08 16:00:00", "2026-09-09 16:00:00"),
    ("first copy 09-01..09-03", "2026-09-01 00:00:00", "2026-09-03 00:00:00"),
    ("first copy 09-15..09-17", "2026-09-15 00:00:00", "2026-09-17 00:00:00"),
]:
    xs = residual(lo, hi)
    print(f"{label:38s} n={len(xs):5d} median={statistics.median(xs):+.2f} p10={xs[len(xs)//10]:+.2f} p90={xs[9*len(xs)//10]:+.2f} pips")
```
