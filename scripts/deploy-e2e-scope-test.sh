#!/usr/bin/env bash
# Tests for scripts/deploy-e2e-scope.sh, the deploy's E2E scope decision.
#
# Every case runs the real script against a REAL git repository with real
# commits and a fixture supabase/functions/_shared/deskParking.ts, reading the
# flag through the same `npx tsx` import the deploy uses. A stub of git or of the
# flag would prove only that the script agrees with this file's idea of them.
#
# A case passes when the script exits 0 having written exactly one `full=` and
# one `scope=` line with the expected values, and the scope is one
# tests/e2e/coverageReporter.ts recognises. A refusal case passes when the
# script exits non-zero having written nothing.
#
# The suite ends with a mutation: it moves the parked block after the base
# block, confirms the move landed, and requires the mutant to run the full
# suite on a parked dispatch. That is the defect this script exists to close —
# a dispatch has no base, and an unresolvable base used to run everything before
# parking was read.

set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
SCRIPT="$HERE/deploy-e2e-scope.sh"
REPORTER="$ROOT/tests/e2e/coverageReporter.ts"
# Bare `mktemp -d`, as vercel-ignore-build-test.sh explains: an explicit
# template trips securityHardening's inline-body rule.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
pass=0; fail=0

recognised="$(grep 'includes(fmpProjects)' "$REPORTER")"
if [ -z "$recognised" ]; then
  echo "FAIL - cannot find the reporter's recognised scope list; every scope check below would be vacuous"
  exit 1
fi

# newrepo NAME PARKED — PARKED is true, false, yes (a non-boolean) or missing.
newrepo() {
  d="$TMP/$1"
  mkdir -p "$d/docs" "$d/src" "$d/supabase/functions/_shared" "$d/supabase/migrations" "$d/tests"
  (
    cd "$d" || exit 1
    git init -q .
    git config user.email test@example.invalid
    git config user.name test
    printf 'node_modules\n' > .gitignore
    printf '{ "type": "module" }\n' > package.json
    echo base > src/app.ts
    echo base > docs/readme.md
    case "$2" in
      missing) ;;
      yes) printf 'export const DESK_PARKED = "yes";\n' > supabase/functions/_shared/deskParking.ts ;;
      *) printf 'export const DESK_PARKED = %s;\n' "$2" > supabase/functions/_shared/deskParking.ts ;;
    esac
    git add -A
    git commit -qm base
  ) || exit 1
  ln -s "$ROOT/node_modules" "$d/node_modules"
  printf '%s' "$d"
}

commit_in() { ( cd "$1" || exit 1; shift; "$@"; git add -A; git commit -qm change ); }

parent_of() { git -C "$1" rev-parse HEAD~1; }

# expect NAME REPO BASE WANT_FULL WANT_SCOPE [SCRIPT]
expect() {
  name=$1 repo=$2 base=$3 want_full=$4 want_scope=$5 script=${6:-$SCRIPT}
  out="$TMP/output-$pass-$fail"
  : > "$out"
  head=$(git -C "$repo" rev-parse HEAD)
  log=$(cd "$repo" && E2E_BASE="$base" E2E_HEAD="$head" GITHUB_OUTPUT="$out" bash "$script" 2>&1); rc=$?
  fulls=$(grep -c '^full=' "$out"); scopes=$(grep -c '^scope=' "$out")
  got_full=$(sed -n 's/^full=//p' "$out" | head -1); got_scope=$(sed -n 's/^scope=//p' "$out" | head -1)
  if [ "$rc" -eq 0 ] && [ "$fulls" -eq 1 ] && [ "$scopes" -eq 1 ] &&
    [ "$got_full" = "$want_full" ] && [ "$got_scope" = "$want_scope" ] &&
    grep -qF "\"$got_scope\"" <<<"$recognised"; then
    printf 'ok   - %-58s full=%s scope=%s\n' "$name" "$got_full" "$got_scope"
    pass=$((pass + 1))
  else
    printf 'FAIL - %-58s rc=%s full=%s(x%s) scope=%s(x%s) want %s/%s :: %s\n' \
      "$name" "$rc" "$got_full" "$fulls" "$got_scope" "$scopes" "$want_full" "$want_scope" "${log##*$'\n'}"
    fail=$((fail + 1))
  fi
}

# refuses NAME REPO BASE [HEAD_OVERRIDE] — non-zero exit, nothing written.
refuses() {
  name=$1 repo=$2 base=$3
  out="$TMP/output-$pass-$fail"
  : > "$out"
  if [ "${4:-}" = "no-head" ]; then
    log=$(cd "$repo" && env -u E2E_HEAD E2E_BASE="$base" GITHUB_OUTPUT="$out" bash "$SCRIPT" 2>&1); rc=$?
  else
    head=$(git -C "$repo" rev-parse HEAD)
    log=$(cd "$repo" && E2E_BASE="$base" E2E_HEAD="$head" GITHUB_OUTPUT="$out" bash "$SCRIPT" 2>&1); rc=$?
  fi
  if [ "$rc" -ne 0 ] && [ ! -s "$out" ]; then
    printf 'ok   - %-58s rc=%s, nothing written\n' "$name" "$rc"
    pass=$((pass + 1))
  else
    printf 'FAIL - %-58s rc=%s wrote %s bytes :: %s\n' "$name" "$rc" "$(wc -c < "$out")" "${log##*$'\n'}"
    fail=$((fail + 1))
  fi
}

ZEROS=0000000000000000000000000000000000000000
UNKNOWN=1111111111111111111111111111111111111111

# --- parked: every shape stands down, a dispatch above all
r=$(newrepo parked_dispatch true)
expect "parked, empty base (a dispatch)"            "$r" ""     false stood-down-parked
expect "parked, forty-zero base (a new branch)"     "$r" "$ZEROS" false stood-down-parked
expect "parked, unknown base"                       "$r" "$UNKNOWN" false stood-down-parked

r=$(newrepo parked_src true);  commit_in "$r" sh -c 'echo more >> src/app.ts'
expect "parked, src/ change"                         "$r" "$(parent_of "$r")" false stood-down-parked

r=$(newrepo parked_docs true); commit_in "$r" sh -c 'echo more >> docs/readme.md'
expect "parked, docs-only change"                    "$r" "$(parent_of "$r")" false stood-down-parked

# --- unparked: an unresolvable base runs everything
r=$(newrepo unparked_dispatch false)
expect "unparked, empty base (a dispatch)"          "$r" ""     true ran
expect "unparked, forty-zero base"                  "$r" "$ZEROS" true ran
expect "unparked, unknown base"                     "$r" "$UNKNOWN" true ran

# --- unparked: a resolvable base runs only for app paths
r=$(newrepo unparked_docs false); commit_in "$r" sh -c 'echo more >> docs/readme.md'
expect "unparked, docs-only change"                  "$r" "$(parent_of "$r")" false stood-down

r=$(newrepo unparked_src false); commit_in "$r" sh -c 'echo more >> src/app.ts'
expect "unparked, src/ change"                       "$r" "$(parent_of "$r")" true ran

r=$(newrepo unparked_fn false); commit_in "$r" sh -c 'mkdir -p supabase/functions/x; echo s > supabase/functions/x/index.ts'
expect "unparked, supabase/functions/ change"        "$r" "$(parent_of "$r")" true ran

r=$(newrepo unparked_mig false); commit_in "$r" sh -c 'echo s > supabase/migrations/001.sql'
expect "unparked, supabase/migrations/ change"       "$r" "$(parent_of "$r")" true ran

r=$(newrepo unparked_prefix false); commit_in "$r" sh -c 'echo p > srcthing.ts; echo p > tests/supabase-functions.md'
expect "unparked, app-prefixed non-app paths"        "$r" "$(parent_of "$r")" false stood-down

# One src/ path ahead of more than 200 KB of tests/ names. `echo | grep -q`
# under pipefail reads this as docs-only on macOS (grep exits on the first
# line, echo takes SIGPIPE); the here-string cannot.
r=$(newrepo unparked_large false)
commit_in "$r" bash -c 'echo more >> src/app.ts; for i in $(seq -w 1 3000); do : > "tests/generated-name-padding-that-makes-the-changed-path-list-large-enough-$i.test.ts"; done'
names=$(git -C "$r" diff --name-only "$(parent_of "$r")" HEAD | wc -c | tr -d ' ')
if [ "$names" -le 200000 ]; then
  echo "FAIL - the large-diff fixture is only $names bytes of names; it would not exercise the pipe"
  fail=$((fail + 1))
fi
expect "unparked, src/ plus ${names} B of tests/ names" "$r" "$(parent_of "$r")" true ran

# --- refusals: nothing written, non-zero
r=$(newrepo malformed yes)
refuses "DESK_PARKED is not a boolean"                "$r" ""
r=$(newrepo missing missing)
refuses "deskParking.ts is missing"                   "$r" ""
r=$(newrepo nohead false)
refuses "E2E_HEAD is unset"                           "$r" "" no-head

echo "---"
echo "$pass passed; $fail failed"

echo
echo "MUTATION: move the parked block after the unresolvable-base block"
MUT="$TMP/mutant-order.sh"
awk '
  /^# --- parked ---$/ { mode = "parked" }
  /^# --- base ---$/ { mode = "base" }
  {
    if (mode == "parked") { parked = parked $0 "\n" }
    else if (mode == "base") {
      base = base $0 "\n"
      if ($0 == "fi") { printf "%s%s", base, parked; mode = "after" }
    } else { print }
  }
' "$SCRIPT" > "$MUT"
orig_lines=$(wc -l < "$SCRIPT"); mut_lines=$(wc -l < "$MUT")
parked_at=$(grep -n '^# --- parked ---$' "$MUT" | cut -d: -f1)
base_at=$(grep -n '^# --- base ---$' "$MUT" | cut -d: -f1)
if [ "$orig_lines" -ne "$mut_lines" ] || [ -z "$parked_at" ] || [ -z "$base_at" ] ||
  [ "$parked_at" -le "$base_at" ] || cmp -s "$SCRIPT" "$MUT"; then
  echo "FAIL - mutation did not land as intended (lines $orig_lines -> $mut_lines, parked@$parked_at base@$base_at); the run below would prove nothing"
  exit 1
fi
echo "  mutation landed: parked block now at line $parked_at, after the base block at $base_at"

r=$(newrepo mutant_dispatch true)
out="$TMP/mutant-output"; : > "$out"
head=$(git -C "$r" rev-parse HEAD)
(cd "$r" && E2E_BASE="" E2E_HEAD="$head" GITHUB_OUTPUT="$out" bash "$MUT" >/dev/null 2>&1); rc=$?
if [ "$rc" -ne 0 ] || ! grep -qx 'full=true' "$out"; then
  echo "FAIL - the mutant did not run the full suite on a parked dispatch (rc=$rc, output: $(tr '\n' ' ' < "$out")); the order is not what enforces this"
  exit 1
fi
echo "  mutant runs the full suite on a parked dispatch — the parked-first order is load-bearing"

[ "$fail" -eq 0 ] || exit 1
echo
echo "all cases passed and the order is mutation-proven"
