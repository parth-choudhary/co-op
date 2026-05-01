#!/usr/bin/env bash
#
# Refresh our view of upstream openclaw/openclaw.
#
# Responsibilities:
#   1. Clone/update a mirror under .upstream-sync/cache/openclaw
#   2. Resolve the latest commit on the watched branch
#   3. Diff watched paths against our pinnedCommit
#   4. Write a human-readable report to .upstream-sync/last-report.md
#   5. If --apply is passed AND compat tests pass, bump pinnedCommit
#
# This script does NOT mutate vendored code. Vendoring lives under
# scripts/openclaw-vendor.sh (git-subtree flow). Keeping them separate means
# refresh-and-review is cheap; an actual upgrade is a deliberate second step.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYNC_DIR="$ROOT/.upstream-sync"
CACHE_DIR="$SYNC_DIR/cache/openclaw"
META="$SYNC_DIR/openclaw.json"
WATCHED="$SYNC_DIR/watched-paths.json"
REPORT="$SYNC_DIR/last-report.md"

APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --help|-h)
      echo "Usage: $0 [--apply]"
      echo "  (no flag) : diff + report only"
      echo "  --apply   : run compat tests; if green, bump pinnedCommit"
      exit 0 ;;
  esac
done

command -v jq  >/dev/null 2>&1 || { echo "jq is required"; exit 2; }
command -v git >/dev/null 2>&1 || { echo "git is required"; exit 2; }

REPO=$(jq -r '.repo'   "$META")
BRANCH=$(jq -r '.branch' "$META")
PINNED=$(jq -r '.pinnedCommit // ""' "$META")

echo "==> Refreshing mirror of $REPO ($BRANCH)"
if [ ! -d "$CACHE_DIR/.git" ]; then
  git clone --depth 200 --branch "$BRANCH" "$REPO" "$CACHE_DIR"
else
  git -C "$CACHE_DIR" fetch --depth 200 origin "$BRANCH"
  git -C "$CACHE_DIR" reset --hard "origin/$BRANCH"
fi

LATEST=$(git -C "$CACHE_DIR" rev-parse HEAD)
echo "    Latest: $LATEST"
echo "    Pinned: ${PINNED:-<none>}"

if [ -z "$PINNED" ]; then
  echo "# openclaw upstream sync — initial" > "$REPORT"
  echo "" >> "$REPORT"
  echo "No pinnedCommit yet. Run with \`--apply\` after a human review to set pin to $LATEST." >> "$REPORT"
  DIFF_FILES=""
else
  echo "==> Diffing watched paths"
  WATCHED_PATHS=$(jq -r '.paths[]' "$WATCHED")
  DIFF_FILES=$(mktemp)
  : > "$DIFF_FILES"
  CHANGED=0
  echo "# openclaw upstream sync — $(date -u +%FT%TZ)" > "$REPORT"
  echo "" >> "$REPORT"
  echo "- Upstream repo: \`$REPO\` ($BRANCH)" >> "$REPORT"
  echo "- Pinned: \`$PINNED\`" >> "$REPORT"
  echo "- Latest: \`$LATEST\`" >> "$REPORT"
  echo "" >> "$REPORT"
  echo "## Watched file changes" >> "$REPORT"
  for p in $WATCHED_PATHS; do
    if git -C "$CACHE_DIR" diff --quiet "$PINNED" "$LATEST" -- "$p" 2>/dev/null; then
      :
    else
      CHANGED=$((CHANGED + 1))
      echo "### $p" >> "$REPORT"
      echo "" >> "$REPORT"
      echo '```diff' >> "$REPORT"
      git -C "$CACHE_DIR" diff --stat "$PINNED" "$LATEST" -- "$p" >> "$REPORT" || true
      echo '```' >> "$REPORT"
      echo "" >> "$REPORT"
      echo "$p" >> "$DIFF_FILES"
    fi
  done
  if [ "$CHANGED" -eq 0 ]; then
    echo "_No watched files changed between pinned and latest._" >> "$REPORT"
  fi
fi

if [ "$APPLY" -eq 1 ]; then
  echo "==> Running compat test suite"
  pushd "$ROOT" >/dev/null
  if npm run test:compat; then
    TS=$(date -u +%FT%TZ)
    tmp=$(mktemp)
    jq --arg sha "$LATEST" --arg ts "$TS" '.pinnedCommit=$sha | .lastSyncedAt=$ts' "$META" > "$tmp"
    mv "$tmp" "$META"
    echo "    Pinned bumped to $LATEST at $TS"
    echo "" >> "$REPORT"
    echo "## Result" >> "$REPORT"
    echo "✅ Compat tests passed — pinnedCommit updated." >> "$REPORT"
  else
    echo "    Compat tests FAILED — pinnedCommit unchanged."
    echo "" >> "$REPORT"
    echo "## Result" >> "$REPORT"
    echo "❌ Compat tests failed. Inspect \`$REPORT\` and fix before re-running." >> "$REPORT"
    exit 1
  fi
  popd >/dev/null
fi

echo "==> Report written to $REPORT"
