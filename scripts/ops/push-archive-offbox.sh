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
# WRITE-ONCE. An existing key is never replaced. The script streams the object
# back, restores it, and requires the restored tree to equal the source: that,
# not byte equality with a fresh build, is what says the archive is intact.
# `copyto --immutable` is the second barrier and the bucket lock the third.
#
# A REBUILD IS NOT A REFERENCE. The archive is deterministic for one build of
# the tools — ustar (no pax atime, no xattrs), COPYFILE_DISABLE (no AppleDouble
# entries), a fixed zstd level — and windwardline-toolchain-update runs
# `brew upgrade --formula` daily, so tar and zstd both move. A rebuild that no
# longer reproduces last year's bytes says nothing about the object R2 holds,
# and reading it as "a different object" would turn a working archive into a
# refusal a human has to adjudicate. Matching bytes are logged; a matching
# RESTORE is what passes. The register row records the object R2 holds.
#
# THE PROOF IS A RESTORE, NOT AN UPLOAD. On both paths the object is streamed
# back (R2 egress is free), decompressed and extracted into staging, where
# `diff -rq` against the source must be empty. After an upload the returned
# md5 must also equal what was sent, because there the bytes are known.
# `rclone hashsum` on a multipart object reports metadata rclone wrote itself,
# so it says nothing about the bytes R2 holds.
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
# there and removes it on every exit path, signals included. It needs free space
# of about the source plus twice the archive.
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
  exec "$WL_SECRET" cloudflare-r2-backup=R2_TOKEN -- "$0" --secrets-delivered "$@"
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
cleanup() {
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

# --- count, archive, check ----------------------------------------------------
FILES="$(find "$SRC" -type f | wc -l | tr -d ' ')" || die "cannot count the files in $SRC"
[[ $FILES -gt 0 ]] || die "the source holds no files: $SRC — refusing to archive nothing"
SRC_BYTES="$(find "$SRC" -type f -exec wc -c {} \; | awk '{ s += $1 } END { printf "%.0f\n", s }')" \
  || die "cannot measure $SRC"
log "source $SRC: $FILES files, $SRC_BYTES bytes"

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
  || die "the archive lists $LISTED files and the source held $FILES when counted; it changed while tar read it, or tar skipped something"

ARCHIVE_BYTES="$(wc -c < "$ARCHIVE" | tr -d ' ')"
MD5_RE='^[0-9a-f]{32}$'
LOCAL_MD5="$(md5_of "$ARCHIVE")" || die "cannot hash $ARCHIVE"
[[ $LOCAL_MD5 =~ $MD5_RE ]] || die "not an md5: '$LOCAL_MD5'"
log "archive $ARCHIVE_BYTES bytes, md5 $LOCAL_MD5, $LISTED files"

# --- write once ---------------------------------------------------------------
# rclone exits 3 for a prefix that does not exist yet. Every other failure is a
# failure: an unreadable listing is not an absent key, and reading it as one is
# how an upload would reach an object it should have compared first.
DIR="$PREFIX/$DATASET"
LIST_RC=0
LISTING="$(rclone lsf --files-only "R2:$BUCKET/$DIR/" 2>"$STAGE/lsf.err")" || LIST_RC=$?
case $LIST_RC in
  0) ;;
  3) LISTING="" ;;
  *) die "cannot list R2:$BUCKET/$DIR/ (rclone exit $LIST_RC): $(rclone_error "$STAGE/lsf.err") — an unreadable listing is not an absent key" ;;
esac
EXISTS=0
while IFS= read -r entry; do
  if [[ $entry == "$NAME.tar.zst" ]]; then EXISTS=1; fi
done <<< "$LISTING"

RETURNED="$STAGE/returned.tar.zst"
fetch_back() {
  rclone cat "R2:$BUCKET/$KEY" > "$RETURNED" 2>"$STAGE/cat.err" \
    || die "cannot stream R2:$BUCKET/$KEY back: $(rclone_error "$STAGE/cat.err")"
}

if [[ $EXISTS == 1 ]]; then
  log "R2:$BUCKET/$KEY exists; streaming it back to prove"
  fetch_back
  STATUS="already archived"
else
  log "uploading to R2:$BUCKET/$KEY"
  rclone copyto --immutable --s3-no-check-bucket "$ARCHIVE" "R2:$BUCKET/$KEY" 2>"$STAGE/copyto.err" \
    || die "upload to R2:$BUCKET/$KEY failed: $(rclone_error "$STAGE/copyto.err")"
  log "uploaded; streaming the object back"
  fetch_back
  STATUS="archived"
fi

REMOTE_MD5="$(md5_of "$RETURNED")" || die "cannot hash the returned object"
[[ $REMOTE_MD5 =~ $MD5_RE ]] || die "not an md5: '$REMOTE_MD5'"
REMOTE_BYTES="$(wc -c < "$RETURNED" | tr -d ' ')"

if [[ $STATUS == archived ]]; then
  # These bytes were sent from here, so anything else came back wrong.
  [[ $REMOTE_MD5 == "$LOCAL_MD5" ]] \
    || die "the object R2 returned does not match what was uploaded (md5 $REMOTE_MD5, uploaded $LOCAL_MD5) at $KEY"
elif [[ $REMOTE_MD5 != "$LOCAL_MD5" ]]; then
  log "NOTE the object's md5 $REMOTE_MD5 differs from this rebuild's $LOCAL_MD5; tar or zstd moved. The restore below decides, not these bytes"
fi

# --- the restore --------------------------------------------------------------
RESTORE="$STAGE/restore"
mkdir "$RESTORE"
WHY=""
if ! zstd -q -dc "$RETURNED" | tar -xf - -C "$RESTORE"; then
  WHY="the object R2 returned did not extract"
elif [[ "$(ls -A "$RESTORE")" != "$NAME" ]]; then
  WHY="the restored tree does not hold $NAME alone: $(ls -A "$RESTORE" | tr '\n' ' ')"
else
  DIFF_RC=0
  DIFF_OUT="$(diff -rq "$SRC" "$RESTORE/$NAME" 2>&1)" || DIFF_RC=$?
  [[ $DIFF_RC == 0 && -z $DIFF_OUT ]] \
    || WHY="the restored tree differs from the source (diff exit $DIFF_RC): $(printf '%s\n' "$DIFF_OUT" | head -n 5 | tr '\n' ' ')"
fi
if [[ -n $WHY ]]; then
  [[ $STATUS != "already archived" ]] \
    || die "R2:$BUCKET/$KEY already holds a different object (md5 $REMOTE_MD5, this archive $LOCAL_MD5): $WHY; refusing to overwrite a permanent archive"
  die "$WHY"
fi

log "restore proven, $STATUS: R2:$BUCKET/$KEY"
# Staging goes before the row, not after: on the trap it would run once stdout
# was already written, and a removal that failed would exit 1 under a row the
# runbook had appended to the register with `>>`.
cleanup
printf '| %s | %s | %s | %s | %s | %s |\n' \
  "$BUCKET/$KEY" "$REMOTE_BYTES" "$REMOTE_MD5" "$FILES" "$SRC_BYTES" "$(date -u +%F)"
