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

No script deletes from the permanent bucket. The two pruning scripts strip `BUCKET`'s
leading slashes, as rclone does, then refuse any bucket whose first path segment is
`windwardline-archives`: rclone reads everything after `R2:` as bucket plus path, so an
exact-name refusal is walked past by one suffix. `tests/archiveOffbox.test.ts` reads
every file in `scripts/ops/` as the shell would and fails closed on any rclone call it
cannot place. It pins which files may write to R2: the two pruners, which refuse this
bucket first, and the archive push, which writes once.

## Push

Run from `origin/main`. The script delivers its own credential, so `wl-secret` is not
on this line:

```
~/.local/bin/wl-repo-script /Users/peacock/Projects/levelflow-cloud \
  scripts/ops/push-archive-offbox.sh <source-dir> <dataset>
```

It re-execs itself through `~/.local/bin/wl-secret`, so the token reaches the pusher and
not the launcher's `git fetch`, `git archive` or `tar`. `backup-minute-bank.sh` and
`backup-postgres-offbox.sh` have the same shape. `wl-secret` starts the child under
`env -i`, so the script passes its own settings across as arguments to `/usr/bin/env`.
`LEVELFLOW_ARCHIVE_STAGING`, for one, still applies after the re-exec.

Before it reads the credential it refuses, by name: a missing source, a dataset outside
`^[a-z0-9-]+$`, a source name that cannot become a key, a bad bucket or prefix, a source
under a temp root bound for the permanent bucket, a missing `zstd` or `rclone`, and a
source holding anything but regular files and directories.
After the credential and before any rclone call it refuses a staging root that is the
home folder, resolves to `/` or sits inside the source; a key another run holds; and a
source with no files. After the listing, each branch checks the space it will use
before it writes. A new key needs an archive of the source beside its restore, bounded
as if the archive did not compress, with 1 GiB left for the rest of the machine: 9.43 GB
for the condemned cache, 17.57 GB for the v3-preDateFix cache, 1.46 GB for the snapshot,
measured 2026-09-22. A re-proof needs only the object it lists beside the restore:
a row's Archive bytes plus its Source bytes, 4 KiB per entry and 1 GiB.
`LEVELFLOW_ARCHIVE_STAGING` names staging on another filesystem.

**A new key is proven before it is written.** The script builds
`tar --format=ustar | zstd -19 -T0` in `~/.local/share/levelflow-cloud/staging/push.XXXXXX`,
runs `zstd -t`, requires the tar listing to hold as many files as the source, extracts
the archive there and requires `diff -rq` against the source to be empty. Only then does
it check the space again and upload. The object R2 returns must be byte-identical to
what was sent. Under the lock the order is the guarantee: a proof that failed after the
upload would leave an object no later run could prove or replace.

**Nothing replaces an object.** A run holds `lock.<bucket>%<key>` in the staging root,
so two runs on this machine cannot race to one key; one a killed run left is named, not
broken. The upload is `copyto --ignore-existing`, which leaves an existing key alone,
and the md5 check then refuses. Not `--immutable`: rclone checks that flag only when it
walks a directory, and `copyto` of one file replaced a different object and exited 0
(v1.75.1, local and S3 backends, 2026-09-22). The bucket lock is the last barrier.

**An existing key is never rebuilt.** zstd moves with the daily `brew upgrade
--formula` and tar (`/usr/bin/tar`) with macOS, so a rebuild would stop reproducing
last year's bytes and prove nothing about the object. The script checks the object's
listed size against the largest archive the source could make and against the free
space, streams it back, and requires the returned length to match the listing. Then it
tests it with `zstd -t`, lists it as a tar, and requires it to hold no more entries
than the source and to unpack to no more than the largest tar the source could make.
It reserves the stream's bytes plus a block per entry, and only then extracts it and
compares it with `diff -rq`.
The register records that object's md5 and bytes.

A verdict against the object needs the object to fail on its own: damaged bytes, a tar
that does not list, more entries or more bytes than the source could make, packed or
unpacked, or a restored tree that differs from the source. Then the refusal says **the basename is spent**. Archive a
changed source under a new directory name; the old object stays as long as the lock
does. A short transfer, an extraction that fails here, or a `diff` that cannot run
decides nothing about the object: fix the local cause and run again.

If the bytes R2 returns after an upload do not match what was sent, the object is
already at its key, or another object reached the key after the listing and the upload
left it alone. Run again with the source unchanged: it takes the existing-key path and
proves the object by restoring it.

Nothing may move or write the three sources while a push runs. A change the count or the
local diff sees stops the run before the upload. The archive is the tree the diff read.

Only a clean diff prints the register row on stdout. Staging and the key lock are removed
on every exit path this run can see, signals included.

The build is long and silent. Measured 2026-09-21 on the minute-bank snapshot:
190,643,620 bytes to 14,194,704 in about 39 s at `zstd -19 -T0`, roughly 4.9 MB/s. At
that rate the condemned cache (4,159,601,762 bytes) takes about 14 minutes and the
v3-preDateFix cache (8,213,923,007 bytes) about 28. A re-proof skips it.

`rclone hashsum` is not the proof. On a multipart object it reports metadata rclone
wrote itself.

On R2 a prefix that holds nothing lists empty and exits 0; exit 3 means the bucket
itself was not found, and the script refuses it by name (both measured against
`windwardline-archives` on 2026-09-22). Before the first push into a new dataset prefix,
read it once:

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

Expect no output and exit 0. Exit 3 is the bucket or the credential's scope; any other
code is an unreadable listing, and the push refuses it.

## Restore

With the source still present and still free of links and special files, run the push
again: it finds its own object, streams it back and proves the restore, and changes
nothing. Without the source, restore by hand
from the register's Archive column, and check the md5 against the register before
extracting:

```
~/.local/bin/wl-secret cloudflare-r2-backup=R2_TOKEN -- /bin/bash -c '
  set -euo pipefail
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ENDPOINT=https://c8da9a44c29c435205b2ec133ee05f20.r2.cloudflarestorage.com
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID=fafbbe863abb74c59933f028095a04ce
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d " " -f 1)"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
  rclone cat "R2:$1" > "$2/archive.tar.zst"
  md5 -q "$2/archive.tar.zst"
' _ <archive-column> <empty-dest-dir>

zstd -dc <empty-dest-dir>/archive.tar.zst | tar -xf - -C <empty-dest-dir>
```

Re-proof needs the source, so once a source is gone the script can no longer prove its
archive. The fleet cadence then carries it: step 5 of CADENCE.md in
windwardline/windwardline reads both buckets' rules and matches every key and size
against the register weekly, and its monthly section streams each object back to match
its md5 (windwardline/windwardline#117, merged before this runbook's first push). No
source leaves this machine before its row is filled and the lock is on.

## Register

Each row is the line `push-archive-offbox.sh` prints on success, backticks included,
pasted over its pending row. Source bytes sums every file, a hard link once per name. Last proven is
the date the script's restore passed, or a later monthly stream-back matched the md5.

| Archive | Archive bytes | MD5 | Files | Source bytes | Last proven (UTC) |
| --- | ---: | --- | ---: | ---: | --- |
| `windwardline-archives/levelflow-cloud/calibration-cache/levelflow-cache-condemned-2026-08-11.tar.zst` | 531361803 | 1c67c6747c2b2076333af605c028b895 | 313 | 4159601762 | 2026-09-22 |
| `windwardline-archives/levelflow-cloud/calibration-cache/levelflow-cache-v3-preDateFix-20260824.tar.zst` | 1025065828 | 5c2da51d92d26bed3e7a2986e2b07636 | 311 | 8213923007 | 2026-09-22 |
| `windwardline-archives/levelflow-cloud/calibration-cache/levelflow-cache-v4-20260922.tar.zst` | 1034173076 | ba069959b977bbacd8e155071e3925c0 | 310 | 8291450783 | 2026-09-22 |
| `windwardline-archives/levelflow-cloud/minute-bank/levelflow-minute-bank-snapshot-20260823.tar.zst` | 14194704 | d777df47dc62d26c09e21e8d84d88493 | 200 | 190643620 | 2026-09-22 |
| `windwardline-archives/levelflow-cloud/rebuild-logs/levelflow-rebuild-logs-20260824.tar.zst` | 6391 | e62d4ac82faee7760604ce4dd959a794 | 4 | 79567 | 2026-09-25 |

Bucket lock on `windwardline-archives`: rule `lock-archives-indefinitely`, prefix `""`,
condition `Indefinite`, set 2026-09-22 after the first three pushes (the condemned
cache, the v3-preDateFix cache and the snapshot) were filled in and a listing matched
every key and size to them. Last, not first: until those pushes were proven, a hand
delete was the only way back from a mistake. Every later push, starting with
`levelflow-cache-v4-20260922` at 22:59:05Z the same day, lands under the lock, where
the script's order is the only guarantee: the archive is restored and compared in
staging before the upload, because a key cannot be written twice.

### Sources

The three cache sources went to the Trash on 2026-09-22, each after its object was
proven (the v4 source was an APFS clone of the live cache); emptying it is the
owner's call. The snapshot stays where it is: `backup-minute-bank.sh` counts it in
parity and spares it by name.

| Archive | Source on this machine | Why it is kept |
| --- | --- | --- |
| `levelflow-cache-condemned-2026-08-11` | `~/.local/share/levelflow-cloud/archives/levelflow-cache-condemned-2026-08-11` (4,159,601,762 bytes, 313 files) | The only real naive-era cache. It validated the clock-witness redesign against real data on 2026-08-24. Deleting it is an owner call (`docs/HANDOFF.md`, R0b row) |
| `levelflow-cache-v3-preDateFix-20260824` | `~/.local/share/levelflow-cloud/archives/levelflow-cache-v3-preDateFix-20260824` (8,213,923,007 bytes, 311 files) | `verify-rebuild-depth --reference` against it reports 24 stores / 10,850 rows master did not recover |
| `levelflow-cache-v4-20260922` | An APFS clone of the live `.calibration-cache` taken 2026-09-22 just before the push began at 22:59:05Z, between top-ups (8,291,450,783 bytes, 310 files); the clone went to the Trash once the object was proven | The v4 cache is the input to every corpus of record since the 2026-08-25 rebuild, including the pinned 2026-08-26 slice the act-3 read and the 2026-09-14 re-simulate were built on. A rebuild costs about fourteen metered hours and does not reproduce the depth (the rebuild-depth rule). Round 1 adopted one archive per cache state |
| `levelflow-minute-bank-snapshot-20260823` | `~/.local/share/levelflow-cloud/minute-bank-snapshots/levelflow-minute-bank-snapshot-20260823` (190,643,620 bytes, 200 files) | The naive-era minute bank. Its daily copy in `windwardline-backups` expires around 2027-09-02 |
| `levelflow-rebuild-logs-20260824` | `~/.local/share/levelflow-cloud/archives/levelflow-rebuild-logs-20260824` (79,567 bytes, 4 files: copies of the four R0 rebuild logs, scanned for key material before the push, none found) | The August cache rebuild's own account of what it fetched and refused. The originals stay at the paths `docs/HANDOFF.md` and `docs/cache-rebuild-r0.md` cite; the pushed copy is the one that survives this machine |

Measured 2026-09-22: no hard links, symlinks or special files in any of the four (the
v4 clone was measured on the live cache it was cloned from, and compared to it with
`diff -rq`). The
script refuses a source holding anything but regular files and directories: `diff -rq`
follows a symlink, so it would prove the target rather than the link.
