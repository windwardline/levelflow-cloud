#!/usr/bin/env bash
# Daily 1-minute bar bank (owner directive, 2026-08-06).
# Runs from launchd (com.windwardline.levelflow-minute-bank): appends FMP's
# rolling ~3-day 1-minute window to the durable store in .minute-bank/.
# Idempotent — bars already banked are dropped by key.
#
# Why launchd rather than the app's scheduler: the provider window is three
# days wide, so a gap longer than that is permanently unrecoverable. A job that
# only fires while an app happens to be open is not a guarantee. This one runs
# whether or not anything is open, and catches up on wake.
#
# Logs carry no secrets. See docs/minute-bank.md.
set -euo pipefail

# Derived from this script's own location, never hardcoded. The literal that
# stood here resolved only on one machine: the first test to EXECUTE this
# script failed in CI on `cd: /Users/peacock/Projects/levelflow-cloud: No such
# file or directory`, having passed locally for the obvious reason. The launchd
# plist invokes this by absolute path inside the checkout, so this resolves to
# the same place it always did. `backup-minute-bank.sh` made the same repair on
# 2026-09-02.
REPO="${LEVELFLOW_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$REPO"

# CODE AND DATA ARE TWO DIFFERENT PLACES. launchd runs this through
# `wl-repo-script`, which extracts `origin/main` into a temporary tree: $REPO is
# that tree, and it carries code and nothing ignored — no bank, no FMP ledger,
# no circuit marker, no node_modules. LEVELFLOW_CHECKOUT names the checkout
# whose ignored state is real. Run by hand from that checkout, the two are the
# same directory and nothing below changes.
CHECKOUT="${LEVELFLOW_CHECKOUT:-$REPO}"
# Overridable so the lock ordering below can be EXERCISED rather than read.
BANK="${LEVELFLOW_BANK_DIR:-$CHECKOUT/.minute-bank}"

# NEVER CREATE THE STORE IMPLICITLY. The bank calls `mkdir -p` on its target,
# so a path that defaulted into the extracted tree would be created fresh,
# banked into, and deleted on exit — a run that reports success and keeps
# nothing, against a provider window three days wide. A new bank is a
# deliberate act; create the directory by hand if one is ever wanted.
if [[ ! -d $BANK ]]; then
  echo "$(date -u +%FT%TZ) FAIL no bank at $BANK; refusing to create a new bank implicitly (set LEVELFLOW_CHECKOUT or LEVELFLOW_BANK_DIR)"
  exit 1
fi

# The toolchain is the checkout's. A link, not a copy or an install: the tree
# is deleted on exit, `rm -rf` removes a link without following it, and an
# install would reach the network on every run.
if [[ ! -e $REPO/node_modules ]]; then
  ln -s "$CHECKOUT/node_modules" "$REPO/node_modules"
fi
TSX="$REPO/node_modules/.bin/tsx"
[[ -x $TSX ]] || { echo "$(date -u +%FT%TZ) FAIL tsx is not installed at $TSX; run npm ci in $CHECKOUT"; exit 1; }


# BEFORE THE KEYCHAIN, AND BEFORE THE FETCH. The backup copies this store, and
# a copy taken mid-append captures a torn line or a sidecar that disagrees with
# its data file. Eight snapshots failed that way between 2026-09-17 and
# 2026-09-21. Taking the lock first also means the refusal is cheap and loud:
# no provider traffic, and a non-zero exit launchd records.
. "$(dirname "${BASH_SOURCE[0]}")/bank-lock.sh"
acquire_bank_lock "$BANK"

# NEVER FETCH INTO A TEMPORARY DIRECTORY. The production bank lives in the
# checkout; nothing legitimate banks under a temp root. This exists because on
# 2026-09-20 the test suite ran this script SIX times against real FMP — two
# red runs of the lock test that banked into the PRODUCTION store before this
# script honoured LEVELFLOW_BANK_DIR, two mutations that let it past the lock,
# and two red runs of a test that predated the refusal above — each a full
# roster of about 280,000 bars, some 244 MB in all. The tests now keep the keychain out of reach, but a guard the
# caller must remember is not a guard, so the script refuses on its own. It sits
# after the lock so the lock's own tests still reach it, and before the
# keychain so nothing past it can spend.
BANK_REAL="$(cd "$BANK" && pwd -P)"
for tmp_root in "${TMPDIR:-/tmp}" /tmp /var/folders; do
  tmp_real="$(cd "$tmp_root" 2>/dev/null && pwd -P)" || continue
  case "$BANK_REAL/" in
    "${tmp_real%/}/"*)
      echo "$(date -u +%FT%TZ) FAIL the bank at $BANK is under the temporary root $tmp_real; refusing to spend FMP bandwidth on a directory that will not survive"
      exit 1
      ;;
  esac
done

FMP_API_KEY="$(security find-generic-password -a peacock -s fmp-api-key -w 2>/dev/null || true)"
if [ -z "$FMP_API_KEY" ]; then
  # A locked keychain is a deferral, not a failure — the window is three days
  # wide and the next run will catch up. Said out loud so a run of these in the
  # log reads as the problem it is.
  echo "$(date -u +%FT%TZ) keychain unavailable (locked or missing key); skipping"
  exit 0
fi
export FMP_API_KEY

echo "$(date -u +%FT%TZ) minute-bank run starting"
"$TSX" "$REPO/scripts/bank-minute-bars.ts" --dir "$BANK"
echo "$(date -u +%FT%TZ) minute-bank run complete ($(du -sh "$BANK" | cut -f1))"
