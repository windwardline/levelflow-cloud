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
# Why tests/, scripts/ and supabase/ are on the non-deployable side (2026-09-14).
# They were on the deployable side until then, on the worry that `tsc -b` reaches
# test sources. It does: tsconfig.tests.json includes tests/, scripts/**/*.ts and
# 40 supabase/functions sources. But every tsconfig here sets noEmit, so `tsc -b`
# is a typecheck that writes nothing, and `dist` comes only from `vite build`
# resolving index.html through src/. Nothing in src/ imports from those three
# paths. A commit confined to them therefore produces a byte-identical
# deployment, and the only thing a skip gives up is a THIRD copy of the
# typecheck — CI runs `npm run check` on every pull request and deploy.yml runs
# it again on push to main.
#
# A migration or an edge-function change that accompanies a shipped frontend
# change still builds, because the predicate is all-or-nothing: one deployable
# file in the commit builds the whole commit. That is what makes this safe, so
# scripts/vercel-ignore-build-test.sh pins it with explicit mixed-commit cases
# rather than leaving it implied.
#
# vercel.json stays deployable and must remain so: deploy.yml polls production
# for the CSP and security headers vercel.json declares, so a header change that
# never deployed would be checked against the previous deployment and pass.
#
# The Root Directory is the repository root here, and `git diff --name-only`
# reports repository-relative paths, so the patterns below are
# repository-relative and this script does not care where it is invoked from.
#
# On the path set: `sweeps/` is research data (jsonl manifests, universe lists)
# and `src/` imports nothing from it or from `docs/` — verified before this list
# was written. `tests/`, `supabase/` and `scripts/` are on the list too, for the
# reason given at the top of this file: the whole-graph type-check emits nothing,
# so a commit confined to them deploys byte-identical output.
#
# This block was ACCURATE until #639. Those three really were absent from the
# skip list and really did build, and this text said so correctly. #639 moved
# them onto the skip side and thereby falsified it, and the falsified text went
# on standing afterwards — three lines above the case statement that
# contradicts it. Whichever of the two comment blocks a reader reached first
# decided what they believed the script did. If the path set changes again,
# both blocks change with it.

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
    docs/*|.github/*|sweeps/*|tests/*|scripts/*|supabase/*|*.md) ;;
    *) build "deployable path changed: $f" ;;
  esac
done <<EOF2
$changed
EOF2

count=$(printf '%s\n' "$changed" | grep -c .)
skip "only non-deployable paths changed ($count file(s))"
