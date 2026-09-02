#!/usr/bin/env bash
# The minute bank's OFF-BOX copy (6b-1 item G).
#
# WHY THIS EXISTS. `backup-minute-bank.sh` protects against a bad script or an
# accidental delete. Both the bank and every snapshot it writes live on
# /dev/disk3s5, so neither protects against losing the machine — and FMP
# re-serves 1-minute bars only about three days deep, measured 2026-08-31 as
# 100% of the bank already beyond that window. It is unrecoverable at any
# price. That was recorded as a single point of failure and is now closed.
#
# DESTINATION, owner-ruled 2026-09-01: Cloudflare R2, not Google Drive. R2 is
# already the fleet's provider, needs no OAuth consent, and its credential is
# minted by `cloudflare-token-admin` without the owner. The 10 GB free tier
# covers a bank measured at 219 MB with room for years of archives.
#
# THE LAYOUT IS THE CONTRACT, and it generalizes past this one dataset:
#
#   windwardline-backups/<repo>/<dataset>/<YYYY>/<MM>/<dataset>-<YYYYMMDD>.tar.zst
#   windwardline-backups/levelflow-cloud/minute-bank/2026/09/minute-bank-20260902.tar.zst
#
# `tests/minuteBankOffbox.test.ts` pins that shape, so a future dataset joins
# the same tree instead of inventing a second one beside it.
#
# NO SECRET TOUCHES DISK OR A SHELL PROFILE. The caller supplies R2_TOKEN via
# `wl-secret`, which reads the Keychain at exec and exports into this child
# only. rclone is configured entirely through RCLONE_CONFIG_* environment
# variables, so no rclone.conf is ever written — verified by rclone's own
# "Config file not found - using defaults" notice. The S3 secret is the
# SHA-256 of the token, computed here and never stored.
#
# IT VERIFIES THE REMOTE, not the upload's exit code. An upload that returns 0
# and a remote object that does not match are different things, and only the
# second one is a backup. The check compares the local archive's MD5 against
# the object's own hash as R2 reports it back.
#
# IT FAILS LOUDLY. Every failure path exits non-zero with a named cause. The
# daily launchd job's exit status is read by ops/agent-exit-status.sh, so a
# silent skip would read as a healthy backup — which is the failure this whole
# item exists to prevent.
set -euo pipefail

SNAPSHOT="${1:?usage: push-minute-bank-offbox.sh <snapshot-dir>}"
BUCKET="${LEVELFLOW_R2_BUCKET:-windwardline-backups}"
PREFIX="${LEVELFLOW_R2_PREFIX:-levelflow-cloud/minute-bank}"
ACCOUNT="${LEVELFLOW_R2_ACCOUNT:-c8da9a44c29c435205b2ec133ee05f20}"
ACCESS_KEY="${LEVELFLOW_R2_ACCESS_KEY:-fafbbe863abb74c59933f028095a04ce}"
KEEP_REMOTE="${LEVELFLOW_R2_KEEP:-60}"
PROTECTED="20260823"

log() { echo "$(date -u +%FT%TZ) offbox: $*"; }
die() { log "FAIL $*"; exit 1; }

[[ -d $SNAPSHOT ]] || die "snapshot directory does not exist: $SNAPSHOT"

# BARRIER 2 of 2 against a test fixture reaching production storage, and it is
# here because barrier 1 already failed once. On 2026-09-01 the backup tests —
# which run the real script against a sandbox bank in a temp dir — pushed a
# 450-byte fixture over the real 17,461,396-byte archive at the production key.
# Nothing refused it: the sandbox's snapshot basename carries the same
# YYYYMMDD stamp, so the key collided exactly. An env flag the caller must
# remember is not a guard; this is the one that does not depend on memory.
case "$SNAPSHOT" in
  /tmp/*|/private/tmp/*|/var/folders/*|"${TMPDIR:-/nonexistent-tmp}"*)
    die "refusing to push a snapshot under a temp directory: $SNAPSHOT — this is a sandbox, and the production key would be overwritten with a fixture"
    ;;
esac
[[ -n ${R2_TOKEN:-} ]] || die "R2_TOKEN is unset — invoke through: wl-secret cloudflare-r2-backup=R2_TOKEN -- $0 <snapshot>"
command -v rclone >/dev/null || die "rclone is not installed (brew install rclone)"
command -v zstd >/dev/null || die "zstd is not installed (brew install zstd)"

STAMP="$(basename "$SNAPSHOT" | sed 's/.*-//')"
[[ $STAMP =~ ^[0-9]{8}$ ]] || die "cannot read a YYYYMMDD stamp from $SNAPSHOT"
KEY="$PREFIX/${STAMP:0:4}/${STAMP:4:2}/minute-bank-$STAMP.tar.zst"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="https://$ACCOUNT.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY"
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(printf %s "$R2_TOKEN" | shasum -a 256 | cut -d' ' -f1)"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ARCHIVE="$WORK/minute-bank-$STAMP.tar.zst"

log "archiving $SNAPSHOT"
tar -C "$(dirname "$SNAPSHOT")" -cf - "$(basename "$SNAPSHOT")" | zstd -q -19 -T0 -o "$ARCHIVE"
BYTES="$(wc -c < "$ARCHIVE" | tr -d ' ')"
LOCAL_MD5="$(md5 -q "$ARCHIVE")"
log "archive $BYTES bytes, md5 $LOCAL_MD5"

log "uploading to R2:$BUCKET/$KEY"
rclone copyto "$ARCHIVE" "R2:$BUCKET/$KEY" --s3-no-check-bucket 2>&1 | grep -v "Config file" || true

# The verification that matters: ask the REMOTE what it holds, and compare.
REMOTE_MD5="$(rclone hashsum md5 "R2:$BUCKET/$KEY" 2>/dev/null | awk 'NR==1{print $1}')"
[[ -n $REMOTE_MD5 ]] || die "no object at R2:$BUCKET/$KEY after upload — the push did not land"
[[ $REMOTE_MD5 == "$LOCAL_MD5" ]] || die "remote md5 $REMOTE_MD5 != local $LOCAL_MD5 at $KEY"
log "verified remote copy: $KEY ($BYTES bytes, md5 matches)"

# Remote retention, mirroring the local rule including the protected stamp.
# --files-only is load-bearing, not tidiness. `lsf -R` emits the year and month
# DIRECTORY entries too, even under --include, and they sort BEFORE the archives
# beneath them — so without this the count is inflated by one per directory and
# the prune below would hand a directory path to deletefile before it ever
# reached a real archive. Measured 2026-09-01: one object listed as three.
REMOTE_LIST="$(rclone lsf -R --files-only "R2:$BUCKET/$PREFIX/" --include '*.tar.zst' 2>/dev/null | sort || true)"
TOTAL="$(printf '%s' "$REMOTE_LIST" | grep -c . || true)"
EXCESS=$(( TOTAL - KEEP_REMOTE ))
if [ "$EXCESS" -gt 0 ]; then
  printf '%s\n' "$REMOTE_LIST" | head -n "$EXCESS" | while IFS= read -r old; do
    [ -n "$old" ] || continue
    case "$old" in
      *"-$PROTECTED.tar.zst") log "keeping $old (protected: the naive-era corpus, owner decision)"; continue ;;
    esac
    log "pruning remote $old"
    rclone deletefile "R2:$BUCKET/$PREFIX/$old" 2>&1 | grep -v "Config file" || true
  done
fi

# LOCAL/OFF-BOX PARITY, and it runs AFTER the prune on purpose: the listing
# gathered above is stale the moment a prune deletes from it, and a parity
# claim built on a stale listing is worth nothing. This re-lists.
#
# The comparison lives in its own script so it can be exercised against real
# directories without a bucket; the network stays here, where the credential
# already is. A failure exits non-zero through `set -euo pipefail`, which is
# what puts it in front of a person: ops/agent-exit-status.sh reads the
# launchd exit code, so drift now reads as a failing job rather than as a
# backup that quietly stopped agreeing with itself.
PARITY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/check-minute-bank-parity.sh"
[[ -x $PARITY ]] || die "parity checker missing or not executable: $PARITY"
rclone lsf -R --files-only "R2:$BUCKET/$PREFIX/" --include '*.tar.zst' 2>/dev/null \
  | bash "$PARITY" "$(dirname "$SNAPSHOT")"

log "off-box complete; $TOTAL remote archive(s), keeping $KEEP_REMOTE"
