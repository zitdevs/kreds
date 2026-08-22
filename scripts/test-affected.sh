#!/usr/bin/env sh
#
# Runs the tests a push can actually break, and nothing else.
#
# The scoping happens twice, on purpose:
#
#   1. Package scope. The changed files come from git, and each one is mapped
#      to the workspace package that contains it. Every affected package plus
#      everything that depends on it gets selected. A package nobody touched is
#      never started.
#
#   2. File scope. Each selected package runs its own "test:related" script and
#      receives <base> as the first argument, so the package decides which of
#      its tests the change can reach. In this repo that is
#      "vitest run --changed <base>", which walks the module graph.
#
# The mapping is done here rather than with pnpm's own "...[<ref>]" filter,
# which looks like the obvious tool and is a trap: inside a linked git worktree
# it returns an empty set, because there `.git` is a file rather than a
# directory. The hook would then report that nothing is affected and let the
# push through without running a single test, which is the one failure mode a
# pre-push gate must never have. Deriving the file list with git and filtering
# by directory works in a worktree and in a normal clone alike.
#
# A package without a "test:related" script is skipped by pnpm, so a package
# with no tests yet never blocks a push. The affected list is printed before the
# run, so a package that is affected but runs nothing stays visible.
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
# saying so, so run everything and say why. Loud and rare, never a silent
# default.
if [ -z "$base" ]; then
  echo "pre-push: no upstream branch and no origin/main, the changed set cannot be computed."
  echo "pre-push: running the full test suite instead."
  exec pnpm -r --if-present run test
fi

echo "pre-push: comparing against $base_label ($(git rev-parse --short "$base"))"

# Everything the push carries: committed since the base, staged, unstaged, and
# untracked. The same four sources vitest considers, so the two layers agree on
# what "changed" means.
changed=$(
  {
    git diff --name-only "$base" HEAD
    git diff --name-only HEAD
    git diff --name-only --cached
    git ls-files --others --exclude-standard
  } | sort -u
)

if [ -z "$changed" ]; then
  echo "pre-push: nothing changed since $base_label. Nothing to run."
  exit 0
fi

# Workspace package directories, relative to the root. The root project itself
# is dropped: it is not a package anyone can filter to, and leaving it in would
# match every path.
packages=$(pnpm list --recursive --depth -1 --parseable | while read -r dir; do
  [ "$dir" = "$root" ] || printf '%s\n' "${dir#"$root"/}"
done | sort -r)

# Map each changed file to the deepest package that contains it. A file that
# belongs to no package is workspace-level configuration, and those can change
# the behaviour of every package at once.
affected=""
root_level=0

for file in $changed; do
  owner=""
  for pkg in $packages; do
    case "$file" in
      "$pkg"/*)
        owner="$pkg"
        break
        ;;
    esac
  done

  if [ -z "$owner" ]; then
    root_level=1
  else
    case " $affected " in
      *" $owner "*) ;;
      *) affected="$affected $owner" ;;
    esac
  fi
done

if [ "$root_level" = "1" ]; then
  echo "pre-push: workspace-level files changed, so every package is in scope."
  exec pnpm -r --if-present run "test:related" "$base"
fi

if [ -z "$affected" ]; then
  # git reported changes and none of them mapped anywhere. That is a
  # contradiction rather than a quiet "nothing to do", so fail loudly.
  echo "pre-push: files changed but none mapped to a workspace package."
  echo "pre-push: running the full test suite rather than trusting that."
  exec pnpm -r --if-present run "test:related" "$base"
fi

# "...{dir}" selects the package in that directory plus everything that depends
# on it. Dependents matter: a change in packages/ui has to drag in both apps.
filters=""
for pkg in $affected; do
  filters="$filters --filter ...{$pkg}"
done

# Print what will actually run rather than what changed. The two differ
# whenever a shared package is touched, and the difference is the whole point of
# pulling in dependents. A package listed here that then runs nothing has no
# "test:related" script, which is visible precisely because this list is.
echo "pre-push: in scope, including dependents:"
# shellcheck disable=SC2086
pnpm $filters list --depth -1 --parseable 2>/dev/null | while read -r dir; do
  [ "$dir" = "$root" ] || echo "  ${dir#"$root"/}"
done

# shellcheck disable=SC2086
exec pnpm $filters --if-present run "test:related" "$base"
