#!/usr/bin/env bash
# Mutual exclusion between the minute bank and its backup. Sourced, not run.
#
# WHAT WENT WRONG. Between 2026-09-17 and 2026-09-21 the off-box snapshot
# failed eight times with `VERIFY FAILED: copied 100/3332370 against
# 100/3326559` — the copy holding MORE bars than the count taken moments
# earlier, because the bank was appending underneath it. The newest archive in
# R2 stopped advancing on 2026-09-19 while the bank grew by another 107,000
# bars, so the one dataset here that no money buys back was accumulating in a
# single location. That is the failure R0b exists to prevent.
#
# WHY NOT JUST ACCEPT THE LARGER COPY. Because the larger copy is not safe.
# `bank-minute-bars.ts` appends to `<symbol>.jsonl` and then writes
# `<symbol>.state.json` as two separate, non-atomic steps, so a copy taken
# during a run can hold a torn final line, or a sidecar disagreeing with the
# data file beside it. A copy taken between the two writes matches on bar count
# and is still internally inconsistent — so a `>=` comparison would have shipped
# corruption off-box and reported success. The count check caught this by luck.
# The verify it protects stays exactly as it was; this closes the actual hole.
#
# WHY NOT STAGGER THE SCHEDULE. Both plists carry `RunAtLoad` deliberately and
# for the same reason: a machine asleep at 07:20 or 20:10 has missed a window,
# and the bars it missed are unrecoverable. They therefore co-fire on every
# login and reload, which is where six of the eight failures came from. No
# choice of clock fixes two jobs that are both correct to run at load, and a
# clock does nothing for the hand-run path — the `levelflow-bank-minute-bars`
# scheduled task instructs an agent to run the bank by hand when it has
# stalled, which can land on top of the 20:10 backup.
#
# NO SILENT FAILURE, IN EITHER DIRECTION. A lock introduces two new ways to
# stop the work quietly, and both are closed here. A holder that died leaves a
# directory behind, so a lock naming a dead process is broken and the break is
# logged. A lock that cannot be taken at all gives up non-zero with a reason,
# because `ops/agent-exit-status.sh` reads the launchd exit code and a quiet
# skip would render as a healthy backup.

# BASH ONLY, AND LOUDLY. Found by the production check after #658 merged: the
# check held this lock from an agent's shell, which is zsh, and the backup
# walked straight through it. zsh fires an `EXIT` trap set inside a function
# when the FUNCTION returns, so the release backstop below deleted the lock the
# instant `acquire_bank_lock` succeeded — reporting a lock it did not hold,
# which is worse than no lock. Both launchd jobs run under bash through their
# shebangs and were never exposed; any other caller was. Refusing to load turns
# that silent no-op into a failure, and `return` rather than `exit` because this
# file is sourced and must not take an interactive shell down with it.
if [[ -z ${BASH_VERSION:-} ]]; then
  echo "bank-lock.sh must be sourced from bash; refusing to load, so no caller believes it holds a lock it does not" >&2
  return 1 2>/dev/null || exit 1
fi

# Seconds to wait before giving up. The bank run takes 10-45s and the backup's
# copy about a second, so the default is generous by two orders of magnitude:
# the thing being protected has a three-day budget, and a minute of patience
# has never been the scarce resource. `0` means "do not wait", which only a
# test wants.
: "${LEVELFLOW_BANK_LOCK_TIMEOUT:=900}"

BANK_LOCK_HELD=""

bank_lock_log() { echo "$(date -u +%FT%TZ) $*"; }

# acquire_bank_lock <bank-dir>
#
# Blocks until the lock is ours or the timeout expires. Returns non-zero, with
# a reason on stdout, if it could not be taken.
acquire_bank_lock() {
  local bank="$1"
  local lock="${LEVELFLOW_BANK_LOCK_DIR:-$bank.lock}"
  local deadline=$(( $(date +%s) + LEVELFLOW_BANK_LOCK_TIMEOUT ))
  local holder holder_state

  while :; do
    # `mkdir` is the atomic primitive here. macOS ships no `flock(1)`, and a
    # test-then-create pair is not a lock at all.
    if mkdir "$lock" 2>/dev/null; then
      echo "$$" >"$lock/pid"
      BANK_LOCK_HELD="$lock"
      # A backstop, not the mechanism: the scripts release explicitly so the
      # bank is blocked only for the copy and not for the upload after it.
      trap 'release_bank_lock' EXIT
      return 0
    fi

    holder="$(cat "$lock/pid" 2>/dev/null || true)"
    # An ABSENT pid is treated as live, deliberately. There is a window between
    # `mkdir` and the write above where the holder owns the lock and has not
    # named itself yet; breaking on an empty file would race straight through
    # it. The timeout below is what covers a holder that died inside that
    # window.
    # A pid file that does not hold a positive integer is broken rather than
    # trusted. `kill -0 0` addresses the PROCESS GROUP and succeeds, so a `0`
    # in this file — from a truncated write, or a caller that built the lock by
    # hand — would read as a live holder forever and wedge every backup from
    # then on. Anything non-numeric would fail the same way for a different
    # reason.
    if [[ -n $holder && ! $holder =~ ^[1-9][0-9]*$ ]]; then
      holder_state="unreadable"
    elif [[ -n $holder ]] && ! kill -0 "$holder" 2>/dev/null; then
      holder_state="dead"
    else
      holder_state=""
    fi
    if [[ -n $holder_state ]]; then
      # BREAK BY RENAME, never by `rm` in place. Two waiters can both read the
      # same dead pid; if both delete and both re-create, both believe they
      # hold it and the race this file exists to close reopens wider than
      # before. Only one process can rename a given directory, so the loser
      # falls through to `mkdir` and waits its turn like any other contender.
      if [[ -n $lock ]] && mv "$lock" "$lock.stale.$$" 2>/dev/null; then
        bank_lock_log "breaking a stale bank lock ($holder_state holder: pid ${holder:-none})"
        rm -rf "$lock.stale.$$"
        # Broken, so try to take it immediately rather than sleeping first.
        continue
      fi
      # THE BREAK FAILED, AND THIS FALLS THROUGH DELIBERATELY. An earlier
      # version looped straight back here, which is an unbounded spin: a lock
      # that cannot be renamed — a read-only parent, a permissions fault —
      # names a dead holder on every pass, so it would never reach the deadline
      # check below and never sleep, burning a core until something killed it.
      # A hang with no timeout is the silent failure this file claims to close,
      # so an unbreakable lock has to time out like any other.
    fi

    if [[ $(date +%s) -ge $deadline ]]; then
      bank_lock_log "FAIL could not acquire the bank lock at $lock after ${LEVELFLOW_BANK_LOCK_TIMEOUT}s (held by pid ${holder:-unknown}); refusing to read a bank that is being written"
      return 1
    fi
    sleep 0.2
  done
}

# Release only what we actually hold. A release that deleted the directory
# unconditionally would let a process that timed out remove the live holder's
# lock on its way out.
release_bank_lock() {
  [[ -n $BANK_LOCK_HELD ]] || return 0
  if [[ "$(cat "$BANK_LOCK_HELD/pid" 2>/dev/null || true)" == "$$" ]]; then
    rm -rf "$BANK_LOCK_HELD"
  fi
  BANK_LOCK_HELD=""
}
