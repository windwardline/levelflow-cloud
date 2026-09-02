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

## Backup

Two layers, both on a timer, neither waiting on anyone to remember.

```
scripts/ops/backup-minute-bank.sh
scripts/ops/com.windwardline.levelflow-minute-bank-backup.plist  →  ~/Library/LaunchAgents/
```

A launchd agent runs it daily at 20:10 local, fifty minutes after the evening bank
run, plus `RunAtLoad` so a machine asleep at 20:10 catches up on wake. It counts the
bank, copies it, counts the copy, and refuses to replace a good snapshot with a
partial one. Then it hands the snapshot to `push-minute-bank-offbox.sh`, which
archives it, uploads to Cloudflare R2, and compares the remote object's own md5
against the local archive before reporting success. The push is not optional: a
missing credential, a failed upload or a mismatched hash each exit non-zero, because
`ops/agent-exit-status.sh` reads the launchd exit code and a silent skip would render
as a healthy backup.

The remote layout is a contract, and it generalizes past this dataset:

```
windwardline-backups/<repo>/<dataset>/<YYYY>/<MM>/<dataset>-<YYYYMMDD>.tar.zst
```

The key carries the date, so repeated runs in one day overwrite one object instead of
accumulating. Local retention is 14 snapshots and remote is 60; `20260823` is
protected by name in both prunes, because it is the only naive-era corpus in existence
and a retention count cannot protect what oldest-first deletes first.

## The two sides are checked against each other

Verifying an upload and verifying the archive set are different claims, and only the
first was ever made. On 2026-09-02T05:36Z the push died before it ran — `wl-secret`
was not on the launchd PATH — the local snapshot was placed anyway, and the next
successful run reported a healthy backup over a local stamp with no archive behind it.

`check-minute-bank-parity.sh` closes that. It runs at the end of every push, after the
prune so the listing is not stale, and requires every local snapshot to have an
off-box archive. Missing stamps are named rather than counted, so the output can be
handed straight to a backfill. An empty snapshot root fails rather than passing: a
checker that reports success over zero comparisons is the silent failure it was added
to catch.

The invariant is one-directional. Local keeps 14 and remote keeps 60, so `local ⊆
remote` is the designed steady state — remote archives with no local snapshot are the
depth the off-box copy exists to buy, and asserting set equality would fail every day
from day fifteen.

The comparison takes the remote listing on stdin and touches no network, which is why
it is exercised against real directories in `tests/minuteBankParity.test.ts` rather
than asserted by reading its source.

## Keeping it running

A launchd agent runs it twice daily, at 07:20 and 19:20 local:

```
scripts/ops/bank-minute-bars-daily.sh
scripts/ops/com.windwardline.levelflow-minute-bank.plist  →  ~/Library/LaunchAgents/
```

Twice rather than once because the cost of an extra run is nothing — it appends
only what is new — and the cost of a missed window is permanent. launchd rather
than an in-app scheduler for the same reason: a job that only fires while an app
happens to be open is not a guarantee, and this one catches up on wake.

A locked keychain logs a skip and exits zero. That is a deferral, not a failure,
because the window is three days wide — but a run of consecutive skips is the
job silently doing nothing, so the log says it out loud.

Catching up on wake is what makes the window survivable, and it is also why a run
can start before the network does. On 2026-08-08 the 07:20 job fired at wake and
all 100 symbols failed in six seconds with `fetch failed`; nothing was lost only
because a human ran it by hand that afternoon. Each fetch now retries five times
from a 2s base, doubling — 30 seconds of backoff, longer than an interface takes
to come up.

Retries are classified, not blanket. A 4xx other than 429 is a settled answer: a
rejected key is still rejected on the fourth ask, and asking costs a hundred
symbols against a metered quota. Everything else — no response at all, a 429, a
5xx, an error page where JSON belonged — is retried.

A symbol that leaves the roster stops being banked, and the count alone will not
say so. Amendment 32 dropped `^MID`, `^STOXX50E` and `USDMXN` on 2026-08-09 and
the log read 100, then 97. A deliberate retirement and a mistyped `fmpSymbol`
produce the same silence there, and the second costs the series permanently three
days later. So the run names them rather than counting them:

```
No longer on the roster, so no longer banked: ^MID, ^STOXX50E, USDMXN.
```

A report, not a failure. Retirement is legitimate, and an alarm that can never be
cleared is one the operator learns to skip.

A separate daily watchdog reads the log and the sidecars and escalates if the
newest `highWaterMark` falls more than two days behind, or if a sidecar's last
run predates the last completed run. The second test exists because the first
cannot see a symbol that stopped being attempted: its sidecar keeps a stale,
non-zero `fetched` forever, so counting empty returns reads it as healthy.
