#!/usr/bin/env bash
# A PERMANENT off-box archive: one directory in, one write-once object out.
#
# WHY A SECOND BUCKET. windwardline-backups carries the lifecycle rule
# expire-backups-after-365-days over prefix "", so R2 deletes every object in it
# a year after upload, whatever its name. push-minute-bank-offbox.sh keeps
# minute-bank-20260823 out of its own prune by name; R2 deletes it anyway around
# 2027-09-02. Datasets that must outlive every retention rule go here instead:
# windwardline-archives, with no expiry rule, an indefinite bucket lock added
# once the first pushes are verified, and no script that deletes from it.
#
#   windwardline-archives/<repo>/<dataset>/<basename>.tar.zst
#   windwardline-archives/levelflow-cloud/calibration-cache/levelflow-cache-condemned-2026-08-11.tar.zst
#
# docs/offbox-archives.md is the register. Each row is the one line this script
# prints on stdout, and it prints it only after the restore below has passed.
#
# PROVEN, THEN WRITTEN ONCE. The bucket lock makes every object permanent, so a
# proof that ran after the upload and failed would leave an object that can
# never pass at a key that can never be reused. On a new key the archive is
# built, extracted in staging and compared with the source by `diff -rq`, and
# only a clean diff reaches the upload; the object R2 then returns must be
# byte-identical to what was sent.
#
# NOTHING REPLACES AN OBJECT. A run holds a lock on its key, so two runs on
# this machine cannot race to one key. The upload is `copyto --ignore-existing`,
# which leaves a key that exists alone; the md5 check after it then refuses. NOT
# `--immutable`: rclone checks that flag only when it walks a directory, and
# `copyto` of one file replaced a different object and exited 0 (v1.75.1, local
# and S3 backends, 2026-09-22). The bucket lock is the last barrier.
#
# AN EXISTING KEY IS NEVER REBUILT. The object is streamed back, extracted, and
# compared with the source; that restore is the proof, and nothing is written.
# A rebuild would prove nothing about the object: the archive is deterministic
# for one build of the tools — ustar (no pax atime, no xattrs),
# COPYFILE_DISABLE (no AppleDouble entries), a fixed zstd level — and zstd moves
# with the daily `brew upgrade --formula`, tar (/usr/bin/tar) with macOS, so last
# year's bytes stop being reproducible. The register row records the object R2
# holds. A failure there is the object's only when the object itself fails:
# damaged bytes, or a tree that differs from the source. A failure to extract
# or compare here decides nothing about it.
#
# THE PROOF IS A RESTORE. `rclone hashsum` on a multipart object reports
# metadata rclone wrote itself, so it says nothing about the bytes R2 holds;
# the object is read back instead (R2 egress is free).
#
# CREDENTIALS exactly as push-minute-bank-offbox.sh: the S3 secret is R2_TOKEN's
# SHA-256 computed here, rclone is configured only through RCLONE_CONFIG_*
# variables so no rclone.conf is written, and the token never reaches argv or a
# log. The script DELIVERS ITS OWN, by absolute path, as backup-minute-bank.sh
# and backup-postgres-offbox.sh do: wl-secret wrapped around the launcher would
# put the token in the environment of every process the launcher runs — git
# fetch, git archive, tar — and only this one needs it.
#
# A TEMP SOURCE NEVER REACHES THE PERMANENT BUCKET. On 2026-09-01 a test
# fixture reached production storage because a sandbox path produced a
# production key. Under an indefinite lock that fixture could never be removed,
# so a source under a temp root is refused whenever the bucket is
# windwardline-archives. The tests reach a fake bucket through a stubbed rclone.
#
# STAGING defaults to $HOME/.local/share/levelflow-cloud/staging: named, off the
# temp roots, never the home folder itself. Each run makes its own push.XXXXXX
# there and removes it on every exit path, signals included. Its free space is
# checked before the first byte is written and again before the upload.
#
# Logs go to stderr. stdout carries the register row and nothing else.
set -euo pipefail
export LC_ALL=C
unset CDPATH

PERMANENT="windwardline-archives"
BUCKET="${LEVELFLOW_ARCHIVE_BUCKET:-$PERMANENT}"
PREFIX="${LEVELFLOW_ARCHIVE_PREFIX:-levelflow-cloud}"
ACCOUNT="${LEVELFLOW_R2_ACCOUNT:-c8da9a44c29c435205b2ec133ee05f20}"
ACCESS_KEY="${LEVELFLOW_R2_ACCESS_KEY:-fafbbe863abb74c59933f028095a04ce}"
[[ -n ${HOME:-} ]] || { echo "archive: FAIL HOME is unset" >&2; exit 1; }
STAGING_ROOT="${LEVELFLOW_ARCHIVE_STAGING:-$HOME/.local/share/levelflow-cloud/staging}"
# The level the minute bank and the Postgres dump already use. Fixed, not a
# knob: a different level is a different object at the same key.
LEVEL=19

log() { echo "$(date -u +%FT%TZ) archive: $*" >&2; }
die() { log "FAIL $*"; exit 1; }

# The first three lines of an rclone error, without its config-file notice.
rclone_error() { grep -v 'Config file' "$1" 2>/dev/null | head -n 3 | tr '\n' ' ' || true; }

md5_of() {
  if command -v md5sum >/dev/null 2>&1; then
    md5sum < "$1" | cut -d ' ' -f 1
  else
    md5 -q "$1"
  fi
}

# Free bytes on the filesystem holding staging. The value is read beside the
# capacity column, so a filesystem name with a space in it cannot shift it.
free_bytes() {
  df -Pk "$STAGING_REAL" | awk 'NR == 2 { for (i = NF; i > 1; i--) if ($i ~ /^[0-9]+%$/) { if ($(i - 1) ~ /^[0-9]+$/) printf "%.0f\n", $(i - 1) * 1024; exit } }'
}

# require_space <bytes> <what they are for>
require_space() {
  local avail
  avail="$(free_bytes)" || die "cannot read the free space under $STAGING_ROOT"
  [[ $avail =~ ^[0-9]+$ ]] || die "cannot read the free space under $STAGING_ROOT: df gave '$avail'"
  (( avail >= $1 )) \
    || die "$STAGING_ROOT has $avail bytes free and $2 needs $1, keeping $HEADROOM for the rest of the machine; refusing before a write that could not finish. Name staging on a filesystem with room through LEVELFLOW_ARCHIVE_STAGING, which survives the re-exec"
}

# Bash `[[ ]]` and no quoted argument after a bare directory test flag: the
# tracked-shell sweep in tests/securityHardening.test.ts reads that spelling
# as a request body on argv. See backup-minute-bank.sh for the long form.
under_temp() {
  local path="$1/" t
  case "$path" in
    /tmp/*|/private/tmp/*|/var/tmp/*|/private/var/tmp/*|/var/folders/*|/private/var/folders/*|/dev/shm/*) return 0 ;;
  esac
  t="${TMPDIR:-}"
  t="${t%/}"
  [[ -n $t ]] || return 1
  case "$path" in "$t"/*) return 0 ;; esac
  return 1
}

# The re-exec guard is an ARGUMENT, not an environment variable: wl-secret runs
# the child through `env -i`, so a variable set here would not survive to be
# read on the other side and the script would re-exec forever.
DELIVERED=0
if [[ ${1:-} == --secrets-delivered ]]; then
  DELIVERED=1
  shift
fi

[[ $# -eq 2 ]] || die "usage: push-archive-offbox.sh <source-dir> <dataset>"
SOURCE="$1"
DATASET="$2"

[[ -d $SOURCE ]] || die "source directory does not exist: $SOURCE"
DATASET_RE='^[a-z0-9-]+$'
[[ $DATASET =~ $DATASET_RE ]] || die "dataset name must match ^[a-z0-9-]+\$: '$DATASET'"

case $SOURCE in /*) SOURCE_ABS="$SOURCE" ;; *) SOURCE_ABS="$PWD/$SOURCE" ;; esac
SOURCE_ABS="${SOURCE_ABS%/}"
SRC="$(cd -P -- "$SOURCE" && pwd -P)" || die "cannot resolve $SOURCE"
NAME="${SRC##*/}"
PARENT="${SRC%/*}"
[[ -n $PARENT ]] || PARENT=/
NAME_RE='^[A-Za-z0-9][A-Za-z0-9._-]*$'
[[ $NAME =~ $NAME_RE ]] || die "the source's name cannot become a key: '$NAME'"
BUCKET_RE='^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
[[ $BUCKET =~ $BUCKET_RE ]] || die "not a bucket name: '$BUCKET'"
PREFIX_RE='^[a-z0-9-]+(/[a-z0-9-]+)*$'
[[ $PREFIX =~ $PREFIX_RE ]] || die "not a key prefix: '$PREFIX'"
KEY="$PREFIX/$DATASET/$NAME.tar.zst"

if [[ $BUCKET == "$PERMANENT" ]] && { under_temp "$SRC" || under_temp "$SOURCE_ABS"; }; then
  die "refusing to archive a source under a temp directory into $PERMANENT: $SOURCE — that is a sandbox, and the lock would keep the fixture forever"
fi

command -v zstd >/dev/null || die "zstd is not installed (brew install zstd)"
command -v rclone >/dev/null || die "rclone is not installed (brew install rclone)"

# REGULAR FILES AND DIRECTORIES ONLY. diff -rq follows a symlink, so it would
# prove the link's target rather than the link, and a dangling one would make
# every comparison "could not run" forever. The three datasets this was built
# for hold none (measured 2026-09-22); a source that does is refused here, by
# name, rather than half-proven.
OTHER="$(find "$SRC" ! -type f ! -type d -print -quit)" || die "cannot scan $SRC"
[[ -z $OTHER ]] \
  || die "the source holds an entry that is neither a file nor a directory ($OTHER); the restore proof compares file contents and cannot prove a symlink, fifo or device, so this script refuses such a source. An object already archived from it is unaffected: the register's md5 and the fleet cadence's monthly stream-back cover it. Archive a source that must hold links from a link-free copy under a new directory name"

# --- self-delivery of the credential -----------------------------------------
# Last of the pre-flight, so every refusal above runs BEFORE the Keychain is
# read. wl-secret is located by ABSOLUTE PATH: ~/.local/bin joins PATH in
# ~/.zshrc, which a launchd `/bin/zsh -lc` never sources, and a PATH lookup
# that works from every interactive shell failed in the one environment a
# schedule runs from (2026-09-02T05:36:29Z, backup-minute-bank.sh).
if [[ -z ${R2_TOKEN:-} ]]; then
  [[ $DELIVERED == 0 ]] || die "wl-secret ran and R2_TOKEN is still unset; refusing to re-exec again"
  WL_SECRET="${LEVELFLOW_WL_SECRET:-$HOME/.local/bin/wl-secret}"
  [[ -x $WL_SECRET ]] || die "wl-secret is not executable at $WL_SECRET; the R2 token cannot be read (set LEVELFLOW_WL_SECRET to relocate it)"
  # wl-secret's `env -i` keeps HOME, USER, PATH, LANG and TMPDIR and nothing
  # else. Every setting resolved above rides across as an argument to env, or
  # an operator's LEVELFLOW_ARCHIVE_STAGING would be replaced by the default
  # without a word on the only path a real run takes.
  exec "$WL_SECRET" cloudflare-r2-backup=R2_TOKEN -- /usr/bin/env \
    LEVELFLOW_ARCHIVE_BUCKET="$BUCKET" LEVELFLOW_ARCHIVE_PREFIX="$PREFIX" \
    LEVELFLOW_ARCHIVE_STAGING="$STAGING_ROOT" LEVELFLOW_R2_ACCOUNT="$ACCOUNT" \
    LEVELFLOW_R2_ACCESS_KEY="$ACCESS_KEY" "$0" --secrets-delivered "$@"
fi

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="https://$ACCOUNT.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY"
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d' ' -f1)"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY

# --- staging ------------------------------------------------------------------
# Checked lexically BEFORE mkdir, so a refused root inside the source is never
# created there, and again physically after, which is where symlinks resolve.
case $STAGING_ROOT in /*) ;; *) STAGING_ROOT="$PWD/$STAGING_ROOT" ;; esac
STAGING_ROOT="${STAGING_ROOT%/}"
case "$STAGING_ROOT/" in
  "$SRC"/*|"$SOURCE_ABS"/*) die "staging root $STAGING_ROOT is inside the source; the archive would read itself" ;;
esac
mkdir -p "$STAGING_ROOT" || die "cannot create staging root $STAGING_ROOT"
STAGING_REAL="$(cd -P -- "$STAGING_ROOT" && pwd -P)" || die "cannot resolve staging root $STAGING_ROOT"
HOME_REAL="$(cd -P -- "$HOME" 2>/dev/null && pwd -P || true)"
[[ $STAGING_REAL != / ]] || die "staging root resolves to /"
[[ $STAGING_REAL != "$HOME_REAL" ]] || die "staging root is the home folder itself: $STAGING_ROOT — name a directory under it"
case "$STAGING_REAL/" in
  "$SRC"/*) die "staging root $STAGING_ROOT is inside the source; the archive would read itself" ;;
esac

STAGE=""
KEY_LOCK=""
KEY_LOCK_HELD=0
cleanup() {
  if [[ $KEY_LOCK_HELD == 1 ]]; then
    rmdir "$KEY_LOCK" 2>/dev/null || true
    KEY_LOCK_HELD=0
  fi
  [[ -n $STAGE && -d $STAGE ]] || return 0
  case $STAGE in "$STAGING_ROOT"/push.?*) ;; *) log "FAIL refusing to remove unexpected staging path $STAGE"; exit 1 ;; esac
  chmod -R u+w "$STAGE" 2>/dev/null || true
  # `|| true`, because errexit on a failed rm would skip the named report below
  # and leave the caller with a bare exit status for a directory still on disk.
  rm -rf "$STAGE" || true
  if [[ -e $STAGE ]]; then
    log "FAIL could not remove staging $STAGE; remove it by hand"
    exit 1
  fi
}
# A signal must reach the EXIT trap: bash killed by an untrapped TERM runs no
# trap at all, and would leave a staging copy the size of the source behind.
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

for leftover in "$STAGING_ROOT"/push.*; do
  [[ -e $leftover ]] || continue
  log "WARNING $leftover belongs to another run; if no push is running, a killed run left it"
done
MADE="$(cd "$STAGING_ROOT" && mktemp -d push.XXXXXX)" || die "cannot create a staging directory under $STAGING_ROOT"
[[ $MADE == push.?* ]] || die "mktemp returned an unexpected name: $MADE"
STAGE="$STAGING_ROOT/$MADE"

# One run per key. `mkdir` is atomic; the lock is released on every exit path
# this run can see, and one a killed run left is named rather than broken.
KEY_LOCK="$STAGING_ROOT/lock.$(printf %s "$BUCKET/$KEY" | tr '/' '%')"
mkdir "$KEY_LOCK" 2>/dev/null \
  || die "another push holds R2:$BUCKET/$KEY ($KEY_LOCK); if none is running, a killed run left it: remove it by hand"
KEY_LOCK_HELD=1

# --- count, and the space the run needs --------------------------------------
FILES="$(find "$SRC" -type f | wc -l | tr -d ' ')" || die "cannot count the files in $SRC"
[[ $FILES -gt 0 ]] || die "the source holds no files: $SRC — refusing to archive nothing"
DIRS="$(find "$SRC" -type d | wc -l | tr -d ' ')" || die "cannot count the directories in $SRC"
ENTRIES="$(find "$SRC" | wc -l | tr -d ' ')" || die "cannot count the entries in $SRC"
SRC_BYTES="$(find "$SRC" -type f -exec wc -c {} \; | awk '{ s += $1 } END { printf "%.0f\n", s }')" \
  || die "cannot measure $SRC"
log "source $SRC: $FILES files in $DIRS directories, $SRC_BYTES bytes"

# Upper bounds, so a check needs no archive yet. ustar spends a 512-byte
# header and at most 511 bytes of padding per entry plus a 10240-byte end
# block; zstd's own bound adds 1/256 and a frame. A restore takes the source's
# bytes and at most one 4 KiB block more per entry. An entry is anything tar
# writes a header for. The refusal above keeps symlinks and fifos out, so today
# ENTRIES equals FILES + DIRS; the budget stays per entry so it holds if that
# refusal is ever narrowed. Each branch below checks
# its own peak before it writes: a new key an archive beside its restore, then
# the returned copy beside the archive once the restore is gone; an existing
# key the object it lists beside the restore. HEADROOM stays free for
# everything else on the machine.
HEADROOM=1073741824
TAR_MAX=$(( SRC_BYTES + ENTRIES * 1024 + 10240 ))
ARCHIVE_MAX=$(( TAR_MAX + TAR_MAX / 256 + 1048576 ))
RESTORE_MAX=$(( SRC_BYTES + ENTRIES * 4096 ))

# --- is the key taken? ----------------------------------------------------------
# On R2 a prefix that holds nothing lists empty and exits 0; exit 3 means the
# bucket itself was not found (measured 2026-09-22). Every other failure is a
# failure: an unreadable listing is not an absent key, and reading it as one is
# how an upload would reach an object it should have compared first.
DIR="$PREFIX/$DATASET"
LIST_RC=0
LISTING="$(rclone lsf --files-only --format sp "R2:$BUCKET/$DIR/" 2>"$STAGE/lsf.err")" || LIST_RC=$?
case $LIST_RC in
  0) ;;
  3) die "R2:$BUCKET was not found (rclone exit 3): $(rclone_error "$STAGE/lsf.err") — an absent prefix lists empty with exit 0, so this is the bucket; check LEVELFLOW_ARCHIVE_BUCKET and the credential's scope" ;;
  *) die "cannot list R2:$BUCKET/$DIR/ (rclone exit $LIST_RC): $(rclone_error "$STAGE/lsf.err") — an unreadable listing is not an absent key" ;;
esac
EXISTS=0
OBJECT_BYTES=""
while IFS= read -r entry; do
  [[ -n $entry ]] || continue
  if [[ ${entry#*;} == "$NAME.tar.zst" ]]; then
    EXISTS=1
    OBJECT_BYTES="${entry%%;*}"
  fi
done <<< "$LISTING"
if [[ $EXISTS == 1 ]]; then
  [[ $OBJECT_BYTES =~ ^[0-9]+$ ]] || die "the listing gave no size for R2:$BUCKET/$KEY: '$OBJECT_BYTES'"
fi

MD5_RE='^[0-9a-f]{32}$'
RETURNED="$STAGE/returned.tar.zst"
RESTORE="$STAGE/restore"

fetch_back() {
  rclone cat "R2:$BUCKET/$KEY" > "$RETURNED" 2>"$STAGE/cat.err" \
    || die "cannot stream R2:$BUCKET/$KEY back: $(rclone_error "$STAGE/cat.err")${FETCH_HINT:-}"
  REMOTE_MD5="$(md5_of "$RETURNED")" || die "cannot hash the returned object${FETCH_HINT:-}"
  [[ $REMOTE_MD5 =~ $MD5_RE ]] || die "not an md5: '$REMOTE_MD5'${FETCH_HINT:-}"
  REMOTE_BYTES="$(wc -c < "$RETURNED" | tr -d ' ')"
}

# restore_and_compare <archive>: extract into staging and compare with the
# source. Sets WHY to the reason it failed, or to nothing, and WHY_KIND to
# "local" when the failure is here (an extraction or a comparison that could
# not run) or "mismatch" when the tree it restored is not the source.
restore_and_compare() {
  mkdir "$RESTORE" || die "cannot create $RESTORE"
  WHY=""
  WHY_KIND=""
  if ! zstd -q -dc "$1" | tar -xf - -C "$RESTORE"; then
    WHY="it did not extract here"
    WHY_KIND="local"
  elif [[ "$(ls -A "$RESTORE")" != "$NAME" ]]; then
    WHY="the restored tree does not hold $NAME alone: $(ls -A "$RESTORE" | tr '\n' ' ')"
    WHY_KIND="mismatch"
  else
    local diff_rc=0 diff_out
    diff_out="$(diff -rq "$SRC" "$RESTORE/$NAME" 2>&1)" || diff_rc=$?
    if [[ $diff_rc == 1 ]]; then
      WHY="the restored tree differs from the source: $(printf '%s\n' "$diff_out" | head -n 5 | tr '\n' ' ')"
      WHY_KIND="mismatch"
    elif [[ $diff_rc != 0 || -n $diff_out ]]; then
      WHY="diff could not compare the trees (exit $diff_rc): $(printf '%s\n' "$diff_out" | head -n 5 | tr '\n' ' ')"
      WHY_KIND="local"
    fi
  fi
}

SPENT="Refusing to overwrite a permanent archive: this basename's key is spent, and a changed source is archived under a new directory name"

if [[ $EXISTS == 1 ]]; then
  # --- an existing key: restore what R2 holds -----------------------------------
  (( OBJECT_BYTES <= ARCHIVE_MAX )) \
    || die "R2:$BUCKET/$KEY is $OBJECT_BYTES bytes, more than any archive of this source can be ($ARCHIVE_MAX): it holds another tree. $SPENT"
  require_space $(( OBJECT_BYTES + RESTORE_MAX + HEADROOM )) "the existing object beside its restore"
  log "R2:$BUCKET/$KEY exists ($OBJECT_BYTES bytes); streaming it back to prove it restores to the source"
  fetch_back
  [[ $REMOTE_BYTES == "$OBJECT_BYTES" ]] \
    || die "R2:$BUCKET/$KEY streamed back $REMOTE_BYTES bytes and lists $OBJECT_BYTES; the transfer failed, nothing was decided about the object, run again"
  zstd -q -t "$RETURNED" 2>/dev/null \
    || die "R2:$BUCKET/$KEY is damaged: its $REMOTE_BYTES bytes (md5 $REMOTE_MD5) fail zstd -t. $SPENT"
  LISTED_ENTRIES="$(zstd -q -dc "$RETURNED" | tar -tf - 2>/dev/null | wc -l | tr -d ' ')" \
    || die "R2:$BUCKET/$KEY does not list as a tar (md5 $REMOTE_MD5). $SPENT"
  # What it unpacks to, measured on the stream before a byte is extracted: the
  # object on this path may be another tree, and the space reserved above is
  # this source's. A tar of this source holds no more entries than the source
  # and cannot exceed TAR_MAX; within both, extracting costs at most the
  # stream's bytes plus a block per entry, and that is reserved before it runs.
  (( LISTED_ENTRIES <= ENTRIES )) \
    || die "R2:$BUCKET/$KEY lists $LISTED_ENTRIES entries, more than this source has ($ENTRIES): it holds another tree. $SPENT"
  UNPACKED="$(zstd -q -dc "$RETURNED" | wc -c | tr -d ' ')" || die "cannot measure what R2:$BUCKET/$KEY unpacks to"
  (( UNPACKED <= TAR_MAX )) \
    || die "R2:$BUCKET/$KEY unpacks to $UNPACKED bytes, more than a tar of this source can be ($TAR_MAX): it holds another tree. $SPENT"
  require_space $(( UNPACKED + LISTED_ENTRIES * 4096 + HEADROOM )) "restoring the existing object"
  restore_and_compare "$RETURNED"
  if [[ $WHY_KIND == local ]]; then
    die "could not compare R2:$BUCKET/$KEY with the source here: $WHY. The object passed zstd -t and lists as a tar; nothing was decided about it. Fix the local cause and run again"
  fi
  [[ -z $WHY ]] \
    || die "R2:$BUCKET/$KEY holds an object that does not restore to this source (md5 $REMOTE_MD5): $WHY. $SPENT"
  STATUS="already archived"
else
  # --- a new key: build, prove here, then write once -----------------------------
  require_space $(( ARCHIVE_MAX + (RESTORE_MAX > ARCHIVE_MAX ? RESTORE_MAX : ARCHIVE_MAX) + HEADROOM )) \
    "an archive of this source beside its restore, bounded as if it did not compress,"
  ARCHIVE="$STAGE/$NAME.tar.zst"
  log "archiving at zstd -$LEVEL into $STAGE"
  if ! COPYFILE_DISABLE=1 tar --format=ustar -C "$PARENT" -cf - "$NAME" | zstd -q -"$LEVEL" -T0 -o "$ARCHIVE"; then
    die "tar or zstd failed while archiving $SRC"
  fi
  zstd -q -t "$ARCHIVE" || die "the archive fails zstd -t: $ARCHIVE"

  # Regular files and hard links, the two entry types `find -type f` counts.
  LISTED="$(zstd -q -dc "$ARCHIVE" | tar -tvf - | awk '{ t = substr($0, 1, 1) } t == "-" || t == "h" { n++ } END { print n + 0 }')" \
    || die "cannot list the archive"
  [[ $LISTED == "$FILES" ]] \
    || die "the archive lists $LISTED files and the source held $FILES when counted; it changed while tar read it, or tar skipped something. Nothing was uploaded"

  ARCHIVE_BYTES="$(wc -c < "$ARCHIVE" | tr -d ' ')"
  LOCAL_MD5="$(md5_of "$ARCHIVE")" || die "cannot hash $ARCHIVE"
  [[ $LOCAL_MD5 =~ $MD5_RE ]] || die "not an md5: '$LOCAL_MD5'"
  log "archive $ARCHIVE_BYTES bytes, md5 $LOCAL_MD5, $LISTED files; restoring it here before anything is uploaded"

  restore_and_compare "$ARCHIVE"
  if [[ $WHY_KIND == local ]]; then
    die "could not compare the archive with the source here: $WHY. Nothing was uploaded; fix the local cause and run again"
  fi
  [[ -z $WHY ]] || die "the archive does not restore to the source: $WHY. Nothing was uploaded"
  chmod -R u+w "$RESTORE" 2>/dev/null || true
  rm -rf "$RESTORE" || true
  [[ ! -e $RESTORE ]] || die "cannot remove the local restore $RESTORE. Nothing was uploaded"

  require_space $(( ARCHIVE_BYTES + HEADROOM )) "the object streamed back after the upload"
  log "restore proven locally; uploading to R2:$BUCKET/$KEY"
  # From here an object may be at a permanent key, whatever rclone reports.
  FETCH_HINT=". The object may be at its key: run again with the source unchanged, which proves it by restoring it"
  rclone copyto --ignore-existing --s3-no-check-bucket "$ARCHIVE" "R2:$BUCKET/$KEY" >/dev/null 2>"$STAGE/copyto.err" \
    || die "upload to R2:$BUCKET/$KEY failed: $(rclone_error "$STAGE/copyto.err")$FETCH_HINT"
  log "uploaded; streaming the object back"
  fetch_back
  # These bytes were sent from here and proven above. Anything else came back
  # wrong, or an object reached the key after the listing and the upload left
  # it alone; either way the object cannot be replaced.
  [[ $REMOTE_MD5 == "$LOCAL_MD5" ]] \
    || die "the object R2 returned for R2:$BUCKET/$KEY does not match what was uploaded (md5 $REMOTE_MD5, uploaded $LOCAL_MD5). It is in a write-once bucket and cannot be replaced: run again with the source unchanged, which proves the object by restoring it; if that refuses too, this basename's key is spent"
  STATUS="archived"
fi

log "restore proven, $STATUS: R2:$BUCKET/$KEY"
# Staging goes before the row, not after: on the trap it would run once stdout
# was already written, and a removal that failed would exit 1 after printing
# the row that means proven.
cleanup
printf '| `%s` | %s | %s | %s | %s | %s |\n' \
  "$BUCKET/$KEY" "$REMOTE_BYTES" "$REMOTE_MD5" "$FILES" "$SRC_BYTES" "$(date -u +%F)"
