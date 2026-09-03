#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 SKIPS the build, exit 1 BUILDS it.
#
# Vercel bills Build CPU Minutes per deployment, and the charge is dominated by
# fixed per-deploy overhead — container provision, dependency install, artifact
# upload — not by the build step itself. levelflow's build runs in 8-15s, yet
# Aug 3 - Sep 2 billed 8,444 CPU-minutes across the fleet over roughly a
# thousand deploys, about 8 CPU-minutes each. Making a fast build faster saves
# almost nothing; not deploying a commit that changes nothing deployable saves
# the whole deploy. This repo is the fleet's heaviest deployer — every pull
# request produces a preview deploy and a production deploy on merge — so it is
# where the lever is worth the most.
#
# The predicate is deliberately one-sided. It skips ONLY when every changed file
# is provably non-deployable. Every other outcome — a deployable file, an
# unreadable diff, a missing parent commit, an empty file list — builds. A wrong
# skip ships stale code and is invisible; a wrong build costs a fraction of a
# cent. The asymmetry decides the default.
#
# The Root Directory is the repository root here, and `git diff --name-only`
# reports repository-relative paths, so the patterns below are
# repository-relative and this script does not care where it is invoked from.
#
# On the path set: `sweeps/` is research data (jsonl manifests, universe lists)
# and `src/` imports nothing from it or from `docs/` — verified before this list
# was written. `tests/`, `supabase/` and `scripts/` are deliberately ABSENT.
# AGENTS.md states it outright — "Vercel type-checks the whole graph, so a test
# type error fails production" — so a test change really can decide whether
# production builds. A migration can also accompany a shipped change. All three
# build.

set -uo pipefail

build() { echo "BUILD: $1"; exit 1; }
skip()  { echo "SKIP: $1";  exit 0; }

git rev-parse --git-dir >/dev/null 2>&1 || build "not a git checkout; cannot classify the change"
git rev-parse --verify HEAD^ >/dev/null 2>&1 || build "no parent commit (first deploy or shallow clone)"

changed=$(git diff --name-only HEAD^ HEAD 2>/dev/null) \
  || build "could not read the diff"

# An empty list is not proof that nothing changed — it is equally consistent
# with a diff this script failed to compute. It must never read as "skip".
[ -n "$changed" ] || build "diff reported no files; refusing to infer that nothing changed"

while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    docs/*|.github/*|sweeps/*|*.md) ;;
    *) build "deployable path changed: $f" ;;
  esac
done <<EOF2
$changed
EOF2

count=$(printf '%s\n' "$changed" | grep -c .)
skip "only non-deployable paths changed ($count file(s))"
