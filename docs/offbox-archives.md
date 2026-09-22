# Off-box archives

Two R2 buckets on the Windward Line account (`c8da9a44c29c435205b2ec133ee05f20`),
both ENAM, both reached with one credential: `cloudflare-r2-backup` in the Keychain,
delivered by `wl-secret` as `R2_TOKEN`.

| Bucket | Holds | Retention | Written by |
| --- | --- | --- | --- |
| `windwardline-backups` | Dailies: `levelflow-cloud/minute-bank/`, `levelflow-cloud/postgres/` | 60 per writer, pruned by the writer. The lifecycle rule `expire-backups-after-365-days` (prefix `""`) then deletes every object 365 days after upload, whatever its name | `push-minute-bank-offbox.sh`, `backup-postgres-offbox.sh` |
| `windwardline-archives` | Permanent archives: `levelflow-cloud/<dataset>/<basename>.tar.zst` | No expiry rule. An indefinite bucket lock (prefix `""`) once the first pushes are verified. Write-once, and never pruned by any script | `push-archive-offbox.sh` |

A daily expires. Name-protection keeps `minute-bank-20260823` out of this repo's prune
and does nothing else: R2 deletes it from `windwardline-backups` around 2027-09-02.
Anything that must outlive a year belongs in `windwardline-archives`.

No script deletes from the permanent bucket. The two pruning scripts refuse any bucket
whose first path segment is `windwardline-archives` — rclone reads everything after
`R2:` as bucket plus path, so an exact-name refusal is walked past by one suffix — and
`tests/archiveOffbox.test.ts` reads every file in `scripts/ops/`, joining line
continuations, and fails any destructive rclone call that could reach it.

## Push

Run from `origin/main`. The script delivers its own credential, so `wl-secret` is not
on this line:

```
~/.local/bin/wl-repo-script /Users/peacock/Projects/levelflow-cloud \
  scripts/ops/push-archive-offbox.sh <source-dir> <dataset>
```

It re-execs itself through `~/.local/bin/wl-secret` once its refusals have run, so the
token reaches the pusher and not the launcher's `git fetch`, `git archive` or `tar`.
`backup-minute-bank.sh` and `backup-postgres-offbox.sh` have the same shape.
`wl-secret` starts the child under `env -i`, so the script passes its own settings
across as arguments to `/usr/bin/env`. `LEVELFLOW_ARCHIVE_STAGING`, for one, still
applies after the re-exec.

The script refuses, by name and before it reads the credential: a missing source, a
dataset outside `^[a-z0-9-]+$`, a source under a temp root bound for the permanent
bucket, a missing `zstd` or `rclone`, and a staging root that is the home folder or
sits inside the source. Before its first write it refuses a staging filesystem that
cannot hold an archive of the source beside its restore, by upper bound, with 1 GiB
left for the rest of the machine.

**A new key is proven before it is written.** The script builds
`tar --format=ustar | zstd -19 -T0` in `~/.local/share/levelflow-cloud/staging/push.XXXXXX`,
runs `zstd -t`, requires the tar listing to hold as many files as the source, extracts
the archive there and requires `diff -rq` against the source to be empty. Only then does
it check the space again and upload with `copyto --immutable`, and the object R2 returns
must be byte-identical to what was sent. Under the lock the order is the guarantee: a
proof that failed after the upload would leave an object no later run could prove or
replace.

**An existing key is never rebuilt.** It is streamed back, extracted and compared with
`diff -rq` against the source, and nothing is written. `brew upgrade --formula` moves
`tar` and `zstd` daily, so a rebuild would stop reproducing last year's bytes and prove
nothing about the object R2 holds. The register records that object's md5 and bytes.

Only a clean diff prints the register row on stdout. Staging is removed on every exit
path, signals included.

The build is long and silent. Measured 2026-09-21 on the minute-bank snapshot:
190,643,620 bytes to 14,194,704 in about 39 s at `zstd -19 -T0`, roughly 4.9 MB/s. At
that rate the 3.9 GB cache takes about 13 minutes and the 7.6 GB cache about 26. A
re-proof skips it.

Nothing may move or write the three sources while a push runs. A source that changes
before the upload fails the count or the local diff, and nothing is uploaded. Once an
object is at a key, the key belongs to that tree: a run whose source no longer restores
from it refuses, every time. **That basename is spent.** Archive a changed source under a
new directory name; the old object stays for as long as the lock does.

If the bytes R2 returns do not match what was sent, the object is already at its key.
Run again with the source unchanged: it takes the existing-key path and proves the object
by restoring it. If that refuses too, the object is damaged and the basename is spent.

Re-proof needs the source, so once a source is gone the script can no longer prove its
archive. The fleet cadence then carries it: CADENCE.md in windwardline/windwardline reads
both buckets' rules and matches every key and size against the register weekly, and
monthly streams each object back to match its md5.

`rclone hashsum` is not the proof. On a multipart object it reports metadata rclone
wrote itself.

The whole write-once branch turns on `rclone lsf` exiting 3 for a prefix that does not
exist, which is verified against rclone's local backend and not against R2. Before the
first push into a new dataset prefix, read it once and record the code:

```
~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- /bin/bash -c '
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ENDPOINT=https://c8da9a44c29c435205b2ec133ee05f20.r2.cloudflarestorage.com
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID=fafbbe863abb74c59933f028095a04ce
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d " " -f 1)"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
  rclone lsf --files-only "R2:windwardline-archives/$1/"; echo "exit $?"
' _ levelflow-cloud/calibration-cache
```

Expect 3. Any other non-zero code is a script change, not an operator retry: the push
would die at "an unreadable listing is not an absent key" and nothing would land.

## Restore

With the source still present, run the push again: it finds its own object, streams it
back and proves the restore, and changes nothing. Without the source, restore by hand
and check the md5 against the register before extracting:

```
~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- /bin/bash -c '
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ENDPOINT=https://c8da9a44c29c435205b2ec133ee05f20.r2.cloudflarestorage.com
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID=fafbbe863abb74c59933f028095a04ce
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d " " -f 1)"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
  rclone cat "R2:windwardline-archives/$1" > "$2/archive.tar.zst"
  md5 -q "$2/archive.tar.zst"
' _ <key> <empty-dest-dir>

zstd -dc <empty-dest-dir>/archive.tar.zst | tar -xf - -C <empty-dest-dir>
```

## Register

Each row is the line `push-archive-offbox.sh` prints on success, pasted over its
pending row. The last column is the date the restore last passed.

| Archive | Archive bytes | MD5 | Files | Source bytes | Restore proven (UTC) |
| --- | ---: | --- | ---: | ---: | --- |
| `windwardline-archives/levelflow-cloud/calibration-cache/levelflow-cache-condemned-2026-08-11.tar.zst` | pending | pending | pending | pending | pending |
| `windwardline-archives/levelflow-cloud/calibration-cache/levelflow-cache-v3-preDateFix-20260824.tar.zst` | pending | pending | pending | pending | pending |
| `windwardline-archives/levelflow-cloud/minute-bank/levelflow-minute-bank-snapshot-20260823.tar.zst` | pending | pending | pending | pending | pending |

Bucket lock on `windwardline-archives`: pending, to be added after the three rows above
are filled.

### Sources

| Archive | Source on this machine | Why it is kept |
| --- | --- | --- |
| `levelflow-cache-condemned-2026-08-11` | `~/.local/share/levelflow-cloud/archives/levelflow-cache-condemned-2026-08-11` (3.9 GB, 313 files) | The only real naive-era cache. It validated the clock-witness redesign against real data on 2026-08-24. Deleting it is an owner call (`docs/HANDOFF.md`, R0b row) |
| `levelflow-cache-v3-preDateFix-20260824` | `~/.local/share/levelflow-cloud/archives/levelflow-cache-v3-preDateFix-20260824` (7.6 GB, 311 files) | `verify-rebuild-depth --reference` against it reports 24 stores / 10,850 rows master did not recover |
| `levelflow-minute-bank-snapshot-20260823` | `~/.local/share/levelflow-cloud/minute-bank-snapshots/levelflow-minute-bank-snapshot-20260823` (200 files, 190,643,620 bytes) | The naive-era minute bank. Its daily copy in `windwardline-backups` expires around 2027-09-02 |

Paths measured 2026-09-21. The snapshot moved out of `~` that day; `ls -d` both its old
and new path before a push rather than trusting this row.
