#!/usr/bin/env bash
# Tests for the Vercel ignoreCommand guard.
#
# Every case runs against a REAL git repository with real commits. A fixture the
# test writes itself would only prove the script agrees with the test's own idea
# of a diff; these prove it agrees with git.
#
# Exit 0 means SKIP the build, exit 1 means BUILD it.
#
# tests/, scripts/ and supabase/ were pinned as BUILD until 2026-09-14, on two
# stated worries. Both were checked and neither survives:
#
#   "`tsc -b` may reach test sources" — it does. tsconfig.tests.json includes
#   tests/, scripts/**/*.ts and 40 supabase/functions sources. But EVERY
#   tsconfig in this repo sets noEmit, so `tsc -b` is a typecheck that emits
#   nothing. `dist` comes only from `vite build`, which resolves from index.html
#   through src/. No file under those three paths can change a deployed byte,
#   and nothing in src/ imports from them.
#
#   "a migration can accompany a shipped change" — it can, and that commit
#   still BUILDS. The predicate is all-or-nothing: it skips only when EVERY
#   changed file is non-deployable. A migration beside a src/ change is a
#   mixed commit, which is the invariant the mixed-* cases below now pin.
#
# What is genuinely given up is a third copy of the typecheck. CI runs
# `npm run check` on every pull request and deploy.yml runs it again on push to
# main; the Vercel build was the third. The cases below pin the new boundary in
# both directions, because a widening asserted only by the paths it adds is a
# widening nobody can see the edge of.
#
# The suite ends with two mutations. Each deletes one guard, confirms the
# deletion landed at the intended site, and requires the mutant to misbehave:
# the catch-all that classifies unknown paths as deployable, and the guard that
# refuses to read an empty diff as nothing changed. A guard whose removal
# changes nothing was never guarding.
#
# One refusal arm is deliberately NOT mutation-proven and cannot be. If
# `git diff` fails, `changed` is empty and the empty-diff guard on the next line
# produces the same refusal with a different message, so deleting the
# could-not-read-the-diff arm changes only wording. It is shadowed, not
# untested; the empty-diff guard is what enforces both.

set -uo pipefail

GUARD=$(cd "$(dirname "$0")" && pwd)/vercel-ignore-build.sh
# Bare `mktemp -d` already honours $TMPDIR, and the explicit template tripped
# securityHardening's inline-body rule: it reads `-d "` followed by a `$` as a
# curl request body passed inline. No curl here, but the shorter form is
# equivalent and does not ask the guard to be narrowed.
TMP=$(mktemp -d)
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

# --- the widened set: non-deployable because noEmit means they cannot reach dist
r=$(newrepo tests_skip);  commit_in "$r" sh -c 'echo t > tests/a.test.ts'
run "tests-only change skips"                 "$r" 0

r=$(newrepo supa_skip);   commit_in "$r" sh -c 'mkdir -p supabase/migrations; echo s > supabase/migrations/001.sql'
run "supabase migration-only change skips"    "$r" 0

r=$(newrepo supafn_skip); commit_in "$r" sh -c 'mkdir -p supabase/functions/x; echo s > supabase/functions/x/index.ts'
run "supabase function-only change skips"     "$r" 0

r=$(newrepo scripts_skip); commit_in "$r" sh -c 'echo s > scripts/tool.ts'
run "scripts-only change skips"               "$r" 0

# --- all-or-nothing: one deployable file in the commit builds the whole commit.
# These are the cases that make the widening safe, so they are pinned explicitly.
r=$(newrepo mixed_tests); commit_in "$r" sh -c 'echo t > tests/a.test.ts; echo m >> src/app.ts'
run "tests plus source builds"                "$r" 1

r=$(newrepo mixed_supa);  commit_in "$r" sh -c 'mkdir -p supabase/migrations; echo s > supabase/migrations/002.sql; echo m >> src/app.ts'
run "migration plus source builds"            "$r" 1

r=$(newrepo mixed_scripts); commit_in "$r" sh -c 'echo s > scripts/tool.ts; echo m >> src/app.ts'
run "scripts plus source builds"              "$r" 1

# --- the deployable root files. vercel.json matters most: deploy.yml polls
# production for the CSP and security headers it declares, so a header change
# that never deployed would be checked against the previous deployment and pass.
r=$(newrepo vercel_json); commit_in "$r" sh -c 'echo "{}" > vercel.json'
run "vercel.json builds (headers gate reads prod)" "$r" 1

r=$(newrepo pkg_json);    commit_in "$r" sh -c 'echo "{}" > package.json'
run "package.json builds"                     "$r" 1

r=$(newrepo vite_cfg);    commit_in "$r" sh -c 'echo x > vite.config.ts'
run "vite.config.ts builds"                   "$r" 1

r=$(newrepo html);        commit_in "$r" sh -c 'echo x > index.html'
run "index.html builds"                       "$r" 1

# --- prefix traps: a path that merely STARTS with a skipped name is not in it
r=$(newrepo prefix_trap); commit_in "$r" sh -c 'echo p > docsomething.ts'
run "docs-prefixed source file builds"        "$r" 1

r=$(newrepo prefix_tests); commit_in "$r" sh -c 'echo p > testsomething.ts'
run "tests-prefixed source file builds"       "$r" 1

r=$(newrepo prefix_scripts); commit_in "$r" sh -c 'echo p > scriptsy.ts'
run "scripts-prefixed source file builds"     "$r" 1

r=$(newrepo prefix_supa); commit_in "$r" sh -c 'echo p > supabaseClient.ts'
run "supabase-prefixed source file builds"    "$r" 1

d="$TMP/first"; mkdir -p "$d"
( cd "$d" || exit 1
  git init -q .; git config user.email test@example.invalid; git config user.name test
  echo a > a.md; git add -A; git commit -qm first )
run "no parent commit builds"                 "$d" 1

d="$TMP/notgit"; mkdir -p "$d"
run "non-git directory builds"                "$d" 1

# --- an empty diff. The guard for it is the one the header comment calls out
# by name, and until now it was the only refusal path with no case: a commit
# that changes nothing is indistinguishable, from inside this script, from a
# diff it failed to compute, so it must build. An empty commit is the cheapest
# way to produce the condition for real rather than by stubbing git.
r=$(newrepo empty_diff); ( cd "$r" || exit 1; git commit -q --allow-empty -m "empty" )
run "empty diff builds (refuses to infer nothing changed)" "$r" 1

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

echo
echo "MUTATION: delete the guard that refuses to read an empty diff as nothing changed"
MUT2="$TMP/mutant-empty.sh"
sed '/^\[ -n "\$changed" \] || build "diff reported no files/d' "$GUARD" > "$MUT2"
removed2=$(diff "$GUARD" "$MUT2" | grep -c '^<')
if [ "$removed2" -ne 1 ]; then
  echo "FAIL - mutation did not land as intended ($removed2 lines removed, expected 1); the run below would prove nothing"
  exit 1
fi
echo "  mutation landed: 1 line removed at the intended site"

r=$(newrepo mutant_empty); ( cd "$r" || exit 1; git commit -q --allow-empty -m "empty" )
out=$(cd "$r" && bash "$MUT2" 2>&1); got=$?
if [ "$got" -ne 0 ]; then
  echo "FAIL - the mutant still refused to skip an empty diff (rc=$got); that guard is not what enforces this"
  exit 1
fi
echo "  mutant SKIPS an empty diff (rc=0) — the guard is load-bearing and its removal is detectable"

[ "$fail" -eq 0 ] || exit 1
echo
echo "all cases passed and the guard is mutation-proven"
