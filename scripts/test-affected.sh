#!/usr/bin/env sh
#
# Runs the tests a push can actually break, and nothing else.
#
# The scoping happens twice, on purpose:
#
#   1. Package scope. "pnpm --filter ...[<base>]" selects only the workspace
#      packages whose files changed since <base>, plus every package that
#      depends on them. A package nobody touched is never started.
#
#   2. File scope. Each selected package runs its own "test:related" script and
#      receives <base> as the first argument, so the package decides which of
#      its tests the change can reach. In this repo that is
#      "vitest run --changed <base>", which walks the module graph.
#
# A package without a "test:related" script is skipped by pnpm, so a package
# with no tests yet never blocks a push. The affected list is printed before
# the run, so a package that is affected but runs nothing stays visible.
#
# Adding a second kind of check later means adding a "<check>:related" script
# to the packages that want it and one more pnpm line at the bottom.

set -e

root=$(git rev-parse --show-toplevel)
cd "$root"

# The base is the commit this push is measured against. In order:
#   1. The merge base with the branch's upstream, which is what the remote has.
#   2. The merge base with origin/main, for a branch that was never pushed.
#   3. Neither exists, handled right below.
base=""
base_label=""

upstream=$(git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>/dev/null || true)
if [ -n "$upstream" ]; then
  base=$(git merge-base "$upstream" HEAD 2>/dev/null || true)
  base_label="$upstream"
fi

if [ -z "$base" ] && git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null; then
  base=$(git merge-base refs/remotes/origin/main HEAD 2>/dev/null || true)
  base_label="origin/main"
fi

# No upstream and no origin/main means there is no honest way to compute a
# changed set. Skipping the checks would let a broken push through without
# saying so, which is the one thing a pre-push hook must never do, so run
# everything and say why. Loud and rare, never a silent default.
if [ -z "$base" ]; then
  echo "pre-push: no upstream branch and no origin/main, the changed set cannot be computed."
  echo "pre-push: running the full test suite instead."
  exec pnpm -r --if-present run test
fi

echo "pre-push: comparing against $base_label ($(git rev-parse --short "$base"))"

# "pnpm list" always includes the workspace root itself, so drop that line.
affected=$(pnpm --filter "...[$base]" list --depth -1 --parseable | while read -r dir; do
  [ "$dir" = "$root" ] || printf '%s\n' "${dir#"$root"/}"
done)

if [ -z "$affected" ]; then
  echo "pre-push: no workspace package is affected. Nothing to run."
  exit 0
fi

echo "pre-push: affected packages:"
echo "$affected" | while read -r pkg; do
  echo "  $pkg"
done

pnpm --if-present --filter "...[$base]" run test:related "$base"
