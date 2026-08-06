# The 1-minute bar bank

Started 2026-08-06. `scripts/bank-minute-bars.ts`, storing to `.minute-bank/`.

## Why it exists

Fifteen-minute bars cannot order intrabar events. When a bar touches both the stop
and a target, the outcome evaluator can only report `ambiguous` — it does not know
which came first. That single limit is why a measured ~60% gain at sub-1.0 stop caps
was declined in round 25: at a 0.5 cap, 26% of setups end in neither a target nor a
stop, so the expectancy figure describes the harness rather than the market.

Minute bars resolve the order. FMP serves them for 99 of 99 probed symbols and only
about **three days deep** (`scripts/probe-minute-bars.ts`). The depth cannot be bought
and it cannot be backfilled. It can only be accumulated forward, one day at a time,
starting whenever the banking starts.

That makes this the one piece of work whose value depends purely on its start date.
Every day not banked is a day never recovered. The analysis that consumes it comes
much later, and does not need to be designed first.

## Raw provider strings are stored verbatim

The engine's `toTimestamp` (`supabase/functions/trade-analyzer/bars.ts`) appends `Z`
to FMP's intraday `"YYYY-MM-DD HH:MM:SS"`. FMP returns those in `America/New_York`,
so every intraday bar in the engine and in the calibration corpus is stamped four or
five hours early, and the error flips twice a year.

The proof is in the existing corpus. The S&P cash session truly runs 09:30–16:00 New
York. Stored, it reads 09:30–15:45 in **both** July and January. True UTC would move
it by an hour between them. New York wall clock labelled as UTC does not move at all.

```
summer 2026-07-31 first=09:30 last=15:45 bars=26
winter 2026-01-30 first=09:30 last=15:45 bars=26
```

That convention is wrong and will be corrected. The bank must not inherit it, and it
cannot be refetched after the correction lands — the provider window is three days
wide. So the store holds the provider's own date string, unparsed and unconverted.
Re-normalising later becomes a re-read of local disk instead of a fetch that is no
longer possible.

The sidecar carries a `sourceTimezone` field, null until the convention is
established by measurement rather than assumption.

## Shape

One JSONL file per provider symbol, one bar per line, appended in chronological
order. A sidecar holds the high-water mark, a recent-key window for deduplication,
and the last thirty run records.

```
.minute-bank/EURUSD.jsonl        {"date":"2026-08-06 09:30:00","open":…}
.minute-bank/EURUSD.state.json   { highWaterMark, bars, firstDate, runs, … }
```

Keys are the raw date strings, which sort chronologically because the format is
zero-padded. Re-running the same day is safe: overlapping bars are dropped by key.

A bar is banked only if its date is present and all four prices are finite. A
malformed bar is dropped and counted — never repaired, and never given the run time
the way `bars.ts` does on an unparseable date. That fallback is survivable in a
rolling cache that refetches; in an append-only bank it writes a fabricated timestamp
indistinguishable from a real one.

## Running it

```bash
FMP_API_KEY=$(security find-generic-password -s fmp-api-key -a peacock -w) npx tsx scripts/bank-minute-bars.ts
```

It must run at least once every three days or a gap opens that cannot be closed. A
run that fetches nothing from any symbol exits non-zero — the provider or the key is
broken and the window is closing. A run that fetches bars but appends none is normal
and says so.

First run, 2026-08-06: 338,971 bars across 100 symbols, 42 MB.

## Not yet done

The bank has no backup, the same gap the calibration corpus has. It is small enough
today that an off-machine copy is cheap, and it becomes irreplaceable the moment it
holds more than three days.
