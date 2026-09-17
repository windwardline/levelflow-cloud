#!/usr/bin/env bash
# Decides whether the deploy's FMP-spending E2E projects run (deploy.yml,
# step `e2e-scope`). Writes exactly one `full=` and one `scope=` line to
# $GITHUB_OUTPUT and exits 0, or writes nothing and exits non-zero.
#
#   E2E_BASE  the push's `github.event.before`; empty on a dispatch
#   E2E_HEAD  the commit being deployed (required)
#
# PARKING IS DECIDED FIRST. `workspace`, `visual-proof` and `analyzer-abuse`
# drive the chart and scan paths against the live Edge. While DESK_PARKED is
# true the Edge refuses every one of their provider requests
# (supabase/functions/_shared/deskParking.ts), so they could only fail, whatever
# this run changed. A dispatch has no base, and the base check used to run
# first: an unresolvable base ran the full suite before parking was read, so a
# parked dispatch spent it anyway.
#
# Unparked, a missing or unresolvable base runs EVERYTHING: the failure to avoid
# is a silent narrowing, so the ambiguous case buys coverage rather than saving
# bytes. A resolvable base runs the suite only when the push touched src/,
# supabase/functions/ or supabase/migrations/.
#
# scripts/deploy-e2e-scope-test.sh runs every case against real git
# repositories and moves the parked block after the base block to prove the
# order is load-bearing.
set -euo pipefail

: "${E2E_HEAD:?E2E_HEAD must name the commit being deployed}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must name the step output file}"
base="${E2E_BASE:-}"

# Both lines on every path: the reporter refuses a scope it cannot read, and an
# unset output arrives as the empty string.
emit() {
  echo "full=$1" >> "$GITHUB_OUTPUT"
  echo "scope=$2" >> "$GITHUB_OUTPUT"
  echo "  full=$1 scope=$2"
  exit 0
}

# --- parked ---
# THE EDGE'S OWN CONSTANT, imported rather than grepped: a regex over the source
# drifts the day the file is reformatted, and this decides whether ~190 live
# provider calls go out. Anything but a boolean stops the deploy here.
parked="$(npx tsx -e "import { DESK_PARKED } from './supabase/functions/_shared/deskParking.ts'; process.stdout.write(String(DESK_PARKED));")"
echo "  desk parked (DESK_PARKED): $parked"
case "$parked" in
  true) emit false stood-down-parked ;;
  false) ;;
  *)
    echo "::error::DESK_PARKED read as '$parked', not true or false; refusing to decide the E2E scope" >&2
    exit 1
    ;;
esac

# --- base ---
if [ -z "$base" ] || [ "$base" = "0000000000000000000000000000000000000000" ] ||
  ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "  base '$base' is not resolvable here; running the full suite"
  emit true ran
fi

changed="$(git diff --name-only "$base" "$E2E_HEAD")"
sed 's/^/  changed: /' <<<"$changed"
# A here-string, never `echo | grep -q`: under pipefail grep -q exits on its
# first match, echo takes SIGPIPE, and the pipeline reads a large app-touching
# diff as docs-only.
if grep -qE '^(src/|supabase/functions/|supabase/migrations/)' <<<"$changed"; then
  emit true ran
fi
emit false stood-down
