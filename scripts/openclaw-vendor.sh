#!/usr/bin/env bash
#
# Vendor upstream openclaw source into vendor/openclaw via git subtree.
#
# Separate from openclaw-sync.sh because vendoring is destructive:
#   - sync = inspect what changed
#   - vendor = actually pull code into our tree
#
# First run performs `git subtree add`. Subsequent runs perform `git subtree pull`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYNC_DIR="$ROOT/.upstream-sync"
META="$SYNC_DIR/openclaw.json"
PREFIX="vendor/openclaw"

REPO=$(jq -r '.repo'   "$META")
BRANCH=$(jq -r '.branch' "$META")
SHA=$(jq -r '.pinnedCommit // ""' "$META")

if [ -z "$SHA" ]; then
  echo "error: pinnedCommit is null. Run scripts/openclaw-sync.sh --apply first."
  exit 2
fi

cd "$ROOT"

if [ ! -d "$PREFIX" ]; then
  echo "==> First vendor: git subtree add $PREFIX @ $SHA"
  git subtree add --prefix "$PREFIX" "$REPO" "$SHA" --squash -m "vendor: import openclaw@${SHA:0:12}"
else
  echo "==> Updating vendor to $SHA"
  git subtree pull --prefix "$PREFIX" "$REPO" "$SHA" --squash -m "vendor: update openclaw@${SHA:0:12}"
fi

echo "==> Done. Run npm run test:compat to verify."
