#!/usr/bin/env bash
# Tests for the Vercel ignoreCommand guard.
#
# Every case runs against a REAL git repository with real commits. A fixture the
# test writes itself would only prove the script agrees with the test's own idea
# of a diff; these prove it agrees with git.
#
# Exit 0 means SKIP the build, exit 1 means BUILD it.
#
# Three cases exist specifically to pin this repo's path set against a careless
# widening: tests/, supabase/ and scripts/ must BUILD. They are the paths a
# reader is most likely to assume are non-deployable — `tsc -b` may reach test
# sources, and a migration can accompany a shipped change.
#
# The suite ends with a mutation: the catch-all that classifies unknown paths as
# deployable is deleted, the deletion is confirmed to have landed at the intended
# site, and the mutant is required to misbehave. A guard whose removal changes
# nothing was never guarding.

set -uo pipefail

GUARD=$(cd "$(dirname "$0")" && pwd)/vercel-ignore-build.sh
TMP=$(mktemp -d "${TMPDIR:-/tmp}/ignore-build-test.XXXXXX")
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
pass=0; fail=0

newrepo() {
  d="$TMP/$1"
  mkdir -p "$d/docs" "$d/src" "$d/sweeps" "$d/tests" "$d/supabase" "$d/scripts" "$d/.github"
  (
    cd "$d" || exit 1
    git init -q .
    git config user.email test@example.invalid
    git config user.name test
    echo base > src/app.ts
    echo base > docs/readme.md
    git add -A
    git commit -qm base
  )
  printf '%s' "$d"
}

commit_in() { ( cd "$1" || exit 1; shift; "$@"; git add -A; git commit -qm change ); }

run() {
  name=$1 repo=$2 want=$3
  out=$(cd "$repo" && bash "$GUARD" 2>&1); got=$?
  if [ "$got" -eq "$want" ]; then
    printf 'ok   - %-46s (rc=%s) %s\n' "$name" "$got" "${out%%$'\n'*}"
    pass=$((pass + 1))
  else
    printf 'FAIL - %-46s want rc=%s got rc=%s :: %s\n' "$name" "$want" "$got" "$out"
    fail=$((fail + 1))
  fi
}

r=$(newrepo docs_only);   commit_in "$r" sh -c 'echo more >> docs/readme.md'
run "docs-only change skips"                  "$r" 0

r=$(newrepo research);    commit_in "$r" sh -c 'mkdir -p docs/research; echo r > docs/research/note.md'
run "docs/research change skips"              "$r" 0

r=$(newrepo sweeps_only); commit_in "$r" sh -c 'echo s > sweeps/universe.txt'
run "sweeps data change skips"                "$r" 0

r=$(newrepo wf_change);   commit_in "$r" sh -c 'echo w > .github/x.yml'
run "workflow-only change skips"              "$r" 0

r=$(newrepo root_md);     commit_in "$r" sh -c 'echo m > README.md'
run "root markdown skips"                     "$r" 0

r=$(newrepo src_change);  commit_in "$r" sh -c 'echo more >> src/app.ts'
run "source change builds"                    "$r" 1

r=$(newrepo mixed);       commit_in "$r" sh -c 'echo m >> docs/readme.md; echo m >> src/app.ts'
run "docs plus source builds"                 "$r" 1

r=$(newrepo tests_build); commit_in "$r" sh -c 'echo t > tests/a.test.ts'
run "tests change BUILDS (tsc -b may reach)"  "$r" 1

r=$(newrepo supa_build);  commit_in "$r" sh -c 'echo s > supabase/migration.sql'
run "supabase change BUILDS"                  "$r" 1

r=$(newrepo scripts_build); commit_in "$r" sh -c 'echo s > scripts/tool.ts'
run "scripts change BUILDS"                   "$r" 1

r=$(newrepo prefix_trap); commit_in "$r" sh -c 'echo p > docsomething.ts'
run "docs-prefixed source file builds"        "$r" 1

d="$TMP/first"; mkdir -p "$d"
( cd "$d" || exit 1
  git init -q .; git config user.email test@example.invalid; git config user.name test
  echo a > a.md; git add -A; git commit -qm first )
run "no parent commit builds"                 "$d" 1

d="$TMP/notgit"; mkdir -p "$d"
run "non-git directory builds"                "$d" 1

echo "---"
echo "$pass passed; $fail failed"

echo
echo "MUTATION: delete the catch-all that marks unknown paths deployable"
MUT="$TMP/mutant.sh"
sed '/^    \*) build "deployable path changed/d' "$GUARD" > "$MUT"
removed=$(diff "$GUARD" "$MUT" | grep -c '^<')
if [ "$removed" -ne 1 ]; then
  echo "FAIL - mutation did not land as intended ($removed lines removed, expected 1); the run below would prove nothing"
  exit 1
fi
echo "  mutation landed: 1 line removed at the intended site"

r=$(newrepo mutant_case); commit_in "$r" sh -c 'echo more >> src/app.ts'
out=$(cd "$r" && bash "$MUT" 2>&1); got=$?
if [ "$got" -ne 0 ]; then
  echo "FAIL - the mutant still refused to skip a source change (rc=$got); the catch-all is not what enforces this"
  exit 1
fi
echo "  mutant SKIPS a source change (rc=0) — the catch-all is load-bearing and its removal is detectable"

[ "$fail" -eq 0 ] || exit 1
echo
echo "all cases passed and the guard is mutation-proven"
