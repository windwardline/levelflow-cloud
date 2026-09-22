# The 1-minute bar bank

Started 2026-08-06. `scripts/bank-minute-bars.ts`, storing to `.minute-bank/`.

## Why it exists

Fifteen-minute bars cannot order intrabar events. When a bar touches both the stop
and a target, the outcome evaluator can only report `ambiguous` — it does not know
which came first. That single limit is why a measured ~60% gain at sub-1.0 stop caps
was declined in round 25: at a 0.5 cap, 26% of setups end in neither a target nor a
stop, so the expectancy figure describes the harness rather than the market.

Minute bars resolve the order. FMP served them for 99 of 99 probed symbols, and an
undated request returns about **three days** (probe, 2026-08-06). Whether a dated
request reaches deeper has not been measured; `scripts/probe-minute-bars.ts --symbol
--from --to` asks one such question through the governor. Until it is answered, the
depth is treated as unrecoverable: the bank accumulates forward, one day at a time.

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
must not need a refetch after the correction lands: an undated request returns about
three days, and until a dated one is shown to reach deeper a refetch is treated as
impossible. So the store holds the provider's own date string, unparsed and
unconverted. Re-normalising later becomes a re-read of local disk instead of a fetch
that may no longer be possible.

The sidecar carries a `sourceTimezone` field, null until the convention is
established by measurement rather than assumption.

## Shape

One JSONL file per provider symbol, one bar per line, **in append order, not
chronological order — sort by `date` on read.** A sidecar holds the high-water mark,
a recent-key window for deduplication, and the last thirty run records.

```
.minute-bank/EURUSD.jsonl        {"date":"2026-08-06 09:30:00","open":…}
.minute-bank/EURUSD.state.json   { highWaterMark, bars, firstDate, runs, … }
```

Keys are the raw date strings, which sort chronologically because the format is
zero-padded. Re-running the same day is safe: overlapping bars are dropped by key.

Each run appends its fresh bars oldest-first, so a run's block is ordered. The file
is not, because the provider sometimes omits a minute and serves it on a later call.
The later run appends that minute after its own newest bar. Measured 2026-09-21 across
3,395,668 bars:

| | |
| --- | --- |
| backward date steps | 664, in 76 of 100 files |
| traceable to a run through the sidecars | 252 |
| of those, at a run boundary | 252; none inside a run's block |
| of those, filling a hole inside coverage already banked | 252 — e.g. 12:59 and 13:02 banked, 13:00 served later |
| how far back | 1 minute to 24.3 hours, median about 13 |
| date formats | one; no instant appears under two strings |
| duplicates | none |

The other 412 steps predate the thirty runs a sidecar remembers, so they are
consistent with the mechanism rather than proven by it. Nothing is lost or
duplicated, and a sort by `date` yields the true series. The files are deliberately
not rewritten into order: the bank is unrecoverable, and a reader-side sort costs
nothing.

De-duplication holds because the key window outlasts the provider's: 8,000 keys
against a largest single-run fetch of 4,276 bars. Late fills reach back a day at
most, so they fall well inside it.

A bar is banked only if its date is present and all four prices are finite. A
malformed bar is dropped and counted — never repaired, and never given the run time
the way `bars.ts` does on an unparseable date. That fallback is survivable in a
rolling cache that refetches; in an append-only bank it writes a fabricated timestamp
indistinguishable from a real one.

## Running it

```bash
FMP_API_KEY=$(security find-generic-password -s fmp-api-key -a peacock -w) npx tsx scripts/bank-minute-bars.ts
```

It must run at least once every three days. Until a dated request is shown to reach
deeper, a longer gap is treated as one that cannot be closed.

The bank is never refused at a door (§21c). It does not consult the shared FMP
breaker or ask the ledger for room: its first symbol is its probe, so an outage costs
one request per run. When that scout fetches nothing the run stops, reports a wall no
retry clears to the breaker, names the remedy and exits 1. When it answers, the bank
records the answer, which closes the account's entry and the 1-minute endpoint's
entry. An entitlement refusal another consumer met on a different endpoint, such as
the economic calendar, stays open until that endpoint answers.

It exits 1 when there are no targets, when nothing was fetched, when the scout stood
down, when a ledger or breaker write failed, when the run reached its **512 MiB
per-run bound** (symbols past the bound are not attempted, and the output names how
many), and when the bank's own bytes for the UTC day pass 512 MiB or the ledger
cannot be read to check them. That last is an alarm, not a refusal. A run that loses some symbols but fetches others still exits 0,
as before; the daily watcher reads those. A run that fetches bars but appends none is
normal and says so.

Every byte is recorded under `.fmp-state/usage/<YYYY-MM-DD>.jsonl`, tagged `bank`.
The other script consumers — the cache top-up and every ad-hoc sweep, probe and
verifier — share a pool that reserves 333,333,333 bytes a day for the bank whether it
runs or not.

A clean run — exit 0, the whole roster, no symbol lost, no bound reached, into the
canonical `.minute-bank` — writes `.fmp-state/runs/minute-bank.json`. A red run writes
none, even though its bars are banked, so the next login, kickstart or hand run banks
again. The wrapper's run gate (`scripts/fmpRunGate.ts`) reads the marker: a login run
is skipped only when that clean run finished at or after the most recent scheduled
slot (07:20 or 19:20 local), and anything the gate cannot read runs the bank. The
rule holds on the DST nights, when the slots sit 11 or 13 hours apart. The gate runs
before the bank lock, so a skipped login never waits on a backup. It reads the slots
from the TRACKED plists in `scripts/ops/`, while launchd fires the INSTALLED copies in
`~/Library/LaunchAgents/`; nothing compares the two. Their schedules agreed on
2026-09-21 (bank 07:20 and 19:20, top-up 07:00). A schedule change updates both in one
change set, because an installed slot moved earlier than the tracked one would let a
clean overnight run skip a genuine scheduled start.

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

Snapshots live in `~/.local/share/levelflow-cloud/minute-bank-snapshots/`, created on
first run. Until 2026-09-21 they were written straight into the home folder, and
fifteen sat there when the owner asked what they were. `LEVELFLOW_BACKUP_ROOT`
overrides the root; a named root that does not exist is refused, never created.

## The two jobs cannot run at once

The bank appends `<symbol>.jsonl` and then writes `<symbol>.state.json` as two
separate, non-atomic steps. A copy taken while that is happening can hold a torn
final line, or a sidecar that disagrees with the data file beside it.

Between 2026-09-17 and 2026-09-21 the backup failed eight times, always the same
way:

```
VERIFY FAILED: copied 100/3332370 against 100/3326559 — leaving the previous snapshot intact
```

The copy held *more* bars than the reference count read moments earlier, because
a bank run was appending underneath it. Nothing reached R2 after 2026-09-19
while the bank grew by another 107,000 bars, which is the single-location
exposure R0b exists to remove.

The count check caught this by luck rather than by design. It was written for a
short copy from a full disk, and a copy taken between the append and the sidecar
write matches on bar count while still being internally inconsistent — so
accepting the larger copy would have shipped corruption off-box and reported
success. The verify is therefore unchanged. What was missing is the guarantee
that nothing writes while the backup reads.

`scripts/ops/bank-lock.sh` is that guarantee. Both scripts source it and take an
exclusive lock on `.minute-bank.lock` before touching the store: the bank before
it reads the keychain, so a refusal costs no provider traffic, and the backup
before its first count. The backup releases as soon as the snapshot is placed,
because the archive and the upload work from the frozen copy and there is no
reason to hold the bank for them.

Staggering the schedule would not have worked. Both plists carry `RunAtLoad`
deliberately, for the same reason — a machine asleep at 07:20 or 20:10 has missed
a window — so they co-fire on every login and reload, which is where six of the
eight failures came from. No choice of clock fixes two jobs that are both correct
to run at load, and a clock does nothing for the hand-run path: the
`levelflow-bank-minute-bars` scheduled task tells an agent to run the bank by
hand when it has stalled, which can land on top of the 20:10 backup.

A lock adds two new ways to stop the work quietly, and both are closed. A lock
naming a dead or unreadable holder is broken by rename — never by deleting in
place, which would let two waiters both believe they won — and the break is
logged. A lock that cannot be taken within `LEVELFLOW_BANK_LOCK_TIMEOUT`
(900s) gives up non-zero with a reason, because `ops/agent-exit-status.sh` reads
the launchd exit code and a quiet skip renders as a healthy backup.

The helper refuses to load outside bash. zsh fires an `EXIT` trap set inside a
function when that function returns, so under zsh the release backstop deleted
the lock the instant it was taken — the caller was told it held a lock it did
not. Both launchd jobs run under bash through their shebangs and were never
exposed; the production check after #658 was, because it held the lock from an
agent's zsh and the backup walked straight through.

`tests/minuteBankLock.test.ts` exercises all of it against the real scripts,
including the original failure: a live writer holding the lock and appending
while the backup wants to copy. Each guard below was deleted in turn and the
suite failed every time:

| Mutation | What it removed |
| --- | --- |
| M1 | the backup's lock acquisition |
| M2 | the stale-lock break |
| M3 | the non-zero exit on timeout |
| M4 | the bank's lock acquisition |
| M5 | the pid sanity check (`kill -0 0` hits the process group) |
| M6 | the ownership check on release |
| M7 | the fall-through that bounds an unbreakable lock |
| M8 | the bash-only guard |

M6 survived at first, which is how the release path's ownership check was found
to be untested. M7 is the one that found a defect in the lock itself: an
unbreakable lock spun past its own deadline check and never timed out.

The remote layout is a contract, and it generalizes past this dataset:

```
windwardline-backups/<repo>/<dataset>/<YYYY>/<MM>/<dataset>-<YYYYMMDD>.tar.zst
```

The key carries the date, so repeated runs in one day overwrite one object instead of
accumulating. Local retention is one daily plus the protected `20260823`, and remote
is 60. `20260823` is protected by name in both prunes, because it is the only naive-era
corpus in existence and a retention count cannot protect what oldest-first deletes
first. The local prune runs only after the push verified the remote object and parity
passed; a failed or skipped push skips it. The remote protection is not permanent: the
bucket's lifecycle rule expires every object 365 days after upload, whatever its name,
so R2's copy of `20260823` lapses about 2027-09-02, a year after it was uploaded at
2026-09-02 15:40:42Z (HANDOFF §6b-1 item I).

The push compares the remote object's md5 with the local archive's, and parity
compares names; neither unpacks anything. A bad `zstd` stream or a layout nobody has
unpacked passes both every day and is found on the day it is needed. Since 2026-09-21
local retention is one day rather than fourteen, so R2 is the only route to any
earlier day. The restore proof below unpacks one. Its first run against the bucket is
the operator's, and until that run is recorded here nothing has been restored from
these archives.

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

The invariant is one-directional. Local keeps one daily plus `20260823` and remote
keeps 60, so `local ⊆ remote` is the designed steady state — remote archives with no
local snapshot are the depth the off-box copy exists to buy, and asserting set equality
would fail every day from the second day.

The comparison takes the remote listing on stdin and touches no network, which is why
it is exercised against real directories in `tests/minuteBankParity.test.ts` rather
than asserted by reading its source.

## An archive is proven by restoring it

```bash
~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- bash scripts/ops/verify-minute-bank-restore.sh
```

`verify-minute-bank-restore.sh` lists `windwardline-backups/levelflow-cloud/minute-bank/`,
downloads the newest archive by name into a scratch directory under `$TMPDIR`, runs
`zstd -t`, extracts it and compares the restore with the live bank. It fails when:

- the listing cannot be read, the bucket is missing, a key sits outside
  `<YYYY>/<MM>/minute-bank-<YYYYMMDD>.tar.zst`, or there is no archive;
- the newest archive's stamp is more than three days before today (UTC), which means
  the daily push has stopped, or is later than today, which would hide that;
- the archive holds anything but one directory stamped as its key is, or that
  directory holds a link or a subdirectory (the bank is flat);
- a restored `.jsonl` has no sidecar, its sidecar does not parse, or the sidecar's
  `bars` differs from the file's line count;
- a sidecar with no data file counts any bars;
- a restored file ends without a newline, which is a torn final line;
- a restored file is missing from the live bank, or its bytes are not the head of the
  live file;
- a live file the archive lacks starts more than four days before the stamp, or its
  first line carries no date;
- the restore holds no data file, or no bars.

Every failure is named, not counted. A live symbol the archive lacks passes, named,
only when the bar on its first line is at most four days older than the stamp: a
symbol's first fetch reaches about three days back, and the fourth day covers the
provider's New York dates against a UTC stamp. Before that rule, an archive holding
one symbol of a hundred passed. Success prints one line on stdout: the archive, the
files and bars restored, and the live bars. The scratch directory goes on every exit,
signals included, and needs room for one uncompressed bank.

The prefix test carries the proof. The bank appends and never rewrites, so a
snapshot's bytes stay the head of the live file for good, late fills included. The
same property is why the proof takes no bank lock: it reads no live sidecar, and an
append in flight only extends a file past the bytes it compares. It can run while the
bank runs. macOS `cmp -n` cannot make that comparison, because it reports unequal
lengths even inside its limit, so the script pipes `head -c` of the live file into
`cmp`.

It is to be run weekly beside `verify-postgres-restore.sh` on the fleet-health
cadence, not daily, because it downloads and unpacks a whole archive. Nothing
schedules it yet: the `CADENCE.md` row in windwardline/windwardline is still to be
added. From a checkout it reads that checkout's `.minute-bank`. From any other tree,
name the checkout inside `wl-secret`'s command, because `wl-secret` execs its child
under `env -i` and drops a `LEVELFLOW_CHECKOUT` set in the calling shell:

```bash
~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- env LEVELFLOW_CHECKOUT=<checkout> bash <tree>/scripts/ops/verify-minute-bank-restore.sh
```

A named checkout that does not exist, or one with no bank, is refused before anything
is listed.
`tests/minuteBankRestore.test.ts` runs the real script, tar and zstd against a stub
`rclone` over a directory, with every stamp and bar date relative to today. Fifty-seven
mutations of the first version's guards each failed it, as did 32 of 35 against the
guards added after review. The three that survive drop a `|| die` behind a walk that
has already read the same directory, which no input can reach.

### Restoring by hand

Pull an archive into the project's data directory. The rclone settings are the
script's, and the secret lives only in this one child's environment:

```bash
mkdir -p ~/.local/share/levelflow-cloud/restore
~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- bash -c '
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ENDPOINT=https://c8da9a44c29c435205b2ec133ee05f20.r2.cloudflarestorage.com
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID=fafbbe863abb74c59933f028095a04ce
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d" " -f1)"
  rclone lsf -R --files-only R2:windwardline-backups/levelflow-cloud/minute-bank/
  rclone copyto R2:windwardline-backups/levelflow-cloud/minute-bank/2026/09/minute-bank-20260921.tar.zst \
    ~/.local/share/levelflow-cloud/restore/minute-bank-20260921.tar.zst'
```

Verify it, then extract it:

```bash
cd ~/.local/share/levelflow-cloud/restore
zstd -t minute-bank-20260921.tar.zst
zstd -q --decompress --stdout minute-bank-20260921.tar.zst | tar -xf -
```

The archive holds one directory, `levelflow-minute-bank-snapshot-20260921`, laid out
as `.minute-bank/` is. To rebuild a lost bank, move that directory to
`<checkout>/.minute-bank`. To put one symbol back, copy its data file and sidecar
together, under the bank lock, from the checkout:

```bash
bash -c '. scripts/ops/bank-lock.sh && acquire_bank_lock .minute-bank &&
  cp ~/.local/share/levelflow-cloud/restore/levelflow-minute-bank-snapshot-20260921/EURUSD.{jsonl,state.json} .minute-bank/ &&
  release_bank_lock'
```

The pair travels together because the sidecar's `bars` and `recentKeys` describe that
data file. Bars banked after the snapshot leave with the replaced file. The next bank
run appends whatever the provider's three-day window still holds, since the restored
key window no longer lists those bars; anything older is gone. Run the restore proof
afterwards, then delete the restore directory.

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

### It runs `origin/main`, and names the checkout for its data

Since 2026-09-20 the job runs through `wl-repo-script`, as both backups already did.
It used to name a path in the shared checkout, so it ran whatever branch a concurrent
session had out at 07:20. The launcher extracts `origin/main` into a temporary tree,
and that tree carries code and no ignored data. That split takes more than the plist
to get right, because the bank touches four pieces of data and each would have
failed silently:

| Data | Resolved from | Unnamed, it would have |
| --- | --- | --- |
| the bank | `LEVELFLOW_CHECKOUT/.minute-bank` | been created in the temp tree by the bank's `mkdir -p`, filled, and deleted |
| `.fmp-state/usage/` and the legacy `.fmp-usage.json` | `scripts/checkoutState.ts` | read as empty — the governor believing nothing had been spent |
| `.fmp-state/breaker/` and the legacy `.fmp-circuit.json` | `scripts/checkoutState.ts` | read as closed, whatever the provider had said |
| `.fmp-state/runs/` | `scripts/checkoutState.ts` | held no clean-run marker, so the run gate re-ran the job at every login |

The plist passes `LEVELFLOW_CHECKOUT`. The daily script refuses a bank that does not
exist rather than creating one, `checkoutState.ts` refuses a named checkout that does
not exist, and `node_modules` is linked from the checkout rather than installed. Each
binary resolves that checkout inside its own error handling, so the refusal prints as
one line and exits 1. A tree with no ledger at all refuses every other spender; the
bank is never refused (§21c), so it names that tree in one line and banks.

One more defect surfaced only because the tree lives in `mktemp -d`. The bank's
entry guard compared `import.meta.url`, which Node resolves through symlinks, against
`process.argv[1]`, which it does not. Under `/var/folders` — a symlink into
`/private` on macOS — they never match, `main` is skipped, and the process exits 0
having banked nothing: twice a day, with a completed run logged each time.
`scripts/isEntryPoint.ts` compares real paths. Every script the pinned jobs run uses
it: the bank, the run gate (`scripts/fmpRunGate.ts`) and the sweep. Under the old guard
the gate printed nothing and exited 0, so every login ran the job, and
`--record-clean` wrote no marker while reporting success. The probe and the match
verifier use it too.

**No test may spend FMP bandwidth.** On 2026-09-20 the suite ran the daily script
against real FMP six times, and each time the keychain answered and a full roster was
fetched:

| UTC | Into | Cause |
| --- | --- | --- |
| 01:37:21, 01:37:31 | **the production bank** | two red runs of #658's lock test — before the lock, the script ignored `LEVELFLOW_BANK_DIR` |
| 01:53:47, 01:53:57 | sandboxes | mutations that let the script past the lock |
| 02:43:07, 02:43:51 | sandboxes | two red runs of #660's missing-bank test, before that refusal existed |

1,684,404 bars in all. One run measured in isolation later that night cost 41.5 MB
for 286,167 bars, which puts the six at about 244 MB. The two production runs
appended 2,894 bars through the bank's normal de-duplication: real bars, sidecars
matching their files, and no ordering violation among them. The #660 record first
said four runs and 270 MB; the four were only the sandboxes, and the figure was
divided out of a daily ledger that also held the cache top-up. Two barriers now
stand between the suite and the provider. `tests/support/noKeychain.ts` shadows `security` on `PATH`, so
no test can read the key. The script itself refuses a bank under a temporary root, so
a barrier the caller forgot still holds. The mutation run that proved them recorded
zero sandbox writes and an untouched ledger across eight mutations.

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
5xx, an error page where JSON belonged — is retried. The status is read from the
start of the message even when the provider's body follows it; until 2026-09-16 a
suspension and a rejected key carried their body and were retried five times each.

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
