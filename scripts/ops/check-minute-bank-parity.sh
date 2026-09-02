#!/usr/bin/env bash
# LOCAL/OFF-BOX PARITY for the minute bank.
#
# WHY THIS EXISTS. `push-minute-bank-offbox.sh` verifies the object it just
# wrote, which proves that ONE upload landed. Nothing compared the two sides,
# so drift had no way to announce itself. The shape that actually happened:
# on 2026-09-02T05:36Z the push died before it ran (wl-secret was not on the
# launchd PATH), the local snapshot was placed anyway, and the next successful
# run reported a healthy backup while a local stamp sat with no archive behind
# it. Verifying an upload and verifying the ARCHIVE SET are different claims.
#
# THE INVARIANT IS ONE-DIRECTIONAL, and that is deliberate. Local retention is
# 14 snapshots, remote is 60, so local ⊆ remote is the designed steady state:
# every local snapshot must have an off-box archive, and remote archives with
# no local snapshot are the depth this whole mechanism exists to buy. Asserting
# set equality would fail every day from day fifteen.
#
# NO NETWORK, BY CONSTRUCTION. The remote listing arrives on stdin. The caller
# owns rclone and the credential; this script owns the comparison. That split
# is what lets the comparison be EXERCISED by tests against real directories
# rather than asserted by reading the source — the failure mode this repo has
# spent the week removing.
set -euo pipefail

ROOT="${1:?usage: check-minute-bank-parity.sh <snapshot-root>   (remote listing on stdin)}"

log() { echo "$(date -u +%FT%TZ) parity: $*"; }

# `[[ ]]` rather than the POSIX bracket form with a quoted variable, for the
# reason `backup-minute-bank.sh` spells out at length: the tracked-shell sweep
# in tests/securityHardening.test.ts flags a directory test written the other
# way, because it is spelled the same as a request-body flag carrying an
# interpolated argument. The sweep is deliberately eager and it is right to be.
[[ -d $ROOT ]] || { log "FAIL snapshot root does not exist: $ROOT"; exit 1; }

REMOTE="$(cat)"

# Stamps are read strictly. A name must be the snapshot prefix followed by
# exactly eight digits and nothing else, so `<stamp>.partial` — what an
# interrupted copy leaves behind — is skipped rather than parsed loosely into
# a phantom stamp whose archive would then be reported missing.
LOCAL=""
for dir in "$ROOT"/levelflow-minute-bank-snapshot-*; do
  [[ -d $dir ]] || continue
  stamp="${dir##*-}"
  [[ $stamp =~ ^[0-9]{8}$ ]] || continue
  LOCAL="$LOCAL$stamp
"
done

COUNT="$(printf '%s' "$LOCAL" | grep -c . || true)"
# REFUSE A PASS THAT EXAMINED NOTHING. An empty root on a machine whose backup
# just placed a snapshot is a broken premise, not a clean bill of health, and
# reporting success over zero comparisons is the exact silent failure this
# script was added to catch.
if [ "$COUNT" -eq 0 ]; then
  log "FAIL no local snapshots under $ROOT — refusing to report parity over zero comparisons"
  exit 1
fi

MISSING=""
while IFS= read -r stamp; do
  [ -n "$stamp" ] || continue
  case "$REMOTE" in
    *"minute-bank-$stamp.tar.zst"*) ;;
    *) MISSING="$MISSING $stamp" ;;
  esac
done <<EOF
$LOCAL
EOF

# NAMED, never counted. A tally cannot be acted on; the stamps can be handed
# straight to a backfill.
if [ -n "$MISSING" ]; then
  log "PARITY FAILED: local snapshot(s) with no off-box archive:$MISSING"
  exit 1
fi

log "parity ok: $COUNT local snapshot(s), all present off-box"
