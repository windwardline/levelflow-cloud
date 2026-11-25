#!/usr/bin/env bash
# Run a command up to N times, cutting each attempt off after S seconds.
#
#   retry-with-timeout.sh <attempts> <seconds> [--between "<cmd>"] -- <cmd> [args...]
#
# CI wraps the Playwright browser install in this. On 2026-11-23 the runner's
# apt mirror served ~100 KB/s and two runs spent their whole 15-minute budget in
# that one step without failing. A plain retry would not have helped: the slow
# attempt never ends. Each attempt is therefore bounded, and the next one starts
# a fresh download. `--between` runs a repair command before each retry (CI uses
# it to finish a dpkg run the cut-off attempt interrupted); a repair that fails
# stops the loop rather than retrying on a broken system.
#
# Exit 0 on the first successful attempt, 1 when every attempt failed or timed
# out, 64 on bad usage.

set -uo pipefail

usage() { echo "usage: ${0##*/} <attempts> <seconds> [--between <cmd>] -- <cmd> [args...]" >&2; exit 64; }

[ $# -ge 2 ] || usage
attempts=$1 seconds=$2
shift 2
[[ "$attempts" =~ ^[1-9][0-9]*$ && "$seconds" =~ ^[1-9][0-9]*$ ]] || usage

between=""
if [ "${1:-}" = "--between" ]; then
  [ $# -ge 2 ] || usage
  between=$2
  shift 2
fi
[ "${1:-}" = "--" ] || usage
shift
[ $# -ge 1 ] || usage

for ((i = 1; i <= attempts; i++)); do
  if [ "$i" -gt 1 ] && [ -n "$between" ]; then
    bash -c "$between" || { echo "repair before attempt $i failed; stopping" >&2; exit 1; }
  fi
  timeout --kill-after=10 "$seconds" "$@"
  rc=$?
  [ "$rc" -eq 0 ] && exit 0
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    echo "attempt $i of $attempts exceeded ${seconds}s" >&2
  else
    echo "attempt $i of $attempts exited $rc" >&2
  fi
done
exit 1
